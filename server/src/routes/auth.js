import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { publicUser } from '../lib/serialize.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { getSystemSettings } from '../lib/settings.js';

const router = Router();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address.');

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please wait 10 minutes and try again.' }
});

const campusSchema = z.enum(['MAIN', 'RULINDO']);

// Campuses have separate logins: the same email may exist on both, so a
// campus is required. `campus` is accepted as an alias for `campusId`.
const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required.'),
    campusId: campusSchema.optional(),
    campus: campusSchema.optional()
  })
  .transform(({ campus, ...data }) => ({ ...data, campusId: data.campusId ?? campus }))
  .refine((data) => campusSchema.safeParse(data.campusId).success, {
    message: 'Select a campus.',
    path: ['campusId']
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.')
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, campusId } = loginSchema.parse(req.body);

    const include = {
      classes: { include: { class: true } },
      subjects: { include: { subject: true } }
    };

    // The one global Super Admin signs in from either campus. Look the account
    // up globally first, then fall back to the normal campus-scoped account.
    const globalUser = await prisma.user.findFirst({
      where: { email, isGlobal: true },
      include
    });
    const user = globalUser || (await prisma.user.findFirst({
      where: { campusId, email },
      include
    }));

    if (!user) throw new HttpError(401, 'Invalid email or password.');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, 'Invalid email or password.');
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated. Contact the Super Admin.');

    // A global account is scoped to the requested campus for this session;
    // ordinary accounts must already match that campus.
    const sessionUser = { ...user, isGlobal: user.isGlobal === true, campusId };

    const systemSettings = await getSystemSettings();
    if (systemSettings?.loginDisabledExceptSuperAdmin === true && !sessionUser.isGlobal) {
      throw new HttpError(403, 'Sign-in is temporarily disabled for non–Super Admin accounts. Contact the Super Admin.');
    }

    req.user = sessionUser;
    await writeAudit(req, {
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      description: `${user.name} signed in.`
    });

    res.json({ token: signToken(sessionUser), user: publicUser(sessionUser) });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const valid = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!valid) throw new HttpError(400, 'Current password is incorrect.');

    // A global account keeps its stored campus; only the password changes.
    await prisma.user.update({
      where: req.user.isGlobal
        ? { id: req.user.id }
        : { id: req.user.id, campusId: req.user.campusId },
      data: {
        ...(req.user.isGlobal ? {} : { campusId: req.user.campusId }),
        passwordHash: await bcrypt.hash(newPassword, 10)
      }
    });

    await writeAudit(req, {
      action: 'UPDATE',
      entity: 'User',
      entityId: req.user.id,
      description: 'Changed own password.',
      after: { passwordChanged: true }
    });

    res.json({ message: 'Password updated successfully.' });
  })
);

export default router;
