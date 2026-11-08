import { Router } from 'express';
import { logActivity } from '../db.js';
import { PBI_DAYS, pbiDay } from '../content.js';
import { addDays, diffDays, isISODate } from '../lib/dates.js';
import { badRequest, requireInt, requireMessage } from '../lib/errors.js';

const SECTION = 'powerbi';

// The scheduled date of a day is: start + (day - 1) + shift.
// "shift" accumulates every time the day is pushed forward (or pulled back).
export function pbiState(db, userId) {
  const plan = db.prepare("SELECT start_date FROM plans WHERE user_id = ? AND section = 'powerbi'").get(userId);
  const rows = db.prepare('SELECT day, shift, completed_at, note FROM pbi_progress WHERE user_id = ? ORDER BY day').all(userId);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const startDate = plan?.start_date ?? null;
  const days = [];
  for (let d = 1; d <= PBI_DAYS; d++) {
    const r = byDay.get(d);
    const shift = r?.shift ?? 0;
    days.push({
      day: d,
      shift,
      date: startDate ? addDays(startDate, d - 1 + shift) : null,
      completedAt: r?.completed_at ?? null,
      note: r?.note ?? null,
    });
  }
  return { startDate, days };
}

function ensureRows(db, userId) {
  const ins = db.prepare('INSERT OR IGNORE INTO pbi_progress (user_id, day) VALUES (?, ?)');
  for (let d = 1; d <= PBI_DAYS; d++) ins.run(userId, d);
}

const label = (n) => `Day ${n}: ${pbiDay(n)?.title ?? ''}`.trim();

export default function powerbiRoutes(db) {
  const r = Router();

  const requirePlan = (userId) => {
    const s = pbiState(db, userId);
    if (!s.startDate) throw badRequest('Set a start date for the Power BI roadmap first.');
    return s;
  };

  r.get('/', (req, res) => res.json(pbiState(db, req.user.id)));

  r.put('/start', (req, res) => {
    const message = requireMessage(req.body);
    const { startDate } = req.body;
    if (!isISODate(startDate)) throw badRequest('startDate must be a valid date (YYYY-MM-DD).');
    db.transaction(() => {
      const prev = db.prepare("SELECT start_date FROM plans WHERE user_id = ? AND section = 'powerbi'").get(req.user.id);
      db.prepare(
        "INSERT INTO plans (user_id, section, start_date) VALUES (?, 'powerbi', ?) ON CONFLICT(user_id, section) DO UPDATE SET start_date = excluded.start_date"
      ).run(req.user.id, startDate);
      ensureRows(db, req.user.id);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: prev ? 'change_start_date' : 'set_start_date',
        item: 'Roadmap start date',
        details: { from: prev?.start_date ?? null, to: startDate },
        message,
      });
    })();
    res.json(pbiState(db, req.user.id));
  });

  r.post('/days/:day/complete', (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const message = requireMessage(req.body);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 4000) : null;
    const s = requirePlan(req.user.id);
    const cur = s.days[day - 1];
    if (cur.completedAt) throw badRequest(`Day ${day} is already marked complete.`);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE pbi_progress SET completed_at = ?, note = COALESCE(?, note) WHERE user_id = ? AND day = ?').run(
        now,
        note || null,
        req.user.id,
        day
      );
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'complete',
        item: label(day),
        details: { scheduledFor: cur.date, completedOn: req.body.today ?? now.slice(0, 10) },
        message,
      });
    })();
    res.json(pbiState(db, req.user.id));
  });

  r.post('/days/:day/uncomplete', (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const message = requireMessage(req.body);
    const s = requirePlan(req.user.id);
    if (!s.days[day - 1].completedAt) throw badRequest(`Day ${day} is not complete.`);
    db.transaction(() => {
      db.prepare('UPDATE pbi_progress SET completed_at = NULL WHERE user_id = ? AND day = ?').run(req.user.id, day);
      logActivity(db, { userId: req.user.id, section: SECTION, action: 'uncomplete', item: label(day), message });
    })();
    res.json(pbiState(db, req.user.id));
  });

  // Shift a day by N calendar days.
  //   scope = "following" (default): this day and every later, not-yet-completed day move together.
  //   scope = "single": only this day moves.
  r.post('/days/:day/shift', (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const n = requireInt(req.body.days, 'days', -60, 120);
    if (n === 0) throw badRequest('Shift must be at least one day.');
    const scope = req.body.scope === 'single' ? 'single' : 'following';
    const message = requireMessage(req.body);
    const s = requirePlan(req.user.id);
    const cur = s.days[day - 1];
    if (cur.completedAt) throw badRequest(`Day ${day} is already complete; shifting it would not change anything.`);
    const newDate = addDays(cur.date, n);
    if (diffDays(s.startDate, newDate) < 0) throw badRequest('That would move the day before your start date.');

    const affected =
      scope === 'single' ? [day] : s.days.filter((d) => d.day >= day && !d.completedAt).map((d) => d.day);
    db.transaction(() => {
      const upd = db.prepare('UPDATE pbi_progress SET shift = shift + ? WHERE user_id = ? AND day = ?');
      for (const d of affected) upd.run(n, req.user.id, d);
      const last = affected[affected.length - 1];
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: scope === 'single' ? 'shift_day' : 'shift_days',
        item: scope === 'single' || affected.length === 1 ? label(day) : `Days ${day}–${last} (${affected.length} days)`,
        details: {
          by: n,
          scope,
          from: cur.date,
          to: newDate,
          affectedDays: affected.length,
          newFinish: scope === 'following' ? addDays(s.days[last - 1].date, n) : undefined,
        },
        message,
      });
    })();
    res.json(pbiState(db, req.user.id));
  });

  // Catch up: move the earliest overdue day (and everything after it) so it lands on "today".
  r.post('/catch-up', (req, res) => {
    const message = requireMessage(req.body);
    const today = req.body.today;
    if (!isISODate(today)) throw badRequest('today must be a valid date (YYYY-MM-DD).');
    const s = requirePlan(req.user.id);
    const first = s.days.find((d) => !d.completedAt);
    if (!first) throw badRequest('Everything is complete. Nothing to catch up!');
    const n = diffDays(first.date, today);
    if (n <= 0) throw badRequest('You are not behind schedule. Nothing to catch up.');
    const affected = s.days.filter((d) => d.day >= first.day && !d.completedAt).map((d) => d.day);
    db.transaction(() => {
      const upd = db.prepare('UPDATE pbi_progress SET shift = shift + ? WHERE user_id = ? AND day = ?');
      for (const d of affected) upd.run(n, req.user.id, d);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'catch_up',
        item: `Days ${first.day}–${affected[affected.length - 1]} (${affected.length} days)`,
        details: { by: n, from: first.date, to: today, affectedDays: affected.length },
        message,
      });
    })();
    res.json(pbiState(db, req.user.id));
  });

  r.post('/reset-schedule', (req, res) => {
    const message = requireMessage(req.body);
    requirePlan(req.user.id);
    db.transaction(() => {
      const { changes } = db.prepare('UPDATE pbi_progress SET shift = 0 WHERE user_id = ? AND shift != 0').run(req.user.id);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'reset_schedule',
        item: 'All days',
        details: { daysReset: changes },
        message,
      });
    })();
    res.json(pbiState(db, req.user.id));
  });

  r.put('/days/:day/note', (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    requirePlan(req.user.id);
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 4000) : '';
    db.prepare('UPDATE pbi_progress SET note = ? WHERE user_id = ? AND day = ?').run(note || null, req.user.id, day);
    res.json(pbiState(db, req.user.id));
  });

  return r;
}
