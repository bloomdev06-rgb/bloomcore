import React, { useState } from 'react';
import { Branch, Member, Event } from '../types';
import { LayoutDashboard, Users, Bus, TrendingUp, AlertCircle, Calendar, Clock, Smile, Meh, Star, Frown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { motion } from 'motion/react';
import MiniCalendar from './MiniCalendar';
import { dominantHealthLevel } from '../data/kpi';

interface DashboardViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  events?: Event[];
  setActiveTab?: (tab: string) => void;
  onOpenQuickNewForm?: () => void;
}

// Health level 1..5 → face + colour for the "un smiley par critère" row.
const FACE: Record<number, { Icon: typeof Smile; color: string }> = {
  0: { Icon: Meh, color: 'text-slate-300' },
  1: { Icon: Frown, color: 'text-red-500' },
  2: { Icon: Frown, color: 'text-orange-500' },
  3: { Icon: Meh, color: 'text-yellow-500' },
  4: { Icon: Smile, color: 'text-emerald-400' },
  5: { Icon: Star, color: 'text-emerald-600' },
};

const HEALTH_AXES = [
  { key: 'spirituel', label: 'Spirituelle' },
  { key: 'social', label: 'Sociale' },
  { key: 'physique', label: 'Physique' },
  { key: 'financier', label: 'Financière' },
  { key: 'presenceCulte', label: 'Présence culte' },
  { key: 'presenceService', label: 'Présence service' },
] as const;

export default function DashboardView({ activeBranch, simulatedRole, members = [], setActiveTab }: DashboardViewProps) {
  const go = (tab: string) => setActiveTab?.(tab);
  const isChurch = activeBranch === 'church';
  const [period, setPeriod] = useState('month');

  const branchMembers = members.filter(m => activeBranch === 'global' || m.branch === activeBranch);
  const waitingCount = branchMembers.filter(m => m.integrationState === 'En attente').length;

  // §13.3 — dashboard par profil. Encadrement = tableau décisionnel ; autres = tableau personnel.
  const LEADERSHIP = ['Pasteur', 'Pasteur Principal', 'Ministre', 'Admin', 'Super Admin', 'Responsable', 'Coach', 'Leader'];
  const isLeadership = LEADERSHIP.includes(simulatedRole);
  const scopeLabel =
    ['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'].includes(simulatedRole) ? 'les deux branches'
    : simulatedRole === 'Ministre' ? 'votre ministère'
    : 'votre département';
  const operator = members.find(m => m.id === 'mem_1') ?? members[0];

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
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Niveau</span><span className="font-bold text-bc-text">{operator.level}</span></div>
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Cursus</span><span className="font-bold text-bc-text">{operator.pastoralCursus}</span></div>
                <div className="flex justify-between text-xs"><span className="text-bc-text-secondary">Départements</span><span className="font-bold text-bc-text">{Object.keys(operator.departments ?? {}).length}</span></div>
              </div>
            </div>
            <button onClick={() => go('profile')} className="w-full py-3 bg-bc-text text-white rounded-[2rem] text-xs font-ui font-bold hover:opacity-90">
              Voir mon profil complet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dummy data for growth chart
  const growthData = [
    { name: 'S1', nouveaux: 45, participants: 320 },
    { name: 'S2', nouveaux: 52, participants: 340 },
    { name: 'S3', nouveaux: 38, participants: 310 },
    { name: 'S4', nouveaux: 65, participants: 380 },
  ];

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
              <p className="text-slate-400 text-sm">
                Voici la synthèse pour {scopeLabel} au {new Date().toLocaleDateString('fr-FR')}. <br/>
                <span className="text-emerald-400 font-bold">{waitingCount} nouveaux</span> en attente de suivi.
              </p>
            </div>
            
            <select 
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-white/10 border border-white/20 text-white rounded-full px-4 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-white w-full md:w-auto cursor-pointer"
            >
              <option value="week">Cette Semaine</option>
              <option value="month">Ce Mois</option>
              <option value="quarter">Ce Trimestre</option>
              <option value="year">Cette Année</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-white/10 to-transparent pointer-events-none" />
        </motion.div>

        {/* KPI Row */}
        <motion.div variants={itemVariants} className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 shrink-0">
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Users size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Actifs</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">1,245</div>
            <p className="text-[9px] text-emerald-600 font-bold mt-1">+12% ce mois</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">Baptisés</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">850 <span className="text-sm text-slate-400 font-normal">/ 395</span></div>
            <p className="text-[9px] text-emerald-600 font-bold mt-1">+8 nvx baptisés</p>
          </div>
          
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Bus size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Bloom Bus</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">42</div>
            <p className="text-[9px] text-slate-400 mt-1">Actifs</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <TrendingUp size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Moisson</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">128</div>
            <p className="text-[9px] text-slate-400 mt-1">Nouveaux gagnés</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider">Remontées</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">24</div>
            <p className="text-[9px] text-orange-500 font-bold mt-1">Nécessitant suivi</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Clock size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">En attente</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-orange-500 tracking-tight">{waitingCount}</div>
            <p className="text-[9px] text-orange-400 mt-1">Réceptions à valider</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <AlertCircle size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Au rouge</span>
            </div>
            <div className="text-xl font-ui font-extrabold text-red-500 tracking-tight">14</div>
            <p className="text-[9px] text-red-400 mt-1">Délais dépassés</p>
          </div>
        </motion.div>

        {/* Charts & Health Row */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
          
          {/* Health Row (Faces) */}
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm flex flex-col justify-center">
            <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Santé Spirituelle Globale</h3>
            <div className="flex flex-col h-full justify-center space-y-4">
              <div className="grid grid-cols-5 gap-1 w-full text-center">
                {HEALTH_AXES.map(axis => {
                  const level = dominantHealthLevel(branchMembers, axis.key);
                  const { Icon, color } = FACE[level] ?? FACE[0];
                  return (
                    <div key={axis.key} className="min-w-0">
                      <Icon className={`w-6 h-6 ${color} mx-auto mb-1`} strokeWidth={2.5} />
                      <div className={`text-[9px] sm:text-[10px] font-bold ${color} truncate`}>{axis.label}</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-[10px] text-slate-400">Niveau dominant par critère (sur {branchMembers.length} membres)</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
            <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Croissance & Participants</h3>
            <div className="h-48 mt-4 min-w-0">
              <ResponsiveChart height="100%" minHeight={150}>
                <AreaChart data={growthData}>
                  <defs>
                    <linearGradient id="colorNouveaux" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F172A" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0F172A" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorParticipants" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#009BDE" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#009BDE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="nouveaux" name="Nouveaux" stroke="#0F172A" strokeWidth={2} fillOpacity={1} fill="url(#colorNouveaux)" />
                  <Area type="monotone" dataKey="participants" name="Participants" stroke="#009BDE" strokeWidth={2} fillOpacity={1} fill="url(#colorParticipants)" />
                </AreaChart>
              </ResponsiveChart>
            </div>
          </div>
        </motion.div>

        {/* Integration Queue */}
        <motion.div variants={itemVariants} className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm shrink-0 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-ui font-bold text-bc-text tracking-tight">File d'intégration</h3>
            <button className="text-xs font-bold text-bc-text-secondary hover:text-bc-text transition-colors">Voir tout →</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-[1.5rem] bg-orange-50/50 border border-orange-100 flex flex-col justify-center items-center">
              <span className="text-2xl font-black text-orange-600 mb-1">12</span>
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">En attente</span>
            </div>
            <div className="p-4 rounded-[1.5rem] bg-blue-50/50 border border-blue-100 flex flex-col justify-center items-center">
              <span className="text-2xl font-black text-blue-600 mb-1">28</span>
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">En suivi</span>
            </div>
            <div className="p-4 rounded-[1.5rem] bg-emerald-50/50 border border-emerald-100 flex flex-col justify-center items-center">
              <span className="text-2xl font-black text-emerald-600 mb-1">45</span>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Intégrés</span>
            </div>
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
        
        <MiniCalendar />

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Agenda Proche</h3>
          <div className="space-y-3">
            <div className="flex gap-4 p-3 hover:bg-bc-canvas rounded-2xl transition-colors cursor-pointer border border-transparent hover:border-bc-border">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0 text-bc-text">
                <span className="text-[10px] font-bold uppercase">Dim</span>
                <span className="text-sm font-black">24</span>
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-xs font-bold text-bc-text">Culte Dominical 1</p>
                <p className="text-[10px] text-bc-text-secondary mt-0.5">08:00 - Bloom Church</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2 tracking-tight">
            À traiter aujourd'hui
          </h3>
          <div className="space-y-3">
            <div onClick={() => go('integration')} className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 cursor-pointer hover:bg-orange-50 transition-colors">
              <p className="text-xs font-bold text-orange-700">8 Réceptions en attente</p>
              <p className="text-[10px] text-orange-500 mt-1">À valider par les départements</p>
            </div>
            <div onClick={() => go('events')} className="p-4 bg-bc-canvas/50 rounded-2xl border border-bc-border cursor-pointer hover:bg-bc-canvas transition-colors">
              <p className="text-xs font-bold text-slate-700">3 Rapports de culte manquants</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2 tracking-tight text-red-500">
            Alertes système
          </h3>
          <div className="space-y-3">
            <div onClick={() => go('integration')} className="p-4 bg-red-50/50 rounded-2xl border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
              <p className="text-xs font-bold text-red-700">14 Membres au rouge</p>
              <p className="text-[10px] text-red-500 mt-1">Délais d'intégration dépassés (&gt;7 jours)</p>
            </div>
          </div>
        </div>

      </motion.div>

    </div>
  );
}
