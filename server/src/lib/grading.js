export const LEVEL_LABELS = {
  NURSERY: 'Nursery',
  LOWER_PRIMARY: 'Lower Primary',
  UPPER_PRIMARY: 'Upper Primary'
};

export const TERM_LABELS = {
  TERM1: 'Term I',
  TERM2: 'Term II',
  TERM3: 'Term III'
};

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  DOS: 'Dean of Studies',
  HEAD_TEACHER: 'Head Teacher',
  TEACHER: 'Teacher'
};

export const DEFAULT_GRADING_SCALES = {
  NURSERY: [
    { min: 80, max: 100, grade: 'A', remark: 'Excellent', points: 5 },
    { min: 70, max: 79, grade: 'B', remark: 'Very good', points: 4 },
    { min: 60, max: 69, grade: 'C', remark: 'Good', points: 3 },
    { min: 50, max: 59, grade: 'D', remark: 'Fair', points: 2 },
    { min: 40, max: 49, grade: 'E', remark: 'Needs support', points: 1 },
    { min: 0, max: 39, grade: 'U', remark: 'Below expectation', points: 0 }
  ],
  LOWER_PRIMARY: [
    { min: 80, max: 100, grade: 'A', remark: 'Excellent', points: 5 },
    { min: 70, max: 79, grade: 'B', remark: 'Very good', points: 4 },
    { min: 60, max: 69, grade: 'C', remark: 'Good', points: 3 },
    { min: 50, max: 59, grade: 'D', remark: 'Fair', points: 2 },
    { min: 40, max: 49, grade: 'E', remark: 'Needs support', points: 1 },
    { min: 0, max: 39, grade: 'U', remark: 'Below expectation', points: 0 }
  ],
  UPPER_PRIMARY: [
    { min: 90, max: 100, grade: 'D1', remark: 'Distinction', points: 1 },
    { min: 80, max: 89, grade: 'D2', remark: 'Distinction', points: 2 },
    { min: 70, max: 79, grade: 'C3', remark: 'Credit', points: 3 },
    { min: 60, max: 69, grade: 'C4', remark: 'Credit', points: 4 },
    { min: 55, max: 59, grade: 'C5', remark: 'Credit', points: 5 },
    { min: 50, max: 54, grade: 'C6', remark: 'Pass', points: 6 },
    { min: 45, max: 49, grade: 'P7', remark: 'Pass', points: 7 },
    { min: 40, max: 44, grade: 'P8', remark: 'Pass', points: 8 },
    { min: 0, max: 39, grade: 'F9', remark: 'Fail', points: 9 }
  ]
};

export const DEFAULT_SETTINGS = {
  schoolName: 'LPACAMIS',
  schoolMotto: 'Knowledge, Character, Service',
  schoolAddress: 'P.O. Box 100, Kampala, Uganda',
  schoolPhone: '+256 700 000 000',
  schoolEmail: 'info@lpacamis.ac.ug',
  headTeacherName: 'Head Teacher',
  dosName: 'Director of Studies',
  passMark: 50,
  lowPerformanceThreshold: 40,
  lowPerformanceMinSubjects: 2,
  courseworkWeight: 40,
  examWeight: 60,
  gradingScales: DEFAULT_GRADING_SCALES
};

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
  if (score >= 80) return 'Exceeds expectations';
  if (score >= 65) return 'Meets expectations';
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

export function assessmentCompetency(level, score, provided) {
  if (provided && String(provided).trim()) return String(provided).trim();
  if (level === 'UPPER_PRIMARY') return null;
  return competencyFor(score);
}
