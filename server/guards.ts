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
// Exporté : rbac.ts s'en sert pour ne scoper que les items réellement touchés.
export function canonical(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

// Applique le payload entrant à la collection en respectant les invariants :
// - audits : append-only. Toute entrée stockée doit revenir identique → sinon 409.
// - notifications : remplacement libre (dismiss/lu sont des mutations légitimes).
// - le reste : soft-delete — les ids absents du payload sont réinjectés en
//   tombstone {deletedAt}, jamais supprimés physiquement.
// Retourne les nouveaux items (utile aux hooks notif/enrôlement des phases 4-5).
export function applyWrite(name: string, incoming: any[]): { added: any[]; changed: any[] } {
  const stored = getCollection(name);
  const incomingById = new Map(incoming.map((it) => [String(it.id), it]));

  if (name === 'audits') {
    for (const old of stored) {
      const match = incomingById.get(String(old.id));
      if (!match || canonical(match) !== canonical(old)) {
        throw new GuardError(409, 'audits: journal append-only — les entrées existantes sont immuables');
      }
    }
    const storedIds = new Set(stored.map((it) => String(it.id)));
    const added = incoming.filter((it) => !storedIds.has(String(it.id)));
    appendToCollection(name, added);
    return { added, changed: [] };
  }

  const storedIds = new Set(stored.map((it) => String(it.id)));
  const added = incoming.filter((it) => !storedIds.has(String(it.id)));
  const changed = incoming.filter((it) => {
    const old = stored.find((s) => String(s.id) === String(it.id));
    return old && canonical(old) !== canonical(it);
  });

  if (name === 'notifications') {
    // ponytail: remplacement libre mais via merge + tombstone quand même — un
    // dismiss devient un tombstone, invisible en lecture, pas une perte de ligne.
    const now = new Date().toISOString();
    const tombstones = stored
      .filter((s) => !incomingById.has(String(s.id)) && !s.deletedAt)
      .map((s) => ({ ...s, deletedAt: now }));
    mergeCollection(name, [...incoming, ...tombstones]);
    return { added, changed };
  }

  // Soft-delete générique : id stocké absent du payload → tombstone.
  // ponytail: LWW — un client hors-ligne périmé peut ressusciter un tombstone
  // en re-poussant l'ancien item ; versions par item si ça mord un jour.
  const now = new Date().toISOString();
  const tombstones = stored
    .filter((s) => !incomingById.has(String(s.id)) && !s.deletedAt)
    .map((s) => ({ ...s, deletedAt: now }));
  mergeCollection(name, [...incoming, ...tombstones]);
  return { added, changed };
}

// Lecture filtrée : les tombstones sont invisibles par défaut (sauf audits,
// append-only donc jamais tombstonés, et sauf includeDeleted pour la corbeille).
export function readCollection(name: string, includeDeleted = false): any[] {
  const items = getCollection(name);
  if (name === 'audits' || includeDeleted) return items;
  return items.filter((it) => !it.deletedAt);
}
