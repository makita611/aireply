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

// ── GET /api/customers ───────────────────────────────
export async function handleListCustomers(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  const query = q
    ? `SELECT id, name, nickname, bg_color, temperature, last_visit
       FROM customers
       WHERE cast_id = ? AND name LIKE ?
       ORDER BY last_visit DESC`
    : `SELECT id, name, nickname, bg_color, temperature, last_visit
       FROM customers
       WHERE cast_id = ?
       ORDER BY last_visit DESC`;

  const stmt = q
    ? env.DB.prepare(query).bind(castId, `%${q}%`)
    : env.DB.prepare(query).bind(castId);

  const { results } = await stmt.all();
  return json(results);
}

// ── POST /api/customers ──────────────────────────────
export async function handleCreateCustomer(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as Partial<CustomerInput>;

  if (!body.name) {
    return json({ error: '名前は必須です' }, 400);
  }

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO customers
       (id, cast_id, name, nickname, line_id, appearance, occupation,
        hobbies, drink_preference, birthday, ng_topics, bg_color,
        temperature, notes, last_visit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, castId,
      body.name,
      body.nickname ?? null,
      body.line_id ?? null,
      body.appearance ?? null,
      body.occupation ?? null,
      body.hobbies ?? null,
      body.drink_preference ?? null,
      body.birthday ?? null,
      body.ng_topics ?? null,
      body.bg_color ?? '#1a1a2e',
      body.temperature ?? 50,
      body.notes ?? null,
      body.last_visit ?? null
    )
    .run();

  return json({ id }, 201);
}

// ── GET /api/customers/:id ───────────────────────────
export async function handleGetCustomer(
  customerId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const customer = await env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND cast_id = ?'
  )
    .bind(customerId, castId)
    .first();

  if (!customer) return json({ error: '見つかりません' }, 404);
  return json(customer);
}

// ── PUT /api/customers/:id ───────────────────────────
export async function handleUpdateCustomer(
  request: Request,
  customerId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as Partial<CustomerInput>;

  // 存在確認
  const exists = await env.DB.prepare(
    'SELECT id FROM customers WHERE id = ? AND cast_id = ?'
  )
    .bind(customerId, castId)
    .first();
  if (!exists) return json({ error: '見つかりません' }, 404);

  await env.DB.prepare(
    `UPDATE customers
     SET name = COALESCE(?, name),
         nickname = COALESCE(?, nickname),
         line_id = COALESCE(?, line_id),
         appearance = COALESCE(?, appearance),
         occupation = COALESCE(?, occupation),
         hobbies = COALESCE(?, hobbies),
         drink_preference = COALESCE(?, drink_preference),
         birthday = COALESCE(?, birthday),
         ng_topics = COALESCE(?, ng_topics),
         bg_color = COALESCE(?, bg_color),
         temperature = COALESCE(?, temperature),
         notes = COALESCE(?, notes),
         last_visit = COALESCE(?, last_visit),
         updated_at = datetime('now')
     WHERE id = ? AND cast_id = ?`
  )
    .bind(
      body.name ?? null,
      body.nickname ?? null,
      body.line_id ?? null,
      body.appearance ?? null,
      body.occupation ?? null,
      body.hobbies ?? null,
      body.drink_preference ?? null,
      body.birthday ?? null,
      body.ng_topics ?? null,
      body.bg_color ?? null,
      body.temperature ?? null,
      body.notes ?? null,
      body.last_visit ?? null,
      customerId,
      castId
    )
    .run();

  return json({ ok: true });
}

// ── DELETE /api/customers/:id ────────────────────────
export async function handleDeleteCustomer(
  customerId: string,
  castId: string,
  env: Env
): Promise<Response> {
  const exists = await env.DB.prepare(
    'SELECT id FROM customers WHERE id = ? AND cast_id = ?'
  )
    .bind(customerId, castId)
    .first();
  if (!exists) return json({ error: '見つかりません' }, 404);

  await env.DB.prepare(
    'DELETE FROM customers WHERE id = ? AND cast_id = ?'
  )
    .bind(customerId, castId)
    .run();

  return json({ ok: true });
}

// ── 型定義 ───────────────────────────────────────────
interface CustomerInput {
  name: string;
  nickname: string;
  line_id: string;
  appearance: string;
  occupation: string;
  hobbies: string;
  drink_preference: string;
  birthday: string;
  ng_topics: string;
  bg_color: string;
  temperature: number;
  notes: string;
  last_visit: string;
}
