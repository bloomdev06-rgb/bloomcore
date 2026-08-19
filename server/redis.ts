// Client Redis partagé — porte d'accès UNIQUE (aucun autre module ne doit appeler
// createClient()). REDIS_URL absent → getRedis() renvoie null : chaque consommateur
// (rateLimit.ts, auth.ts, stream.ts) DOIT avoir un repli en mémoire équivalent, pour
// que le dev local et les tests tournent sans serveur Redis (comportement identique
// à avant la Phase 2). Provisionné dans docker-compose.yml (service redis, requirepass).
// ponytail: fixé sur redis@4 (pas la v6 la plus récente) — les types génériques de la
// v6 (RespVersions/TypeMapping) ne s'unifient pas avec ReturnType<typeof createClient>
// utilisé comme alias de type ici ; v4 est stable et suffisante pour cet usage.
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;

export async function getRedis(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;
  if (!connecting) {
    connecting = (async () => {
      const c = createClient({ url });
      // Ne fait jamais planter le process : une erreur réseau Redis dégrade vers
      // les replis en mémoire des consommateurs, elle ne doit jamais être fatale.
      c.on('error', (e) => console.error('[redis] erreur connexion:', e.message));
      await c.connect();
      client = c;
      return c;
    })();
  }
  return connecting;
}

// Toujours préfixer TOUTE clé écrite par BloomCore dans Redis avec ce préfixe —
// évite les collisions si le même Redis est un jour partagé avec un autre service.
export const REDIS_KEY_PREFIX = 'bc:';

// null = Redis non configuré (REDIS_URL absent, distinct d'une panne) ; false = configuré
// mais injoignable ; true = opérationnel. Utilisé par GET /api/v1/health (T2.5).
export async function redisHealthy(): Promise<boolean | null> {
  if (!process.env.REDIS_URL) return null;
  try {
    const c = await getRedis();
    if (!c) return null;
    return (await c.ping()) === 'PONG';
  } catch {
    return false;
  }
}
