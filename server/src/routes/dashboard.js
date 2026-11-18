import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { averageOf, gradeFor } from '../lib/grading.js';
import { summariseMarks, positionsFor } from '../services/reportService.js';
import { allowedClassIds, authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
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
        },
        classTeacher: { select: { name: true } }
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });
    const classIds = classes.map((item) => item.id);

    const [cards, teacherCount] = await Promise.all([
      prisma.reportCard.findMany({
        where: { classId: { in: classIds }, campusId: req.user.campusId, year },
        include: {
          student: true,
          class: true,
          marks: { where: { campusId: req.user.campusId } },
          approvedBy: { select: { name: true } }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.user.count({
        where: { role: 'TEACHER', isActive: true, campusId: req.user.campusId }
      })
    ]);

    const pending = cards.filter((card) => card.status === 'SUBMITTED');
    const approved = cards.filter((card) => card.status === 'APPROVED');
    const drafts = cards.filter((card) => card.status === 'DRAFT');

    const averages = cards
      .map((card) => summariseMarks(card.marks, card.class.level, settings).average)
      .filter((value) => value !== null);

    const termAverages = ['TERM1', 'TERM2', 'TERM3'].map((term) => ({
      term,
      average: averageOf(
        cards
          .filter((card) => card.term === term)
          .map((card) => summariseMarks(card.marks, card.class.level, settings).average)
          .filter((value) => value !== null)
      )
    }));

    const byLevel = ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY'].map((level) => {
      const levelClasses = classes.filter((item) => item.level === level);
      const levelCards = cards.filter((card) => card.class.level === level);
      const levelAverages = levelCards
        .map((card) => summariseMarks(card.marks, level, settings).average)
        .filter((value) => value !== null);
      return {
        level,
        classes: levelClasses.length,
        students: levelClasses.reduce((sum, item) => sum + item.students.length, 0),
        average: averageOf(levelAverages),
        reports: levelCards.length
      };
    });

    const recentCards = cards.slice(0, 6);
    const rankGroups = new Map();
    for (const card of recentCards) {
      const key = `${card.classId}|${card.term}|${card.year}`;
      if (!rankGroups.has(key)) {
        rankGroups.set(key, {
          classId: card.classId,
          term: card.term,
          year: card.year
        });
      }
    }
    const rankedGroups = await Promise.all(
      [...rankGroups.values()].map(async (group) => [
        `${group.classId}|${group.term}|${group.year}`,
        await positionsFor(
          req.user.campusId,
          group.classId,
          group.term,
          group.year,
          settings
        )
      ])
    );
    const positionsByGroup = new Map(rankedGroups);

    const recent = recentCards.map((card) => {
      const summary = summariseMarks(card.marks, card.class.level, settings);
      const key = `${card.classId}|${card.term}|${card.year}`;
      const ranking = positionsByGroup.get(key) || { positions: new Map(), outOf: 0 };
      return {
        id: card.id,
        student: {
          id: card.student.id,
          code: card.student.code,
          fullName: [card.student.firstName, card.student.otherNames, card.student.lastName]
            .filter(Boolean)
            .join(' ')
        },
        className: card.class.name,
        term: card.term,
        year: card.year,
        status: card.status,
        average: summary.average,
        grade: gradeFor(summary.average, card.class.level, settings).grade,
        position: ranking.positions.get(card.id) || null,
        outOf: ranking.outOf
      };
    });

    let lowCount = null;
    if (req.user.role !== 'TEACHER') {
      lowCount = cards.filter((card) => {
        const summary = summariseMarks(card.marks, card.class.level, settings);
        return summary.average !== null && summary.average < settings.lowPerformanceThreshold;
      }).length;
    }

    const teacherClasses = req.user.classes.map((entry) => ({
      id: entry.class.id,
      name: entry.class.name,
      level: entry.class.level,
      students: classes.find((item) => item.id === entry.classId)?.students.length ?? 0
    }));

    let recentAudit = [];
    if (req.user.role === 'SUPER_ADMIN') {
      recentAudit = await prisma.auditLog.findMany({
        where: { campusId: req.user.campusId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          userName: true,
          userRole: true,
          action: true,
          entity: true,
          description: true,
          createdAt: true
        }
      });
    }

    res.json({
      year,
      school: {
        name: settings.schoolName,
        motto: settings.schoolMotto
      },
      totals: {
        students: classes.reduce((sum, item) => sum + item.students.length, 0),
        classes: classes.length,
        teachers: teacherCount,
        reports: cards.length,
        pending: pending.length,
        approved: approved.length,
        drafts: drafts.length,
        average: averageOf(averages),
        lowPerformers: lowCount
      },
      byLevel,
      termAverages,
      recentReports: recent,
      teacherClasses,
      mySubjects: req.user.subjects.map((entry) => ({
        id: entry.subject.id,
        name: entry.subject.name,
        code: entry.subject.code
      })),
      criteria: {
        passMark: settings.passMark,
        lowPerformanceThreshold: settings.lowPerformanceThreshold
      },
      recentAudit
    });
  })
);

export default router;
