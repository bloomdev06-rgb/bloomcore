# BloomCore — Cahier des Charges Consolidé v2.0

**Plateforme globale de gestion communautaire — Bloom Church & Bloom Light**

> Ce document remplace et corrige le *Cahier des Charges v1.6* et le *Guide d'Architecture UX/UI v1.6*. Il consolide les décisions prises lors du cadrage en 12 étapes. Il constitue la **référence officielle** à valider avant tout développement.
> Statut : **à valider** · Dernière mise à jour : 2026-06-29.

---

## 0. Journal des corrections majeures (vs v1.6)

Le cadrage a corrigé plusieurs malentendus structurants du document d'origine :

1. **Interface unique adaptative** — il n'y a pas « 8 profils/interfaces ». Il existe **une seule interface membre** dont les menus, consoles et boutons d'action s'affichent **conditionnellement** selon le rôle, les fonctions, le cursus et les appartenances du membre.
2. **`Member` englobe tout** — pas d'entité `User` séparée. L'authentification et le profil sont portés par le membre.
3. **Pas de 3ᵉ branche** — uniquement Bloom Church et Bloom Light.
4. **« Gestion des Cultes » n'est pas un module** — c'est un département qui produit un rapport ; le rapport de culte est un **type de rapport** parmi d'autres (le terme anglais *worship* est abandonné).
5. **Les fonctions sont liées aux départements** — une fonction est le rôle tenu **dans** un département (une seule fonction par département). Les fonctions **pastorales/ministérielles** sont transversales.
6. **Progression séquentielle** — un nouveau termine d'abord sa phase d'intégration (En attente → Suivi → Intégré) **puis** entre dans la phase Membre (Stagiaire → Boss → Leader → Coach).
7. **Trois cascades de rapports** — service (département), territoriale (Bloom Bus) et cursus (pastoral).
8. **Couche « Ministère »** — niveau d'organisation au-dessus des départements.
9. **Entité « Événement »** — les rapports de comptage se rattachent à un événement de culte commun.
10. **Audit global immuable** — un journal central, la fiche membre en étant une vue filtrée.

---

## 1. Vision & principes fondateurs

### 1.1 Modèle centré Membre (Member-Centric)
Le **Membre** est l'entité pivot absolue. Un membre ne possède **qu'une seule fiche physique**, quel que soit le nombre de ses départements, cellules ou formations. Toutes les données convergent vers cette fiche unique.

### 1.2 Interface unique adaptative
L'application expose **une interface unique**. Ce qu'un membre voit (menus, consoles, boutons d'action, dashboards) est **calculé** à partir de ses capacités, elles-mêmes dérivées de :

```
capacités = niveau communautaire  ∪  fonction(s) par département  ∪  cursus pastoral
            ∪  appartenances départementales
            ⊕ surcharges (matrice de permissions dynamique)
            ⊕ autorisations spéciales (exceptions)
```

Il n'existe **pas** d'applications séparées par rôle. Les boutons d'action (ex. « ➕ Enregistrer un Nouveau », « 📝 + Rapport de Culte ») sont **contextuels** à la fiche, conditionnés par l'appartenance départementale.

### 1.3 Résilience terrain
L'application est une **application web responsive unique** (desktop + mobile), enrichie d'une **couche PWA** pour le hors-ligne (cache local des formulaires, file de synchronisation) et l'installabilité. Indispensable pour le travail aux portes de l'église et dans les bus.

---

## 2. Le Membre (noyau)

### 2.1 Identité
nom, prénom, **téléphone** (unique), **téléphone parent/proche**, **personne à contacter en cas d'urgence**, email, **genre**, **nationalité**, **date de naissance**, situation matrimoniale, profession, photo de profil, **GPS** (latitude/longitude), commune, **quartier** (liste), **date d'entrée à Bloom**, **date de baptême** (optionnelle), branche de rattachement.

> Note : `OJ` (« Oui à Jésus ») **n'est pas** un champ de la fiche membre — c'est une donnée du rapport ADN (voir §7).

### 2.2 Les trois axes indépendants

| Axe | Nature | Valeurs |
|---|---|---|
| **Niveau communautaire** | unique, progressif | Nouveau → Stagiaire → Boss → Leader → Coach |
| **Fonction(s)** | liée(s) aux départements, une par département | voir §2.3 |
| **Cursus pastoral** | unique, progressif, réservé corps pastoral | Aucun → Appelé → Serviteur → Gagneur d'âme → Assistant Pasteur → Pasteur Assistant → Pasteur Titulaire |

Les axes sont **réellement indépendants** : un Responsable de département peut n'avoir aucun niveau communautaire correspondant.

- **« Membre »** est l'ombrelle des niveaux Stagiaire et au-dessus.
- La **fiche membre complète** (formulaire Membre) se déclenche au passage au niveau **Boss**.

### 2.3 Fonctions
Une fonction est le **rôle tenu dans un département** (**une seule fonction par département**) :

- **Départements de service** : Responsable · Adjoint
- **Bloom Bus** : Capitaine de Bus · Responsable de Zone · Responsable de Commune
- **Transversales** (rattachées à l'œuvre, pas à un département) : **Ministre de tutelle**, **Pasteur**, **Pasteur Principal**

### 2.4 État d'intégration (phase Nouveau)
Distinct du niveau communautaire, il ne concerne que la phase Nouveau : **En attente → Suivi → Intégré** (voir §7).

### 2.5 Autres données de la fiche
Jalons (statut baptême + date, via département ou hors process ; classes Vases d'Honneur ; certifications) · **statut « Drachme (perdu) »** (membre égaré — coché manuellement, distinct du « au rouge ») · appartenances (départements normaux & spéciaux, dont Bloom Bus et les parcours à étapes) · ligne d'encadrement (Leader → Coach → Responsable) · `healthKPIs` 6 axes · timeline d'audit (vue filtrée du journal global).

---

## 3. Branches (Church & Light)

- Deux branches **égales** : **Bloom Church** et **Bloom Light**. Pas de 3ᵉ, **pas de notion de principale/secondaire**.
- **Exclusivité** : un membre appartient à **une seule** branche (`branchId`).
- **Transfert** : **Light → Church uniquement**, conservation intégrale de l'historique, journalisé `BRANCH_TRANSFER`.
- **Coachs bi-branche** : peuvent suivre des membres sur les 2 branches ; déclarent leur **branche de rattachement** (`primaryBranchId`, modifiable — il s'agit de la branche d'attache du coach, non d'un classement des branches) → **leurs propres données y sont comptabilisées**. Leurs **actions de terrain** s'imputent sur la branche du **membre concerné**.
- **Commutateur de branche** (header) : visible **uniquement** par les profils actifs sur 2 branches (Coachs bi-branche, corps pastoral/ministériel).
- **Autorité pastorale/ministérielle** : globale, non cloisonnée.
- **Autorisations spéciales** : mécanisme d'exception pour accorder des droits multi-branche à n'importe quel membre.

---

## 4. Organisation : Ministères & Départements

### 4.1 Arbre organisationnel
```
Ministère ── Départements (normal | spécial)
                 └─ Responsable (+ Adjoint) → Coach → Leader → Membre
```
- **Rien n'est hors ministère** : tout département appartient à **un** ministère.
- Les ministères sont **réaménageables à tout moment** (journalisé en audit).
- **Ministre** : supervise tous les départements de **son** ministère, sur les 2 branches.
- **Pasteur** : supervise **tous** les ministères et départements des 2 branches.

### 4.2 Départements
- **Créables/modifiables** par les comptes Admin. À la création, on choisit le **type : normal**, ou **spécial** en **activant une fonction spéciale** parmi : `adn`, `portiers`, `integration`, `bloom_bus`, `gestion_cultes`, `parcours_etapes`. La fonction active les **comportements particuliers** du département.
- **Par branche** : chaque département existe **dans chaque branche** (une instance en Bloom Church, une en Bloom Light) ; un département est donc rattaché à une **branche**.
- **Hiérarchie identique partout** : Responsable (+ Adjoint optionnel) → Coach → Leader → Membre.
- **Asymétrie Adjoint** : mêmes droits opérationnels, mais le Responsable accède à l'intégralité des données de l'Adjoint (pas l'inverse).
- **Multi-appartenance** : un membre peut appartenir à plusieurs départements (une fonction par département).

### 4.3 Règle générale des rapports
- **Tous** les départements remplissent le **rapport de service** (schéma **standard par défaut**).
- **Certains** départements ont **un formulaire supplémentaire**.
- **Tous les formulaires** (standard ou spéciaux) sont **modifiables** via le constructeur de formulaires, à partir de leur **schéma par défaut** pré-seedé.

| Département | Formulaire(s) en plus |
|---|---|
| ADN | formulaire Nouveau + rapport ADN (comptage par culte) |
| Portiers | rapport de présences par culte (H/F) |
| Gestion des Cultes | rapport de culte complet |
| Bloom Bus | rapport_bloom_bus_member + rapport_bloom_bus_life |
| Baptême / Eden 0 / PRD (parcours à étapes) | suivi d'étapes + formulaire(s) d'étape |

---

## 5. Bloom Bus (département spécial territorial)

### 5.1 Maillage territorial
Structure **Commune → Zone → Bloom Bus**. Commune, Zone et Bus sont des **entités gérées par l'admin** ; chaque **Bus possède un centre géographique** servant à l'auto-affectation GPS. Un membre est rattaché à **un seul** bus à un instant donné.

**Fonctions** : Capitaine de Bus · Responsable de Zone · Responsable de Commune.

### 5.2 Deux rapports distincts

**`rapport_bloom_bus_member`** — suivi spirituel/santé du membre (5 dimensions : spirituelle, sociale, santé physique, situation financière, présence au culte). **Alimente directement les `healthKPIs`** du radar.

Saisi **une seule fois par semaine et par personne**, par le **supérieur direct** dans la cascade territoriale (ou auto-saisie à la base) :

| Personne évaluée | Évaluateur |
|---|---|
| Membre | lui-même **ou** son Capitaine |
| Capitaine | lui-même **ou** son Responsable de Zone |
| Responsable de Zone | lui-même **ou** son Responsable de Commune |
| Responsable de Commune | lui-même **ou** le Responsable du département Bloom Bus |

Le supérieur a **visibilité sur tous les rapports en dessous de lui** (transitif).

**`rapport_bloom_bus_life`** — activité du Bloom Bus (mobilisation, présence culte, moisson, visite, activité). Rempli par le **Capitaine seul** → KPIs locaux (mobilisation, présence culte, moisson, visite, activité).

### 5.3 Visualisation & configuration
**Pas de logistique de transport à gérer** (ni pointage de passagers). Carte **OpenStreetMap** avec marqueurs géolocalisés des bus et des membres (vue territoriale). Formulaires Bloom Bus **configurables par l'admin**.

---

## 6. Intégration, ADN & Portiers

### 6.1 Trois départements (parmi tous les autres)
ADN, Portiers et Intégration sont des **départements à part entière**, au même titre que tous les autres départements de l'application, avec des responsabilités spécifiques :
- **ADN** : accueille les nouveaux/visiteurs au culte et enregistre ceux qui souhaitent rejoindre la communauté.
- **Portiers** : installation du peuple dans le temple ; remplissent un **rapport de présences par culte** (H/F).
- **Intégration** : **reçoit automatiquement** tous les nouveaux et **suit leur parcours**.

### 6.2 Cycle de vie du Nouveau

**Saisie** — l'ADN remplit le **formulaire Nouveau** (questions de base + genre + flag OJ). Dès validation, le nouveau suit **deux parcours parallèles** : Intégration (département de service choisi) et Bloom Bus (rattachement géographique).

**Phase Nouveau (état d'intégration)** :
1. Le Responsable du département choisi reçoit une notification → **valide la réception** → statut **En attente**.
2. Transitions **En attente → Suivi → Intégré**, validées par le Responsable, le Coach/Leader assigné, ou un membre délégué.
3. **Alertes** (comptées depuis l'enregistrement par l'ADN) : à **3 jours** sans validation de réception → Intégration + Responsable ; à **7 jours** toujours au statut « validation de réception » ou « En attente » → le membre **passe au rouge** et escalade au **Ministre de tutelle**.

**Phase Membre (niveau communautaire)** — une fois **Intégré** : **Stagiaire → Boss → Leader → Coach**. Le passage à **Boss déclenche la fiche membre**.

### 6.3 Formulaire Membre
- Rempli quand le nouveau devient Membre, avec **pré-remplissage** depuis le formulaire Nouveau.
- **Aussi** utilisé pour enregistrer des membres déjà présents — rempli par le **Responsable de département** ou un membre délégué.

### 6.4 Rapport ADN & OJ
- **Rapport ADN** : comptage par **Événement** du nombre de **nouveaux (H/F)** et d'**OJ « Oui à Jésus » (H/F)**.
- **OJ** : dédoublonné par téléphone et/ou email (peut déjà exister) ; **compté en agrégat** dans les stats du culte même s'il existe déjà ; **ajouté automatiquement** au suivi du **département Baptême**.

---

## 7. Événements, Agenda & Activités

### 7.1 Événements (uniques, portée large)
- Un **Événement** est **unique** et de portée **large** : il concerne **une branche entière** ou **les 2 branches**, et peut impliquer **plusieurs/tous les départements**.
- Générés par le **Responsable de Gestion des Cultes**, les **Ministres**, les **Pasteurs**, ou un **département** (depuis son agenda).
- **Cultes récurrents** (cas particulier) : dimanche → 1er + 2e culte (Bloom Church), 1 culte (Bloom Light). **Spéciaux** : INside, Altar, NSS, conventions…
- Rattachés à une **branche** (ou les 2) et éventuellement à un **projet** (§16). Au remplissage des rapports de comptage (ADN, Portiers, Gestion des Cultes), on **sélectionne l'Événement** → consolidation des stats entre départements.

### 7.2 Agenda & activités de département
Chaque département dispose d'un **calendrier** (routines de semaine + programme de l'année) avec **alertes** :
- **Activités** : **récurrentes** et **internes au département** (temps de prière, méditation, réunion de département, RSA…), audience = membres du département.
- **Événements** : **uniques** et de portée plus large (une branche ou les 2 branches), créés depuis l'agenda du département (§7.1).
- **Alertes** automatiques de rappel sur les activités/événements programmés.

### 7.3 Rapport d'activité
Chaque **activité** ou **événement** peut donner lieu à un **rapport d'activité** (`rapport_activite`) : **observations** + **serviteurs** (membres ayant servi).

---

## 8. Typologie des rapports

Entité **`Report` polymorphique** (`reportType`). Transverse à tous : auteur, type d'auteur (self/hiérarchique), cible (membre/département/zone/commune), **branche d'imputation** (celle du membre cible), date, confidentialité, et pour les spéciaux des **champs configurables**.

| `reportType` | Producteur | Portée |
|---|---|---|
| `rapport_service` | Responsable / délégué, par culte ou événement | **roster des serviteurs** (membres ayant servi) |
| `rapport_rsa` | tous les départements (hebdomadaire) | suivi des actions et tâches confiées au département |
| `rapport_activite` | par activité / événement | observations + serviteurs |
| `rapport_suivi_coach` | Coach / Leader (hebdomadaire) | nb visites, nb entretiens, membres visités / entretenus, observation |
| `rapport_observation` | Responsable de département | observation **typée** (spirituel/financier/matériel/social/organisationnel), **informatif** ou **suivi + échéance** |
| `rapport_bloom_bus_member` | cascade territoriale | suivi spirituel 5 dim. → healthKPIs |
| `rapport_bloom_bus_life` | Capitaine | activité de sortie → KPIs locaux |
| `rapport_adn` | ADN | comptage nouveaux + OJ (H/F) par événement |
| `rapport_portiers` | Portiers | présences (H/F) par événement |
| `rapport_culte` | Gestion des Cultes | rapport de culte complet |
| `rapport_pastoral` | corps pastoral | évaluation du cursus (confidentiel) |

### 8.1 Cascades de visibilité

| Cascade | Chaîne | Rapport |
|---|---|---|
| **Service** (département) | Responsable → Coach → Leader → Membre | `rapport_service`, `rapport_rsa`, `rapport_activite`, `rapport_suivi_coach`, `rapport_observation` |
| **Territoriale — suivi** (Bloom Bus) | Resp. Commune → Resp. Zone → Capitaine → Membre | `rapport_bloom_bus_member` |
| **Territoriale — activité** (Bloom Bus) | Resp. Commune → Resp. Zone → Capitaine | `rapport_bloom_bus_life` |
| **Cursus** (pastoral) | Pasteur Titulaire → … → Serviteur → Appelé | `rapport_pastoral` |

Le `rapport_service` **liste les serviteurs** d'un culte ou d'un événement (qui a servi). En complément, un Responsable peut rédiger une **note individuelle** sur un membre (visible par lui et ses supérieurs) et des **observations typées** (`rapport_observation`).

### 8.2 Cursus pastoral (`rapport_pastoral`)
Chacun rédige le rapport sur le membre du **niveau directement inférieur qui lui est confié** (Serviteur → Appelé, Gagneur d'âme → Serviteur, …). Le niveau supérieur voit toute sa ligne descendante ; le **Pasteur Principal voit tout le cursus et valide les promotions**.

### 8.3 Confidentialité
Un Responsable **ayant le statut de Coach** accède aux rapports de ses membres **sauf** ceux du corps pastoral (**secrets** sauf si l'auteur coche `partagerAvecResponsableDept`). **S'il n'est pas Coach**, l'accès à ces rapports doit lui être **explicitement autorisé** par son Ministre ou les Pasteurs.

---

## 9. Départements spéciaux à étapes (parcours)

- Un département dont la **fonction spéciale `parcours_etapes`** est activée fonctionne comme un **parcours d'accompagnement à étapes** (ex. Baptême, Eden 0, PRD).
- À la création, l'admin définit : les **étapes**, **qui valide** chaque étape, et le(s) **formulaire(s)** associé(s).
- Le **suivi d'étapes** d'un membre est porté par son **appartenance** au département (étape courante + statut).
- Une **base d'étapes est pré-seedée** à l'installation (Baptême, Eden 0, PRD…).

### 9.1 Baptême
Département spécial `parcours_etapes` à 4 étapes seedées :
1. Inscription au parcours de baptême
2. Suivi des 3 cours de baptême
3. Entretien de baptême
4. Baptême physique → `baptismStatus = baptisé` (passage de *non baptisé* à *baptisé*) + audit `BAPTISM_COMPLETED`. **Pas de certificat** — seul le statut change.

### 9.2 Baptême hors process (mise à jour directe)
Tout le monde ne passe pas par le département Baptême. Le statut peut donc être mis à jour **hors process** :
- Le **formulaire Membre** comporte une **date de baptême (optionnelle)** : si renseignée à l'inscription, le membre est marqué **baptisé sans passer par le département** (n'affecte pas les données du département Baptême).
- Pour un **membre déjà en base** (quel que soit son état : nouveau, stagiaire…), tout changement de statut baptême **doit indiquer** s'il a **suivi le process du département** ou non (`baptismViaDepartment`) **+ la date**.
- Objectif : tenir à jour la **base des baptisés des 2 branches** sur une période donnée (statistiques).

---

## 10. Formations (onglet)

L'onglet **Formations** agrège toutes les formations du membre depuis deux sources :

- **Académie Vases d'Honneur** : gérée **dans l'application** → saisie directe par le **Responsable de département** (inscription, progression, certification).
- **École de formation Bloom** : **module externe découplé** (sous-domaine), **phase 2**. Pour l'instant, on **pose le contrat d'intégration** (endpoint sécurisé entrant) ; quand le module sera développé, il **poussera le parcours** du membre vers l'application principale.

**Effet d'une formation terminée** : **informative + promotion manuelle** par le responsable habilité. Une **table de correspondance configurable** pourra automatiser des promotions ultérieurement.

---

## 11. Permissions & gouvernance

### 11.1 Comptes privilégiés
- **Super-admin** : défini au développement (seedé), **seul habilité** à attribuer le statut Admin.
- **Admin** : compte super-utilisateur ; **seuls les Pasteurs et Ministres** sont éligibles ; attribué **uniquement par un super-admin**.

### 11.2 Matrice de permissions dynamique
Configurable **par capacité × rôle/fonction** (capacités en **liste prédéfinie** : voir / éditer / valider par module), **pour tous les rôles** (pas seulement les Coachs), par **Admin / Pasteur Principal / Super Admin**, en temps réel. Le **scoping par branche** s'applique au niveau des **données** (une capacité s'évalue dans le contexte de la branche du membre). Exemples de capacités : consulter les rapports de vie, consulter la situation financière, consulter l'historique de présence au culte, modifier les jalons de baptême/intégration, inscrire aux formations.

### 11.3 Délégation
Un Responsable peut déléguer ses droits **uniquement dans son département**, **jamais** l'accès au **rapport spirituel** d'un membre.

---

## 12. Notifications & Audit

### 12.1 Notifications multicanal
**In-app (cloche) + email + SMS + push.**
Déclencheurs : nouveau membre, validation, affectation, promotion, changement de fonction ; alertes d'intégration **3 jours** et **7 jours** (cf. §6.2). Les notifications doivent aussi être **activables pour d'autres événements** — **déclencheurs configurables** par l'admin.

### 12.2 Audit global immuable
**Journal central inviolable** couvrant membres, départements, événements et **changements de permissions**. Chaque entrée : type d'action, ancienne/nouvelle valeur, opérateur, horodatage. **Soft-delete partout**, aucune suppression définitive. La timeline « Historique d'Audit » de la fiche membre est une **vue filtrée** de ce journal.

---

## 13. Dashboards & KPIs

### 13.1 Indicateurs décisionnels

> **Membre actif** : membre ayant **servi il y a ≤ 1 mois** — base des KPI d'activité.
- **Santé spirituelle** : ce n'est **pas** un index unique. On affiche **l'évolution de chaque dimension** (spirituelle, sociale, financière, physique…) sous forme de **courbes**. Dans les rapports spirituels, chaque champ est saisi sur une **échelle ordinale** : *Très faible · Faible · Moyen · Bon · Très bon*.
- **Qualification de département** : **synthèse de l'évolution des champs du rapport de service** (présence au culte, nombre de membres actifs, etc.).
- **Mobilisation Bloom Bus** : `T_mob_bus = (Σ présents_départ / Σ membres_rattachés) × 100`, **complétée** par l'évolution du nombre de membres, du nombre de nouveaux gagnés, etc.

### 13.2 Radar de santé (6 axes) — mapping de calcul *(hypothèse, ajustable)*
| Axe | Source |
|---|---|
| Spirituel | `vieSpirituelle` (Très faible → Très bon → %) |
| Social | `vieSociale` (Très faible → Très bon → %) |
| Financier | `situationFinanciere` (Très faible → Très bon → %) |
| Physique | `santePhysique` (Très faible → Très bon → %) |
| Présence culte | émargements / cultes attendus |
| Présence service | présences service / services attendus |

> Le radar montre l'**état courant** ; l'**évolution** de chaque axe est affichée en **courbes** (cf. §13.1).

### 13.3 Dashboards par profil
- **Tout membre** (accueil) : fiche + radar 6 axes + **ses rapports Bloom Bus**.
- **Responsable de département** : synthèse de son département + son radar + **rapports Bloom Bus de ses membres s'il y a été autorisé**.
- **Fonction Bloom Bus** : dashboard du bus **dans l'onglet Bloom Bus** (pas sur l'accueil).
- **Ministre** : dashboard global de **son ministère** **et des Bloom Bus**.
- **Pasteur** : dashboard global sur **les 2 branches** **et des Bloom Bus**.
- **Périodes** : semaine / mois / trimestre / année + plage personnalisée.

---

## 14. Design system & UX

### 14.1 Charte (règle 80/20)
- **Dominantes** : Vert Sarcelle `#006C67` + Blanc `#FFFFFF`.
- **Secondaires** : Warm Grey `#D6D1CB` (cartes/bordures — **jamais en typographie**), Jaune Doré `#D2AF1F`.
- **Accents (≤ 20%)** : Rose Fushia `#D62766`, Bleu Céruléen `#009BDE`, Bleu Turquoise `#00A7B5`, Vert Anis `#A6B340`, Orange `#F38B36`, Rouge Pourpre `#B21E28`.
- **Adaptation par branche** : Church (vert+blanc, accents céruléen/anis) · Light (doré sur vert, cartes warm grey, accents orange/fushia).

### 14.2 Typographie
- Titres : **Gotham** → substitut **Montserrat** (modifiable si licence).
- Corps : **Sentinel** → substitut **Georgia** (modifiable si licence). Corps en noir/Slate 900, contraste **WCAG AA 4.5:1**.

### 14.3 Navigation shell
Header (logo, **commutateur de branche**, cloche notifications, photo) + **sidebar desktop rétractable** + **bottom bar mobile** (glassmorphism) + **bouton flottant ADN**.

### 14.4 Interactions & terrain
- Transition standard : `all 250ms cubic-bezier(0.4, 0, 0.2, 1)`.
- Micro-interaction **Color Sweep** au basculement de branche ; **skeleton loaders** ; animations de réussite.
- **Mode Plein Soleil** (+15% tailles, contraste renforcé).
- **Offline-first (PWA)** : cache LocalStorage des formulaires, mention « Sauvegardé localement », **auto-synchronisation** au retour réseau.

### 14.5 Maquette
Le design est **ajustable** : il s'appuiera sur les **exemples visuels fournis** par le commanditaire.

---

## 15. Module Cursus pastoral

Le Cursus pastoral n'est pas qu'un axe de rapport : c'est un **module de suivi de mentorat ministériel**.

- **Ligne de mentorat** : chaque membre du cursus a un **mentor** (niveau directement supérieur qui lui est confié, `cursusMentorId`) et des **filleuls** (niveau inférieur).
- **Suivi hiérarchique** : chaque supérieur voit l'**arbre descendant** de sa ligne ; le **Pasteur Principal** voit tout le cursus.
- **Rapports** : `rapport_pastoral` rédigé par le mentor sur son filleul (cf. §8.2), confidentiel.
- **Promotions** : progression Appelé → … → Pasteur Titulaire, **validées par le Pasteur Principal**, journalisée en audit.
- **Onglet dédié** « Cursus pastoral » (corps pastoral) : mes filleuls, mon mentor, rapports, promotions.

## 16. Module Projets

Un **Projet** est une initiative structurée (souvent temporaire) de l'organisation.

- **Portée** choisie à la création : **transverse (2 branches)**, **branche**, ou **ministère**.
- **PMO** (chef de projet) **obligatoire** — pilote le projet.
- **Équipe projet** : membres dotés de **rôles de projet** — palette de base (PMO, Responsable COM, Logistique…) **+ ajout libre** par le PMO. Distincts des fonctions départementales.
- **Objectifs** : **checklist** (atteint / non atteint).
- **Actions** : tâches assignables (responsable, échéance, statut à faire / en cours / fait).
- **Événements rattachés** : un **Événement** de la plateforme peut être **rattaché à un projet** (lien optionnel) — certains événements existent hors projet.
- **Suivi** : dashboard projet (avancement des objectifs, actions, événements, échéances).
- **Onglet dédié** « Projets ».

## 17. Périmètre des itérations

### 17.1 MVP (itération courante)
Membre & 3 axes · Branches & étanchéité · Ministères/Départements (normaux & spéciaux) · Bloom Bus · Intégration/ADN/Portiers · Événements · Rapports (3 cascades) · Baptême · **Cursus pastoral** · **Projets** · onglet Formations + Vases d'Honneur · Permissions (super-admin/admin/matrice/délégation) · Notifications & audit · Dashboards & KPIs · Design system + shell + écrans clés · PWA offline-first.

### 17.2 Phase 2
**Module externe École de formation Bloom** (sous-domaine + contrat API/webhook) · raffinements analytiques · automatisations de promotion.

---

## 18. Stack technique retenue

**Monorepo** (npm workspaces) : `apps/api`, `apps/web`, `packages/shared` (+ `apps/academy` en phase 2).

### Frontend
| Couche | Choix |
|---|---|
| Framework / build | React 18 · Vite 5 · TypeScript |
| Routing | React Router v6 |
| Styling | TailwindCSS v3 (design tokens charte) |
| Composants UI | shadcn/ui + Lucide React |
| Data / cache | TanStack Query 5 |
| État global | Zustand 4 |
| Formulaires | React Hook Form 7 + Zod |
| Graphiques | Recharts 2 |
| Temps réel | Socket.io-client 4 |
| HTTP / Dates | Axios · Day.js |
| Offline | vite-plugin-pwa + LocalStorage (file de sync) |

### Backend
| Couche | Choix |
|---|---|
| Runtime / framework | Node 20 LTS · Express 4 · TypeScript |
| ORM / DB | **Prisma · PostgreSQL** |
| Validation | Zod (partagé front/back) |
| Auth | JWT (access + refresh) + bcrypt + RBAC dynamique |
| Temps réel | Socket.io 4 |
| Jobs planifiés | node-cron (alertes 3j/7j, KPIs nocturnes) |
| Upload / photos | Multer + Cloudinary |
| PDF | react-pdf / pdfkit (export rapports, sans Chromium) |
| Email | Nodemailer |
| SMS / WhatsApp | Twilio (SMS + WhatsApp Business API) |
| Sécurité / logs | Helmet · cors · Morgan · dotenv |

### Déploiement
| Service | Hébergement | Coût départ |
|---|---|---|
| Frontend (PWA) | Vercel | gratuit |
| Backend API | Render | gratuit (cold start) / ~7 $/mois |
| Base PostgreSQL | **Supabase** (Postgres managé) | free-tier |
| Photos | Cloudinary | gratuit ≤ 25 Go |
| École de formation Bloom (phase 2) | sous-domaine séparé | — |

> **PostgreSQL** (Supabase) est préféré à MongoDB pour garantir l'intégrité relationnelle exigée par les hiérarchies, le RBAC dynamique par branche, l'audit immuable et les transferts. **Notifications multicanal** : in-app (Socket.io) + email (Nodemailer) + SMS & WhatsApp (Twilio). Supabase est utilisé uniquement comme Postgres managé (auth maison JWT conservée).

---

*Fin du cahier des charges consolidé v2.0.*
