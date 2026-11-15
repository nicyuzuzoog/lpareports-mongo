export const TERMS = [
  { value: 'TERM1', label: 'Term I' },
  { value: 'TERM2', label: 'Term II' },
  { value: 'TERM3', label: 'Term III' }
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

export const currentYear = new Date().getFullYear();
export const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index);
