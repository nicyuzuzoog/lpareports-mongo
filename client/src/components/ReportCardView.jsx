import logo from '../assets/logo.jpeg';
import { RWANDA_GRADING } from '../utils/constants.js';
import {
  classPosition,
  gradeClass,
  levelLabel,
  pointsForGrade,
  pointsLabel,
  termLabel
} from '../utils/format.js';

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);

export default function ReportCardView({ report }) {
  if (!report) return null;

  const school = report.school || {};
  const summary = report.summary || {};
  const marks = report.marks || [];
  const teacherName = marks.find((mark) => mark.teacher)?.teacher || '';
  const campusLocation = school.campusLocation || school.address || 'Kigali, Rwanda';
  const contactParts = [
    school.address || campusLocation,
    school.phone ? `Tel: ${school.phone}` : null,
    school.email
  ].filter(Boolean);
  const position = classPosition(summary.position ?? report.position, summary.outOf ?? report.outOf);
  const markPoints = (mark) => mark.points ?? pointsForGrade(mark.grade);
  const keyTone = (grade) => {
    if (grade === 'F') return { background: '#b42318', color: '#fff' };
    if (grade === 'E' || grade === 'S') return { background: '#8a6100', color: '#fff' };
    if (grade === 'A' || grade === 'B') return { background: '#1f7a4d', color: '#fff' };
    return undefined;
  };

  return (
    <div className="report-sheet" id="report-sheet">
      <header className="report-header">
        <img src={logo} alt="School logo" className="report-logo" />
        <div className="report-school">
          <h1>{school.name || 'LIGHT PEACE ACADEMY'}</h1>
          <div className="campus">
            {school.campusName || school.name || 'LIGHT PEACE ACADEMY'} · {campusLocation}
          </div>
          <div className="motto">{school.motto}</div>
          <div className="contact">{contactParts.join('  |  ')}</div>
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
          <span className="label">Campus</span>
          <span className="value">{school.campusName || school.name || '—'}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Position</span>
          <span className="value">{position}</span>
        </div>
      </section>

      <table className="report-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>No.</th>
            <th className="left" style={{ width: '27%' }}>Subject</th>
            <th style={{ width: '9%' }}>CA</th>
            <th style={{ width: '9%' }}>Exam</th>
            <th style={{ width: '9%' }}>Total</th>
            <th style={{ width: '8%' }}>Grade</th>
            <th style={{ width: '9%' }}>Points</th>
            <th className="left" style={{ width: '24%' }}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {marks.length ? (
            marks.map((mark, index) => (
              <tr key={mark.id || mark.subjectId}>
                <td>{index + 1}</td>
                <td className="left subject-name">{mark.subject}</td>
                <td>{dash(mark.caScore)}</td>
                <td>{dash(mark.examScore)}</td>
                <td className={mark.total !== null && mark.total !== undefined ? 'fw-bold' : ''}>
                  {dash(mark.total)}
                </td>
                <td className={`${gradeClass(mark.grade)} fw-bold`}>{dash(mark.grade)}</td>
                <td>{pointsLabel(markPoints(mark))}</td>
                <td className="left">{dash(mark.remark || mark.competency)}</td>
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
          <div className="s-label">Subjects</div>
          <div className="s-value">{summary.subjectsAssessed ?? 0}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Total marks</div>
          <div className="s-value">{dash(summary.totalMarks)}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Average</div>
          <div className="s-value">
            {summary.average === null || summary.average === undefined ? '—' : `${summary.average}%`}
          </div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Overall grade</div>
          <div className="s-value">{summary.grade || '—'}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Aggregate points</div>
          <div className="s-value">{pointsLabel(summary.aggregate)}</div>
        </div>
        <div className="report-summary-cell">
          <div className="s-label">Position</div>
          <div className="s-value">{position}</div>
        </div>
      </div>

      <div className="grading-key">
        <div className="grading-key-title">Rwandan grading key — higher points are better</div>
        <table className="grading-key-table">
          <thead>
            <tr>
              {RWANDA_GRADING.map((band) => (
                <th key={band.grade} style={keyTone(band.grade)}>{band.grade}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {RWANDA_GRADING.map((band) => (
                <td key={`${band.grade}-marks`}>{band.min}–{band.max}</td>
              ))}
            </tr>
            <tr>
              {RWANDA_GRADING.map((band) => (
                <td key={`${band.grade}-points`}>{band.points} pt{band.points === 1 ? '' : 's'}</td>
              ))}
            </tr>
            <tr>
              {RWANDA_GRADING.map((band) => (
                <td key={`${band.grade}-remark`}>{band.remark}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <section className="report-comments">
        <div className="report-comment">
          <div className="report-comment-label">Class teacher's comment</div>
          <div className="report-comment-text">{dash(report.comments?.teacher)}</div>
        </div>
        <div className="report-comment">
          <div className="report-comment-label">Dean of Studies' comment</div>
          <div className="report-comment-text">{dash(report.comments?.dos)}</div>
        </div>
        <div className="report-comment">
          <div className="report-comment-label">Head Teacher's comment</div>
          <div className="report-comment-text">{dash(report.comments?.headTeacher)}</div>
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
            <div className="name">{school.headTeacherName || '—'}</div>
            <div className="role">Head Teacher</div>
          </div>
        </div>
        <div className="report-signature">
          <div className="line">
            <div className="name">&nbsp;</div>
            <div className="role">Parent / Guardian</div>
          </div>
        </div>
      </div>

      <div className="report-foot">
        <span>
          LPAREPORTS · Rwanda · {report.student.code} · {termLabel(report.term)} {report.year}
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
                <th className="left" style={{ width: '30%' }}>Term</th>
                <th style={{ width: '18%' }}>Average</th>
                <th style={{ width: '12%' }}>Grade</th>
                <th style={{ width: '12%' }}>Points</th>
                <th style={{ width: '28%' }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {(report.cumulative.termAverages || []).map((term) => (
                <tr key={term.term}>
                  <td className="left subject-name">{term.label}</td>
                  <td>{term.average === null ? '—' : `${term.average}%`}</td>
                  <td className={`${gradeClass(term.grade)} fw-bold`}>{term.grade}</td>
                  <td>{pointsLabel(pointsForGrade(term.grade))}</td>
                  <td className="left">{term.grade === '-' ? 'Not assessed' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="report-annual-box">
            <div>
              <div className="b-label">Overall annual average</div>
              <div className="b-value">
                {report.cumulative.overallAverage === null ||
                report.cumulative.overallAverage === undefined
                  ? '—'
                  : `${report.cumulative.overallAverage}%`}
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
                <th className="left" style={{ width: '27%' }}>Subject</th>
                <th style={{ width: '9%' }}>Term I</th>
                <th style={{ width: '9%' }}>Term II</th>
                <th style={{ width: '9%' }}>Term III</th>
                <th style={{ width: '10%' }}>Average</th>
                <th style={{ width: '8%' }}>Grade</th>
                <th style={{ width: '9%' }}>Points</th>
                <th className="left" style={{ width: '19%' }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {(report.cumulative.subjects || []).map((subject) => (
                <tr key={subject.subjectId}>
                  <td className="left subject-name">{subject.subject}</td>
                  <td>{dash(subject.t1)}</td>
                  <td>{dash(subject.t2)}</td>
                  <td>{dash(subject.t3)}</td>
                  <td className="fw-bold">{dash(subject.average)}</td>
                  <td className={`${gradeClass(subject.grade)} fw-bold`}>{subject.grade}</td>
                  <td>{pointsLabel(pointsForGrade(subject.grade))}</td>
                  <td className="left">{subject.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="report-note">
            The cumulative summary combines Term I, Term II and Term III results for the academic year.
            Averages are calculated from recorded subject totals; higher points are better.
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
                <div className="name">{school.headTeacherName || '—'}</div>
                <div className="role">Head Teacher</div>
              </div>
            </div>
            <div className="report-signature">
              <div className="line">
                <div className="name">&nbsp;</div>
                <div className="role">Parent / Guardian</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
