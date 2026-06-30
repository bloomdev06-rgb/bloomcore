import React from 'react';
import { Branch } from '../types';
import { Activity, LayoutDashboard, Target, Users, Calendar, AlertCircle } from 'lucide-react';
import { INITIAL_PROJECTS } from '../mockData';

interface ProjectsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

export default function ProjectsView({ activeBranch, simulatedRole }: ProjectsViewProps) {
  const isChurch = activeBranch === 'church';
  
  const filteredProjects = INITIAL_PROJECTS.filter(p => p.scope === 'both' || activeBranch === 'global' || p.scope === activeBranch);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2 tracking-tight">
            <Activity size={28} className={'text-bc-text'} />
            Module Projets
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gérez les initiatives structurées, les objectifs et les actions pour {activeBranch === 'global' ? 'les deux branches' : isChurch ? 'Bloom Church' : 'Bloom Light'}.
          </p>
        </div>
        {['Pasteur', 'Admin', 'Responsable', 'Super Admin'].includes(simulatedRole) && (
          <button className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm">
            ➕ Nouveau Projet
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-ui font-bold text-bc-text tracking-tight">Projets Actifs</h3>
            <span className="text-[10px] bg-slate-100 text-bc-text px-2 py-0.5 rounded-full font-bold">{filteredProjects.length} en cours</span>
          </div>
          
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <div key={project.id} className="border border-bc-border rounded-[1.5rem] p-4 hover:shadow-md hover:border-slate-300 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-sm text-bc-text group-hover:underline">{project.name}</h4>
                    <p className="text-[10px] text-bc-text-secondary">PMO : {project.pmo} • {project.scope === 'both' ? 'Transverse' : 'Branche'}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">{project.status}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="bg-bc-canvas rounded-xl p-2 flex flex-col items-center justify-center">
                    <Target size={14} className="text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-slate-700">0/0 Objectifs</span>
                  </div>
                  <div className="bg-bc-canvas rounded-xl p-2 flex flex-col items-center justify-center">
                    <Users size={14} className="text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-slate-700">0 Membres</span>
                  </div>
                  <div className="bg-bc-canvas rounded-xl p-2 flex flex-col items-center justify-center">
                    <Calendar size={14} className="text-slate-400 mb-1" />
                    <span className="text-[10px] font-bold text-slate-700 text-center">Échéance<br/>Non définie</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard size={18} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text tracking-tight">Mes Actions</h3>
          </div>
          <p className="text-xs text-bc-text-secondary mb-4">
            Tâches qui vous sont assignées sur l'ensemble des projets.
          </p>
          
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-bc-border rounded-[1.5rem]">
            <AlertCircle size={24} className="text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-700">Aucune action</p>
            <p className="text-[10px] text-bc-text-secondary mt-1">Vous n'avez pas de tâche en cours.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
