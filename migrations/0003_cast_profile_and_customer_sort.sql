-- キャスト設定の拡充（お店名・年齢・趣味）
ALTER TABLE casts ADD COLUMN shop_name TEXT;
ALTER TABLE casts ADD COLUMN age INTEGER;
ALTER TABLE casts ADD COLUMN cast_hobbies TEXT;

-- 顧客の並び替え・アーカイブ用
ALTER TABLE customers ADD COLUMN priority INTEGER DEFAULT 50;
ALTER TABLE customers ADD COLUMN archived INTEGER DEFAULT 0;
