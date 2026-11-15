import { useCallback, useEffect, useState } from 'react';
import { api, download } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorAlert, Loading, Pagination } from '../components/Feedback.jsx';
import { formatDateTime, initials, roleLabel } from '../utils/format.js';

const ACTIONS = [
  'LOGIN',
  'CREATE',
  'UPDATE',
  'DELETE',
  'SUBMIT',
  'APPROVE',
  'REOPEN',
  'GENERATE',
  'DOWNLOAD',
  'PERMISSION',
  'SEED'
];

const ENTITIES = [
  'User',
  'Student',
  'Class',
  'Subject',
  'ReportCard',
  'Mark',
  'Assessment',
  'Setting',
  'System'
];

const ACTION_TONE = {
  DELETE: 'badge-soft-danger',
  APPROVE: 'badge-soft-success',
  SUBMIT: 'badge-soft-warning',
  REOPEN: 'badge-soft-warning',
  LOGIN: 'badge-soft-info',
  PERMISSION: 'badge-soft-danger',
  SEED: 'badge-soft-muted',
  DOWNLOAD: 'badge-soft-info'
};

const pretty = (value) => {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

export default function Audit() {
  const { show: toast } = useToast();
  const [data, setData] = useState({ logs: [], pagination: null });
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    entity: '',
    from: '',
    to: ''
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  const queryString = useCallback(
    (includePage = true) => {
      const params = new URLSearchParams();
      if (includePage) {
        params.set('page', String(page));
        params.set('pageSize', '30');
      }
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.action) params.set('action', filters.action);
      if (filters.entity) params.set('entity', filters.entity);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      return params.toString();
    },
    [page, filters]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get(`/audit?${queryString()}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(load, filters.search ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  const setFilter = (field, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ search: '', action: '', entity: '', from: '', to: '' });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download(`/audit/export?${queryString(false)}`, 'lpacamis-audit.csv');
      toast('Audit trail exported.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setExporting(false);
    }
  };

  const activeFilters =
    Boolean(filters.search || filters.action || filters.entity || filters.from || filters.to);

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="An append-only record of every data change: who made it, when, and what changed."
      >
        <button
          type="button"
          className="btn btn-outline-brand"
          onClick={exportCsv}
          disabled={exporting}
        >
          {exporting ? (
            <span className="spinner-border spinner-border-sm me-2" />
          ) : (
            <i className="bi bi-filetype-csv me-2" />
          )}
          Export CSV
        </button>
      </PageHeader>

      <div className="alert alert-info">
        <i className="bi bi-shield-lock me-1" />
        Audit entries cannot be edited or deleted. Logins, record changes, approvals, downloads and seeding are
        all recorded.
      </div>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input
                className="form-control"
                placeholder="Search user, description, IP…"
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Action</label>
              <select
                className="form-select"
                value={filters.action}
                onChange={(event) => setFilter('action', event.target.value)}
              >
                <option value="">All actions</option>
                {ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Entity</label>
              <select
                className="form-select"
                value={filters.entity}
                onChange={(event) => setFilter('entity', event.target.value)}
              >
                <option value="">All entities</option>
                {ENTITIES.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">From</label>
              <input
                type="date"
                className="form-control"
                value={filters.from}
                onChange={(event) => setFilter('from', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input
                type="date"
                className="form-control"
                value={filters.to}
                onChange={(event) => setFilter('to', event.target.value)}
              />
            </div>
            {activeFilters ? (
              <button type="button" className="btn btn-outline-brand" onClick={clearFilters}>
                <i className="bi bi-x-circle me-1" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card-soft">
        <div className="card-header">
          <span>
            <i className="bi bi-clock-history me-2 text-muted-2" />
            Activity log
          </span>
          <span className="badge badge-soft-info">{data.pagination?.total ?? 0} entries</span>
        </div>

        {loading ? (
          <Loading label="Loading audit trail…" />
        ) : error ? (
          <div className="p-3">
            <ErrorAlert error={error} onRetry={load} />
          </div>
        ) : data.logs.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>IP</th>
                  <th className="text-end">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-muted-2" style={{ fontSize: '0.76rem' }}>
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="avatar sm">{initials(log.userName)}</span>
                        <div>
                          <div className="fw-650" style={{ fontSize: '0.8rem' }}>
                            {log.userName}
                          </div>
                          <div className="text-muted-2" style={{ fontSize: '0.68rem' }}>
                            {roleLabel(log.userRole)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${ACTION_TONE[log.action] || 'badge-soft-muted'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{log.entity}</div>
                      {log.entityId ? (
                        <div
                          className="text-muted-2"
                          style={{ fontSize: '0.66rem', wordBreak: 'break-all' }}
                        >
                          {log.entityId.slice(0, 22)}
                          {log.entityId.length > 22 ? '…' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 340 }}>
                      <div style={{ fontSize: '0.8rem' }}>{log.description || '—'}</div>
                    </td>
                    <td className="text-muted-2" style={{ fontSize: '0.72rem' }}>
                      {log.ip || '—'}
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-brand"
                        onClick={() => setSelected(log)}
                      >
                        <i className="bi bi-code-square" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-shield-check"
            title="No audit entries found"
            message={activeFilters ? 'Try widening the filters.' : 'Activity will appear here as users work in the system.'}
          />
        )}

        {data.pagination && data.logs.length ? (
          <div className="px-3 pb-3">
            <Pagination pagination={data.pagination} onPage={setPage} />
          </div>
        ) : null}
      </div>

      <Modal
        show={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Audit entry"
        subtitle={selected ? `${selected.action} · ${selected.entity} · ${formatDateTime(selected.createdAt)}` : ''}
        size="lg"
        footer={
          <button type="button" className="btn btn-outline-brand" onClick={() => setSelected(null)}>
            Close
          </button>
        }
      >
        {selected ? (
          <>
            <dl className="row mb-3" style={{ fontSize: '0.82rem' }}>
              <dt className="col-sm-3 text-muted-2 fw-normal">User</dt>
              <dd className="col-sm-9 fw-650">
                {selected.userName} · {roleLabel(selected.userRole)}
              </dd>
              <dt className="col-sm-3 text-muted-2 fw-normal">Description</dt>
              <dd className="col-sm-9">{selected.description || '—'}</dd>
              <dt className="col-sm-3 text-muted-2 fw-normal">Entity ID</dt>
              <dd className="col-sm-9 mono" style={{ wordBreak: 'break-all' }}>
                {selected.entityId || '—'}
              </dd>
              <dt className="col-sm-3 text-muted-2 fw-normal">IP address</dt>
              <dd className="col-sm-9">{selected.ip || '—'}</dd>
              <dt className="col-sm-3 text-muted-2 fw-normal">User agent</dt>
              <dd className="col-sm-9" style={{ fontSize: '0.72rem', wordBreak: 'break-word' }}>
                {selected.userAgent || '—'}
              </dd>
            </dl>

            <div className="section-title">Before</div>
            <pre className="audit-details mb-3">{pretty(selected.before)}</pre>
            <div className="section-title">After</div>
            <pre className="audit-details mb-0">{pretty(selected.after)}</pre>
          </>
        ) : null}
      </Modal>
    </>
  );
}
