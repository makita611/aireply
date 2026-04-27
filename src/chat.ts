import { Env } from './index';

function newId(): string {
  return crypto.randomUUID();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── ダッシュボード用コンテキスト取得 ─────────────────
export async function handleDashboardContext(
  castId: string,
  env: Env
): Promise<Response> {
  // 要連絡顧客：温度感60以上 × 最終来店14日以上
  const { results: alertCustomers } = await env.DB.prepare(
    `SELECT name, temperature, last_visit
     FROM customers
     WHERE cast_id = ? AND archived = 0 AND temperature >= 60
       AND (last_visit IS NULL OR julianday('now') - julianday(last_visit) > 14)
     ORDER BY temperature DESC, last_visit ASC
     LIMIT 3`
  ).bind(castId).all();

  return json({ alert_customers: alertCustomers });
}

// ── POST /api/ai/chat （ストリーミングチャット） ────────
export async function handleChat(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const { message, conversation_id } = (await request.json()) as {
    message?: string;
    conversation_id?: string;
  };

  if (!message?.trim()) {
    return json({ error: 'message は必須です' }, 400);
  }

  // キャスト情報を取得
  const cast = await env.DB.prepare(
    'SELECT stage_name, age, shop_name, cast_hobbies, character_prompt FROM casts WHERE id = ?'
  ).bind(castId).first<{
    stage_name: string; age: number; shop_name: string;
    cast_hobbies: string; character_prompt: string;
  }>();

  // 長期記憶を取得（重要度順・最大15件）
  const { results: memories } = await env.DB.prepare(
    `SELECT content, memory_type FROM cast_memories
     WHERE cast_id = ? ORDER BY importance DESC, created_at DESC LIMIT 15`
  ).bind(castId).all<{ content: string; memory_type: string }>();

  // 要連絡顧客を取得
  const { results: alertCustomers } = await env.DB.prepare(
    `SELECT name, temperature, last_visit FROM customers
     WHERE cast_id = ? AND archived = 0 AND temperature >= 60
       AND (last_visit IS NULL OR julianday('now') - julianday(last_visit) > 14)
     ORDER BY temperature DESC LIMIT 3`
  ).bind(castId).all<{ name: string; temperature: number; last_visit: string }>();

  // コンテキスト文字列の生成
  const castInfo = [
    cast?.stage_name ? `源氏名: ${cast.stage_name}` : '',
    cast?.age ? `年齢: ${cast.age}歳` : '',
    cast?.shop_name ? `お店: ${cast.shop_name}` : '',
    cast?.cast_hobbies ? `趣味: ${cast.cast_hobbies}` : '',
    cast?.character_prompt ? `キャラ: ${cast.character_prompt}` : '',
  ].filter(Boolean).join('、') || '（未設定）';

  const memoryText = memories.length
    ? memories.map((m) => `・${m.content}`).join('\n')
    : 'まだ記録なし';

  const alertText = alertCustomers.length
    ? alertCustomers.map((c) => {
        const days = c.last_visit
          ? Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000)
          : null;
        return `・${c.name}（温度感${c.temperature}、${days ? `${days}日未連絡` : '来店記録なし'}）`;
      }).join('\n')
    : 'なし';

  // チャットログを保存（ユーザー側）
  await env.DB.prepare(
    'INSERT INTO chat_logs (id, cast_id, role, content) VALUES (?, ?, ?, ?)'
  ).bind(newId(), castId, 'user', message).run();

  // Dify Chatflow へストリーミングリクエスト
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let difyRes: globalThis.Response;
  try {
    difyRes = await fetch(`${env.DIFY_BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DIFY_CHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { cast_info: castInfo, long_term_memory: memoryText, alert_customers: alertText },
        query: message,
        ...(conversation_id ? { conversation_id } : {}),
        response_mode: 'streaming',
        user: castId,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!difyRes.ok) {
    const errBody = await difyRes.text().catch(() => '');
    return json({ error: `Difyエラー: ${difyRes.status} ${errBody}` }, 502);
  }

  // SSEストリームをそのままプロキシ
  const corsH: Record<string, string> = {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  return new Response(difyRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      ...corsH,
    },
  });
}

// ── 長期記憶の追加 ────────────────────────────────────
export async function handleAddMemory(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const { content, memory_type, importance } = (await request.json()) as {
    content?: string;
    memory_type?: string;
    importance?: number;
  };
  if (!content?.trim()) return json({ error: 'content は必須です' }, 400);

  await env.DB.prepare(
    'INSERT INTO cast_memories (id, cast_id, content, memory_type, importance) VALUES (?, ?, ?, ?, ?)'
  ).bind(newId(), castId, content.trim(), memory_type || 'general', importance ?? 50).run();

  return json({ ok: true }, 201);
}

// ── 長期記憶の一覧 ────────────────────────────────────
export async function handleGetMemories(
  castId: string,
  env: Env
): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM cast_memories WHERE cast_id = ? ORDER BY importance DESC, created_at DESC'
  ).bind(castId).all();
  return json(results);
}

// ── 長期記憶の削除 ────────────────────────────────────
export async function handleDeleteMemory(
  memoryId: string,
  castId: string,
  env: Env
): Promise<Response> {
  await env.DB.prepare(
    'DELETE FROM cast_memories WHERE id = ? AND cast_id = ?'
  ).bind(memoryId, castId).run();
  return json({ ok: true });
}
