export const LEVEL_LABELS = {
  NURSERY: 'Nursery',
  LOWER_PRIMARY: 'Lower Primary',
  UPPER_PRIMARY: 'Upper Primary'
};

export const TERM_LABELS = {
  TERM1: 'Term I',
  TERM2: 'Term II',
  TERM3: 'Term III',
  ANNUAL: 'Annual'
};

/** Report card types. ANNUAL cards use term 'ANNUAL'. */
export const REPORT_TYPES = {
  MIDTERM: 'MIDTERM',
  TERM: 'TERM',
  ANNUAL: 'ANNUAL'
};

export const REPORT_TYPE_LABELS = {
  MIDTERM: 'Mid-Term Test',
  TERM: 'Term',
  ANNUAL: 'Annual'
};

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  DOS: 'Dean of Studies',
  HEAD_TEACHER: 'Head Teacher',
  TEACHER: 'Teacher'
};

// Rwanda Ministry of Education / NESA primary grading bands (effective 2022).
// Higher grade values are better: maximum aggregate is 6 x number of subjects.
const RWANDA_PRIMARY_SCALE = [
  { min: 70, max: 100, grade: 'A', remark: 'Excellent', points: 6 },
  { min: 65, max: 69, grade: 'B', remark: 'Very Good', points: 5 },
  { min: 60, max: 64, grade: 'C', remark: 'Good', points: 4 },
  { min: 50, max: 59, grade: 'D', remark: 'Satisfactory', points: 3 },
  { min: 40, max: 49, grade: 'E', remark: 'Adequate', points: 2 },
  { min: 20, max: 39, grade: 'S', remark: 'Fair', points: 1 },
  { min: 0, max: 19, grade: 'F', remark: 'Fail', points: 0 }
];

export const DEFAULT_GRADING_SCALES = {
  NURSERY: RWANDA_PRIMARY_SCALE,
  LOWER_PRIMARY: RWANDA_PRIMARY_SCALE,
  UPPER_PRIMARY: RWANDA_PRIMARY_SCALE
};

export const CAMPUSES = {
  MAIN: { id: 'MAIN', name: 'LIGHT PEACE ACADEMY', short: 'M', location: 'Kigali, Rwanda' },
  RULINDO: { id: 'RULINDO', name: 'LIGHT PEACE ACADEMY RULINDO', short: 'R', location: 'Rulindo, Rwanda' }
};

const CAMPUS_CONTACT = {
  MAIN: {
    schoolMotto: 'excellent working for success',
    schoolPhone: '+250 788 300 100',
    schoolEmail: 'info@peacelight.com',
    headTeacherName: 'Mr. Nkurunziza Emmanuel',
    dosName: 'Ms. Mukamana Grace'
  },
  RULINDO: {
    schoolMotto: 'excellent working for success',
    schoolPhone: '+250 788 300 200',
    schoolEmail: 'info@peacelight.com',
    headTeacherName: 'Mr. Habimana Jean',
    dosName: 'Ms. Uwimana Claudine'
  }
};

export function defaultSettingsFor(campusId = 'MAIN') {
  const campus = CAMPUSES[campusId] || CAMPUSES.MAIN;
  const contact = CAMPUS_CONTACT[campus.id] || CAMPUS_CONTACT.MAIN;

  return {
    schoolName: campus.name,
    schoolMotto: contact.schoolMotto,
    schoolAddress: campus.location,
    schoolPhone: contact.schoolPhone,
    schoolEmail: contact.schoolEmail,
    headTeacherName: contact.headTeacherName,
    dosName: contact.dosName,
    passMark: 50,
    lowPerformanceThreshold: 40,
    lowPerformanceMinSubjects: 2,
    courseworkWeight: 40,
    examWeight: 60,
    gradingScales: DEFAULT_GRADING_SCALES
  };
}

// Backwards-compatible alias for callers that still expect a single default object.
export const DEFAULT_SETTINGS = defaultSettingsFor('MAIN');

export function clampScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  if (Number.isNaN(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

export function scalesFor(settings, level) {
  const scales = settings?.gradingScales || DEFAULT_GRADING_SCALES;
  return scales[level] || DEFAULT_GRADING_SCALES[level] || DEFAULT_GRADING_SCALES.LOWER_PRIMARY;
}

export function gradeFor(score, level, settings) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return { grade: '-', remark: 'Not assessed', points: null };
  }
  const rounded = Math.round(Number(score));
  const scale = scalesFor(settings, level);
  const match = scale.find((item) => rounded >= item.min && rounded <= item.max);
  return match
    ? { grade: match.grade, remark: match.remark, points: match.points ?? null }
    : { grade: '-', remark: 'Not assessed', points: null };
}

export function computeTotal(caScore, examScore, settings) {
  const ca = clampScore(caScore);
  const exam = clampScore(examScore);
  if (ca === null && exam === null) return null;
  const caWeight = Number(settings?.courseworkWeight ?? 40);
  const examWeight = Number(settings?.examWeight ?? 60);
  const weightSum = caWeight + examWeight || 100;
  const caPart = ca === null ? 0 : (ca * caWeight) / weightSum;
  const examPart = exam === null ? 0 : (exam * examWeight) / weightSum;
  return Math.round((caPart + examPart) * 10) / 10;
}

export function competencyFor(score) {
  if (score === null || score === undefined) return null;
  if (score >= 70) return 'Exceeds expectations';
  if (score >= 60) return 'Meets expectations';
  if (score >= 50) return 'Approaching expectations';
  return 'Needs support';
}

export function averageOf(values) {
  const numbers = values.map(Number).filter((n) => !Number.isNaN(n));
  if (!numbers.length) return null;
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / numbers.length) * 10) / 10;
}

export function ordinal(position) {
  if (!position) return '-';
  const suffix = position % 100 >= 11 && position % 100 <= 13
    ? 'th'
    : { 1: 'st', 2: 'nd', 3: 'rd' }[position % 10] || 'th';
  return `${position}${suffix}`;
}

export function termLabel(term) {
  return TERM_LABELS[term] || term;
}

export function reportTypeLabel(type) {
  return REPORT_TYPE_LABELS[type] || type;
}

/**
 * The score used for summaries/ranking on a given report type.
 * Mid-term test reports use the separately stored midtermScore; every other
 * type uses the weighted `total` (coursework + exam only).
 */
export function effectiveScoreFor(mark, type = 'TERM') {
  if (type === REPORT_TYPES.MIDTERM) {
    const value = mark?.midtermScore;
    return value === null || value === undefined || value === '' ? null : Number(value);
  }
  const value = mark?.total;
  return value === null || value === undefined || value === '' ? null : Number(value);
}

export function assessmentCompetency(level, score, provided) {
  if (provided && String(provided).trim()) return String(provided).trim();
  if (level === 'UPPER_PRIMARY') return null;
  return competencyFor(score);
}
