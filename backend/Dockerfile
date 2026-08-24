# API seule (architecture éclatée — un conteneur par élément, voir infra/DEPLOY-DOKPLOY.md).
# Contrairement au Dockerfile racine (mode mono-service historique, qui build ET sert le
# frontend), celui-ci NE construit PAS le frontend : le frontend est un déploiement Dokploy
# séparé (voir frontend/Dockerfile) qui appelle cette API sur son URL publique (VITE_API_BASE).
# server/index.ts sait servir `dist/` s'il existe (mode mono-service) mais l'ignore
# silencieusement s'il est absent (voir le commentaire au-dessus de express.static côté
# server/index.ts) — donc aucune modification de code n'était nécessaire pour ce découpage.
#
# CONTEXTE DE BUILD ATTENDU : la racine du repo (pas ce dossier backend/), pour pouvoir copier
# server/ et packages/ qui vivent au niveau racine. Dans Dokploy : "Docker Context Path" = `.`,
# "Dockerfile Path" = `backend/Dockerfile`.
FROM node:22-alpine
WORKDIR /app
# Valeurs NON-secrètes par défaut (le reste = secrets, à fournir via l'env de déploiement).
ENV NODE_ENV=production \
    BLOOMCORE_DB=/data/bloomcore.db
# /data doit exister avant l'ouverture SQLite (db.ts ne crée pas le dossier). Sans volume
# monté → base éphémère dans cette couche ; avec volume → persistée. En mode Postgres
# (DATABASE_URL défini, le cas normal de cette architecture éclatée), TOUTES les données
# runtime vont en PG ; le SQLite /data ne sert plus que de source lue UNE fois au boot pour
# la migration blob→PG, puis reste gelé.
RUN mkdir -p /data
# prisma/ AVANT npm ci : le postinstall `prisma generate` a besoin du schéma (pas d'une
# connexion DB). prisma est une dependency → inclus par --omit=dev.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY server ./server
# packages/shared/migrate.ts est importé au runtime par db.ts/store.ts (canonicalize M5).
COPY packages ./packages
# EXCEPTION documentée à la frontière serveur/front (T1.5) : server/seedData.ts importe
# INITIAL_ADMINS etc. depuis ../src/mockData.ts au runtime (tsx exécute le TS source
# directement, pas de bundle) — donc src/ doit être présent même dans cette image API-only,
# même si le frontend lui-même n'est plus buildé/servi par ce conteneur.
COPY src ./src
# Scripts d'exploitation lancés À LA MAIN dans le conteneur — aujourd'hui
# scripts/reset-production.ts (remise à zéro pour la mise en production). Sans cette copie la
# commande documentée échoue : le fichier n'existe pas dans l'image. tsx et dotenv sont des
# `dependencies` (pas devDependencies), donc bien présents malgré `npm ci --omit=dev`.
COPY scripts ./scripts
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${API_PORT:-4000}/api/v1/health" || exit 1
# En mode Postgres (DATABASE_URL défini) : appliquer les migrations avant de démarrer.
# `exec` → npm start reçoit les signaux (SIGTERM propre).
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx prisma migrate deploy; fi && exec npm start"]
