import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { LEVELS, TERMS, YEAR_OPTIONS, currentYear } from '../utils/constants.js';
import { levelLabel, percent, termLabel } from '../utils/format.js';

export default function Analytics() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState('TERM3');
  const [criteria, setCriteria] = useState({ threshold: 40, minSubjects: 2 });
  const [applied, setApplied] = useState({ threshold: 40, minSubjects: 2 });
  const [overview, setOverview] = useState(null);
  const [progression, setProgression] = useState(null);
  const [low, setLow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lowLoading, setLowLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const availableLevels = LEVELS.filter((item) => user.role !== 'DOS' || item.value !== 'NURSERY');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const levelQuery = level ? `&level=${level}` : '';
    Promise.all([
      api.get(`/analytics/overview?year=${year}`),
      api.get(`/analytics/progression?year=${year}${levelQuery}`)
    ])
      .then(([overviewData, progressionData]) => {
        if (!active) return;
        setOverview(overviewData);
        setProgression(progressionData);
        setCriteria((prev) => ({
          threshold: overviewData.criteria.lowPerformanceThreshold,
          minSubjects: overviewData.criteria.lowPerformanceMinSubjects
        }));
        setApplied((prev) => ({
          threshold: overviewData.criteria.lowPerformanceThreshold,
          minSubjects: overviewData.criteria.lowPerformanceMinSubjects
        }));
      })
      .catch((err) => active && setError(err))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [year, level]);

  useEffect(() => {
    let active = true;
    setLowLoading(true);
    const params = new URLSearchParams({
      year: String(year),
      term,
      threshold: String(applied.threshold),
      minSubjects: String(applied.minSubjects)
    });
    if (level) params.set('level', level);

    api
      .get(`/analytics/low-performers?${params.toString()}`)
      .then((data) => {
        if (active) setLow(data);
      })
      .catch((err) => {
        if (active) toast(err.message, 'danger');
      })
      .finally(() => active && setLowLoading(false));

    return () => {
      active = false;
    };
  }, [year, term, level, applied, toast]);

  const applyCriteria = async () => {
    setSaving(true);
    try {
      await api.patch('/settings/criteria', {
        lowPerformanceThreshold: Number(criteria.threshold),
        lowPerformanceMinSubjects: Number(criteria.minSubjects)
      });
      setApplied({
        threshold: Number(criteria.threshold),
        minSubjects: Number(criteria.minSubjects)
      });
      toast('Performance criteria updated.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label="Analysing performance…" />;
  if (error) return <ErrorAlert error={error} />;
  if (!overview) return null;

  const totals = overview.totals;

  return (
    <>
      <PageHeader
        title="Performance analytics"
        subtitle={
          user.role === 'DOS'
            ? 'Class progression and low-performance analysis for the Primary section.'
            : 'Class progression, subject performance and low-performance analysis.'
        }
      >
        <div className="d-flex gap-2">
          <select className="form-select" style={{ width: 110 }} value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {YEAR_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select className="form-select" style={{ width: 170 }} value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">All sections</option>
            {availableLevels.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </PageHeader>

      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-graph-up" label="School average" value={percent(totals.average)} note={`${totals.reports} reports`} tone="green" />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-people" label="Students assessed" value={totals.students} note={`${totals.classes} classes`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-hourglass-split" label="Awaiting approval" value={totals.pending} note={`${totals.approved} approved`} tone="amber" />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard
            icon="bi-exclamation-triangle"
            label="Low performers"
            value={low?.lowPerformers?.length ?? '—'}
            note={`Below ${applied.threshold}% average`}
            tone="red"
          />
        </div>
      </div>

      <div className="card-soft mb-4">
        <div className="card-header">
          <span><i className="bi bi-diagram-3 me-2 text-muted-2" />Class progression — {year}</span>
          <span className="text-muted-2 fw-normal" style={{ fontSize: '0.72rem' }}>Average and pass rate per term</span>
        </div>
        {progression?.progression?.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  <th>Term I</th>
                  <th>Term II</th>
                  <th>Term III</th>
                  <th>Overall</th>
                  <th className="text-end">Detail</th>
                </tr>
              </thead>
              <tbody>
                {progression.progression.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/analytics/class/${item.id}?year=${year}`} className="fw-650">{item.name}</Link>
                      <div className="text-muted-2" style={{ fontSize: '0.7rem' }}>{levelLabel(item.level)}</div>
                    </td>
                    <td>{item.students}</td>
                    {['TERM1', 'TERM2', 'TERM3'].map((termKey) => {
                      const value = item.terms[termKey];
                      return (
                        <td key={termKey}>
                          <div className="fw-650">{percent(value.average)}</div>
                          <div className="text-muted-2" style={{ fontSize: '0.68rem' }}>
                            {value.passRate === null ? 'No data' : `${value.passRate}% pass · ${value.assessed} assessed`}
                          </div>
                        </td>
                      );
                    })}
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="progress progress-thin flex-grow-1" style={{ minWidth: 70 }}>
                          <div className="progress-bar" style={{ width: `${item.overallAverage || 0}%` }} />
                        </div>
                        <span className="fw-650" style={{ fontSize: '0.8rem' }}>{percent(item.overallAverage)}</span>
                      </div>
                    </td>
                    <td className="text-end">
                      <Link to={`/analytics/class/${item.id}?year=${year}`} className="btn btn-sm btn-outline-brand">
                        <i className="bi bi-arrow-right" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="bi-graph-up" title="No progression data" message="Generate report cards and record assessments to see class progression." />
        )}
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card-soft h-100">
            <div className="card-header">
              <span><i className="bi bi-exclamation-triangle me-2 text-muted-2" />Students needing support</span>
              <div className="d-flex gap-2 align-items-center">
                <select className="form-select form-select-sm" style={{ width: 105 }} value={term} onChange={(event) => setTerm(event.target.value)}>
                  {TERMS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="card-body py-2 border-bottom">
              <div className="d-flex flex-wrap align-items-end gap-2">
                <div>
                  <label className="form-label mb-1">Low-performance threshold (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="form-control form-control-sm"
                    style={{ width: 110 }}
                    value={criteria.threshold}
                    onChange={(event) => setCriteria((prev) => ({ ...prev, threshold: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label mb-1">Min. subjects below</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    className="form-control form-control-sm"
                    style={{ width: 100 }}
                    value={criteria.minSubjects}
                    onChange={(event) => setCriteria((prev) => ({ ...prev, minSubjects: event.target.value }))}
                  />
                </div>
                <button type="button" className="btn btn-sm btn-brand" onClick={applyCriteria} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-check2 me-1" />}
                  Apply criteria
                </button>
                <div className="text-muted-2 ms-auto" style={{ fontSize: '0.7rem', maxWidth: 230 }}>
                  A student is flagged when the average is below the threshold or at least the minimum number of subjects fall below it.
                </div>
              </div>
            </div>
            {lowLoading ? (
              <Loading label="Checking performance…" />
            ) : low?.lowPerformers?.length ? (
              <div className="table-responsive">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Average</th>
                      <th>Below threshold</th>
                      <th>Weakest subjects</th>
                      <th className="text-end">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {low.lowPerformers.map((student) => (
                      <tr key={student.reportId}>
                        <td>
                          <div className="fw-650">{student.name}</div>
                          <div className="mono">{student.code}</div>
                        </td>
                        <td>{student.className}</td>
                        <td>
                          <span className={`badge ${student.average !== null && student.average < applied.threshold ? 'badge-soft-danger' : 'badge-soft-warning'}`}>
                            {percent(student.average)}
                          </span>
                        </td>
                        <td>{student.subjectsBelow}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {student.weakestSubjects.length ? (
                              student.weakestSubjects.map((subject) => (
                                <span key={subject.subject} className="badge badge-soft-muted">
                                  {subject.subject}: {subject.total}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-2">—</span>
                            )}
                          </div>
                        </td>
                        <td className="text-end">
                          <Link to={`/reports/${student.reportId}`} className="btn btn-sm btn-outline-brand">
                            <i className="bi bi-eye" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="bi-emoji-smile"
                title="No students flagged"
                message={`No ${termLabel(term)} results fall below the current criteria.`}
              />
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card-soft h-100">
            <div className="card-header"><span>Grade distribution — {termLabel(term)}</span></div>
            <div className="card-body">
              {!low ? (
                <Loading />
              ) : (
                <>
                  <div className="bar-chart">
                    {[
                      { label: 'Below 40%', value: low.distribution.below40, tone: 'red' },
                      { label: '40% – 49%', value: low.distribution.between40and49, tone: 'amber' },
                      { label: '50% – 69%', value: low.distribution.between50and69, tone: '' },
                      { label: '70% and above', value: low.distribution.above70, tone: 'green' }
                    ].map((item) => {
                      const total = low.totalAssessed || 1;
                      const share = Math.round((item.value / total) * 100);
                      return (
                        <div className="bar-row" key={item.label} style={{ gridTemplateColumns: '110px 1fr 58px' }}>
                          <span className="text-muted-2">{item.label}</span>
                          <div className="bar-track">
                            <div className={`bar-fill ${item.tone}`} style={{ width: `${Math.max(2, share)}%` }} />
                          </div>
                          <span className="text-end fw-650">{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-top">
                    <div className="section-title mb-2">Sections</div>
                    {overview.byLevel.map((item) => (
                      <div className="d-flex justify-content-between align-items-center py-2 border-bottom" key={item.level}>
                        <div>
                          <div className="fw-650" style={{ fontSize: '0.82rem' }}>{levelLabel(item.level)}</div>
                          <div className="text-muted-2" style={{ fontSize: '0.68rem' }}>{item.students} students · {item.reports} reports</div>
                        </div>
                        <span className="fw-650">{percent(item.average)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
