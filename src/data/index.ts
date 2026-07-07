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
} from '../mockData';
export { deriveTimeBasedNotifications } from './notificationRules';
export { apiBootstrap, apiLogin, clearAuthToken } from './api';
export { canView, hasCapability } from './permissions';
import { apiPut } from './api';

// Collection/kv names the backend knows about (server/index.ts's
// ARRAY_COLLECTIONS ∪ KV_KEYS) — keys outside this set (bc_loggedInMemberId,
// bc_authToken, bc_syncQueue) are client-only and never pushed.
const SYNCED_NAMES = new Set([
  'members', 'events', 'reports', 'audits', 'notifications', 'permissions', 'settings', 'forms',
  'delegations', 'ministries', 'departments', 'certifications', 'admins', 'activities', 'integration_reports',
]);

// --- Persistence helpers (used by App for the mutable collections) ---
export function load<T>(key: string, seed: T): T {
  // JSON corrompu (écriture interrompue, quota, édition manuelle) → on retombe sur le
  // seed plutôt que de faire throw dans un initialiseur useState (écran blanc, C1).
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : seed;
  } catch {
    return seed;
  }
}

// Sync serveur désactivé tant que le bootstrap n'a pas résolu (B2) : sinon les effets de
// persistance qui tournent au montage poussent l'état local/seed AVANT d'avoir lu l'état
// serveur, écrasant en LWW des données plus fraîches. App appelle enableSync() après bootstrap.
let syncEnabled = false;
export function enableSync(): void { syncEnabled = true; }

export function save<T>(key: string, value: T): void {
  // QuotaExceededError (photos base64, logs qui grossissent) ne doit pas faire throw
  // dans un useEffect non gardé (crash en boucle, C2). L'écriture serveur suit quand même.
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[save] échec d'écriture localStorage "${key}" (quota ?)`, e);
  }
  const name = key.replace(/^bc_/, '');
  if (syncEnabled && SYNCED_NAMES.has(name)) void apiPut(name, value); // fire-and-forget, offline-safe
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
// projects/bus-lines : désormais éditables (ProjectsView / BloomBusView) → persistés en
// localStorage pour survivre au changement d'onglet (B4). Hors sync serveur pour l'instant.
export const useProjects = () => load('bc_projects', INITIAL_PROJECTS);
export const useBusLines = () => load('bc_bus_lines', INITIAL_BUS_LINES);
export const activitiesSeed = INITIAL_ACTIVITIES;
