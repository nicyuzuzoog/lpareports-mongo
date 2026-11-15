import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const levelSchema = z.enum(['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY']);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Subject name is required.'),
  code: z.string().trim().min(1, 'Subject code is required.').max(12),
  levels: z.array(levelSchema).min(1, 'Select at least one level.'),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

const updateSchema = createSchema.partial();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { level, active } = req.query;
    const where = {};
    if (level) where.levels = { has: level };
    if (active === 'true') where.isActive = true;

    const subjects = await prisma.subject.findMany({
      where,
      orderBy: [{ position: 'asc' }, { name: 'asc' }]
    });

    res.json({ subjects });
  })
);

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const duplicate = await prisma.subject.findFirst({
      where: { OR: [{ name: data.name }, { code: data.code.toUpperCase() }] }
    });
    if (duplicate) throw new HttpError(409, 'A subject with this name or code already exists.');

    const created = await prisma.subject.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        levels: data.levels,
        position: data.position ?? 0,
        isActive: data.isActive ?? true
      }
    });

    await writeAudit(req, {
      action: 'CREATE',
      entity: 'Subject',
      entityId: created.id,
      description: `Created subject ${created.name}.`,
      after: created
    });

    res.status(201).json({ subject: created });
  })
);

router.patch(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.subject.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Subject not found.');

    if (data.name || data.code) {
      const duplicate = await prisma.subject.findFirst({
        where: {
          id: { not: existing.id },
          OR: [
            ...(data.name ? [{ name: data.name }] : []),
            ...(data.code ? [{ code: data.code.toUpperCase() }] : [])
          ]
        }
      });
      if (duplicate) throw new HttpError(409, 'A subject with this name or code already exists.');
    }

    const updated = await prisma.subject.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? existing.name,
        code: data.code ? data.code.toUpperCase() : existing.code,
        levels: data.levels ?? existing.levels,
        position: data.position ?? existing.position,
        isActive: data.isActive ?? existing.isActive
      }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Subject',
      entityId: updated.id,
      description: `Updated subject ${updated.name}.`,
      before: existing,
      after: updated
    });

    res.json({ subject: updated });
  })
);

router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.subject.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { marks: true } } }
    });
    if (!existing) throw notFound('Subject not found.');
    if (existing._count.marks > 0) {
      throw new HttpError(409, 'This subject already has assessment records. Deactivate it instead.');
    }

    await prisma.subject.delete({ where: { id: existing.id } });

    await writeAudit(req, {
      action: 'DELETE',
      entity: 'Subject',
      entityId: existing.id,
      description: `Deleted subject ${existing.name}.`,
      before: existing
    });

    res.json({ message: 'Subject deleted.' });
  })
);

export default router;
