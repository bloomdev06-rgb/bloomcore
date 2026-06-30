import React, { useState } from 'react';
import { Branch, Ministry } from '../types';
import { Grid, ChevronRight, Users, Folder, ArrowLeft, BarChart3, Settings } from 'lucide-react';
import { INITIAL_MINISTRIES, INITIAL_DEPARTMENTS } from '../mockData';

interface MinisteresViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

export default function MinisteresView({ activeBranch, simulatedRole }: MinisteresViewProps) {
  const isChurch = activeBranch === 'church';
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);

  if (selectedMinistry) {
    const mDepts = INITIAL_DEPARTMENTS.filter(d => d.ministryId === selectedMinistry.id);
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex justify-between items-start">
          <div>
            <button 
              onClick={() => setSelectedMinistry(null)}
              className="flex items-center text-xs font-bold text-bc-text-secondary hover:text-bc-text transition-colors mb-4"
            >
              <ArrowLeft size={14} className="mr-1" /> Retour aux ministères
            </button>
            <h2 className="text-2xl font-ui font-extrabold text-bc-text">{selectedMinistry.name}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-full text-xs font-bold text-slate-700">
                <span className="w-5 h-5 rounded-full bg-bc-green text-white flex items-center justify-center text-[10px]">M</span>
                Ministre de tutelle: Non assigné
              </span>
            </div>
          </div>
          {['Admin', 'Super Admin'].includes(simulatedRole) && (
            <button className="p-2 border border-bc-border rounded-full text-bc-text-secondary hover:bg-bc-canvas hover:text-bc-text transition-colors">
              <Settings size={18} />
            </button>
          )}
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
            {mDepts.map(dept => (
              <div key={dept.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-bc-text">{dept.name}</h4>
                  <p className="text-xs text-bc-text-secondary mt-0.5">Responsable: Non assigné</p>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-700">145 Membres</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5">85% Présence</p>
                  </div>
                  <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-bc-green rounded-full" style={{ width: '85%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
          </p>
        </div>
        {['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole) && (
          <button className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 ${'bg-bc-green'}`}>
            ➕ Créer Ministère
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {INITIAL_MINISTRIES.map((m, idx) => {
          const mDepts = INITIAL_DEPARTMENTS.filter(d => d.ministryId === m.id);
          return (
          <div 
            key={idx} 
            onClick={() => setSelectedMinistry(m)}
            className="bg-white rounded-[2rem] border border-bc-border p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
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
                <span>Ministre: <span className="font-bold text-bc-text">Non assigné</span></span>
              </div>
              
              {/* Added: Display associated departments directly on the card */}
              <div className="text-[10px] text-bc-text-secondary bg-bc-canvas p-2 rounded-xl border border-bc-border">
                <span className="font-bold uppercase tracking-wider block mb-1">Départements ({mDepts.length})</span>
                <div className="flex flex-wrap gap-1">
                  {mDepts.slice(0, 4).map(d => (
                    <span key={d.id} className="bg-white px-2 py-0.5 rounded border border-bc-border truncate max-w-full">{d.name}</span>
                  ))}
                  {mDepts.length > 4 && <span className="bg-slate-100 px-2 py-0.5 rounded border border-bc-border">+{mDepts.length - 4}</span>}
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
                    <Users size={14} />
                    <span className="text-[10px] font-bold uppercase">Membres</span>
                  </div>
                  <span className="text-lg font-bold text-bc-text">--</span>
                </div>
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
