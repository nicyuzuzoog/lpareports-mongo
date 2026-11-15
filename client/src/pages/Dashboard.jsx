import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ErrorAlert, Loading, EmptyState } from '../components/Feedback.jsx';
import { formatDateTime, levelLabel, percent, roleLabel, termLabel } from '../utils/format.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

  const load = () => {
    setBusy(true);
    setError(null);
    api
      .get('/dashboard')
      .then(setData)
      .catch(setError)
      .finally(() => setBusy(false));
  };

  useEffect(load, []);

  if (busy) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorAlert error={error} onRetry={load} />;
  if (!data) return null;

  const { totals, byLevel, termAverages, recentReports, teacherClasses, mySubjects, recentAudit } = data;
  const isManager = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${roleLabel(user.role)} workspace · Academic year ${data.year}`}
      >
        <Link to="/assessments" className="btn btn-brand">
          <i className="bi bi-clipboard2-check me-2" />
          Record assessments
        </Link>
        {isManager ? (
          <Link to="/reports" className="btn btn-outline-brand">
            <i className="bi bi-file-earmark-text me-2" />
            Report cards
          </Link>
        ) : null}
      </PageHeader>

      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-people-fill" label="Active students" value={totals.students} note={`${totals.classes} classes`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-file-earmark-text-fill" label="Report cards" value={totals.reports} note={`Year ${data.year}`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard
            icon="bi-hourglass-split"
            label="Awaiting approval"
            value={totals.pending}
            note={totals.approved ? `${totals.approved} approved` : 'No approvals yet'}
            tone="amber"
          />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard
            icon="bi-graph-up"
            label="School average"
            value={percent(totals.average)}
            note={`Pass mark ${data.criteria.passMark}%`}
            tone="green"
          />
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-7">
          <div className="card-soft h-100">
            <div className="card-header">
              <span><i className="bi bi-bar-chart-fill me-2 text-muted-2" />Average by term</span>
              <span className="text-muted-2 fw-normal" style={{ fontSize: '0.72rem' }}>Out of 100%</span>
            </div>
            <div className="card-body">
              <div className="bar-chart">
                {termAverages.map((term) => (
                  <div className="bar-row" key={term.term}>
                    <span className="fw-650">{termLabel(term.term)}</span>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${
                          (term.average ?? 0) >= 70 ? 'green' : (term.average ?? 0) >= 50 ? '' : 'red'
                        }`}
                        style={{ width: `${Math.max(2, term.average || 0)}%` }}
                      />
                    </div>
                    <span className="text-end fw-650">{term.average === null ? '—' : `${term.average}%`}</span>
                  </div>
                ))}
              </div>

              <div className="section-title mt-4 mb-2">Section performance</div>
              <div className="row g-2">
                {byLevel.map((level) => (
                  <div className="col-md-4" key={level.level}>
                    <div className="border rounded-3 p-3 h-100">
                      <div className="text-muted-2" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                        {levelLabel(level.level)}
                      </div>
                      <div className="d-flex align-items-end justify-content-between mt-1">
                        <span className="fw-650" style={{ fontSize: '1.1rem' }}>{percent(level.average)}</span>
                        <span className="text-muted-2" style={{ fontSize: '0.72rem' }}>{level.students} students</span>
                      </div>
                      <div className="progress progress-thin mt-2">
                        <div className="progress-bar" style={{ width: `${level.average || 0}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card-soft h-100">
            <div className="card-header">
              <span><i className="bi bi-clipboard-check me-2 text-muted-2" />Quick actions</span>
            </div>
            <div className="card-body d-flex flex-column gap-2">
              <button type="button" className="btn btn-outline-brand text-start" onClick={() => navigate('/assessments')}>
                <i className="bi bi-clipboard2-plus me-2" />Enter or update assessment scores
              </button>
              <button type="button" className="btn btn-outline-brand text-start" onClick={() => navigate('/reports')}>
                <i className="bi bi-file-earmark-plus me-2" />Generate class report cards
              </button>
              {isManager ? (
                <>
                  <button type="button" className="btn btn-outline-brand text-start" onClick={() => navigate('/approvals')}>
                    <i className="bi bi-patch-check me-2" />Review reports awaiting approval
                  </button>
                  <button type="button" className="btn btn-outline-brand text-start" onClick={() => navigate('/analytics')}>
                    <i className="bi bi-graph-up-arrow me-2" />Open performance analytics
                  </button>
                  <Link to="/reports" className="btn btn-outline-brand text-start">
                    <i className="bi bi-download me-2" />Download report card packs
                  </Link>
                </>
              ) : (
                <div className="alert alert-info mb-0 mt-2">
                  <i className="bi bi-info-circle me-1" />
                  You can only record assessments for the classes and subjects assigned to you.
                </div>
              )}

              {user.role === 'TEACHER' ? (
                <div className="mt-2">
                  <div className="section-title mb-2">My assignments</div>
                  {teacherClasses.length ? (
                    teacherClasses.map((item) => (
                      <div key={item.id} className="d-flex justify-content-between border-bottom py-2" style={{ fontSize: '0.8rem' }}>
                        <span className="fw-650">{item.name}</span>
                        <span className="text-muted-2">{levelLabel(item.level)} · {item.students} students</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-2" style={{ fontSize: '0.78rem' }}>No classes assigned yet.</div>
                  )}
                  {mySubjects.length ? (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {mySubjects.map((subject) => (
                        <span key={subject.id} className="badge badge-soft-info">{subject.name}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className={isManager ? 'col-lg-8' : 'col-12'}>
          <div className="card-soft">
            <div className="card-header">
              <span><i className="bi bi-clock-history me-2 text-muted-2" />Recently updated reports</span>
              <Link to="/reports" className="btn btn-sm btn-outline-brand">View all</Link>
            </div>
            <div className="table-responsive">
              {recentReports.length ? (
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Term</th>
                      <th>Average</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReports.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <Link to={`/reports/${report.id}`} className="fw-650">
                            {report.student.fullName}
                          </Link>
                          <div className="text-muted-2 mono">{report.student.code}</div>
                        </td>
                        <td>{report.className}</td>
                        <td>{termLabel(report.term)}</td>
                        <td className="fw-650">{percent(report.average)}</td>
                        <td><StatusBadge status={report.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  icon="bi-file-earmark-x"
                  title="No report cards yet"
                  message="Generate report cards for a class to get started."
                  action={<Link to="/reports" className="btn btn-brand btn-sm">Open report cards</Link>}
                />
              )}
            </div>
          </div>
        </div>

        {isManager ? (
          <div className="col-lg-4">
            <div className="card-soft h-100">
              <div className="card-header">
                <span><i className="bi bi-shield-check me-2 text-muted-2" />System activity</span>
                {user.role === 'SUPER_ADMIN' ? <Link to="/audit" className="btn btn-sm btn-outline-brand">Audit</Link> : null}
              </div>
              <div className="card-body py-2">
                {recentAudit.length ? (
                  recentAudit.map((entry) => (
                    <div className="activity-item" key={entry.id}>
                      <span className="activity-icon"><i className="bi bi-activity" /></span>
                      <div>
                        <div className="activity-text">{entry.description}</div>
                        <div className="activity-meta">
                          {entry.userName} · {entry.action} · {formatDateTime(entry.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-2 py-4 text-center" style={{ fontSize: '0.8rem' }}>
                    <i className="bi bi-info-circle me-1" />
                    Detailed system activity is visible to the Super Admin.
                    {totals.lowPerformers !== null ? (
                      <div className="alert alert-warning mt-3 mb-0 text-start">
                        <strong>{totals.lowPerformers}</strong> report{totals.lowPerformers === 1 ? '' : 's'} are
                        below the low-performance threshold of {data.criteria.lowPerformanceThreshold}%.
                        <Link to="/analytics" className="fw-650 d-block mt-1">Review performance</Link>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
