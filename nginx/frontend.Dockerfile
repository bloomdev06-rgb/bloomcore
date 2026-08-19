# Phase 6 (T6.2) — frontend SEUL, servi par nginx, séparé de l'API (server/index.ts sert
# encore le build par défaut en mono-service — ce Dockerfile est OPT-IN, voir
# docker-compose.frontend.yml). Même étape de build que le Dockerfile racine (npm run
# build), résultat servi statiquement au lieu d'être copié dans l'image API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# VITE_API_BASE : si défini au build, le front appelle l'API sur un domaine distinct
# (cross-origin — CORS_ORIGINS doit lister ce domaine frontend côté API, voir T6.3).
# Non défini → même comportement qu'aujourd'hui (API_BASE relatif, suppose même origine).
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
