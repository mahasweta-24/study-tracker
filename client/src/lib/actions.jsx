import { api } from '../api.js';
import { useApp } from '../store.js';
import { ActionDialog, Segmented, Stepper } from '../components/ui.jsx';
import { addDays, diffDays, fmt, plural, todayISO } from '../dates.js';
import { weekEnd, weekStart } from './cases.js';

function Summary({ rows }) {
  return (
    <dl className="summary">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function useStartDateDialog() {
  const { openDialog, closeDialog, setPbi, setCases, notify } = useApp();
  return (section, current, suggested) =>
    openDialog(
      <ActionDialog
        title={current ? 'Change start date' : 'Set your start date'}
        confirmLabel={current ? 'Change start date' : 'Start plan'}
        initial={{ date: current || suggested }}
        defaultMessage={current ? '' : 'Starting the plan'}
        validate={(v) => (!v.date ? 'Pick a date.' : v.date === current ? 'That is already your start date.' : null)}
        controls={(v, set) => (
          <label className="field">
            <span>{section === 'powerbi' ? 'Day 1 date' : 'Week 1 starts on'}</span>
            <input type="date" value={v.date || ''} onChange={(e) => set({ date: e.target.value })} />
          </label>
        )}
        preview={(v) =>
          v.date && (
            <Summary rows={section === 'powerbi'
              ? [['Day 1', fmt(v.date, 'long')], ['Day 100 (if no shifts)', fmt(addDays(v.date, 99), 'long')], current && ['Note', 'Any shifts you made are kept on top of the new start date.']]
              : [['Week 1', `${fmt(v.date, 'dm')} – ${fmt(addDays(v.date, 6), 'dm')}`], ['Week 13 ends', fmt(addDays(v.date, 90), 'long')]]} />
          )
        }
        onConfirm={async (message, v) => {
          const r = await api.put(`/${section}/start`, { startDate: v.date, message });
          section === 'powerbi' ? setPbi(r) : setCases(r);
          notify(current ? 'Start date updated' : 'Plan started — good luck!');
        }}
        onClose={closeDialog}
      />
    );
}

/* ---------------- Power BI ---------------- */

export function usePbiActions() {
  const { openDialog, closeDialog, setPbi, notify, pbi } = useApp();

  const complete = (d) =>
    openDialog(
      <ActionDialog
        title={`Complete Day ${d.day}?`}
        confirmLabel="Mark complete"
        tone="success"
        messageLabel="What did you do / learn?"
        messagePlaceholder="e.g. Built the Financial Overview page; DIVIDE vs / finally clicked."
        preview={() => <Summary rows={[['Day', `${d.day} · ${d.title}`], ['Scheduled', fmt(d.date, 'long')], ['Completing on', fmt(todayISO(), 'long')]]} />}
        onConfirm={async (message) => {
          setPbi(await api.post(`/powerbi/days/${d.day}/complete`, { message, today: todayISO() }));
          notify(`Day ${d.day} complete 🎉`);
        }}
        onClose={closeDialog}
      />
    );

  const uncomplete = (d) =>
    openDialog(
      <ActionDialog
        title={`Mark Day ${d.day} as not done?`}
        confirmLabel="Mark incomplete"
        tone="danger"
        preview={() => <Summary rows={[['Day', `${d.day} · ${d.title}`]]} />}
        onConfirm={async (message) => {
          setPbi(await api.post(`/powerbi/days/${d.day}/uncomplete`, { message }));
          notify(`Day ${d.day} reopened`);
        }}
        onClose={closeDialog}
      />
    );

  const shift = (d, defaults = {}) => {
    const later = pbi.days.filter((x) => x.day >= d.day && !x.completedAt);
    const lastDate = pbi.days.reduce((m, x) => (x.date > m ? x.date : m), pbi.days[0].date);
    openDialog(
      <ActionDialog
        title={`Shift Day ${d.day}`}
        confirmLabel="Shift"
        tone="warn"
        initial={{ n: 1, dir: 'later', scope: 'following', ...defaults }}
        messagePlaceholder="e.g. Missed today – long shift at work."
        validate={(v) => {
          const delta = v.dir === 'later' ? v.n : -v.n;
          return diffDays(pbi.startDate, addDays(d.date, delta)) < 0 ? 'That would move the day before your start date.' : null;
        }}
        controls={(v, set) => (
          <>
            <div className="row gap wrap">
              <label className="field"><span>Move by</span><Stepper value={v.n} onChange={(n) => set({ n })} max={60} /></label>
              <label className="field"><span>Direction</span>
                <Segmented value={v.dir} onChange={(dir) => set({ dir })} options={[{ value: 'later', label: 'Later' }, { value: 'earlier', label: 'Earlier' }]} />
              </label>
            </div>
            <div className="choice-list">
              <label className={`choice ${v.scope === 'following' ? 'on' : ''}`}>
                <input type="radio" checked={v.scope === 'following'} onChange={() => set({ scope: 'following' })} />
                <div><strong>This day and everything after</strong><p>Day {d.day} and the {later.length - 1} remaining days after it move together. Completed days stay put.</p></div>
              </label>
              <label className={`choice ${v.scope === 'single' ? 'on' : ''}`}>
                <input type="radio" checked={v.scope === 'single'} onChange={() => set({ scope: 'single' })} />
                <div><strong>Only this day</strong><p>Just Day {d.day} moves; it may share a date with another day.</p></div>
              </label>
            </div>
          </>
        )}
        preview={(v) => {
          const delta = v.dir === 'later' ? v.n : -v.n;
          const rows = [[`Day ${d.day}`, `${fmt(d.date)} → ${fmt(addDays(d.date, delta))}`]];
          if (v.scope === 'following') {
            rows.push(['Days moving', plural(later.length, 'day')]);
            const ids = new Set(later.map((x) => x.day));
            const newLast = pbi.days.reduce((m, x) => {
              const dt = ids.has(x.day) ? addDays(x.date, delta) : x.date;
              return dt > m ? dt : m;
            }, '');
            rows.push(['Finish date', `${fmt(lastDate)} → ${fmt(newLast)}`]);
          }
          return <Summary rows={rows} />;
        }}
        onConfirm={async (message, v) => {
          const days = v.dir === 'later' ? v.n : -v.n;
          setPbi(await api.post(`/powerbi/days/${d.day}/shift`, { days, scope: v.scope, message }));
          notify(`Shifted ${v.scope === 'single' ? `Day ${d.day}` : `Days ${d.day}+`} by ${plural(days, 'day')}`);
        }}
        onClose={closeDialog}
      />
    );
  };

  const catchUp = (first) => {
    const today = todayISO();
    const n = diffDays(first.date, today);
    const affected = pbi.days.filter((x) => x.day >= first.day && !x.completedAt);
    openDialog(
      <ActionDialog
        title="Catch up on your schedule"
        confirmLabel={`Shift ${plural(n, 'day')}`}
        tone="warn"
        messagePlaceholder="e.g. Was travelling for the weekend."
        preview={() => (
          <>
            <p>You are <strong>{plural(n, 'day')}</strong> behind. Your plan will restart from today:</p>
            <Summary rows={[
              [`Day ${first.day}`, `${fmt(first.date)} → ${fmt(today)} (today)`],
              ['Days moving', plural(affected.length, 'day')],
              ['New finish', fmt(addDays(affected.reduce((m, x) => (x.date > m ? x.date : m), affected[0].date), n), 'long')],
            ]} />
          </>
        )}
        onConfirm={async (message) => {
          setPbi(await api.post('/powerbi/catch-up', { today, message }));
          notify('Schedule updated — you are back on track');
        }}
        onClose={closeDialog}
      />
    );
  };

  const reset = () =>
    openDialog(
      <ActionDialog
        title="Reset all shifts?"
        confirmLabel="Reset schedule"
        tone="danger"
        preview={() => <p>Every day goes back to its original date (start date + day number). Completed days stay completed.</p>}
        onConfirm={async (message) => {
          setPbi(await api.post('/powerbi/reset-schedule', { message }));
          notify('Schedule reset');
        }}
        onClose={closeDialog}
      />
    );

  const saveNote = async (d, note) => setPbi(await api.put(`/powerbi/days/${d.day}/note`, { note }));

  return { complete, uncomplete, shift, catchUp, reset, saveNote };
}

/* ---------------- Case studies ---------------- */

const weekLabel = (start, w) => `Week ${w}${start ? ` · ${fmt(weekStart(start, w), 'dm')} – ${fmt(weekEnd(start, w), 'dm')}` : ''}`;

export function useCaseActions() {
  const { openDialog, closeDialog, setCases, notify, cases } = useApp();
  const start = cases?.startDate;

  const complete = (c) =>
    openDialog(
      <ActionDialog
        title="Complete this case?"
        confirmLabel="Mark complete"
        tone="success"
        messageLabel="Your key takeaway"
        messagePlaceholder="e.g. Fighter brands (Wheel) let a leader answer a low-cost rival without cutting its main brand's price."
        preview={() => <Summary rows={[['Case', `#${c.id} ${c.title}`], ['Week', weekLabel(start, c.week)]]} />}
        onConfirm={async (message) => {
          setCases(await api.post(`/cases/${c.id}/complete`, { message }));
          notify('Case complete 🎉');
        }}
        onClose={closeDialog}
      />
    );

  const uncomplete = (c) =>
    openDialog(
      <ActionDialog
        title="Mark this case as not done?"
        confirmLabel="Mark incomplete"
        tone="danger"
        preview={() => <Summary rows={[['Case', `#${c.id} ${c.title}`]]} />}
        onConfirm={async (message) => {
          setCases(await api.post(`/cases/${c.id}/uncomplete`, { message }));
          notify('Case reopened');
        }}
        onClose={closeDialog}
      />
    );

  const move = (c, toWeek) => {
    const maxWeek = Math.max(13, ...cases.cases.map((x) => x.week)) + 4;
    openDialog(
      <ActionDialog
        title="Move case to another week"
        confirmLabel="Move case"
        tone="violet"
        initial={{ to: toWeek ?? c.week + 1 }}
        messagePlaceholder="e.g. Didn't finish the framework part this week."
        validate={(v) => (v.to === c.week ? 'Pick a different week.' : null)}
        controls={(v, set) => (
          <label className="field">
            <span>Move to</span>
            <select value={v.to} onChange={(e) => set({ to: Number(e.target.value) })}>
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{weekLabel(start, w)}{w === c.week ? ' (current)' : ''}{w === c.originalWeek ? ' · original' : ''}</option>
              ))}
            </select>
          </label>
        )}
        preview={(v) => <Summary rows={[['Case', `#${c.id} ${c.title}`], ['From', weekLabel(start, c.week)], ['To', weekLabel(start, v.to)]]} />}
        onConfirm={async (message, v) => {
          setCases(await api.post(`/cases/${c.id}/move`, { toWeek: v.to, message }));
          notify(`Moved to week ${v.to}`);
        }}
        onClose={closeDialog}
      />
    );
  };

  const shiftWeek = (week, defaults = {}) => {
    const incomplete = (scope) => cases.cases.filter((c) => !c.completedAt && (scope === 'single' ? c.week === week : c.week >= week));
    openDialog(
      <ActionDialog
        title={`Shift week ${week}`}
        confirmLabel="Shift"
        tone="violet"
        initial={{ n: 1, dir: 'later', scope: 'following', ...defaults }}
        messagePlaceholder="e.g. Exams this week, pushing everything by one week."
        validate={(v) => {
          const list = incomplete(v.scope);
          if (!list.length) return v.scope === 'single' ? 'Nothing left to move in this week.' : 'No incomplete cases from this week on.';
          const delta = v.dir === 'later' ? v.n : -v.n;
          if (list.some((c) => c.week + delta < 1)) return 'That would move cases before week 1.';
          return null;
        }}
        controls={(v, set) => (
          <>
            <div className="row gap wrap">
              <label className="field"><span>Move by (weeks)</span><Stepper value={v.n} onChange={(n) => set({ n })} max={12} /></label>
              <label className="field"><span>Direction</span>
                <Segmented value={v.dir} onChange={(dir) => set({ dir })} options={[{ value: 'later', label: 'Later' }, { value: 'earlier', label: 'Earlier' }]} />
              </label>
            </div>
            <div className="choice-list">
              <label className={`choice ${v.scope === 'single' ? 'on' : ''}`}>
                <input type="radio" checked={v.scope === 'single'} onChange={() => set({ scope: 'single' })} />
                <div><strong>Only this week's unfinished cases</strong><p>{plural(incomplete('single').length, 'case')} from week {week} move. Other weeks stay as they are.</p></div>
              </label>
              <label className={`choice ${v.scope === 'following' ? 'on' : ''}`}>
                <input type="radio" checked={v.scope === 'following'} onChange={() => set({ scope: 'following' })} />
                <div><strong>This week and all later weeks</strong><p>{plural(incomplete('following').length, 'unfinished case')} from week {week} onward move together, keeping their order.</p></div>
              </label>
            </div>
          </>
        )}
        preview={(v) => {
          const delta = v.dir === 'later' ? v.n : -v.n;
          const list = incomplete(v.scope);
          return (
            <Summary rows={[
              ['Cases moving', list.length ? list.map((c) => `#${c.id}`).join(', ') : 'none'],
              ['Week', `${week} → ${week + delta}${start ? ` (${fmt(weekStart(start, week + delta), 'dm')} – ${fmt(weekEnd(start, week + delta), 'dm')})` : ''}`],
            ]} />
          );
        }}
        onConfirm={async (message, v) => {
          const weeks = v.dir === 'later' ? v.n : -v.n;
          setCases(await api.post(`/cases/weeks/${week}/shift`, { weeks, scope: v.scope, message }));
          notify(v.scope === 'single' ? `Week ${week} cases moved` : `Week ${week} onward shifted`);
        }}
        onClose={closeDialog}
      />
    );
  };

  const reset = () =>
    openDialog(
      <ActionDialog
        title="Reset all cases to their original weeks?"
        confirmLabel="Reset weeks"
        tone="danger"
        preview={() => <p>Every case goes back to the week it has in the study plan. Completed cases stay completed.</p>}
        onConfirm={async (message) => {
          setCases(await api.post('/cases/reset-weeks', { message }));
          notify('Weeks reset');
        }}
        onClose={closeDialog}
      />
    );

  const saveNote = async (c, note) => setCases(await api.put(`/cases/${c.id}/note`, { note }));

  return { complete, uncomplete, move, shiftWeek, reset, saveNote };
}
