import React, { useState } from 'react';
import { Branch, Member, PastoralCursus } from '../types';
import { Heart, User, ArrowUpCircle, FileText, Share2, Search, PenLine, LayoutList, Network, X } from 'lucide-react';

interface CursusViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
  onUpdateMember: (m: Member) => void;
}

// Pastoral ladder, entry ('Aucun') excluded from the org chart.
const CURSUS_ORDER: PastoralCursus[] = ['Aucun', 'Appelé', 'Serviteur', "Gagneur d'âme", 'Assistant Pasteur', 'Pasteur Assistant', 'Pasteur Titulaire'];
const nextCursus = (c: PastoralCursus): PastoralCursus => CURSUS_ORDER[Math.min(CURSUS_ORDER.indexOf(c) + 1, CURSUS_ORDER.length - 1)];
const isTop = (c: PastoralCursus) => CURSUS_ORDER.indexOf(c) === CURSUS_ORDER.length - 1;

export default function CursusView({ activeBranch, simulatedRole, members = [], onUpdateMember }: CursusViewProps) {
  const [filterLevel, setFilterLevel] = useState<PastoralCursus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [promoting, setPromoting] = useState<Member | null>(null);

  const canManage = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);

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

  const confirmPromotion = () => {
    if (!promoting) return;
    onUpdateMember({ ...promoting, pastoralCursus: nextCursus(promoting.pastoralCursus) });
    setPromoting(null);
  };

  const PromoteBtn = ({ m }: { m: Member }) =>
    canManage && !isTop(m.pastoralCursus) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setPromoting(m); }}
        className="p-2 text-slate-400 hover:text-bc-green transition-colors"
        title={`Promouvoir → ${nextCursus(m.pastoralCursus)}`}
      >
        <ArrowUpCircle size={18} />
      </button>
    ) : null;

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

        {/* View toggle */}
        <div className="bg-slate-100 rounded-full p-1 flex items-center gap-1 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'bg-white text-bc-text shadow-sm' : 'text-bc-text-secondary'}`}
          >
            <LayoutList size={14} /> Liste
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors ${viewMode === 'tree' ? 'bg-white text-bc-text shadow-sm' : 'text-bc-text-secondary'}`}
          >
            <Network size={14} /> Organigramme
          </button>
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
            {CURSUS_ORDER.slice(1).map(l => <option key={l} value={l}>{l}</option>)}
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

      {viewMode === 'tree' ? (
        /* ---- Organigramme: pyramid tiers by cursus rank (top rank first) ----
           ponytail: grouped by level, not a mentor→filleul tree (needs mentorId — known deferral). */
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm space-y-4">
          {[...CURSUS_ORDER].slice(1).reverse().map(level => {
            const tier = filteredMembers.filter(m => m.pastoralCursus === level);
            return (
              <div key={level} className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-ui font-extrabold text-bc-text px-3 py-1 rounded-full bg-bc-green/10">{level}</span>
                  <span className="text-[10px] font-bold text-bc-text-secondary">{tier.length}</span>
                  <div className="flex-1 h-px bg-bc-border" />
                </div>
                {tier.length === 0 ? (
                  <p className="text-[11px] italic text-slate-300 pl-3 pb-2">Aucun membre à ce niveau</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pb-2">
                    {tier.map(m => (
                      <div key={m.id} className="flex items-center gap-2 border border-bc-border rounded-full pl-1 pr-1 py-1 bg-bc-canvas/40 hover:bg-bc-canvas transition-colors">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-bc-text-secondary font-bold text-[10px] uppercase">
                          {m.firstName[0]}{m.lastName[0]}
                        </div>
                        <span className="text-xs font-bold text-slate-700">{m.firstName} {m.lastName}</span>
                        <PromoteBtn m={m} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
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
                      <PromoteBtn m={m} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promotion confirmation modal */}
      {promoting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPromoting(null)}>
          <div className="bg-white rounded-[2rem] w-full max-w-md p-6 border border-bc-border shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPromoting(null)} className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-text transition-colors">
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpCircle size={20} className="text-bc-green" />
              <h3 className="text-base font-ui font-bold text-bc-text">Promotion pastorale</h3>
            </div>
            <p className="text-sm text-bc-text-secondary mb-5">
              Promouvoir <span className="font-bold text-bc-text">{promoting.firstName} {promoting.lastName}</span> dans le cursus pastoral ?
            </p>
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-bc-text-secondary">{promoting.pastoralCursus}</span>
              <ArrowUpCircle size={16} className="text-bc-green rotate-90" />
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-green text-white">{nextCursus(promoting.pastoralCursus)}</span>
            </div>
            <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
              <button onClick={() => setPromoting(null)} className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas">Annuler</button>
              <button onClick={confirmPromotion} className="px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90">Confirmer la promotion</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
