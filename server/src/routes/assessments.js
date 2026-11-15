import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import {
  assessmentCompetency,
  computeTotal,
  gradeFor
} from '../lib/grading.js';
import { getSettings } from '../lib/settings.js';
import {
  authenticate,
  assertClassAccess,
  teacherSubjectIds
} from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const termSchema = z.enum(['TERM1', 'TERM2', 'TERM3']);

const recordSchema = z.object({
  studentId: z.string().min(1),
  caScore: z.union([z.number(), z.string(), z.null()]).optional(),
  examScore: z.union([z.number(), z.string(), z.null()]).optional(),
  competency: z.string().trim().max(80).optional().nullable(),
  remark: z.string().trim().max(120).optional().nullable()
});

const bulkSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  term: termSchema,
  year: z.number().int().min(2000).max(2100),
  records: z.array(recordSchema).max(300)
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, subjectId } = req.query;
    const term = termSchema.parse(req.query.term || 'TERM1');
    const year = Number(req.query.year || new Date().getFullYear());
    if (!classId) throw new HttpError(400, 'Select a class.');

    await assertClassAccess(req.user, String(classId));

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: String(classId) } });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    let subjects = await prisma.subject.findMany({
      where: { isActive: true, levels: { has: schoolClass.level } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }]
    });

    if (req.user.role === 'TEACHER') {
      const assigned = teacherSubjectIds(req.user);
      subjects = subjects.filter((subject) => assigned.includes(subject.id));
    }

    if (subjectId) {
      const selected = subjects.find((subject) => subject.id === String(subjectId));
      if (!selected) throw new HttpError(403, 'You are not assigned to teach this subject in this class.');
    }

    const students = await prisma.student.findMany({
      where: { classId: String(classId), isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
    });

    const cards = await prisma.reportCard.findMany({
      where: { classId: String(classId), term, year },
      include: { marks: true }
    });
    const cardByStudent = new Map(cards.map((card) => [card.studentId, card]));

    res.json({
      class: { id: schoolClass.id, name: schoolClass.name, level: schoolClass.level },
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        code: subject.code
      })),
      students: students.map((student) => {
        const card = cardByStudent.get(student.id);
        const mark = subjectId
          ? card?.marks.find((entry) => entry.subjectId === String(subjectId))
          : null;
        return {
          id: student.id,
          code: student.code,
          fullName: [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' '),
          reportCardId: card?.id || null,
          reportStatus: card?.status || null,
          mark: mark
            ? {
                id: mark.id,
                caScore: mark.caScore,
                examScore: mark.examScore,
                total: mark.total,
                grade: mark.grade,
                competency: mark.competency,
                remark: mark.remark
              }
            : null
        };
      }),
      term,
      year
    });
  })
);

router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const data = bulkSchema.parse(req.body);
    await assertClassAccess(req.user, data.classId);

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.classId } });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) throw new HttpError(404, 'Subject not found.');
    if (!subject.levels.includes(schoolClass.level)) {
      throw new HttpError(400, `${subject.name} is not offered at ${schoolClass.name}.`);
    }

    if (req.user.role === 'TEACHER' && !teacherSubjectIds(req.user).includes(subject.id)) {
      throw new HttpError(403, 'You are not assigned to teach this subject.');
    }

    const studentIds = data.records.map((record) => record.studentId);
    const validStudents = await prisma.student.findMany({
      where: { id: { in: studentIds }, classId: data.classId },
      select: { id: true }
    });
    if (validStudents.length !== new Set(studentIds).size) {
      throw new HttpError(400, 'One or more students do not belong to the selected class.');
    }

    const settings = await getSettings();
    const existingCards = await prisma.reportCard.findMany({
      where: { classId: data.classId, term: data.term, year: data.year },
      select: { studentId: true, status: true }
    });
    const statusByStudent = new Map(existingCards.map((card) => [card.studentId, card.status]));

    if (
      req.user.role === 'TEACHER' &&
      data.records.some((record) => statusByStudent.get(record.studentId) === 'APPROVED')
    ) {
      throw new HttpError(403, 'One or more reports are already approved and can no longer be edited by a teacher.');
    }

    let saved = 0;

    await prisma.$transaction(async (tx) => {
      for (const record of data.records) {
        const card = await tx.reportCard.upsert({
          where: {
            studentId_term_year: {
              studentId: record.studentId,
              term: data.term,
              year: data.year
            }
          },
          update: {},
          create: {
            studentId: record.studentId,
            classId: data.classId,
            term: data.term,
            year: data.year,
            createdById: req.user.id
          }
        });

        const caScore = record.caScore === null || record.caScore === '' ? null : Number(record.caScore);
        const examScore =
          record.examScore === null || record.examScore === '' ? null : Number(record.examScore);
        const total = computeTotal(caScore, examScore, settings);
        const gradeInfo = gradeFor(total, schoolClass.level, settings);

        const payload = {
          caScore: caScore === null || Number.isNaN(caScore) ? null : caScore,
          examScore: examScore === null || Number.isNaN(examScore) ? null : examScore,
          total,
          grade: gradeInfo.grade,
          remark: record.remark || gradeInfo.remark,
          competency: assessmentCompetency(schoolClass.level, total, record.competency),
          teacherId: req.user.role === 'TEACHER' ? req.user.id : req.user.id
        };

        await tx.mark.upsert({
          where: {
            reportCardId_subjectId: {
              reportCardId: card.id,
              subjectId: data.subjectId
            }
          },
          update: payload,
          create: { ...payload, reportCardId: card.id, subjectId: data.subjectId }
        });
        saved += 1;
      }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Assessment',
      entityId: `${data.classId}:${data.subjectId}:${data.term}:${data.year}`,
      description: `Saved ${saved} ${subject.name} assessment(s) for ${schoolClass.name}, ${data.term} ${data.year}.`,
      after: { classId: data.classId, subjectId: data.subjectId, term: data.term, year: data.year, records: saved }
    });

    res.json({ message: `${saved} assessment record(s) saved.`, saved });
  })
);

export default router;
