// Test du fan-out Web Push (pur) + garde transport. Lancé via `npm test` (tsx).
import assert from 'node:assert';
import { webpushRows, transportConfigured, emailAllowed, shouldDispatchEmail, brevoTemplateConfigured, brevoTemplateIdFor } from './notify.ts';

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
assert.equal(emailAllowed('notif_auth_pending_registration_m1'), true, 'confirmation d’inscription toujours envoyée');
assert.equal(shouldDispatchEmail('notif_auth_activate_m1_123', false, false), true, 'activation contourne les préférences initiales');
assert.equal(shouldDispatchEmail('notif_pending3j_m1', true, false), false, 'email fonctionnel respecte le refus du membre');
process.env.FUNCTIONAL_EMAILS_ENABLED = 'true';
assert.equal(emailAllowed('notif_pending3j_m1'), true, 'réactivable via le flag');
assert.equal(emailAllowed('notif_selfreg_mem_2_mem_3'), true, 'auto-inscription réactivable via le flag');
assert.equal(emailAllowed('notif_relance_mentor_mem_2_mem_3_2026-08-24'), true, 'relance réactivable via le flag');
// #18b — le flag ne réactive QUE les préfixes connus ; une notif générique (CRUD admin,
// id arbitraire) ne part jamais par email, même avec FUNCTIONAL_EMAILS_ENABLED=true.
assert.equal(emailAllowed('notif_abcdef123'), false, 'notif générique jamais email, même flag actif');
if (savedFlag === undefined) delete process.env.FUNCTIONAL_EMAILS_ENABLED; else process.env.FUNCTIONAL_EMAILS_ENABLED = savedFlag;

// 6) Les trois templates Brevo ont chacun un identifiant explicite.
const savedBrevoKey = process.env.BREVO_API_KEY;
const savedBrevoActivation = process.env.BREVO_TEMPLATE_ACTIVATION_ID;
const savedBrevoReset = process.env.BREVO_TEMPLATE_RESET_ID;
const savedBrevoPending = process.env.BREVO_TEMPLATE_PENDING_REGISTRATION_ID;
delete process.env.BREVO_API_KEY;
delete process.env.BREVO_TEMPLATE_ACTIVATION_ID;
delete process.env.BREVO_TEMPLATE_RESET_ID;
delete process.env.BREVO_TEMPLATE_PENDING_REGISTRATION_ID;
assert.equal(brevoTemplateConfigured(), false, 'sans configuration Brevo');
process.env.BREVO_API_KEY = 'test-key';
process.env.BREVO_TEMPLATE_ACTIVATION_ID = '41';
process.env.BREVO_TEMPLATE_RESET_ID = '42';
process.env.BREVO_TEMPLATE_PENDING_REGISTRATION_ID = '43';
assert.equal(brevoTemplateConfigured(), true, 'clé et templates Brevo configurés');
assert.equal(brevoTemplateIdFor('Activation de votre compte BloomCore'), 41, 'template activation');
assert.equal(brevoTemplateIdFor('Réinitialisation de votre mot de passe BloomCore'), 42, 'template réinitialisation');
assert.equal(brevoTemplateIdFor('Votre demande d’inscription BloomCore est en attente de validation'), 43, 'template attente');
if (savedBrevoKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = savedBrevoKey;
if (savedBrevoActivation === undefined) delete process.env.BREVO_TEMPLATE_ACTIVATION_ID; else process.env.BREVO_TEMPLATE_ACTIVATION_ID = savedBrevoActivation;
if (savedBrevoReset === undefined) delete process.env.BREVO_TEMPLATE_RESET_ID; else process.env.BREVO_TEMPLATE_RESET_ID = savedBrevoReset;
if (savedBrevoPending === undefined) delete process.env.BREVO_TEMPLATE_PENDING_REGISTRATION_ID; else process.env.BREVO_TEMPLATE_PENDING_REGISTRATION_ID = savedBrevoPending;

console.log('notify.check OK');
