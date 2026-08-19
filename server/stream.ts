// Hub SSE — push serveur→client pour rafraîchir la cloche / alertes d'intégration
// en direct (ARCHITECTURE_TECHNIQUE.md §7 « temps réel »).
// ponytail: SSE natif plutôt que Socket.io — le besoin est unidirectionnel
// (server→client), donc zéro dépendance, reconnexion navigateur intégrée
// (EventSource), passe les proxys en HTTP/1.1. Le bidirectionnel (client→serveur)
// passe déjà par REST/sync. Passer à Socket.io le jour où un vrai canal montant existe.
//
// Phase 2 (T2.4) : le Set<Response> ci-dessous est PAR PROCESS — un client SSE connecté
// à l'instance A ne recevait jamais les poke() émis par l'instance B ou par le worker
// (Phase 3). Avec REDIS_URL défini, poke() publie sur un canal Redis au lieu d'écrire
// localement ; chaque instance (dont l'émettrice elle-même) s'abonne au boot et relaie
// aux clients SSE qui lui sont connectés. Sans Redis : diffusion locale directe, strictement
// identique au comportement d'avant cette phase.
import type { Response } from 'express';
import { getRedis, REDIS_KEY_PREFIX } from './redis.ts';

const clients = new Set<Response>();
const POKE_CHANNEL = `${REDIS_KEY_PREFIX}poke`;
let subscribed = false;

export function addClient(res: Response): void {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

// Poke SANS données : le client re-fetch ses notifs (déjà filtrées RBAC côté
// serveur) → un broadcast ne fuite rien. No-op si aucun client connecté.
function broadcastLocal(event: string): void {
  for (const res of clients) {
    try {
      res.write(`event: ${event}\ndata: 1\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

export function poke(event = 'notifications'): void {
  getRedis()
    .then((c) => {
      if (!c) return broadcastLocal(event);
      return c.publish(POKE_CHANNEL, event).then(() => {});
    })
    .catch(() => broadcastLocal(event));
}

// À appeler une fois au boot (index.ts ET worker.ts, Phase 3) quand REDIS_URL est défini.
// Client DÉDIÉ (duplicate()) : un client Redis en mode SUBSCRIBE ne peut plus exécuter
// d'autres commandes — impossible de réutiliser le client partagé de redis.ts.
export async function initPokeSubscriber(): Promise<void> {
  if (subscribed || !process.env.REDIS_URL) return;
  const base = await getRedis();
  if (!base) return;
  const sub = base.duplicate();
  sub.on('error', (e: Error) => console.error('[stream] erreur abonné Redis:', e.message));
  await sub.connect();
  await sub.subscribe(POKE_CHANNEL, (message: string) => broadcastLocal(message));
  subscribed = true;
}

export function clientCount(): number {
  return clients.size;
}
