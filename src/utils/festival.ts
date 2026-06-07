import type { CSSProperties } from 'react';
import type { Festival } from '../types';

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
});

export const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function toSearchText(festival: Festival) {
  return [
    festival.name,
    festival.city,
    festival.region,
    festival.location,
    festival.description,
    festival.styles.join(' '),
    festival.artists.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es-ES');
}

export function normalizeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFestivalDate(festival: Festival) {
  const start = normalizeDate(festival.start_date);
  const end = normalizeDate(festival.end_date);

  if (!start) return festival.date_text ?? 'Fecha pendiente';
  if (!end || start.getTime() === end.getTime()) return dateFormatter.format(start);
  return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
}

function hashString(value: string) {
  return [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

export function getFallbackStyle(name: string) {
  const hash = hashString(name);
  const hueA = hash % 360;
  const hueB = (hueA + 85 + ((hash >> 8) % 80)) % 360;
  const angle = 120 + (hash % 80);

  return {
    '--fallback-angle': `${angle}deg`,
    '--fallback-color-a': `hsl(${hueA} 62% 34%)`,
    '--fallback-color-b': `hsl(${hueB} 68% 42%)`,
    '--fallback-color-c': `hsl(${(hueA + 28) % 360} 70% 25%)`,
  } as CSSProperties;
}

export function getCountdownLabel(festival: Festival) {
  const start = normalizeDate(festival.start_date);
  if (!start) return 'Fecha pendiente';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'Ya celebrado';
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  return `Faltan ${diffDays} días`;
}

export function monthName(month: number) {
  const label = monthFormatter.format(new Date(2026, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
}

export function getFestivalMonthNumbers(festival: Festival) {
  if (!festival.start_date) return [];
  const start = normalizeDate(festival.start_date);
  const end = normalizeDate(festival.end_date) ?? start;
  if (!start || !end) return [];

  const months = new Set<number>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= limit) {
    months.add(cursor.getMonth() + 1);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return [...months];
}

export function overlapsDateRange(festival: Festival, from: string, to: string) {
  if (!from && !to) return true;
  const start = normalizeDate(festival.start_date);
  const end = normalizeDate(festival.end_date) ?? start;
  if (!start || !end) return false;

  const fromDate = from ? normalizeDate(from) : null;
  const toDate = to ? normalizeDate(to) : null;

  if (fromDate && end < fromDate) return false;
  if (toDate && start > toDate) return false;
  return true;
}

export function isPastFestival(festival: Festival) {
  const festivalEnd = normalizeDate(festival.end_date) ?? normalizeDate(festival.start_date);
  if (!festivalEnd) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return festivalEnd < today;
}

export function getPlace(festival: Festival) {
  return festival.region || festival.city || festival.location || 'Lugar sin clasificar';
}

export function isConfirmedDate(festival: Festival) {
  return Boolean(
    festival.start_date &&
      festival.end_date &&
      festival.status !== 'cancelado' &&
      festival.status !== 'pendiente',
  );
}

export function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
