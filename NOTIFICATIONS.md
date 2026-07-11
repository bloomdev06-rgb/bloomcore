# BloomCore — Notifications

> Liste des **déclencheurs**, leur **contenu**, **destinataires** et **canaux**. Canaux : in-app (cloche) · email · SMS · WhatsApp. Déclencheurs **activables/configurables** par l'admin. Propositions à corriger. Statut : **en cours**.

## Événements & destinataires

| Déclencheur | Destinataire(s) | Canaux suggérés |
|---|---|---|
| **Nouveau enregistré** (affecté à un dépt) | Responsable du dépt choisi (+ Intégration) | in-app, email |
| **Réception non validée — 3 j** | Intégration + Responsable | in-app, email |
| **Statut bloqué « en attente » — 7 j** | Ministre (escalade) + membre passe **au rouge** | in-app, email |
| **Validation de réception** | Intégration | in-app |
| **Changement de statut / promotion** | le membre concerné | in-app, email |
| **Changement de fonction / affectation** | le membre + son Responsable | in-app |
| **Transfert de branche** | le membre + corps pastoral | in-app, email |
| **Baptême complété** | le membre + Responsable Baptême | in-app, email |
| **Rapport manquant** (culte / hebdo Bloom Bus) | l'auteur attendu (membre / Capitaine / dépt) | in-app, SMS/WhatsApp |
| **Observation avec suivi + échéance** | destinataire de la remontée (Responsable / Ministre / Pasteur) | in-app, email |
| **Membre « au rouge »** | Coach / Leader / Responsable assigné | in-app |
| **Membre « Drachme (perdu) »** | Coach / Leader / Responsable | in-app |
| **Activité / événement programmé (rappel)** | membres concernés du dépt / de la branche | in-app, SMS/WhatsApp |
| **Inscription / certification formation** | le membre | in-app |
| **Affectation à un projet** | le membre (équipe) | in-app |
| **Attribution Admin / Super Admin** | le compte concerné | in-app, email |
| **Connexion / réinitialisation de mot de passe** | le compte concerné | SMS/WhatsApp/email |

## Règles
- **Multicanal** : chaque déclencheur a des canaux par défaut, **ajustables** par l'admin (onglet Configuration système → Déclencheurs).
- **Déclencheurs personnalisés** : l'admin peut **activer des notifications pour d'autres événements**.
- **Cloche in-app** : badge + panneau déroulant + page « Toutes les notifications ».
- **Préférences membre** : chaque membre choisit ses canaux dans *Mon Profil*.
