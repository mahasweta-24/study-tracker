import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { nowISO } from './db.js';
import { HttpError, badRequest } from './lib/errors.js';

const COOKIE = 'st_token';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const publicUser = (u) =>
  !u
    ? null
    : { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at, mustChangePassword: !!u.must_change_password };

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw badRequest('Password must be at least 8 characters.');
  if (pw.length > 200) throw badRequest('Password is too long.');
  return pw;
}

// Readable temporary password, e.g. "kite-4827-maple" (no look-alike characters).
export function temporaryPassword() {
  const words = ['amber', 'birch', 'cedar', 'delta', 'ember', 'fable', 'grove', 'haven', 'ivory', 'jade', 'kite', 'lotus', 'maple', 'nova', 'orbit', 'pearl', 'quill', 'river', 'sage', 'tulip'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomInt(1000, 10000)}-${pick()}`;
}

export function createAuth(db, secret) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

  function issue(res, req, user) {
    // "ver" changes when the password changes, which signs out every other session.
    const token = jwt.sign({ sub: user.id, ver: user.token_version ?? 0 }, secret, { expiresIn: '30d' });
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

  async function authenticate(req, _res, next) {
    const token = readToken(req);
    req.user = null;
    if (token) {
      let claims = null;
      try {
        claims = jwt.verify(token, secret);
      } catch {
        claims = null;
      }
      if (claims?.sub) {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [claims.sub]);
        if (user && (claims.ver ?? 0) === (user.token_version ?? 0)) req.user = user;
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

  async function register({ name, email, password }) {
    name = typeof name === 'string' ? name.trim() : '';
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!name || name.length > 80) throw badRequest('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Please enter a valid email.');
    validatePassword(password);
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', [email])) throw new HttpError(409, 'An account with this email already exists.');
    const hash = bcrypt.hashSync(password, 10);
    return db.tx(async (q) => {
      const noAdminYet = !(await q.get("SELECT 1 AS x FROM users WHERE role = 'admin'"));
      const role = noAdminYet || (adminEmail && email === adminEmail) ? 'admin' : 'user';
      const { rows } = await q.run(
        'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [name, email, hash, role, nowISO()]
      );
      return q.get('SELECT * FROM users WHERE id = ?', [rows[0].id]);
    });
  }

  async function login({ email, password }) {
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password.');
    }
    return user;
  }

  // Optional: create/promote an admin from environment variables on boot.
  async function bootstrapAdmin() {
    const pw = process.env.ADMIN_PASSWORD;
    if (!adminEmail) return;
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [adminEmail]);
    if (existing) {
      if (existing.role !== 'admin') await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [existing.id]);
    } else if (pw && pw.length >= 8) {
      await db.run("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)", [
        process.env.ADMIN_NAME || 'Admin',
        adminEmail,
        bcrypt.hashSync(pw, 10),
        nowISO(),
      ]);
    }
  }

  async function changePassword(user, { currentPassword, newPassword }) {
    if (typeof currentPassword !== 'string' || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      throw badRequest('Your current password is incorrect.');
    }
    validatePassword(newPassword);
    if (newPassword === currentPassword) throw badRequest('Choose a password different from the current one.');
    return db.tx(async (q) => {
      await q.run('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?', [
        bcrypt.hashSync(newPassword, 10),
        user.id,
      ]);
      await q.run(
        "INSERT INTO activity_log (user_id, section, action, item, details, message, created_at) VALUES (?, 'account', 'change_password', ?, NULL, ?, ?)",
        [user.id, user.name, user.must_change_password ? 'Set a new password after an admin reset' : 'Changed own password', nowISO()]
      );
      return q.get('SELECT * FROM users WHERE id = ?', [user.id]);
    });
  }

  // Admin: replace a user's password with a temporary one they must change at next sign-in.
  async function resetPassword(target) {
    const temp = temporaryPassword();
    await db.run('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', [
      bcrypt.hashSync(temp, 10),
      target.id,
    ]);
    return temp;
  }

  return { issue, authenticate, requireUser, requireAdmin, register, login, bootstrapAdmin, changePassword, resetPassword, COOKIE };
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
