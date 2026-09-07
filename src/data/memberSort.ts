import type { Member } from '../types';

const frenchNameCollator = new Intl.Collator('fr', {
  sensitivity: 'base',
  ignorePunctuation: true,
  numeric: true,
});

const cleanName = (value: string | undefined) => String(value ?? '').trim().replace(/\s+/g, ' ');

/** Ordre d'annuaire : nom de famille, puis prénom, puis id stable. */
export function compareMembersByLastName(a: Member, b: Member): number {
  return frenchNameCollator.compare(cleanName(a.lastName), cleanName(b.lastName))
    || frenchNameCollator.compare(cleanName(a.firstName), cleanName(b.firstName))
    || a.id.localeCompare(b.id);
}
