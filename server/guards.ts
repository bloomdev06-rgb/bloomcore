// Garde-fous d'écriture — le "journal inviolable" et le soft-delete du cahier
// des charges, appliqués côté serveur sans changer le contrat frontend
// (PUT whole-array). Appelé par PUT /:name et POST /sync/batch.
import { getCollection, appendToCollection, mergeCollection } from './db.ts';

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
export function applyWrite(
  name: string,
  incoming: any[],
  asOf?: string,
  // Ids stockés HORS de la portée de lecture de l'opérateur : absents du payload non pas
  // parce qu'il les supprime, mais parce qu'un client scopé ne les a jamais reçus. On les
  // PRÉSERVE (pas de tombstone-by-omission). Vide (défaut) = comportement whole-array LWW.
  preserve: Set<string> = new Set(),
): { added: any[]; changed: any[]; conflicts: string[] } {
  const stored = getCollection(name);
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
    appendToCollection(name, added);
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

  mergeCollection(name, toWrite);

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
export function readCollection(name: string, includeDeleted = false): any[] {
  const items = getCollection(name);
  if (name === 'audits' || includeDeleted) return items;
  return items.filter((it) => !it.deletedAt);
}
