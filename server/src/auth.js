import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError, badRequest } from './lib/errors.js';

const COOKIE = 'st_token';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const publicUser = (u) => (!u ? null : { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at });

export function createAuth(db, secret) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

  function issue(res, req, user) {
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure, // true behind HTTPS (trust proxy is enabled), false for plain http/localhost
      maxAge: MAX_AGE_MS,
      path: '/',
    });
    return token;
  }

  function readToken(req) {
    const h = req.headers.authorization;
    if (h && h.startsWith('Bearer ')) return h.slice(7);
    return req.cookies?.[COOKIE];
  }

  function authenticate(req, _res, next) {
    const token = readToken(req);
    if (token) {
      try {
        const { sub } = jwt.verify(token, secret);
        req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(sub) || null;
      } catch {
        req.user = null;
      }
    }
    next();
  }

  function requireUser(req, _res, next) {
    if (!req.user) throw new HttpError(401, 'Please sign in.');
    next();
  }

  function requireAdmin(req, _res, next) {
    if (!req.user) throw new HttpError(401, 'Please sign in.');
    if (req.user.role !== 'admin') throw new HttpError(403, 'Admins only.');
    next();
  }

  function register({ name, email, password }) {
    name = typeof name === 'string' ? name.trim() : '';
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!name || name.length > 80) throw badRequest('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Please enter a valid email.');
    if (typeof password !== 'string' || password.length < 8) throw badRequest('Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');
    const noAdminYet = !db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
    const role = noAdminYet || (adminEmail && email === adminEmail) ? 'admin' : 'user';
    const hash = bcrypt.hashSync(password, 10);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hash, role);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  }

  function login({ email, password }) {
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password.');
    }
    return user;
  }

  // Optional: create/promote an admin from environment variables on boot.
  function bootstrapAdmin() {
    const pw = process.env.ADMIN_PASSWORD;
    if (!adminEmail) return;
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
    if (existing) {
      if (existing.role !== 'admin') db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    } else if (pw && pw.length >= 8) {
      db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(
        process.env.ADMIN_NAME || 'Admin',
        adminEmail,
        bcrypt.hashSync(pw, 10)
      );
    }
  }

  return { issue, authenticate, requireUser, requireAdmin, register, login, bootstrapAdmin, COOKIE };
}

// Tiny in-memory rate limiter for auth endpoints (per IP).
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) hits.set(key, { start: now, count: 1 });
    else if (++entry.count > max) throw new HttpError(429, 'Too many attempts. Please try again in a few minutes.');
    if (hits.size > 10000) hits.clear();
    next();
  };
}
