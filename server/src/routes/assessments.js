import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
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
const STATUS_PRIORITY = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2 };

const recordSchema = z.object({
  studentId: z.string().min(1),
  caScore: z.union([z.number(), z.string(), z.null()]).optional(),
  // Reported separately for MIDTERM reports; excluded from the weighted total.
  midtermScore: z.union([z.number(), z.string(), z.null()]).optional(),
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

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: String(classId), campusId: req.user.campusId }
    });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    // Subject.levels is stored as an array; filter it in JavaScript.
    let subjects = await prisma.subject.findMany({
      where: {
        campusId: req.user.campusId,
        isActive: true
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }]
    });
    subjects = subjects.filter(
      (subject) => Array.isArray(subject.levels) && subject.levels.includes(schoolClass.level)
    );

    if (req.user.role === 'TEACHER') {
      const assigned = teacherSubjectIds(req.user);
      subjects = subjects.filter((subject) => assigned.includes(subject.id));
    }

    if (subjectId) {
      const selected = subjects.find((subject) => subject.id === String(subjectId));
      if (!selected) throw new HttpError(403, 'You are not assigned to teach this subject in this class.');
    }

    const students = await prisma.student.findMany({
      where: { campusId: req.user.campusId, classId: String(classId), isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
    });

    const cards = await prisma.reportCard.findMany({
      where: { campusId: req.user.campusId, classId: String(classId), term, year },
      include: { marks: { where: { campusId: req.user.campusId } } }
    });
    const cardByStudent = new Map(
      cards
        .filter((card) => !card.type || card.type === 'TERM')
        .map((card) => [card.studentId, card])
    );
    // MIDTERM and TERM cards share the same marks. Show the strictest status
    // so a generated MIDTERM report also locks this marks grid.
    const statusByStudent = new Map();
    for (const card of cards) {
      const current = statusByStudent.get(card.studentId);
      if (!current || (STATUS_PRIORITY[card.status] || 0) > (STATUS_PRIORITY[current] || 0)) {
        statusByStudent.set(card.studentId, card.status);
      }
    }

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
          reportStatus: statusByStudent.get(student.id) || null,
          mark: mark
            ? {
                id: mark.id,
                caScore: mark.caScore,
                midtermScore: mark.midtermScore ?? null,
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

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: data.classId, campusId: req.user.campusId }
    });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const subject = await prisma.subject.findFirst({
      where: { id: data.subjectId, campusId: req.user.campusId }
    });
    if (!subject) throw new HttpError(404, 'Subject not found.');
    if (!subject.levels.includes(schoolClass.level)) {
      throw new HttpError(400, `${subject.name} is not offered at ${schoolClass.name}.`);
    }

    if (req.user.role === 'TEACHER' && !teacherSubjectIds(req.user).includes(subject.id)) {
      throw new HttpError(403, 'You are not assigned to teach this subject.');
    }

    const studentIds = data.records.map((record) => record.studentId);
    const validStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        campusId: req.user.campusId,
        classId: data.classId
      },
      select: { id: true, firstName: true, otherNames: true, lastName: true }
    });
    if (validStudents.length !== new Set(studentIds).size) {
      throw new HttpError(400, 'One or more students do not belong to the selected class.');
    }

    const settings = await getSettings(req.user.campusId);
    const existingCards = await prisma.reportCard.findMany({
      where: {
        campusId: req.user.campusId,
        classId: data.classId,
        term: data.term,
        year: data.year
      },
      select: { studentId: true, status: true, type: true }
    });
    const statusByStudent = new Map();
    for (const card of existingCards) {
      const current = statusByStudent.get(card.studentId);
      if (!current || (STATUS_PRIORITY[card.status] || 0) > (STATUS_PRIORITY[current] || 0)) {
        statusByStudent.set(card.studentId, card.status);
      }
    }

    if (
      req.user.role === 'TEACHER' &&
      data.records.some((record) => {
        const status = statusByStudent.get(record.studentId);
        return status && status !== 'DRAFT';
      })
    ) {
      throw new HttpError(
        403,
        'One or more reports are locked after generation. Ask the Head Teacher or Super Admin to reject them before entering marks.'
      );
    }

    let saved = 0;

    const studentNames = new Map(
      validStudents.map((student) => [
        student.id,
        [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' ')
      ])
    );
    const nullableNumber = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    await prisma.$transaction(async (tx) => {
      for (const record of data.records) {
        // Explicit per-type lookup: a TERM card must never collide with a
        // MIDTERM or ANNUAL card for the same student/term/year.
        const cardCandidates = await tx.reportCard.findMany({
          where: {
            campusId: req.user.campusId,
            studentId: record.studentId,
            term: data.term,
            year: data.year
          },
          select: { id: true, type: true }
        });
        let card = cardCandidates.find((candidate) => !candidate.type || candidate.type === 'TERM');
        if (!card) {
          const created = await tx.reportCard.create({
            data: {
              id: randomUUID(),
              campusId: req.user.campusId,
              studentId: record.studentId,
              classId: data.classId,
              term: data.term,
              year: data.year,
              type: 'TERM',
              studentName: studentNames.get(record.studentId) || '',
              createdById: req.user.id,
              status: 'DRAFT'
            }
          });
          card = created;
        }

        const caScore = nullableNumber(record.caScore);
        const midtermScore = nullableNumber(record.midtermScore);
        const examScore = nullableNumber(record.examScore);
        const total = computeTotal(caScore, examScore, settings);
        const gradeInfo = gradeFor(total, schoolClass.level, settings);

        const payload = {
          campusId: req.user.campusId,
          caScore,
          midtermScore,
          examScore,
          total,
          grade: gradeInfo.grade,
          remark: record.remark || gradeInfo.remark,
          competency: assessmentCompetency(schoolClass.level, total, record.competency),
          teacherId: req.user.id
        };

        const existingMark = await tx.mark.findFirst({
          where: {
            campusId: req.user.campusId,
            reportCardId: card.id,
            subjectId: data.subjectId
          },
          select: { id: true }
        });
        if (existingMark) {
          await tx.mark.update({ where: { id: existingMark.id }, data: payload });
        } else {
          await tx.mark.create({
            data: {
              id: randomUUID(),
              ...payload,
              reportCardId: card.id,
              subjectId: data.subjectId
            }
          });
        }
        saved += 1;
      }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Assessment',
      entityId: `${data.classId}:${data.subjectId}:${data.term}:${data.year}`,
      description: `Saved ${saved} ${subject.name} assessment(s) for ${schoolClass.name}, ${data.term} ${data.year}.`,
      after: {
        campusId: req.user.campusId,
        classId: data.classId,
        subjectId: data.subjectId,
        term: data.term,
        year: data.year,
        records: saved
      }
    });

    res.json({ message: `${saved} assessment record(s) saved.`, saved });
  })
);

export default router;
