import React, { useEffect, useState } from "react";
import {
  Bus,
  Map as MapIcon,
  Heart,
  Sliders,
  Users,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  TrendingUp,
  Trash2,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Member, Branch, BloomBusEntity, Report, Event, FormDef } from "../types";
import { useBusLines, useDepartments, save } from "../data";
import { CULTE_SLOT_KEYS, culteSlotLabel } from "../data/events";
import { isBusReportLocked } from "../data/reportLock";
import { toast } from "./ui/Toast";
import { busInScope, bloomBusRoleOf, fullBloomBusAccess, canFillReportFor, canRegisterMemberViaBloomBus, FULL_SCOPE_ROLES } from "../data/scope";
import { moissonTotal, busVisitesTotal, busPresenceCulteTotal, busActivitesTotal, periodHealthLevels, periodRange, Period, PeriodInput } from "../data/kpi";
import { reportingWindow, weekId, weekLabel, mondaysInRange } from "../data/week";
import { memberWeekStatus, membersFillRate } from "../data/completude";
import ReportStatusBoxes from "./ReportStatusBoxes";
import { ResponsiveChart } from "./ui/ResponsiveChart";
import { PeriodSelector } from "./ui/PeriodSelector";
import { HEALTH_AXES, Ring } from "./DashboardView";
import { HealthSmiley } from "./ui/HealthSmiley";
import { motion } from "motion/react";
import { staggerParent, staggerItem } from "./ui/motion";
import { Avatar } from "./ui/Avatar";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { TerritoryMap, TerritoryMapMode } from "./ui/TerritoryMap";
import MemberFormModal from "./MemberFormModal";

// §Accueil-1.3/§5 — les 4 critères réellement saisis par le rapport de suivi Bloom Bus
// (presenceCulte/presenceService sont des compteurs, pas une échelle 1-5 : exclus du smiley/courbe ici).
const BUS_HEALTH_KEYS = new Set(["spirituel", "social", "physique", "financier"]);
const BUS_HEALTH_AXES = HEALTH_AXES.filter((a) => BUS_HEALTH_KEYS.has(a.key));

// Clés de créneau STABLES stockées dans content.culte (les stats agrègent dessus) ;
// l'affichage passe par culteSlotLabel(clé, semaine) → nom réel du culte de la semaine
// (Bloom/Super Sunday, Talk Show, Light Sunday/Show…).
const CULTE_OPTIONS = CULTE_SLOT_KEYS;
// Descripteurs neutres pour les agrégats multi-semaines (point mensuel) — un mois mélange
// plusieurs noms de dimanche, on décrit le créneau, pas un événement.
const CULTE_SLOT_SHORT: Record<string, string> = {
  '1er culte Bloom Church': '1ᵉʳ culte · Church',
  '2e culte Bloom Church': '2ᵉ culte · Church',
  'Culte Bloom Light': 'Culte · Light',
};

// Rapports rapport_bloom_bus_member → série temporelle moyenne par critère (un point par date de rapport).
function healthEvolutionSeries(matchReports: Report[]) {
  const byDate = new Map<string, { spr: number[]; soc: number[]; fin: number[]; phy: number[] }>();
  [...matchReports]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((r) => {
      if (!byDate.has(r.date)) byDate.set(r.date, { spr: [], soc: [], fin: [], phy: [] });
      const b = byDate.get(r.date)!;
      b.spr.push(Number(r.content?.sprVal ?? 0));
      b.soc.push(Number(r.content?.socVal ?? 0));
      b.fin.push(Number(r.content?.finVal ?? 0));
      b.phy.push(Number(r.content?.phyVal ?? 0));
    });
  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0);
  return Array.from(byDate.entries()).map(([date, b]) => ({
    date,
    Spirituelle: avg(b.spr),
    Sociale: avg(b.soc),
    Physique: avg(b.phy),
    Financière: avg(b.fin),
  }));
}

// Échelle de santé : choix parmi 5 niveaux (au lieu d'un curseur).
const RATINGS = [
  { v: 1, label: "Très mal" },
  { v: 2, label: "Mal" },
  { v: 3, label: "Moyen" },
  { v: 4, label: "Bien" },
  { v: 5, label: "Très bien" },
];
function RatingRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">{label}</label>
      <div className="grid grid-cols-5 gap-1.5">
        {RATINGS.map((r) => (
          <button
            key={r.v}
            type="button"
            onClick={() => onChange(r.v)}
            className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors active-scale ${value === r.v ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface BloomBusViewProps {
  members: Member[];
  reports: Report[];
  events?: Event[];
  onUpdateMember: (member: Member) => void;
  onAddReport: (report: Report) => void;
  onAddMember?: (member: Member) => void;
  activeBranch: Branch;
  simulatedRole: string;
  forms?: FormDef[];
  operator?: Member;
}

export default function BloomBusView({
  members,
  reports,
  events = [],
  onUpdateMember,
  onAddReport,
  onAddMember,
  activeBranch,
  simulatedRole,
  forms = [],
  operator,
}: BloomBusViewProps) {
  // Sélecteur de période KPI — même pattern que DepartmentsView (Semaine calendaire par défaut).
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const kpiPeriod: PeriodInput = period === "custom" && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;
  // P1.4 — labels read live from FormBuilder's fd_bus_sante FormDef, id-matched (not
  // position-matched) so reordering fields in the builder doesn't relabel the wrong value.
  const santeForm = forms.find((f) => f.id === "fd_bus_sante");
  const santeLabel = (fieldId: string, fallback: string) =>
    santeForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;
  const seedBus = useBusLines();
  // ponytail: local session state; persist via ./data at backend time.
  const [busLines, setBusLines] = useState<BloomBusEntity[]>(seedBus);
  useEffect(() => { save('bc_bus_lines', busLines); }, [busLines]);
  const [deletingBus, setDeletingBus] = useState<BloomBusEntity | null>(null);
  const deleteBusLine = (bus: BloomBusEntity) => {
    setBusLines((prev) => prev.filter((b) => b.id !== bus.id));
    // Casse le rattachement des membres orphelins (kpi.ts/completude.ts s'appuient sur
    // ce champ pour toute agrégation par bus — un id qui pointe dans le vide fausserait
    // silencieusement les KPI de leur nouveau bus par défaut).
    members.filter((m) => m.bloomBusId === bus.id).forEach((m) => onUpdateMember({ ...m, bloomBusId: undefined }));
    if (selectedLevel.type === "bus" && selectedLevel.id === bus.id) setSelectedLevel({ type: "root" });
  };

  // P4.4bis — hiérarchie/cloisonnement : le TITRE organisationnel (Ministre, Responsable
  // d'un autre département, etc.) ne donne aucun accès automatique. Seul le rôle réellement
  // occupé DANS Bloom Bus (lu dans le département spécial, pas dans le rôle organisationnel
  // résolu qui peut le masquer) détermine la portée ; seule exception : les pasteurs
  // (accès complet, cf. ./data/scope).
  const departments = useDepartments();
  const bloomBusRole = operator ? bloomBusRoleOf(operator, departments) : undefined;
  const hasFullBloomBusAccess = operator ? fullBloomBusAccess(operator, simulatedRole, departments) : false;
  // Un rapport saisi par un Capitaine (ou au-dessus) est validé d'office ; saisi par un membre
  // pour lui-même → « en attente » de validation du capitaine.
  const operatorAutoValidates = FULL_SCOPE_ROLES.includes(simulatedRole)
    || ["Capitaine de Bus", "Responsable de Zone", "Responsable de Commune", "Responsable"].includes(bloomBusRole ?? "");
  const visibleBusLines = operator
    ? busLines.filter((b) => busInScope(operator, b, simulatedRole, busLines, departments))
    : busLines;

  const ownBus = operator ? busLines.find((b) => b.id === operator.bloomBusId) : undefined;
  let defaultLevel: { type: "commune" | "zone" | "bus"; id: string } = { type: "commune", id: "Cocody" };
  let defaultCommune = "Cocody";
  let defaultZone = "Zone Est";
  const isOwnBusScoped = !hasFullBloomBusAccess &&
    bloomBusRole !== "Responsable de Zone" && bloomBusRole !== "Responsable de Commune";
  if (isOwnBusScoped && ownBus) {
    defaultLevel = { type: "bus", id: ownBus.id };
    defaultCommune = ownBus.commune;
    defaultZone = ownBus.zone;
  } else if (!hasFullBloomBusAccess && bloomBusRole === "Responsable de Zone" && ownBus) {
    defaultLevel = { type: "zone", id: ownBus.zone };
    defaultCommune = ownBus.commune;
    defaultZone = ownBus.zone;
  } else if (!hasFullBloomBusAccess && bloomBusRole === "Responsable de Commune") {
    const commune = ownBus?.commune ?? operator?.gps?.commune;
    if (commune) {
      defaultLevel = { type: "commune", id: commune };
      defaultCommune = commune;
      const communeBus = busLines.find((b) => b.commune === commune);
      if (communeBus) defaultZone = communeBus.zone;
    }
  }

  const [showAddBus, setShowAddBus] = useState(false);
  const [showDirectRegister, setShowDirectRegister] = useState(false);
  const [expandedCommunes, setExpandedCommunes] = useState<string[]>([
    defaultCommune,
  ]);
  const [expandedZones, setExpandedZones] = useState<string[]>([defaultZone]);
  const [selectedLevel, setSelectedLevel] = useState<
    { type: "root" } | { type: "commune" | "zone" | "bus"; id: string }
  >(defaultLevel);

  const [showMemberReportModal, setShowMemberReportModal] = useState(false);
  const [showLifeReportModal, setShowLifeReportModal] = useState(false);
  const [targetMemberId, setTargetMemberId] = useState<string>("");

  // Member health report — null tant que non renseigné (validation bloquante à la saisie).
  const [sprVal, setSprVal] = useState<number | null>(null);
  const [socVal, setSocVal] = useState<number | null>(null);
  const [finVal, setFinVal] = useState<number | null>(null);
  const [phyVal, setPhyVal] = useState<number | null>(null);
  const [culte, setCulte] = useState<string | null>(null);
  const [observation, setObservation] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [fillPopover, setFillPopover] = useState<string | null>(null);
  // Rapport d'activité ouvert en détail (liste « Rapports d'activité »).
  const [lifeDetail, setLifeDetail] = useState<Report | null>(null);

  const now = new Date();
  const { s1, s2 } = reportingWindow(now);

  const openMemberReport = (id: string) => {
    setTargetMemberId(id);
    setSprVal(null);
    setSocVal(null);
    setFinVal(null);
    setPhyVal(null);
    setCulte(null);
    setObservation("");
    setSelectedWeek("");
    setShowMemberReportModal(true);
  };

  // Life report
  const [activityName, setActivityName] = useState("");
  const [activityDay, setActivityDay] = useState("");
  const [description, setDescription] = useState("");
  const [activityObservation, setActivityObservation] = useState("");
  const [lifeReportTab, setLifeReportTab] = useState<"infos" | "observation">("infos");
  const [presenceList, setPresenceList] = useState<string[]>([]);
  const togglePresence = (id: string) =>
    setPresenceList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [soulsWon, setSoulsWon] = useState(0);

  // Grouping
  const busByCommune: Record<string, Record<string, BloomBusEntity[]>> = {};
  visibleBusLines.forEach((bus) => {
    if (!busByCommune[bus.commune]) busByCommune[bus.commune] = {};
    if (!busByCommune[bus.commune][bus.zone])
      busByCommune[bus.commune][bus.zone] = [];
    busByCommune[bus.commune][bus.zone].push(bus);
  });

  const toggleCommune = (c: string) =>
    setExpandedCommunes((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  const toggleZone = (z: string) =>
    setExpandedZones((prev) =>
      prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z],
    );

  let activeBuses: BloomBusEntity[] = [];
  if (selectedLevel.type === "root") {
    activeBuses = visibleBusLines;
  } else if (selectedLevel.type === "bus") {
    const b = visibleBusLines.find((b) => b.id === selectedLevel.id);
    if (b) activeBuses = [b];
  } else if (selectedLevel.type === "zone") {
    activeBuses = visibleBusLines.filter((b) => b.zone === selectedLevel.id);
  } else {
    activeBuses = visibleBusLines.filter(
      (b) => b.commune === selectedLevel.id,
    );
  }

  // §8 — le mode de carte reflète le niveau de drill-down : Bus -> membres, Zone ->
  // capitaines, Commune -> responsables de zone, Vue globale -> responsables de commune.
  const mapMode: TerritoryMapMode = selectedLevel.type === "bus" ? "members" : "leaders";
  // Position d'un responsable = son propre gps, repli sur le centre du bus qui l'ancre
  // territorialement (aucun capitaine/responsable de zone n'a nécessairement de gps saisi).
  const leaderPins: { id: string; name: string; lat: number; lng: number }[] = (() => {
    if (selectedLevel.type === "zone") {
      return activeBuses.flatMap((bus) => {
        const captain = members.find((m) => m.bloomBusId === bus.id && bloomBusRoleOf(m, departments) === "Capitaine de Bus");
        if (!captain) return [];
        const pos = captain.gps ?? { lat: bus.centerLat, lng: bus.centerLng };
        return [{ id: captain.id, name: `${captain.firstName} ${captain.lastName} (${bus.name})`, lat: pos.lat, lng: pos.lng }];
      });
    }
    if (selectedLevel.type === "commune") {
      const zones = Array.from(new Set(activeBuses.map((b) => b.zone)));
      return zones.flatMap((zone) => {
        const zoneBus = activeBuses.find((b) => b.zone === zone);
        const lead = members.find((m) => bloomBusRoleOf(m, departments) === "Responsable de Zone" && busLines.find((b) => b.id === m.bloomBusId)?.zone === zone);
        if (!lead || !zoneBus) return [];
        const pos = lead.gps ?? { lat: zoneBus.centerLat, lng: zoneBus.centerLng };
        return [{ id: lead.id, name: `${lead.firstName} ${lead.lastName} (${zone})`, lat: pos.lat, lng: pos.lng }];
      });
    }
    if (selectedLevel.type === "root") {
      const communes = Array.from(new Set(visibleBusLines.map((b) => b.commune)));
      return communes.flatMap((commune) => {
        const communeBus = visibleBusLines.find((b) => b.commune === commune);
        const lead = members.find((m) => bloomBusRoleOf(m, departments) === "Responsable de Commune" && (busLines.find((b) => b.id === m.bloomBusId)?.commune ?? m.gps?.commune) === commune);
        if (!lead || !communeBus) return [];
        const pos = lead.gps ?? { lat: communeBus.centerLat, lng: communeBus.centerLng };
        return [{ id: lead.id, name: `${lead.firstName} ${lead.lastName} (${commune})`, lat: pos.lat, lng: pos.lng }];
      });
    }
    return [];
  })();

  const busIds = activeBuses.map((b) => b.id);
  const busMembers = members.filter(
    (m) =>
      m.bloomBusId &&
      busIds.includes(m.bloomBusId) &&
      m.level !== "Nouveau" &&
      (activeBranch === "global" || m.branch === activeBranch), // étanchéité par branche §3
  );
  // Source unique des disques de remplissage + de la synthèse d'évolution : les membres réels
  // du Bloom Bus au niveau territorial affiché (bus → ses membres ; zone/commune/racine → tous
  // les membres des bus en portée). Le taux se recalcule à chaque remplissage/validation.
  const busMemberIds = busMembers.map((m) => m.id);
  const branchReports = reports.filter(
    (r) => activeBranch === "global" || r.targetBranch === activeBranch,
  );
  const moisson = moissonTotal(branchReports, kpiPeriod, new Date(), busIds);
  const visites = busVisitesTotal(branchReports, members, busIds, kpiPeriod);
  const presenceCulte = busPresenceCulteTotal(branchReports, members, busIds, kpiPeriod);
  const activitesTotal = busActivitesTotal(branchReports, busIds, kpiPeriod);
  const visitesPct = busMembers.length > 0 ? Math.min(100, Math.round((visites / busMembers.length) * 100)) : null;
  const presenceCultePct = busMembers.length > 0 ? Math.min(100, Math.round((presenceCulte / busMembers.length) * 100)) : null;

  const isHierarchicalOperator = !!operator && (hasFullBloomBusAccess || bloomBusRole === "Responsable de Zone" || bloomBusRole === "Responsable de Commune");
  // Le roster reflète le NIVEAU sélectionné (comme la carte, cf. leaderPins) et requête les
  // entités PROPRES à ce niveau — pas les subordonnés fixes de l'opérateur relabellisés :
  //   root    → Responsables de Commune (sur les bus visibles)
  //   commune → Responsables de Zone (des bus de cette commune)
  //   zone    → Capitaines de Bus (des bus de cette zone)
  //   bus     → membres du bus
  // Le scope est préservé : visibleBusLines/activeBuses sont déjà filtrés au périmètre de l'opérateur.
  const rosterMembers = (() => {
    if (selectedLevel.type === "bus") return busMembers;
    const wantRole = selectedLevel.type === "root" ? "Responsable de Commune"
      : selectedLevel.type === "commune" ? "Responsable de Zone"
      : "Capitaine de Bus"; // zone
    const scopeBusIds = new Set((selectedLevel.type === "root" ? visibleBusLines : activeBuses).map((b) => b.id));
    return members.filter((m) =>
      bloomBusRoleOf(m, departments) === wantRole
      && !!m.bloomBusId && scopeBusIds.has(m.bloomBusId)
      && (activeBranch === "global" || m.branch === activeBranch));
  })();
  const rosterTitle = selectedLevel.type === "bus" ? "Membres du Bus"
    : selectedLevel.type === "root" ? "Responsables de Commune"
    : selectedLevel.type === "commune" ? "Responsables de Zone"
    : "Capitaines de Bus"; // zone
  // Disques de remplissage + courbe : le niveau suit le remplissage des responsables du niveau
  // DIRECTEMENT inférieur (commune → resp. de zone, zone → capitaines, bus → membres du bus),
  // pas de tous les membres du périmètre — même ensemble que le roster.
  const rosterIds = rosterMembers.map((m) => m.id);
  // Rapports en attente de validation dans le roster (S-1 + S-2) — visible par le capitaine+.
  const rosterPendingCount = operatorAutoValidates
    ? rosterMembers.reduce((n, m) =>
        n + (memberWeekStatus(m.id, s1, branchReports) === "pending" ? 1 : 0)
          + (memberWeekStatus(m.id, s2, branchReports) === "pending" ? 1 : 0), 0)
    : 0;

  const canEdit = [
    "Pasteur",
    "Admin",
    "Responsable",
    "Coach",
    "Capitaine de Bus",
    "Super Admin",
    "Ministre",
    "Responsable de Zone",
    "Responsable de Commune",
  ].includes(simulatedRole);
  // ECRANS-PAR-ONGLET.md §5.3 — CRUD territorial (créer bus/zone/commune) réservé à l'Admin,
  // distinct de canEdit qui ne couvre que la saisie de rapport de suivi.
  const canAdminTerritory = ["Admin", "Super Admin"].includes(simulatedRole);
  // Enregistrement direct d'un membre (spec "responsables hiérarchiques Bloom Bus") —
  // Capitaine/Zone/Commune uniquement, hors procédure ADN "nouveau".
  const canRegisterMember = !!operator && !!onAddMember && canRegisterMemberViaBloomBus(operator, simulatedRole, departments);
  // Un Membre n'a accès qu'à son propre bus, sans les stats territoriales — seul son
  // propre rapport de santé spirituelle lui est ouvert (cf. rendu dédié plus bas). Basé sur
  // le rôle Bloom Bus réel, pas sur simulatedRole — un Ministre qui n'est que simple membre
  // de Bloom Bus doit être traité comme un Membre ici (le Capitaine, lui, garde le roster).
  const isMembre = isOwnBusScoped && bloomBusRole !== "Capitaine de Bus";

  // Nombre de membres par territoire (§5 — commune / zone / bus), pour l'arbre de la sidebar.
  const countForBusIds = (ids: string[]) =>
    members.filter(
      (m) => m.bloomBusId && ids.includes(m.bloomBusId) && m.level !== "Nouveau" && (activeBranch === "global" || m.branch === activeBranch),
    ).length;

  // Synthèse santé + évolution (§Accueil-1.3 / §5) — sur les membres du niveau territorial sélectionné.
  const busHealthReports = reports.filter(
    (r) => r.reportType === "rapport_bloom_bus_member" && busMembers.some((m) => m.id === r.content?.memberId) && (activeBranch === "global" || r.targetBranch === activeBranch),
  );
  // Toutes les synthèses ci-dessous suivent le sélecteur de période (semaine visée weekOf).
  const { from: hpFrom, to: hpTo } = periodRange(kpiPeriod);
  const periodBusHealthReports = busHealthReports.filter((r) => {
    const d = new Date(r.weekOf ?? weekId(r.date));
    return d >= hpFrom && d <= hpTo;
  });
  const busHealth = periodHealthLevels(busHealthReports, kpiPeriod);
  const busEvolutionData = healthEvolutionSeries(periodBusHealthReports);
  // Évolution du taux de remplissage : une valeur par semaine de la période sélectionnée,
  // sur les mêmes membres que les disques (responsables du niveau directement inférieur).
  const fillEvolutionData = mondaysInRange(hpFrom, hpTo).map((w) => ({
    week: weekLabel(w).replace("Semaine du ", ""),
    pct: membersFillRate(rosterIds, w, branchReports).pct,
  }));

  // Point mensuel des présences (§5) — une présence = un rapport de suivi membre déclarant un
  // culte ; agrégé par mois (mois du lundi de la semaine rapportée), sur le périmètre affiché.
  const monthlyPresence = (() => {
    const byMonth = new Map<string, Record<string, number>>();
    periodBusHealthReports.forEach((r) => {
      const culte = r.content?.culte;
      if (!culte) return;
      const month = (r.weekOf ?? weekId(r.date)).slice(0, 7);
      const bucket = byMonth.get(month) ?? {};
      bucket[culte] = (bucket[culte] ?? 0) + 1;
      byMonth.set(month, bucket);
    });
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6) // ponytail: 6 derniers mois suffisent à l'écran ; l'export Rapport couvre le reste
      .map(([month, counts]) => ({
        month,
        label: new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        counts,
        total: Object.values(counts).reduce((s, v) => s + v, 0),
      }));
  })();
  const CULTE_COLORS = ["bg-bc-green", "bg-bc-cerulean", "bg-bc-fushia"];

  // Rapports d'activité (rapport_bloom_bus_life) du périmètre affiché, les plus récents d'abord.
  const lifeReports = branchReports
    .filter((r) => r.reportType === "rapport_bloom_bus_life" && busIds.includes(r.content?.busId))
    .sort((a, b) => (b.content?.activityDay ?? b.date).localeCompare(a.content?.activityDay ?? a.date));

  const handleSaveMemberHealth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMemberId || !operator) return;
    const targetMember = members.find((m) => m.id === targetMemberId);
    if (!targetMember) return;
    if (!canFillReportFor(operator, targetMember, simulatedRole, members, busLines, departments)) return;
    // Re-check défensif — le bouton "Enregistrer" est déjà désactivé tant que ces champs manquent.
    if (!selectedWeek || sprVal == null || socVal == null || finVal == null || phyVal == null || !culte) return;
    // Verrou 24h : rempli et/ou validé → plus modifiable 24h après (le serveur refuse aussi).
    const existing = reportFor(targetMemberId, selectedWeek);
    if (existing && isBusReportLocked(existing)) {
      toast.error("Rapport verrouillé : plus modifiable 24h après remplissage/validation.");
      return;
    }
    const updated: Member = {
      ...targetMember,
      healthKPIs: {
        spirituel: sprVal,
        social: socVal,
        financier: finVal,
        physique: phyVal,
        presenceCulte: targetMember.healthKPIs?.presenceCulte || 3,
        presenceService: targetMember.healthKPIs?.presenceService || 3,
      },
    };
    onUpdateMember(updated);
    onAddReport({
      // id déterministe par membre + semaine : une correction/rattrapage de la même semaine
      // remplace le rapport (upsert dans handleAddReport) au lieu de créer un doublon.
      id: `rep_bus_mem_${targetMemberId}_${selectedWeek}`,
      authorId: operator.id,
      authorName: `${operator.firstName} ${operator.lastName}`,
      authorRole: simulatedRole,
      targetBranch: activeBranch,
      date: new Date().toISOString().split("T")[0],
      weekOf: selectedWeek,
      reportType: "rapport_bloom_bus_member",
      confidential: false,
      validated: operatorAutoValidates, // capitaine+ = validé ; membre = en attente
      // Ancre du verrou 24h : conserve l'horodatage du PREMIER remplissage (une correction
      // dans la fenêtre ne repousse pas l'échéance).
      filledAt: existing?.filledAt ?? new Date().toISOString(),
      validatedAt: operatorAutoValidates ? new Date().toISOString() : existing?.validatedAt,
      content: {
        memberId: targetMemberId,
        memberName: `${targetMember.firstName} ${targetMember.lastName}`,
        sprVal,
        socVal,
        finVal,
        phyVal,
        culte,
        observation: observation.trim() || undefined,
      },
    });
    setShowMemberReportModal(false);
  };

  // Rapport existant d'un (membre, semaine) — sert à l'afficher (lecture/validation).
  const reportFor = (memberId: string, week: string) =>
    branchReports.find((r) => r.reportType === "rapport_bloom_bus_member" && r.content?.memberId === memberId && (r.weekOf ?? weekId(r.date)) === week);

  // Le supérieur OUVRE le rapport déjà rempli par le membre (pour le lire), au lieu de valider à l'aveugle.
  const openValidateReport = (memberId: string, week: string) => {
    setTargetMemberId(memberId);
    setSelectedWeek(week); // → l'effet ci-dessous charge le contenu du rapport dans le formulaire
    setShowMemberReportModal(true);
  };

  // Validation effective : passe le rapport (membre, semaine) à validated:true, puis ferme.
  const handleValidateReport = (memberId: string, week: string) => {
    const r = reportFor(memberId, week);
    if (r) onAddReport({ ...r, validated: true, validatedAt: new Date().toISOString() });
    setShowMemberReportModal(false);
  };

  // Affiche le rapport RÉELLEMENT rempli par le membre : pré-remplit le formulaire avec le
  // contenu du (membre, semaine) sélectionné ; vierge s'il n'existe pas encore (saisie).
  useEffect(() => {
    if (!showMemberReportModal || !selectedWeek) return;
    const r = reportFor(targetMemberId, selectedWeek);
    setSprVal(r?.content?.sprVal ?? null);
    setSocVal(r?.content?.socVal ?? null);
    setFinVal(r?.content?.finVal ?? null);
    setPhyVal(r?.content?.phyVal ?? null);
    setCulte(r?.content?.culte ?? null);
    setObservation(r?.content?.observation ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberReportModal, selectedWeek, targetMemberId]);

  // Rapport de la semaine affichée en attente de validation ET l'opérateur peut valider (supérieur).
  const currentReport = selectedWeek ? reportFor(targetMemberId, selectedWeek) : undefined;
  const canValidateCurrent = !!currentReport && currentReport.validated === false
    && operatorAutoValidates && !!operator && targetMemberId !== operator.id;
  // Verrou 24h : le contenu n'est plus modifiable ; la validation (relecture) reste permise.
  const currentLocked = !!currentReport && isBusReportLocked(currentReport);

  const handleSaveLifeReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLevel.type !== "bus" || !operator) return; // rapport de vie = par bus uniquement
    onAddReport({
      id: `rep_bus_life_${Date.now()}`,
      authorId: operator.id,
      authorName: `${operator.firstName} ${operator.lastName}`,
      authorRole: simulatedRole,
      targetBranch: activeBranch,
      date: new Date().toISOString().split("T")[0],
      reportType: "rapport_bloom_bus_life",
      confidential: false,
      filledAt: new Date().toISOString(),
      content: {
        busId: selectedLevel.id,
        activityName,
        activityDay,
        description,
        observation: activityObservation.trim() || undefined,
        presenceList,
        soulsWon,
      },
    });
    setShowLifeReportModal(false);
    setActivityName("");
    setActivityDay("");
    setDescription("");
    setActivityObservation("");
    setLifeReportTab("infos");
    setPresenceList([]);
    setSoulsWon(0);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-full lg:overflow-hidden flex-1">
      {/* Sidebar / Accordion — le rendu "arbre territorial" (commune > zone > bus) doit rester
          réservé aux rôles dont la portée dépasse un seul bus (Responsable de Zone/Commune/
          département, pasteurs) : isOwnBusScoped, pas isMembre. Un Capitaine de Bus garde le
          roster/les stats de son bus dans le contenu principal (piloté par isMembre plus bas),
          mais ne doit pas voir la navigation par commune/zone qui laisse croire à un accès
          élargi alors que visibleBusLines le cantonne déjà à son seul bus. */}
      {isOwnBusScoped ? (
        <div className="w-full lg:w-72 bg-white rounded-[2rem] border border-bc-border shadow-sm p-4 flex flex-col shrink-0">
          <h3 className="font-ui font-bold text-bc-text mb-3 px-2">Mon Bloom Bus</h3>
          <div className="p-3 rounded-xl bg-bc-canvas border border-bc-border flex items-center gap-2">
            <Bus size={16} className="text-bc-green shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-bc-text truncate">{ownBus?.name ?? "—"}</p>
              {ownBus && <p className="text-[10px] text-bc-text-secondary truncate">{ownBus.commune} · {ownBus.zone}</p>}
            </div>
          </div>
        </div>
      ) : (
      <div className="w-full lg:w-72 bg-white rounded-[2rem] border border-bc-border shadow-sm p-4 flex flex-col shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="font-ui font-bold text-bc-text">Territoires Bloom</h3>
          {canAdminTerritory && (
            <button onClick={() => setShowAddBus(true)} title="Ajouter un bus" className="p-1.5 rounded-full bg-bc-green text-white hover:opacity-90 active-scale">
              <Plus size={14} />
            </button>
          )}
        </div>
        {FULL_SCOPE_ROLES.includes(simulatedRole) && (
          <button
            onClick={() => setSelectedLevel({ type: "root" })}
            className={`flex items-center gap-2 p-2 mb-2 rounded-xl cursor-pointer active-scale font-bold text-sm ${selectedLevel.type === "root" ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-bc-text-secondary"}`}
          >
            <Bus size={14} />
            Vue globale
          </button>
        )}
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-2">
          {Object.entries(busByCommune).map(([commune, zones]) => {
            const communeBusIds = Object.values(zones).flat().map((b) => b.id);
            const communeCount = countForBusIds(communeBusIds);
            return (
            <motion.div variants={staggerItem} key={commune} className="space-y-1">
              <div
                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer active-scale ${selectedLevel.type === "commune" && selectedLevel.id === commune ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-bc-text-secondary"}`}
                onClick={() => {
                  setSelectedLevel({ type: "commune", id: commune });
                  toggleCommune(commune);
                }}
              >
                <span className="font-bold text-sm flex items-center gap-2 min-w-0">
                  <span className="truncate">{commune}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${selectedLevel.type === "commune" && selectedLevel.id === commune ? "bg-white/20" : "bg-bc-canvas text-bc-text-secondary"}`}>
                    {communeCount}
                  </span>
                </span>
                {expandedCommunes.includes(commune) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>

              {expandedCommunes.includes(commune) && (
                <div className="pl-4 space-y-1">
                  {Object.entries(zones).map(([zone, buses]) => {
                    const zoneBusIds = buses.map((b) => b.id);
                    const zoneCount = countForBusIds(zoneBusIds);
                    return (
                    <div key={zone} className="space-y-1">
                      <div
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer active-scale ${selectedLevel.type === "zone" && selectedLevel.id === zone ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-bc-text-secondary"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLevel({ type: "zone", id: zone });
                          toggleZone(zone);
                        }}
                      >
                        <span className="font-bold text-xs flex items-center gap-2 min-w-0">
                          <span className="truncate">{zone}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${selectedLevel.type === "zone" && selectedLevel.id === zone ? "bg-white/20" : "bg-bc-canvas text-bc-text-secondary"}`}>
                            {zoneCount}
                          </span>
                        </span>
                        {expandedZones.includes(zone) ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </div>

                      {expandedZones.includes(zone) && (
                        <div className="pl-4 space-y-1">
                          {buses.map((bus) => {
                            const busCount = countForBusIds([bus.id]);
                            return (
                            <div
                              key={bus.id}
                              className={`flex items-center p-2 rounded-xl cursor-pointer active-scale ${selectedLevel.type === "bus" && selectedLevel.id === bus.id ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-bc-text-secondary"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLevel({ type: "bus", id: bus.id });
                              }}
                            >
                              <Bus size={12} className="mr-2 shrink-0" />
                              <span className="text-xs font-bold leading-tight flex-1 truncate">
                                {bus.name}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${selectedLevel.type === "bus" && selectedLevel.id === bus.id ? "bg-white/20" : "bg-white text-bc-text-secondary border border-bc-border"}`}>
                                {busCount}
                              </span>
                              {canAdminTerritory && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingBus(bus); }}
                                  className={`ml-1 p-1 rounded-lg shrink-0 transition-colors active-scale ${selectedLevel.type === "bus" && selectedLevel.id === bus.id ? "text-white/80 hover:text-white" : "text-bc-text-secondary hover:text-bc-danger"}`}
                                  title="Supprimer ce bus"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
            );
          })}
        </motion.div>
      </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pb-8">
        {/* Header Actions */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border flex flex-col md:flex-row gap-4 justify-between md:items-center shrink-0">
          <div>
            <h2 className="font-ui font-extrabold text-xl text-bc-text flex items-center gap-2">
              {selectedLevel.type === "root" && "Vue globale — Bloom Bus"}
              {selectedLevel.type === "commune" &&
                `Commune: ${selectedLevel.id}`}
              {selectedLevel.type === "zone" && `Zone: ${selectedLevel.id}`}
              {selectedLevel.type === "bus" &&
                `Bus: ${busLines.find((b) => b.id === selectedLevel.id)?.name}`}
            </h2>
            {!isMembre && (
              <p className="text-xs text-bc-text-secondary mt-1">
                {activeBuses.length} ligne(s) couverte(s) - {busMembers.length}{" "}
                membre(s) rattaché(s)
              </p>
            )}
          </div>
          {!isMembre && (
            <PeriodSelector
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
            />
          )}
        </div>

        {/* Dashboard Grid — statistiques territoriales, masquées pour un Membre */}
        {!isMembre && (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Moisson
              </span>
              <Users size={14} className="text-bc-text-secondary" />
            </div>
            <div className="text-3xl font-black text-bc-text">{moisson}</div>
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Nouveaux gagnés
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Visites
              </span>
              <Heart size={14} className="text-bc-text-secondary" />
            </div>
            <div className="text-3xl font-black text-bc-text">{visites}<span className="text-base font-bold text-bc-text-secondary">/{busMembers.length}</span></div>
            {visitesPct !== null && (
              <div className="flex h-2 w-full mt-2 rounded-full overflow-hidden bg-bc-canvas">
                <div className="bg-bc-cerulean transition-all duration-500 ease-out-spring" style={{ width: `${visitesPct}%` }} />
              </div>
            )}
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Visites / membres
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Présence Culte
              </span>
              <Users size={14} className="text-bc-text-secondary" />
            </div>
            <div className="text-3xl font-black text-bc-text">{presenceCulte}<span className="text-base font-bold text-bc-text-secondary">/{busMembers.length}</span></div>
            {presenceCultePct !== null && (
              <div className="flex h-2 w-full mt-2 rounded-full overflow-hidden bg-bc-canvas">
                <div className="bg-bc-cerulean transition-all duration-500 ease-out-spring" style={{ width: `${presenceCultePct}%` }} />
              </div>
            )}
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Dimanche / total membres
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Activités
              </span>
              <Sliders size={14} className="text-bc-text-secondary" />
            </div>
            <div className="text-3xl font-black text-bc-text">{activitesTotal}</div>
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Organisées
            </div>
          </div>
        </div>

        {/* Santé spirituelle du territoire — synthèse (smileys) + évolution (courbes) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
          <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <Heart size={16} /> Synthèse santé spirituelle
            </h3>
            {busMembers.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucun membre rattaché à ce niveau.</p>
            ) : (
              <div className="flex flex-col h-full justify-center space-y-4">
                <div className="grid grid-cols-4 gap-1 w-full text-center">
                  {BUS_HEALTH_AXES.map((axis) => {
                    // Niveau dominant des derniers rapports DE LA PÉRIODE (0 = pas de donnée).
                    const level = busHealth[axis.key as keyof typeof busHealth] ?? 0;
                    return (
                      <div key={axis.key} className="min-w-0">
                        <HealthSmiley value={level} size={26} />
                        <div className="text-[9px] sm:text-[10px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-[10px] text-bc-text-secondary">Niveau dominant par critère sur la période (sur {busMembers.length} membres)</p>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <TrendingUp size={16} /> Évolution des critères
            </h3>
            {busEvolutionData.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-6 flex-1 flex items-center justify-center">Pas encore assez de rapports de suivi pour tracer une courbe.</p>
            ) : (
              <div className="h-48 min-w-0">
                <ResponsiveChart height="100%" minHeight={150}>
                  <LineChart data={busEvolutionData}>
                    <XAxis dataKey="date" fontSize={9} axisLine={false} tickLine={false} />
                    <YAxis domain={[1, 5]} fontSize={9} axisLine={false} tickLine={false} width={20} />
                    <Tooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="Spirituelle" stroke="var(--accent-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Sociale" stroke="var(--accent-2)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Physique" stroke="var(--color-bc-purple)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Financière" stroke="var(--color-bc-text-secondary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveChart>
              </div>
            )}
          </div>
        </div>

        {/* Synthèse — évolution du taux de remplissage par semaine (mêmes données que les disques) */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col shrink-0">
          <h3 className="text-sm font-ui font-bold text-bc-text mb-1 flex items-center gap-2">
            <TrendingUp size={16} /> Évolution du remplissage
          </h3>
          <p className="text-[10px] text-bc-text-secondary mb-4">% de rapports remplis par semaine, sur la période{rosterIds.length ? ` — ${rosterTitle.toLowerCase()} (${rosterIds.length})` : ""}.</p>
          {fillEvolutionData.length === 0 ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-6 flex-1 flex items-center justify-center">Aucun rapport de membre à synthétiser pour l'instant.</p>
          ) : (
            <div className="h-48 min-w-0">
              <ResponsiveChart height="100%" minHeight={150}>
                <LineChart data={fillEvolutionData}>
                  <XAxis dataKey="week" fontSize={9} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} fontSize={9} axisLine={false} tickLine={false} width={28} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 11 }} formatter={(v) => [`${v}%`, "Remplissage"]} />
                  <Line type="monotone" dataKey="pct" name="Remplissage" stroke="var(--accent-1)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveChart>
            </div>
          )}
        </div>

        {/* Point mensuel des présences — total par mois + répartition par culte */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col shrink-0">
          <h3 className="text-sm font-ui font-bold text-bc-text mb-1 flex items-center gap-2">
            <CalendarDays size={16} /> Point mensuel des présences
          </h3>
          <p className="text-[10px] text-bc-text-secondary mb-4">Présences au culte déclarées dans les rapports de suivi, mois par mois.</p>
          {monthlyPresence.length === 0 ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucune présence déclarée pour l'instant.</p>
          ) : (
            <>
              <div className="space-y-3">
                {monthlyPresence.map((m) => (
                  <div key={m.month}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-bc-text capitalize">{m.label}</span>
                      <span className="text-xs font-bold text-bc-text tabular-nums">{m.total} présence{m.total > 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-bc-canvas">
                      {CULTE_OPTIONS.map((c, i) => {
                        const v = m.counts[c] ?? 0;
                        return v > 0 ? (
                          <div key={c} className={`${CULTE_COLORS[i]} transition-all ease-out-spring`} style={{ width: `${(v / m.total) * 100}%` }} />
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
                {CULTE_OPTIONS.map((c, i) => (
                  <span key={c} className="flex items-center gap-1.5 text-[10px] text-bc-text-secondary font-medium">
                    <span className={`w-2 h-2 rounded-full ${CULTE_COLORS[i]}`} /> {CULTE_SLOT_SHORT[c] ?? c}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Rapports d'activité remplis dans les bus du périmètre — consultables au clic */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col shrink-0">
          <h3 className="text-sm font-ui font-bold text-bc-text mb-1 flex items-center gap-2">
            <ClipboardList size={16} /> Rapports d'activité
          </h3>
          <p className="text-[10px] text-bc-text-secondary mb-3">Toutes les activités déclarées par les bus du niveau affiché.</p>
          {lifeReports.length === 0 ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-4">Aucun rapport d'activité sur ce périmètre.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {lifeReports.map((r) => {
                const bus = seedBus.find((b: { id: string }) => b.id === r.content?.busId);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setLifeDetail(r)}
                    className="w-full text-left p-3 rounded-2xl border border-bc-border hover:border-bc-green bg-white transition-colors flex items-center justify-between gap-2 active-scale"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-bc-text truncate">{r.content?.activityName || "Rapport d'activité"}</p>
                      <p className="text-[10px] text-bc-text-secondary truncate">
                        {(bus as any)?.name ?? r.content?.busId} · {new Date(`${r.content?.activityDay ?? r.date}T12:00:00`).toLocaleDateString('fr-FR')} · {r.authorName}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-bc-green tabular-nums">{Number(r.content?.soulsWon ?? 0)} âme(s)</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {/* Map & List Split */}
        <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-[400px]">
          {/* MAP */}
          <div className="flex-1 bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <MapIcon size={16} /> Carte Territoriale (OpenStreetMap)
            </h3>
            <div className="flex-1 bg-bc-canvas border border-bc-border rounded-2xl relative overflow-hidden min-h-[300px]">
              <TerritoryMap
                mode={mapMode}
                members={mapMode === "members" ? busMembers : undefined}
                leaders={mapMode === "leaders" ? leaderPins : undefined}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {activeBuses.map((bus) => (
                <span key={bus.id} className="inline-flex items-center gap-1 text-[10px] font-bold text-bc-text bg-white border border-bc-border rounded-full px-2 py-1">
                  <Bus size={11} className="text-bc-green" /> {bus.name}
                </span>
              ))}
            </div>
          </div>

          {/* Right column: action widget + member list, stacked above one another */}
          <div className="w-full xl:w-80 flex flex-col gap-6">
          {/* Member List (only shown when bus is selected) */}
          {selectedLevel.type === "bus" && isMembre && (
            <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col items-center justify-center text-center gap-3">
              <Heart size={28} className="text-bc-green" />
              <h3 className="text-sm font-ui font-bold text-bc-text">Mon rapport de santé spirituelle</h3>
              <p className="text-xs text-bc-text-secondary">Un rapport par semaine (S-1 ou S-2), rempli par toi ou ton capitaine.</p>
              <button
                onClick={() => { if (operator) openMemberReport(operator.id); }}
                className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors active-scale"
              >
                Remplir mon rapport
              </button>
            </div>
          )}
          {(selectedLevel.type === "bus" || isHierarchicalOperator) && !isMembre && operator && (bloomBusRole || (canEdit && selectedLevel.type === "bus")) && (
            <div className="bg-white p-4 rounded-[2rem] border border-bc-border shadow-sm flex gap-3">
              {bloomBusRole && (
                <button
                  onClick={() => openMemberReport(operator.id)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-bc-cerulean/10 text-bc-cerulean font-bold hover:bg-bc-cerulean/20 transition-colors active-scale"
                  title="Remplir mon propre rapport de santé spirituelle"
                >
                  <Heart size={20} />
                  <span className="text-xs">Mon rapport</span>
                </button>
              )}
              {canEdit && selectedLevel.type === "bus" && (
                <button
                  onClick={() => { setLifeReportTab("infos"); setShowLifeReportModal(true); }}
                  className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-bc-green/10 text-bc-green font-bold hover:bg-bc-green/20 transition-colors active-scale"
                  title="Rapport d'activité du bus (Capitaine)"
                >
                  <Sliders size={20} />
                  <span className="text-xs">Rapport d'activité</span>
                </button>
              )}
            </div>
          )}
          {(selectedLevel.type === "bus" || isHierarchicalOperator) && !isMembre && (
            // max-h borne le panneau → la liste interne (flex-1 overflow-y-auto) défile
            // au lieu d'allonger la page quand les membres sont nombreux.
            <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-ui font-bold text-bc-text">{rosterTitle}</h3>
                  {rosterPendingCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bc-warning/15 text-bc-warning" title="Rapports en attente de votre validation">
                      {rosterPendingCount} à valider
                    </span>
                  )}
                </div>
                {canRegisterMember && (
                  <button
                    id="bloombus-add-member-btn"
                    onClick={() => setShowDirectRegister(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-bc-green text-white text-[10px] font-bold active:scale-95 transition-transform"
                  >
                    <Plus size={12} /> Ajouter un membre
                  </button>
                )}
              </div>
              <p className="text-[10px] text-bc-text-secondary mb-3">Clique un membre pour faire son rapport de suivi.</p>
              {/* §6-7 — disques de remplissage cliquables : taux RÉEL des membres du Bloom Bus au
                  niveau affiché (membersFillRate sur les responsables du niveau directement
                  inférieur — rosterIds), identique à tous les niveaux.
                  Se recalcule dès qu'un rapport est rempli (en attente) ou validé. */}
              {operator && rosterIds.length > 0 && (
                <div className="flex items-center gap-4 mb-3 px-1 pb-3 border-b border-bc-border">
                  {([s2, s1] as const).map((w) => {
                    const rate = membersFillRate(rosterIds, w, branchReports);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setFillPopover(fillPopover === w ? null : w)}
                        className="flex items-center gap-2 active-scale"
                        title="Voir le remplissage des membres du Bloom Bus"
                      >
                        <Ring value={rate.pct} total={100} color={rate.missing.length === 0 && rate.pending.length === 0 ? "var(--color-bc-success)" : rate.pct > 0 ? "var(--color-bc-warning)" : "var(--color-bc-danger)"} size={28} onClick={() => setFillPopover(fillPopover === w ? null : w)} />
                        <span className="text-[10px] font-bold text-bc-text-secondary text-left">
                          {weekLabel(w)}<br />{rate.pct}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {operator && fillPopover && rosterIds.length > 0 && (() => {
                const rate = membersFillRate(rosterIds, fillPopover, branchReports);
                const nameOf = (id: string) => { const m = members.find((mm) => mm.id === id); return m ? `${m.firstName} ${m.lastName}` : id; };
                return (
                  <div className="mb-3 p-3 bg-bc-canvas border border-bc-border rounded-xl text-[11px] space-y-2">
                    <p className="font-bold text-bc-text">{weekLabel(fillPopover)} — {rate.pct}% rempli</p>
                    {rate.validated.length > 0 && (
                      <p><span className="text-bc-success font-bold">✓ Validés :</span> {rate.validated.map(nameOf).join(", ")}</p>
                    )}
                    {rate.pending.length > 0 && (
                      <p><span className="text-bc-warning font-bold">◔ En attente :</span> {rate.pending.map(nameOf).join(", ")}</p>
                    )}
                    {rate.missing.length > 0 && (
                      <p><span className="text-bc-danger font-bold">✗ Manquants :</span> {rate.missing.map(nameOf).join(", ")}</p>
                    )}
                  </div>
                );
              })()}
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {rosterMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-bc-text-secondary font-bold">
                      Aucun membre rattaché à ce bus.
                    </p>
                  </div>
                ) : (
                  rosterMembers.map((m) => {
                    const editable = !!operator && canFillReportFor(operator, m, simulatedRole, members, busLines, departments);
                    return (
                      <div
                        key={m.id}
                        className="w-full p-3 bg-bc-canvas border border-bc-border rounded-xl flex items-center gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => { if (editable) openMemberReport(m.id); }}
                          disabled={!editable}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity disabled:cursor-default active-scale"
                        >
                          <Avatar
                            src={m.avatarUrl}
                            initials={`${m.firstName[0]}${m.lastName[0]}`}
                            size="sm"
                            className="w-10 h-10 bg-white border border-bc-border text-bc-text text-xs shadow-sm shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-bc-text truncate">
                              {m.firstName} {m.lastName}
                            </p>
                            <p className="text-[10px] text-bc-text-secondary">{m.phone}</p>
                          </div>
                          {editable && <Heart size={14} className="text-bc-green shrink-0" />}
                        </button>
                        <ReportStatusBoxes
                          memberId={m.id}
                          reports={branchReports}
                          now={now}
                          onValidate={operatorAutoValidates ? (week) => openValidateReport(m.id, week) : undefined}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Détail d'un rapport d'activité — supporte le schéma courant et l'ancien (seed). */}
      {lifeDetail && (
        <Modal open={true} onClose={() => setLifeDetail(null)} title={lifeDetail.content?.activityName || "Rapport d'activité"} maxWidth="max-w-md">
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-bc-canvas border border-bc-border">
              <span className="block text-[10px] font-bold uppercase text-bc-text-secondary">Bus</span>
              <span className="font-bold text-bc-text">{(seedBus.find((b: { id: string }) => b.id === lifeDetail.content?.busId) as any)?.name ?? lifeDetail.content?.busId}</span>
              <span className="block text-[10px] text-bc-text-secondary mt-0.5">
                {new Date(`${lifeDetail.content?.activityDay ?? lifeDetail.date}T12:00:00`).toLocaleDateString('fr-FR')} — {lifeDetail.authorName} ({lifeDetail.authorRole})
              </span>
            </div>
            {lifeDetail.content?.description && (
              <div>
                <span className="block text-[10px] font-bold uppercase text-bc-text-secondary mb-1">Description</span>
                <p className="text-bc-text">{lifeDetail.content.description}</p>
              </div>
            )}
            {lifeDetail.content?.observation && (
              <div>
                <span className="block text-[10px] font-bold uppercase text-bc-text-secondary mb-1">Observation</span>
                <p className="text-bc-text">{lifeDetail.content.observation}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-bc-border text-center">
                <span className="block text-xl font-black text-bc-text tabular-nums">{Number(lifeDetail.content?.soulsWon ?? 0)}</span>
                <span className="block text-[10px] font-bold text-bc-text-secondary">Âmes gagnées</span>
              </div>
              <div className="p-3 rounded-xl border border-bc-border text-center">
                <span className="block text-xl font-black text-bc-text tabular-nums">
                  {Array.isArray(lifeDetail.content?.presenceList) ? lifeDetail.content.presenceList.length : Number(lifeDetail.content?.mobilised ?? 0)}
                </span>
                <span className="block text-[10px] font-bold text-bc-text-secondary">Membres présents</span>
              </div>
            </div>
            {Array.isArray(lifeDetail.content?.presenceList) && lifeDetail.content.presenceList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lifeDetail.content.presenceList.map((id: string) => {
                  const m = members.find((x) => x.id === id);
                  return <span key={id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bc-canvas border border-bc-border text-bc-text">{m ? `${m.firstName} ${m.lastName}` : id}</span>;
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modals */}
      {showMemberReportModal && (
        <Modal open={showMemberReportModal} onClose={() => setShowMemberReportModal(false)} title={canValidateCurrent ? "Valider le rapport du membre" : "Suivi Spirituel Membre"} maxWidth="max-w-md">
            <p className="text-xs text-bc-text-secondary mb-6">
              {canValidateCurrent ? "Rapport rempli par le membre — relisez-le puis validez." : "Évaluez la santé spirituelle (Rapport hebdomadaire)."}
            </p>
            <form onSubmit={handleSaveMemberHealth} className="space-y-5">
              <div className="p-3 rounded-xl bg-bc-canvas border border-bc-border">
                <span className="text-[10px] text-bc-text-secondary font-bold uppercase block">Membre évalué</span>
                <span className="text-sm font-bold text-bc-text">
                  {(() => { const t = members.find((m) => m.id === targetMemberId); return t ? `${t.firstName} ${t.lastName}` : "—"; })()}
                </span>
              </div>

              {canValidateCurrent && (
                <div className="p-3 rounded-xl bg-bc-warning/10 border border-bc-warning/30 text-[11px] text-bc-text">
                  Rapport <strong>rempli par le membre</strong>, en attente de votre validation. Relisez les valeurs ci-dessous puis cliquez <strong>Valider</strong>.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">Semaine concernée</label>
                <div className="grid grid-cols-2 gap-2">
                  {[s2, s1].map((w) => {
                    const already = branchReports.some(
                      (r) => r.reportType === "rapport_bloom_bus_member" && r.content?.memberId === targetMemberId && (r.weekOf ?? weekId(r.date)) === w,
                    );
                    const weekReport = branchReports.find(
                      (r) => r.reportType === "rapport_bloom_bus_member" && r.content?.memberId === targetMemberId && (r.weekOf ?? weekId(r.date)) === w,
                    );
                    const weekLocked = !!weekReport && isBusReportLocked(weekReport);
                    return (
                      <button
                        type="button"
                        key={w}
                        onClick={() => setSelectedWeek(w)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-colors active-scale text-center ${selectedWeek === w ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas"}`}
                      >
                        {weekLabel(w)}
                        {already && <span className="block text-[9px] font-normal opacity-80 mt-0.5">{weekLocked ? "déjà rempli · verrouillé" : "déjà rempli"}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <RatingRow label={santeLabel("f0", "Spiritualité")} value={sprVal} onChange={setSprVal} />
                <RatingRow label={santeLabel("f1", "Social")} value={socVal} onChange={setSocVal} />
                <RatingRow label={santeLabel("f2", "Physique")} value={phyVal} onChange={setPhyVal} />
                <RatingRow label={santeLabel("f3", "Financier")} value={finVal} onChange={setFinVal} />
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">Présence au culte</label>
                  <div className="flex flex-wrap gap-2">
                    {/* Libellé = nom réel du culte de la semaine sélectionnée (nommage par rang du dimanche). */}
                    {CULTE_OPTIONS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setCulte(c)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${culte === c ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text border-bc-border"}`}
                      >
                        {culteSlotLabel(c, selectedWeek || undefined)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">Observation (optionnel)</label>
                  <textarea
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    className="w-full p-3 border border-bc-border rounded-xl text-sm font-medium h-20 bg-bc-canvas focus:bg-white focus:outline-none resize-none"
                    placeholder="Remarques, points d'attention…"
                  />
                </div>
              </div>
              {currentLocked && (
                <div className="p-3 rounded-xl bg-bc-danger/10 border border-bc-danger/30 text-[11px] text-bc-text">
                  Rapport <strong>verrouillé</strong> : plus de 24h se sont écoulées depuis son remplissage/validation, il n'est plus modifiable.
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMemberReportModal(false)}
                  className="px-5 py-2.5 bg-bc-canvas text-bc-text-secondary rounded-full text-xs font-bold hover:bg-bc-border/40 transition-colors active-scale"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={currentLocked || !selectedWeek || sprVal == null || socVal == null || finVal == null || phyVal == null || !culte}
                  className={`px-5 py-2.5 rounded-full text-xs font-bold transition-colors active-scale disabled:opacity-40 disabled:cursor-not-allowed ${canValidateCurrent ? "bg-bc-canvas text-bc-text-secondary hover:bg-bc-border/40" : "bg-bc-green text-white hover:opacity-90"}`}
                >
                  {canValidateCurrent ? "Corriger" : "Enregistrer"}
                </button>
                {canValidateCurrent && (
                  <button
                    type="button"
                    onClick={() => handleValidateReport(targetMemberId, selectedWeek)}
                    className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors active-scale"
                  >
                    Valider
                  </button>
                )}
              </div>
            </form>
        </Modal>
      )}

      {showLifeReportModal && (
        <Modal open={showLifeReportModal} onClose={() => setShowLifeReportModal(false)} title="Rapport d'Activité Bus" maxWidth="max-w-md">
            <form onSubmit={handleSaveLifeReport} className="space-y-4">
              <div className="flex gap-2">
                {([
                  { id: "infos" as const, label: "Détails" },
                  { id: "observation" as const, label: "Observation" },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLifeReportTab(tab.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold active-scale transition-colors ${lifeReportTab === tab.id ? "bg-bc-green text-white" : "text-bc-text-secondary hover:bg-bc-canvas"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {lifeReportTab === "infos" && (
              <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Nom de l'activité
                  </label>
                  <input
                    type="text"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={activityDay}
                    onChange={(e) => setActivityDay(e.target.value)}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Âmes gagnées
                  </label>
                  <input
                    type="number"
                    value={soulsWon}
                    onChange={(e) => setSoulsWon(Number(e.target.value))}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                  Membres présents
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {busMembers.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => togglePresence(m.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${presenceList.includes(m.id) ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text border-bc-border"}`}
                    >
                      {m.firstName} {m.lastName}
                    </button>
                  ))}
                  {busMembers.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun membre dans ce bus.</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                  Brève description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={220}
                  placeholder="Résumé en quelques mots…"
                  className="w-full p-3 border border-bc-border rounded-xl text-sm font-medium h-16 bg-bc-canvas focus:bg-white focus:outline-none resize-none"
                />
              </div>
              </>
              )}

              {lifeReportTab === "observation" && (
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Observation (optionnel)
                  </label>
                  <textarea
                    value={activityObservation}
                    onChange={(e) => setActivityObservation(e.target.value)}
                    className="w-full p-3 border border-bc-border rounded-xl text-sm font-medium h-32 bg-bc-canvas focus:bg-white focus:outline-none resize-none"
                    placeholder="Remarques, points d'attention…"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLifeReportModal(false)}
                  className="px-5 py-2.5 bg-bc-canvas text-bc-text-secondary rounded-full text-xs font-bold hover:bg-bc-border/40 transition-colors active-scale"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors active-scale"
                >
                  Enregistrer
                </button>
              </div>
            </form>
        </Modal>
      )}

      {showAddBus && (
        <AddBusModal
          busLines={busLines}
          onClose={() => setShowAddBus(false)}
          onAdd={(bus) => {
            setBusLines((prev) => [...prev, bus]);
            setShowAddBus(false);
          }}
        />
      )}

      {showDirectRegister && operator && onAddMember && (
        <MemberFormModal
          open={showDirectRegister}
          member={null}
          onClose={() => setShowDirectRegister(false)}
          onAdd={(m) => { onAddMember(m); setShowDirectRegister(false); }}
          onUpdate={() => {}}
          existingMembers={members}
          departments={departments}
          busLines={busLines}
          activeBranch={activeBranch}
          simulatedRole={simulatedRole}
          forms={forms}
          operator={operator}
          directBloomBusRegistration
        />
      )}

      <ConfirmDialog
        open={!!deletingBus}
        onCancel={() => setDeletingBus(null)}
        onConfirm={() => { if (deletingBus) deleteBusLine(deletingBus); }}
        title="Supprimer ce bus"
        message={deletingBus ? `Le bus "${deletingBus.name}" sera définitivement supprimé. Les membres qui y sont rattachés seront détachés. Cette action est irréversible.` : ""}
        confirmLabel="Supprimer"
      />
    </div>
  );
}

const NEW_OPTION = "__new__";

function AddBusModal({ busLines, onClose, onAdd }: { busLines: BloomBusEntity[]; onClose: () => void; onAdd: (b: BloomBusEntity) => void }) {
  // Chaque bus porte sa propre paire commune+zone (pas d'entité Zone séparée avec une
  // commune parente unique) : une zone n'est donc pas exclusive à une seule commune,
  // toutes deux sont de simples listes de valeurs déjà utilisées dans l'app.
  const communes = Array.from(new Set(busLines.map((b) => b.commune))).sort();
  const zones = Array.from(new Set(busLines.map((b) => b.zone))).sort();

  const [name, setName] = useState("");
  const [commune, setCommune] = useState(communes[0] ?? NEW_OPTION);
  const [newCommune, setNewCommune] = useState("");
  const effectiveCommune = commune === NEW_OPTION ? newCommune.trim() : commune;

  const [zone, setZone] = useState(zones[0] ?? NEW_OPTION);
  const [newZone, setNewZone] = useState("");
  const effectiveZone = zone === NEW_OPTION ? newZone.trim() : zone;

  const [lat, setLat] = useState("5.35");
  const [lng, setLng] = useState("-4.02");

  const submit = () => {
    if (!name.trim() || !effectiveCommune || !effectiveZone) return;
    onAdd({
      id: `bus_${Date.now()}`,
      name: name.trim(),
      commune: effectiveCommune,
      zone: effectiveZone,
      centerLat: parseFloat(lat) || 5.35,
      centerLng: parseFloat(lng) || -4.02,
    });
  };

  return (
    <Modal open={true} onClose={onClose} title="Ajouter un bus" maxWidth="max-w-md">
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du bus" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">Commune</label>
            <select value={commune} onChange={(e) => setCommune(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green bg-white">
              {communes.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value={NEW_OPTION}>+ Nouvelle commune…</option>
            </select>
            {commune === NEW_OPTION && (
              <input value={newCommune} onChange={(e) => setNewCommune(e.target.value)} placeholder="Nom de la nouvelle commune" className="w-full mt-2 border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">Zone</label>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green bg-white">
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              <option value={NEW_OPTION}>+ Nouvelle zone…</option>
            </select>
            {zone === NEW_OPTION && (
              <input value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder="Nom de la nouvelle zone" className="w-full mt-2 border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">Centre — Latitude</label>
              <input value={lat} onChange={(e) => setLat(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">Centre — Longitude</label>
              <input value={lng} onChange={(e) => setLng(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
            </div>
          </div>
        </div>
        <button onClick={submit} disabled={!name.trim() || !effectiveCommune || !effectiveZone} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40 active-scale">
          Ajouter le bus
        </button>
    </Modal>
  );
}
