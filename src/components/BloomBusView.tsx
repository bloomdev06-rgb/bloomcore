import React, { useState } from "react";
import {
  Bus,
  Map as MapIcon,
  Heart,
  Sliders,
  Users,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Member, Branch, BloomBusEntity, Report } from "../types";
import { INITIAL_BUS_LINES } from "../mockData";

interface BloomBusViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  onAddReport: (report: Report) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

export default function BloomBusView({
  members,
  onUpdateMember,
  onAddReport,
  activeBranch,
  simulatedRole,
}: BloomBusViewProps) {
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
  const [culVal, setCulVal] = useState(3);

  // Life report
  const [mobilisedCount, setMobilisedCount] = useState(30);
  const [presentCulteCount, setPresentCulteCount] = useState(28);
  const [visitsCount, setVisitsCount] = useState(3);
  const [newArrvCount, setNewArrvCount] = useState(2);
  const [incidents, setIncidents] = useState("Aucun incident signalé.");

  // Grouping
  const busByCommune: Record<string, Record<string, BloomBusEntity[]>> = {};
  INITIAL_BUS_LINES.forEach((bus) => {
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
    const b = INITIAL_BUS_LINES.find((b) => b.id === selectedLevel.id);
    if (b) activeBuses = [b];
  } else if (selectedLevel.type === "zone") {
    activeBuses = INITIAL_BUS_LINES.filter((b) => b.zone === selectedLevel.id);
  } else {
    activeBuses = INITIAL_BUS_LINES.filter(
      (b) => b.commune === selectedLevel.id,
    );
  }

  const busIds = activeBuses.map((b) => b.id);
  const busMembers = members.filter(
    (m) =>
      m.bloomBusId && busIds.includes(m.bloomBusId) && m.level !== "Nouveau",
  );

  const canEdit = [
    "Pasteur",
    "Admin",
    "Responsable",
    "Coach",
    "Capitaine",
    "Super Admin",
    "Ministre",
  ].includes(simulatedRole);

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
        presenceCulte: culVal,
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
        culVal,
      },
    });
    setShowMemberReportModal(false);
  };

  const handleSaveLifeReport = (e: React.FormEvent) => {
    e.preventDefault();
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
        visitesRealisees: visitsCount,
        moissonNouveaux: newArrvCount,
        incidents,
      },
    });
    setShowLifeReportModal(false);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-full lg:overflow-hidden flex-1">
      {/* Sidebar / Accordion */}
      <div className="w-full lg:w-72 bg-white rounded-[2rem] border border-bc-border shadow-sm p-4 flex flex-col shrink-0 overflow-y-auto">
        <h3 className="font-ui font-bold text-bc-text mb-4 px-2">
          Territoires Bloom
        </h3>
        <div className="space-y-2">
          {Object.entries(busByCommune).map(([commune, zones]) => (
            <div key={commune} className="space-y-1">
              <div
                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer ${selectedLevel.type === "commune" && selectedLevel.id === commune ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-slate-700"}`}
                onClick={() => {
                  setSelectedLevel({ type: "commune", id: commune });
                  toggleCommune(commune);
                }}
              >
                <span className="font-bold text-sm">{commune}</span>
                {expandedCommunes.includes(commune) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>

              {expandedCommunes.includes(commune) && (
                <div className="pl-4 space-y-1">
                  {Object.entries(zones).map(([zone, buses]) => (
                    <div key={zone} className="space-y-1">
                      <div
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer ${selectedLevel.type === "zone" && selectedLevel.id === zone ? "bg-bc-green text-white" : "hover:bg-bc-canvas text-slate-700"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLevel({ type: "zone", id: zone });
                          toggleZone(zone);
                        }}
                      >
                        <span className="font-bold text-xs">{zone}</span>
                        {expandedZones.includes(zone) ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </div>

                      {expandedZones.includes(zone) && (
                        <div className="pl-4 space-y-1">
                          {buses.map((bus) => (
                            <div
                              key={bus.id}
                              className={`flex items-center p-2 rounded-xl cursor-pointer ${selectedLevel.type === "bus" && selectedLevel.id === bus.id ? "bg-slate-100 text-bc-text" : "hover:bg-bc-canvas text-bc-text-secondary"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLevel({ type: "bus", id: bus.id });
                              }}
                            >
                              <Bus size={12} className="mr-2 shrink-0" />
                              <span className="text-xs font-bold leading-tight">
                                {bus.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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
                `Bus: ${INITIAL_BUS_LINES.find((b) => b.id === selectedLevel.id)?.name}`}
            </h2>
            <p className="text-xs text-bc-text-secondary mt-1">
              {activeBuses.length} ligne(s) couverte(s) - {busMembers.length}{" "}
              membre(s) rattaché(s)
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40 items-end">
            <button
              onClick={() => {
                if (busMembers.length === 0)
                  return alert("Aucun membre actif.");
                setTargetMemberId(busMembers[0].id);
                setShowMemberReportModal(true);
              }}
              className="p-4 bg-emerald-600 text-white font-ui font-black text-xs uppercase tracking-wider rounded-full shadow-2xl hover:scale-105 flex items-center gap-2 transition-transform duration-200 ease-out-spring active-scale"
              title="Rapport Spirituel"
            >
              <Heart size={22} /> <span className="pr-1">Rapport Spirituel</span>
            </button>
            <button
              onClick={() => setShowLifeReportModal(true)}
              className="p-4 bg-bc-green text-white font-ui font-black text-xs uppercase tracking-wider rounded-full shadow-2xl hover:scale-105 flex items-center gap-2 transition-transform duration-200 ease-out-spring active-scale"
              title="Rapport d'Activité"
            >
              <Sliders size={22} /> <span className="pr-1">Rapport d'Activité</span>
            </button>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                T_mob_bus
              </span>
              <Activity size={14} className="text-slate-400" />
            </div>
            <div className="text-3xl font-black text-bc-text">84%</div>
            <div className="text-[10px] text-emerald-500 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded-full">
              +5% ce mois
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Moisson
              </span>
              <Users size={14} className="text-slate-400" />
            </div>
            <div className="text-3xl font-black text-bc-text">12</div>
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Nouveaux gagnés
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm flex flex-col justify-center items-center">
            <div className="flex justify-between items-center w-full mb-2">
              <span className="text-[10px] font-bold uppercase text-bc-text-secondary tracking-wider">
                Visites
              </span>
              <Heart size={14} className="text-slate-400" />
            </div>
            <div className="text-3xl font-black text-bc-text">34</div>
            <div className="text-[10px] text-bc-text-secondary font-bold mt-1 bg-bc-canvas px-2 py-0.5 rounded-full border border-bc-border">
              Membres visités
            </div>
          </div>
        </div>

        {/* Map & List Split */}
        <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-[400px]">
          {/* MAP */}
          <div className="flex-1 bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <MapIcon size={16} /> Carte Territoriale (Simulation)
            </h3>
            <div className="flex-1 bg-bc-canvas border border-bc-border rounded-2xl relative overflow-hidden flex items-center justify-center">
              <svg
                className="absolute inset-0 w-full h-full opacity-10"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line
                  x1="0"
                  y1="100"
                  x2="1000"
                  y2="100"
                  stroke="#000"
                  strokeWidth="4"
                />
                <line
                  x1="250"
                  y1="0"
                  x2="250"
                  y2="1000"
                  stroke="#000"
                  strokeWidth="4"
                />
              </svg>
              {activeBuses.map((bus, idx) => (
                <div
                  key={bus.id}
                  className="absolute flex flex-col items-center"
                  style={{
                    top: `${40 + idx * 15}%`,
                    left: `${40 + idx * 10}%`,
                  }}
                >
                  <div className="p-2 bg-bc-green text-white rounded-full shadow-lg border-2 border-white">
                    <Bus size={14} />
                  </div>
                  <span className="text-[9px] font-bold bg-white text-bc-text px-2 py-1 mt-1 rounded border border-bc-border shadow-sm whitespace-nowrap">
                    {bus.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Member List (only shown when bus is selected) */}
          {selectedLevel.type === "bus" && (
            <div className="w-full xl:w-80 bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
              <h3 className="text-sm font-ui font-bold text-bc-text mb-4">
                Membres du Bus
              </h3>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {busMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-bc-text-secondary font-bold">
                      Aucun membre rattaché à ce bus.
                    </p>
                  </div>
                ) : (
                  busMembers.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-bc-canvas border border-bc-border rounded-xl flex items-center gap-3 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-white border border-bc-border text-bc-text flex justify-center items-center font-bold text-xs shadow-sm">
                        {m.firstName[0]}
                        {m.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-bc-text">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-bc-text-secondary">{m.phone}</p>
                      </div>
                    </div>
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Membre évalué
                </label>
                <select
                  value={targetMemberId}
                  onChange={(e) => setTargetMemberId(e.target.value)}
                  className="w-full p-3 border border-bc-border rounded-xl text-sm font-bold bg-bc-canvas focus:bg-white focus:outline-none"
                >
                  {busMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Spiritualité
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={sprVal}
                    onChange={(e) => setSprVal(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Social
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={socVal}
                    onChange={(e) => setSocVal(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Physique
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={phyVal}
                    onChange={(e) => setPhyVal(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Financier
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={finVal}
                    onChange={(e) => setFinVal(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMemberReportModal(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-colors"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nouveaux gagnés
                  </label>
                  <input
                    type="number"
                    value={newArrvCount}
                    onChange={(e) => setNewArrvCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Visites Réalisées
                  </label>
                  <input
                    type="number"
                    value={visitsCount}
                    onChange={(e) => setVisitsCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-bc-border rounded-xl bg-bc-canvas text-sm font-bold focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
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
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
