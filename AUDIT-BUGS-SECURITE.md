# BloomCore — Audit bugs & sécurité

_Date : 2026-07-07 · Revue des 4 axes : sécurité serveur, sécurité/données frontend, bugs runtime, conformité specs↔code._
_Méthode : 4 audits en parallèle + vérification manuelle de tous les findings critiques dans le code (fichier:ligne confirmés)._

---

## Résumé exécutif

**La sécurité n'est PAS assurée en l'état — mais rien n'est encore en production**, donc tout est corrigeable avant exposition. L'app reste utilisable en local (offline-first localStorage) ; les trous concernent le **serveur `server/`** quand il sera déployé, et la **robustesse du frontend** (crashs, pertes de données).

Point de bascule à comprendre : **tout le contrôle de confidentialité et de scope vit côté client.** Le serveur authentifie mais n'autorise qu'en écriture — pas en lecture. Dès que le serveur est joignable par un vrai réseau, un simple « Membre » peut lire toutes les données. Tant que l'app tourne en localStorage seul, le risque est latent.

### Top 6 à corriger avant toute mise en ligne
1. ✅ **[CRITIQUE serveur — CORRIGÉ]** Secret d'auth par défaut → forge de token Super Admin. `server/auth.ts`, `server/index.ts`.
2. ✅ **[CRITIQUE serveur — CORRIGÉ]** Aucune autorisation en lecture → tout membre lit tous les rapports confidentiels + PII. `server/index.ts` + `filterReadable`.
3. ✅ **[CRITIQUE serveur — CORRIGÉ]** Suppression hors-scope par omission → un Responsable peut effacer toute l'église. `server/rbac.ts` + `server/guards.ts`.
4. ✅ **[HAUTE serveur — CORRIGÉ]** Audits forgeables + spam email/SMS ouvert à tout membre. `server/rbac.ts`.
5. ✅ **[CRASH frontend — CORRIGÉ]** `load()` sans try/catch → une clé localStorage corrompue = écran blanc total. `src/data/index.ts`.
6. ✅ **[BUG données — CORRIGÉ]** Clôture de culte non persistée → cultes re-clôturables, rapports et stats doublés. `src/components/EventsView.tsx` + `App.tsx`.

_Les 4 trous serveur (1–4) + la robustesse frontend (C1/C2/C3, F3, B1, B2, B4/B6) + correctifs métier (D1/D2/D4) sont corrigés et vérifiés en live le 2026-07-07 — voir §1 et §5. Restent : durcissement serveur S5–S9, bugs mineurs B3/B5/B8/E*, et D3 (cultes récurrents = feature à construire)._

### ✅ Correctifs frontend & métier appliqués (2026-07-07)

Batch 2 (après les 4 trous serveur), tous vérifiés — `tsc` clean, checks OK, parcours live Playwright :
- **C1** `load()` try/catch → seed si JSON corrompu (plus d'écran blanc). **C2** `save()` try/catch (plus de crash QuotaExceeded) + helper partagé `src/lib/image.ts:downscaleImage` (resize 200px, **B6** gère HEIC/erreur) utilisé par le form membre ET le quick-form ADN. **C3** `departments` normalisé au bootstrap.
- **F3** logout purge toutes les clés `bc_*` + reload → vérifié : un membre injecté par l'utilisateur A disparaît, retour aux seeds, aucune fuite.
- **B1** clôture de culte persistée via `onUpdateEvent` → vérifié : après reload l'événement reste « Clôturé », plus de re-clôture ni de doublon.
- **B2** sync serveur désactivée (`enableSync()`) jusqu'à résolution du bootstrap → plus d'écrasement LWW au montage. **B4** projets + bus persistés en localStorage → vérifié stables après changement d'onglet.
- **D1** alerte « réception à valider » ignore `receptionValidated` (plus de faux positifs). **D2** `view_integration` aligné sur `CAN_ACCESS_INTEGRATION` (Coach/Leader/ADN/Portier/GDC ne voient plus l'onglet). **D4** transfert de branche verrouillé hors ligne pastorale sur un membre existant.
- **D3 non fait (feature, pas bug)** : `Event.recurrence` est un champ mort sans producteur ni consommateur ; générer les cultes récurrents (§10) demande une UI + un générateur idempotent + une décision produit (horizon, cadence). À construire proprement, pas à demi-implémenter.

---

## 1. Sécurité serveur (`server/`)

> **✅ MISE À JOUR 2026-07-07 — S1, S2, S3, S4 CORRIGÉS et vérifiés en live (HTTP).**
> Détails des correctifs et de la vérification en fin de section. S5–S9 restent à faire (durcissement).

> Toutes ces lignes ont été relues et confirmées manuellement.

### CRITIQUE

**S1 — Secret par défaut = contournement total de l'auth.**
`auth.ts:7` : `const TOKEN_SECRET = process.env.AUTH_SECRET || 'bloomcore-dev-secret-change-in-prod'`. Le token de session est un HMAC signé avec ce secret. Sans `AUTH_SECRET` (ou avec la valeur d'exemple `.env.example:16` `change-me`), l'attaquant connaît le secret et forge un token valide pour **n'importe quel memberId, y compris Super Admin**. Même problème pour le webhook `index.ts:270` (`WEBHOOK_SECRET || 'change-me'`).
**Fix :** refuser de démarrer si `AUTH_SECRET`/`ACADEMY_WEBHOOK_SECRET` absents ou faibles (hors `NODE_ENV=test`). ~4 lignes au boot.

**S2 — Aucune autorisation en LECTURE.**
`index.ts:173-178` (`/bootstrap`) et `index.ts:180-189` (`GET /:name`) sont derrière `requireAuth` seul — jamais de scope ni de filtre. Un simple « Membre » authentifié récupère `reports` complet (dont `rapport_pastoral` et `rapport_suivi_coach` marqués `confidential`), `members` complet (téléphone, email, GPS, KPI santé de tous), `admins`, `delegations`. Le filtre confidentiel n'existe **que côté client** (`ReportsView.tsx:46-50`, `DashboardView.tsx`) → un `console.log(reports)` ou l'onglet Réseau expose tout.
_Rassurant :_ la table `credentials` (hashes) est une table SQLite séparée, **jamais** dans les collections exposées — les mots de passe ne fuitent pas par cette route.
**Fix :** porte de lecture par collection dans `/bootstrap` et `GET /:name` selon `ctx.roles` — masquer les `confidential` non destinés au rôle, restreindre `members` au scope (`inMemberScope` déjà écrit, à appliquer serveur).

**S3 — Suppression hors-scope par omission (tombstone-by-omission).**
`applyWrite` (`guards.ts:64-71`) transforme en tombstone **tout id stocké absent du payload**. Mais `assertCanWrite` ne scope que les items *présents et modifiés* (`touchedItems`, `rbac.ts:72-79`). Donc les suppressions ne passent par **aucun** contrôle. Un `Responsable` envoie `PUT /members` avec seulement ses membres → tous les autres membres de l'église sont tombstonés. Idem `reports` (effacer les rapports confidentiels d'autrui), via `PUT` ou `/sync/batch`.
**Fix :** dans `assertCanWrite`, calculer les ids stockés absents du payload et exiger qu'ils soient dans le scope de l'opérateur (on ne peut supprimer que ce qu'on peut écrire).

### HAUTE

**S4 — Audits forgeables + fan-out multicanal ouvert.**
`rbac.ts:152-154` : le `default` autorise **tout membre authentifié** à écrire `audits` et `notifications`.
- Audit : le append-only bloque la *mutation* d'entrées existantes mais pas l'*insertion* d'entrées avec `operatorId`/`operatorName` falsifiés → pollution du « journal inviolable ».
- Notifications : `PUT /notifications` avec `title`/`message`/`targetMemberId` arbitraires déclenche le fan-out email/SMS/WhatsApp (`index.ts:203-204`) → phishing au nom de l'église vers n'importe qui.
**Fix :** `audits` → imposer `operatorId === ctx.member.id` ou réserver au serveur ; `notifications` → écriture réservée aux rôles d'encadrement, ou membre limité à ses propres notifs (dismiss/lu).

### ✅ Correctifs S1–S4 (2026-07-07) — appliqués & vérifiés

- **S1** — `auth.ts` : `requireSecret(name, weakDefaults)` remplace les fallbacks. En `NODE_ENV=production`, refus de démarrer si secret absent/<16 car./par défaut (idem webhook `index.ts`). En dev/test, repli déterministe. `.env.example` mis à jour.
- **S2** — `rbac.ts:filterReadable(name, ctx, items)` câblé dans `/bootstrap` et `GET /:name`. `reports` : filtre confidentiel §8.3 + branche. `members` : scope réel (simple membre → sa seule fiche ; fail-open de `inMemberScope` court-circuité). `admins`/`delegations`/`certifications`/`integration_reports` : encadrement seul.
- **S3** — `assertCanWrite` scope désormais aussi les **suppressions par omission** (`removedItems`) pour `members`/`reports`/`events`. Le `default` du switch passe de « autoriser » à **refuser**.
- **S4** — cas explicites `audits` (operatorId == soi) et `notifications` (émission vers autrui réservée à l'encadrement).
- **Tests** : `rbac.check.ts` étendu (assertions S2/S3/S4), les 4 `*.check.ts` + `tsc` passent.
- **Vérification live (HTTP)** : Super Admin ne voit pas le confidentiel (§8.3) ✓ · Pasteur Titulaire voit `rep_5` confidentiel ✓ · simple membre (Nouveau) → bootstrap `members=1` (lui seul), 0 confidentiel ✓ · PUT members partiel → **403** ✓ · notif vers autrui + audit forgé (simple membre) → **403** ✓ · prod sans secret → refus de démarrer ✓.

### ✅ Bugs mineurs frontend (2026-07-07) — appliqués

- **B5** `api.ts` : `apiPut` rejoue maintenant les 401 (token expiré → réussira après re-login) et 5xx, mais PAS les 400/403 (rejet permanent qui bouclerait). Plus de perte silencieuse sur token expiré.
- **B8** `App.tsx` : helper `genId(prefix)` (timestamp + suffixe aléatoire) pour tous les IDs d'audit → plus de clés React dupliquées quand `removeSection` émet N audits dans la même milliseconde.
- **E1** `ProfileView` : early-return si `operator` undefined (serveur renvoyant `members: []`) → plus de crash sur `operator.firstName`.
- **E2** `ReportsView` : `content` défaut à `{}` (44 déréférencements) → un rapport sans `content` n'ouvre plus un détail qui crashe. Vérifié en live : détail rapport + profil s'affichent, zéro erreur page.
- **B3 [CORRIGÉ]** — `departments` remonté dans App comme source unique (`App.tsx`) ; MinisteresView et DepartmentsView lisent la prop `departments` et mutent via `onUpdateDepartments`, plus de copie locale qui s'écrase. Retiré de la boucle localStorage-only du bootstrap. Vérifié en live : section créée dans Départements → survit au passage par Ministères et retour, zéro erreur.
- **D3 [CORRIGÉ — feature construite]** — cultes récurrents (WORKFLOWS §10) : case « Répéter chaque semaine » dans le modal de création (`EventsView`) → génère 8 occurrences hebdomadaires en une passe (idempotent), le champ `Event.recurrence='weekly'` est enfin vivant. Arithmétique de dates en UTC pur (pas de dérive de fuseau). Vérifié en live : 8 événements espacés de 7 jours (05/07→23/08), tous `recurrence=weekly`.
- **D5 [CORRIGÉ]** — KPI « au rouge » : clause 2 « sans contact > 7j » ajoutée à `isRed` (`kpi.ts`) via un nouveau champ `Member.lastContact` (horloge démarrant à l'enregistrement, réinitialisée à chaque contact : rapport de suivi coach ou suivi d'intégration réel). Vérifié en live : un membre « Suivi » non contacté depuis 30j passe le compteur de 2→3, un `lastContact` récent le ramène à 2.
- **D6 [CORRIGÉ]** — notif « au rouge » : émise à chaque destinataire (Ministre de tutelle + coach assigné `mentorId` + Responsable du département), dédupliquée (`notificationRules.ts`). Vérifié par test unitaire (mentor + responsable destinataires).

### 🎯 Audit intégralement traité (2026-07-07)

Tous les findings de l'audit sont corrigés et vérifiés (serveur S1–S9, frontend C1–C3/F3/B1–B8/E1/E2, métier D1–D6, refactor B3). Reste seulement, hors audit, la note S9 (token de reset dans l'outbox = purge côté transport réel) et l'observation que `days` de la notif « au rouge » utilise l'ancienneté d'enregistrement (indépendant de la nouvelle clause `lastContact` de D5 — cohérent : la notif alerte sur l'ancienneté, le KPI sur l'inactivité).

### ✅ Durcissement S5–S9 (2026-07-07) — appliqués & vérifiés en live

- **S5** — rate-limiting en mémoire sur `/auth/login` (5 échecs par IP+identifiant → 429, verrou 15 min) + hash factice `DUMMY_HASH` pour égaliser le timing (plus d'oracle d'existence de compte). Vérifié : 6e tentative → 429, autre identifiant → 200.
- **S6** — anti-rejeu webhook : colonne `webhook_events.signature UNIQUE` + `INSERT OR IGNORE` → rejeu = 409. Vérifié : envoi valide 202, rejeu identique 409.
- **S7** — mot de passe démo `bloom2026` seedé **uniquement hors production** (`seed.ts`) ; en prod, aucun credential seedé (activation obligatoire) sauf `SEED_DEMO_PASSWORD` explicite. Min mot de passe 6 → 8.
- **S8** — CORS par allow-list (`CORS_ORIGINS`, plus de réflexion aveugle) + headers `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`. Vérifié : `evil.com` sans en-tête ACAO, origine autorisée OK.
- **S9** — adresses masquées dans les logs `notify` (`fa***@gmail.com`). _Reste : le token de reset en clair dans `outbox.body` est inhérent au journal des envois — prévoir une purge courte côté transport réel._

### Historique — findings d'origine (résolus ci-dessus)

- **S5 [MOYENNE]** Aucun rate-limiting sur `/auth/*` (`index.ts:63+`) + oracle d'existence (401 sans `verifyPassword` si compte inconnu, `index.ts:67-68`). Combiné au mot de passe démo partagé, brute-force trivial. **Fix :** compteur d'échecs par identifiant+IP → 429.
- **S6 [MOYENNE]** Webhook rejouable dans la fenêtre 5 min (`index.ts:273-291`) : HMAC timing-safe OK, timestamp OK, mais pas de nonce/idempotence. Impact latent (payload stocké, pas traité) mais réel une fois le traitement branché. **Fix :** id d'événement signé + contrainte `UNIQUE`.
- **S7 [MOYENNE]** Mot de passe démo `bloom2026` partagé par tous les membres seedés (`seed.ts:45`) + politique min 6 sans complexité. **Fix :** invalider le démo hors environnement de démo, forcer l'activation.
- **S8 [BASSE]** CORS réfléchissant `Access-Control-Allow-Origin: req.headers.origin` (`index.ts:24`), pas de headers de durcissement. Risque CSRF faible (auth par Bearer, pas cookie) mais permissif. **Fix :** allow-list d'origines.
- **S9 [BASSE]** Token de reset stocké en clair dans `outbox.body` et loggé (`notify.ts:33`, `index.ts:93`) → quiconque lit les logs/outbox récupère des tokens valides. **Fix :** ne pas logger l'adresse complète, purge courte de l'outbox.

---

## 2. Sécurité & intégrité données — frontend (`src/`)

**F1 [CRITIQUE — corollaire de S2]** Le filtrage confidentiel est **purement cosmétique** : la donnée confidentielle est en mémoire, seul son rendu est masqué (`ReportsView.tsx:35-53`, `DashboardView.tsx`). Corrigé par S2 (filtrer à la source serveur).

**F2 [HAUTE]** Simulateur « SIMULER PROFIL (TEST) » (`Sidebar.tsx:270-285`) : tout utilisateur connecté clique « Super Admin » → `canView` renvoie `true` partout, tous les onglets s'ouvrent, et comme toute la donnée est déjà en mémoire (S2), il consulte tout.
_Nuance :_ le serveur fait autorité en **écriture** (`rbac.ts:31-42` recalcule les vrais rôles) — le simulateur ne permet pas d'écrire en Super Admin, mais il ouvre toute la **lecture** côté client.
**Fix :** retirer le simulateur du build prod (`import.meta.env.DEV`) + corriger S2.

**F3 [HAUTE]** Logout ne purge pas les données métier. `handleLogout` (`App.tsx:117-120`) efface le token + memberId mais laisse `bc_members`, `bc_reports`, `bc_audits`… intacts. Sur un **poste partagé** (contexte église), l'utilisateur B voit les données de A (téléphones, rapports confidentiels), et si le serveur est éteint, **définitivement**.
**Fix :** purger toutes les clés `bc_*` de collections au logout (boucle sur `SYNCED_NAMES` + `bc_syncQueue` + `bc_loggedInMemberId`). Couvre aussi la collision de clés inter-comptes.

**F4 [MOYENNE]** Pas de secret bundlé (vérifié : seule `VITE_API_BASE` lue côté client, pas de sourcemap prod). RAS côté exposition frontend.

**Bien fait (frontend) :** aucun `dangerouslySetInnerHTML` (pas de vecteur XSS actif — champs libres échappés par React) · `apiLogin` distingue `invalid` (pas de fallback mock) de `network` · anti-énumération sur activation/reset · garde-fou Super Admin non désactivable.

---

## 3. Bugs runtime (crash & perte de données)

### CRASH

**C1 [CRASH]** `load()` sans try/catch (`data/index.ts:35-38`). Une clé `bc_*` corrompue (quota interrompu, édition manuelle) → `JSON.parse` throw dans les initialiseurs `useState` → **écran blanc, app inutilisable**, impossible même de se délogger. **Fix (1 ligne) :** `try { ... } catch { return seed; }`.

**C2 [CRASH]** Photo du quick-form ADN non redimensionnée (`App.tsx:818-822`) + `save()` sans try/catch (`data/index.ts:41`). Une photo de téléphone 12 MP (~10-15 Mo base64 > quota ~5 Mo) → `QuotaExceededError` non attrapée dans un useEffect → crash en boucle. Le formulaire membre, lui, redimensionne (`MembersView.tsx:180-196`) ; le quick-form non. **Fix :** réutiliser le resize canvas + try/catch dans `save()`.

**C3 [CRASH]** `Object.keys(m.departments)` non gardé sur ~11 sites (`MembersView.tsx:154,156,264,664,777`, `DepartmentsView.tsx:93`, `Member360View.tsx:92,456,479`, `scope.ts:24,45`, `ProfileView.tsx:176`) alors qu'ailleurs le code garde avec `?? {}`. Un membre sans `departments` renvoyé par le serveur → TypeError, vue morte. **Fix (1 ligne, couvre tout) :** normaliser au bootstrap `data.members.map(m => ({...m, departments: m.departments ?? {}}))`.

### BUG (données)

**B1 [BUG]** Clôture de culte : `targetEvent.closed = true` (`EventsView.tsx:266`) mute l'objet en place, aucun `setEvents` → jamais persisté. Au reload l'événement est de nouveau « En cours » → re-clôturable → 3 rapports (portiers/ADN/culte) re-ajoutés → **affluence, moisson et Sunday Stats doublés**. `EventsView` ne reçoit aucune prop de persistance d'événement. **Fix :** passer `onUpdateEvent` depuis App (`setEvents(prev => prev.map(...))`).

**B2 [BUG]** `save()` au premier mount pousse l'état localStorage/seed vers le serveur **avant** le retour du bootstrap (`App.tsx:69-74` + `95-113`). Sur un 2e appareil aux données anciennes, le PUT peut écraser côté serveur les saisies d'un autre appareil (LWW whole-array). Deux onglets ouverts : l'onglet resté ouvert ré-écrit tout depuis son état périmé. **Fix :** `useRef` « hydraté » posé à la résolution du bootstrap, ne `apiPut` qu'après.

**B3 [BUG]** `bc_departments` possédé par deux vues à états indépendants (`MinisteresView` + `DepartmentsView`) → un drag-and-drop dans Ministères écrase les sections créées dans Départements. **Fix :** merger sur `load('bc_departments')` courant au moment d'écrire, ou remonter `departments` dans App.

**B4 [BUG]** Bus et projets = état 100 % session (`BloomBusView.tsx:127`, `ProjectsView.tsx:30`, `useProjects`/`useBusLines` = seeds statiques `data/index.ts:66-67`). Créer un bus / un projet / cocher un objectif → changer d'onglet → **tout disparaît sans avertissement**. Le Dashboard « Projets en cours » ne reflète jamais rien. **Fix :** `useState(() => load('bc_projects', seed))` + effet `save`, idem `bc_bus_lines`.

**B5 [BUG]** `apiPut` ne rejoue que les 5xx (`api.ts:94`) : un 401 (token expiré) ou 400 → écriture perdue silencieusement. **Fix :** `if (!res.ok) enqueueSync(...)`.

**B6 [BUG]** Upload photo membre sans `img.onerror` (`MembersView.tsx:183-195`) : photo HEIC iPhone → `img.onload` jamais déclenché → no-op silencieux, l'utilisateur croit la photo enregistrée. **Fix :** `img.onerror` + garde `getContext` null.

**B7 [BUG]** Période « Personnalisé » du Dashboard : tant que les 2 dates ne sont pas remplies, `effectivePeriod = 'custom'` → `periodRange('custom')` = depuis 1970 → tuiles affichent le total all-time sous le libellé « Personnalisé ». `from > to` → tout à 0 sans explication. **Fix :** retomber sur `'week'` tant que `!(from && to)` ou `from > to`.

**B8 [BUG mineur]** IDs `Date.now()` en collision dans la même milliseconde (`App.tsx:282`, `DepartmentsView.tsx:192` `removeSection` boucle synchrone) → clés React dupliquées dans l'Audit. **Fix :** suffixer `_${Math.random().toString(36).slice(2,7)}` comme `mkNotif` le fait déjà.

_Vérifiés sains :_ ordre des hooks Dashboard OK · tuile « À traiter » câblée · `Ring` division par zéro gardée · quirk `key` sur composants custom : aucune violation · quilibre notifications gardé (`return prev`).

---

## 4. Conformité specs ↔ code

### Vrais bugs

**D1 [BUG]** Alerte « Réception à valider » ne vérifie pas `receptionValidated` (`notificationRules.ts:31,44`). Un membre dont la réception est **déjà validée** (mais toujours « En attente » par design, WORKFLOWS §2.1) continue de générer des alertes « à valider » jusqu'à J+7. Le Dashboard, lui, gate bien sur `receptionValidated === false` → l'incohérence confirme le bug. **Fix (1 clause) :** `else if (days > delays.pending && !m.receptionValidated)`.

**D2 [BUG]** `view_integration` accordé à Coach, Leader, ADN, Portier, GDC (`mockData.ts:582`) → ces 5 rôles voient l'onglet Intégration (Espace Intégrateur) qu'aucune de leurs navs de spec (PROFILS-INTERFACES §7/8/10/11/12.2) ne liste. **Fix :** restreindre `view_integration` à Intégration + ligne pastorale + Responsable, ou confirmer que c'est voulu.

**D3 [BUG]** Cultes récurrents (WORKFLOWS §10) morts : `Event.recurrence?: 'weekly'` existe (`types.ts:183`) mais n'est **jamais défini ni consommé** — aucune génération d'instances hebdo. Champ mort. **Fix :** générer les occurrences ou retirer le champ jusqu'à implémentation.

**D4 [BUG mineur]** Transfert de branche (WORKFLOWS §4) : le `<select>` branche est éditable par **Responsable** (`MembersView.tsx:612-617,1153-1161`) sans capacité dédiée, alors que §4.1 le réserve plutôt à la console Super Admin. **Fix :** capacité `transfer_branch` dédiée.

**D5 [BUG mineur]** « Au rouge » (KPIS.md Définitions) = « en attente > 7j OU sans contact > 7j » ; `isRed` (`kpi.ts:63-69`) ne couvre que la 1ère clause (pas de champ `lastContact`). Clause inactivité non implémentée.

**D6 [écart mineur]** Notif « au rouge » ne cible que le Ministre de tutelle (`notificationRules.ts:42`) ; NOTIFICATIONS.md prévoit aussi Coach/Leader/Responsable assigné.

### Doc périmée (mettre à jour le doc, pas le code — évolutions assumées)

- KPIS.md §1 « Membres actifs » : doc dit « ≤ 1 mois filtrable » ; code = fenêtre fixe **37 j** (`activeMemberWindow`).
- KPIS.md §1 « Bloom Bus actifs » : doc dit « ≥ 1 rapport » ; code = **≥ 2 semaines distinctes** (`activeBusIds`).
- KPIS.md §1 « Moisson » : doc combinée ; code splitté **ADN / Bus** (`moissonBySource`).
- Santé globale 5 critères : **conforme** KPIS.md §2.

### Assumé (ponytail, non-bugs)

- `view_projects = ALL_PROFILES` (Membre/Nouveau voient Projets) : volontaire (un équipier projet peut être de tout profil).
- Membre complet en doublon téléphone : flag + notif, pas de blocage (pas de merge auto, P4.15).

**Bien fait (conformité) :** téléphone unique **bloquant** à la création (ADN `App.tsx:393`, membre `MembersView.tsx:282`) · délégation de droits respecte l'interdit `rapport_bloom_bus_member` · déclencheurs de notif métier (enregistrement, validation, promotion, transfert, baptême, drachme) bien câblés.

---

## Plan de correction priorisé

**Avant toute mise en ligne du serveur (bloquant) :**
1. S1 — refuser le boot sans secrets forts.
2. S2 — filtrage lecture par rôle dans `/bootstrap` + `GET /:name` (neutralise aussi F1, volet lecture de F2).
3. S3 — scoper les suppressions par omission dans `assertCanWrite`.
4. S4 — verrouiller `audits` + `notifications`.

**Robustesse frontend (à faire vite, ROI élevé, souvent 1 ligne) :**
5. C1 + C2 + C3 — try/catch `load`/`save` + normaliser `departments` au bootstrap.
6. F3 — purger localStorage au logout.
7. B1 — persister la clôture de culte (sinon double-comptage réel).
8. B2 — ne pas pusher l'état au mount avant bootstrap.

**Correctifs métier :**
9. D1 — `!receptionValidated` dans l'alerte 3j.
10. B4 — persister bus + projets.
11. D2 / D3 / D4 — permissions Intégration, cultes récurrents, capacité transfert de branche.

**Durcissement (post-lancement) :** S5–S9, B5–B8, D5–D6.

**Documentation :** réaligner KPIS.md sur le code (membres actifs 37j, bus ≥2 semaines, moisson splittée).

---

## Revue 2026-07-11 — lot Bloom Bus + profils de test

_Méthode : 3 audits parallèles (sécu serveur, bugs frontend, non-régression) + vérification empirique HTTP live de chaque finding critique + smoke Playwright des 17 vues._

### ✅ Corrigés & vérifiés

- **[CRITIQUE serveur] Fuite de scope Capitaine de Bus.** `server/rbac.ts` mappait le rôle `'Capitaine de Bus'` vers la chaîne `'Capitaine'`, non reconnue par `inMemberScope` (`src/data/scope.ts:38`) → fail-open `return true` (scope.ts:62). Un Capitaine authentifié **lisait/écrivait TOUS les membres** de l'église (re-ouverture de S2/S3). Fix : `['Capitaine de Bus', 'Capitaine de Bus']`. Vérifié live : Capitaine 33→5 membres (son bus), PUT hors-scope → 403.
- **[HAUTE serveur] Comptes admin de test seedés en prod.** `adm_mem_test_1` (Super Admin) / `adm_mem_test_2` (Admin) + 18 `TEST_PROFILES` étaient seedés inconditionnellement (`ensureSeeded`) → backdoor Super Admin si `SEED_DEMO_PASSWORD` défini (staging) ou `npm start` sans `NODE_ENV`. Fix : `SEED_TEST_PROFILES` gate (`server/seed.ts`) — exclus hors dev/`SEED_DEMO_PASSWORD`.
- **[Défense en profondeur serveur] Garde champ-niveau sur auto-édition.** Aucun contrôle n'empêchait un opérateur non full-scope de modifier les champs privilégiés de SA fiche ; `resolveRoles` lisant `member.departments`, une auto-écriture `departments:{x:'Super Admin'}` escaladerait — bloquée aujourd'hui uniquement par effet de bord du guard `removedItems`. Ajout d'un rejet explicite (`server/rbac.ts`, case members) sur `departments/level/pastoralCursus/bloomBusId/deptAttachmentStatus/testRole` en self-edit. `testRole` reste UI-only (jamais lu serveur). Vérifié : Coach self-escalade → 403.
- **[Correctness serveur] Scoping sur bus figés.** `rbac.ts` scopait Zone/Commune avec `INITIAL_BUS_LINES` (seed) au lieu de la collection live `bus_lines` → zones/communes périmées après tout ajout/déplacement de bus. Fix : `readCollection('bus_lines')` aux 2 sites.
- **[HAUTE frontend] Corruption KPI `presenceCulte`.** `BloomBusView.tsx` remettait `presenceCulte: 1` à chaque rapport santé (le membre tombait au minimum). Fix : préserver `targetMember.healthKPIs?.presenceCulte || 3`.
- **[HAUTE frontend] Contournement de validation Bloom Bus.** Les membres `deptAttachmentStatus:'pending'` apparaissaient aussi dans l'onglet Stagiaires → promotion Boss sans passer par « Réceptions à valider ». Fix : `deptStagiaires` exclut les `pending`.
- **[MOYENNE frontend] `bloom_bus_reject`** remettait le statut à `undefined` (perte de traçabilité) → désormais `'rejected'`. **Popup de confirmation** validate/reject était **vide** → texte ajouté. **Préremplissage MemberFormModal** relancé par des deps instables (`departments`/`busLines`) écrasait la saisie → deps réduites à `[open]`. **`ROLE_HOME_DEPT`** primait sur l'affectation réelle (un Responsable de Louange gérait Prod & Tech) → affectation réelle d'abord.
- **[BASSE frontend] Attribution d'audit** codée en dur « Affeny Grah/mem_1 » dans `handleUpdateMember`/`handleDeleteMember` → utilise `operator`.

### ✅ Corrigés 2e passe (2026-07-11) — items précédemment ouverts

- **[ARCHITECTURE] Écriture scoped ↔ PUT whole-array — RÉSOLU.** Merge scope-aware : `preservedIds(name, ctx)` (rbac.ts) dérive de `filterReadable` les ids hors de la portée de LECTURE de l'opérateur (symétrie lecture/écriture) ; `removedItems` les exclut (plus de 403) et `applyWrite(…, preserve)` (guards.ts) ne les tombstone plus. Full-scope → ensemble vide → LWW inchangé. Vérifié live : Capitaine enregistre un membre → **200 persisté**, total 33→34 sans perte ; auto-escalade toujours **403**. Test `rbac.check.ts` (S3) réécrit sur le nouveau modèle.
- **[MOYENNE] Hiérarchie de rapports miroir serveur — RÉSOLU.** `assertCanWrite('reports')` applique `canFillReportFor` (miroir client) sur les rapports `rapport_bloom_bus_member`. Vérifié : Capitaine rapporte pour un membre de son bus → 200 ; hors hiérarchie → 403.
- **Bugs frontend restants — CORRIGÉS** : anneau de complétude limité aux membres remplissables (`directReportsOf`) ; auto-rattachement au 1er bus exclu pour l'origine Bloom Bus ; affectations dept videables (plus de repli fantôme) ; re-soumission d'une semaine = upsert par id déterministe (plus de doublon) ; ids FormBuilder suffixés aléatoire ; KPIs bus (`busVisitesTotal`/`busPresenceCulteTotal`) filtrent sur `weekOf` ; déconnexion si le membre connecté n'est plus dans la liste serveur ; popup de confirmation validate/reject renseignée.

### ⚠️ Laissés volontairement (décision produit / hors périmètre)

- **[BASSE] `scope.ts:62` fail-open** conservé : non exploitable en écriture (tous les rôles `view_members` sont mappés, vérifié) ; le passer fail-closed changerait la visibilité membres des rôles ADN/Portier/GDC/Intégration → décision produit.
- **Frontière de semaine en fuseau < UTC** (kpi.ts `new Date(r.date)` vs minuit local) : invisible à Abidjan (UTC+0) ; fix = parse local partagé, touche le cœur KPI → à faire si déploiement multi-fuseau.
- **Culte « absent »** (pas d'option), tuiles de compteurs Intégration légèrement divergentes : cosmétique/feature.

_État : `tsc` clean, `npm test` 7/7, `npm run build` OK, 17/17 vues sans erreur console. Scope vérifié live : Super Admin 33 · Resp. Zone 8 · Capitaine 5 · Coach 1 · Membre 1 ; aucun rapport confidentiel fuité ; enregistrement Bloom Bus persisté sans perte de données ; hiérarchie de rapports appliquée serveur._
