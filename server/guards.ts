// Garde-fous d'écriture — le "journal inviolable" et le soft-delete du cahier
// des charges, appliqués côté serveur sans changer le contrat frontend
// (PUT whole-array). Appelé par PUT /:name et POST /sync/batch.
import { getCollection, appendToCollection, mergeCollection } from './datastore.ts';
import { parseReportPayload } from '../packages/shared/schemas/report.ts';
import { canonicalize } from '../packages/shared/migrate.ts';

export class GuardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Stringify récursif à clés triées — l'aller-retour JSON côté client peut
// réordonner les clés, une comparaison textuelle naïve donnerait des faux 409.
// `updatedAt` exclu : c'est un horodatage serveur (jamais renvoyé au client),
// le comparer ferait apparaître tout item déjà écrit comme "modifié".
// Exporté : rbac.ts s'en sert pour ne scoper que les items réellement touchés.
export function canonical(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).filter((k) => k !== 'updatedAt').sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

// Applique le payload entrant à la collection en respectant les invariants :
// - audits : append-only. Toute entrée stockée doit revenir identique → sinon 409.
// - le reste (notifications incluses — un dismiss est un tombstone comme un autre) :
//   soft-delete + versionnage par item. Chaque item écrit reçoit un `updatedAt`
//   serveur ; si `asOf` (dernier instant où CE client a lu la collection) est
//   antérieur au `updatedAt` stocké d'un item, ce client raisonne sur une copie
//   périmée de cet item précis — son écriture (édition ou suppression implicite
//   par absence) est ignorée plutôt que d'écraser une version plus récente ou de
//   ressusciter un tombstone. Signalé au client via `conflicts` (ids rejetés) ;
//   `asOf` omis (appels internes/tests) = comportement LWW historique inchangé.
// Retourne les nouveaux items (utile aux hooks notif/enrôlement des phases 4-5).
// Validation structurelle aux frontières de confiance (#12). Le store est un document-store
// (Report.content est volontairement `any`) : imposer un schéma par CHAMP casserait des features
// et serait à maintenir sans fin. On ne valide donc pas les noms de champs, on borne la STRUCTURE :
// un item doit être un objet plat avec un id string, sans clé de pollution de prototype, et sa
// taille/profondeur reste dans des limites qui laissent passer tout payload métier légitime
// (Member = 54 champs, `content` = scalaires à plat) mais rejettent l'abus — un client
// authentifié peut sinon PUT un blob de 100 Mo ou un objet profond de 10 000 niveaux droit dans
// SQLite. C'est le vrai vecteur de « champs arbitraires stockés verbatim » : la taille, pas le nom.
// ponytail: bornes (pas de whitelist par champ). Resserrer en schéma par collection seulement si
// le modèle se fige — voir le raisonnement ci-dessus avant de le faire.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_KEYS = 100;          // Member = 54 champs ; large marge
// Les avatars passent normalement par /uploads (member.avatarUrl = chemin court), MAIS le
// client hors-ligne retombe sur une dataURL base64 inline (image.ts) synchronisée telle
// quelle, et des membres legacy en gardent. Le plafond image de l'app est 2 Mo (/api/v1/uploads)
// → ~2,8 Mo en base64 : la borne doit le laisser passer. Le garde-fou réel du volume total
// reste express.json({ limit: '10mb' }) ; cette borne n'empêche qu'UN champ pathologique.
const MAX_STRING = 3_000_000; // ~2,86 Mo : couvre une photo base64 inline de 2 Mo (ceiling app)
const MAX_ARRAY = 5_000;      // aucun tableau interne d'item légitime n'approche ça
const MAX_DEPTH = 8;          // `content` est peu profond ; 8 = anti depth-bomb sans gêner le métier

// Borne la taille/profondeur d'une valeur JSON déjà désérialisée (donc pas de fonctions/cycles :
// JSON.parse ne peut en produire). Rejette au premier dépassement.
function assertBounded(name: string, v: any, depth: number): void {
  if (depth > MAX_DEPTH) throw new GuardError(400, `${name}: imbrication trop profonde`);
  if (typeof v === 'string') {
    if (v.length > MAX_STRING) throw new GuardError(400, `${name}: chaîne trop longue`);
    return;
  }
  if (Array.isArray(v)) {
    if (v.length > MAX_ARRAY) throw new GuardError(400, `${name}: tableau trop long`);
    for (const el of v) assertBounded(name, el, depth + 1);
    return;
  }
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length > MAX_KEYS) throw new GuardError(400, `${name}: trop de champs`);
    for (const k of keys) {
      if (DANGEROUS_KEYS.has(k)) throw new GuardError(400, `${name}: clé interdite « ${k} »`);
      assertBounded(name, v[k], depth + 1);
    }
  }
}

export function validateItems(name: string, incoming: any[]): void {
  if (!Array.isArray(incoming)) throw new GuardError(400, `${name}: tableau attendu`);
  for (const it of incoming) {
    if (it === null || typeof it !== 'object' || Array.isArray(it)) {
      throw new GuardError(400, `${name}: item non-objet`);
    }
    if (typeof it.id !== 'string' || !it.id) throw new GuardError(400, `${name}: id string requis`);
    assertBounded(name, it, 1); // clés dangereuses + bornes taille/profondeur, récursif
  }
}

export async function applyWrite(
  name: string,
  incoming: any[],
  asOf?: string,
  // Ids stockés HORS de la portée de lecture de l'opérateur : absents du payload non pas
  // parce qu'il les supprime, mais parce qu'un client scopé ne les a jamais reçus. On les
  // PRÉSERVE (pas de tombstone-by-omission). Vide (défaut) = comportement whole-array LWW.
  preserve: Set<string> = new Set(),
): Promise<{ added: any[]; changed: any[]; conflicts: string[] }> {
  validateItems(name, incoming); // frontière de confiance (#12) — avant toute écriture
  // M5 — normalise toute écriture vers les valeurs snake_case §3. Linchpin offline-first :
  // un vieux client envoyant d'anciennes valeurs les voit converties ici → jamais réintroduites.
  incoming = incoming.map((it) => canonicalize(name, it));
  const stored = await getCollection(name);
  const storedById = new Map(stored.map((s) => [String(s.id), s]));
  const incomingById = new Map(incoming.map((it) => [String(it.id), it]));

  if (name === 'audits') {
    for (const old of stored) {
      const match = incomingById.get(String(old.id));
      if (!match || canonical(match) !== canonical(old)) {
        throw new GuardError(409, 'audits: journal append-only — les entrées existantes sont immuables');
      }
    }
    const added = incoming.filter((it) => !storedById.has(String(it.id)));
    await appendToCollection(name, added);
    return { added, changed: [], conflicts: [] };
  }

  const now = new Date().toISOString();
  const conflicts: string[] = [];
  const toWrite: any[] = [];

  for (const it of incoming) {
    const old = storedById.get(String(it.id));
    if (old && asOf && old.updatedAt && old.updatedAt > asOf) {
      conflicts.push(String(it.id)); // le serveur a une version plus récente que ce que ce client a vue
      continue;
    }
    toWrite.push({ ...it, updatedAt: now });
  }

  // Soft-delete générique : id stocké absent du payload → tombstone — sauf si le
  // serveur a une version plus récente que `asOf` (le client ignore qu'elle existe),
  // ou si l'item est hors de la portée de lecture de l'opérateur (préservé, cf. `preserve`).
  for (const s of stored) {
    if (incomingById.has(String(s.id)) || s.deletedAt || preserve.has(String(s.id))) continue;
    if (asOf && s.updatedAt && s.updatedAt > asOf) {
      conflicts.push(String(s.id));
      continue;
    }
    toWrite.push({ ...s, deletedAt: now, updatedAt: now });
  }

  // M2 (archi-cible §4 « Validation : Zod ») — enforcement des payloads de rapport, mais
  // UNIQUEMENT sur les rapports nouveaux ou modifiés (et non en conflit) : un rapport legacy
  // renvoyé tel quel par la sync whole-array n'est jamais re-validé, donc rien ne casse. Un
  // rapport entrant invalide rejette tout le lot AVANT écriture (fail-loud : c'est un bug client).
  if (name === 'reports') {
    for (const it of incoming) {
      if (conflicts.includes(String(it.id))) continue; // ne sera pas écrit
      const old = storedById.get(String(it.id));
      if (old && canonical(old) === canonical(it)) continue; // inchangé → jamais re-validé
      const check = parseReportPayload(it.reportType, it.content);
      if (!check.ok) throw new GuardError(400, `reports[${it.id}] ${it.reportType} — ${check.error}`);
    }
  }

  await mergeCollection(name, toWrite);

  const added = incoming.filter((it) => !storedById.has(String(it.id)));
  const changed = incoming.filter((it) => {
    if (conflicts.includes(String(it.id))) return false;
    const old = storedById.get(String(it.id));
    return old && canonical(old) !== canonical(it);
  });

  return { added, changed, conflicts };
}

// Lecture filtrée : les tombstones sont invisibles par défaut (sauf audits,
// append-only donc jamais tombstonés, et sauf includeDeleted pour la corbeille).
export async function readCollection(name: string, includeDeleted = false): Promise<any[]> {
  const items = await getCollection(name);
  if (name === 'audits' || includeDeleted) return items;
  return items.filter((it) => !it.deletedAt);
}
