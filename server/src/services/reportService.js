import { prisma } from '../lib/prisma.js';
import {
  CAMPUSES,
  averageOf,
  gradeFor,
  ordinal,
  scalesFor,
  termLabel
} from '../lib/grading.js';

export function summariseMarks(marks, level, settings) {
  const assessed = marks.filter((mark) => mark.total !== null && mark.total !== undefined);
  const average = averageOf(assessed.map((mark) => mark.total));
  const gradeInfo = gradeFor(average, level, settings);
  const points = assessed
    .map((mark) => gradeFor(mark.total, level, settings).points)
    .filter((p) => p !== null);
  const aggregate = points.length ? points.reduce((a, b) => a + b, 0) : null;

  return {
    subjectsAssessed: assessed.length,
    totalMarks: Math.round(assessed.reduce((acc, m) => acc + Number(m.total || 0), 0) * 10) / 10,
    average,
    grade: gradeInfo.grade,
    remark: gradeInfo.remark,
    aggregate,
    passMark: Number(settings?.passMark ?? 50)
  };
}

export function markRows(report, settings) {
  return (report.marks || [])
    .slice()
    .sort((a, b) => (a.subject.position ?? 0) - (b.subject.position ?? 0) || a.subject.name.localeCompare(b.subject.name))
    .map((mark) => {
      const gradeInfo = gradeFor(mark.total, report.class.level, settings);
      return {
        id: mark.id,
        subjectId: mark.subjectId,
        subject: mark.subject.name,
        code: mark.subject.code,
        caScore: mark.caScore,
        examScore: mark.examScore,
        total: mark.total,
        grade: gradeInfo.grade,
        remark: gradeInfo.remark,
        points: gradeInfo.points,
        competency: mark.competency || null,
        teacher: mark.teacher ? mark.teacher.name : null
      };
    });
}

/**
 * Strict class ranking for one campus/class/term/year.
 * Positions are 1,2,3...N (no shared ranks): average descending, then total
 * marks descending, then student code ascending. Cards without an assessed
 * mark are excluded entirely.
 */
export async function positionsFor(campusId, classId, term, year, settings) {
  const campusKey = campusId || 'MAIN';
  const cards = await prisma.reportCard.findMany({
    where: { campusId: campusKey, classId, term, year },
    include: {
      marks: true,
      class: true,
      student: { select: { id: true, code: true } }
    }
  });

  const ranked = cards
    .filter((card) => !card.campusId || card.campusId === campusKey)
    .map((card) => {
      const summary = summariseMarks(card.marks, card.class?.level || 'LOWER_PRIMARY', settings);
      return {
        id: card.id,
        average: summary.average,
        totalMarks: summary.totalMarks,
        subjectsAssessed: summary.subjectsAssessed,
        code: card.student?.code || ''
      };
    })
    .filter((entry) => entry.average !== null && entry.subjectsAssessed !== 0)
    .sort((a, b) =>
      b.average - a.average ||
      b.totalMarks - a.totalMarks ||
      String(a.code).localeCompare(String(b.code))
    );

  const positions = new Map();
  ranked.forEach((entry, index) => positions.set(entry.id, index + 1));

  return { positions, outOf: ranked.length };
}

export async function buildReportPayload(reportId, settings) {
  const report = await prisma.reportCard.findUnique({
    where: { id: reportId },
    include: {
      student: { include: { class: true } },
      class: true,
      marks: { include: { subject: true, teacher: { select: { id: true, name: true } } } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } }
    }
  });

  if (!report) return null;

  const campus = CAMPUSES[report.campusId] || CAMPUSES.MAIN;
  const level = report.class.level;
  const marks = markRows(report, settings);
  const summary = summariseMarks(report.marks, level, settings);
  const { positions, outOf } = await positionsFor(
    report.campusId || campus.id,
    report.classId,
    report.term,
    report.year,
    settings
  );
  const position = positions.get(report.id) || null;

  let cumulative = null;
  if (report.term === 'TERM3') {
    const yearCards = await prisma.reportCard.findMany({
      where: { campusId: campus.id, studentId: report.studentId, year: report.year },
      include: {
        marks: { include: { subject: true } },
        class: true
      },
      orderBy: { term: 'asc' }
    });

    const byTerm = Object.fromEntries(yearCards.map((card) => [card.term, card]));
    const termAverages = ['TERM1', 'TERM2', 'TERM3'].map((term) => {
      const card = byTerm[term];
      if (!card) return { term, label: termLabel(term), average: null, grade: '-' };
      const avg = summariseMarks(card.marks, card.class.level, settings).average;
      return {
        term,
        label: termLabel(term),
        average: avg,
        grade: gradeFor(avg, card.class.level, settings).grade
      };
    });

    const subjectIds = new Set();
    yearCards.forEach((card) => card.marks.forEach((mark) => subjectIds.add(mark.subjectId)));

    const cumulativeSubjects = [...subjectIds]
      .map((subjectId) => {
        const t1 = byTerm.TERM1?.marks.find((m) => m.subjectId === subjectId)?.total ?? null;
        const t2 = byTerm.TERM2?.marks.find((m) => m.subjectId === subjectId)?.total ?? null;
        const t3 = byTerm.TERM3?.marks.find((m) => m.subjectId === subjectId)?.total ?? null;
        const subject = byTerm.TERM3?.marks.find((m) => m.subjectId === subjectId)?.subject
          || byTerm.TERM2?.marks.find((m) => m.subjectId === subjectId)?.subject
          || byTerm.TERM1?.marks.find((m) => m.subjectId === subjectId)?.subject;
        const values = [t1, t2, t3].filter((v) => v !== null && v !== undefined);
        const average = averageOf(values);
        return {
          subjectId,
          subject: subject?.name || 'Subject',
          position: subject?.position ?? 0,
          t1,
          t2,
          t3,
          average,
          grade: gradeFor(average, level, settings).grade,
          remark: gradeFor(average, level, settings).remark
        };
      })
      .sort((a, b) => a.position - b.position || a.subject.localeCompare(b.subject));

    const termAverageValues = termAverages.map((t) => t.average).filter((v) => v !== null);
    const overallAverage = averageOf(termAverageValues);

    cumulative = {
      termAverages,
      subjects: cumulativeSubjects,
      overallAverage,
      overallGrade: gradeFor(overallAverage, level, settings).grade,
      overallRemark: gradeFor(overallAverage, level, settings).remark
    };
  }

  return {
    id: report.id,
    term: report.term,
    termLabel: termLabel(report.term),
    year: report.year,
    status: report.status,
    className: report.class.name,
    level,
    campusId: campus.id,
    student: {
      id: report.student.id,
      code: report.student.code,
      firstName: report.student.firstName,
      lastName: report.student.lastName,
      otherNames: report.student.otherNames,
      fullName: [report.student.firstName, report.student.otherNames, report.student.lastName]
        .filter(Boolean)
        .join(' '),
      gender: report.student.gender,
      guardianName: report.student.guardianName,
      guardianPhone: report.student.guardianPhone
    },
    marks,
    gradingScale: scalesFor(settings, level),
    weights: {
      coursework: Number(settings?.courseworkWeight ?? 40),
      exam: Number(settings?.examWeight ?? 60)
    },
    summary: {
      ...summary,
      position,
      positionLabel: ordinal(position),
      outOf
    },
    cumulative,
    comments: {
      teacher: report.teacherComment,
      dos: report.dosComment,
      headTeacher: report.headComment
    },
    submitted: report.submittedBy
      ? { by: report.submittedBy.name, at: report.submittedAt }
      : null,
    approved: report.approvedBy
      ? { by: report.approvedBy.name, at: report.approvedAt }
      : null,
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
    },
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
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
