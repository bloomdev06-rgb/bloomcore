# BloomCore — Workflows & Cinématiques

> Cinématiques pas-à-pas : **acteur · étapes · effets** (audit, notifications). Propositions à corriger. Statut : **en cours**.

## 1. Checkin Nouveau (ADN) + dédoublonnage / fusion
Acteur : **membre ADN** (bouton flottant « ➕ Enregistrer un Nouveau »).
1. Ouverture de la modale **Formulaire Nouveau**.
2. Saisie du **téléphone** → **dédoublonnage temps réel** (recherche tél / email).
   - **Aucun doublon** → poursuite normale.
   - **Doublon** → affichage de la **fiche existante** (photo, nom, statut) + choix :
     - **« Même personne → Fusionner »** ;
     - **« Personne différente »** → **impossible avec le même numéro** : le téléphone est **unique**. C'est une **erreur de saisie** → **corriger le numéro** (de la nouvelle saisie ou du profil existant) pour garantir des infos uniques.
3. Complétion (photo, identité, genre, OJ, branche, département choisi, commune/quartier/GPS, culte, source).
4. **Validation** → création de la fiche (`communityLevel = nouveau`, `integrationState = en_attente`).
5. **Affectation automatique Bloom Bus** (commune / quartier / GPS).
6. **Parcours parallèles** : Rétention (dépt choisi) + Bloom Bus.
7. **Notification** au Responsable du département choisi.
8. Si **OJ** coché → ajout auto au suivi du **département Baptême** + comptage culte.

> **Fusion** : la fiche existante est conservée ; les champs renseignés **complètent les vides** (pas d'écrasement) ; événement **tracé en audit**.

## 2. Validation réception → progression de statut
1. Le **Responsable** reçoit la notif → **Validation Nouveaux** → **valide la réception** (réception confirmée, reste **En attente**).
   - **Alerte 3 j** si non validée → Intégration + Responsable.
2. Transitions validées par **Responsable / Coach / Leader / délégué** : **En attente → Suivi → Intégré**.
   - **Alerte 7 j** si toujours « En attente » depuis l'enregistrement → membre **au rouge** + escalade **Ministre**.
3. Une fois **Intégré** → phase Membre : **Stagiaire → Boss → Leader → Coach**.
4. Au passage à **Boss** → **déclenchement de la fiche membre**.

> Chaque transition est **journalisée** + **notifiée**.

## 3. Nouveau → Membre (formulaire Membre)
1. Déclenché au passage **Boss** (ou pour enregistrer un membre déjà présent).
2. Le **formulaire Membre** s'ouvre **pré-rempli** depuis les infos du Nouveau.
3. Le **Responsable** (ou délégué) complète (rôle, départements, statuts, académie…) → enregistre.

## 4. Transfert de branche (Light → Church)
1. **Fiche membre** → **Modifier** → **changer de branche** (capacité requise).
2. Confirmation → branche **Light → Church**, **historique conservé**.
3. **Audit** `BRANCH_TRANSFER` + notification.

## 5. Promotion (niveau / cursus / fonction)
- **Niveau / fonction** : par le **Responsable** (selon capacité), depuis la console / fiche.
- **Cursus pastoral** : **validée par le Pasteur Principal**.
1. Sélection du membre → **Promouvoir** (axe) → confirmation.
2. **Audit** (ancien → nouveau) + **notification** au membre.

## 6. Parcours Baptême (département `parcours_etapes`)
Étapes : 1) Inscription · 2) Suivi des 3 cours · 3) Entretien · 4) Baptême physique.
1. **Inscription** au département Baptême (responsable d'intégration / pasteur, ou auto pour un OJ).
2. Chaque **étape validée** par son validateur → avancement (`currentStepId`).
3. Validation de l'**étape finale** → `baptismStatus = baptisé` (via département) + audit `BAPTISM_COMPLETED` + notification.

## 7. Baptême hors process + OJ
- **Hors process** : date de baptême saisie au **formulaire Membre** → `baptismStatus = baptisé` **sans** passer par le département (`baptismViaDepartment = false`).
- **OJ** : ajout **automatique** au suivi du département Baptême (en plus du comptage culte).

## 8. Cycle hebdo Bloom Bus (rapport spirituel)
1. **Un seul rapport par semaine et par personne** : auto-évaluation du **membre** **ou** saisie par le **supérieur direct** (cascade).
2. Rappel hebdomadaire ; le rapport **alimente les `healthKPIs`** (courbes + smileys).

## 9. Rapport de culte / événement + consolidation
1. Création / sélection d'un **Événement**.
2. Chaque département concerné remplit **son rapport** rattaché (ADN comptage, Portiers présences, GDC rapport de culte).
3. **Consolidation automatique** des stats de l'événement (adultes, enfants, nouveaux H/F, OJ H/F, décisions…).

## 10. Création d'événement + cultes récurrents
1. Acteur habilité crée un **Événement** (type, date, portée branche / 2 branches, audience, projet optionnel, organisateur).
2. **Cultes du dimanche** : **programmés une fois** → **générés automatiquement** chaque semaine.

## 11. Workflow Projet
1. Création (portée, **PMO**, dates).
2. Composition de l'**équipe** (rôles base + libres).
3. **Objectifs** (checklist) + **actions** (kanban) + **événements rattachés**.
4. Suivi d'avancement → **clôture** (statut terminé).

## 12. Délégation de droits
1. Le **Responsable** ouvre la délégation dans **sa console** → membre de son dépt + capacités à déléguer.
2. **Interdits** : accès au **rapport spirituel** (Bloom Bus) ; hors de son département.
3. **Audit** de la délégation.

## 13. Connexion / activation de compte
1. Compte créé à l'enregistrement (ADN / Responsable).
2. **Activation** : le membre reçoit un **lien / code** (SMS / WhatsApp / email) → **choisit lui-même son mot de passe**.
3. **Connexion** : identifiant **téléphone OU email** + mot de passe (JWT).
4. **Réinitialisation** : « mot de passe oublié » → code envoyé.

## 14. Alertes & escalades
- **3 j** réception non validée → Intégration + Responsable.
- **7 j** statut bloqué depuis l'enregistrement → **au rouge** + escalade **Ministre**.
- **Drachme (perdu)** : coché manuellement par le Responsable (membre égaré).
- Notifications **multicanal** (in-app, email, SMS, WhatsApp).
