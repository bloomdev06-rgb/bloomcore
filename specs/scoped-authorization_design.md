# Autorisations cumulées et cursus pastoral

## Règles validées
- Union des affectations (fonction, département/territoire, branche), jamais union de pouvoirs sans origine.
- Rapports limités à leur filière : Responsable dans son département, Ministre dans son ministère, Pasteur dans sa branche ; Admin, Super Admin et Pasteur Principal toutes branches.
- Cursus affiché sur la fiche, nomination uniquement dans Cursus pastoral par les autorités globales, sans auto-nomination.
- Les affectations explicites secondaires donnent leur périmètre, pas un accès global.

## Mise en œuvre
- Domaine : fonctions pures d'autorité départementale et de lecture des rapports réutilisables.
- Serveur : garde sur chaque champ/affectation avant et après changement ; route dédiée PATCH /members/:id/pastoral-cursus, schéma strict, contrôle de concurrence et journal serveur.
- Interface : rendu et sélecteurs sur les rôles réels et affectations ; sauvegarde pastorale confirmée par l'API ; état d'erreur visible.
- Sécurité : authentification et protections HTTP existantes conservées ; imports/sync ne peuvent nommer ; champs d'auto-affectation protégés ; tests en base mémoire.
- Bloom Bus : branche unique confirmée, migration conservatrice et régularisation explicite des cas ambigus (voir ci-dessous).

## Vérifications
Tests positifs et négatifs : A responsable/B adjoint, A responsable/B membre, ministère, rapports confidentiels, branche secondaire, auto-pôle, promotion excessive, API générique vs route pastorale, zones homonymes et cumul territorial. Puis tests existants, TypeScript/lint et build.

## Branche Bloom Bus — règle confirmée
Un bus appartient à Church ou Light et ne reçoit que des membres de cette branche. Création : branche explicite, import : branche du responsable identifié (ou colonne Branche concordante). Serveur : contrôle des nouvelles affectations et transferts, y compris Admin, via le pipeline d'écriture commun. Les mutations départementales restent indépendantes de l'appartenance territoriale.

Migration idempotente au démarrage : déduire la branche seulement si tous les membres actifs sont d'une même branche valide. Aucun choix majoritaire, aucun déplacement ni suppression de membre. Bus vides ou incohérents : conservés, signalés par compteur et masqués aux profils non globaux tant que non régularisés. Une branche existante n'est jamais remplacée automatiquement. Interface : création en branche explicite, sélecteurs limités à la branche, erreurs serveur visibles. Tests : migration répétée, bus mixte/vide, refus affectation croisée et synchronisation, droits mono/multibranches.

Test HTTP local isolé : `node --import tsx server/scopedAuthorization.http.check.ts` (base mémoire, mails désactivés). Une vérification navigateur des formulaires reste à effectuer.
