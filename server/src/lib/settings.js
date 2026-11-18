import { prisma } from '../lib/prisma.js';
import { defaultSettingsFor } from '../lib/grading.js';

// One settings document (and one cache entry) per campus.
const cache = new Map();

export async function getSettings(campusId = 'MAIN', force = false) {
  if (cache.has(campusId) && !force) return cache.get(campusId);

  let settings = await prisma.setting.findUnique({ where: { id: campusId } });
  if (!settings) {
    settings = await prisma.setting.create({
      data: { _id: campusId, ...defaultSettingsFor(campusId) }
    });
  }
  cache.set(campusId, settings);
  return settings;
}

/** Without an argument (or with 'ALL') every campus cache entry is cleared. */
export function clearSettingsCache(campusId) {
  if (!campusId || campusId === 'ALL') {
    cache.clear();
    return;
  }
  cache.delete(campusId);
}
