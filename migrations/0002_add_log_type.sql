-- visit_date を log_date にリネーム
ALTER TABLE visit_logs RENAME COLUMN visit_date TO log_date;

-- 対応種別カラムを追加（来店/LINE/店外/その他）
ALTER TABLE visit_logs ADD COLUMN log_type TEXT DEFAULT '来店';
