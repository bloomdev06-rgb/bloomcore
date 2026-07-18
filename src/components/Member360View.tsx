import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Member, Branch, Report, AuditLog, PermissionMatrix, Delegation, FormDef, CapabilityOverride, SpecialAuthorization } from '../types';
import { useDepartments, useBusLines, useProjects, load, resolveCapability, labelFor } from '../data';
import { DEFAULT_OPERATOR_NAME } from '../data/operator';
import { isRed } from '../data/kpi';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { X, Edit, Phone, Mail, Compass, ShieldAlert, Activity, User, Briefcase, Calendar, MapPin, Database, ArrowRight, Clock, CheckCircle2, Coins } from 'lucide-react';
import { HealthSmiley } from './ui/HealthSmiley';
import { Avatar } from './ui/Avatar';
import { PhotoLightbox } from './ui/PhotoLightbox';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';

const COMMUNITY_LEVELS = ['nouveau', 'stagiaire', 'boss', 'leader', 'coach'];
const CURSUS_LEVELS = ['aucun', 'appele', 'serviteur', 'gagneur_ame', 'assistant_pasteur', 'pasteur_assistant', 'pasteur_titulaire'];
// P4.9(c) — seul catalogue de parcours à étapes réellement défini dans l'app (cf. FormBuilderView fd_bapteme).
// Pas de catalogue équivalent pour dept_eden_zero ailleurs : on affiche son étape en texte brut plutôt que d'inventer des libellés.
const PARCOURS_STEPS: Record<string, string[]> = {
  dept_bapteme: ['Inscription au parcours', 'Suivi des 3 cours', 'Entretien de baptême', 'Baptême physique'],
};

function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const idx = steps.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`px-3 py-1 rounded-full ${i < idx ? 'bg-bc-success/10 text-bc-success' : i === idx ? 'bg-bc-green text-white' : 'text-bc-text-secondary/40'}`}>{labelFor(s)}</span>
          {i < steps.length - 1 && <ArrowRight size={12} className={i < idx ? 'text-bc-success' : 'text-bc-border'} />}
        </React.Fragment>
      ))}
    </div>
  );
}

interface Member360ViewProps {
  member: Member;
  onClose: () => void;
  onEdit: (member: Member) => void;
  onUpdate?: (member: Member) => void;
  reports?: Report[];
  onAddReport?: (r: Report) => void;
  simulatedRole: string;
  audits?: AuditLog[];
  operator?: Member;
  permissionMatrix: PermissionMatrix;
  forms?: FormDef[];
}

export default function Member360View({ member, onClose, onEdit, onUpdate, reports = [], onAddReport, simulatedRole, audits = [], operator, permissionMatrix, forms = [] }: Member360ViewProps) {
  const canManage = ['Pasteur Principal', 'Pasteur', 'Ministre', 'Responsable', 'Coach', 'Admin', 'Super Admin'].includes(simulatedRole);
  // P1.4 — dept_bapteme's step labels read live from FormBuilder's fd_bapteme FormDef when
  // present, falling back to the static PARCOURS_STEPS catalog otherwise.
  const baptemeForm = forms.find((f) => f.id === 'fd_bapteme');
  // Le Stepper matche par LABEL, mais member.currentStepId est un ID d'étape ('s0'..'s3').
  // On garde donc les paires {id,label} pour traduire l'id courant → son label (sinon
  // indexOf(id) dans un tableau de labels = -1 → aucune étape surlignée).
  const parcoursStepDefs: Record<string, { id: string; label: string }[]> = {
    dept_bapteme: baptemeForm?.steps?.length
      ? baptemeForm.steps.map((s) => ({ id: s.id, label: s.label }))
      : PARCOURS_STEPS.dept_bapteme.map((label, i) => ({ id: `s${i}`, label })),
  };
  // Même liste que l'icône d'édition de MembersView (MembersView.tsx:572,784) — la fiche 360
  // ouvre le même formulaire d'édition complet et doit être gardée à l'identique.
  const canEditProfile = ['Pasteur Principal', 'Pasteur', 'Ministre', 'Admin', 'Responsable', 'Super Admin'].includes(simulatedRole);
  const fullName = `${member.firstName} ${member.lastName}`;
  const memberReports = reports.filter(r => r.content?.memberId === member.id && r.reportType === 'rapport_suivi_coach');
  // P4.9(a) — AuditLog.details est du texte libre qui embarque déjà le nom complet (cf. handleAddMember/handleUpdateMember dans App.tsx).
  const memberAudits = audits.filter(a => a.details.includes(fullName)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  // P4.9(b) — Project.team[].member est un nom libre (pas un id), cf. types.ts — matching par nom complet.
  const projects = useProjects();
  const memberProjects = projects.filter(p => (p.team ?? []).some(t => t.member === fullName));
  // P4.9(d) — pas de store d'historique dédié : on retrace la courbe à partir des vrais rapports Bloom Bus
  // déjà soumis pour ce membre (rapport_bloom_bus_member), jamais de valeurs rétroactives inventées.
  const healthHistory = reports
    .filter(r => r.reportType === 'rapport_bloom_bus_member' && r.content?.memberId === member.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({
      date: r.date,
      Spirituel: r.content.sprVal,
      Social: r.content.socVal,
      Financier: r.content.finVal,
      Physique: r.content.phyVal,
    }));
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [showCoachReportModal, setShowCoachReportModal] = useState(false);
  const [coachReportNotes, setCoachReportNotes] = useState('');
  const handleSaveCoachReport = (e: React.FormEvent) => {
    e.preventDefault();
    onAddReport?.({
      id: `rep_coach_${Date.now()}`,
      authorId: 'mem_1',
      authorName: DEFAULT_OPERATOR_NAME, // ponytail: opérateur figé tant que l'auth n'est pas là
      authorRole: simulatedRole,
      targetBranch: member.branch,
      date: new Date().toISOString().split('T')[0],
      reportType: 'rapport_suivi_coach',
      confidential: true,
      content: { memberId: member.id, notes: coachReportNotes },
    });
    setCoachReportNotes('');
    setShowCoachReportModal(false);
  };
  const INITIAL_DEPARTMENTS = useDepartments();
  const BUS_LINES = useBusLines();
  const busLine = BUS_LINES.find(b => b.id === member.bloomBusId);
  // P4.9(c) — parcours à étapes : le département "spécial" du membre qui porte ce workflow, s'il y en a un.
  const parcoursDeptId = Object.keys(member.departments).find(
    id => INITIAL_DEPARTMENTS.find(d => d.id === id)?.specialFunction === 'parcours_etapes'
  );
  const parcoursDept = parcoursDeptId ? INITIAL_DEPARTMENTS.find(d => d.id === parcoursDeptId) : undefined;
  const [activeTab, setActiveTab] = useState('perso');
  const tabsRef = useRef<HTMLDivElement>(null);

  // §11.3 — deux axes du radar recoupent des capacités déléguables : rôle natif OU
  // délégation active ciblant cet opérateur (cf. hasCapability). Les autres axes
  // (spirituel/social/physique) ne sont pas des capacités déléguables du cahier des charges.
  const delegations = load('bc_delegations', [] as Delegation[]);
  const capOverrides = load('bc_capability_overrides', [] as CapabilityOverride[]);
  const specialAuths = load('bc_special_authorizations', [] as SpecialAuthorization[]);
  const canSeeFinances = resolveCapability(permissionMatrix, 'consulter_situation_financiere', operator, simulatedRole, delegations, capOverrides, specialAuths);
  const canSeeAttendance = resolveCapability(permissionMatrix, 'consulter_historique_presence', operator, simulatedRole, delegations, capOverrides, specialAuths);
  const healthData = [
    { subject: 'Spirituel', A: member.healthKPIs.spirituel, fullMark: 5 },
    { subject: 'Social', A: member.healthKPIs.social, fullMark: 5 },
    { subject: 'Physique', A: member.healthKPIs.physique, fullMark: 5 },
    ...(canSeeFinances ? [{ subject: 'Financier', A: member.healthKPIs.financier, fullMark: 5 }] : []),
    ...(canSeeAttendance ? [
      { subject: 'Présence Culte', A: member.healthKPIs.presenceCulte, fullMark: 5 },
      { subject: 'Présence Service', A: member.healthKPIs.presenceService, fullMark: 5 },
    ] : []),
  ];

  // Présence Culte/Service : aucun historique n'existe (les rapports Bloom Bus ne
  // notent que spirituel/social/financier/physique) — pas de courbe inventée, seul le
  // smiley de valeur courante reste affiché pour ces deux axes (cf. healthData plus bas).
  const evolutionCriteria = [
    { key: 'Spirituel', color: 'var(--color-bc-green)' },
    { key: 'Social', color: 'var(--color-bc-cerulean)' },
    ...(canSeeFinances ? [{ key: 'Financier', color: 'var(--color-bc-warning)' }] : []),
    { key: 'Physique', color: 'var(--color-bc-danger)' },
  ];

  const isAtRisk = isRed(member);

  // createPortal vers document.body : sinon l'overlay `fixed` est capté par un ancêtre avec
  // `filter`/`transform` (l'animation de page dans App.tsx laisse `filter: blur(0px)`), ce qui
  // le décale hors écran quand la page est longue (beaucoup de membres) → la fiche « ne s'affiche pas ».
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bc-canvas rounded-[2.5rem] w-full max-w-5xl h-[90vh] border border-bc-border shadow-2xl relative flex flex-col overflow-hidden">
        
        {/* Header (Always visible) */}
        <div className="p-6 bg-white border-b border-bc-border shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-bc-canvas rounded-full text-bc-text-secondary hover:text-bc-text transition-colors active-scale"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => member.avatarUrl && setShowPhotoLightbox(true)}
                className={member.avatarUrl ? 'cursor-zoom-in active-scale' : 'cursor-default'}
                aria-label="Agrandir la photo"
              >
                <Avatar
                  src={member.avatarUrl}
                  initials={`${member.firstName[0]}${member.lastName[0]}`}
                  size="lg"
                  className="bg-bc-green text-white font-black shadow-sm"
                />
              </button>
              <div>
                <h2 className="text-2xl font-ui font-extrabold text-bc-text">
                  {member.firstName} {member.lastName}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bc-canvas text-bc-text-secondary">
                    {labelFor(member.level)}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bc-canvas text-bc-text-secondary">
                    {member.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-bc-canvas text-bc-text-secondary">
                    {labelFor(member.baptismStatus)}
                  </span>
                  {isAtRisk && (
                    <Badge tone="danger" className="text-[10px] flex items-center gap-1">
                      <ShieldAlert size={10} /> Au rouge
                    </Badge>
                  )}
                  {member.isDrachme && (
                    <Badge tone="warning" className="text-[10px] flex items-center gap-1">
                      <Coins size={10} /> Drachme (perdu)
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManage && onUpdate && (
                <button
                  onClick={() => onUpdate({ ...member, isDrachme: !member.isDrachme })}
                  className={`px-4 py-2 rounded-full text-xs font-ui font-bold flex items-center gap-2 border transition-colors active-scale ${
                    member.isDrachme ? 'bg-bc-warning/10 border-bc-warning/30 text-bc-warning' : 'border-bc-border text-bc-text-secondary hover:bg-bc-canvas'
                  }`}
                >
                  <Coins size={14} /> {member.isDrachme ? 'Retirer Drachme' : 'Marquer Drachme'}
                </button>
              )}
              {canEditProfile && (
                <button
                  onClick={() => onEdit(member)}
                  className="px-5 py-2 border border-bc-border rounded-full text-xs font-ui font-bold hover:bg-bc-canvas flex items-center gap-2 active-scale"
                >
                  <Edit size={14} /> Modifier Profil
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {/* Mobile : une seule colonne scrollable (la colonne Santé shrink-0 mangeait les 90vh et
            bloquait tout défilement) ; desktop : deux panneaux à scroll indépendant. */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          
          {/* Side Dashboard (Health) */}
          <div className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-bc-border p-6 shrink-0 md:overflow-y-auto">
            <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <Activity size={16} /> Santé 360°
            </h3>
            
            <div className="mb-4 bg-bc-canvas p-3 rounded-2xl border border-bc-border space-y-3">
              {healthHistory.length >= 2 ? (
                evolutionCriteria.map(c => (
                  <div key={c.key}>
                    <span className="text-[9px] font-bold text-bc-text-secondary uppercase tracking-wider">{c.key}</span>
                    <div className="h-14">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={healthHistory} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                          <YAxis domain={[1, 5]} hide />
                          <Tooltip labelFormatter={(d) => d} formatter={(v) => [v, c.key]} />
                          <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-bc-text-secondary italic">
                  Pas encore assez de rapports Bloom Bus pour tracer une évolution ({healthHistory.length}/2 minimum).
                </p>
              )}
            </div>

            <div className="mb-6 bg-bc-canvas p-4 rounded-2xl border border-bc-border">
              <div className="grid grid-cols-5 gap-1">
                {healthData.map(axis => {
                  return (
                    <div key={axis.subject} className="flex flex-col items-center justify-center">
                      <div title={`${axis.subject}: ${axis.A}/5`}><HealthSmiley value={axis.A} size={24} /></div>
                      <span className="text-[8px] font-bold text-bc-text-secondary mt-1 uppercase text-center truncate w-full">{axis.subject}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Main Tabs Area */}
          <div className="flex-1 flex flex-col md:overflow-hidden bg-bc-canvas/50">
            <div className="flex items-center border-b border-bc-border bg-white shrink-0 px-2">
              <button 
                onClick={() => {
                  tabsRef.current?.scrollBy({ left: -150, behavior: 'smooth' });
                }}
                className="p-2 text-bc-text-secondary hover:text-bc-text transition-colors shrink-0 active-scale"
              >
                <ArrowRight size={16} className="rotate-180" />
              </button>
              
              <div ref={tabsRef} className="flex flex-1 overflow-x-auto no-scrollbar scroll-smooth">
                {[
                  { id: 'perso', label: 'Infos Personnelles' },
                  { id: 'spirituel', label: 'Infos Spirituelles' },
                  { id: 'evolution', label: 'Évolution Multi-axes' },
                  { id: 'appartenances', label: 'Appartenances & Ancrages' },
                  { id: 'mentorat', label: 'Mentorat & Encadrement' },
                  { id: 'rapports', label: 'Rapports' },
                  { id: 'audit', label: "Historique d'audit" },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors active-scale ${
                      activeTab === tab.id ? 'border-bc-green text-bc-text' : 'border-transparent text-bc-text-secondary hover:text-bc-text'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => {
                  tabsRef.current?.scrollBy({ left: 150, behavior: 'smooth' });
                }}
                className="p-2 text-bc-text-secondary hover:text-bc-text transition-colors shrink-0 active-scale"
              >
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="flex-1 md:overflow-y-auto p-6">
              
              {activeTab === 'perso' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <User size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Identité</span>
                      </div>
                      <p className="text-sm font-bold text-bc-text">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-bc-text-secondary mt-1">Né(e) le: {member.birthDate}</p>
                      <p className="text-xs text-bc-text-secondary">Sexe: {member.gender === 'H' ? 'Homme' : 'Femme'} <span className="mx-1">•</span> Nationalité: Ivoirienne</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Briefcase size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Situation</span>
                      </div>
                      <p className="text-sm font-bold text-bc-text">{canSeeFinances ? ((member.profession || 'Non renseignée') + (member.schoolLevel ? ` — ${member.schoolLevel}` : '')) : <span className="italic text-bc-text-secondary">Confidentiel</span>}</p>
                      <p className="text-xs text-bc-text-secondary mt-1">{member.maritalStatus}</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm col-span-2">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Phone size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Contacts</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-xs text-bc-text-secondary">Téléphone Principal</p>
                          <p className="font-bold text-bc-text">{member.phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Email</p>
                          <p className="font-bold text-bc-text">{member.email || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Tél. Parent/Proche</p>
                          <p className="font-bold text-bc-text">{member.phoneParent || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Contact d'urgence</p>
                          <p className="font-bold text-bc-danger">01 02 03 04 05</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm col-span-2">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <MapPin size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Localisation</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-xs text-bc-text-secondary">Commune</p>
                          <p className="font-bold text-bc-text">{member.gps?.commune || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Quartier</p>
                          <p className="font-bold text-bc-text">Riviera Palmeraie</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Coordonnées GPS</p>
                          <p className="font-mono text-xs text-bc-text-secondary">{member.gps?.lat}, {member.gps?.lng}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'spirituel' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Parcours & Intégration</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date 1ère visite</span>
                        <span className="text-sm font-bold text-bc-text">{member.entryDate}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date de conversion</span>
                        <span className="text-sm font-bold text-bc-text">12 Août 2021</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date d'intégration</span>
                        <span className="text-sm font-bold text-bc-text">{member.integrationState === 'integre' ? '15 Octobre 2025' : 'En attente'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Statut Baptême</span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-bc-text block">{labelFor(member.baptismStatus)}</span>
                          {member.baptismStatus === 'baptise' && (
                            <span className="text-[10px] text-bc-success font-bold">
                              {member.baptismDate ? `le ${member.baptismDate}` : ''}
                              {member.baptismViaDepartment === true ? ' · via dép. Baptême' : member.baptismViaDepartment === false ? ' · hors process' : ''}
                            </span>
                          )}
                          {member.baptismStatus === 'non_baptise' && (
                            <span className="text-[10px] text-bc-warning font-bold">Aucun baptême enregistré</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'evolution' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Niveau Communautaire</h4>
                    <Stepper steps={COMMUNITY_LEVELS} current={member.level} />
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Cursus Pastoral</h4>
                    <Stepper steps={CURSUS_LEVELS} current={member.pastoralCursus} />
                  </div>

                  {parcoursDept && (
                    <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                      <h4 className="font-ui font-bold text-bc-text mb-4">Parcours à étapes — {parcoursDept.name}</h4>
                      {member.currentStepId ? (
                        parcoursStepDefs[parcoursDept.id] ? (
                          <Stepper
                            steps={parcoursStepDefs[parcoursDept.id].map((s) => s.label)}
                            current={parcoursStepDefs[parcoursDept.id].find((s) => s.id === member.currentStepId)?.label ?? ''}
                          />
                        ) : (
                          <p className="text-xs text-bc-text-secondary">Étape actuelle : <span className="font-bold text-bc-text">{member.currentStepId}</span></p>
                        )
                      ) : (
                        <p className="text-xs text-bc-text-secondary italic">Pas encore inscrit(e) à une étape de ce parcours.</p>
                      )}
                    </div>
                  )}

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Courbe de Santé (Bloom Bus)</h4>
                    {healthHistory.length >= 2 ? (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={healthHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bc-border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-bc-text-secondary)' }} />
                            <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: 'var(--color-bc-text-secondary)' }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Line type="monotone" dataKey="Spirituel" stroke="var(--color-bc-green)" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="Social" stroke="var(--color-bc-cerulean)" strokeWidth={2} dot={{ r: 3 }} />
                            {canSeeFinances && <Line type="monotone" dataKey="Financier" stroke="var(--color-bc-warning)" strokeWidth={2} dot={{ r: 3 }} />}
                            <Line type="monotone" dataKey="Physique" stroke="var(--color-bc-danger)" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-bc-text-secondary italic">
                        Pas encore assez de rapports Bloom Bus pour tracer une courbe d'évolution ({healthHistory.length}/2 minimum).
                      </p>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Historique des Fonctions</h4>
                    <div className="space-y-3">
                      {Object.entries(member.departments).map(([deptId, role]) => {
                        const dept = INITIAL_DEPARTMENTS.find(d => d.id === deptId);
                        return (
                          <div key={deptId} className="flex justify-between items-center">
                            <span className="text-sm text-bc-text-secondary">{dept ? dept.name : deptId}</span>
                            <span className="text-xs font-bold text-bc-text bg-bc-canvas px-2 py-1 rounded">{role}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'appartenances' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Ancrages</h4>
                    <p className="text-xs text-bc-text-secondary italic mb-4">Les affectations sont gérées depuis les modules respectifs.</p>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold text-bc-text-secondary uppercase">Départements</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.keys(member.departments).map(deptId => {
                            const dept = INITIAL_DEPARTMENTS.find(d => d.id === deptId);
                            return (
                              <span key={deptId} className="px-3 py-1 bg-bc-canvas text-bc-text-secondary text-xs font-bold rounded-full">
                                {dept ? dept.name : deptId}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-bc-text-secondary uppercase">Bloom Bus</p>
                        <div className="mt-2">
                          <span className="px-3 py-1 bg-bc-canvas text-bc-text-secondary text-xs font-bold rounded-full">{busLine ? `${busLine.name} · ${busLine.zone}` : 'Non rattaché'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* P4.9(b) */}
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
                      <Briefcase size={16} /> Projets
                    </h4>
                    {memberProjects.length === 0 ? (
                      <p className="text-xs text-bc-text-secondary italic">Aucun projet actif pour ce membre.</p>
                    ) : (
                      <div className="space-y-2">
                        {memberProjects.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-bc-canvas/50 border border-bc-border rounded-xl px-3 py-2">
                            <span className="text-sm font-bold text-bc-text">{p.name}</span>
                            <span className="text-xs font-bold text-bc-text-secondary bg-bc-canvas px-2 py-1 rounded">
                              {p.team!.find(t => t.member === fullName)!.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'mentorat' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Superviseurs & Mentors</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="p-4 border border-bc-border rounded-2xl bg-bc-canvas/50">
                        <p className="text-[10px] font-bold text-bc-text-secondary uppercase tracking-wider mb-3">Service (Département)</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-bc-text-secondary border border-bc-border">CO</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Coach Othniel</p>
                            <p className="text-[10px] text-bc-text-secondary">Suivi direct</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border border-bc-border rounded-2xl bg-bc-canvas/50">
                        <p className="text-[10px] font-bold text-bc-text-secondary uppercase tracking-wider mb-3">Territoriale (Bloom Bus)</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-bc-text-secondary border border-bc-border">RC</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Resp. Charles</p>
                            <p className="text-[10px] text-bc-text-secondary">Zone Cocody Centre</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border border-bc-warning/20 rounded-2xl bg-bc-warning/10 col-span-1 sm:col-span-2">
                        <p className="text-[10px] font-bold text-bc-warning uppercase tracking-wider mb-3">Mentor de Cursus</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-bc-warning border border-bc-warning/30">PM</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Ps. Marc</p>
                            <p className="text-[10px] text-bc-text-secondary">Ligne de mentorat</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'rapports' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-bc-text-secondary italic">Suivi de ce membre par son Coach. Rapports confidentiels, limités aux habilitations requises.</p>
                    {canManage && (
                      <button
                        onClick={() => setShowCoachReportModal(true)}
                        className="shrink-0 ml-4 text-[10px] font-bold text-bc-green hover:underline whitespace-nowrap active-scale"
                      >
                        Rédiger un suivi
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {memberReports.length === 0 && (
                      <p className="text-xs text-bc-text-secondary italic">Aucun rapport de suivi pour ce membre.</p>
                    )}
                    {memberReports.map(r => (
                      <div key={r.id} className="bg-white p-4 rounded-xl border border-bc-border shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold px-2 py-1 bg-bc-success/10 text-bc-success rounded uppercase">Rapport de Suivi (Coach)</span>
                          <span className="text-xs text-bc-text-secondary">{r.date}</span>
                        </div>
                        <p className="text-sm text-bc-text-secondary line-clamp-2">{r.content?.notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
                <div className="space-y-6 max-w-2xl">
                  {memberAudits.length === 0 ? (
                    <p className="text-xs text-bc-text-secondary italic">Aucune entrée d'audit pour ce membre.</p>
                  ) : (
                    <div className="relative border-l border-bc-border pl-4 space-y-4">
                      {memberAudits.map((a, i) => (
                        <div key={a.id} className="relative">
                          <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ${i === 0 ? 'bg-bc-green' : 'bg-bc-border'}`} />
                          <p className="text-xs font-bold text-bc-text">{a.details}</p>
                          <p className="text-[10px] text-bc-text-secondary">
                            {new Date(a.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} par {a.operatorName}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {showCoachReportModal && (
        <Modal
          open={showCoachReportModal}
          onClose={() => setShowCoachReportModal(false)}
          title={`Rapport de suivi — ${member.firstName} ${member.lastName}`}
          maxWidth="max-w-lg"
        >
            <form onSubmit={handleSaveCoachReport} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-bc-text-secondary">Notes de suivi</label>
                <textarea
                  value={coachReportNotes}
                  onChange={e => setCoachReportNotes(e.target.value)}
                  rows={5}
                  className="w-full mt-2 border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green"
                  placeholder="Observations, entretien, visite…"
                />
              </div>
              <button type="submit" className="w-full bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 active-scale">
                Soumettre le rapport
              </button>
            </form>
        </Modal>
      )}

      {showPhotoLightbox && member.avatarUrl && (
        <PhotoLightbox
          src={member.avatarUrl}
          alt={`${member.firstName} ${member.lastName}`}
          onClose={() => setShowPhotoLightbox(false)}
        />
      )}
    </div>,
    document.body,
  );
}
