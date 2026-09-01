// BloomCore API — pragmatic subset of ARCHITECTURE_TECHNIQUE.md's target design
// (Express is already a project dependency; PostgreSQL+Prisma is not — see
// db.ts for the reasoning). Mirrors exactly the collections the frontend
// already persists to localStorage (src/data/index.ts's `seeds`), so wiring
// is a drop-in: same names, same whole-array-replace shape.
// Charge .env EN PREMIER : auth.ts/db.ts lisent process.env au chargement du module.
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { getCollection, setCollection, appendToCollection, getKv, setKv, getCredential, syncOpSeen, markSyncOp, insertWebhookEvent, markWebhookProcessed, insertPushSub, deletePushSub } from './datastore.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, createOneTimeToken, consumeOneTimeToken, upsertCredentials, requireSecret, usingInsecureSecret, resolveBindHost, TOKEN_TTL_MS } from './auth.ts';
import { ensureSeeded } from './seed.ts';
import { runBusRoleMigration } from './migrateBusRoles.ts';
import { runActionsProphetiquesMigration } from './migrateActionsProphetiques.ts';
import { runBootMigration } from './bootMigrate.ts';
import { applyWrite, readCollection, deltaToWhole, GuardError } from './guards.ts';
import { buildContext, assertCanWrite, assertCanDelete, filterReadable, filterKv, preservedIds, RbacContext } from './rbac.ts';
import { dispatch } from './notify.ts';
import { addClient, poke, initPokeSubscriber } from './stream.ts';
import { startScheduler } from './scheduler.ts';
import { loginKey, isLocked, recordFail, clearFails, tooManyRequests } from './rateLimit.ts';
import { redisHealthy } from './redis.ts';
import { getStorage, SIGNED_URL_TTL_SEC } from './storage.ts';
import { z } from 'zod';
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
// §27 — déplace les fonctions territoriales Bloom Bus vers leur champ dédié. Idempotente :
// no-op à tous les démarrages suivants. Sans elle, un membre ne peut pas cumuler une fonction
// du département et une fonction du module — les deux occuperaient le même emplacement.
await runBusRoleMigration();
await runActionsProphetiquesMigration();

const app = express();
// Derrière Traefik/Dokploy, sans ceci req.ip = l'IP du reverse-proxy pour TOUT le monde :
// le rate-limit anti-brute-force (loginKey = ip+identifiant) comptait tous les visiteurs
// comme une seule IP — verrouillage collectif possible, et un attaquant réel non isolé.
// `1` = ne faire confiance qu'à UN saut de proxy (le Traefik du serveur), pas aux
// X-Forwarded-For arbitraires d'un client direct (spoof d'IP pour contourner le lockout).
app.set('trust proxy', 1);
// Compression gzip de tout (assets + JSON API) : le bootstrap ~450 Ko tombe à ~60 Ko —
// facteur dominant sur mobile/3G.
app.use(compression());
// Phase 6 (T6.1) : lit le cookie de session bc_session — requireAuth l'accepte EN PLUS
// du header Authorization (transition douce, voir plus bas). N'écrit rien sans que
// res.cookie() soit appelé explicitement (login) — aucun effet tant que rien ne pose le cookie.
app.use(cookieParser());
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
  const originAllowed = !!origin && ALLOWED_ORIGINS.includes(origin);
  if (originAllowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  // PATCH/DELETE : ajoutés en Phase 4 (endpoints par intention) — absents ici jusqu'à
  // présent, ce qui n'a rien cassé tant que front et API sont same-origin (pas de
  // préflight CORS requis), mais aurait bloqué silencieusement ces méthodes dès qu'un
  // front cross-origin serait branché (Phase 6, T6.3). Corrigé à l'occasion de T6.1.
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  // Cookie de session (T6.1) : un fetch cross-origin avec credentials:'include' n'envoie/
  // ne reçoit le cookie que si le serveur echo une origine EXPLICITE (jamais '*', déjà le
  // cas ici) ET pose ce header. Sans origine autorisée, on ne le pose pas (rien à autoriser).
  if (originAllowed) res.setHeader('Access-Control-Allow-Credentials', 'true');
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

// Phase 6 (T6.3) — défense en profondeur CSRF pour les mutations, EN PLUS de SameSite=Lax
// (T6.1, qui bloque déjà l'essentiel : un cookie ne part pas sur une requête POST/PATCH/
// DELETE déclenchée depuis un autre site). Le CORS ci-dessus n'est qu'une politique
// NAVIGATEUR (`fetch` la respecte, un script forgé côté serveur ou `curl` l'ignorent) — cette
// vérification explicite de l'en-tête Origin est ce qui reste actif même hors navigateur.
// N'agit que si l'en-tête Origin est PRÉSENT (les clients non-navigateur légitimes — outillage
// interne, health checks — n'en envoient pas et restent gérés par l'auth par token/cookie
// elle-même) et seulement sur les méthodes qui mutent un état.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && MUTATING_METHODS.has(req.method) && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'origine non autorisée' });
  }
  next();
});

const ARRAY_COLLECTIONS = new Set([
  'members', 'events', 'reports', 'audits', 'notifications', 'forms',
  'delegations', 'ministries', 'departments', 'certifications', 'admins', 'activities', 'integration_reports',
  'projects', 'bus_lines', 'capability_overrides', 'special_authorizations',
]);
const KV_KEYS = new Set(['permissions', 'settings']);

const SESSION_COOKIE = 'bc_session';

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  // Phase 6 (T6.1) : cookie HttpOnly EN PLUS du header Bearer — transition douce, le header
  // reste accepté (au moins le temps de cette phase) pour ne rien casser pendant la bascule
  // du client. Le cookie est prioritaire s'il est présent (posé par /auth/login ci-dessous).
  const token = (req as any).cookies?.[SESSION_COOKIE]
    ?? (header?.startsWith('Bearer ') ? header.slice(7) : null);
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
  const token = await signToken(member.id);
  setSessionCookie(res, token);
  res.json({ token, member });
});

// Phase 6 (T6.1) : cookie HttpOnly — inaccessible en JS (XSS ne peut plus voler le token),
// Secure hors dev (jamais transmis en clair), SameSite=Lax (couvre le CSRF de base pour des
// mutations en JSON POST/PATCH/DELETE — pas de formulaire HTML classique dans cette app).
// Le token reste AUSSI renvoyé dans le body de chaque route qui appelle ceci — transition :
// le client le garde EN MÉMOIRE (plus jamais en localStorage) pour les usages où le cookie
// ne suffit pas encore, et les sessions ouvertes avant ce déploiement ne cassent pas.
// Posé sur TOUTES les routes qui émettent un token (login, complete, change-password) —
// sinon un compte activé par lien ou un changement de mot de passe repartait sans cookie,
// et sa session ne survivait pas au rechargement de la page.
function setSessionCookie(res: express.Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_MS,
  });
}

// Phase 6 (T6.1) — efface le cookie de session. Le token en localStorage (transition) reste
// à effacer côté client (clearAuthToken(), inchangé) ; cette route ne gère que le cookie.
app.post('/api/v1/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: IS_PROD, sameSite: 'lax' });
  res.json({ ok: true });
});

// Activation / réinitialisation — envoi simulé via les adapters (trigger 17 :
// connexion/réinit). Toujours 200 (anti-énumération de comptes). Hors prod, le
// token est renvoyé dans la réponse (`devToken`) : la démo n'a aucun canal réel
// où le lire.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const isProd = IS_PROD;

// Une adresse à laquelle on peut réellement expédier le lien d'activation. Volontairement
// permissif (pas de regex RFC 5322) : on écarte le vide et l'évidemment malformé, la vraie
// vérification reste la livraison SMTP, dont l'échec est tracé dans outbox.error.
function isDeliverableEmail(email: unknown): boolean {
  const v = String(email ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function issueAuthLink(member: any, purpose: 'activate' | 'reset'): Promise<string> {
  const token = await createOneTimeToken(member.id, purpose);
  const label = purpose === 'activate' ? 'Activation de votre compte BloomCore' : 'Réinitialisation de votre mot de passe BloomCore';
  const link = `${APP_URL}/?${purpose}=${token}`;
  const firstName = String(member.firstName ?? '').trim();
  const message = purpose === 'activate'
    ? `Bonjour${firstName ? ` ${firstName}` : ''},\n\nVotre compte BloomCore vient d’être créé. Cliquez sur le lien ci-dessous pour créer votre mot de passe et accéder à votre espace :\n\n${link}\n\nCe lien est personnel, utilisable une seule fois et valable 48 heures.\n\nSi vous n’attendiez pas cet email, vous pouvez l’ignorer.`
    : `Bonjour${firstName ? ` ${firstName}` : ''},\n\nCliquez sur le lien ci-dessous pour créer un nouveau mot de passe BloomCore :\n\n${link}\n\nCe lien est personnel, utilisable une seule fois et valable 1 heure.\n\nSi vous n’avez pas demandé cette réinitialisation, vous pouvez l’ignorer.`;
  await dispatch(
    [{
      id: `notif_auth_${purpose}_${member.id}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: label,
      message,
      type: 'info',
      read: false,
      targetMemberId: member.id,
    }],
    [member],
    await getKv('settings'),
  );
  return token;
}

// La validation peut arriver soit par PATCH immédiat, soit par la synchronisation whole-array
// offline-first. Dans les deux cas, l'invitation doit être émise UNE seule fois lors du vrai
// passage pending → validated ; une simple édition ultérieure ne doit jamais la renvoyer.
async function issueActivationAfterDepartmentValidation(before: any | undefined, after: any): Promise<void> {
  if (
    before?.deptAttachmentStatus === 'pending'
    && after?.deptAttachmentStatus === 'validated'
    && (after.deptAttachmentOrigin === 'bloom_bus' || after.deptAttachmentOrigin === 'self_registration')
    && !(await getCredential(after.id))
  ) {
    await issueAuthLink(after, 'activate');
  }
}

// Ces deux routes sont publiques ET expédient un email. Sans borne, n'importe qui pouvait
// bombarder la boîte d'un membre dont il connaît l'adresse, et épuiser le quota d'envoi.
// Clé = IP + identifiant, comme le verrou de login. Le 429 est renvoyé AVANT toute recherche
// de membre, pour ne pas transformer le limiteur en oracle d'existence de compte
// (l'anti-énumération de ces routes — toujours 200 — serait sinon contournable).
const AUTH_LINK_MAX = 5;
const AUTH_LINK_WINDOW_SEC = 15 * 60;

app.post('/api/v1/auth/request-activation', async (req, res) => {
  const key = loginKey(req.ip, String(req.body?.identifier ?? ''));
  if (await tooManyRequests('authlink', key, AUTH_LINK_MAX, AUTH_LINK_WINDOW_SEC)) {
    return res.status(429).json({ error: 'trop de demandes, réessayez plus tard' });
  }
  const member = req.body?.identifier ? await findByIdentifier(req.body.identifier) : null;
  const devToken = member ? await issueAuthLink(member, 'activate') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

app.post('/api/v1/auth/request-reset', async (req, res) => {
  const key = loginKey(req.ip, String(req.body?.identifier ?? ''));
  if (await tooManyRequests('authlink', key, AUTH_LINK_MAX, AUTH_LINK_WINDOW_SEC)) {
    return res.status(429).json({ error: 'trop de demandes, réessayez plus tard' });
  }
  const member = req.body?.identifier ? await findByIdentifier(req.body.identifier) : null;
  const devToken = member ? await issueAuthLink(member, 'reset') : null;
  res.json({ ok: true, ...(!isProd && devToken ? { devToken } : {}) });
});

// Liste publique des départements pour le sélecteur du formulaire « Créer mon compte » —
// SANS auth, l'inscription étant publique.
//
// Strictement id + nom : c'est tout ce que le menu déroulant affiche. La version initiale
// renvoyait aussi `branch` et `specialFunction`, exposant à un visiteur non authentifié la
// structure interne de l'organisation (quels départements sont spéciaux, comment les branches
// sont découpées) sans qu'aucun écran ne s'en serve. Borné comme les autres routes publiques :
// 30 appels/heure/IP suffisent à ouvrir le formulaire, pas à cartographier en boucle.
app.get('/api/v1/public/departments', async (req, res) => {
  if (await tooManyRequests('publicdepts', String(req.ip ?? 'unknown'), 30, 3600)) {
    return res.status(429).json({ error: 'trop de requêtes, réessayez plus tard' });
  }
  const departments = await readCollection('departments');
  res.json(departments.map((d: any) => ({ id: d.id, name: d.name })));
});

// Auto-inscription publique ("Créer mon compte") — quiconque peut s'inscrire, mais le
// rattachement au département choisi reste 'pending' jusqu'à validation par le responsable
// de ce département (ou, à défaut, un Admin) : même mécanisme que le rattachement direct
// Bloom Bus (deptAttachmentStatus/Origin), voir DepartmentsView.tsx. Aucun lien d'activation
// n'est envoyé ici — il ne l'est qu'à la validation (voir PATCH /members/:id ci-dessous),
// pour qu'un compte non validé ne puisse jamais se connecter.
const RegisterSchema = z.object({
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().min(1),
  gender: z.enum(['H', 'F']),
  birthDate: z.string().min(1),
  maritalStatus: z.enum(['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)']),
  profession: z.string().min(1),
  // 'global' volontairement exclu (le type Branch l'autorise, pas l'inscription) : c'est une
  // valeur transverse de périmètre, pas une branche d'appartenance. Rejeté ici AUSSI, pas
  // seulement masqué dans le formulaire — sinon un POST direct la ferait passer.
  branch: z.enum(['church', 'light']),
  departmentId: z.string().min(1),
  commune: z.string().min(1),
}).strict();

app.post('/api/v1/auth/register', async (req, res) => {
  // Route PUBLIQUE qui ÉCRIT en base : sans borne, n'importe qui pouvait créer un nombre
  // illimité de fiches en attente et noyer les responsables sous les notifications de
  // validation. Clé = IP seule (l'identité déclarée n'est pas fiable ici, contrairement aux
  // routes de lien où l'identifiant cible ce qu'on protège). 3 inscriptions / heure / IP :
  // large pour une famille sur une même connexion, inexploitable pour du remplissage.
  if (await tooManyRequests('register', String(req.ip ?? 'unknown'), 3, 3600)) {
    return res.status(429).json({ error: 'trop d\'inscriptions depuis cette connexion, réessayez plus tard' });
  }
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });
  const input = parsed.data;
  // Même exigence qu'à la création par un opérateur : sans email livrable, le lien
  // d'activation émis à la validation n'atteindrait jamais la personne.
  if (!isDeliverableEmail(input.email)) {
    return res.status(400).json({ error: 'email: une adresse email valide est requise (elle recevra ton lien d\'activation)' });
  }

  const department = (await readCollection('departments')).find((d: any) => d.id === input.departmentId);
  if (!department) return res.status(400).json({ error: 'département inconnu' });

  const existing = await findByIdentifier(input.phone) || await findByIdentifier(input.email);
  if (existing) return res.status(409).json({ error: 'un compte existe déjà avec ce téléphone ou cet email' });

  // Pas de géolocalisation navigateur à l'inscription : repli sur le centre du Bloom Bus de
  // la commune déclarée (même principe que MemberFormModal.handleCommuneChange côté client) —
  // pas de coordonnée fixe par défaut si la commune ne matche aucun bus existant, plutôt qu'une
  // fausse position partagée par tous les inscrits.
  const busLine = (await readCollection('bus_lines')).find(
    (b: any) => String(b.commune).toLowerCase() === input.commune.toLowerCase(),
  );
  const gps = busLine ? { lat: busLine.centerLat, lng: busLine.centerLng, commune: input.commune } : undefined;

  const member = {
    id: `mem_reg_${randomUUID()}`,
    lastName: input.lastName,
    firstName: input.firstName,
    phone: input.phone,
    email: input.email,
    gender: input.gender,
    birthDate: input.birthDate,
    maritalStatus: input.maritalStatus,
    profession: input.profession,
    ...(gps && { gps }),
    entryDate: new Date().toISOString().slice(0, 10),
    branch: input.branch,
    level: 'nouveau' as const,
    pastoralCursus: 'aucun' as const,
    departments: { [input.departmentId]: 'membre' as const },
    deptAttachmentStatus: 'pending' as const,
    deptAttachmentOrigin: 'self_registration' as const,
    healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
    baptismStatus: 'non_baptise' as const,
  };
  const check = MemberSchema.safeParse(member);
  if (!check.success) return res.status(400).json({ error: check.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') });

  // `updatedAt` est OBLIGATOIRE ici. C'est ce que pose applyWrite sur toute écriture, et c'est
  // ce qui protège l'item du tombstone-par-omission (guards.ts : `if (asOf && s.updatedAt &&
  // s.updatedAt > asOf) → conflit` au lieu de supprimer). Sans lui, le prochain PUT whole-array
  // d'un client dont le tableau `members` date d'AVANT cette inscription (typiquement la file
  // de rattrapage hors-ligne, qui reste whole-array) soft-supprimerait silencieusement la
  // demande en attente. Cet endpoint étant public, il n'a pas de contexte RBAC et ne passe donc
  // pas par applyWrite — la métadonnée doit être posée à la main.
  await appendToCollection('members', [{ ...check.data, updatedAt: new Date().toISOString() }]);

  // Confirme au demandeur que son compte attend la validation. L'id `notif_auth_*`
  // rend cet email indépendant de ses préférences, puisqu'il n'a pas encore de compte actif.
  const applicantNotification = {
    id: `notif_auth_pending_registration_${check.data.id}`,
    timestamp: new Date().toISOString(),
    title: 'Votre demande d’inscription BloomCore est en attente de validation',
    message: `Bonjour ${input.firstName},\n\nVotre demande d’inscription a bien été reçue. Le responsable du département ${department.name} va l’examiner.\n\nVous recevrez un email pour créer votre mot de passe dès que votre compte sera validé.`,
    type: 'info' as const,
    read: false,
    targetMemberId: check.data.id,
  };

  // Notifie le(s) responsable(s) du département choisi ; à défaut, le tuteur du ministère
  // (Ministre) ; à défaut, tous les comptes Admin/Super Admin — quelqu'un doit toujours être
  // notifié, "en fonction du champ d'action" (retour utilisateur).
  const members = await readCollection('members');
  const responsables = members.filter((m: any) => m.departments?.[input.departmentId] === 'responsable');
  let recipients = responsables;
  if (recipients.length === 0 && department.ministryId) {
    const ministry = (await readCollection('ministries')).find((m: any) => m.id === department.ministryId);
    if (ministry?.tuteurId) recipients = members.filter((m: any) => m.id === ministry.tuteurId);
  }
  if (recipients.length === 0) {
    const adminIds = new Set((await readCollection('admins')).map((a: any) => String(a.id).replace(/^adm_/, '')));
    recipients = members.filter((m: any) => adminIds.has(m.id));
  }
  const notifs = [applicantNotification];
  if (recipients.length) {
    // Ids déterministes (member × destinataire) → ré-appel idempotent, comme les alertes
    // du scheduler. On INSÈRE d'abord dans `notifications` (canal in-app = la cloche) PUIS
    // on dispatch les canaux hors-app : dispatch() ne fait que le fan-out email/SMS/push,
    // il n'écrit pas la collection (cf. scheduler.ts runSweep, même séquence).
    notifs.push(...recipients.map((r: any) => ({
      id: `notif_selfreg_${check.data.id}_${r.id}`,
      timestamp: new Date().toISOString(),
      title: 'Nouvelle demande d\'inscription',
      message: `${input.firstName} ${input.lastName} demande à rejoindre ${department.name} — à valider.`,
      type: 'info' as const,
      read: false,
      targetMemberId: r.id,
    })));
  }
  const knownNotifIds = new Set((await readCollection('notifications', true)).map((n: any) => n.id));
  const freshNotifs = notifs.filter((n) => !knownNotifIds.has(n.id));
  if (freshNotifs.length) {
    await appendToCollection('notifications', freshNotifs.map((n) => ({ ...n, updatedAt: new Date().toISOString() })));
    await dispatch(freshNotifs, members, await getKv('settings'));
  }
  poke(); // la demande en attente + la cloche apparaissent en direct chez le responsable

  res.status(201).json({ ok: true });
});

app.post('/api/v1/auth/complete', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'mot de passe trop court (min 8)' });
  const consumed = await consumeOneTimeToken(String(token));
  if (!consumed) return res.status(401).json({ error: 'token invalide, expiré ou déjà utilisé' });
  await upsertCredentials(consumed.memberId, String(password));
  const member = (await readCollection('members')).find((m) => m.id === consumed.memberId);
  const sessionToken = await signToken(consumed.memberId);
  setSessionCookie(res, sessionToken); // T6.1 — l'activation ouvre une vraie session cookie
  res.json({ token: sessionToken, member });
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
  const freshToken = await signToken(memberId);
  setSessionCookie(res, freshToken); // T6.1 — remplace aussi le cookie (l'ancien porte une pv révoquée)
  res.json({ ok: true, token: freshToken });
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
  // KV : filtré comme le reste (la matrice de permissions est réduite aux rôles de
  // l'opérateur pour qui n'a pas à voir l'écran Permissions — voir rbac.filterKv).
  for (const key of KV_KEYS) payload[key] = filterKv(key, ctx, await getKv(key));
  // Instant de LECTURE, renvoyé pour que le client le mémorise comme `asOf` de chaque
  // collection. Sans lui, un navigateur fraîchement chargé (ou au cache vidé) écrivait sans
  // aucun `asOf` — donc sans la protection anti-écrasement d'applyWrite. C'est ce trou qui a
  // laissé un onglet périmé effacer des données plus récentes.
  payload._syncedAt = new Date().toISOString();
  res.json(payload);
});

// Flux temps réel (SSE, §7). EventSource ne peut pas poser de header Authorization
// → token en query (même contrainte que /uploads), ou cookie de session (T6.1) — envoyé
// automatiquement par le navigateur en same-origin, sans rien à changer côté EventSource.
// Cross-origin (T6.3, quand le front est servi ailleurs) : EventSource devra être construit
// avec `{ withCredentials: true }`, sinon le cookie ne suit pas la requête cross-site.
// Doit rester AVANT /:name pour ne pas être capturé comme nom de collection.
// 'no-transform' fait sauter la compression gzip globale (sinon le flux est bufferisé et jamais envoyé).
app.get('/api/v1/stream', async (req, res) => {
  const token = (req as any).cookies?.[SESSION_COOKIE]
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
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
  // Email OBLIGATOIRE à la création. C'est le seul canal par lequel part le lien
  // d'activation (issueAuthLink → dispatch → recipientAddress renvoie null sans email) :
  // sans lui le compte était créé, un token était consommé, AUCUN mail ne partait et
  // personne n'était averti — la personne ne pouvait jamais activer son compte.
  // Contrôle volontairement placé ICI et non dans MemberSchema : le schéma sert aussi au
  // PATCH (MemberPatchSchema), qui reçoit la fiche entière depuis le client — l'y mettre
  // bloquerait l'ÉDITION des fiches d'avant cette règle, qui ont un email vide.
  if (!isDeliverableEmail(member.email)) {
    return res.status(400).json({ error: 'email: une adresse email valide est requise (elle reçoit le lien d\'activation du compte)' });
  }
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
    const result = [...added, ...changed].find((m: any) => String(m.id) === String(req.params.id)) ?? merged;
    // Validation d'un rattachement en attente (Bloom Bus ou auto-inscription, cf.
    // deptAttachmentStatus/Origin) : c'est SEULEMENT à ce moment-là que le compte reçoit son
    // lien d'activation — pas à la création (le membre ne doit pas pouvoir se connecter avant
    // validation). Idempotent : si un credential existe déjà, on ne renvoie pas de lien.
    await issueActivationAfterDepartmentValidation(stored, result);
    return res.json(result);
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
    await assertCanDelete((req as any).rbac, stored as any);
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
// observable IDENTIQUE à des routes écrites à la main pour chaque collection — y compris
// les effets de bord post-écriture du PUT (afterWrite ci-dessous), sinon une notification
// créée par POST n'aurait ni fan-out email/SMS ni poke SSE alors que la même via PUT si.
async function afterCrudWrite(name: string, added: any[]): Promise<void> {
  // Miroir exact du PUT /api/v1/:name (plus bas) : fan-out multicanal + cloche en direct
  // pour les notifications nouvellement créées. Les autres collections n'ont pas d'effet.
  if (name === 'notifications' && added.length) {
    await dispatch(added, await readCollection('members'), await getKv('settings'));
    poke();
  }
}

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
      await afterCrudWrite(name, added);
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
  if (KV_KEYS.has(name)) return res.json(filterKv(name, (req as any).rbac, await getKv(name)));
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
      // clientSync=true : sans `asOf`, ce client ne peut prouver aucune lecture récente et
      // n'a donc le droit que d'AJOUTER — jamais de modifier ni de supprimer l'existant.
      // Mémorise l'état avant fusion : un PATCH et cette synchronisation peuvent se croiser.
      // Sans cette comparaison, la synchro peut gagner la course et rendre la validation
      // persistante sans jamais déclencher le lien d'activation.
      const membersBefore = name === 'members'
        ? new Map((await readCollection('members', true)).map((m: any) => [String(m.id), m]))
        : null;
      const { added, changed, conflicts } = await applyWrite(name, body, asOf, await preservedIds(name, (req as any).rbac), true);
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
      if (name === 'members' && membersBefore) {
        for (const m of changed) {
          await issueActivationAfterDepartmentValidation(membersBefore.get(String(m.id)), m);
        }
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
        // clientSync=true, même règle que le PUT : une opération de la file de rattrapage
        // sans `asOf` n'ajoute que du nouveau, elle n'écrase rien.
        const { added: opAdded, conflicts: opConflicts } = await applyWrite(name, value, typeof asOf === 'string' ? asOf : undefined, await preservedIds(name, (req as any).rbac), true);
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
// Phase 5 (T5.2) : écriture désormais via l'adaptateur (server/storage.ts) — disque par
// défaut (S3_ENDPOINT absent), MinIO/S3 si défini. `UPLOAD_DIR` reste le repli disque ET
// la racine servie par la route /uploads ci-dessous (mode disque uniquement — en mode S3,
// les photos ne transitent plus par ce volume, voir GET /api/v1/uploads/sign plus bas).
const storage = getStorage(UPLOAD_DIR);
// Photos derrière authentification : PII (parfois mineurs). Les <img> ne portent pas
// de header Authorization → le token est aussi accepté en query (?token=).
// `immutable` retiré : le cache reste révocable (le token expire en 12h).
//
// SCOPE (ajouté à l'audit) : l'authentification seule ne suffisait pas — toute session valide
// pouvait lire N'IMPORTE QUELLE photo en connaissant son nom de fichier, y compris celle d'un
// membre hors de son périmètre. Le nom étant le hash du contenu il n'est pas devinable, mais
// c'était la seule protection. On exige désormais que la clé demandée soit l'avatar d'au moins
// un membre VISIBLE par l'opérateur. La déduplication par hash (deux membres, même photo) est
// gérée naturellement : il suffit qu'UN membre visible la porte.
//
// ponytail: cette route reste le SEUL chemin de lecture en mode disque (repli dev/mono-
// service). En mode S3/MinIO, GET /api/v1/uploads/sign?key=<hash> (T5.3, plus bas) est le
// chemin prévu — cette route /uploads redevient alors inutilisée mais reste inoffensive
// (UPLOAD_DIR peut simplement être vide).

// Une liste de membres déclenche des dizaines de requêtes /uploads en rafale : sans ce cache
// court, chacune relancerait le filtrage RBAC complet (lecture members + départements +
// ministères + bus). Caches en mémoire du process — avec plusieurs répliques d'API, chacune
// a le sien, ce qui ne change rien à la décision (elle est recalculée, pas partagée).
const UPLOAD_SCOPE_TTL_MS = 30_000;
const uploadScopeCache = new Map<string, { at: number; keys: Set<string> }>();
// Une photo tout juste téléversée n'appartient encore à AUCUNE fiche (le formulaire n'est pas
// enregistré) : sans cette tolérance, l'aperçu renvoyait 404 à celui-là même qui vient de
// l'envoyer. Fenêtre volontairement large — la clé n'est connue que de lui.
const RECENT_UPLOAD_MS = 60 * 60 * 1000;
const recentUploads = new Map<string, { by: string; at: number }>();

function avatarKeysOf(m: any): string[] {
  const url = String(m?.avatarUrl ?? '');
  if (!url.startsWith('/uploads/')) return [];
  const key = url.slice('/uploads/'.length).split('?')[0];
  // Vignette <hash>-t.jpg et large <hash>.jpg sont liées par nommage : voir l'une autorise
  // l'autre (c'est la même photo, ouverte en lightbox).
  return key.endsWith('-t.jpg') ? [key, `${key.slice(0, -'-t.jpg'.length)}.jpg`] : [key];
}

async function visibleAvatarKeys(memberId: string): Promise<Set<string>> {
  const hit = uploadScopeCache.get(memberId);
  if (hit && Date.now() - hit.at < UPLOAD_SCOPE_TTL_MS) return hit.keys;
  const ctx = await buildContext(memberId);
  const keys = new Set<string>();
  if (ctx) {
    for (const m of await filterReadable('members', ctx, await readCollection('members'))) {
      for (const k of avatarKeysOf(m)) keys.add(k);
    }
  }
  uploadScopeCache.set(memberId, { at: Date.now(), keys });
  return keys;
}

app.use('/uploads', async (req, res, next) => {
  const header = req.headers.authorization;
  const token = (req as any).cookies?.[SESSION_COOKIE]
    ?? (header?.startsWith('Bearer ') ? header.slice(7) : null)
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
  const memberId = token ? await verifyToken(token) : null;
  if (!memberId) return res.status(401).json({ error: 'unauthorized' });
  let key: string;
  try {
    key = decodeURIComponent(req.path.replace(/^\/+/, ''));
  } catch {
    return res.status(400).json({ error: 'clé invalide' });
  }
  if (key) {
    const mine = recentUploads.get(key);
    const justUploaded = !!mine && mine.by === memberId && Date.now() - mine.at < RECENT_UPLOAD_MS;
    // 404 et non 403 : ne pas confirmer l'existence d'un fichier hors périmètre.
    if (!justUploaded && !(await visibleAvatarKeys(memberId)).has(key)) {
      return res.status(404).json({ error: 'not found' });
    }
  }
  next();
}, express.static(UPLOAD_DIR, { maxAge: '1y' }));

// GET /api/v1/uploads/sign?key=<hash[.ext|-t.jpg]> — URL signée à durée de vie limitée
// (storage.SIGNED_URL_TTL_SEC), chemin de lecture prévu pour le mode S3/MinIO (T5.3). En
// mode disque, l'adaptateur renvoie directement `/uploads/<key>` (comportement historique,
// pas de vraie expiration côté disque) — cette route reste donc sûre à appeler dans TOUS
// les modes, même si le client ne s'en sert pas encore activement (voir rapport de phase :
// le hook front de résolution/cache n'est pas branché dans cet incrément).
app.get('/api/v1/uploads/sign', requireAuth, async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : null;
  // Pas de traversée de chemin : les clés sont TOUJOURS des hex sha1 (+ suffixe -t.jpg/.ext)
  // générés serveur, jamais un chemin fourni par le client à cette étape (storeImage ci-dessous).
  if (!key || !/^[a-f0-9]{40}(-t)?\.(jpg|jpeg|png|webp)$/.test(key)) {
    return res.status(400).json({ error: 'key invalide' });
  }
  if (!(await storage.exists(key))) return res.status(404).json({ error: 'introuvable' });
  const url = await storage.getSignedUrl(key);
  res.json({ url, expiresIn: SIGNED_URL_TTL_SEC });
});

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,(.+)$/;
async function storeImage(dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(DATA_URL_RE);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return null; // 2 Mo max (les photos sont downscalées côté client)
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const key = `${createHash('sha1').update(buf).digest('hex')}.${ext}`;
  if (!(await storage.exists(key))) await storage.putObject(key, buf, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  return `/uploads/${key}`;
}

// Paire vignette+large liée par nommage : <hash>.jpg (large, lightbox) + <hash>-t.jpg (vignette,
// renvoyée comme avatarUrl). Hash sur la LARGE → les deux tailles d'une même photo restent liées
// et dédupliquées. ponytail: l'app encode toujours en JPEG (canvas) → noms .jpg fixes.
async function storeImagePair(thumbUrl: string, largeUrl: string): Promise<string | null> {
  const t = thumbUrl.match(DATA_URL_RE);
  const l = largeUrl.match(DATA_URL_RE);
  if (!t || !l) return null;
  const thumbBuf = Buffer.from(t[2], 'base64');
  const largeBuf = Buffer.from(l[2], 'base64');
  if (thumbBuf.length > 2 * 1024 * 1024 || largeBuf.length > 2 * 1024 * 1024) return null;
  const hash = createHash('sha1').update(largeBuf).digest('hex');
  const largeKey = `${hash}.jpg`;
  const thumbKey = `${hash}-t.jpg`;
  if (!(await storage.exists(largeKey))) await storage.putObject(largeKey, largeBuf, 'image/jpeg');
  if (!(await storage.exists(thumbKey))) await storage.putObject(thumbKey, thumbBuf, 'image/jpeg');
  return `/uploads/${thumbKey}`;
}

app.post('/api/v1/uploads', requireAuth, async (req, res) => {
  const { data, thumb, large } = req.body ?? {};
  // Mémorise qui vient d'envoyer quoi : le contrôle de périmètre de /uploads exige que la clé
  // soit l'avatar d'un membre visible, or une photo fraîchement téléversée n'est encore
  // l'avatar de personne tant que le formulaire n'est pas enregistré. Les DEUX tailles sont
  // notées (l'aperçu affiche la vignette, le lightbox la large).
  const remember = (url: string) => {
    const key = url.slice('/uploads/'.length);
    const at = Date.now();
    const by = (req as any).memberId as string;
    recentUploads.set(key, { by, at });
    if (key.endsWith('-t.jpg')) recentUploads.set(`${key.slice(0, -'-t.jpg'.length)}.jpg`, { by, at });
  };
  if (typeof thumb === 'string' && typeof large === 'string') {
    const url = await storeImagePair(thumb, large);
    if (!url) return res.status(400).json({ error: 'image invalide ou trop lourde (max 2 Mo/taille)' });
    remember(url);
    return res.json({ url });
  }
  if (typeof data !== 'string') return res.status(400).json({ error: 'dataURL image attendue' });
  const url = await storeImage(data);
  if (!url) return res.status(400).json({ error: 'image invalide ou trop lourde (max 2 Mo, png/jpeg/webp)' });
  remember(url);
  res.json({ url });
});

// Migration idempotente au boot : les avatars base64 déjà en base deviennent des fichiers.
{
  const members = await getCollection('members');
  let migrated = 0;
  for (const m of members as any[]) {
    if (typeof m.avatarUrl === 'string' && m.avatarUrl.startsWith('data:image/')) {
      const url = await storeImage(m.avatarUrl);
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
