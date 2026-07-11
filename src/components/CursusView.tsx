import React, { useState } from 'react';
import { Branch, Member, PastoralCursus } from '../types';
import { Heart, User, ArrowUpCircle, FileText, Share2, Search, PenLine, LayoutList, Network, X } from 'lucide-react';
import { useBusLines, useDepartments, useMinistries } from '../data';
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
const CURSUS_ORDER: PastoralCursus[] = ['Aucun', 'Appelé', 'Serviteur', "Gagneur d'âme", 'Assistant Pasteur', 'Pasteur Assistant', 'Pasteur Titulaire'];
const nextCursus = (c: PastoralCursus): PastoralCursus => CURSUS_ORDER[Math.min(CURSUS_ORDER.indexOf(c) + 1, CURSUS_ORDER.length - 1)];
const isTop = (c: PastoralCursus) => CURSUS_ORDER.indexOf(c) === CURSUS_ORDER.length - 1;

// Mentor→filleul tree node. `pool` caps both roots and children — a mentor filtered
// out of `pool` makes their filleuls surface as roots instead of vanishing.
function CursusTreeNode({ member, pool, canManage, onPromote, depth = 0 }: {
  member: Member; pool: Member[]; canManage: boolean; onPromote: (m: Member) => void; depth?: number;
}) {
  // ponytail: depth cap guards against an operator-created mentorId cycle, not expected in practice.
  const children = depth < 8 ? pool.filter(c => c.mentorId === member.id) : [];
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-2xl border border-bc-border bg-white shadow-sm whitespace-nowrap">
        <Avatar src={member.avatarUrl} initials={`${member.firstName[0]}${member.lastName[0]}`} size="sm" className="w-7 h-7 bg-bc-border/40 text-bc-text-secondary text-[10px] uppercase" />
        <span className="text-xs font-bold text-bc-text">{member.firstName} {member.lastName}</span>
        <span className="text-[10px] font-bold text-bc-text-secondary px-2 py-0.5 rounded-full bg-bc-canvas">{member.pastoralCursus}</span>
        {canManage && !isTop(member.pastoralCursus) && (
          <button
            onClick={() => onPromote(member)}
            className="p-1 text-bc-text-secondary hover:text-bc-green transition-colors active-scale"
            title={`Promouvoir → ${nextCursus(member.pastoralCursus)}`}
          >
            <ArrowUpCircle size={16} />
          </button>
        )}
      </div>
      {children.length > 0 && (
        <>
          <div className="w-px h-4 bg-bc-border" />
          <div className="flex items-start gap-6">
            {children.map(c => (
              <div key={c.id} className="flex flex-col items-center">
                <div className="w-px h-4 bg-bc-border" />
                <CursusTreeNode member={c} pool={pool} canManage={canManage} onPromote={onPromote} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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

  // Même cloisonnement que MembersView (scope.ts) : un Coach/Responsable ne voit que
  // le cursus des membres de son propre département, pas de tout le branch.
  const cursusMembers = members.filter(m =>
    m.pastoralCursus &&
    m.pastoralCursus !== 'Aucun' &&
    (activeBranch === 'global' || m.branch === activeBranch) &&
    (!operator || inMemberScope(operator, m, simulatedRole, busLines, departments, ministries))
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
        className="p-2 text-bc-text-secondary hover:text-bc-green transition-colors active-scale"
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
        /* Organigramme mentor→filleul : racines = pas de mentor, ou mentor hors du pool filtré. */
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm divide-y divide-bc-border overflow-x-auto">
          {filteredMembers.filter(m => !m.mentorId || !filteredMembers.some(c => c.id === m.mentorId)).length === 0 ? (
            <p className="text-[11px] italic text-bc-text-secondary p-3">Aucun membre trouvé pour ces filtres.</p>
          ) : (
            filteredMembers
              .filter(m => !m.mentorId || !filteredMembers.some(c => c.id === m.mentorId))
              .map(root => (
                <div key={root.id} className="flex justify-center py-4 first:pt-0 last:pb-0">
                  <CursusTreeNode
                    member={root}
                    pool={filteredMembers}
                    canManage={canManage}
                    onPromote={setPromoting}
                  />
                </div>
              ))
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
                        <p className="text-xs text-bc-text-secondary">{m.pastoralCursus} • {m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <select
                          value={m.mentorId ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdateMember({ ...m, mentorId: e.target.value || undefined })}
                          className="text-[10px] border border-bc-border rounded-full px-2 py-1.5 bg-white max-w-[140px]"
                        >
                          <option value="">Aucun mentor</option>
                          {cursusMembers.filter(c => c.id !== m.id).map(c => (
                            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
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
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-canvas text-bc-text-secondary">{promoting.pastoralCursus}</span>
            <ArrowUpCircle size={16} className="text-bc-green rotate-90" />
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-green text-white">{nextCursus(promoting.pastoralCursus)}</span>
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
