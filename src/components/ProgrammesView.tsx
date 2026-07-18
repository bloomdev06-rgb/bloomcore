import React, { useState } from 'react';
import { Award, CheckCircle, Plus, Clock, Droplet, Search, ChevronLeft, X } from 'lucide-react';
import { Member, Branch, AuditLog, PermissionMatrix, Delegation, FormDef, Report, Step, CapabilityOverride, SpecialAuthorization } from '../types';
import { useBusLines, useDepartments, useMinistries, load, resolveCapability, labelFor } from '../data';
import { inMemberScope } from '../data/scope';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';
import { toast } from './ui/Toast';
import Member360View from './Member360View';

// Parcours de baptême (lot 4) — vrai pipeline sur les étapes seedées fd_bapteme :
// inscription depuis la base des membres/nouveaux (pas de ressaisie), progression
// étape par étape (Member.currentStepId), liste des baptisés du département par
// période, fiche 360 pour suivre/modifier l'état d'un candidat.
const FALLBACK_STEPS: Step[] = [
  { id: 's0', label: 'Inscription au parcours', validator: 'Responsable' },
  { id: 's1', label: 'Suivi des 3 cours', validator: 'Leader' },
  { id: 's2', label: 'Entretien de baptême', validator: 'Responsable' },
  { id: 's3', label: 'Baptême physique', validator: 'Pasteur' },
];

interface ProgrammesViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  onAddAuditLog: (log: AuditLog) => void;
  activeBranch: Branch;
  simulatedRole: string;
  operator?: Member;
  permissionMatrix: PermissionMatrix;
  forms?: FormDef[];
  reports?: Report[];
  audits?: AuditLog[];
  onAddReport?: (r: Report) => void;
}

export default function ProgrammesView({
  members, onUpdateMember, onAddAuditLog, activeBranch, simulatedRole, operator, permissionMatrix,
  forms = [], reports = [], audits = [], onAddReport,
}: ProgrammesViewProps) {
  const busLines = useBusLines();
  const departments = useDepartments();
  const ministries = useMinistries();
  // §11.3 — capacité déléguable : rôle natif OU délégation active ciblant cet opérateur.
  const delegations = load('bc_delegations', [] as Delegation[]);
  const canValidateBaptism = resolveCapability(permissionMatrix, 'modifier_jalons_bapteme_integration', operator, simulatedRole, delegations, load('bc_capability_overrides', [] as CapabilityOverride[]), load('bc_special_authorizations', [] as SpecialAuthorization[]));

  // Étapes réelles du parcours (FormBuilder fd_bapteme) — le fallback = les mêmes seedées.
  const steps = forms.find((f) => f.id === 'fd_bapteme')?.steps ?? FALLBACK_STEPS;
  const stepIndex = (stepId?: string) => Math.max(0, steps.findIndex((s) => s.id === stepId));

  // Périmètre : branche + scope opérateur. Les « Nouveaux » sont inclus — on inscrit
  // au baptême depuis la base des membres OU des nouveaux (spec lot 4).
  const scopedMembers = members.filter(m =>
    (activeBranch === 'global' || m.branch === activeBranch) &&
    (!operator || inMemberScope(operator, m, simulatedRole, busLines, departments, ministries))
  );

  // Candidat = inscrit au parcours (dept Baptême + étape courante), pas encore baptisé.
  const candidates = scopedMembers.filter(m => m.baptismStatus !== 'baptise' && m.currentStepId && m.departments?.dept_bapteme);
  const enrollable = scopedMembers.filter(m => m.baptismStatus !== 'baptise' && !(m.currentStepId && m.departments?.dept_bapteme));
  const baptised = scopedMembers.filter(m => m.baptismStatus === 'baptise');

  // Liste des baptisés passés par le département, sur une période (sélecteur).
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-01-01`;
  const [bapFrom, setBapFrom] = useState(defaultFrom);
  const [bapTo, setBapTo] = useState(today.toISOString().split('T')[0]);
  const baptisedInPeriod = baptised
    .filter(m => m.baptismDate && m.baptismDate >= bapFrom && m.baptismDate <= bapTo)
    .sort((a, b) => (b.baptismDate ?? '').localeCompare(a.baptismDate ?? ''));

  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [selected360, setSelected360] = useState<Member | null>(null);

  const audit = (actionType: string, details: string) => onAddAuditLog({
    id: `aud_bap_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType,
    operatorName: operator ? `${operator.firstName} ${operator.lastName}` : simulatedRole,
    operatorId: operator?.id ?? '',
    details,
  });

  const enroll = (m: Member) => {
    onUpdateMember({
      ...m,
      departments: { ...m.departments, dept_bapteme: m.departments?.dept_bapteme ?? 'Membre' },
      currentStepId: steps[0]?.id ?? 's0',
    });
    audit('BAPTISM_ENROLLED', `${m.firstName} ${m.lastName} inscrit(e) au parcours de baptême.`);
    toast.success(`${m.firstName} ${m.lastName} inscrit(e) au parcours de baptême.`);
    setShowEnroll(false);
    setEnrollSearch('');
  };

  // Avancer / reculer l'état d'un candidat. Dernière étape validée → baptisé (via département).
  const moveStep = (m: Member, dir: 1 | -1) => {
    const i = stepIndex(m.currentStepId);
    const next = i + dir;
    if (next < 0) return;
    if (next >= steps.length) {
      onUpdateMember({
        ...m,
        baptismStatus: 'baptise',
        baptismDate: new Date().toISOString().split('T')[0],
        baptismViaDepartment: true, // §9.2 — passé par le process du département
        currentStepId: undefined,
      });
      audit('BAPTISM_COMPLETED', `Baptême physique validé pour ${m.firstName} ${m.lastName} (parcours complet).`);
      toast.success(`${m.firstName} ${m.lastName} est maintenant baptisé(e) 🎉`);
      return;
    }
    onUpdateMember({ ...m, currentStepId: steps[next].id });
    audit('BAPTISM_STEP', `${m.firstName} ${m.lastName} → étape « ${steps[next].label} ».`);
  };

  const enrollResults = enrollable
    .filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(enrollSearch.trim().toLowerCase()) || m.phone.includes(enrollSearch.trim()))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2">
            <Droplet size={16} /> Parcours de Baptême
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Inscription depuis la base des membres/nouveaux, suivi étape par étape, liste des baptisés par période.
          </p>
        </div>
        {canValidateBaptism && (
          <button
            id="baptism-enroll-btn"
            onClick={() => setShowEnroll(true)}
            className="px-4 py-2 bg-bc-green text-white rounded-full text-xs font-bold flex items-center gap-1.5 hover:opacity-90 active-scale"
          >
            <Plus size={14} /> Inscrire au baptême
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Candidats en cours de parcours */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm space-y-4">
          <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary flex items-center gap-2">
            <Clock size={13} /> Candidats en cours de parcours ({candidates.length})
          </h4>
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {candidates.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-8">Aucun candidat inscrit — « Inscrire au baptême » pour commencer un suivi.</p>
            ) : (
              candidates.map((m) => {
                const i = stepIndex(m.currentStepId);
                return (
                  <div key={m.id} className="border border-bc-border rounded-2xl p-4 space-y-3 bg-bc-canvas/20">
                    <div className="flex justify-between items-start">
                      <button type="button" onClick={() => setSelected360(m)} className="flex items-center space-x-2.5 text-left hover:opacity-80 active-scale">
                        <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-8 h-8 bg-bc-canvas border border-bc-border text-[10px]" />
                        <div>
                          <h5 className="font-ui font-bold text-xs text-bc-text">{m.lastName} {m.firstName}</h5>
                          <p className="text-[9px] text-bc-text-secondary font-mono">{m.phone}{m.level === 'nouveau' ? ' · Nouveau' : ''}</p>
                        </div>
                      </button>
                      <span className="text-[8px] bg-bc-green/15 text-bc-text px-2 py-0.5 rounded-full font-bold uppercase">
                        Étape {i + 1}/{steps.length}
                      </span>
                    </div>

                    {/* Étapes réelles (fd_bapteme) — l'étape courante ressort */}
                    <div className={`grid gap-1 text-[8px] text-center font-bold`} style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
                      {steps.map((s, si) => (
                        <div
                          key={s.id}
                          title={`${s.label} — validé par ${s.validator}`}
                          className={`p-1 rounded-lg truncate ${si < i ? 'bg-bc-green text-white' : si === i ? 'bg-bc-cerulean text-white ring-1 ring-bc-cerulean' : 'bg-bc-canvas text-bc-text-secondary border border-bc-border'}`}
                        >
                          {si + 1}. {s.label}
                        </div>
                      ))}
                    </div>

                    {canValidateBaptism && (
                      <div className="flex justify-between items-center pt-2 border-t border-bc-border/50">
                        <button
                          onClick={() => moveStep(m, -1)}
                          disabled={i === 0}
                          className="px-2.5 py-1 text-[10px] font-bold rounded-full border border-bc-border text-bc-text-secondary hover:bg-bc-canvas disabled:opacity-30 flex items-center gap-1 active-scale"
                        >
                          <ChevronLeft size={10} /> Reculer
                        </button>
                        <button
                          id={`baptism-advance-${m.id}`}
                          onClick={() => moveStep(m, 1)}
                          className={`px-3 py-1 font-ui font-bold text-[10px] rounded-full flex items-center gap-1 active-scale ${i === steps.length - 1 ? 'bg-bc-gold text-bc-text hover:scale-105' : 'bg-bc-green text-white hover:opacity-90'}`}
                        >
                          <CheckCircle size={10} /> {i === steps.length - 1 ? 'Valider le baptême 💧' : `Valider « ${steps[i].label} »`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Baptisés par période */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text flex items-center gap-2">
              <Award size={13} /> Baptisés sur la période ({baptisedInPeriod.length})
            </h4>
            <div className="flex items-center gap-1.5">
              <input type="date" value={bapFrom} onChange={(e) => setBapFrom(e.target.value)} className="border border-bc-border rounded-full text-[10px] py-1 px-2 bg-white focus:outline-none" />
              <span className="text-[10px] text-bc-text-secondary">→</span>
              <input type="date" value={bapTo} onChange={(e) => setBapTo(e.target.value)} className="border border-bc-border rounded-full text-[10px] py-1 px-2 bg-white focus:outline-none" />
            </div>
          </div>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {baptisedInPeriod.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-8">Aucun baptême sur cette période.</p>
            ) : (
              baptisedInPeriod.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected360(m)}
                  className="w-full border border-bc-border rounded-2xl p-3 flex justify-between items-center bg-white hover:bg-bc-canvas/20 text-left active-scale"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar icon={Award} size="sm" className="w-8 h-8 bg-bc-gold/10 border border-bc-gold text-bc-gold" />
                    <div>
                      <h5 className="font-ui font-bold text-xs text-bc-text">{m.lastName} {m.firstName}</h5>
                      <p className="text-[9px] text-bc-text-secondary">
                        Baptisé(e) le {m.baptismDate ? new Date(`${m.baptismDate}T12:00:00`).toLocaleDateString('fr-FR') : '—'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.baptismViaDepartment ? 'text-bc-text bg-bc-green/10' : 'text-bc-text-secondary bg-bc-canvas border border-bc-border'}`}>
                    {m.baptismViaDepartment ? 'Via le département' : 'Hors process'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Inscription — recherche dans la base des membres ET des nouveaux, pas de ressaisie */}
      {showEnroll && (
        <Modal open={true} onClose={() => setShowEnroll(false)} title="Inscrire au parcours de baptême" maxWidth="max-w-md">
          <div className="space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-bc-text-secondary" />
              <input
                id="baptism-enroll-search"
                autoFocus
                value={enrollSearch}
                onChange={(e) => setEnrollSearch(e.target.value)}
                placeholder="Rechercher un membre ou un nouveau…"
                className="w-full border border-bc-border rounded-full pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {enrollResults.length === 0 ? (
                <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucun membre/nouveau non baptisé ne correspond.</p>
              ) : (
                enrollResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => enroll(m)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-bc-border hover:border-bc-green bg-white text-left active-scale"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-7 h-7 bg-bc-canvas border border-bc-border text-[10px]" />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-bc-text truncate">{m.firstName} {m.lastName}</span>
                        <span className="block text-[9px] text-bc-text-secondary">{labelFor(m.level)}{m.level === 'nouveau' ? ' (base des nouveaux)' : ''} · {m.phone}</span>
                      </span>
                    </span>
                    <Plus size={13} className="text-bc-green shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Fiche de suivi du candidat/baptisé */}
      {selected360 && (
        <Member360View
          member={selected360}
          onClose={() => setSelected360(null)}
          simulatedRole={simulatedRole}
          reports={reports}
          audits={audits}
          onAddReport={onAddReport}
          onUpdate={(m) => { onUpdateMember(m); setSelected360(m); }}
          onEdit={() => {}}
          operator={operator}
          permissionMatrix={permissionMatrix}
          forms={forms}
        />
      )}
    </div>
  );
}
