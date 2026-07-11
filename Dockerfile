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
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Persister le fichier SQLite entre redéploiements : monter un volume ET pointer
# BLOOMCORE_DB dessus (sinon il reste dans la couche image, perdu à chaque rebuild) :
#   docker run -v bloomcore-data:/data -e BLOOMCORE_DB=/data/bloomcore.db ...
# (voir docker-compose.yml pour un déploiement de test clé en main).
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${API_PORT:-4000}/api/v1/health" || exit 1
CMD ["npm", "start"]
