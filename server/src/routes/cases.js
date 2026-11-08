import { Router } from 'express';
import { logActivity, nowISO } from '../db.js';
import { cases as content, caseById, MAX_WEEK } from '../content.js';
import { addDays, isISODate } from '../lib/dates.js';
import { badRequest, requireInt, requireMessage } from '../lib/errors.js';

const SECTION = 'cases';
const MAX_ID = Math.max(...content.cases.map((c) => c.id));

export async function casesState(q, userId) {
  const plan = await q.get("SELECT start_date FROM plans WHERE user_id = ? AND section = 'cases'", [userId]);
  const rows = await q.all('SELECT case_id, week, completed_at, note FROM case_progress WHERE user_id = ?', [userId]);
  const byId = new Map(rows.map((r) => [r.case_id, r]));
  return {
    startDate: plan?.start_date ?? null,
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

async function ensureRows(q, userId) {
  const values = content.cases.map(() => '(?, ?, ?)').join(', ');
  const params = content.cases.flatMap((c) => [userId, c.id, c.week]);
  await q.run(`INSERT INTO case_progress (user_id, case_id, week) VALUES ${values} ON CONFLICT (user_id, case_id) DO NOTHING`, params);
}

const weekRange = (start, w) => (start ? `${addDays(start, (w - 1) * 7)} → ${addDays(start, (w - 1) * 7 + 6)}` : null);
const label = (id) => `#${id} ${caseById(id)?.title ?? ''}`.trim();

export default function casesRoutes(db) {
  const r = Router();

  const requirePlan = async (q, userId) => {
    const s = await casesState(q, userId);
    if (!s.startDate) throw badRequest('Set a start date for the case study plan first.');
    return s;
  };
  const caseParam = (v) => requireInt(v, 'case id', 1, MAX_ID);

  r.get('/', async (req, res) => res.json(await casesState(db, req.user.id)));

  r.put('/start', async (req, res) => {
    const message = requireMessage(req.body);
    const { startDate } = req.body;
    if (!isISODate(startDate)) throw badRequest('startDate must be a valid date (YYYY-MM-DD).');
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const prev = await q.get("SELECT start_date FROM plans WHERE user_id = ? AND section = 'cases'", [uid]);
        await q.run(
          "INSERT INTO plans (user_id, section, start_date) VALUES (?, 'cases', ?) ON CONFLICT (user_id, section) DO UPDATE SET start_date = excluded.start_date",
          [uid, startDate]
        );
        await ensureRows(q, uid);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: prev ? 'change_start_date' : 'set_start_date',
          item: 'Plan start date (Week 1)',
          details: { from: prev?.start_date ?? null, to: startDate },
          message,
        });
        return casesState(q, uid);
      })
    );
  });

  r.post('/:id/complete', async (req, res) => {
    const id = caseParam(req.params.id);
    const message = requireMessage(req.body);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 4000) : null;
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const cur = s.cases.find((c) => c.id === id);
        if (cur.completedAt) throw badRequest('This case is already complete.');
        await q.run('UPDATE case_progress SET completed_at = ?, note = COALESCE(?, note) WHERE user_id = ? AND case_id = ?', [nowISO(), note || null, uid, id]);
        await logActivity(q, { userId: uid, section: SECTION, action: 'complete', item: label(id), details: { week: cur.week }, message });
        return casesState(q, uid);
      })
    );
  });

  r.post('/:id/uncomplete', async (req, res) => {
    const id = caseParam(req.params.id);
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        if (!s.cases.find((c) => c.id === id).completedAt) throw badRequest('This case is not complete.');
        await q.run('UPDATE case_progress SET completed_at = NULL WHERE user_id = ? AND case_id = ?', [uid, id]);
        await logActivity(q, { userId: uid, section: SECTION, action: 'uncomplete', item: label(id), message });
        return casesState(q, uid);
      })
    );
  });

  // Move one case study to another week.
  r.post('/:id/move', async (req, res) => {
    const id = caseParam(req.params.id);
    const toWeek = requireInt(req.body.toWeek, 'toWeek', 1, MAX_WEEK);
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const cur = s.cases.find((c) => c.id === id);
        if (cur.week === toWeek) throw badRequest(`This case is already in week ${toWeek}.`);
        await q.run('UPDATE case_progress SET week = ? WHERE user_id = ? AND case_id = ?', [toWeek, uid, id]);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: 'move_case',
          item: label(id),
          details: { fromWeek: cur.week, toWeek, toDates: weekRange(s.startDate, toWeek) },
          message,
        });
        return casesState(q, uid);
      })
    );
  });

  // Shift a week by N weeks. Only incomplete cases move; finished cases stay where you did them.
  //   scope = "following" (default): this week and every later week shift together.
  //   scope = "single": only the incomplete cases of this week move (e.g. roll over to next week).
  r.post('/weeks/:week/shift', async (req, res) => {
    const week = requireInt(req.params.week, 'week', 1, MAX_WEEK);
    const n = requireInt(req.body.weeks, 'weeks', -12, 20);
    if (n === 0) throw badRequest('Shift must be at least one week.');
    const scope = req.body.scope === 'single' ? 'single' : 'following';
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const affected = s.cases.filter((c) => !c.completedAt && (scope === 'single' ? c.week === week : c.week >= week));
        if (!affected.length) {
          throw badRequest(scope === 'single' ? `Week ${week} has no incomplete cases to move.` : `No incomplete cases in week ${week} or later.`);
        }
        for (const c of affected) {
          if (c.week + n < 1) throw badRequest('That would move cases before week 1.');
          if (c.week + n > MAX_WEEK) throw badRequest(`Weeks can go up to ${MAX_WEEK}.`);
        }
        const ids = affected.map((c) => c.id);
        await q.run(`UPDATE case_progress SET week = week + ? WHERE user_id = ? AND case_id IN (${ids.map(() => '?').join(', ')})`, [n, uid, ...ids]);
        await logActivity(q, {
          userId: uid,
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
        return casesState(q, uid);
      })
    );
  });

  r.post('/reset-weeks', async (req, res) => {
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        await requirePlan(q, uid);
        let changed = 0;
        for (const c of content.cases) {
          changed += (await q.run('UPDATE case_progress SET week = ? WHERE user_id = ? AND case_id = ? AND week != ?', [c.week, uid, c.id, c.week])).changes;
        }
        await logActivity(q, { userId: uid, section: SECTION, action: 'reset_weeks', item: 'All cases', details: { casesReset: changed }, message });
        return casesState(q, uid);
      })
    );
  });

  r.put('/:id/note', async (req, res) => {
    const id = caseParam(req.params.id);
    await requirePlan(db, req.user.id);
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 4000) : '';
    await db.run('UPDATE case_progress SET note = ? WHERE user_id = ? AND case_id = ?', [note || null, req.user.id, id]);
    res.json(await casesState(db, req.user.id));
  });

  return r;
}
