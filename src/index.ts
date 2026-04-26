import {
  handleRegister,
  handleLogin,
  handleGetSettings,
  handleUpdateSettings,
  verifyJwt,
} from './auth';
import {
  handleListCustomers,
  handleCreateCustomer,
  handleGetCustomer,
  handleUpdateCustomer,
  handleDeleteCustomer,
} from './customers';
import { handleListLogs, handleCreateLog, handleUpdateLog, handleDeleteLog } from './logs';
import { handleGenerate, handleAnalyze, handleSelectReply, handleGetAiLogs } from './ai';

// ── 環境変数の型定義 ──────────────────────────────────
export interface Env {
  DB: D1Database;
  CASTLINE_KV: KVNamespace;
  JWT_SECRET: string;
  DIFY_API_KEY: string;
  DIFY_ANALYZE_API_KEY: string;
  DIFY_BASE_URL: string;
  ENVIRONMENT: string;
}

// ── CORS許可オリジン ──────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://aireply-eqc.pages.dev',
  'http://localhost:8788',
  'http://localhost:5500',
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // デプロイごとのハッシュ付きURLも許可（例: a7b805d4.aireply-eqc.pages.dev）
  if (origin.endsWith('.aireply-eqc.pages.dev')) return true;
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

// 既存レスポンスにCORSヘッダーを付与する
function addCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, headers });
}

// ── メインハンドラ ────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    // プリフライトリクエスト
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ── 認証不要エンドポイント ────────────────────────
      if (path === '/api/auth/register' && method === 'POST') {
        return addCors(await handleRegister(request, env), origin);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        return addCors(await handleLogin(request, env), origin);
      }

      // ── JWT認証が必要なエンドポイント ─────────────────
      const castId = await verifyJwt(request, env);
      if (!castId) {
        return json({ error: '認証が必要です' }, 401, origin);
      }

      // キャスト設定
      if (path === '/api/cast/settings') {
        if (method === 'GET') return addCors(await handleGetSettings(castId, env), origin);
        if (method === 'PUT') return addCors(await handleUpdateSettings(request, castId, env), origin);
      }

      // 顧客一覧 / 新規作成
      if (path === '/api/customers') {
        if (method === 'GET') return addCors(await handleListCustomers(request, castId, env), origin);
        if (method === 'POST') return addCors(await handleCreateCustomer(request, castId, env), origin);
      }

      // 顧客詳細 / 更新 / 削除
      const customerMatch = path.match(/^\/api\/customers\/([^/]+)$/);
      if (customerMatch) {
        const customerId = customerMatch[1];
        if (method === 'GET') return addCors(await handleGetCustomer(customerId, castId, env), origin);
        if (method === 'PUT') return addCors(await handleUpdateCustomer(request, customerId, castId, env), origin);
        if (method === 'DELETE') return addCors(await handleDeleteCustomer(customerId, castId, env), origin);
      }

      // 対応履歴 一覧 / 追加
      const logsMatch = path.match(/^\/api\/customers\/([^/]+)\/logs$/);
      if (logsMatch) {
        const customerId = logsMatch[1];
        if (method === 'GET') return addCors(await handleListLogs(customerId, castId, env), origin);
        if (method === 'POST') return addCors(await handleCreateLog(request, customerId, castId, env), origin);
      }

      // 対応履歴 個別 更新 / 削除
      const logItemMatch = path.match(/^\/api\/customers\/([^/]+)\/logs\/([^/]+)$/);
      if (logItemMatch) {
        const [, customerId, logId] = logItemMatch;
        if (method === 'PUT') return addCors(await handleUpdateLog(request, customerId, logId, castId, env), origin);
        if (method === 'DELETE') return addCors(await handleDeleteLog(customerId, logId, castId, env), origin);
      }

      // AI返信生成
      if (path === '/api/ai/generate' && method === 'POST') {
        return addCors(await handleGenerate(request, castId, env), origin);
      }
      // AIカルテ分析（なげっぱなし→自動振り分け）
      if (path === '/api/ai/analyze' && method === 'POST') {
        return addCors(await handleAnalyze(request, castId, env), origin);
      }
      // 採用返信を記録
      const aiLogMatch = path.match(/^\/api\/ai\/logs\/([^/]+)$/);
      if (aiLogMatch && method === 'PUT') {
        return addCors(await handleSelectReply(request, aiLogMatch[1], castId, env), origin);
      }
      // 採用返信履歴
      const aiLogsMatch = path.match(/^\/api\/customers\/([^/]+)\/ai-logs$/);
      if (aiLogsMatch && method === 'GET') {
        return addCors(await handleGetAiLogs(aiLogsMatch[1], castId, env), origin);
      }

      return json({ error: 'Not Found' }, 404, origin);
    } catch (err) {
      console.error(err);
      return json({ error: 'サーバーエラーが発生しました' }, 500, origin);
    }
  },
};
