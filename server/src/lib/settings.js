import { prisma } from '../lib/prisma.js';
import { DEFAULT_SETTINGS } from '../lib/grading.js';

let cached = null;

export async function getSettings(force = false) {
  if (cached && !force) return cached;

  let settings = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.setting.create({
      data: { id: 1, ...DEFAULT_SETTINGS }
    });
  }
  cached = settings;
  return settings;
}

export function clearSettingsCache() {
  cached = null;
}
