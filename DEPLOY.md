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
