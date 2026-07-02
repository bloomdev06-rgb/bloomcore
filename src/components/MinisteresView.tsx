import React, { useState, useEffect } from 'react';
import { Branch, Ministry, Member, Department } from '../types';
import { Grid, ChevronRight, Users, Folder, ArrowLeft, BarChart3, GripVertical, Check } from 'lucide-react';
import { useMinistries, useDepartments, load, save } from '../data';
import { HealthSmiley } from './ui/HealthSmiley';

interface MinisteresViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
}

export default function MinisteresView({ activeBranch, simulatedRole, members }: MinisteresViewProps) {
  const seedMinistries = useMinistries();
  const seedDepartments = useDepartments();
  const isChurch = activeBranch === 'church';
  const canEdit = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);

  // ponytail: localStorage-backed local state — persists across reloads but does
  // NOT yet propagate to DepartmentsView/Member360 (shared sync = backend job).
  const [ministries, setMinistries] = useState<Ministry[]>(() => load('bc_ministries', seedMinistries));
  const [departments, setDepartments] = useState<Department[]>(() => load('bc_departments', seedDepartments));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => { save('bc_ministries', ministries); }, [ministries]);
  useEffect(() => { save('bc_departments', departments); }, [departments]);

  const updateMinistry = (id: string, patch: Partial<Ministry>) =>
    setMinistries(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const moveDept = (deptId: string, ministryId: string) =>
    setDepartments(prev => prev.map(d => (d.id === deptId ? { ...d, ministryId } : d)));

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

            {canEdit ? (
              <input
                value={selected.name}
                onChange={e => updateMinistry(selected.id, { name: e.target.value })}
                className="text-2xl font-ui font-extrabold text-bc-text bg-transparent border-b-2 border-transparent hover:border-bc-border focus:border-bc-green focus:outline-none transition-colors max-w-full"
              />
            ) : (
              <h2 className="text-2xl font-ui font-extrabold text-bc-text">{selected.name}</h2>
            )}

            <div className="flex items-center gap-3 mt-3">
              <span className="w-5 h-5 rounded-full bg-bc-green text-white flex items-center justify-center text-[10px] shrink-0">M</span>
              <span className="text-xs font-bold text-slate-700">Ministre de tutelle</span>
              {canEdit ? (
                <select
                  value={selected.tuteurId ?? ''}
                  onChange={e => updateMinistry(selected.id, { tuteurId: e.target.value || undefined })}
                  className="text-xs font-bold bg-slate-100 border border-bc-border rounded-full px-3 py-1.5 focus:outline-none focus:border-bc-green"
                >
                  <option value="">Non assigné</option>
                  {tuteurCandidates.map(m => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName} — {m.level}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs bg-slate-100 px-3 py-1 rounded-full font-bold text-slate-700">{tuteurName(selected.tuteurId)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Folder size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Départements rattachés</span>
            </div>
            <div className="text-2xl font-ui font-extrabold text-bc-text">{mDepts.length}</div>
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <Users size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Membres Actifs</span>
            </div>
            <div className="text-2xl font-ui font-extrabold text-bc-text">420</div>
            <p className="text-[10px] text-emerald-600 font-bold mt-1">+5% ce mois</p>
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm">
            <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
              <BarChart3 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Santé du Ministère</span>
            </div>
            <div className="text-2xl font-ui font-extrabold text-bc-text">Très bon</div>
            <p className="text-[10px] text-slate-400 mt-1">Basé sur les KPI départements</p>
          </div>
        </div>

        {/* Departments List / Ranking */}
        <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6">
          <h3 className="font-ui font-bold text-bc-text mb-4 tracking-tight">Classement des Départements</h3>
          <div className="divide-y divide-slate-100">
            {mDepts.map(dept => {
              const h = deptHealth(dept.id);
              return (
              <div key={dept.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-bc-text">{dept.name}</h4>
                  <p className="text-xs text-bc-text-secondary mt-0.5">{h.count} membre{h.count > 1 ? 's' : ''}</p>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ministries.map(m => {
          const mDepts = departments.filter(d => d.ministryId === m.id);
          const isTarget = dragOverId === m.id;
          return (
          <div
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
              isTarget ? 'border-bc-green ring-2 ring-bc-green/30' : 'border-bc-border hover:shadow-md hover:border-slate-300'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-ui font-bold text-bc-text leading-tight pr-2">{m.name}</h3>
              <button className="text-slate-400 group-hover:text-bc-text group-hover:translate-x-1 transition-all shrink-0">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-bc-text-secondary font-bold shrink-0">M</span>
                <span>Ministre: <span className="font-bold text-bc-text">{tuteurName(m.tuteurId)}</span></span>
              </div>

              {/* Departments — draggable chips for reassignment */}
              <div className="text-[10px] text-bc-text-secondary bg-bc-canvas p-2 rounded-xl border border-bc-border">
                <span className="font-bold uppercase tracking-wider block mb-1">Départements ({mDepts.length})</span>
                <div className="flex flex-wrap gap-1">
                  {mDepts.map(d => (
                    <span
                      key={d.id}
                      draggable={canEdit}
                      onClick={e => e.stopPropagation()}
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; }}
                      className={`bg-white px-2 py-0.5 rounded border border-bc-border truncate max-w-full flex items-center gap-1 ${canEdit ? 'cursor-grab active:cursor-grabbing hover:border-bc-green' : ''}`}
                    >
                      {canEdit && <GripVertical size={10} className="text-slate-300 shrink-0" />}
                      {d.name}
                    </span>
                  ))}
                  {mDepts.length === 0 && <span className="italic text-slate-400">Aucun département</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-bc-border">
                <div className="bg-bc-canvas p-3 rounded-xl border border-bc-border">
                  <div className="flex items-center gap-1.5 text-bc-text-secondary mb-1">
                    <Folder size={14} />
                    <span className="text-[10px] font-bold uppercase">Départements</span>
                  </div>
                  <span className="text-lg font-bold text-bc-text">{mDepts.length}</span>
                </div>
                <div className="bg-bc-canvas p-3 rounded-xl border border-bc-border">
                  <div className="flex items-center gap-1.5 text-bc-text-secondary mb-1">
                    <Check size={14} />
                    <span className="text-[10px] font-bold uppercase">Tutelle</span>
                  </div>
                  <span className="text-lg font-bold text-bc-text">{m.tuteurId ? 'Oui' : '--'}</span>
                </div>
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
