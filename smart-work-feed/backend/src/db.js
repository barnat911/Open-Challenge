const Database = require("better-sqlite3");

let db;

function initDB(dbPath) {
  db = new Database(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'worker', -- 'worker' or 'company'
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      skills TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER, -- users.id where role='company'
      title TEXT NOT NULL,
      company_name TEXT NOT NULL,
      description TEXT NOT NULL,
      required_skills TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      job_type TEXT NOT NULL DEFAULT 'micro-job',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(company_id) REFERENCES users(id)
    );

    -- Embeddings cache (so we don’t call API every feed)
    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL, -- 'user' or 'job'
      entity_id INTEGER NOT NULL,
      text_hash TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, text_hash)
    );

    -- Events = TikTok brain signals
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT NOT NULL,  -- 'user' (worker/company)
      actor_id INTEGER NOT NULL,
      target_type TEXT NOT NULL, -- 'job' or 'user'
      target_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,  -- 'view','click','save','apply','skip','cancel'
      dwell_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Ratings -> Trust
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rater_id INTEGER NOT NULL,
      rater_type TEXT NOT NULL,  -- 'company' or 'worker'
      target_id INTEGER NOT NULL,
      target_type TEXT NOT NULL, -- 'worker' or 'company'
      stars INTEGER NOT NULL CHECK(stars >= 1 AND stars <= 5),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function getDB() {
  if (!db) throw new Error("DB not initialized");
  return db;
}

module.exports = { initDB, getDB };