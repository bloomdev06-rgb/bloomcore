// Run: npx tsx src/data/notificationRules.check.ts
import assert from 'node:assert';
import { deriveTimeBasedNotifications } from './notificationRules';
import { Member } from '../types';

const now = new Date('2026-06-30T12:00:00Z');
const mk = (over: Partial<Member>): Member => ({
  id: 'm1', firstName: 'A', lastName: 'B', branch: 'church',
  integrationState: 'En attente', integrationDateRegistered: '2026-06-29',
  ...over,
} as Member);

// >7 days → 'alert' (au rouge), >3 days → 'warning' (réception), else nothing
assert.deepEqual(deriveTimeBasedNotifications([mk({ integrationDateRegistered: '2026-06-29' })], now), []);
assert.equal(deriveTimeBasedNotifications([mk({ integrationDateRegistered: '2026-06-26' })], now)[0].type, 'warning');
assert.equal(deriveTimeBasedNotifications([mk({ integrationDateRegistered: '2026-06-20' })], now)[0].type, 'alert');
assert.deepEqual(deriveTimeBasedNotifications([mk({ integrationState: 'Suivi' })], now), []);
assert.deepEqual(deriveTimeBasedNotifications([mk({ integrationDateRegistered: undefined })], now), []);

// D6 — "au rouge" notifie plusieurs destinataires : coach assigné (mentorId) + Responsable du dépt.
const redMember = mk({ id: 'mR', integrationDateRegistered: '2026-06-05', mentorId: 'coach1', departments: { d1: 'Membre' } as any });
const responsable = mk({ id: 'resp1', integrationState: 'Intégré', departments: { d1: 'Responsable' } as any });
const redRecipients = new Set(
  deriveTimeBasedNotifications([redMember, responsable], now)
    .filter(n => n.title === 'Membre au rouge' && n.targetMemberId)
    .map(n => n.targetMemberId),
);
assert.ok(redRecipients.has('coach1'), 'D6 — coach assigné (mentorId) destinataire');
assert.ok(redRecipients.has('resp1'), 'D6 — Responsable du département destinataire');

console.log('notificationRules.check OK');
