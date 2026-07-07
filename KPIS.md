# BloomCore — KPIs & Formules de calcul

> Détail des indicateurs et de leur calcul. Tout est **filtrable par période** (semaine / mois / trimestre / année / personnalisé) **et par branche**. Propositions à corriger. Statut : **en cours**.

## Définitions clés
- **Membre actif** : a **servi** (apparaît comme serviteur dans un `rapport_service` ou `rapport_activite`) il y a **≤ 1 mois**.
- **Au rouge** : membre toujours « en attente / validation de réception » **> 7 j après son enregistrement**, ou sans suivi/contact depuis > 7 j.
- **Score ordinal** : Très faible = 1 · Faible = 2 · Moyen = 3 · Bon = 4 · Très bon = 5 (affichable en %).

## 1. KPI de l'Accueil (global Super Admin, filtrable)
| KPI | Calcul |
|---|---|
| Membres actifs | nombre de membres ayant servi sur la période (≤ 1 mois) |
| Baptisés / Non-baptisés | `count(baptisé)` vs `count(non baptisé)` + **nouveaux baptisés** sur la période |
| Bloom Bus actifs | nombre de Bloom Bus ayant ≥ 1 `rapport_bloom_bus_life` sur la période |
| Nouveaux gagnés (moisson) | Σ des nouveaux gagnés via **Bloom Bus** (champ moisson) **+ via les départements** |
| Remontées des ministres | nombre de `rapport_observation` (mode = suivi) émis par des **ministres**, **non clôturés** |
| En attente | nombre de nouveaux en état « en attente » |
| Au rouge | nombre de membres « au rouge » (cf. définition) |

## 2. Santé spirituelle (smileys + courbes)
- **Smileys (un par critère)** : pour **chaque dimension** (vie spirituelle, sociale, physique, financière, présence culte), on détermine le **niveau dominant** = le niveau où se trouve le **plus grand % de membres** sur la période → la **couleur du smiley** reflète ce niveau (rouge/orange = faible … vert = bon). Ex. : si **35 %** des membres sont en santé spirituelle *faible* et que c'est le plus gros pourcentage → smiley **jaune/orange**.
- **Courbes d'évolution** : moyenne de **chaque dimension** dans le temps.

## 3. Courbes de croissance
| Courbe | Calcul |
|---|---|
| Croissance des nouveaux | nombre de **nouveaux enregistrés** par sous-période (semaine / mois) |
| Participants par culte | Σ (adultes + enfants) des rapports de culte, par événement / date |

## 4. KPI départemental
| KPI | Calcul |
|---|---|
| Présence opérationnelle | présences au service / services attendus |
| Membres actifs | membres du dept ayant servi ≤ 1 mois |
| Taux d'intégration | membres intégrés / nouveaux du dept |
| Qualification | **synthèse de l'évolution** des champs du `rapport_service` (présence culte, nb membres actifs…) |
| Nouveaux gagnés | nouveaux gagnés attribués au département sur la période |
| Taux de rapports remplis | rapports effectivement remplis / rapports attendus (sur la période) |

## 5. KPI Bloom Bus (agrégé au niveau choisi)
| KPI | Calcul |
|---|---|
| **T_mob_bus** | (Σ présents au départ / Σ membres rattachés) × 100 |
| Moisson | Σ nouveaux gagnés |
| Visite | nombre de **membres visités** (distincts) |
| Présence culte | présents au culte / rattachés |
| Activité | indicateur d'activité du bus |
| Évolution du nombre de membres | variation des rattachés sur la période |
| Taux de rapports remplis | rapports spirituels effectivement remplis / attendus (sur la période) |

## 6. KPI ministère
- **Agrégation** des KPI de ses départements (sur les 2 branches).
- **Classement des départements** par KPI (présence, croissance, intégration…).
