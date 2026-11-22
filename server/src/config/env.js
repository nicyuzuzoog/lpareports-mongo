import 'dotenv/config';

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  // MySQL connection string used by Prisma (mysql://user:pass@host:3306/db).
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'lpareports-development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigins: origins,
  trustProxy: toBool(process.env.TRUST_PROXY, true),
  schoolLogoUrl: process.env.SCHOOL_LOGO_URL || ''
};

if (!config.databaseUrl || !config.databaseUrl.startsWith('mysql://')) {
  throw new Error('DATABASE_URL must be set to a MySQL connection string (mysql://...).');
}

if (config.isProduction && config.jwtSecret === 'lpareports-development-secret-change-me') {
  // Refuse to boot with the development secret in production.
  throw new Error('JWT_SECRET must be set to a strong random value in production.');
}
