# Feature: Visibilite cumulee par profil et departement

## Exigences

- Lorsqu'un membre exerce plusieurs fonctions, le systeme doit activer simultanement tous ses roles reels.
- Lorsqu'un Responsable supervise plusieurs departements, le systeme doit lui permettre de naviguer et d'agir dans chacun d'eux, sans elargir son perimetre a un autre departement.
- Lorsqu'un departement porte une fonction outil, ses membres doivent recevoir uniquement le role outil correspondant.
- Lorsqu'un Ministre est tuteur d'un ministere, il doit recevoir les roles outils des departements de ce ministere dans sa branche.
- Eden Zero ne doit jamais conferer le role ni l'acces Baptême. Le departement Baptême utilise un marqueur technique propre.
- Seuls Super Admin, Admin et Pasteur Principal peuvent franchir les branches. Le Pasteur conserve ses pouvoirs dans sa branche.
- Un projet n'est visible a un profil hors ligne pastorale que s'il est PMO ou membre de l'equipe, par identifiant membre.
- Les anciens droits devenus interdits doivent etre revoques par une migration versionnee, sans ecraser les autres personnalisations.
- Les rapports GDC et Portiers doivent etre refusés par le serveur si l'operateur ne detient pas le role outil correspondant.
- L'attribution de fonction Bloom Bus doit rester disponible uniquement depuis le widget superieur; le roster inferieur reste dedie aux rapports membres.

## Architecture

### Frontend

- `App` calcule un role principal d'affichage et un ensemble de roles effectifs.
- `canViewAnyRole` pilote Sidebar, revalidation d'onglet et navigation depuis les notifications.
- Sidebar expose l'ensemble des departements geres par l'operateur; `selectedDept` n'est qu'un contexte d'affichage.
- Les vues outils utilisent l'ensemble de roles pour les actions sensibles.
- Les projets stockent et comparent `pmoId` et `team[].memberId`.

### Backend

- Une derivation partagee calcule les roles outils depuis `Department.specialFunction` et les rattachements reels.
- `filterReadable` applique les portees branche/projet avant toute reponse.
- `assertCanWrite` controle chaque departement, projet et rapport touche, y compris les suppressions par omission.
- Le demarrage applique des migrations idempotentes pour la matrice et les identifiants projet.

### Securite

- L'authentification existante reste obligatoire sur les routes CRUD.
- Aucune decision d'autorisation ne repose sur `simulatedRole`, un nom affiche ou un choix client.
- Les identifiants de departement et de membre sont valides contre les collections serveur.
- Les donnees hors perimetre sont filtrees en lecture et preservees lors des ecritures whole-array.
- Les tentatives hors perimetre renvoient 403 sans modifier les donnees.

## Plan d'implementation

- [x] Ajouter les helpers partages de roles outils, roles multiples et projets.
- [x] Ajouter le marqueur `bapteme` et separer Eden Zero.
- [x] Migrer la matrice et les projets existants.
- [x] Brancher l'interface multi-roles et multi-departements.
- [x] Appliquer les gardes serveur de lecture et d'ecriture.
- [x] Ajouter les tests de non-regression et de securite.
- [x] Valider lint, tests, build et parcours navigateur.

## Criteres d'acceptation

- Un Responsable de deux departements voit et gere les deux, jamais un troisieme.
- Un Responsable GDC cumule les acces Responsable et GDC.
- Un membre Eden Zero ne voit pas Parcours Baptême.
- Tresorier et Responsable de section disposent du socle d'onglets convenu.
- Un Pasteur ne lit ni n'ecrit dans l'autre branche.
- Deux homonymes ne partagent jamais un projet par leur nom.
- Un rapport GDC/Portiers forge par un autre profil est refuse en 403.
- Le roster Bloom Bus inferieur ne contient aucun selecteur de fonction.
