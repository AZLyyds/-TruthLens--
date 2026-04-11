CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(128) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  preferences_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  news_uid VARCHAR(128) NOT NULL UNIQUE,
  title VARCHAR(512) NOT NULL,
  description TEXT NULL,
  content LONGTEXT NULL,
  source_name VARCHAR(128) NULL,
  url VARCHAR(512) NULL UNIQUE,
  language VARCHAR(16) NULL DEFAULT 'unknown',
  country VARCHAR(16) NULL DEFAULT 'global',
  published_at DATETIME NULL,
  image_url VARCHAR(2048) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_news_published_at (published_at),
  INDEX idx_news_source_name (source_name)
);

CREATE TABLE IF NOT EXISTS analysis_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  news_id BIGINT NULL,
  analysis_type ENUM('single','multi') NOT NULL,
  input_json JSON NOT NULL,
  output_json JSON NOT NULL,
  fake_score DECIMAL(5,2) NOT NULL,
  risk_level ENUM('低风险','中风险','高风险') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analysis_user_time (user_id, created_at),
  INDEX idx_analysis_risk (risk_level),
  CONSTRAINT fk_analysis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  analysis_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  source_name VARCHAR(128) NULL,
  risk_level ENUM('低风险','中风险','高风险') NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alerts_created (created_at),
  CONSTRAINT fk_alert_analysis FOREIGN KEY (analysis_id) REFERENCES analysis_records(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS collector_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(64) NOT NULL,
  fetched_count INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  deduped_count INT NOT NULL DEFAULT 0,
  status ENUM('success','failed') NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS query_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  query_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  query_type VARCHAR(32) NOT NULL,
  news_summary TEXT NOT NULL,
  news_title LONGTEXT NOT NULL,
  news_body LONGTEXT NULL,
  source_url TEXT NULL,
  source_name VARCHAR(256) NULL,
  full_analysis_json JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'success',
  analysis_record_id BIGINT NULL,
  INDEX idx_qh_user_time (user_id, query_time),
  CONSTRAINT fk_qh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
