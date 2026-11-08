import { Router } from 'express';
import { logActivity } from '../db.js';
import { cases as content, caseById, MAX_WEEK } from '../content.js';
import { addDays, isISODate } from '../lib/dates.js';
import { badRequest, requireInt, requireMessage } from '../lib/errors.js';

const SECTION = 'cases';
const MAX_ID = Math.max(...content.cases.map((c) => c.id));

export function casesState(db, userId) {
  const plan = db.prepare("SELECT start_date FROM plans WHERE user_id = ? AND section = 'cases'").get(userId);
  const rows = db.prepare('SELECT case_id, week, completed_at, note FROM case_progress WHERE user_id = ?').all(userId);
  const byId = new Map(rows.map((r) => [r.case_id, r]));
  const startDate = plan?.start_date ?? null;
  return {
    startDate,
    cases: content.cases.map((c) => {
      const r = byId.get(c.id);
      return {
        id: c.id,
        week: r?.week ?? c.week,
        originalWeek: c.week,
        completedAt: r?.completed_at ?? null,
        note: r?.note ?? null,
      };
    }),
  };
}

function ensureRows(db, userId) {
  const ins = db.prepare('INSERT OR IGNORE INTO case_progress (user_id, case_id, week) VALUES (?, ?, ?)');
  for (const c of content.cases) ins.run(userId, c.id, c.week);
}

const weekRange = (start, w) => (start ? `${addDays(start, (w - 1) * 7)} → ${addDays(start, (w - 1) * 7 + 6)}` : null);
const label = (id) => `#${id} ${caseById(id)?.title ?? ''}`.trim();

export default function casesRoutes(db) {
  const r = Router();

  const requirePlan = (userId) => {
    const s = casesState(db, userId);
    if (!s.startDate) throw badRequest('Set a start date for the case study plan first.');
    return s;
  };
  const caseParam = (v) => requireInt(v, 'case id', 1, MAX_ID);

  r.get('/', (req, res) => res.json(casesState(db, req.user.id)));

  r.put('/start', (req, res) => {
    const message = requireMessage(req.body);
    const { startDate } = req.body;
    if (!isISODate(startDate)) throw badRequest('startDate must be a valid date (YYYY-MM-DD).');
    db.transaction(() => {
      const prev = db.prepare("SELECT start_date FROM plans WHERE user_id = ? AND section = 'cases'").get(req.user.id);
      db.prepare(
        "INSERT INTO plans (user_id, section, start_date) VALUES (?, 'cases', ?) ON CONFLICT(user_id, section) DO UPDATE SET start_date = excluded.start_date"
      ).run(req.user.id, startDate);
      ensureRows(db, req.user.id);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: prev ? 'change_start_date' : 'set_start_date',
        item: 'Plan start date (Week 1)',
        details: { from: prev?.start_date ?? null, to: startDate },
        message,
      });
    })();
    res.json(casesState(db, req.user.id));
  });

  r.post('/:id/complete', (req, res) => {
    const id = caseParam(req.params.id);
    const message = requireMessage(req.body);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 4000) : null;
    const s = requirePlan(req.user.id);
    const cur = s.cases.find((c) => c.id === id);
    if (cur.completedAt) throw badRequest('This case is already complete.');
    db.transaction(() => {
      db.prepare('UPDATE case_progress SET completed_at = ?, note = COALESCE(?, note) WHERE user_id = ? AND case_id = ?').run(
        new Date().toISOString(),
        note || null,
        req.user.id,
        id
      );
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'complete',
        item: label(id),
        details: { week: cur.week },
        message,
      });
    })();
    res.json(casesState(db, req.user.id));
  });

  r.post('/:id/uncomplete', (req, res) => {
    const id = caseParam(req.params.id);
    const message = requireMessage(req.body);
    const s = requirePlan(req.user.id);
    if (!s.cases.find((c) => c.id === id).completedAt) throw badRequest('This case is not complete.');
    db.transaction(() => {
      db.prepare('UPDATE case_progress SET completed_at = NULL WHERE user_id = ? AND case_id = ?').run(req.user.id, id);
      logActivity(db, { userId: req.user.id, section: SECTION, action: 'uncomplete', item: label(id), message });
    })();
    res.json(casesState(db, req.user.id));
  });

  // Move one case study to another week.
  r.post('/:id/move', (req, res) => {
    const id = caseParam(req.params.id);
    const toWeek = requireInt(req.body.toWeek, 'toWeek', 1, MAX_WEEK);
    const message = requireMessage(req.body);
    const s = requirePlan(req.user.id);
    const cur = s.cases.find((c) => c.id === id);
    if (cur.week === toWeek) throw badRequest(`This case is already in week ${toWeek}.`);
    db.transaction(() => {
      db.prepare('UPDATE case_progress SET week = ? WHERE user_id = ? AND case_id = ?').run(toWeek, req.user.id, id);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'move_case',
        item: label(id),
        details: { fromWeek: cur.week, toWeek, toDates: weekRange(s.startDate, toWeek) },
        message,
      });
    })();
    res.json(casesState(db, req.user.id));
  });

  // Shift a week by N weeks. Only incomplete cases move; finished cases stay where you did them.
  //   scope = "following" (default): this week and every later week shift together.
  //   scope = "single": only the incomplete cases of this week move (e.g. roll over to next week).
  r.post('/weeks/:week/shift', (req, res) => {
    const week = requireInt(req.params.week, 'week', 1, MAX_WEEK);
    const n = requireInt(req.body.weeks, 'weeks', -12, 20);
    if (n === 0) throw badRequest('Shift must be at least one week.');
    const scope = req.body.scope === 'single' ? 'single' : 'following';
    const message = requireMessage(req.body);
    const s = requirePlan(req.user.id);
    const affected = s.cases.filter((c) => !c.completedAt && (scope === 'single' ? c.week === week : c.week >= week));
    if (!affected.length) throw badRequest(scope === 'single' ? `Week ${week} has no incomplete cases to move.` : `No incomplete cases in week ${week} or later.`);
    for (const c of affected) {
      const w = c.week + n;
      if (w < 1) throw badRequest('That would move cases before week 1.');
      if (w > MAX_WEEK) throw badRequest(`Weeks can go up to ${MAX_WEEK}.`);
    }
    db.transaction(() => {
      const upd = db.prepare('UPDATE case_progress SET week = ? WHERE user_id = ? AND case_id = ?');
      for (const c of affected) upd.run(c.week + n, req.user.id, c.id);
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: scope === 'single' ? 'shift_week' : 'shift_weeks',
        item: scope === 'single' ? `Week ${week}` : `Week ${week} onward`,
        details: {
          by: n,
          scope,
          fromWeek: week,
          toWeek: week + n,
          cases: affected.map((c) => `#${c.id} (W${c.week}→W${c.week + n})`).join(', '),
          affectedCases: affected.length,
        },
        message,
      });
    })();
    res.json(casesState(db, req.user.id));
  });

  r.post('/reset-weeks', (req, res) => {
    const message = requireMessage(req.body);
    requirePlan(req.user.id);
    db.transaction(() => {
      let changed = 0;
      const upd = db.prepare('UPDATE case_progress SET week = ? WHERE user_id = ? AND case_id = ? AND week != ?');
      for (const c of content.cases) changed += upd.run(c.week, req.user.id, c.id, c.week).changes;
      logActivity(db, {
        userId: req.user.id,
        section: SECTION,
        action: 'reset_weeks',
        item: 'All cases',
        details: { casesReset: changed },
        message,
      });
    })();
    res.json(casesState(db, req.user.id));
  });

  r.put('/:id/note', (req, res) => {
    const id = caseParam(req.params.id);
    requirePlan(req.user.id);
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 4000) : '';
    db.prepare('UPDATE case_progress SET note = ? WHERE user_id = ? AND case_id = ?').run(note || null, req.user.id, id);
    res.json(casesState(db, req.user.id));
  });

  return r;
}
