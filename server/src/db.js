// Database layer with two interchangeable engines:
//   - Postgres when DATABASE_URL is set (e.g. a free Neon database on Render)
//   - SQLite (a single file in DATA_DIR) otherwise
// Both expose the same async API, and all queries use "?" placeholders:
//   q.get(sql, params)  -> first row or undefined
//   q.all(sql, params)  -> rows
//   q.run(sql, params)  -> { changes, rows }   (rows for "... RETURNING")
//   db.tx(async (q) => …)  runs the callback in a transaction
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const tables = (idColumn) => `
CREATE TABLE IF NOT EXISTS users (
  id ${idColumn},
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL
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
  id ${idColumn},
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  action TEXT NOT NULL,
  item TEXT,
  details TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function openSqlite(file) {
  const { default: Database } = await import('better-sqlite3');
  const dbFile = file ?? path.join(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), 'study-tracker.db');
  if (dbFile !== ':memory:') mkdirSync(path.dirname(dbFile), { recursive: true });
  const sqlite = new Database(dbFile);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(tables('INTEGER PRIMARY KEY AUTOINCREMENT'));

  const q = {
    get: async (sql, p = []) => sqlite.prepare(sql).get(...p),
    all: async (sql, p = []) => sqlite.prepare(sql).all(...p),
    run: async (sql, p = []) => {
      const st = sqlite.prepare(sql);
      if (st.reader) {
        const rows = st.all(...p);
        return { changes: rows.length, rows };
      }
      return { changes: st.run(...p).changes, rows: [] };
    },
  };

  // One connection: serialise transactions so concurrent requests never interleave inside one.
  let lock = Promise.resolve();
  const tx = (fn) => {
    const run = lock.then(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(q);
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    });
    lock = run.catch(() => {});
    return run;
  };

  return { kind: 'sqlite', ...q, tx, close: async () => sqlite.close() };
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX) || 5, idleTimeoutMillis: 30000 });
  // Serverless Postgres (Neon) closes idle connections; don't crash on that.
  pool.on('error', (err) => console.error('Postgres pool error:', err.message));

  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const bind = (client) => ({
    get: async (sql, p = []) => (await client.query(toPg(sql), p)).rows[0],
    all: async (sql, p = []) => (await client.query(toPg(sql), p)).rows,
    run: async (sql, p = []) => {
      const r = await client.query(toPg(sql), p);
      return { changes: r.rowCount ?? 0, rows: r.rows };
    },
  });

  await pool.query(tables('SERIAL PRIMARY KEY'));

  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(bind(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };

  return { kind: 'postgres', ...bind(pool), tx, close: () => pool.end() };
}

export function openDb({ url = process.env.DATABASE_URL, file } = {}) {
  return url ? openPostgres(url) : openSqlite(file);
}

export const nowISO = () => new Date().toISOString();

// JWT secret: use JWT_SECRET if provided, otherwise generate one and persist it so
// sessions survive restarts with zero configuration.
export async function getJwtSecret(db) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const row = await db.get("SELECT value FROM settings WHERE key = 'jwt_secret'");
  if (row) return row.value;
  const secret = crypto.randomBytes(48).toString('hex');
  await db.run("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?) ON CONFLICT (key) DO NOTHING", [secret]);
  return (await db.get("SELECT value FROM settings WHERE key = 'jwt_secret'")).value;
}

export async function logActivity(q, { userId, section, action, item = null, details = null, message }) {
  await q.run(
    'INSERT INTO activity_log (user_id, section, action, item, details, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, section, action, item, details ? JSON.stringify(details) : null, message, nowISO()]
  );
}
