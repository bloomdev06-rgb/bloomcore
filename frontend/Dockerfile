# Frontend seul, servi par nginx — architecture éclatée (voir infra/DEPLOY-DOKPLOY.md).
# Ne parle à l'API qu'en HTTP public (VITE_API_BASE au build) : aucune dépendance réseau
# interne à Postgres/Redis, ce qui rend ce conteneur sûr à déployer comme Application Dokploy
# totalement indépendante (contrairement à l'API/worker/DB, voir le README pour le détail).
#
# CONTEXTE DE BUILD ATTENDU : la racine du repo (pas ce dossier frontend/) — `npm run build`
# a besoin de tout le projet (package.json, src/, packages/, index.html, vite.config).
# Dans Dokploy : "Docker Context Path" = `.`, "Dockerfile Path" = `frontend/Dockerfile`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# VITE_API_BASE : URL PUBLIQUE de l'API (le déploiement backend séparé) — obligatoire dans
# cette architecture éclatée puisque front et API ne sont plus same-origin. Sans ça, le
# front tente des appels relatifs qui n'aboutiront nulle part une fois sur son propre domaine.
# CORS_ORIGINS côté API doit lister le domaine de CE frontend (voir T6.3 / server/index.ts).
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
