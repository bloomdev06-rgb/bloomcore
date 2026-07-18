import React, { useState } from 'react';
import { Branch, Member, PastoralCursus } from '../types';
import { Heart, User, ArrowUpCircle, FileText, Share2, Search, PenLine, LayoutList, Network, X } from 'lucide-react';
import { useBusLines, useDepartments, useMinistries, labelFor } from '../data';
import { inMemberScope } from '../data/scope';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';

interface CursusViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
  onUpdateMember: (m: Member) => void;
  operator?: Member;
}

// Pastoral ladder, entry ('Aucun') excluded from the org chart.
const CURSUS_ORDER: PastoralCursus[] = ['aucun', 'appele', 'serviteur', 'gagneur_ame', 'assistant_pasteur', 'pasteur_assistant', 'pasteur_titulaire'];
const nextCursus = (c: PastoralCursus): PastoralCursus => CURSUS_ORDER[Math.min(CURSUS_ORDER.indexOf(c) + 1, CURSUS_ORDER.length - 1)];
const isTop = (c: PastoralCursus) => CURSUS_ORDER.indexOf(c) === CURSUS_ORDER.length - 1;


export default function CursusView({ activeBranch, simulatedRole, members = [], onUpdateMember, operator }: CursusViewProps) {
  const busLines = useBusLines();
  const departments = useDepartments();
  const ministries = useMinistries();
  const [filterLevel, setFilterLevel] = useState<PastoralCursus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [promoting, setPromoting] = useState<Member | null>(null);

  // Spec (Onglet 8) : promotions validées uniquement par le Pasteur Principal.
  const canManage = simulatedRole === 'Pasteur Principal';

  // Branche de la personne connectée — la liste ne montre qu'elle ; l'organigramme
  // montre les 2 branches et met celle-ci en avant.
  const operatorBranch: Branch = operator?.branch ?? (activeBranch === 'global' ? 'church' : activeBranch);

  // Même cloisonnement que MembersView (scope.ts) : un Coach/Responsable ne voit que
  // le cursus des membres de son propre département, pas de tout le branch.
  const cursusBase = members.filter(m =>
    m.pastoralCursus &&
    m.pastoralCursus !== 'aucun' &&
    (!operator || inMemberScope(operator, m, simulatedRole, busLines, departments, ministries))
  );
  const cursusMembers = cursusBase.filter(m => m.branch === operatorBranch);

  const applyFilters = (pool: Member[]) => pool.filter(m => {
    if (filterLevel !== 'all' && m.pastoralCursus !== filterLevel) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!`${m.firstName} ${m.lastName}`.toLowerCase().includes(q) && !m.phone.includes(q)) return false;
    }
    return true;
  });
  const filteredMembers = applyFilters(cursusMembers); // liste : branche de l'utilisateur
  const treeMembers = applyFilters(cursusBase); // organigramme : les 2 branches
  const statsMembers = viewMode === 'tree' ? treeMembers : filteredMembers;

  const maleCount = statsMembers.filter(m => m.gender === 'H').length;
  const femaleCount = statsMembers.filter(m => m.gender === 'F').length;

  const confirmPromotion = () => {
    if (!promoting) return;
    onUpdateMember({ ...promoting, pastoralCursus: nextCursus(promoting.pastoralCursus) });
    setPromoting(null);
  };

  const PromoteBtn = ({ m }: { m: Member }) =>
    canManage && !isTop(m.pastoralCursus) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setPromoting(m); }}
        className="p-2 text-bc-text-secondary hover:text-bc-green transition-colors active-scale"
        title={`Promouvoir → ${labelFor(nextCursus(m.pastoralCursus))}`}
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
        <div className="bg-bc-canvas rounded-full p-1 flex items-center gap-1 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors active-scale ${viewMode === 'list' ? 'bg-white text-bc-text shadow-sm' : 'text-bc-text-secondary'}`}
          >
            <LayoutList size={14} /> Liste
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors active-scale ${viewMode === 'tree' ? 'bg-white text-bc-text shadow-sm' : 'text-bc-text-secondary'}`}
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
              className="pl-9 pr-4 py-2 w-full border border-bc-border rounded-full text-xs bg-bc-canvas/40 focus:outline-none focus:border-bc-border focus:bg-white transition-all"
            />
          </div>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as PastoralCursus | 'all')}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-border"
          >
            <option value="all">Tous les Niveaux (Cursus)</option>
            {CURSUS_ORDER.slice(1).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-bc-text-secondary bg-bc-canvas px-4 py-2 rounded-full border border-bc-border">
          <span className="font-bold text-bc-text">Total : {filteredMembers.length}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bc-cerulean"></span> Hommes : {maleCount}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bc-fushia"></span> Femmes : {femaleCount}
          </div>
        </div>
      </div>

      {viewMode === 'tree' ? (
        /* Organigramme par niveaux du cursus (§) : Pasteur Titulaire en haut → Appelé en bas,
           toute l'organisation (2 branches), la branche de l'utilisateur mise en avant. */
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm overflow-x-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6 text-[10px] font-bold text-bc-text-secondary">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-bc-cerulean" /> Bloom Church</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-bc-fushia" /> Bloom Light</span>
            <span className="font-medium italic">Votre branche ({operatorBranch === 'church' ? 'Bloom Church' : 'Bloom Light'}) est mise en avant.</span>
          </div>
          {treeMembers.length === 0 ? (
            <p className="text-[11px] italic text-bc-text-secondary p-3">Aucun membre trouvé pour ces filtres.</p>
          ) : (
            <div className="relative">
              {/* Colonne vertébrale de l'organigramme */}
              <div className="absolute left-1/2 top-2 bottom-2 w-px bg-bc-border -translate-x-1/2" />
              <div className="space-y-7 relative">
                {[...CURSUS_ORDER.slice(1)].reverse().map(level => {
                  const rows = treeMembers.filter(m => m.pastoralCursus === level);
                  return (
                    <div key={level}>
                      <div className="flex items-center justify-center mb-2.5">
                        <span className="relative z-10 text-[10px] font-black uppercase tracking-widest text-bc-text bg-bc-canvas border border-bc-border px-3 py-1 rounded-full">
                          {level}
                          <span className="text-bc-text-secondary font-bold ml-1.5">{rows.length}</span>
                        </span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="relative z-10 text-center text-[10px] italic text-bc-text-secondary bg-white w-fit mx-auto px-2">Aucun membre à ce niveau.</p>
                      ) : (
                        <div className="relative z-10 flex flex-wrap justify-center gap-2">
                          {rows.map(m => {
                            const mine = m.branch === operatorBranch;
                            const mentor = members.find(x => x.id === m.mentorId);
                            return (
                              <div
                                key={m.id}
                                className={`flex items-center gap-2 py-1.5 px-3 rounded-2xl border bg-white shadow-sm transition-opacity ${mine ? 'border-bc-green ring-1 ring-bc-green/30' : 'border-bc-border opacity-50'}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.branch === 'church' ? 'bg-bc-cerulean' : 'bg-bc-fushia'}`} />
                                <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-7 h-7 bg-bc-border/40 text-bc-text-secondary text-[10px] uppercase" />
                                <div className="leading-tight">
                                  <span className={`block font-bold text-bc-text ${mine ? 'text-xs' : 'text-[11px]'}`}>{m.firstName} {m.lastName}</span>
                                  <span className="block text-[9px] text-bc-text-secondary">
                                    {m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}{mentor ? ` · Mentor : ${mentor.firstName} ${mentor.lastName}` : ''}
                                  </span>
                                </div>
                                {canManage && !isTop(m.pastoralCursus) && (
                                  <button
                                    onClick={() => setPromoting(m)}
                                    className="p-1 text-bc-text-secondary hover:text-bc-green transition-colors active-scale"
                                    title={`Promouvoir → ${labelFor(nextCursus(m.pastoralCursus))}`}
                                  >
                                    <ArrowUpCircle size={16} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              <div className="w-12 h-12 rounded-full bg-bc-border/40 flex items-center justify-center">
                <User size={20} className="text-bc-text-secondary" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-bc-text">Rév. Pasteur Principal</h4>
                <p className="text-xs text-bc-text-secondary">Pasteur Titulaire</p>
              </div>
            </div>

            <div className="mt-6 border-t border-bc-border pt-4">
              <h4 className="text-xs font-bold text-bc-text mb-2">Mon statut actuel</h4>
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

            <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
              {filteredMembers.length === 0 ? (
                <div className="p-8 text-center text-bc-text-secondary border border-bc-border rounded-2xl">
                  Aucun membre trouvé dans le cursus pastoral pour ces filtres.
                </div>
              ) : (
                filteredMembers.map(m => (
                  <motion.div variants={staggerItem} key={m.id} className="border border-bc-border p-4 rounded-2xl flex justify-between items-center hover:bg-bc-canvas transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-10 h-10 bg-bc-border/40 text-bc-text-secondary text-xs uppercase" />
                      <div>
                        <h4 className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</h4>
                        <p className="text-xs text-bc-text-secondary">
                          {labelFor(m.pastoralCursus)} • {m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}
                          {(() => {
                            const mentor = members.find(x => x.id === m.mentorId);
                            const filleuls = cursusMembers.filter(c => c.mentorId === m.id).length;
                            return `${mentor ? ` • Confié à ${mentor.firstName} ${mentor.lastName}` : ''}${filleuls ? ` • ${filleuls} filleul(s)` : ''}`;
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <select
                          value={m.mentorId ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdateMember({ ...m, mentorId: e.target.value || undefined })}
                          className="text-[10px] border border-bc-border rounded-full px-2 py-1.5 bg-white max-w-[160px]"
                          title={`Confié à un ${labelFor(nextCursus(m.pastoralCursus)) || '—'} (niveau directement supérieur)`}
                        >
                          <option value="">Aucun mentor</option>
                          {/* §15 — chaque membre du cursus est confié au NIVEAU DIRECTEMENT SUPÉRIEUR :
                              Appelé → Serviteur → Gagneur d'âme → … → Pasteur Titulaire. */}
                          {cursusMembers.filter(c => c.id !== m.id && c.pastoralCursus === nextCursus(m.pastoralCursus)).map(c => (
                            <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({labelFor(c.pastoralCursus)})</option>
                          ))}
                        </select>
                      )}
                      <button className="p-2 text-bc-text-secondary hover:text-bc-text transition-colors" title="Historique">
                        <FileText size={18} />
                      </button>
                      <PromoteBtn m={m} />
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* Promotion confirmation modal */}
      {promoting && (
        <Modal open={!!promoting} onClose={() => setPromoting(null)} title="Promotion pastorale" icon={<ArrowUpCircle size={20} className="text-bc-green" />} maxWidth="max-w-md">
          <p className="text-sm text-bc-text-secondary mb-5">
            Promouvoir <span className="font-bold text-bc-text">{promoting.firstName} {promoting.lastName}</span> dans le cursus pastoral ?
          </p>
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-canvas text-bc-text-secondary">{labelFor(promoting.pastoralCursus)}</span>
            <ArrowUpCircle size={16} className="text-bc-green rotate-90" />
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-green text-white">{labelFor(nextCursus(promoting.pastoralCursus))}</span>
          </div>
          <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
            <button onClick={() => setPromoting(null)} className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active-scale">Annuler</button>
            <button onClick={confirmPromotion} className="px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active-scale">Confirmer la promotion</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
