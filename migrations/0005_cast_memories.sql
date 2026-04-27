-- AI秘書の長期記憶
CREATE TABLE cast_memories (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_type TEXT DEFAULT 'general', -- mood / preference / customer_insight / event / general
  importance INTEGER DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now'))
);

-- チャット会話ログ
CREATE TABLE chat_logs (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL,
  role TEXT NOT NULL,        -- 'user' / 'assistant'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
