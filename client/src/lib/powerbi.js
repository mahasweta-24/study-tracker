import { addDays, diffDays } from '../dates.js';

export function dayStatus(d, today) {
  if (d.completedAt) return 'done';
  if (!d.date) return 'upcoming';
  if (d.date < today) return 'overdue';
  if (d.date === today) return 'today';
  return 'upcoming';
}

export function derivePbi(pbi, content, today) {
  const days = content.days.map((c, i) => {
    const p = pbi.days[i];
    const d = { ...c, ...p };
    d.status = dayStatus(d, today);
    return d;
  });
  const done = days.filter((d) => d.completedAt).length;
  const overdue = days.filter((d) => d.status === 'overdue');
  const todays = days.filter((d) => d.date === today);
  const next = days.find((d) => !d.completedAt) || null;
  const finish = pbi.startDate ? days.reduce((m, d) => (d.date > m ? d.date : m), days[0].date) : null;
  const originalFinish = pbi.startDate ? addDays(pbi.startDate, 99) : null;
  const slip = finish && originalFinish ? diffDays(originalFinish, finish) : 0;
  const iterations = content.iterations.map((it) => {
    const list = days.filter((d) => d.iteration === it.n);
    return { ...it, total: list.length, done: list.filter((d) => d.completedAt).length };
  });
  const groups = [];
  for (const d of days) {
    let g = groups[groups.length - 1];
    if (!g || g.key !== d.group) groups.push((g = { key: d.group, title: d.groupTitle, iteration: d.iteration, days: [] }));
    g.days.push(d);
  }
  return { days, done, overdue, todays, next, finish, originalFinish, slip, iterations, groups };
}

export const ITER_COLORS = { 1: 'var(--it1)', 2: 'var(--it2)', 3: 'var(--it3)' };
