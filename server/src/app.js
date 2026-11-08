import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJwtSecret } from './db.js';
import { HttpError } from './lib/errors.js';
import { createAuth, publicUser, rateLimit } from './auth.js';
import { powerbi, cases } from './content.js';
import powerbiRoutes from './routes/powerbi.js';
import casesRoutes from './routes/cases.js';
import { activityRoutes, adminRoutes } from './routes/activity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp(db, { staticDir } = {}) {
  const app = express();
  const auth = createAuth(db, await getJwtSecret(db));
  await auth.bootstrapAdmin();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use((req, _res, next) => {
    if (req.body == null || typeof req.body !== 'object') req.body = {};
    next();
  });
  app.use(cookieParser());
  app.use(auth.authenticate);

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    await db.get('SELECT 1 AS ok');
    res.json({ ok: true, db: db.kind });
  });

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
  api.post('/auth/register', limiter, async (req, res) => {
    const user = await auth.register(req.body || {});
    auth.issue(res, req, user);
    res.status(201).json({ user: publicUser(user) });
  });
  api.post('/auth/login', limiter, async (req, res) => {
    const user = await auth.login(req.body || {});
    auth.issue(res, req, user);
    res.json({ user: publicUser(user) });
  });
  api.post('/auth/logout', (_req, res) => {
    res.clearCookie(auth.COOKIE, { path: '/' });
    res.json({ ok: true });
  });
  api.get('/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  api.post('/auth/change-password', limiter, auth.requireUser, async (req, res) => {
    const user = await auth.changePassword(req.user, req.body);
    auth.issue(res, req, user); // this session stays signed in; other sessions are signed out
    res.json({ user: publicUser(user) });
  });

  // After an admin reset, nothing else works until the user picks a new password.
  api.use(['/powerbi', '/cases', '/activity', '/admin'], (req, _res, next) => {
    if (req.user?.must_change_password) throw new HttpError(403, 'Please set a new password first.');
    next();
  });

  api.get('/content/powerbi', (_req, res) => res.json(powerbi));
  api.get('/content/cases', (_req, res) => res.json(cases));

  api.use('/powerbi', auth.requireUser, powerbiRoutes(db));
  api.use('/cases', auth.requireUser, casesRoutes(db));
  api.use('/activity', auth.requireUser, activityRoutes(db));
  api.use('/admin', auth.requireAdmin, adminRoutes(db, auth));

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // Serve the built React app (client/dist) from the same origin.
  const dist = staticDir ?? path.resolve(__dirname, '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  });

  return app;
}
