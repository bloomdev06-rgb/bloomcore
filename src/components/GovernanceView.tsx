import React from 'react';
import { Shield, Check, X, Sliders, AlertCircle, Info } from 'lucide-react';
import { PermissionMatrix, Branch } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GovernanceViewProps {
  permissionMatrix: PermissionMatrix;
  onTogglePermission: (capability: string, role: string) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04
    }
  }
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 240, damping: 20 } }
};

export default function GovernanceView({
  permissionMatrix,
  onTogglePermission,
  activeBranch,
  simulatedRole
}: GovernanceViewProps) {
  const isChurch = activeBranch === 'church';

  const capabilitiesList = [
    { key: 'consulter_rapports_de_vie', label: 'Consulter les Rapports de Vie Spirituelle (Suivi)', desc: 'Autorise l\'accès aux curseurs de dévotion individuels des membres.' },
    { key: 'consulter_situation_financiere', label: 'Consulter la Situation Financière', desc: 'Autorise la lecture des informations professionnelles et des tranches d\'offrandes.' },
    { key: 'consulter_historique_presence', label: 'Consulter l\'Historique de Présence', desc: 'Permet de voir le taux d\'assiduité aux cultes du dimanche.' },
    { key: 'modifier_jalons_bapteme_integration', label: 'Modifier les Jalons de Baptême/Intégration', desc: 'Donne l\'autorisation de diplômer un nouveau et de valider les étapes d\'immersion.' },
    { key: 'inscrire_formations_certifications', label: 'Inscrire aux Formations / Certifications', desc: 'Donne l\'accès à l\'inscription des collaborateurs dans l\'Académie VH.' }
  ];

  const roles = ['Pasteur', 'Admin', 'Responsable', 'Coach', 'Membre'];

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Top Banner */}
      <motion.div 
        variants={rowVariants}
        className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between"
      >
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Matrice Dynamique des Capacités & Gouvernance
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Configurez les permissions de visibilité en temps réel pour l'ensemble des rôles de la paroisse.
          </p>
        </div>

        <span className="text-[10px] bg-bc-purple/10 text-bc-purple border border-bc-purple/20 px-3 py-1 rounded-full font-bold flex items-center gap-1">
          <Shield size={12} /> Contrôle RBAC Actif
        </span>
      </motion.div>

      {/* Grid Matrix Table */}
      <motion.div 
        variants={rowVariants}
        className="bg-white border border-bc-border shadow-sm rounded-[2rem] overflow-hidden shadow-sm"
      >
        <div className="p-4 bg-bc-canvas/40 border-b border-bc-border flex justify-between items-center">
          <span className="text-xs font-ui font-bold text-bc-text">Matrice des Permissions</span>
          <span className="text-[10px] text-bc-text-secondary italic">Cliquez sur une case pour modifier les droits de façon asynchrone</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bc-canvas/10 text-bc-text-secondary text-[10px] uppercase font-bold tracking-wider border-b border-bc-border">
                <th className="p-4 w-[40%]">Capacité / Habilitation</th>
                {roles.map(r => (
                  <th key={r} className="p-4 text-center">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bc-border text-xs">
              {capabilitiesList.map((cap) => (
                <tr key={cap.key} className="hover:bg-bc-canvas/15 transition-colors">
                  <td className="p-4">
                    <span className="font-bold text-bc-text block text-[12px]">{cap.label}</span>
                    <span className="text-[10px] text-bc-text-secondary font-medium mt-0.5 block leading-normal">{cap.desc}</span>
                  </td>
                  {roles.map(role => {
                    const isAllowed = permissionMatrix[cap.key]?.[role] || false;
                    const canEdit = simulatedRole === 'Pasteur' || (simulatedRole === 'Admin' || simulatedRole === 'Super Admin');
                    
                    return (
                      <td key={role} className="p-4 text-center">
                        <motion.button
                          id={`toggle-perm-${cap.key}-${role.toLowerCase()}`}
                          onClick={() => onTogglePermission(cap.key, role)}
                          disabled={!canEdit}
                          whileHover={canEdit ? { scale: 1.1 } : {}}
                          whileTap={canEdit ? { scale: 0.9 } : {}}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center transition-colors border ${
                            isAllowed 
                              ? 'bg-bc-green/10 text-bc-text border-bc-green/20' 
                              : 'bg-bc-purple/5 text-bc-text-secondary border-bc-border/60'
                          } ${
                            canEdit 
                              ? 'cursor-pointer' 
                              : 'opacity-70 cursor-not-allowed'
                          }`}
                        >
                          <AnimatePresence mode="popLayout">
                            <motion.span
                              key={isAllowed ? 'check' : 'x'}
                              initial={{ scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.95, opacity: 0 }}
                              transition={{ duration: 0.12 }}
                            >
                              {isAllowed ? <Check size={16} /> : <X size={14} />}
                            </motion.span>
                          </AnimatePresence>
                        </motion.button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Notice info */}
      <motion.div 
        variants={rowVariants}
        className="bg-bc-canvas/50 border border-bc-border rounded-[2rem] p-4 flex gap-3 items-start"
      >
        <Info size={16} className="text-bc-text shrink-0 mt-0.5" />
        <div className="text-[10px] text-bc-text-secondary leading-normal font-serif">
          Les super-utilisateurs et comptes pastoraux disposent d'un accès de supervision global non cloisonné. La modification de cette matrice génère instantanément une trace auditable dans le journal central d'audit pour des raisons de conformité et de protection de la vie privée des fidèles.
        </div>
      </motion.div>
    </motion.div>
  );
}
