# BloomCore — Schémas de Formulaires

> Détail **champ par champ** des formulaires de l'application. Base de configuration du **constructeur de formulaires** (schémas par défaut). Statut : **en cours** — Formulaire Nouveau (ADN) rédigé.

---

## 1. Formulaire Nouveau (ADN) — « Fiche d'accueil »
Déclenché par le **bouton flottant « ➕ Enregistrer un Nouveau »** (membres ADN). Ouverture en **modale plein écran** mobile.

**En-tête** : « Fiche d'accueil — *[Branche]* · ADN — Enregistrement numérique ».

**Photo** — *obligatoire* (upload circulaire, « Appuyez pour choisir »).

**Identité**
| Champ | Type | Obligatoire |
|---|---|---|
| Prénom | texte | ✅ |
| Nom | texte | ✅ |
| Genre | liste (Homme / Femme) | ✅ |
| Tél. personnel | téléphone (préfixe pays, ex. +225) | — |
| Tél. parent / proche | téléphone | — |

**Informations Église**
| Champ | Type | Obligatoire |
|---|---|---|
| Branche | liste (Bloom Church / Bloom Light) | ✅ |
| Département choisi | liste des départements | — |
| Commune de résidence | liste | — |
| Quartier | liste | — |
| GPS | coordonnées (saisie **manuelle**) | — |
| Date d'arrivée | date (défaut : aujourd'hui) → **date de 1ʳᵉ visite** | ✅ |
| Culte | liste (1er Culte / 2e Culte / …) → événement d'arrivée | — |
| Source | liste (comment il est venu : Culte, invitation, réseaux…) | — |
| C'est un OJ (**Oui à Jésus**) | case à cocher | — |

**Comportements** : **dédoublonnage en temps réel** sur le téléphone ; affectation **Bloom Bus** automatique (commune / quartier / GPS). Un **OJ (Oui à Jésus)** coché → **compté** dans les stats du culte et **ajouté au suivi du département Baptême**.

---

## 2. Formulaire Membre — enregistrement complet
Rempli par le **Responsable de département** (ou un délégué) ; **pré-rempli** depuis le formulaire Nouveau quand un Nouveau devient Membre. Sert aussi à enregistrer les membres déjà présents.

**Photo** — *obligatoire*.

**Identité & rattachement**
| Champ | Type | Note |
|---|---|---|
| Prénom | texte | ✅ |
| Nom | texte | ✅ |
| Genre | liste (Homme / Femme) | ✅ |
| Branche | liste | |
| Rôle | liste (niveau communautaire : Membre…) | |
| Département(s) | multi-sélection (sans limite) | |
| Tél. parent | téléphone (préfixe pays) | |
| Contact personnel | téléphone | |
| Date de naissance | date | |
| Entrée à Bloom | **mois + année** | |
| Commune de résidence | liste | |
| Localisation GPS | bouton « **Partager la position GPS** » | |
| Académie | liste (Non inscrit / inscrit Vases d'Honneur…) | |

**Statut** (cases à cocher) :
- ☐ **Baptisé(e)** → `baptismStatus`
- ☐ **Intégré(e)** → état d'intégration
- ☐ **Drachme (perdu)** → **statut manuel d'égarement** (membre éloigné / parti), coché par le Responsable. **Distinct du « au rouge »** (qui reste l'alerte automatique d'inactivité > 7 j).

> Le formulaire **s'arrête au Statut**. Les autres champs d'identité (genre, situation matrimoniale, profession, nationalité, contact d'urgence, quartier, email) sont **complétés par le membre** via *Mon Profil*.

---

> **Note** : tous les schémas ci-dessous sont des **schémas par défaut** — chaque formulaire reste **extensible** (ajout / édition de champs) via le **constructeur de formulaires**. Les champs numériques utilisent la **saisie tactile +/−**.

## 3. Rapport de service (roster des serviteurs)
Rempli par : **Responsable / délégué** · rattaché à un **culte / événement**.
| Champ | Type |
|---|---|
| Événement / culte | sélection |
| Serviteurs (qui a servi) | multi-sélection de membres |
| Notes | texte (optionnel) |

## 4. Rapport RSA (suivi des actions & tâches) — hebdomadaire
Rempli par : **tous les départements**.
| Champ | Type |
|---|---|
| Semaine | période |
| Actions / tâches | liste de { libellé · statut (à faire / en cours / fait) · responsable · échéance } |
| Notes | texte |

## 5. Rapport d'activité
Rempli par : **Responsable de département** · rattaché à une **activité / événement**.
| Champ | Type |
|---|---|
| Activité / événement | sélection |
| Observations | texte |
| Serviteurs | multi-sélection de membres |

> Pour un **événement**, **chaque département remplit son rapport habituel** (ADN, Portiers, Gestion des Cultes…) rattaché à cet événement.

## 6. Rapport de suivi coach (visites & entretiens) — hebdomadaire
Rempli par : **Coach / Leader**, **membre par membre** (pour chacun : visité ? entretien ?). La **synthèse** (totaux) est **calculée automatiquement**.
| Champ | Type |
|---|---|
| Semaine | période |
| Suivi par membre | liste de { membre · ☐ visité · ☐ entretien } |
| Observation | texte |
| *Synthèse (auto)* | nb visites · nb entretiens |

## 7. Rapport d'observation (Responsable)
| Champ | Type |
|---|---|
| Type | liste (spirituel / financier / matériel / social / organisationnel) |
| Texte | texte |
| Mode | radio (informatif / suivi requis) |
| Échéance | date (si suivi) |

## 8. Rapport Bloom Bus — membre (santé spirituelle) — hebdomadaire
Co-saisie (membre ou supérieur direct, cascade). Échelle **ordinale** : *Très faible · Faible · Moyen · Bon · Très bon*.
| Dimension | Type |
|---|---|
| Vie spirituelle | échelle ordinale |
| Vie sociale | échelle ordinale |
| Santé physique | échelle ordinale |
| Situation financière | échelle ordinale |
| Présence au culte / événement | **sélection** du/des culte(s) ou événement(s) de la semaine / mois auxquels le membre était présent |
| Notes | texte |

## 9. Rapport Bloom Bus — activité (Capitaine)
| Champ | Type |
|---|---|
| Mobilisation | nombre (+/−) |
| Présence culte | nombre (+/−) |
| Moisson (nouveaux gagnés) | nombre (+/−) |
| Membres visités | **multi-sélection de membres** (on sait toujours qui a été visité) |
| Activité | texte / nombre |
| Notes | texte |

## 10. Rapport ADN (comptage par culte)
Rattaché à un **événement**.
| Champ | Type |
|---|---|
| Événement | sélection |
| Nouveaux — Hommes | nombre (+/−) |
| Nouveaux — Femmes | nombre (+/−) |
| OJ (Oui à Jésus) — Hommes | nombre (+/−) |
| OJ (Oui à Jésus) — Femmes | nombre (+/−) |

## 11. Rapport Portiers (présences par culte)
Rattaché à un **événement**.
| Champ | Type |
|---|---|
| Événement | sélection |
| Présents — Hommes | nombre (+/−) |
| Présents — Femmes | nombre (+/−) |
| Présence en ligne | nombre (+/−) |

## 12. Rapport de culte (Gestion des Cultes) — 4 blocs
Rattaché à un **événement**.
- **Infos générales** : type de service · prédicateur · thème du message · officiant du jour.
- **Atmosphère spirituelle** : note **1–5** (ferveur · louange · déroulement de l'appel).
- **Journal des incidents** : **type** (liste : technique / sécurité / organisation…) · **département(s) concerné(s)** · **bloc texte** (détails de l'incident).
- **Stats de fréquentation** (+/−) : adultes émargés · enfants · nouvelles décisions.
- **Remarques libres** : texte.

## 13. Rapport pastoral (cursus)
**Confidentiel.** Rempli par le **mentor** sur son **filleul**. → **Champs à définir plus tard.**

