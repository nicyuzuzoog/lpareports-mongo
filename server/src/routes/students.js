import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { publicStudent } from '../lib/serialize.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { getSettings, getSystemSettings, RegistrationClosedError } from '../lib/settings.js';
import { positionsFor, summariseMarks } from '../services/reportService.js';
import { reportTypeLabel } from '../lib/grading.js';
import {
  authenticate,
  allowedClassIds,
  assertClassAccess,
  requireDeletePermission
} from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const genderSchema = z.enum(['MALE', 'FEMALE']);

const createSchema = z.object({
  code: z.string().trim().max(30).optional().nullable(),
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  otherNames: z.string().trim().max(80).optional().nullable(),
  gender: genderSchema,
  dateOfBirth: z.string().optional().nullable(),
  guardianName: z.string().trim().max(120).optional().nullable(),
  guardianPhone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  classId: z.string().min(1, 'Class is required.'),
  isActive: z.boolean().optional()
});

const updateSchema = createSchema.partial();

function campusShort(campusId) {
  return campusId === 'RULINDO' ? 'R' : 'M';
}

async function generateStudentCode(campusId) {
  const year = new Date().getFullYear();
  const prefix = `LPA-${campusShort(campusId)}-${year}-`;
  let sequence =
    (await prisma.student.count({
      where: { campusId, code: { startsWith: prefix } }
    })) + 1;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = `${prefix}${String(sequence).padStart(3, '0')}`;
    const exists = await prisma.student.findFirst({ where: { campusId, code: candidate } });
    if (!exists) return candidate;
    sequence += 1;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, level, search, status } = req.query;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(5, Number(req.query.pageSize || 25)));

    const accessible = await allowedClassIds(req.user);
    if (classId && !accessible.includes(String(classId))) {
      throw new HttpError(403, 'You do not have access to this class.');
    }

    const where = {
      campusId: req.user.campusId,
      ...(classId ? { classId: String(classId) } : { classId: { in: accessible } }),
      ...(level ? { class: { level, campusId: req.user.campusId } } : {}),
      ...(status === 'inactive' ? { isActive: false } : status === 'all' ? {} : { isActive: true })
    };

    if (search) {
      const text = String(search).trim();
      where.OR = [
        { firstName: { contains: text, mode: 'insensitive' } },
        { lastName: { contains: text, mode: 'insensitive' } },
        { otherNames: { contains: text, mode: 'insensitive' } },
        { code: { contains: text, mode: 'insensitive' } }
      ];
    }

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        include: { class: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    res.json({
      students: students.map(publicStudent),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findFirst({
      where: { id: req.params.id, campusId: req.user.campusId },
      include: {
        class: true,
        reportCards: {
          where: { campusId: req.user.campusId },
          include: {
            class: true,
            marks: { where: { campusId: req.user.campusId } }
          },
          orderBy: [{ year: 'desc' }, { term: 'desc' }]
        }
      }
    });
    if (!student) throw notFound('Student not found.');

    const accessible = await allowedClassIds(req.user);
    if (!accessible.includes(student.classId)) {
      throw new HttpError(403, 'You do not have access to this student.');
    }

    const settings = await getSettings(req.user.campusId);
    const positionsCache = new Map();
    const cardTypeName = (card) => card.type || 'TERM';
    const getPositions = async (card) => {
      const key = `${card.classId}|${card.term}|${card.year}|${cardTypeName(card)}`;
      if (!positionsCache.has(key)) {
        positionsCache.set(
          key,
          positionsFor(
            req.user.campusId,
            card.classId,
            card.term,
            card.year,
            settings,
            cardTypeName(card)
          )
        );
      }
      return positionsCache.get(key);
    };

    const reportCards = await Promise.all(
      student.reportCards.map(async (card) => {
        const type = cardTypeName(card);
        const summary = summariseMarks(
          card.marks,
          card.class?.level || 'LOWER_PRIMARY',
          settings,
          type
        );
        const { positions, outOf } = await getPositions(card);
        return {
          id: card.id,
          term: card.term,
          year: card.year,
          type,
          typeLabel: reportTypeLabel(type),
          className: card.class?.name,
          status: card.status,
          subjects: summary.subjectsAssessed,
          average: summary.average,
          position: positions.get(card.id) || null,
          outOf
        };
      })
    );
    // Highest scorer first; unranked cards last.
    reportCards.sort((a, b) => {
      const rank = (item) => (item.position === null ? Number.MAX_SAFE_INTEGER : item.position);
      return rank(a) - rank(b) || String(a.term).localeCompare(String(b.term));
    });

    res.json({
      student: {
        ...publicStudent(student),
        reportCards
      }
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const systemSettings = await getSystemSettings();
    if (!systemSettings?.studentRegistrationEnabled) {
      const error = new RegistrationClosedError();
      error.status = error.status || 403;
      throw error;
    }

    const data = createSchema.parse(req.body);
    // A teacher who is a class teacher may only register into their own class.
    // Any supplied classId is intentionally overridden (not rejected).
    const forcedClassId =
      req.user.role === 'TEACHER' && req.user.classTeacherClassId
        ? req.user.classTeacherClassId
        : null;
    const classId = forcedClassId || data.classId;
    await assertClassAccess(req.user, classId);

    let code = data.code
      ? data.code.trim().toUpperCase()
      : await generateStudentCode(req.user.campusId);
    const duplicate = await prisma.student.findFirst({
      where: { campusId: req.user.campusId, code }
    });
    if (duplicate) throw new HttpError(409, 'This student code is already in use. Choose another.');

    const student = await prisma.student.create({
      data: {
        id: randomUUID(),
        campusId: req.user.campusId,
        code,
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames || null,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        guardianName: data.guardianName || null,
        guardianPhone: data.guardianPhone || null,
        address: data.address || null,
        classId,
        isActive: data.isActive ?? true,
        createdById: req.user.id
      },
      include: { class: true }
    });

    await writeAudit(req, {
      action: 'CREATE',
      entity: 'Student',
      entityId: student.id,
      description: `Registered student ${student.firstName} ${student.lastName} (${student.code}).`,
      after: publicStudent(student)
    });

    res.status(201).json({ student: publicStudent(student) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.student.findFirst({
      where: { id: req.params.id, campusId: req.user.campusId },
      include: { class: true }
    });
    if (!existing) throw notFound('Student not found.');
    await assertClassAccess(req.user, existing.classId);
    if (data.classId) await assertClassAccess(req.user, data.classId);

    if (data.code && data.code.toUpperCase() !== existing.code) {
      const duplicate = await prisma.student.findFirst({
        where: { campusId: req.user.campusId, code: data.code.toUpperCase() }
      });
      if (duplicate) throw new HttpError(409, 'This student code is already in use.');
    }

    const updated = await prisma.student.update({
      where: { id: existing.id, campusId: req.user.campusId },
      data: {
        campusId: req.user.campusId,
        code: data.code ? data.code.toUpperCase() : existing.code,
        firstName: data.firstName ?? existing.firstName,
        lastName: data.lastName ?? existing.lastName,
        otherNames: data.otherNames === undefined ? existing.otherNames : data.otherNames || null,
        gender: data.gender ?? existing.gender,
        dateOfBirth:
          data.dateOfBirth === undefined
            ? existing.dateOfBirth
            : data.dateOfBirth
              ? new Date(data.dateOfBirth)
              : null,
        guardianName: data.guardianName === undefined ? existing.guardianName : data.guardianName || null,
        guardianPhone: data.guardianPhone === undefined ? existing.guardianPhone : data.guardianPhone || null,
        address: data.address === undefined ? existing.address : data.address || null,
        classId: data.classId ?? existing.classId,
        isActive: data.isActive ?? existing.isActive
      },
      include: { class: true }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Student',
      entityId: updated.id,
      description: `Updated student ${updated.firstName} ${updated.lastName} (${updated.code}).`,
      before: publicStudent(existing),
      after: publicStudent(updated)
    });

    res.json({ student: publicStudent(updated) });
  })
);

router.delete(
  '/:id',
  requireDeletePermission,
  asyncHandler(async (req, res) => {
    const existing = await prisma.student.findFirst({
      where: { id: req.params.id, campusId: req.user.campusId },
      include: { class: true }
    });
    if (!existing) throw notFound('Student not found.');
    await assertClassAccess(req.user, existing.classId);

    await prisma.student.delete({ where: { id: existing.id, campusId: req.user.campusId } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'Student',
      entityId: existing.id,
      description: `Deleted student ${existing.firstName} ${existing.lastName} (${existing.code}) and all report cards.`,
      before: publicStudent(existing)
    });

    res.json({ message: 'Student and related report cards deleted.' });
  })
);

export default router;
