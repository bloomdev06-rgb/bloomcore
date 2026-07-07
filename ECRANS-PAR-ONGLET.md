# BloomCore — Spécification des Écrans par Onglet

> Définit, onglet par onglet, **ce qui s'affiche** et **comment**. La référence est le profil le plus complet (**Super Admin**) ; **les autres profils en dérivent** en autorisant/masquant des éléments (chaque bloc « 🔒 Soumis à permission » indique ce qui se filtre).
>
> Gabarit de chaque onglet : **Objectif · Layout · Contenu & composants · Actions · 🔒 Soumis à permission**.
> Statut : **en cours** — Accueil rédigé.

## Cadre global (commun à tous les écrans)
- **Shell 3 zones** : sidebar (nav) · zone de contenu · header permanent (titre/contexte, **commutateur de branche** si multi-branche, **commutateur de thème clair/sombre**, recherche, **cloche notifications**, **menu avatar → Mon Profil**).
- **Sidebar** : nav principale **sans titre de section** ; seule la section **« Administration »** est titrée.
- **Responsive** : desktop = sidebar + contenu (+ rail droit selon écran) ; mobile = bottom bar + bouton flottant contextuel, rail repliable.
- **Design** : charte VH (voir `CHARTE-GRAPHIQUE.md`) — cartes `rounded-xl`, ombres douces, accents sémantiques 80/20.
- **États** : skeleton au chargement, vides illustrés, hors-ligne « sauvegardé localement ».

---

# Onglet 1 — Accueil (Dashboard)

## 1.1 Objectif
Vue d'ensemble **actionnable** : l'utilisateur voit en un coup d'œil l'état de son périmètre et ce qu'il doit traiter. Pour le Super Admin, périmètre = **œuvre entière (2 branches)**.

## 1.2 Layout
Disposition en **3 zones** (cf. prototype premium validé) :
```
┌──────────┬───────────────────────────────┬──────────────┐
│ Sidebar  │  Header (greeting · branche ·  │              │
│          │  recherche · cloche · avatar)  │  Rail droit  │
│          ├───────────────────────────────┤  « à traiter»│
│          │  Bandeau d'accueil + CTA       │  + agenda    │
│          │  Rangée 4 KPI                  │  + jauge     │
│          │  Radar santé | Courbe croiss.  │              │
│          │  File d'intégration            │              │
└──────────┴───────────────────────────────┴──────────────┘
```

## 1.3 Contenu & composants
**Sélecteur de période** (barre d'outils, en tête) : **Semaine · Mois · Année · Personnalisé** — recalcule **toutes** les statistiques de l'écran.

**Bandeau d'accueil** : salutation + date + nb d'actions du jour + mini-stats. **Pas de bouton de création ici** — les actions de création vivent dans les onglets concernés. Pour le Super Admin, **données consolidées de toute l'œuvre** (2 branches, tous ministères).

**Rangée KPI** (Super Admin) :
- **Membres actifs** (servi il y a ≤ 1 mois)
- **Baptisés / Non-baptisés** (+ nb de nouveaux baptisés sur la période)
- **Bloom Bus actifs**
- **Nouveaux gagnés par les Bloom Bus** (moisson)
- **Remontées des ministres** (observations marquées « suivi »)
- **En attente** · **Au rouge**

**Santé — un smiley par critère** : **un visage par critère** (santé **spirituelle · sociale · physique · financière · présence au culte**), chacun affichant le **niveau dominant** = le niveau où se trouve le **plus grand % de membres** sur la période. Visage **rouge (en pleurs) → vert (très joyeux)** selon le niveau (*Très faible → Très bon*). *(Remplace le radar sur cet écran ; le radar 6 axes reste sur la fiche 360°.)*

**Courbes** : **croissance des nouveaux** + **nombre de participants par culte**.

**File d'intégration** : En attente → Suivi → Intégré.

**Rail droit** :
- **À traiter aujourd'hui** : réceptions à valider, membres au rouge, rapports manquants (cliquables).
- **Prochains événements** : agenda des cultes/événements.
- **Alertes système** (remplace la jauge qualification).

## 1.4 Actions
Recherche globale · changement de période/branche · CTA contextuels · clic sur un item du rail → écran d'action correspondant.

## 1.5 🔒 Soumis à permission (dérivation des autres profils)
- **Portée des KPI/graphes** : Super Admin = global 2 branches ; Pasteur = 2 branches ; Ministre = son ministère ; Responsable = son département ; Capitaine = son bus ; Membre = **ses propres** données (pas de KPI agrégés).
- **Commutateur de branche** : visible seulement si actif sur 2 branches.
- **Rail « à traiter »** : alimenté par les **tâches propres au rôle** (un membre simple n'a pas de validations à faire).
- **CTA contextuel** : dépend de l'appartenance départementale (ADN, Gestion des Cultes…).
- **Cartes/sections entières** masquées si le profil n'a pas la capacité correspondante.

---

# Onglet 2 — Membres

## 2.1 Objectif
**Annuaire** des membres : rechercher, filtrer, ouvrir une fiche 360°, créer/valider/promouvoir. Pour le Super Admin, périmètre = **2 branches**.

## 2.2 Layout
```
┌──────────┬───────────────────────────────────────────────┐
│ Sidebar  │ Header (titre · branche · recherche · cloche)  │
│          ├───────────────────────────────────────────────┤
│          │ Barre d'outils : recherche + filtres + ➕ CTA  │
│          │ ┌───────────────────────────────────────────┐ │
│          │ │ Tableau des membres (lignes cliquables)   │ │
│          │ │ avatar+nom · tél · branche · niveau ·      │ │
│          │ │ fonction(s) · dept(s) · statut · activité  │ │
│          │ └───────────────────────────────────────────┘ │
│          │ Pagination · tri · export                      │
└──────────┴───────────────────────────────────────────────┘
```

## 2.3 Contenu & composants
- **Barre d'outils** : recherche temps réel (nom/téléphone/email, **dédoublonnage**), **filtres en chips** (branche, niveau communautaire, fonction, cursus, département, état d'intégration, statut baptême, « au rouge »), bouton **« ➕ Enregistrer un membre »** (formulaire Membre). *L'enregistrement d'un « Nouveau » reste réservé à l'ADN.*
- **Tableau** (data-table paginé, triable) : avatar + nom, téléphone, branche, niveau, fonction(s), département(s), **statut baptême**, **Bloom Bus**, **pills de statut**, dernière activité. **Ligne au rouge** mise en évidence (point rouge).
- **Vue grille** (cartes) optionnelle.
- **Ligne cliquable → Fiche Membre 360°** (vue détail, 8 sections — spécifiée séparément).

## 2.4 Actions
Enregistrer un membre · valider réception · transférer de branche · promouvoir (depuis la fiche) · exporter la liste.

## 2.5 🔒 Soumis à permission (dérivation des autres profils)
- **Portée de l'annuaire** : Super Admin / Pasteur = 2 branches ; Ministre = membres des départements de son ministère ; Responsable = membres de son département ; Coach / Leader = ses membres assignés ; Capitaine = membres de son bus ; **Membre simple = pas d'annuaire** (accès à sa seule fiche).
- **Filtres** disponibles limités à la portée.
- **Actions** (créer, valider, transférer, **promouvoir cursus**) gated par capacité (le cursus reste réservé au corps pastoral).
- **Colonnes sensibles** (cursus, indicateurs de santé) masquables selon le profil.

---

# Onglet 3 — Ministères
**Objectif** : gérer les ministères (regroupements de départements) et voir leur vue consolidée.
**Contenu** :
- **Liste des ministères** (vue Pasteur / Admin / Super Admin) : par ministère → nom · **Ministre de tutelle** (un seul) · nombre de départements · nombre de membres, avec les **départements rattachés affichés sous chaque ministère**. **Clic sur un ministère → fiche détaillée**.
- **➕ Créer / renommer** · **réaménager** (rattacher/détacher des départements, glisser-déposer) · **nommer le Ministre de tutelle**.
- **Fiche ministère** (détail) :
  - **Dashboard** : les **KPI limités aux départements du ministère** (mêmes blocs que l'Accueil, périmètre ministère).
  - **Liste des départements** du ministère avec le **nom du Responsable** de chacun.
  - **Classement des départements par KPI** (présence, croissance, intégration…).
**🔒 Permission** :
- **Pasteur / Admin / Super Admin** : vue de **tous les ministères** (+ départements sous chacun) ; clic → stats détaillées.
- **Ministre** : vue de **son seul** ministère (ses départements + dashboard).
- CRUD (créer / renommer / réaménager / nommer le Ministre) = **Admin / Super Admin**.

# Onglet 4 — Départements
**Objectif** : gérer les départements et accéder à leur **console**, via une **navigation en accordéon** : Ministère → Départements → onglets internes.
**Contenu** :
- **Liste / navigation (accordéon)** : sous chaque **ministère**, la liste **déroulante** de ses **départements** ; sous chaque **département**, ses **onglets internes**.
  - **Ministre** : ses départements uniquement.
  - **Pasteur / Admin / Super Admin** : **tous** les départements, avec infos clés par dept → **nom · ministère · type / fonction spéciale · effectif · Responsable · membres actifs**.
  - **Clic sur le nom du département → son dashboard s'affiche** (pas d'onglet Dashboard séparé).
  - **➕ Créer un département** : réservé au **Pasteur Principal, Admin et Super Admin** (type + activation fonction spéciale + étapes/formulaires si applicable).
  - *Définition* : un **membre actif** = membre ayant **servi il y a ≤ 1 mois**.
- **Onglets internes d'un département** :
  - **Membres** (avec fonction)
  - **Hiérarchie & assignations** (lier Membres ↔ Leaders ↔ Coachs)
  - **Validation Nouveaux** (réceptions en attente)
  - **Agenda & activités** (routines + événements + alertes)
  - **Rapports** — pour le **Responsable** : service (roster serviteurs), RSA, activité, et **observation avec ou sans suivi** (comme les ministres)
  - **Suivi** — pour **chaque Coach / Leader** : liste des **membres à suivre** (entretien & visite) → alimente `rapport_suivi_coach`
  - *Si fonction spéciale* : modules dédiés (ADN → formulaire Nouveau + rapport ADN ; `parcours_etapes` → suivi des étapes ; etc.)
  - *(Éventualité conservée : un département peut avoir des **formations internes** propres.)*
- **Formations** : la validation des formations est faite par le **département en charge** et s'affiche sur la **fiche du membre** ; l'onglet **Formations** global est conservé pour le futur **sous-module de formations**.
**🔒 Permission** :
- **Ministre** = ses départements ; **Pasteur / Admin / Super Admin** = tous.
- **Créer un département** = Pasteur Principal / Admin / Super Admin.
- **Responsable / Adjoint** = console complète ; onglet **Rapports** = Responsable.
- **Coach / Leader** = onglet **Suivi** (ses membres assignés), vue restreinte à sa cellule.
- **Membre** = pas de console.

# Onglet 5 — Bloom Bus
**Objectif** : piloter le maillage territorial (Commune → Zone → Bus), les suivis spirituels et l'activité.
**Contenu** :
- **Navigation en accordéon** : Commune → Zone → Bus → contenu. La **carte OpenStreetMap s'adapte au niveau** sélectionné (Commune / Zone = vue agrégée ; **Bus = localisation de tous les membres** du bus).
- **Arbre territorial** : créer / éditer Communes, Zones, Bus + **centres GPS**.
- **Dashboard** : agrégé au **niveau choisi** (mêmes blocs : T_mob_bus, présence culte, **moisson / nouveaux gagnés**, visite, activité + évolution du nombre de membres).
- **Rapports** : `rapport_bloom_bus_member` (suivi spirituel, cascade) + `rapport_bloom_bus_life` (activité, capitaine).
- **Liste des membres** d'un bus (localisation + suivi spirituel).
- ⚠️ **L'évolution des membres (nouveau, suivi, intégré…) n'est PAS gérée ici** — uniquement au niveau des **départements**.
**🔒 Permission** : Super Admin/Pasteur/Ministre = global/territoire ; Resp. Commune = sa commune ; Resp. Zone = sa zone ; Capitaine = son bus (saisie + dashboard) ; membre = son auto-évaluation hebdo. CRUD territorial = Admin.

# Onglet 6 — Cultes & Événements
**Objectif** : créer et suivre les événements (cultes récurrents + événements uniques), consolider leurs statistiques.
**Contenu** :
- **Vue d'entrée** : **calendrier** (mois / semaine) **et liste**, avec bascule. Filtres branche / type / projet.
- **Cultes du dimanche** : **programmés une fois**, puis **générés automatiquement** chaque semaine.
- **➕ Créer un événement** : type, date, portée (une branche ou les 2), audience, **organisateur** (un département, ou niveau branche / 2 branches), rattachement projet optionnel.
- **Fiche événement** :
  - **Organisateur** : le **département organisateur**, ou mention « événement de branche / 2 branches ».
  - **Stats consolidées** : figures issues des rapports **ADN, Portiers, Gestion des Cultes** (adultes, enfants, OJ H/F, nouveaux H/F, décisions, passagers bus).
  - **Roster des serviteurs** + rapports rattachés.
- **Sunday Stats Dashboard** : courbes d'affluence et de croissance.
**🔒 Permission** : création = Resp. Gestion des Cultes / Ministres / Pasteurs / Admin (ou département depuis son agenda) ; saisie des rapports de comptage = membres des départements concernés ; vue stats selon portée.

# Onglet 7 — Projets
**Objectif** : gérer les initiatives (équipes, objectifs, actions, événements).
**Contenu** :
- **Liste des projets** : **vue tableau de bord (cartes)** + **filtres** (statut : à venir / en cours / terminé ; portée ; PMO). Chaque carte : statut, PMO, portée, échéances, avancement.
- **➕ Créer** : portée (transverse / branche / ministère), **PMO**, dates.
- **Espace projet** (au clic) : **équipe** (membres + rôles base / libres), **objectifs** (checklist), **actions** (**kanban** à faire / en cours / fait, assignés, échéances), **événements rattachés**, **dashboard d'avancement**.
**🔒 Permission** : **créer un projet** = Admin / Super Admin + **Pasteur / Ministre / Responsable selon un droit configurable** ; **PMO** gère son projet ; membres d'équipe = accès à leur projet ; autres = pas d'accès.

# Onglet 8 — Cursus pastoral
**Objectif** : suivre la ligne de mentorat ministériel et les rapports de cursus.
**Contenu** :
- **Organigramme du cursus** (arbre hiérarchique visuel) : mon mentor, mes filleuls, ma ligne descendante.
- **Rapports de cursus** (`rapport_pastoral`) sur mes filleuls — **structuré** (champs **à définir ultérieurement**), confidentiels.
- **Promotions** (Appelé → … → Pasteur Titulaire) — **validées uniquement par le Pasteur Principal**.
- **Arbre global** du cursus (le **Pasteur Principal** voit tout).
**🔒 Permission** : visible pour le **corps pastoral / membres du cursus** ; chaque supérieur voit sa ligne descendante ; **promotions = Pasteur Principal uniquement** ; **contenu confidentiel non visible par Admin / Super Admin**.

# Onglet 9 — Formations
**Objectif** : sous-module **phase 2** — suivi des formations des membres.
**Contenu** : **écran « Bientôt disponible »**. À terme : catalogue des formations, suivi, **École de formation Bloom** (webhook). Les **certifications** des membres restent visibles sur la **fiche membre**.
**Saisie MVP** (en attendant le sous-module) : la formation **Vases d'Honneur** s'enregistre **directement sur la fiche du membre** (action « + Certification ») **et** depuis la **console du département en charge des formations**.
**🔒 Permission** : saisie = Responsable du département en charge ; lecture relevé = membre (sa fiche) + hiérarchie ; le reste à définir avec le sous-module (phase 2).

# Mon Profil (accès via le **menu avatar** — pas un onglet de sidebar)
Commun à tous les profils. Voir `PROFILS-INTERFACES.md` §1.8.
- **Mes informations** : le membre **modifie lui-même** ses champs personnels (photo, contacts, email, profession, situation matrimoniale, GPS / commune…).
- **Champs verrouillés** (modifiables uniquement par le **Responsable de département et la hiérarchie supérieure**, via processus tracés) : **progression de statut** (Nouveau → Coach), **branche**, **fonctions**, **affectations**, **statut baptisé**, **formation**, **cursus pastoral**.
- **Mes accès** : rôle, fonctions, cursus, départements, branche + capacités.
- **Sécurité** : mot de passe, sessions.
- **Préférences** : canaux de notification, mode Plein Soleil, thème clair/sombre, langue.

## — Section ADMINISTRATION (Admin / Super Admin) —

# Onglet 11 — Permissions
**Objectif** : configurer le moteur de droits (matrice dynamique + exceptions).
**Contenu** :
- **Matrice de permissions** : **capacité × rôle/fonction** (toggles autorisé / interdit, sauvegarde temps réel). Capacités = **liste prédéfinie lisible** (voir / éditer / valider, par module).
- **Autorisations spéciales** : accorder une capacité **nominative** à un membre (exception).
- **Délégations** : visualiser les droits délégués par les responsables.
**🔒 Permission** : **Admin + Pasteur Principal + Super Admin**.

# Onglet 12 — Comptes & Admins
**Objectif** : gérer les comptes privilégiés.
**Contenu** :
- **Liste des Admins** : attribuer / révoquer le statut Admin. Éligibles par défaut = **Pasteurs et Ministres** ; **exception** : promotion Admin possible pour **tout membre** dans des cas spéciaux (via autorisation).
- **Super Admins** : créer / révoquer (journalisé).
- **Journal des changements de comptes** (qui a nommé / révoqué qui, et quand) visible **directement ici**, en plus de l'Audit global.
**🔒 Permission** : attribution Admin & gestion Super Admins = **Super Admin uniquement**.

# Onglet 13 — Configuration système
**Objectif** : paramètres globaux.
**Contenu** :
- **Branches** : libellés, thèmes (Church / Light).
- **Déclencheurs de notifications** : activer / désactiver par type d'événement, canaux (in-app / email / SMS / WhatsApp).
- **Seuils & définitions configurables** : alertes d'intégration (**3 j / 7 j**), définition « **membre actif** » (≤ 1 mois), fuseau horaire, périodes par défaut, langue.
**🔒 Permission** : Super Admin (et Admin selon périmètre).
> Les **clés d'intégration techniques** (Cloudinary, Twilio, École Bloom) sont **gérées hors interface** (variables d'environnement / déploiement) pour la sécurité — non exposées dans cet écran.

# Onglet 14 — Constructeur de formulaires
**Objectif** : créer / modifier les formulaires de l'application — version **simple** (champ par champ, pas de glisser-déposer au MVP).
**Contenu** :
- **Liste des formulaires** (FormDefinition) par département / fonction, avec **versions**. **Tous** les formulaires sont **modifiables** (y compris les formulaires standard : service, RSA, ADN, Portiers, culte, Bloom Bus…), à partir d'un **schéma par défaut** pré-seedé.
- **Éditeur de formulaire** : ajouter / éditer des champs (texte, nombre, choix, échelle, case à cocher, date…), validation, ordre.
- **Éditeur d'étapes** (`parcours_etapes`) : définir les étapes, leur ordre, et **qui valide** chacune.
**🔒 Permission** : Admin / Super Admin.

# Onglet 15 — Audit
**Objectif** : consulter le **journal global** immuable.
**Contenu** : **journal global** (action · entité · ancienne → nouvelle valeur · opérateur · date) · **filtres** (entité, opérateur, type d'action, période, branche) · **export** (CSV / PDF). **Lecture seule**, aucune suppression (soft-delete partout). *Le détail par entité reste sur la timeline d'audit de la fiche 360°.*
**🔒 Permission** : **Admin + Super Admin** — lecture seule.

---

# Vue détail — Fiche Membre 360°
Atteinte depuis Membres (et partout où un membre est cliqué).

## Structure
- **En-tête** (toujours visible) : photo · nom · badges (niveau · branche · statut baptême · « au rouge ») · **bouton « Modifier »** — **seule action de la fiche** : modifier une information personnelle **et changer de branche**.
- **Dashboard santé** (juste sous l'en-tête) : **radar 6 axes** + **courbes d'évolution**.
- **Onglets internes** pour les autres sections.

> Les autres informations (promotions, statuts, affectations, rapports, certifications) **ne se modifient pas depuis la fiche** : elles sont **rédigées / mises à jour par le département, le projet ou le Bloom Bus concerné**.

## Onglets internes
1. **Infos personnelles** : photo · identité (nom, prénom, genre, **nationalité**, date de naissance, situation matrimoniale, profession) · contacts (téléphone, téléphone parent/proche, email, **personne à contacter en cas d'urgence**) · localisation (commune, **quartier — liste**, GPS) · branche · dates (entrée à Bloom, baptême optionnelle). → **Le membre modifie tous ces champs personnels via « Modifier », sauf la branche** (transfert selon capacité).
2. **Infos spirituelles** : **date de 1ʳᵉ visite** (optionnelle — saisie par le membre, **auto-renseignée pour un nouveau**) · **date d'intégration** (auto au passage « Intégré ») · **date de conversion** · **statut de baptême** (non baptisé / baptisé + **date** + **via département / hors process** + **étapes du parcours** si en cours).
3. **Évolution multi-axes** (lecture seule) : **3 steppers visuels** — niveau communautaire (Nouveau → … → Coach), cursus pastoral (Aucun → … → Pasteur Titulaire), et **fonctions** (liste avec **département** + **date de nomination** pour chacune). *Historique des promotions → onglet Audit.*
4. **Appartenances & ancrages** (lecture seule) : **départements** (+ fonction dans chacun) · **Bloom Bus** (Commune → Zone → Bus) · **parcours à étapes** (ex. Baptême + étape courante) · **Projets** (équipes auxquelles il participe + rôle). *Affectations gérées dans les départements / Bloom Bus / projets.*
5. **Mentorat & encadrement** : **Service** (Leader → Coach → Responsable) · **Territoriale Bloom Bus** (Capitaine → Resp. Zone → Resp. Commune) · **mentor de cursus**. Encadrants **cliquables** vers leur fiche **uniquement si le niveau / la fonction du consultant y donne accès**.
6. **Centralisation des rapports** : **flux chronologique** des rapports concernant le membre + **filtres** (type, période, auteur). **Confidentialité** : rapports **pastoraux** et **Bloom Bus spirituels** masqués sauf accès (Coach / autorisation). **Le membre ne voit PAS** les rapports écrits sur lui par ses encadrants (il ne voit que sa propre auto-évaluation).
7. **Historique d'audit** : **timeline immuable** du membre (promotions, nominations, affectations, transferts de branche, baptême…) + **filtres** (type d'action, période, opérateur). Visible par la **hiérarchie / Admin** ; le **membre voit son propre historique**.

**🔒 Permission** : le membre voit sa fiche (édition limitée à ses champs personnels via « Modifier ») ; la hiérarchie selon portée ; **rapports pastoraux confidentiels masqués** ; transfert de branche selon capacité.
