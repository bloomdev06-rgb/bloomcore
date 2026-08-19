# frontend/

Dockerfile + config nginx pour déployer le frontend Vite comme conteneur indépendant.

Le code source (`src/`) reste à la racine du repo, pas ici — ce Dockerfile attend un
**contexte de build = racine du repo** (pas ce dossier), pour pouvoir lancer `npm run
build` avec tout le projet.

Ne parle à l'API qu'en HTTP public (`VITE_API_BASE` au build) — aucune dépendance réseau
interne à Postgres/Redis, donc sûr à déployer comme Application Dokploy totalement
indépendante.

Guide de déploiement complet : [`../infra/DEPLOY-DOKPLOY.md`](../infra/DEPLOY-DOKPLOY.md).
