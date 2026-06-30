import React, { useState } from 'react';
import { Branch, Member, PastoralCursus } from '../types';
import { Heart, User, ArrowUpCircle, FileText, Share2, Search, Filter, PenLine } from 'lucide-react';

interface CursusViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
}

export default function CursusView({ activeBranch, simulatedRole, members = [] }: CursusViewProps) {
  const [filterLevel, setFilterLevel] = useState<PastoralCursus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const cursusMembers = members.filter(m => 
    m.pastoralCursus && 
    m.pastoralCursus !== 'Aucun' && 
    (activeBranch === 'global' || m.branch === activeBranch)
  );

  const filteredMembers = cursusMembers.filter(m => {
    if (filterLevel !== 'all' && m.pastoralCursus !== filterLevel) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!`${m.firstName} ${m.lastName}`.toLowerCase().includes(q) && !m.phone.includes(q)) return false;
    }
    return true;
  });

  const maleCount = filteredMembers.filter(m => m.gender === 'H').length;
  const femaleCount = filteredMembers.filter(m => m.gender === 'F').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <Heart size={28} className={'text-bc-text'} />
            Cursus Pastoral
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Suivi du mentorat ministériel, rapports pastoraux et promotions.
          </p>
        </div>
      </div>

      {/* Stats and Filter Bar */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-bc-text-secondary" size={16} />
            <input
              type="text"
              placeholder="Rechercher un pasteur/filleul..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-bc-border rounded-full text-xs bg-bc-canvas/40 focus:outline-none focus:border-slate-300 focus:bg-white transition-all"
            />
          </div>
          
          <select 
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as PastoralCursus | 'all')}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-slate-300"
          >
            <option value="all">Tous les Niveaux (Cursus)</option>
            <option value="Appelé">Appelé</option>
            <option value="Serviteur">Serviteur</option>
            <option value="Gagneur d'âme">Gagneur d'âme</option>
            <option value="Assistant Pasteur">Assistant Pasteur</option>
            <option value="Pasteur Assistant">Pasteur Assistant</option>
            <option value="Pasteur Titulaire">Pasteur Titulaire</option>
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-bc-text-secondary bg-bc-canvas px-4 py-2 rounded-full border border-bc-border">
          <span className="font-bold text-slate-700">Total : {filteredMembers.length}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span> Hommes : {maleCount}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pink-400"></span> Femmes : {femaleCount}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Mentor / Hierarchy */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Share2 size={18} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text">Mon Mentor</h3>
          </div>
          <div className="p-4 border border-bc-border rounded-2xl flex items-center gap-4 bg-bc-canvas/50">
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
              <User size={20} className="text-slate-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Rév. Pasteur Principal</h4>
              <p className="text-xs text-bc-text-secondary">Pasteur Titulaire</p>
            </div>
          </div>

          <div className="mt-6 border-t border-bc-border pt-4">
            <h4 className="text-xs font-bold text-slate-700 mb-2">Mon statut actuel</h4>
            <div className="inline-flex px-3 py-1 bg-bc-green text-white text-xs font-bold rounded-full">
              Pasteur Assistant
            </div>
          </div>
        </div>

        {/* Filleuls list derived from members */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <User size={18} className="text-bc-text" />
              <h3 className="font-ui font-bold text-bc-text">Membres du Cursus (Filleuls / Pairs)</h3>
            </div>
            <button className={`px-4 py-1.5 text-white rounded-full text-xs font-bold ${'bg-bc-green'} hover:opacity-90 transition-opacity flex items-center gap-1.5`}>
              <PenLine size={14} /> Rédiger rapport pastoral
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
            {filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-bc-text-secondary border border-bc-border rounded-2xl">
                Aucun membre trouvé dans le cursus pastoral pour ces filtres.
              </div>
            ) : (
              filteredMembers.map(m => (
                <div key={m.id} className="border border-bc-border p-4 rounded-2xl flex justify-between items-center hover:bg-bc-canvas transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-bc-text-secondary font-bold text-xs uppercase">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{m.firstName} {m.lastName}</h4>
                      <p className="text-xs text-bc-text-secondary">{m.pastoralCursus} • {m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-2 text-slate-400 hover:text-bc-text transition-colors" title="Historique">
                      <FileText size={18} />
                    </button>
                    {simulatedRole === 'Pasteur' && (
                      <button className="p-2 text-slate-400 hover:text-bc-text transition-colors" title="Proposer promotion">
                        <ArrowUpCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
