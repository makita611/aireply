import { Env } from './index';

const LOG_TYPES = ['来店', 'LINE', '店外', 'その他'] as const;

function newId(): string {
  return crypto.randomUUID();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── GET /api/customers/:id/logs ──────────────────────
export async function handleListLogs(
  customerId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const owner = await env.DB.prepare(
    'SELECT id FROM customers WHERE id = ? AND cast_id = ?'
  ).bind(customerId, castId).first();
  if (!owner) return json({ error: '見つかりません' }, 404);

  const { results } = await env.DB.prepare(
    `SELECT id, log_date, log_type, memo, drink_ordered, revenue, created_at
     FROM visit_logs
     WHERE customer_id = ? AND cast_id = ?
     ORDER BY log_date DESC, created_at DESC`
  ).bind(customerId, castId).all();

  return json(results);
}

// ── POST /api/customers/:id/logs ─────────────────────
export async function handleCreateLog(
  request: Request,
  customerId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const owner = await env.DB.prepare(
    'SELECT id FROM customers WHERE id = ? AND cast_id = ?'
  ).bind(customerId, castId).first();
  if (!owner) return json({ error: '見つかりません' }, 404);

  const { log_date, log_type, memo, drink_ordered, revenue } = (await request.json()) as {
    log_date?: string;
    log_type?: string;
    memo?: string;
    drink_ordered?: string;
    revenue?: number;
  };

  if (!log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
    return json({ error: 'log_date は YYYY-MM-DD 形式で入力してください' }, 400);
  }

  const type = log_type && (LOG_TYPES as readonly string[]).includes(log_type)
    ? log_type
    : '来店';

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO visit_logs (id, customer_id, cast_id, log_date, log_type, memo, drink_ordered, revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, customerId, castId, log_date, type, memo ?? null, drink_ordered ?? null, revenue ?? null).run();

  // 来店の場合のみ last_visit を更新
  if (type === '来店') {
    await env.DB.prepare(
      `UPDATE customers SET last_visit = ?, updated_at = datetime('now')
       WHERE id = ? AND (last_visit IS NULL OR last_visit < ?)`
    ).bind(log_date, customerId, log_date).run();
  }

  return json({ id }, 201);
}

// ── PUT /api/customers/:id/logs/:logId ───────────────
export async function handleUpdateLog(
  request: Request,
  customerId: string,
  logId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const exists = await env.DB.prepare(
    'SELECT id FROM visit_logs WHERE id = ? AND customer_id = ? AND cast_id = ?'
  ).bind(logId, customerId, castId).first();
  if (!exists) return json({ error: '見つかりません' }, 404);

  const { log_date, log_type, memo, drink_ordered } = (await request.json()) as {
    log_date?: string;
    log_type?: string;
    memo?: string;
    drink_ordered?: string;
  };

  if (log_date && !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
    return json({ error: 'log_date は YYYY-MM-DD 形式で入力してください' }, 400);
  }

  const type = log_type && (LOG_TYPES as readonly string[]).includes(log_type)
    ? log_type : undefined;

  await env.DB.prepare(
    `UPDATE visit_logs
     SET log_date       = COALESCE(?, log_date),
         log_type       = COALESCE(?, log_type),
         memo           = COALESCE(?, memo),
         drink_ordered  = COALESCE(?, drink_ordered)
     WHERE id = ?`
  ).bind(log_date ?? null, type ?? null, memo ?? null, drink_ordered ?? null, logId).run();

  return json({ ok: true });
}

// ── DELETE /api/customers/:id/logs/:logId ────────────
export async function handleDeleteLog(
  customerId: string,
  logId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const exists = await env.DB.prepare(
    'SELECT id FROM visit_logs WHERE id = ? AND customer_id = ? AND cast_id = ?'
  ).bind(logId, customerId, castId).first();
  if (!exists) return json({ error: '見つかりません' }, 404);

  await env.DB.prepare('DELETE FROM visit_logs WHERE id = ?').bind(logId).run();
  return json({ ok: true });
}
