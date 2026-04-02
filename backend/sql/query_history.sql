-- 个人中心 - 历史查询记录（与分析结果快照）
-- 字符集 utf8mb4；列表展示用 news_title / news_summary，禁止用 URL 当标题

CREATE TABLE IF NOT EXISTS query_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  query_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '查询时间',
  query_type VARCHAR(32) NOT NULL COMMENT '单篇分析 | 多篇分析',
  news_summary TEXT NOT NULL COMMENT 'AI 核心概括，≤100 字，列表摘要',
  news_title LONGTEXT NOT NULL COMMENT 'AI 提取的真实新闻标题，非 URL',
  news_body LONGTEXT NULL COMMENT '净化后的正文摘录，不含网页导航/版权噪声',
  source_url TEXT NULL COMMENT '原文链接',
  source_name VARCHAR(256) NULL COMMENT '来源媒体等',
  full_analysis_json JSON NOT NULL COMMENT '完整分析结果 JSON',
  status VARCHAR(32) NOT NULL DEFAULT 'success' COMMENT 'success / fail',
  analysis_record_id BIGINT NULL COMMENT '关联 analysis_records.id',
  INDEX idx_qh_user_time (user_id, query_time),
  CONSTRAINT fk_qh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 若库中仍是旧列名，可执行（或由 Node 启动时 migrateQueryHistoryTable 自动执行）：
-- ALTER TABLE query_history
--   CHANGE COLUMN input_summary news_summary TEXT NOT NULL,
--   CHANGE COLUMN input_title news_title LONGTEXT NOT NULL,
--   CHANGE COLUMN result_json full_analysis_json JSON NOT NULL,
--   CHANGE COLUMN input_content news_body LONGTEXT NULL,
--   CHANGE COLUMN input_url source_url TEXT NULL;
