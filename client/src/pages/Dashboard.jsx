import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { ACTION_LABELS, ACTION_TONE, describeDetails, useApp } from '../store.js';
import { Icon, ProgressRing } from '../components/ui.jsx';
import { fmt, plural, relTime, streak, todayISO } from '../dates.js';
import { derivePbi } from '../lib/powerbi.js';
import { deriveCases } from '../lib/cases.js';
import { useCaseActions, usePbiActions } from '../lib/actions.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user, pbi, cases, content } = useApp();
  const today = todayISO();
  const p = useMemo(() => derivePbi(pbi, content.powerbi, today), [pbi, content, today]);
  const c = useMemo(() => deriveCases(cases, content.cases, today), [cases, content, today]);
  const pa = usePbiActions();
  const ca = useCaseActions();
  const [recent, setRecent] = useState([]);
  useEffect(() => { api.get('/activity?pageSize=6').then((r) => setRecent(r.rows)); }, [pbi, cases]);

  const allStreak = streak([...p.days.map((d) => d.completedAt), ...c.list.map((x) => x.completedAt)]);
  const focusDay = p.overdue[0] || p.todays.find((d) => !d.completedAt) || p.next;
  const cw = c.weeks.find((w) => w.isCurrent);
  const weekItems = [...c.overdue, ...(cw ? cw.items : [])];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{fmt(today, 'long')}</span>
          <h1>{greeting()}, {user.name.split(' ')[0]}</h1>
          <p className="muted">{allStreak ? <><Icon name="flame" size={16} className="flame" /> {plural(allStreak, 'day')} streak. Keep it going!</> : 'Finish something today to start a streak.'}</p>
        </div>
      </div>

      <div className="grid2">
        <section className="card section-card" style={{ '--c': 'var(--pbi)' }}>
          <div className="section-top">
            <ProgressRing value={p.done} total={100} color="var(--pbi)" label={`${p.done}/100 days`} size={104} />
            <div>
              <span className="eyebrow pbi">Power BI · day-wise</span>
              <h2>Power BI Roadmap</h2>
              {pbi.startDate ? (
                <p className="muted small">Finishes {fmt(p.finish, 'long')}{p.slip > 0 ? ` (+${p.slip}d)` : ''} · {p.overdue.length ? <span className="text-warn">{plural(p.overdue.length, 'day')} overdue</span> : 'on track'}</p>
              ) : <p className="muted small">Not started yet.</p>}
            </div>
          </div>
          {pbi.startDate && focusDay ? (
            <div className={`focus ${focusDay.status}`}>
              <div>
                <span className="stat-label">{focusDay.status === 'overdue' ? `Overdue · ${fmt(focusDay.date)}` : focusDay.status === 'today' ? 'Today' : `Next · ${fmt(focusDay.date)}`}</span>
                <strong>Day {focusDay.day} · {focusDay.title}</strong>
                <p className="muted small clamp2">{focusDay.practice}</p>
              </div>
              <div className="row gap wrap">
                <button className="btn success small" onClick={() => pa.complete(focusDay)}><Icon name="check" size={16} /> Complete</button>
                <button className="btn ghost small" onClick={() => pa.shift(focusDay)}><Icon name="forward" size={16} /> Shift</button>
                {p.overdue.length > 0 && <button className="btn warn small" onClick={() => pa.catchUp(p.overdue[0])}>Catch up</button>}
              </div>
            </div>
          ) : pbi.startDate ? <div className="focus done"><strong>All 100 days complete. 🏆</strong></div> : null}
          <a className="btn block ghost" href="#/powerbi">{pbi.startDate ? 'Open calendar' : 'Set a start date'} <Icon name="arrowRight" size={16} /></a>
        </section>

        <section className="card section-card" style={{ '--c': 'var(--cs)' }}>
          <div className="section-top">
            <ProgressRing value={c.done} total={c.list.length} color="var(--cs)" label={`${c.done}/${c.list.length} cases`} size={104} />
            <div>
              <span className="eyebrow cs">Case studies · weekly</span>
              <h2>Sales &amp; Marketing</h2>
              {cases.startDate ? (
                <p className="muted small">{cw ? `Week ${cw.n} · ${cw.meta?.title || 'Extra week'}` : c.currentWeek < 1 ? `Starts ${fmt(cases.startDate)}` : 'Past week 13'}{c.overdue.length ? <> · <span className="text-warn">{plural(c.overdue.length, 'case')} carried over</span></> : ''}</p>
              ) : <p className="muted small">Not started yet.</p>}
            </div>
          </div>
          {cases.startDate && weekItems.length > 0 && (
            <ul className="mini-cases">
              {weekItems.slice(0, 5).map((x) => (
                <li key={x.id} className={x.completedAt ? 'done' : ''}>
                  <span className="case-num">#{x.id}</span>
                  <span className="grow">{x.title}{x.week < c.currentWeek && <em className="text-warn small"> · W{x.week}</em>}</span>
                  {x.completedAt ? <Icon name="check" size={16} className="ok" /> : (
                    <span className="row gap">
                      <button className="icon-btn" title="Complete" onClick={() => ca.complete(x)}><Icon name="check" size={16} /></button>
                      <button className="icon-btn" title="Move to next week" onClick={() => ca.move(x, Math.max(x.week, c.currentWeek || 0) + 1)}><Icon name="arrowRight" size={16} /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <a className="btn block ghost" href="#/cases">{cases.startDate ? 'Open weekly board' : 'Set a start date'} <Icon name="arrowRight" size={16} /></a>
        </section>
      </div>

      <section className="card">
        <div className="row between"><h3>Recent activity</h3><a href="#/activity" className="small">View all</a></div>
        {recent.length ? (
          <ul className="feed">
            {recent.map((a) => (
              <li key={a.id}>
                <span className={`badge ${ACTION_TONE[a.action] || 'gray'}`}>{ACTION_LABELS[a.action]}</span>
                <div className="grow">
                  <div><strong>{a.item}</strong> <span className="muted small">{describeDetails(a)}</span></div>
                  <div className="muted small">“{a.message}”</div>
                </div>
                <span className="muted tiny nowrap">{relTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Nothing yet. Your completions and shifts will show up here.</p>}
      </section>
    </div>
  );
}
