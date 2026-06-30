import React, { useState } from 'react';
import { 
  Award, 
  CheckCircle, 
  ArrowRight, 
  User, 
  Plus, 
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { Member, Branch, AuditLog } from '../types';

interface ProgrammesViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  onAddAuditLog: (log: AuditLog) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

export default function ProgrammesView({
  members,
  onUpdateMember,
  onAddAuditLog,
  activeBranch,
  simulatedRole
}: ProgrammesViewProps) {
  const isChurch = activeBranch === 'church';

  // Get members of active branch
  const activeBranchMembers = members.filter(m => (activeBranch === 'global' || m.branch === activeBranch) && m.level !== 'Nouveau');

  // Let's filter members by baptism status to list progress
  const unbaptisedMembers = activeBranchMembers.filter(m => m.baptismStatus === 'Non baptisé');
  const baptisedMembers = activeBranchMembers.filter(m => m.baptismStatus === 'Baptisé');

  const handleValidateBaptismStep = (member: Member) => {
    // If we validate step, they become 'Baptisé'
    const updated: Member = {
      ...member,
      baptismStatus: 'Baptisé',
      baptismDate: new Date().toISOString().split('T')[0]
    };

    onUpdateMember(updated);

    // Add Audit Log
    const log: AuditLog = {
      id: `aud_bap_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'BAPTISM_COMPLETED',
      operatorName: 'Affeny Grah',
      operatorId: 'mem_1',
      details: `Validation du baptême physique de ${member.firstName} ${member.lastName}. Statut passé à "Baptisé".`
    };
    onAddAuditLog(log);

    alert(`[Baptême physique validé] ${member.firstName} ${member.lastName} est maintenant officiellement déclaré baptisé dans l'application !`);
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Suivi des Sacrements, Baptêmes & Affiliations Classes
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Suivez le programme d'intégration spirituelle et validez les baptêmes d'eaux physiques des fidèles de la branche.
          </p>
        </div>
        
        <span className="text-[10px] bg-bc-gold/20 text-bc-text font-bold border border-bc-gold/30 px-3 py-1 rounded-full flex items-center gap-1.5">
          <Sparkles size={12} className="text-bc-gold" /> Cursus Obligatoire Eden 0
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Unbaptised / In-progress Baptism List */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm space-y-4">
          <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary">
            ⌛ Candidats en cours de parcours de Baptême ({unbaptisedMembers.length})
          </h4>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {unbaptisedMembers.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-8">Tous les membres de cette branche sont baptisés !</p>
            ) : (
              unbaptisedMembers.map((m) => (
                <div key={m.id} className="border border-bc-border rounded-full p-4 space-y-3 bg-bc-canvas/20">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-bc-canvas border border-bc-border flex items-center justify-center font-ui font-bold text-[10px]">
                        {m.firstName[0]}{m.lastName[0]}
                      </div>
                      <div>
                        <h5 className="font-ui font-bold text-xs text-bc-text">{m.lastName} {m.firstName}</h5>
                        <p className="text-[9px] text-bc-text-secondary font-mono">{m.phone}</p>
                      </div>
                    </div>

                    <span className="text-[8px] bg-bc-green/15 text-bc-text px-2 py-0.5 rounded-full font-bold uppercase">
                      Parcours Actif
                    </span>
                  </div>

                  {/* 4 Seeded progress steps visualization */}
                  <div className="grid grid-cols-4 gap-1 text-[8px] text-center font-bold">
                    <div className="p-1 rounded bg-bc-green text-white">1. Inscription</div>
                    <div className="p-1 rounded bg-bc-green text-white">2. Cours</div>
                    <div className="p-1 rounded bg-bc-green text-white">3. Entretien</div>
                    <div className="p-1 rounded bg-bc-canvas text-bc-text-secondary border border-bc-border">4. Immersion</div>
                  </div>

                  {/* Validate final step trigger */}
                  {['Pasteur', 'Admin', 'Responsable', 'Super Admin'].includes(simulatedRole) && (
                    <div className="flex justify-end pt-2 border-t border-bc-border/50">
                      <button
                        id={`validate-baptism-btn-${m.id}`}
                        onClick={() => handleValidateBaptismStep(m)}
                        className="px-3 py-1 bg-bc-gold text-bc-text-secondary font-ui font-bold text-[10px] rounded-full hover:scale-105 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle size={10} /> Valider Baptême Physique (Étape 4)
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Baptised Members */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm space-y-4">
          <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text">
            ★ Fidèles baptisés physiques ({baptisedMembers.length})
          </h4>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {baptisedMembers.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-8">Aucun membre n'est encore enregistré comme baptisé.</p>
            ) : (
              baptisedMembers.map((m) => (
                <div key={m.id} className="border border-bc-border rounded-full p-3 flex justify-between items-center bg-white hover:bg-bc-canvas/10">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-bc-gold/10 border border-bc-gold text-bc-gold flex items-center justify-center font-ui font-black text-[10px]">
                      ★
                    </div>
                    <div>
                      <h5 className="font-ui font-bold text-xs text-bc-text">{m.lastName} {m.firstName}</h5>
                      <p className="text-[9px] text-bc-text-secondary font-mono">Baptisé(e)</p>
                    </div>
                  </div>

                  <span className="text-[9px] font-bold text-bc-text bg-bc-green/10 px-2 py-0.5 rounded-full">
                    A jour
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
