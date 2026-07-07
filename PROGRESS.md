# PROGRESS

Session handoff doc. Read this before re-reading conversation history — it's kept current so a
session can `/clear` and pick up from here (plus `graphify query`) instead of relying on
compaction. Full item-level detail for tiers below lives in `AUDIT-FRONTEND.md`; this file only
tracks status, not the original findings.

## Done and verified

**P0, P1.1, P1.2, P1.3, P2.1-P2.10 fully done (P2.9 explicitly deferred, see below). P4: 20/20 done. P5: 7/7 done — the entire audit roadmap (P0-P5) is now closed. P3.4/P3.10/P3.11 also resolved earlier this session, see below.**

- **P4 (écrans, navigation & permissions par profil) — 20/20 done.**
  - **P4.1/P4.2** (Sidebar profile selector + role/capability gaps) — confirmed already fixed,
    not from this session's work: `Sidebar.tsx`'s role selector already lists all 18 profiles
    incl. Adjoint/Responsable de Zone/Responsable de Commune; `VIEW_PERMISSIONS`
    (`mockData.ts`) already grants Capitaine `view_dashboard`+`view_members`, Membre
    `view_bloombus`, Leader/Nouveau `view_formations`, and `view_projects` to all profiles —
    this was done earlier in the engagement as part of P1.1's permission-matrix build and never
    got its own bullet here. No code changes needed now, just closing the documentation gap.
  - **P4.5** (Sidebar accordion) — departments grouped by ministry, collapsible
  - **P4.5** (Sidebar accordion) — departments grouped by ministry, collapsible
    (`expandedMinistries: Set<string>` + auto-expand on `selectedDept` change).
  - **P4.6** (role-gate fixes) — `CursusView` promotions restricted to Pasteur Principal only;
    `FormationsView` certification opened to Responsable; `EventsView` culte-closure gate
    extended to ADN/Portier/GDC; `DepartmentsView` dept-creation gate tightened to Pasteur
    Principal/Admin/Super Admin (dedup'd the duplicate inline literal into `canAdmin`).
  - **P4.7** (MinisteresView) — `canManage`-gated "+ Créer un ministère" modal; ministry detail
    view now shows the Responsable's name next to the member count.
  - **P4.11** (AccountsView) — Super Admin grant/revoke now real (was read-only), reusing the
    Admin grant/revoke logic via a shared `grantingRole`/`prefix` pattern instead of duplicating
    it; journal dot-color logic generalized from exact-match to suffix-match so it covers both
    `ADMIN_*` and `SUPERADMIN_*` action types.
  - **P4.12** (Events roster + filters) — `presentServiteurs: string[]` toggle-array in the
    culte-closure modal (`content.presencesService`), `members` prop threaded from `App.tsx`;
    `filterType`/`filterProject` selects added above the events grid (project labels resolved
    via `useProjects()`, not raw IDs).
  - **P4.13** (Projects) — `events` prop threaded from `App.tsx`; new "Événements rattachés"
    panel in the project detail view (`events.filter(e => e.projectId === selected.id)`);
    `filterScope`/`filterPmo` selects added alongside the existing `filterStatus`.
  - **P4.14** (Header notification center) — filter pills (all/info/success/warning/alert) added
    to the dropdown; new full "Toutes les notifications" modal (uncapped list, own filter row,
    reuses `markAllNotificationsAsRead`); extracted shared `renderNotifList()` to avoid
    duplicating row JSX between dropdown and modal.
  - **P4.15** (dedup/auto-assignment in `handleAddMember`) — bus auto-assignment by commune,
    OJ→`dept_bapteme` auto-join, duplicate-phone detection now flags + notifies + audit-logs
    (`MEMBER_DUPLICATE_FLAGGED`) instead of silently allowing dupes.
  - **P4.16/P4.17** (audit-log labeling) — `handleUpdateMember`'s audit block now branches on
    promotion/branch-transfer/generic-update to emit `MEMBER_PROMOTED`/`BRANCH_TRANSFER`/
    `MEMBER_PROFILE_UPDATED` (chosen to match `AuditView.tsx`'s existing `entityOf()`
    prefix-matching convention — no changes needed there).
  - **P4.20** (permissions matrix + dead titles) — new `view_reports`/`view_programs`
    capability keys; `view_projects` widened to all profiles (was staff-only, a P4.2 residual
    bug); `ReportsView`/`ProgrammesView` routed as real Sidebar tabs + `App.tsx` switch cases
    (previously fully-built but unreachable); `Header.tsx`'s dead `getTabTitle()` deleted
    outright (zero call sites — each view already renders its own title).
  - **P4.3** (MembersView data-scope restriction) — new `src/data/scope.ts` exports
    `inMemberScope(operator, target, role, busLines, departments, ministries)`, a pure data
    filter (distinct from the existing tab-level permission gate) applied on top of
    `MembersView.tsx`'s existing filters; scopes by `Member.bloomBusId` →
    `BloomBusEntity.zone`/`.commune` (falls back to `gps.commune`), department/ministry
    membership for `'Ministre'` (via `Ministry.tuteurId`/`Department.ministryId`), shared-dept
    role for `'Responsable'`/`'Adjoint'`/etc.; `operator` threaded from `App.tsx`
    (`members.find(m => m.id === 'mem_1') ?? members[0]`, matching `ProfileView`'s existing
    call-site pattern). New `src/data/scope.check.ts` (node:assert, `kpi.check.ts` convention)
    — `npx tsx src/data/scope.check.ts` → `scope.check OK`. Fail-open default
    (`ponytail:` comment) for any role/edge-case not explicitly modeled.
  - **P4.8** (Cursus mentor→filleul tree) — new `Member.mentorId?: string` field (`types.ts`);
    `CursusView.tsx`'s old flat pyramid-tier-by-cursus-rank render replaced with a real
    recursive mentor-tree (new `CursusTreeNode` component), roots = members with no mentor OR
    whose mentor was filtered out of the current pool (so a filtered-out mentor's filleuls
    float up instead of disappearing); mentor-assignment `<select>` added to each list-view
    row, gated by `canManage`. Surfaced and fixed a project-wide TS quirk here: no
    `@types/react` in `package.json` means custom (non-DOM) components can't take a `key` prop
    directly — worked around by wrapping each `<CursusTreeNode>` call in a `<div key={...}>`.
    Saved as a persistent memory (`bloomcore_key_prop_quirk.md`) so future sessions reuse the
    same pattern without rediscovering it.
  - **P4.18** (Délégation de droits par Responsable) — new "Délégation" tab in
    `DepartmentsView.tsx`, gated by `isDeptResponsable = simulatedRole === 'Responsable'`;
    reuses `GovernanceView.tsx`'s existing `'bc_delegations'` localStorage key/record shape
    (deliberately duplicated the small `DELEGABLE_CAPS` list locally rather than extracting a
    shared module — `ponytail:` comment flags the drift risk, judged an acceptable tradeoff to
    keep `GovernanceView.tsx` untouched); real member `<select>`s for `from`/`to` (vs. free
    text in the global admin view); visibility scoped to
    `deptDelegations = delegations.filter(d => d.scope === \`Département ${dept.name}\`)`.
  - Verified: `npx tsc --noEmit` clean after every batch, `kpi.check.ts`/
    `notificationRules.check.ts`/`scope.check.ts` all OK, dev server (port 3001, PID 34412)
    still serving (curl 200, confirmed serving `/src/App.tsx` from this exact project dir).
  - **P4.4/P4.9/P4.10/P4.19 — done this session, closing out P4 at 20/20.** See the
    per-item notes below (kept for the decisions made, not as open items anymore).
  - **P4.4** — decided NOT to merge: `DepartmentsView.tsx`'s dept-scoped "Nouveaux" tab
    (Responsable pipeline, `receptionValidated`) and `NouveauxView.tsx` (transverse
    ADN/Intégration pipeline, `integrationFollowStatus`) serve different publics/granularity.
    Documented with `ponytail:` comments in both files instead of restructuring.
  - **P4.9** — `Member360View.tsx`: (a) real audit timeline via
    `audits.filter(a => a.details.includes(fullName))`, threaded `AuditLog[]` through
    `App.tsx → MembersView → Member360View`; (b) real "Projets" card via
    `projects.filter(p => p.team.some(t => t.member === fullName))`; (c) Stepper wiring for
    `Member.currentStepId` — only `dept_bapteme` gets real step labels (copied literally from
    `FormBuilderView.tsx`'s frozen `fd_bapteme`, not imported, to avoid re-coupling); other
    parcours depts fall back to plain-text step id (honest empty state, no fabricated labels,
    matches every current seed member since none has `currentStepId` set); (d) health-evolution
    `LineChart` built from real `rapport_bloom_bus_member` report history (no new fabricated
    `bc_health_history` store — ponytail's no-retroactive-data rule), gated on `length >= 2`.
  - **P4.10** — `ProfileView.tsx`: added a "Sécurité" card (mock password-change modal, mock
    session list with revoke), a "Mode Plein Soleil" toggle (`PleinSoleilToggle`, same
    class+localStorage mechanism as `ThemeToggle`, key `bc_plein_soleil`) — CSS effects for
    Plein Soleil explicitly deferred to P5.2, only the toggle+persistence wiring landed here.
  - **P4.19** — new `AuthView.tsx` (login/activation/reset, mock: any password works, member
    looked up by `phone`). `App.tsx` gates the whole app shell on a new persisted
    `loggedInMemberId` state (`bc_loggedInMemberId`); `handleLogout` clears it. Replaced all 4
    hardcoded `mem_1` operator sites (`App.tsx` ×2, `DepartmentsView.tsx`, `DashboardView.tsx`
    — the latter two via a new `operatorId` prop). `ProfileView`'s logout button now calls a
    real `onLogout` prop instead of `alert()`. `simulatedRole`/`setSimulatedRole` role-switcher
    in `Sidebar.tsx` left untouched — orthogonal test tooling, not part of this auth gate.

- **P2.6-P2.8, P2.10 (culte report blocks, ADN gaps, Bloom Bus field types, phone validation) — done this session.**
  - **P2.10** — blocking phone-uniqueness check added to `MembersView.tsx`'s `handleSave` and
    `App.tsx`'s `handleSaveQuickNouveau` (both reuse the existing `alert()`+`return` pattern,
    no new UI). `members.some(m => m.phone === phone && m.id !== selectedMember?.id)`.
  - **P2.7** — ADN Fiche Nouveau (`App.tsx`'s global quick form): photo now required
    (`<input type="file">` + `FileReader.readAsDataURL` → `Member.avatarUrl`, blocks submit if
    empty), GPS now real (`navigator.geolocation.getCurrentPosition` via a "Localiser" button,
    falls back to the old hardcoded Abidjan coords if the user never taps it), new "Comment
    nous a-t-il connu ?" source select → new `Member.source?: string` field added to
    `types.ts`.
  - **P2.6** — Rapport de culte extended in place (same "Clôturer le Culte" modal/
    `handleSaveCounters` in `EventsView.tsx`, not a separate modal, to preserve the single
    "close the service, generate all 3 reports" flow). Added: Infos générales (prédicateur/
    thème/officiant), Atmosphère spirituelle (ferveur/louange/déroulement de l'appel, 1-5 via
    a `RatingRow` duplicated from `BloomBusView.tsx`), Journal des incidents (repeatable
    `{type, departments, details}` list, add/remove idiom cloned from `DepartmentsView.tsx`'s
    RSA actions), Stats de fréquentation (`attendeesEnfants` input, `nouvellesDecisions`
    derived from `ojMen+ojWomen`), Remarques libres (free-text replacing the old canned
    `notes` string). `ReportsView.tsx`'s `rapport_culte` detail block extended to display all
    of the above — previously captured-but-invisible data risk avoided.
  - **P2.8** — Bloom Bus + Portiers field-type fixes in `BloomBusView.tsx` and
    `EventsView.tsx`:
    - "Présence au culte" (member health modal) — was a 1-5 `RatingRow`, now a real
      multi-select of culte events (`culteIds: string[]`, toggle-button array sourced from a
      new `events` prop threaded through `BloomBusViewProps` → `App.tsx`'s `<BloomBusView>`
      call). `Member.healthKPIs.presenceCulte` now derives from `culteIds.length` as a rollup.
    - "Membres visités" (life-report modal) — was a plain number input, now a real
      multi-select over `busMembers` (`visitedMemberIds: string[]`, same toggle idiom).
      `content.visitesRealisees` is now `string[]`, not a number.
    - Portiers counters (`EventsView.tsx`) — added a 3rd "Présence en ligne" numeric field
      alongside Hommes/Femmes, feeding `content.online`. `total` stays physical-only per
      `FORMULAIRES.md`.
    - Downstream follow-ups fixed: `src/data/kpi.ts`'s `busVisitesTotal` rewritten to count
      **distinct** visited member IDs (`Set<string>`) instead of summing a proxy count —
      resolves the `ponytail:` debt comment that was already flagging this exact gap.
      `src/data/kpi.check.ts` updated to match the new array-based assertions.
      `src/mockData.ts`'s seed report (`rep_3`) updated from `visitesRealisees: 4` to
      `visitesRealisees: ['mem_1']` (the only member actually seeded on that bus).
      `ReportsView.tsx` updated to display visit counts / culte counts for both Bloom Bus
      report types, and the online-presence counter for Portiers reports.
  - **P2.9 (FormBuilder missing field types) — still deferred, not implemented.**
    P1.4 was later revisited and partially wired (label-only, see the P1.4 section below), but
    that narrower scope didn't need new field types — still speculative to build multi-select/
    upload/GPS/repeatable-list types until a consumer needs full field-structure wiring, not
    just labels.
  - Verified: `npx tsc --noEmit` clean, `kpi.check.ts`/`notificationRules.check.ts` both OK,
    dev server (port 3001, PID 34412) still serving (curl 200).

- **P2.1-P2.5 (the 5 dead-button report forms) — done this session.**
  - `DepartmentsView.tsx`: added `onAddReport` prop; replaced the dead `.map()` button (no
    `onClick` at all) in the "Rapports" tab with a shared modal covering P2.1 Rapport de
    service, P2.2 Rapport RSA, P2.3 Rapport d'activité, P2.5 Observation typée. Gated behind
    `canValidate` (Responsable/Coach/Leader/Pasteur/Ministre/Admin/Super Admin). Multi-select
    "Serviteurs" built from scratch (toggle-button array, no existing component to reuse).
    RSA reuses the add/remove-array-in-state idiom from `ProjectsView.tsx`. `rapport_service`/
    `rapport_activite` content includes `presencesService: string[]` so the P1.3 KPI wiring
    (`activeMemberIds` in `kpi.ts`) picks these up automatically. Wired
    `onAddReport={handleAddReport}` into `App.tsx`'s `<DepartmentsView>` call.
  - P2.4 Rapport suivi coach — two producers now exist, both writing the same content shape
    (`{ memberId, notes }`, `confidential: true`):
    1. `DepartmentsView.tsx`'s "Suivi" tab (the audit's actual flagged location,
       `DepartmentsView.tsx:357-369`) — was informational-only ("liste par membre visité/
       entretien" per the audit, previously just an encadrants list with a dead label). Now
       split into an "Encadrants" list (who) and a "Membres à suivre" list (deptMembers minus
       Coach/Leader) with a real "Rédiger un suivi" button per member, reusing the same shared
       report-modal state as P2.1-P2.3/P2.5 (`reportModalType` extended to accept
       `rapport_suivi_coach` + a new `reportTargetMemberId`).
    2. `Member360View.tsx` — required prop-threading `reports`/`onAddReport` through
       `App.tsx` → `MembersView.tsx` → `Member360View.tsx`. Replaced the hardcoded mock card in
       the "Rapports" tab with a real list (filtered by `content.memberId === member.id`) + its
       own "Rédiger un suivi" entry gated behind `canManage`. Kept intentionally — lets a Coach
       write/review a member's suivi history from that member's own 360 view, not just from the
       department console.
  - All producers reuse the existing `onAddReport` → `App.tsx`'s `handleAddReport` plumbing
    unchanged (notification dispatch, audit log, localStorage persistence) — no changes needed
    there.
  - Verified: `npx tsc --noEmit` clean, `kpi.check.ts`/`notificationRules.check.ts` both OK,
    dev server (port 3001) still serving (curl 200).

- `src/data/kpi.ts` — generalized `busMobilisationRate`/`moissonTotal` to take `busIds: string[]`
  (supports bus/zone/commune aggregation), added `activeBusIds`, `busVisitesTotal`, renamed/
  generalized `departmentActiveMemberIds` → `activeMemberIds(reports, period, now, departmentId?)`
  (optional param → global or department scope, checks `rapport_service` + `rapport_activite`
  per KPIS.md §1's exact "membre actif" definition). Verified via `npx tsx src/data/kpi.check.ts`
  → `kpi.check OK`.
- Real KPIs wired into `DashboardView.tsx` (Actifs, Baptisés, Bloom Bus actifs, Moisson, Au
  rouge, file d'intégration counts, réceptions en attente — period selector now typed and
  actually used), `BloomBusView.tsx` (T_mob_bus, Moisson, Visites), `DepartmentsView.tsx`
  (Membres Actifs fixed — was using total roster count, now uses real `activeMemberIds`),
  `MinisteresView.tsx` (Membres Actifs, santé moyenne label, classement départements now
  actually sorted by score instead of insertion order).
- `App.tsx` — passed `reports` prop to `<MinisteresView>` (was missing; Dashboard/BloomBus/
  Departments already had it).
- `MembersView.tsx` / `Member360View.tsx` — now import canonical `isRed` from `kpi.ts` instead
  of local duplicates; fixed a null-guard bug in `Member360View`'s old inline
  `integrationDateRegistered` calc that could crash/misbehave when that field was undefined.
- `ReportsView.tsx` — dropped dead `mobilises` (typo) fallback now that both write sites use
  `mobilised` consistently.
- **Left as explicit placeholders, not fabricated** (genuinely blocked, not bugs): Dashboard's
  "Remontées" KPI (`rapport_observation` has zero seed data, zero producer form, no defined
  content shape) and "Rapports de culte manquants" (no "rapports attendus" baseline defined
  anywhere per KPIS.md §4) — both show `—` with a `ponytail:` comment instead of a fake number.

**Dev server**: port **3001**, PID **34412**, confirmed via `ps -p 34412` to be vite running
from this exact project directory — this is the real server to test against. Port 3000 is an
**unrelated** project (`~/antigravity/Bloomcore`) — do not touch it, don't confuse it with this
repo.

## New gap found this session — not in AUDIT-FRONTEND.md — RESOLVED this session

**Status: fixed.** `settings` is now lifted to `App.tsx`-owned state (`INITIAL_SETTINGS` seed
in `mockData.ts` → `seeds.settings`, same `load`/`save`/`bc_settings` key), following the exact
convention already used for `members`/`events`/`reports`/`audits`/`notifications`/
`permissionMatrix`. `SettingsView.tsx` no longer owns local state — it takes `settings` +
`onUpdateSettings` as props. Shared `AppSettings`/`NotifTrigger`/`NotifChannels` types moved
from `SettingsView.tsx` into `types.ts` so both `App.tsx` and `SettingsView.tsx` (and now
`ProfileView.tsx`) reference the same shape.

A new `useEffect` in `App.tsx` (dependent on `members`/`settings`) calls
`deriveTimeBasedNotifications(members, new Date(), { pending, red })` — `pending`/`red` now
come from `settings.triggers` (`integ1`/`integ2` `delayDays`, previously hardcoded 3/7 and
decorative), filters out notifications whose trigger has the `app` channel toggled off, and
merges only the not-yet-seen ids into `notifications` (dedup by id, per the existing `ponytail:`
comment in `notificationRules.ts`). `deriveTimeBasedNotifications`'s signature gained an
optional 3rd `delays` param (default `{pending:3, red:7}`, backward-compatible —
`notificationRules.check.ts` needed no changes).

Added `Member.notifChannels?: NotifChannels` (`types.ts`) + a "Canaux de notification" toggle
block in `ProfileView.tsx`'s existing "Préférences" card (per NOTIFICATIONS.md's spec: "chaque
membre choisit ses canaux dans Mon Profil"), saved via the existing `onUpdateMember` prop.
`ponytail:` comment flags the real ceiling: this is stored self-service preference only, with
no effect on notification filtering yet, because `AppNotification` isn't member-targeted
(broadcast by branch, not by member) — wiring per-member delivery filtering needs a `memberId`/
target field on `AppNotification` first, out of scope here.

**Still not done, out of scope for this session (needs a backend, not just wiring):** no real
email/SMS/WhatsApp delivery integration exists — only the `app` channel is actually honored,
since it's the only one with a transport (in-app). No "Toutes les notifications" page (still
only the `Header.tsx` bell dropdown, scrollable, no view-all/pagination) — untouched, was never
part of the P1.2b gap description.

Verified: `npx tsc --noEmit` clean, `kpi.check.ts`/`notificationRules.check.ts`/`scope.check.ts`
all OK, dev server (port 3001) still serving 200.

---

**Original gap description (kept for reference — now fixed above):**

`App.tsx`'s dispatcher (`mkNotif`,
`handleAddNotification`, the diff logic in `handleUpdateMember`, etc.) is real and correctly
fires in-app notifications on actual events (new member, reception validated, status change,
promotion, dept reassignment, branch transfer, baptism, Drachme flag, report/observation
submitted, event planned). But:

- `SettingsView.tsx`'s 4 hardcoded triggers (delay days + app/email/sms/whatsapp channel
  toggles) save to `bc_settings` (localStorage) and are **read by nobody** — `grep -n
  "bc_settings"` only hits SettingsView itself.
- `src/data/notificationRules.ts`'s `deriveTimeBasedNotifications` (the 3j/7j delay logic for
  réception non validée / statut au rouge) exists and is correct but is **never called** —
  no cron/interval/effect invokes it anywhere.
- `ProfileView.tsx` has **no per-member channel preferences** — only a theme toggle and a
  static "Français" pill, despite NOTIFICATIONS.md spec'ing per-member channel choice in Mon
  Profil.
- **No email/SMS/WhatsApp delivery integration exists anywhere in the codebase** — every
  notification today is in-app only, regardless of what channels are toggled in Settings.
- No "Toutes les notifications" page exists — only the `Header.tsx` bell dropdown
  (scrollable, no view-all link, no pagination).

Net: multichannel is 0% implemented; in-app dispatch for the events above is real; the
admin-config layer connecting them is pure UI.

## FormBuilder (P1.4) — decision revisited and wired this session

Originally frozen as a documentary catalog (see below for the original reasoning, still
accurate for the untouched forms). User explicitly asked to revisit and wire it up. Given
the real report modals (P2.1-P2.5) already have richer custom widgets (multi-select members,
event pickers) that don't map onto FormBuilder's simple `Field` schema, a full generic
form-renderer rewrite would risk regressing already-verified P2 work for no real gain — so the
scope was narrowed to **metadata wiring** (labels, not full field structure) on the two
FormDefs whose fields are plain scalars with a genuine 1:1 real-modal match:

- `INITIAL_FORMS`/`Field`/`FormDef`/`FieldType` types moved out of `FormBuilderView.tsx` into
  `types.ts` (types) and `mockData.ts` (seed data), matching the app's existing `INITIAL_*`
  convention. `forms` state now lives in `App.tsx` (`useState(() => load('bc_forms',
  seeds.forms))` + matching `save` effect) instead of `FormBuilderView`'s local state — so
  builder edits now **persist** across reloads, unlike before.
- `FormBuilderView.tsx` takes `forms`/`onUpdateForms` props instead of owning state; editor UI
  unchanged.
- **`fd_bus_sante`** — `BloomBusView.tsx`'s 4 health-axis `RatingRow` labels
  (Spiritualité/Social/Physique/Financier) now read live from the FormDef's `f0`-`f3` fields
  (id-matched, not position-matched, so reordering fields in the builder can't silently
  relabel the wrong value) instead of being hardcoded strings.
- **`fd_adn`** — `EventsView.tsx`'s 4 ADN-comptage input labels (Nouveaux H/F, Oui à Jésus H/F)
  same id-matched wiring against the FormDef.
- Ceiling, documented via `ponytail:` comment atop `FormBuilderView.tsx`: only label text is
  consumed downstream — adding/removing/reordering fields on these two forms only changes the
  builder's own display, since the live modals keep fixed input positions bound to fixed
  KPI/report object keys (`content.nouveauxHommes` etc.) that other code depends on by exact
  name. The other FormDefs (`fd_nouveau`/`fd_membre`/`fd_service`/`fd_rsa`/`fd_bapteme`) stay
  documentary — untouched, same reasoning as originally: their real modals' custom widgets
  don't have an equivalent field in this schema at all. P2.9's missing field types remain
  unbuilt; not needed for this narrower scope.
- Verified: `npx tsc --noEmit` clean, all three `.check.ts` suites OK, dev server (port 3001,
  PID 34412) verified 200 after changes.

## Remaining tiers (status only — full item tables live in AUDIT-FRONTEND.md)

| Tier | Status |
|---|---|
| **P2** — formulaires (P2.1-P2.10) | **Done this session, except P2.9 (deliberately deferred, see above).** P2.1-P2.10 all implemented and verified (tsc + kpi.check + notificationRules.check all clean). Not yet done: extending `ReportsView.tsx`'s `getReportName()`/`getReportBadgeStyle()` for `rapport_activite`/`rapport_suivi_coach`/`rapport_observation` (they fall back to generic label/badge today; detail view still renders fine via the existing `content.notes` fallback) — minor cosmetic gap, not blocking. |
| **P3** — KPI wiring punch-list (11 items) | Mostly subsumed by the P1.3 work above. **P3.4/P3.10/P3.11 cross-checked and resolved this session** (see detail below); no other item still open. |
| **P4** — écrans/permissions (20 items) | **20/20 done (see the P4 section above).** |
| **P5** — charte/a11y (7 items) | **7/7 done (see the P5 section above).** |

**Audit's own recommended order**: P2 → P4 → P5 → P1.4 (last). **All done, including P1.4 (see the P1.4 section below).**

## P3.4/P3.10/P3.11 — resolved this session

- **P3.4** — confirmed already fixed, not new work: `DashboardView.tsx`'s `period` state
  (`useState<Period>`) already drives `activeMemberIds`/`activeBusIds`/`moissonTotal`/
  `periodRange` (from `kpi.ts`) genuinely — this was done as part of the earlier P1.3 KPI-wiring
  pass and never got closed out in the audit tracking. No code changes.
- **P3.10** — the 3 divergent smiley mappings actually diverged only on the level-5 color
  (violet in 2 of 3, green in the spec-correct one): fixed `HealthSmiley.tsx` (the intended
  shared component) from `text-purple-500` to `text-emerald-600` at level 5, then replaced the
  two inline duplicate switch-statements that were re-implementing the same 5-level icon logic
  — `Member360View.tsx`'s local `renderIcon` and `ProfileView.tsx`'s local `HealthIcon` — with
  actual `<HealthSmiley value={axis.A} size={24} />` calls (deleted both dead functions + their
  now-unused lucide icon imports). `DashboardView.tsx`'s own `FACE` map (dominant-level-across-
  members display) was left as its own thing — its level-5 color was already `emerald-600`
  (correct), and it needs a 6th "aucune donnée" (level 0) state `HealthSmiley` doesn't support,
  so it's a genuinely different domain, not a 4th duplicate to collapse.
- **P3.11** — decision made (MINEUR, reversible): **keep the 6th axis** (`presenceService`,
  alongside the spec's 5). It's already load-bearing across `Member.healthKPIs` (`types.ts`),
  `kpi.ts`'s health-score calc, and every view that renders the health radar/row
  (`ProfileView`/`Member360View`/`DashboardView`/`MinisteresView`) — ripping it out now would be
  a wider regression across already-correct code for a spec-conformance nicety, and
  "présence service" vs. "présence culte" is a real, distinct signal (serving vs. attending).
  Revisit only if the spec is confirmed to require an exact 5-axis match.

Verified: `npx tsc --noEmit` clean, all three `.check.ts` suites OK, dev server (port 3001) 200.

## P4 — closed out this session (20/20)

See the P4.4/P4.9/P4.10/P4.19 bullets under "Done verified" above for exactly what shipped
and which decisions were made for each. `npx tsc --noEmit` clean, all `.check.ts` suites OK,
dev server (port 3001, PID 34412) verified 200 after the changes.

## P5 — closed out this session (7/7), audit roadmap complete

- **P5.1/P5.4** (branch theming never wired) — combined into one pass since both concern the
  same gap: branch accent configured in Settings but never consumed. `SettingsView.tsx`'s
  `ACCENTS` list fixed to the 6 real brand colors (`cerulean`/`orange`/`fushia`/`turquoise`/
  `anis`/`purple`, dropping `green` which is app chrome, not a branch accent — resolves the
  audit's literal "4/6" complaint). `mockData.ts`'s `church` branch default accent changed
  `green` → `cerulean`. `Header.tsx` now threads `churchAccent`/`lightAccent` props from
  `App.tsx` (`settings.branches.church/light.accent`) and uses them to color the branch
  switcher's active-indicator (`` `bg-bc-${accent}` ``, global stays neutral green); also wired
  the previously dead `isSweepActive` state + `.color-sweep`/`.active-glow-church`/
  `.active-glow-light` CSS (already existed in `index.css`, just never triggered) via
  `data-branch` on the switcher container.
- **P5.2** (Mode Plein Soleil CSS) — `index.css`: `html.plein-soleil { font-size: 115% }`
  (Tailwind's rem-based spacing/text utilities mean fonts *and* button padding scale together
  from one rule) plus higher-contrast `--color-bc-text-secondary`/`--color-bc-border` overrides.
  Toggle+persistence (`PleinSoleilToggle`, `bc_plein_soleil`) already existed from P4.10 —
  this item only added the missing visual effects.
- **P5.3** (dark mode `bg-white` gap) — `html.dark .bg-white { background-color:
  var(--color-bc-surface) }` as plain unlayered CSS in `index.css`, which beats Tailwind's
  layered `.bg-white` utility per the CSS cascade-layers spec — fixes all ~270 occurrences
  across 23 files with one rule, zero component edits. `ponytail:` comment documents the
  accepted tradeoff: a few small decorative elements (toggle knobs, status dots) darken
  slightly too, since not every `bg-white` is a card surface — judged disproportionate to
  rewrite 23 files for a MAJEUR-not-BLOQUANT item.
- **P5.5** (touch targets/focus-visible/a11y) — `SettingsView.tsx`'s branch-enable toggle and
  accent swatches: 48px hit areas via `p-3 -m-3` / `p-2.5 -m-2.5` (padding + equal negative
  margin expands tap target without changing visual size), `role="switch"`/`aria-checked`/
  `aria-pressed`/`aria-label`, `focus-visible:ring-2`. `theme-toggle.tsx` rewritten from a
  plain `<div onClick>` to a real `<button role="switch" aria-checked aria-label="Thème
  sombre">` with focus-visible styling and native keyboard support.
- **P5.6** (semantic tokens) — `index.css`: `--color-bc-canvas` `#FFFFFF` → `#F7F6F3`,
  `--radius-input` `6px` → `8px`, `--dur` `200ms` → `250ms`; added `--color-bc-primary/
  success/warning/danger` aliases. `ponytail:` comment flags scope ceiling: existing literal
  `red-500`/`emerald-*`/`amber-*`/`slate-*` usages elsewhere aren't migrated to the new tokens
  — disproportionate rename sweep for a MINEUR item; new tokens cover new usages going forward.
- **P5.7** (Export PDF for audit log) — `AuditView.tsx`: "Export PDF" button calling
  `window.print()` (no PDF library added — rung 4 of the reuse ladder, native + Tailwind's
  built-in `print:` variant covers it), a print-only table+heading (`hidden print:table`/
  `print:block`), and `print:hidden` on the three on-screen containers so only the table
  renders when printed. `App.tsx`/`Sidebar.tsx`/`Header.tsx` also got `print:hidden`/
  `print:overflow-visible` utility classes so the app chrome doesn't print alongside it.
- Verified: `npx tsc --noEmit` clean, `kpi.check.ts`/`notificationRules.check.ts`/
  `scope.check.ts` all OK, dev server (port 3001, PID 34412) verified 200 after changes.

## Backend — built this session (Express + node:sqlite, scoped down from ARCHITECTURE_TECHNIQUE.md)

`ARCHITECTURE_TECHNIQUE.md` is the project's own target design (npm-workspaces monorepo,
Prisma+PostgreSQL, Socket.io realtime, Cloudinary/Twilio/Nodemailer, HMAC webhooks, full
relational entity model, capability-based RBAC engine) — status "à valider avant build". That
full target was judged infeasible to stand up and verify in one autonomous pass in this
environment (no realistic way to run Postgres/Redis/external SaaS here, and a rewrite that large
couldn't be browser-tested). Built a pragmatic, real, working subset instead — see the
confirmation list below for every point where this deviates from the target doc.

- **`server/db.ts`** — `node:sqlite`'s `DatabaseSync` (confirmed available, Node v26.3.0) as a
  document store: one `collections(name, id, data)` row per item (JSON blob), plus a flat `kv`
  table — chosen over a normalized relational schema because `src/data/index.ts` already treats
  every collection as a single array it loads/replaces wholesale, never per-item CRUD. A
  `credentials(member_id, password_hash)` table holds auth separately from the `members`
  collection (`Member` in `types.ts` correctly has no password field). Verified via curl smoke
  tests including cross-restart persistence (SQLite writes are durable, not in-memory-only).
- **`server/auth.ts`** — home-grown auth using only `node:crypto` (no new deps): scrypt password
  hashing (per-password salt, `timingSafeEqual` comparison) + an HMAC-SHA256-signed base64url
  token (`{sub, exp}` payload, 12h TTL). `ponytail:` comment flags the ceiling: swap for
  bcrypt/jsonwebtoken if this ever needs to interop with other services or survive a security
  review.
- **`server/seed.ts`** — idempotent seed from `mockData.ts`'s existing `INITIAL_*` exports (the 8
  synced collections/kv below); seeds every member's credentials with `hashPassword('bloom2026')`
  only if the credentials table is empty — a shared demo password, no real invite/activation flow
  (see confirmation list).
- **`server/index.ts`** — Express app: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`,
  `GET /api/v1/bootstrap`, `GET /api/v1/:name` (open read), `PUT /api/v1/:name`
  (`requireAuth`-gated, replaces the entire collection/kv value in one transaction — matches the
  frontend's whole-array `save(key, value)` shape, not granular per-item REST CRUD). Permissive
  dev-mode CORS (reflects any origin). Run via `npm run server` (`tsx watch server/index.ts`,
  reusing the already-installed `tsx` dep), listens on `API_PORT` env or `4000`.
- **`SYNCED_NAMES`** (`src/data/index.ts`): the 8 names both sides agree on — `members`,
  `events`, `reports`, `audits`, `notifications`, `permissions`, `settings`, `forms`.
- **Frontend wiring — additive, offline-first, zero regression risk to already-verified UI**:
  - `src/data/api.ts` (new) — thin client (`apiBootstrap`, `apiPut`, `apiLogin`,
    `getAuthToken`/`clearAuthToken`). Every function swallows network errors and resolves
    `null`/`false`/a safe default — never throws — so the app works identically whether or not
    `npm run server` is running.
  - `src/data/index.ts` — `load()` unchanged (stays synchronous/localStorage-only, zero impact on
    initial paint); `save()` additionally fires-and-forgets `apiPut()` when the key is in
    `SYNCED_NAMES`.
  - `src/App.tsx` — one mount-only `useEffect` calls `apiBootstrap()` and replaces state wholesale
    if the backend responds; silently does nothing if it doesn't. `handleLogout` now also calls
    `clearAuthToken()`.
  - `src/components/AuthView.tsx` — `submitLogin` now awaits `apiLogin()` first; local member
    lookup still happens first (preserves the existing "no account found" error UX). Distinguishes
    `reason: 'invalid'` (backend reachable, rejected the password → show error, do **not** fall
    back) from `reason: 'network'` (backend unreachable → fall back to the old offline mock/
    any-password login) — a self-caught fix: an earlier version of this logic would have silently
    accepted a wrong password whenever the backend was merely slow/unreachable-looking.
  - Non-strict-mode TS lesson (reusable): this project's `tsconfig.json` has no `"strict": true`,
    so TS fails to narrow a `{ok:true} | {ok:false; reason}` discriminated union after an early
    `if (result.ok) return`. `LoginResult` (`src/data/api.ts`) is deliberately a flat interface
    with optional fields instead, checked via `result.ok && result.member` — avoid relying on
    union narrowing after conditional early-returns anywhere else in this codebase.
- **`.gitignore`** — added `server/*.db` (seeded/regenerable, see `server/seed.ts`).
- **`package.json`** — added `"server": "tsx watch server/index.ts"`; repurposed the stale
  `"clean"` script (previously `rm -rf dist server.js`, referencing a file that no longer existed)
  to `rm -rf dist server/*.db`.
- **Post-backend build fix (unrelated to the backend work, pre-existing defect)**: `npx vite
  build` failed with `[@tailwindcss/vite:generate:build] Missing opening (` in `src/index.css`.
  Root cause: two comments (P5.2's Plein Soleil note, P5.6's semantic-token note) contained a
  literal `*/` substring inside prose referencing Tailwind utility patterns
  (`text-*/p-*/gap-*`, `emerald-*/amber-*`) — that `*/` prematurely closed the CSS comment,
  leaving trailing text (including a stray unmatched `)`) to be parsed as real CSS. Confirmed via
  `git diff`/`git status` that `index.css` was untouched by this session's backend work — this was
  a latent bug from the earlier P5 theming session, never caught because `vite build` (as opposed
  to `vite dev`) wasn't run after those edits. Fixed by rewording both comments to avoid the `*/`
  sequence. `npx vite build` now succeeds cleanly (2687 modules, no warnings beyond the pre-existing
  chunk-size notice).
- **Full verification chain, all green**: `npx tsc --noEmit`, all three `.check.ts` suites
  (`kpi.check.ts`/`notificationRules.check.ts`/`scope.check.ts`), curl-based backend smoke tests
  (login, 401-unauthenticated, authenticated PUT, cross-restart persistence), `npx vite build`.
  **Not done**: no real browser-based UI verification — no browser automation tool is available in
  this environment, so the offline-first wiring strategy (localStorage stays authoritative) was
  specifically chosen to minimize risk from that gap rather than eliminate the gap itself.

## Points to confirm — decisions made autonomously this session, need sign-off

1. **Scope-down from `ARCHITECTURE_TECHNIQUE.md`** — Express + `node:sqlite` document store
   instead of the documented Prisma+PostgreSQL/Socket.io/Cloudinary/Twilio/full-RBAC/webhooks
   target. Biggest architectural deviation this session. If the full target is actually required
   (e.g. for a real deployment), this needs a follow-up migration, not just an extension.
2. **Home-grown scrypt+HMAC auth** instead of bcrypt+jsonwebtoken — no new dependency installed;
   fine for a local/demo deployment, not vetted for production security review.
3. **Shared default password `'bloom2026'`** seeded for every member — no real invite/activation/
   reset flow exists (`AuthView.tsx`'s activate/reset screens remain mock-only, same as before).
4. **Whole-array-replace API shape** (`PUT /api/v1/:name` replaces the entire collection) instead
   of granular per-item REST CRUD — matches the frontend's actual `save()` usage today, but is a
   narrower API surface than `ARCHITECTURE_TECHNIQUE.md` documents.
5. **Permissive dev-mode CORS + no server-side RBAC** — the frontend's UI-level permission gates
   remain the *only* enforcement; the API itself does not check capabilities per role. Fine for a
   trusted local demo, not appropriate if this is ever internet-facing.
6. **GET routes are fully unauthenticated** (open reads); only `PUT` is auth-gated. Deliberate
   simplification for a single-tenant local app.
7. **Offline-first wiring** (localStorage stays authoritative/synchronous, backend is best-effort/
   fire-and-forget) rather than an async-first rewrite of the app's state management.
8. **Repurposed the `"clean"` npm script** — it referenced a file that no longer existed
   (`server.js`); now deletes `server/*.db` instead.
9. **No real browser-based UI verification** was possible this session (no browser automation
   tool in this environment) — verification relied on `tsc`, the `.check.ts` suites, curl smoke
   tests, and `vite build`, not an actual rendered/interacted-with session.
10. **`src/index.css`'s pre-existing build-breaking comment bug** (see above) was fixed as part of
    this pass, on the reasoning that a broken production build is a defect to fix outright rather
    than merely flag — but it wasn't part of the original backend request, worth a quick look at
    the diff (2 small comment rewording, no behavior change).

## Open decision for next session

Both the frontend audit roadmap (P0-P5, P1.4) and the backend build above are now done. Next
session starts from a clean slate — likely candidates: build toward the full
`ARCHITECTURE_TECHNIQUE.md` target if the scope-down above isn't acceptable, add real invite/
activation/reset flows to replace the shared demo password, or a fresh feature/audit track.
