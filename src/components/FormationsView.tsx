import React, { useState, useEffect } from 'react';
import { GraduationCap, Award, Plug, Clock, Plus, X, Check } from 'lucide-react';
import { Member, Branch, PermissionMatrix, Delegation } from '../types';
import { load, save, hasCapability } from '../data';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';

interface FormationsViewProps {
  members?: Member[];
  activeBranch: Branch;
  simulatedRole: string;
  operator?: Member;
  permissionMatrix: PermissionMatrix;
}

interface Certification { id: string; memberId: string; memberName: string; formation: string; date: string }

const FORMATIONS = [
  "Fondements de la foi (Eden 0)",
  "Classes de Maturité (Vases d'Honneur)",
  "Cursus du Ministre Appelé",
];

export default function FormationsView({ members = [], activeBranch, simulatedRole, operator, permissionMatrix }: FormationsViewProps) {
  // Spec (Onglet 9) : saisie = Responsable du département en charge, rôle natif OU délégation active (§11.3).
  const delegations = load('bc_delegations', [] as Delegation[]);
  const canCertify = hasCapability(permissionMatrix, 'inscrire_formations_certifications', simulatedRole, operator?.id, delegations);
  const [certs, setCerts] = useState<Certification[]>(() => load('bc_certifications', [] as Certification[]));
  const [adding, setAdding] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [formation, setFormation] = useState(FORMATIONS[0]);

  useEffect(() => { save('bc_certifications', certs); }, [certs]);

  const scoped = members.filter(m => activeBranch === 'global' || m.branch === activeBranch);
  const countFor = (f: string) => certs.filter(c => c.formation === f).length;

  const addCertification = () => {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    setCerts(prev => [
      { id: `cert_${m.id}_${Date.now()}`, memberId: m.id, memberName: `${m.firstName} ${m.lastName}`, formation, date: new Date().toISOString().slice(0, 10) },
      ...prev,
    ]);
    setAdding(false); setMemberId(''); setFormation(FORMATIONS[0]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2">
            <GraduationCap size={18} /> Académie Bloom — Certifications
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Enregistrement manuel des certifications (MVP). Les certifications autorisent la promotion Stagiaire → Boss / Leader par le corps pastoral.
          </p>
        </div>
        {canCertify && (
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold flex items-center gap-1.5 hover:opacity-90 shrink-0 active-scale"
          >
            <Plus size={14} /> Certification
          </button>
        )}
      </div>

      {/* Formations + counts */}
      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FORMATIONS.map(f => (
          <motion.div variants={staggerItem} key={f} className="bg-white border border-bc-border rounded-[2rem] p-5 shadow-sm text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-bc-canvas text-bc-text flex items-center justify-center mb-3">
              <GraduationCap size={20} />
            </div>
            <h5 className="font-ui font-bold text-xs text-bc-text line-clamp-2 h-8">{f}</h5>
            <div className="mt-3 bg-bc-canvas p-2 rounded-full border border-bc-border">
              <span className="text-lg font-ui font-black block text-[color:var(--accent-2)]">{countFor(f)}</span>
              <span className="text-[9px] text-bc-text-secondary font-medium uppercase">Certifiés</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Recorded certifications */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Award size={18} className="text-bc-text" />
          <h3 className="font-ui font-bold text-bc-text">Certifications enregistrées</h3>
        </div>
        {certs.length === 0 ? (
          <p className="text-xs text-bc-text-secondary p-6 text-center border border-bc-border rounded-2xl">
            Aucune certification enregistrée. {canCertify ? 'Utilisez « + Certification ».' : ''}
          </p>
        ) : (
          <div className="divide-y divide-bc-border max-h-80 overflow-y-auto">
            {certs.map(c => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[color:var(--accent-2)]/20 flex items-center justify-center">
                    <Award size={14} className="text-bc-text" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-bc-text">{c.memberName}</p>
                    <p className="text-[10px] text-bc-text-secondary">{c.formation}</p>
                  </div>
                </div>
                <span className="text-[10px] text-bc-text-secondary font-bold">{c.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External school integration — coming soon */}
      <div className="bg-white p-6 rounded-[2rem] border border-dashed border-bc-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bc-canvas flex items-center justify-center shrink-0">
            <Plug size={18} className="text-bc-text-secondary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-ui font-bold text-bc-text">Raccordement École Externe Bloom</h3>
              <span className="text-[10px] bg-bc-cerulean/10 text-bc-cerulean border border-bc-cerulean/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Clock size={10} /> Bientôt disponible
              </span>
            </div>
            <p className="text-xs text-bc-text-secondary mt-1">
              La synchronisation automatique avec l'école externe (webhook, certificats importés) arrive en Phase 2 (Abidjan, découplage). D'ici là, la saisie manuelle ci-dessus fait foi.
            </p>
          </div>
        </div>
      </div>

      {/* Add certification modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-[2rem] w-full max-w-md p-6 border border-bc-border shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAdding(false)} className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-text transition-colors active-scale">
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Award size={20} className="text-bc-text" />
              <h3 className="text-base font-ui font-bold text-bc-text">Enregistrer une certification</h3>
            </div>

            <label className="text-xs font-bold text-bc-text-secondary block mb-1">Membre</label>
            <select value={memberId} onChange={e => setMemberId(e.target.value)} className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white mb-4">
              <option value="">— Sélectionner —</option>
              {scoped.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>

            <label className="text-xs font-bold text-bc-text-secondary block mb-1">Formation</label>
            <select value={formation} onChange={e => setFormation(e.target.value)} className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white mb-4">
              {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
              <button onClick={() => setAdding(false)} className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active-scale">Annuler</button>
              <button onClick={addCertification} disabled={!memberId} className="px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 active-scale">
                <Check size={14} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
