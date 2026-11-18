import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

function buildWhere(query, campusId) {
  const where = { campusId };
  if (query.action) where.action = String(query.action);
  if (query.entity) where.entity = String(query.entity);
  if (query.userId) where.userId = String(query.userId);
  if (query.search) {
    const text = String(query.search);
    where.OR = [
      { userName: { contains: text, mode: 'insensitive' } },
      { description: { contains: text, mode: 'insensitive' } },
      { entity: { contains: text, mode: 'insensitive' } },
      { entityId: { contains: text, mode: 'insensitive' } },
      { ip: { contains: text, mode: 'insensitive' } }
    ];
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(String(query.from));
    if (query.to) {
      const to = new Date(String(query.to));
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  return where;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 30)));
    const where = buildWhere(req.query, req.user.campusId);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    res.json({
      logs,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
    });
  })
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const where = buildWhere(req.query, req.user.campusId);
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000
    });

    const escape = (value) => {
      if (value === null || value === undefined) return '';
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = [
      ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Entity ID', 'Description', 'IP', 'Before', 'After'],
      ...logs.map((log) => [
        log.createdAt.toISOString(),
        log.userName,
        log.userRole,
        log.action,
        log.entity,
        log.entityId,
        log.description,
        log.ip,
        log.before,
        log.after
      ])
    ];

    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lpareports-audit-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  })
);

export default router;
