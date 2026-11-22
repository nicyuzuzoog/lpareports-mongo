import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate, requireRole, allowedClassIds } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const levelSchema = z.enum(['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY']);
const teacherIdField = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().min(1).nullable().optional()
);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Class name is required.'),
  level: levelSchema,
  classTeacherId: teacherIdField
});

const updateSchema = createSchema.partial();

/** Mirror class-side teacher changes onto User.classTeacherClassId / TeacherClass. */
async function applyClassTeacher(campusId, classId, teacherId, previousTeacherId) {
  if (previousTeacherId && previousTeacherId !== teacherId) {
    await prisma.user.updateMany({
      where: { campusId, id: previousTeacherId, classTeacherClassId: classId },
      data: { classTeacherClassId: null }
    });
  }
  if (!teacherId) return;

  const teacher = await prisma.user.findFirst({ where: { id: teacherId, campusId } });
  if (!teacher) throw new HttpError(400, 'The selected class teacher does not exist.');

  if (teacher.classTeacherClassId && teacher.classTeacherClassId !== classId) {
    await prisma.schoolClass.updateMany({
      where: { campusId, id: teacher.classTeacherClassId, classTeacherId: teacherId },
      data: { classTeacherId: null }
    });
  }
  await prisma.user.updateMany({
    where: { campusId, classTeacherClassId: classId, id: { not: teacherId } },
    data: { classTeacherClassId: null }
  });
  await prisma.user.update({
    where: { id: teacherId, campusId },
    data: { campusId, classTeacherClassId: classId }
  });

  const row = await prisma.teacherClass.findFirst({ where: { campusId, userId: teacherId, classId } });
  if (!row) {
    await prisma.teacherClass.create({
      data: { id: randomUUID(), campusId, userId: teacherId, classId }
    });
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessible = await allowedClassIds(req.user);
    const classes = await prisma.schoolClass.findMany({
      where: { campusId: req.user.campusId, id: { in: accessible } },
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
  requireRole('SUPER_ADMIN', 'DOS'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const campusId = req.user.campusId;
    const duplicate = await prisma.schoolClass.findUnique({ where: { campusId, name: data.name } });
    if (duplicate) throw new HttpError(409, 'A class with this name already exists.');

    const created = await prisma.schoolClass.create({
      data: {
        id: randomUUID(),
        campusId,
        name: data.name,
        level: data.level,
        classTeacherId: data.classTeacherId || null
      },
      include: { classTeacher: { select: { id: true, name: true } } }
    });
    if (created.classTeacherId) {
      await applyClassTeacher(campusId, created.id, created.classTeacherId, null);
    }

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
  requireRole('SUPER_ADMIN', 'DOS'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const campusId = req.user.campusId;
    const existing = await prisma.schoolClass.findFirst({ where: { id: req.params.id, campusId } });
    if (!existing) throw notFound('Class not found.');

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.schoolClass.findUnique({ where: { campusId, name: data.name } });
      if (duplicate) throw new HttpError(409, 'A class with this name already exists.');
    }

    const teacherProvided = Object.prototype.hasOwnProperty.call(data, 'classTeacherId');
    const nextTeacherId = teacherProvided ? data.classTeacherId || null : existing.classTeacherId;

    const updated = await prisma.schoolClass.update({
      where: { id: existing.id, campusId },
      data: {
        campusId,
        name: data.name ?? existing.name,
        level: data.level ?? existing.level,
        classTeacherId: nextTeacherId
      },
      include: { classTeacher: { select: { id: true, name: true } } }
    });
    if (teacherProvided) {
      await applyClassTeacher(campusId, updated.id, nextTeacherId, existing.classTeacherId);
    }

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
  requireRole('SUPER_ADMIN', 'DOS'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.schoolClass.findFirst({
      where: { id: req.params.id, campusId: req.user.campusId },
      include: { _count: { select: { students: true, reportCards: true } } }
    });
    if (!existing) throw notFound('Class not found.');
    if (existing._count.students > 0 || existing._count.reportCards > 0) {
      throw new HttpError(409, 'This class has students or report cards. Move or archive them first.');
    }

    if (existing.classTeacherId) {
      await prisma.user.updateMany({
        where: { campusId: req.user.campusId, id: existing.classTeacherId, classTeacherClassId: existing.id },
        data: { classTeacherClassId: null }
      });
    }
    await prisma.schoolClass.delete({ where: { id: existing.id, campusId: req.user.campusId } });

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
