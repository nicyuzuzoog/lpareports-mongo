import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import ReportCardView from '../components/ReportCardView.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ErrorAlert, Loading } from '../components/Feedback.jsx';
import { classPosition, formatDateTime, gradeFromScale, levelLabel, termLabel } from '../utils/format.js';

export default function ReportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { show: toast } = useToast();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [gradesOpen, setGradesOpen] = useState(false);
  const [details, setDetails] = useState({});
  const [grades, setGrades] = useState([]);

  const isManager = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);
  const canDelete = user.role === 'SUPER_ADMIN' || user.canDelete;
  const canEditGrades = isManager;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/reports/${id}`);
      setReport(data.report);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await action();
      toast(successMessage);
      await load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const openDetails = () => {
    setDetails({
      teacherComment: report.comments?.teacher || '',
      dosComment: report.comments?.dos || '',
      headComment: report.comments?.headTeacher || ''
    });
    setDetailsOpen(true);
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    setBusy('details');
    try {
      await api.patch(`/reports/${id}`, {
        teacherComment: details.teacherComment || null,
        ...(isManager ? { dosComment: details.dosComment || null } : {}),
        ...(['SUPER_ADMIN', 'HEAD_TEACHER'].includes(user.role) ? { headComment: details.headComment || null } : {})
      });
      toast('Report details saved.');
      setDetailsOpen(false);
      await load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const openGrades = () => {
    setGrades(
      report.marks.map((mark) => ({
        subjectId: mark.subjectId,
        subject: mark.subject,
        caScore: mark.caScore ?? '',
        examScore: mark.examScore ?? '',
        competency: mark.competency || '',
        remark: mark.remark || ''
      }))
    );
    setGradesOpen(true);
  };

  const saveGrades = async (event) => {
    event.preventDefault();
    setBusy('grades');
    try {
      await api.patch(`/reports/${id}/marks`, {
        marks: grades.map((mark) => ({
          subjectId: mark.subjectId,
          caScore: mark.caScore === '' ? null : mark.caScore,
          examScore: mark.examScore === '' ? null : mark.examScore,
          competency: mark.competency || null,
          remark: mark.remark || null
        }))
      });
      toast('Grades updated.');
      setGradesOpen(false);
      await load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const removeReport = async () => {
    if (!window.confirm('Delete this report card permanently? This cannot be undone.')) return;
    setBusy('delete');
    try {
      await api.delete(`/reports/${id}`);
      toast('Report card deleted.');
      navigate('/reports', { replace: true });
    } catch (err) {
      toast(err.message, 'danger');
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    setBusy('download');
    try {
      await download(`/reports/${id}/pdf`, `${report.student.code}-${report.term}-${report.year}.pdf`);
      toast('PDF downloaded.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading label="Preparing report card…" />;
  if (error) return <ErrorAlert error={error} onRetry={load} />;
  if (!report) return null;

  const weights = report.weights || { coursework: 40, exam: 60 };
  const scale = report.gradingScale || [];

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 report-actions">
        <div>
          <Link to="/reports" className="btn btn-sm btn-outline-brand">
            <i className="bi bi-arrow-left me-1" />
            Back to report cards
          </Link>
          <div className="mt-2">
            <h1 className="mb-0" style={{ fontSize: '1.35rem' }}>{report.student.fullName}</h1>
            <div className="text-muted-2" style={{ fontSize: '0.8rem' }}>
              {report.student.code} · {report.className} ({levelLabel(report.level)}) · {termLabel(report.term)} {report.year}
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-brand" onClick={() => window.print()}>
            <i className="bi bi-printer me-2" />
            Print
          </button>
          <button type="button" className="btn btn-outline-brand" onClick={downloadPdf} disabled={busy === 'download'}>
            {busy === 'download' ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-file-earmark-pdf me-2" />}
            PDF
          </button>
          <button type="button" className="btn btn-outline-brand" onClick={openDetails}>
            <i className="bi bi-pencil-square me-2" />
            Edit details
          </button>
          {canEditGrades ? (
            <button type="button" className="btn btn-outline-brand" onClick={openGrades}>
              <i className="bi bi-table me-2" />
              Edit grades
            </button>
          ) : null}
          {report.status !== 'APPROVED' ? (
            <button
              type="button"
              className="btn btn-brand"
              disabled={busy === 'submit'}
              onClick={() => runAction('submit', () => api.post(`/reports/${id}/submit`), 'Report submitted for verification.')}
            >
              {busy === 'submit' ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-send me-2" />}
              Submit
            </button>
          ) : null}
          {isManager && report.status !== 'APPROVED' ? (
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy === 'approve'}
              onClick={() => runAction('approve', () => api.post(`/reports/${id}/approve`), 'Report approved.')}
            >
              {busy === 'approve' ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-patch-check me-2" />}
              Approve
            </button>
          ) : null}
          {isManager && report.status !== 'DRAFT' ? (
            <button
              type="button"
              className="btn btn-outline-brand"
              disabled={busy === 'reopen'}
              onClick={() => {
                const comment = window.prompt('Reason for returning this report to draft (optional):') ?? '';
                runAction(
                  'reopen',
                  () => api.post(`/reports/${id}/reopen`, { comment }),
                  'Report returned to draft.'
                );
              }}
            >
              <i className="bi bi-arrow-counterclockwise me-2" />
              Reopen
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="btn btn-soft-danger" onClick={removeReport} disabled={busy === 'delete'}>
              <i className="bi bi-trash me-2" />
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3 report-actions">
        <StatusBadge status={report.status} />
        {report.submitted ? (
          <span className="term-pill">
            <i className="bi bi-send" /> Submitted by {report.submitted.by} · {formatDateTime(report.submitted.at)}
          </span>
        ) : null}
        {report.approved ? (
          <span className="term-pill">
            <i className="bi bi-patch-check" /> Approved by {report.approved.by} · {formatDateTime(report.approved.at)}
          </span>
        ) : null}
        {report.summary?.position ? (
          <span className="term-pill">
            <i className="bi bi-trophy" /> Position{' '}
            {classPosition(report.summary.position, report.summary.outOf)}
          </span>
        ) : null}
      </div>

      {report.status !== 'APPROVED' ? (
        <div className="alert alert-info report-actions">
          <i className="bi bi-info-circle me-1" />
          This report is <strong>{report.status === 'SUBMITTED' ? 'awaiting approval' : 'still a draft'}</strong>.
          {report.status === 'SUBMITTED' ? ' The DOS or Head Teacher should verify the scores before approving.' : ' Record all scores, then submit it for verification.'}
        </div>
      ) : null}

      <div className="report-wrap">
        <ReportCardView report={report} />
      </div>

      <Modal
        show={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Edit report details"
        subtitle={`${report.student.fullName} · ${termLabel(report.term)} ${report.year}`}
        footer={
          <>
            <button type="button" className="btn btn-outline-brand" onClick={() => setDetailsOpen(false)} disabled={busy === 'details'}>
              Cancel
            </button>
            <button type="submit" form="details-form" className="btn btn-brand" disabled={busy === 'details'}>
              {busy === 'details' ? <span className="spinner-border spinner-border-sm me-2" /> : null}
              Save details
            </button>
          </>
        }
      >
        <form id="details-form" onSubmit={saveDetails}>
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Class teacher's comment</label>
              <textarea
                className="form-control"
                rows="2"
                value={details.teacherComment}
                onChange={(event) => setDetails((prev) => ({ ...prev, teacherComment: event.target.value }))}
              />
            </div>
            {isManager ? (
              <div className="col-12">
                <label className="form-label">Dean of Studies' comment</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={details.dosComment}
                  onChange={(event) => setDetails((prev) => ({ ...prev, dosComment: event.target.value }))}
                />
              </div>
            ) : null}
            {['SUPER_ADMIN', 'HEAD_TEACHER'].includes(user.role) ? (
              <div className="col-12">
                <label className="form-label">Head Teacher's comment</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={details.headComment}
                  onChange={(event) => setDetails((prev) => ({ ...prev, headComment: event.target.value }))}
                />
              </div>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        show={gradesOpen}
        onClose={() => setGradesOpen(false)}
        title="Edit grades"
        subtitle="Changes are recorded in the audit trail."
        size="xl"
        footer={
          <>
            <button type="button" className="btn btn-outline-brand" onClick={() => setGradesOpen(false)} disabled={busy === 'grades'}>
              Cancel
            </button>
            <button type="submit" form="grades-form" className="btn btn-brand" disabled={busy === 'grades'}>
              {busy === 'grades' ? <span className="spinner-border spinner-border-sm me-2" /> : null}
              Save grades
            </button>
          </>
        }
      >
        <form id="grades-form" onSubmit={saveGrades}>
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th style={{ width: 100 }}>C/W</th>
                  <th style={{ width: 100 }}>Exam</th>
                  <th style={{ width: 80 }}>Total</th>
                  <th style={{ width: 70 }}>Grade</th>
                  {report.level !== 'UPPER_PRIMARY' ? <th style={{ width: 180 }}>Competency</th> : null}
                </tr>
              </thead>
              <tbody>
                {grades.map((mark, index) => {
                  const ca = mark.caScore === '' ? null : Number(mark.caScore);
                  const exam = mark.examScore === '' ? null : Number(mark.examScore);
                  const total =
                    ca === null && exam === null
                      ? null
                      : Math.round(
                          (((ca ?? 0) * weights.coursework + (exam ?? 0) * weights.exam) /
                            (weights.coursework + weights.exam || 100)) *
                            10
                        ) / 10;
                  return (
                    <tr key={mark.subjectId}>
                      <td className="fw-650">{mark.subject}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="form-control form-control-sm score-input"
                          value={mark.caScore}
                          onChange={(event) =>
                            setGrades((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, caScore: event.target.value } : item))
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="form-control form-control-sm score-input"
                          value={mark.examScore}
                          onChange={(event) =>
                            setGrades((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, examScore: event.target.value } : item))
                            )
                          }
                        />
                      </td>
                      <td className="total-cell">{total ?? '—'}</td>
                      <td className="fw-650">{gradeFromScale(total, scale)}</td>
                      {report.level !== 'UPPER_PRIMARY' ? (
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={mark.competency}
                            placeholder="Auto from score"
                            onChange={(event) =>
                              setGrades((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, competency: event.target.value } : item))
                              )
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      </Modal>
    </>
  );
}
