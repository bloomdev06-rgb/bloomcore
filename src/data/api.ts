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

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// /uploads est désormais authentifié (voir server/index.ts). Les <img> ne portent pas
// de header → on fait voyager le token en query. dataURL/URL externe : inchangé.
export function photoSrc(url?: string): string | undefined {
  if (!url || !url.startsWith('/uploads/')) return url;
  const token = getAuthToken();
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export async function apiBootstrap(): Promise<Record<string, unknown> | null> {
  // Lecture auth-gated côté serveur : sans token, le serveur répondrait 401 à
  // coup sûr — inutile de faire l'aller-retour réseau (et le bruit console qui
  // va avec). App.tsx re-bootstrap de toute façon après login (deps [loggedInMemberId]).
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
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
  const token = getAuthToken();
  if (!token) return; // pas d'auth → rien à envoyer ; l'indicateur reste statique (« En attente »)
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/${name}`, { headers: { Authorization: `Bearer ${token}` } });
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
  const token = getAuthToken();
  if (!token) return () => {};
  const es = new EventSource(`${API_BASE}/stream?token=${encodeURIComponent(token)}`);
  es.addEventListener('notifications', () => onPoke());
  return () => es.close();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushSyncQueue());
}

// Téléverse une photo (dataURL) → URL de fichier servie par l'API (/uploads/<hash>).
// null si hors-ligne/serveur absent : l'appelant garde le dataURL (offline-first),
// la migration au boot serveur convertira au prochain sync.
export async function apiUpload(dataUrl: string): Promise<string | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: dataUrl }),
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

// Fire-and-forget push of a whole collection/kv value. Requires a token
// (mutations are auth-gated server-side) — silently a no-op before login.
// Échec réseau → file de rattrapage (voir flushSyncQueue).
export async function apiPut(name: string, value: unknown): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;
  // Delta quand un snapshot existe : on n'envoie que les items changés/supprimés. Sinon
  // (KV, ou pas de base) → valeur complète. La file offline garde TOUJOURS le whole-array.
  const delta = Array.isArray(value) ? computeDelta(name, value) : null;
  if (delta && delta.upserts.length === 0 && delta.deletes.length === 0) return true; // rien à pousser
  try {
    const asOf = getSyncedAt(name);
    const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
    const res = await fetch(`${API_BASE}/${name}${qs}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: phone, password }),
    });
    if (!res.ok) return { ok: false, reason: 'invalid' };
    const data = await res.json();
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
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

// Consomme le token d'activation/réinit et connecte directement le membre.
export async function apiComplete(token: string, password: string): Promise<LoginResult> {
  const data = await postJson('/auth/complete', { token, password });
  if (!data) return { ok: false, reason: 'network' };
  if (data.status !== 200 || !data.token) return { ok: false, reason: 'invalid' };
  localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  return { ok: true, token: data.token, member: data.member };
}

export async function apiChangePassword(current: string, next: string): Promise<{ ok: boolean; error?: string } | null> {
  const data = await postJson('/auth/change-password', { current, next }, getAuthToken());
  if (!data) return null; // backend injoignable
  if (data.status !== 200) return { ok: false, error: data.error };
  // Le serveur ré-émet un token (pv à jour) : sans ça, l'ancien token — désormais révoqué —
  // ferait échouer la requête suivante. On le stocke pour garder la session courante.
  if (typeof data.token === 'string') localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  return { ok: true };
}
