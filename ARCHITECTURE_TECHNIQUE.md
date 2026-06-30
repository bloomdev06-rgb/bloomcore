# BloomCore — Document d'Architecture Technique

> Référence d'implémentation dérivée du *Cahier des Charges Consolidé v2.0*. Décrit le modèle de données, les contrats API, le moteur de permissions et l'organisation du code. Statut : **à valider avant build**.

---

## 1. Vue d'ensemble

### 1.1 Monorepo
```
bloomcore/
├── package.json                 # npm workspaces
├── packages/
│   └── shared/                  # types, enums, design tokens, schémas Zod
├── apps/
│   ├── api/                     # Express + Prisma + PostgreSQL
│   └── web/                     # React + Vite + Tailwind (PWA)
└── docs/                        # cahier des charges, architecture
# apps/academy/  → phase 2 (module externe découplé)
```

### 1.2 Flux applicatif
```
Navigateur (PWA React)
   │  HTTPS / JWT
   ▼
API Express  ──►  Moteur de permissions (capabilities)
   │                     │
   ▼                     ▼
Prisma  ──►  PostgreSQL  +  Journal d'audit immuable
   ▲
   └── Webhook entrant sécurisé (École de formation Bloom, phase 2)
```

---

## 2. Modèle de données

> Cible : **PostgreSQL via Prisma**. Les formulaires configurables (départements spéciaux) utilisent des colonnes **JSONB** pilotées par une `FormDefinition`. Les champs structurés fixes restent typés.

### 2.1 Entités cœur

**Branch** — `id, code (church|light), label, themeAccents (jsonb)`
Deux branches égales (seedées). Pas de hiérarchie.

**Member** — entité pivot (englobe l'authentification)
```
id, nom, prenom, telephone (unique), telephoneProche, email (unique), genre,
dateNaissance, situationMatrimoniale, profession, photoUrl,
gpsLat, gpsLng, commune, quartier, nationalite, urgenceContact, source, dateEntreeBloom,
branchId → Branch,
primaryBranchId → Branch (nullable, coach uniquement),
communityLevel (enum), integrationState (enum, phase Nouveau),
pastoralCursus (enum), baptismStatus (enum), baptismDate (date, nullable), baptismViaDepartment (bool, nullable),
assignedLeaderId → Member, assignedCoachId → Member, cursusMentorId → Member,
isPerdu (bool, default false),   // « Drachme (perdu) » — statut manuel d'égarement
isAdmin (bool), isSuperAdmin (bool),
passwordHash, createdAt, updatedAt, deletedAt (soft delete)
```

**Ministere** — `id, label`
Regroupe les départements ; réaménageable.

**Department** — `id, label, type (normal|special), specialFunction (enum nullable), branchId → Branch, ministereId → Ministere` — **une instance par branche**
`specialFunction ∈ {adn, portiers, integration, bloom_bus, gestion_cultes, parcours_etapes}` — **activée à la création**, elle déclenche les comportements particuliers du département.

**DepartmentMembership** — appartenance + fonction (une fonction par couple)
```
id, memberId → Member, departmentId → Department,
function (enum departmentFunction),
currentStepId → DepartmentStep (nullable, départements à étapes),
stepStatus (encours|complete, nullable),
@@unique([memberId, departmentId])
```

**MinistryAssignment** — fonction transversale Ministre
`id, memberId → Member, ministereId → Ministere` (rôle = ministre)
Les fonctions `pasteur` / `pasteur_principal` sont des **fonctions globales** portées par le membre (table `MemberGlobalFunction` : `memberId, function`).

### 2.2 Territoire Bloom Bus
```
Commune  (id, label)
Zone     (id, label, communeId → Commune)
BloomBus (id, label, zoneId → Zone, gpsCenterLat, gpsCenterLng)
```
`Member.bloomBusId → BloomBus` (rattachement unique, auto-affecté par GPS au checkin).

### 2.3 Départements à étapes (fonction `parcours_etapes`)
```
DepartmentStep   (id, departmentId → Department, order, label, validatorRule (jsonb))
StepValidation   (id, membershipId → DepartmentMembership, stepId, validatedById, validatedAt)
```
Un département dont la fonction `parcours_etapes` est activée porte des **étapes** (configurables, seedées pour Baptême/Eden 0/PRD). Le **suivi** d'un membre est un attribut de son **appartenance** (`DepartmentMembership.currentStepId` / `stepStatus`) — plus d'entité `SpecialProgram`/`Enrollment`. Baptême : 4 étapes seedées ; la validation de l'étape finale déclenche `baptismStatus = baptise` + audit `BAPTISM_COMPLETED` (pas de certificat).

### 2.4 Événements & rapports

**Event** — `id, type (1er_culte|2eme_culte|culte_light|special), label, date, branchId → Branch (nullable si 2 branches), audience (branche|deux_branches), ownerDepartmentId → Department (nullable, créateur), projectId → Project (nullable), recurring (bool), createdById` — **unique, portée branche ou 2 branches**.

**Activity** — `id, departmentId → Department, label, type (priere|meditation|reunion|rsa|autre), recurrenceRule (jsonb), createdById` — **récurrente, interne au département** (agenda).

**FormDefinition** — schéma de formulaire configurable
`id, scope (department|program), scopeId, schema (jsonb), version, active`

**Report** — entité polymorphique
```
id, reporterId → Member, reporterType (self|hierarchical),
reportType (enum), targetType (Member|Department|Zone|Commune|BloomBus),
targetId, branchId → Branch (imputation = branche de la cible),
eventId → Event (nullable, rapports de comptage),
periodWeek (nullable, rapports hebdo), date,
payload (jsonb : champs structurés selon reportType / FormDefinition),
notes (text), confidential (bool), partagerAvecResponsableDept (bool),
createdAt, deletedAt
```
Payloads typés par `reportType` (validés Zod côté API) :
- `rapport_service` : `{ eventId, serviteurs: [memberId] }` (roster par culte/événement)
- `rapport_rsa` : `{ taches: [{ libelle, statut }] }`
- `rapport_activite` : `{ eventId | activityId, observations, serviteurs: [memberId] }`
- `rapport_suivi_coach` : `{ nbVisites, nbEntretiens, visites: [memberId], entretiens: [memberId], observation }`
- `rapport_observation` : `{ type (spirituel|financier|materiel|social|organisationnel), texte, mode (informatif|suivi), echeance? }`
- `rapport_bloom_bus_member` : `{ vieSpirituelle, vieSociale, santePhysique, situationFinanciere, presenceCulte }` (échelle ordinale)
- `rapport_bloom_bus_life` : `{ mobilisation, presenceCulte, moisson, visite, activite }`
- `rapport_adn` : `{ nouveauxH, nouveauxF, ojH, ojF }`
- `rapport_portiers` : `{ presentsH, presentsF }`
- `rapport_culte` : `{ serviceType, preacherName, sermonTitle, officiantName, atmosphere, hasIncidentTechnique, hasIncidentSecurite, attendeesAdultes, attendeesEnfants, nouvellesDecisions, passagersBloomBus }`
- `rapport_pastoral` : `{ evaluationCursus, … }` (confidentiel)

**MemberNote** — note individuelle d'un Responsable
`id, authorId → Member, memberId → Member, text, createdAt` (visible : auteur + supérieurs).

### 2.5 Formations
```
Certification (id, memberId, source (vases_honneur|ecole_bloom),
               courseTitle, level, certifiedAt, externalRef (nullable))
```
Vases d'Honneur : saisie interne par le Responsable. École Bloom : alimentée par webhook (phase 2).

### 2.6 Gouvernance, notifications, audit

**CapabilityOverride** — matrice de permissions dynamique
`id, subjectType (level|function|cursus), subjectValue, branchId → Branch, capability (enum), enabled`

**SpecialAuthorization** — exception nominative
`id, memberId, capability, branchId (nullable), grantedById, createdAt`

**Notification** — `id, recipientId → Member, type, channels (jsonb: inapp|email|sms|whatsapp), payload (jsonb), read, createdAt`

**NotificationTrigger** — déclencheurs configurables
`id, eventType, channels, active`

**AuditLog** — journal global immuable (append-only)
```
id, actionType, description, entityType, entityId,
oldValue, newValue, changedById → Member, branchId, createdAt
```
La timeline de la fiche membre = `AuditLog WHERE entityType='Member' AND entityId=:id`.

### 2.7 Projets & Cursus
```
Project          (id, label, scope (transverse|branche|ministere), branchId? → Branch, ministereId? → Ministere,
                  pmoId → Member, status, startDate, endDate, createdById)
ProjectMember    (id, projectId → Project, memberId → Member, role (string))   @@unique([projectId, memberId])
ProjectObjective (id, projectId → Project, label, done (bool), doneAt, validatedById)
ProjectAction    (id, projectId → Project, label, assigneeId → Member (nullable), dueDate, status)
```
- **PMO obligatoire** (`pmoId`) ; les **rôles d'équipe** sont des chaînes libres (palette de base + ajout). Les **objectifs** sont une **checklist** (`done`). Un **Événement** se rattache via `Event.projectId` (optionnel).
- **Suivi de cursus** : pas d'entité dédiée — il réutilise l'axe `pastoralCursus` + le lien **`Member.cursusMentorId`** (mentor). Les **filleuls** = membres dont `cursusMentorId` pointe vers soi ; le suivi écrit/lu = `rapport_pastoral` (§2.4).

### 2.8 Diagramme relationnel (synthèse)
```
Branch 1───* Member *───1 BloomBus *───1 Zone *───1 Commune
Member *───* Department         (via DepartmentMembership + function)
Ministere 1───* Department
Department 1───* DepartmentStep   (fonction parcours_etapes ; suivi via DepartmentMembership)
Event 1───* Report *───1 Member (reporter)
Member 1───* AuditLog (changedBy)   Member 1───* Notification (recipient)
Member 1───* Certification          Member 1───* MemberNote (author/target)
Project 1───* ProjectMember *───1 Member    Project 1───* ProjectObjective    Project 1───* ProjectAction
Project 1───* Event (rattachement optionnel)    Member 1───* Member (cursusMentorId → filleuls)
Department 1───* Activity (récurrentes)    Activity|Event 1───* Report (rapport_activite)
```

---

## 3. Enums du domaine (`packages/shared`)

| Enum | Valeurs |
|---|---|
| `BranchCode` | church, light |
| `CommunityLevel` | nouveau, stagiaire, boss, leader, coach |
| `IntegrationState` | en_attente, suivi, integre |
| `PastoralCursus` | aucun, appele, serviteur, gagneur_ame, assistant_pasteur, pasteur_assistant, pasteur_titulaire |
| `DepartmentFunction` | responsable, adjoint, coach, leader, membre, capitaine, responsable_zone, responsable_commune |
| `GlobalFunction` | pasteur, pasteur_principal |
| `DepartmentType` | normal, special |
| `DepartmentSpecialFunction` | adn, portiers, integration, bloom_bus, gestion_cultes, parcours_etapes |
| `BaptismStatus` | non_baptise, baptise |
| `ReportType` | rapport_service, rapport_rsa, rapport_activite, rapport_suivi_coach, rapport_observation, rapport_bloom_bus_member, rapport_bloom_bus_life, rapport_adn, rapport_portiers, rapport_culte, rapport_pastoral |
| `EventType` | 1er_culte, 2eme_culte, culte_light, special |
| `ProjectScope` | transverse, branche, ministere |
| `ProjectActionStatus` | a_faire, en_cours, fait |
| `EventAudience` | branche, deux_branches |
| `ActivityType` | priere, meditation, reunion, rsa, autre |
| `ObservationType` | spirituel, financier, materiel, social, organisationnel |
| `OrdinalScore` | tres_faible, faible, moyen, bon, tres_bon |
| `NotificationChannel` | inapp, email, sms, whatsapp |
| `Capability` | **liste prédéfinie** par module (Voir / Éditer / Valider) + transversales — voir §3.1 |

---

### 3.1 Capacités (liste prédéfinie)
Granularité : **par module × Voir / Éditer / Valider** + capacités transversales.

| Module | Capacités |
|---|---|
| Membres | voir annuaire · voir fiche · enregistrer · transférer de branche · promouvoir (niveau / cursus / fonction) |
| Intégration | valider réception · faire avancer le statut |
| Rapports | voir service/activité · voir **spirituels (Bloom Bus)** · voir **pastoraux** · rédiger |
| Départements | gérer · assigner la hiérarchie · gérer l'agenda & activités |
| Bloom Bus | voir le territoire · rédiger le suivi spirituel · rédiger l'activité |
| Cultes & Événements | créer un événement · rédiger rapport (culte / ADN / Portiers) |
| Projets | créer · gérer |
| Cursus | voir · **valider une promotion** |
| Formations | inscrire · certifier (Vases d'Honneur) |
| Administration | gérer permissions · attribuer Admin · gérer Super Admins · configuration · constructeur de formulaires · voir l'audit |
| **Transversales** | **Exporter** · **Supprimer (soft-delete)** · **Déléguer des droits** |

## 4. API REST (`apps/api`)

Base : `/api/v1`. Auth : `Authorization: Bearer <JWT>`. Validation : Zod. Toutes les routes passent par `authMiddleware` → `permissionMiddleware(capability)`.

| Domaine | Endpoints |
|---|---|
| **Auth** | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` (capacités calculées) |
| **Membres** | `GET /members` · `GET /members/:id` (fiche 360) · `POST /members/nouveau` (formulaire Nouveau) · `POST /members/:id/registration` (formulaire Membre) · `PATCH /members/:id` · `POST /members/:id/transfer` (Light→Church) · `POST /members/:id/promote` (axe + audit) · `GET /members/check-duplicate?phone=&email=` |
| **Intégration** | `POST /members/:id/validate-reception` · `POST /members/:id/integration-state` · `GET /integration/pending` (suivi + alertes) |
| **Branches** | `GET /branches` |
| **Ministères** | `GET/POST/PATCH /ministeres` |
| **Départements** | `GET/POST/PATCH /departments` · `POST /departments/:id/members` · `PATCH /departments/:id/members/:mid` (fonction) · `GET /departments/:id/dashboard` |
| **Bloom Bus** | `GET/POST /communes` · `GET/POST /zones` · `GET/POST /bloom-buses` · `GET /bloom-bus/assign?lat=&lng=` (Haversine) · `GET /bloom-bus/:id/dashboard` |
| **Départements à étapes** | `POST /departments/:id/steps` · `POST /departments/:id/members/:mid/validate-step` (suivi du parcours) |
| **Événements** | `GET/POST /events` (uniques, branche / 2 branches) |
| **Agenda & activités** | `GET /departments/:id/calendar` · `GET/POST /departments/:id/activities` (récurrentes) · `POST /events/:id/report` · `POST /activities/:id/report` (`rapport_activite`) |
| **Rapports** | `GET /reports?type=&targetId=&eventId=` · `POST /reports` · `GET /reports/:id` · `POST /members/:id/notes` |
| **Formulaires** | `GET/POST/PATCH /form-definitions?scope=&scopeId=` |
| **Formations** | `GET /members/:id/certifications` · `POST /members/:id/certifications` (Vases d'Honneur) · `POST /webhooks/academy` (École Bloom, signé HMAC — phase 2) |
| **Permissions** | `GET/PUT /permissions/matrix` · `POST /permissions/special-auth` · `POST /admin/grant` (super-admin) |
| **Notifications** | `GET /notifications` · `PATCH /notifications/:id/read` · `GET/PUT /notification-triggers` |
| **Audit** | `GET /audit?entityType=&entityId=` |
| **Projets** | `GET/POST/PATCH /projects` · `POST /projects/:id/members` · `POST /projects/:id/objectives` · `PATCH /objectives/:id` (cocher) · `POST /projects/:id/actions` · `PATCH /events/:id` (rattacher `projectId`) |
| **Cursus** | `GET /cursus/tree` · `GET /members/:id/filleuls` · `POST /reports` (`rapport_pastoral`) · `POST /members/:id/promote` (cursus) |
| **Dashboards** | `GET /dashboards/member/:id` · `GET /dashboards/department/:id` · `GET /dashboards/ministere/:id` · `GET /dashboards/global` (pasteurs) — paramètre `?period=week|month|quarter|year|custom&from=&to=` |
| **Sync offline** | `POST /sync/batch` (file de formulaires hors-ligne, idempotent via `clientUuid`) |

---

## 5. Moteur de permissions (capabilities)

```
capabilities(member) =
    base(communityLevel, functions[], cursus, departments[])
  ⊕ overrides(CapabilityOverride par subject × branche)
  ⊕ specialAuthorizations(member)
```
- Calculées à la connexion et mises en cache (invalidation sur changement de rôle/permission).
- `permissionMiddleware(capability)` rejette (403) si absente.
- **Délégation** : un Responsable accorde des capacités **scopées à son département** ; **interdiction** de déléguer l'accès au `rapport_bloom_bus_member` (rapport spirituel).
- **Confidentialité rapports** : un Responsable **Coach** voit les rapports de ses membres (hors pastoral) ; **non-Coach** → nécessite `SpecialAuthorization` accordée par Ministre/Pasteur.

---

## 6. Calculs analytiques (jobs)

| Job | Déclenchement | Sortie |
|---|---|---|
| **Santé membre** | à chaque `rapport_bloom_bus_member` + recalcul périodique | séries temporelles par dimension (courbes) ; échelle ordinale → % |
| **Stats culte** | à chaque rapport rattaché à un `Event` | consolidation par événement (adultes, enfants, OJ, nouveaux, passagers) |
| **Qualification département** | nightly | synthèse de l'évolution des champs `rapport_service` |
| **Mobilisation Bloom Bus** | nightly | `T_mob_bus` + évolution membres / nouveaux gagnés |
| **Alertes intégration** | scheduler quotidien | 3 j (réception non validée) → Intégration+Responsable ; 7 j depuis enregistrement ADN → membre « rouge » + escalade Ministre |

---

## 7. Sécurité & résilience

- **Auth** : JWT access (court) + refresh (rotation) ; `passwordHash` (bcrypt). **Identifiant : téléphone OU email**. **Pas d'auto-inscription** — comptes créés à l'enregistrement (Nouveau / Membre) ; le **membre choisit lui-même son mot de passe** (activation à la 1ʳᵉ connexion via lien / code SMS / WhatsApp / email). **Réinitialisation** : code envoyé par SMS / WhatsApp / email. Sessions gérables depuis *Mon Profil*.
- **Seed (installation)** : 2 branches, compte(s) Super Admin, **départements spéciaux par branche** (ADN, Portiers, Intégration, Bloom Bus, Gestion des Cultes, Baptême, Eden 0, PRD), cultes récurrents, listes de référence (communes, quartiers, sources, types d'incidents), matrice de permissions par défaut — **contenu défini conjointement** (session dédiée).
- **RBAC** : middleware par capacité + scoping systématique par `branchId`.
- **Audit immuable** : table append-only, **soft delete** partout (`deletedAt`), aucune suppression physique.
- **Webhooks entrants** (École Bloom) : signature **HMAC** + horodatage anti-rejeu.
- **Offline-first (PWA)** : service worker (vite-plugin-pwa), cache des formulaires en LocalStorage, file de synchronisation `POST /sync/batch` idempotente (`clientUuid`), bascule visuelle « Sauvegardé localement ».
- **Temps réel** : Socket.io (cloche de notifications, alertes d'intégration en direct).
- **Services externes** : Cloudinary (photos), Twilio (SMS + WhatsApp), Nodemailer (email), react-pdf/pdfkit (export rapports).
- **Infra** : Frontend → **Vercel** · API → **Render** · PostgreSQL → **Supabase** · Photos → **Cloudinary**.

---

## 8. Arborescence détaillée

```
apps/api/
├── prisma/schema.prisma        # entités §2
├── prisma/seed.ts              # branches, ministères, départements spéciaux seedés (Baptême…), super-admin
└── src/
    ├── index.ts
    ├── middleware/             # auth, permissions, branch-scope, error
    ├── modules/
    │   ├── members/  integration/  branches/  ministeres/
    │   ├── departments/  bloom-bus/  programs/  events/
    │   ├── reports/  forms/  formations/
    │   ├── projects/  cursus/
    │   ├── permissions/  notifications/  audit/  dashboards/  sync/
    ├── services/               # logique métier (promote, transfer, kpis, capabilities)
    └── lib/                    # prisma client, zod, hmac, haversine

apps/web/
└── src/
    ├── app/                    # shell (header, sidebar, bottom-bar, branch-switch)
    ├── pages/                  # accueil, members/:id, departments, bloom-bus, …
    ├── features/               # members, departments, bloom-bus, reports, dashboards
    ├── components/             # design system (Button, Card, Modal, Radar, Stepper…)
    ├── lib/                    # api client, zod, offline queue, pwa
    └── store/                  # zustand (branche active, session, capacités)

packages/shared/src/
├── enums.ts                    # §3
├── tokens.ts                   # design tokens charte
└── schemas/                    # Zod partagés (report payloads, forms)
```

---

## 9. Ordre de build proposé
1. `packages/shared` (enums, tokens, schémas Zod).
2. `apps/api` : schéma Prisma + migration + seed → auth/capabilities → modules membres/intégration → départements (normaux & spéciaux, dont à étapes)/bloom-bus → rapports/événements → **projets/cursus** → permissions/notifications/audit → dashboards/sync.
3. `apps/web` : design system + shell + commutateur branche → écrans clés (accueil/fiche 360°, console département, checkin ADN, rapport de culte) → dashboards → PWA offline.
4. Vérification : typecheck, validation schéma Prisma, build web.

---

*Fin du document d'architecture technique.*
