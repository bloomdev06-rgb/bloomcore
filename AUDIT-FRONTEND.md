# Audit Frontend BloomCore — Écarts spec ↔ code

> Généré le 2026-07-02 à partir de 5 audits parallèles (écrans/navigation, formulaires,
> KPIs, notifications/workflows, charte graphique/seed) comparant les 8 docs de spec
> (CHARTE-GRAPHIQUE, ECRANS-PAR-ONGLET, FORMULAIRES, KPIS, NOTIFICATIONS,
> PROFILS-INTERFACES, SEED, WORKFLOWS) au code `src/`.
>
> Objectif : tout corriger côté interface AVANT d'attaquer le backend — les types,
> formulaires et formules définis ici deviendront le contrat du backend.

---

## Diagnostic global

Les 15 onglets + Mon Profil + Fiche 360° existent tous. Le problème n'est pas la
couverture d'écrans, c'est le **câblage** : l'app contient **4 systèmes décoratifs**
(configurés dans l'UI mais qui ne pilotent rien) et une **majorité de valeurs mockées**.

Les 4 systèmes morts :

| Système | Édité dans | Consulté par | Effet réel |
|---|---|---|---|
| `PermissionMatrix` | PermissionsView (persist + audit) | personne — Sidebar utilise des `roles:[]` en dur | **aucun** |
| FormBuilder (`INITIAL_FORMS`) | FormBuilderView | personne — les vraies modales sont codées à la main | **aucun** |
| Déclencheurs notifications | SettingsView (4 triggers, canaux) | personne — aucun `addNotification` n'existe | **aucun** |
| Helpers KPI (`kpi.ts`, testés) | — | quasi personne — les dashboards affichent du dur | **quasi aucun** |

---

## P0 — Contrat de données (à corriger EN PREMIER : le backend en dérivera son schéma)

| # | Écart | Localisation | Sévérité |
|---|---|---|---|
| P0.1 | Confusion `integrationState` (spec : En attente→Suivi→Intégré) vs `integrationFollowStatus` (utilisé par NouveauxView). Deux champs pour un même concept, la progression spec n'est pilotée nulle part | `types.ts:5-6`, `NouveauxView.tsx:123` | BLOQUANT |
| P0.2 | Seeds cassés : `member.departments` référence des ids inexistants (`dept_gestion_cultes`, `dept_portiers`, `dept_technique` au lieu de `dept_gdc`, `dept_ushers`, `dept_tech`) | `mockData.ts:148,191,241,267,339` | MAJEUR |
| P0.3 | `specialFunction` jamais posé dans les seeds ; inféré depuis l'id à l'exécution, et l'inférence échoue pour Ushers→`portiers` et GDC→`gestion_cultes` | `mockData.ts:47-93`, `DepartmentsView.tsx:20-32` | MAJEUR |
| P0.4 | `Ministry`/`Department` sans champ `branch` — SEED exige 2 instances (une par branche) | `types.ts:31-45` | MAJEUR |
| P0.5 | `Member.currentStepId` absent → parcours Baptême non fonctionnel (seule l'étape finale marche) | `types.ts`, `ProgrammesView.tsx:110-118` | MAJEUR |
| P0.6 | Champs membre manquants vs FORMULAIRES §2 : Académie, Entrée à Bloom (mois+année), cases Statut (Intégré / Drachme non contrôlable au form), photo | `types.ts`, `MembersView.tsx:808-1185` | MAJEUR |
| P0.7 | Départements du membre : mono-select au lieu de multi-sélection | `MembersView.tsx:1098` | MAJEUR |
| P0.8 | Type `Period` sans `quarter` alors que le select Dashboard le propose | `kpi.ts:4`, `DashboardView.tsx:148-158` | MINEUR |
| P0.9 | `Event` sans champ récurrence → cultes du dimanche non générés automatiquement | `types.ts:136-146` | MAJEUR |
| P0.10 | Rôle `Super Admin` référencé mais absent des colonnes de la matrice de permissions | `SettingsView.tsx:52`, `mockData.ts:507-543` | MINEUR |

## P1 — Câbler les 4 systèmes morts (cœur de l'architecture, débloque tout le reste)

| # | Chantier | Détail | Sévérité |
|---|---|---|---|
| P1.1 | **Brancher la Sidebar (et les gates internes) sur `PermissionMatrix`** — une capability `view_<tab>` par onglet, seedée pour reproduire les listes actuelles corrigées. Supprime les `roles:[]` en dur | `Sidebar.tsx:50-69` + gates `canEdit/canManage/canCertify` dispersés | BLOQUANT |
| P1.2 | **Créer le bus de notifications** : un `addNotification(trigger, payload)` dans App.tsx, appelé par les actions métier, respectant la config SettingsView. Couvre les 17 déclencheurs côté in-app (email/SMS = backend plus tard) | `App.tsx:174` (seul `markNotificationAsRead` existe) | BLOQUANT |
| P1.3 | **Brancher les KPIs sur les vrais calculs** : `periodRange`/`levelToPercent` existent et sont testés mais inutilisés. Implémenter « membre actif = servi ≤ 1 mois » (nulle part), réutiliser `isRed` (`MembersView.tsx:100`) au Dashboard | `kpi.ts`, toutes les vues dashboard | BLOQUANT |
| P1.4 | **FormBuilder** : décision à prendre — soit le câbler (les modales lisent les FormDefs), soit l'assumer comme catalogue documentaire jusqu'au backend. Le câbler exige les types de champs manquants (P2.9) | `FormBuilderView.tsx:29-53` | MAJEUR (décision) |

## P2 — Formulaires (définissent les payloads des futurs endpoints)

| # | Écart | Localisation | Sévérité |
|---|---|---|---|
| P2.1 | **Rapport de service** : bouton mort, aucune modale (Événement / Serviteurs multi / Notes) | `DepartmentsView.tsx:348-353` | BLOQUANT |
| P2.2 | **Rapport RSA** : bouton mort (Semaine / liste d'actions répétable / Notes) | idem | BLOQUANT |
| P2.3 | **Rapport d'activité** : bouton mort | idem | BLOQUANT |
| P2.4 | **Rapport suivi coach** : affichage seul, aucun formulaire (liste par membre visité/entretien) | `DepartmentsView.tsx:357-369` | BLOQUANT |
| P2.5 | **Rapport d'observation** : bouton mort (type / texte / mode radio informatif-suivi / échéance) | `DepartmentsView.tsx:348-353` | BLOQUANT |
| P2.6 | **Rapport de culte 4 blocs** : généré auto avec un content réduit ; manquent Infos générales (prédicateur, thème…), Atmosphère spirituelle (notes 1-5), Journal des incidents, stats détaillées (enfants, décisions) | `EventsView.tsx:153-170` | BLOQUANT |
| P2.7 | **Fiche Nouveau (ADN)** : photo obligatoire absente, GPS en dur (`5.3854,-3.9781`), pas de dédoublonnage téléphone temps réel, source absente | `App.tsx:410-600` (GPS `:209`) | MAJEUR |
| P2.8 | **Rapports Bloom Bus** : « présence au culte » = échelle au lieu de sélection de culte(s) ; « membres visités » = compteur au lieu de multi-sélection (on perd qui a été visité) ; Portiers sans « présence en ligne » | `BloomBusView.tsx:454,523`, `EventsView.tsx:292-317` | MAJEUR |
| P2.9 | **Types de champs FormBuilder manquants** : téléphone (unicité), multi-sélection membres, photo/upload, période/semaine, GPS, radio, liste répétable, sélection événement. `choice`/`scale` sans configuration d'options | `FormBuilderView.tsx:10-18,94-100` | MAJEUR |
| P2.10 | **Validation** : unicité téléphone jamais bloquante (badge passif seulement) ; `Field.required` du FormBuilder cosmétique ; aucun contrôle de format | `MembersView.tsx:105-110`, `App.tsx:180` | MAJEUR |

## P3 — KPIs à brancher (définissent les agrégations backend)

| # | KPI | État | Localisation | Sévérité |
|---|---|---|---|---|
| P3.1 | Membres actifs (Accueil) | `1,245` en dur ; règle « servi ≤ 1 mois » implémentée nulle part | `DashboardView.tsx:170` | BLOQUANT |
| P3.2 | Au rouge (Accueil) | `14` en dur alors que la vraie règle existe (`isRed`) | `DashboardView.tsx:222` vs `MembersView.tsx:100-103` | BLOQUANT |
| P3.3 | T_mob_bus | `84%` en dur ; données saisies (`mobilised`, rattachés) jamais ratioées | `BloomBusView.tsx:324` | BLOQUANT |
| P3.4 | Sélecteur de période Dashboard | état `period` jamais lu — décoratif | `DashboardView.tsx:41,148` | BLOQUANT |
| P3.5 | Baptisés, Bus actifs, Moisson, Remontées (Accueil) | en dur | `DashboardView.tsx:178-204` | MAJEUR |
| P3.6 | KPI départemental | « Membres actifs » = mauvais dénominateur (tous les membres) ; présence/intégration/qualification/taux rapports absents | `DepartmentsView.tsx:176-182` | MAJEUR |
| P3.7 | KPI Bloom Bus | Moisson/Visites en dur, présence culte/taux rapports absents ; KPIs ne réagissent pas au niveau commune/zone/bus sélectionné | `BloomBusView.tsx:324-348` | MAJEUR |
| P3.8 | KPI ministère | « Classement des départements » non trié ; Membres actifs `420` et santé `Très bon` en dur | `MinisteresView.tsx:118-135` | MAJEUR |
| P3.9 | Courbes (croissance, évolution santé) | `growthData` statique, aucune agrégation temporelle | `DashboardView.tsx:104-109` | MAJEUR |
| P3.10 | Smileys : 3 mappings couleur divergents pour l'échelle 1-5 (violet vs vert au niveau 5) — spec impose vert=bon. Unifier sur `HealthSmiley` corrigé | `HealthSmiley.tsx:11`, `Member360View.tsx:149`, `DashboardView.tsx:26` | MAJEUR |
| P3.11 | 6 axes santé affichés vs 5 dans la spec (`presenceService` ajouté) — trancher | `DashboardView.tsx:29-36` | MINEUR |

## P4 — Écrans, navigation & permissions par profil

| # | Écart | Localisation | Sévérité |
|---|---|---|---|
| P4.1 | Profils manquants au sélecteur : Adjoint, Responsable de Zone, Responsable de Commune | `Sidebar.tsx:221` | MAJEUR |
| P4.2 | Listes de rôles en dur incohérentes : Capitaine sans Accueil ni Membres ; Membre sans Bloom Bus (auto-éval hebdo impossible) ; Leader/Nouveau sans Formations ; équipiers projet sans Projets | `Sidebar.tsx:50-69` (résolu par P1.1 si les seeds de capabilities sont corrects) | MAJEUR |
| P4.3 | Portée des données non restreinte par profil : un Coach/Leader/Ministre/Capitaine voit TOUS les membres | `MembersView.tsx:114-141` | MAJEUR |
| P4.4 | Onglet « Intégration » de premier niveau hors-spec (doublon de l'onglet interne Validation Nouveaux de Départements) | `Sidebar.tsx:55`, `App.tsx:267-275` | MAJEUR |
| P4.5 | Sidebar Départements : liste plate au lieu de l'accordéon Ministère → Départements | `Sidebar.tsx:148-161` | MAJEUR |
| P4.6 | Gates incorrects : promotions cursus non réservées au Pasteur Principal ; saisie comptages cultes fermée aux ADN/Portiers/GDC ; certification fermée au Responsable ; création dept `Pasteur` au lieu de `Pasteur Principal` | `CursusView.tsx:23`, `EventsView.tsx:220`, `FormationsView.tsx:21`, `DepartmentsView.tsx:67` | MAJEUR |
| P4.7 | Ministères : bouton « Créer un ministère » absent ; nom du Responsable absent de la fiche | `MinisteresView.tsx` | MAJEUR |
| P4.8 | Cursus : organigramme = paliers de rang, pas l'arbre mentor→filleul | `CursusView.tsx:127-129` | MAJEUR |
| P4.9 | Fiche 360° : parcours à étapes + Projets absents des Appartenances ; courbes d'évolution santé absentes ; onglets Rapports et Audit mockés (non branchés sur les vraies données) | `Member360View.tsx:355-450` | MAJEUR |
| P4.10 | Mon Profil : section Sécurité (mot de passe/sessions), canaux de notification, mode Plein Soleil absents | `ProfileView.tsx` | MAJEUR |
| P4.11 | Comptes & Admins : création/révocation Super Admin absente (lecture seule) | `AccountsView.tsx:138-155` | MAJEUR |
| P4.12 | Événements : roster des serviteurs absent de la fiche ; filtres branche/type/projet absents | `EventsView.tsx` | MAJEUR |
| P4.13 | Projets : « événements rattachés » absent ; filtres portée/PMO absents | `ProjectsView.tsx` | MAJEUR/MINEUR |
| P4.14 | Centre de notifications : « Tout marquer lu », page « Toutes les notifications », filtres, catégories absents | `Header.tsx:167-221` | MAJEUR |
| P4.15 | Workflow check-in : fusion de doublons absente ; affectation auto Bloom Bus absente ; OJ → ajout auto dépt Baptême absent | `App.tsx:178-210` | BLOQUANT (dédoublonnage) |
| P4.16 | Transfert de branche : pas d'action dédiée, audit `BRANCH_TRANSFER` jamais émis | `App.tsx:99-108` | MAJEUR |
| P4.17 | Promotions : `confirmPromotion` ne loggue ni audit ni notif | `CursusView.tsx:43-47` | MAJEUR |
| P4.18 | Délégation de droits par Responsable (console + interdit « rapport spirituel ») absente | `GovernanceView.tsx` | MAJEUR |
| P4.19 | Écrans login/activation/reset absents (même en mock) ; logout = `alert()` | `ProfileView.tsx:254-259` | BLOQUANT (avant backend auth) |
| P4.20 | Nettoyage : imports morts `ReportsView`/`ProgrammesView` non routés, titres header obsolètes | `App.tsx:24-25`, `Header.tsx:43-57` | MINEUR |

## P5 — Charte graphique & accessibilité

| # | Écart | Localisation | Sévérité |
|---|---|---|---|
| P5.1 | Thème de branche entier non câblé : `data-branch`, `--accent-1/2`, Color Sweep (CSS défini mais jamais utilisé) | `index.css:88-112` | MAJEUR |
| P5.2 | Mode Plein Soleil absent (+15% polices/boutons, contraste terrain) | — | MAJEUR |
| P5.3 | Dark mode partiel : surfaces `bg-white` en dur restent claires | `index.css:7-8`, vues | MAJEUR |
| P5.4 | Accents Settings : 4/6 — fushia, turquoise, anis manquants (bloque les thèmes de branche Church=céruléen+anis, Light=orange+fushia) | `SettingsView.tsx:37-42` | MAJEUR |
| P5.5 | Cibles tactiles < 48px généralisées ; focus visible non systématisé ; theme-toggle sans aria-label/clavier | `SettingsView.tsx`, `theme-toggle.tsx` | MAJEUR |
| P5.6 | Tokens sémantiques (`--color-primary/success/…`) absents ; `--bc-canvas` `#FFFFFF` vs `#F7F6F3` ; `--radius-input` 6px vs 8px ; `--dur` 200 vs 250ms ; gris `slate-*` hors tokens | `index.css` | MINEUR |
| P5.7 | Export PDF audit absent (CSV seul) | `AuditView.tsx` | MINEUR |

---

## Ordre d'exécution recommandé

1. **P0** (contrat de données) — petit volume, débloque tout, et c'est ce que le backend copiera.
2. **P1.1 + P1.2 + P1.3** (matrice, bus de notifs, branchement KPIs) — transforme les systèmes décoratifs en systèmes réels ; tout P3/P4 s'appuie dessus.
3. **P2** (formulaires) — chaque formulaire créé = un payload d'endpoint défini.
4. **P4** (écrans/portées par profil) — s'appuie sur la matrice câblée.
5. **P5** (charte/a11y) — en continu ou en dernier lot.
6. **P1.4** (FormBuilder) — décision : le brancher maintenant ou le geler documentaire jusqu'au backend.

## Conformités notables (ne pas retoucher)

- 15 onglets + Mon Profil + Fiche 360° tous présents
- `kpi.ts` helpers corrects et testés ; « En attente » (Dashboard), smileys niveau dominant, santé moyenne par critère (Ministères), radar 360 : calculés juste
- Seeds : 7 ministères, 33 départements, 6 projets, cultes récurrents, matrice permissions (existence), valeurs des 6 accents et couleurs fondamentales
- AuditView (journal + filtres + CSV), SettingsView, workflow Projet, export CSV Membres
- Discipline tokens Tailwind bonne (15 hex en dur seulement, quasi tous Recharts)
