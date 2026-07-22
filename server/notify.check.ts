// Test du fan-out Web Push (pur) + garde transport. Lancé via `npm test` (tsx).
import assert from 'node:assert';
import { webpushRows, transportConfigured } from './notify.ts';

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

console.log('notify.check OK');
