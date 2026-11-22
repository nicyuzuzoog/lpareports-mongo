import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { getSystemSettings, setStudentRegistrationEnabled } from '../lib/settings.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// System-wide switches: no campus scoping. Only the Super Admin may use them.
router.use(authenticate, requireRole('SUPER_ADMIN'));

const updateSchema = z.object({
  studentRegistrationEnabled: z.boolean()
});

function publicSystemSettings(systemSettings) {
  return { studentRegistrationEnabled: systemSettings?.studentRegistrationEnabled === true };
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
    const { studentRegistrationEnabled } = updateSchema.parse(req.body);
    const previous = await getSystemSettings();
    if (typeof setStudentRegistrationEnabled !== 'function') {
      throw new HttpError(500, 'System settings are not available.');
    }
    const systemSettings = await setStudentRegistrationEnabled(studentRegistrationEnabled);

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'SystemSetting',
      entityId: 'GLOBAL',
      description: `Student registration ${studentRegistrationEnabled ? 'opened' : 'closed'}.`,
      before: publicSystemSettings(previous),
      after: publicSystemSettings(systemSettings || { studentRegistrationEnabled })
    });

    res.json({ systemSettings: { studentRegistrationEnabled } });
  })
);

export default router;
