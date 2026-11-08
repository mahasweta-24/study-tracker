import { openDb } from './db.js';
import { createApp } from './app.js';

if (process.env.REQUIRE_DATABASE_URL === 'true' && !process.env.DATABASE_URL) {
  // On hosts without a persistent disk (e.g. Render's free tier) a SQLite file would be
  // wiped on every deploy or restart, so refuse to start rather than lose data silently.
  console.error('DATABASE_URL is not set. Add your Postgres (e.g. Neon) connection string and redeploy.');
  process.exit(1);
}

const db = await openDb();
const app = await createApp(db);
const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Study Tracker running on http://localhost:${port} (database: ${db.kind})`);
});

const shutdown = () => {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
