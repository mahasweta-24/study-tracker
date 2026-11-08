import { Router } from 'express';
import { badRequest, notFound, requireInt } from '../lib/errors.js';
import { publicUser } from '../auth.js';

const SORTABLE = new Set(['created_at', 'section', 'action', 'user']);

async function queryActivity(db, q, { forUserId } = {}) {
  const where = [];
  const params = [];
  const uid = forUserId || (q.userId ? Number(q.userId) : null);
  if (uid) {
    where.push('a.user_id = ?');
    params.push(uid);
  }
  if (q.section) {
    where.push('a.section = ?');
    params.push(String(q.section));
  }
  if (q.action) {
    where.push('a.action = ?');
    params.push(String(q.action));
  }
  if (q.from) {
    where.push('a.created_at >= ?');
    params.push(String(q.from));
  }
  if (q.to) {
    where.push('a.created_at < ?');
    params.push(String(q.to));
  }
  if (q.q) {
    const like = `%${String(q.q).toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    where.push(
      "(LOWER(a.message) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(a.item, '')) LIKE ? ESCAPE '\\' OR LOWER(u.name) LIKE ? ESCAPE '\\' OR LOWER(u.email) LIKE ? ESCAPE '\\')"
    );
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = SORTABLE.has(q.sort) ? q.sort : 'created_at';
  const sortSql = sort === 'user' ? 'u.name' : `a.${sort}`;
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  const base = `FROM activity_log a JOIN users u ON u.id = a.user_id ${whereSql}`;
  const total = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n ${base}`, params)).n;
  return {
    total,
    rows: async (limit, offset) =>
      (
        await db.all(
          `SELECT a.id, a.user_id, u.name AS user_name, u.email AS user_email, a.section, a.action, a.item, a.details, a.message, a.created_at
           ${base} ORDER BY ${sortSql} ${dir}, a.id ${dir} LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        )
      ).map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        section: r.section,
        action: r.action,
        item: r.item,
        details: r.details ? JSON.parse(r.details) : null,
        message: r.message,
        createdAt: r.created_at,
      })),
  };
}

async function paged(db, req, opts) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(5, Number(req.query.pageSize) || 25));
  const { total, rows } = await queryActivity(db, req.query, opts);
  return { total, page, pageSize, rows: await rows(pageSize, (page - 1) * pageSize) };
}

const csvCell = (v) => {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function activityRoutes(db) {
  const r = Router();
  r.get('/', async (req, res) => res.json(await paged(db, req, { forUserId: req.user.id })));
  return r;
}

export function adminRoutes(db) {
  const r = Router();

  r.get('/activity', async (req, res) => res.json(await paged(db, req)));

  r.get('/activity.csv', async (req, res) => {
    const { rows, total } = await queryActivity(db, req.query);
    const all = await rows(Math.max(total, 1), 0);
    const header = ['id', 'timestamp', 'user', 'email', 'section', 'action', 'item', 'details', 'message'];
    const lines = [header.join(',')].concat(
      all.map((a) =>
        [a.id, a.createdAt, a.userName, a.userEmail, a.section, a.action, a.item, a.details, a.message].map(csvCell).join(',')
      )
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  });

  r.get('/stats', async (_req, res) => {
    const one = async (sql, p = []) => (await db.get(sql, p)).n;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    res.json({
      users: await one('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users'),
      events: await one('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM activity_log'),
      eventsToday: await one('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM activity_log WHERE created_at >= ?', [today.toISOString()]),
      completions: await one("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM activity_log WHERE action = 'complete'"),
      shifts: await one(
        "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM activity_log WHERE action IN ('shift_day','shift_days','catch_up','shift_week','shift_weeks','move_case')"
      ),
    });
  });

  r.get('/users', async (_req, res) => {
    const users = await db.all(
      `SELECT u.*,
        (SELECT start_date FROM plans p WHERE p.user_id = u.id AND p.section = 'powerbi') AS pbi_start,
        (SELECT start_date FROM plans p WHERE p.user_id = u.id AND p.section = 'cases') AS cases_start,
        (SELECT CAST(COUNT(*) AS INTEGER) FROM pbi_progress x WHERE x.user_id = u.id AND x.completed_at IS NOT NULL) AS pbi_done,
        (SELECT CAST(COUNT(*) AS INTEGER) FROM case_progress x WHERE x.user_id = u.id AND x.completed_at IS NOT NULL) AS cases_done,
        (SELECT CAST(COUNT(*) AS INTEGER) FROM activity_log a WHERE a.user_id = u.id) AS events,
        (SELECT MAX(created_at) FROM activity_log a WHERE a.user_id = u.id) AS last_activity
       FROM users u ORDER BY u.created_at`
    );
    res.json(
      users.map((u) => ({
        ...publicUser(u),
        pbiStart: u.pbi_start,
        casesStart: u.cases_start,
        pbiDone: u.pbi_done,
        casesDone: u.cases_done,
        events: u.events,
        lastActivity: u.last_activity,
      }))
    );
  });

  r.patch('/users/:id', async (req, res) => {
    const id = requireInt(req.params.id, 'id', 1, Number.MAX_SAFE_INTEGER);
    const role = req.body.role;
    if (role !== 'admin' && role !== 'user') throw badRequest('role must be "admin" or "user".');
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('User not found.');
    if (role === 'user' && user.role === 'admin') {
      const admins = (await db.get("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users WHERE role = 'admin'")).n;
      if (admins <= 1) throw badRequest('There must be at least one admin.');
    }
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json(publicUser(await db.get('SELECT * FROM users WHERE id = ?', [id])));
  });

  return r;
}
