-- キャスト（ユーザー）
CREATE TABLE casts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  stage_name TEXT,
  character_prompt TEXT,
  sample_lines TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 顧客
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL REFERENCES casts(id),
  name TEXT NOT NULL,
  nickname TEXT,
  line_id TEXT,
  appearance TEXT,
  occupation TEXT,
  hobbies TEXT,
  drink_preference TEXT,
  birthday TEXT,
  ng_topics TEXT,
  bg_color TEXT DEFAULT '#1a1a2e',
  temperature INTEGER DEFAULT 50,
  notes TEXT,
  last_visit TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 対応履歴（旧: 接客メモ）
CREATE TABLE visit_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  cast_id TEXT NOT NULL REFERENCES casts(id),
  log_date TEXT NOT NULL,
  log_type TEXT DEFAULT '来店',
  memo TEXT,
  drink_ordered TEXT,
  revenue INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- AI生成ログ
CREATE TABLE ai_logs (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  tone TEXT,
  prompt_summary TEXT,
  generated_texts TEXT,
  selected_index INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
