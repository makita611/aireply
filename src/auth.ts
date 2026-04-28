import { SignJWT, jwtVerify } from 'jose';
import { Env } from './index';

const JWT_EXPIRY = '7d';

function newId(): string {
  return crypto.randomUUID();
}

// ── パスワードハッシュ（Web Crypto API / PBKDF2）────────
// bcryptjs はWorkers非対応のため Web Crypto API を使用
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256
  );
  const toHex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${toHex(salt.buffer)}:${toHex(bits)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256
  );
  const newHash = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex === newHash;
}

function jwtSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

// ── JWT発行 ──────────────────────────────────────────
export async function signJwt(castId: string, env: Env): Promise<string> {
  return new SignJWT({ sub: castId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRY)
    .setIssuedAt()
    .sign(jwtSecret(env));
}

// ── JWT検証ミドルウェア ────────────────────────────────
export async function verifyJwt(
  request: Request,
  env: Env
): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret(env));
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

// ── POST /api/auth/register ───────────────────────────
export async function handleRegister(
  request: Request,
  env: Env
): Promise<Response> {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return json({ error: 'メールアドレスとパスワードは必須です' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'パスワードは8文字以上にしてください' }, 400);
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM casts WHERE email = ?'
  )
    .bind(email)
    .first();
  if (existing) {
    return json({ error: 'このメールアドレスはすでに登録されています' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const id = newId();

  await env.DB.prepare(
    'INSERT INTO casts (id, email, password_hash) VALUES (?, ?, ?)'
  )
    .bind(id, email, passwordHash)
    .run();

  const token = await signJwt(id, env);
  return json({ token, castId: id }, 201);
}

// ── POST /api/auth/login ──────────────────────────────
export async function handleLogin(
  request: Request,
  env: Env
): Promise<Response> {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return json({ error: 'メールアドレスとパスワードは必須です' }, 400);
  }

  const cast = await env.DB.prepare(
    'SELECT id, password_hash FROM casts WHERE email = ?'
  )
    .bind(email)
    .first<{ id: string; password_hash: string }>();

  if (!cast || !(await verifyPassword(password, cast.password_hash))) {
    return json({ error: 'メールアドレスまたはパスワードが違います' }, 401);
  }

  const token = await signJwt(cast.id, env);
  return json({ token, castId: cast.id });
}

// ── GET /api/cast/settings ───────────────────────────
export async function handleGetSettings(
  castId: string,
  env: Env
): Promise<Response> {
  const cast = await env.DB.prepare(
    'SELECT email, stage_name, character_prompt, sample_lines, shop_name, age, cast_hobbies, chat_avatar FROM casts WHERE id = ?'
  )
    .bind(castId)
    .first();

  if (!cast) return json({ error: '見つかりません' }, 404);
  return json(cast);
}

// ── PUT /api/cast/settings ───────────────────────────
export async function handleUpdateSettings(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const { stage_name, character_prompt, sample_lines, shop_name, age, cast_hobbies, chat_avatar } =
    (await request.json()) as {
      stage_name?: string;
      character_prompt?: string;
      sample_lines?: string[];
      shop_name?: string;
      age?: number;
      cast_hobbies?: string;
      chat_avatar?: string;
    };

  await env.DB.prepare(
    `UPDATE casts
     SET stage_name = ?, character_prompt = ?, sample_lines = ?,
         shop_name = ?, age = ?, cast_hobbies = ?, chat_avatar = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      stage_name ?? null,
      character_prompt ?? null,
      sample_lines ? JSON.stringify(sample_lines) : null,
      shop_name ?? null,
      age ?? null,
      cast_hobbies ?? null,
      chat_avatar ?? null,
      castId
    )
    .run();

  return json({ ok: true });
}

// ── PUT /api/auth/email ───────────────────────────────
export async function handleChangeEmail(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return json({ error: 'メールアドレスとパスワードは必須です' }, 400);
  }

  const cast = await env.DB.prepare(
    'SELECT password_hash FROM casts WHERE id = ?'
  ).bind(castId).first<{ password_hash: string }>();

  if (!cast || !(await verifyPassword(password, cast.password_hash))) {
    return json({ error: '現在のパスワードが違います' }, 401);
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM casts WHERE email = ? AND id != ?'
  ).bind(email, castId).first();
  if (existing) {
    return json({ error: 'このメールアドレスはすでに使用されています' }, 409);
  }

  await env.DB.prepare(
    "UPDATE casts SET email = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(email, castId).run();

  return json({ ok: true });
}

// ── PUT /api/auth/password ────────────────────────────
export async function handleChangePassword(
  request: Request,
  castId: string,
  env: Env
): Promise<Response> {
  const { current_password, new_password } = (await request.json()) as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || !new_password) {
    return json({ error: '現在・新しいパスワードは必須です' }, 400);
  }
  if (new_password.length < 8) {
    return json({ error: 'パスワードは8文字以上にしてください' }, 400);
  }

  const cast = await env.DB.prepare(
    'SELECT password_hash FROM casts WHERE id = ?'
  ).bind(castId).first<{ password_hash: string }>();

  if (!cast || !(await verifyPassword(current_password, cast.password_hash))) {
    return json({ error: '現在のパスワードが違います' }, 401);
  }

  const newHash = await hashPassword(new_password);
  await env.DB.prepare(
    "UPDATE casts SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, castId).run();

  return json({ ok: true });
}

// ── ヘルパー ─────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
