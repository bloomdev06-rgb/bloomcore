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
CMD ["npm", "start"]
