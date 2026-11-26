import { prisma } from './db.js';

/**
 * Render/Vercel first-boot helper.
 *
 * A fresh MongoDB Atlas database has no collections. Seed it automatically
 * once so the deployed app is usable immediately, while leaving an existing
 * database completely untouched. `npm run db:setup` still does the same thing
 * explicitly when you want to refresh the demo records.
 */
let seeding;

export async function ensureSeeded() {
  if (seeding) return seeding;

  seeding = (async () => {
    const users = await prisma.user.count();
    if (users > 0) return false;

    console.log('Empty MongoDB detected — running the initial LPAREPORTS seed...');
    const { seedAll } = await import('../../scripts/seed.js');
    await seedAll();
    console.log('Initial seed finished.');
    return true;
  })();

  try {
    return await seeding;
  } finally {
    seeding = undefined;
  }
}
