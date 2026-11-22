import logo from '../assets/logo.jpeg';
import { classPosition, levelLabel, reportTypeLabel, termLabel } from '../utils/format.js';

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);
const percent = (value) =>
  value === null || value === undefined || value === '' ? '—' : `${value}%`;

export default function ReportCardView({ report }) {
  if (!report) return null;

  const school = report.school || {};
  const student = report.student || {};
  const marks = Array.isArray(report.marks) ? report.marks : [];
  const summary = report.summary || {};
  const annual = report.annual || {};
  const annualTerms = Array.isArray(annual.terms) ? annual.terms : [];

  const type = report.type || 'TERM';
  const isAnnual = type === 'ANNUAL';
  const isMidterm = type === 'MIDTERM';
  const typeName = report.typeLabel || reportTypeLabel(type);
  const session = report.termLabel || termLabel(report.term);
  const title = isAnnual
    ? `Annual report · ${report.year}`
    : `${typeName} report · ${session} ${report.year}`;

  const schoolName = school.campusName || school.name || 'LIGHT PEACE ACADEMY';
  const contact = [school.address, school.phone ? `Tel: ${school.phone}` : null, school.email]
    .filter(Boolean)
    .join('  |  ');

  const position = isAnnual
    ? classPosition(annual.overallPosition, annual.overallOutOf)
    : classPosition(summary.position, summary.outOf);
  const average = isAnnual ? percent(annual.overallAverage) : percent(summary.average);

  return (
    <div className="report-sheet" id="report-sheet">
      <header className="report-header">
        <img src={logo} alt="School logo" className="report-logo" />
        <div className="report-school">
          <h1>{schoolName}</h1>
          <div className="motto">{school.motto || school.schoolMotto || '—'}</div>
          {contact ? <div className="contact">{contact}</div> : null}
        </div>
      </header>

      <div className="report-title-band">
        <span>{title}</span>
        <span>Academic year {report.year}</span>
      </div>

      <section className="report-info">
        <div className="report-info-row">
          <span className="label">Student name</span>
          <span className="value">{student.name || '—'}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Student ID</span>
          <span className="value">{student.code || '—'}</span>
        </div>
        <div className="report-info-row">
          <span className="label">Class</span>
          <span className="value">
            {report.className || '—'}
            {report.level ? ` (${levelLabel(report.level)})` : ''}
          </span>
        </div>
        <div className="report-info-row">
          <span className="label">Gender</span>
          <span className="value">
            {student.gender === 'FEMALE' ? 'Female' : student.gender === 'MALE' ? 'Male' : dash(student.gender)}
          </span>
        </div>
        <div className="report-info-row highlight">
          <span className="label">Position</span>
          <span className="value">{position}</span>
        </div>
        <div className="report-info-row highlight">
          <span className="label">Average</span>
          <span className="value">{average}</span>
        </div>
        {!isAnnual ? (
          <>
            <div className="report-info-row highlight">
              <span className="label">Total marks</span>
              <span className="value">
                {summary.totalMarks === null || summary.totalMarks === undefined
                  ? '—'
                  : `${summary.totalMarks} / ${summary.expectedTotalMarks ?? '-'}`}
              </span>
            </div>
            <div className="report-info-row highlight">
              <span className="label">Pass %</span>
              <span className="value">{summary.passPercentage === null || summary.passPercentage === undefined ? '—' : `${summary.passPercentage}%`}</span>
            </div>
          </>
        ) : null}
      </section>

      {isAnnual ? (
        <table className="report-table report-annual-table">
          <thead>
            <tr>
              <th className="left" style={{ width: '40%' }}>Term</th>
              <th style={{ width: '20%' }}>Average</th>
              <th style={{ width: '20%' }}>Grade</th>
              <th style={{ width: '20%' }}>Position</th>
            </tr>
          </thead>
          <tbody>
            {annualTerms.length ? (
              annualTerms.map((term, index) => (
                <tr key={term.term || term.label || index}>
                  <td className="left subject-name">
                    {term.label || term.termLabel || termLabel(term.term) || term.term || '—'}
                  </td>
                  <td>{percent(term.average)}</td>
                  <td className="fw-bold">{dash(term.grade)}</td>
                  <td>{classPosition(term.position, term.outOf)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="empty">
                  No term averages recorded for this academic year.
                </td>
              </tr>
            )}
            <tr className="report-overall-row">
              <td className="left subject-name">Overall</td>
              <td>{percent(annual.overallAverage)}</td>
              <td className="fw-bold">{dash(annual.overallGrade)}</td>
              <td>{classPosition(annual.overallPosition, annual.overallOutOf)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>No</th>
              <th className="left" style={{ width: isMidterm ? '33%' : '26%' }}>Subject</th>
              <th style={{ width: '10%' }}>Expected</th>
              <th style={{ width: isMidterm ? '14%' : '10%' }}>Mid-term</th>
              {isMidterm ? null : <th style={{ width: '10%' }}>End-term</th>}
              {isMidterm ? null : <th style={{ width: '10%' }}>Total</th>}
              <th style={{ width: isMidterm ? '14%' : '10%' }}>Grade</th>
              <th style={{ width: isMidterm ? '10%' : '9%' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {marks.length ? (
              marks.map((mark, index) => {
                const passed = mark.passed;
                const result = passed === null || passed === undefined ? '—' : passed ? 'PASS' : 'FAIL';
                return (
                  <tr key={mark.subjectId || mark.subject || index}>
                    <td>{index + 1}</td>
                    <td className="left subject-name">{mark.subject || '—'}</td>
                    <td>{dash(mark.expectedMark ?? 100)}</td>
                    <td style={{ background: mark.midtermScore != null ? '#eef6ff' : undefined }}>{dash(mark.midtermScore)}</td>
                    {isMidterm ? null : <td style={{ background: mark.examScore != null ? '#eef6ff' : undefined }}>{dash(mark.examScore)}</td>}
                    {isMidterm ? null : <td className="fw-bold" style={{ background: mark.total != null ? '#eef6ff' : undefined }}>{dash(mark.total)}</td>}
                    <td className="fw-bold">{dash(mark.grade)}</td>
                    <td style={{ background: passed === true ? '#e9f7ef' : passed === false ? '#fff3cd' : undefined, color: passed === true ? '#1f7a4d' : passed === false ? '#a35c00' : undefined, fontWeight: 700 }}>{result}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isMidterm ? 6 : 8} className="empty">
                  No assessment scores recorded.
                </td>
              </tr>
            )}
            {marks.length ? (
              <tr className="report-overall-row">
                <td className="left subject-name" colSpan="2">Total / Expected</td>
                <td className="fw-bold">{dash(summary.expectedTotalMarks)}</td>
                <td colSpan={isMidterm ? 1 : 3} className="fw-bold">{dash(summary.totalMarks)}</td>
                <td className="fw-bold">{dash(summary.grade)}</td>
                <td className="fw-bold">{summary.passPercentage === null || summary.passPercentage === undefined ? '—' : `${summary.passPercentage}%`}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}

      <div className="report-signatures">
        <div className="report-signature">
          <div className="line">
            <div className="name">{report.classTeacherName || ''}</div>
            <div className="role">Class Teacher</div>
          </div>
        </div>
        <div className="report-signature">
          <div className="line">
            <div className="name">{school.headTeacherName || ''}</div>
            <div className="role">Head Teacher</div>
          </div>
        </div>
      </div>

      <div className="report-foot">
        <span>LPAREPORTS · Rwanda · {student.code || '—'}</span>
        <span>{report.year}</span>
      </div>
    </div>
  );
}
