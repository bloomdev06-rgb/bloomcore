---
name: BloomCore
description: Plateforme de gestion communautaire multi-branches (Bloom Church & Bloom Light)
colors:
  green: "#006C67"
  green-hover: "#005852"
  green-dark: "#075E54"
  warmgrey: "#D6D1CB"
  gold: "#D2AF1F"
  fushia: "#D62766"
  cerulean: "#009BDE"
  turquoise: "#00A7B5"
  anis: "#A6B340"
  orange: "#F38B36"
  purple: "#B21E28"
  canvas: "#F7F6F3"
  surface: "#FFFFFF"
  border: "#E7E3DD"
  text: "#0F172A"
  text-secondary: "#5B6470"
  canvas-dark: "#0F172A"
  surface-dark: "#1E293B"
  border-dark: "#334155"
  text-dark: "#F1F5F9"
  text-secondary-dark: "#94A3B8"
typography:
  display:
    fontFamily: "Montserrat, system-ui, -apple-system, sans-serif"
    fontSize: "34px"
    fontWeight: 800
  headline:
    fontFamily: "Montserrat, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  title:
    fontFamily: "Montserrat, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "Montserrat, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  editorial:
    fontFamily: "Georgia, serif"
    fontSize: "15px"
    lineHeight: 1.45
  label:
    fontFamily: "Montserrat, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  input: "8px"
  control: "12px"   # rounded-xl — éléments compacts (chips filtres, mini-inputs, cellules calendrier, lignes de liste). Réconcilie CHARTE §4 --radius-card.
  tile: "16px"
  panel: "32px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-excellence:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.pill}"
  button-danger:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  input-field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.tile}"
---

# Design System: BloomCore

## 1. Overview

**Creative North Star: "The Field Register"** — a clean green-and-white ledger built to survive
a Sunday at the church doors: bright sun, patchy signal, one hand holding a phone. *(Name is a
first pass — rename freely, it isn't load-bearing.)*

BloomCore's base is deliberately quiet: white and Vert Sarcelle (`#006C67`) carry ~80% of every
screen, so the six branch/category accents (fushia, cerulean, turquoise, anis, orange, purple)
read as signal, not decoration — never more than two combined, never above ~20% of a screen.
This is a **product**, not a brand surface: the design serves the workflow (fiche membre,
rapports, permissions), it doesn't perform an identity. It explicitly rejects the cold B2B SaaS
look and the reflexive warm-cream AI default — warmth here comes from the green/gold pairing and
from generous pill-shaped touch targets, not from a tinted-beige canvas.

**Key Characteristics:**
- 80/20 rule: white + green dominate; accents are rare and meaningful.
- Two branches (Church, Light), same base, different accent pair — implemented via CSS custom
  property reassignment, not separate stylesheets.
- Built for outdoor/mobile use first: Mode Plein Soleil (+15% scale, boosted contrast) is a
  first-class state, not an edge case.
- Pill-shaped interactive elements (buttons, inputs, status chips) throughout.

## 2. Colors

The palette is a green-and-white foundation with six reserved accent colors, each tied to a
specific semantic role rather than free choice.

### Primary
- **Vert Sarcelle** (`#006C67`): the signature color — primary actions, active nav, headline
  text on light backgrounds. Hover darkens to `#005852`, active/dark state to `#075E54`.

### Secondary
- **Jaune Doré** (`#D2AF1F`): excellence/certification only (baptism, certifications) — always
  paired with green, never standalone.

### Tertiary (branch accents — max 2 live at once)
- **Bleu Céruléen** (`#009BDE`) + **Vert Anis** (`#A6B340`): Bloom Church's accent pair.
- **Orange** (`#F38B36`) + **Rose Fushia** (`#D62766`): Bloom Light's accent pair.
- **Bleu Turquois** (`#00A7B5`) + **Rouge Pourpre** (`#B21E28`): category/tag and danger accents,
  outside the branch pair.

### Neutral
- **Canvas** (`#F7F6F3` light / `#0F172A` dark): workspace background.
- **Surface** (`#FFFFFF` light / `#1E293B` dark): cards, modals.
- **Border** (`#E7E3DD` light / `#334155` dark): hairline dividers.
- **Text** (`#0F172A` light / `#F1F5F9` dark): body copy.
- **Text Secondary** (`#5B6470` light / `#94A3B8` dark): captions, secondary labels — a neutral
  gray, deliberately distinct from Warm Grey.
- **Warm Grey** (`#D6D1CB`): panels, blocks, borders only.

### Named Rules
**The Warm Grey Ban.** Warm Grey never appears as text color, in any theme, at any opacity —
contrast fails WCAG AA at that lightness. Reserved for fills and borders only.

**The Two-Accent Ceiling.** No screen combines more than two of the six accent colors at once.
Category tags may use turquoise/fushia; branch UI uses only its own accent pair; never mix both
sets on the same view.

**The Branch Cascade Rule (in progress this session).** Branch identity is carried by CSS custom
properties `--accent-1`/`--accent-2`, reassigned by a `[data-branch="light"]` selector on `<html>`
cascading to every descendant — not by prop-drilling accent strings into individual components.
Prior to this session's fix, only two decorative pills inside the header switcher itself responded
to the active branch; every other themed element (active nav indicator, branch-tinted highlights)
must read `var(--accent-1)`/`var(--accent-2)` to actually participate in the branch switch.

### Known gap (flag, don't silently fix here)
`--color-bc-success` (`#10B981`), `--color-bc-warning` (`#F59E0B`), `--color-bc-danger`
(`#EF4444`) were added as generic semantic aliases and do **not** match the charter's own mapping
(success → Vert Anis `#A6B340`, warning → Orange `#F38B36`, danger → Rouge Pourpre `#B21E28`).
Treat the charter's mapping as canonical; the generic aliases are a drift to reconcile during the
cross-screen consistency pass.

## 3. Typography

**Display/UI Font:** Montserrat (with Gotham as the licensed target once web fonts are cleared)
**Body/Editorial Font:** Georgia (with Sentinel as the licensed target)

**Character:** A geometric grotesque for structure and control (nav, buttons, tables, data) paired
with a warm serif reserved for long-form reading (notes, descriptions) — contrast axis, not two
similar sans-serifs.

### Hierarchy
- **Display** (Black 800, 34px): rare, top-level screen titles only. Green.
- **Headline** (Bold 700, 26px): section headers (H1). Green.
- **Title** (Bold 700, 20px): subsection headers (H2). Green.
- **Subtitle/Label** (Medium 600, 14px): field labels, card headers. Green or accent.
- **Body UI** (Regular/Medium 500, 14px): default interface text. Black (`--bc-text`).
- **Editorial Body** (Regular, 15px/1.45, serif): notes, descriptions, long-form read text. Black,
  max ~70ch line length.
- **Caption** (Regular, 12px): timestamps, meta text. Secondary gray.

### Named Rules
**The Green Headline Rule.** Large titles (Display/H1/H2) are green, or white/gold on a dark/green
background — never black. H3 and below are black.

## 4. Elevation

Mostly flat: a 1px Warm-Grey-tinted border (`--bc-border`) is the default separation at rest.
Shadow is reserved for genuine overlays, not ambient card decoration.

### Shadow Vocabulary
- **Card** (`0 1px 3px rgba(0,0,0,.12)`): default card lift, used sparingly alongside the border.
- **Overlay/Modal** (`0 8px 24px rgba(0,0,0,.18)`): modals and popovers only.

### Named Rules
**The Flat-by-Default Rule.** Surfaces sit flush with a hairline border at rest; shadow appears
only for true overlays (modals) or on hover/active state, never as constant card decoration.

## 5. Components

### Buttons
- **Shape:** fully pill-shaped at rest (`border-radius: 999px`), 48px min height (touch target).
- **Primary:** Vert Sarcelle background, white text — major actions (Valider, Soumettre).
- **Secondary:** white background, green border + text — secondary actions (Annuler).
- **Excellence:** Jaune Doré background, dark green text — certification/baptism only.
- **Danger:** Rouge Pourpre background, white text — destructive (soft-delete) actions.
- **Ghost:** transparent background, green text — tertiary actions.
- **Disabled:** Warm Grey background, gray text.
- **Hover/Focus:** hover darkens to green-700; focus ring `0 0 0 3px rgba(0,108,103,.12)`.
- **Note (révisée 2026-07-22) :** l'échelle réelle est à **4 paliers** — `rounded-[2rem]` (32px)
  panels, `rounded-2xl` (16px) tiles, et **`rounded-xl` (12px) pour les contrôles compacts**
  (81 usages systématiques mesurés par l'audit design). Le 12px n'était donc PAS du CSS mort :
  la valeur `--radius-card: 12px` de la CHARTE §4 correspond bien à cette convention `rounded-xl`.
  Voir Cards/Containers ci-dessous pour l'échelle complète.

### Chips / Status Pills
- **Lifecycle colors:** Nouveau (neutral gray) → En attente (orange 16%) → Suivi (cerulean 16%) →
  Intégré (green 14%) → Baptisé (gold 18%, ★) ; Au rouge >7j (purple 14%, ●).
- **Style:** tinted background at ~14-18% opacity of the semantic color, full text color, pill
  shape, no border.

### Cards / Containers
- **Corner Style (échelle réelle à 4 paliers, réconciliée 2026-07-22) :** outer panel/section
  card `rounded-[2rem]` (32px) · inner content tile `rounded-2xl` (16px) · **compact control
  `rounded-xl` (12px)** pour les petits éléments (chips de filtres, mini-inputs, cellules de
  calendrier, lignes de liste) · modals `rounded-[2.5rem]` (40px). Le palier 12px n'est PAS une
  dérive : l'audit design (2026-07-22) a mesuré **81 usages systématiques sur des éléments
  compacts** — c'est une convention réelle, alignée sur `--radius-card: 12px` de la CHARTE §4.
  La vraie inconsistance à corriger reste un `rounded-3xl` (24px) isolé, hors échelle.
- **Background:** white surface (`--bc-surface`), dark-mode override to `#1E293B`.
- **Shadow Strategy:** hairline border by default; card shadow only when floating above content.
- **Border:** 1px `--bc-border`.
- **Internal Padding:** 16-32px depending on density.

### Inputs / Fields
- **Style:** pill-shaped, 1px `--bc-border`, 48px height, icon-left pattern (see `AuthView.tsx`).
- **Focus:** border shifts to green + focus ring.
- **Error/Success:** red-pourpre border + message (error), anis border (success). Real-time
  duplicate-phone indicator (hourglass icon) on phone fields.

### Navigation
- **Shell:** header (logo, branch switcher, notification bell, avatar) + retractable desktop
  sidebar + mobile bottom bar (glassmorphism) + floating green "ADN" add button.
- **Active state:** green text bold + green 4px left rail + 10% green background fill.
- **Inactive:** secondary gray text, no fill.

### Branch Switcher (signature component)
Header toggle between Church/Light. `--accent-1`/`--accent-2` now cascade from `[data-branch]` on
`<html>` (set from `App.tsx`'s `activeBranch` state), and the header's Color Sweep gradient reads
`var(--accent-1)` — fixed this session. Per-branch pill colors in the switcher itself stay driven
by the user-customizable `settings.branches[b].accent` picker (`SettingsView.tsx`), a deliberately
separate, per-user cosmetic layer, not the structural cascade.

## 6. Do's and Don'ts

### Do:
- **Do** keep white + Vert Sarcelle as ~80% of every screen; accents stay rare and tied to a
  specific meaning (branch, category, status).
- **Do** use pill shape (`--radius-pill`) for every interactive control — buttons, inputs, status
  chips, toggles.
- **Do** keep body text black (`--bc-text`) and Warm Grey text-free, in both light and dark theme.
- **Do** honor Mode Plein Soleil and ≥48px touch targets as first-class states, not edge cases —
  this is a field tool, not a desktop dashboard.
- **Do** drive branch identity through `--accent-1`/`--accent-2` CSS custom properties cascading
  from a single `[data-branch]` attribute on `<html>`, so any component can opt in by referencing
  the variable — not by threading accent strings through component props.

### Don't:
- **Don't** use Warm Grey as a text color at any opacity — it fails WCAG AA contrast.
- **Don't** combine more than two accent colors on one screen.
- **Don't** default to a cold B2B SaaS look or a warm-cream/beige body background "for elegance" —
  the base is white, not tinted sand.
- **Don't** introduce a radius value outside the real 4-tier scale (`rounded-xl` control 12px /
  `rounded-2xl` tile 16px / `rounded-[2rem]` panel 32px / `rounded-[2.5rem]` modal 40px, plus
  `--radius-input` 8px / `--radius-pill`) — a stray `rounded-3xl` (24px) or `rounded-lg`/`-md`
  where a scale tier fits is the drift to fix. `rounded-xl` on a compact control is NOT drift.
- **Don't** reintroduce the generic `emerald`/`amber`/`red` Tailwind literals for
  success/warning/danger — use the charter's semantic mapping (anis/orange/purple) instead.
- **Don't** ship a "branch switch" that only changes a decorative indicator inside the switcher
  itself — the whole app's accent state must move together.
