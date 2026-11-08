import { addDays, diffDays } from '../dates.js';

export const weekStart = (start, w) => addDays(start, (w - 1) * 7);
export const weekEnd = (start, w) => addDays(start, (w - 1) * 7 + 6);
export const currentWeek = (start, today) => (start ? Math.floor(diffDays(start, today) / 7) + 1 : null);

export function deriveCases(state, content, today) {
  const byId = new Map(content.cases.map((c) => [c.id, c]));
  const list = state.cases.map((p) => ({ ...byId.get(p.id), ...p }));
  const cw = currentWeek(state.startDate, today);
  const maxWeek = Math.max(content.weeks.length, ...list.map((c) => c.week));
  const weekMeta = new Map(content.weeks.map((w) => [w.n, w]));
  const weeks = [];
  for (let n = 1; n <= maxWeek; n++) {
    const items = list.filter((c) => c.week === n).sort((a, b) => a.id - b.id);
    weeks.push({
      n,
      meta: weekMeta.get(n) || null,
      items,
      done: items.filter((c) => c.completedAt).length,
      start: state.startDate ? weekStart(state.startDate, n) : null,
      end: state.startDate ? weekEnd(state.startDate, n) : null,
      isCurrent: cw === n,
      isPast: cw != null && n < cw,
    });
  }
  const done = list.filter((c) => c.completedAt).length;
  const overdue = list.filter((c) => !c.completedAt && cw != null && c.week < cw);
  const moved = list.filter((c) => c.week !== c.originalWeek && !c.completedAt).length;
  const lastWeek = Math.max(...list.filter((c) => !c.completedAt).map((c) => c.week), 0);
  return { list, weeks, done, overdue, moved, currentWeek: cw, maxWeek, lastWeek };
}

export const PHASE_COLORS = { 1: 'var(--ph1)', 2: 'var(--ph2)', 3: 'var(--ph3)' };
