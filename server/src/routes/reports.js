import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import {
  computeTotal,
  effectiveScoreFor,
  gradeFor,
  assessmentCompetency,
  reportTypeLabel
} from '../lib/grading.js';
import { buildReportPayload, summariseMarks, positionsFor } from '../services/reportService.js';
import { buildReportPdf, pdfFileName } from '../lib/pdf.js';
import {
  authenticate,
  allowedClassIds,
  assertClassAccess,
  canApprove,
  requireDeletePermission
} from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const resultTermSchema = z.enum(['TERM1', 'TERM2', 'TERM3', 'ANNUAL']);
const reportTypeSchema = z.enum(['MIDTERM', 'TERM', 'ANNUAL']);
const statusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED']);

const generateSchema = z
  .object({
    classId: z.string().min(1),
    term: z.enum(['TERM1', 'TERM2', 'TERM3']).optional(),
    year: z.number().int().min(2000).max(2100),
    type: reportTypeSchema.default('TERM')
  })
  .refine((data) => data.type === 'ANNUAL' || Boolean(data.term), {
    message: 'Term is required for this report type.',
    path: ['term']
  });

const detailsSchema = z.object({
  teacherComment: z.string().trim().max(600).nullable().optional(),
  dosComment: z.string().trim().max(600).nullable().optional(),
  headComment: z.string().trim().max(600).nullable().optional()
});

const reopenSchema = z.object({ comment: z.string().trim().max(400).optional() });

const marksSchema = z.object({
  marks: z.array(
    z.object({
      subjectId: z.string().min(1),
      caScore: z.union([z.number(), z.string(), z.null()]).optional(),
      // Recorded separately; never included in `total`.
      midtermScore: z.union([z.number(), z.string(), z.null()]).optional(),
      examScore: z.union([z.number(), z.string(), z.null()]).optional(),
      competency: z.string().trim().max(80).optional().nullable(),
      remark: z.string().trim().max(120).optional().nullable()
    })
  )
});

const cardType = (card) => card.type || 'TERM';
const groupKey = (classId, term, year, type) => `${classId}|${term}|${year}|${type}`;

function fullName(student) {
  return [student?.firstName, student?.otherNames, student?.lastName].filter(Boolean).join(' ');
}

/** Rank 1 first; unranked/null cards always sort last. */
function sortByPosition(rows) {
  const value = (row) =>
    row.position === null || row.position === undefined ? Number.MAX_SAFE_INTEGER : Number(row.position);
  return rows.sort(
    (a, b) => value(a) - value(b) || String(a.code || a.student?.code || '').localeCompare(String(b.code || b.student?.code || ''))
  );
}

async function loadReport(reportId, campusId) {
  const report = await prisma.reportCard.findFirst({
    where: { id: reportId, campusId },
    include: {
      class: true,
      student: true,
      marks: {
        where: { campusId },
        include: { subject: true, teacher: { select: { name: true } } }
      }
    }
  });
  if (!report) throw notFound('Report card not found.');
  return report;
}

async function buildAndCheck(reportId, user) {
  const report = await loadReport(reportId, user.campusId);
  await assertClassAccess(user, report.classId);
  return report;
}

/** ANNUAL cards have no own marks, so assess their three TERM cards instead. */
async function assessedCount(report, user) {
  const type = cardType(report);
  if (type !== 'ANNUAL') {
    return report.marks.filter((mark) => effectiveScoreFor(mark, type) !== null).length;
  }
  const termCards = await prisma.reportCard.findMany({
    where: {
      campusId: user.campusId,
      studentId: report.studentId,
      year: report.year,
      term: { in: ['TERM1', 'TERM2', 'TERM3'] }
    },
    include: { marks: true }
  });
  return termCards
    .filter((card) => !card.type || card.type === 'TERM')
    .reduce(
      (total, card) =>
        total + card.marks.filter((mark) => effectiveScoreFor(mark, 'TERM') !== null).length,
      0
    );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, level, status, search } = req.query;
    const term = req.query.term ? resultTermSchema.parse(req.query.term) : undefined;
    const type = req.query.type ? reportTypeSchema.parse(req.query.type) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(5, Number(req.query.pageSize || 25)));

    const accessible = await allowedClassIds(req.user);
    if (classId && !accessible.includes(String(classId))) {
      throw new HttpError(403, 'You do not have access to this class.');
    }

    const settings = await getSettings(req.user.campusId);
    const where = {
      campusId: req.user.campusId,
      ...(classId ? { classId: String(classId) } : { classId: { in: accessible } }),
      ...(term ? { term } : {}),
      ...(type ? { type } : {}),
      ...(year ? { year } : {}),
      ...(status ? { status: statusSchema.parse(status) } : {}),
      ...(level ? { class: { level, campusId: req.user.campusId } } : {}),
      ...(search
        ? {
            student: {
              campusId: req.user.campusId,
              OR: [
                { firstName: { contains: String(search), mode: 'insensitive' } },
                { lastName: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } }
              ]
            }
          }
        : {})
    };

    // Ranks are computed for every class/term/year/type group before paging,
    // so page 2 still shows the correct class positions.
    const cards = await prisma.reportCard.findMany({
      where,
      include: {
        student: true,
        class: true,
        marks: { where: { campusId: req.user.campusId } }
      },
      orderBy: [{ year: 'desc' }, { term: 'desc' }, { student: { lastName: 'asc' } }]
    });

    const groups = new Map();
    for (const card of cards) {
      const key = groupKey(card.classId, card.term, card.year, cardType(card));
      if (!groups.has(key)) {
        groups.set(key, {
          classId: card.classId,
          term: card.term,
          year: card.year,
          type: cardType(card)
        });
      }
    }
    const ranked = await Promise.all(
      [...groups.values()].map(async (group) => [
        groupKey(group.classId, group.term, group.year, group.type),
        await positionsFor(
          req.user.campusId,
          group.classId,
          group.term,
          group.year,
          settings,
          group.type
        )
      ])
    );
    const positionsByGroup = new Map(ranked);

    const reports = cards.map((card) => {
      const cardTypeName = cardType(card);
      const summary = summariseMarks(card.marks, card.class?.level, settings, cardTypeName);
      const ranking =
        positionsByGroup.get(groupKey(card.classId, card.term, card.year, cardTypeName)) ||
        { positions: new Map(), outOf: 0 };
      return {
        id: card.id,
        student: {
          id: card.student?.id,
          code: card.student?.code,
          fullName: fullName(card.student)
        },
        code: card.student?.code,
        className: card.class?.name,
        level: card.class?.level,
        term: card.term,
        year: card.year,
        type: cardTypeName,
        typeLabel: reportTypeLabel(cardTypeName),
        status: card.status,
        average: summary.average,
        grade: summary.grade,
        subjectsAssessed: summary.subjectsAssessed,
        position: ranking.positions.get(card.id) || null,
        outOf: ranking.outOf,
        updatedAt: card.updatedAt
      };
    });
    sortByPosition(reports);

    res.json({
      reports: reports.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: reports.length, pages: Math.max(1, Math.ceil(reports.length / pageSize)) }
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    const settings = await getSettings(req.user.campusId);
    const payload = await buildReportPayload(report.id, settings);
    res.json({ report: payload });
  })
);

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    const settings = await getSettings(req.user.campusId);
    const payload = await buildReportPayload(report.id, settings);
    const buffer = await buildReportPdf(payload, settings);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(payload)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  })
);

router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const data = generateSchema.parse(req.body);
    await assertClassAccess(req.user, data.classId);

    const term = data.type === 'ANNUAL' ? 'ANNUAL' : data.term;
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: data.classId, campusId: req.user.campusId }
    });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const campusId = req.user.campusId;
    const settings = await getSettings(campusId);
    const [students, subjects, existing] = await Promise.all([
      prisma.student.findMany({
        where: { campusId, classId: data.classId, isActive: true }
      }),
      // Subject.levels is Json in MySQL - filter the level array in JS.
      prisma.subject.findMany({
        where: { campusId, isActive: true },
        orderBy: { position: 'asc' }
      }).then((rows) =>
        rows.filter(
          (subject) => Array.isArray(subject.levels) && subject.levels.includes(schoolClass.level)
        )
      ),
      prisma.reportCard.findMany({
        where: { campusId, classId: data.classId, term, year: data.year },
        select: { studentId: true, type: true }
      })
    ]);

    const existingStudents = new Set(
      existing.filter((card) => cardType(card) === data.type).map((card) => card.studentId)
    );

    let created = 0;
    await prisma.$transaction(async (tx) => {
      for (const student of students) {
        let card = await tx.reportCard.findFirst({
          where: { campusId, studentId: student.id, term, year: data.year, type: data.type }
        });
        if (!card) {
          card = await tx.reportCard.create({
            data: {
              id: randomUUID(),
              campusId,
              studentId: student.id,
              classId: data.classId,
              term,
              year: data.year,
              type: data.type,
              studentName: fullName(student),
              createdById: req.user.id,
              status: 'DRAFT'
            }
          });
          created += 1;
        } else if (!card.studentName) {
          await tx.reportCard.update({ where: { id: card.id }, data: { studentName: fullName(student) } });
        }

        if (!subjects.length || data.type === 'ANNUAL') continue;
        const existingSubjectIds = new Set(
          (await tx.mark.findMany({ where: { campusId, reportCardId: card.id }, select: { subjectId: true } }))
            .map((mark) => mark.subjectId)
        );
        const missing = subjects.filter((subject) => !existingSubjectIds.has(subject.id));
        if (missing.length) {
          await tx.mark.createMany({
            data: missing.map((subject) => ({
              id: randomUUID(),
              campusId,
              reportCardId: card.id,
              subjectId: subject.id
            }))
          });
        }
      }
    });

    const allCards = await prisma.reportCard.findMany({
      where: { campusId, classId: data.classId, term, year: data.year },
      include: {
        class: true,
        student: true,
        marks: { where: { campusId } }
      }
    });
    const groupCards = allCards.filter((card) => cardType(card) === data.type);
    const { positions, outOf } = await positionsFor(
      campusId,
      data.classId,
      term,
      data.year,
      settings,
      data.type
    );
    const reports = sortByPosition(
      groupCards.map((card) => {
        const summary = summariseMarks(card.marks, card.class?.level, settings, data.type);
        return {
          id: card.id,
          studentId: card.studentId,
          studentName: card.studentName || fullName(card.student),
          code: card.student?.code,
          className: card.class?.name,
          type: data.type,
          typeLabel: reportTypeLabel(data.type),
          term,
          year: data.year,
          status: card.status,
          average: summary.average,
          grade: summary.grade,
          position: positions.get(card.id) || null,
          outOf
        };
      })
    );

    await writeAudit(req, {
      action: 'GENERATE',
      entity: 'ReportCard',
      entityId: `${data.classId}:${term}:${data.year}:${data.type}`,
      description: `Generated ${created} ${data.type} report card(s) for ${schoolClass.name}, ${term} ${data.year}.`,
      after: {
        campusId,
        classId: data.classId,
        term,
        year: data.year,
        type: data.type,
        created
      }
    });

    res.status(201).json({
      message: `${created} ${data.type} report card(s) generated${
        existingStudents.size ? `, ${existingStudents.size} already existed` : ''
      }.`,
      created,
      skipped: existingStudents.size,
      schoolName: settings.schoolName,
      reports
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    // Comments stay in the database for the audit trail but are never exposed.
    const data = detailsSchema.parse(req.body);
    const report = await buildAndCheck(req.params.id, req.user);

    if (report.status === 'APPROVED' && req.user.role === 'TEACHER') {
      throw new HttpError(403, 'This report is approved and can only be edited by the DOS or Head Teacher.');
    }

    const update = { campusId: req.user.campusId };
    if (['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER', 'TEACHER'].includes(req.user.role)) {
      if (data.teacherComment !== undefined) update.teacherComment = data.teacherComment || null;
    }
    if (['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(req.user.role)) {
      if (data.dosComment !== undefined) update.dosComment = data.dosComment || null;
    }
    if (['SUPER_ADMIN', 'HEAD_TEACHER'].includes(req.user.role)) {
      if (data.headComment !== undefined) update.headComment = data.headComment || null;
    }

    const updated = await prisma.reportCard.update({
      where: { id: report.id, campusId: req.user.campusId },
      data: update
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Updated report details for ${report.student.firstName} ${report.student.lastName} (${report.term} ${report.year}).`,
      before: {
        campusId: req.user.campusId,
        teacherComment: report.teacherComment,
        dosComment: report.dosComment,
        headComment: report.headComment
      },
      after: update
    });

    res.json({ message: 'Report details saved.', report: { id: updated.id } });
  })
);

router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    if (report.status === 'APPROVED') throw new HttpError(400, 'This report is already approved.');
    const assessed = await assessedCount(report, req.user);
    if (!assessed) throw new HttpError(400, 'Record at least one assessment score before submitting.');

    await prisma.reportCard.update({
      where: { id: report.id, campusId: req.user.campusId },
      data: {
        campusId: req.user.campusId,
        status: 'SUBMITTED',
        submittedById: req.user.id,
        submittedAt: new Date(),
        approvedById: null,
        approvedAt: null
      }
    });

    await writeAudit(req, {
      action: 'SUBMIT',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Submitted report for verification: ${report.student.firstName} ${report.student.lastName}, ${report.term} ${report.year}.`,
      after: { status: 'SUBMITTED' }
    });

    res.json({ message: 'Report submitted for verification.' });
  })
);

router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    if (!canApprove(req.user)) {
      throw new HttpError(403, 'Only the DOS, Head Teacher or Super Admin can approve reports.');
    }
    const report = await buildAndCheck(req.params.id, req.user);
    const assessed = await assessedCount(report, req.user);
    if (!assessed) throw new HttpError(400, 'This report has no assessment scores to approve.');

    await prisma.reportCard.update({
      where: { id: report.id, campusId: req.user.campusId },
      data: {
        campusId: req.user.campusId,
        status: 'APPROVED',
        approvedById: req.user.id,
        approvedAt: new Date()
      }
    });

    await writeAudit(req, {
      action: 'APPROVE',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Approved report for ${report.student.firstName} ${report.student.lastName}, ${report.term} ${report.year}.`,
      after: { status: 'APPROVED' }
    });

    res.json({ message: 'Report approved.' });
  })
);

router.post(
  '/:id/reopen',
  asyncHandler(async (req, res) => {
    if (!canApprove(req.user)) {
      throw new HttpError(403, 'Only the DOS, Head Teacher or Super Admin can reopen reports.');
    }
    const { comment } = reopenSchema.parse(req.body || {});
    const report = await buildAndCheck(req.params.id, req.user);

    await prisma.reportCard.update({
      where: { id: report.id, campusId: req.user.campusId },
      data: {
        campusId: req.user.campusId,
        status: 'DRAFT',
        approvedById: null,
        approvedAt: null,
        dosComment: comment || report.dosComment
      }
    });

    await writeAudit(req, {
      action: 'REOPEN',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Returned report to draft for ${report.student.firstName} ${report.student.lastName}, ${report.term} ${report.year}.`,
      before: { campusId: req.user.campusId, status: report.status },
      after: { campusId: req.user.campusId, status: 'DRAFT', comment: comment || null }
    });

    res.json({ message: 'Report returned to draft.' });
  })
);

router.patch(
  '/:id/marks',
  asyncHandler(async (req, res) => {
    if (!canApprove(req.user)) {
      throw new HttpError(403, 'Only the DOS, Head Teacher or Super Admin can edit grades from here.');
    }
    const { marks } = marksSchema.parse(req.body);
    const report = await buildAndCheck(req.params.id, req.user);
    const settings = await getSettings(req.user.campusId);

    const subjects = await prisma.subject.findMany({
      where: {
        id: { in: marks.map((mark) => mark.subjectId) },
        campusId: req.user.campusId
      }
    });
    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

    const nullableNumber = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    await prisma.$transaction(async (tx) => {
      for (const entry of marks) {
        const subject = subjectMap.get(entry.subjectId);
        if (!subject) continue;

        const ca = nullableNumber(entry.caScore);
        const midterm = nullableNumber(entry.midtermScore);
        const exam = nullableNumber(entry.examScore);
        // Mid-term is reported separately and never affects the weighted total.
        const total = computeTotal(ca, exam, settings);
        const gradeInfo = gradeFor(total, report.class.level, settings);
        const payload = {
          campusId: req.user.campusId,
          caScore: ca,
          midtermScore: midterm,
          examScore: exam,
          total,
          grade: gradeInfo.grade,
          remark: entry.remark || gradeInfo.remark,
          competency: assessmentCompetency(report.class.level, total, entry.competency),
          teacherId: req.user.id
        };

        const existing = await tx.mark.findFirst({
          where: {
            campusId: req.user.campusId,
            reportCardId: report.id,
            subjectId: entry.subjectId
          }
        });
        if (existing) {
          await tx.mark.update({ where: { id: existing.id }, data: payload });
        } else {
          await tx.mark.create({
            data: {
              id: randomUUID(),
              ...payload,
              reportCardId: report.id,
              subjectId: entry.subjectId
            }
          });
        }
      }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Mark',
      entityId: report.id,
      description: `Edited grades for ${report.student.firstName} ${report.student.lastName} (${report.term} ${report.year}).`,
      after: { marks }
    });

    res.json({ message: 'Grades updated.' });
  })
);

router.delete(
  '/:id',
  requireDeletePermission,
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    await prisma.reportCard.delete({ where: { id: report.id, campusId: req.user.campusId } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Deleted report card for ${report.student.firstName} ${report.student.lastName}, ${report.term} ${report.year}.`,
      before: {
        campusId: req.user.campusId,
        studentId: report.studentId,
        term: report.term,
        year: report.year
      }
    });

    res.json({ message: 'Report card deleted.' });
  })
);

router.post(
  '/bulk-pdf',
  asyncHandler(async (req, res) => {
    if (!['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(req.user.role)) {
      throw new HttpError(403, 'Only the DOS, Head Teacher or Super Admin can download report packs.');
    }
    const data = generateSchema.extend({ status: statusSchema.optional() }).parse(req.body);
    await assertClassAccess(req.user, data.classId);

    const term = data.type === 'ANNUAL' ? 'ANNUAL' : data.term;
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: data.classId, campusId: req.user.campusId }
    });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const cards = await prisma.reportCard.findMany({
      where: {
        campusId: req.user.campusId,
        classId: data.classId,
        term,
        year: data.year,
        ...(data.status ? { status: data.status } : {})
      },
      include: { student: true },
      orderBy: { student: { lastName: 'asc' } }
    });
    const groupCards = cards.filter((card) => cardType(card) === data.type);
    if (!groupCards.length) throw new HttpError(404, 'No report cards found for this class and term.');

    const settings = await getSettings(req.user.campusId);
    const { positions } = await positionsFor(
      req.user.campusId,
      data.classId,
      term,
      data.year,
      settings,
      data.type
    );
    groupCards.sort((a, b) => (positions.get(a.id) || 999999) - (positions.get(b.id) || 999999));

    const payloads = [];
    for (const card of groupCards) {
      payloads.push(await buildReportPayload(card.id, settings));
    }

    const zipName = `${schoolClass.name.replace(/[^a-z0-9]+/gi, '-')}-${term}-${data.type}-${data.year}-reports.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => {
      console.error('Archive error:', error);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    archive.pipe(res);

    for (const payload of payloads) {
      const buffer = await buildReportPdf(payload, settings);
      archive.append(buffer, { name: pdfFileName(payload) });
    }
    await archive.finalize();

    await writeAudit(req, {
      action: 'DOWNLOAD',
      entity: 'ReportCard',
      entityId: `${data.classId}:${term}:${data.year}:${data.type}`,
      description: `Downloaded ${payloads.length} ${data.type} report card PDF(s) for ${schoolClass.name}, ${term} ${data.year}.`,
      after: {
        campusId: req.user.campusId,
        count: payloads.length,
        status: data.status || 'ALL'
      }
    });
  })
);

export default router;
