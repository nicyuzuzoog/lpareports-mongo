import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db.js';
import { config } from '../src/config/env.js';
import { CAMPUSES, defaultSettingsFor } from '../src/lib/grading.js';

/**
 * Minimal seed.
 *
 * Only the owner account and the settings the application needs are created.
 * No demo staff, students, classes, subjects, marks or report cards are added.
 * The seed is idempotent: running it again only refreshes these same rows.
 */
const ADMIN_EMAIL = String(process.env.SEED_ADMIN_EMAIL || 'nicjbdede@gmail.com')
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';
const ADMIN_ID = 'user-GLOBAL-owner';

export async function seedAll() {
  console.log(`Seeding LPAREPORTS into MongoDB (${config.env})...`);
  await prisma.$connect();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminData = {
    campusId: 'MAIN',
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    phone: null,
    passwordHash,
    role: 'SUPER_ADMIN',
    isActive: true,
    canDelete: false,
    isGlobal: true,
    classTeacherClassId: null
  };

  await prisma.user.upsert({
    where: { campusId: 'MAIN', email: ADMIN_EMAIL },
    create: { id: ADMIN_ID, ...adminData },
    update: adminData
  });

  await prisma.systemSetting.upsert({
    where: { id: 'GLOBAL' },
    create: {
      id: 'GLOBAL',
      studentRegistrationEnabled: true,
      loginDisabledExceptSuperAdmin: false
    },
    update: {
      studentRegistrationEnabled: true,
      loginDisabledExceptSuperAdmin: false
    }
  });

  for (const campus of Object.values(CAMPUSES)) {
    const settings = defaultSettingsFor(campus.id);
    await prisma.setting.upsert({
      where: { id: campus.id },
      create: { id: campus.id, ...settings },
      update: settings
    });
  }

  console.log('\nSeed complete.');
  console.log(`  Super Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('  Campuses: MAIN and RULINDO (same global account).');
  console.log('  Settings: created for both campuses. No demo data was added.');
}

const isDirectRun =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  seedAll()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
