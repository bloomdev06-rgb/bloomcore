# Audit technique d'expert — BloomCore

> Revue d'ingénierie en lecture seule (aucune modification de code). Réalisée le 2026-07-17 sur le commit `576928a`, par trois auditeurs indépendants (conformité architecture · sécurité/confidentialité · qualité/maintenabilité), constats vérifiés dans le code.
> Référentiel de conformité : `ARCHITECTURE_TECHNIQUE.md` (racine du dépôt — à noter : le document le situe sous `docs/`, il est en réalité à la racine).

---

## 1. Synthèse exécutive

BloomCore est une application de gestion d'église (deux branches, Bloom Bus territorial, cursus pastoral, intégration des nouveaux) : **~20 000 lignes** TS/TSX, front React 19 / Vite 6 / Tailwind 4 et back Express + `node:sqlite`, déployée en **mono-service Docker** (Coolify).

**Niveau de maturité : MVP avancé / pré-production.** Le socle non-visuel — helpers métier purs (`src/data/*`) et couche serveur (RBAC, guards, audit, sync) — est d'une **qualité nettement supérieure à la moyenne d'un MVP** : testé (12 suites, ~277 assertions), durci au-delà du cahier des charges (anti-brute-force, anti-oracle de timing, webhook HMAC anti-rejeu, verrou d'immuabilité 24 h, soft-delete généralisé), et couvert par une CI GitHub Actions. La dette est **concentrée** (vues monolithiques, README trompeur, TypeScript non-strict) et surtout **documentée** (28 marqueurs `ponytail:` qui nomment chaque raccourci et son plafond).

**Note globale : 6,5 / 10.** Décomposée : sécurité applicative 7/10 (crypto et écriture solides ; 3 fuites de PII en lecture à colmater), maintenabilité du socle 8/10, maintenabilité des vues 5/10, onboarding 4/10 (README mensonger), conformité à l'architecture cible **~46 %** (élevée en *esprit*, faible en *structure/technologie*).

**Verdict prod-ready :** oui après correction des **3 fuites de PII en lecture** (§4, tous des patchs de quelques lignes) et réécriture du README. Le reste relève de l'amélioration continue, pas du bloquant.

---

## 2. Réponses directes aux questions clés

### (a) Est-ce bien organisé ?
**Partiellement — oui pour le socle, non pour les vues.** Le pattern est cohérent et identifiable : vues monolithiques + helpers purs testés dans `src/data/*` + serveur découpé par responsabilité (`auth`, `rbac`, `guards`, `notify`, `scheduler`, `db`). La couche `src/data` est le point fort du dépôt. Le désordre est **concentré dans quelques god files** : `BloomBusView.tsx` (1556 l), `DepartmentsView.tsx` (1266 l), `EventsView.tsx` (1039 l), `App.tsx` (781 l) — chacun mêle 4-6 responsabilités. Ce n'est pas un chaos structurel, c'est de la dette localisée.

### (b) Un développeur tiers peut-il reprendre et faire évoluer facilement ?
**Pas en l'état, à cause du README — mais le potentiel est là.** Le `README.md` est le **boilerplate Google AI Studio** : il demande une `GEMINI_API_KEY` qui n'existe nulle part dans le code (`grep GEMINI` = 0) et n'indique pas qu'il faut **deux process** (`npm run dev` + `npm run server`). Un repreneur qui suit le README **ne démarre pas l'application**. L'information réelle existe, mais éparpillée dans `DEPLOY.md`/`AGENTS.md`. Une fois cet obstacle levé, la nomenclature métier (Bloom Bus, ADN, OJ, moisson, drachme) est bien documentée et la dette tracée. **Corriger le README est l'action à plus fort effet de levier du dépôt.**

### (c) Sécurité & confidentialité respectées ?
**Fondations solides, trois trous de confidentialité en lecture.** La cryptographie, l'authentification et le contrôle en **écriture** sont bien faits (SQL 100 % paramétré, scrypt + timingSafeEqual, rate-limit, `npm audit` = 0 vulnérabilité, RBAC scopé par branche, anti-escalade). Mais **trois collections fuient des données personnelles en lecture** à des profils qui ne devraient pas les voir : les **photos** (`/uploads` sans authentification), le **journal d'audit** (lisible par tout membre) et les **notifications personnelles** (diffusées à toute la branche). Ce sont les correctifs prioritaires.

### (d) Le code est-il conforme à `ARCHITECTURE_TECHNIQUE.md` ?
**Conformité globale ~46 % (pondérée).** À lire en deux temps : **conformité d'esprit élevée** (les exigences fonctionnelles et sécuritaires sont largement satisfaites), **conformité structurelle/technologique faible** (ni monorepo workspaces, ni Prisma/PostgreSQL, ni REST par domaine, ni validation Zod, ni Socket.io, ni service worker). Le document cible une architecture d'entreprise ; le code réel est un MVP monolithique localStorage-first qui en réalise le comportement autrement.

| Bloc de l'architecture cible | Poids | Conformité | Verdict |
|---|---|---|---|
| §1 Monorepo npm workspaces | 5 % | 15 % | 🔴 Divergent (app Vite monolithique, `package.json` sans `workspaces`) |
| §2 Modèle de données (Prisma/PostgreSQL) | 25 % | 45 % | 🟠 Partiel (entités présentes en *esprit*, mais document-store SQLite JSON, sans FK ni Zod ; `CapabilityOverride`/`SpecialAuthorization`/`StepValidation` absents) |
| §3 Enums `packages/shared` | 8 % | 40 % | 🟠 Divergent (unions FR inline ; seuls `ReportType`/`SpecialFunction` en snake_case) |
| §4 API REST par domaine | 20 % | 35 % | 🟠 Partiel (CRUD générique `GET/PUT /:name` + logique métier côté client ; sync/batch et webhook conformes) |
| §5 Moteur de permissions | 15 % | 60 % | 🟠 Partiel mais robuste (délégation scopée, interdiction `rapport_bloom_bus_member`, scope hiérarchique conformes ; `overrides + specialAuth + cache` absents) |
| §6 Jobs analytiques | 8 % | 55 % | 🟠 Partiel (scheduler d'alertes réel ; KPI calculés côté client à la volée) |
| §7 Sécurité & résilience | 15 % | 65 % | 🟠 Partiel (audit/soft-delete/RBAC/webhook conformes ; refresh token, service worker, Socket.io absents) |
| §8 Arborescence détaillée | 4 % | 15 % | 🔴 Divergent (fichiers à plat, pas de `modules/features/pages/store`) |
| **Global** | 100 % | **~46 %** | Conformité d'esprit élevée, conformité technologique faible |

---

## 3. Constats détaillés par axe

### Axe 0 — Conformité à l'architecture cible
Détaillé dans le tableau §2(d). Écarts structurants, par effort de mise en conformité :

- 🔴 **Persistance document-store au lieu de PostgreSQL/Prisma relationnel** (`server/db.ts` — table `collections(name,id,data)`, un blob JSON par item ; aucun `schema.prisma`). Conséquence : pas de relations/FK, pas de requêtes analytiques serveur, intégrité uniquement applicative. → **Effort XL.**
- 🔴 **API générique whole-array + logique métier côté client, sans Zod** (`server/index.ts:236-282`, `Report.content: any` dans `types.ts`). Pas de frontière de confiance sur les payloads. → **Effort XL.**
- 🔴 **`CapabilityOverride` + `SpecialAuthorization` + cache de capacités absents** (grep = 0 ; matrice statique `PermissionMatrix`). Le modèle `base ⊕ overrides ⊕ specialAuth` de §5 n'est pas réalisé. → **Effort L.**
- 🟠 **Service worker (PWA) et Socket.io absents** (`index.html` : `manifest.webmanifest` seul). Offline via localStorage sans SW ; alertes non temps réel. → **Effort M.**
- 🟠 **JWT sans refresh/rotation ; monorepo & arborescence cible absents.** → **Effort L / XL.**

**Plus avancé que la cible (bons points) :** anti-brute-force login avec lockout, dummy-hash anti-oracle de timing, refus de démarrage prod sans secret fort, verrou d'immuabilité 24 h des rapports, garde anti-auto-promotion, résilience de sync (LWW + tombstone scopé `preservedIds`), PII masquée dans les logs, photos dédupliquées par hash.

### Axe 1 — Architecture & organisation 🟠
- 🟠 **God files** : `BloomBusView` 1556, `DepartmentsView` 1266, `EventsView` 1039, `App.tsx` 781 (47 hooks/handlers). Preuve : `wc -l`.
- 🟠 **Sélecteur de période dupliqué dans 6 vues** (`DashboardView`, `MinisteresView`, `DepartmentsView`, `AdnView`, `BloomBusView`, `ReportsView`) — la *logique* est mutualisée (`kpi.ts:periodRange`), seule l'**UI** est copiée-collée. Aucun `<PeriodSelector>` partagé.
- 🟠 **Opérateur `'Affeny Grah'` en dur sur 9+ sites** (auth pas encore branchée à l'UI). Valeur temporaire dupliquée au lieu d'une constante unique.
- 🟢 12 primitives UI dans `src/components/ui/` (Button, Modal, Badge, Toast, Avatar…) — bonne base, sous-exploitée.

### Axe 2 — Qualité du code & maintenabilité 🟠
- 🟠 **`alert()` natifs (10 sites) coexistant avec le système Toast** (`MemberFormModal.tsx:183/188/237/242`, `ProfileView.tsx:172-186`, `EventsView.tsx:384`) — incohérence UX non finie.
- 🟡 **135 `any`** concentrés côté serveur/tests ; le front est presque propre. Dette contenue mais non bornée par le compilateur (voir tsconfig ci-dessous).
- 🟢 **28 marqueurs `ponytail:`** = dette *assumée et documentée* (nomme le plafond + l'upgrade path). Bonne pratique, pas un défaut ; `/ponytail-debt` les remonterait.
- 🟡 Nommage bilingue (identifiants EN, métier + commentaires FR) — cohérent par couche.

### Axe 3 — Reprise par un dev tiers (onboarding) 🔴
- 🔴 **README trompeur** : boilerplate AI Studio, `GEMINI_API_KEY` inexistante, démarrage 2-process non documenté (voir §2(b)).
- 🟠 **18 fichiers `.md` à la racine** sans index d'entrée — riche mais désorientant.
- 🟢 Nomenclature métier bien documentée (`CAHIER_DES_CHARGES.md`, `ECRANS-PAR-ONGLET.md`, `PRODUCT.md`) ; `DEPLOY.md`/`AGENTS.md`/`ARCHITECTURE_TECHNIQUE.md` sérieux et à jour vs le code.

### Axe 4 — Sécurité 🟠 (fondations solides, 3 fuites en lecture)
🔴 🟠 détaillés au §4 (tableau priorisé). **Bons points vérifiés** : SQL 100 % paramétré ; scrypt + `timingSafeEqual` ; rate-limit login (5/15 min) ; anti-énumération (200 constant, `devToken` hors prod) ; tokens one-time (activation 48 h / reset 1 h) ; pas d'auto-inscription ; webhook HMAC + anti-rejeu (fenêtre ±5 min, signature UNIQUE) ; `testRole` **n'est pas** une source de rôle (`rbac.ts:31-44`, pas d'escalade) ; `admins`/`permissions` réservés Super Admin ; `npm audit` = **0 vulnérabilité** (Express 4.21.2) ; aucun `dangerouslySetInnerHTML`/`eval`.

### Axe 5 — Confidentialité & protection des données 🟠
- 🔴 **Photos accessibles sans authentification** (§4 #1) — le plus sensible : photos de membres potentiellement mineurs, corrélables au GPS/téléphone des fiches.
- 🟠 **Audit et notifications sur-exposés** (§4 #2, #3) — fuite de PII et d'opsec à l'échelle de l'organisation.
- 🟢 Rapports pastoraux confidentiels correctement filtrés côté serveur (la confidentialité prime même sur Admin, `rbac.ts:279-288`) ; adresses masquées dans les logs (`notify.ts:24-27`).
- 🟡 Pas de mécanisme de purge/rétention ni de droit à l'effacement (soft-delete conserve tout indéfiniment) — à cadrer si conformité RGPD visée.

### Axe 6 — Base de données & modèle 🟠
- Schéma applicatif cohérent mais **non relationnel** (document-store) : intégrité référentielle portée par le code, pas par la base. Pas de migrations versionnées (le schéma vit dans `db.ts` + réconciliations idempotentes au boot). Données de test bien **gated hors prod** (`seed.ts:28`, `SEED_DEMO_PASSWORD`).

### Axe 7 — Tests & fiabilité 🟠
- 🟢 12 suites `*.check.ts`, ~277 assertions natives — helpers purs + RBAC/guards serveur bien couverts. CI présente (`.github/workflows/ci.yml` : lint → test → build sur push/PR).
- 🔴 **Zéro test de composant React** — les vues de 1000-1556 lignes ne sont pas testées.
- 🟠 **2 suites écrites mais absentes de `npm test`** : `completude.check.ts` (26 asserts) et `week.check.ts` (19 asserts) — 45 assertions jamais exécutées en CI → dérive silencieuse.

### Axe 8 — Performance & scalabilité 🟠
- 🟢 Code-splitting par vue ; compression gzip + cache immutable (ajoutés récemment : bootstrap 407 Ko → 36 Ko).
- 🟠 **`recharts` (341 Ko) + `leaflet` (205 Ko)** dominent le poids ; chunk `index` 141 Ko gzip.
- 🟠 **`load()`/`JSON.parse` à chaque render** (~39 sites via `useDepartments`/`useBusLines`…) — parse synchrone répété, négligeable à 300 membres, bloquant à l'échelle.
- 🟠 **`MembersView` sans pagination** — rend toutes les cartes d'un coup (OK à 300, rame à 2000).

---

## 4. Tableau des problèmes priorisés (sévérité × effort)

| # | Sévérité | Constat | Preuve | Effort | Reco |
|---|---|---|---|---|---|
| 1 | 🔴 | **Photos servies sans authentification** (`/uploads/<hash>`, cache immuable 1 an, non révocable) | `server/index.ts:402` (monté avant tout `requireAuth`) | S | Placer `/uploads` derrière `requireAuth` + scope, ou URLs signées expirantes ; retirer `immutable`. |
| 2 | 🔴 | **Journal d'audit lisible par tout membre authentifié** (noms, `operatorId`, `PASSWORD_RESET_ISSUED` en clair) | `server/rbac.ts:339` (`audits` tombe dans `default: return items`) | S | `case 'audits': return hasAny(roles, ['Admin','Super Admin','Pasteur','Pasteur Principal']) ? items : []` |
| 3 | 🔴 | **Notifications personnelles diffusées à toute la branche** | `server/rbac.ts:328-337` (filtre branche seul, jamais `targetMemberId`) | S | Ajouter `.filter(n => !n.targetMemberId \|\| n.targetMemberId === member.id \|\| hasAny(roles, ABOVE_MEMBER_ROLES))` |
| 4 | 🔴 | **README trompeur** (boilerplate Gemini, démarrage 2-process non documenté) | `README.md`, `grep GEMINI`=0 | S | Réécrire (voir Quick wins). |
| 5 | 🟠 | **`inMemberScope` fail-open en écriture** (asymétrie avec la lecture fail-closed) | `src/data/scope.ts:65`, `rbac.ts:134` | S | Fail-closed : sans `scopeRole` déterminé, n'autoriser que `target.id === member.id`. |
| 6 | 🟠 | **Pas de CSP/HSTS ; token en `localStorage`** (exfiltrable si XSS future) | `server/index.ts:43-45` (grep CSP=0), `api.ts:12` | M | CSP `default-src 'self'` + HSTS prod ; envisager cookie `HttpOnly`. |
| 7 | 🟠 | **Sécurité entièrement suspendue à `NODE_ENV`** (secret dev = forge de tokens Super Admin ; `bloom2026` seedé) | `server/auth.ts:10-17`, `seed.ts:77-89` | S | Exiger `AUTH_SECRET` fort dès qu'un port est ouvert, indépendamment de `NODE_ENV` ; logguer le mode au boot. |
| 8 | 🟠 | **`tsconfig` non-strict + aucun ESLint/Prettier** | `tsconfig.json` (grep strict=0) | M | `"strict": true` + ESLint (react-hooks). |
| 9 | 🟠 | **Zéro test de composant ; 2 suites hors `npm test`** | `find *.test.tsx`=0 ; `package.json` scripts | S/M | Brancher les 2 checks (2 min) ; ajouter Testing-library sur les vues critiques. |
| 10 | 🟠 | **God files + duplication (`<PeriodSelector>`, `OPERATOR`)** | `wc -l` ; grep | M | Extraire composants ; découper les vues. |
| 11 | 🟡 | **Tokens non révocables au changement de mot de passe** (12 h) | `auth.ts:37-42` | M | `pwd_version` dans le payload, incrémenté au reset. |
| 12 | 🟡 | **Pas de validation de schéma des payloads** (champs arbitraires stockés verbatim) | `index.ts:250-282` | L | Whitelist/Zod par collection sur `members`/`reports`/`events`. |
| 13 | 🟡 | **`load()`/parse à chaque render ; MembersView sans pagination** | `data/index.ts:37` ; `MembersView.tsx:553` | M | Mémoïser les hooks de collection ; paginer/virtualiser. |
| 14 | 🟡 | **`alert()` résiduels ; scripts `fix-colors.*` morts** | grep | S | Migrer vers Toast ; supprimer les 4 scripts racine. |

---

## 5. Plan d'action

**Court terme (cette semaine — sécurité & déblocage, ~1 jour) :** #1, #2, #3 (les 3 fuites de PII — trois petits patchs dans `rbac.ts`/`index.ts`), #4 (README), #7 (durcir le garde-fou `NODE_ENV`), #9-brancher les 2 suites, #14. Ces items ferment les risques concrets et débloquent l'onboarding pour un coût minime.

**Moyen terme (2-4 semaines — robustesse & maintenabilité) :** #5 (symétrie scope écriture/lecture), #6 (CSP/HSTS), #8 (tsconfig strict + ESLint), #10 (extraire `<PeriodSelector>` / `OPERATOR`, commencer à découper `BloomBusView`), #11 (révocation de token), #13 (mémoïsation + pagination MembersView), premiers tests de composant sur les vues critiques.

**Long terme (trimestre — conformité architecture, si l'ambition « entreprise » est confirmée) :** #12 (Zod aux frontières), puis la trajectoire vers l'architecture cible — validation Zod partagée → endpoints REST par domaine → `CapabilityOverride`/`SpecialAuthorization` → PWA service worker + Socket.io → et, seulement si l'échelle le justifie, la migration document-store → PostgreSQL/Prisma et la restructuration monorepo. **Décision à prendre en amont : cette architecture cible est-elle toujours l'objectif, ou le MVP monolithique actuel est-il suffisant ?** Le taux de 46 % n'est un « échec » que si la cible reste contractuelle.

---

## 6. Quick wins (fort impact, faible effort)

1. **3 patchs de confidentialité** (~30 min total) : garde `requireAuth`+scope sur `/uploads` ; `case 'audits'` restreint au staff ; filtre `targetMemberId` sur `notifications`. Ferme les trois fuites de PII.
2. **Réécrire le README** (~30 min) : retirer le boilerplate Gemini, documenter `npm run dev` + `npm run server`, `SEED_DEMO_PASSWORD=bloom2026`, lier `DEPLOY.md`/`ARCHITECTURE_TECHNIQUE.md`. Débloque tout onboarding.
3. **Brancher `completude.check.ts` + `week.check.ts` dans `npm test`** (~2 min) : 45 assertions déjà écrites qui ne tournent pas.
4. **Durcir `NODE_ENV`** (~15 min) : exiger `AUTH_SECRET` fort dès qu'un port réseau est ouvert, log bruyant du mode au boot.
5. **`"strict": true`** dans `tsconfig` (~1-2 h) : la CI et `lint` (déjà `tsc --noEmit`) déploient le filet immédiatement sur tout le code.
6. **Supprimer `fix-colors.{js,cjs}`** (~2 min) : 4 scripts de migration morts à la racine.

---

*Fin de l'audit. Constats vérifiés dans le code au commit `576928a` ; sévérités attribuées selon l'impact réel et l'exploitabilité, sans complaisance — y compris sur les fuites introduites par les développements les plus récents (photos, cloisonnement de branche).*
