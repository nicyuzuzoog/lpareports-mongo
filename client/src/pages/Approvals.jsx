import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState, ErrorAlert, Loading, Pagination } from '../components/Feedback.jsx';
import { REPORT_TYPES, TERMS, YEAR_OPTIONS, currentYear } from '../utils/constants.js';
import { classPosition, percent, reportTypeLabel, termLabel } from '../utils/format.js';

export default function Approvals() {
  const { show: toast } = useToast();
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState({ reports: [], pagination: null });
  const [filters, setFilters] = useState({
    classId: '',
    type: '',
    term: '',
    year: currentYear,
    status: 'SUBMITTED'
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.get('/classes').then((res) => setClasses(res.classes)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      year: String(filters.year),
      status: filters.status
    });
    if (filters.classId) params.set('classId', filters.classId);
    if (filters.type) params.set('type', filters.type);
    if (filters.term) params.set('term', filters.term);

    api
      .get(`/reports?${params.toString()}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (field, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const approve = async (report) => {
    if (!window.confirm(`Approve ${report.student.fullName}'s ${termLabel(report.term)} report?`)) return;
    setBusy(report.id);
    try {
      await api.post(`/reports/${report.id}/approve`);
      toast('Report approved.');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Report approvals"
        subtitle="Verify submitted scores and approve reports for issue. Approved reports can still be reopened by the DOS or Head Teacher."
      >
        <Link to="/reports" className="btn btn-outline-brand">
          <i className="bi bi-file-earmark-text me-2" />
          All report cards
        </Link>
      </PageHeader>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="form-group">
              <label className="form-label">Class</label>
              <select className="form-select" value={filters.classId} onChange={(event) => setFilter('classId', event.target.value)}>
                <option value="">All classes</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={filters.type} onChange={(event) => setFilter('type', event.target.value)}>
                <option value="">All types</option>
                {REPORT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Term</label>
              <select className="form-select" value={filters.term} onChange={(event) => setFilter('term', event.target.value)}>
                <option value="">All terms</option>
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Year</label>
              <select className="form-select" value={filters.year} onChange={(event) => setFilter('year', Number(event.target.value))}>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
                <option value="SUBMITTED">Awaiting approval</option>
                <option value="APPROVED">Approved</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card-soft">
        <div className="card-header">
          <span>
            <i className="bi bi-patch-check me-2 text-muted-2" />
            {filters.status === 'SUBMITTED' ? 'Awaiting verification' : filters.status === 'APPROVED' ? 'Approved reports' : 'Draft reports'}
          </span>
          <span className="badge badge-soft-info">{data.pagination?.total ?? 0} reports</span>
        </div>

        {loading ? (
          <Loading label="Loading approvals…" />
        ) : error ? (
          <div className="p-3"><ErrorAlert error={error} onRetry={load} /></div>
        ) : data.reports.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Term</th>
                  <th>Average</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="fw-650">{report.student.fullName}</Link>
                      <div className="mono">{report.student.code}</div>
                    </td>
                    <td>{report.className}</td>
                    <td>{report.typeLabel || reportTypeLabel(report.type)}</td>
                    <td>{report.termLabel || termLabel(report.term)} · {report.year}</td>
                    <td className="fw-650">{percent(report.average)}</td>
                    <td className="fw-650">{classPosition(report.position, report.outOf)}</td>
                    <td><StatusBadge status={report.status} /></td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <Link to={`/reports/${report.id}`} className="btn btn-sm btn-outline-brand">
                          <i className="bi bi-eye" />
                        </Link>
                        {report.status !== 'APPROVED' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-accent"
                            onClick={() => approve(report)}
                            disabled={busy === report.id}
                          >
                            {busy === report.id ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <>
                                <i className="bi bi-patch-check me-1" />
                                Approve
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-patch-check"
            title={filters.status === 'SUBMITTED' ? 'No reports awaiting approval' : 'No reports found'}
            message={
              filters.status === 'SUBMITTED'
                ? 'Submitted reports will appear here for verification.'
                : 'Adjust the filters to see other reports.'
            }
          />
        )}

        {data.pagination && data.reports.length ? (
          <div className="px-3 pb-3">
            <Pagination pagination={data.pagination} onPage={setPage} />
          </div>
        ) : null}
      </div>
    </>
  );
}
