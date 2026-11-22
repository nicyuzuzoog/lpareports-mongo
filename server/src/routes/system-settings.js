import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import {
  getSystemSettings,
  setStudentRegistrationEnabled,
  setLoginDisabledExceptSuperAdmin
} from '../lib/settings.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// System-wide switches: no campus scoping. Only the Super Admin may use them.
router.use(authenticate, requireRole('SUPER_ADMIN'));

const updateSchema = z
  .object({
    studentRegistrationEnabled: z.boolean().optional(),
    loginDisabledExceptSuperAdmin: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.studentRegistrationEnabled !== undefined || value.loginDisabledExceptSuperAdmin !== undefined,
    { message: 'Provide a system setting to update.' }
  );

function publicSystemSettings(systemSettings) {
  return {
    studentRegistrationEnabled: systemSettings?.studentRegistrationEnabled === true,
    loginDisabledExceptSuperAdmin: systemSettings?.loginDisabledExceptSuperAdmin === true
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const systemSettings = await getSystemSettings();
    res.json({ systemSettings: publicSystemSettings(systemSettings) });
  })
);

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const previous = await getSystemSettings();
    let systemSettings = previous;

    if (data.studentRegistrationEnabled !== undefined) {
      systemSettings = await setStudentRegistrationEnabled(data.studentRegistrationEnabled);
    }
    if (data.loginDisabledExceptSuperAdmin !== undefined) {
      systemSettings = await setLoginDisabledExceptSuperAdmin(data.loginDisabledExceptSuperAdmin);
    }

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'SystemSetting',
      entityId: 'GLOBAL',
      description: 'Updated global system controls.',
      before: publicSystemSettings(previous),
      after: publicSystemSettings(systemSettings)
    });

    res.json({ systemSettings: publicSystemSettings(systemSettings) });
  })
);

export default router;
