# Déploiement Dokploy — architecture éclatée (un conteneur isolé par élément)

Ce document explique comment déployer chaque élément de BloomCore comme une ressource
Dokploy **indépendante** (redéploiement, logs, statut séparés), plutôt que comme un seul
`docker compose up` regroupant tout (qui reste disponible en repli, voir tout en bas).

## Ce que couvre chaque dossier

| Dossier/fichier | Contenu | Type de ressource Dokploy |
|---|---|---|
| `backend/Dockerfile` | API (server/index.ts) | Application (build depuis Dockerfile) |
| `backend/Dockerfile.worker` | Scheduler dédié (server/worker.ts) | Application (build depuis Dockerfile) |
| `frontend/Dockerfile` | Frontend Vite, servi par nginx | Application (build depuis Dockerfile) |
| `infra/Dockerfile.backup` | Sauvegarde Postgres (+ copie R2 optionnelle) | Application (build depuis Dockerfile) |
| — | Postgres | **Ressource Database native Dokploy** (pas de Dockerfile) |
| — | Redis | **Ressource Database native Dokploy** (pas de Dockerfile) |
| — | Uptime Kuma | Application depuis une image Docker (`louislam/uptime-kuma:1`) |

## Pourquoi Postgres/Redis en ressources natives, pas en conteneurs "faits main"

Vérifié dans la doc Dokploy avant de se lancer : une Application Dokploy autonome et un
service défini dans un `docker-compose.yml` **ne partagent pas le même réseau par défaut**
(un ticket GitHub Dokploy encore ouvert le confirme — la connexion demande un bricolage
réseau non garanti). En revanche, les ressources **Database natives** de Dokploy exposent
des "Internal Credentials" (host + port internes) explicitement prévues pour être
consommées par des Applications du même projet. C'est donc la voie la plus fiable pour que
l'API/le worker/le backup atteignent Postgres et Redis dans cette architecture éclatée —
et ça te donne exactement l'isolation "un conteneur Postgres à part, un conteneur Redis à
part" que tu voulais, avec en prime une UI dédiée par ressource dans Dokploy.

Le frontend, lui, ne parle JAMAIS à Postgres/Redis directement (uniquement à l'API, en HTTP
public via son URL) — c'est pourquoi il est sûr de le sortir en Application indépendante
sans aucun souci réseau.

**Non vérifié en conditions réelles** (pas de démon Docker ni d'accès à ton instance Dokploy
depuis ce sandbox) : le comportement exact du réseau interne Applications↔Databases sur TA
version de Dokploy. À valider au premier déploiement (voir la checklist en bas de page).

## Étapes de mise en place

### 1. Créer un Projet Dokploy dédié
Regrouper tous les éléments ci-dessous dans le MÊME projet Dokploy (nécessaire pour le
partage réseau interne décrit plus haut).

### 2. Ressource Database → Postgres
Créer, choisir un mot de passe fort. Une fois créée, noter dans son onglet "Connection" :
l'**Internal Host** et le port internes (utilisés ci-dessous dans `DATABASE_URL`).

### 3. Ressource Database → Redis
Idem : créer, mot de passe fort, noter l'Internal Host/port.

### 4. Application "backend" (API)
- Source : ce repo, branche à déployer.
- Docker Context Path : `.` (racine — nécessaire pour copier `server/`, `packages/`, `src/mockData.ts`).
- Dockerfile Path : `backend/Dockerfile`.
- Watch Paths (rebuild uniquement sur ces changements) : `server/**`, `packages/**`,
  `prisma/**`, `src/mockData.ts`, `package.json`, `package-lock.json`.
- Variables d'environnement :
  - `AUTH_SECRET` (obligatoire, ≥16 car. aléatoires)
  - `ACADEMY_WEBHOOK_SECRET`
  - `CORS_ORIGINS` = domaine public du frontend (étape 6)
  - `APP_URL` = domaine public du frontend (pas celui de l'API — sert dans les emails/liens)
  - `DATABASE_URL` = `postgresql://postgres:<mot de passe>@<Internal Host Postgres>:<port>/bloomcore?schema=public`
  - `REDIS_URL` = `redis://:<mot de passe>@<Internal Host Redis>:<port>`
  - `SEED_DEMO_PASSWORD` = vide en vraie prod
  - `RUN_SCHEDULER` = `false` (le worker, étape 5, s'en charge)
  - `SMTP_*` / `TWILIO_*` si configurés
  - `S3_*` si MinIO/S3 utilisé pour les photos
- Port : 4000. Domaine public (ex. `api.tondomaine.com`).

### 5. Application "worker"
- Même repo/branche, mêmes Watch Paths que le backend.
- Dockerfile Path : `backend/Dockerfile.worker`.
- Mêmes `DATABASE_URL` / `REDIS_URL` / `AUTH_SECRET` que le backend. `RUN_SCHEDULER` sans
  effet ici (le worker gère toujours le scheduler, code séparé).
- Pas de domaine public (aucun serveur HTTP dans ce conteneur).

### 6. Application "frontend"
- Dockerfile Path : `frontend/Dockerfile`.
- Watch Paths : `src/**`, `public/**`, `index.html`, `vite.config.*`, `package.json`.
- Build arg `VITE_API_BASE` = URL publique de l'API + `/api/v1` (ex.
  `https://api.tondomaine.com/api/v1`) — **obligatoire** ici puisque front et API ne sont
  plus same-origin.
- Port : 80. Domaine public (ex. `app.tondomaine.com`).

### 7. Application "backup"
- Dockerfile Path : `infra/Dockerfile.backup`.
- Variables : `BACKUP_DB_HOST` = Internal Host Postgres, `PGPASSWORD` = mot de passe
  Postgres, `BACKUP_RETENTION_DAYS`, et les 4 `R2_*` si la copie hors-site R2 est activée
  (voir `.env.example` pour le détail des 4 variables).
- **Volume persistant obligatoire sur `/backups`** — sans lui, les dumps disparaissent à
  chaque redéploiement.
- Pas de domaine public, pas de Watch Path (aucun code applicatif — redéployer
  manuellement seulement si `scripts/backup-postgres.sh` change).
- Restauration : voir `scripts/restore-postgres.sh` pour le mode tout-en-un ; en
  architecture éclatée, ouvrir un terminal sur le conteneur `backup` depuis Dokploy et
  lancer `gunzip -c /backups/<fichier> | psql -h <Internal Host Postgres> -U postgres -d bloomcore`
  (arrêter l'Application backend/worker avant, pour éviter des écritures concurrentes).

### 8. Application "monitoring" (Uptime Kuma)
- Source : Image Docker `louislam/uptime-kuma:1` (pas un build depuis ce repo).
- Volume persistant sur `/app/data`.
- Domaine public (ex. `status.tondomaine.com`). Première connexion → créer le compte admin
  immédiatement.
- Ajouter un moniteur HTTP(s) vers `https://api.tondomaine.com/api/v1/health`.

## Checklist à valider au premier déploiement (rien de tout ceci n'est vérifiable depuis ce sandbox)

- Chaque Application démarre et reste "healthy" dans Dokploy (pas de crash-loop).
- `/api/v1/health` répond `{"ok":true,...,"redis":true}` — confirme que le backend atteint
  bien Redis via l'Internal Host.
- Login depuis le frontend déployé fonctionne (confirme CORS_ORIGINS + DATABASE_URL corrects).
- Le worker tourne (logs montrant les sweeps du scheduler) et une alerte qu'il génère arrive
  bien à un client connecté au flux SSE de l'API (confirme le pub/sub Redis partagé entre
  backend et worker, donc que les deux atteignent bien le MÊME Redis).
- Le conteneur `backup` produit un premier dump (`ls /backups` depuis un terminal Dokploy)
  et, si R2 est configuré, les logs montrent "copié vers R2".

## Mode tout-en-un (repli, toujours disponible)

`docker-compose.yml` (+ overlays `docker-compose.minio.yml` / `docker-compose.frontend.yml`)
reste inchangé et fonctionnel : un seul `docker compose up -d --build` (ou une seule
ressource Dokploy "Compose") déploie tout (Postgres/Redis/API/worker/backup/Kuma en
conteneurs compose classiques). Plus simple à opérer, mais sans le redéploiement indépendant
par élément que l'architecture éclatée ci-dessus permet.
