// Single source of truth for all app data + persistence.
// Backend landed (server/): localStorage stays the synchronous, always-on
// source of truth for React's useState initializers (instant paint, works
// offline); the API is layered on top as a best-effort sync — see api.ts and
// App.tsx's bootstrap effect for the other half of this wiring.
import {
  INITIAL_MEMBERS,
  INITIAL_EVENTS,
  INITIAL_REPORTS,
  INITIAL_AUDITS,
  INITIAL_NOTIFICATIONS,
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_PROJECTS,
  INITIAL_MINISTRIES,
  INITIAL_DEPARTMENTS,
  INITIAL_BUS_LINES,
  INITIAL_ACTIVITIES,
  INITIAL_SETTINGS,
  INITIAL_FORMS,
  INITIAL_ADMINS,
} from '../mockData';
export { deriveTimeBasedNotifications } from './notificationRules';
export { apiBootstrap, apiLogin, clearAuthToken, apiPut } from './api';
export { canView, hasCapability } from './permissions';
import { apiPut } from './api';

// Collection/kv names the backend knows about (server/index.ts's
// ARRAY_COLLECTIONS ∪ KV_KEYS) — keys outside this set (bc_loggedInMemberId,
// bc_authToken, bc_syncQueue) are client-only and never pushed.
const SYNCED_NAMES = new Set([
  'members', 'events', 'reports', 'audits', 'notifications', 'permissions', 'settings', 'forms',
  'delegations', 'ministries', 'departments', 'certifications', 'admins', 'activities', 'integration_reports',
  'projects', 'bus_lines',
]);

// --- Persistence helpers (used by App for the mutable collections) ---
// Cache de parse (#13) : JSON.parse est le vrai coût de load() (getItem n'est qu'un accès
// mémoire). On mémoïse par clé TANT QUE la chaîne stockée est identique → on saute le parse
// ET on renvoie une référence STABLE entre rendus. Des références recréées à chaque render
// ont déjà provoqué des re-souscriptions en boucle (bug Rétention). Robuste à tout writer :
// on compare la chaîne brute, aucune invalidation à gérer. Résultats en lecture seule (aucun
// appelant ne les mute — vérifié).
const parseCache = new Map<string, { raw: string; value: unknown }>();

export function load<T>(key: string, seed: T): T {
  // JSON corrompu (écriture interrompue, quota, édition manuelle) → on retombe sur le
  // seed plutôt que de faire throw dans un initialiseur useState (écran blanc, C1).
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return seed;
    const hit = parseCache.get(key);
    if (hit && hit.raw === raw) return hit.value as T;
    const value = JSON.parse(raw) as T;
    parseCache.set(key, { raw, value });
    return value;
  } catch {
    return seed;
  }
}

// Sync serveur désactivé tant que le bootstrap n'a pas résolu (B2) : sinon les effets de
// persistance qui tournent au montage poussent l'état local/seed AVANT d'avoir lu l'état
// serveur, écrasant en LWW des données plus fraîches. App appelle enableSync() après bootstrap.
let syncEnabled = false;
export function enableSync(): void { syncEnabled = true; }

// Scale : un PUT whole-array par RAFALE de saisie, pas par frappe — debounce trailing
// de 1,5 s par collection. La valeur poussée au tir est relue du localStorage (la plus
// fraîche) ; une rafale de N modifications = 1 seul envoi réseau.
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function save<T>(key: string, value: T): void {
  // QuotaExceededError (photos base64, logs qui grossissent) ne doit pas faire throw
  // dans un useEffect non gardé (crash en boucle, C2). L'écriture serveur suit quand même.
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    // Amorce le cache de parse avec la valeur qu'on vient d'écrire → le render qui suit une
    // édition (edit → save → re-render → load) est un cache-hit à référence stable.
    parseCache.set(key, { raw: serialized, value });
  } catch (e) {
    console.error(`[save] échec d'écriture localStorage "${key}" (quota ?)`, e);
  }
  const name = key.replace(/^bc_/, '');
  if (syncEnabled && SYNCED_NAMES.has(name)) {
    clearTimeout(syncTimers.get(name));
    syncTimers.set(name, setTimeout(() => {
      syncTimers.delete(name);
      void apiPut(name, load(key, value)); // fire-and-forget, offline-safe (file de rattrapage)
    }, 1500));
  }
}

// Seeds for the App-owned mutable collections.
export const seeds = {
  members: INITIAL_MEMBERS,
  events: INITIAL_EVENTS,
  reports: INITIAL_REPORTS,
  audits: INITIAL_AUDITS,
  notifications: INITIAL_NOTIFICATIONS,
  permissions: DEFAULT_PERMISSION_MATRIX,
  settings: INITIAL_SETTINGS,
  forms: INITIAL_FORMS,
};

// --- Static reference collections, read via hooks so call sites never change ---
// ministries/departments lisent localStorage (alimenté par les vues éditrices et
// par le bootstrap serveur) pour que les consommateurs read-only voient les données
// synchronisées. ponytail: lecture à l'appel, pas de souscription — un écran ouvert
// pendant qu'un autre édite voit la mise à jour à son prochain montage, suffisant.
export const useMinistries = () => load('bc_ministries', INITIAL_MINISTRIES);
export const useDepartments = () => load('bc_departments', INITIAL_DEPARTMENTS);
// projects/bus-lines : éditables (ProjectsView / BloomBusView), persistés en localStorage
// ET synchronisés serveur (SYNCED_NAMES) → survivent au logout/purge et au multi-appareil.
export const useProjects = () => load('bc_projects', INITIAL_PROJECTS);
export const useBusLines = () => load('bc_bus_lines', INITIAL_BUS_LINES);
export const useAdmins = () => load('bc_admins', INITIAL_ADMINS);
export const activitiesSeed = INITIAL_ACTIVITIES;
