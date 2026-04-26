# CLAUDE.md - cast line（キャストLINE）

## ■ プロジェクト概要
- **サービス名:** cast line（キャストLINE）
- **コンセプト:** 100人の関係を落とさず回す、夜職キャスト専用の個人営業OS
- **ターゲット:** キャバ嬢・ホスト・ラウンジ嬢など、LINE営業に1日1時間以上費やす売れっ子キャスト
- **ポジショニング:** 「AI返信ツール」ではなく「関係記憶の営業OS」。競合（Pappimane, Melty, クッキー, ルミナスダイアリー）が"メモ帳"止まりの中、AIが関係記憶を活かして次の一手を提案する
- **MVP目標:** スマホブラウザで動くテスト版。顧客カルテ → AI返信生成 → コピー＆LINE遷移 の最小ループを回す

## ■ 技術スタック
- **フロントエンド:** HTML / CSS / JavaScript（Vanilla）、スマホファースト（PWA化は将来）
- **ホスティング:** Cloudflare Pages（無料枠、GitHub連携で自動デプロイ）
- **バックエンド:** Cloudflare Workers（API + 認証ロジック）
- **データベース:** Cloudflare D1（SQLite）— 顧客データ、キャスト設定、会話ログ
- **セッション/KV:** Cloudflare KV — JWTトークン管理、一時キャッシュ
- **AI:** Dify API（VPS: シンVPS 4GB RAM、既存Docker環境）
  - LLM: Claude Haiku 4.5 or GPT-4o mini（コスト重視）
  - 用途: トーン別返信生成、会話要約、カルテ自動更新
- **ドメイン:** 新規取得予定（例: castline.app / castline.jp）
- **VPS:** 既存シンVPS（Dify専用、cast lineのDBやフロントは載せない）

## ■ なぜこのスタック？
- VPSにDifyが既に載っている → サービス本体まで載せると負荷・運用リスク
- Cloudflare Pages + Workers + D1 は無料枠で商用利用可能、帯域無制限
- フロントはHTML/JS → Cloudflare Pagesにそのまま乗る
- D1（SQLite）→ 小〜中規模なら十分、SQL直書きで高速開発
- Workers → API認証・DB操作・Dify呼び出しのプロキシ
- まきたさんはCloudflare Pages経験済み → 学習コスト最小

## ■ MVP機能（Phase 1）
### 画面構成（4画面）
1. **ログイン/新規登録** — メール + パスワード（JWTトークン発行）
2. **顧客一覧（ダッシュボード）** — カード形式、検索、来店日順ソート、温度感バッジ
3. **顧客詳細（営業コクピット）** — 上部: カルテ（見た目メモ+関係サマリー）、中央: AI返信生成、下部: コピー＆LINE遷移
4. **キャスト設定** — 源氏名、口癖、キャラ設定テキスト、過去の神対応LINEサンプル

### 機能一覧（MVP）
- [ ] メール認証ログイン（JWT）
- [ ] 顧客CRUD（名前、ニックネーム、見た目メモ、職業、趣味、酒の好み、誕生日、NG話題、背景色）
- [ ] 顧客ごとの接客メモ（来店日+メモテキスト、時系列表示）
- [ ] AI返信生成（トーン4種: Sweet / Cool / Business / Care）
  - Dify APIにキャスト設定 + 顧客カルテ + 直近メモ + トーン指定を送信
  - 3案生成 → 選択 → クリップボードコピー
- [ ] LINE遷移ボタン（`https://line.me/R/ti/p/{LINE_ID}` で特定顧客のチャットを開く）
- [ ] 誤爆防止UI（顧客ごとの背景色 + 大きな名前表示）

### Phase 2（MVP後）
- LINE ID不要のコピペ運用最適化（LINE検索ジャンプ）
- 会話ログのコピペ保存 → AIが自動でカルテ更新
- 誕生日・来店間隔リマインダー
- 顧客温度感の自動スコアリング
- PWA化（ホーム画面追加、オフラインキャッシュ）

### Phase 3（将来）
- LINE Messaging API連携（自動ログ同期）
- 一括個別送信（100人に個別文面を一斉送信）
- 売上・来店分析ダッシュボード
- キャスト間の匿名Tips共有（任意参加）

## ■ DB設計（D1 / SQLite）

```sql
-- キャスト（ユーザー）
CREATE TABLE casts (
  id TEXT PRIMARY KEY,          -- UUID
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  stage_name TEXT,               -- 源氏名
  character_prompt TEXT,         -- 口癖・キャラ設定
  sample_lines TEXT,             -- 過去の神対応LINEサンプル（JSON配列）
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 顧客
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL REFERENCES casts(id),
  name TEXT NOT NULL,
  nickname TEXT,                  -- 呼び名
  line_id TEXT,                   -- LINE ID（任意）
  appearance TEXT,                -- 見た目メモ（身長、髪型、メガネ等）
  occupation TEXT,
  hobbies TEXT,
  drink_preference TEXT,          -- 酒の好み
  birthday TEXT,
  ng_topics TEXT,                 -- 地雷ワード
  bg_color TEXT DEFAULT '#1a1a2e', -- 誤爆防止の背景色
  temperature INTEGER DEFAULT 50, -- 温度感 0-100
  notes TEXT,                     -- 自由メモ
  last_visit TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 接客メモ（来店ログ）
CREATE TABLE visit_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  cast_id TEXT NOT NULL REFERENCES casts(id),
  visit_date TEXT NOT NULL,
  memo TEXT,
  drink_ordered TEXT,
  revenue INTEGER,                -- 売上（任意）
  created_at TEXT DEFAULT (datetime('now'))
);

-- AI生成ログ（使用量トラッキング + 学習改善用）
CREATE TABLE ai_logs (
  id TEXT PRIMARY KEY,
  cast_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  tone TEXT,                      -- Sweet/Cool/Business/Care
  prompt_summary TEXT,
  generated_texts TEXT,           -- JSON配列（3案）
  selected_index INTEGER,         -- どれを選んだか
  created_at TEXT DEFAULT (datetime('now'))
);
```

## ■ API設計（Workers）

```
POST   /api/auth/register    — 新規登録
POST   /api/auth/login       — ログイン → JWT返却
GET    /api/customers         — 顧客一覧
POST   /api/customers         — 顧客追加
GET    /api/customers/:id     — 顧客詳細
PUT    /api/customers/:id     — 顧客更新
DELETE /api/customers/:id     — 顧客削除
GET    /api/customers/:id/logs — 接客メモ一覧
POST   /api/customers/:id/logs — 接客メモ追加
POST   /api/ai/generate       — AI返信生成（tone, customer_id, additional_context）
GET    /api/cast/settings      — キャスト設定取得
PUT    /api/cast/settings      — キャスト設定更新
```

## ■ Dify連携仕様
- **エンドポイント:** `http://{VPS_IP}:3000/v1/chat-messages`（Dify Cloud移行後はURL変更）
- **認証:** Dify API Key（環境変数 `DIFY_API_KEY`）
- **入力変数:**
  - `cast_character`: キャストのキャラ設定テキスト
  - `customer_profile`: 顧客カルテJSON
  - `recent_logs`: 直近3件の接客メモ
  - `tone`: Sweet / Cool / Business / Care
  - `additional_context`: キャストの追記コメント（例: 「昨日の同伴のお礼」）
- **出力:** 3つの返信案（JSON配列）
- **タイムアウト:** 15秒（Workers制限考慮）

## ■ ディレクトリ構成

```
castline/
├── CLAUDE.md                    ← このファイル
├── wrangler.toml                ← Cloudflare Workers設定
├── package.json
├── src/
│   ├── index.ts                 ← Workers エントリポイント（API router）
│   ├── auth.ts                  ← 認証（register, login, JWT検証）
│   ├── customers.ts             ← 顧客CRUD
│   ├── logs.ts                  ← 接客メモCRUD
│   ├── ai.ts                    ← Dify API呼び出し
│   └── db/
│       └── schema.sql           ← D1スキーマ
├── frontend/
│   ├── index.html               ← ログイン/登録
│   ├── dashboard.html           ← 顧客一覧
│   ├── customer.html            ← 顧客詳細（営業コクピット）
│   ├── settings.html            ← キャスト設定
│   ├── css/
│   │   └── style.css            ← 共通スタイル（スマホファースト）
│   └── js/
│       ├── api.js               ← API通信ヘルパー
│       ├── auth.js              ← ログイン/登録ロジック
│       ├── dashboard.js         ← 一覧操作
│       ├── customer.js          ← 詳細・AI生成操作
│       └── settings.js          ← 設定操作
└── migrations/
    └── 0001_initial.sql         ← D1マイグレーション
```

## ■ デザイン方針
- **テーマ:** ダーク基調（夜の世界観）、アクセント: ゴールド #d4af37 / ローズ #e91e63
- **フォント:** Noto Sans JP（本文）、Playfair Display（見出し・ブランド）
- **スマホファースト:** 375px幅基準、タップしやすいUI（44px以上のタッチターゲット）
- **誤爆防止:** 顧客ごとに背景色を設定可能、名前を常に大きく表示
- **アニメーション:** 控えめ（仕事の合間に使うツール、速度重視）

## ■ 出力ルール（Claude Code向け）
- コードは **変更箇所のdiff or 置換ブロック** で出力（全文書き換え禁止）
- 日本語でコメント
- ファイルパスは必ず明示
- 1つの指示で1つの変更に絞る
- TypeScript使用（Workers側）
- フロントはVanilla JS（フレームワーク不要、軽量重視）

## ■ 禁止事項
- .env ファイルの読み書き（Cloudflare環境変数を使う）
- git push（必ず人間が確認してから）
- 本番DBへの直接書き込み
- APIキー・パスワードのハードコーディング
- 顧客の顔写真をサーバーに保存する機能（プライバシーリスク）
- AI学習への顧客データ利用を示唆する文言

## ■ 環境変数（wrangler.toml / Cloudflare Dashboard）
```
DIFY_API_KEY = "app-xxxxx"
DIFY_BASE_URL = "http://{VPS_IP}:3000/v1"
JWT_SECRET = "xxxxx"
```

## ■ セキュリティ方針
- パスワードは bcrypt ハッシュ化（Workers対応ライブラリ使用）
- JWT有効期限: 7日間
- CORS: 自ドメインのみ許可
- 顧客データは cast_id でスコープ（他人のデータ見えない）
- Dify API呼び出しは Workers 経由（APIキーをフロントに露出しない）
- 利用規約に「AIが顧客データを学習に使用しない」旨を明記

## ■ 価格設計（初期）
- **フリー:** 顧客5人まで、AI生成 月30回
- **スタンダード（1,980円/月）:** 顧客50人、AI生成 月300回
- **プロ（4,980円/月）:** 顧客無制限、AI生成 無制限、将来の一括送信
- ※ 売れっ子で月数百万稼ぐ層には「売上が上がったら値上げ」の余地あり

## ■ 学習メモ（ミスから追記する欄）
- [日付] [何が起きて何を学んだか]
