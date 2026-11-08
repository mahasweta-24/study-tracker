import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useApp } from '../store.js';
import { ActivityTable, ACTION_OPTIONS, Pager } from '../components/ActivityTable.jsx';

export default function Activity() {
  const { pbi, cases } = useApp();
  const [filters, setFilters] = useState({ section: '', action: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/activity?${qs({ ...filters, page, pageSize: 25 })}`).then(setData);
    }, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters, page, pbi, cases]);

  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">History</span>
          <h1>My activity</h1>
          <p className="muted">Every completion, shift and move you made, with the message you left.</p>
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <input type="search" placeholder="Search messages and items…" value={filters.q} onChange={set('q')} />
          <select value={filters.section} onChange={set('section')}>
            <option value="">All sections</option>
            <option value="powerbi">Power BI</option>
            <option value="cases">Case studies</option>
          </select>
          <select value={filters.action} onChange={set('action')}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {data ? (
          <>
            <ActivityTable rows={data.rows} />
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        ) : <div className="splash small"><div className="spinner" /></div>}
      </div>
    </div>
  );
}
