import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate, requireRole, allowedClassIds } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const levelSchema = z.enum(['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY']);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Class name is required.'),
  level: levelSchema,
  classTeacherId: z.string().nullable().optional()
});

const updateSchema = createSchema.partial();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessible = await allowedClassIds(req.user);
    const classes = await prisma.schoolClass.findMany({
      where: { id: { in: accessible } },
      include: {
        classTeacher: { select: { id: true, name: true } },
        _count: { select: { students: true, reportCards: true } }
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });

    res.json({
      classes: classes.map((item) => ({
        id: item.id,
        name: item.name,
        level: item.level,
        classTeacher: item.classTeacher,
        studentCount: item._count.students,
        reportCount: item._count.reportCards,
        createdAt: item.createdAt
      }))
    });
  })
);

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const duplicate = await prisma.schoolClass.findUnique({ where: { name: data.name } });
    if (duplicate) throw new HttpError(409, 'A class with this name already exists.');

    const created = await prisma.schoolClass.create({
      data: {
        name: data.name,
        level: data.level,
        classTeacherId: data.classTeacherId || null
      },
      include: { classTeacher: { select: { id: true, name: true } } }
    });

    await writeAudit(req, {
      action: 'CREATE',
      entity: 'Class',
      entityId: created.id,
      description: `Created class ${created.name}.`,
      after: { name: created.name, level: created.level }
    });

    res.status(201).json({ class: created });
  })
);

router.patch(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.schoolClass.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Class not found.');

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.schoolClass.findUnique({ where: { name: data.name } });
      if (duplicate) throw new HttpError(409, 'A class with this name already exists.');
    }

    const updated = await prisma.schoolClass.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? existing.name,
        level: data.level ?? existing.level,
        classTeacherId:
          data.classTeacherId === undefined ? existing.classTeacherId : data.classTeacherId || null
      },
      include: { classTeacher: { select: { id: true, name: true } } }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Class',
      entityId: updated.id,
      description: `Updated class ${updated.name}.`,
      before: { name: existing.name, level: existing.level, classTeacherId: existing.classTeacherId },
      after: { name: updated.name, level: updated.level, classTeacherId: updated.classTeacherId }
    });

    res.json({ class: updated });
  })
);

router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.schoolClass.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { students: true, reportCards: true } } }
    });
    if (!existing) throw notFound('Class not found.');
    if (existing._count.students > 0 || existing._count.reportCards > 0) {
      throw new HttpError(409, 'This class has students or report cards. Move or archive them first.');
    }

    await prisma.schoolClass.delete({ where: { id: existing.id } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'Class',
      entityId: existing.id,
      description: `Deleted class ${existing.name}.`,
      before: { name: existing.name, level: existing.level }
    });

    res.json({ message: 'Class deleted.' });
  })
);

export default router;
