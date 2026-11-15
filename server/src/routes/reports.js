import { Router } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { computeTotal, gradeFor, assessmentCompetency, averageOf } from '../lib/grading.js';
import { buildReportPayload, summariseMarks } from '../services/reportService.js';
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

const termSchema = z.enum(['TERM1', 'TERM2', 'TERM3']);
const statusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED']);

const generateSchema = z.object({
  classId: z.string().min(1),
  term: termSchema,
  year: z.number().int().min(2000).max(2100)
});

const detailsSchema = z.object({
  attendancePresent: z.number().int().min(0).nullable().optional(),
  attendanceTotal: z.number().int().min(0).nullable().optional(),
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
      examScore: z.union([z.number(), z.string(), z.null()]).optional(),
      competency: z.string().trim().max(80).optional().nullable(),
      remark: z.string().trim().max(120).optional().nullable()
    })
  )
});

async function loadReport(reportId) {
  const report = await prisma.reportCard.findUnique({
    where: { id: reportId },
    include: {
      class: true,
      student: true,
      marks: { include: { subject: true, teacher: { select: { name: true } } } }
    }
  });
  if (!report) throw notFound('Report card not found.');
  return report;
}

async function buildAndCheck(reportId, user) {
  const report = await loadReport(reportId);
  await assertClassAccess(user, report.classId);
  return report;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, level, status, search } = req.query;
    const term = req.query.term ? termSchema.parse(req.query.term) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(5, Number(req.query.pageSize || 25)));

    const accessible = await allowedClassIds(req.user);
    if (classId && !accessible.includes(String(classId))) {
      throw new HttpError(403, 'You do not have access to this class.');
    }

    const settings = await getSettings();
    const where = {
      ...(classId ? { classId: String(classId) } : { classId: { in: accessible } }),
      ...(term ? { term } : {}),
      ...(year ? { year } : {}),
      ...(status ? { status: statusSchema.parse(status) } : {}),
      ...(level ? { class: { level } } : {}),
      ...(search
        ? {
            student: {
              OR: [
                { firstName: { contains: String(search), mode: 'insensitive' } },
                { lastName: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } }
              ]
            }
          }
        : {})
    };

    const [total, cards] = await Promise.all([
      prisma.reportCard.count({ where }),
      prisma.reportCard.findMany({
        where,
        include: {
          student: true,
          class: true,
          marks: true,
          approvedBy: { select: { name: true } }
        },
        orderBy: [{ year: 'desc' }, { term: 'desc' }, { student: { lastName: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    res.json({
      reports: cards.map((card) => {
        const summary = summariseMarks(card.marks, card.class.level, settings);
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
          level: card.class.level,
          term: card.term,
          year: card.year,
          status: card.status,
          average: summary.average,
          grade: summary.grade,
          subjectsAssessed: summary.subjectsAssessed,
          approvedBy: card.approvedBy?.name || null,
          updatedAt: card.updatedAt
        };
      }),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    const settings = await getSettings();
    const payload = await buildReportPayload(report.id, settings);
    res.json({ report: payload });
  })
);

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const report = await buildAndCheck(req.params.id, req.user);
    const settings = await getSettings();
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

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.classId } });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const settings = await getSettings();
    const [students, subjects, existing] = await Promise.all([
      prisma.student.findMany({ where: { classId: data.classId, isActive: true } }),
      prisma.subject.findMany({
        where: { isActive: true, levels: { has: schoolClass.level } },
        orderBy: { position: 'asc' }
      }),
      prisma.reportCard.findMany({
        where: { classId: data.classId, term: data.term, year: data.year },
        select: { studentId: true }
      })
    ]);

    const existingStudents = new Set(existing.map((card) => card.studentId));
    const toCreate = students.filter((student) => !existingStudents.has(student.id));

    let created = 0;
    await prisma.$transaction(async (tx) => {
      for (const student of toCreate) {
        const card = await tx.reportCard.create({
          data: {
            studentId: student.id,
            classId: data.classId,
            term: data.term,
            year: data.year,
            createdById: req.user.id
          }
        });
        if (subjects.length) {
          await tx.mark.createMany({
            data: subjects.map((subject) => ({ reportCardId: card.id, subjectId: subject.id }))
          });
        }
        created += 1;
      }
    });

    await writeAudit(req, {
      action: 'GENERATE',
      entity: 'ReportCard',
      entityId: `${data.classId}:${data.term}:${data.year}`,
      description: `Generated ${created} report card(s) for ${schoolClass.name}, ${data.term} ${data.year}. ${students.length - created} already existed.`,
      after: { classId: data.classId, term: data.term, year: data.year, created }
    });

    res.status(201).json({
      message: `${created} report card(s) generated${existing.length ? `, ${existing.length} already existed` : ''}.`,
      created,
      skipped: existing.length,
      schoolName: settings.schoolName
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = detailsSchema.parse(req.body);
    const report = await buildAndCheck(req.params.id, req.user);

    if (report.status === 'APPROVED' && req.user.role === 'TEACHER') {
      throw new HttpError(403, 'This report is approved and can only be edited by the DOS or Head Teacher.');
    }

    const nextPresent =
      data.attendancePresent === undefined ? report.attendancePresent : data.attendancePresent;
    const nextTotal = data.attendanceTotal === undefined ? report.attendanceTotal : data.attendanceTotal;
    if (nextPresent !== null && nextTotal !== null && nextPresent > nextTotal) {
      throw new HttpError(400, 'Days present cannot be more than the total school days.');
    }

    const update = { attendancePresent: nextPresent, attendanceTotal: nextTotal };
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
      where: { id: report.id },
      data: update
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Updated report details for ${report.student.firstName} ${report.student.lastName} (${report.term} ${report.year}).`,
      before: {
        attendancePresent: report.attendancePresent,
        attendanceTotal: report.attendanceTotal,
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
    const assessed = report.marks.filter((mark) => mark.total !== null).length;
    if (!assessed) throw new HttpError(400, 'Record at least one assessment score before submitting.');

    await prisma.reportCard.update({
      where: { id: report.id },
      data: {
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
    const assessed = report.marks.filter((mark) => mark.total !== null).length;
    if (!assessed) throw new HttpError(400, 'This report has no assessment scores to approve.');

    await prisma.reportCard.update({
      where: { id: report.id },
      data: {
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
      where: { id: report.id },
      data: {
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
      before: { status: report.status },
      after: { status: 'DRAFT', comment: comment || null }
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
    const settings = await getSettings();

    const subjects = await prisma.subject.findMany({
      where: { id: { in: marks.map((mark) => mark.subjectId) } }
    });
    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

    await prisma.$transaction(async (tx) => {
      for (const entry of marks) {
        const subject = subjectMap.get(entry.subjectId);
        if (!subject) continue;

        const ca = entry.caScore === null || entry.caScore === '' ? null : Number(entry.caScore);
        const exam = entry.examScore === null || entry.examScore === '' ? null : Number(entry.examScore);
        const total = computeTotal(ca, exam, settings);
        const gradeInfo = gradeFor(total, report.class.level, settings);

        await tx.mark.upsert({
          where: {
            reportCardId_subjectId: { reportCardId: report.id, subjectId: entry.subjectId }
          },
          update: {
            caScore: Number.isNaN(ca) ? null : ca,
            examScore: Number.isNaN(exam) ? null : exam,
            total,
            grade: gradeInfo.grade,
            remark: entry.remark || gradeInfo.remark,
            competency: assessmentCompetency(report.class.level, total, entry.competency),
            teacherId: req.user.id
          },
          create: {
            reportCardId: report.id,
            subjectId: entry.subjectId,
            caScore: Number.isNaN(ca) ? null : ca,
            examScore: Number.isNaN(exam) ? null : exam,
            total,
            grade: gradeInfo.grade,
            remark: entry.remark || gradeInfo.remark,
            competency: assessmentCompetency(report.class.level, total, entry.competency),
            teacherId: req.user.id
          }
        });
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
    await prisma.reportCard.delete({ where: { id: report.id } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'ReportCard',
      entityId: report.id,
      description: `Deleted report card for ${report.student.firstName} ${report.student.lastName}, ${report.term} ${report.year}.`,
      before: { studentId: report.studentId, term: report.term, year: report.year }
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

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.classId } });
    if (!schoolClass) throw new HttpError(404, 'Class not found.');

    const cards = await prisma.reportCard.findMany({
      where: {
        classId: data.classId,
        term: data.term,
        year: data.year,
        ...(data.status ? { status: data.status } : {})
      },
      include: { student: true },
      orderBy: { student: { lastName: 'asc' } }
    });
    if (!cards.length) throw new HttpError(404, 'No report cards found for this class and term.');

    const settings = await getSettings();
    const payloads = [];
    for (const card of cards) {
      payloads.push(await buildReportPayload(card.id, settings));
    }

    const zipName = `${schoolClass.name.replace(/[^a-z0-9]+/gi, '-')}-${data.term}-${data.year}-reports.zip`;
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
      entityId: `${data.classId}:${data.term}:${data.year}`,
      description: `Downloaded ${payloads.length} report card PDF(s) for ${schoolClass.name}, ${data.term} ${data.year}.`,
      after: { count: payloads.length, status: data.status || 'ALL' }
    });
  })
);

export default router;
