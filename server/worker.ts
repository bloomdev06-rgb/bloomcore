// Process worker dédié (Phase 3, T3.1) — exécute UNIQUEMENT le scheduler (alertes
// temporelles + drain de l'outbox email/SMS/push, voir scheduler.ts). Aucun serveur
// HTTP ici : sépare la charge "cron" de la charge "API" pour scaler l'API indépendamment
// (plusieurs replicas API sans dupliquer les sweeps) — voir docker-compose.yml (service
// worker) et RUN_SCHEDULER=false sur le service api pour éviter le double sweep.
//
// Le worker a besoin du même abonnement pub/sub que l'API pour que poke() (déclenché par
// runSweep() côté worker) atteigne les clients SSE connectés aux instances API — voir
// stream.ts (T2.4). Sans REDIS_URL, initPokeSubscriber() est un no-op : dans ce cas le
// worker ne doit PAS être utilisé (ses poke() ne seraient reçus par personne), il faut
// laisser RUN_SCHEDULER activé sur l'API (défaut mono-service, inchangé).
import { initPokeSubscriber } from './stream.ts';
import { startScheduler } from './scheduler.ts';

if (!process.env.REDIS_URL) {
  console.warn('[worker] REDIS_URL absent — les poke() de ce worker ne seront reçus par aucune instance API. Ce mode ne doit être utilisé que si REDIS_URL est configuré.');
}

await initPokeSubscriber().catch((e) => console.error('[stream] initPokeSubscriber a échoué:', e.message));
startScheduler();
console.log('[worker] scheduler démarré (process dédié)');
