// 開発時は localhost:8787、本番はdeployしたWorkerのURL
const BASE_URL =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://aireply.aidbase11.workers.dev';

/**
 * JWTをヘッダーに自動付与するfetchラッパー
 * @param {string} endpoint  例: '/api/customers'
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
export async function api(endpoint, options = {}) {
  const token = localStorage.getItem('castline_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // 認証切れ → ログアウト
  if (res.status === 401) {
    localStorage.removeItem('castline_token');
    localStorage.removeItem('castline_cast_id');
    location.href = '/login';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'エラーが発生しました' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  // 204 No Contentなど body がない場合
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** ログイン済みか確認して未ログインならログイン画面へ */
export function requireAuth() {
  const token = localStorage.getItem('castline_token');
  if (!token) {
    location.href = '/login';
    return false;
  }
  return true;
}

/** 保存済みのcastIdを取得 */
export function getCastId() {
  return localStorage.getItem('castline_cast_id');
}
