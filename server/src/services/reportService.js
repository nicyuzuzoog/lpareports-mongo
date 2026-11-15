import { prisma } from '../lib/prisma.js';
import {
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
        competency: mark.competency || null,
        teacher: mark.teacher ? mark.teacher.name : null
      };
    });
}

async function positionsFor(classId, term, year, settings) {
  const cards = await prisma.reportCard.findMany({
    where: { classId, term, year },
    include: {
      marks: true,
      class: true,
      student: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  const ranked = cards
    .map((card) => {
      const average = summariseMarks(card.marks, card.class?.level || 'LOWER_PRIMARY', settings).average;
      return { id: card.id, average };
    })
    .filter((entry) => entry.average !== null)
    .sort((a, b) => b.average - a.average);

  const positions = new Map();
  let lastAverage = null;
  let lastPosition = 0;
  ranked.forEach((entry, index) => {
    const position = entry.average === lastAverage ? lastPosition : index + 1;
    positions.set(entry.id, position);
    lastAverage = entry.average;
    lastPosition = position;
  });

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

  const level = report.class.level;
  const marks = markRows(report, settings);
  const summary = summariseMarks(report.marks, level, settings);
  const { positions, outOf } = await positionsFor(report.classId, report.term, report.year, settings);
  const position = positions.get(report.id) || null;

  let cumulative = null;
  if (report.term === 'TERM3') {
    const yearCards = await prisma.reportCard.findMany({
      where: { studentId: report.studentId, year: report.year },
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
    attendance: {
      present: report.attendancePresent,
      total: report.attendanceTotal,
      percent:
        report.attendancePresent !== null && report.attendanceTotal
          ? Math.round((report.attendancePresent / report.attendanceTotal) * 100)
          : null
    },
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
      name: settings.schoolName,
      motto: settings.schoolMotto,
      address: settings.schoolAddress,
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
