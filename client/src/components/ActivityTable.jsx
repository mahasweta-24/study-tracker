import { ACTION_LABELS, ACTION_TONE, SECTION_LABELS, describeDetails } from '../store.js';
import { fmtDateTime, relTime } from '../dates.js';
import { Icon } from './ui.jsx';

export function ActivityTable({ rows, showUser, sort, onSort }) {
  const th = (key, label) =>
    onSort ? (
      <th aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button className="th-btn" onClick={() => onSort(key)}>
          {label} {sort?.key === key && <span>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
        </button>
      </th>
    ) : <th>{label}</th>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {th('created_at', 'When')}
            {showUser && th('user', 'User')}
            {th('section', 'Section')}
            {th('action', 'Action')}
            <th>Item</th>
            <th>Change</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="nowrap" title={fmtDateTime(a.createdAt)}>
                <div>{relTime(a.createdAt)}</div>
                <div className="muted tiny">{fmtDateTime(a.createdAt)}</div>
              </td>
              {showUser && (
                <td><div className="nowrap">{a.userName}</div><div className="muted tiny">{a.userEmail}</div></td>
              )}
              <td><span className={`sec ${a.section}`}>{SECTION_LABELS[a.section] || a.section}</span></td>
              <td><span className={`badge ${ACTION_TONE[a.action] || 'gray'}`}>{ACTION_LABELS[a.action] || a.action}</span></td>
              <td className="item">{a.item}</td>
              <td className="muted small">{describeDetails(a)}</td>
              <td className="msg">{a.message}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={showUser ? 7 : 6} className="empty-row"><Icon name="history" /> No activity matches.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="muted small">{total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}</span>
      <div className="row gap">
        <button className="btn ghost small" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevronLeft" size={16} /> Prev</button>
        <span className="small">Page {page} / {pages}</span>
        <button className="btn ghost small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <Icon name="chevronRight" size={16} /></button>
      </div>
    </div>
  );
}

export const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));
