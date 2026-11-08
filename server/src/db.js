import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS plans (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('powerbi','cases')),
  start_date TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);

CREATE TABLE IF NOT EXISTS pbi_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  shift INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  note TEXT,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS case_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL,
  week INTEGER NOT NULL,
  completed_at TEXT,
  note TEXT,
  PRIMARY KEY (user_id, case_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  action TEXT NOT NULL,
  item TEXT,
  details TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(file) {
  const dbFile =
    file ?? path.join(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), 'study-tracker.db');
  if (dbFile !== ':memory:') mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// JWT secret: use JWT_SECRET if provided, otherwise generate one and persist it so
// sessions survive restarts with zero configuration.
export function getJwtSecret(db) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
  if (row) return row.value;
  const secret = crypto.randomBytes(48).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(secret);
  return secret;
}

export function logActivity(db, { userId, section, action, item = null, details = null, message }) {
  db.prepare(
    'INSERT INTO activity_log (user_id, section, action, item, details, message) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, section, action, item, details ? JSON.stringify(details) : null, message);
}
