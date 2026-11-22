import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { TERMS, YEAR_OPTIONS, currentYear } from '../utils/constants.js';
import { computePreviewTotal, gradeFromScale, levelLabel } from '../utils/format.js';

export default function Assessments() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filters, setFilters] = useState({
    classId: '',
    term: 'TERM3',
    year: currentYear,
    subjectId: ''
  });
  const [subjects, setSubjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [entries, setEntries] = useState({});
  const [schoolClass, setSchoolClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/classes'), api.get('/settings')])
      .then(([classData, settingData]) => {
        setClasses(classData.classes);
        setSettings(settingData.settings);
        if (classData.classes.length) {
          setFilters((prev) => ({ ...prev, classId: prev.classId || classData.classes[0].id }));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  const subjectsForLevel = useMemo(() => {
    if (!schoolClass) return [];
    return subjects;
  }, [subjects, schoolClass]);

  const loadGrid = useCallback(async () => {
    if (!filters.classId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        classId: filters.classId,
        term: filters.term,
        year: String(filters.year)
      });
      if (filters.subjectId) params.set('subjectId', filters.subjectId);

      const data = await api.get(`/assessments?${params.toString()}`);
      setSchoolClass(data.class);
      setSubjects(data.subjects);
      setRows(data.students);

      if (!data.subjects.find((subject) => subject.id === filters.subjectId)) {
        setFilters((prev) => ({ ...prev, subjectId: data.subjects[0]?.id || '' }));
      }

      const nextEntries = {};
      data.students.forEach((student) => {
        nextEntries[student.id] = {
          caScore: student.mark?.caScore ?? '',
          examScore: student.mark?.examScore ?? '',
          competency: student.mark?.competency || '',
          remark: student.mark?.remark || ''
        };
      });
      setEntries(nextEntries);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters.classId, filters.term, filters.year, filters.subjectId]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const setFilter = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'classId' ? { subjectId: '' } : {})
    }));
  };

  const updateEntry = (studentId, field, value) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value }
    }));
  };

  const level = schoolClass?.level || 'LOWER_PRIMARY';
  const scale = settings?.gradingScales?.[level] || [];
  const caWeight = settings?.courseworkWeight ?? 40;
  const examWeight = settings?.examWeight ?? 60;

  const preview = useMemo(() => {
    return rows.map((student) => {
      const entry = entries[student.id] || {};
      const total = computePreviewTotal(entry.caScore, entry.examScore, caWeight, examWeight);
      return {
        studentId: student.id,
        total,
        grade: gradeFromScale(total, scale),
        locked: Boolean(student.reportStatus) && student.reportStatus !== 'DRAFT' && user.role === 'TEACHER'
      };
    });
  }, [rows, entries, caWeight, examWeight, scale, user.role]);

  const enteredCount = preview.filter((item) => item.total !== null).length;
  const classAverage = useMemo(() => {
    const values = preview.map((item) => item.total).filter((value) => value !== null);
    if (!values.length) return null;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  }, [preview]);

  const canSave = Boolean(filters.classId && filters.subjectId && rows.length);
  const hasLockedRows = preview.some((item) => item.locked);

  const save = async () => {
    const records = rows.map((student) => {
      const entry = entries[student.id] || {};
      const locked = Boolean(student.reportStatus) && student.reportStatus !== 'DRAFT' && user.role === 'TEACHER';
      return {
        studentId: student.id,
        caScore: locked ? student.mark?.caScore ?? null : entry.caScore === '' ? null : entry.caScore,
        midtermScore: student.mark?.midtermScore ?? null,
        examScore: locked ? student.mark?.examScore ?? null : entry.examScore === '' ? null : entry.examScore,
        competency: locked ? student.mark?.competency : entry.competency || null,
        remark: locked ? student.mark?.remark : entry.remark || null
      };
    });

    setSaving(true);
    try {
      const result = await api.post('/assessments/bulk', {
        classId: filters.classId,
        subjectId: filters.subjectId,
        term: filters.term,
        year: filters.year,
        records
      });
      toast(result.message || 'Assessments saved.');
      loadGrid();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const selectedSubject = subjects.find((subject) => subject.id === filters.subjectId);

  return (
    <>
      <PageHeader
        title="Assessments"
        subtitle="Record coursework and examination scores. Totals and grades are calculated automatically."
      >
        <Link to="/reports" className="btn btn-outline-brand">
          <i className="bi bi-file-earmark-text me-2" />
          Report cards
        </Link>
        <button type="button" className="btn btn-brand" onClick={save} disabled={!canSave || saving}>
          {saving ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-cloud-check me-2" />}
          Save all scores
        </button>
      </PageHeader>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="form-group">
              <label className="form-label">Class</label>
              <select
                className="form-select"
                value={filters.classId}
                onChange={(event) => setFilter('classId', event.target.value)}
              >
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — {levelLabel(item.level)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Term</label>
              <select
                className="form-select"
                value={filters.term}
                onChange={(event) => setFilter('term', event.target.value)}
              >
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Academic year</label>
              <select
                className="form-select"
                value={filters.year}
                onChange={(event) => setFilter('year', Number(event.target.value))}
              >
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 210 }}>
              <label className="form-label">Subject</label>
              <select
                className="form-select"
                value={filters.subjectId}
                onChange={(event) => setFilter('subjectId', event.target.value)}
                disabled={!subjectsForLevel.length}
              >
                {subjectsForLevel.length ? (
                  subjectsForLevel.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))
                ) : (
                  <option value="">No subjects assigned</option>
                )}
              </select>
            </div>
            <div className="ms-md-auto text-muted-2" style={{ fontSize: '0.74rem' }}>
              <i className="bi bi-calculator me-1" />
              Total = {caWeight}% coursework + {examWeight}% exam
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <span className="term-pill active">
          <i className="bi bi-people" /> {rows.length} students
        </span>
        <span className="term-pill">
          <i className="bi bi-check2-circle" /> {enteredCount} scores entered
        </span>
        <span className="term-pill">
          <i className="bi bi-graph-up" /> Class average: {classAverage === null ? '—' : `${classAverage}%`}
        </span>
        {hasLockedRows ? (
          <span className="term-pill" style={{ color: 'var(--warning)' }}>
            <i className="bi bi-lock" /> Some approved reports are locked
          </span>
        ) : null}
      </div>

      <div className="card-soft">
        {loading ? (
          <Loading label="Loading assessment sheet…" />
        ) : error ? (
          <div className="p-3"><ErrorAlert error={error} onRetry={loadGrid} /></div>
        ) : !classes.length ? (
          <EmptyState icon="bi-diagram-3" title="No classes available" message="Ask the Super Admin to set up classes first." />
        ) : !subjectsForLevel.length ? (
          <EmptyState
            icon="bi-book"
            title="No subjects available"
            message="You have no subjects assigned for this class. Contact the Super Admin."
          />
        ) : rows.length ? (
          <div className="table-responsive">
            <table className="table-clean assessment-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Student</th>
                  <th style={{ width: 100 }}>Coursework</th>
                  <th style={{ width: 100 }}>Exam</th>
                  <th style={{ width: 80 }}>Total</th>
                  <th style={{ width: 70 }}>Grade</th>
                  {level !== 'UPPER_PRIMARY' ? <th style={{ width: 210 }}>Competency</th> : null}
                  <th style={{ width: 120 }}>Report status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student, index) => {
                  const entry = entries[student.id] || {};
                  const item = preview.find((row) => row.studentId === student.id);
                  const locked = item?.locked;
                  return (
                    <tr key={student.id}>
                      <td className="text-muted-2">{index + 1}</td>
                      <td>
                        <div className="fw-650">{student.fullName}</div>
                        <div className="mono">{student.code}</div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          className="form-control form-control-sm score-input"
                          value={entry.caScore ?? ''}
                          onChange={(event) => updateEntry(student.id, 'caScore', event.target.value)}
                          disabled={locked}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          className="form-control form-control-sm score-input"
                          value={entry.examScore ?? ''}
                          onChange={(event) => updateEntry(student.id, 'examScore', event.target.value)}
                          disabled={locked}
                          placeholder="—"
                        />
                      </td>
                      <td className="total-cell">{item?.total ?? '—'}</td>
                      <td>
                        <span className="fw-650">{item?.grade || '—'}</span>
                      </td>
                      {level !== 'UPPER_PRIMARY' ? (
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={entry.competency || ''}
                            onChange={(event) => updateEntry(student.id, 'competency', event.target.value)}
                            placeholder="Auto from score"
                            disabled={locked}
                          />
                        </td>
                      ) : null}
                      <td>
                        {student.reportStatus ? (
                          <StatusBadge status={student.reportStatus} />
                        ) : (
                          <span className="badge badge-soft-muted">Not generated</span>
                        )}
                        {locked ? <i className="bi bi-lock ms-1 text-muted-2" title="Locked until the Head Teacher or Super Admin rejects the report" /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-people"
            title="No active students in this class"
            message="Register students before recording assessments."
            action={<Link to="/students" className="btn btn-brand btn-sm">Register students</Link>}
          />
        )}

        {rows.length ? (
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-top">
            <div className="text-muted-2" style={{ fontSize: '0.76rem' }}>
              <i className="bi bi-info-circle me-1" />
              {selectedSubject ? `${selectedSubject.name} · ${schoolClass?.name} · ${filters.year}` : 'Select a subject'}
            </div>
            <button type="button" className="btn btn-brand" onClick={save} disabled={!canSave || saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-cloud-check me-2" />}
              Save all scores
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
