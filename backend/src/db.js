import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'truthlens',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
})

const schemaStatements = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(128) NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    preferences_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
  `,
  `
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
    truth_lens_extras JSON NULL COMMENT 'TruthLens 扩展：如 FakeScore 模型结果（不依赖 analysis_records）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_news_published_at (published_at),
    INDEX idx_news_source_name (source_name)
  )
  `,
  `
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
  )
  `,
  `
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
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS collector_runs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    provider VARCHAR(64) NOT NULL,
    fetched_count INT NOT NULL DEFAULT 0,
    inserted_count INT NOT NULL DEFAULT 0,
    deduped_count INT NOT NULL DEFAULT 0,
    status ENUM('success','failed') NOT NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  `,
  `
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
  )
  `,
]

/** 将旧版列名迁移为 news_* / full_analysis_json，表名不变 */
export async function migrateQueryHistoryTable(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'query_history'`,
    )
    if (!rows?.length) return
    const names = new Set(rows.map((r) => r.COLUMN_NAME))
    if (names.has('news_title')) return
    if (!names.has('input_title')) return
    await pool.query(`
      ALTER TABLE query_history
        CHANGE COLUMN input_summary news_summary TEXT NOT NULL,
        CHANGE COLUMN input_title news_title LONGTEXT NOT NULL,
        CHANGE COLUMN result_json full_analysis_json JSON NOT NULL,
        CHANGE COLUMN input_content news_body LONGTEXT NULL,
        CHANGE COLUMN input_url source_url TEXT NULL
    `)
  } catch (e) {
    console.warn('migrateQueryHistoryTable:', e.message)
  }
}

export async function migrateNewsTableDropUnusedColumns(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news'`,
    )
    if (!rows?.length) return
    const names = new Set(rows.map((r) => r.COLUMN_NAME))
    const toDrop = ['author', 'raw_json'].filter((name) => names.has(name))
    if (!toDrop.length) return
    await pool.query(`ALTER TABLE news ${toDrop.map((name) => `DROP COLUMN ${name}`).join(', ')}`)
  } catch (e) {
    console.warn('migrateNewsTableDropUnusedColumns:', e.message)
  }
}

/** 工作流 newsAnalysis.image 落库字段；旧库无列时补齐 */
export async function ensureNewsImageUrlColumn(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news'`,
    )
    if (!rows?.length) return
    const names = new Set(rows.map((r) => r.COLUMN_NAME))
    if (names.has('image_url')) return
    await pool.query(`ALTER TABLE news ADD COLUMN image_url VARCHAR(2048) NULL`)
  } catch (e) {
    console.warn('ensureNewsImageUrlColumn:', e.message)
  }
}

/** FakeScore 等可挂在新闻行上，详情补算无需 analysis_records */
export async function ensureNewsTruthLensExtrasColumn(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news'`,
    )
    if (!rows?.length) return
    const names = new Set(rows.map((r) => r.COLUMN_NAME))
    if (names.has('truth_lens_extras')) return
    await pool.query(`ALTER TABLE news ADD COLUMN truth_lens_extras JSON NULL`)
  } catch (e) {
    console.warn('ensureNewsTruthLensExtrasColumn:', e.message)
  }
}

export async function initDatabase() {
  for (const statement of schemaStatements) {
    await pool.query(statement)
  }
  await migrateQueryHistoryTable(pool)
  await migrateNewsTableDropUnusedColumns(pool)
  await ensureNewsImageUrlColumn(pool)
  await ensureNewsTruthLensExtrasColumn(pool)
}

export function getPool() {
  return pool
}
