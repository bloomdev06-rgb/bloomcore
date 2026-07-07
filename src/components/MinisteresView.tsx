import React, { useState, useEffect } from 'react';
import { Branch, Ministry, Member, Report, Department, AuditLog } from '../types';
import { Grid, ChevronRight, Users, Folder, ArrowLeft, BarChart3, GripVertical, Plus, X, Flame, Palette, MonitorSpeaker, HeartHandshake, Rocket, Network, BookOpen } from 'lucide-react';
import { useMinistries, load, save } from '../data';
import { activeMemberIds } from '../data/kpi';
import { HealthSmiley } from './ui/HealthSmiley';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';

interface MinisteresViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
  reports?: Report[];
  operator?: Member;
  departments: Department[];
  onUpdateDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  onAddAuditLog?: (log: AuditLog) => void;
}

// Icône par ministère, matchée sur le nom (fallback : initiale).
const MINISTRY_ICONS: Array<[RegExp, typeof Flame]> = [
  [/intimit/i, Flame],
  [/\bart\b/i, Palette],
  [/tech|scène/i, MonitorSpeaker],
  [/rétention/i, HeartHandshake],
  [/expansion/i, Rocket],
  [/coordination/i, Network],
  [/affermissement/i, BookOpen],
];
const ministryIcon = (name: string) => MINISTRY_ICONS.find(([re]) => re.test(name))?.[1];

// Accent de charte cyclé par carte ministère (pastille-initiale) — règle charte :
// fonds de conteneurs colorés au ton ~12-20%, jamais plus de couleurs que les tokens bc-*.
const MINISTRY_ACCENTS = [
  'bg-bc-green/15 text-bc-green',
  'bg-bc-cerulean/15 text-bc-cerulean',
  'bg-bc-gold/20 text-bc-gold',
  'bg-bc-turquoise/15 text-bc-turquoise',
  'bg-bc-orange/15 text-bc-orange',
  'bg-bc-fushia/15 text-bc-fushia',
];

// Assignation du ministre par recherche (remplace le <select> plat).
function TuteurSearch({ valueLabel, candidates, onSelect }: {
  valueLabel: string;
  candidates: Member[];
  onSelect: (id: string | undefined) => void;
}) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const results = candidates
    .filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setEditing(true); setQ(''); }}
        className="text-xs font-bold bg-bc-canvas border border-bc-border rounded-full px-3 py-1.5 hover:border-bc-green transition-colors active-scale"
      >
        {valueLabel} <span className="text-bc-text-secondary font-normal">· modifier</span>
      </button>
    );
  }
  return (
    <div className="relative">
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        placeholder="Rechercher un Leader / Coach…"
        className="text-xs font-bold bg-white border border-bc-green rounded-full px-3 py-1.5 focus:outline-none w-56"
      />
      <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-bc-border rounded-2xl shadow-md z-20 overflow-hidden max-h-64 overflow-y-auto">
        <button
          type="button"
          onMouseDown={() => { onSelect(undefined); setEditing(false); }}
          className="w-full text-left px-3 py-2 text-xs text-bc-text-secondary hover:bg-bc-canvas"
        >
          Non assigné
        </button>
        {results.map(c => (
          <button
            type="button"
            key={c.id}
            onMouseDown={() => { onSelect(c.id); setEditing(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-bc-canvas"
          >
            <span className="font-bold text-bc-text">{c.firstName} {c.lastName}</span>
            <span className="text-bc-text-secondary"> — {c.level}</span>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-2 text-xs italic text-bc-text-secondary">Aucun résultat</p>}
      </div>
    </div>
  );
}

export default function MinisteresView({ activeBranch, simulatedRole, members, reports = [], operator, departments, onUpdateDepartments, onAddAuditLog }: MinisteresViewProps) {
  const seedMinistries = useMinistries();
  const isChurch = activeBranch === 'church';
  const canEdit = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);
  // Spec (Onglet 3) : CRUD (créer/renommer/nommer le Ministre) = Admin/Super Admin uniquement.
  const canManage = ['Admin', 'Super Admin'].includes(simulatedRole);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTuteurId, setNewTuteurId] = useState('');

  // ministries : encore local (MinisteresView est le seul éditeur → pas de divergence).
  // departments : remonté dans App (prop) depuis B3, mutations via onUpdateDepartments.
  const [ministriesAll, setMinistries] = useState<Ministry[]>(() => load('bc_ministries', seedMinistries));
  // PROFILS-INTERFACES.md:156-157 — le Ministre de tutelle est scopé à son seul ministère
  // (même règle que scope.ts's inMemberScope pour les membres : tuteurId === operator.id).
  const ministries = simulatedRole === 'Ministre' && operator
    ? ministriesAll.filter(m => m.tuteurId === operator.id)
    : ministriesAll;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => { save('bc_ministries', ministriesAll); }, [ministriesAll]);

  const updateMinistry = (id: string, patch: Partial<Ministry>) =>
    setMinistries(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  // §12.2 — journal central : la réaffectation d'un département à un autre ministère en fait partie.
  const moveDept = (deptId: string, ministryId: string) => {
    const dept = departments.find(d => d.id === deptId);
    const fromMinistry = ministriesAll.find(m => m.id === dept?.ministryId);
    const toMinistry = ministriesAll.find(m => m.id === ministryId);
    onUpdateDepartments(prev => prev.map(d => (d.id === deptId ? { ...d, ministryId } : d)));
    onAddAuditLog?.({
      id: `aud_dept_move_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'DEPARTMENT_REASSIGNED',
      operatorName: 'Affeny Grah',
      operatorId: 'mem_1',
      details: `Département "${dept?.name ?? deptId}" réaffecté de "${fromMinistry?.name ?? '—'}" à "${toMinistry?.name ?? '—'}".`,
      previousValue: fromMinistry?.name,
      newValue: toMinistry?.name,
      branch: activeBranch !== 'global' ? activeBranch : undefined,
    });
  };

  const tuteurName = (id?: string) => {
    const m = members.find(x => x.id === id);
    return m ? `${m.firstName} ${m.lastName}` : 'Non assigné';
  };
  // Candidates for "Ministre de tutelle": senior members.
  const tuteurCandidates = members.filter(m => m.level === 'Leader' || m.level === 'Coach');

  // Santé d'un département = moyenne de chaque critère (5) sur tous ses membres (branche active).
  const HEALTH_CRITERIA = [
    { key: 'spirituel', label: 'Spirituel' },
    { key: 'social', label: 'Social' },
    { key: 'physique', label: 'Physique' },
    { key: 'financier', label: 'Financier' },
    { key: 'presenceCulte', label: 'Présence' },
  ] as const;
  const deptHealth = (deptId: string) => {
    const dm = members.filter(m => m.departments?.[deptId] && (activeBranch === 'global' || m.branch === activeBranch));
    const avgs = HEALTH_CRITERIA.map(c => ({
      ...c,
      v: dm.length ? dm.reduce((s, m) => s + ((m.healthKPIs as any)?.[c.key] ?? 0), 0) / dm.length : 0,
    }));
    return { count: dm.length, avgs };
  };

  // ---- Detail view ----
  const selected = selectedId ? ministries.find(m => m.id === selectedId) : undefined;
  if (selected) {
    const mDepts = departments.filter(d => d.ministryId === selected.id);
    // KPIS.md §6 — classement par santé (moyenne des 5 critères) ; départements sans donnée en fin de liste.
    const rankedDepts = mDepts
      .map(dept => {
        const h = deptHealth(dept.id);
        const score = h.count ? h.avgs.reduce((s, a) => s + a.v, 0) / h.avgs.length : -1;
        return { dept, h, score };
      })
      .sort((a, b) => b.score - a.score);
    const scoredDepts = rankedDepts.filter(d => d.score >= 0);
    const ministryAvgScore = scoredDepts.length
      ? scoredDepts.reduce((s, d) => s + d.score, 0) / scoredDepts.length
      : 0;
    // Santé du ministère par critère = moyenne des moyennes départementales (depts avec données).
    const ministryAvgs = HEALTH_CRITERIA.map((c, i) => ({
      ...c,
      v: scoredDepts.length ? scoredDepts.reduce((s, d) => s + d.h.avgs[i].v, 0) / scoredDepts.length : 0,
    }));
    const branchReports = reports.filter(r => activeBranch === 'global' || r.targetBranch === activeBranch);
    const SelectedIcon = ministryIcon(selected.name);
    const ministryActiveIds = new Set<string>();
    mDepts.forEach(d => activeMemberIds(branchReports, 'month', new Date(), d.id).forEach(id => ministryActiveIds.add(id)));
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <button
              onClick={() => setSelectedId(null)}
              className="flex items-center text-xs font-bold text-bc-text-secondary hover:text-bc-text transition-colors mb-4"
            >
              <ArrowLeft size={14} className="mr-1" /> Retour aux ministères
            </button>

            <div className="flex items-center gap-3">
              {SelectedIcon && (
                <span className="w-10 h-10 rounded-full bg-bc-green/10 text-bc-green flex items-center justify-center shrink-0">
                  <SelectedIcon size={18} />
                </span>
              )}
              {canEdit ? (
                <input
                  value={selected.name}
                  onChange={e => updateMinistry(selected.id, { name: e.target.value })}
                  className="text-2xl font-ui font-extrabold text-bc-text bg-transparent border-b-2 border-transparent hover:border-bc-border focus:border-bc-green focus:outline-none transition-colors max-w-full"
                />
              ) : (
                <h2 className="text-2xl font-ui font-extrabold text-bc-text">{selected.name}</h2>
              )}
            </div>

            <div className="flex items-center gap-3 mt-3">
              <span className="w-5 h-5 rounded-full bg-bc-green text-white flex items-center justify-center text-[10px] shrink-0">M</span>
              <span className="text-xs font-bold text-bc-text-secondary">Ministre de tutelle</span>
              {canEdit ? (
                <TuteurSearch
                  valueLabel={tuteurName(selected.tuteurId)}
                  candidates={tuteurCandidates}
                  onSelect={id => updateMinistry(selected.id, { tuteurId: id })}
                />
              ) : (
                <span className="text-xs bg-bc-canvas px-3 py-1 rounded-full font-bold text-bc-text-secondary">{tuteurName(selected.tuteurId)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-cerulean mb-2">
              <Folder size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Départements rattachés</span>
            </div>
            <div className="text-2xl font-ui font-extrabold text-bc-cerulean">{mDepts.length}</div>
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-green mb-2">
              <Users size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Membres Actifs</span>
            </div>
            <div className="text-2xl font-ui font-extrabold text-bc-green">{ministryActiveIds.size}</div>
            <p className="text-[10px] text-bc-text-secondary mt-1">Sur le mois</p>
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-gold mb-2">
              <BarChart3 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Santé du Ministère</span>
            </div>
            {scoredDepts.length === 0 ? (
              <div className="text-sm italic text-bc-text-secondary">Aucune donnée</div>
            ) : (
              <div className="flex gap-2.5">
                {ministryAvgs.map(a => (
                  <div key={a.key} className="flex flex-col items-center gap-0.5">
                    <HealthSmiley value={a.v} size={22} />
                    <span className="text-[8px] text-bc-text-secondary font-bold uppercase">{a.label}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-bc-text-secondary mt-1">Basé sur les KPI départements</p>
          </div>
        </div>

        {/* Departments List / Ranking */}
        <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6">
          <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Classement des Départements</h3>
          <div className="divide-y divide-bc-border">
            {rankedDepts.map(({ dept, h }) => {
              const responsable = members.find(m => m.departments?.[dept.id] === 'Responsable');
              return (
              <div key={dept.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-bc-text">{dept.name}</h4>
                  <p className="text-xs text-bc-text-secondary mt-0.5">
                    {h.count} membre{h.count > 1 ? 's' : ''}
                    {responsable
                      ? <> · Resp. {responsable.firstName} {responsable.lastName}</>
                      : <> · <span className="italic">Aucun responsable</span></>}
                  </p>
                </div>
                {h.count === 0 ? (
                  <span className="text-xs text-bc-text-secondary italic">Aucune donnée</span>
                ) : (
                  <div className="flex gap-3">
                    {h.avgs.map(a => (
                      <div key={a.key} className="flex flex-col items-center gap-1">
                        <HealthSmiley value={a.v} size={26} />
                        <span className="text-[9px] text-bc-text-secondary font-bold uppercase">{a.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- Grid view (with drag & drop reassignment) ----
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <Grid size={28} className={'text-bc-text'} />
            Ministères
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gestion des regroupements de départements pour {activeBranch === 'global' ? 'les deux branches' : isChurch ? 'Bloom Church' : 'Bloom Light'}.
            {canEdit && ' Glissez un département d\'une carte à l\'autre pour le réaffecter.'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 flex items-center gap-1.5 shrink-0 active-scale"
          >
            <Plus size={14} /> Créer un ministère
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <div className="fixed inset-0 bg-bc-text/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-ui font-extrabold text-bc-text">Nouveau ministère</h3>
              <button onClick={() => setShowCreate(false)} className="active-scale"><X size={18} className="text-bc-text-secondary" /></button>
            </div>
            <div>
              <label className="text-xs font-bold text-bc-text-secondary block mb-1">Nom</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full border border-bc-border rounded-full px-4 py-2 text-sm" placeholder="Ex. Ministère de la Louange" />
            </div>
            <div>
              <label className="text-xs font-bold text-bc-text-secondary block mb-1">Ministre de tutelle</label>
              <TuteurSearch
                valueLabel={tuteurName(newTuteurId || undefined)}
                candidates={tuteurCandidates}
                onSelect={id => setNewTuteurId(id ?? '')}
              />
            </div>
            <button
              disabled={!newName.trim()}
              onClick={() => {
                setMinistries(prev => [...prev, {
                  id: `min_${Date.now()}`,
                  name: newName.trim(),
                  description: '',
                  ...(newTuteurId && { tuteurId: newTuteurId }),
                  ...(activeBranch !== 'global' && { branch: activeBranch }),
                }]);
                onAddAuditLog?.({
                  id: `aud_min_${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  actionType: 'MINISTRY_CREATED',
                  operatorName: 'Affeny Grah',
                  operatorId: 'mem_1',
                  details: `Création du ministère "${newName.trim()}".`,
                  branch: activeBranch !== 'global' ? activeBranch : undefined,
                });
                setNewName(''); setNewTuteurId(''); setShowCreate(false);
              }}
              className="w-full px-4 py-2.5 bg-bc-green text-white font-bold text-sm rounded-full disabled:opacity-40 active-scale"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ministries.map((m, idx) => {
          const mDepts = departments.filter(d => d.ministryId === m.id);
          const isTarget = dragOverId === m.id;
          const accent = MINISTRY_ACCENTS[idx % MINISTRY_ACCENTS.length];
          return (
          <motion.div
            variants={staggerItem}
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            onDragOver={canEdit ? (e => { e.preventDefault(); setDragOverId(m.id); }) : undefined}
            onDragLeave={canEdit ? (() => setDragOverId(prev => (prev === m.id ? null : prev))) : undefined}
            onDrop={canEdit ? (e => {
              e.preventDefault();
              const deptId = e.dataTransfer.getData('text/plain');
              if (deptId) moveDept(deptId, m.id);
              setDragOverId(null);
            }) : undefined}
            className={`bg-white rounded-[2rem] border p-6 shadow-sm transition-all cursor-pointer group flex flex-col justify-between ${
              isTarget ? 'border-bc-green ring-2 ring-bc-green/30' : 'border-bc-border hover:shadow-md hover:border-bc-green/30'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${accent}`}>
                  {(() => {
                    const I = ministryIcon(m.name);
                    return I ? <I size={16} /> : m.name.replace(/^Ministère (de |du |des |d')?/i, '').charAt(0).toUpperCase();
                  })()}
                </span>
                <h3 className="font-ui font-bold text-bc-text leading-tight truncate">{m.name}</h3>
              </div>
              <button className="text-bc-text-secondary group-hover:text-bc-text group-hover:translate-x-1 transition-all shrink-0">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-bc-text-secondary">
                <span className="w-6 h-6 rounded-full bg-bc-green text-white flex items-center justify-center font-bold shrink-0 text-[10px]">M</span>
                <span>Ministre: <span className="font-bold text-bc-text">{tuteurName(m.tuteurId)}</span></span>
              </div>

              {/* Departments — draggable chips for reassignment */}
              <div className="text-[10px] text-bc-text-secondary bg-bc-canvas p-2 rounded-xl border border-bc-border">
                <span className="font-bold uppercase tracking-wider block mb-1">Départements ({mDepts.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {mDepts.map(d => (
                    <span
                      key={d.id}
                      draggable={canEdit}
                      onClick={e => e.stopPropagation()}
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; }}
                      className={`bg-white px-3 py-2 rounded-lg border border-bc-border truncate max-w-full flex items-center gap-1.5 text-xs font-medium text-bc-text ${canEdit ? 'cursor-grab active:cursor-grabbing hover:border-bc-green hover:shadow-sm' : ''}`}
                    >
                      {canEdit && <GripVertical size={13} className="text-bc-text-secondary shrink-0" />}
                      {d.name}
                    </span>
                  ))}
                  {mDepts.length === 0 && <span className="italic text-bc-text-secondary">Aucun département</span>}
                </div>
              </div>
            </div>
          </motion.div>
        )})}
      </motion.div>
    </div>
  );
}
