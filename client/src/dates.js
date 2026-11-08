// Calendar dates are "YYYY-MM-DD" strings, interpreted as UTC midnight so the
// schedule never shifts with time zones. "Today" is the user's local date.
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDateOf(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

const f = (opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });
const FMT = {
  long: f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  short: f({ weekday: 'short', day: 'numeric', month: 'short' }),
  dm: f({ day: 'numeric', month: 'short' }),
  month: f({ month: 'long', year: 'numeric' }),
};
export const fmt = (iso, kind = 'short') => (iso ? FMT[kind].format(new Date(iso + 'T00:00:00Z')) : '—');

export function fmtDateTime(ts) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

export function relTime(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDateTime(ts);
}

export function nextMonday(from = todayISO()) {
  const dow = new Date(from + 'T00:00:00Z').getUTCDay(); // 0 = Sun
  const add = dow === 1 ? 0 : (8 - dow) % 7;
  return addDays(from, add);
}

// 6x7 grid of ISO dates for a month view, weeks starting Monday.
export function monthGrid(year, month) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const dow = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon=0
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Consecutive local days (ending today or yesterday) with at least one completion.
export function streak(timestamps) {
  const days = new Set(timestamps.filter(Boolean).map(localDateOf));
  let d = todayISO();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const plural = (n, word, pluralWord = word + 's') => `${n} ${Math.abs(n) === 1 ? word : pluralWord}`;
