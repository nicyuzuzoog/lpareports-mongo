import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { averageOf, gradeFor } from '../lib/grading.js';
import { summariseMarks } from '../services/reportService.js';
import { allowedClassIds, authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

const PRIMARY_LEVELS = ['LOWER_PRIMARY', 'UPPER_PRIMARY'];
const TERMS = ['TERM1', 'TERM2', 'TERM3'];

function ensurePrimaryForDos(user, level) {
  if (user.role === 'DOS' && level && !PRIMARY_LEVELS.includes(level)) {
    throw new HttpError(403, 'The Dean of Studies analytics cover the Primary section only.');
  }
}

async function scopedClasses(user, { level, classId } = {}) {
  ensurePrimaryForDos(user, level);
  const accessible = await allowedClassIds(user);
  if (classId && !accessible.includes(classId)) {
    throw new HttpError(403, 'You do not have access to this class.');
  }
  return prisma.schoolClass.findMany({
    where: {
      id: classId ? classId : { in: accessible },
      campusId: user.campusId,
      ...(level ? { level } : {})
    },
    include: {
      students: {
        where: { isActive: true, campusId: user.campusId },
        select: { id: true }
      }
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }]
  });
}

async function cardsFor(classIds, year, term, campusId) {
  const cards = await prisma.reportCard.findMany({
    where: {
      classId: { in: classIds },
      campusId,
      year,
      ...(term ? { term } : {})
    },
    include: {
      marks: {
        where: { campusId },
        include: { subject: true }
      },
      student: {
        select: { id: true, code: true, firstName: true, lastName: true, otherNames: true }
      },
      class: true
    }
  });
  // Term analytics ignore MIDTERM and ANNUAL cards; legacy null types count as TERM.
  return cards.filter((card) => !card.type || card.type === 'TERM');
}

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.user.campusId);
    const year = Number(req.query.year || new Date().getFullYear());
    const accessible = await allowedClassIds(req.user);
    const classes = await prisma.schoolClass.findMany({
      where: { id: { in: accessible }, campusId: req.user.campusId },
      include: {
        students: {
          where: { isActive: true, campusId: req.user.campusId },
          select: { id: true }
        }
      }
    });
    const classIds = classes.map((item) => item.id);

    const [allCards, pending, approved, teachers] = await Promise.all([
      prisma.reportCard.findMany({
        where: { classId: { in: classIds }, campusId: req.user.campusId, year },
        include: { marks: { where: { campusId: req.user.campusId } }, class: true }
      }),
      prisma.reportCard.count({
        where: {
          classId: { in: classIds },
          campusId: req.user.campusId,
          year,
          type: 'TERM',
          status: 'SUBMITTED'
        }
      }),
      prisma.reportCard.count({
        where: {
          classId: { in: classIds },
          campusId: req.user.campusId,
          year,
          type: 'TERM',
          status: 'APPROVED'
        }
      }),
      prisma.user.count({
        where: { role: 'TEACHER', isActive: true, campusId: req.user.campusId }
      })
    ]);
    const cards = allCards.filter((card) => !card.type || card.type === 'TERM');

    const byLevel = {};
    for (const level of ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY']) {
      const levelClasses = classes.filter((item) => item.level === level);
      const levelCards = cards.filter((card) => card.class.level === level);
      const averages = levelCards
        .map((card) => summariseMarks(card.marks, level, settings).average)
        .filter((value) => value !== null);
      byLevel[level] = {
        classes: levelClasses.length,
        students: levelClasses.reduce((sum, item) => sum + item.students.length, 0),
        reports: levelCards.length,
        average: averageOf(averages)
      };
    }

    const termAverages = TERMS.map((term) => {
      const termCards = cards.filter((card) => card.term === term);
      return {
        term,
        average: averageOf(
          termCards
            .map((card) => summariseMarks(card.marks, card.class.level, settings).average)
            .filter((value) => value !== null)
        ),
        reports: termCards.length
      };
    });

    res.json({
      year,
      totals: {
        students: classes.reduce((sum, item) => sum + item.students.length, 0),
        classes: classes.length,
        teachers,
        reports: cards.length,
        pending,
        approved,
        passMark: settings.passMark
      },
      byLevel,
      termAverages,
      criteria: {
        passMark: settings.passMark,
        lowPerformanceThreshold: settings.lowPerformanceThreshold,
        lowPerformanceMinSubjects: settings.lowPerformanceMinSubjects
      }
    });
  })
);

router.get(
  '/progression',
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.user.campusId);
    const year = Number(req.query.year || new Date().getFullYear());
    const level = req.query.level ? String(req.query.level) : undefined;
    const classes = await scopedClasses(req.user, { level });

    const cards = await cardsFor(classes.map((item) => item.id), year, undefined, req.user.campusId);
    const settingsPass = settings.passMark;

    const progression = classes.map((schoolClass) => {
      const classCards = cards.filter((card) => card.classId === schoolClass.id);
      const terms = {};
      for (const term of TERMS) {
        const termCards = classCards.filter((card) => card.term === term);
        const averages = termCards
          .map((card) => summariseMarks(card.marks, schoolClass.level, settings).average)
          .filter((value) => value !== null);
        const passed = averages.filter((value) => value >= settingsPass).length;
        terms[term] = {
          average: averageOf(averages),
          assessed: averages.length,
          passRate: averages.length ? Math.round((passed / averages.length) * 100) : null,
          approved: termCards.filter((card) => card.status === 'APPROVED').length,
          reports: termCards.length
        };
      }
      const allAverages = classCards
        .map((card) => summariseMarks(card.marks, schoolClass.level, settings).average)
        .filter((value) => value !== null);
      return {
        id: schoolClass.id,
        name: schoolClass.name,
        level: schoolClass.level,
        students: schoolClass.students.length,
        overallAverage: averageOf(allAverages),
        terms
      };
    });

    res.json({ year, level: level || 'ALL', progression });
  })
);

router.get(
  '/low-performers',
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.user.campusId);
    const year = Number(req.query.year || new Date().getFullYear());
    const term = req.query.term ? String(req.query.term) : 'TERM3';
    const level = req.query.level ? String(req.query.level) : undefined;
    const threshold = req.query.threshold ? Number(req.query.threshold) : settings.lowPerformanceThreshold;
    const minSubjects = req.query.minSubjects
      ? Number(req.query.minSubjects)
      : settings.lowPerformanceMinSubjects;

    if (req.user.role === 'TEACHER') {
      throw new HttpError(403, 'Low-performance analysis is available to the DOS, Head Teacher and Super Admin.');
    }

    const classes = await scopedClasses(req.user, { level, classId: req.query.classId ? String(req.query.classId) : undefined });
    const cards = await cardsFor(classes.map((item) => item.id), year, term, req.user.campusId);

    const students = cards.map((card) => {
      const summary = summariseMarks(card.marks, card.class.level, settings);
      const below = card.marks
        .filter((mark) => mark.total !== null && mark.total < threshold)
        .map((mark) => ({ subject: mark.subject?.name, total: mark.total }))
        .sort((a, b) => a.total - b.total);

      return {
        reportId: card.id,
        studentId: card.student.id,
        code: card.student.code,
        name: [card.student.firstName, card.student.otherNames, card.student.lastName]
          .filter(Boolean)
          .join(' '),
        className: card.class.name,
        level: card.class.level,
        term: card.term,
        status: card.status,
        average: summary.average,
        grade: summary.grade,
        subjectsBelow: below.length,
        weakestSubjects: below.slice(0, 4),
        isLow: summary.average !== null && (summary.average < threshold || below.length >= minSubjects)
      };
    });

    const low = students
      .filter((student) => student.isLow)
      .sort((a, b) => (a.average ?? 101) - (b.average ?? 101));

    res.json({
      year,
      term,
      threshold,
      minSubjects,
      passMark: settings.passMark,
      totalAssessed: students.length,
      lowPerformers: low,
      distribution: {
        below40: students.filter((s) => s.average !== null && s.average < 40).length,
        between40and49: students.filter((s) => s.average !== null && s.average >= 40 && s.average < 50).length,
        between50and69: students.filter((s) => s.average !== null && s.average >= 50 && s.average < 70).length,
        above70: students.filter((s) => s.average !== null && s.average >= 70).length
      }
    });
  })
);

router.get(
  '/class/:classId',
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.user.campusId);
    const year = Number(req.query.year || new Date().getFullYear());
    const accessible = await allowedClassIds(req.user);
    if (!accessible.includes(req.params.classId)) {
      throw new HttpError(403, 'You do not have access to this class.');
    }

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: req.params.classId, campusId: req.user.campusId },
      include: {
        students: {
          where: { isActive: true, campusId: req.user.campusId }
        }
      }
    });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');
    ensurePrimaryForDos(req.user, schoolClass.level);

    const allCards = await prisma.reportCard.findMany({
      where: { classId: schoolClass.id, campusId: req.user.campusId, year },
      include: {
        marks: {
          where: { campusId: req.user.campusId },
          include: { subject: true }
        },
        class: true
      }
    });
    const cards = allCards.filter((card) => !card.type || card.type === 'TERM');

    const byStudent = new Map();
    for (const card of cards) {
      if (!byStudent.has(card.studentId)) {
        byStudent.set(card.studentId, {});
      }
      const summary = summariseMarks(card.marks, schoolClass.level, settings);
      byStudent.get(card.studentId)[card.term] = {
        reportId: card.id,
        average: summary.average,
        grade: summary.grade,
        status: card.status
      };
    }

    const rows = schoolClass.students.map((student) => {
      const terms = byStudent.get(student.id) || {};
      const values = Object.values(terms)
        .map((entry) => entry.average)
        .filter((value) => value !== null && value !== undefined);
      const overall = averageOf(values);
      return {
        id: student.id,
        code: student.code,
        name: [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' '),
        terms: {
          TERM1: terms.TERM1 || null,
          TERM2: terms.TERM2 || null,
          TERM3: terms.TERM3 || null
        },
        overall,
        grade: gradeFor(overall, schoolClass.level, settings).grade
      };
    });

    const subjectNames = new Map();
    const subjectPerformance = {};
    for (const card of cards) {
      for (const mark of card.marks) {
        if (mark.total === null || mark.total === undefined) continue;
        subjectNames.set(mark.subjectId, mark.subject?.name || 'Subject');
        if (!subjectPerformance[mark.subjectId]) {
          subjectPerformance[mark.subjectId] = { TERM1: [], TERM2: [], TERM3: [] };
        }
        subjectPerformance[mark.subjectId][card.term].push(mark.total);
      }
    }

    res.json({
      year,
      passMark: Number(settings.passMark ?? 50),
      class: { id: schoolClass.id, name: schoolClass.name, level: schoolClass.level },
      students: rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)),
      subjects: Object.entries(subjectPerformance).map(([subjectId, terms]) => ({
        subjectId,
        subject: subjectNames.get(subjectId),
        TERM1: averageOf(terms.TERM1),
        TERM2: averageOf(terms.TERM2),
        TERM3: averageOf(terms.TERM3)
      }))
    });
  })
);

export default router;
