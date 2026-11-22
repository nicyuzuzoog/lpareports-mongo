import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import ReportCardView from '../components/ReportCardView.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ErrorAlert, Loading } from '../components/Feedback.jsx';
import {
  classPosition,
  computePreviewTotal,
  levelLabel,
  percent,
  reportTypeLabel,
  termLabel
} from '../utils/format.js';

const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

export default function ReportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { show: toast } = useToast();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [gradesOpen, setGradesOpen] = useState(false);
  const [grades, setGrades] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [weights, setWeights] = useState({ coursework: 40, exam: 60 });

  const isManager = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);
  const canReject = ['SUPER_ADMIN', 'HEAD_TEACHER'].includes(user.role);
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

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/settings'), api.get('/subjects')])
      .then(([settingsData, subjectData]) => {
        if (!active) return;
        setWeights({
          coursework: Number(settingsData.settings?.courseworkWeight) || 40,
          exam: Number(settingsData.settings?.examWeight) || 60
        });
        setSubjects(subjectData.subjects || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  const caScoreFor = (mark) => {
    if (mark.caScore !== null && mark.caScore !== undefined && mark.caScore !== '') return mark.caScore;
    const total = numberOrNull(mark.total);
    const exam = numberOrNull(mark.examScore);
    if (total === null || exam === null || !weights.coursework) return '';
    const value =
      (total * (weights.coursework + weights.exam) - exam * weights.exam) / weights.coursework;
    if (!Number.isFinite(value)) return '';
    return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
  };

  const openGrades = () => {
    setGrades(
      (report.marks || []).map((mark) => ({
        subjectId:
          mark.subjectId ||
          subjects.find((item) => item.name === mark.subject)?.id ||
          '',
        subject: mark.subject,
        midtermScore: mark.midtermScore ?? '',
        caScore: caScoreFor(mark),
        examScore: mark.examScore ?? '',
        grade: mark.grade || '—'
      }))
    );
    setGradesOpen(true);
  };

  const saveGrades = async (event) => {
    event.preventDefault();
    const payloadMarks = grades.map((mark) => ({
      subjectId: mark.subjectId,
      midtermScore: numberOrNull(mark.midtermScore),
      caScore: numberOrNull(mark.caScore),
      examScore: numberOrNull(mark.examScore)
    }));
    if (payloadMarks.some((mark) => !mark.subjectId)) {
      toast('Some subjects could not be matched to the subject list.', 'danger');
      return;
    }
    setBusy('grades');
    try {
      await api.patch(`/reports/${id}/marks`, { marks: payloadMarks });
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

  const isAnnual = report.type === 'ANNUAL';
  const typeName = report.typeLabel || reportTypeLabel(report.type);
  const session = report.termLabel || termLabel(report.term);
  const average = isAnnual ? report.annual?.overallAverage : report.summary?.average;
  const position = isAnnual ? report.annual?.overallPosition : report.summary?.position;
  const outOf = isAnnual ? report.annual?.overallOutOf : report.summary?.outOf;
  const previewTotal = (mark) =>
    computePreviewTotal(mark.caScore, mark.examScore, weights.coursework, weights.exam);

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 report-actions">
        <div>
          <Link to="/reports" className="btn btn-sm btn-outline-brand">
            <i className="bi bi-arrow-left me-1" />
            Back to report cards
          </Link>
          <div className="mt-2">
            <h1 className="mb-0" style={{ fontSize: '1.35rem' }}>{report.student.name}</h1>
            <div className="text-muted-2" style={{ fontSize: '0.8rem' }}>
              {report.student.code} · {report.className} ({levelLabel(report.level)}) · {typeName}
              {isAnnual ? ` ${report.year}` : ` · ${session} ${report.year}`}
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
          {canEditGrades ? (
            <button type="button" className="btn btn-outline-brand" onClick={openGrades}>
              <i className="bi bi-table me-2" />
              Edit grades
            </button>
          ) : null}
          {report.status === 'DRAFT' ? (
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
          {canReject && report.status !== 'DRAFT' ? (
            <button
              type="button"
              className="btn btn-outline-brand"
              disabled={busy === 'reject'}
              onClick={() => {
                const reason = window.prompt('Reason for rejection (optional):');
                if (reason === null) return;
                if (!window.confirm('Reject this report and unlock it for marks entry?')) return;
                runAction(
                  'reject',
                  () => api.post(`/reports/${id}/reject`, { comment: reason || undefined }),
                  'Report rejected and returned to draft.'
                );
              }}
            >
              <i className="bi bi-arrow-counterclockwise me-2" />
              Reject
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
        <span className="term-pill"><i className="bi bi-file-earmark-text" /> {typeName} report</span>
        <span className="term-pill"><i className="bi bi-graph-up" /> Average {percent(average)}</span>
        {position ? (
          <span className="term-pill">
            <i className="bi bi-trophy" /> Position {classPosition(position, outOf)}
          </span>
        ) : null}
      </div>

      <div className="report-wrap">
        <ReportCardView report={report} />
      </div>

      <Modal
        show={gradesOpen}
        onClose={() => setGradesOpen(false)}
        title="Edit grades"
        subtitle="Mid-term scores are recorded but are not included in the weighted total."
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
                  <th style={{ width: 110 }}>Mid-term</th>
                  <th style={{ width: 100 }}>C/W</th>
                  <th style={{ width: 100 }}>Exam</th>
                  <th style={{ width: 80 }}>Total</th>
                  <th style={{ width: 70 }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((mark, index) => (
                  <tr key={mark.subjectId}>
                    <td className="fw-650">{mark.subject}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className="form-control form-control-sm score-input"
                        value={mark.midtermScore}
                        onChange={(event) =>
                          setGrades((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, midtermScore: event.target.value } : item))
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
                    <td className="total-cell">{previewTotal(mark) ?? '—'}</td>
                    <td className="fw-650">{mark.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      </Modal>
    </>
  );
}
