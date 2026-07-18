// Durable store for the growable collections (members, reports, events…).
// localStorage caps at ~5 MB/origin → à l'échelle (4000 membres) members+reports
// débordent et save() perd silencieusement l'écriture (QuotaExceededError avalé).
// IndexedDB n'a pas de quota pratique. On garde un miroir mémoire SYNCHRONE dans
// index.ts (load/save restent sync, zéro ripple) ; IDB est la couche durable async.
const DB_NAME = 'bloomcore';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// Lit toutes les clés au boot → objet { clé → JSON sérialisé } (mêmes valeurs que
// localStorage, la sérialisation ne change pas).
export async function idbLoadAll(): Promise<Record<string, string>> {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const out: Record<string, string> = {};
    const cursor = conn.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve(out);
      out[c.key as string] = c.value as string;
      c.continue();
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export async function idbSet(key: string, serialized: string): Promise<void> {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(serialized, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
