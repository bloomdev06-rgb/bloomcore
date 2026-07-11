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
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Member, Branch, BloomBusEntity, Report, Event, FormDef } from "../types";
import { useBusLines, useDepartments, save } from "../data";
import { busInScope, bloomBusRoleOf, fullBloomBusAccess, canFillReportFor, directReportsOf, canRegisterMemberViaBloomBus, FULL_SCOPE_ROLES } from "../data/scope";
import { moissonTotal, busVisitesTotal, busPresenceCulteTotal, busActivitesTotal, dominantHealthLevel, Period, PeriodInput } from "../data/kpi";
import { reportingWindow, weekId, weekLabel } from "../data/week";
import { memberReportStatus, subordinateFillRate, rosterFillDetail } from "../data/completude";
import { ResponsiveChart } from "./ui/ResponsiveChart";
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

const CULTE_OPTIONS = ["1er culte Bloom Church", "2e culte Bloom Church", "Culte Bloom Light"] as const;

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
  const branchReports = reports.filter(
    (r) => activeBranch === "global" || r.targetBranch === activeBranch,
  );
  const moisson = moissonTotal(branchReports, kpiPeriod, new Date(), busIds);
  const visites = busVisitesTotal(branchReports, members, busIds, kpiPeriod);
  const presenceCulte = busPresenceCulteTotal(branchReports, members, busIds, kpiPeriod);
  const activitesTotal = busActivitesTotal(branchReports, busIds, kpiPeriod);
  const visitesPct = busMembers.length > 0 ? Math.min(100, Math.round((visites / busMembers.length) * 100)) : null;
  const presenceCultePct = busMembers.length > 0 ? Math.min(100, Math.round((presenceCulte / busMembers.length) * 100)) : null;

  // §6-7 — au-delà de Capitaine de Bus, le roster de saisie n'est plus "les membres du
  // bus" mais les subordonnés directs (directReportsOf gère déjà chaque palier).
  const isHierarchicalOperator = !!operator && (hasFullBloomBusAccess || bloomBusRole === "Responsable de Zone" || bloomBusRole === "Responsable de Commune");
  const rosterMembers = isHierarchicalOperator && operator
    ? directReportsOf(operator, simulatedRole, members, busLines, departments)
    : busMembers;
  const rosterTitle = !isHierarchicalOperator
    ? "Membres du Bus"
    : bloomBusRole === "Responsable de Zone" ? "Mes Capitaines de Bus"
    : bloomBusRole === "Responsable de Commune" ? "Mes Responsables de Zone"
    : "Mes Responsables de Commune"; // Responsable (dept-lead) ou accès complet (Pasteur/Admin)
  // La complétude (anneau) d'un Capitaine ne doit compter que les membres pour qui il PEUT
  // remplir un rapport (directReportsOf) : sinon un autre capitaine/lead rattaché au même bus,
  // non remplissable, reste éternellement "incomplet" et l'anneau n'atteint jamais 100 %.
  const fillableRosterIds = operator && !isHierarchicalOperator
    ? directReportsOf(operator, simulatedRole, members, busLines, departments).map((m) => m.id)
    : rosterMembers.map((m) => m.id);

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
  const busEvolutionData = healthEvolutionSeries(busHealthReports);

  // Évolution personnelle du membre ouvert dans la modale de suivi.
  const memberHealthReports = reports.filter(
    (r) => r.reportType === "rapport_bloom_bus_member" && r.content?.memberId === targetMemberId && (activeBranch === "global" || r.targetBranch === activeBranch),
  );
  const memberEvolutionData = healthEvolutionSeries(memberHealthReports);

  const handleSaveMemberHealth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMemberId || !operator) return;
    const targetMember = members.find((m) => m.id === targetMemberId);
    if (!targetMember) return;
    if (!canFillReportFor(operator, targetMember, simulatedRole, members, busLines, departments)) return;
    // Re-check défensif — le bouton "Enregistrer" est déjà désactivé tant que ces champs manquent.
    if (!selectedWeek || sprVal == null || socVal == null || finVal == null || phyVal == null || !culte) return;
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
            <div className="flex items-center gap-2">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="bg-white border border-bc-border text-bc-text rounded-full px-4 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-bc-green cursor-pointer"
              >
                <option value="week">Cette Semaine</option>
                <option value="month">Ce Mois</option>
                <option value="quarter">Ce Trimestre</option>
                <option value="year">Cette Année</option>
                <option value="custom">Personnalisé</option>
              </select>
              {period === "custom" && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-white border border-bc-border text-bc-text rounded-full px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-bc-green cursor-pointer" />
                  <span className="text-bc-text-secondary text-xs">→</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-white border border-bc-border text-bc-text rounded-full px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-bc-green cursor-pointer" />
                </div>
              )}
            </div>
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
                    const level = dominantHealthLevel(busMembers, axis.key);
                    return (
                      <div key={axis.key} className="min-w-0">
                        <HealthSmiley value={level} size={26} />
                        <div className="text-[9px] sm:text-[10px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-[10px] text-bc-text-secondary">Niveau dominant par critère (sur {busMembers.length} membres)</p>
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
            <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-ui font-bold text-bc-text">{rosterTitle}</h3>
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
              {/* §6-7 — disque de remplissage cliquable, visible à tous les niveaux avec un
                  roster : subordinateFillRate (a-t-il rempli SES subordonnés) au-delà du bus,
                  rosterFillDetail (a-t-il un rapport direct) au niveau bus/Capitaine. */}
              {operator && rosterMembers.length > 0 && (
                <div className="flex items-center gap-4 mb-3 px-1 pb-3 border-b border-bc-border">
                  {([s2, s1] as const).map((w) => {
                    const rate = isHierarchicalOperator
                      ? subordinateFillRate(operator, simulatedRole, members, branchReports, busLines, departments, w)
                      : rosterFillDetail(fillableRosterIds, w, branchReports);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setFillPopover(fillPopover === w ? null : w)}
                        className="flex items-center gap-2 active-scale"
                        title="Voir qui a complété son roster"
                      >
                        <Ring value={rate.pct} total={100} color={rate.pct === 100 ? "var(--color-bc-success)" : rate.pct > 0 ? "var(--color-bc-warning)" : "var(--color-bc-danger)"} size={28} onClick={() => setFillPopover(fillPopover === w ? null : w)} />
                        <span className="text-[10px] font-bold text-bc-text-secondary text-left">
                          {weekLabel(w)}<br />{rate.pct}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {operator && fillPopover && (() => {
                const rate = isHierarchicalOperator
                  ? subordinateFillRate(operator, simulatedRole, members, branchReports, busLines, departments, fillPopover)
                  : rosterFillDetail(rosterMembers.map((m) => m.id), fillPopover, branchReports);
                const nameOf = (id: string) => { const m = members.find((mm) => mm.id === id); return m ? `${m.firstName} ${m.lastName}` : id; };
                return (
                  <div className="mb-3 p-3 bg-bc-canvas border border-bc-border rounded-xl text-[11px] space-y-2">
                    <p className="font-bold text-bc-text">{weekLabel(fillPopover)}</p>
                    {rate.filled.length > 0 && (
                      <p><span className="text-bc-success font-bold">✓ Complet :</span> {rate.filled.map(nameOf).join(", ")}</p>
                    )}
                    {rate.missing.length > 0 && (
                      <p><span className="text-bc-danger font-bold">✗ Incomplet :</span> {rate.missing.map(nameOf).join(", ")}</p>
                    )}
                    {rate.filled.length === 0 && rate.missing.length === 0 && (
                      <p className="text-bc-text-secondary italic">{isHierarchicalOperator ? "Aucun subordonné." : "Aucun membre."}</p>
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
                    const status = memberReportStatus(m.id, branchReports, now);
                    const statusDot = status === "green" ? "bg-bc-success" : status === "orange" ? "bg-bc-warning" : "bg-bc-danger";
                    return (
                      <button
                        key={m.id}
                        onClick={() => { if (editable) openMemberReport(m.id); }}
                        disabled={!editable}
                        className="w-full text-left p-3 bg-bc-canvas border border-bc-border rounded-xl flex items-center gap-3 hover:bg-bc-border/40 transition-colors disabled:cursor-default active-scale"
                      >
                        <div className="relative shrink-0">
                          <Avatar
                            src={m.avatarUrl}
                            initials={`${m.firstName[0]}${m.lastName[0]}`}
                            size="sm"
                            className="w-10 h-10 bg-white border border-bc-border text-bc-text text-xs shadow-sm"
                          />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusDot}`} title={`Rapports S-1/S-2 : ${status}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-bc-text truncate">
                            {m.firstName} {m.lastName}
                          </p>
                          <p className="text-[10px] text-bc-text-secondary">{m.phone}</p>
                        </div>
                        {editable && <Heart size={14} className="text-bc-green shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showMemberReportModal && (
        <Modal open={showMemberReportModal} onClose={() => setShowMemberReportModal(false)} title="Suivi Spirituel Membre" maxWidth="max-w-md">
            <p className="text-xs text-bc-text-secondary mb-6">
              Évaluez la santé spirituelle (Rapport hebdomadaire).
            </p>
            <form onSubmit={handleSaveMemberHealth} className="space-y-5">
              <div className="p-3 rounded-xl bg-bc-canvas border border-bc-border">
                <span className="text-[10px] text-bc-text-secondary font-bold uppercase block">Membre évalué</span>
                <span className="text-sm font-bold text-bc-text">
                  {(() => { const t = members.find((m) => m.id === targetMemberId); return t ? `${t.firstName} ${t.lastName}` : "—"; })()}
                </span>
              </div>

              {memberEvolutionData.length > 0 && (
                <div className="p-3 rounded-xl border border-bc-border">
                  <span className="text-[10px] text-bc-text-secondary font-bold uppercase flex items-center gap-1 mb-1">
                    <TrendingUp size={11} /> Évolution personnelle
                  </span>
                  <div className="h-32 min-w-0">
                    <ResponsiveChart height="100%" minHeight={100}>
                      <LineChart data={memberEvolutionData}>
                        <XAxis dataKey="date" fontSize={8} axisLine={false} tickLine={false} />
                        <YAxis domain={[1, 5]} fontSize={8} axisLine={false} tickLine={false} width={16} />
                        <Tooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 10 }} />
                        <Line type="monotone" dataKey="Spirituelle" stroke="var(--accent-1)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Sociale" stroke="var(--accent-2)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Physique" stroke="var(--color-bc-purple)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Financière" stroke="var(--color-bc-text-secondary)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveChart>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">Semaine concernée</label>
                <div className="grid grid-cols-2 gap-2">
                  {[s2, s1].map((w) => {
                    const already = branchReports.some(
                      (r) => r.reportType === "rapport_bloom_bus_member" && r.content?.memberId === targetMemberId && (r.weekOf ?? weekId(r.date)) === w,
                    );
                    return (
                      <button
                        type="button"
                        key={w}
                        onClick={() => setSelectedWeek(w)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-colors active-scale text-center ${selectedWeek === w ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas"}`}
                      >
                        {weekLabel(w)}
                        {already && <span className="block text-[9px] font-normal opacity-80 mt-0.5">déjà rempli</span>}
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
                    {CULTE_OPTIONS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setCulte(c)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${culte === c ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text border-bc-border"}`}
                      >
                        {c}
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
                  disabled={!selectedWeek || sprVal == null || socVal == null || finVal == null || phyVal == null || !culte}
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors active-scale disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Enregistrer
                </button>
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
