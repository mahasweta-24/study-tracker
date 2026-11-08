import { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const ACTION_LABELS = {
  set_start_date: 'Set start date',
  change_start_date: 'Changed start date',
  complete: 'Marked complete',
  uncomplete: 'Marked incomplete',
  shift_day: 'Shifted one day',
  shift_days: 'Shifted days',
  catch_up: 'Caught up',
  reset_schedule: 'Reset schedule',
  move_case: 'Moved case',
  shift_week: 'Shifted week',
  shift_weeks: 'Shifted weeks',
  reset_weeks: 'Reset weeks',
};

export const ACTION_TONE = {
  complete: 'green',
  uncomplete: 'gray',
  set_start_date: 'blue',
  change_start_date: 'blue',
  shift_day: 'amber',
  shift_days: 'amber',
  catch_up: 'amber',
  move_case: 'violet',
  shift_week: 'violet',
  shift_weeks: 'violet',
  reset_schedule: 'red',
  reset_weeks: 'red',
};

export const SECTION_LABELS = { powerbi: 'Power BI', cases: 'Case studies' };

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const d = (iso) => {
  if (!iso) return '—';
  const dt = new Date(iso + 'T00:00:00Z');
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(dt);
};

export function describeDetails(a) {
  const x = a.details;
  if (!x) return '';
  switch (a.action) {
    case 'set_start_date':
    case 'change_start_date':
      return x.from ? `${d(x.from)} → ${d(x.to)}` : `Starts ${d(x.to)}`;
    case 'shift_day':
    case 'shift_days':
    case 'catch_up':
      return `${sign(x.by)} day${Math.abs(x.by) === 1 ? '' : 's'} · ${d(x.from)} → ${d(x.to)}${x.affectedDays > 1 ? ` · ${x.affectedDays} days moved` : ''}${x.newFinish ? ` · finish ${d(x.newFinish)}` : ''}`;
    case 'complete':
      if (x.scheduledFor) return `Scheduled ${d(x.scheduledFor)}`;
      if (x.week) return `Week ${x.week}`;
      return '';
    case 'move_case':
      return `Week ${x.fromWeek} → Week ${x.toWeek}`;
    case 'shift_week':
    case 'shift_weeks':
      return `${sign(x.by)} week${Math.abs(x.by) === 1 ? '' : 's'} · ${x.affectedCases} case${x.affectedCases === 1 ? '' : 's'} moved`;
    case 'reset_schedule':
      return `${x.daysReset} days restored`;
    case 'reset_weeks':
      return `${x.casesReset} cases restored`;
    default:
      return '';
  }
}
