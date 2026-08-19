# backend/

Dockerfiles de l'API (`Dockerfile`) et du worker/scheduler (`Dockerfile.worker`) — même
code (`server/`, `packages/`), commande de démarrage différente.

Le code source lui-même (`server/`) reste à la racine du repo, pas ici — ces Dockerfiles
attendent un **contexte de build = racine du repo** (pas ce dossier), pour pouvoir copier
`server/`, `packages/` et `src/mockData.ts` (import runtime documenté dans
`server/seedData.ts`).

Guide de déploiement complet : [`../infra/DEPLOY-DOKPLOY.md`](../infra/DEPLOY-DOKPLOY.md).
