# Déploiement BloomCore

App mono-service : le `Dockerfile` build le frontend (Vite) puis lance l'API Express (port
4000) qui sert aussi le frontend. Persistance = fichier SQLite sur un volume (`/data`).

Node ≥ 22.5 requis (`node:sqlite`) — l'image utilise `node:22-alpine`.

## Ce qui est DÉJÀ dans git (aucune saisie manuelle)
- Build, port `4000`, `HEALTHCHECK` → `Dockerfile`
- `NODE_ENV=production`, `BLOOMCORE_DB=/data/bloomcore.db` (bakés dans l'image)
- Service, volume persistant `/data`, port, healthcheck, déclaration des variables → `docker-compose.yml`

## Ce qui reste à fournir au déploiement (jamais dans git)
| Variable | Rôle | Obligatoire |
|---|---|---|
| `AUTH_SECRET` | signature des tokens de session | **oui** (≥16, refuse de démarrer sinon) |
| `ACADEMY_WEBHOOK_SECRET` | HMAC du webhook École Bloom | **oui** au boot (≥16) |
| `APP_URL` | URL publique (liens d'activation/reset) | recommandé |
| `SEED_DEMO_PASSWORD` | active les 18 profils de test | test seulement |
| `CORS_ORIGINS` | origines cross-origin | non (vide en mono-service) |

Générer un secret fort : `openssl rand -hex 32` (ou
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

> ⚠️ Ne jamais committer de secret. `.env` est gitignoré. Committer `AUTH_SECRET` permettrait
> de forger un token Super Admin.

## Déploiement sur Coolify (recommandé : mode Docker Compose)
1. Ressource → **Build Pack : Docker Compose** → `docker-compose.yml` du repo, branche `main`.
   Coolify dérive alors service / port `4000` / volume `/data` / healthcheck depuis git.
2. **Environment Variables** (une seule fois, persistent entre redeploys) :
   `AUTH_SECRET`, `ACADEMY_WEBHOOK_SECRET`, `APP_URL=https://<domaine>`, `SEED_DEMO_PASSWORD=bloom2026`.
3. **Domains** : `https://<domaine>` (Coolify gère le TLS).
4. **Deploy**.

Alternative build pack **Dockerfile** : idem, mais ajoute manuellement le **Persistent Storage**
sur `/data` et **Ports Exposes** `4000` (le mode Compose l'évite en les lisant depuis git).

## Vérification
```
curl https://<domaine>/api/v1/health      # → {"ok":true,...}
```
Puis login sur le domaine avec un profil de test : `+2250700000001` / `bloom2026` (Super Admin).

## Docker local (sans Coolify)
```
docker compose up -d --build      # nécessite AUTH_SECRET (+ ACADEMY_WEBHOOK_SECRET) dans un .env
curl http://localhost:4000/api/v1/health
```
Le `docker-compose.yml` embarque un service `db` (Postgres 16) et branche déjà
`DATABASE_URL` dessus → le test tourne en mode Postgres clé en main.

## M6 — PostgreSQL (Coolify)

Le backend de données est à double implémentation (`server/datastore.ts`) : **si
`DATABASE_URL` est défini → Postgres (Prisma), sinon → SQLite legacy** (mode
historique inchangé). Les données domaine (membres, événements, rapports…) vont
en Postgres ; les tables auxiliaires (`credentials`, `tokens`, `sync_ops`,
`webhook_events`, `outbox`) **restent en SQLite sur `/data`** pour l'instant
(follow-up documenté).

### Mise en place sur Coolify
1. **Ajouter une ressource PostgreSQL** dans le **même projet** que l'app.
   Activer les **Scheduled Backups**.
2. Copier l'**URL de connexion INTERNE** de cette ressource dans la variable
   d'environnement **`DATABASE_URL`** de l'app (secret). Format :
   `postgresql://<user>:<pass>@<service-interne>:5432/<db>?schema=public`.
3. **Deploy**.

### Ce qui se passe au premier boot (Postgres)
1. L'entrypoint lance `prisma migrate deploy` → crée le schéma (24 modèles) à
   partir de `prisma/migrations/` (committées).
2. Le serveur lance une **migration one-shot** `migrateFromSqlite` : il importe
   les données SQLite existantes du volume `/data` dans Postgres, en
   canonicalisant chaque item (M5 snake_case). **Idempotent**, gardée par le flag
   `_m6_migrated` (KV Postgres) → ne s'exécute qu'une fois. Si aucun SQLite
   n'existe sur `/data` (déploiement neuf), rien à migrer → `ensureSeeded` seed.
3. `ensureSeeded` complète ensuite ce qui manque.

> Sans `DATABASE_URL` : mode SQLite legacy, aucune de ces étapes ne tourne.
> Note : `credentials`/`tokens` restent en SQLite sur `/data` — garder le volume
> `/data` persistant même en mode Postgres.
