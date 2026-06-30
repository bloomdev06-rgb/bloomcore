import React from 'react';
import { History, Shield, Clock, ArrowRight, Database } from 'lucide-react';
import { AuditLog, Branch } from '../types';

interface AuditViewProps {
  audits: AuditLog[];
  activeBranch: Branch;
}

export default function AuditView({ audits, activeBranch }: AuditViewProps) {
  const isChurch = activeBranch === 'church';

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Journal d'Audit Central & Immuabilité
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Historique complet des actions d'encadrement, d'enregistrement ADN et d'administration de la base d'Abidjan.
          </p>
        </div>

        <span className="text-[10px] bg-bc-purple/10 text-bc-purple border border-bc-purple/20 px-3 py-1 rounded-full font-bold flex items-center gap-1">
          <Database size={12} /> Journal Inviolable
        </span>
      </div>

      {/* Audit List Timeline */}
      <div className="bg-white border border-bc-border shadow-sm rounded-[2rem] p-6 space-y-6">
        <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary">
          ⏱ Chronologie des opérations récentes
        </h4>

        <div className="relative border-l border-bc-border pl-6 space-y-6">
          {audits.map((log) => (
            <div key={log.id} className="relative group">
              {/* Timeline marker */}
              <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${
                log.actionType === 'BAPTISM_COMPLETED' ? 'bg-bc-gold' :
                log.actionType === 'ROLE_PERMISSION_UPDATED' ? 'bg-bc-purple' :
                'bg-bc-green'
              }`} />

              <div className="space-y-1 bg-bc-canvas/20 border border-bc-border hover:bg-bc-canvas/40 transition-colors p-4 rounded-full max-w-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="font-ui font-bold text-xs text-bc-text tracking-tight uppercase">
                    🛠 {log.actionType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-bc-text-secondary font-mono flex items-center gap-1">
                    <Clock size={11} /> {log.timestamp.replace('T', ' ').split('.')[0]}
                  </span>
                </div>

                <p className="text-xs text-bc-text-secondary leading-relaxed pt-1.5 font-serif">
                  {log.details}
                </p>

                {/* Old / New Value indicators if present */}
                {(log.previousValue || log.newValue) && (
                  <div className="mt-2.5 flex items-center space-x-2 text-[9px] font-mono font-bold bg-white border border-bc-border/60 rounded-full p-2 max-w-fit">
                    <span className="text-bc-text-secondary uppercase">Ancien :</span>
                    <span className="text-bc-purple line-through">{log.previousValue || 'N/A'}</span>
                    <ArrowRight size={10} className="text-bc-text-secondary" />
                    <span className="text-bc-text-secondary uppercase">Nouveau :</span>
                    <span className="text-bc-text">{log.newValue || 'N/A'}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-bc-border/40 mt-3 flex items-center justify-between text-[10px] text-bc-text-secondary font-medium">
                  <span>Opérateur : <span className="font-bold text-bc-text">{log.operatorName}</span></span>
                  <span className="font-mono text-[9px] uppercase">ID: {log.operatorId}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
