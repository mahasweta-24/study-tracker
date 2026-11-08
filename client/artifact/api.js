// Artifact "backend": the same routes as the Express server, implemented on the
// claude.ai artifact runtime. Identity comes from the `user` capability and data
// lives in the `db` capability:
//   progress/<uid>                    one doc per person (both plans)
//   log/<uid>/months/<YYYY-MM>        that person's activity log, bucketed by month
// Rules (declared at publish) let each person write only their own docs and let
// the artifact's owner and Editors (admins) read everyone's.
import powerbi from '../../server/src/data/powerbi.json';
import casesContent from '../../server/src/data/casestudies.json';

const PBI_DAYS = powerbi.days.length;
const MAX_WEEK = 60;
const MAX_CASE = Math.max(...casesContent.cases.map((c) => c.id));

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new ApiError(400, m);

/* ---------------- dates (same as server) ---------------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isISODate = (s) => typeof s === 'string' && ISO.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function requireMessage(body) {
  const m = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!m) throw bad('A message is required for this change.');
  if (m.length > 1000) throw bad('Message is too long (max 1000 characters).');
  return m;
}
function requireInt(v, name, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}.`);
  return n;
}

/* ---------------- runtime ---------------- */
let initPromise = null;
let rt = null; // { db, user, uid, me, isAdmin }
let doc = null; // my progress document
let months = {}; // my log buckets: { 'YYYY-MM': [entries] }
let writeChain = Promise.resolve();

const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new ApiError(503, msg)), ms))]);

function init() {
  if (!initPromise) {
    initPromise = (async () => {
      const claude = window.claude;
      if (!claude?.use) return null;
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      if (!uid) return null;
      const [me, isAdmin] = await Promise.all([user.me(), user.canEdit()]);
      rt = { db, user, uid, me, isAdmin };
      const timeoutMsg = "Your saved progress can't be reached right now. Check your connection and reopen the page.";
      const snap = await withTimeout(db.doc(`progress/${uid}`).get(), 10000, timeoutMsg);
      doc = snap.exists ? structuredClone(snap.data()) : null;
      const logSnap = await withTimeout(db.collection(`log/${uid}/months`).get(), 10000, timeoutMsg);
      months = {};
      for (const d of logSnap.docs) months[d.id] = [...(d.data().entries || [])];
      return rt;
    })();
  }
  return initPromise;
}

const emptyDoc = () => ({ joinedAt: new Date().toISOString(), pbi: { startDate: null, days: {} }, cases: { startDate: null, items: {} } });

function friendly(e) {
  if (e instanceof ApiError) return e;
  if (e?.code === 'invalid_argument') return new ApiError(403, 'You can view this page but not save progress. Ask the owner to give you Contributor access.');
  if (e?.code === 'quota_exceeded') return new ApiError(507, 'Storage for this page is full. Ask the owner to clear old activity.');
  if (e?.code === 'revoked') return new ApiError(403, 'Your access to this page changed. Reload to continue.');
  return new ApiError(503, 'Could not save right now. Please try again in a moment.');
}

// Apply a change to my doc + append one log entry, persisted in order.
async function commit(mutate, entry) {
  const next = structuredClone(doc || emptyDoc());
  mutate(next);
  const now = new Date().toISOString();
  const month = now.slice(0, 7);
  const bucket = [...(months[month] || []), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: now, ...entry }];
  const run = writeChain.then(async () => {
    await rt.db.doc(`progress/${rt.uid}`).set(next);
    await rt.db.doc(`log/${rt.uid}/months/${month}`).set({ entries: bucket });
  });
  writeChain = run.catch(() => {});
  try {
    await run;
  } catch (e) {
    throw friendly(e);
  }
  doc = next;
  months[month] = bucket;
}

/* ---------------- Power BI ---------------- */
function pbiState(d = doc) {
  const startDate = d?.pbi?.startDate ?? null;
  const days = [];
  for (let n = 1; n <= PBI_DAYS; n++) {
    const r = d?.pbi?.days?.[n] || {};
    const shift = r.shift ?? 0;
    days.push({ day: n, shift, date: startDate ? addDays(startDate, n - 1 + shift) : null, completedAt: r.completedAt ?? null, note: r.note ?? null });
  }
  return { startDate, days };
}
const dayRec = (d, n) => (d.pbi.days[n] ||= { shift: 0, completedAt: null, note: null });
const pbiLabel = (n) => `Day ${n}: ${powerbi.days[n - 1]?.title ?? ''}`;
function pbiPlan() {
  const s = pbiState();
  if (!s.startDate) throw bad('Set a start date for the Power BI roadmap first.');
  return s;
}

/* ---------------- Case studies ---------------- */
function casesState(d = doc) {
  const startDate = d?.cases?.startDate ?? null;
  return {
    startDate,
    cases: casesContent.cases.map((c) => {
      const r = d?.cases?.items?.[c.id] || {};
      return { id: c.id, week: r.week ?? c.week, originalWeek: c.week, completedAt: r.completedAt ?? null, note: r.note ?? null };
    }),
  };
}
const caseRec = (d, id) => (d.cases.items[id] ||= { week: casesContent.cases.find((c) => c.id === id).week, completedAt: null, note: null });
const caseLabel = (id) => `#${id} ${casesContent.cases.find((c) => c.id === id)?.title ?? ''}`;
const weekRange = (start, w) => (start ? `${addDays(start, (w - 1) * 7)} → ${addDays(start, (w - 1) * 7 + 6)}` : null);
function casesPlan() {
  const s = casesState();
  if (!s.startDate) throw bad('Set a start date for the case study plan first.');
  return s;
}

/* ---------------- activity queries ---------------- */
const allMine = () => Object.values(months).flat().map((e) => ({ ...e, userId: rt.uid }));

async function loadEveryone() {
  const snap = await withTimeout(rt.db.collection('progress').get(), 10000, 'Could not load everyone’s data. Try again.');
  const people = snap.docs.map((d) => ({ uid: d.id, doc: d.data() }));
  if (!people.some((p) => p.uid === rt.uid) && doc) people.push({ uid: rt.uid, doc });
  const logs = await Promise.all(
    people.map(async (p) => {
      if (p.uid === rt.uid) return allMine();
      const ls = await rt.db.collection(`log/${p.uid}/months`).get();
      return ls.docs.flatMap((d) => (d.data().entries || []).map((e) => ({ ...e, userId: p.uid })));
    })
  );
  const profiles = await rt.user.profiles(people.map((p) => p.uid));
  return { people, entries: logs.flat(), profiles };
}

function nameOf(profiles, uid) {
  if (uid === rt.uid) return rt.me.name || 'You';
  return profiles?.[uid]?.name || 'Someone';
}

function filterRows(rows, q, profiles) {
  let out = rows;
  if (q.userId) out = out.filter((a) => a.userId === q.userId);
  if (q.section) out = out.filter((a) => a.section === q.section);
  if (q.action) out = out.filter((a) => a.action === q.action);
  if (q.from) out = out.filter((a) => a.createdAt >= q.from);
  if (q.to) out = out.filter((a) => a.createdAt < q.to);
  out = out.map((a) => ({ ...a, userName: nameOf(profiles, a.userId), userEmail: '' }));
  if (q.q) {
    const s = q.q.toLowerCase();
    out = out.filter((a) => [a.message, a.item, a.userName].some((v) => (v || '').toLowerCase().includes(s)));
  }
  const key = { created_at: 'createdAt', section: 'section', action: 'action', user: 'userName' }[q.sort] || 'createdAt';
  const dir = q.dir === 'asc' ? 1 : -1;
  out.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : a.createdAt < b.createdAt ? -dir : dir));
  return out;
}
function page(rows, q) {
  const p = Math.max(1, Number(q.page) || 1);
  const size = Math.min(200, Math.max(5, Number(q.pageSize) || 25));
  return { total: rows.length, page: p, pageSize: size, rows: rows.slice((p - 1) * size, p * size) };
}

/* ---------------- router ---------------- */
async function handle(method, path, body = {}) {
  const [p, qs] = path.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  let m;

  if (p === '/content/powerbi') return powerbi;
  if (p === '/content/cases') return casesContent;
  if (p === '/health') return { ok: true };

  const r = await init();
  if (p === '/auth/me') {
    if (!r) return { user: null };
    return { user: { id: r.uid, name: r.me.name || '', email: '', role: r.isAdmin ? 'admin' : 'user', createdAt: doc?.joinedAt ?? null } };
  }
  if (p === '/auth/logout') return { ok: true };
  if (!r) throw new ApiError(401, 'Sign in to claude.ai to track your progress.');

  /* Power BI */
  if (method === 'GET' && p === '/powerbi') return pbiState();
  if (method === 'PUT' && p === '/powerbi/start') {
    const message = requireMessage(body);
    if (!isISODate(body.startDate)) throw bad('startDate must be a valid date (YYYY-MM-DD).');
    const prev = doc?.pbi?.startDate ?? null;
    await commit((d) => { d.pbi.startDate = body.startDate; }, {
      section: 'powerbi', action: prev ? 'change_start_date' : 'set_start_date', item: 'Roadmap start date', details: { from: prev, to: body.startDate }, message,
    });
    return pbiState();
  }
  if ((m = p.match(/^\/powerbi\/days\/(\d+)\/(complete|uncomplete|shift|note)$/))) {
    const day = requireInt(m[1], 'day', 1, PBI_DAYS);
    const s = pbiPlan();
    const cur = s.days[day - 1];
    if (m[2] === 'note') {
      const note = typeof body.note === 'string' ? body.note.slice(0, 4000) : '';
      const next = structuredClone(doc);
      dayRec(next, day).note = note || null;
      try { await rt.db.doc(`progress/${rt.uid}`).set(next); } catch (e) { throw friendly(e); }
      doc = next;
      return pbiState();
    }
    const message = requireMessage(body);
    if (m[2] === 'complete') {
      if (cur.completedAt) throw bad(`Day ${day} is already marked complete.`);
      const now = new Date().toISOString();
      await commit((d) => { dayRec(d, day).completedAt = now; }, {
        section: 'powerbi', action: 'complete', item: pbiLabel(day), details: { scheduledFor: cur.date, completedOn: body.today ?? now.slice(0, 10) }, message,
      });
    } else if (m[2] === 'uncomplete') {
      if (!cur.completedAt) throw bad(`Day ${day} is not complete.`);
      await commit((d) => { dayRec(d, day).completedAt = null; }, { section: 'powerbi', action: 'uncomplete', item: pbiLabel(day), details: null, message });
    } else {
      const n = requireInt(body.days, 'days', -60, 120);
      if (n === 0) throw bad('Shift must be at least one day.');
      const scope = body.scope === 'single' ? 'single' : 'following';
      if (cur.completedAt) throw bad(`Day ${day} is already complete; shifting it would not change anything.`);
      const newDate = addDays(cur.date, n);
      if (diffDays(s.startDate, newDate) < 0) throw bad('That would move the day before your start date.');
      const affected = scope === 'single' ? [day] : s.days.filter((x) => x.day >= day && !x.completedAt).map((x) => x.day);
      const last = affected[affected.length - 1];
      await commit((d) => { for (const x of affected) dayRec(d, x).shift += n; }, {
        section: 'powerbi',
        action: scope === 'single' ? 'shift_day' : 'shift_days',
        item: scope === 'single' || affected.length === 1 ? pbiLabel(day) : `Days ${day}–${last} (${affected.length} days)`,
        details: { by: n, scope, from: cur.date, to: newDate, affectedDays: affected.length, ...(scope === 'following' ? { newFinish: addDays(s.days[last - 1].date, n) } : {}) },
        message,
      });
    }
    return pbiState();
  }
  if (method === 'POST' && p === '/powerbi/catch-up') {
    const message = requireMessage(body);
    if (!isISODate(body.today)) throw bad('today must be a valid date (YYYY-MM-DD).');
    const s = pbiPlan();
    const first = s.days.find((x) => !x.completedAt);
    if (!first) throw bad('Everything is complete. Nothing to catch up!');
    const n = diffDays(first.date, body.today);
    if (n <= 0) throw bad('You are not behind schedule. Nothing to catch up.');
    const affected = s.days.filter((x) => x.day >= first.day && !x.completedAt).map((x) => x.day);
    await commit((d) => { for (const x of affected) dayRec(d, x).shift += n; }, {
      section: 'powerbi', action: 'catch_up', item: `Days ${first.day}–${affected[affected.length - 1]} (${affected.length} days)`,
      details: { by: n, from: first.date, to: body.today, affectedDays: affected.length }, message,
    });
    return pbiState();
  }
  if (method === 'POST' && p === '/powerbi/reset-schedule') {
    const message = requireMessage(body);
    const s = pbiPlan();
    const count = s.days.filter((x) => x.shift !== 0).length;
    await commit((d) => { for (const k of Object.keys(d.pbi.days)) d.pbi.days[k].shift = 0; }, {
      section: 'powerbi', action: 'reset_schedule', item: 'All days', details: { daysReset: count }, message,
    });
    return pbiState();
  }

  /* Case studies */
  if (method === 'GET' && p === '/cases') return casesState();
  if (method === 'PUT' && p === '/cases/start') {
    const message = requireMessage(body);
    if (!isISODate(body.startDate)) throw bad('startDate must be a valid date (YYYY-MM-DD).');
    const prev = doc?.cases?.startDate ?? null;
    await commit((d) => { d.cases.startDate = body.startDate; }, {
      section: 'cases', action: prev ? 'change_start_date' : 'set_start_date', item: 'Plan start date (Week 1)', details: { from: prev, to: body.startDate }, message,
    });
    return casesState();
  }
  if (method === 'POST' && p === '/cases/reset-weeks') {
    const message = requireMessage(body);
    const s = casesPlan();
    const count = s.cases.filter((c) => c.week !== c.originalWeek).length;
    await commit((d) => { for (const c of casesContent.cases) caseRec(d, c.id).week = c.week; }, {
      section: 'cases', action: 'reset_weeks', item: 'All cases', details: { casesReset: count }, message,
    });
    return casesState();
  }
  if ((m = p.match(/^\/cases\/weeks\/(\d+)\/shift$/))) {
    const week = requireInt(m[1], 'week', 1, MAX_WEEK);
    const n = requireInt(body.weeks, 'weeks', -12, 20);
    if (n === 0) throw bad('Shift must be at least one week.');
    const scope = body.scope === 'single' ? 'single' : 'following';
    const message = requireMessage(body);
    const s = casesPlan();
    const affected = s.cases.filter((c) => !c.completedAt && (scope === 'single' ? c.week === week : c.week >= week));
    if (!affected.length) throw bad(scope === 'single' ? `Week ${week} has no incomplete cases to move.` : `No incomplete cases in week ${week} or later.`);
    for (const c of affected) {
      if (c.week + n < 1) throw bad('That would move cases before week 1.');
      if (c.week + n > MAX_WEEK) throw bad(`Weeks can go up to ${MAX_WEEK}.`);
    }
    await commit((d) => { for (const c of affected) caseRec(d, c.id).week = c.week + n; }, {
      section: 'cases', action: scope === 'single' ? 'shift_week' : 'shift_weeks', item: scope === 'single' ? `Week ${week}` : `Week ${week} onward`,
      details: { by: n, scope, fromWeek: week, toWeek: week + n, cases: affected.map((c) => `#${c.id} (W${c.week}→W${c.week + n})`).join(', '), affectedCases: affected.length },
      message,
    });
    return casesState();
  }
  if ((m = p.match(/^\/cases\/(\d+)\/(complete|uncomplete|move|note)$/))) {
    const id = requireInt(m[1], 'case id', 1, MAX_CASE);
    const s = casesPlan();
    const cur = s.cases.find((c) => c.id === id);
    if (m[2] === 'note') {
      const note = typeof body.note === 'string' ? body.note.slice(0, 4000) : '';
      const next = structuredClone(doc);
      caseRec(next, id).note = note || null;
      try { await rt.db.doc(`progress/${rt.uid}`).set(next); } catch (e) { throw friendly(e); }
      doc = next;
      return casesState();
    }
    const message = requireMessage(body);
    if (m[2] === 'complete') {
      if (cur.completedAt) throw bad('This case is already complete.');
      await commit((d) => { caseRec(d, id).completedAt = new Date().toISOString(); }, { section: 'cases', action: 'complete', item: caseLabel(id), details: { week: cur.week }, message });
    } else if (m[2] === 'uncomplete') {
      if (!cur.completedAt) throw bad('This case is not complete.');
      await commit((d) => { caseRec(d, id).completedAt = null; }, { section: 'cases', action: 'uncomplete', item: caseLabel(id), details: null, message });
    } else {
      const toWeek = requireInt(body.toWeek, 'toWeek', 1, MAX_WEEK);
      if (cur.week === toWeek) throw bad(`This case is already in week ${toWeek}.`);
      await commit((d) => { caseRec(d, id).week = toWeek; }, {
        section: 'cases', action: 'move_case', item: caseLabel(id), details: { fromWeek: cur.week, toWeek, toDates: weekRange(s.startDate, toWeek) }, message,
      });
    }
    return casesState();
  }

  /* Activity */
  if (method === 'GET' && p === '/activity') {
    const { userId: _ignored, ...rest } = q;
    return page(filterRows(allMine(), rest, null), rest);
  }

  /* Admin (owner and Editors) */
  if (p.startsWith('/admin')) {
    if (!r.isAdmin) throw new ApiError(403, 'Admins only.');
    const all = await loadEveryone();
    if (p === '/admin/activity') return page(filterRows(all.entries, q, all.profiles), q);
    if (p === '/admin/stats') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const t = today.toISOString();
      const shifts = new Set(['shift_day', 'shift_days', 'catch_up', 'shift_week', 'shift_weeks', 'move_case']);
      return {
        users: all.people.length,
        events: all.entries.length,
        eventsToday: all.entries.filter((e) => e.createdAt >= t).length,
        completions: all.entries.filter((e) => e.action === 'complete').length,
        shifts: all.entries.filter((e) => shifts.has(e.action)).length,
      };
    }
    if (p === '/admin/users') {
      return all.people
        .map(({ uid, doc: d }) => {
          const mine = all.entries.filter((e) => e.userId === uid);
          return {
            id: uid,
            name: nameOf(all.profiles, uid),
            email: '',
            role: uid === r.uid ? 'admin' : null,
            createdAt: d?.joinedAt ?? null,
            pbiStart: d?.pbi?.startDate ?? null,
            casesStart: d?.cases?.startDate ?? null,
            pbiDone: Object.values(d?.pbi?.days || {}).filter((x) => x.completedAt).length,
            casesDone: Object.values(d?.cases?.items || {}).filter((x) => x.completedAt).length,
            events: mine.length,
            lastActivity: mine.reduce((mx, e) => (e.createdAt > mx ? e.createdAt : mx), '') || null,
          };
        })
        .sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? -1 : 1);
    }
  }
  throw new ApiError(404, 'Not found');
}

async function exportCsv(query) {
  const r = await init();
  if (!r?.isAdmin) throw new ApiError(403, 'Admins only.');
  const all = await loadEveryone();
  const rows = filterRows(all.entries, query, all.profiles);
  const cell = (v) => {
    if (v == null) return '';
    let s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['timestamp', 'user', 'section', 'action', 'item', 'details', 'message'].join(',')].concat(
    rows.map((a) => [a.createdAt, a.userName, a.section, a.action, a.item, a.details, a.message].map(cell).join(','))
  );
  const downloads = await window.claude?.use?.('downloads');
  if (!downloads) throw new ApiError(503, 'Downloads are not available in this view.');
  try {
    await downloads.save({ filename: `activity-${new Date().toISOString().slice(0, 10)}.csv`, data: '﻿' + lines.join('\r\n') });
  } catch (e) {
    if (e?.code === 'declined' || e?.code === 'cancelled') return;
    throw new ApiError(503, 'The file could not be saved.');
  }
}

const call = (method) => async (path, body) => {
  try {
    return await handle(method, path, body);
  } catch (e) {
    throw e instanceof ApiError ? e : friendly(e);
  }
};

export const api = { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), exportCsv };

export const qs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
