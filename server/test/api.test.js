import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

// Runs against SQLite always, and against Postgres when TEST_DATABASE_URL is set
// (its tables are dropped first, so point it at a throwaway database).
const engines = [['sqlite', () => openDb({ url: '', file: ':memory:' })]];
if (process.env.TEST_DATABASE_URL) {
  engines.push([
    'postgres',
    async () => {
      const { default: pg } = await import('pg');
      const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
      await c.connect();
      await c.query('DROP TABLE IF EXISTS activity_log, case_progress, pbi_progress, plans, settings, users CASCADE');
      await c.end();
      return openDb({ url: process.env.TEST_DATABASE_URL });
    },
  ]);
}

for (const [engine, makeDb] of engines) describe(`API on ${engine}`, () => {
let server, base, db;

before(async () => {
  db = await makeDb();
  const app = await createApp(db, { staticDir: '/nonexistent' });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await db.close();
});

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
}

const admin = client();
const user = client();

test('first user becomes admin, second is a normal user', async () => {
  let r = await admin('POST', '/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'password123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'admin');
  r = await user('POST', '/auth/register', { name: 'Maha', email: 'maha@example.com', password: 'password123' });
  assert.equal(r.body.user.role, 'user');
  r = await user('GET', '/admin/activity');
  assert.equal(r.status, 403);
  r = await client()('GET', '/powerbi');
  assert.equal(r.status, 401);
});

test('power bi: start date computes all 100 dates', async () => {
  let r = await user('PUT', '/powerbi/start', { startDate: '2026-11-09' });
  assert.equal(r.status, 400, 'message required');
  r = await user('PUT', '/powerbi/start', { startDate: '2026-11-09', message: 'Starting!' });
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 100);
  assert.equal(r.body.days[0].date, '2026-11-09');
  assert.equal(r.body.days[99].date, '2027-02-16');
});

test('power bi: complete requires message, shift moves following incomplete days', async () => {
  let r = await user('POST', '/powerbi/days/1/complete', {});
  assert.equal(r.status, 400);
  r = await user('POST', '/powerbi/days/1/complete', { message: 'Done with day 1' });
  assert.ok(r.body.days[0].completedAt);
  r = await user('POST', '/powerbi/days/3/complete', { message: 'Did day 3 early' });

  r = await user('POST', '/powerbi/days/2/shift', { days: 2, scope: 'following', message: 'Missed a day' });
  assert.equal(r.status, 200);
  assert.equal(r.body.days[0].date, '2026-11-09'); // completed, before
  assert.equal(r.body.days[1].date, '2026-11-12'); // moved +2
  assert.equal(r.body.days[2].date, '2026-11-11'); // completed, untouched
  assert.equal(r.body.days[99].date, '2027-02-18');

  r = await user('POST', '/powerbi/days/50/shift', { days: 1, scope: 'single', message: 'Busy' });
  assert.equal(r.body.days[49].shift, 3);
  assert.equal(r.body.days[50].shift, 2);

  r = await user('POST', '/powerbi/days/2/shift', { days: -10, message: 'too far' });
  assert.equal(r.status, 400);
});

test('power bi: catch up moves first incomplete day to today', async () => {
  const r = await user('POST', '/powerbi/catch-up', { today: '2026-11-20', message: 'Was sick' });
  assert.equal(r.status, 200);
  assert.equal(r.body.days[1].date, '2026-11-20');
  assert.equal(r.body.days[3].date, '2026-11-22');
  const again = await user('POST', '/powerbi/catch-up', { today: '2026-11-20', message: 'again' });
  assert.equal(again.status, 400);
  const reset = await user('POST', '/powerbi/reset-schedule', { message: 'Fresh start' });
  assert.equal(reset.body.days[1].date, '2026-11-10');
});

test('cases: move a case, shift a week, shift following weeks', async () => {
  let r = await user('POST', '/cases/1/complete', { message: 'x' });
  assert.equal(r.status, 400, 'needs start date');
  r = await user('PUT', '/cases/start', { startDate: '2026-11-09', message: 'Go' });
  assert.equal(r.body.cases.length, 41);
  r = await user('POST', '/cases/1/complete', { message: 'Amul done' });
  r = await user('POST', '/cases/2/move', { toWeek: 2, message: 'No time' });
  assert.equal(r.body.cases.find((c) => c.id === 2).week, 2);

  // roll over incomplete cases of week 1 (only #3 left) to week 2
  r = await user('POST', '/cases/weeks/1/shift', { weeks: 1, scope: 'single', message: 'Rolling over' });
  assert.equal(r.body.cases.find((c) => c.id === 3).week, 2);
  assert.equal(r.body.cases.find((c) => c.id === 1).week, 1, 'completed case stays');
  assert.equal(r.body.cases.find((c) => c.id === 4).week, 2, 'week 2 untouched');

  // push week 2 onward by 1 week
  r = await user('POST', '/cases/weeks/2/shift', { weeks: 1, message: 'Holiday week' });
  assert.equal(r.body.cases.find((c) => c.id === 2).week, 3);
  assert.equal(r.body.cases.find((c) => c.id === 41).week, 14);

  r = await user('POST', '/cases/weeks/1/shift', { weeks: 1, scope: 'single', message: 'nothing left' });
  assert.equal(r.status, 400);
});

test('admin sees every change in the activity log, with filters and CSV', async () => {
  let r = await admin('GET', '/admin/activity?pageSize=100');
  assert.equal(r.status, 200);
  const actions = r.body.rows.map((a) => a.action);
  for (const a of ['set_start_date', 'complete', 'shift_days', 'shift_day', 'catch_up', 'reset_schedule', 'move_case', 'shift_week', 'shift_weeks']) {
    assert.ok(actions.includes(a), `missing ${a}`);
  }
  assert.ok(r.body.rows.every((a) => a.message && a.userName === 'Maha'));

  r = await admin('GET', '/admin/activity?section=cases&action=move_case');
  assert.equal(r.body.total, 1);
  assert.equal(r.body.rows[0].details.toWeek, 2);

  r = await admin('GET', '/admin/activity?q=holiday');
  assert.equal(r.body.total, 1);

  r = await admin('GET', '/admin/activity.csv');
  assert.match(r.body, /Holiday week/);

  r = await admin('GET', '/admin/users');
  assert.equal(r.body.length, 2);
  assert.equal(r.body.find((u) => u.email === 'maha@example.com').pbiDone, 2);

  r = await user('GET', '/activity');
  assert.ok(r.body.total >= 10);
});

test('cannot remove the last admin', async () => {
  const r = await admin('PATCH', '/admin/users/1', { role: 'user' });
  assert.equal(r.status, 400);
});
});
