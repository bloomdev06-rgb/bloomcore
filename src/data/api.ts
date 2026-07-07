// Thin client for the BloomCore API (server/index.ts). Every call swallows
// network errors and resolves null/false — offline-first, matching
// ARCHITECTURE_TECHNIQUE.md §7's "PWA offline-first, localStorage cache"
// intent: the app must keep working unmodified when the backend isn't running.
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4000/api/v1';
const AUTH_TOKEN_KEY = 'bc_authToken';

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function apiBootstrap(): Promise<Record<string, unknown> | null> {
  try {
    // Lecture auth-gated côté serveur : Bearer si connecté ; pré-login le 401
    // résout null → fallback localStorage (App.tsx re-bootstrap après login).
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/bootstrap`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    void flushSyncQueue(); // serveur joignable → rejouer les écritures en file
    return await res.json();
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

type QueuedOp = { opId: string; name: string; value: unknown };

function enqueueSync(name: string, value: unknown): void {
  try {
    const queue: QueuedOp[] = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '[]');
    const next = queue.filter((op) => op.name !== name);
    next.push({ opId: crypto.randomUUID(), name, value });
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // localStorage plein/indisponible — tant pis, LWW au prochain save.
  }
}

export async function flushSyncQueue(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  let queue: QueuedOp[] = [];
  try {
    queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '[]');
  } catch {
    return;
  }
  if (queue.length === 0) return;
  try {
    const res = await fetch(`${API_BASE}/sync/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ops: queue }),
    });
    if (!res.ok) return;
    const { applied, skipped } = await res.json();
    const done = new Set([...(applied ?? []), ...(skipped ?? [])]);
    const rest = queue.filter((op) => !done.has(op.opId));
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(rest));
  } catch {
    // toujours hors-ligne — on réessaiera au prochain flush.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushSyncQueue());
}

// Fire-and-forget push of a whole collection/kv value. Requires a token
// (mutations are auth-gated server-side) — silently a no-op before login.
// Échec réseau → file de rattrapage (voir flushSyncQueue).
export async function apiPut(name: string, value: unknown): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(value),
    });
    // 401 (token expiré → réussira après re-login) et 5xx (transitoire) → file de rattrapage.
    // 400/403 (rejet permanent : requête invalide ou refus RBAC) NE sont PAS rejoués — les
    // mettre en file les ferait boucler à chaque flush (B5, sans le poison-pill de la file).
    if (!res.ok && (res.status === 401 || res.status >= 500)) enqueueSync(name, value);
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
  return data.status === 200 ? { ok: true } : { ok: false, error: data.error };
}
