import { prisma } from '../lib/prisma.js';

/**
 * Load the authenticated user on every request so role, activation and
 * delete-permission changes take effect immediately.
 */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const payload = req.app.locals.verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        classes: { include: { class: true } },
        subjects: { include: { subject: true } }
      }
    });

    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    // A token issued for one campus must never be usable on another campus.
    if (!payload.campusId || payload.campusId !== user.campusId) {
      return res.status(401).json({ message: 'Session is not valid for this campus.' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account is deactivated. Contact the Super Admin.' });

    req.user = user;
    req.user.campusId = user.campusId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/** Super Admin or a user explicitly granted the delete permission. */
export function requireDeletePermission(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (req.user.role === 'SUPER_ADMIN' || req.user.canDelete === true) return next();
  return res.status(403).json({
    message: 'Delete permission has not been granted. Ask the Super Admin to enable it.'
  });
}

export const isSuperAdmin = (user) => user.role === 'SUPER_ADMIN';
export const canApprove = (user) => ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);
export const canManageStudents = (user) =>
  ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER', 'TEACHER'].includes(user.role);

export function teacherClassIds(user) {
  return (user.classes || [])
    .filter((entry) => (entry.campusId ?? entry.class?.campusId) === user.campusId)
    .map((entry) => entry.classId);
}

export function teacherSubjectIds(user) {
  return (user.subjects || [])
    .filter((entry) => (entry.campusId ?? entry.subject?.campusId) === user.campusId)
    .map((entry) => entry.subjectId);
}

/**
 * Class ids the user may work with, always restricted to their campus.
 * - Super Admin / Head Teacher: every class on the campus
 * - DOS: primary classes only
 * - Teacher: assigned classes
 */
export async function allowedClassIds(user) {
  const campusId = user.campusId;
  if (['SUPER_ADMIN', 'HEAD_TEACHER'].includes(user.role)) {
    const classes = await prisma.schoolClass.findMany({
      where: { campusId },
      select: { id: true }
    });
    return classes.map((c) => c.id);
  }
  if (user.role === 'DOS') {
    const classes = await prisma.schoolClass.findMany({
      where: { campusId, level: { in: ['LOWER_PRIMARY', 'UPPER_PRIMARY'] } },
      select: { id: true }
    });
    return classes.map((c) => c.id);
  }
  return teacherClassIds(user);
}

export async function assertClassAccess(user, classId) {
  const ids = await allowedClassIds(user);
  if (!ids.includes(classId)) {
    const error = new Error('You do not have access to this class.');
    error.status = 403;
    throw error;
  }
}
