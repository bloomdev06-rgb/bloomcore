// Anti-brute-force login (S5), déplacé de server/index.ts (Phase 2, T2.2). Politique
// INCHANGÉE : 5 échecs par clé (IP+identifiant) -> verrou 15 min. Avec REDIS_URL défini,
// le compteur est partagé entre process/instances et survit aux redéploiements (INCR +
// EXPIRE) ; sans Redis, repli sur la Map en mémoire d'origine (comportement identique
// à avant cette phase — dev local et tests inchangés).
import { getRedis, REDIS_KEY_PREFIX } from './redis.ts';

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_LOCK_SEC = LOGIN_LOCK_MS / 1000;

// --- Repli mémoire (identique à l'implémentation d'origine dans index.ts) ---
const memFails = new Map<string, { count: number; until: number }>();

function memLocked(key: string): boolean {
  const e = memFails.get(key);
  return !!e && e.count >= LOGIN_MAX_FAILS && Date.now() < e.until;
}
function memFail(key: string): void {
  const e = memFails.get(key) ?? { count: 0, until: 0 };
  e.count += 1;
  e.until = Date.now() + LOGIN_LOCK_MS;
  memFails.set(key, e);
}
function memClear(key: string): void {
  memFails.delete(key);
}

const redisKey = (key: string) => `${REDIS_KEY_PREFIX}lf:${key}`;

export function loginKey(ip: string | undefined, identifier: string): string {
  return `${ip ?? 'unknown'}|${String(identifier).toLowerCase()}`;
}

export async function isLocked(key: string): Promise<boolean> {
  const c = await getRedis().catch(() => null);
  if (!c) return memLocked(key);
  try {
    const count = await c.get(redisKey(key));
    return count !== null && Number(count) >= LOGIN_MAX_FAILS;
  } catch {
    // Redis configuré mais injoignable à cet instant : ne jamais bloquer le login
    // dessus — repli mémoire de CE process (dégradation douce, jamais de 500).
    return memLocked(key);
  }
}

export async function recordFail(key: string): Promise<void> {
  const c = await getRedis().catch(() => null);
  if (!c) return memFail(key);
  try {
    const n = await c.incr(redisKey(key));
    if (n === 1) await c.expire(redisKey(key), LOGIN_LOCK_SEC);
  } catch {
    memFail(key);
  }
}

export async function clearFails(key: string): Promise<void> {
  const c = await getRedis().catch(() => null);
  if (!c) return memClear(key);
  try {
    await c.del(redisKey(key));
  } catch {
    memClear(key);
  }
}
