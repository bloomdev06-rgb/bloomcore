// Single source of truth for all app data + persistence.
// ponytail: localStorage-backed today. When the backend lands, swap the bodies
// below for API calls — only this file changes, the screens stay untouched.
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
} from '../mockData';

// --- Persistence helpers (used by App for the mutable collections) ---
export function load<T>(key: string, seed: T): T {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : seed;
}

export function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Seeds for the App-owned mutable collections.
export const seeds = {
  members: INITIAL_MEMBERS,
  events: INITIAL_EVENTS,
  reports: INITIAL_REPORTS,
  audits: INITIAL_AUDITS,
  notifications: INITIAL_NOTIFICATIONS,
  permissions: DEFAULT_PERMISSION_MATRIX,
};

// --- Static reference collections, read via hooks so call sites never change ---
// ponytail: each returns its seed today. When backend lands, add fetch+state
// inside the hook (return [] while loading) — consuming screens stay as-is.
export const useMinistries = () => INITIAL_MINISTRIES;
export const useDepartments = () => INITIAL_DEPARTMENTS;
export const useProjects = () => INITIAL_PROJECTS;
export const useBusLines = () => INITIAL_BUS_LINES;
export const activitiesSeed = INITIAL_ACTIVITIES;
