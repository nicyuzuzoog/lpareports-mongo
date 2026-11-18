import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { publicUser } from '../lib/serialize.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address.');

const roleSchema = z.enum(['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER', 'TEACHER']);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.'),
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  phone: z.string().trim().max(30).optional().nullable(),
  role: roleSchema,
  classIds: z.array(z.string()).default([]),
  subjectIds: z.array(z.string()).default([]),
  canDelete: z.boolean().optional()
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: emailSchema.optional(),
  password: z.string().min(8).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: roleSchema.optional(),
  classIds: z.array(z.string()).optional(),
  subjectIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  canDelete: z.boolean().optional()
});

const permissionSchema = z.object({ canDelete: z.boolean() });

const include = {
  classes: { include: { class: true } },
  subjects: { include: { subject: true } }
};

async function assertTeacherAssignments(campusId, role, classIds, subjectIds) {
  if (role !== 'TEACHER') return;
  if (!classIds.length) throw new HttpError(400, 'Select at least one class for this teacher.');
  if (!subjectIds.length) throw new HttpError(400, 'Select at least one subject for this teacher.');

  const [classes, subjects] = await Promise.all([
    prisma.schoolClass.count({ where: { campusId, id: { in: classIds } } }),
    prisma.subject.count({ where: { campusId, id: { in: subjectIds } } })
  ]);
  if (classes !== classIds.length) throw new HttpError(400, 'One or more selected classes do not exist.');
  if (subjects !== subjectIds.length) throw new HttpError(400, 'One or more selected subjects do not exist.');
}

async function assertNotLastSuperAdmin(userId, campusId) {
  const user = await prisma.user.findUnique({ where: { id: userId, campusId } });
  if (!user || user.role !== 'SUPER_ADMIN' || !user.isActive) return;
  const remaining = await prisma.user.count({
    where: { campusId, role: 'SUPER_ADMIN', isActive: true, id: { not: userId } }
  });
  if (remaining === 0) throw new HttpError(400, 'At least one active Super Admin must remain.');
}

router.get(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { role, search, status } = req.query;
    const where = { campusId: req.user.campusId };
    if (role) where.role = role;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include,
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });

    res.json({ users: users.map(publicUser) });
  })
);

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const campusId = req.user.campusId;
    await assertTeacherAssignments(campusId, data.role, data.classIds, data.subjectIds);

    const existing = await prisma.user.findUnique({ where: { campusId, email: data.email } });
    if (existing) throw new HttpError(409, 'A user with this email already exists.');

    const user = await prisma.user.create({
      data: {
        campusId,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
        canDelete: data.canDelete === true,
        classes: { create: data.classIds.map((classId) => ({ campusId, classId })) },
        subjects: { create: data.subjectIds.map((subjectId) => ({ campusId, subjectId })) }
      },
      include
    });

    await writeAudit(req, {
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      description: `Created ${user.role} account for ${user.name} (${user.email}).`,
      after: publicUser(user)
    });

    res.status(201).json({ user: publicUser(user) });
  })
);

router.patch(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const campusId = req.user.campusId;
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id, campusId },
      include
    });
    if (!existing) throw notFound('User not found.');

    const nextRole = data.role ?? existing.role;
    const nextClassIds = data.classIds ?? existing.classes.map((entry) => entry.classId);
    const nextSubjectIds = data.subjectIds ?? existing.subjects.map((entry) => entry.subjectId);
    await assertTeacherAssignments(campusId, nextRole, nextClassIds, nextSubjectIds);

    if (data.role && data.role !== 'SUPER_ADMIN') await assertNotLastSuperAdmin(existing.id, campusId);
    if (data.isActive === false) await assertNotLastSuperAdmin(existing.id, campusId);
    if (data.email && data.email !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { campusId, email: data.email } });
      if (duplicate) throw new HttpError(409, 'A user with this email already exists.');
    }
    if (existing.id === req.user.id && data.isActive === false) {
      throw new HttpError(400, 'You cannot deactivate your own account.');
    }

    const update = {
      campusId,
      name: data.name ?? existing.name,
      email: data.email ?? existing.email,
      phone: data.phone === undefined ? existing.phone : data.phone || null,
      role: nextRole,
      isActive: data.isActive ?? existing.isActive,
      canDelete: data.canDelete ?? existing.canDelete
    };
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.update({
      where: { id: existing.id, campusId },
      data: {
        ...update,
        ...(data.classIds
          ? { classes: { deleteMany: {}, create: data.classIds.map((classId) => ({ campusId, classId })) } }
          : {}),
        ...(data.subjectIds
          ? { subjects: { deleteMany: {}, create: data.subjectIds.map((subjectId) => ({ campusId, subjectId })) } }
          : {})
      },
      include
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'User',
      entityId: user.id,
      description: `Updated account for ${user.name} (${user.email}).`,
      before: publicUser(existing),
      after: {
        ...publicUser(user),
        passwordChanged: Boolean(data.password)
      }
    });

    res.json({ user: publicUser(user) });
  })
);

router.patch(
  '/:id/permissions',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { canDelete } = permissionSchema.parse(req.body);
    const campusId = req.user.campusId;
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id, campusId },
      include
    });
    if (!existing) throw notFound('User not found.');

    const user = await prisma.user.update({
      where: { id: existing.id, campusId },
      data: { campusId, canDelete },
      include
    });

    await writeAudit(req, {
      action: 'PERMISSION',
      entity: 'User',
      entityId: user.id,
      description: `${canDelete ? 'Granted' : 'Revoked'} delete permission for ${user.name}.`,
      after: { canDelete }
    });

    res.json({ user: publicUser(user) });
  })
);

router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const campusId = req.user.campusId;
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id, campusId },
      include
    });
    if (!existing) throw notFound('User not found.');
    if (existing.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
    await assertNotLastSuperAdmin(existing.id, campusId);

    await prisma.user.delete({ where: { id: existing.id, campusId } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'User',
      entityId: existing.id,
      description: `Deleted ${existing.role} account for ${existing.name} (${existing.email}).`,
      before: publicUser(existing)
    });

    res.json({ message: 'User deleted.' });
  })
);

export default router;
