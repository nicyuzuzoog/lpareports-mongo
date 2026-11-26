import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/env.js';
import { prisma } from '../src/lib/db.js';
import { models } from '../src/models/index.js';
import { seedAll } from './seed.js';

/**
 * Destructive cleanup for an already-seeded database.
 *
 * Keeps only the owner Super Admin (nicjbdede@gmail.com by default) and the
 * global/campus settings, then re-runs the seed so those rows are guaranteed
 * to exist. Everything else is removed: demo staff, students, classes,
 * subjects, marks, report cards and audit history.
 */
const ADMIN_EMAIL = String(process.env.SEED_ADMIN_EMAIL || 'nicjbdede@gmail.com')
  .trim()
  .toLowerCase();

const DATA_MODELS = [
  'teacherClass',
  'teacherSubject',
  'schoolClass',
  'subject',
  'student',
  'reportCard',
  'mark',
  'auditLog',
  'setting',
  'systemSetting'
];

async function counts() {
  const queries = [
    ['users', models.user.countDocuments({})],
    ...DATA_MODELS.map((key) => [key, models[key].countDocuments({})])
  ];
  const entries = await Promise.all(
    queries.map(async ([key, query]) => [key, await query])
  );
  return Object.fromEntries(entries);
}

export async function cleanDb({ dryRun = false } = {}) {
  console.log(`Cleaning LPAREPORTS MongoDB (${config.env})...`);
  await prisma.$connect();
  console.log(`Before: ${JSON.stringify(await counts())}`);

  if (dryRun) {
    console.log('Dry run only. Nothing was deleted.');
    return;
  }

  const users = await models.user.find({}).lean();
  const keepIds = users
    .filter((user) => String(user.email || '').trim().toLowerCase() === ADMIN_EMAIL)
    .map((user) => user._id);

  await models.user.deleteMany({ _id: { $nin: keepIds } });
  for (const key of DATA_MODELS) {
    await models[key].deleteMany({});
  }

  await seedAll();

  console.log(`After:  ${JSON.stringify(await counts())}`);
  console.log(`Kept only ${ADMIN_EMAIL} plus global and campus settings.`);
}

const isDirectRun =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  cleanDb({ dryRun: process.argv.includes('--dry-run') })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
