# BloomCore

Application de gestion d'église (deux branches, Bloom Bus territorial, cursus pastoral,
intégration des nouveaux). Front **React 19 / Vite 6 / Tailwind 4**, back **Express + `node:sqlite`**,
déployée en **mono-service Docker** (Coolify).

> Il n'y a **pas** de clé Gemini ni de dépendance IA : ce dépôt n'utilise aucune API externe d'IA.

## Prérequis

- **Node ≥ 22.5** (obligatoire — le serveur utilise `node:sqlite`, natif depuis 22.5).

## Démarrage local (2 process)

Le front (Vite, port 3000) et l'API (Express, port 4000) tournent **séparément**. Vite
proxifie `/api` et `/uploads` vers l'API — il faut donc lancer les deux.

```bash
npm install

# Terminal 1 — API (SQLite locale, secret de dev auto en loopback)
npm run server

# Terminal 2 — front
npm run dev
```

Ouvrir http://localhost:3000. En local, aucun secret n'est requis : l'API démarre avec un
secret de développement et **n'écoute que sur loopback** (voir sécurité ci-dessous).

### Comptes de test

Les 18 profils de démonstration ne sont seedés que si `SEED_DEMO_PASSWORD` est défini :

```bash
SEED_DEMO_PASSWORD=bloom2026 npm run server
```

Login : `+2250700000001` / `bloom2026` (Super Admin). Autres profils dans `SEED.md`.

## Tests & lint

```bash
npm test     # suites d'assertions natives (node:assert) sur les helpers purs + RBAC/guards serveur
npm run lint # tsc --noEmit
```

Pas de framework de test : chaque helper métier a un `*.check.ts` co-localisé exécuté via `tsx`.

## Build

```bash
npm run build   # bundle Vite dans dist/ (servi par l'API en prod)
```

## Déploiement

Voir **[DEPLOY.md](DEPLOY.md)** — Dockerfile mono-service, Coolify, volume `/data`, et les
secrets à fournir au boot (`AUTH_SECRET`, `ACADEMY_WEBHOOK_SECRET`, …).

## Sécurité (essentiel)

- **`AUTH_SECRET`** (≥16 c.) signe les tokens de session. En production l'API **refuse de
  démarrer** sans lui. Sans secret fort, elle n'écoute **que sur `127.0.0.1`** — un déploiement
  mal configuré devient injoignable (échec visible) plutôt que de servir des tokens forgeables.
  Générer : `openssl rand -hex 32`.
- Ne jamais committer de secret (`.env` est gitignoré).

## Documentation

| Fichier | Contenu |
|---|---|
| `PRODUCT.md` / `CAHIER_DES_CHARGES.md` | vision produit et exigences |
| `ARCHITECTURE_TECHNIQUE.md` | architecture cible de référence |
| `AGENTS.md` | conventions de code et repères pour reprendre le dépôt |
| `DEPLOY.md` | déploiement Docker / Coolify |
| `SEED.md` | profils de test et données de démo |
| `PROFILS-INTERFACES.md` · `ECRANS-PAR-ONGLET.md` · `FORMULAIRES.md` | RBAC, écrans, formulaires |
| `KPIS.md` · `NOTIFICATIONS.md` · `WORKFLOWS.md` | indicateurs, notifications, flux métier |
| `CHARTE-GRAPHIQUE.md` · `DESIGN.md` | direction visuelle |
| `AUDIT.md` | revue d'ingénierie et plan d'action |

## Stack

React 19 · Vite 6 · Tailwind 4 · Express 4 · `node:sqlite` · SQLite. Persistance
localStorage-first côté client avec synchronisation serveur (LWW + tombstones scopés).
