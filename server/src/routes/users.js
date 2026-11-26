import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
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

// Accepts an id, null or an empty string (empty means "no home class").
const classTeacherClassField = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().min(1).nullable().optional()
);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.'),
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  phone: z.string().trim().max(30).optional().nullable(),
  role: roleSchema,
  campusId: z.enum(['MAIN', 'RULINDO']).optional(),
  classIds: z.array(z.string()).default([]),
  subjectIds: z.array(z.string()).default([]),
  canDelete: z.boolean().optional(),
  // Optional home class for a class teacher. Empty/null means "no class".
  classTeacherClassId: classTeacherClassField
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: emailSchema.optional(),
  password: z.string().min(8).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: roleSchema.optional(),
  campusId: z.enum(['MAIN', 'RULINDO']).optional(),
  classIds: z.array(z.string()).optional(),
  subjectIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  classTeacherClassId: classTeacherClassField
});

const permissionSchema = z.object({ canDelete: z.boolean() });

const include = {
  classes: { include: { class: true } },
  subjects: { include: { subject: true } }
};

/**
 * Role rules:
 * - SUPER_ADMIN: any user.
 * - DOS: TEACHER users only.
 * - Everyone else: no user management.
 */
function assertCanManageRole(actor, ...roles) {
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.role === 'DOS' && roles.every((role) => role === 'TEACHER')) return;
  throw new HttpError(403, 'Only the Super Admin can manage this role.');
}

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

/**
 * Keep SchoolClass.classTeacherId and other users' classTeacherClassId in sync
 * with this teacher's home class. TeacherClass rows are maintained by the
 * `classes` nested create in the user payload (the home class is added there).
 */
async function syncClassTeacher(campusId, userId, nextClassId, previousClassId) {
  if (previousClassId && previousClassId !== nextClassId) {
    await prisma.schoolClass.updateMany({
      where: { campusId, id: previousClassId, classTeacherId: userId },
      data: { classTeacherId: null }
    });
  }
  if (!nextClassId) return;

  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: nextClassId, campusId } });
  if (!schoolClass) throw new HttpError(400, 'The selected class teacher class does not exist.');

  await prisma.user.updateMany({
    where: { campusId, classTeacherClassId: nextClassId, id: { not: userId } },
    data: { classTeacherClassId: null }
  });
  await prisma.schoolClass.update({
    where: { id: nextClassId, campusId },
    data: { classTeacherId: userId }
  });
}

async function assertNotLastSuperAdmin(userId, campusId) {
  const user = await prisma.user.findFirst({ where: { id: userId, campusId } });
  if (!user || user.role !== 'SUPER_ADMIN' || !user.isActive) return;
  const remaining = await prisma.user.count({
    where: {
      id: { not: userId },
      role: 'SUPER_ADMIN',
      isActive: true,
      OR: [{ campusId }, { isGlobal: true }]
    }
  });
  if (remaining === 0) throw new HttpError(400, 'At least one active Super Admin must remain.');
}

router.get(
  '/',
  requireRole('SUPER_ADMIN', 'DOS'),
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
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    assertCanManageRole(req.user, data.role);
    // Super Admin can place DOS/Head Teacher/Teacher on either campus.
    // DOS stays campus-scoped and can only create users on their own campus.
    const campusId =
      req.user.role === 'SUPER_ADMIN' ? data.campusId || req.user.campusId : req.user.campusId;

    const homeClassId = data.classTeacherClassId || null;
    const classIds = [...data.classIds];
    if (homeClassId && !classIds.includes(homeClassId)) classIds.push(homeClassId);
    await assertTeacherAssignments(campusId, data.role, classIds, data.subjectIds);

    const existing = await prisma.user.findFirst({ where: { campusId, email: data.email } });
    if (existing) throw new HttpError(409, 'A user with this email already exists on this campus.');

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        campusId,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
        isActive: true,
        canDelete: data.canDelete === true,
        classTeacherClassId: homeClassId,
        classes: {
          create: classIds.map((classId) => ({ id: randomUUID(), campusId, classId }))
        },
        subjects: {
          create: data.subjectIds.map((subjectId) => ({ id: randomUUID(), campusId, subjectId }))
        }
      },
      include
    });

    await syncClassTeacher(campusId, user.id, homeClassId, null);
    const withAssignments = await prisma.user.findFirst({ where: { id: user.id, campusId }, include });

    await writeAudit(req, {
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      description: `Created ${user.role} account for ${user.name} (${user.email}).`,
      after: publicUser(withAssignments || user)
    });

    res.status(201).json({ user: publicUser(withAssignments || user) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const campusId = req.user.campusId;
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, campusId },
      include
    });
    if (!existing) throw notFound('User not found.');

    const nextRole = data.role ?? existing.role;
    assertCanManageRole(req.user, existing.role, nextRole);

    // Super Admin may move non-global accounts between MAIN and BRANCH.
    const targetCampusId =
      req.user.role === 'SUPER_ADMIN' && !existing.isGlobal && data.campusId
        ? data.campusId
        : campusId;
    if (targetCampusId !== campusId) {
      if (existing.isGlobal) throw new HttpError(400, 'The global Super Admin cannot be moved to a campus.');
      if (nextRole === 'SUPER_ADMIN') throw new HttpError(400, 'Super Admin accounts are global; do not assign them to a campus.');
      const duplicate = await prisma.user.findFirst({
        where: { campusId: targetCampusId, email: data.email ?? existing.email }
      });
      if (duplicate) throw new HttpError(409, 'A user with this email already exists on the target campus.');
    }

    const previousHomeClassId = existing.classTeacherClassId || null;
    const homeClassProvided = Object.prototype.hasOwnProperty.call(data, 'classTeacherClassId');
    const nextHomeClassId = homeClassProvided ? data.classTeacherClassId || null : previousHomeClassId;

    const nextClassIds = data.classIds ?? existing.classes.map((entry) => entry.classId);
    if (nextHomeClassId && !nextClassIds.includes(nextHomeClassId)) nextClassIds.push(nextHomeClassId);
    const nextSubjectIds = data.subjectIds ?? existing.subjects.map((entry) => entry.subjectId);
    await assertTeacherAssignments(targetCampusId, nextRole, nextClassIds, nextSubjectIds);

    if (data.role && data.role !== 'SUPER_ADMIN') await assertNotLastSuperAdmin(existing.id, campusId);
    if (data.isActive === false) await assertNotLastSuperAdmin(existing.id, campusId);
    if (data.email && data.email !== existing.email) {
      const duplicate = await prisma.user.findFirst({ where: { campusId: targetCampusId, email: data.email } });
      if (duplicate) throw new HttpError(409, 'A user with this email already exists on this campus.');
    }
    if (existing.id === req.user.id && data.isActive === false) {
      throw new HttpError(400, 'You cannot deactivate your own account.');
    }
    if (nextRole === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'Only the Super Admin can assign the Super Admin role.');
    }

    await syncClassTeacher(campusId, existing.id, null, previousHomeClassId);
    if (targetCampusId === campusId) {
      await syncClassTeacher(campusId, existing.id, nextHomeClassId, null);
    }

    const update = {
      campusId: targetCampusId,
      name: data.name ?? existing.name,
      email: data.email ?? existing.email,
      phone: data.phone === undefined ? existing.phone : data.phone || null,
      role: nextRole,
      isActive: data.isActive ?? existing.isActive,
      canDelete: data.canDelete ?? existing.canDelete,
      classTeacherClassId: nextHomeClassId
    };
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.update({
      where: { id: existing.id, campusId },
      data: {
        ...update,
        ...(data.classIds || homeClassProvided || targetCampusId !== campusId
          ? {
              classes: {
                deleteMany: {},
                create: nextClassIds.map((classId) => ({ id: randomUUID(), campusId: targetCampusId, classId }))
              }
            }
          : {}),
        ...(data.subjectIds || targetCampusId !== campusId
          ? {
              subjects: {
                deleteMany: {},
                create: nextSubjectIds.map((subjectId) => ({ id: randomUUID(), campusId: targetCampusId, subjectId }))
              }
            }
          : {})
      },
      include
    });

    if (targetCampusId !== campusId) {
      await syncClassTeacher(targetCampusId, user.id, nextHomeClassId, null);
    }

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
    const existing = await prisma.user.findFirst({
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
  asyncHandler(async (req, res) => {
    const campusId = req.user.campusId;
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, campusId },
      include
    });
    if (!existing) throw notFound('User not found.');
    assertCanManageRole(req.user, existing.role);
    if (existing.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
    await assertNotLastSuperAdmin(existing.id, campusId);

    if (existing.classTeacherClassId) {
      await prisma.schoolClass.updateMany({
        where: { campusId, id: existing.classTeacherClassId, classTeacherId: existing.id },
        data: { classTeacherId: null }
      });
    }
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
