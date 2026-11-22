import { prisma } from '../lib/prisma.js';
import {
  CAMPUSES,
  averageOf,
  effectiveScoreFor,
  gradeFor,
  ordinal,
  reportTypeLabel,
  termLabel
} from '../lib/grading.js';

const TERMS = ['TERM1', 'TERM2', 'TERM3'];

/** Marks that actually have a score for the requested report type. */
function assessedMarks(marks, type) {
  return (marks || [])
    .map((mark) => ({ mark, score: effectiveScoreFor(mark, type) }))
    .filter((entry) => entry.score !== null && !Number.isNaN(entry.score));
}

/**
 * Summary for one card. MIDTERM reports rank/average on midtermScore; all
 * other types use `total` (coursework + exam weights only, never midterm).
 */
export function summariseMarks(marks, level, settings, type = 'TERM') {
  const assessed = assessedMarks(marks, type);
  const scores = assessed.map((entry) => entry.score);
  const average = averageOf(scores);
  const gradeInfo = gradeFor(average, level, settings);
  const points = scores
    .map((score) => gradeFor(score, level, settings).points)
    .filter((point) => point !== null && point !== undefined);
  const aggregate = points.length ? points.reduce((a, b) => a + b, 0) : null;

  const passMark = Number(settings?.passMark ?? 50);
  const passedSubjects = scores.filter((score) => Number(score) >= passMark).length;
  const failedSubjects = scores.filter((score) => Number(score) < passMark).length;
  const passPercentage =
    assessed.length > 0 ? Math.round((passedSubjects / assessed.length) * 1000) / 10 : null;

  return {
    subjectsAssessed: assessed.length,
    expectedTotalMarks: assessed.length * 100,
    totalMarks: Math.round(scores.reduce((acc, score) => acc + Number(score || 0), 0) * 10) / 10,
    average,
    grade: gradeInfo.grade,
    remark: gradeInfo.remark,
    aggregate,
    passMark,
    passedSubjects,
    failedSubjects,
    passPercentage
  };
}

export function markRows(report, settings, type = 'TERM') {
  const level = report.class?.level || 'LOWER_PRIMARY';
  const passMark = Number(settings?.passMark ?? 50);
  return (report.marks || [])
    .slice()
    .sort(
      (a, b) =>
        (a.subject?.position ?? 0) - (b.subject?.position ?? 0) ||
        String(a.subject?.name || '').localeCompare(String(b.subject?.name || ''))
    )
    .map((mark, index) => {
      const score = effectiveScoreFor(mark, type);
      const gradeInfo = gradeFor(score, level, settings);
      const passed = score === null ? null : Number(score) >= passMark;
      return {
        number: index + 1,
        subject: mark.subject?.name || 'Subject',
        expectedMark: 100,
        midtermScore: mark.midtermScore ?? null,
        examScore: mark.examScore ?? null,
        total: type === 'MIDTERM' ? score : mark.total ?? null,
        grade: gradeInfo.grade,
        remark: gradeInfo.remark,
        points: gradeInfo.points,
        passed
      };
    });
}

function rankRows(rows) {
  return rows
    .filter((entry) => entry.average !== null && entry.subjectsAssessed !== 0)
    .sort(
      (a, b) =>
        b.average - a.average ||
        b.totalMarks - a.totalMarks ||
        String(a.code).localeCompare(String(b.code))
    );
}

/**
 * Strict class ranking for one campus/class/term/year/report type.
 * Positions are 1,2,3...N (no shared ranks): average descending, then total
 * marks descending, then student code ascending. Cards with no assessed mark
 * are excluded entirely. ANNUAL cards are ranked from their three TERM cards.
 */
export async function positionsFor(campusId, classId, term, year, settings, type = 'TERM') {
  const campusKey = campusId || 'MAIN';
  if (type === 'ANNUAL') {
    const annual = await annualRanking(campusKey, classId, year, settings);
    return { positions: annual.positions, outOf: annual.outOf };
  }

  const cards = await prisma.reportCard.findMany({
    // Type is filtered below so legacy cards without a type still rank as TERM.
    where: { campusId: campusKey, classId, term, year },
    include: {
      marks: true,
      class: true,
      student: { select: { id: true, code: true } }
    }
  });

  const ranked = rankRows(
    cards
      .filter((card) => !card.type || card.type === type)
      .map((card) => {
        const summary = summariseMarks(card.marks, card.class?.level || 'LOWER_PRIMARY', settings, type);
        return {
          id: card.id,
          average: summary.average,
          totalMarks: summary.totalMarks,
          subjectsAssessed: summary.subjectsAssessed,
          code: card.student?.code || ''
        };
      })
  );

  const positions = new Map();
  ranked.forEach((entry, index) => positions.set(entry.id, index + 1));
  return { positions, outOf: ranked.length };
}

/** Term-by-term data plus the class ranking of ANNUAL cards. */
async function annualRanking(campusId, classId, year, settings) {
  const [cards, termCards] = await Promise.all([
    prisma.reportCard.findMany({
      where: { campusId, classId, year, type: 'ANNUAL' },
      include: { class: true, student: { select: { id: true, code: true } } }
    }),
    prisma.reportCard.findMany({
      where: { campusId, classId, year, term: { in: TERMS } },
      include: { marks: true, class: true }
    })
  ]);

  const termCardsForRanking = termCards.filter((card) => !card.type || card.type === 'TERM');
  const termsByStudent = new Map();
  for (const card of termCardsForRanking) {
    if (!termsByStudent.has(card.studentId)) termsByStudent.set(card.studentId, []);
    termsByStudent.get(card.studentId).push(card);
  }

  const rows = cards.map((card) => {
    const level = card.class?.level || 'LOWER_PRIMARY';
    const cardsByTerm = new Map((termsByStudent.get(card.studentId) || []).map((item) => [item.term, item]));
    const terms = TERMS.map((term) => {
      const termCard = cardsByTerm.get(term);
      const summary = termCard ? summariseMarks(termCard.marks, level, settings, 'TERM') : null;
      return {
        term,
        label: termLabel(term),
        average: summary?.average ?? null,
        grade: summary?.grade ?? '-',
        remark: summary?.remark ?? null,
        position: null,
        outOf: null
      };
    });
    const values = terms.map((item) => item.average).filter((value) => value !== null);
    const overallAverage = averageOf(values);
    return {
      id: card.id,
      studentId: card.studentId,
      code: card.student?.code || '',
      level,
      terms,
      overallAverage,
      overallGrade: gradeFor(overallAverage, level, settings).grade,
      subjectsAssessed: values.length,
      totalMarks: Math.round(values.reduce((acc, value) => acc + Number(value || 0), 0) * 10) / 10
    };
  });

  const ranked = rankRows(rows);
  const positions = new Map();
  ranked.forEach((entry, index) => {
    positions.set(entry.id, index + 1);
  });

  // Term positions are asked for separately by buildReportPayload so that the
  // annual block can include each term's rank without extra round-trips.
  return {
    positions,
    outOf: ranked.length,
    rows,
    cards
  };
}

export async function annualDataFor(campusId, classId, year, settings, studentId, level) {
  const ranking = await annualRanking(campusId, classId, year, settings);
  let row = ranking.rows.find((item) => item.studentId === studentId);

  if (!row) {
    // No ANNUAL card was included in the ranking (e.g. unranked card) - build
    // the same term data directly from this student's TERM cards.
    const termCards = await prisma.reportCard.findMany({
      where: { campusId, classId, year, term: { in: TERMS }, studentId },
      include: { marks: true }
    });
    const byTerm = new Map(
      termCards.filter((card) => !card.type || card.type === 'TERM').map((card) => [card.term, card])
    );
    const terms = TERMS.map((term) => {
      const card = byTerm.get(term);
      const summary = card ? summariseMarks(card.marks, level, settings, 'TERM') : null;
      return {
        term,
        label: termLabel(term),
        average: summary?.average ?? null,
        grade: summary?.grade ?? '-',
        remark: summary?.remark ?? null,
        position: null,
        outOf: null
      };
    });
    const values = terms.map((item) => item.average).filter((value) => value !== null);
    row = {
      terms,
      overallAverage: averageOf(values),
      overallGrade: gradeFor(averageOf(values), level, settings).grade,
      subjectsAssessed: values.length
    };
  }

  // Fill each term's position/outOf from the corresponding TERM ranking.
  const terms = await Promise.all(
    row.terms.map(async (term) => {
      if (term.average === null) return term;
      const ranked = await positionsFor(campusId, classId, term.term, year, settings, 'TERM');
      const termCards = await prisma.reportCard.findMany({
        where: { campusId, classId, year, term: term.term, studentId },
        select: { id: true, type: true }
      });
      const termCard = termCards.find((card) => !card.type || card.type === 'TERM');
      return {
        ...term,
        position: termCard ? ranked.positions.get(termCard.id) || null : null,
        outOf: ranked.outOf
      };
    })
  );

  return {
    terms,
    overallAverage: row.overallAverage,
    overallGrade: row.overallGrade,
    overallPosition: ranking.positions.get(row.id) || null,
    overallOutOf: ranking.outOf
  };
}

/** Stripped, print-ready payload. No comments, audit names or grading config. */
export async function buildReportPayload(reportId, settings) {
  const report = await prisma.reportCard.findUnique({
    where: { id: reportId },
    include: {
      student: { include: { class: true } },
      class: { include: { classTeacher: { select: { id: true, name: true } } } },
      marks: { include: { subject: true, teacher: { select: { id: true, name: true } } } }
    }
  });
  if (!report) return null;

  const campus = CAMPUSES[report.campusId] || CAMPUSES.MAIN;
  const campusId = report.campusId || campus.id;
  const level = report.class?.level || 'LOWER_PRIMARY';
  const type = report.type || 'TERM';
  const marks = markRows(report, settings, type);
  const fullName =
    report.studentName ||
    [report.student?.firstName, report.student?.otherNames, report.student?.lastName].filter(Boolean).join(' ');

  let summary;
  let annual = null;
  let ranking;

  if (type === 'ANNUAL') {
    annual = await annualDataFor(campusId, report.classId, report.year, settings, report.studentId, level);
    summary = {
      subjectsAssessed: annual.terms.filter((term) => term.average !== null).length,
      expectedTotalMarks: null,
      totalMarks: null,
      average: annual.overallAverage,
      grade: annual.overallGrade,
      remark: gradeFor(annual.overallAverage, level, settings).remark,
      aggregate: null,
      passMark: Number(settings?.passMark ?? 50),
      passedSubjects: null,
      failedSubjects: null,
      passPercentage: null,
      position: annual.overallPosition,
      positionLabel: ordinal(annual.overallPosition),
      outOf: annual.overallOutOf
    };
    ranking = { positions: new Map(), outOf: annual.overallOutOf };
  } else {
    const computed = summariseMarks(report.marks, level, settings, type);
    ranking = await positionsFor(campusId, report.classId, report.term, report.year, settings, type);
    const position = ranking.positions.get(report.id) || null;
    summary = {
      subjectsAssessed: computed.subjectsAssessed,
      expectedTotalMarks: computed.expectedTotalMarks,
      totalMarks: computed.totalMarks,
      average: computed.average,
      grade: computed.grade,
      remark: computed.remark,
      aggregate: computed.aggregate,
      passMark: computed.passMark,
      passedSubjects: computed.passedSubjects,
      failedSubjects: computed.failedSubjects,
      passPercentage: computed.passPercentage,
      position,
      positionLabel: ordinal(position),
      outOf: ranking.outOf
    };
  }

  return {
    id: report.id,
    term: report.term,
    termLabel: termLabel(report.term),
    year: report.year,
    type,
    typeLabel: reportTypeLabel(type),
    status: report.status,
    className: report.class?.name || '',
    classTeacherName: report.class?.classTeacher?.name || null,
    level,
    campusId,
    student: {
      name: fullName,
      fullName,
      code: report.student?.code || '',
      className: report.class?.name || '',
      gender: report.student?.gender || null
    },
    marks,
    summary,
    ...(annual ? { annual } : {}),
    school: {
      name: campus.name,
      campusId: campus.id,
      campusName: campus.name,
      campusShort: campus.short,
      campusLocation: campus.location,
      motto: settings.schoolMotto,
      address: settings.schoolAddress || campus.location,
      phone: settings.schoolPhone,
      email: settings.schoolEmail,
      headTeacherName: settings.headTeacherName,
      dosName: settings.dosName
    }
  };
}

export async function getStudentReportCards(studentId) {
  return prisma.reportCard.findMany({
    where: { studentId },
    include: {
      class: true,
      marks: { include: { subject: true } }
    },
    orderBy: [{ year: 'desc' }, { term: 'desc' }]
  });
}
