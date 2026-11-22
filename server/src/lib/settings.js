import { prisma } from '../lib/prisma.js';
import { defaultSettingsFor } from '../lib/grading.js';

// One settings document (and one cache entry) per campus.
const cache = new Map();

export async function getSettings(campusId = 'MAIN', force = false) {
  if (cache.has(campusId) && !force) return cache.get(campusId);

  let settings = await prisma.setting.findUnique({ where: { id: campusId } });
  if (!settings) {
    settings = await prisma.setting.create({
      data: { id: campusId, ...defaultSettingsFor(campusId) }
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

const SYSTEM_SETTINGS_ID = 'GLOBAL';
let systemSettingsCache = null;

/** Global switches shared by both campuses (one row with id "GLOBAL"). */
export async function getSystemSettings() {
  if (systemSettingsCache) return systemSettingsCache;

  let settings = await prisma.systemSetting.findUnique({ where: { id: SYSTEM_SETTINGS_ID } });
  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: { id: SYSTEM_SETTINGS_ID, studentRegistrationEnabled: true }
    });
  }
  systemSettingsCache = settings;
  return settings;
}

export function clearSystemSettingsCache() {
  systemSettingsCache = null;
}

export async function setStudentRegistrationEnabled(value) {
  const studentRegistrationEnabled = value === true || value === 'true' || value === 1 || value === '1';
  const settings = await prisma.systemSetting.upsert({
    where: { id: SYSTEM_SETTINGS_ID },
    create: { id: SYSTEM_SETTINGS_ID, studentRegistrationEnabled },
    update: { studentRegistrationEnabled }
  });
  clearSystemSettingsCache();
  return settings;
}

export class RegistrationClosedError extends Error {
  constructor(message = 'Student registration is currently disabled. Please contact the Super Admin.') {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}
