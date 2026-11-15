import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { publicStudent } from '../lib/serialize.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
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

async function generateStudentCode() {
  const year = new Date().getFullYear();
  const prefix = `LPAC-${year}-`;
  let sequence = (await prisma.student.count({ where: { code: { startsWith: prefix } } })) + 1;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = `${prefix}${String(sequence).padStart(3, '0')}`;
    const exists = await prisma.student.findUnique({ where: { code: candidate } });
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
      ...(classId ? { classId: String(classId) } : { classId: { in: accessible } }),
      ...(level ? { class: { level } } : {}),
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
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        class: true,
        reportCards: {
          include: { class: true, marks: true },
          orderBy: [{ year: 'desc' }, { term: 'desc' }]
        }
      }
    });
    if (!student) throw notFound('Student not found.');

    const accessible = await allowedClassIds(req.user);
    if (!accessible.includes(student.classId)) {
      throw new HttpError(403, 'You do not have access to this student.');
    }

    res.json({
      student: {
        ...publicStudent(student),
        reportCards: student.reportCards.map((card) => ({
          id: card.id,
          term: card.term,
          year: card.year,
          className: card.class.name,
          status: card.status,
          subjects: card.marks.length,
          average:
            card.marks.filter((mark) => mark.total !== null).length > 0
              ? Math.round(
                  (card.marks
                    .filter((mark) => mark.total !== null)
                    .reduce((sum, mark) => sum + Number(mark.total || 0), 0) /
                    card.marks.filter((mark) => mark.total !== null).length) *
                    10
                ) / 10
              : null
        }))
      }
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    await assertClassAccess(req.user, data.classId);

    let code = data.code ? data.code.trim().toUpperCase() : await generateStudentCode();
    const duplicate = await prisma.student.findUnique({ where: { code } });
    if (duplicate) throw new HttpError(409, 'This student code is already in use. Choose another.');

    const student = await prisma.student.create({
      data: {
        code,
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames || null,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        guardianName: data.guardianName || null,
        guardianPhone: data.guardianPhone || null,
        address: data.address || null,
        classId: data.classId,
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
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { class: true }
    });
    if (!existing) throw notFound('Student not found.');
    await assertClassAccess(req.user, existing.classId);
    if (data.classId) await assertClassAccess(req.user, data.classId);

    if (data.code && data.code.toUpperCase() !== existing.code) {
      const duplicate = await prisma.student.findUnique({ where: { code: data.code.toUpperCase() } });
      if (duplicate) throw new HttpError(409, 'This student code is already in use.');
    }

    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: {
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
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { class: true }
    });
    if (!existing) throw notFound('Student not found.');
    await assertClassAccess(req.user, existing.classId);

    await prisma.student.delete({ where: { id: existing.id } });

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
