import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { getSettings, clearSettingsCache } from '../lib/settings.js';
import { DEFAULT_GRADING_SCALES } from '../lib/grading.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const gradeItemSchema = z.object({
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  grade: z.string().trim().min(1).max(6),
  remark: z.string().trim().min(1).max(40),
  points: z.number().min(0).max(20).optional()
});

const scalesSchema = z.object({
  NURSERY: z.array(gradeItemSchema).min(1),
  LOWER_PRIMARY: z.array(gradeItemSchema).min(1),
  UPPER_PRIMARY: z.array(gradeItemSchema).min(1)
});

const updateSchema = z.object({
  schoolName: z.string().trim().min(2).max(120).optional(),
  schoolMotto: z.string().trim().max(160).optional(),
  schoolAddress: z.string().trim().max(200).optional(),
  schoolPhone: z.string().trim().max(40).optional(),
  schoolEmail: z.string().trim().max(120).optional(),
  headTeacherName: z.string().trim().max(120).optional(),
  dosName: z.string().trim().max(120).optional(),
  passMark: z.number().int().min(0).max(100).optional(),
  lowPerformanceThreshold: z.number().int().min(0).max(100).optional(),
  lowPerformanceMinSubjects: z.number().int().min(0).max(20).optional(),
  courseworkWeight: z.number().int().min(0).max(100).optional(),
  examWeight: z.number().int().min(0).max(100).optional(),
  gradingScales: scalesSchema.optional()
});

const criteriaSchema = z.object({
  passMark: z.number().int().min(0).max(100).optional(),
  lowPerformanceThreshold: z.number().int().min(0).max(100).optional(),
  lowPerformanceMinSubjects: z.number().int().min(0).max(20).optional()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.user.campusId);
    res.json({ settings });
  })
);

router.put(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);

    const courseworkWeight = data.courseworkWeight;
    const examWeight = data.examWeight;
    if (
      courseworkWeight !== undefined &&
      examWeight !== undefined &&
      courseworkWeight + examWeight !== 100
    ) {
      throw new HttpError(400, 'Coursework and exam weights must add up to 100.');
    }
    if (data.lowPerformanceThreshold !== undefined && data.passMark !== undefined) {
      if (data.lowPerformanceThreshold > data.passMark) {
        throw new HttpError(400, 'The low-performance threshold cannot be higher than the pass mark.');
      }
    }

    for (const [level, items] of Object.entries(data.gradingScales || {})) {
      const sorted = [...items].sort((a, b) => b.min - a.min);
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].max >= sorted[index - 1].min) {
          throw new HttpError(400, `Grading bands overlap in the ${level.replace('_', ' ')} scale.`);
        }
      }
      if (sorted[0].max !== 100 || sorted[sorted.length - 1].min !== 0) {
        throw new HttpError(400, `The ${level.replace('_', ' ')} scale must cover 0 to 100.`);
      }
    }

    const previous = await getSettings(req.user.campusId);
    const updated = await prisma.setting.update({
      where: { id: req.user.campusId },
      data: {
        ...data,
        gradingScales: data.gradingScales || previous.gradingScales || DEFAULT_GRADING_SCALES
      }
    });
    clearSettingsCache(req.user.campusId);

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Setting',
      entityId: req.user.campusId,
      description: 'Updated school settings and grading configuration.',
      before: previous,
      after: updated
    });

    res.json({ settings: updated });
  })
);

router.patch(
  '/criteria',
  requireRole('SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'),
  asyncHandler(async (req, res) => {
    const data = criteriaSchema.parse(req.body);
    const previous = await getSettings(req.user.campusId);

    const passMark = data.passMark ?? previous.passMark;
    const threshold = data.lowPerformanceThreshold ?? previous.lowPerformanceThreshold;
    if (threshold > passMark) {
      throw new HttpError(400, 'The low-performance threshold cannot be higher than the pass mark.');
    }

    const updated = await prisma.setting.update({
      where: { id: req.user.campusId },
      data: {
        passMark,
        lowPerformanceThreshold: threshold,
        lowPerformanceMinSubjects:
          data.lowPerformanceMinSubjects ?? previous.lowPerformanceMinSubjects
      }
    });
    clearSettingsCache(req.user.campusId);

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'Setting',
      entityId: req.user.campusId,
      description: 'Updated performance analysis criteria.',
      before: {
        passMark: previous.passMark,
        lowPerformanceThreshold: previous.lowPerformanceThreshold,
        lowPerformanceMinSubjects: previous.lowPerformanceMinSubjects
      },
      after: {
        passMark: updated.passMark,
        lowPerformanceThreshold: updated.lowPerformanceThreshold,
        lowPerformanceMinSubjects: updated.lowPerformanceMinSubjects
      }
    });

    res.json({ settings: updated });
  })
);

export default router;
