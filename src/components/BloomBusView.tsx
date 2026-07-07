import React, { useEffect, useState } from "react";
import {
  Bus,
  Map as MapIcon,
  Heart,
  Sliders,
  Users,
  ChevronDown,
  ChevronRight,
  Activity,
  Plus,
  X,
  TrendingUp,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Member, Branch, BloomBusEntity, Report, Event, FormDef } from "../types";
import { useBusLines, save } from "../data";
import { busMobilisationRate, moissonTotal, busVisitesTotal, dominantHealthLevel } from "../data/kpi";
import { ResponsiveChart } from "./ui/ResponsiveChart";
import { HEALTH_AXES } from "./DashboardView";
import { HealthSmiley } from "./ui/HealthSmiley";
import { motion } from "motion/react";
import { staggerParent, staggerItem } from "./ui/motion";
import { Avatar } from "./ui/Avatar";

// §Accueil-1.3/§5 — les 4 critères réellement saisis par le rapport de suivi Bloom Bus
// (presenceCulte/presenceService sont des compteurs, pas une échelle 1-5 : exclus du smiley/courbe ici).
const BUS_HEALTH_KEYS = new Set(["spirituel", "social", "physique", "financier"]);
const BUS_HEALTH_AXES = HEALTH_AXES.filter((a) => BUS_HEALTH_KEYS.has(a.key));

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
function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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
  activeBranch: Branch;
  simulatedRole: string;
  forms?: FormDef[];
}

// Real OpenStreetMap embed, bbox fitted to the selected territory (marker at centroid).
function osmUrl(buses: BloomBusEntity[]): string {
  const pts = buses.length ? buses : [{ centerLat: 5.35, centerLng: -4.02 } as BloomBusEntity];
  const lats = pts.map((b) => b.centerLat);
  const lngs = pts.map((b) => b.centerLng);
  const pad = 0.02;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const mLat = (minLat + maxLat) / 2;
  const mLng = (minLng + maxLng) / 2;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${mLat},${mLng}`;
}

export default function BloomBusView({
  members,
  reports,
  events = [],
  onUpdateMember,
  onAddReport,
  activeBranch,
  simulatedRole,
  forms = [],
}: BloomBusViewProps) {
  // ponytail: pas de sélecteur de période ici (KPIS.md ne précise pas de granularité par vue) ; mois par défaut, comme le Dashboard.
  const kpiPeriod = "month" as const;
  // P1.4 — labels read live from FormBuilder's fd_bus_sante FormDef, id-matched (not
  // position-matched) so reordering fields in the builder doesn't relabel the wrong value.
  const santeForm = forms.find((f) => f.id === "fd_bus_sante");
  const santeLabel = (fieldId: string, fallback: string) =>
    santeForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;
  const seedBus = useBusLines();
  // ponytail: local session state; persist via ./data at backend time.
  const [busLines, setBusLines] = useState<BloomBusEntity[]>(seedBus);
  useEffect(() => { save('bc_bus_lines', busLines); }, [busLines]);
  const [showAddBus, setShowAddBus] = useState(false);
  const [expandedCommunes, setExpandedCommunes] = useState<string[]>([
    "Cocody",
  ]);
  const [expandedZones, setExpandedZones] = useState<string[]>(["Zone Est"]);
  const [selectedLevel, setSelectedLevel] = useState<{
    type: "commune" | "zone" | "bus";
    id: string;
  }>({ type: "commune", id: "Cocody" });

  const [showMemberReportModal, setShowMemberReportModal] = useState(false);
  const [showLifeReportModal, setShowLifeReportModal] = useState(false);
  const [targetMemberId, setTargetMemberId] = useState<string>("");

  // Member health report sliders
  const [sprVal, setSprVal] = useState(3);
  const [socVal, setSocVal] = useState(3);
  const [finVal, setFinVal] = useState(3);
  const [phyVal, setPhyVal] = useState(3);
  // P2.8 — sélection du/des culte(s) auxquels le membre était présent, plutôt qu'une échelle 1-5.
  const [culteIds, setCulteIds] = useState<string[]>([]);
  const toggleCulte = (id: string) =>
    setCulteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Life report
  const [mobilisedCount, setMobilisedCount] = useState(30);
  const [presentCulteCount, setPresentCulteCount] = useState(28);
  // P2.8 — multi-sélection des membres visités, plutôt qu'un simple compteur.
  const [visitedMemberIds, setVisitedMemberIds] = useState<string[]>([]);
  const toggleVisitedMember = (id: string) =>
    setVisitedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [newArrvCount, setNewArrvCount] = useState(2);
  const [incidents, setIncidents] = useState("Aucun incident signalé.");

  const culteEvents = events.filter(
    (e) => e.type.startsWith("dimanche_") && (activeBranch === "global" || e.branch === activeBranch || e.branch === "global"),
  );

  // Grouping
  const busByCommune: Record<string, Record<string, BloomBusEntity[]>> = {};
  busLines.forEach((bus) => {
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
  if (selectedLevel.type === "bus") {
    const b = busLines.find((b) => b.id === selectedLevel.id);
    if (b) activeBuses = [b];
  } else if (selectedLevel.type === "zone") {
    activeBuses = busLines.filter((b) => b.zone === selectedLevel.id);
  } else {
    activeBuses = busLines.filter(
      (b) => b.commune === selectedLevel.id,
    );
  }

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
  const tMobBus = busMobilisationRate(busMembers, branchReports, busIds, kpiPeriod);
  const moisson = moissonTotal(branchReports, kpiPeriod, new Date(), busIds);
  const visites = busVisitesTotal(branchReports, busIds, kpiPeriod);

  const canEdit = [
    "Pasteur",
    "Admin",
    "Responsable",
    "Coach",
    "Capitaine",
    "Super Admin",
    "Ministre",
    "Responsable de Zone",
    "Responsable de Commune",
  ].includes(simulatedRole);
  // ECRANS-PAR-ONGLET.md §5.3 — CRUD territorial (créer bus/zone/commune) réservé à l'Admin,
  // distinct de canEdit qui ne couvre que la saisie de rapport de suivi.
  const canAdminTerritory = ["Admin", "Super Admin"].includes(simulatedRole);

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
    if (!targetMemberId) return;
    const targetMember = members.find((m) => m.id === targetMemberId);
    if (!targetMember) return;
    const updated: Member = {
      ...targetMember,
      healthKPIs: {
        spirituel: sprVal,
        social: socVal,
        financier: finVal,
        physique: phyVal,
        // ponytail: presenceCulte reste un nombre agrégé (rollup) — dérivé du nombre de cultes sélectionnés.
        presenceCulte: culteIds.length,
        presenceService: targetMember.healthKPIs?.presenceService || 3,
      },
    };
    onUpdateMember(updated);
    onAddReport({
      id: `rep_bus_mem_${Date.now()}`,
      authorId: "mem_1",
      authorName: "Affeny Grah",
      authorRole: "Capitaine de Bus",
      targetBranch: activeBranch,
      date: new Date().toISOString().split("T")[0],
      reportType: "rapport_bloom_bus_member",
      confidential: false,
      content: {
        memberId: targetMemberId,
        memberName: `${targetMember.firstName} ${targetMember.lastName}`,
        sprVal,
        socVal,
        finVal,
        phyVal,
        culteIds,
      },
    });
    setShowMemberReportModal(false);
    setCulteIds([]);
  };

  const handleSaveLifeReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLevel.type !== "bus") return; // rapport de vie = par bus uniquement
    onAddReport({
      id: `rep_bus_life_${Date.now()}`,
      authorId: "mem_1",
      authorName: "Affeny Grah",
      authorRole: "Capitaine de Bus",
      targetBranch: activeBranch,
      date: new Date().toISOString().split("T")[0],
      reportType: "rapport_bloom_bus_life",
      confidential: false,
      content: {
        busId: selectedLevel.id,
        mobilised: mobilisedCount,
        presencesCulte: presentCulteCount,
        visitesRealisees: visitedMemberIds,
        moissonNouveaux: newArrvCount,
        incidents,
      },
    });
    setShowLifeReportModal(false);
    setVisitedMemberIds([]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-full lg:overflow-hidden flex-1">
      {/* Sidebar / Accordion */}
      <div className="w-full lg:w-72 bg-white rounded-[2rem] border border-bc-border shadow-sm p-4 flex flex-col shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="font-ui font-bold text-bc-text">Territoires Bloom</h3>
          {canAdminTerritory && (
            <button onClick={() => setShowAddBus(true)} title="Ajouter un bus" className="p-1.5 rounded-full bg-bc-green text-white hover:opacity-90 active-scale">
              <Plus size={14} />
            </button>
          )}
        </div>
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pb-8">
        {/* Header Actions */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border flex flex-col md:flex-row gap-4 justify-between md:items-center shrink-0">
          <div>
            <h2 className="font-ui font-extrabold text-xl text-bc-text flex items-center gap-2">
              {selectedLevel.type === "commune" &&
                `Commune: ${selectedLevel.id}`}
              {selectedLevel.type === "zone" && `Zone: ${selectedLevel.id}`}
              {selectedLevel.type === "bus" &&
                `Bus: ${busLines.find((b) => b.id === selectedLevel.id)?.name}`}
            </h2>
            <p className="text-xs text-bc-text-secondary mt-1">
              {activeBuses.length} ligne(s) couverte(s) - {busMembers.length}{" "}
              membre(s) rattaché(s)
            </p>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                T_mob_bus
              </span>
              <Activity size={14} className="text-bc-text-secondary" />
            </div>
            <div className="text-3xl font-black text-bc-text">{tMobBus === null ? "—" : `${tMobBus}%`}</div>
            {tMobBus !== null && (
              <div className="flex h-2 w-full mt-2 rounded-full overflow-hidden bg-bc-canvas">
                <div className="bg-bc-cerulean transition-all duration-500 ease-out-spring" style={{ width: `${tMobBus}%` }} />
              </div>
            )}
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Sur le mois
            </div>
          </div>
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
            <div className="text-3xl font-black text-bc-text">{visites}</div>
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Visites réalisées
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

        {/* Map & List Split */}
        <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-[400px]">
          {/* MAP */}
          <div className="flex-1 bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <MapIcon size={16} /> Carte Territoriale (OpenStreetMap)
            </h3>
            <div className="flex-1 bg-bc-canvas border border-bc-border rounded-2xl relative overflow-hidden min-h-[300px]">
              <iframe
                title="Carte OpenStreetMap"
                src={osmUrl(activeBuses)}
                className="absolute inset-0 w-full h-full border-0"
                loading="lazy"
              />
            </div>
            {/* ponytail: iframe embed centre le territoire (1 marqueur au centroïde) ; les pins par
                bus/membre nécessitent leaflet — à ajouter si la fidélité géo devient prioritaire. */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {activeBuses.map((bus) => (
                <span key={bus.id} className="inline-flex items-center gap-1 text-[10px] font-bold text-bc-text bg-white border border-bc-border rounded-full px-2 py-1">
                  <Bus size={11} className="text-bc-green" /> {bus.name}
                </span>
              ))}
            </div>
          </div>

          {/* Member List (only shown when bus is selected) */}
          {selectedLevel.type === "bus" && (
            <div className="w-full xl:w-80 bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-ui font-bold text-bc-text">Membres du Bus</h3>
                {canEdit && (
                  <button
                    onClick={() => setShowLifeReportModal(true)}
                    className="text-[10px] font-bold text-bc-green flex items-center gap-1 px-2 py-1 rounded-full hover:bg-bc-green/10 active-scale"
                    title="Rapport d'activité du bus (Capitaine)"
                  >
                    <Sliders size={13} /> Rapport d'activité
                  </button>
                )}
              </div>
              <p className="text-[10px] text-bc-text-secondary mb-3">Clique un membre pour faire son rapport de suivi.</p>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {busMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-bc-text-secondary font-bold">
                      Aucun membre rattaché à ce bus.
                    </p>
                  </div>
                ) : (
                  busMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { if (canEdit) { setTargetMemberId(m.id); setShowMemberReportModal(true); } }}
                      disabled={!canEdit}
                      className="w-full text-left p-3 bg-bc-canvas border border-bc-border rounded-xl flex items-center gap-3 hover:bg-bc-border/40 transition-colors disabled:cursor-default active-scale"
                    >
                      <Avatar
                        src={m.avatarUrl}
                        initials={`${m.firstName[0]}${m.lastName[0]}`}
                        size="sm"
                        className="w-10 h-10 bg-white border border-bc-border text-bc-text text-xs shadow-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-bc-text truncate">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-bc-text-secondary">{m.phone}</p>
                      </div>
                      {canEdit && <Heart size={14} className="text-bc-green shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showMemberReportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-2xl border border-bc-border">
            <h3 className="font-ui font-bold text-xl text-bc-text mb-2">
              Suivi Spirituel Membre
            </h3>
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

              <div className="space-y-4">
                <RatingRow label={santeLabel("f0", "Spiritualité")} value={sprVal} onChange={setSprVal} />
                <RatingRow label={santeLabel("f1", "Social")} value={socVal} onChange={setSocVal} />
                <RatingRow label={santeLabel("f2", "Physique")} value={phyVal} onChange={setPhyVal} />
                <RatingRow label={santeLabel("f3", "Financier")} value={finVal} onChange={setFinVal} />
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">Présence au culte / événement</label>
                  <div className="flex flex-wrap gap-2">
                    {culteEvents.map((ev) => (
                      <button
                        type="button"
                        key={ev.id}
                        onClick={() => toggleCulte(ev.id)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${culteIds.includes(ev.id) ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text border-bc-border"}`}
                      >
                        {ev.title} · {ev.date}
                      </button>
                    ))}
                    {culteEvents.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun culte enregistré.</p>}
                  </div>
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
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors active-scale"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLifeReportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-2xl border border-bc-border">
            <h3 className="font-ui font-bold text-xl text-bc-text mb-4">
              Rapport d'Activité Bus
            </h3>
            <form onSubmit={handleSaveLifeReport} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Mobilisation
                  </label>
                  <input
                    type="number"
                    value={mobilisedCount}
                    onChange={(e) => setMobilisedCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Présence Culte
                  </label>
                  <input
                    type="number"
                    value={presentCulteCount}
                    onChange={(e) =>
                      setPresentCulteCount(Number(e.target.value))
                    }
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                    Nouveaux gagnés
                  </label>
                  <input
                    type="number"
                    value={newArrvCount}
                    onChange={(e) => setNewArrvCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                  Membres visités
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {busMembers.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => toggleVisitedMember(m.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${visitedMemberIds.includes(m.id) ? "bg-bc-green text-white border-bc-green" : "bg-white text-bc-text border-bc-border"}`}
                    >
                      {m.firstName} {m.lastName}
                    </button>
                  ))}
                  {busMembers.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun membre dans ce bus.</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-bc-text-secondary mb-1">
                  Incidents / Activité
                </label>
                <textarea
                  value={incidents}
                  onChange={(e) => setIncidents(e.target.value)}
                  className="w-full p-3 border border-bc-border rounded-xl text-sm font-medium h-24 bg-bc-canvas focus:bg-white focus:outline-none resize-none"
                />
              </div>
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
          </div>
        </div>
      )}

      {showAddBus && (
        <AddBusModal
          onClose={() => setShowAddBus(false)}
          onAdd={(bus) => {
            setBusLines((prev) => [...prev, bus]);
            setShowAddBus(false);
          }}
        />
      )}
    </div>
  );
}

function AddBusModal({ onClose, onAdd }: { onClose: () => void; onAdd: (b: BloomBusEntity) => void }) {
  const [name, setName] = useState("");
  const [commune, setCommune] = useState("");
  const [zone, setZone] = useState("");
  const [lat, setLat] = useState("5.35");
  const [lng, setLng] = useState("-4.02");

  const submit = () => {
    if (!name.trim() || !commune.trim() || !zone.trim()) return;
    onAdd({
      id: `bus_${Date.now()}`,
      name: name.trim(),
      commune: commune.trim(),
      zone: zone.trim(),
      centerLat: parseFloat(lat) || 5.35,
      centerLng: parseFloat(lng) || -4.02,
    });
  };

  return (
    <div className="fixed inset-0 bg-bc-text/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-ui font-bold text-bc-text">Ajouter un bus</h3>
          <button onClick={onClose} className="text-bc-text-secondary hover:text-bc-text active-scale"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du bus" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
          <input value={commune} onChange={(e) => setCommune(e.target.value)} placeholder="Commune" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
          <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Zone" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
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
        <button onClick={submit} disabled={!name.trim() || !commune.trim() || !zone.trim()} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40 active-scale">
          Ajouter le bus
        </button>
      </div>
    </div>
  );
}
