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
import { db, getCollection, setCollection, appendToCollection, getKv, setKv } from './db.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, createOneTimeToken, consumeOneTimeToken, upsertCredentials, requireSecret, usingInsecureSecret, resolveBindHost } from './auth.ts';
import { ensureSeeded } from './seed.ts';
import { applyWrite, readCollection, GuardError } from './guards.ts';
import { buildContext, assertCanWrite, filterReadable, preservedIds, RbacContext } from './rbac.ts';
import { dispatch } from './notify.ts';
import { addClient, poke } from './stream.ts';
import { startScheduler } from './scheduler.ts';

ensureSeeded();

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
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
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

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const memberId = token ? verifyToken(token) : null;
  if (!memberId) return res.status(401).json({ error: 'unauthorized' });
  // Contexte RBAC complet (membre + rôles résolus depuis les données).
  const ctx = buildContext(memberId);
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });
  (req as any).memberId = memberId;
  (req as any).rbac = ctx;
  next();
}

const isAdmin = (ctx: RbacContext) => ctx.roles.includes('Admin') || ctx.roles.includes('Super Admin');

// Healthcheck public (orchestrateur / load balancer / Docker HEALTHCHECK) — pas d'auth.
// Vérifie que le process répond ET que la base SQLite est joignable.
app.get('/api/v1/health', (_req, res) => {
  try {
    readCollection('members');
    res.json({ ok: true, ts: Date.now() });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// WORKFLOWS §84-85 — login par téléphone OU email (`identifier` ; `phone` reste
// accepté en alias pour l'ancien client). Pas d'auto-inscription : un membre
// sans ligne credentials n'est simplement pas encore activé.
function findByIdentifier(identifier: string) {
  const norm = String(identifier).replace(/\s/g, '');
  const lower = norm.toLowerCase();
  return readCollection('members').find(
    (m) => String(m.phone).replace(/\s/g, '') === norm || (m.email && String(m.email).toLowerCase() === lower),
  );
}

// S5 — anti-brute-force en mémoire (par IP + identifiant). ponytail: per-instance ;
// store partagé (Redis) si scale horizontal.
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginFails = new Map<string, { count: number; until: number }>();
const loginKey = (req: express.Request, id: string) => `${req.ip}|${String(id).toLowerCase()}`;
const loginLocked = (key: string) => {
  const e = loginFails.get(key);
  return !!e && e.count >= LOGIN_MAX_FAILS && Date.now() < e.until;
};
const loginFail = (key: string) => {
  const e = loginFails.get(key) ?? { count: 0, until: 0 };
  e.count += 1;
  e.until = Date.now() + LOGIN_LOCK_MS;
  loginFails.set(key, e);
};
// Hash factice : verifyPassword tourne même si le compte n'existe pas → le temps de
// réponse ne distingue plus « compte existant » de « inexistant » (anti-oracle de timing).
const DUMMY_HASH = hashPassword('__nonexistent_account__');

app.post('/api/v1/auth/login', (req, res) => {
  const { identifier, phone, password } = req.body ?? {};
  const id = identifier ?? phone;
  if (!id || !password) return res.status(400).json({ error: 'identifier and password required' });
  const key = loginKey(req, id);
  if (loginLocked(key)) return res.status(429).json({ error: 'trop de tentatives, réessayez plus tard' });
  const member = findByIdentifier(id);
  const cred = member
    ? (db.prepare('SELECT password_hash FROM credentials WHERE member_id = ?').get(member.id) as { password_hash: string } | undefined)
    : undefined;
  const ok = verifyPassword(password, cred?.password_hash ?? DUMMY_HASH);
  if (!member || !cred || !ok) {
    loginFail(key);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  loginFails.delete(key);
  res.json({ token: signToken(member.id), member });
});

// Activation / réinitialisation — envoi simulé via les adapters (trigger 17 :
// connexion/réinit). Toujours 200 (anti-énumération de comptes). Hors prod, le
// token est renvoyé dans la réponse (`devToken`) : la démo n'a aucun canal réel
// où le lire.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const isProd = IS_PROD;

function issueAuthLink(member: any, purpose: 'activate' | 'reset'): string {
  const token = createOneTimeToken(member.id, purpose);
  const label = purpose === 'activate' ? 'Activation de votre compte BloomCore' : 'Réinitialisation de votre mot de passe BloomCore';
  dispatch(
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
    getKv('settings'),
  );
  return token;
}

app.post('/api/v1/auth/request-activation', (req, res) => {
  const member = req.body?.identifier ? findByIdentifier(req.body.identifier) : null;
  const devToken = member ? issueAuthLink(member, 'activate') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

app.post('/api/v1/auth/request-reset', (req, res) => {
  const member = req.body?.identifier ? findByIdentifier(req.body.identifier) : null;
  const devToken = member ? issueAuthLink(member, 'reset') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

app.post('/api/v1/auth/complete', (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'mot de passe trop court (min 8)' });
  const consumed = consumeOneTimeToken(String(token));
  if (!consumed) return res.status(401).json({ error: 'token invalide, expiré ou déjà utilisé' });
  upsertCredentials(consumed.memberId, String(password));
  const member = readCollection('members').find((m) => m.id === consumed.memberId);
  res.json({ token: signToken(consumed.memberId), member });
});

app.post('/api/v1/auth/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body ?? {};
  if (!current || !next) return res.status(400).json({ error: 'current and next required' });
  if (String(next).length < 8) return res.status(400).json({ error: 'mot de passe trop court (min 8)' });
  const memberId = (req as any).memberId as string;
  const cred = db.prepare('SELECT password_hash FROM credentials WHERE member_id = ?').get(memberId) as
    | { password_hash: string }
    | undefined;
  if (!cred || !verifyPassword(String(current), cred.password_hash)) {
    return res.status(401).json({ error: 'mot de passe actuel incorrect' });
  }
  upsertCredentials(memberId, String(next));
  // pwd_version vient d'être incrémentée → l'ancien token de CE client est aussi invalidé.
  // On lui en émet un frais (pv à jour) pour que sa session survive ; les autres appareils
  // (tokens à l'ancienne pv) sont déconnectés — c'est l'effet recherché.
  res.json({ ok: true, token: signToken(memberId) });
});

app.post('/api/v1/auth/admin-reset', requireAuth, (req, res) => {
  const ctx = (req as any).rbac as RbacContext;
  if (!isAdmin(ctx)) return res.status(403).json({ error: 'réservé aux Admin' });
  const { memberId } = req.body ?? {};
  const member = readCollection('members').find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ error: 'membre inconnu' });
  const devToken = issueAuthLink(member, 'reset');
  // Journal inviolable : la réinitialisation par un admin est auditée côté serveur.
  applyWrite('audits', [
    ...readCollection('audits'),
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

app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  const member = getCollection('members').find((m) => m.id === (req as any).memberId);
  if (!member) return res.status(404).json({ error: 'not found' });
  res.json(member);
});

// Single round-trip for initial load (App.tsx's bootstrap effect). Auth-gated :
// les données membres ne sont pas lisibles anonymement ; le client pré-login
// reçoit 401 et retombe sur localStorage (offline-first inchangé).
app.get('/api/v1/bootstrap', requireAuth, (req, res) => {
  const ctx = (req as any).rbac as RbacContext;
  const payload: Record<string, unknown> = {};
  for (const name of ARRAY_COLLECTIONS) payload[name] = filterReadable(name, ctx, readCollection(name));
  for (const key of KV_KEYS) payload[key] = getKv(key);
  res.json(payload);
});

// Flux temps réel (SSE, §7). EventSource ne peut pas poser de header Authorization
// → token en query (même contrainte que /uploads). Doit rester AVANT /:name pour
// ne pas être capturé comme nom de collection. 'no-transform' fait sauter la
// compression gzip globale (sinon le flux est bufferisé et jamais envoyé).
app.get('/api/v1/stream', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  if (!token || !verifyToken(token)) return res.status(401).json({ error: 'unauthorized' });
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

app.get('/api/v1/:name', requireAuth, (req, res) => {
  const { name } = req.params;
  if (ARRAY_COLLECTIONS.has(name)) {
    // ?includeDeleted=1 : corbeille (tombstones visibles), réservée aux Admin+.
    const includeDeleted = req.query.includeDeleted === '1' && isAdmin((req as any).rbac);
    return res.json(filterReadable(name, (req as any).rbac, readCollection(name, includeDeleted)));
  }
  if (KV_KEYS.has(name)) return res.json(getKv(name));
  res.status(404).json({ error: 'unknown collection' });
});

// Whole-value replace, matching src/data/index.ts's save(key, value) exactly —
// no per-item PATCH/DELETE routes because nothing in the frontend calls them.
// Pipeline : assertCanWrite (RBAC + scope) puis applyWrite (invariants données).
app.put('/api/v1/:name', requireAuth, (req, res) => {
  const { name } = req.params;
  try {
    if (ARRAY_COLLECTIONS.has(name)) {
      if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected an array' });
      assertCanWrite(name, (req as any).rbac, req.body);
      const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
      // Préserve les items hors de la portée de lecture de l'opérateur : un client scopé
      // n'a qu'un sous-ensemble, son PUT ne doit pas tombstoner ce qu'il ne voit pas.
      const { added, conflicts } = applyWrite(name, req.body, asOf, preservedIds(name, (req as any).rbac));
      // Fan-out multicanal des notifications nouvellement créées (in-app déjà
      // réel côté client ; email/SMS/WhatsApp via adapters, simulés sans clés).
      if (name === 'notifications' && added.length) {
        dispatch(added, readCollection('members'), getKv('settings'));
        poke(); // cloche/alertes en direct (§7)
      }
      // Spec : "compte créé à l'enrôlement, le membre définit son mot de passe
      // via lien" — chaque membre ajouté reçoit une invitation d'activation.
      if (name === 'members' && added.length) {
        for (const m of added) issueAuthLink(m, 'activate');
      }
      return res.json({ ok: true, syncedAt: new Date().toISOString(), conflicts });
    }
    if (KV_KEYS.has(name)) {
      assertCanWrite(name, (req as any).rbac, []);
      setKv(name, req.body);
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
app.post('/api/v1/sync/batch', requireAuth, (req, res) => {
  const ops = req.body?.ops;
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'expected {ops: [...]}' });
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { opId: string; error: string }[] = [];
  const conflicts: string[] = [];
  const seen = db.prepare('SELECT 1 FROM sync_ops WHERE op_id = ?');
  const mark = db.prepare('INSERT INTO sync_ops (op_id, applied_at) VALUES (?, ?)');
  for (const op of ops) {
    const { opId, name, value, asOf } = op ?? {};
    if (!opId || !name) {
      errors.push({ opId: String(opId ?? '?'), error: 'opId et name requis' });
      continue;
    }
    if (seen.get(opId)) {
      skipped.push(opId);
      continue;
    }
    try {
      if (ARRAY_COLLECTIONS.has(name)) {
        if (!Array.isArray(value)) throw new GuardError(400, 'expected an array');
        assertCanWrite(name, (req as any).rbac, value);
        const { added: opAdded, conflicts: opConflicts } = applyWrite(name, value, typeof asOf === 'string' ? asOf : undefined, preservedIds(name, (req as any).rbac));
        conflicts.push(...opConflicts);
        if (name === 'notifications' && opAdded.length) poke();
      } else if (KV_KEYS.has(name)) {
        assertCanWrite(name, (req as any).rbac, []);
        setKv(name, value);
      } else {
        throw new GuardError(404, 'unknown collection');
      }
      mark.run(opId, new Date().toISOString());
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

app.post('/api/v1/webhooks/academy', (req, res) => {
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
  const ins = db.prepare('INSERT OR IGNORE INTO webhook_events (source, received_at, payload, signature) VALUES (?, ?, ?, ?)').run(
    'academy', new Date().toISOString(), raw.toString('utf8'), expected,
  );
  if ((ins as any).changes === 0) return res.status(409).json({ error: 'événement déjà reçu (rejeu)' });
  // Traitement : consomme le payload puis marque processed=1. En cas d'échec, on laisse
  // processed=0 pour inspection/rejeu manuel (la ligne est déjà stockée, pas re-signable).
  try {
    processAcademyEvent(JSON.parse(raw.toString('utf8')));
    db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?').run((ins as any).lastInsertRowid);
  } catch (e) {
    console.error('[webhook] traitement échoué (payload conservé):', (e as Error).message);
  }
  res.status(202).json({ ok: true });
});

// École Bloom → certification. Payload attendu :
// { type:'certification', memberId, courseTitle, level?, externalRef? }. Point d'extension
// pour d'autres types d'événements de l'école.
function processAcademyEvent(payload: any): void {
  if (payload?.type === 'certification' && payload.memberId && payload.courseTitle) {
    appendToCollection('certifications', [{
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
app.use('/uploads', (req, res, next) => {
  const header = req.headers.authorization;
  const token = (header?.startsWith('Bearer ') ? header.slice(7) : null)
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
  if (!token || !verifyToken(token)) return res.status(401).json({ error: 'unauthorized' });
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

app.post('/api/v1/uploads', requireAuth, (req, res) => {
  const { data } = req.body ?? {};
  if (typeof data !== 'string') return res.status(400).json({ error: 'dataURL image attendue' });
  const url = storeImage(data);
  if (!url) return res.status(400).json({ error: 'image invalide ou trop lourde (max 2 Mo, png/jpeg/webp)' });
  res.json({ url });
});

// Migration idempotente au boot : les avatars base64 déjà en base deviennent des fichiers.
{
  const members = getCollection('members');
  let migrated = 0;
  for (const m of members as any[]) {
    if (typeof m.avatarUrl === 'string' && m.avatarUrl.startsWith('data:image/')) {
      const url = storeImage(m.avatarUrl);
      if (url) { m.avatarUrl = url; migrated++; }
    }
  }
  if (migrated) {
    setCollection('members', members);
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
startScheduler();
