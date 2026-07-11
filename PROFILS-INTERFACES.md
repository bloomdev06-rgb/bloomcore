# BloomCore — Interfaces & Capacités par Profil

> Définit, **profil par profil**, ce que l'utilisateur voit et peut faire dans l'interface unique adaptative. Rappel : il n'y a qu'**une seule interface** ; les menus, consoles, dashboards et boutons d'action s'affichent **conditionnellement** selon les capacités (niveau ∪ fonctions ∪ cursus ∪ départements ⊕ matrice de permissions ⊕ autorisations spéciales).
>
> Ordre de définition : du plus complet (**Super Admin**) au plus simple (**Nouveau**).
> Statut : **en cours de définition** — Super Admin rédigé, autres profils à venir.

## Structure commune (gabarit de chaque profil)
1. **Définition & portée** — qui est ce profil, son périmètre de données.
2. **Navigation** — entrées de menu visibles.
3. **Dashboards** — tableaux de bord accessibles.
4. **Consoles & modules** — écrans de gestion et ce qu'on y fait.
5. **Boutons d'action** — actions prioritaires/contextuelles.
6. **Capacités** — droits effectifs (lecture/écriture/validation).
7. **Limites & règles** — bornes, confidentialité, points de gouvernance.

---

# 1. Super Admin

## 1.1 Définition & portée
Compte **super-utilisateur seedé au développement**. Autorité **technique et de gouvernance maximale** de la plateforme. C'est le **seul** profil habilité à **attribuer ou révoquer le statut Admin** (accordé uniquement aux Pasteurs et Ministres).

**Portée de données** : **globale** — les **2 branches** (Church + Light), **tous** les ministères, départements (normaux & spéciaux), Bloom Bus, événements, membres et journaux. Aucun cloisonnement par branche.

## 1.2 Navigation (sidebar complète)
- **Accueil** — dashboard global de l'œuvre
- **Membres** — annuaire complet (2 branches)
- **Ministères**
- **Départements**
- **Bloom Bus** — territoire (Communes / Zones / Bus)
- **Cultes & Événements**
- **Projets**
- **Cursus pastoral**
- **Formations**
- *Section* **ADMINISTRATION**
  - **Permissions** — matrice dynamique
  - **Comptes & Admins** — attribution/révocation
  - **Configuration système** — branches, paramètres globaux
  - **Constructeur de formulaires** — formulaires des départements spéciaux
  - **Déclencheurs de notifications**
  - **Audit** — journal global immuable

> **Éléments permanents du header** (communs à tous les profils) : **commutateur de thème clair/sombre**, **cloche de notifications** (badge + panneau déroulant, avec page « Toutes les notifications » ouvrable au besoin) et **menu avatar** donnant accès à **Mon Profil**. Pas d'onglet Notifications dédié. La **nav principale** de la sidebar est sans titre ; seule la section **« Administration »** est titrée.

## 1.3 Dashboards
- **Global œuvre** : consolidation des 2 branches (membres, croissance, intégration, santé, qualification).
- **Par branche** : Church / Light isolées.
- **Par ministère**, **par département**, **Bloom Bus** (territorial), **Événements / Sunday Stats**.
- Filtres : **période** (semaine / mois / trimestre / année / personnalisée) et **branche**.

## 1.4 Consoles & modules (CRUD complet)
| Module | Ce qu'il peut faire |
|---|---|
| **Membres** | créer, éditer, valider, **transférer** (Light→Church), **promouvoir tous les axes**, gérer l'encadrement (Leader→Coach→Responsable), soft-delete |
| **Ministères** | créer, renommer, **réaménager** (rattacher/détacher départements) |
| **Départements** | créer/éditer (type **normal/spécial**), **activer une fonction spéciale** (ADN, Portiers, Intégration, Bloom Bus, Gestion des Cultes, **parcours à étapes**), nommer Responsables/Adjoints, configurer **étapes / validateurs / formulaires** |
| **Bloom Bus** | gérer **Communes / Zones / Bus**, définir les **centres GPS** |
| **Événements** | créer cultes récurrents (1er/2e Church, culte Light) & événements spéciaux |
| **Formations** | gérer Vases d'Honneur, paramétrer le **contrat École Bloom** (endpoint webhook) |
| **Cursus pastoral** | suivi de la ligne de mentorat (mentor ↔ filleuls), `rapport_pastoral`, promotions de cursus |
| **Projets** | créer un projet (portée au choix), nommer le **PMO**, composer l'**équipe** (rôles base + libres), gérer **objectifs** (checklist), **actions**, et **événements rattachés** |
| **Permissions** | éditer la **matrice** (capacité × branche × rôle/fonction), accorder des **autorisations spéciales** |
| **Comptes & Admins** | **attribuer/révoquer Admin** (Pasteurs/Ministres uniquement) ; **créer/révoquer d'autres Super Admins** (journalisé) |
| **Constructeur de formulaires** | créer/versionner les schémas de formulaires configurables |
| **Notifications** | configurer les **déclencheurs** (événements standards + personnalisés, canaux in-app/email/SMS/WhatsApp) |
| **Audit** | consulter/filtrer/exporter le **journal global immuable** |

## 1.5 Boutons d'action
Accès à **toutes** les actions de création (« ➕ Nouveau » membre, créer département/ministère/événement, etc.). Le bouton flottant « ➕ Enregistrer un Nouveau » ADN (formulaire Nouveau + OJ) est visible sur **toutes les pages**, uniquement pour les rôles ADN, Admin et Super Admin — pas pour Intégration/Portier/GDC, ce bouton étant spécifique au module ADN.

## 1.6 Capacités
**Toutes** les capacités de la plateforme, sur les 2 branches — **promotion de tous les axes, y compris le cursus pastoral** — sous réserve des règles de gouvernance ci-dessous. **Exception** : il n'accède **pas** au contenu des rapports pastoraux/spirituels confidentiels.

## 1.7 Limites & règles
- **Soft-delete uniquement** : aucune suppression physique, même pour le super admin (audit immuable).
- **Traçabilité** : toutes ses actions sont journalisées dans l'audit global (qui, quoi, avant/après, quand).
- **Rapports confidentiels** : le super admin **ne voit PAS** le contenu des rapports pastoraux/spirituels confidentiels — la confidentialité du corps pastoral prime, même sur lui.
- **Promotions** : il peut promouvoir **tous les axes, y compris le cursus pastoral**.
- **Super Admins** : il peut **créer et révoquer** d'autres comptes Super Admin (toujours journalisé).

## 1.8 Mon Profil
Espace personnel (commun à tous les profils), **accessible via le menu avatar** (pas un onglet de sidebar) :
- **Mes informations** : le membre **modifie lui-même** ses champs personnels (photo, contacts, email, profession, situation matrimoniale, GPS / commune…).
- **Champs verrouillés** (modifiables uniquement par le **Responsable de département et la hiérarchie supérieure**, via processus tracés en audit) : **progression de statut** (Nouveau → Coach), **branche**, **fonctions**, **affectations**, **statut baptisé**, **formation**, **cursus pastoral**.
- **Mes accès** : visualisation de **mon rôle, mes fonctions, mon cursus, mes départements, ma branche** et des **capacités** qui en découlent.
- **Sécurité** : changement de mot de passe, sessions actives.
- **Préférences** : canaux de notification (in-app/email/SMS/WhatsApp), **mode Plein Soleil**, **thème clair/sombre**, langue.

---

# 2. Admin

## 2.1 Définition & portée
Compte **super-utilisateur** porté par un **Pasteur ou un Ministre**, accordé par un **Super Admin**. **Portée globale (2 branches)**. Autorité de gestion **quasi-complète** — dérivée du Super Admin avec quelques restrictions de gouvernance.

## 2.2 Navigation
**Tous les onglets** du Super Admin (navigation principale + section Administration), avec les nuances ci-dessous.

## 2.3 Différences vs Super Admin
| Élément | Admin |
|---|---|
| Attribuer le statut **Admin** | ❌ (réservé Super Admin) |
| Gérer les **Super Admins** | ❌ (réservé Super Admin) |
| Onglet **Comptes & Admins** | visible en **lecture seule** (voir qui est Admin) |
| Promotion du **cursus pastoral** | seulement s'il a la fonction **Pasteur Principal** |
| **Rapports pastoraux confidentiels** | non visibles (sauf sa propre ligne de cursus) |
| **Configuration système** | **accès complet** |
| Tout le reste (membres, ministères, départements, Bloom Bus, événements, projets, permissions, formulaires, audit) | **identique au Super Admin** |

## 2.4 Capacités
Toutes les capacités de gestion de la plateforme sur les 2 branches, **sauf** l'attribution du statut Admin et la gestion des Super Admins. Soft-delete uniquement ; actions journalisées.

---

# 3. Pasteur Principal

## 3.1 Définition & portée
Le Pasteur Principal est **automatiquement Admin** : il cumule **tous les attributs de l'Admin** (§2) **et** les attributs propres à sa **fonction pastorale suprême**. Portée globale (2 branches).

## 3.2 Navigation
**Identique à l'Admin** : toute la navigation principale + la section Administration (Permissions, **Comptes & Admins** en lecture, Configuration système, Constructeur de formulaires, Audit).

## 3.3 Attributs propres (fonction)
- **Voit tout le cursus pastoral** → accès aux **rapports pastoraux confidentiels** (sommet de la chaîne).
- **Valide les promotions de cursus** (attribut de la fonction Pasteur Principal).
- **Supervision décisionnelle suprême** des 2 branches (corps ecclésiastique).

## 3.4 Limites
Comme l'Admin : **ne peut pas attribuer le statut Admin** ni **gérer les Super Admins** (réservé Super Admin).

---

# 4. Pasteur

## 4.1 Définition & portée
**Fonction de supervision pastorale** sur les **2 branches** (tous les ministères et départements). **N'est pas** automatiquement Admin.

## 4.2 Navigation
Toute la **navigation principale** (en **consultation / supervision**) ; **pas de section Administration**.

## 4.3 Spécificités
- Voit sa **ligne descendante de cursus** + ses **rapports pastoraux**.
- Peut créer des **événements**.
- **Gestion des structures** (créer / éditer ministère, département…) **uniquement** s'il cumule la fonction **Ministre** (son ministère) ou **Responsable de département** (son département).
- **Création de département** et **validation du cursus** : **non** — réservées à la fonction **Pasteur Principal** (la création de dept aussi à Admin / Super Admin).

## 4.4 Limites
Pas d'accès à la section Administration ; pas d'attribution de droits ; soft-delete uniquement ; rapports pastoraux confidentiels limités à sa ligne descendante.

---

# 5. Ministre (de tutelle)

## 5.1 Définition & portée
Fonction transversale de **supervision** d'**un ministère** (tous ses départements), sur les **2 branches**.

## 5.2 Navigation
- **Accueil** (dashboard limité à son ministère)
- **Membres** (des départements de son ministère)
- **Ministères** (vue de **son seul** ministère)
- **Départements** (les siens, console en **supervision**)
- **Bloom Bus** (si rattaché à son ministère)
- **Cultes & Événements** (peut créer des événements)
- **Projets** (création selon droit configurable)
- **Cursus pastoral** (sa ligne)
- **Formations** (placeholder)
- **Pas de section Administration**

## 5.3 Spécificités
- **Supervise** ses départements — **ne gère pas** (pas de nomination de Responsables ni de réaménagement ; réservé Admin / Pasteur Principal).
- Fait des **remontées avec suivi** (observations typées + échéance) qui **remontent aux Pasteurs et Pasteurs Principaux**.
- Voit **tous les rapports** de ses départements (service, activité, observations).
- Cible des **alertes d'intégration à 7 jours**.

## 5.4 Limites
Lecture / supervision sur son périmètre ; **rapports pastoraux confidentiels** limités à sa **ligne de cursus** ; pas d'accès Administration ; soft-delete uniquement.

---

# 6. Responsable de département (+ Adjoint)

## 6.1 Définition & portée
Responsable opérationnel d'**un seul département à la fois**. Gère son département de bout en bout.

## 6.2 Navigation
- **Accueil** : dashboard de **son département** + son radar personnel + ses rapports Bloom Bus.
- **Départements** : **console complète** de son dept (Membres · Hiérarchie & assignations · Validation Nouveaux · Agenda & activités · Rapports · Suivi si coach · formations internes éventuelles).
- **Membres** (de son département)
- **Cultes & Événements** : **en entier** (peut créer des événements de portée branche / 2 branches)
- **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**
- **Pas de section Administration**

## 6.3 Spécificités
- **Gère** son département : valide les réceptions, fait **progresser les statuts** (Nouveau → Stagiaire → Membre…), assigne Leaders / Coachs, gère l'agenda & activités.
- **Rapports** : service, RSA, activité, **observation avec / sans suivi**.
- **Délègue** ses droits dans son département (**sauf** l'accès au rapport spirituel).
- **Confidentialité** : voit les rapports de ses membres **sauf les rapports Bloom Bus (spirituels)** — accessibles seulement s'il est **Coach**, sinon **autorisation requise** (idem rapports pastoraux).

## 6.4 Adjoint
**Mêmes droits opérationnels** que le Responsable, mais **asymétrie** : le Responsable accède à **tout ce que fait l'Adjoint** ; l'inverse est **interdit**.

## 6.5 Limites
Un seul département à la fois ; pas de section Administration ; soft-delete uniquement.

---

# 7. Coach

## 7.1 Définition & portée
Niveau communautaire le plus élevé et position d'encadrement (**Responsable → Coach → Leader → Membre**). Suit ses **membres assignés** (sa cellule). Peut être **bi-branche** : **commutateur de branche** actif, ses **propres stats comptées sur sa branche principale**.

## 7.2 Navigation
- **Accueil** : son radar perso + **ses suivis** (sa cellule) + ses rapports Bloom Bus.
- **Membres** : ses membres assignés.
- **Départements** : vue **restreinte à sa cellule** → onglet **Suivi** (membres à suivre, rédaction des rapports de terrain).
- **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**.
- **Pas de section Administration**.

## 7.3 Spécificités
- Rédige le **rapport de suivi** (visites / entretiens) sur ses membres.
- **Lit** les rapports de ses membres **y compris les spirituels** (exception Coach) — niveau d'accès **configurable** (permissions dynamiques).
- **Ne rédige pas** le rapport spirituel (`rapport_bloom_bus_member`) — **sauf s'il est aussi Capitaine de Bloom Bus**, auquel cas il rédige les rapports spirituels des **membres de son bus** (cascade territoriale).
- **Commutateur de branche** (bi-branche).

## 7.4 Limites
Périmètre = sa cellule ; pas de section Administration ; soft-delete uniquement.

---

# 8. Leader

## 8.1 Définition & portée
Encadre directement ses **membres** (Coach → **Leader** → Membre). **Mono-branche**. En Bloom Bus, le **Capitaine de Bus** est un Leader.

## 8.2 Navigation & écran
**Même écran que le Coach**, avec un **périmètre plus restreint** (sa cellule) : Accueil (radar perso + ses suivis) · Membres (ses membres) · Départements (vue restreinte → onglet **Suivi**) · Cursus pastoral (sa ligne) · Formations (placeholder) · Mon Profil. **Pas de commutateur de branche** ; **pas d'Administration**.

## 8.3 Spécificités
- Rédige le **rapport de suivi** (visites / entretiens) sur ses membres.
- S'il est **Capitaine de Bus** : rédige les **rapports spirituels** des membres de son bus.
- **Ne lit pas** les rapports spirituels de ses membres (pas d'exception) — **sauf autorisation**.

## 8.4 Limites
Mono-branche ; périmètre = sa cellule ; pas d'Administration ; soft-delete uniquement.

---

# 9. Fonctions territoriales Bloom Bus (Capitaine · Resp. Zone · Resp. Commune)

## 9.1 Définition & portée
Fonctions du département spécial **Bloom Bus**, à trois niveaux (**Commune → Zone → Bus**). **Mono-branche**. Chacun voit **tout ce qui est en dessous de lui** (cascade).

## 9.2 Navigation & écran (même écran Bloom Bus, périmètre = leur niveau et en-dessous)
- **Capitaine de Bus** (= Leader) : **son bus** — carte des membres localisés, dashboard du bus.
- **Responsable de Zone** : **sa zone** (tous ses bus) — dashboard agrégé.
- **Responsable de Commune** : **sa commune** (toutes ses zones) — dashboard agrégé.
- Onglets : **Bloom Bus** (carte + dashboard) · **Membres** (de son périmètre) · **Suivi (Bloom Bus)**.

## 9.3 Le « Suivi » Bloom Bus ≠ le « Suivi » de département
- **Suivi de département** (Coach / Leader) : visites / entretiens → `rapport_suivi_coach`.
- **Suivi Bloom Bus** (ici) : c'est où l'on **rédige le rapport de santé spirituelle** (`rapport_bloom_bus_member`, 5 dimensions).
- **Cascade de saisie** : le Capitaine rédige le spirituel des **membres de son bus** ; le Resp. Zone celui des **Capitaines** ; le Resp. Commune celui des **Resp. Zone**. Le Capitaine rédige aussi le **rapport d'activité** du bus (`rapport_bloom_bus_life`).

## 9.4 Limites
Mono-branche ; périmètre territorial ; pas d'Administration ; **pas de gestion de l'évolution des membres** (réservée aux départements).

---

# 10. ADN

## 10.1 Définition & portée
Membre du **département d'accueil** : enregistre les nouveaux/visiteurs au culte et compte les présences. **Mono-branche**.

## 10.2 Navigation
- **Accueil** : radar perso + ses rapports.
- **Bouton flottant permanent** « ➕ Enregistrer un Nouveau ».
- **Console ADN** (dans Départements) · **Cultes & Événements** (rattacher le comptage à un événement) · **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**.
- **Pas d'Administration**.

## 10.3 Spécificités
- **« ➕ Enregistrer un Nouveau »** (bouton flottant) → **formulaire Nouveau** (capture rapide, dédoublonnage téléphone/email, GPS, genre, flag OJ).
- **Rapport ADN** par culte/événement : comptage **nouveaux (H/F)** + **OJ (H/F)**.
- Rapports standards : service (roster serviteurs), RSA.
- Un **membre ADN simple** peut **enregistrer des nouveaux** et **remplir le rapport ADN** — mais la **validation revient au Responsable ADN**.

## 10.4 Limites
Périmètre = accueil ; pas d'Administration ; soft-delete uniquement.

---

# 11. Portiers

## 11.1 Définition & portée
Membre du département chargé de l'**installation du peuple dans le temple** ; compte les présences par culte. **Mono-branche**.

## 11.2 Navigation
- **Accueil** : radar perso + ses rapports.
- **Bouton flottant** « 📝 Présences » (comptage par culte/événement).
- **Console Portiers** (dans Départements) · **Cultes & Événements** (rattacher le comptage) · **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**.
- **Pas d'Administration**.

## 11.3 Spécificités
- **Rapport de présences** (H/F) par culte/événement.
- Rapports standards : service (roster serviteurs), RSA.
- Un **Portier simple** peut remplir le comptage — **validation par le Responsable**.

## 11.4 Limites
Périmètre = installation / présences ; pas d'Administration ; soft-delete uniquement.

---

# 12. Gestion des Cultes

## 12.1 Définition & portée
Membre du département chargé de **consigner chaque culte**. **Mono-branche**.

## 12.2 Navigation
- **Accueil** : radar perso + ses rapports.
- **Bouton flottant** « 📝 + Rapport de Culte ».
- **Console Gestion des Cultes** (dans Départements) · **Cultes & Événements** (rattacher le rapport) · **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**.
- **Pas d'Administration**.

## 12.3 Spécificités
- **Rapport de culte complet** rattaché à un événement (infos générales, atmosphère spirituelle, incidents, stats de fréquentation ; saisie tactile +/−).
- Rapports standards : service (roster serviteurs), RSA.
- Un **membre simple** peut remplir le rapport — **validation par le Responsable**.
- **Sunday Stats Dashboard** (courbes d'affluence / croissance) : **visible uniquement par le Responsable**.

## 12.4 Limites
Périmètre = consignation des cultes ; pas d'Administration ; soft-delete uniquement.

---

# 13. Intégration

## 13.1 Définition & portée
Membre du département spécial **Intégration** (**un par branche**) : reçoit automatiquement tous les **nouveaux de sa branche** et **suit leur parcours** dans leur département choisi.

## 13.2 Navigation
- **Accueil** : file d'intégration + alertes.
- **Console Intégration** : **liste des nouveaux par département** avec leur **état** (en attente / suivi / intégré) + **alertes**.
- **Cursus pastoral** (sa ligne) · **Formations** (placeholder) · **Mon Profil**.
- **Pas d'Administration**.

## 13.3 Spécificités
- **Surveille / alerte uniquement** — la **validation des statuts reste au Responsable de département** (l'Intégration ne fait pas avancer les statuts).
- **Alertes** : 3 j (réception non validée) → Intégration + Responsable ; 7 j → escalade Ministre.
- Couvre **une seule branche** (il existe un département Intégration **dans chaque branche**).

## 13.4 Limites
Supervision / alerte ; pas de validation de statut ; mono-branche ; pas d'Administration.

---

# 14. Membre / Stagiaire / Nouveau (niveaux de base)

## 14.1 Définition & portée
Niveaux communautaires de base **sans fonction** : **Nouveau → Stagiaire → Membre (Boss…)**. **Tous ont un compte** dès le niveau Nouveau. Portée = **soi-même**.

## 14.2 Navigation (même interface de base)
- **Accueil** : son **tableau de bord personnel** (sa fiche, son **radar santé**, ses stats) — pas de KPI agrégés.
- **Bloom Bus** : son **auto-évaluation hebdomadaire** (santé spirituelle) + son rattachement.
- **Cursus pastoral** (s'il est dans le cursus) · **Formations** (son relevé) · **Mon Profil** (avatar).
- **Pas** d'annuaire Membres, **pas** de console département, **pas** d'Administration, **pas** de commutateur de branche.

## 14.3 Spécificités
- **Auto-évaluation hebdomadaire** de santé spirituelle (`rapport_bloom_bus_member` *self*) **dès le niveau Nouveau**.
- **Fiche membre complète** déclenchée au passage au niveau **Boss** (avant : infos de base).
- Champs personnels auto-modifiables ; champs structurants (niveau, branche, fonctions, baptême, cursus, formation) **gérés par la hiérarchie** (cf. §1.8).

## 14.4 Limites
Accès à ses seules données ; mono-branche ; soft-delete uniquement.

---

✅ **Tous les profils sont définis** (Super Admin → Nouveau).
