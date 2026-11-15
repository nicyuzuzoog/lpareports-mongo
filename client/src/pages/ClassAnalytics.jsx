import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { YEAR_OPTIONS, currentYear } from '../utils/constants.js';
import { average, levelLabel, percent, termLabel } from '../utils/format.js';

export default function ClassAnalytics() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const year = Number(params.get('year') || currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/analytics/class/${id}?year=${year}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, year]);

  if (loading) return <Loading label="Loading class performance…" />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;

  const overall = average(data.students.map((student) => student.overall).filter((value) => value !== null));
  const passMark = Number(data.passMark ?? 50);
  const passed = data.students.filter(
    (student) => student.overall !== null && student.overall >= passMark
  ).length;

  return (
    <>
      <div className="mb-3">
        <Link to="/analytics" className="btn btn-sm btn-outline-brand">
          <i className="bi bi-arrow-left me-1" />
          Back to analytics
        </Link>
      </div>

      <PageHeader
        title={`${data.class.name} performance`}
        subtitle={`${levelLabel(data.class.level)} · Academic year ${year}`}
      >
        <select
          className="form-select"
          style={{ width: 110 }}
          value={year}
          onChange={(event) => setParams({ year: event.target.value })}
        >
          {YEAR_OPTIONS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </PageHeader>

      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-people" label="Students" value={data.students.length} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-graph-up" label="Class average" value={percent(overall)} tone="green" />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-check2-circle" label={`At or above ${passMark}%`} value={`${passed}/${data.students.length}`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard icon="bi-journal-text" label="Subjects" value={data.subjects.length} />
        </div>
      </div>

      <div className="card-soft mb-4">
        <div className="card-header">
          <span><i className="bi bi-people me-2 text-muted-2" />Student term averages</span>
          <span className="text-muted-2 fw-normal" style={{ fontSize: '0.72rem' }}>Click a term score to open the report</span>
        </div>
        {data.students.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Term I</th>
                  <th>Term II</th>
                  <th>Term III</th>
                  <th>Overall</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => (
                  <tr key={student.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted-2" style={{ fontSize: '0.72rem', width: 18 }}>{index + 1}</span>
                        <div>
                          <div className="fw-650">{student.name}</div>
                          <div className="mono">{student.code}</div>
                        </div>
                      </div>
                    </td>
                    {['TERM1', 'TERM2', 'TERM3'].map((term) => {
                      const entry = student.terms[term];
                      return (
                        <td key={term}>
                          {entry ? (
                            <Link to={`/reports/${entry.reportId}`} className="fw-650">
                              {percent(entry.average)}
                            </Link>
                          ) : (
                            <span className="text-muted-2">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="progress progress-thin flex-grow-1" style={{ minWidth: 60 }}>
                          <div className="progress-bar" style={{ width: `${student.overall || 0}%` }} />
                        </div>
                        <span className="fw-650">{percent(student.overall)}</span>
                      </div>
                    </td>
                    <td className="fw-650">{student.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="bi-people" title="No active students" message="This class has no active learners." />
        )}
      </div>

      <div className="card-soft">
        <div className="card-header">
          <span><i className="bi bi-book me-2 text-muted-2" />Subject performance by term</span>
        </div>
        {data.subjects.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>{termLabel('TERM1')}</th>
                  <th>{termLabel('TERM2')}</th>
                  <th>{termLabel('TERM3')}</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((subject) => (
                  <tr key={subject.subjectId}>
                    <td className="fw-650">{subject.subject}</td>
                    <td>{percent(subject.TERM1)}</td>
                    <td>{percent(subject.TERM2)}</td>
                    <td>{percent(subject.TERM3)}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="progress progress-thin">
                        <div className="progress-bar" style={{ width: `${subject.TERM3 || subject.TERM2 || subject.TERM1 || 0}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="bi-book" title="No subject data" message="Assessments will populate this table." />
        )}
      </div>
    </>
  );
}
