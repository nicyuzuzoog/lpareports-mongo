import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from './config/env.js';
import { verifyToken } from './lib/jwt.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import classRoutes from './routes/classes.js';
import subjectRoutes from './routes/subjects.js';
import studentRoutes from './routes/students.js';
import assessmentRoutes from './routes/assessments.js';
import reportRoutes from './routes/reports.js';
import analyticsRoutes from './routes/analytics.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
import settingRoutes from './routes/settings.js';

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    skip: (req) => req.path === '/api/health'
  })
);

const vercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.clientOrigins.includes(origin)) return callback(null, true);
      if (allowVercelPreviews && vercelPreview.test(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
app.use('/api', apiLimiter);

app.locals.verifyToken = verifyToken;

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'lpacamis-api',
    environment: config.env,
    time: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Please check the highlighted fields.',
      errors: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'A record with these details already exists.' });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({ message: 'This record is still linked to other records.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Record not found.' });
    }
  }

  const status = error.status || 500;
  if (status >= 500) console.error(error);

  res.status(status).json({
    message: status >= 500 ? 'Something went wrong. Please try again.' : error.message,
    ...(error.details ? { errors: error.details } : {})
  });
});

export default app;
