# M5 — Convergence des valeurs vers §3 (plan de migration)

> Statut : **✅ EXÉCUTÉ (Tier B + C)** le 2026-07-18. Décisions ci-dessous verrouillées.
> Restent hors périmètre : Tier D (mini-plan feature séparé à venir) et la convergence
> du vocabulaire de rôles / chaînes de capacités (volontairement découplée, §3.4/§3.5).

## 0. TL;DR — l'honnêteté d'abord

« Converger toutes les valeurs vers §3 » **n'est pas un seul pass snake_case**. La carte
réelle du code (cf. §1) montre 3 tiers très différents :

- **Tier A — déjà conforme, rien à faire** : `ReportType` (11 valeurs déjà en snake_case),
  `DepartmentSpecialFunction` (6 valeurs identiques), `BranchCode` church/light.
- **Tier B — rename mécanique déterministe (bijectif, sûr)** : `level`, `integrationState`,
  `pastoralCursus`, `baptismStatus`, `DepartmentType`, `ProjectActionStatus`, et le champ
  `rapport_adn`. C'est **ça, le vrai M5**.
- **Tier C — décisions produit (pas mécanique)** : `DepartmentFunction` (la cible §3 supprime
  Trésorier/section et ajoute coach/leader qui n'y appartiennent pas) ; `ProjectScope`
  (church/light → `branche` est **une collision qui perd l'info de branche**).
- **Tier D — pas une migration de données du tout** : `GlobalFunction`, `EventType`,
  `ActivityType`, `ObservationType`, `OrdinalScore`, `NotificationChannel` n'ont **aucune
  représentation en base** aujourd'hui (nombres, objets booléens, chaînes libres, ou
  inexistants). Les « migrer » = créer un modèle qui n'existe pas → **feature, hors M5.**

**Payoff réel de M5 :** zéro pour l'utilisateur. La seule ROI = préparer M6 (Postgres/Prisma
aime des enums propres) et nettoyer les contrats externes (webhook École Bloom, exports).
Si M6 n'est pas imminent, **la décision paresseuse serait de reporter M5 aussi.** Tu as
tranché « l'architecture cible est l'objectif » → je prépare, mais ce caveat est posé.

**Recommandation de périmètre :** faire **Tier B** maintenant (sûr, borné), traiter Tier C
comme 2 décisions (§4), **exclure Tier D** (le noter comme feature future). Ne PAS toucher au
vocabulaire des rôles ni aux chaînes de capacités (§3.4) — découplage volontaire.

---

## 1. Carte des divergences (source : audit du code, pas la mémoire)

| Enum / champ | Valeurs actuelles | Cible §3 | Tier | Storage |
|---|---|---|---|---|
| `member.level` | Nouveau, Stagiaire, Boss, Leader, Coach | nouveau, stagiaire, boss, leader, coach | **B** | `members[].level` |
| `member.integrationState` | En attente, Suivi, Intégré | en_attente, suivi, integre | **B** | `members[].integrationState` |
| `member.pastoralCursus` | Aucun, Appelé, Serviteur, Gagneur d'âme, Assistant Pasteur, Pasteur Assistant, Pasteur Titulaire | aucun, appele, serviteur, gagneur_ame, assistant_pasteur, pasteur_assistant, pasteur_titulaire | **B** | `members[].pastoralCursus` |
| `member.baptismStatus` | Non baptisé, Baptisé | non_baptise, baptise | **B** | `members[].baptismStatus` |
| `department.type` | service, spécial | normal, special | **B** (rename service→normal) | `departments[].type` |
| `projectTask.status` | todo, doing, done | a_faire, en_cours, fait | **B** (EN→FR) | `projects[]…status` |
| `rapport_adn` content | nouveauxHommes, nouveauxFemmes, ojHommes, ojFemmes | nouveauxH, nouveauxF, ojH, ojF | **B** (rename champ) | `reports[].content` |
| `member.departments[deptId]` (fonction) | Responsable, Adjoint, Trésorier, Responsable de section, Membre, Capitaine de Bus, Responsable de Zone, Responsable de Commune | responsable, adjoint, coach, leader, membre, capitaine, responsable_zone, responsable_commune | **C** (set change) | map deptId→fonction |
| `project.scope` | church, light, both, ministry | transverse, branche, ministere | **C** (perte de branche) | `projects[].scope` |
| `ReportType` | 11 valeurs snake_case | idem | **A** ✅ | `reports[].reportType` |
| `DepartmentSpecialFunction` | adn, portiers, integration, bloom_bus, gestion_cultes, parcours_etapes | idem | **A** ✅ | `departments[].specialFunction` |
| `BranchCode` | church, light, global | church, light (+global extra) | **A** ✅ | partout |
| GlobalFunction, EventType, ActivityType, ObservationType, OrdinalScore, NotificationChannel | — non modélisés (rôles-chaînes, chaînes libres, nombres, objet booléen) | valeurs §3 | **D** (feature, hors M5) | — |

**Fichiers couplés que tout rename Tier B doit toucher en lockstep** (au-delà des seeds
`mockData.ts`/`testDataset.ts`/`seed.ts`) : `src/data/roles.ts` (PASTORAL_CURSUS, ROLE_PRIORITY),
`src/data/permissions.ts` (`memberMatchesOverride` compare `subjectValue` aux valeurs
level/cursus/fonction), la matrice KV `permissions`, les collections `capability_overrides`
(`subjectValue`) et l'UI `GovernanceView.tsx` (`OVERRIDE_SUBJECT_VALUES`).

---

## 2. Le point dur : offline-first + LWW whole-array

Deux datastores portent les valeurs : **SQLite serveur** (blobs JSON whole-array dans la
table `collections`) **et le localStorage de chaque client** (offline-first). Le sync est
**LWW whole-array** : un client resté sur d'anciennes valeurs qui PUT après la migration
**réécrirait le migré par-dessus** → perte de données. Un big-bang « migre le serveur puis
prie » est donc exclu.

### Solution : normalisation au boundary + backfill unique

Comme les renames Tier B sont **bijectifs** (map ancien→nouveau pure et totale), on installe
une couche de normalisation qui rend l'ordre de déploiement indifférent :

1. **`packages/shared/migrate.ts`** — maps `ancien→nouveau` par champ + `canonicalize(collection, item)`
   pur (front+back). Un `migrate.check.ts` assère : (a) chaque valeur de seed actuelle a une
   image, (b) idempotence `canon(canon(x)) === canon(x)`.
2. **Serveur — normalise toute écriture** : dans `applyWrite`, passer chaque item entrant par
   `canonicalize` **avant** le merge. Linchpin : même un vieux client qui envoie d'anciennes
   valeurs les voit normalisées à l'arrivée → **impossible de réintroduire l'ancien**.
3. **Serveur — backfill unique au boot** : idempotent, gardé par un flag kv `m5_migrated`
   (même pattern que la migration `pwd_version` de `db.ts:70`). Réécrit chaque blob
   `collections` + la KV `permissions` (clés) + `capability_overrides.subjectValue`.
4. **Client — sweep unique au boot** : gardé par `bc_m5_migrated` en localStorage ; canonicalise
   et réécrit chaque collection mirroir. (Idempotent : re-run = no-op.)
5. **Bascule des littéraux du code** : `roles.ts`, `permissions.ts`, `scope.ts`, `rbac.ts`,
   composants, seeds → nouvelles valeurs, **en une fois**. Comme serveur normalise en écriture
   et client au boot, aucune fenêtre où ancien/nouveau coexistent dans les comparaisons.
6. **Vieux bundles JS non rechargés** : ils lisent du nouveau qu'ils ne comprennent pas →
   rôle mal résolu. Mitigation : **pas de service worker** (décision M4) → un simple reload
   récupère le nouveau bundle. App interne (église) → fenêtre courte, acceptable. On peut
   ajouter un `GET /health` qui expose une version et un toast « recharger » si tu veux zéro
   fenêtre (optionnel).

Le backfill serveur + la normalisation en écriture rendent la migration **sûre quel que soit
l'ordre** (serveur d'abord ou client d'abord) et **rejouable**.

---

## 3. Découpage du travail (Tier B)

### 3.1 Le moteur (nouveau, testé)
- `packages/shared/migrate.ts` : `LEVEL_MAP`, `INTEGRATION_MAP`, `CURSUS_MAP`, `BAPTISM_MAP`,
  `DEPT_TYPE_MAP`, `TASK_STATUS_MAP`, `ADN_FIELD_MAP` + `canonicalize(collection, item)`.
- `packages/shared/migrate.check.ts` (ajouté à `npm test`) : couverture + idempotence.

### 3.2 Types (cible)
- `src/types.ts` : unions `CommunityLevel`, `IntegrationState`, `PastoralCursus`,
  `BaptismStatus`, `DeptFunction`, `DepartmentType`, `ProjectActionStatus` → nouvelles valeurs.
- `packages/shared/schemas/report.ts` : `rapportAdnSchema` → `nouveauxH/nouveauxF/ojH/ojF`.

### 3.3 Serveur
- `server/guards.ts` `applyWrite` : `items.map(it => canonicalize(name, it))` avant merge.
- `server/db.ts` : backfill `m5_migrated` (blobs + KV permissions + capability_overrides).
- `server/roles`/`rbac`/`scope` (si littéraux présents) : nouvelles valeurs.

### 3.4 Client
- Sweep boot `bc_m5_migrated` (dans `src/data/index.ts` ou `main.tsx`).
- Bascule littéraux : `src/data/roles.ts`, `permissions.ts`, `scope.ts`, composants
  (`GovernanceView` `OVERRIDE_SUBJECT_VALUES`, tout `=== 'Boss'` etc.), seeds
  `mockData.ts`/`testDataset.ts`.
- `rapport_adn` producteurs/consommateurs : `EventsView.tsx:302`, `src/data/adn.ts:52`,
  `AdnView.tsx:167`.

### 3.5 Découplage volontaire (NE PAS faire dans M5)
- **Vocabulaire des rôles** (`'Super Admin'`, `'Pasteur Principal'`, `'Boss'`…) : c'est une
  couche **dérivée**, pas de la donnée stockée. `resolveMemberRole` mappe les nouvelles
  valeurs vers les **noms de rôles existants** ; la matrice reste clés = noms de rôles. Migrer
  les rôles = blast radius énorme (rbac, matrice, `simulatedRole`) pour zéro donnée. **Exclu.**
- **Chaînes de capacités** (`view_*` anglais vs `consulter_*` FR) : cosmétique, hors §3-enums,
  touche lourdement la matrice. **Exclu / optionnel plus tard.**

---

## 4. Décisions (Tier C) — ✅ ARBITRÉES

1. **`DepartmentFunction`** → **snake_case en gardant le sur-ensemble réel** (tresorier,
   responsable_section conservés ; coach/leader restent sur level). ✅ fait.
2. **`ProjectScope`** → **`branche` + champ `project.branch`** (church/light migrés en
   `scope:'branche', branch:'church'|'light'`). ✅ fait.
3. **Tier D** → **exclu de M5**, un mini-plan feature séparé sera préparé (enum à confirmer). ⏳

### Décisions initiales (archivé)

1. **`DepartmentFunction`** — la cible §3 (`responsable, adjoint, coach, leader, membre,
   capitaine, responsable_zone, responsable_commune`) **supprime `Trésorier` et
   `Responsable de section`** (réels dans l'app) et **ajoute `coach`/`leader`** qui vivent en
   fait sur `member.level`. Reco : **snake_case en gardant le sur-ensemble réel**
   (`responsable, adjoint, tresorier, responsable_section, membre, capitaine, responsable_zone,
   responsable_commune`), traiter la liste §3 comme illustrative. OK ?
2. **`ProjectScope`** — `both→transverse`, `ministry→ministere` sont propres, mais
   **`church`/`light` → `branche` PERD l'identité de branche** du projet. Options : (a) garder
   church/light tels quels et n'introduire `transverse`/`ministere` que pour both/ministry ;
   (b) passer à `branche` + ajouter un champ `project.branch`. Reco : **(a)** (aucune perte,
   diff minimal). Ton choix ?
3. **Tier D** — je **l'exclus de M5** (ce sont des modélisations absentes, pas des migrations).
   Confirmes-tu, ou tu veux un mini-plan feature séparé pour l'un d'eux (ex. `EventType`) ?

---

## 5. Vérification & rollback

- **Tests** : `migrate.check.ts` (bijection/idempotence) + suites existantes reverdies avec
  nouvelles valeurs. `npx tsc --noEmit` attrape tout littéral oublié (les unions changent).
- **Smoke live** : boot serveur → backfill s'exécute une fois (flag), 2ᵉ boot = no-op ;
  login client → sweep localStorage ; créer/éditer un membre → valeurs nouvelles persistées ;
  vieux payload (ancien client simulé) PUT d'anciennes valeurs → normalisé côté serveur.
- **Rollback** : la seule chose irréversible est le backfill des blobs. Filet : `db.ts` dump
  la table `collections` dans un fichier `collections.pre-m5.json` avant backfill (une ligne).
  Les maps étant bijectives, un `canonicalizeInverse` reste possible en secours.

---

## 6. Estimation

- Tier B : ~1 session. Moteur + types + 2 boundaries + backfill + bascule littéraux (mécanique,
  large mais `tsc` guide) + tests + smoke.
- Tier C : trivial une fois les 2 décisions prises (mêmes maps).
- Tier D : hors périmètre.
