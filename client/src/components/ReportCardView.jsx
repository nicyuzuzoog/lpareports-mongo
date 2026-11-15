import logo from '../assets/logo.jpeg';
import { levelLabel, ordinal, termLabel } from '../utils/format.js';

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);

export default function ReportCardView({ report }) {
  if (!report) return null;

  const isUpper = report.level === 'UPPER_PRIMARY';
  const teacherName = report.marks.find((mark) => mark.teacher)?.teacher || '';
  const attendance =
    report.attendance.percent !== null
      ? `${report.attendance.present}/${report.attendance.total} days (${report.attendance.percent}%)`
      : 'Not recorded';

  return (
    <div className="report-sheet" id="report-sheet">
      <header className="report-header">
        <img src={logo} alt="School logo" className="report-logo" />
        <div className="report-school">
          <h1>{report.school.name}</h1>
          <div className="motto">{report.school.motto}</div>
          <div className="contact">
            {report.school.address} &nbsp;|&nbsp; Tel: {report.school.phone} &nbsp;|&nbsp; {report.school.email}
          </div>
        </div>
      </header>

      <div className="report-title-band">
        <span>{termLabel(report.term)} report card — {report.year}</span>
        <span>Student ID: {report.student.code}</span>
      </div>

      <section className="report-info">
        <div className="report-info-row">
          <span className="label">Student name</span>
          <span className="value">{report.student.fullName}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Student ID</span>
          <span className="value">{report.student.code}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Class</span>
          <span className="value">{report.className} ({levelLabel(report.level)})</span>
        </div>
        <div className="report-info-row">
          <span className="label">Gender</span>
          <span className="value">{report.student.gender === 'FEMALE' ? 'Female' : 'Male'}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Attendance</span>
          <span className="value">{attendance}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Position</span>
          <span className="value">
            {report.summary.position
              ? `${report.summary.positionLabel} of ${report.summary.outOf}`
              : 'Not ranked'}
          </span>
        </div>
      </section>

      <table className="report-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th className="left" style={{ width: '30%' }}>Subject</th>
            <th style={{ width: '8%' }}>C/W</th>
            <th style={{ width: '8%' }}>Exam</th>
            <th style={{ width: '8%' }}>Total</th>
            <th style={{ width: '7%' }}>Grade</th>
            <th className="left" style={{ width: '23%' }}>{isUpper ? 'Remarks' : 'Competency / Remarks'}</th>
            <th className="left" style={{ width: '11%' }}>Teacher</th>
          </tr>
        </thead>
        <tbody>
          {report.marks.length ? (
            report.marks.map((mark, index) => (
              <tr key={mark.id || mark.subjectId}>
                <td>{index + 1}</td>
                <td className="left subject-name">{mark.subject}</td>
                <td>{dash(mark.caScore)}</td>
                <td>{dash(mark.examScore)}</td>
                <td className={mark.total !== null ? 'fw-bold' : ''}>{dash(mark.total)}</td>
                <td className={mark.grade && ['F9', 'U', 'E'].includes(mark.grade) ? 'text-danger fw-bold' : 'fw-bold'}>
                  {dash(mark.grade)}
                </td>
                <td className="left">{isUpper ? dash(mark.remark) : dash(mark.competency || mark.remark)}</td>
                <td className="left">{dash(mark.teacher)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" className="text-muted-2" style={{ padding: '10px' }}>
                No assessment scores recorded for this term.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="report-summary">
        <div className="report-summary-cell">
          <div className="s-label">Subjects assessed</div>
          <div className="s-value">{report.summary.subjectsAssessed}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Total marks</div>
          <div className="s-value">{dash(report.summary.totalMarks)}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Average</div>
          <div className="s-value">{report.summary.average === null ? '—' : `${report.summary.average}%`}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Overall grade</div>
          <div className="s-value">{report.summary.grade}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Position</div>
          <div className="s-value">
            {report.summary.position ? `${ordinal(report.summary.position)} / ${report.summary.outOf}` : '—'}
          </div>
        </div>
      </div>

      <div className="grading-key">
        <strong>Grading key:</strong>{' '}
        {(report.gradingScale || []).map((band, index) => (
          <span key={`${band.grade}-${band.min}`}>
            {index > 0 ? ' · ' : ''}
            {band.grade} {band.min}–{band.max} ({band.remark})
          </span>
        ))}
      </div>

      <section className="report-comments">
        <div className="report-comment">
          <div className="report-comment-label">Class teacher's comment</div>
          <div className="report-comment-text">{dash(report.comments.teacher)}</div>
        </div>
        <div className="report-comment">
          <div className="report-comment-label">Dean of Studies' comment</div>
          <div className="report-comment-text">{dash(report.comments.dos)}</div>
        </div>
        <div className="report-comment">
          <div className="report-comment-label">Head Teacher's comment</div>
          <div className="report-comment-text">{dash(report.comments.headTeacher)}</div>
        </div>
      </section>

      <div className="report-signatures">
        <div className="report-signature">
          <div className="line">
            <div className="name">{teacherName || '—'}</div>
            <div className="role">Class Teacher</div>
          </div>
        </div>
        <div className="report-signature">
          <div className="line">
            <div className="name">{report.school.dosName}</div>
            <div className="role">Dean of Studies</div>
          </div>
        </div>
        <div className="report-signature">
          <div className="line">
            <div className="name">{report.school.headTeacherName}</div>
            <div className="role">Head Teacher</div>
          </div>
        </div>
      </div>

      <div className="report-foot">
        <span>
          LPACAMIS · {report.student.code} · {termLabel(report.term)} {report.year}
        </span>
        <span>Generated {new Date().toLocaleDateString('en-GB')}</span>
      </div>

      {report.term === 'TERM3' && report.cumulative ? (
        <section className="report-cumulative">
          <div className="report-cumulative-head">
            <h3>Annual cumulative summary — {report.year}</h3>
            <span>{report.student.fullName} · {report.className}</span>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th className="left" style={{ width: '34%' }}>Term</th>
                <th style={{ width: '22%' }}>Average</th>
                <th style={{ width: '18%' }}>Grade</th>
                <th style={{ width: '26%' }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {report.cumulative.termAverages.map((term) => (
                <tr key={term.term}>
                  <td className="left subject-name">{term.label}</td>
                  <td>{term.average === null ? '—' : `${term.average}%`}</td>
                  <td className="fw-bold">{term.grade}</td>
                  <td>{term.grade === '-' ? 'Not assessed' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="report-annual-box">
            <div>
              <div className="b-label">Overall annual average</div>
              <div className="b-value">
                {report.cumulative.overallAverage === null ? '—' : `${report.cumulative.overallAverage}%`}
              </div>
            </div>
            <div>
              <div className="b-label">Final grade</div>
              <div className="b-value">{report.cumulative.overallGrade}</div>
            </div>
            <div>
              <div className="b-label">Remark</div>
              <div className="b-value" style={{ fontSize: 13 }}>{report.cumulative.overallRemark}</div>
            </div>
          </div>

          <table className="report-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th className="left" style={{ width: '30%' }}>Subject</th>
                <th style={{ width: '9%' }}>Term I</th>
                <th style={{ width: '9%' }}>Term II</th>
                <th style={{ width: '9%' }}>Term III</th>
                <th style={{ width: '10%' }}>Average</th>
                <th style={{ width: '8%' }}>Grade</th>
                <th className="left" style={{ width: '25%' }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {report.cumulative.subjects.map((subject) => (
                <tr key={subject.subjectId}>
                  <td className="left subject-name">{subject.subject}</td>
                  <td>{dash(subject.t1)}</td>
                  <td>{dash(subject.t2)}</td>
                  <td>{dash(subject.t3)}</td>
                  <td className="fw-bold">{dash(subject.average)}</td>
                  <td className="fw-bold">{subject.grade}</td>
                  <td className="left">{subject.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="report-note">
            The cumulative summary combines Term I, Term II and Term III results for the academic year.
            Averages are calculated from recorded subject totals.
          </div>

          <div className="report-signatures" style={{ marginTop: 18 }}>
            <div className="report-signature">
              <div className="line">
                <div className="name">{teacherName || '—'}</div>
                <div className="role">Class Teacher</div>
              </div>
            </div>
            <div className="report-signature">
              <div className="line">
                <div className="name">{report.school.dosName}</div>
                <div className="role">Dean of Studies</div>
              </div>
            </div>
            <div className="report-signature">
              <div className="line">
                <div className="name">{report.school.headTeacherName}</div>
                <div className="role">Head Teacher</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
