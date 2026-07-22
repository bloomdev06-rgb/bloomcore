import React, { useState } from 'react';
import { Branch, Member, Event, Report } from '../types';
import { Users, Bus, TrendingUp, AlertCircle, Clock, X, FolderKanban, Sparkles } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { PeriodSelector } from './ui/PeriodSelector';
import { motion } from 'motion/react';
import MiniCalendar from './MiniCalendar';
import { HealthSmiley } from './ui/HealthSmiley';
import {
  isRed, activeMemberIds, activeBusIds, moissonBySource, pendingFollowUps,
  periodHealthLevels, projectProgress, periodRange, Period, PeriodInput,
  weeklyBaptismCounts, weeklyActiveCounts, weeklyMoissonCounts, weeklyGrowthSeries,
  ojTotal, weeklyOjCounts,
} from '../data/kpi';
import { useBusLines, useProjects, useDepartments, useMinistries, labelFor } from '../data';
import { dashboardScope } from '../data/scope';

interface DashboardViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  events?: Event[];
  reports?: Report[];
  setActiveTab?: (tab: string) => void;
  onOpenQuickNewForm?: () => void;
  operatorId?: string;
  onMarkReportTreated?: (reportId: string) => void;
}

// Mini courbe de tendance dans une tuile KPI (8 semaines, sans axes ni tooltip).
export function Spark({ data, color }: { data: { week: string; count: number }[]; color: string }) {
  return (
    <div className="h-8 mt-1 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <Area type="monotone" dataKey="count" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Anneau de proportion (valeur/total) pour les tuiles KPI qui sont une vraie part d'un tout.
export function Ring({ value, total, color, size = 32, onClick }: { value: number; total: number; color: string; size?: number; onClick?: () => void }) {
  const r = (size / 32) * 14;
  const C = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const center = size / 2;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 -rotate-90 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--color-bc-border)" strokeWidth="3" />
      <circle
        cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
        className="transition-[stroke-dashoffset] duration-700 ease-out-spring"
      />
    </svg>
  );
}

export const HEALTH_AXES = [
  { key: 'spirituel', label: 'Spirituelle' },
  { key: 'social', label: 'Sociale' },
  { key: 'physique', label: 'Physique' },
  { key: 'financier', label: 'Financière' },
  { key: 'presenceCulte', label: 'Présence culte' },
  { key: 'presenceService', label: 'Présence service' },
] as const;

export default function DashboardView({ activeBranch, simulatedRole, members = [], events = [], reports = [], setActiveTab, operatorId, onMarkReportTreated }: DashboardViewProps) {
  const go = (tab: string) => setActiveTab?.(tab);
  const isChurch = activeBranch === 'church';
  // ponytail: défaut "semaine en cours" (fenêtre glissante 7j) — demandé pour la santé globale, appliqué au sélecteur entier.
  const [period, setPeriod] = useState<Period>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showFollowUps, setShowFollowUps] = useState(false);
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;

  const operator = members.find(m => m.id === operatorId) ?? members[0];
  const departments = useDepartments();
  const ministries = useMinistries();
  const deptName = (id?: string) => departments.find(d => d.id === id)?.name ?? '';

  // §13.3 — portée selon le rôle (helper dashboardScope) : Ministre → ses
  // ministères, Responsable/Coach/Leader → leur département, staff pastoral → global. Rapports
  // scopés par MEMBRE (les tendances sont clés par content.memberId, pas departmentId).
  const scope = dashboardScope(operator, simulatedRole, members, reports, departments, ministries);
  const ownMinistry = simulatedRole === 'Ministre' ? ministries.find(m => m.tuteurId === operator?.id) : undefined;
  const homeDeptId = scope.deptIds?.[0];

  const branchMembers = scope.members.filter(m => activeBranch === 'global' || m.branch === activeBranch);
  const branchReports = scope.reports.filter(r => activeBranch === 'global' || r.targetBranch === activeBranch);
  const branchEvents = events.filter(e => activeBranch === 'global' || e.branch === activeBranch || e.branch === 'global');
  const waitingCount = branchMembers.filter(m => m.integrationState === 'en_attente').length;
  const redCount = branchMembers.filter(m => isRed(m, undefined, reports)).length;
  const pendingReceptionsCount = branchMembers.filter(m => m.integrationState === 'en_attente' && m.receptionValidated === false).length;
  // Actif = a servi ≥ 1 fois sur la période du sélecteur.
  const activeCount = activeMemberIds(branchReports, effectivePeriod).size;
  // Agenda Proche : les 3 prochains événements réels non clôturés de la branche.
  const todayIso = new Date().toISOString().split('T')[0];
  const upcomingEvents = branchEvents
    .filter(e => !e.closed && !e.cancelled && e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    .slice(0, 3);
  const activeBusCount = activeBusIds(branchReports, effectivePeriod).size;
  const totalBusLines = useBusLines().length;
  const moisson = moissonBySource(branchReports, effectivePeriod);
  const oj = ojTotal(branchReports, effectivePeriod);
  const { from: pFrom, to: pTo } = periodRange(effectivePeriod);
  const periodBaptised = branchMembers.filter(m => m.baptismDate && new Date(m.baptismDate) >= pFrom && new Date(m.baptismDate) <= pTo);
  const baptisedViaDept = periodBaptised.filter(m => m.baptismViaDepartment).length;
  // "Nouveau en attente" — enregistrés et orientés vers un département, pas encore reçus par le responsable.
  const nouveauxEnAttente = branchMembers.filter(m =>
    m.level === 'nouveau' && Object.keys(m.departments ?? {}).length > 0 && m.receptionValidated === false).length;
  const followUps = pendingFollowUps(branchReports);
  // §8.3 — même règle de confidentialité que ReportsView : le corps pastoral seul voit le contenu.
  const canSeeConfidential = ['Pasteur', 'Pasteur Principal', 'Ministre'].includes(simulatedRole);
  const health = periodHealthLevels(branchReports, effectivePeriod);
  const projectsInProgress = useProjects().filter(p =>
    p.status === 'En cours' && (activeBranch === 'global' || (p.scope === 'branche' && p.branch === activeBranch) || p.scope === 'transverse' || p.scope === 'ministere'));

  // §13.3 — dashboard par profil. Encadrement = tableau décisionnel ; autres = tableau personnel.
  const LEADERSHIP = ['Pasteur', 'Pasteur Principal', 'Ministre', 'Admin', 'Super Admin', 'Responsable', 'Coach', 'Leader'];
  const isLeadership = LEADERSHIP.includes(simulatedRole);
  const scopeLabel =
    ['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'].includes(simulatedRole) ? 'les deux branches'
    : simulatedRole === 'Ministre' ? `votre ministère${ownMinistry ? ` (${ownMinistry.name})` : ''}`
    : `votre département${homeDeptId ? ` (${deptName(homeDeptId)})` : ''}`;

  // --- Personal dashboard (profils non-encadrants) ---
  if (!isLeadership && operator) {
    return (
      <div className="space-y-6">
        <div className="bg-bc-green rounded-[2rem] p-6 text-white">
          <h2 className="text-2xl font-ui font-extrabold tracking-tight">Bonjour, {operator.firstName}</h2>
          <p className="text-white/80 text-sm mt-1">Voici votre tableau de bord personnel · {simulatedRole}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ma santé — 6 axes */}
          <div className="lg:col-span-2 bg-white rounded-[2rem] border border-bc-border p-6">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4">Ma santé communautaire</h3>
            <div className="space-y-3">
              {HEALTH_AXES.map(axis => {
                const v = (operator.healthKPIs as any)[axis.key] ?? 0;
                return (
                  <div key={axis.key} className="flex items-center gap-3">
                    <span className="text-xs text-bc-text-secondary w-32 shrink-0">{axis.label}</span>
                    <div className="flex-1 h-2.5 bg-bc-canvas rounded-full overflow-hidden">
                      <div className="h-full bg-bc-green rounded-full" style={{ width: `${(v / 5) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-bc-text w-6 text-right">{v}/5</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mon parcours + actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] border border-bc-border p-6">
              <h3 className="text-sm font-ui font-bold text-bc-text mb-3">Mon parcours</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Niveau</span><span className="font-bold text-bc-text">{labelFor(operator.level)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Cursus</span><span className="font-bold text-bc-text">{labelFor(operator.pastoralCursus)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Départements</span><span className="font-bold text-bc-text">{Object.keys(operator.departments ?? {}).length}</span></div>
              </div>
            </div>
            <button onClick={() => go('profile')} className="w-full py-3 bg-bc-text text-white rounded-[2rem] text-xs font-ui font-bold hover:opacity-90 active-scale">
              Voir mon profil complet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Croissance & Participants — données réelles (nouveaux enregistrés + actifs par semaine).
  const growthData = weeklyGrowthSeries(branchMembers, branchReports, effectivePeriod);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 30 } }
  };

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-full gap-6 flex-1">
      
      {/* Main Content Area */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex-1 flex flex-col gap-6 lg:overflow-y-auto pb-6 no-scrollbar shrink-0 lg:shrink"
      >
        
        {/* Welcome Banner */}
        <motion.div variants={itemVariants} className="bg-bc-green rounded-[2rem] p-6 text-white relative overflow-hidden shrink-0">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-ui font-extrabold mb-1 tracking-tight">Bonjour, {simulatedRole}</h2>
              <p className="text-white/80 text-sm">
                Voici la synthèse pour {scopeLabel} au {new Date().toLocaleDateString('fr-FR')}. <br/>
                <span className="text-bc-success font-bold">{waitingCount} nouveaux</span> en attente de suivi.
              </p>
            </div>
            
            <PeriodSelector
              variant="dark"
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
            />
          </div>
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-white/10 to-transparent pointer-events-none" />
        </motion.div>

        {/* KPI Row */}
        <motion.div variants={itemVariants} className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 shrink-0">
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Users size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Actifs</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{activeCount}</div>
            <Spark data={weeklyActiveCounts(branchReports, effectivePeriod)} color="var(--color-bc-green)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Ont servi sur la période</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">Baptisés</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{periodBaptised.length}</div>
            <Spark data={weeklyBaptismCounts(branchMembers, effectivePeriod)} color="var(--color-bc-success)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · {baptisedViaDept} Dépt · {periodBaptised.length - baptisedViaDept} Fiche</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Bus size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Bloom Bus</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Ring value={activeBusCount} total={totalBusLines} color="var(--color-bc-cerulean)" />
              <div>
                <div className="text-lg font-ui font-extrabold text-bc-text tracking-tight leading-none">{activeBusCount}<span className="text-xs text-bc-text-secondary font-normal">/{totalBusLines}</span></div>
                <p className="text-[9px] text-bc-text-secondary mt-1">lignes actives</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <TrendingUp size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Moisson</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{moisson.adn + moisson.bus}</div>
            <Spark data={weeklyMoissonCounts(branchReports, effectivePeriod)} color="var(--color-bc-gold)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Intégrés · {moisson.adn} ADN · {moisson.bus} Bus</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Sparkles size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">OJ « Oui à Jésus »</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{oj}</div>
            <Spark data={weeklyOjCounts(branchReports, effectivePeriod)} color="var(--color-bc-cerulean)" />
            <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · rapports ADN</p>
          </div>

          <button
            type="button"
            onClick={() => setShowFollowUps(true)}
            className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow text-left cursor-pointer active-scale"
          >
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">À traiter</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{followUps.length}</div>
            <p className="text-[9px] text-bc-warning font-bold mt-1">Remontées avec suivi · voir la liste</p>
          </button>

          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Clock size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Nouveau en attente</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Ring value={nouveauxEnAttente} total={branchMembers.length} color="var(--color-bc-warning)" />
              <div>
                <div className="text-lg font-ui font-extrabold text-bc-warning tracking-tight leading-none">{nouveauxEnAttente}</div>
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
              <Ring value={redCount} total={branchMembers.length} color="var(--color-bc-danger)" />
              <div>
                <div className="text-lg font-ui font-extrabold text-bc-danger tracking-tight leading-none">{redCount}</div>
                <p className="text-[9px] text-bc-danger mt-1">Délais dépassés</p>
              </div>
            </div>
          </div>

          {/* Santé spirituelle — même ligne que les KPI, juste après "Au rouge" */}
          <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow col-span-2">
            <h3 className="text-[9px] font-bold uppercase tracking-wider text-bc-text-secondary mb-2">Santé Spirituelle Globale</h3>
            <div className="grid grid-cols-5 gap-1 w-full text-center">
              {HEALTH_AXES.filter(a => a.key !== 'presenceService').map(axis => (
                <div key={axis.key} className="min-w-0">
                  <HealthSmiley value={health[axis.key as keyof typeof health]} size={20} />
                  <div className="text-[7px] sm:text-[8px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Croissance & Projets — même ligne */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">

          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
            <h3 className="font-ui font-bold text-bc-text mb-2 tracking-tight">Croissance & Participants</h3>
            <div className="flex gap-4 text-[10px] font-bold text-bc-text-secondary">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bc-text inline-block" /> Nouveaux</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--accent-1)' }} /> Participants</span>
            </div>
            <div className="h-48 mt-2 min-w-0">
              <ResponsiveChart height="100%" minHeight={150}>
                <AreaChart data={growthData}>
                  <defs>
                    <linearGradient id="colorNouveaux" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-bc-text)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--color-bc-text)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorParticipants" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="nouveaux" name="Nouveaux" stroke="var(--color-bc-text)" strokeWidth={2} fillOpacity={1} fill="url(#colorNouveaux)" />
                  <Area type="monotone" dataKey="participants" name="Participants" stroke="var(--accent-1)" strokeWidth={2} fillOpacity={1} fill="url(#colorParticipants)" />
                </AreaChart>
              </ResponsiveChart>
            </div>
          </div>

          {/* Projets en cours (remplace la file d'intégration — les KPIs d'intégration sont déjà plus haut) */}
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-ui font-bold text-bc-text tracking-tight flex items-center gap-2"><FolderKanban size={16} /> Projets en cours</h3>
              <button onClick={() => go('projects')} className="text-xs font-bold text-bc-text-secondary hover:text-bc-text transition-colors">Voir tout →</button>
            </div>
            {projectsInProgress.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-4">Aucun projet en cours.</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {projectsInProgress.map(p => {
                  const pct = projectProgress(p);
                  return (
                    <div key={p.id} onClick={() => go('projects')} className="cursor-pointer group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-bc-text group-hover:text-bc-green transition-colors truncate">{p.name}</span>
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
        </motion.div>

      </motion.div>

      {/* Right Rail: "Agenda, À traiter aujourd'hui" */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.3 }}
        className="w-full lg:w-80 bg-white rounded-[2rem] border border-bc-border p-6 flex flex-col gap-6 shrink-0 shadow-sm lg:overflow-y-auto no-scrollbar"
      >
        
        <MiniCalendar events={branchEvents} />

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Agenda Proche</h3>
          <div className="space-y-3">
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic">Aucun événement à venir.</p>
            ) : (
              upcomingEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setActiveTab?.('events')}
                  className="w-full text-left flex gap-4 p-3 hover:bg-bc-canvas rounded-2xl transition-colors cursor-pointer border border-transparent hover:border-bc-border"
                >
                  <div className="w-12 h-12 rounded-xl bg-bc-canvas flex flex-col items-center justify-center shrink-0 text-bc-text">
                    <span className="text-[10px] font-bold uppercase">
                      {new Date(`${ev.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-sm font-black">{Number(ev.date.slice(8, 10))}</span>
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    <p className="text-xs font-bold text-bc-text truncate">{ev.title}</p>
                    <p className="text-[10px] text-bc-text-secondary mt-0.5">
                      {ev.time ?? ''}{ev.endTime ? `–${ev.endTime}` : ''} · {ev.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2 tracking-tight">
            À traiter aujourd'hui
          </h3>
          <div className="space-y-3">
            <div onClick={() => go('integration')} className="p-4 bg-bc-warning/10 rounded-2xl border border-bc-warning/20 cursor-pointer hover:bg-bc-warning/15 transition-colors active-scale">
              <p className="text-xs font-bold text-bc-warning">{pendingReceptionsCount} Réceptions en attente</p>
              <p className="text-[10px] text-bc-warning mt-1">À valider par les départements</p>
            </div>
            {/* ponytail: "rapports attendus" n'a pas de baseline définie (KPIS.md §4) — placeholder tant qu'elle n'existe pas. */}
            <div onClick={() => go('events')} className="p-4 bg-bc-canvas/50 rounded-2xl border border-bc-border cursor-pointer hover:bg-bc-canvas transition-colors active-scale">
              <p className="text-xs font-bold text-bc-text-secondary">Rapports de culte manquants — à définir</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2 tracking-tight text-bc-danger">
            Alertes système
          </h3>
          <div className="space-y-3">
            <div onClick={() => go('integration')} className="p-4 bg-bc-danger/10 rounded-2xl border border-bc-danger/20 cursor-pointer hover:bg-bc-danger/15 transition-colors active-scale flex items-start gap-2.5">
              {redCount > 0 && (
                <span className="relative w-2 h-2 mt-1 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-bc-danger animate-ping opacity-60 motion-reduce:hidden" />
                  <span className="absolute inset-0 rounded-full bg-bc-danger" />
                </span>
              )}
              <div>
                <p className="text-xs font-bold text-bc-danger">{redCount} Membres au rouge</p>
                <p className="text-[10px] text-bc-danger mt-1">Délais d'intégration dépassés (&gt;7 jours)</p>
              </div>
            </div>
          </div>
        </div>

      </motion.div>

      {/* Modal "À traiter" — remontées avec suivi non traitées, lignes denses */}
      {showFollowUps && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowFollowUps(false)}>
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-bc-border shrink-0">
              <h3 className="font-ui font-bold text-bc-text tracking-tight">À traiter · {followUps.length} remontée{followUps.length > 1 ? 's' : ''} avec suivi</h3>
              <button onClick={() => setShowFollowUps(false)} className="p-1.5 rounded-full hover:bg-bc-canvas active-scale" aria-label="Fermer"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-bc-border">
              {followUps.length === 0 && (
                <p className="text-xs text-bc-text-secondary italic text-center py-8">Aucune remontée en attente de traitement.</p>
              )}
              {followUps.map(r => {
                const hidden = r.confidential && !canSeeConfidential;
                const isCoach = r.reportType === 'rapport_suivi_coach';
                const memberName = isCoach ? (() => {
                  const m = members.find(mm => mm.id === r.content?.memberId);
                  return m ? `${m.firstName} ${m.lastName}` : '';
                })() : '';
                return (
                  <div key={r.id} className="flex items-center gap-3 px-6 py-2.5 text-xs">
                    <span className="w-12 shrink-0 text-bc-text-secondary tabular-nums">{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${isCoach ? 'bg-bc-purple/10 text-bc-purple' : 'bg-bc-warning/10 text-bc-warning'}`}>
                      {isCoach ? 'Suivi coach' : 'Observation'}
                    </span>
                    {hidden ? (
                      <span className="flex-1 italic text-bc-text-secondary truncate">Confidentiel — réservé au corps pastoral</span>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 truncate text-bc-text">
                          <span className="font-bold">{r.authorName}</span>
                          {deptName(r.departmentId) && <span className="text-bc-text-secondary"> · {deptName(r.departmentId)}</span>}
                          {memberName && <span className="text-bc-text-secondary"> · {memberName}</span>}
                          {r.content?.notes && <span className="text-bc-text-secondary"> — {r.content.notes}</span>}
                        </span>
                        <button
                          onClick={() => onMarkReportTreated?.(r.id)}
                          className="shrink-0 px-3 py-1 rounded-full bg-bc-green text-white text-[10px] font-bold active-scale"
                        >
                          Marquer traité
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
