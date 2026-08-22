# Checklist de déploiement Dokploy — bloom-ministry.org

Valeurs concrètes pour ce déploiement précis. Complète `infra/DEPLOY-DOKPLOY.md` (qui
explique le *pourquoi* de chaque choix) — ce fichier-ci ne donne que le *quoi taper*.

## 0. Secrets à générer AVANT de commencer

Deux secrets sont **obligatoires** — l'API refuse de démarrer sans eux (`server/auth.ts`),
même `ACADEMY_WEBHOOK_SECRET` si tu n'utilises pas encore le webhook École Bloom. Génère-les
sur ta machine (jamais dans ce chat, pour qu'ils ne transitent nulle part d'autre) :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Lance-la **deux fois**, note les deux résultats séparément :
- `AUTH_SECRET` = premier résultat
- `ACADEMY_WEBHOOK_SECRET` = second résultat

Garde-les de côté (gestionnaire de mots de passe) — tu les recolleras dans plusieurs
Applications ci-dessous.

## 1. Domaines (DNS déjà fait)

| Domaine | Élément |
|---|---|
| `app.bloom-ministry.org` | frontend |
| `api.app.bloom-ministry.org` | backend (API) |
| `status.bloom-ministry.org` | monitoring (Uptime Kuma) |

## 2. Ressource Database → PostgreSQL

- Nom : `bloomcore-db`
- Version : 18 (Docker image : laisse le défaut `postgres:18` de Dokploy — Prisma ne pin
  aucune version, et le service `backup` utilise aussi `postgres:18-alpine` pour que `pg_dump`
  ne soit jamais plus ancien que le serveur qu'il sauvegarde)
- Mot de passe : génère-en un fort, note-le → `<PG_PASSWORD>`
- Une fois créée : note l'**Internal Host** et le **port** affichés dans son onglet
  Connection → `<PG_HOST>`, `<PG_PORT>` (généralement 5432)

## 3. Ressource Database → Redis

- Nom : `bloomcore-redis`
- Mot de passe : génère-en un fort, note-le → `<REDIS_PASSWORD>`
- Une fois créée : note l'**Internal Host**/port → `<REDIS_HOST>`, `<REDIS_PORT>`
  (généralement 6379)

## 4. Application "backend"

- Repo : `bloomdev06-rgb/bloomcore`, branche `separation-deploy`
- Docker Context Path : `.`
- Dockerfile Path : `backend/Dockerfile`
- Watch Paths : `server/**`, `packages/**`, `prisma/**`, `src/mockData.ts`,
  `package.json`, `package-lock.json`
- Port conteneur : `4000`
- Domaine : `api.app.bloom-ministry.org` (HTTPS activé, Dokploy génère le certificat)
- Volume persistant : `/data` (photos uploadées — voir note en bas de page si tu préfères
  du stockage S3/R2 pour ne pas avoir de volume à gérer ici)

Variables d'environnement :

| Variable | Valeur |
|---|---|
| `AUTH_SECRET` | *(le 1er secret généré à l'étape 0)* |
| `ACADEMY_WEBHOOK_SECRET` | *(le 2e secret généré à l'étape 0)* |
| `CORS_ORIGINS` | `https://app.bloom-ministry.org` |
| `APP_URL` | `https://app.bloom-ministry.org` |
| `DATABASE_URL` | `postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:<PG_PORT>/bloomcore?schema=public` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@<REDIS_HOST>:<REDIS_PORT>` |
| `SEED_DEMO_PASSWORD` | *(laisser VIDE — vraie prod, activation de compte obligatoire)* |
| `RUN_SCHEDULER` | `false` |
| `SMTP_*`, `TWILIO_*` | vides pour l'instant (voir note plus bas) |
| `S3_*` | vides sauf si tu actives le stockage photos sur R2/MinIO (voir note) |

## 5. Application "worker"

- Même repo/branche, mêmes Watch Paths que le backend.
- Dockerfile Path : `backend/Dockerfile.worker`
- **Pas de domaine public, pas de volume** (le worker ne touche pas aux photos ni au
  fichier SQLite legacy — en mode Postgres, tout passe par `DATABASE_URL`).

Variables d'environnement :

| Variable | Valeur |
|---|---|
| `AUTH_SECRET` | *(identique au backend)* |
| `DATABASE_URL` | *(identique au backend)* |
| `REDIS_URL` | *(identique au backend)* |

## 6. Application "frontend"

- Dockerfile Path : `frontend/Dockerfile`
- Watch Paths : `src/**`, `public/**`, `index.html`, `vite.config.*`, `package.json`
- Port conteneur : `80`
- Domaine : `app.bloom-ministry.org`

Build arg (pas une variable d'env classique — champ "Build Args" dans Dokploy) :

| Build arg | Valeur |
|---|---|
| `VITE_API_BASE` | `https://api.app.bloom-ministry.org/api/v1` |

## 7. Application "backup"

- Dockerfile Path : `infra/Dockerfile.backup`
- **Pas de domaine public.**
- **Volume persistant obligatoire sur `/backups`** — sinon les dumps disparaissent à
  chaque redéploiement.

Variables d'environnement :

| Variable | Valeur |
|---|---|
| `BACKUP_DB_HOST` | `<PG_HOST>` (Internal Host Postgres, étape 2) |
| `BACKUP_DB_PORT` | `<PG_PORT>` |
| `BACKUP_DB_USER` | `postgres` |
| `BACKUP_DB_NAME` | `bloomcore` |
| `PGPASSWORD` | `<PG_PASSWORD>` |
| `BACKUP_RETENTION_DAYS` | `14` |
| `R2_ACCOUNT_ID` | *(voir Cloudflare R2, décidé plus tôt)* |
| `R2_ACCESS_KEY_ID` | *(idem)* |
| `R2_SECRET_ACCESS_KEY` | *(idem)* |
| `R2_BUCKET` | *(idem)* |
| `R2_RETENTION_DAYS` | `90` |

## 8. Application "monitoring" (Uptime Kuma)

- Source : Image Docker `louislam/uptime-kuma:1` (pas un build depuis ce repo).
- Volume persistant sur `/app/data`.
- Domaine : `status.bloom-ministry.org`
- Première connexion → créer le compte admin immédiatement.
- Ajouter un moniteur HTTP(s) vers `https://api.app.bloom-ministry.org/api/v1/health`.

## Checklist finale à valider une fois tout déployé

- [ ] Chaque Application démarre et reste "healthy" (pas de crash-loop) dans Dokploy
- [ ] `https://api.app.bloom-ministry.org/api/v1/health` répond `{"ok":true,...,"redis":true}`
- [ ] Login depuis `https://app.bloom-ministry.org` fonctionne
- [ ] Le worker tourne (logs montrant les sweeps du scheduler)
- [ ] `docker compose exec backup ls /backups` (ou terminal Dokploy équivalent) montre un
      premier dump, et si R2 est configuré, les logs montrent "copié vers R2"
- [ ] `status.bloom-ministry.org` accessible, moniteur configuré

## Notes

**SMTP vide** = les liens d'activation de compte restent seulement loggés, aucun membre ne
peut activer son compte en pratique. (SMTP est configuré depuis — Brevo.) **Twilio vide** =
les canaux SMS et WhatsApp ne partent jamais : `notify.ts` écrit la ligne outbox en statut
`simulated` et personne n'est prévenu de rien. Sans conséquence tant qu'aucun déclencheur
n'a `sms`/`whatsapp` coché dans Réglages.

**Le volume `/data` du backend n'est PAS optionnel en mode disque.** `UPLOAD_DIR` vaut
`dirname(BLOOMCORE_DB)/uploads`, ou `<dossier du code>/uploads` si `BLOOMCORE_DB` est
absent — dans ce dernier cas les photos sont écrites DANS le conteneur et **disparaissent à
chaque redéploiement**. Il faut donc, sur l'Application backend : un volume persistant monté
sur `/data` ET `BLOOMCORE_DB=/data/bloomcore.db` (la valeur sert de racine aux uploads, y
compris en mode Postgres où le fichier SQLite lui-même n'est plus utilisé pour les données).

**Bascule R2/S3 pour les photos : PAS prête, ne pas activer telle quelle.** Renseigner
`S3_ENDPOINT` & co. fait bien basculer `server/storage.ts` en mode S3 côté écriture, mais
`storeImage()` renvoie toujours un chemin `/uploads/<clé>` et le front l'affiche tel quel
(`photoSrc`, src/data/api.ts). Or en mode S3 le dossier servi par la route `/uploads` est
vide : l'upload réussirait et **toutes les photos s'afficheraient en 404**. Le hook front des
URLs signées (`GET /api/v1/uploads/sign`, déjà présent côté serveur) n'a jamais été écrit —
c'est ce qu'il faut faire AVANT d'envisager cette bascule. Voir le backlog du rapport de
séparation (« hook front des URLs signées si MinIO est activé »).
