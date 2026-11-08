import { Router } from 'express';
import { logActivity, nowISO } from '../db.js';
import { PBI_DAYS, pbiDay } from '../content.js';
import { addDays, diffDays, isISODate } from '../lib/dates.js';
import { badRequest, requireInt, requireMessage } from '../lib/errors.js';

const SECTION = 'powerbi';

// The scheduled date of a day is: start + (day - 1) + shift.
// "shift" accumulates every time the day is pushed forward (or pulled back).
export async function pbiState(q, userId) {
  const plan = await q.get("SELECT start_date FROM plans WHERE user_id = ? AND section = 'powerbi'", [userId]);
  const rows = await q.all('SELECT day, shift, completed_at, note FROM pbi_progress WHERE user_id = ? ORDER BY day', [userId]);
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

async function ensureRows(q, userId) {
  const values = Array.from({ length: PBI_DAYS }, () => '(?, ?)').join(', ');
  const params = Array.from({ length: PBI_DAYS }, (_, i) => [userId, i + 1]).flat();
  await q.run(`INSERT INTO pbi_progress (user_id, day) VALUES ${values} ON CONFLICT (user_id, day) DO NOTHING`, params);
}

const label = (n) => `Day ${n}: ${pbiDay(n)?.title ?? ''}`.trim();

export default function powerbiRoutes(db) {
  const r = Router();

  const requirePlan = async (q, userId) => {
    const s = await pbiState(q, userId);
    if (!s.startDate) throw badRequest('Set a start date for the Power BI roadmap first.');
    return s;
  };
  const shiftDays = (q, userId, days, n) =>
    q.run(`UPDATE pbi_progress SET shift = shift + ? WHERE user_id = ? AND day IN (${days.map(() => '?').join(', ')})`, [n, userId, ...days]);

  r.get('/', async (req, res) => res.json(await pbiState(db, req.user.id)));

  r.put('/start', async (req, res) => {
    const message = requireMessage(req.body);
    const { startDate } = req.body;
    if (!isISODate(startDate)) throw badRequest('startDate must be a valid date (YYYY-MM-DD).');
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const prev = await q.get("SELECT start_date FROM plans WHERE user_id = ? AND section = 'powerbi'", [uid]);
        await q.run(
          "INSERT INTO plans (user_id, section, start_date) VALUES (?, 'powerbi', ?) ON CONFLICT (user_id, section) DO UPDATE SET start_date = excluded.start_date",
          [uid, startDate]
        );
        await ensureRows(q, uid);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: prev ? 'change_start_date' : 'set_start_date',
          item: 'Roadmap start date',
          details: { from: prev?.start_date ?? null, to: startDate },
          message,
        });
        return pbiState(q, uid);
      })
    );
  });

  r.post('/days/:day/complete', async (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const message = requireMessage(req.body);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 4000) : null;
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const cur = s.days[day - 1];
        if (cur.completedAt) throw badRequest(`Day ${day} is already marked complete.`);
        const now = nowISO();
        await q.run('UPDATE pbi_progress SET completed_at = ?, note = COALESCE(?, note) WHERE user_id = ? AND day = ?', [now, note || null, uid, day]);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: 'complete',
          item: label(day),
          details: { scheduledFor: cur.date, completedOn: isISODate(req.body.today) ? req.body.today : now.slice(0, 10) },
          message,
        });
        return pbiState(q, uid);
      })
    );
  });

  r.post('/days/:day/uncomplete', async (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        if (!s.days[day - 1].completedAt) throw badRequest(`Day ${day} is not complete.`);
        await q.run('UPDATE pbi_progress SET completed_at = NULL WHERE user_id = ? AND day = ?', [uid, day]);
        await logActivity(q, { userId: uid, section: SECTION, action: 'uncomplete', item: label(day), message });
        return pbiState(q, uid);
      })
    );
  });

  // Shift a day by N calendar days.
  //   scope = "following" (default): this day and every later, not-yet-completed day move together.
  //   scope = "single": only this day moves.
  r.post('/days/:day/shift', async (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    const n = requireInt(req.body.days, 'days', -60, 120);
    if (n === 0) throw badRequest('Shift must be at least one day.');
    const scope = req.body.scope === 'single' ? 'single' : 'following';
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const cur = s.days[day - 1];
        if (cur.completedAt) throw badRequest(`Day ${day} is already complete; shifting it would not change anything.`);
        const newDate = addDays(cur.date, n);
        if (diffDays(s.startDate, newDate) < 0) throw badRequest('That would move the day before your start date.');
        const affected = scope === 'single' ? [day] : s.days.filter((d) => d.day >= day && !d.completedAt).map((d) => d.day);
        await shiftDays(q, uid, affected, n);
        const last = affected[affected.length - 1];
        await logActivity(q, {
          userId: uid,
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
        return pbiState(q, uid);
      })
    );
  });

  // Catch up: move the earliest overdue day (and everything after it) so it lands on "today".
  r.post('/catch-up', async (req, res) => {
    const message = requireMessage(req.body);
    const today = req.body.today;
    if (!isISODate(today)) throw badRequest('today must be a valid date (YYYY-MM-DD).');
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        const s = await requirePlan(q, uid);
        const first = s.days.find((d) => !d.completedAt);
        if (!first) throw badRequest('Everything is complete. Nothing to catch up!');
        const n = diffDays(first.date, today);
        if (n <= 0) throw badRequest('You are not behind schedule. Nothing to catch up.');
        const affected = s.days.filter((d) => d.day >= first.day && !d.completedAt).map((d) => d.day);
        await shiftDays(q, uid, affected, n);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: 'catch_up',
          item: `Days ${first.day}–${affected[affected.length - 1]} (${affected.length} days)`,
          details: { by: n, from: first.date, to: today, affectedDays: affected.length },
          message,
        });
        return pbiState(q, uid);
      })
    );
  });

  r.post('/reset-schedule', async (req, res) => {
    const message = requireMessage(req.body);
    const uid = req.user.id;
    res.json(
      await db.tx(async (q) => {
        await requirePlan(q, uid);
        const { changes } = await q.run('UPDATE pbi_progress SET shift = 0 WHERE user_id = ? AND shift != 0', [uid]);
        await logActivity(q, {
          userId: uid,
          section: SECTION,
          action: 'reset_schedule',
          item: 'All days',
          details: { daysReset: changes },
          message,
        });
        return pbiState(q, uid);
      })
    );
  });

  r.put('/days/:day/note', async (req, res) => {
    const day = requireInt(req.params.day, 'day', 1, PBI_DAYS);
    await requirePlan(db, req.user.id);
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 4000) : '';
    await db.run('UPDATE pbi_progress SET note = ? WHERE user_id = ? AND day = ?', [note || null, req.user.id, day]);
    res.json(await pbiState(db, req.user.id));
  });

  return r;
}
