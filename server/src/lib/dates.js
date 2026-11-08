// Plain calendar-date helpers. All dates are ISO "YYYY-MM-DD" strings handled in UTC
// so that a user's schedule never drifts because of server time zones or DST.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  // b - a, in whole days
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
