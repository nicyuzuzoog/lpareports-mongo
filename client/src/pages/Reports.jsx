import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState, ErrorAlert, Loading, Pagination } from '../components/Feedback.jsx';
import { REPORT_TYPES, TERMS, YEAR_OPTIONS, currentYear } from '../utils/constants.js';
import { classPosition, percent, reportTypeLabel, termLabel } from '../utils/format.js';

const MANAGERS = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'];

export default function Reports() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState({ reports: [], pagination: null });
  const [filters, setFilters] = useState({
    search: '',
    classId: '',
    type: '',
    term: '',
    year: currentYear,
    status: ''
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const [generateForm, setGenerateForm] = useState({
    classId: '',
    type: 'TERM',
    term: 'TERM3',
    year: currentYear,
    downloadAll: false
  });
  const [bulkForm, setBulkForm] = useState({
    classId: '',
    type: 'TERM',
    term: 'TERM3',
    year: currentYear,
    status: ''
  });

  const isManager = MANAGERS.includes(user.role);

  useEffect(() => {
    api
      .get('/classes')
      .then((res) => {
        setClasses(res.classes);
        if (res.classes.length) {
          setGenerateForm((prev) => ({ ...prev, classId: prev.classId || res.classes[0].id }));
          setBulkForm((prev) => ({ ...prev, classId: prev.classId || res.classes[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      year: String(filters.year)
    });
    if (filters.type) params.set('type', filters.type);
    if (filters.term) params.set('term', filters.term);
    if (filters.classId) params.set('classId', filters.classId);
    if (filters.status) params.set('status', filters.status);
    if (filters.search.trim()) params.set('search', filters.search.trim());

    api
      .get(`/reports?${params.toString()}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    const timer = window.setTimeout(load, filters.search ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  const setFilter = (field, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const runGenerate = async (event) => {
    event.preventDefault();
    setGenerating(true);
    try {
      const payload = {
        classId: generateForm.classId,
        term: generateForm.term,
        year: Number(generateForm.year),
        type: generateForm.type
      };
      const result = await api.post('/reports/generate', payload);
      toast(result.message);
      if (generateForm.downloadAll) {
        try {
          const filename = await download('/reports/bulk-pdf', 'class-reports.pdf', {
            method: 'POST',
            body: payload
          });
          toast(`Downloaded all class reports (${filename}).`);
        } catch (downloadError) {
          toast(downloadError.message, 'danger');
        }
      }
      setGenerateOpen(false);
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setGenerating(false);
    }
  };

  const downloadOne = async (report) => {
    setDownloading(report.id);
    try {
      await download(`/reports/${report.id}/pdf`, `${report.student.code}-${report.term}-${report.year}.pdf`);
      toast('Report card downloaded.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setDownloading(null);
    }
  };

  const downloadBulk = async (event) => {
    event.preventDefault();
    setDownloading('bulk');
    try {
      await download('/reports/bulk-pdf', 'class-reports.pdf', {
        method: 'POST',
        body: {
          classId: bulkForm.classId,
          type: bulkForm.type,
          term: bulkForm.term,
          year: Number(bulkForm.year),
          ...(bulkForm.status ? { status: bulkForm.status } : {})
        }
      });
      toast('Class report PDF downloaded.');
      setBulkOpen(false);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Report cards"
        subtitle="Generate, verify and download mid-term, term and annual reports."
      >
        <button type="button" className="btn btn-brand" onClick={() => setGenerateOpen(true)}>
          <i className="bi bi-file-earmark-plus me-2" />
          Generate reports
        </button>
        <button type="button" className="btn btn-outline-brand" onClick={() => setBulkOpen(true)}>
          <i className="bi bi-download me-2" />
          Download all class reports
        </button>
      </PageHeader>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input
                className="form-control"
                placeholder="Search student name or code…"
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
              />
            </div>
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
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Awaiting approval</option>
                <option value="APPROVED">Approved</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card-soft">
        {loading ? (
          <Loading label="Loading report cards…" />
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
                  <th>Grade</th>
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
                    <td>
                      {report.termLabel || termLabel(report.term)}
                      <span className="text-muted-2"> · {report.year}</span>
                    </td>
                    <td className="fw-650">{percent(report.average)}</td>
                    <td className="fw-650">{report.grade || '—'}</td>
                    <td className="fw-650">{classPosition(report.position, report.outOf)}</td>
                    <td><StatusBadge status={report.status} /></td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <Link to={`/reports/${report.id}`} className="btn btn-sm btn-outline-brand" title="Open report">
                          <i className="bi bi-eye" />
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-brand"
                          title="Download PDF"
                          onClick={() => downloadOne(report)}
                          disabled={downloading === report.id}
                        >
                          {downloading === report.id ? (
                            <span className="spinner-border spinner-border-sm" />
                          ) : (
                            <i className="bi bi-file-earmark-pdf" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-file-earmark-x"
            title="No report cards found"
            message="Adjust the filters or generate reports for a class."
            action={
              <button type="button" className="btn btn-brand btn-sm" onClick={() => setGenerateOpen(true)}>
                <i className="bi bi-file-earmark-plus me-1" /> Generate reports
              </button>
            }
          />
        )}
        {data.pagination && data.reports.length ? (
          <div className="px-3 pb-3">
            <Pagination pagination={data.pagination} onPage={setPage} />
          </div>
        ) : null}
      </div>

      <Modal
        show={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate report cards"
        subtitle="Creates a report card for every active student in the class and locks the marks. Existing reports are kept; only the Head Teacher or Super Admin can reject a generated report back to draft."
        footer={
          <>
            <button type="button" className="btn btn-outline-brand" onClick={() => setGenerateOpen(false)} disabled={generating}>
              Cancel
            </button>
            <button type="submit" form="generate-form" className="btn btn-brand" disabled={generating}>
              {generating ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-magic me-2" />}
              Generate
            </button>
          </>
        }
      >
        <form id="generate-form" onSubmit={runGenerate} className="row g-3">
          <div className="col-12">
            <label className="form-label">Class *</label>
            <select
              className="form-select"
              value={generateForm.classId}
              onChange={(event) => setGenerateForm((prev) => ({ ...prev, classId: event.target.value }))}
              required
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Report type *</label>
            <select
              className="form-select"
              value={generateForm.type}
              onChange={(event) => setGenerateForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Year *</label>
            <select
              className="form-select"
              value={generateForm.year}
              onChange={(event) => setGenerateForm((prev) => ({ ...prev, year: Number(event.target.value) }))}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="download-all-generated"
                checked={generateForm.downloadAll}
                onChange={(event) => setGenerateForm((prev) => ({ ...prev, downloadAll: event.target.checked }))}
              />
              <label className="form-check-label" htmlFor="download-all-generated">
                Download all class reports as one PDF after generating (one student per page)
              </label>
            </div>
          </div>
          {generateForm.type !== 'ANNUAL' ? (
            <div className="col-12">
              <label className="form-label">Term *</label>
              <select
                className="form-select"
                value={generateForm.term}
                onChange={(event) => setGenerateForm((prev) => ({ ...prev, term: event.target.value }))}
              >
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="col-12">
              <div className="alert alert-info mb-0">
                <i className="bi bi-info-circle me-1" />
                Annual reports summarise Term I, Term II and Term III in one take-home report.
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        show={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Download class report pack"
        subtitle="Downloads one PDF with all selected class reports, one student per page."
        footer={
          <>
            <button type="button" className="btn btn-outline-brand" onClick={() => setBulkOpen(false)} disabled={downloading === 'bulk'}>
              Cancel
            </button>
            <button type="submit" form="bulk-form" className="btn btn-brand" disabled={downloading === 'bulk'}>
              {downloading === 'bulk' ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-download me-2" />}
              Download PDF
            </button>
          </>
        }
      >
        <form id="bulk-form" onSubmit={downloadBulk} className="row g-3">
          <div className="col-12">
            <label className="form-label">Class *</label>
            <select
              className="form-select"
              value={bulkForm.classId}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, classId: event.target.value }))}
              required
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Report type *</label>
            <select
              className="form-select"
              value={bulkForm.type}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          {bulkForm.type !== 'ANNUAL' ? (
            <div className="col-6">
              <label className="form-label">Term *</label>
              <select
                className="form-select"
                value={bulkForm.term}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, term: event.target.value }))}
              >
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="col-6">
            <label className="form-label">Year *</label>
            <select
              className="form-select"
              value={bulkForm.year}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, year: Number(event.target.value) }))}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Include</label>
            <select
              className="form-select"
              value={bulkForm.status}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">All report cards</option>
              <option value="APPROVED">Approved only</option>
              <option value="SUBMITTED">Awaiting approval only</option>
              <option value="DRAFT">Draft only</option>
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}
