import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { average, formatDate, fullName, initials, levelLabel, percent, termLabel } from '../utils/format.js';

export default function StudentDetail() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/students/${id}`)
      .then((data) => setStudent(data.student))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading label="Loading student profile…" />;
  if (error) return <ErrorAlert error={error} />;
  if (!student) return null;

  const overall = average(student.reportCards.map((card) => card.average).filter((value) => value !== null));

  return (
    <>
      <div className="mb-3">
        <Link to="/students" className="btn btn-sm btn-outline-brand">
          <i className="bi bi-arrow-left me-1" />
          Back to students
        </Link>
      </div>

      <PageHeader
        title={fullName(student)}
        subtitle={`${student.code} · ${student.className} (${levelLabel(student.level)})`}
      >
        <Link to="/reports" className="btn btn-outline-brand">
          <i className="bi bi-file-earmark-text me-2" />
          Report cards
        </Link>
      </PageHeader>

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card-soft mb-4">
            <div className="card-body text-center py-4">
              <span className="avatar mx-auto mb-3" style={{ width: 64, height: 64, fontSize: '1.2rem' }}>
                {initials(fullName(student))}
              </span>
              <h5 className="mb-1">{fullName(student)}</h5>
              <div className="mono mb-2">{student.code}</div>
              <div className="d-flex justify-content-center gap-2">
                <span className={`badge ${student.isActive ? 'badge-soft-success' : 'badge-soft-muted'}`}>
                  {student.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="badge badge-soft-info">{student.className}</span>
              </div>
              <div className="row g-2 mt-4 text-start">
                <div className="col-6">
                  <div className="text-muted-2" style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Overall average</div>
                  <div className="fw-650" style={{ fontSize: '1.2rem' }}>{percent(overall)}</div>
                </div>
                <div className="col-6">
                  <div className="text-muted-2" style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Reports on file</div>
                  <div className="fw-650" style={{ fontSize: '1.2rem' }}>{student.reportCards.length}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-soft">
            <div className="card-header">Personal details</div>
            <div className="card-body">
              <dl className="row mb-0" style={{ fontSize: '0.82rem' }}>
                <dt className="col-5 text-muted-2 fw-normal">Gender</dt>
                <dd className="col-7 fw-650">{student.gender === 'FEMALE' ? 'Female' : 'Male'}</dd>
                <dt className="col-5 text-muted-2 fw-normal">Date of birth</dt>
                <dd className="col-7 fw-650">{formatDate(student.dateOfBirth)}</dd>
                <dt className="col-5 text-muted-2 fw-normal">Guardian</dt>
                <dd className="col-7 fw-650">{student.guardianName || '—'}</dd>
                <dt className="col-5 text-muted-2 fw-normal">Guardian phone</dt>
                <dd className="col-7 fw-650">{student.guardianPhone || '—'}</dd>
                <dt className="col-5 text-muted-2 fw-normal">Address</dt>
                <dd className="col-7 fw-650">{student.address || '—'}</dd>
                <dt className="col-5 text-muted-2 fw-normal">Registered</dt>
                <dd className="col-7 fw-650">{formatDate(student.createdAt)}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card-soft">
            <div className="card-header">
              <span>Report card history</span>
              <span className="text-muted-2 fw-normal" style={{ fontSize: '0.72rem' }}>Most recent first</span>
            </div>
            {student.reportCards.length ? (
              <div className="table-responsive">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Term</th>
                      <th>Class</th>
                      <th>Subjects</th>
                      <th>Average</th>
                      <th>Status</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.reportCards.map((card) => (
                      <tr key={card.id}>
                        <td className="fw-650">{card.year}</td>
                        <td>{termLabel(card.term)}</td>
                        <td>{card.className}</td>
                        <td>{card.subjects}</td>
                        <td className="fw-650">{percent(card.average)}</td>
                        <td><StatusBadge status={card.status} /></td>
                        <td className="text-end">
                          <Link to={`/reports/${card.id}`} className="btn btn-sm btn-outline-brand">
                            Open <i className="bi bi-arrow-right ms-1" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="bi-file-earmark-x"
                title="No report cards yet"
                message="Generate report cards from the Report Cards page once assessments are recorded."
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
