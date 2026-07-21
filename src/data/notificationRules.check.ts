// Run: npx tsx src/data/notificationRules.check.ts
import assert from 'node:assert';
import { deriveTimeBasedNotifications } from './notificationRules';
import { Member, Department, Ministry } from '../types';

const now = new Date('2026-06-30T12:00:00Z');
const delays = { pending: 3, red: 7 };
const mk = (over: Partial<Member>): Member => ({
  id: 'm1', firstName: 'A', lastName: 'B', branch: 'church',
  integrationState: 'suivi',
  ...over,
} as Member);

const departments = [{ id: 'd1', name: 'D1', ministryId: 'min1' }] as unknown as Department[];
const ministries = [{ id: 'min1', name: 'M1', tuteurId: 'tut1' }] as unknown as Ministry[];

const target = (over: Partial<Member>) =>
  mk({ id: 'mR', mentorId: 'coach1', departments: { d1: 'membre' } as any, ...over });
const responsable = mk({ id: 'resp1', integrationState: 'integre', departments: { d1: 'responsable' } as any });

const relanceRecipients = (clock: string) =>
  new Set(
    deriveTimeBasedNotifications([target({ integrationDateRegistered: clock }), responsable], now, delays, departments, ministries)
      .filter(n => n.title === 'Relance suivi')
      .map(n => n.targetMemberId),
  );

// §7.2 — escalade graduée sur l'horloge de contact (ici = date d'enregistrement).
assert.deepEqual(relanceRecipients('2026-06-29'), new Set(), 'J+1 → aucun palier');
assert.deepEqual(relanceRecipients('2026-06-26'), new Set(['coach1']), 'J+4 → mentor');
assert.deepEqual(relanceRecipients('2026-06-22'), new Set(['coach1', 'resp1']), 'J+8 → mentor + responsable');
assert.deepEqual(relanceRecipients('2026-06-19'), new Set(['coach1', 'resp1', 'tut1']), 'J+11 → + ministre de tutelle');

// lastContact réarme l'horloge : enregistré il y a longtemps mais contacté hier → pas de relance.
{
  const m = target({ integrationDateRegistered: '2026-05-01', lastContact: '2026-06-29' });
  const relances = deriveTimeBasedNotifications([m, responsable], now, delays, departments, ministries).filter(n => n.title === 'Relance suivi');
  assert.equal(relances.length, 0, 'lastContact récent réarme l’horloge');
}

// Idempotence : ids déterministes → deux passes identiques (la dédup en aval supprime la 2e).
{
  const call = () =>
    deriveTimeBasedNotifications([target({ integrationDateRegistered: '2026-06-19' }), responsable], now, delays, departments, ministries)
      .map(n => n.id).sort();
  assert.deepEqual(call(), call(), 'ids déterministes (idempotent)');
}

// Re-lapse : un nouvel épisode (horloge différente) génère de nouveaux ids → ré-alerte.
{
  const idsEarly = deriveTimeBasedNotifications([target({ integrationDateRegistered: '2026-06-19' })], now, delays, departments, ministries).map(n => n.id);
  const idsLate = deriveTimeBasedNotifications([target({ integrationDateRegistered: '2026-06-10', lastContact: '2026-06-17' })], now, delays, departments, ministries).map(n => n.id);
  assert.ok(idsEarly.some(id => !idsLate.includes(id)), 'nouvel épisode = nouveaux ids');
}

// Réception à valider — concern distinct, en_attente non validé au-delà de 3j.
{
  const m = mk({ id: 'mP', integrationState: 'en_attente', integrationDateRegistered: '2026-06-26' });
  assert.ok(
    deriveTimeBasedNotifications([m], now, delays).some(n => n.title === 'Réception à valider' && n.type === 'warning'),
    'réception à valider fire',
  );
  const validated = mk({ id: 'mP2', integrationState: 'en_attente', integrationDateRegistered: '2026-06-26', receptionValidated: true } as any);
  assert.ok(
    !deriveTimeBasedNotifications([validated], now, delays).some(n => n.title === 'Réception à valider'),
    'receptionValidated=true → plus d’alerte réception',
  );
}

console.log('notificationRules.check OK');
