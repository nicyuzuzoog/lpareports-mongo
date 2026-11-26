export const TERMS = [
  { value: 'TERM1', label: 'Term I' },
  { value: 'TERM2', label: 'Term II' },
  { value: 'TERM3', label: 'Term III' }
];

export const REPORT_TYPES = [
  { value: 'MIDTERM', label: 'Mid-term' },
  { value: 'TERM', label: 'Term' },
  { value: 'ANNUAL', label: 'Annual' }
];

export const LEVELS = [
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'LOWER_PRIMARY', label: 'Lower Primary' },
  { value: 'UPPER_PRIMARY', label: 'Upper Primary' }
];

export const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'DOS', label: 'Dean of Studies' },
  { value: 'HEAD_TEACHER', label: 'Head Teacher' },
  { value: 'TEACHER', label: 'Teacher' }
];

export const STATUS_META = {
  DRAFT: { label: 'Draft', className: 'badge-soft-muted', icon: 'bi-pencil' },
  SUBMITTED: { label: 'Awaiting approval', className: 'badge-soft-warning', icon: 'bi-hourglass-split' },
  APPROVED: { label: 'Approved', className: 'badge-soft-success', icon: 'bi-patch-check-fill' }
};

export const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' }
];

// Only two campuses exist. MAIN is the Gisozi site; RULINDO is the branch.
// The stored values stay MAIN/RULINDO; these are the friendly labels.
export const CAMPUSES = [
  { value: 'MAIN', label: 'MAIN — Gisozi' },
  { value: 'RULINDO', label: 'BRANCH — Rulindo' }
];

// Rwandan primary grading bands. Higher points are better (A = 6, F = 0).
export const RWANDA_GRADING = [
  { grade: 'A', min: 70, max: 100, points: 6, remark: 'Excellent' },
  { grade: 'B', min: 65, max: 69, points: 5, remark: 'Very Good' },
  { grade: 'C', min: 60, max: 64, points: 4, remark: 'Good' },
  { grade: 'D', min: 50, max: 59, points: 3, remark: 'Satisfactory' },
  { grade: 'E', min: 40, max: 49, points: 2, remark: 'Adequate' },
  { grade: 'S', min: 20, max: 39, points: 1, remark: 'Fair' },
  { grade: 'F', min: 0, max: 19, points: 0, remark: 'Fail' }
];

export const currentYear = new Date().getFullYear();
export const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index);
