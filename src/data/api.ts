// Thin client for the BloomCore API (server/index.ts). Every call swallows
// network errors and resolves null/false — offline-first, matching
// ARCHITECTURE_TECHNIQUE.md §7's "PWA offline-first, localStorage cache"
// intent: the app must keep working unmodified when the backend isn't running.
import { toast } from '../components/ui/Toast';

// `VITE_API_BASE` explicite gagne toujours. Sinon : en dev, l'API tourne sur un port distinct
// (4000) du serveur Vite (3000) → URL absolue ; en prod, le frontend est servi par l'API elle-même
// (mono-service, Dockerfile) → chemin RELATIF same-origin, valable quel que soit l'hôte de déploiement.
const API_BASE = (import.meta as any).env?.VITE_API_BASE
  || ((import.meta as any).env?.DEV ? 'http://localhost:4000/api/v1' : '/api/v1');
const AUTH_TOKEN_KEY = 'bc_authToken';

// --- Versionnage par collection (conflits multi-appareils) ---
// Dernier instant où CE client a lu chaque collection depuis le serveur ;
// envoyé comme `asOf` pour que le serveur détecte s'il a écrit une version
// plus récente entre-temps (voir server/guards.ts applyWrite). Mis à jour
// uniquement depuis les timestamps RENVOYÉS par le serveur (jamais l'horloge
// locale) pour ne pas dépendre d'un éventuel décalage d'horloge client/serveur.
const SYNCED_AT_KEY = 'bc_syncedAt';

function getSyncedAt(name: string): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_AT_KEY) ?? '{}')[name];
  } catch {
    return undefined;
  }
}

function setSyncedAt(name: string, syncedAt: unknown): void {
  if (typeof syncedAt !== 'string') return;
  try {
    const map = JSON.parse(localStorage.getItem(SYNCED_AT_KEY) ?? '{}');
    map[name] = syncedAt;
    localStorage.setItem(SYNCED_AT_KEY, JSON.stringify(map));
  } catch {
    // localStorage plein/indisponible — tant pis, prochain sync réessaiera sans asOf.
  }
}

// --- Sync delta (per-row) ---
// Snapshot du dernier état SYNCHRONISÉ par collection (id → JSON canonique) pour
// pousser un delta {upserts, deletes} plutôt que le tableau entier (le PUT whole-array
// devenait le mur à 4000 membres). En mémoire : semé au bootstrap et après chaque push
// réussi ; absent → fallback whole-array (sûr). La file offline reste whole-array.
const lastSynced = new Map<string, Map<string, string>>();

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

function seedSyncSnapshot(name: string, arr: unknown): void {
  if (Array.isArray(arr)) lastSynced.set(name, new Map(arr.map((it) => [String(it.id), stableStringify(it)])));
}

// Delta vs dernier sync réussi. null → pas de base → l'appelant pousse le tableau entier.
function computeDelta(name: string, current: any[]): { upserts: any[]; deletes: string[] } | null {
  const snap = lastSynced.get(name);
  if (!snap) return null;
  const upserts: any[] = [];
  const curIds = new Set<string>();
  for (const it of current) {
    const id = String(it.id);
    curIds.add(id);
    if (snap.get(id) !== stableStringify(it)) upserts.push(it);
  }
  const deletes: string[] = [];
  for (const id of snap.keys()) if (!curIds.has(id)) deletes.push(id);
  return { upserts, deletes };
}

// Un item en conflit = un autre appareil l'a modifié entre-temps ; ce client
// périmé n'écrase pas la version serveur (voir applyWrite). L'utilisateur doit
// le savoir plutôt que de croire son écriture appliquée silencieusement.
function reportConflicts(conflicts: unknown, context?: string): void {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return;
  const where = context ? `${context} : ` : '';
  toast.error(`${where}${conflicts.length} élément(s) non synchronisé(s) (modifié(s) ailleurs entre-temps)`);
}

// Phase 6 (T6.1, transition terminée) : le token ne vit PLUS en localStorage — un XSS ne
// peut plus voler une session persistée. Il est gardé EN MÉMOIRE pour la durée de l'onglet
// (utile pour ?token= sur les <img>/SSE tant qu'on l'a) ; après un rechargement de page,
// c'est le cookie HttpOnly (posé au login) qui authentifie seul — le serveur l'accepte
// partout (requireAuth, /stream, /uploads). Le flag bc_session_active (non secret : un
// booléen, pas un credential) remplace la présence du token comme test « suis-je connecté »
// dans les gardes ci-dessous — sans lui, après reload, tous les fetch s'annulaient avant
// d'avoir laissé le cookie prouver la session.
const SESSION_FLAG_KEY = 'bc_session_active';
let memoryToken: string | null = null;

// Migration depuis l'ancien stockage : les sessions ouvertes AVANT ce déploiement ont
// encore leur token en localStorage (et pas de cookie tant qu'elles ne se re-loguent pas).
// On l'adopte en mémoire puis on l'EFFACE du disque — après quoi ce navigateur est propre.
try {
  const legacy = localStorage.getItem(AUTH_TOKEN_KEY);
  if (legacy) {
    memoryToken = legacy;
    localStorage.setItem(SESSION_FLAG_KEY, '1');
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
} catch { /* localStorage indisponible (SSR/test) — sans conséquence */ }

function setAuthToken(token: string): void {
  memoryToken = token;
  try { localStorage.setItem(SESSION_FLAG_KEY, '1'); } catch { /* best-effort */ }
}

export function getAuthToken(): string | null {
  return memoryToken;
}

// Vrai s'il existe une session plausible : token en mémoire (onglet courant) OU flag posé
// par un login antérieur (cookie attendu). Peut être un faux positif après expiration du
// cookie (12h) — les fetch renvoient alors 401 et l'app retombe sur l'écran de connexion,
// exactement comme avec un token localStorage expiré avant cette transition.
function isAuthed(): boolean {
  if (memoryToken) return true;
  try { return localStorage.getItem(SESSION_FLAG_KEY) === '1'; } catch { return false; }
}

// En-tête Authorization SEULEMENT si un token est en mémoire — sinon objet vide, et c'est
// le cookie (credentials:'include' sur tous les fetch) qui porte l'authentification.
function authHeaders(): Record<string, string> {
  return memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {};
}

export function clearAuthToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(SESSION_FLAG_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY); // legacy — au cas où une vieille session traîne
  } catch { /* best-effort */ }
}

// Phase 6 (T6.1) — efface le cookie de session côté serveur. Best-effort : le logout local
// (clearAuthToken() + reset du state React, voir App.tsx handleLogout) ne doit JAMAIS
// attendre ni dépendre de cet appel réseau — un logout doit toujours réussir localement,
// même hors-ligne/serveur injoignable.
export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, { credentials: 'include', method: 'POST' });
  } catch {
    // ignoré — voir commentaire ci-dessus
  }
}

// Racine du serveur d'API, déduite d'API_BASE en retirant le suffixe de version. Vaut ''
// quand API_BASE est relatif (mono-service same-origin) → comportement historique inchangé.
// `/uploads` n'est PAS sous /api/v1 côté serveur (app.use('/uploads', …)), d'où le besoin
// de la racine plutôt que d'API_BASE.
const API_ORIGIN = /^https?:\/\//.test(API_BASE) ? API_BASE.replace(/\/api\/v1\/?$/, '') : '';

// /uploads est authentifié (voir server/index.ts). Les <img> ne portent pas de header →
// token en query quand on l'a en mémoire ; sinon URL nue et c'est le cookie de session qui
// authentifie (le serveur l'accepte sur /uploads, T6.1).
//
// L'URL doit être ABSOLUE dès que le front est servi sur un autre hôte que l'API (Phase 6 :
// app.<domaine> pour le front, api.app.<domaine> pour l'API). Avec un chemin relatif, le
// navigateur demandait la photo au nginx du FRONTEND, dont le `try_files … /index.html`
// répond 200 avec la page HTML : la requête réussissait et l'image ne s'affichait jamais
// (aucune erreur en console — le symptôme « elle charge mais ne s'affiche pas »).
//
// Le cookie suit bien cette requête cross-ORIGIN : SameSite s'évalue par SITE (domaine
// enregistrable), et app.<domaine> et api.app.<domaine> partagent le même — un cookie
// SameSite=Lax est donc envoyé sur cette sous-ressource. Le `?token=` reste utile quand on
// a le token en mémoire (avant tout rechargement de page).
export function photoSrc(url?: string): string | undefined {
  if (!url || !url.startsWith('/uploads/')) return url;
  const token = getAuthToken();
  const absolute = `${API_ORIGIN}${url}`;
  return token ? `${absolute}?token=${encodeURIComponent(token)}` : absolute;
}

export async function apiBootstrap(): Promise<Record<string, unknown> | null> {
  // Lecture auth-gated côté serveur : sans session plausible (ni token mémoire, ni flag
  // de login antérieur → pas de cookie attendu), 401 à coup sûr — inutile de faire
  // l'aller-retour réseau. App.tsx re-bootstrap de toute façon après login.
  if (!isAuthed()) return null;
  try {
    const res = await fetch(`${API_BASE}/bootstrap`, {
      credentials: 'include', // cookie de session (T6.1) — seul credential après un reload
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // L'état serveur devient la base des deltas à venir (avant le flush : les écritures
    // en file seront rejouées en whole-array et re-sèmeront ces collections au succès).
    for (const [k, v] of Object.entries(data)) seedSyncSnapshot(k, v);
    void flushSyncQueue(); // serveur joignable → rejouer les écritures en file
    return data;
  } catch {
    return null;
  }
}

// --- File de rattrapage hors-ligne (POST /sync/batch) ---
// Un apiPut qui échoue (serveur éteint/injoignable) est mis en file dans
// localStorage ; seule la plus récente op par collection est conservée (le PUT
// est whole-array LWW, les anciennes sont du poids mort). Flush au bootstrap
// réussi et au retour du réseau (event 'online').
const SYNC_QUEUE_KEY = 'bc_syncQueue';

type QueuedOp = { opId: string; name: string; value: unknown; asOf?: string };

// Nombre d'écritures en attente de synchro (pour l'indicateur « Sauvegardé
// localement », §7). Le changement est signalé par l'event 'bc-sync-changed'.
export function syncQueueLength(): number {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '[]').length;
  } catch {
    return 0;
  }
}

function signalSyncChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bc-sync-changed'));
}

// « Flush en vol » — l'indicateur ne doit tourner (spinner) que pendant un vrai aller-retour
// réseau, pas tant que la file attend. ponytail: pas de store, un flag module suffit.
let syncing = false;
export function isSyncing(): boolean { return syncing; }

// Retry borné : tant que la file n'est pas vide on retente le flush périodiquement, et on
// s'auto-arrête dès qu'elle est drainée. Sans ça, un échec transitoire EN LIGNE (500 / timeout
// sans bascule offline) laissait la file — et donc le spinner — coincés à vie.
const SYNC_RETRY_MS = 30_000;
let retryTimer: ReturnType<typeof setInterval> | null = null;
function stopSyncRetry(): void { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } }
function scheduleSyncRetry(): void {
  if (retryTimer || typeof window === 'undefined') return;
  retryTimer = setInterval(() => {
    if (syncQueueLength() === 0) { stopSyncRetry(); return; }
    void flushSyncQueue();
  }, SYNC_RETRY_MS);
}

function enqueueSync(name: string, value: unknown): void {
  try {
    const queue: QueuedOp[] = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '[]');
    const next = queue.filter((op) => op.name !== name);
    next.push({ opId: crypto.randomUUID(), name, value, asOf: getSyncedAt(name) });
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(next));
    signalSyncChanged();
    scheduleSyncRetry(); // relance périodique tant que la file n'est pas vide
  } catch {
    // localStorage plein/indisponible — tant pis, LWW au prochain save.
  }
}

export async function flushSyncQueue(): Promise<void> {
  if (!isAuthed()) return; // pas d'auth → rien à envoyer ; l'indicateur reste statique (« En attente »)
  if (syncing) return; // un seul flush en vol à la fois (retry + online + bootstrap peuvent coïncider)
  let queue: QueuedOp[] = [];
  try {
    queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '[]');
  } catch {
    return;
  }
  if (queue.length === 0) { stopSyncRetry(); return; }
  syncing = true;
  signalSyncChanged(); // le spinner ne tourne QUE pendant cet aller-retour
  try {
    const res = await fetch(`${API_BASE}/sync/batch`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ops: queue }),
    });
    if (!res.ok) return;
    const { applied, skipped, syncedAt, conflicts } = await res.json();
    const done = new Set([...(applied ?? []), ...(skipped ?? [])]);
    const rest = queue.filter((op) => !done.has(op.opId));
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(rest));
    // Op appliquée en whole-array → le serveur a cet état ; il devient la base des deltas.
    for (const op of queue) if (done.has(op.opId)) { setSyncedAt(op.name, syncedAt); seedSyncSnapshot(op.name, op.value); }
    if (rest.length !== queue.length) signalSyncChanged();
    reportConflicts(conflicts); // rattrapage : op multi-collections, pas de contexte unique
  } catch {
    // toujours hors-ligne — on réessaiera au prochain flush.
  } finally {
    syncing = false;
    signalSyncChanged();
    // Source unique de vérité : reste-t-il quelque chose ? → réarme le retry ; sinon stop.
    // Couvre TOUS les chemins (échec !res.ok, offline, drain partiel) et la file pré-existante
    // au boot (apiBootstrap → flush → ici) sans dépendre d'un nouvel enqueue.
    if (syncQueueLength() > 0) scheduleSyncRetry(); else stopSyncRetry();
  }
}

// Re-fetch d'UNE collection (déjà filtrée RBAC côté serveur). Utilisé par le
// flux temps réel pour rafraîchir les notifs sans re-bootstrap complet.
export async function apiFetchCollection(name: string): Promise<unknown[] | null> {
  if (!isAuthed()) return null;
  try {
    const res = await fetch(`${API_BASE}/${name}`, { credentials: 'include', headers: authHeaders() }); // Phase 6 (T6.1)
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// Flux temps réel (SSE, §7). EventSource reconnecte tout seul (retry serveur) et
// survit aux coupures réseau. onPoke = « quelque chose a changé, re-sync ». Renvoie
// une fonction de fermeture (à appeler au logout). No-op sans token/navigateur.
export function openNotificationStream(onPoke: () => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};
  // Après un reload, memoryToken est vide (jamais persisté) mais la session peut rester
  // valide via le cookie (T6.1, le serveur accepte les deux sur /stream) — on se fie donc
  // à isAuthed() pour décider d'ouvrir la connexion, et on ne met `?token=` que si on l'a
  // réellement en mémoire (sinon EventSource joint le cookie same-origin automatiquement).
  if (!isAuthed()) return () => {};
  const token = getAuthToken();
  const url = token ? `${API_BASE}/stream?token=${encodeURIComponent(token)}` : `${API_BASE}/stream`;
  const es = new EventSource(url);
  es.addEventListener('notifications', () => onPoke());
  return () => es.close();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushSyncQueue());
}

// Téléverse une photo (dataURL) → URL de fichier servie par l'API (/uploads/<hash>).
// null si hors-ligne/serveur absent : l'appelant garde le dataURL (offline-first),
// la migration au boot serveur convertira au prochain sync.
// thumb = vignette (renvoyée comme avatarUrl) ; large = version lightbox stockée à côté,
// liée par nommage (<hash>-t.jpg / <hash>.jpg). Sans `large`, upload d'une seule taille (legacy).
export async function apiUpload(thumb: string, large?: string): Promise<string | null> {
  if (!isAuthed()) return null;
  try {
    const res = await fetch(`${API_BASE}/uploads`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(large ? { thumb, large } : { data: thumb }),
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

// URL de la version large (lightbox) : /uploads/<hash>-t.jpg → /uploads/<hash>.jpg.
// Legacy (<hash>.jpg sans -t), dataURL inline ou URL externe : renvoyé tel quel (le lightbox
// retombe alors sur la vignette). ponytail: convention de nommage → aucun champ membre en plus.
export function largePhotoUrl(url?: string): string | undefined {
  if (!url) return url;
  return url.startsWith('/uploads/') && url.endsWith('-t.jpg')
    ? `${url.slice(0, -'-t.jpg'.length)}.jpg`
    : url;
}

// Fire-and-forget push of a whole collection/kv value. Requires a token
// (mutations are auth-gated server-side) — silently a no-op before login.
// Échec réseau → file de rattrapage (voir flushSyncQueue).
export async function apiPut(name: string, value: unknown): Promise<boolean> {
  if (!isAuthed()) return false;
  // Delta quand un snapshot existe : on n'envoie que les items changés/supprimés. Sinon
  // (KV, ou pas de base) → valeur complète. La file offline garde TOUJOURS le whole-array.
  const delta = Array.isArray(value) ? computeDelta(name, value) : null;
  if (delta && delta.upserts.length === 0 && delta.deletes.length === 0) return true; // rien à pousser
  try {
    const asOf = getSyncedAt(name);
    const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
    const res = await fetch(`${API_BASE}/${name}${qs}`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(delta ?? value),
    });
    // 401 (token expiré → réussira après re-login) et 5xx (transitoire) → file de rattrapage.
    // 400/403 (rejet permanent : requête invalide ou refus RBAC) NE sont PAS rejoués — les
    // mettre en file les ferait boucler à chaque flush (B5, sans le poison-pill de la file).
    if (!res.ok && (res.status === 401 || res.status >= 500)) enqueueSync(name, value);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setSyncedAt(name, data.syncedAt);
      // Conflit → le serveur a gardé sa version pour certains items : on invalide le snapshot
      // pour forcer un push whole-array au prochain coup (re-tente tout, asOf avancé → converge).
      // Sinon le serveur a désormais exactement `value` → il devient la base des deltas suivants.
      if (Array.isArray(value)) {
        if (Array.isArray(data.conflicts) && data.conflicts.length) lastSynced.delete(name);
        else seedSyncSnapshot(name, value);
      }
      reportConflicts(data.conflicts, name);
      // Serveur joignable → draine opportunément tout backlog en attente (self-guard si vide).
      if (syncQueueLength() > 0) void flushSyncQueue();
    }
    return res.ok;
  } catch {
    enqueueSync(name, value);
    return false;
  }
}

// Phase 4 (T4.3) — mutations par intention pour `members` (POST/PATCH/DELETE, validées
// Zod côté serveur), en complément du apiPut whole-array ci-dessus qui reste le repli
// hors-ligne (via save()/enqueueSync, INCHANGÉ). Ces trois fonctions sont un push immédiat
// best-effort : elles ne bloquent rien côté UI (l'état local a déjà changé via setMembers),
// et n'alimentent PAS la file de rattrapage elles-mêmes en cas d'échec — le useEffect qui
// persiste `members` déclenche de toute façon, ~1,5s plus tard, le PUT whole-array habituel
// (voir src/data/index.ts save()), qui lui gère déjà retry/file offline. Doublon inoffensif :
// le serveur voit alors un état déjà identique au sien (canonical égal) → no-op.
// null = serveur injoignable (repli offline, pas d'erreur à afficher) ; { ok, error? } sinon —
// error porte le message Zod (ex. "email requis", "un compte existe déjà") pour affichage.
export async function apiCreateMember(member: unknown): Promise<{ ok: boolean; error?: string } | null> {
  if (!isAuthed()) return null;
  try {
    const res = await fetch(`${API_BASE}/members`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(member),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error };
  } catch {
    return null;
  }
}

export async function apiPatchMember(member: { id: string }): Promise<boolean> {
  if (!isAuthed()) return false;
  try {
    const res = await fetch(`${API_BASE}/members/${encodeURIComponent(member.id)}`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(member),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiDeleteMember(id: string): Promise<boolean> {
  if (!isAuthed()) return false;
  try {
    const res = await fetch(`${API_BASE}/members/${encodeURIComponent(id)}`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Flat (non-discriminated-union) shape on purpose: this project's tsconfig
// doesn't set `strict`, and without strictNullChecks TS fails to narrow a
// `{ok:true;...} | {ok:false; reason...}` union at call sites — `member`/
// `reason` being simply optional on one interface sidesteps that entirely.
// `reason` distinguishes "backend reachable but rejected the password"
// ('invalid' — must NOT fall back to the offline mock login) from "backend
// unreachable" ('network' — safe to fall back, see AuthView.tsx).
export interface LoginResult {
  ok: boolean;
  token?: string;
  member?: any;
  reason?: 'invalid' | 'network';
}

export async function apiLogin(phone: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      // Phase 6 (T6.1) : sans credentials:'include', le navigateur ignore le Set-Cookie
      // renvoyé par /auth/login — le cookie de session ne serait JAMAIS posé. Indispensable
      // ici (contrairement aux autres fetch, où c'est de la préparation cross-origin T6.3).
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: phone, password }),
    });
    if (!res.ok) return { ok: false, reason: 'invalid' };
    const data = await res.json();
    setAuthToken(data.token);
    return { ok: true, token: data.token, member: data.member };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// --- Activation / réinitialisation / changement de mot de passe (phase 5) ---
// Même style offline-safe : null = backend injoignable (l'UI garde son message démo).

async function postJson(path: string, body: unknown, token?: string | null): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include', // Phase 6 (T6.1)
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  } catch {
    return null;
  }
}

export const apiRequestActivation = (identifier: string) => postJson('/auth/request-activation', { identifier });
export const apiRequestReset = (identifier: string) => postJson('/auth/request-reset', { identifier });

// --- Auto-inscription publique ("Créer mon compte") ---
// Liste des départements pour le sélecteur du formulaire — endpoint public (pas de session).
// id + nom uniquement : le serveur ne renvoie volontairement rien d'autre à un visiteur non
// authentifié (ni branche ni fonction spéciale — structure interne de l'organisation).
export async function apiPublicDepartments(): Promise<{ id: string; name: string }[] | null> {
  try {
    const res = await fetch(`${API_BASE}/public/departments`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export interface RegisterInput {
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  gender: 'H' | 'F';
  birthDate: string;
  maritalStatus: 'Célibataire' | 'Marié(e)' | 'Divorcé(e)' | 'Veuf(ve)';
  profession: string;
  // Pas de 'global' : valeur transverse de périmètre, jamais une branche d'appartenance.
  branch: 'church' | 'light';
  departmentId: string;
  commune: string;
}

// null = serveur injoignable ; { status, error? } sinon (201 = demande envoyée).
export async function apiRegister(input: RegisterInput): Promise<{ status: number; error?: string } | null> {
  return postJson('/auth/register', input);
}

// Consomme le token d'activation/réinit et connecte directement le membre.
export async function apiComplete(token: string, password: string): Promise<LoginResult> {
  const data = await postJson('/auth/complete', { token, password });
  if (!data) return { ok: false, reason: 'network' };
  if (data.status !== 200 || !data.token) return { ok: false, reason: 'invalid' };
  setAuthToken(data.token);
  return { ok: true, token: data.token, member: data.member };
}

export async function apiChangePassword(current: string, next: string): Promise<{ ok: boolean; error?: string } | null> {
  const data = await postJson('/auth/change-password', { current, next }, getAuthToken());
  if (!data) return null; // backend injoignable
  if (data.status !== 200) return { ok: false, error: data.error };
  // Le serveur ré-émet un token (pv à jour) : sans ça, l'ancien token — désormais révoqué —
  // ferait échouer la requête suivante. On le stocke pour garder la session courante.
  if (typeof data.token === 'string') setAuthToken(data.token);
  return { ok: true };
}
