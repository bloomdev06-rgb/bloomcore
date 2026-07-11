import React, { useState } from 'react';
import { Shield, Check, X, Sliders, AlertCircle, Info, UserCheck, Plus, GitBranch } from 'lucide-react';
import { PermissionMatrix, Branch, Delegation } from '../types';
import { load, save } from '../data';
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

  // P1.1 — lignes "accès aux onglets" (view_*) éditables dans la matrice
  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Accueil', members: 'Membres', ministeres: 'Ministères',
    departments: 'Départements', integration: 'Intégration', bloombus: 'Bloom Bus',
    events: 'Cultes & Événements', projects: 'Projets', cursus: 'Cursus Pastoral',
    formations: 'Formations', permissions: 'Permissions', accounts: 'Comptes & Admins',
    settings: 'Configuration système', formbuilder: 'Constructeur de form', audit: 'Audit',
    reports: 'Rapports', programs: 'Parcours Baptême',
  };
  const viewCapabilities = Object.keys(permissionMatrix)
    .filter(k => k.startsWith('view_'))
    .map(k => ({
      key: k,
      label: `Voir l'onglet ${TAB_LABELS[k.slice(5)] ?? k.slice(5)}`,
      desc: 'Visibilité de l\'onglet dans la navigation.',
    }));
  const allCapabilities = [...capabilitiesList, ...viewCapabilities];

  // Colonnes dérivées de la matrice (ordre canonique), plus de liste en dur
  const ROLE_ORDER = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Responsable', 'Adjoint', 'Coach', 'Leader', 'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune', 'ADN', 'Portier', 'GDC', 'Intégration', 'Membre', 'Nouveau'];
  const presentRoles = new Set(Object.values(permissionMatrix).flatMap(o => Object.keys(o)));
  const roles = ROLE_ORDER.filter(r => presentRoles.has(r));
  // §11.2 — config réservée à Admin / Pasteur Principal / Super Admin (pas 'Pasteur' générique).
  const canEditGov = ['Admin', 'Pasteur Principal', 'Super Admin'].includes(simulatedRole);
  const capLabel = (key: string) => capabilitiesList.find(c => c.key === key)?.label ?? key;

  // ponytail: local state, no persistence yet — wire to ./data + audit log when the backend lands.
  const [specials, setSpecials] = useState<{ member: string; capability: string }[]>([
    { member: 'Marie Koffi', capability: 'consulter_situation_financiere' },
  ]);
  const [newMember, setNewMember] = useState('');
  const [newCap, setNewCap] = useState(capabilitiesList[0].key);
  const addSpecial = () => {
    if (!newMember.trim()) return;
    setSpecials(prev => [{ member: newMember.trim(), capability: newCap }, ...prev]);
    setNewMember('');
  };

  // §11.3 — délégation par un Responsable dans son département. On ne délègue JAMAIS
  // l'accès au rapport spirituel (consulter_rapports_de_vie exclu des capacités déléguables).
  const DELEGABLE_CAPS = capabilitiesList.filter(c => c.key !== 'consulter_rapports_de_vie');
  // ponytail: saisie libre from/to (pas de sélecteur membre ici) — console de supervision
  // org-wide, pas le point d'entrée principal. Sans `toId`, ces entrées restent affichées
  // mais n'accordent aucune capacité effective (cf. hasCapability) ; le vrai octroi passe
  // par DepartmentsView, où from/to sont de vrais membres.
  const [delegations, setDelegations] = useState<Delegation[]>(
    () => load('bc_delegations', [
      { id: 'del_1', from: 'Resp. Louange (Jean K.)', to: 'Adjoint (Paul A.)', scope: 'Département Louange', right: 'modifier_jalons_bapteme_integration' },
    ])
  );
  React.useEffect(() => { save('bc_delegations', delegations); }, [delegations]);
  const [delFrom, setDelFrom] = useState('');
  const [delTo, setDelTo] = useState('');
  const [delScope, setDelScope] = useState('');
  const [delRight, setDelRight] = useState(DELEGABLE_CAPS[0].key);
  const addDelegation = () => {
    if (!delFrom.trim() || !delTo.trim()) return;
    setDelegations(prev => [{ id: `del_${Date.now()}`, from: delFrom.trim(), to: delTo.trim(), scope: delScope.trim() || 'Son département', right: delRight }, ...prev]);
    setDelFrom(''); setDelTo(''); setDelScope('');
  };
  const removeDelegation = (id: string) => setDelegations(prev => prev.filter(d => d.id !== id));

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
              {allCapabilities.map((cap) => (
                <tr key={cap.key} className="hover:bg-bc-canvas/15 transition-colors">
                  <td className="p-4">
                    <span className="font-bold text-bc-text block text-[12px]">{cap.label}</span>
                    <span className="text-[10px] text-bc-text-secondary font-medium mt-0.5 block leading-normal">{cap.desc}</span>
                  </td>
                  {roles.map(role => {
                    // Le Super Admin voit toujours tout (Sidebar.tsx canView bypass) — un toggle
                    // view_* désactivé ici n'aurait aucun effet réel et laisserait croire à tort
                    // qu'on peut le verrouiller hors de l'app. On bloque l'action à la source.
                    const isSuperAdminViewLock = role === 'Super Admin' && cap.key.startsWith('view_');
                    const isAllowed = isSuperAdminViewLock ? true : (permissionMatrix[cap.key]?.[role] || false);
                    const canEdit = canEditGov && !isSuperAdminViewLock;

                    return (
                      <td key={role} className="p-4 text-center">
                        <motion.button
                          id={`toggle-perm-${cap.key}-${role.toLowerCase()}`}
                          onClick={() => onTogglePermission(cap.key, role)}
                          disabled={!canEdit}
                          title={isSuperAdminViewLock ? 'Le Super Admin garde toujours accès à tous les onglets.' : undefined}
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

      {/* Special authorizations */}
      <motion.div variants={rowVariants} className="bg-white border border-bc-border shadow-sm rounded-[2rem] p-6">
        <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2 mb-1">
          <UserCheck size={16} /> Autorisations spéciales
        </h3>
        <p className="text-xs text-bc-text-secondary mb-4">Accorder une capacité à un membre nommément (exception à la matrice).</p>

        {canEditGov && (
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <input
              value={newMember}
              onChange={e => setNewMember(e.target.value)}
              placeholder="Nom du membre"
              className="flex-1 min-w-[160px] border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
            />
            <select value={newCap} onChange={e => setNewCap(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
              {capabilitiesList.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button onClick={addSpecial} className="flex items-center gap-1.5 bg-bc-green text-white rounded-full px-4 py-2 text-xs font-bold hover:opacity-90 active-scale">
              <Plus size={14} /> Accorder
            </button>
          </div>
        )}

        <div className="space-y-2">
          {specials.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucune autorisation spéciale.</p>}
          {specials.map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2 text-xs">
              <span><span className="font-bold text-bc-text">{s.member}</span> — {capLabel(s.capability)}</span>
              {canEditGov && (
                <button onClick={() => setSpecials(prev => prev.filter((_, j) => j !== i))} className="text-bc-text-secondary hover:text-bc-danger active-scale">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Delegations (read-only) */}
      <motion.div variants={rowVariants} className="bg-white border border-bc-border shadow-sm rounded-[2rem] p-6">
        <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2 mb-1">
          <GitBranch size={16} /> Délégations
        </h3>
        <p className="text-xs text-bc-text-secondary mb-4">Droits délégués par les responsables, dans leur département uniquement. Le rapport spirituel n'est jamais déléguable.</p>
        <div className="space-y-2">
          {delegations.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucune délégation active.</p>}
          {delegations.map((d) => (
            <div key={d.id} className="bg-bc-canvas/40 border border-bc-border rounded-2xl px-4 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span><span className="font-bold text-bc-text">{d.from}</span> → {d.to}</span>
              <span className="flex items-center gap-2">
                <span className="text-bc-text-secondary">{capLabel(d.right)} · <span className="italic">{d.scope}</span></span>
                {canEditGov && <button onClick={() => removeDelegation(d.id)} className="text-bc-text-secondary hover:text-bc-danger active-scale"><X size={12} /></button>}
              </span>
            </div>
          ))}
        </div>
        {canEditGov && (
          <div className="mt-4 pt-4 border-t border-bc-border grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={delFrom} onChange={e => setDelFrom(e.target.value)} placeholder="Délégant (Responsable)…" className="border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
            <input value={delTo} onChange={e => setDelTo(e.target.value)} placeholder="Délégataire…" className="border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
            <input value={delScope} onChange={e => setDelScope(e.target.value)} placeholder="Périmètre (département)…" className="border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
            <div className="flex gap-2">
              <select value={delRight} onChange={e => setDelRight(e.target.value)} className="flex-1 min-w-0 border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white">
                {DELEGABLE_CAPS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button onClick={addDelegation} disabled={!delFrom.trim() || !delTo.trim()} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40 shrink-0 active-scale"><Plus size={13} /></button>
            </div>
          </div>
        )}
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
