# BloomCore & BloomLight — Persistent Agent Guidelines

These guidelines are automatically loaded for every session to guarantee a cohesive, high-performance, and visually distinctive design system following the **Taste Standard** and **UI/UX Pro Max** specifications.

---

## 🎨 Visual Atmosphere & Theme

- **Gallery-Airy & Restrained**: Prioritize spacious layouts, negative space, and confident asymmetry over cluttered components.
- **Canvas Backdrop**: Deeply refined warm-neutral canvas background (`#F8FAFC`) paired with pure white surfaces (`#FFFFFF`) and custom shadow/border parameters.
- **Color Discipline**: Strict separation of functional colors to prevent rainbow layouts:
  - **Bloom Church Accent**: `#006C67` (True Emerald/Teal Green) with spring hover indicators.
  - **Bloom Light Accent**: `#F38B36` (True Signature Orange).
  - **Charcoal Ink**: `#0F172A` (or `#18181B`) for primary headings and body typography — **never pure black**.
  - **Steel Secondary**: `#64748B` for secondary text and metadata to ensure 4.5:1 contrast compliance.
- **Micro-animations**: Staggered list entrances, tactile spring buttons (`stiffness: 380, damping: 30`), and layout-preserving tab switches using `motion/react`.

---

## 📐 Structural & Responsive Rules

1. **Mobile-First Precision**:
   - All multi-column sections must collapse gracefully into a single-column block at the `< 768px` breakpoint.
   - Text scales dynamically, and touch targets are maintained at `min-44px` with comfortable tap paddings.
2. **Zero Overlap**:
   - Text elements must never overlap with absolute background blocks or pictures. Every layout element sits in a dedicated CSS Grid cell.
3. **Typography Standards**:
   - Premium tracked-tight (`tracking-tight`) display titles.
   - Comfortable line height (`leading-relaxed` / 1.6) for paragraph readability.
4. **Anti-Patterns (STRICTLY BANNED)**:
   - **No Emojis** anywhere in the system UI or navigation controls (always use `lucide-react` vector symbols).
   - **No Circular Spinners**: Standardize on skeleton/shimmer gradients for layout transitions exceeding 200ms.
   - **No Generic Data**: Avoid placeholder names ("John Doe", "Acme") or round figures (use realistic organic names, Ivory Coast phone numbers, and actual database records).

---

## 🌪️ Motion & Animation Standards (Design Engineering)

- **Purposeful Motion**: Every animation must have a reason (spatial consistency, feedback, state indication). Never animate keyboard-initiated actions or high-frequency tasks (100+ times/day).
- **Physicality & Origin**: 
  - Never animate from `scale(0)`. Start from `scale(0.95)` with `opacity: 0`.
  - Popovers, dropdowns, and tooltips must scale from their trigger (`transform-origin`), not the center (modals are the exception).
- **Easing & Timing**:
  - UI animations should stay under **300ms** (e.g., button feedback: 100-160ms, popovers: 150-250ms).
  - **Never use `ease-in`** for UI entering. Use strong `ease-out` curves (e.g., `cubic-bezier(0.23, 1, 0.32, 1)`) for snappy responsiveness.
  - Asymmetric timing: Slow, deliberate animations for decisions (e.g., hold-to-delete), fast and snappy for system responses/releases.
- **Interruptibility**: Use CSS `transition` instead of `@keyframes` for dynamic UI elements (like toasts and toggles) so they can retarget smoothly if interrupted. Use spring physics for draggable or gesture-driven elements.
- **Hardware Acceleration**: Only animate `transform` and `opacity`. Animating layout properties (`width`, `height`, `margin`) drops frames.
- **Polishing Details**:
  - Add `transform: scale(0.97)` on `:active` for instant tactile button feedback.
  - Mask imperfect crossfades with a subtle blur (`filter: blur(2px)`).
  - Stagger group entrances with 30-80ms delays to create organic cascading effects.
