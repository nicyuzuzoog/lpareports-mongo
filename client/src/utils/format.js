import { STATUS_META, TERMS, LEVELS, ROLES, RWANDA_GRADING } from './constants.js';

export const termLabel = (term) => TERMS.find((item) => item.value === term)?.label || term;

export const levelLabel = (level) => LEVELS.find((item) => item.value === level)?.label || level;

export const roleLabel = (role) => ROLES.find((item) => item.value === role)?.label || role;

export const statusMeta = (status) =>
  STATUS_META[status] || { label: status, className: 'badge-soft-muted', icon: 'bi-circle' };

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export const fullName = (student) =>
  [student?.firstName, student?.otherNames, student?.lastName].filter(Boolean).join(' ');

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function percent(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

// Rwandan bands: A/B are strong, E/S are weak, F is the only failing grade.
export function gradeClass(grade) {
  if (!grade || grade === '-') return 'text-muted-2';
  if (grade === 'F') return 'text-danger';
  if (grade === 'E' || grade === 'S') return 'text-warning';
  if (grade === 'A' || grade === 'B') return 'text-success';
  return 'text-dark';
}

export function gradeBand(grade) {
  return RWANDA_GRADING.find((band) => band.grade === grade) || null;
}

export function pointsForGrade(grade) {
  return gradeBand(grade)?.points ?? null;
}

export function classPosition(position, outOf) {
  if (position === null || position === undefined || position === '') return '—';
  return outOf ? `${ordinal(position)} / ${outOf}` : ordinal(position);
}

export function pointsLabel(points) {
  return points === null || points === undefined ? '—' : `${points} ${points === 1 ? 'pt' : 'pts'}`;
}

export function average(values) {
  const numbers = values.map(Number).filter((value) => !Number.isNaN(value));
  if (!numbers.length) return null;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
}

export function ordinal(position) {
  if (!position) return '—';
  const suffix =
    position % 100 >= 11 && position % 100 <= 13
      ? 'th'
      : { 1: 'st', 2: 'nd', 3: 'rd' }[position % 10] || 'th';
  return `${position}${suffix}`;
}

export function gradeFromScale(score, scale = []) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '—';
  const rounded = Math.round(Number(score));
  return scale.find((band) => rounded >= band.min && rounded <= band.max)?.grade || '—';
}

export function computePreviewTotal(ca, exam, courseworkWeight = 40, examWeight = 60) {  const caNumber = ca === '' || ca === null || ca === undefined ? null : Number(ca);
  const examNumber = exam === '' || exam === null || exam === undefined ? null : Number(exam);
  if (caNumber === null && examNumber === null) return null;
  if (Number.isNaN(caNumber) || Number.isNaN(examNumber)) return null;
  const sum = courseworkWeight + examWeight || 100;
  const total =
    ((caNumber ?? 0) * courseworkWeight + (examNumber ?? 0) * examWeight) / sum;
  return Math.round(total * 10) / 10;
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ');
}
