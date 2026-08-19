// BloomCore API — pragmatic subset of ARCHITECTURE_TECHNIQUE.md's target design
// (Express is already a project dependency; PostgreSQL+Prisma is not — see
// db.ts for the reasoning). Mirrors exactly the collections the frontend
// already persists to localStorage (src/data/index.ts's `seeds`), so wiring
// is a drop-in: same names, same whole-array-replace shape.
// Charge .env EN PREMIER : auth.ts/db.ts lisent process.env au chargement du module.
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { getCollection, setCollection, appendToCollection, getKv, setKv, getCredential, syncOpSeen, markSyncOp, insertWebhookEvent, markWebhookProcessed, insertPushSub, deletePushSub } from './datastore.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, createOneTimeToken, consumeOneTimeToken, upsertCredentials, requireSecret, usingInsecureSecret, resolveBindHost } from './auth.ts';
import { ensureSeeded } from './seed.ts';
import { runBootMigration } from './bootMigrate.ts';
import { applyWrite, readCollection, deltaToWhole, GuardError } from './guards.ts';
import { buildContext, assertCanWrite, filterReadable, preservedIds, RbacContext } from './rbac.ts';
import { dispatch } from './notify.ts';
import { addClient, poke, initPokeSubscriber } from './stream.ts';
import { startScheduler } from './scheduler.ts';
import { loginKey, isLocked, recordFail, clearFails } from './rateLimit.ts';
import { redisHealthy } from './redis.ts';
import { MemberSchema, MemberPatchSchema } from '../packages/schemas/member.ts';
import { ReportSchema, ReportPatchSchema } from '../packages/schemas/report.ts';
import {
  EventSchema, EventPatchSchema, NotificationSchema, NotificationPatchSchema,
  CertificationSchema, CertificationPatchSchema, IntegrationReportSchema, IntegrationReportPatchSchema,
  MinistrySchema, MinistryPatchSchema, DepartmentSchema, DepartmentPatchSchema,
  ActivitySchema, ActivityPatchSchema, ProjectSchema, ProjectPatchSchema,
  BusLineSchema, BusLinePatchSchema, FormSchema, FormPatchSchema,
} from '../packages/schemas/collections.ts';

// M6 — importer les vraies données SQLite→Postgres AVANT le seed, pour que
// ensureSeeded ne fasse que combler ce qui manque (idempotent, no-op en SQLite).
await runBootMigration();
await ensureSeeded();

const app = express();
// Compression gzip de tout (assets + JSON API) : le bootstrap ~450 Ko tombe à ~60 Ko —
// facteur dominant sur mobile/3G.
app.use(compression());
// rawBody conservé pour la vérification HMAC du webhook École Bloom.
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } })); // avatar photos are base64 data URIs

// S8 — CORS par allow-list (plus de réflexion aveugle de l'origine) + headers de durcissement.
// En prod, seules les origines de CORS_ORIGINS sont acceptées ; en dev, les ports Vite locaux.
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS
  || (IS_PROD ? '' : 'http://localhost:3000,http://localhost:5173,http://localhost:5199')
).split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CSP : hôtes externes réellement utilisés — tuiles OpenStreetMap (Leaflet), Google Fonts,
  // et 'unsafe-inline' pour les styles inline runtime (Motion/Recharts/Leaflet). Le reste est
  // verrouillé à 'self'. En dev le SPA est servi par Vite (pas par ce serveur) → pas d'impact.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: https://*.tile.openstreetmap.org",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  // HSTS : seulement en prod (derrière le TLS de Coolify) — inutile/nuisible en HTTP local.
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const ARRAY_COLLECTIONS = new Set([
  'members', 'events', 'reports', 'audits', 'notifications', 'forms',
  'delegations', 'ministries', 'departments', 'certifications', 'admins', 'activities', 'integration_reports',
  'projects', 'bus_lines', 'capability_overrides', 'special_authorizations',
]);
const KV_KEYS = new Set(['permissions', 'settings']);

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const memberId = token ? await verifyToken(token) : null;
  if (!memberId) return res.status(401).json({ error: 'unauthorized' });
  // Contexte RBAC complet (membre + rôles résolus depuis les données).
  const ctx = await buildContext(memberId);
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });
  (req as any).memberId = memberId;
  (req as any).rbac = ctx;
  next();
}

const isAdmin = (ctx: RbacContext) => ctx.roles.includes('Admin') || ctx.roles.includes('Super Admin');

// Healthcheck public (orchestrateur / load balancer / Docker HEALTHCHECK) — pas d'auth.
// Vérifie que le process répond ET que la base (SQLite/Postgres) est joignable.
// redis: null = non configuré (REDIS_URL absent, ne fait pas échouer le check — Redis
// reste optionnel, cf. Phase 2) ; true/false = configuré et joignable ou non.
app.get('/api/v1/health', async (_req, res) => {
  try {
    await readCollection('members');
    res.json({ ok: true, ts: Date.now(), redis: await redisHealthy() });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// WORKFLOWS §84-85 — login par téléphone OU email (`identifier` ; `phone` reste
// accepté en alias pour l'ancien client). Pas d'auto-inscription : un membre
// sans ligne credentials n'est simplement pas encore activé.
async function findByIdentifier(identifier: string) {
  const norm = String(identifier).replace(/\s/g, '');
  const lower = norm.toLowerCase();
  return (await readCollection('members')).find(
    (m) => String(m.phone).replace(/\s/g, '') === norm || (m.email && String(m.email).toLowerCase() === lower),
  );
}

// S5 — anti-brute-force (par IP + identifiant). Compteur déplacé vers server/rateLimit.ts
// (Phase 2, T2.2) : partagé via Redis si REDIS_URL est défini (survit aux redéploiements,
// partagé entre instances), repli en mémoire per-instance identique à l'original sinon.
// Hash factice : verifyPassword tourne même si le compte n'existe pas → le temps de
// réponse ne distingue plus « compte existant » de « inexistant » (anti-oracle de timing).
const DUMMY_HASH = hashPassword('__nonexistent_account__');

app.post('/api/v1/auth/login', async (req, res) => {
  const { identifier, phone, password } = req.body ?? {};
  const id = identifier ?? phone;
  if (!id || !password) return res.status(400).json({ error: 'identifier and password required' });
  const key = loginKey(req.ip, id);
  if (await isLocked(key)) return res.status(429).json({ error: 'trop de tentatives, réessayez plus tard' });
  const member = await findByIdentifier(id);
  const cred = member ? await getCredential(member.id) : null;
  const ok = verifyPassword(password, cred?.password_hash ?? DUMMY_HASH);
  if (!member || !cred || !ok) {
    await recordFail(key);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  await clearFails(key);
  res.json({ token: await signToken(member.id), member });
});

// Activation / réinitialisation — envoi simulé via les adapters (trigger 17 :
// connexion/réinit). Toujours 200 (anti-énumération de comptes). Hors prod, le
// token est renvoyé dans la réponse (`devToken`) : la démo n'a aucun canal réel
// où le lire.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const isProd = IS_PROD;

async function issueAuthLink(member: any, purpose: 'activate' | 'reset'): Promise<string> {
  const token = await createOneTimeToken(member.id, purpose);
  const label = purpose === 'activate' ? 'Activation de votre compte BloomCore' : 'Réinitialisation de votre mot de passe BloomCore';
  await dispatch(
    [{
      id: `notif_auth_${purpose}_${member.id}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: label,
      message: `${APP_URL}/?${purpose}=${token}`,
      type: 'info',
      read: false,
      targetMemberId: member.id,
    }],
    [member],
    await getKv('settings'),
  );
  return token;
}

app.post('/api/v1/auth/request-activation', async (req, res) => {
  const member = req.body?.identifier ? await findByIdentifier(req.body.identifier) : null;
  const devToken = member ? await issueAuthLink(member, 'activate') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

app.post('/api/v1/auth/request-reset', async (req, res) => {
  const member = req.body?.identifier ? await findByIdentifier(req.body.identifier) : null;
  const devToken = member ? await issueAuthLink(member, 'reset') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

app.post('/api/v1/auth/complete', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'mot de passe trop court (min 8)' });
  const consumed = await consumeOneTimeToken(String(token));
  if (!consumed) return res.status(401).json({ error: 'token invalide, expiré ou déjà utilisé' });
  await upsertCredentials(consumed.memberId, String(password));
  const member = (await readCollection('members')).find((m) => m.id === consumed.memberId);
  res.json({ token: await signToken(consumed.memberId), member });
});

app.post('/api/v1/auth/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body ?? {};
  if (!current || !next) return res.status(400).json({ error: 'current and next required' });
  if (String(next).length < 8) return res.status(400).json({ error: 'mot de passe trop court (min 8)' });
  const memberId = (req as any).memberId as string;
  const cred = await getCredential(memberId);
  if (!cred || !verifyPassword(String(current), cred.password_hash)) {
    return res.status(401).json({ error: 'mot de passe actuel incorrect' });
  }
  await upsertCredentials(memberId, String(next));
  // pwd_version vient d'être incrémentée → l'ancien token de CE client est aussi invalidé.
  // On lui en émet un frais (pv à jour) pour que sa session survive ; les autres appareils
  // (tokens à l'ancienne pv) sont déconnectés — c'est l'effet recherché.
  res.json({ ok: true, token: await signToken(memberId) });
});

app.post('/api/v1/auth/admin-reset', requireAuth, async (req, res) => {
  const ctx = (req as any).rbac as RbacContext;
  if (!isAdmin(ctx)) return res.status(403).json({ error: 'réservé aux Admin' });
  const { memberId } = req.body ?? {};
  const member = (await readCollection('members')).find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ error: 'membre inconnu' });
  const devToken = await issueAuthLink(member, 'reset');
  // Journal inviolable : la réinitialisation par un admin est auditée côté serveur.
  await applyWrite('audits', [
    ...(await readCollection('audits')),
    {
      id: `aud_pwd_reset_${memberId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'PASSWORD_RESET_ISSUED',
      operatorName: `${ctx.member.firstName} ${ctx.member.lastName}`,
      operatorId: ctx.member.id,
      details: `Lien de réinitialisation émis pour ${member.firstName} ${member.lastName}.`,
    },
  ]);
  res.json({ ok: true, ...(!isProd ? { devToken } : {}) });
});

app.get('/api/v1/auth/me', requireAuth, async (req, res) => {
  const member = (await getCollection('members')).find((m) => m.id === (req as any).memberId);
  if (!member) return res.status(404).json({ error: 'not found' });
  res.json(member);
});

// --- Web Push (§7 canal push) : clé publique VAPID + (dé)abonnement par appareil. ---
// Clé lue au runtime (pas de rebuild front à changer de clé) ; null = push non configuré.
app.get('/api/v1/push/public-key', (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});
app.post('/api/v1/push/subscribe', requireAuth, async (req, res) => {
  const ctx = (req as any).rbac as RbacContext;
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'subscription invalide' });
  await insertPushSub(endpoint, ctx.member.id, keys.p256dh, keys.auth, new Date().toISOString());
  res.json({ ok: true });
});
app.post('/api/v1/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) await deletePushSub(endpoint);
  res.json({ ok: true });
});

// Single round-trip for initial load (App.tsx's bootstrap effect). Auth-gated :
// les données membres ne sont pas lisibles anonymement ; le client pré-login
// reçoit 401 et retombe sur localStorage (offline-first inchangé).
app.get('/api/v1/bootstrap', requireAuth, async (req, res) => {
  const ctx = (req as any).rbac as RbacContext;
  const payload: Record<string, unknown> = {};
  for (const name of ARRAY_COLLECTIONS) payload[name] = await filterReadable(name, ctx, await readCollection(name));
  for (const key of KV_KEYS) payload[key] = await getKv(key);
  res.json(payload);
});

// Flux temps réel (SSE, §7). EventSource ne peut pas poser de header Authorization
// → token en query (même contrainte que /uploads). Doit rester AVANT /:name pour
// ne pas être capturé comme nom de collection. 'no-transform' fait sauter la
// compression gzip globale (sinon le flux est bufferisé et jamais envoyé).
app.get('/api/v1/stream', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  if (!token || !(await verifyToken(token))) return res.status(401).json({ error: 'unauthorized' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // proxys type nginx : ne pas bufferiser
  res.flushHeaders?.();
  res.write('retry: 5000\n\n'); // délai de reconnexion côté navigateur
  addClient(res);
  // Battement toutes les 25 s : garde la connexion ouverte à travers les proxys
  // qui coupent les connexions inactives (commentaire SSE, ignoré par le client).
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => clearInterval(beat));
});

// Phase 4 (T4.1-T4.2) — premiers endpoints par intention, validés Zod, remplaçant
// progressivement PUT /api/v1/:name (whole-array) pour cette collection. DOIVENT rester
// AVANT app.get('/api/v1/:name', ...) ci-dessous — Express matche dans l'ordre de
// déclaration, sinon 'members' serait capturé comme paramètre :name de la route générique.
// Pipeline RÉUTILISÉ à l'identique du PUT existant (aucune logique RBAC/merge dupliquée) :
// deltaToWhole() reconstruit un whole-array effectif à partir du stocké + de l'intention
// (create/patch/delete), puis assertCanWrite + applyWrite tournent EXACTEMENT comme pour
// un PUT whole-array classique — c'est le même scoping, les mêmes tombstones, le même LWW.
app.post('/api/v1/members', requireAuth, async (req, res) => {
  const parsed = MemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
  const member = parsed.data;
  try {
    const existing = await readCollection('members', true);
    if (existing.some((m: any) => String(m.id) === String(member.id) && !m.deletedAt)) {
      return res.status(409).json({ error: `members: ${member.id} existe déjà` });
    }
    const body = await deltaToWhole('members', [member], []);
    await assertCanWrite('members', (req as any).rbac, body);
    const { added } = await applyWrite('members', body, undefined, await preservedIds('members', (req as any).rbac));
    // Spec : "compte créé à l'enrôlement, le membre définit son mot de passe via lien" —
    // identique au comportement du PUT whole-array (voir plus bas dans ce fichier).
    for (const m of added) await issueAuthLink(m, 'activate');
    return res.status(201).json(added.find((m: any) => String(m.id) === String(member.id)) ?? member);
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.patch('/api/v1/members/:id', requireAuth, async (req, res) => {
  const parsed = MemberPatchSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
  const patch = parsed.data;
  try {
    const existing = await readCollection('members', true);
    const stored = existing.find((m: any) => String(m.id) === String(req.params.id) && !m.deletedAt);
    if (!stored) return res.status(404).json({ error: `members: ${req.params.id} introuvable` });
    const merged = { ...stored, ...patch };
    const body = await deltaToWhole('members', [merged], []);
    await assertCanWrite('members', (req as any).rbac, body);
    const { added, changed } = await applyWrite('members', body, undefined, await preservedIds('members', (req as any).rbac));
    return res.json([...added, ...changed].find((m: any) => String(m.id) === String(req.params.id)) ?? merged);
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.delete('/api/v1/members/:id', requireAuth, async (req, res) => {
  try {
    const existing = await readCollection('members', true);
    const stored = existing.find((m: any) => String(m.id) === String(req.params.id) && !m.deletedAt);
    if (!stored) return res.status(404).json({ error: `members: ${req.params.id} introuvable` });
    // Omission intentionnelle de l'id -> tombstone par applyWrite (même mécanisme que le
    // PUT whole-array quand un opérateur renvoie sa liste sans cet id).
    const body = await deltaToWhole('members', [], [req.params.id]);
    await assertCanWrite('members', (req as any).rbac, body);
    await applyWrite('members', body, undefined, await preservedIds('members', (req as any).rbac));
    return res.status(204).end();
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// Phase 4 (T4.4) — même recette que /api/v1/members ci-dessus, appliquée à `reports`.
app.post('/api/v1/reports', requireAuth, async (req, res) => {
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
  const report = parsed.data;
  try {
    const existing = await readCollection('reports', true);
    if (existing.some((r: any) => String(r.id) === String(report.id) && !r.deletedAt)) {
      return res.status(409).json({ error: `reports: ${report.id} existe déjà` });
    }
    const body = await deltaToWhole('reports', [report], []);
    await assertCanWrite('reports', (req as any).rbac, body);
    const { added } = await applyWrite('reports', body, undefined, await preservedIds('reports', (req as any).rbac));
    return res.status(201).json(added.find((r: any) => String(r.id) === String(report.id)) ?? report);
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.patch('/api/v1/reports/:id', requireAuth, async (req, res) => {
  const parsed = ReportPatchSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
  const patch = parsed.data;
  try {
    const existing = await readCollection('reports', true);
    const stored = existing.find((r: any) => String(r.id) === String(req.params.id) && !r.deletedAt);
    if (!stored) return res.status(404).json({ error: `reports: ${req.params.id} introuvable` });
    const merged = { ...stored, ...patch };
    const body = await deltaToWhole('reports', [merged], []);
    await assertCanWrite('reports', (req as any).rbac, body);
    const { added, changed } = await applyWrite('reports', body, undefined, await preservedIds('reports', (req as any).rbac));
    return res.json([...added, ...changed].find((r: any) => String(r.id) === String(req.params.id)) ?? merged);
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.delete('/api/v1/reports/:id', requireAuth, async (req, res) => {
  try {
    const existing = await readCollection('reports', true);
    const stored = existing.find((r: any) => String(r.id) === String(req.params.id) && !r.deletedAt);
    if (!stored) return res.status(404).json({ error: `reports: ${req.params.id} introuvable` });
    const body = await deltaToWhole('reports', [], [req.params.id]);
    await assertCanWrite('reports', (req as any).rbac, body);
    await applyWrite('reports', body, undefined, await preservedIds('reports', (req as any).rbac));
    return res.status(204).end();
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// Phase 4 (T4.4+) — factory pour les collections suivantes : EXACTEMENT le pipeline écrit à
// la main pour /members (T4.2) et /reports (T4.4) ci-dessus (deltaToWhole + assertCanWrite +
// applyWrite, zéro logique RBAC/merge nouvelle), factorisé pour ne pas récrire la même
// boucle 9 fois avec le risque de divergence/copier-coller que ça implique. Comportement
// observable IDENTIQUE à des routes écrites à la main pour chaque collection.
function registerCrudEndpoints(name: string, Schema: { safeParse: (v: unknown) => any }, PatchSchema: { safeParse: (v: unknown) => any }): void {
  app.post(`/api/v1/${name}`, requireAuth, async (req, res) => {
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i: any) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
    const item = parsed.data;
    try {
      const existing = await readCollection(name, true);
      if (existing.some((it: any) => String(it.id) === String(item.id) && !it.deletedAt)) {
        return res.status(409).json({ error: `${name}: ${item.id} existe déjà` });
      }
      const body = await deltaToWhole(name, [item], []);
      await assertCanWrite(name, (req as any).rbac, body);
      const { added } = await applyWrite(name, body, undefined, await preservedIds(name, (req as any).rbac));
      return res.status(201).json(added.find((it: any) => String(it.id) === String(item.id)) ?? item);
    } catch (e) {
      if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  app.patch(`/api/v1/${name}/:id`, requireAuth, async (req, res) => {
    const parsed = PatchSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i: any) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
    const patch = parsed.data;
    try {
      const existing = await readCollection(name, true);
      const stored = existing.find((it: any) => String(it.id) === String(req.params.id) && !it.deletedAt);
      if (!stored) return res.status(404).json({ error: `${name}: ${req.params.id} introuvable` });
      // updatedAt/deletedAt : métadonnées serveur (applyWrite), jamais dans un schéma .strict()
      // — exclues avant de fusionner (même correctif que le bug trouvé en T4.4, voir commit).
      const { updatedAt: _u, deletedAt: _d, ...storedRest } = stored;
      const merged = { ...storedRest, ...patch };
      const body = await deltaToWhole(name, [merged], []);
      await assertCanWrite(name, (req as any).rbac, body);
      const { added, changed } = await applyWrite(name, body, undefined, await preservedIds(name, (req as any).rbac));
      return res.json([...added, ...changed].find((it: any) => String(it.id) === String(req.params.id)) ?? merged);
    } catch (e) {
      if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  app.delete(`/api/v1/${name}/:id`, requireAuth, async (req, res) => {
    try {
      const existing = await readCollection(name, true);
      const stored = existing.find((it: any) => String(it.id) === String(req.params.id) && !it.deletedAt);
      if (!stored) return res.status(404).json({ error: `${name}: ${req.params.id} introuvable` });
      const body = await deltaToWhole(name, [], [req.params.id]);
      await assertCanWrite(name, (req as any).rbac, body);
      await applyWrite(name, body, undefined, await preservedIds(name, (req as any).rbac));
      return res.status(204).end();
    } catch (e) {
      if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
}

// Clôture d'un culte/événement (T4.4) : crée/upsert en UNE opération serveur les 3 rapports
// de clôture (portiers, ADN, culte de synthèse) + marque l'événement clos — au lieu de 4
// mutations client séparées (3× onAddReport/onUpdateReport + 1 PUT events). Le CONTENU des
// rapports (compteurs, thème, ferveur…) reste calculé côté client (formulaire) : ce n'est pas
// une règle métier serveur, juste une saisie — le serveur ne fait qu'assembler/persister.
// Body : { reports: [{ reportType, authorId, authorName, authorRole, content, confidential? }] }
const CLOSE_REPORT_TYPES = new Set(['rapport_portiers', 'rapport_adn', 'rapport_culte']);
app.post('/api/v1/events/:id/close', requireAuth, async (req, res) => {
  try {
    const events = await readCollection('events', true);
    const event = events.find((e: any) => String(e.id) === String(req.params.id) && !e.deletedAt);
    if (!event) return res.status(404).json({ error: `events: ${req.params.id} introuvable` });
    const incomingReports = Array.isArray(req.body?.reports) ? req.body.reports : [];
    if (!incomingReports.length) return res.status(400).json({ error: 'reports: au moins un rapport de clôture requis' });
    for (const r of incomingReports) {
      if (!CLOSE_REPORT_TYPES.has(r?.reportType)) {
        return res.status(400).json({ error: `reports: reportType '${r?.reportType}' non autorisé sur cette route (attendu : ${[...CLOSE_REPORT_TYPES].join(', ')})` });
      }
    }
    const storedReports = await readCollection('reports', true);
    const today = new Date().toISOString().split('T')[0];
    const merged = incomingReports.map((r: any) => {
      const existing = storedReports.find((s: any) => !s.deletedAt && s.reportType === r.reportType && s.eventId === req.params.id);
      // Même politique de fusion que le client (EventsView.tsx) : upsert par type+event, on
      // ne remplace que les clés de content réellement fournies (les champs texte déjà saisis
      // par un autre rôle — prédicateur, thème… — ne sont pas écrasés par du vide).
      const nonEmpty = Object.fromEntries(Object.entries(r.content ?? {}).filter(([, v]) => v !== '' && v !== undefined));
      if (existing) {
        // `updatedAt`/`deletedAt` sont des métadonnées serveur ajoutées par applyWrite (jamais
        // renvoyées au client normalement, voir guards.ts canonical()) — un stocké relu ici les
        // porte. Le schéma Report (.strict()) ne les connaît pas : à exclure avant re-validation,
        // sinon un ré-upsert (2e clôture, complément) est rejeté à tort.
        const { updatedAt: _u, deletedAt: _d, ...rest } = existing;
        return { ...rest, content: { ...existing.content, ...nonEmpty } };
      }
      return {
        id: `rep_${r.reportType.replace('rapport_', '')}_${req.params.id}_${Date.now()}`,
        authorId: r.authorId,
        authorName: r.authorName,
        authorRole: r.authorRole,
        targetBranch: event.branch,
        date: today,
        reportType: r.reportType,
        eventId: req.params.id,
        confidential: !!r.confidential,
        content: nonEmpty,
      };
    });
    for (const m of merged) {
      const check = ReportSchema.safeParse(m);
      if (!check.success) return res.status(400).json({ error: `reports: ${m.id} invalide — ${check.error.issues.map((i) => i.message).join('; ')}` });
    }
    const reportsBody = await deltaToWhole('reports', merged, []);
    await assertCanWrite('reports', (req as any).rbac, reportsBody);
    await applyWrite('reports', reportsBody, undefined, await preservedIds('reports', (req as any).rbac));

    const closedEvent = { ...event, closed: true };
    const eventsBody = await deltaToWhole('events', [closedEvent], []);
    await assertCanWrite('events', (req as any).rbac, eventsBody);
    await applyWrite('events', eventsBody, undefined, await preservedIds('events', (req as any).rbac));

    return res.json({ ok: true, event: closedEvent, reports: merged });
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// Phase 4 (T4.4→T4.n) — reste des collections, via la factory registerCrudEndpoints
// définie plus haut. Ordre = risque PII décroissant (Playbook §Phase 4), events déjà
// couvert en partie par la route de clôture ci-dessus (POST/PATCH/DELETE génériques
// restent utiles pour les mutations hors clôture : création manuelle, édition, annulation).
registerCrudEndpoints('events', EventSchema, EventPatchSchema);
registerCrudEndpoints('notifications', NotificationSchema, NotificationPatchSchema);
registerCrudEndpoints('certifications', CertificationSchema, CertificationPatchSchema);
registerCrudEndpoints('integration_reports', IntegrationReportSchema, IntegrationReportPatchSchema);
registerCrudEndpoints('ministries', MinistrySchema, MinistryPatchSchema);
registerCrudEndpoints('departments', DepartmentSchema, DepartmentPatchSchema);
registerCrudEndpoints('activities', ActivitySchema, ActivityPatchSchema);
registerCrudEndpoints('projects', ProjectSchema, ProjectPatchSchema);
registerCrudEndpoints('bus_lines', BusLineSchema, BusLinePatchSchema);
registerCrudEndpoints('forms', FormSchema, FormPatchSchema);

app.get('/api/v1/:name', requireAuth, async (req, res) => {
  const { name } = req.params;
  if (ARRAY_COLLECTIONS.has(name)) {
    // ?includeDeleted=1 : corbeille (tombstones visibles), réservée aux Admin+.
    const includeDeleted = req.query.includeDeleted === '1' && isAdmin((req as any).rbac);
    return res.json(await filterReadable(name, (req as any).rbac, await readCollection(name, includeDeleted)));
  }
  if (KV_KEYS.has(name)) return res.json(await getKv(name));
  res.status(404).json({ error: 'unknown collection' });
});

// Whole-value replace, matching src/data/index.ts's save(key, value) exactly —
// no per-item PATCH/DELETE routes because nothing in the frontend calls them.
// Pipeline : assertCanWrite (RBAC + scope) puis applyWrite (invariants données).
app.put('/api/v1/:name', requireAuth, async (req, res) => {
  const { name } = req.params;
  try {
    if (ARRAY_COLLECTIONS.has(name)) {
      // Deux formes : tableau complet (legacy) ou delta {upserts, deletes} (wire optimisé, cf.
      // src/data/api.ts). Le delta est reconstruit en whole-array effectif → réutilise tel quel
      // le pipeline scope/merge/tombstone, aucune logique de sécurité dupliquée.
      let body: any[];
      if (Array.isArray(req.body)) {
        body = req.body;
      } else if (req.body && Array.isArray(req.body.upserts) && Array.isArray(req.body.deletes)) {
        body = await deltaToWhole(name, req.body.upserts, req.body.deletes);
      } else {
        return res.status(400).json({ error: 'expected an array or {upserts, deletes}' });
      }
      await assertCanWrite(name, (req as any).rbac, body);
      const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
      // Préserve les items hors de la portée de lecture de l'opérateur : un client scopé
      // n'a qu'un sous-ensemble, son PUT ne doit pas tombstoner ce qu'il ne voit pas.
      const { added, conflicts } = await applyWrite(name, body, asOf, await preservedIds(name, (req as any).rbac));
      // Fan-out multicanal des notifications nouvellement créées (in-app déjà
      // réel côté client ; email/SMS/WhatsApp via adapters, simulés sans clés).
      if (name === 'notifications' && added.length) {
        await dispatch(added, await readCollection('members'), await getKv('settings'));
        poke(); // cloche/alertes en direct (§7)
      }
      // Spec : "compte créé à l'enrôlement, le membre définit son mot de passe
      // via lien" — chaque membre ajouté reçoit une invitation d'activation.
      if (name === 'members' && added.length) {
        for (const m of added) await issueAuthLink(m, 'activate');
      }
      return res.json({ ok: true, syncedAt: new Date().toISOString(), conflicts });
    }
    if (KV_KEYS.has(name)) {
      await assertCanWrite(name, (req as any).rbac, []);
      await setKv(name, req.body);
      return res.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof GuardError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  res.status(404).json({ error: 'unknown collection' });
});

// File de rattrapage hors-ligne (spec offline-first) : le client rejoue ici les
// écritures perdues quand apiPut a échoué. LWW whole-array — même pipeline
// RBAC + guards que PUT, idempotent par opId (table sync_ops).
app.post('/api/v1/sync/batch', requireAuth, async (req, res) => {
  const ops = req.body?.ops;
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'expected {ops: [...]}' });
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { opId: string; error: string }[] = [];
  const conflicts: string[] = [];
  for (const op of ops) {
    const { opId, name, value, asOf } = op ?? {};
    if (!opId || !name) {
      errors.push({ opId: String(opId ?? '?'), error: 'opId et name requis' });
      continue;
    }
    if (await syncOpSeen(opId)) {
      skipped.push(opId);
      continue;
    }
    try {
      if (ARRAY_COLLECTIONS.has(name)) {
        if (!Array.isArray(value)) throw new GuardError(400, 'expected an array');
        await assertCanWrite(name, (req as any).rbac, value);
        const { added: opAdded, conflicts: opConflicts } = await applyWrite(name, value, typeof asOf === 'string' ? asOf : undefined, await preservedIds(name, (req as any).rbac));
        conflicts.push(...opConflicts);
        if (name === 'notifications' && opAdded.length) poke();
      } else if (KV_KEYS.has(name)) {
        await assertCanWrite(name, (req as any).rbac, []);
        await setKv(name, value);
      } else {
        throw new GuardError(404, 'unknown collection');
      }
      await markSyncOp(opId, new Date().toISOString());
      applied.push(opId);
    } catch (e) {
      // Une op en erreur n'avorte pas le batch — le client garde sa file pour elle.
      errors.push({ opId, error: e instanceof GuardError ? e.message : 'internal error' });
    }
  }
  res.json({ applied, skipped, errors, syncedAt: new Date().toISOString(), conflicts });
});

// École Bloom — contrat d'entrée seulement (phase 2 spec) : signature HMAC-SHA256
// du corps brut + fenêtre anti-replay ±5 min. Le payload est stocké, pas traité.
import { createHmac, timingSafeEqual } from 'node:crypto';
// Même exigence que le secret de session : pas de défaut faible en production.
const WEBHOOK_SECRET = requireSecret('ACADEMY_WEBHOOK_SECRET', ['change-me']);
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

app.post('/api/v1/webhooks/academy', async (req, res) => {
  const sig = String(req.headers['x-bloom-signature'] ?? '');
  const ts = Number(req.headers['x-bloom-timestamp'] ?? 0);
  if (!sig || !ts || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return res.status(401).json({ error: 'signature ou timestamp invalide' });
  }
  const raw = (req as any).rawBody as Buffer | undefined;
  if (!raw) return res.status(400).json({ error: 'corps vide' });
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(raw).update(String(ts)).digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'signature invalide' });
  }
  // S6 — anti-rejeu : la signature est déterministe (payload+ts) et infalsifiable sans le
  // secret. La colonne UNIQUE rejette tout rejeu dans (ou hors de) la fenêtre de 5 min.
  const ins = await insertWebhookEvent('academy', new Date().toISOString(), raw.toString('utf8'), expected);
  if (!ins.inserted) return res.status(409).json({ error: 'événement déjà reçu (rejeu)' });
  // Traitement : consomme le payload puis marque processed=1. En cas d'échec, on laisse
  // processed=0 pour inspection/rejeu manuel (la ligne est déjà stockée, pas re-signable).
  try {
    await processAcademyEvent(JSON.parse(raw.toString('utf8')));
    await markWebhookProcessed(ins.id);
  } catch (e) {
    console.error('[webhook] traitement échoué (payload conservé):', (e as Error).message);
  }
  res.status(202).json({ ok: true });
});

// École Bloom → certification. Payload attendu :
// { type:'certification', memberId, courseTitle, level?, externalRef? }. Point d'extension
// pour d'autres types d'événements de l'école.
async function processAcademyEvent(payload: any): Promise<void> {
  if (payload?.type === 'certification' && payload.memberId && payload.courseTitle) {
    await appendToCollection('certifications', [{
      id: `cert_academy_${payload.externalRef ?? payload.memberId}_${Date.now()}`,
      memberId: String(payload.memberId),
      source: 'ecole_bloom',
      courseTitle: String(payload.courseTitle),
      level: payload.level ? String(payload.level) : '',
      certifiedAt: new Date().toISOString().slice(0, 10),
      externalRef: payload.externalRef ? String(payload.externalRef) : null,
    }]);
  }
}

// Sert le frontend buildé (vite build → dist/) sur le même process/port que l'API,
// pour un déploiement mono-service (Dockerfile). En dev, dist/ n'existe pas encore
// (Vite sert son propre serveur) : express.static ignore silencieusement l'absence.
// Cache : les assets Vite sont hashés → immutables 1 an (zéro requête aux visites
// suivantes) ; index.html en no-cache → toujours frais après un déploiement (c'est LA
// correction racine des pages blanches post-deploy, lazyRetry côté client en filet).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '../dist');

// ---- Photos hors JSON (scale) ----
// Les photos vivaient en base64 DANS le JSON des membres : re-téléchargées à chaque
// bootstrap, re-poussées à chaque sync — ingérable en croissance. Elles deviennent des
// fichiers sur le volume persistant (à côté de la DB : /data/uploads en prod), servis
// immutables (nom = hash du contenu).
const UPLOAD_DIR = path.join(
  process.env.BLOOMCORE_DB ? path.dirname(process.env.BLOOMCORE_DB) : __dirname,
  'uploads',
);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Photos derrière authentification : PII (parfois mineurs). Les <img> ne portent pas
// de header Authorization → le token est aussi accepté en query (?token=). Pas de scope
// par membre : les fichiers sont dédupliqués par hash de contenu (un même fichier peut
// appartenir à plusieurs membres), scoper est donc infaisable — toute session valide lit.
// `immutable` retiré : le cache reste révocable (le token expire en 12h).
// ponytail: auth-only ; passer à des URLs signées expirantes si un jour exposé au public.
app.use('/uploads', async (req, res, next) => {
  const header = req.headers.authorization;
  const token = (header?.startsWith('Bearer ') ? header.slice(7) : null)
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
  if (!token || !(await verifyToken(token))) return res.status(401).json({ error: 'unauthorized' });
  next();
}, express.static(UPLOAD_DIR, { maxAge: '1y' }));

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,(.+)$/;
function storeImage(dataUrl: string): string | null {
  const m = dataUrl.match(DATA_URL_RE);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return null; // 2 Mo max (les photos sont downscalées côté client)
  const name = `${createHash('sha1').update(buf).digest('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  return `/uploads/${name}`;
}

// Paire vignette+large liée par nommage : <hash>.jpg (large, lightbox) + <hash>-t.jpg (vignette,
// renvoyée comme avatarUrl). Hash sur la LARGE → les deux tailles d'une même photo restent liées
// et dédupliquées. ponytail: l'app encode toujours en JPEG (canvas) → noms .jpg fixes.
function storeImagePair(thumbUrl: string, largeUrl: string): string | null {
  const t = thumbUrl.match(DATA_URL_RE);
  const l = largeUrl.match(DATA_URL_RE);
  if (!t || !l) return null;
  const thumbBuf = Buffer.from(t[2], 'base64');
  const largeBuf = Buffer.from(l[2], 'base64');
  if (thumbBuf.length > 2 * 1024 * 1024 || largeBuf.length > 2 * 1024 * 1024) return null;
  const hash = createHash('sha1').update(largeBuf).digest('hex');
  const largeFile = path.join(UPLOAD_DIR, `${hash}.jpg`);
  const thumbFile = path.join(UPLOAD_DIR, `${hash}-t.jpg`);
  if (!fs.existsSync(largeFile)) fs.writeFileSync(largeFile, largeBuf);
  if (!fs.existsSync(thumbFile)) fs.writeFileSync(thumbFile, thumbBuf);
  return `/uploads/${hash}-t.jpg`;
}

app.post('/api/v1/uploads', requireAuth, (req, res) => {
  const { data, thumb, large } = req.body ?? {};
  if (typeof thumb === 'string' && typeof large === 'string') {
    const url = storeImagePair(thumb, large);
    if (!url) return res.status(400).json({ error: 'image invalide ou trop lourde (max 2 Mo/taille)' });
    return res.json({ url });
  }
  if (typeof data !== 'string') return res.status(400).json({ error: 'dataURL image attendue' });
  const url = storeImage(data);
  if (!url) return res.status(400).json({ error: 'image invalide ou trop lourde (max 2 Mo, png/jpeg/webp)' });
  res.json({ url });
});

// Migration idempotente au boot : les avatars base64 déjà en base deviennent des fichiers.
{
  const members = await getCollection('members');
  let migrated = 0;
  for (const m of members as any[]) {
    if (typeof m.avatarUrl === 'string' && m.avatarUrl.startsWith('data:image/')) {
      const url = storeImage(m.avatarUrl);
      if (url) { m.avatarUrl = url; migrated++; }
    }
  }
  if (migrated) {
    await setCollection('members', members);
    console.log(`[uploads] ${migrated} photo(s) base64 migrée(s) vers ${UPLOAD_DIR}.`);
  }
}
app.use(express.static(DIST_DIR, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

const PORT = Number(process.env.API_PORT) || 4000;
// Sans secret fort, on n'écoute que sur loopback : le dev local passe par le proxy Vite
// (localhost) donc rien ne casse, mais un déploiement qui a oublié NODE_ENV/AUTH_SECRET
// devient injoignable de l'extérieur (échec visible) plutôt que de servir des tokens forgeables.
const HOST = resolveBindHost(usingInsecureSecret, process.env.API_HOST);
app.listen(PORT, HOST, () => {
  const mode = usingInsecureSecret ? 'DEV — secret NON sécurisé (loopback seul)' : 'PROD — secret fort';
  const shown = HOST === '::' ? 'localhost' : HOST;
  console.log(`BloomCore API [${mode}] http://${shown}:${PORT}/api/v1`);
  if (usingInsecureSecret && HOST !== '127.0.0.1') {
    console.warn('⚠️  AUTH_SECRET absent/faible mais écoute réseau ouverte — définissez AUTH_SECRET (≥16 c.) ou NODE_ENV=production.');
  }
});
// Best-effort : sans REDIS_URL, initPokeSubscriber() est un no-op immédiat (voir stream.ts).
// Ne doit jamais empêcher le boot — une erreur ici degrade vers la diffusion locale seule.
initPokeSubscriber().catch((e) => console.error('[stream] initPokeSubscriber a échoué:', e.message));
// Phase 3 (T3.1) : le scheduler tourne ici par défaut (RUN_SCHEDULER absent = 'true'),
// comportement inchangé pour un déploiement mono-service. Le déployer en compose avec le
// service worker dédié (server/worker.ts) doit mettre RUN_SCHEDULER=false sur l'API pour
// éviter un double sweep (double envoi d'alertes/emails) — voir docker-compose.yml.
if (process.env.RUN_SCHEDULER !== 'false') startScheduler();
