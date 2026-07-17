import React, { useState, useEffect } from 'react';
import { Branch, Member, AuditLog, AppNotification, AdminAccount } from '../types';
import { load, save } from '../data';
import { DEFAULT_OPERATOR_NAME } from '../data/operator';
import { INITIAL_ADMINS } from '../mockData';
import { UserCog, ShieldAlert, History, X, AlertTriangle, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';
import { Modal } from './ui/Modal';

interface AccountsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
  audits: AuditLog[];
  onAddAuditLog: (log: AuditLog) => void;
  onAddNotification?: (n: AppNotification) => void;
}

const ADMIN_ACTIONS = [
  'ADMIN_GRANTED', 'ADMIN_REVOKED', 'ADMIN_EXCEPTION_GRANTED', 'ROLE_PERMISSION_UPDATED',
  'SUPERADMIN_GRANTED', 'SUPERADMIN_REVOKED', 'SUPERADMIN_EXCEPTION_GRANTED',
];

// Default eligibility: senior pastoral cursus or Coach level.
const isEligible = (m: Member) =>
  m.level === 'Coach' || ['Assistant Pasteur', 'Pasteur Assistant', 'Pasteur Titulaire'].includes(m.pastoralCursus);

export default function AccountsView({ activeBranch, simulatedRole, members, audits, onAddAuditLog, onAddNotification }: AccountsViewProps) {
  const isSuper = simulatedRole === 'Super Admin';
  const [admins, setAdmins] = useState<AdminAccount[]>(() => load('bc_admins', INITIAL_ADMINS));
  const [granting, setGranting] = useState(false);
  const [grantingRole, setGrantingRole] = useState<'Admin' | 'Super Admin'>('Admin');
  const [pickedId, setPickedId] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { save('bc_admins', admins); }, [admins]);

  const journal = audits.filter(a => ADMIN_ACTIONS.includes(a.actionType));
  const adminMemberIds = new Set(admins.map(a => a.id));
  // C4 — la nomination reste bornée à la branche active, comme le reste des écrans staff.
  const candidates = members.filter(m => !adminMemberIds.has(`adm_${m.id}`) && (activeBranch === 'global' || m.branch === activeBranch));
  const picked = members.find(m => m.id === pickedId);
  const pickedEligible = picked ? isEligible(picked) : true;

  const log = (actionType: string, details: string) => onAddAuditLog({
    id: `aud_adm_${actionType}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType,
    operatorName: DEFAULT_OPERATOR_NAME,
    operatorId: 'mem_1',
    details,
  });

  const grant = () => {
    if (!picked) return;
    if (!pickedEligible && !reason.trim()) return; // exception requires a reason
    const exception = !pickedEligible;
    const role = grantingRole;
    const prefix = role === 'Super Admin' ? 'SUPERADMIN' : 'ADMIN';
    setAdmins(prev => [...prev, {
      id: `adm_${picked.id}`,
      name: `${picked.firstName} ${picked.lastName}`,
      subtitle: exception ? `${picked.level} · Exception` : (picked.pastoralCursus !== 'Aucun' ? picked.pastoralCursus : picked.level),
      role,
      exception,
      reason: exception ? reason.trim() : undefined,
    }]);
    log(
      exception ? `${prefix}_EXCEPTION_GRANTED` : `${prefix}_GRANTED`,
      exception
        ? `Promotion ${role} par EXCEPTION de ${picked.firstName} ${picked.lastName} (non éligible). Motif : ${reason.trim()}`
        : `Nomination ${role} de ${picked.firstName} ${picked.lastName}.`
    );
    onAddNotification?.({
      id: `notif_admin_${picked.id}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: `Attribution ${role}`,
      message: `${picked.firstName} ${picked.lastName} a été nommé(e) ${role}.`,
      type: 'success',
      read: false,
      branch: picked.branch,
    });
    setGranting(false); setPickedId(''); setReason('');
  };

  const revoke = (a: AdminAccount) => {
    const prefix = a.role === 'Super Admin' ? 'SUPERADMIN' : 'ADMIN';
    setAdmins(prev => prev.filter(x => x.id !== a.id));
    log(`${prefix}_REVOKED`, `Révocation des droits ${a.role} de ${a.name}.`);
    onAddNotification?.({
      id: `notif_admin_revoke_${a.id}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: `Droits ${a.role} révoqués`,
      message: `Les droits ${a.role} de ${a.name} ont été révoqués.`,
      type: 'warning',
      read: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <UserCog size={28} className={'text-bc-text'} />
            Comptes & Admins
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gestion des comptes privilégiés, promotions par exception et journal des actions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Admins */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-ui font-bold text-bc-text">Comptes Admins</h3>
            <span className="text-[10px] bg-bc-canvas text-bc-text px-2 py-0.5 rounded-full font-bold">
              {admins.filter(a => a.role === 'Admin').length} Actifs
            </span>
          </div>
          <p className="text-xs text-bc-text-secondary mb-4">Éligibles par défaut : Pasteurs et Ministres (Coach / cursus pastoral).</p>

          <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {admins.filter(a => a.role === 'Admin').map(a => (
              <motion.div key={a.id} variants={staggerItem} className={`p-3 border rounded-xl flex justify-between items-center bg-bc-canvas ${a.exception ? 'border-bc-warning/30' : 'border-bc-border'}`}>
                <div>
                  <p className="text-sm font-bold text-bc-text flex items-center gap-1.5">
                    {a.name}
                    {a.exception && <AlertTriangle size={13} className="text-bc-warning" />}
                  </p>
                  <p className="text-[10px] text-bc-text-secondary">{a.subtitle}</p>
                  {a.exception && a.reason && <p className="text-[10px] text-bc-warning mt-0.5 italic">Exception : {a.reason}</p>}
                </div>
                {isSuper && (
                  <button onClick={() => revoke(a)} className="text-xs text-bc-danger font-bold hover:underline active-scale">Révoquer</button>
                )}
              </motion.div>
            ))}
          </motion.div>

          {isSuper && (
            <button
              onClick={() => { setGrantingRole('Admin'); setGranting(true); }}
              className="w-full mt-4 py-2 border-2 border-dashed border-bc-border text-bc-text-secondary font-bold text-xs rounded-xl hover:bg-bc-canvas transition-colors active-scale"
            >
              + Nommer un Admin
            </button>
          )}
        </div>

        {/* Super Admins */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm border-l-4 border-l-bc-danger">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={20} className="text-bc-danger" />
            <h3 className="font-ui font-bold text-bc-text">Super Admins</h3>
          </div>
          <p className="text-xs text-bc-text-secondary mb-4">Accès illimité à l'ensemble du système et attribution des droits Admin.</p>
          <div className="space-y-2">
            {admins.filter(a => a.role === 'Super Admin').map(a => (
              <div key={a.id} className="p-3 border border-bc-border rounded-xl flex justify-between items-center bg-bc-canvas">
                <div>
                  <p className="text-sm font-bold text-bc-text">{a.name}</p>
                  <p className="text-[10px] text-bc-text-secondary">{a.subtitle}</p>
                </div>
                {isSuper && (
                  <button onClick={() => revoke(a)} className="text-xs text-bc-danger font-bold hover:underline active-scale">Révoquer</button>
                )}
              </div>
            ))}
          </div>

          {isSuper && (
            <button
              onClick={() => { setGrantingRole('Super Admin'); setGranting(true); }}
              className="w-full mt-4 py-2 border-2 border-dashed border-bc-border text-bc-text-secondary font-bold text-xs rounded-xl hover:bg-bc-canvas transition-colors active-scale"
            >
              + Nommer un Super Admin
            </button>
          )}
        </div>
      </div>

      {/* Journal */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <History size={20} className="text-bc-text" />
          <h3 className="font-ui font-bold text-bc-text">Journal des comptes & droits</h3>
        </div>
        {journal.length === 0 ? (
          <p className="text-xs text-bc-text-secondary p-4 text-center border border-bc-border rounded-xl">Aucune action de compte enregistrée.</p>
        ) : (
          <div className="divide-y divide-bc-border max-h-80 overflow-y-auto">
            {journal.map(a => (
              <div key={a.id} className="py-3 flex items-start gap-3">
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${a.actionType.endsWith('REVOKED') ? 'bg-bc-danger' : a.actionType.endsWith('EXCEPTION_GRANTED') ? 'bg-bc-warning' : 'bg-bc-green'}`} />
                <div className="min-w-0">
                  <p className="text-xs text-bc-text">{a.details}</p>
                  <p className="text-[10px] text-bc-text-secondary mt-0.5">{a.operatorName} · {a.timestamp.replace('T', ' ').slice(0, 16)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant modal */}
      <Modal
        open={granting}
        onClose={() => setGranting(false)}
        maxWidth="max-w-md"
        title={`Nommer un ${grantingRole}`}
        icon={<UserCog size={20} className="text-bc-text" />}
      >
            <label className="text-xs font-bold text-bc-text-secondary block mb-1">Membre</label>
            <select
              value={pickedId}
              onChange={e => { setPickedId(e.target.value); setReason(''); }}
              className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white mb-4"
            >
              <option value="">— Sélectionner —</option>
              {candidates.map(m => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} — {m.pastoralCursus !== 'Aucun' ? m.pastoralCursus : m.level}{isEligible(m) ? '' : ' (non éligible)'}
                </option>
              ))}
            </select>

            {picked && !pickedEligible && (
              <div className="mb-4 p-3 rounded-xl bg-bc-warning/10 border border-bc-warning/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={15} className="text-bc-warning" />
                  <span className="text-xs font-bold text-bc-warning">Promotion par exception</span>
                </div>
                <p className="text-[11px] text-bc-warning mb-2">Ce membre n'est pas éligible par défaut. Un motif est requis et sera journalisé.</p>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Motif de l'exception…"
                  className="w-full p-2 border border-bc-warning/30 rounded-lg text-xs focus:outline-none focus:border-bc-warning"
                />
              </div>
            )}

            <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
              <button onClick={() => setGranting(false)} className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active-scale">Annuler</button>
              <button
                onClick={grant}
                disabled={!picked || (!pickedEligible && !reason.trim())}
                className="px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 active-scale"
              >
                <Check size={14} /> {picked && !pickedEligible ? 'Confirmer l\'exception' : 'Nommer'}
              </button>
            </div>
      </Modal>
    </div>
  );
}
