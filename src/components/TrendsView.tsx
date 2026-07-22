import React, { useState } from 'react';
import { Branch, Member, Report } from '../types';
import { TrendingUp, Users, Sparkles, Bus, Church, Droplets } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { PeriodSelector } from './ui/PeriodSelector';
import { HealthSmiley } from './ui/HealthSmiley';
import { HEALTH_AXES } from './DashboardView';
import {
  Period, PeriodInput,
  weeklyGrowthSeries, weeklyActiveCounts, weeklyMoissonCounts, weeklyBaptismCounts,
  weeklyOjCounts, weeklyCulteCounts, moissonBySource, periodHealthLevels,
} from '../data/kpi';

interface TrendsViewProps {
  activeBranch: Branch;
  members?: Member[];
  reports?: Report[];
}

const sum = (s: { count: number }[]) => s.reduce((a, b) => a + b.count, 0);

// Une carte "graphe hebdo" réutilisable (série {week,count}).
function TrendCard({ title, icon, total, subtitle, data, color, area = false }: {
  title: string; icon: React.ReactNode; total: number; subtitle: string;
  data: { week: string; count: number }[]; color: string; area?: boolean;
}) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-ui font-bold text-bc-text tracking-tight flex items-center gap-2">{icon} {title}</h3>
        <span className="text-2xl font-ui font-extrabold text-bc-text tracking-tight tabular-nums">{total}</span>
      </div>
      <p className="text-[10px] text-bc-text-secondary mb-2">{subtitle}</p>
      <div className="h-40 min-w-0">
        <ResponsiveChart height="100%" minHeight={130}>
          {area ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bc-border)" vertical={false} />
              <XAxis dataKey="week" fontSize={9} axisLine={false} tickLine={false} />
              <YAxis fontSize={9} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
              <Area type="monotone" dataKey="count" name={title} stroke={color} strokeWidth={2} fill={`url(#grad-${title})`} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bc-border)" vertical={false} />
              <XAxis dataKey="week" fontSize={9} axisLine={false} tickLine={false} />
              <YAxis fontSize={9} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name={title} stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveChart>
      </div>
    </div>
  );
}

export default function TrendsView({ activeBranch, members = [], reports = [] }: TrendsViewProps) {
  const [period, setPeriod] = useState<Period>('quarter'); // défaut trimestre : une tendance a besoin de recul
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;

  const branchMembers = members.filter(m => activeBranch === 'global' || m.branch === activeBranch);
  const branchReports = reports.filter(r => activeBranch === 'global' || r.targetBranch === activeBranch);

  const growth = weeklyGrowthSeries(branchMembers, branchReports, effectivePeriod);
  const active = weeklyActiveCounts(branchReports, effectivePeriod);
  const moissonSeries = weeklyMoissonCounts(branchReports, effectivePeriod);
  const baptism = weeklyBaptismCounts(branchMembers, effectivePeriod);
  const oj = weeklyOjCounts(branchReports, effectivePeriod);
  const culte = weeklyCulteCounts(branchReports, effectivePeriod);
  const moisson = moissonBySource(branchReports, effectivePeriod);
  const health = periodHealthLevels(branchReports, effectivePeriod);

  return (
    <div className="space-y-6 pb-6">
      {/* Bandeau + sélecteur de période */}
      <div className="bg-bc-green rounded-[2rem] p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-ui font-extrabold tracking-tight flex items-center gap-2"><TrendingUp size={22} /> Tendances</h2>
          <p className="text-white/80 text-sm mt-1">Évolution hebdomadaire des indicateurs clés.</p>
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

      {/* Croissance & Participants — pleine largeur */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm min-w-0">
        <h3 className="font-ui font-bold text-bc-text mb-2 tracking-tight">Croissance & Participants</h3>
        <div className="flex gap-4 text-[10px] font-bold text-bc-text-secondary mb-2">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bc-text inline-block" /> Nouveaux</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--accent-1)' }} /> Participants</span>
        </div>
        <div className="h-56 min-w-0">
          <ResponsiveChart height="100%" minHeight={160}>
            <AreaChart data={growth} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="tr-nouveaux" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-bc-text)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="var(--color-bc-text)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tr-participants" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bc-border)" vertical={false} />
              <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={9} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
              <Area type="monotone" dataKey="nouveaux" name="Nouveaux" stroke="var(--color-bc-text)" strokeWidth={2} fill="url(#tr-nouveaux)" />
              <Area type="monotone" dataKey="participants" name="Participants" stroke="var(--accent-1)" strokeWidth={2} fill="url(#tr-participants)" />
            </AreaChart>
          </ResponsiveChart>
        </div>
      </div>

      {/* Grille de courbes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendCard title="Actifs" icon={<Users size={16} />} total={sum(active)} subtitle="Membres ayant servi, par semaine"
          data={active} color="var(--color-bc-green)" area />
        <TrendCard title="Moisson" icon={<TrendingUp size={16} />} total={moisson.adn + moisson.bus}
          subtitle={`Intégrés · ${moisson.adn} ADN · ${moisson.bus} Bus`} data={moissonSeries} color="var(--color-bc-gold)" area />
        <TrendCard title="Baptêmes" icon={<Droplets size={16} />} total={sum(baptism)} subtitle="Baptisés par semaine"
          data={baptism} color="var(--color-bc-success)" />
        <TrendCard title="OJ « Oui à Jésus »" icon={<Sparkles size={16} />} total={sum(oj)} subtitle="Décisions par semaine (ADN)"
          data={oj} color="var(--color-bc-cerulean)" />
        <TrendCard title="Présence culte" icon={<Church size={16} />} total={sum(culte)} subtitle="Présences au culte (rapports Bloom Bus)"
          data={culte} color="var(--color-bc-purple)" area />
        {/* Santé communautaire — niveaux moyens sur la période (5 axes) */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm min-w-0">
          <h3 className="font-ui font-bold text-bc-text mb-3 tracking-tight flex items-center gap-2"><Bus size={16} /> Santé communautaire</h3>
          <p className="text-[10px] text-bc-text-secondary mb-4">Niveau moyen sur la période sélectionnée</p>
          <div className="grid grid-cols-5 gap-1 text-center">
            {HEALTH_AXES.filter(a => a.key !== 'presenceService').map(axis => (
              <div key={axis.key} className="min-w-0">
                <HealthSmiley value={health[axis.key as keyof typeof health]} size={28} />
                <div className="text-[8px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
