import { useMemo, useState } from 'react';
import { useApp } from '../store.js';
import { Bar, Drawer, Icon, NoteBox, ProgressRing, Segmented } from '../components/ui.jsx';
import { addDays, fmt, monthGrid, nextMonday, plural, streak, todayISO } from '../dates.js';
import { derivePbi, ITER_COLORS } from '../lib/powerbi.js';
import { usePbiActions, useStartDateDialog } from '../lib/actions.jsx';

const STATUS_LABEL = { done: 'Done', today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getView() {
  try { return localStorage.getItem('pbi-view') || 'calendar'; } catch { return 'calendar'; }
}

export default function PowerBI() {
  const { pbi, content } = useApp();
  const today = todayISO();
  const startDialog = useStartDateDialog();
  const actions = usePbiActions();
  const data = useMemo(() => derivePbi(pbi, content.powerbi, today), [pbi, content, today]);
  const [view, setViewState] = useState(getView);
  const [openDay, setOpenDay] = useState(null);
  const setView = (v) => { setViewState(v); try { localStorage.setItem('pbi-view', v); } catch { /* ignore */ } };

  if (!pbi.startDate) {
    return (
      <div className="page">
        <PageHead />
        <div className="card onboarding">
          <div>
            <h2>When do you start Day 1?</h2>
            <p className="muted">Pick a start date and every one of the 100 days gets a date on your calendar. Missed a day? Shift it and everything after moves with it.</p>
          </div>
          <button className="btn primary" onClick={() => startDialog('powerbi', null, nextMonday())}>
            <Icon name="calendar" /> Choose start date
          </button>
        </div>
        <Overview content={content.powerbi} />
      </div>
    );
  }

  const selected = openDay ? data.days[openDay - 1] : null;
  const firstOverdue = data.overdue[0];

  return (
    <div className="page">
      <PageHead>
        <button className="btn ghost" onClick={() => startDialog('powerbi', pbi.startDate)} title="Change start date">
          <Icon name="edit" size={16} /> Starts {fmt(pbi.startDate, 'long')}
        </button>
      </PageHead>

      {firstOverdue && (
        <div className="banner warn">
          <Icon name="clock" />
          <div>
            <strong>{plural(data.overdue.length, 'day')} overdue.</strong> Day {firstOverdue.day} was scheduled for {fmt(firstOverdue.date)}.
          </div>
          <button className="btn warn" onClick={() => actions.catchUp(firstOverdue)}><Icon name="forward" /> Catch up from today</button>
        </div>
      )}

      <section className="stats">
        <div className="card stat-ring">
          <ProgressRing value={data.done} total={100} color="var(--pbi)" label={`${data.done}/100`} />
          <div className="iter-bars">
            {data.iterations.map((it) => (
              <div key={it.n}>
                <div className="row between small"><span>{it.n}. {it.title}</span><span className="muted">{it.done}/{it.total}</span></div>
                <Bar value={it.done} total={it.total} color={ITER_COLORS[it.n]} />
              </div>
            ))}
          </div>
        </div>
        <div className="card stat">
          <span className="stat-label">Up next</span>
          {data.next ? (
            <button className="stat-link" onClick={() => setOpenDay(data.next.day)}>
              <strong>Day {data.next.day} · {data.next.title}</strong>
              <span className={`pill ${data.next.status}`}>{data.next.status === 'upcoming' ? fmt(data.next.date) : STATUS_LABEL[data.next.status]}</span>
            </button>
          ) : <strong>All 100 days done! 🏆</strong>}
        </div>
        <div className="card stat">
          <span className="stat-label">Finish date</span>
          <strong>{fmt(data.finish, 'long')}</strong>
          <span className={`muted small ${data.slip > 0 ? 'text-warn' : ''}`}>
            {data.slip === 0 ? 'On the original plan' : data.slip > 0 ? `${plural(data.slip, 'day')} later than planned` : `${plural(-data.slip, 'day')} ahead of plan`}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Streak</span>
          <strong className="streak"><Icon name="flame" /> {plural(streak(data.days.map((d) => d.completedAt)), 'day')}</strong>
          <span className="muted small">Consecutive days with a completion</span>
        </div>
      </section>

      <RoadmapStrip data={data} onOpen={setOpenDay} />

      <div className="toolbar">
        <Segmented value={view} onChange={setView} options={[{ value: 'calendar', label: 'Calendar', icon: 'calendar' }, { value: 'list', label: 'Weekly plan', icon: 'list' }]} />
        <div className="legend">
          {['done', 'today', 'overdue', 'upcoming'].map((s) => <span key={s}><i className={`swatch ${s}`} />{STATUS_LABEL[s]}</span>)}
          <span><Icon name="clock" size={14} /> Long day</span>
        </div>
        <button className="btn ghost small" onClick={actions.reset}><Icon name="reset" size={16} /> Reset shifts</button>
      </div>

      {view === 'calendar' ? (
        <Calendar data={data} today={today} start={pbi.startDate} onOpen={setOpenDay} />
      ) : (
        <WeeklyList data={data} onOpen={setOpenDay} actions={actions} />
      )}

      {selected && <DayDrawer d={selected} content={content.powerbi} actions={actions} onClose={() => setOpenDay(null)} />}
    </div>
  );
}

function PageHead({ children }) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow pbi">Day-wise · 100 days · 1 hour a day</span>
        <h1>Power BI Roadmap</h1>
        <p className="muted">Beginner to industry-ready in three iterations.</p>
      </div>
      <div className="row gap">{children}</div>
    </div>
  );
}

function Overview({ content }) {
  return (
    <div className="grid3">
      {content.iterations.map((it) => (
        <div key={it.n} className="card iter-card" style={{ '--c': ITER_COLORS[it.n] }}>
          <span className="eyebrow">Iteration {it.n} · {it.range}</span>
          <h3>{it.title}</h3>
          <p className="muted small">{it.goal}</p>
        </div>
      ))}
    </div>
  );
}

function RoadmapStrip({ data, onOpen }) {
  return (
    <div className="card strip-card">
      <div className="strip">
        {data.iterations.map((it) => (
          <div key={it.n} className="strip-iter">
            <span className="strip-title" style={{ color: ITER_COLORS[it.n] }}>{it.n}. {it.title}</span>
            <div className="strip-cells">
              {data.days.filter((d) => d.iteration === it.n).map((d) => (
                <button key={d.day} className={`cell ${d.status} ${d.review ? 'review' : ''}`} onClick={() => onOpen(d.day)}
                  title={`Day ${d.day}: ${d.title} · ${fmt(d.date)} · ${STATUS_LABEL[d.status]}`} aria-label={`Day ${d.day}`}>
                  {d.day}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Calendar({ data, today, start, onOpen }) {
  const initial = (() => {
    const anchor = today < start ? start : today > data.finish ? data.next?.date || data.finish : today;
    return { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 };
  })();
  const [ym, setYm] = useState(initial);
  const byDate = useMemo(() => {
    const m = new Map();
    for (const d of data.days) {
      if (!m.has(d.date)) m.set(d.date, []);
      m.get(d.date).push(d);
    }
    return m;
  }, [data.days]);
  const cells = monthGrid(ym.y, ym.m);
  const move = (k) => setYm(({ y, m }) => { const t = new Date(Date.UTC(y, m + k, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; });
  const monthISO = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const inMonth = data.days.filter((d) => d.date.startsWith(monthISO));

  return (
    <div className="card calendar">
      <div className="cal-head">
        <div className="row gap">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><Icon name="chevronLeft" /></button>
          <h2>{fmt(`${monthISO}-01`, 'month')}</h2>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><Icon name="chevronRight" /></button>
        </div>
        <div className="row gap">
          <span className="muted small">{inMonth.length ? `${inMonth.filter((d) => d.completedAt).length}/${inMonth.length} done this month` : 'Nothing scheduled this month'}</span>
          <button className="btn ghost small" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Today</button>
        </div>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-dow">{w}</div>)}
        {cells.map((iso) => {
          const items = byDate.get(iso) || [];
          const other = !iso.startsWith(monthISO);
          return (
            <div key={iso} className={`cal-cell ${other ? 'other' : ''} ${iso === today ? 'is-today' : ''} ${items.length ? 'has' : ''}`}>
              <span className="cal-date">{Number(iso.slice(8))}</span>
              {items.map((d) => (
                <button key={d.day} className={`chip ${d.status}`} onClick={() => onOpen(d.day)} title={`Day ${d.day}: ${d.title}`}
                  style={{ '--c': ITER_COLORS[d.iteration] }}>
                  <span className="chip-day">D{d.day}{d.long && <Icon name="clock" size={11} />}</span>
                  <span className="chip-title">{d.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyList({ data, onOpen, actions }) {
  let iter = 0;
  return (
    <div className="weeks">
      {data.groups.map((g) => {
        const header = g.iteration !== iter ? (iter = g.iteration) : null;
        const it = data.iterations.find((x) => x.n === g.iteration);
        const done = g.days.filter((d) => d.completedAt).length;
        return (
          <div key={g.key}>
            {header && (
              <div className="iter-head" style={{ '--c': ITER_COLORS[it.n] }}>
                <span className="eyebrow">Iteration {it.n} · {it.range}</span>
                <h2>{it.title}</h2>
                <p className="muted small"><strong>Exit check:</strong> {it.exit}</p>
              </div>
            )}
            <div className="card week-card">
              <div className="week-head">
                <div><strong>{g.key}</strong> <span className="muted">· {g.title}</span></div>
                <span className="muted small">{done}/{g.days.length} · {fmt(g.days[0].date, 'dm')} – {fmt(g.days[g.days.length - 1].date, 'dm')}</span>
              </div>
              <ul className="day-rows">
                {g.days.map((d) => (
                  <li key={d.day} className={`day-row ${d.status}`}>
                    <button className={`check ${d.completedAt ? 'on' : ''}`} onClick={() => (d.completedAt ? actions.uncomplete(d) : actions.complete(d))}
                      aria-label={d.completedAt ? `Mark day ${d.day} incomplete` : `Mark day ${d.day} complete`}>
                      {d.completedAt && <Icon name="check" size={14} strokeWidth={3} />}
                    </button>
                    <button className="day-main" onClick={() => onOpen(d.day)}>
                      <span className="day-num">Day {d.day}</span>
                      <span className="day-title">{d.title}{d.long && <Icon name="clock" size={14} className="muted" />}</span>
                      <span className="day-date">{fmt(d.date)}{d.shift ? <em className="shifted">{d.shift > 0 ? `+${d.shift}` : d.shift}d</em> : null}</span>
                    </button>
                    <span className={`pill ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                    {!d.completedAt && (
                      <button className="icon-btn" title="Shift" aria-label={`Shift day ${d.day}`} onClick={() => actions.shift(d)}><Icon name="forward" size={16} /></button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayDrawer({ d, content, actions, onClose }) {
  const it = content.iterations.find((x) => x.n === d.iteration);
  const nextDate = addDays(d.date, 1);
  return (
    <Drawer onClose={onClose} label={`Day ${d.day}`}>
      <div className="drawer-head" style={{ '--c': ITER_COLORS[d.iteration] }}>
        <span className="eyebrow">Iteration {it.n}: {it.title} · {d.group}</span>
        <h2>Day {d.day} · {d.title}</h2>
        <div className="row gap wrap">
          <span className={`pill ${d.status}`}>{STATUS_LABEL[d.status]}</span>
          <span className="muted small"><Icon name="calendar" size={14} /> {fmt(d.date, 'long')}</span>
          {d.shift !== 0 && <span className="muted small">(shifted {d.shift > 0 ? '+' : ''}{d.shift} days)</span>}
          {d.long && <span className="pill long"><Icon name="clock" size={13} /> Long day · 1.5–2 h</span>}
          {d.review && <span className="pill review">Review &amp; Build</span>}
        </div>
      </div>

      <div className="drawer-actions">
        {d.completedAt ? (
          <button className="btn ghost" onClick={() => actions.uncomplete(d)}><Icon name="undo" /> Mark incomplete</button>
        ) : (
          <>
            <button className="btn success" onClick={() => actions.complete(d)}><Icon name="check" /> Mark complete</button>
            <button className="btn ghost" onClick={() => actions.shift(d)}><Icon name="forward" /> Shift…</button>
            <button className="btn ghost" onClick={() => actions.shift(d, { n: 1 })} title={`Move to ${fmt(nextDate)} with everything after`}>+1 day</button>
          </>
        )}
      </div>
      {d.completedAt && <p className="muted small">Completed {new Date(d.completedAt).toLocaleString()}</p>}

      {d.subtopics && (
        <section className="drawer-sec"><h4>Topics</h4><p>{d.subtopics}</p></section>
      )}
      {(d.learn || d.learnLinks?.length > 0) && d.learn !== '–' && (
        <section className="drawer-sec">
          <h4><span className="tag">20 min</span> Learn</h4>
          {d.learnLinks?.length ? (
            <ul className="links">
              {d.learnLinks.map((l) => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.text} <Icon name="external" size={13} /></a></li>
              ))}
            </ul>
          ) : <p>{d.learn}</p>}
        </section>
      )}
      <section className="drawer-sec">
        <h4><span className="tag">25 min</span> Practice</h4>
        <p>{d.practice}</p>
      </section>
      <section className="drawer-sec">
        <h4>Your daily hour</h4>
        <ol className="routine">
          <li><strong>10 min Recap</strong> · reread yesterday's notes, redo one thing from memory</li>
          <li><strong>20 min Learn</strong> · the linked lesson; stop at the subtopic</li>
          <li><strong>25 min Do</strong> · the Practice task in Power BI Desktop</li>
          <li><strong>5 min Log</strong> · 3 lines in your notes below</li>
        </ol>
      </section>
      <section className="drawer-sec">
        <h4><Icon name="note" size={15} /> Notes</h4>
        <NoteBox value={d.note} onSave={(t) => actions.saveNote(d, t)} />
      </section>
    </Drawer>
  );
}

