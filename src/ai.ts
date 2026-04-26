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

// ── POST /api/ai/generate ────────────────────────────
export async function handleGenerate(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const { customer_id, tone, additional_context } = (await request.json()) as {
    customer_id?: string;
    tone?: 'Sweet' | 'Cool' | 'Business' | 'Care';
    additional_context?: string;
  };

  if (!customer_id || !tone) {
    return json({ error: 'customer_id と tone は必須です' }, 400);
  }
  if (!['Sweet', 'Cool', 'Business', 'Care'].includes(tone)) {
    return json({ error: 'tone は Sweet/Cool/Business/Care のいずれかを指定してください' }, 400);
  }

  // 顧客カルテ取得
  const customer = await env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND cast_id = ?'
  )
    .bind(customer_id, castId)
    .first<Record<string, unknown>>();
  if (!customer) return json({ error: '顧客が見つかりません' }, 404);

  // 直近3件の対応履歴取得
  const { results: logs } = await env.DB.prepare(
    `SELECT log_date, log_type, memo, drink_ordered
     FROM visit_logs
     WHERE customer_id = ? AND cast_id = ?
     ORDER BY log_date DESC
     LIMIT 3`
  )
    .bind(customer_id, castId)
    .all();

  // キャスト設定取得
  const cast = await env.DB.prepare(
    'SELECT stage_name, character_prompt, sample_lines FROM casts WHERE id = ?'
  )
    .bind(castId)
    .first<{ stage_name: string; character_prompt: string; sample_lines: string }>();

  // Dify APIリクエスト
  let suggestions: string[];
  try {
    suggestions = await callDify(
      {
        cast_character: cast?.character_prompt ?? '',
        customer_profile: JSON.stringify(customer),
        recent_logs: JSON.stringify(logs),
        tone,
        additional_context: additional_context ?? '',
      },
      castId,
      env
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI生成に失敗しました';
    return json({ error: message }, 502);
  }

  // 生成ログ保存
  await env.DB.prepare(
    `INSERT INTO ai_logs (id, cast_id, customer_id, tone, prompt_summary, generated_texts)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newId(),
      castId,
      customer_id,
      tone,
      additional_context ?? null,
      JSON.stringify(suggestions)
    )
    .run();

  return json({ suggestions });
}

// ── Dify Workflow API呼び出し ─────────────────────────
// Chatflow（/chat-messages）ではなくWorkflow（/workflows/run）を使う
// Workflowはユーザーメッセージ不要で変数をそのまま渡せる
async function callDify(
  inputs: Record<string, string>,
  userId: string,
  env: Env
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res: globalThis.Response;
  try {
    res = await fetch(`${env.DIFY_BASE_URL}/workflows/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs,
        response_mode: 'blocking',
        user: userId,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Dify APIエラー: ${res.status} ${errBody}`);
  }

  // Workflowのレスポンス形式: { data: { outputs: { text: "..." } } }
  const data = (await res.json()) as {
    data?: { outputs?: Record<string, unknown>; error?: string };
  };

  if (data.data?.error) throw new Error(`Difyワークフローエラー: ${data.data.error}`);

  // outputsから文字列を取り出す（変数名はDify側の設定に依存）
  const outputs = data.data?.outputs ?? {};
  const rawText =
    (outputs['text'] as string) ||
    (outputs['result'] as string) ||
    (outputs['output'] as string) ||
    Object.values(outputs).find((v) => typeof v === 'string') as string | undefined;

  if (!rawText) throw new Error('Difyから返信案が取得できませんでした');

  // JSON配列として解析を試みる
  const parsed = tryParseJsonArray(rawText);
  if (parsed && parsed.length >= 1) return parsed.slice(0, 3);

  // JSONでない場合は区切り文字で分割（===, ---, 1. 2. 3. など）
  const byDelimiter = rawText.split(/\n?={3,}\n?|\n?-{3,}\n?/).map((s) => s.trim()).filter(Boolean);
  if (byDelimiter.length >= 2) return byDelimiter.slice(0, 3);

  const byNumber = rawText.split(/\n?\d+[\.\)]\s+/).map((s) => s.trim()).filter(Boolean);
  if (byNumber.length >= 2) return byNumber.slice(0, 3);

  // 分割できなければ1案として返す
  return [rawText.trim()];
}

function tryParseJsonArray(text: string): string[] | null {
  // JSON配列が文章中に埋め込まれていても取り出す
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[];
    }
    return null;
  } catch {
    return null;
  }
}
