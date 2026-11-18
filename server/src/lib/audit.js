import { prisma } from '../lib/prisma.js';

/**
 * Append an immutable entry to the audit trail. Never throws into the request
 * path - audit failures are logged to the console instead.
 */
export async function writeAudit(req, entry) {
  try {
    const user = req.user;
    await prisma.auditLog.create({
      data: {
        campusId: user?.campusId || entry.campusId || 'MAIN',
        userId: user?.id || null,
        userName: user?.name || entry.userName || 'System',
        userRole: user?.role || entry.userRole || 'SYSTEM',
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ? String(entry.entityId) : null,
        description: entry.description || null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: req.ip || req.headers['x-forwarded-for']?.toString() || null,
        userAgent: req.get('user-agent') || null
      }
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}
