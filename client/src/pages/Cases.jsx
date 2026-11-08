import { useMemo, useState } from 'react';
import { useApp } from '../store.js';
import { Drawer, Icon, NoteBox, ProgressRing, Segmented } from '../components/ui.jsx';
import { fmt, nextMonday, plural, streak, todayISO } from '../dates.js';
import { deriveCases, PHASE_COLORS, weekEnd, weekStart } from '../lib/cases.js';
import { useCaseActions, useStartDateDialog } from '../lib/actions.jsx';

const METHOD = [
  ['20 min', 'Get the story', 'Read one article and watch one video. Note company, year, market and the decision.'],
  ['15 min', 'Find the problem', 'Write in one sentence what the company had to decide.'],
  ['30 min', 'Apply a framework', 'Pick one or two frameworks and fill them in for the company.'],
  ['25 min', 'Write one-page notes', 'Use the template. Add what you would have done and why.'],
];

function pref(key, dflt) {
  try { return localStorage.getItem(key) ?? dflt; } catch { return dflt; }
}
function savePref(key, v) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

export default function Cases() {
  const { cases, content } = useApp();
  const today = todayISO();
  const startDialog = useStartDateDialog();
  const actions = useCaseActions();
  const data = useMemo(() => deriveCases(cases, content.cases, today), [cases, content, today]);
  const [open, setOpen] = useState(null);
  const [hideDone, setHideDone] = useState(() => pref('cs-hide-done', '0') === '1');
  const [view, setView] = useState(() => pref('cs-view', 'board'));
  const [dragOver, setDragOver] = useState(null);

  if (!cases.startDate) {
    return (
      <div className="page">
        <PageHead />
        <div className="card onboarding">
          <div>
            <h2>When does Week 1 start?</h2>
            <p className="muted">Each week gets a date range from your start date. Unfinished cases can roll into the next week, and whole weeks can be pushed ahead.</p>
          </div>
          <button className="btn primary" onClick={() => startDialog('cases', null, nextMonday())}><Icon name="calendar" /> Choose start date</button>
        </div>
        <div className="grid3">
          {content.cases.phases.map((p) => (
            <div key={p.n} className="card iter-card" style={{ '--c': PHASE_COLORS[p.n] }}>
              <span className="eyebrow">Phase {p.n} · Weeks {p.weeks}</span>
              <h3>{p.title}</h3>
              <p className="muted small">{p.intro}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const selected = open ? data.list.find((c) => c.id === open) : null;
  const cwData = data.weeks.find((w) => w.isCurrent);
  const visibleWeeks = data.weeks.filter((w) => !hideDone || w.items.some((c) => !c.completedAt) || w.isCurrent);

  const onDrop = (e, week) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/case-id'));
    const c = data.list.find((x) => x.id === id);
    if (c && c.week !== week) actions.move(c, week);
  };

  return (
    <div className="page">
      <PageHead>
        <button className="btn ghost" onClick={() => startDialog('cases', cases.startDate)}><Icon name="edit" size={16} /> Week 1 starts {fmt(cases.startDate, 'long')}</button>
      </PageHead>

      {data.overdue.length > 0 && (
        <div className="banner warn">
          <Icon name="clock" />
          <div><strong>{plural(data.overdue.length, 'case')} from earlier weeks still open.</strong> Move them into this week with “Roll over”, or shift the weeks.</div>
        </div>
      )}

      <section className="stats">
        <div className="card stat-ring">
          <ProgressRing value={data.done} total={data.list.length} color="var(--cs)" label={`${data.done}/${data.list.length}`} />
          <div className="iter-bars">
            {content.cases.phases.map((p) => {
              const l = data.list.filter((c) => c.phase === p.n);
              const d = l.filter((c) => c.completedAt).length;
              return (
                <div key={p.n}>
                  <div className="row between small"><span>{p.n}. {p.title}</span><span className="muted">{d}/{l.length}</span></div>
                  <div className="bar"><div style={{ width: `${(d / l.length) * 100}%`, background: PHASE_COLORS[p.n] }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card stat">
          <span className="stat-label">This week</span>
          {cwData ? (
            <>
              <strong>Week {cwData.n}{cwData.meta ? ` · ${cwData.meta.title}` : ''}</strong>
              <span className="muted small">{cwData.done}/{cwData.items.length} done · {fmt(cwData.start, 'dm')} – {fmt(cwData.end, 'dm')}</span>
            </>
          ) : data.currentWeek < 1 ? (
            <><strong>Starts {fmt(cases.startDate)}</strong><span className="muted small">Get the books ready 📚</span></>
          ) : <strong>Past the plan — finish the stragglers!</strong>}
        </div>
        <div className="card stat">
          <span className="stat-label">Plan ends</span>
          <strong>Week {Math.max(data.lastWeek, 1)}</strong>
          <span className={`muted small ${data.lastWeek > 13 ? 'text-warn' : ''}`}>
            {data.lastWeek > 13 ? `${plural(data.lastWeek - 13, 'week')} beyond the 13-week plan` : 'Within the 13-week plan'}
            {data.moved ? ` · ${plural(data.moved, 'case')} moved` : ''}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Streak</span>
          <strong className="streak"><Icon name="flame" /> {plural(streak(data.list.map((c) => c.completedAt)), 'day')}</strong>
          <span className="muted small">Weekday rhythm: Mon · Wed · Fri</span>
        </div>
      </section>

      <div className="toolbar">
        <Segmented value={view} onChange={(v) => { setView(v); savePref('cs-view', v); }}
          options={[{ value: 'board', label: 'Board', icon: 'board' }, { value: 'list', label: 'List', icon: 'list' }]} />
        <label className="toggle">
          <input type="checkbox" checked={hideDone} onChange={(e) => { setHideDone(e.target.checked); savePref('cs-hide-done', e.target.checked ? '1' : '0'); }} />
          Hide finished weeks
        </label>
        <span className="muted small hide-sm">Tip: drag a card onto another week to move it.</span>
        <button className="btn ghost small" onClick={actions.reset}><Icon name="reset" size={16} /> Reset weeks</button>
      </div>

      <div className={view === 'board' ? 'board' : 'board as-list'}>
        {visibleWeeks.map((w) => (
          <section key={w.n}
            className={`col ${w.isCurrent ? 'current' : ''} ${w.isPast && w.done < w.items.length ? 'behind' : ''} ${dragOver === w.n ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(w.n); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
            onDrop={(e) => onDrop(e, w.n)}>
            <header className="col-head">
              <div className="row between">
                <h3>Week {w.n} {w.isCurrent && <span className="pill today">This week</span>}</h3>
                <span className="muted small">{w.done}/{w.items.length}</span>
              </div>
              <span className="muted small">{fmt(w.start, 'dm')} – {fmt(w.end, 'dm')}</span>
              <p className="col-title">{w.meta ? w.meta.title : 'Extra week'}</p>
              {w.n % 4 === 0 && <p className="col-note">✍️ LinkedIn post week: 300 words on your favourite case</p>}
              <div className="col-bar"><div style={{ width: `${w.items.length ? (w.done / w.items.length) * 100 : 0}%` }} /></div>
              <div className="col-actions">
                <button className="btn tiny" disabled={!w.items.some((c) => !c.completedAt)}
                  onClick={() => actions.shiftWeek(w.n, { scope: 'single', n: data.currentWeek > w.n ? data.currentWeek - w.n : 1 })}
                  title="Move this week's unfinished cases forward">
                  Roll over <Icon name="arrowRight" size={13} />
                </button>
                <button className="btn tiny" disabled={!data.list.some((c) => !c.completedAt && c.week >= w.n)}
                  onClick={() => actions.shiftWeek(w.n, { scope: 'following' })} title="Shift this and every later week">
                  Shift weeks <Icon name="forward" size={13} />
                </button>
              </div>
            </header>
            <div className="col-body">
              {w.items.filter((c) => !hideDone || !c.completedAt || w.isCurrent).map((c) => (
                <CaseCard key={c.id} c={c} actions={actions} onOpen={() => setOpen(c.id)} />
              ))}
              {w.items.length === 0 && <div className="col-empty">Drop a case here</div>}
            </div>
          </section>
        ))}
        <section className={`col ghost-col ${dragOver === data.maxWeek + 1 ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(data.maxWeek + 1); }}
          onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, data.maxWeek + 1)}>
          <div className="col-empty">Drop here to create Week {data.maxWeek + 1}</div>
        </section>
      </div>

      {selected && <CaseDrawer c={selected} content={content.cases} start={cases.startDate} actions={actions} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PageHead({ children }) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow cs">Weekly · 41 cases · 13 weeks · ~5 h a week</span>
        <h1>Sales &amp; Marketing Case Studies</h1>
        <p className="muted">From Indian brands to global icons to the classics every interviewer expects.</p>
      </div>
      <div className="row gap">{children}</div>
    </div>
  );
}

function CaseCard({ c, actions, onOpen }) {
  const moved = c.week !== c.originalWeek;
  return (
    <article className={`case ${c.completedAt ? 'done' : ''}`} draggable={!c.completedAt}
      onDragStart={(e) => { e.dataTransfer.setData('text/case-id', String(c.id)); e.dataTransfer.effectAllowed = 'move'; }}
      style={{ '--c': PHASE_COLORS[c.phase] }}>
      <button className="case-main" onClick={onOpen}>
        <span className="case-num">#{c.id}{moved && <em title={`Originally week ${c.originalWeek}`}>from W{c.originalWeek}</em>}</span>
        <span className="case-title">{c.title}</span>
        <span className="case-fw">{c.frameworks.replace(/\.$/, '').split(/,\s*/).slice(0, 3).map((f) => <i key={f}>{f}</i>)}</span>
      </button>
      <div className="case-actions">
        {c.completedAt ? (
          <button className="btn tiny ok" onClick={() => actions.uncomplete(c)} title="Mark incomplete"><Icon name="check" size={13} strokeWidth={3} /> Done</button>
        ) : (
          <>
            <button className="btn tiny" onClick={() => actions.complete(c)}><Icon name="check" size={13} /> Complete</button>
            <button className="btn tiny" onClick={() => actions.move(c, c.week + 1)} title="Move to next week">Next week <Icon name="arrowRight" size={13} /></button>
          </>
        )}
      </div>
    </article>
  );
}

function Links({ items }) {
  return (
    <ul className="links">
      {items.map((l, i) => (
        <li key={i}>{l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.text} <Icon name="external" size={13} /></a> : l.text}</li>
      ))}
    </ul>
  );
}

function CaseDrawer({ c, content, start, actions, onClose }) {
  const phase = content.phases.find((p) => p.n === c.phase);
  const origWeek = content.weeks.find((w) => w.n === c.originalWeek);
  const [checked, setChecked] = useState({});
  return (
    <Drawer onClose={onClose} label={c.title}>
      <div className="drawer-head" style={{ '--c': PHASE_COLORS[c.phase] }}>
        <span className="eyebrow">Phase {phase.n}: {phase.title} · Case #{c.id}</span>
        <h2>{c.title}</h2>
        <div className="row gap wrap">
          <span className={`pill ${c.completedAt ? 'done' : 'upcoming'}`}>{c.completedAt ? 'Done' : 'To do'}</span>
          <span className="muted small"><Icon name="calendar" size={14} /> Week {c.week} · {fmt(weekStart(start, c.week), 'dm')} – {fmt(weekEnd(start, c.week), 'dm')}</span>
          {c.week !== c.originalWeek && <span className="muted small">(planned for week {c.originalWeek})</span>}
        </div>
        <p className="muted small">Original week {c.originalWeek}: {origWeek?.title}</p>
      </div>
      <div className="drawer-actions">
        {c.completedAt ? (
          <button className="btn ghost" onClick={() => actions.uncomplete(c)}><Icon name="undo" /> Mark incomplete</button>
        ) : (
          <>
            <button className="btn success" onClick={() => actions.complete(c)}><Icon name="check" /> Mark complete</button>
            <button className="btn ghost" onClick={() => actions.move(c, c.week + 1)}><Icon name="arrowRight" /> Next week</button>
            <button className="btn ghost" onClick={() => actions.move(c)}>Move to week…</button>
          </>
        )}
      </div>
      <section className="drawer-sec"><h4>Story</h4><p>{c.story}</p></section>
      <section className="drawer-sec"><h4>Learn</h4><p>{c.learn}</p></section>
      <section className="drawer-sec"><h4>Frameworks</h4><div className="fw">{c.frameworks.replace(/\.$/, '').split(/,\s*/).map((f) => <span key={f} className="pill">{f}</span>)}</div></section>
      <section className="drawer-sec"><h4>Read</h4><Links items={c.readLinks} /></section>
      <section className="drawer-sec"><h4>Watch</h4><Links items={c.watchLinks} /></section>
      {c.tip && <section className="drawer-sec tip"><h4>Tip</h4><p>{c.tip}</p></section>}
      <section className="drawer-sec">
        <h4>The 4-step method (~90 min)</h4>
        <ul className="method">
          {METHOD.map(([t, h, p], i) => (
            <li key={h}>
              <label>
                <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                <span><strong>{h}</strong> <em>{t}</em><br /><span className="muted small">{p}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="drawer-sec">
        <h4><Icon name="note" size={15} /> One-page notes</h4>
        <NoteBox value={c.note} onSave={(t) => actions.saveNote(c, t)} />
        <p className="hint">Template: situation · decision · customer · framework · what they did · result · why · what I'd do · lesson · similar cases.</p>
      </section>
    </Drawer>
  );
}

