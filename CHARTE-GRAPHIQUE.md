# BloomCore — Charte Graphique Applicative (Design System)

> Traduction digitale du *Système d'identité visuelle VH* pour l'application BloomCore. Sert de référence unique pour le design system (tokens, composants, états). Cohérente avec le *Cahier des Charges v2.0*. Statut : **définie ensemble — à finaliser sur maquettes**.

---

## 1. Fondations — Couleurs

### 1.1 Couleurs fondamentales (dominantes ~80%)
| Token | Couleur | Hex | Réf. | Usage |
|---|---|---|---|---|
| `--bc-white` | Blanc | `#FFFFFF` | — | arrière-plans, respiration |
| `--bc-green` | Vert Sarcelle | `#006C67` | PMS 7719C | couleur signature : actions majeures, titres, nav |
| `--bc-warmgrey` | Gris neutre froid | `#CDD2D9` | — | encarts, blocs, bordures — **jamais en typographie**. Nom de token conservé (historique) mais valeur refroidie (voir note §1.3). |
| `--bc-gold` | Jaune Doré | `#D2AF1F` | PMS 7752C | badges d'excellence/certification — **toujours avec/sur le vert** |

Déclinaisons du vert pour les états : `--bc-green-700 #005852` (hover), `--bc-green-900 #075E54` (active/foncé).

### 1.2 Accents (≤20%, jamais seuls, **max 2 à la fois**)
| Token | Couleur | Hex |
|---|---|---|
| `--bc-fushia` | Rose fushia | `#D62766` |
| `--bc-cerulean` | Bleu céruléen | `#009BDE` |
| `--bc-turquoise` | Bleu turquois | `#00A7B5` |
| `--bc-anis` | Vert anis | `#A6B340` |
| `--bc-orange` | Orange | `#F38B36` |
| `--bc-purple` | Rouge pourpre | `#B21E28` |

Chaque accent est déclinable en tons **80 / 60 / 40 / 20 %** (opacité). Les fonds de conteneurs colorés utilisent le ton **~12–20 %**.

### 1.3 Neutres & texte
| Token | Hex | Usage |
|---|---|---|
| `--bc-canvas` | `#F4F5F7` | fond d'espace de travail (off-white froid) |
| `--bc-surface` | `#FFFFFF` | cartes, modales |
| `--bc-border` | `#E4E7EC` | bordures fines (gris froid clair) |
| `--bc-text` | `#0F172A` | corps de texte (noir conforme charte) |
| `--bc-text-secondary` | `#5B6470` | texte secondaire (**gris neutre — pas le gris de remplissage**) |

> **Note (mise à jour 2026-07 — dé-beige).** Les neutres étaient à l'origine des tons *chauds*
> (`canvas #F7F6F3`, `border #E7E3DD`, `warmgrey #D6D1CB`, réf. PMS Warm Gray 1C) qui donnaient à
> l'app un rendu beige/crème généralisé (le neutre servant d'aplat de remplissage à ~190 endroits).
> Ils ont été **refroidis** vers des gris neutres alignés sur le texte slate, sans toucher aux
> accents de marque. Les noms de tokens (dont `--bc-warmgrey`) sont **conservés** pour ne pas casser
> le code existant ; seules leurs valeurs changent. Il n'y a plus de beige dans la charte.

### 1.4 Rôles sémantiques UI
| Rôle | Token | Couleur |
|---|---|---|
| Action principale | `--color-primary` | Vert Sarcelle |
| Excellence / certification | `--color-excellence` | Jaune Doré |
| Succès | `--color-success` | Vert anis |
| Information / en cours | `--color-info` | Bleu céruléen |
| Alerte (en attente / retard) | `--color-warning` | Orange |
| Erreur / « au rouge » | `--color-danger` | Rouge pourpre |
| Catégories / tags | — | Bleu turquois, Rose fushia |

> Règle d'équilibre **80/20** : blanc + vert dominent toujours ; les accents restent minoritaires, jamais plus de deux combinés simultanément.

---

## 2. Thèmes de branche

Les deux branches sont **égales**, sur la même base **verte + blanche**. Seule la **palette d'accents** diffère.

| Branche | Accents privilégiés | Particularité |
|---|---|---|
| **Bloom Church** | Bleu céruléen + Vert anis | base épurée vert/blanc |
| **Bloom Light** | Orange + Rose fushia | Gris neutre & Jaune Doré plus présents |

Implémentation : attribut `data-branch="church|light"` sur la racine, qui réaffecte `--accent-1` / `--accent-2`. La bascule déclenche la micro-interaction **Color Sweep** (§7).

**Mode clair / sombre** (orthogonal aux branches) : un **commutateur de thème** dans le header bascule un attribut `data-theme="light|dark"` qui réaffecte les tokens de surface/texte/bordure. Le **jeu de tokens sombres** (fonds sombres, vert/doré rehaussés pour conserver le contraste AA) est **à définir ensemble**.

---

## 3. Typographie

### 3.1 Familles & stratégie de licence
- **Titres + contrôles UI** (boutons, nav, labels, données, tableaux) → `--font-ui` : `'Gotham', 'Montserrat', system-ui, sans-serif`
- **Corps éditorial** (paragraphes, descriptions, notes, lecture) → `--font-body` : `'Sentinel', 'Georgia', serif`

Actif aujourd'hui : **Montserrat** + **Georgia** (substituts gratuits). Les fichiers source **Gotham** et **Sentinel** sont disponibles : on les branche via `@font-face` (dossier `/fonts`) sans rien changer d'autre, une fois les licences web réglées.

### 3.2 Échelle
| Niveau | Famille | Graisse | Taille | Couleur |
|---|---|---|---|---|
| Display | UI | Black 800 | 34 | vert |
| H1 | UI | Bold 700 | 26 | vert |
| H2 | UI | Bold 700 | 20 | vert |
| H3 | UI | Bold 700 | 16 | noir |
| Sous-titre / label | UI | Medium 600 | 14 | vert ou accent |
| Corps UI | UI | Regular/Medium 500 | 14 | noir |
| Corps éditorial | body (serif) | Regular | 15 (1.45) | noir |
| Caption | UI | Regular | 12 | gris secondaire |

### 3.3 Règles d'usage
- Grands titres **uniquement en vert** (ou blanc/doré sur fond vert/sombre).
- Corps de texte **en noir**. **Gris neutre jamais en texte.**
- Sous-titres : vert, ou une couleur d'accent pour souligner.

---

## 4. Espacement, rayons, élévation, layout

- **Espacement** — base **4px** : 4 (xs) · 8 (sm) · 12 · 16 (md) · 24 (lg) · 32 (xl) · 48 · 64.
- **Rayons** (doux et modernes) : `--radius-input 8px` · `--radius-card 12px` · `--radius-pill 999px`.
- **Élévation** : `plat` (bordure 1px gris froid clair) · `carte` (`0 1px 3px rgba(0,0,0,.12)`) · `overlay/modale` (`0 8px 24px rgba(0,0,0,.18)`).
- **Cibles tactiles** : hauteur **min 48px** pour boutons et champs (terrain mobile).
- **Layout** : conteneur responsive ; sidebar desktop rétractable ; bottom bar mobile (glassmorphism) ; bouton flottant ADN.

---

## 5. Composants & états

### 5.1 Boutons
| Variante | Fond | Texte | Usage |
|---|---|---|---|
| Primaire | Vert Sarcelle | blanc | action majeure (Valider, Soumettre) |
| Secondaire | blanc + bordure verte | vert | action secondaire (Annuler) |
| Excellence | Jaune Doré | vert foncé | certification, baptême |
| Danger | Rouge pourpre | blanc | suppression (soft delete) |
| Fantôme | transparent | vert | actions tertiaires |
| Désactivé | Gris neutre | gris | indisponible |

États : `hover` → vert-700 ; `active` → vert-900 ; `focus` → anneau `0 0 0 3px rgba(0,108,103,.12)` ; `disabled` → gris neutre.

### 5.2 Champs & formulaires
Hauteur 48px, rayon 8px, bordure `--bc-border`. `focus` → bordure verte + anneau. Validation : succès (anis), erreur (rouge pourpre). Indicateur **doublon temps réel** (sablier) sur le téléphone. Touches **[−]/[+]** larges pour la saisie numérique tactile (rapport de culte).

### 5.3 Statuts (pills) — cycle de vie
| Statut | Couleur |
|---|---|
| Nouveau | gris neutre |
| En attente | orange (ton 16%) |
| Suivi | céruléen (ton 16%) |
| Intégré | vert (ton 14%) |
| Baptisé | doré (ton 18%) ★ |
| Au rouge (> 7 j) | rouge pourpre (ton 14%) ● |

### 5.4 Toggles, sliders, onglets
- **Toggle iOS** : vert (ON) / rouge pourpre (OFF) — pointage présence, incidents.
- **Slider ordinal** (rapport spirituel) : dégradé **rouge → orange → doré → anis → vert** sur l'échelle *Très faible · Faible · Moyen · Bon · Très bon*.
- **Onglets** : actif = texte vert + soulignement vert 3px ; inactif = gris secondaire.

### 5.5 Cartes, avatar, radar, skeleton
- **Carte** : surface blanche, bordure gris froid clair, rayon 12px ; note éditoriale en serif.
- **Avatar** : cercle initiales, **anneau vert** (doré pour distinction).
- **Radar de santé** : 6 axes (Recharts), animé à l'ouverture ; courbes d'évolution par dimension.
- **Skeleton loaders** : formes gris neutre ~50% opacité, pulsation 1.5s.

### 5.6 Navigation shell
Header (logo, **commutateur de branche**, cloche notifications, avatar) · sidebar desktop rétractable (onglet actif : fond vert 10% + filet vertical vert 4px + texte vert bold) · bottom bar mobile glassmorphism · **bouton flottant ADN** vert (icône ➕ blanche).

---

## 6. États & feedback
- **Focus visible** systématique (anneau vert) — navigation clavier.
- **Validation inline** : messages courts, couleur sémantique.
- **Vides / erreurs** : illustration légère + action de sortie.
- **Hors-ligne** : bouton de validation **orange** + mention « Sauvegardé localement ».

---

## 7. Motion & micro-interactions
- **Courbe standard** : `all 250ms cubic-bezier(0.4, 0, 0.2, 1)`.
- **Color Sweep** : balayage horizontal des accents au basculement de branche (sans rechargement).
- **Skeletons** : pulsation douce 1.5s.
- **Réussite** : la modale s'estompe vers le bas, l'onglet récap clignote.
- **Team Builder / Swipe** : pulsation de confirmation au drag & drop, swipe-to-validate (vert) / swipe-to-reassign.

---

## 8. Iconographie
**Lucide React** — style linéaire cohérent. Taille de base 20–24px, couleur héritée (vert pour l'actif, gris pour l'inactif). Émojis fonctionnels conservés là où la charte les prévoit (➕ ADN, 📝 rapport de culte).

---

## 9. Accessibilité
- **Contraste WCAG AA** ≥ 4.5:1 sur tout le texte (corps en noir).
- **Gris neutre proscrit pour le texte** (réservé fonds/bordures).
- **Cibles tactiles ≥ 48px**.
- **Mode Plein Soleil** : +15% taille des polices/boutons + contraste renforcé (capitaines de bus, portiers en extérieur).
- **Focus clavier** visible, ordre de tabulation logique, libellés ARIA.

---

## 10. Design tokens (référence CSS)
```css
:root{
  /* base */
  --bc-white:#FFFFFF; --bc-green:#006C67; --bc-green-700:#005852; --bc-green-900:#075E54;
  --bc-warmgrey:#CDD2D9; --bc-gold:#D2AF1F;
  /* accents */
  --bc-fushia:#D62766; --bc-cerulean:#009BDE; --bc-turquoise:#00A7B5;
  --bc-anis:#A6B340; --bc-orange:#F38B36; --bc-purple:#B21E28;
  /* neutres / texte */
  --bc-canvas:#F4F5F7; --bc-surface:#FFFFFF; --bc-border:#E4E7EC;
  --bc-text:#0F172A; --bc-text-secondary:#5B6470;
  /* sémantique */
  --color-primary:var(--bc-green); --color-excellence:var(--bc-gold);
  --color-success:var(--bc-anis); --color-info:var(--bc-cerulean);
  --color-warning:var(--bc-orange); --color-danger:var(--bc-purple);
  /* typo */
  --font-ui:'Gotham','Montserrat',system-ui,sans-serif;
  --font-body:'Sentinel','Georgia',serif;
  /* rayons / motion */
  --radius-input:8px; --radius-card:12px; --radius-pill:999px;
  --ease-standard:cubic-bezier(.4,0,.2,1); --dur:250ms;
  /* accents de branche (réaffectés via [data-branch]) */
  --accent-1:var(--bc-cerulean); --accent-2:var(--bc-anis);
}
[data-branch="light"]{ --accent-1:var(--bc-orange); --accent-2:var(--bc-fushia); }
```

---

*Fin de la charte graphique applicative. Les composants ci-dessus sont une proposition — ils seront affinés sur tes exemples de maquette.*
