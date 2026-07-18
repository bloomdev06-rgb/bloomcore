import React, { useState, useEffect } from 'react';
import { Branch, Ministry, Member, Report, Department, AuditLog } from '../types';
import { Grid, ChevronRight, Users, Folder, ArrowLeft, BarChart3, GripVertical, Plus, X, Flame, Palette, MonitorSpeaker, HeartHandshake, Rocket, Network, BookOpen, TrendingUp, Sparkles, Clock, AlertCircle, Calendar, FolderKanban, Trash2 } from 'lucide-react';
import { useMinistries, useProjects, load, save, activitiesSeed, labelFor } from '../data';
import { DEFAULT_OPERATOR_NAME } from '../data/operator';
import {
  activeMemberIds, dominantHealthLevel, isRed, moissonBySource, ojTotal,
  pendingFollowUps, periodRange, projectProgress, Period, PeriodInput, weeklyActiveCounts, weeklyBaptismCounts,
  weeklyGrowthSeries, weeklyMoissonCounts, weeklyOjCounts,
} from '../data/kpi';
import { HealthSmiley } from './ui/HealthSmiley';
import { PeriodSelector } from './ui/PeriodSelector';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';
import { HEALTH_AXES, Spark, Ring } from './DashboardView';
import { AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';

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
            <span className="text-bc-text-secondary"> — {labelFor(c.level)}</span>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-2 text-xs italic text-bc-text-secondary">Aucun résultat</p>}
      </div>
    </div>
  );
}

export default function MinisteresView({ activeBranch, simulatedRole, members, reports = [], operator, departments, onUpdateDepartments, onAddAuditLog }: MinisteresViewProps) {
  const seedMinistries = useMinistries();
  const allProjects = useProjects(); // hissé au top (react-hooks) : était appelé dans if (selected)
  const isChurch = activeBranch === 'church';
  const canEdit = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);
  // Les autres profils voient la liste des ministères (et leurs départements) mais ne peuvent pas ouvrir le détail.
  // Le Ministre est un cas particulier : détail ouvrable uniquement sur son propre ministère (cf. canOpen par carte).
  const canViewDetails = ['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'].includes(simulatedRole);
  // Spec (Onglet 3) : CRUD (créer/renommer/nommer le Ministre) = Admin/Super Admin uniquement.
  const canManage = ['Admin', 'Super Admin'].includes(simulatedRole);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTuteurId, setNewTuteurId] = useState('');

  // ministries : encore local (MinisteresView est le seul éditeur → pas de divergence).
  // departments : remonté dans App (prop) depuis B3, mutations via onUpdateDepartments.
  const [ministriesAll, setMinistries] = useState<Ministry[]>(() => load('bc_ministries', seedMinistries));
  // Le Ministre voit tous les ministères de la liste, mais ne peut ouvrir le détail
  // que du sien (tuteurId === operator.id) — cf. logique de clic par carte plus bas.
  const ministries = ministriesAll;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Sélecteur de période — même principe que l'Accueil/Départements, pilote Baptisés/Moisson/OJ du détail ministère.
  const [period, setPeriod] = useState<Period>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;

  useEffect(() => { save('bc_ministries', ministriesAll); }, [ministriesAll]);

  const updateMinistry = (id: string, patch: Partial<Ministry>) =>
    setMinistries(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const [deletingMinistry, setDeletingMinistry] = useState<Ministry | null>(null);
  const deleteMinistry = (ministry: Ministry) => {
    setMinistries(prev => prev.filter(m => m.id !== ministry.id));
    onAddAuditLog?.({
      id: `aud_min_del_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'MINISTRY_DELETED',
      operatorName: DEFAULT_OPERATOR_NAME,
      operatorId: 'mem_1',
      details: `Suppression du ministère "${ministry.name}".`,
      branch: activeBranch !== 'global' ? activeBranch : undefined,
    });
  };
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
      operatorName: DEFAULT_OPERATOR_NAME,
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
  const tuteurCandidates = members.filter(m => m.level === 'leader' || m.level === 'coach');

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
    const branchReports = reports.filter(r => activeBranch === 'global' || r.targetBranch === activeBranch);
    const SelectedIcon = ministryIcon(selected.name);
    const ministryActiveIds = new Set<string>();
    mDepts.forEach(d => activeMemberIds(branchReports, effectivePeriod, new Date(), d.id).forEach(id => ministryActiveIds.add(id)));

    // KPI de synthèse — mêmes calculs que l'Accueil/Départements, scopés aux départements de ce ministère.
    const mDeptIds = mDepts.map(d => d.id);
    const ministryMembers = members.filter(m =>
      Object.keys(m.departments ?? {}).some(id => mDeptIds.includes(id)) && (activeBranch === 'global' || m.branch === activeBranch));
    const ministryReports = reports.filter(r => r.departmentId && mDeptIds.includes(r.departmentId));
    const ministryNouveaux = ministryMembers.filter(m => m.level === 'nouveau');
    const ministryPendingReception = ministryNouveaux.filter(m => m.receptionValidated === false);
    const { from: mPFrom, to: mPTo } = periodRange(effectivePeriod);
    const ministryPeriodBaptised = ministryMembers.filter(m => m.baptismDate && new Date(m.baptismDate) >= mPFrom && new Date(m.baptismDate) <= mPTo);
    const ministryBaptisedViaDept = ministryPeriodBaptised.filter(m => m.baptismViaDepartment).length;
    const ministryMoisson = moissonBySource(ministryReports, effectivePeriod);
    const ministryOj = ojTotal(ministryReports, effectivePeriod);
    const ministryFollowUps = pendingFollowUps(ministryReports);
    const ministryRedCount = ministryMembers.filter(m => isRed(m)).length;
    const ministryGrowthData = weeklyGrowthSeries(ministryMembers, ministryReports, effectivePeriod);
    const ministryActivities = load('bc_activities', activitiesSeed).filter(a => mDeptIds.includes(a.departmentId));
    const ministryProjects = allProjects.filter(p => p.status === 'En cours' && p.scope === 'ministere' && p.ministryId === selected.id);

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

        {/* Sélecteur de période — mêmes options que l'Accueil/Départements, pilote Baptisés/Moisson/OJ ci-dessous */}
        <div className="flex justify-end">
          <PeriodSelector
            period={period}
            onPeriodChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>

        {/* KPI Row — mêmes tuiles que l'Accueil/Départements, scopées aux départements de ce ministère */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Folder size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Départements rattachés</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{mDepts.length}</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Users size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Actifs</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryActiveIds.size}</div>
            <Spark data={weeklyActiveCounts(ministryReports, effectivePeriod)} color="var(--color-bc-green)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Ont servi sur la période</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">Baptisés</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryPeriodBaptised.length}</div>
            <Spark data={weeklyBaptismCounts(ministryMembers, effectivePeriod)} color="var(--color-bc-success)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · {ministryBaptisedViaDept} Dépt · {ministryPeriodBaptised.length - ministryBaptisedViaDept} Fiche</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <TrendingUp size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Moisson</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryMoisson.adn + ministryMoisson.bus}</div>
            <Spark data={weeklyMoissonCounts(ministryReports, effectivePeriod)} color="var(--color-bc-gold)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Intégrés · {ministryMoisson.adn} ADN · {ministryMoisson.bus} Bus</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Sparkles size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">OJ « Oui à Jésus »</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryOj}</div>
            <Spark data={weeklyOjCounts(ministryReports, effectivePeriod)} color="var(--color-bc-cerulean)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · rapports ADN</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">À traiter</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryFollowUps.length}</div>
            <p className="text-[9px] text-bc-warning font-bold mt-1">Remontées avec suivi</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Clock size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Nouveau en attente</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Ring value={ministryPendingReception.length} total={ministryMembers.length} color="var(--color-bc-warning)" />
              <div>
                <div className="text-lg font-ui font-extrabold text-bc-warning tracking-tight leading-none">{ministryPendingReception.length}</div>
                <p className="text-[9px] text-bc-warning mt-1">Pas encore reçus en dépt</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <AlertCircle size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Au rouge</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Ring value={ministryRedCount} total={ministryMembers.length} color="var(--color-bc-danger)" />
              <div>
                <div className="text-lg font-ui font-extrabold text-bc-danger tracking-tight leading-none">{ministryRedCount}</div>
                <p className="text-[9px] text-bc-danger mt-1">Délais dépassés</p>
              </div>
            </div>
          </div>

          {/* Santé spirituelle — même ligne que les KPI, juste après "Au rouge" */}
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow col-span-2">
            <h3 className="text-[9px] font-bold uppercase tracking-wider text-bc-text-secondary mb-2">Santé Spirituelle du Ministère</h3>
            {ministryMembers.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-2">Aucun membre rattaché à ce ministère.</p>
            ) : (
              <div className="grid grid-cols-5 gap-1 w-full text-center">
                {HEALTH_AXES.filter(a => a.key !== 'presenceService').map(axis => (
                  <div key={axis.key} className="min-w-0">
                    <HealthSmiley value={dominantHealthLevel(ministryMembers, axis.key)} size={20} />
                    <div className="text-[7px] sm:text-[8px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Calendar size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Réunions à venir</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{ministryActivities.length}</div>
            <p className="text-[9px] text-bc-text-secondary mt-1">Activités récurrentes des départements</p>
          </div>
        </div>

        {/* Croissance & Projets — même ligne */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
            <h3 className="font-ui font-bold text-bc-text mb-2 tracking-tight">Croissance & Participants</h3>
            <div className="flex gap-4 text-[10px] font-bold text-bc-text-secondary">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bc-text inline-block" /> Nouveaux</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--accent-1)' }} /> Participants</span>
            </div>
            <div className="h-48 mt-2 min-w-0">
              <ResponsiveChart height="100%" minHeight={150}>
                <AreaChart data={ministryGrowthData}>
                  <defs>
                    <linearGradient id="ministryColorNouveaux" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-bc-text)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--color-bc-text)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="ministryColorParticipants" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="nouveaux" name="Nouveaux" stroke="var(--color-bc-text)" strokeWidth={2} fillOpacity={1} fill="url(#ministryColorNouveaux)" />
                  <Area type="monotone" dataKey="participants" name="Participants" stroke="var(--accent-1)" strokeWidth={2} fillOpacity={1} fill="url(#ministryColorParticipants)" />
                </AreaChart>
              </ResponsiveChart>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-ui font-bold text-bc-text tracking-tight flex items-center gap-2"><FolderKanban size={16} /> Projets en cours</h3>
            </div>
            {ministryProjects.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-4">Aucun projet en cours pour ce ministère.</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {ministryProjects.map(p => {
                  const pct = projectProgress(p);
                  return (
                    <div key={p.id} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-bc-text truncate">{p.name}</span>
                        <span className="text-[10px] font-bold text-bc-text-secondary shrink-0 ml-3">{pct}%</span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-bc-canvas">
                        <div className="bg-bc-green transition-all duration-700 ease-out-spring rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Departments List / Ranking */}
        <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6">
          <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Classement des Départements</h3>
          <div className="divide-y divide-bc-border">
            {rankedDepts.map(({ dept, h }) => {
              const responsable = members.find(m => m.departments?.[dept.id] === 'responsable');
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
        <Modal open={showCreate && canManage} onClose={() => setShowCreate(false)} title="Nouveau ministère" maxWidth="max-w-md" className="space-y-4">
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
                  operatorName: DEFAULT_OPERATOR_NAME,
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
        </Modal>
      )}

      <ConfirmDialog
        open={!!deletingMinistry}
        onCancel={() => setDeletingMinistry(null)}
        onConfirm={() => { if (deletingMinistry) deleteMinistry(deletingMinistry); }}
        title="Supprimer le ministère"
        message={deletingMinistry ? `Le ministère "${deletingMinistry.name}" sera définitivement supprimé. Les départements qui lui sont rattachés perdront cette affectation. Cette action est irréversible.` : ""}
        confirmLabel="Supprimer"
      />

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ministries.map((m, idx) => {
          const mDepts = departments.filter(d => d.ministryId === m.id);
          const isTarget = dragOverId === m.id;
          const accent = MINISTRY_ACCENTS[idx % MINISTRY_ACCENTS.length];
          const canOpen = canViewDetails || (simulatedRole === 'Ministre' && !!operator && m.tuteurId === operator.id);
          return (
          <motion.div
            variants={staggerItem}
            key={m.id}
            onClick={canOpen ? () => setSelectedId(m.id) : undefined}
            onDragOver={canEdit ? (e => { e.preventDefault(); setDragOverId(m.id); }) : undefined}
            onDragLeave={canEdit ? (() => setDragOverId(prev => (prev === m.id ? null : prev))) : undefined}
            onDrop={canEdit ? (e => {
              e.preventDefault();
              const deptId = e.dataTransfer.getData('text/plain');
              if (deptId) moveDept(deptId, m.id);
              setDragOverId(null);
            }) : undefined}
            className={`bg-white rounded-[2rem] border p-6 shadow-sm transition-all group flex flex-col ${canOpen ? 'cursor-pointer' : 'cursor-default'} ${
              isTarget ? 'border-bc-green ring-2 ring-bc-green/30' : `border-bc-border ${canOpen ? 'hover:shadow-md hover:border-bc-green/30' : ''}`
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
              <div className="flex items-center shrink-0">
                {canManage && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingMinistry(m); }}
                    className="p-1.5 rounded-xl text-bc-text-secondary hover:text-bc-danger transition-colors active-scale opacity-0 group-hover:opacity-100"
                    title="Supprimer le ministère"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {canOpen && (
                  <button className="text-bc-text-secondary group-hover:text-bc-text group-hover:translate-x-1 transition-all shrink-0">
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
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
