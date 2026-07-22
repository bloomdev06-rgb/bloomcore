# Cahier de déploiement — BloomCore

Ce guide permet à **n'importe qui** de déployer BloomCore de zéro sur un nouveau serveur.
Aucune connaissance préalable du projet n'est requise. Suivre les sections dans l'ordre.

> **Branche à déployer : `m6-relational`** (jamais `main`). C'est la branche de production.

---

## 1. Comment l'application est faite (à lire une fois)

BloomCore est un **mono-service** : une seule image Docker contient tout.

- Le `Dockerfile` build le frontend (React/Vite) **puis** lance l'API (Express) sur le
  **port 4000**. La même API sert aussi le frontend buildé → **un seul conteneur, un seul port**.
- **Deux modes de base de données**, choisis automatiquement par la variable `DATABASE_URL` :
  - `DATABASE_URL` **défini** → **PostgreSQL** (recommandé en prod). Toutes les données y vont.
  - `DATABASE_URL` **absent** → **SQLite** (fichier local, mode simple/legacy).
- **Persistance** : un volume monté sur `/data` garde les données SQLite **et** les
  **photos des membres** (`/data/uploads/`). En mode Postgres, la base est un service séparé
  (son propre stockage) et `/data` ne porte plus que les photos.

**Conteneurs à créer :**

| Conteneur | Rôle | Obligatoire |
|---|---|---|
| `bloomcore` (l'app) | API + frontend, port 4000 | **oui** |
| `postgres` (base) | PostgreSQL 16 | **oui en prod** (sinon SQLite mono-conteneur) |

Node ≥ 22.5 est requis (l'image utilise `node:22-alpine`, déjà géré).

---

## 2. Prérequis

- Un serveur (VPS) avec Docker, ou un compte **Coolify** ou **Dockploy** self-hosted.
- Un accès au dépôt Git de déploiement : `https://github.com/bloomdev06-rgb/bloomcore`
  (c'est celui depuis lequel les plateformes tirent le code), branche **`m6-relational`**.
- Un nom de domaine (recommandé — nécessaire pour HTTPS, les notifications push et l'email).

---

## 3. Les clés / secrets à préparer (AVANT de déployer)

Aucun secret n'est dans Git. Il faut les fournir dans les **variables d'environnement** de la
plateforme. Générer chaque secret fort avec :

```bash
openssl rand -hex 32
```

### 3.1 Obligatoires (l'app refuse de démarrer sans)

| Variable | Rôle | Valeur |
|---|---|---|
| `AUTH_SECRET` | signe les tokens de session (JWT) | `openssl rand -hex 32` (≥16 car.) |
| `ACADEMY_WEBHOOK_SECRET` | HMAC du webhook École Bloom | `openssl rand -hex 32` (≥16 car.) |

> ⚠️ Ne **jamais** committer ces valeurs. Committer `AUTH_SECRET` permettrait à quiconque de
> forger un token Super Admin.

### 3.2 Base de données (obligatoire en prod Postgres)

| Variable | Rôle | Valeur |
|---|---|---|
| `DATABASE_URL` | connexion Postgres | `postgresql://USER:PASS@HOST:5432/bloomcore?schema=public` |

En Coolify/Dockploy, cette URL est fournie par la **ressource PostgreSQL** que vous créez
(URL **interne** du service). Laisser vide = mode SQLite (un seul conteneur, pas de service DB).

### 3.3 Recommandés

| Variable | Rôle | Valeur |
|---|---|---|
| `APP_URL` | URL publique (liens d'activation/reset dans les emails) | `https://votre-domaine` |
| `CORS_ORIGINS` | origines autorisées | vide en mono-service (même origine) ; sinon l'URL du frontend |

### 3.4 Optionnels par fonctionnalité

**Comptes de démonstration** (à retirer en vraie prod) :

| Variable | Rôle | Valeur |
|---|---|---|
| `SEED_DEMO_PASSWORD` | crée 18 comptes de test (un par rôle) | `bloom2026` (test/démo uniquement) |

**Email (activation / réinitialisation)** — sans ça, les emails sont *simulés* (loggés) :

| Variable | Exemple |
|---|---|
| `SMTP_HOST` | `smtp.votre-fournisseur.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` (true si port 465) |
| `SMTP_USER` / `SMTP_PASS` | identifiants SMTP |
| `SMTP_FROM` | `no-reply@votre-domaine` |

**Notifications Push mobile (Web Push)** — nécessite **HTTPS**. Générer les clés :

```bash
npx web-push generate-vapid-keys
```

| Variable | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | clé publique générée |
| `VAPID_PRIVATE_KEY` | clé privée générée (**secret**) |
| `VAPID_SUBJECT` | `mailto:admin@votre-domaine` |

**SMS / WhatsApp (Twilio)** — optionnel :
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`.

---

## 4. Déploiement sur **Coolify**

1. **Créer un projet** dans Coolify (ex. `bloomcore-prod`).
2. **Ajouter une ressource PostgreSQL** dans ce projet.
   - Activer les **Scheduled Backups**.
   - Copier son **URL de connexion interne** (pour l'étape 5).
3. **Ajouter l'application** :
   - Source : dépôt Git `https://github.com/bloomdev06-rgb/bloomcore`, branche **`m6-relational`**.
   - Build Pack : **Dockerfile** (ou **Docker Compose** si vous voulez le Postgres embarqué).
   - Port exposé : **4000**.
4. **Volume persistant** (Persistent Storage) :
   - Destination : `/data` — Source : **laisser vide** (volume nommé géré par Coolify, ex. `bloomcore-data`).
   - Garde les photos des membres entre redéploiements. **Ne jamais wiper ce volume** (perte des photos).
5. **Variables d'environnement** (onglet Environment Variables), en **secret** pour les sensibles :
   ```
   AUTH_SECRET=<openssl rand -hex 32>
   ACADEMY_WEBHOOK_SECRET=<openssl rand -hex 32>
   DATABASE_URL=<URL interne du Postgres de l'étape 2>
   APP_URL=https://votre-domaine
   # (Optionnels : SMTP_*, VAPID_*, SEED_DEMO_PASSWORD pour une démo)
   ```
6. **Domaine + HTTPS** : renseigner le domaine dans Coolify → il gère le certificat TLS
   (Let's Encrypt) automatiquement. **Faire ceci avant d'entrer de vraies données personnelles**
   (sans HTTPS, mots de passe et photos transitent en clair).
7. **Déployer**. Au premier boot en mode Postgres, l'app applique `prisma migrate deploy`
   automatiquement (créé les tables), puis importe une fois les données SQLite existantes s'il y en a.
8. **Vérifier** :
   ```bash
   curl https://votre-domaine/api/v1/health   # → {"ok":true,...}
   ```
   Puis se connecter. En démo : `+2250700000001` / `bloom2026` (Super Admin).

**Redéploiement / mises à jour** : pousser sur `m6-relational` → Coolify redéploie (ou cliquer
« Redeploy »). Le volume `/data` et le Postgres persistent.

---

## 5. Déploiement sur **Dockploy**

Dockploy suit la même logique (Docker + Postgres + volume + env). Deux options :

### Option A — Docker Compose (le plus simple, tout-en-un)

1. **Create Service → Compose** (ou « Docker Compose »).
2. Source : dépôt `bloomdev06-rgb/bloomcore`, branche **`m6-relational`**.
   Le `docker-compose.yml` du repo embarque déjà l'app **+ un Postgres 16 + les volumes**.
3. Renseigner les variables dans le `.env` / l'onglet Environment de Dockploy :
   ```
   AUTH_SECRET=<openssl rand -hex 32>
   ACADEMY_WEBHOOK_SECRET=<openssl rand -hex 32>
   POSTGRES_PASSWORD=<mot de passe fort>
   APP_URL=https://votre-domaine
   ```
   (`DATABASE_URL` est déjà câblé sur le service `db` interne dans le compose.)
4. **Domaine + HTTPS** : ajouter le domaine sur le service `bloomcore` (port **4000**) →
   Dockploy/Traefik génère le certificat TLS.
5. **Deploy**, puis vérifier `https://votre-domaine/api/v1/health`.

Les volumes `bloomcore-data` (photos) et `bloomcore-pg` (base) sont persistants et déclarés
dans le compose. **Activer les backups** des deux.

### Option B — Application (Dockerfile) + ressource Postgres séparée

1. **Create → Postgres** : créer une base, noter son URL interne.
2. **Create → Application** : source Git `m6-relational`, Build Type **Dockerfile**, port **4000**.
3. **Volume** : monter un volume nommé sur `/data`.
4. **Env** : comme Coolify (§4.5) — coller l'`DATABASE_URL` du Postgres de l'étape 1.
5. Domaine + HTTPS, puis Deploy et vérifier `/api/v1/health`.

---

## 6. Déploiement manuel (VPS nu, sans plateforme)

Pour un serveur Docker simple, le repo est clé en main :

```bash
git clone -b m6-relational https://github.com/bloomdev06-rgb/bloomcore
cd bloomcore

# Créer le .env (à côté du docker-compose.yml)
cat > .env <<EOF
AUTH_SECRET=$(openssl rand -hex 32)
ACADEMY_WEBHOOK_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
APP_URL=https://votre-domaine
EOF

docker compose up -d --build
curl http://localhost:4000/api/v1/health   # → {"ok":true,...}
```

Le `docker-compose.yml` démarre l'app **+ un Postgres 16** et branche `DATABASE_URL` dessus.
Pour HTTPS, placer un reverse-proxy (Caddy / Nginx / Traefik) devant le port 4000.

---

## 7. Après le déploiement — activer les fonctionnalités avancées

| Fonctionnalité | Condition d'activation |
|---|---|
| **HTTPS** (obligatoire avant vraies données) | domaine + certificat TLS (auto sur Coolify/Dockploy) |
| **Emails réels** (activation/reset) | renseigner les `SMTP_*` (sinon simulé/loggé) |
| **Push mobile / PWA installable** | **HTTPS** + clés `VAPID_*` (`npx web-push generate-vapid-keys`) |
| **SMS / WhatsApp** | clés `TWILIO_*` |

Sans HTTPS, le service worker et le Web Push restent **inertes** (comportement navigateur normal).
Le code est déjà livré : ils s'activent dès que HTTPS + `VAPID_*` sont présents.

---

## 8. Persistance & sauvegardes

- **Postgres** : contient toutes les données domaine (membres, rapports, événements, comptes,
  tokens…). → **Activer les Scheduled Backups** de la ressource Postgres.
- **Volume `/data`** : contient les **photos des membres** (`/data/uploads/`) + le SQLite legacy
  gelé. → Sauvegarder aussi ce volume. **Ne jamais le wiper** (perte irréversible des photos).

---

## 9. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le conteneur redémarre en boucle, log « AUTH_SECRET » | secret manquant ou < 16 car. | définir `AUTH_SECRET` et `ACADEMY_WEBHOOK_SECRET` |
| `/api/v1/health` ne répond pas | app pas démarrée / port | vérifier que le port **4000** est exposé et mappé |
| Erreurs Prisma / migration au boot | `DATABASE_URL` invalide | vérifier l'URL interne du Postgres (host, user, pass, db) |
| Photos disparues après redéploiement | volume `/data` non monté ou wipé | monter un volume persistant sur `/data` |
| Push mobile ne marche pas | pas de HTTPS ou `VAPID_*` absents | ajouter HTTPS + générer/poser les clés VAPID |
| Emails non reçus | `SMTP_*` absents (mode simulé) | renseigner la config SMTP |
| Login démo échoue | `SEED_DEMO_PASSWORD` non défini | le poser (`bloom2026`) — **démo uniquement** |

---

## 10. Récapitulatif express

1. Créer **Postgres** (backups ON) → récupérer `DATABASE_URL`.
2. Créer l'**app** depuis `m6-relational`, port **4000**, Dockerfile (ou Compose).
3. Monter un **volume sur `/data`**.
4. Poser les **secrets** : `AUTH_SECRET`, `ACADEMY_WEBHOOK_SECRET`, `DATABASE_URL`, `APP_URL`.
5. **Domaine + HTTPS**.
6. Déployer → `curl https://domaine/api/v1/health`.
7. (Optionnel) SMTP, VAPID (push), Twilio.

> Détails techniques du backend double SQLite/Postgres : voir `ARCHITECTURE_TECHNIQUE.md`.
</content>
</invoke>
