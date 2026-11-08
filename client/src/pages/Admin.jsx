import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useApp } from '../store.js';
import { ActivityTable, ACTION_OPTIONS, Pager } from '../components/ActivityTable.jsx';
import { Icon, Segmented } from '../components/ui.jsx';
import { fmt, fmtDateTime, relTime } from '../dates.js';

const EMPTY = { userId: '', section: '', action: '', q: '', from: '', to: '' };

export default function Admin() {
  const { user, notify, pbi, cases } = useApp();
  const [tab, setTab] = useState('activity');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(EMPTY);
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);

  const loadUsers = () => api.get('/admin/users').then(setUsers);
  useEffect(() => {
    api.get('/admin/stats').then(setStats);
    loadUsers();
  }, [pbi, cases]);

  // date inputs are local dates; convert to an ISO range the server can compare against timestamps
  const query = () => ({
    userId: filters.userId,
    section: filters.section,
    action: filters.action,
    q: filters.q,
    from: filters.from ? new Date(filters.from + 'T00:00:00').toISOString() : '',
    to: filters.to ? new Date(new Date(filters.to + 'T00:00:00').getTime() + 86400000).toISOString() : '',
    sort: sort.key,
    dir: sort.dir,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/admin/activity?${qs({ ...query(), page, pageSize })}`).then(setData);
    }, filters.q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, page, pageSize, pbi, cases]);

  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const active = Object.values(filters).some(Boolean);

  async function setRole(u, role) {
    try {
      await api.patch(`/admin/users/${u.id}`, { role });
      notify(`${u.name} is now ${role === 'admin' ? 'an admin' : 'a user'}`);
      loadUsers();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Admin panel</h1>
          <p className="muted">Every change across all users: completions, shifts, moves and start-date changes, with their messages.</p>
        </div>
      </div>

      {stats && (
        <section className="stats five">
          {[
            ['Users', stats.users, 'users'],
            ['Logged changes', stats.events, 'history'],
            ['Changes today', stats.eventsToday, 'clock'],
            ['Completions', stats.completions, 'check'],
            ['Shifts & moves', stats.shifts, 'forward'],
          ].map(([k, v, i]) => (
            <div key={k} className="card stat tile">
              <span className="stat-label"><Icon name={i} size={15} /> {k}</span>
              <strong className="big-num">{v}</strong>
            </div>
          ))}
        </section>
      )}

      <div className="toolbar">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'activity', label: 'Activity log', icon: 'history' }, { value: 'users', label: 'Users', icon: 'users' }]} />
      </div>

      {tab === 'activity' ? (
        <div className="card">
          <div className="filters">
            <input type="search" placeholder="Search message, item, user…" value={filters.q} onChange={set('q')} />
            <select value={filters.userId} onChange={set('userId')}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={filters.section} onChange={set('section')}>
              <option value="">All sections</option>
              <option value="powerbi">Power BI</option>
              <option value="cases">Case studies</option>
            </select>
            <select value={filters.action} onChange={set('action')}>
              <option value="">All actions</option>
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="inline-field">From <input type="date" value={filters.from} onChange={set('from')} /></label>
            <label className="inline-field">To <input type="date" value={filters.to} onChange={set('to')} /></label>
            {active && <button className="btn ghost small" onClick={() => { setFilters(EMPTY); setPage(1); }}>Clear</button>}
            <a className="btn small" href={`/api/admin/activity.csv?${qs(query())}`}><Icon name="download" size={16} /> Export CSV</a>
          </div>
          {data ? (
            <>
              <ActivityTable rows={data.rows} showUser sort={sort} onSort={onSort} />
              <div className="row between wrap">
                <label className="inline-field small">Rows
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
                <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
              </div>
            </>
          ) : <div className="splash small"><div className="spinner" /></div>}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th><th>Role</th><th>Joined</th><th>Power BI</th><th>Case studies</th><th>Changes</th><th>Last active</th><th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="nowrap"><strong>{u.name}</strong></div><div className="muted tiny">{u.email}</div></td>
                    <td><span className={`badge ${u.role === 'admin' ? 'violet' : 'gray'}`}>{u.role}</span></td>
                    <td className="nowrap small">{fmtDateTime(u.createdAt)}</td>
                    <td className="small">
                      <div className="mini-prog"><div className="bar"><div style={{ width: `${u.pbiDone}%`, background: 'var(--pbi)' }} /></div>{u.pbiDone}/100</div>
                      <div className="muted tiny">{u.pbiStart ? `from ${fmt(u.pbiStart, 'dm')}` : 'not started'}</div>
                    </td>
                    <td className="small">
                      <div className="mini-prog"><div className="bar"><div style={{ width: `${(u.casesDone / 41) * 100}%`, background: 'var(--cs)' }} /></div>{u.casesDone}/41</div>
                      <div className="muted tiny">{u.casesStart ? `from ${fmt(u.casesStart, 'dm')}` : 'not started'}</div>
                    </td>
                    <td>
                      <button className="link" onClick={() => { setFilters({ ...EMPTY, userId: String(u.id) }); setPage(1); setTab('activity'); }}>{u.events}</button>
                    </td>
                    <td className="nowrap small">{u.lastActivity ? relTime(u.lastActivity) : '—'}</td>
                    <td>
                      {u.id !== user.id && (
                        <button className="btn tiny" onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')}>
                          {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
