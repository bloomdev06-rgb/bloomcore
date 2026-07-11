# BloomCore — un seul service : l'API Express sert aussi le frontend buildé
# (server/index.ts::express.static('dist')). node:sqlite exige Node >= 22.5.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# Valeurs NON-secrètes par défaut (le reste = secrets, à fournir via l'env de déploiement).
# BLOOMCORE_DB pointe sur /data → à monter en volume persistant (cf. docker-compose.yml / Coolify).
ENV NODE_ENV=production \
    BLOOMCORE_DB=/data/bloomcore.db
# /data doit exister avant l'ouverture SQLite (db.ts ne crée pas le dossier). Sans volume
# monté → base éphémère dans cette couche ; avec volume → persistée.
RUN mkdir -p /data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Persister le fichier SQLite entre redéploiements : monter un volume sur /data (BLOOMCORE_DB
# pointe déjà dessus via ENV ci-dessus, sinon la base reste dans la couche image, éphémère) :
#   docker run -v bloomcore-data:/data ...
# (voir docker-compose.yml pour un déploiement de test clé en main).
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${API_PORT:-4000}/api/v1/health" || exit 1
CMD ["npm", "start"]
