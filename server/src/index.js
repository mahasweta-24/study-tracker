import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb();
const app = createApp(db);
const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Study Tracker running on http://localhost:${port}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
