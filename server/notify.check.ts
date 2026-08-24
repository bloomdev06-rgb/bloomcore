// Test du fan-out Web Push (pur) + garde transport. Lancé via `npm test` (tsx).
import assert from 'node:assert';
import { webpushRows, transportConfigured, emailAllowed } from './notify.ts';

const subs = [
  { endpoint: 'https://push.example/aaa', p256dh: 'p1', auth: 'a1' },
  { endpoint: 'https://push.example/bbb', p256dh: 'p2', auth: 'a2' },
];

// 1) Un membre à 2 abonnements → 2 lignes, dedupe_key distincts (par endpoint).
const rows = webpushRows('notif_x', subs);
assert.equal(rows.length, 2, 'fan-out : 2 lignes');
assert.notEqual(rows[0].dedupeKey, rows[1].dedupeKey, 'dedupe_key distincts');
assert.equal(rows[0].dedupeKey, 'notif_x:webpush:https://push.example/aaa');

// 2) recipient reparse → forme attendue par deliverWebPush ({ endpoint, keys:{p256dh,auth} }).
const parsed = JSON.parse(rows[0].recipient);
assert.equal(parsed.endpoint, 'https://push.example/aaa');
assert.equal(parsed.keys.p256dh, 'p1');
assert.equal(parsed.keys.auth, 'a1');

// 3) Idempotence : mêmes entrées → mêmes clés (un épisode ne re-notifie pas un appareil servi).
assert.deepEqual(
  webpushRows('notif_x', subs).map((r) => r.dedupeKey),
  rows.map((r) => r.dedupeKey),
  'idempotent',
);

// 4) transportConfigured('webpush') suit VAPID_PRIVATE_KEY (pending vs simulated).
const saved = process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_PRIVATE_KEY;
assert.equal(transportConfigured('webpush'), false, 'sans VAPID → simulé');
process.env.VAPID_PRIVATE_KEY = 'x';
assert.equal(transportConfigured('webpush'), true, 'avec VAPID → réel');
if (saved === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = saved;

// 5) #18 — emailAllowed() : coupure fonctionnelle, auth (notif_auth_*) toujours autorisé.
const savedFlag = process.env.FUNCTIONAL_EMAILS_ENABLED;
delete process.env.FUNCTIONAL_EMAILS_ENABLED;
assert.equal(emailAllowed('notif_pending3j_m1'), false, 'fonctionnel bloqué par défaut');
assert.equal(emailAllowed('notif_auth_reset_m1_123'), true, 'reset toujours envoyé');
assert.equal(emailAllowed('notif_auth_activate_m1_123'), true, 'activation toujours envoyée');
process.env.FUNCTIONAL_EMAILS_ENABLED = 'true';
assert.equal(emailAllowed('notif_pending3j_m1'), true, 'réactivable via le flag');
assert.equal(emailAllowed('notif_selfreg_mem_2_mem_3'), true, 'auto-inscription réactivable via le flag');
assert.equal(emailAllowed('notif_relance_mentor_mem_2_mem_3_2026-08-24'), true, 'relance réactivable via le flag');
// #18b — le flag ne réactive QUE les préfixes connus ; une notif générique (CRUD admin,
// id arbitraire) ne part jamais par email, même avec FUNCTIONAL_EMAILS_ENABLED=true.
assert.equal(emailAllowed('notif_abcdef123'), false, 'notif générique jamais email, même flag actif');
if (savedFlag === undefined) delete process.env.FUNCTIONAL_EMAILS_ENABLED; else process.env.FUNCTIONAL_EMAILS_ENABLED = savedFlag;

console.log('notify.check OK');
