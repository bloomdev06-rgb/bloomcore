# Product

## Register

product

## Users

Membres de la communauté Bloom (Bloom Church & Bloom Light), tous rôles confondus dans une
interface unique adaptative : pasteurs et corps pastoral (cursus Appelé → Pasteur Titulaire),
responsables/adjoints de département, capitaines de bus et responsables de zone/commune (Bloom
Bus), coachs et leaders encadrant des nouveaux, et membres eux-mêmes. Ce que chacun voit (menus,
consoles, boutons d'action) est calculé depuis ses capacités (niveau communautaire ∪ fonctions
par département ∪ cursus pastoral ∪ appartenances, avec surcharges et autorisations spéciales) —
pas d'écrans séparés par rôle. Contexte d'usage réel : terrain (portes de l'église, bus, zones),
souvent en plein soleil et en connectivité intermittente — d'où l'exigence PWA offline-first et
le mode Plein Soleil déjà implémenté.

## Product Purpose

Gestion communautaire multi-branches : fiche membre unique (pas d'entité `User` séparée),
suivi de l'intégration des nouveaux (En attente → Suivi → Intégré), rapports en cascade
(service/département, territoriale/Bloom Bus, cursus/pastorale), gouvernance des départements et
ministères, capacités/permissions dynamiques, audit global immuable. Succès = une seule app que
chaque rôle utilise au quotidien sans confusion, avec des données fiables assez pour piloter
~3000+ membres à terme.

## Brand Personality

Chaleureux, structuré, pastoral — **hypothèse déduite de la charte et du cahier des charges, pas
formulée explicitement ; à corriger si ça ne correspond pas.** Le ton visé par
`CHARTE-GRAPHIQUE.md` est une base épurée blanc/vert (confiance, clarté) avec des touches de
couleur d'accent réservées et signifiantes (jamais décoratives), pas une identité criarde.

## Anti-references

Pas une app SaaS B2B froide et générique ; pas le style "AI cream/sand" par défaut (bg quasi-blanc
teinté chaleureux par réflexe) — **hypothèse déduite, à corriger si besoin.** Concrètement, à
éviter d'après la charte : warm grey utilisé comme couleur de texte, accents utilisés au-delà de
leur rôle de signal (max 2 combinés, ≤20% de la surface), grilles de cartes identiques.

## Design Principles

1. **Une seule interface, capacités contextuelles** — jamais de composant/écran dupliqué "par
   rôle" ; la logique d'affichage conditionnelle prime sur la duplication visuelle.
2. **Terrain d'abord** — lisibilité en plein soleil, cibles tactiles ≥48px, résilience offline ;
   ce ne sont pas des à-côtés mais des contraintes de conception de premier ordre.
3. **Couleur signifiante, pas décorative** — base 80% blanc/vert/warm grey/or, accents de branche
   réservés et porteurs de sens (Church vs Light), jamais appliqués par réflexe esthétique.
4. **Cohérence inter-écrans stricte** — les 24 vues doivent partager les mêmes conventions
   (espacement, variantes de composants, tokens de couleur) ; toute divergence est un défaut à
   corriger, pas une variation acceptable.
5. **Accessibilité non négociable** — WCAG AA (contraste ≥4.5:1 texte, ≥3:1 grand texte/UI),
   warm grey banni en texte, cibles tactiles ≥48px.

## Accessibility & Inclusion

WCAG AA minimum (contraste ≥4.5:1 texte courant, ≥3:1 grand texte et composants UI), cibles
tactiles ≥48px, mode Plein Soleil (+15% taille, contraste renforcé) pour l'usage terrain en forte
luminosité, thème sombre comme option de confort (pas encore parfait — imperfections en cours de
correction).
