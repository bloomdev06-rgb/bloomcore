import React, { useState } from 'react';
import { Branch, Member, Report, Department, DepartmentType, SpecialFunction, Activity as ActivityEntity, AuditLog, Delegation, DeptFunction, Event, PermissionMatrix, FormDef, BloomBusEntity } from '../types';
import { LayoutList, ChevronRight, Users, Calendar, Activity, Plus, X, Sparkles, FileText, CheckCircle, UserCheck, Heart, TrendingUp, Clock, AlertCircle, FolderKanban } from 'lucide-react';
import { useMinistries, useProjects, load, save, activitiesSeed, labelFor } from '../data';
import {
  activeMemberIds, dominantHealthLevel, isRed, moissonBySource, ojTotal,
  pendingFollowUps, periodRange, projectProgress, Period, PeriodInput, weeklyActiveCounts, weeklyBaptismCounts,
  weeklyGrowthSeries, weeklyMoissonCounts, weeklyOjCounts,
} from '../data/kpi';
import { ROLE_HOME_DEPT } from '../data/scope';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { PeriodSelector } from './ui/PeriodSelector';
import { staggerParent, staggerItem } from './ui/motion';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Button } from './ui/Button';
import { HealthSmiley } from './ui/HealthSmiley';
import { HEALTH_AXES, Spark, Ring } from './DashboardView';
import Member360View from './Member360View';
import MemberFormModal from './MemberFormModal';
import { SPECIAL_LABEL } from './CreateDepartmentModal';

interface DepartmentsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  reports?: Report[];
  events?: Event[];
  audits?: AuditLog[];
  permissionMatrix?: PermissionMatrix;
  forms?: FormDef[];
  departments: Department[];
  onUpdateDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  onUpdateMember?: (m: Member) => void;
  onAddMember?: (m: Member) => void;
  busLines?: BloomBusEntity[];
  onAddReport?: (r: Report) => void;
  onAddAuditLog?: (log: AuditLog) => void;
  selectedDept?: string | null;
  setSelectedDept?: (id: string | null) => void;
  operatorId?: string;
  onOpenQuickNewForm?: () => void;
}

const REPORT_ROWS: { type: Report['reportType']; label: string }[] = [
  { type: 'rapport_service', label: 'Rapport de service (roster serviteurs)' },
  { type: 'rapport_rsa', label: 'Rapport RSA (hebdomadaire)' },
  { type: 'rapport_activite', label: "Rapport d'activité" },
  { type: 'rapport_observation', label: 'Observation typée (avec / sans suivi)' },
];


// Rôles cantonnés à un seul département (cf. Sidebar isDeptScoped) : département de test
// associé à chacun, pour qu'ils atterrissent directement dessus sans liste à parcourir.

// Seeds set specialFunction explicitly; id inference is a fallback for runtime-created depts.
const specialFn = (d?: Department): SpecialFunction | undefined => {
  if (!d) return undefined;
  if (d.specialFunction) return d.specialFunction;
  const id = d.id.toLowerCase();
  if (id.includes('adn')) return 'adn';
  if (id.includes('portier')) return 'portiers';
  if (id.includes('integration') || id.includes('intégration')) return 'integration';
  if (id.includes('bus')) return 'bloom_bus';
  if (id.includes('culte')) return 'gestion_cultes';
  if (id.includes('bapteme') || id.includes('baptême') || id.includes('eden') || id.includes('prd')) return 'parcours_etapes';
  return undefined;
};

export default function DepartmentsView({ activeBranch, simulatedRole, members = [], reports = [], events = [], audits = [], permissionMatrix, forms = [], departments, onUpdateDepartments, onUpdateMember, onAddMember, busLines = [], onAddReport, onAddAuditLog, selectedDept: selectedDeptProp, setSelectedDept: setSelectedDeptProp, operatorId, onOpenQuickNewForm }: DepartmentsViewProps) {
  const INITIAL_MINISTRIES = useMinistries();
  // B3 — départements = source unique dans App (prop). Créations/sections via onUpdateDepartments.
  const [show360Member, setShow360Member] = useState<Member | null>(null);
  // Onglet Membres du département — recherche + formulaire ajout/édition, rattachés
  // au département courant (Responsable ne gère ses membres que depuis ici, cf. Sidebar.tsx).
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  // Onglet Intégration — popup de confirmation au clic sur une personne avant tout
  // changement de statut (réception / passage Stagiaire / passage Membre).
  const [statusConfirm, setStatusConfirm] = useState<{ member: Member; transition: 'reception' | 'stagiaire' | 'membre' | 'bloom_bus_validate' | 'bloom_bus_reject' } | null>(null);
  const isChurch = activeBranch === 'church';
  // Le Responsable peut éditer un membre mais pas ses affectations de département ;
  // Ministre/Pasteur/Admin/Super Admin gardent l'édition complète.
  const canManageDeptMembers = ['Responsable', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Admin', 'Super Admin'].includes(simulatedRole);
  const canEditMemberDepartments = simulatedRole !== 'Responsable';

  // On atterrit directement sur le département du Responsable (opérateur courant).
  const operator = members.find(m => m.id === operatorId);
  const myDeptEntries = Object.entries(operator?.departments ?? {});
  // L'affectation RÉELLE de l'opérateur prime ; ROLE_HOME_DEPT n'est qu'un repli pour les
  // rôles sans département assigné — sinon un Responsable de Louange atterrit sur Prod & Tech
  // (dept_tech) et y gère des membres qui ne sont pas les siens.
  const defaultDept = (myDeptEntries.find(([, fn]) => fn === 'responsable')?.[0])
    || myDeptEntries[0]?.[0]
    || ROLE_HOME_DEPT[simulatedRole]
    || departments[0]?.id;

  // Département contrôlé par la Sidebar (fallback : le département du responsable).
  const selectedDept = selectedDeptProp ?? defaultDept;
  const setSelectedDept = setSelectedDeptProp ?? (() => {});
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Synthèse — même sélecteur de période que l'Accueil, pour les KPI qui en dépendent (Baptisés/Moisson/OJ).
  const [period, setPeriod] = useState<Period>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;

  // §7.2 — activités récurrentes du département (localStorage-backed)
  const [activities, setActivities] = useState<ActivityEntity[]>(() => load('bc_activities', activitiesSeed));
  React.useEffect(() => { save('bc_activities', activities); }, [activities]);
  const [newActTitle, setNewActTitle] = useState('');
  const [newActRec, setNewActRec] = useState<ActivityEntity['recurrence']>('Hebdomadaire');
  const [newActDay, setNewActDay] = useState('Samedi');
  const [newActTime, setNewActTime] = useState('18:00');
  const addActivity = () => {
    if (!newActTitle.trim() || !selectedDept) return;
    setActivities(prev => [...prev, { id: `act_${Date.now()}`, departmentId: selectedDept, title: newActTitle.trim(), recurrence: newActRec, day: newActDay || undefined, time: newActTime || undefined }]);
    setNewActTitle('');
  };
  const removeActivity = (id: string) => setActivities(prev => prev.filter(a => a.id !== id));

  // Spec (Onglet 4) : créer un département = Pasteur Principal / Admin / Super Admin.
  const canAdmin = ['Pasteur Principal', 'Admin', 'Super Admin'].includes(simulatedRole);
  const selectedDeptData = departments.find(d => d.id === selectedDept);
  const selectedMinistryData = INITIAL_MINISTRIES.find(m => m.id === selectedDeptData?.ministryId);
  const sf = specialFn(selectedDeptData);

  const deptMembers = members.filter(m => selectedDept && Object.keys(m.departments).includes(selectedDept));
  // Membres actifs du dept sur la période du sélecteur (aligné Accueil).
  const deptActiveCount = selectedDept ? activeMemberIds(reports, effectivePeriod, new Date(), selectedDept).size : 0;
  const deptResponsable = deptMembers.find(m => selectedDept && m.departments[selectedDept] === 'responsable');
  const byFunction = (fn: string) => deptMembers.filter(m => selectedDept && m.departments[selectedDept] === fn);
  // Nouveaux affectés à ce département, suivis par le Responsable jusqu'à Boss :
  // Nouveau (réception non validée) -> Nouveau (en attente d'entretien) -> Stagiaire -> Boss (membre).
  // Chaque étape reste visible dans l'onglet Membres (deptMembers, non filtré par level) tant
  // qu'elle n'a pas atteint Boss ; elle sort de cet onglet Intégration une fois membre.
  const deptNouveaux = deptMembers.filter(m => m.level === 'nouveau');
  const pendingReception = deptNouveaux.filter(m => m.receptionValidated === false);
  const receivedNouveaux = deptNouveaux.filter(m => m.receptionValidated !== false);
  // Un membre en attente de validation Bloom Bus ne doit PAS apparaître aussi dans l'onglet
  // Stagiaires : sinon on le promeut Boss depuis là en court-circuitant « Réceptions à valider ».
  const deptStagiaires = deptMembers.filter(m => m.level === 'stagiaire' && m.deptAttachmentStatus !== 'pending');
  const canValidate = ['Responsable', 'Coach', 'Leader', 'Pasteur', 'Ministre', 'Admin', 'Super Admin'].includes(simulatedRole);
  // Membres enregistrés directement par un responsable hiérarchique Bloom Bus (chemin distinct
  // de la procédure ADN "nouveau") — rattachement à ce département en attente de validation.
  const pendingBloomBusAttachment = deptMembers.filter(m => m.deptAttachmentStatus === 'pending' && m.deptAttachmentOrigin === 'bloom_bus');
  // Chaque changement de statut passe par une confirmation explicite (popup) au clic sur la
  // personne, plutôt qu'une mutation directe au clic sur un bouton.
  const applyStatusTransition = () => {
    if (!statusConfirm || !selectedDept) return;
    const m = statusConfirm.member;
    if (statusConfirm.transition === 'reception') {
      onUpdateMember?.({ ...m, receptionValidated: true });
    } else if (statusConfirm.transition === 'stagiaire') {
      onUpdateMember?.({ ...m, level: 'Stagiaire' });
    } else if (statusConfirm.transition === 'membre') {
      onUpdateMember?.({
        ...m,
        level: 'Boss',
        hasPassedToBossForm: true, // §6.2 — le passage Boss lève la fiche membre
        departments: { ...m.departments, [selectedDept]: 'Membre' },
      });
    } else if (statusConfirm.transition === 'bloom_bus_validate') {
      onUpdateMember?.({ ...m, deptAttachmentStatus: 'validated' });
    } else if (statusConfirm.transition === 'bloom_bus_reject') {
      const restDepts = { ...m.departments };
      delete restDepts[selectedDept];
      // Statut 'rejected' conservé (traçabilité + sort de « Réceptions à valider ») au lieu de
      // remettre à undefined qui rendrait le membre indistinct d'une création normale.
      onUpdateMember?.({ ...m, departments: restDepts, deptAttachmentStatus: 'rejected' });
    }
    setStatusConfirm(null);
  };
  const deptActivities = activities.filter(a => a.departmentId === selectedDept);
  const deptReports = reports.filter(r => r.departmentId === selectedDept);
  // Un département n'a pas ses propres projets — on affiche ceux de son ministère de rattachement.
  const deptProjects = useProjects().filter(p => p.status === 'En cours' && p.scope === 'ministere' && p.ministryId === selectedDeptData?.ministryId);
  const lastDeptActivityDate = deptReports.length
    ? new Date(Math.max(...deptReports.map(r => new Date(r.date).getTime()))).toLocaleDateString('fr-FR')
    : '--';

  // Synthèse — mêmes KPI que l'Accueil (kpi.ts), scopés aux membres/rapports du département.
  // Pas de tuile "Bloom Bus" ici : les lignes de bus ne sont pas rattachées à un département.
  const { from: deptPFrom, to: deptPTo } = periodRange(effectivePeriod);
  const deptPeriodBaptised = deptMembers.filter(m => m.baptismDate && new Date(m.baptismDate) >= deptPFrom && new Date(m.baptismDate) <= deptPTo);
  const deptBaptisedViaDept = deptPeriodBaptised.filter(m => m.baptismViaDepartment).length;
  const deptMoisson = moissonBySource(deptReports, effectivePeriod);
  const deptOj = ojTotal(deptReports, effectivePeriod);
  const deptFollowUps = pendingFollowUps(deptReports);
  const deptRedCount = deptMembers.filter(m => isRed(m)).length;
  const deptGrowthData = weeklyGrowthSeries(deptMembers, deptReports, effectivePeriod);

  // P1.4 — labels read live from FormBuilder's fd_service/fd_rsa FormDefs, id-matched.
  const serviceForm = forms.find((f) => f.id === 'fd_service');
  const serviceLabel = (fieldId: string, fallback: string) =>
    serviceForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;
  const rsaForm = forms.find((f) => f.id === 'fd_rsa');
  const rsaLabel = (fieldId: string, fallback: string) =>
    rsaForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;

  // P2.1/P2.2/P2.3/P2.5 — modal partagé pour les 4 rapports de département. P2.4 — même modal, ciblé par membre.
  const [reportModalType, setReportModalType] = useState<Report['reportType'] | null>(null);
  const [reportTargetMemberId, setReportTargetMemberId] = useState<string | null>(null);
  const [reportServiteurs, setReportServiteurs] = useState<string[]>([]);
  const [reportNotes, setReportNotes] = useState('');
  const [reportActions, setReportActions] = useState<{ label: string; statut: string }[]>([]);
  const [reportActionLabel, setReportActionLabel] = useState('');
  const [reportObsMode, setReportObsMode] = useState<'informatif' | 'suivi'>('informatif');
  const [reportEventId, setReportEventId] = useState('');
  const [reportActivityId, setReportActivityId] = useState('');
  // Rapport de service = toujours relatif à un évènement global récent de la branche.
  const recentEvents = events
    .filter(e => activeBranch === 'global' || e.branch === activeBranch || e.scope === 'both')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  const openReportModal = (type: Report['reportType'], targetMemberId?: string) => {
    setReportServiteurs([]);
    setReportNotes('');
    setReportActions([]);
    setReportActionLabel('');
    setReportObsMode('informatif');
    setReportEventId('');
    setReportActivityId('');
    setReportTargetMemberId(targetMemberId ?? null);
    setReportModalType(type);
  };
  const toggleServiteur = (id: string) => setReportServiteurs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const addReportAction = () => {
    if (!reportActionLabel.trim()) return;
    setReportActions(prev => [...prev, { label: reportActionLabel.trim(), statut: 'En cours' }]);
    setReportActionLabel('');
  };
  const removeReportAction = (idx: number) => setReportActions(prev => prev.filter((_, i) => i !== idx));
  const handleSaveReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportModalType || !selectedDept) return;
    if (reportModalType === 'rapport_service' && !reportEventId) return;
    if (reportModalType === 'rapport_activite' && !reportActivityId) return;
    const content =
      reportModalType === 'rapport_rsa' ? { actions: reportActions, notes: reportNotes }
      : reportModalType === 'rapport_observation' ? { mode: reportObsMode, notes: reportNotes }
      : reportModalType === 'rapport_suivi_coach' ? { memberId: reportTargetMemberId, notes: reportNotes }
      : reportModalType === 'rapport_activite' ? { activityId: reportActivityId, presencesService: reportServiteurs, notes: reportNotes }
      : { presencesService: reportServiteurs, notes: reportNotes }; // rapport_service
    onAddReport?.({
      id: `rep_dept_${Date.now()}`,
      authorId: operator?.id ?? 'mem_1',
      authorName: operator ? `${operator.firstName} ${operator.lastName}` : 'Opérateur',
      authorRole: simulatedRole,
      targetBranch: activeBranch,
      date: new Date().toISOString().split('T')[0],
      reportType: reportModalType,
      departmentId: selectedDept,
      eventId: reportModalType === 'rapport_service' ? reportEventId : undefined,
      confidential: reportModalType === 'rapport_suivi_coach',
      content,
    });
    setReportModalType(null);
  };

  // Hiérarchie interne — assignation de fonction et de section (persistées sur le membre).
  const setDeptFunction = (m: Member, fn: DeptFunction) =>
    selectedDept && onUpdateMember?.({ ...m, departments: { ...m.departments, [selectedDept]: fn } });
  const setMemberSection = (m: Member, sectionId: string | null) => {
    if (!selectedDept) return;
    const ds = { ...(m.deptSections ?? {}) };
    if (sectionId) ds[selectedDept] = sectionId;
    else delete ds[selectedDept];
    // Détaché de sa section → un Responsable de section redevient simple Membre.
    const demote = !sectionId && m.departments[selectedDept] === 'responsable_section';
    onUpdateMember?.({ ...m, deptSections: ds, ...(demote && { departments: { ...m.departments, [selectedDept]: 'membre' as DeptFunction } }) });
  };
  const [newSectionName, setNewSectionName] = useState('');
  const [confirmingSectionId, setConfirmingSectionId] = useState<string | null>(null);
  const updateSelectedDept = (patch: Partial<Department>) =>
    selectedDept && onUpdateDepartments(prev => prev.map(d => d.id === selectedDept ? { ...d, ...patch } : d));
  const addSection = () => {
    if (!newSectionName.trim() || !selectedDeptData) return;
    updateSelectedDept({ sections: [...(selectedDeptData.sections ?? []), { id: `sec_${Date.now()}`, name: newSectionName.trim() }] });
    setNewSectionName('');
  };
  const removeSection = (sectionId: string) => {
    if (!selectedDeptData || !selectedDept) return;
    deptMembers.filter(m => m.deptSections?.[selectedDept] === sectionId).forEach(m => setMemberSection(m, null));
    updateSelectedDept({ sections: (selectedDeptData.sections ?? []).filter(s => s.id !== sectionId) });
  };

  // Spec (§11.3) — un Responsable délègue une capacité dans son propre département.
  const isDeptResponsable = simulatedRole === 'Responsable';
  const internalTabs = [
    { id: 'members', label: 'Membres' },
    { id: 'hierarchy', label: 'Hiérarchie & Assignations' },
    { id: 'nouveaux', label: 'Intégration' },
    { id: 'agenda', label: 'Agenda & Activités' },
    { id: 'reports', label: 'Rapports' },
    { id: 'suivi', label: 'Suivi' },
    ...(isDeptResponsable ? [{ id: 'delegation', label: 'Délégation' }] : []),
  ];

  // ponytail: capacités déléguables dupliquées depuis GovernanceView.tsx (source de vérité) —
  // les deux vues partagent la clé 'bc_delegations', donc les `right` doivent rester alignés.
  const DELEGABLE_CAPS = [
    { key: 'consulter_situation_financiere', label: 'Consulter la Situation Financière' },
    { key: 'consulter_historique_presence', label: "Consulter l'Historique de Présence" },
    { key: 'modifier_jalons_bapteme_integration', label: 'Modifier les Jalons de Baptême/Intégration' },
    { key: 'inscrire_formations_certifications', label: 'Inscrire aux Formations / Certifications' },
  ];
  const [delegations, setDelegations] = useState<Delegation[]>(
    () => load('bc_delegations', [
      { id: 'del_1', from: 'Resp. Louange (Jean K.)', to: 'Adjoint (Paul A.)', scope: 'Département Louange', right: 'modifier_jalons_bapteme_integration' },
    ])
  );
  React.useEffect(() => { save('bc_delegations', delegations); }, [delegations]);
  const [delTo, setDelTo] = useState('');
  const [delRight, setDelRight] = useState(DELEGABLE_CAPS[0].key);
  const deptScopeLabel = selectedDeptData ? `Département ${selectedDeptData.name}` : '';
  const deptDelegations = delegations.filter(d => d.scope === deptScopeLabel);
  const addDeptDelegation = () => {
    if (!delTo || !deptResponsable) return;
    const target = deptMembers.find(m => m.id === delTo);
    if (!target) return;
    setDelegations(prev => [{
      id: `del_${Date.now()}`,
      from: `${deptResponsable.firstName} ${deptResponsable.lastName}`,
      to: `${target.firstName} ${target.lastName}`,
      // §11.3 — l'id réel du délégataire : c'est ce qui rend la délégation effective
      // (hasCapability), pas seulement affichée dans la console.
      toId: target.id,
      scope: deptScopeLabel,
      right: delRight,
    }, ...prev]);
    setDelTo('');
  };
  const revokeDelegation = (id: string) => setDelegations(prev => prev.filter(d => d.id !== id));

  return (
    <div className="pb-6 flex-1">
      {/* Department Console (synthèse du département sélectionné dans la barre latérale) */}
      <div className="flex-1 bg-white rounded-[2rem] border border-bc-border shadow-sm flex flex-col min-h-[500px] overflow-hidden">
        {selectedDeptData ? (
          <>
            <div className="p-6 border-b border-bc-border shrink-0">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div>
                  <h2 className="text-2xl font-ui font-extrabold text-bc-text">
                    Département {selectedDeptData.name}
                  </h2>
                  <p className="text-xs text-bc-text-secondary mt-1 flex items-center gap-2">
                    <span>{selectedMinistryData?.name} • Type : {labelFor(selectedDeptData.type)}</span>
                    {sf && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-bc-green bg-bc-green/10 border border-bc-green/20 px-2 py-0.5 rounded-full">
                        <Sparkles size={10} /> {SPECIAL_LABEL[sf]}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Tab bar — synthèse (accueil) + onglets internes du responsable */}
              <div className="flex gap-1 mt-4 overflow-x-auto">
                <button
                  onClick={() => setActiveTab(null)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors active-scale ${activeTab === null ? 'bg-bc-green text-white' : 'text-bc-text-secondary hover:bg-bc-canvas'}`}
                >
                  Synthèse
                </button>
                {internalTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors active-scale ${activeTab === tab.id ? 'bg-bc-green text-white' : 'text-bc-text-secondary hover:bg-bc-canvas'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-bc-canvas/30">
              {activeTab === null && (
                <div className="space-y-6">
                  {sf && (
                    <div className="bg-bc-green/10 border border-bc-green/20 rounded-2xl p-5">
                      <h3 className="font-ui font-bold text-bc-text flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-bc-green" /> Module spécial · {SPECIAL_LABEL[sf]}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {sf === 'adn' && (
                          <>
                            <button onClick={onOpenQuickNewForm} className="text-xs font-bold bg-white border border-bc-green/20 text-bc-green rounded-full px-4 py-2 hover:bg-bc-green/15">+ Formulaire Nouveau</button>
                            <div className="text-xs text-bc-text-secondary flex items-center">Rapport ADN (comptage) : créé depuis un culte, voir Agenda &amp; Événements.</div>
                          </>
                        )}
                        {sf === 'portiers' && <div className="text-xs text-bc-text-secondary">Rapport de présences (H/F) : créé depuis un culte, voir Agenda &amp; Événements.</div>}
                        {sf === 'gestion_cultes' && <div className="text-xs text-bc-text-secondary">Rapport de culte complet : créé depuis un culte, voir Agenda &amp; Événements.</div>}
                        {sf === 'parcours_etapes' && (
                          <div className="text-xs text-bc-text-secondary">Suivi des étapes du parcours (Inscription → Cours → Entretien → Validation) — voir Constructeur de formulaires.</div>
                        )}
                        {sf === 'bloom_bus' && <div className="text-xs text-bc-text-secondary">Géré dans l'onglet Bloom Bus (maillage territorial).</div>}
                        {sf === 'integration' && <div className="text-xs text-bc-text-secondary">Reçoit automatiquement tous les nouveaux et suit leur parcours (En attente → Suivi → Intégré).</div>}
                      </div>
                    </div>
                  )}
                  {/* Sélecteur de période — mêmes options que l'Accueil, pilote Baptisés/Moisson/OJ ci-dessous */}
                  <div className="flex justify-end">
                    <PeriodSelector
                      period={period}
                      onPeriodChange={setPeriod}
                      customFrom={customFrom}
                      customTo={customTo}
                      onCustomFromChange={setCustomFrom}
                      onCustomToChange={setCustomTo}
                    />
                  </div>

                  {/* KPI Row — mêmes tuiles que l'Accueil, scopées au département (pas de tuile Bloom Bus : les
                      lignes de bus ne sont pas rattachées à un département). */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Users size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Actifs</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptActiveCount}</div>
                      <Spark data={weeklyActiveCounts(deptReports, effectivePeriod)} color="var(--color-bc-green)" />
                      <p className="text-[9px] text-bc-text-secondary mt-1">Ont servi sur la période</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider">Baptisés</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptPeriodBaptised.length}</div>
                      <Spark data={weeklyBaptismCounts(deptMembers, effectivePeriod)} color="var(--color-bc-success)" />
                      <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · {deptBaptisedViaDept} Dépt · {deptPeriodBaptised.length - deptBaptisedViaDept} Fiche</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <TrendingUp size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Moisson</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptMoisson.adn + deptMoisson.bus}</div>
                      <Spark data={weeklyMoissonCounts(deptReports, effectivePeriod)} color="var(--color-bc-gold)" />
                      <p className="text-[9px] text-bc-text-secondary mt-1">Intégrés · {deptMoisson.adn} ADN · {deptMoisson.bus} Bus</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Sparkles size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">OJ « Oui à Jésus »</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptOj}</div>
                      <Spark data={weeklyOjCounts(deptReports, effectivePeriod)} color="var(--color-bc-cerulean)" />
                      <p className="text-[9px] text-bc-text-secondary mt-1">Sur la période · rapports ADN</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('reports')}
                      className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow text-left cursor-pointer active-scale"
                    >
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider">À traiter</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptFollowUps.length}</div>
                      <p className="text-[9px] text-bc-warning font-bold mt-1">Remontées avec suivi · voir Rapports</p>
                    </button>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Clock size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Nouveau en attente</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Ring value={pendingReception.length} total={deptMembers.length} color="var(--color-bc-warning)" />
                        <div>
                          <div className="text-lg font-ui font-extrabold text-bc-warning tracking-tight leading-none">{pendingReception.length}</div>
                          <p className="text-[9px] text-bc-warning mt-1">Pas encore reçus en dépt</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <AlertCircle size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Au rouge</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Ring value={deptRedCount} total={deptMembers.length} color="var(--color-bc-danger)" />
                        <div>
                          <div className="text-lg font-ui font-extrabold text-bc-danger tracking-tight leading-none">{deptRedCount}</div>
                          <p className="text-[9px] text-bc-danger mt-1">Délais dépassés</p>
                        </div>
                      </div>
                    </div>

                    {/* Santé spirituelle — même ligne que les KPI, juste après "Au rouge" */}
                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow col-span-2">
                      <h3 className="text-[9px] font-bold uppercase tracking-wider text-bc-text-secondary mb-2">Santé spirituelle du département</h3>
                      {deptMembers.length === 0 ? (
                        <p className="text-xs text-bc-text-secondary italic text-center py-2">Aucun membre rattaché à ce département.</p>
                      ) : (
                        <div className="grid grid-cols-5 gap-1 w-full text-center">
                          {HEALTH_AXES.filter(a => a.key !== 'presenceService').map(axis => (
                            <div key={axis.key} className="min-w-0">
                              <HealthSmiley value={dominantHealthLevel(deptMembers, axis.key)} size={20} />
                              <div className="text-[7px] sm:text-[8px] font-bold text-bc-text-secondary truncate mt-1">{axis.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-soft hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Calendar size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Réunions à venir</span>
                      </div>
                      <div className="text-xl font-ui font-extrabold text-bc-text tracking-tight">{deptActivities.length}</div>
                      <p className="text-[9px] text-bc-text-secondary mt-1">Activités récurrentes du département</p>
                    </div>
                  </div>

                  {/* Croissance & Projets — même ligne */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
                      <h3 className="font-ui font-bold text-bc-text mb-2 tracking-tight">Croissance & Participants</h3>
                      <div className="flex gap-4 text-[10px] font-bold text-bc-text-secondary">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bc-text inline-block" /> Nouveaux</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--accent-1)' }} /> Participants</span>
                      </div>
                      <div className="h-48 mt-2 min-w-0">
                        <ResponsiveChart height="100%" minHeight={150}>
                          <AreaChart data={deptGrowthData}>
                            <defs>
                              <linearGradient id="deptColorNouveaux" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-bc-text)" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="var(--color-bc-text)" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="deptColorParticipants" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Area type="monotone" dataKey="nouveaux" name="Nouveaux" stroke="var(--color-bc-text)" strokeWidth={2} fillOpacity={1} fill="url(#deptColorNouveaux)" />
                            <Area type="monotone" dataKey="participants" name="Participants" stroke="var(--accent-1)" strokeWidth={2} fillOpacity={1} fill="url(#deptColorParticipants)" />
                          </AreaChart>
                        </ResponsiveChart>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-ui font-bold text-bc-text tracking-tight flex items-center gap-2"><FolderKanban size={16} /> Projets en cours</h3>
                        <span className="text-[10px] text-bc-text-secondary">{selectedMinistryData?.name}</span>
                      </div>
                      {deptProjects.length === 0 ? (
                        <p className="text-xs text-bc-text-secondary italic text-center py-4">Aucun projet en cours pour ce ministère.</p>
                      ) : (
                        <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                          {deptProjects.map(p => {
                            const pct = projectProgress(p);
                            return (
                              <div key={p.id} className="group">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-bold text-bc-text truncate">{p.name}</span>
                                  <span className="text-[10px] font-bold text-bc-text-secondary shrink-0 ml-3">{pct}%</span>
                                </div>
                                <div className="flex h-2 rounded-full overflow-hidden bg-bc-canvas">
                                  <div className="bg-bc-green transition-all duration-700 ease-out-spring rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h3 className="font-ui font-bold text-bc-text mb-4 text-sm">Informations clés</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Responsable</span>
                        <span className="text-xs font-bold text-bc-text">{deptResponsable ? `${deptResponsable.firstName} ${deptResponsable.lastName}` : 'Non assigné'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Membres rattachés</span>
                        <span className="text-xs font-bold text-bc-text">{deptMembers.length}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-xs text-bc-text-secondary">Dernière activité</span>
                        <span className="text-xs font-bold text-bc-text">{lastDeptActivityDate}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'members' && (
                <div className="bg-white rounded-2xl border border-bc-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-bc-border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-bc-text text-sm">Membres du département</h3>
                      <span className="text-xs font-bold bg-bc-canvas text-bc-text-secondary px-2 py-1 rounded-full">{deptMembers.length} membres</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Rechercher un membre…"
                        className="border border-bc-border rounded-full px-3 py-1.5 text-xs bg-bc-canvas focus:outline-none focus:border-bc-green"
                      />
                      {canManageDeptMembers && (
                        <button
                          onClick={() => { setEditingMember(null); setShowMemberForm(true); }}
                          className="flex items-center gap-1.5 text-xs font-bold text-white bg-bc-green px-3 py-1.5 rounded-full active-scale whitespace-nowrap"
                        >
                          <Plus size={13} /> Ajouter un membre
                        </button>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const q = memberSearch.trim().toLowerCase();
                    const filteredDeptMembers = q
                      ? deptMembers.filter(m => `${m.firstName} ${m.lastName} ${m.phone ?? ''}`.toLowerCase().includes(q))
                      : deptMembers;
                    if (deptMembers.length === 0) {
                      return <div className="p-8 text-center text-bc-text-secondary text-xs">Aucun membre assigné à ce département.</div>;
                    }
                    if (filteredDeptMembers.length === 0) {
                      return <div className="p-8 text-center text-bc-text-secondary text-xs">Aucun membre ne correspond à « {memberSearch} ».</div>;
                    }
                    return (
                      <motion.div variants={staggerParent} initial="hidden" animate="show" className="divide-y divide-bc-border">
                        {filteredDeptMembers.map(m => (
                          <motion.div
                            variants={staggerItem}
                            key={m.id}
                            onClick={() => setShow360Member(m)}
                            className="flex justify-between items-center p-4 hover:bg-bc-canvas cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-8 h-8 text-[10px] bg-bc-canvas text-bc-text-secondary" />
                              <div>
                                <div className="font-bold text-bc-text text-sm">{m.firstName} {m.lastName}</div>
                                <div className="text-[10px] text-bc-text-secondary">{m.phone}</div>
                              </div>
                            </div>
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-bc-text-secondary bg-bc-canvas px-2 py-1 rounded">
                              {selectedDept && m.departments[selectedDept]}
                              <ChevronRight size={11} />
                            </span>
                          </motion.div>
                        ))}
                      </motion.div>
                    );
                  })()}
                </div>
              )}
              {activeTab === 'hierarchy' && (
                <div className="space-y-4">
                  {/* Organisation interne — rôles fixes du département */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['responsable', 'adjoint', 'tresorier'] as DeptFunction[]).map(fn => (
                      <div key={fn} className="bg-white rounded-2xl border border-bc-border p-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-2">{labelFor(fn)} ({byFunction(fn).length})</h4>
                        <div className="space-y-1.5">
                          {byFunction(fn).length === 0 && <p className="text-[11px] text-bc-text-secondary italic">Non assigné</p>}
                          {byFunction(fn).map(m => (
                            <div key={m.id} className="flex items-center justify-between text-xs font-medium text-bc-text bg-bc-canvas/40 border border-bc-border rounded-full px-3 py-1.5">
                              <span className="truncate">{m.firstName} {m.lastName}</span>
                              {canValidate && (
                                <button onClick={() => setDeptFunction(m, 'membre')} title="Retirer la fonction" className="text-bc-text-secondary hover:text-bc-danger ml-2 shrink-0 active-scale">
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                          ))}
                          {canValidate && (
                            <select
                              value=""
                              onChange={e => { const m = deptMembers.find(x => x.id === e.target.value); if (m) setDeptFunction(m, fn); }}
                              className="w-full border border-bc-border rounded-full px-2 py-1.5 text-[11px] bg-white text-bc-text-secondary focus:outline-none focus:border-bc-green"
                            >
                              <option value="">+ Assigner…</option>
                              {deptMembers.filter(m => selectedDept && m.departments[selectedDept] !== fn).map(m => (
                                <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pôles & sections libres, avec responsable de section et membres */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <h3 className="font-bold text-bc-text text-sm">Pôles & sections</h3>
                      {canValidate && (
                        <div className="flex gap-2">
                          <input
                            value={newSectionName}
                            onChange={e => setNewSectionName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addSection()}
                            placeholder="Nouveau pôle / section…"
                            className="border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green"
                          />
                          <button onClick={addSection} disabled={!newSectionName.trim()} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40 flex items-center gap-1 active-scale">
                            <Plus size={13} /> Créer
                          </button>
                        </div>
                      )}
                    </div>
                    {(selectedDeptData?.sections ?? []).length === 0 && (
                      <p className="text-xs text-bc-text-secondary italic">Aucune section — crée un pôle (ex. Louange, Logistique, Trésorerie) pour organiser le département.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(selectedDeptData?.sections ?? []).map(sec => {
                        const secMembers = deptMembers.filter(m => selectedDept && m.deptSections?.[selectedDept] === sec.id);
                        const secLead = secMembers.find(m => selectedDept && m.departments[selectedDept] === 'responsable_section');
                        return (
                          <div key={sec.id} className="border border-bc-border rounded-2xl p-4 bg-bc-canvas/30">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-xs font-bold text-bc-text">{sec.name} ({secMembers.length})</h4>
                              {canValidate && (
                                <button onClick={() => setConfirmingSectionId(sec.id)} title="Supprimer la section" className="text-bc-text-secondary hover:text-bc-danger active-scale">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-bc-text-secondary mb-2">
                              Resp. section : {secLead ? `${secLead.firstName} ${secLead.lastName}` : <span className="italic">non assigné</span>}
                            </p>
                            <div className="space-y-1.5">
                              {secMembers.map(m => (
                                <div key={m.id} className="flex items-center justify-between text-xs bg-white border border-bc-border rounded-full px-3 py-1.5">
                                  <span className="truncate font-medium text-bc-text">{m.firstName} {m.lastName}</span>
                                  {canValidate && (
                                    <span className="flex items-center gap-2 shrink-0 ml-2">
                                      {selectedDept && m.departments[selectedDept] !== 'responsable_section' && (
                                        <button onClick={() => setDeptFunction(m, 'responsable_section')} title="Nommer responsable de section" className="text-[9px] font-bold text-bc-green hover:underline">
                                          Resp.
                                        </button>
                                      )}
                                      <button onClick={() => setMemberSection(m, null)} title="Retirer de la section" className="text-bc-text-secondary hover:text-bc-danger active-scale">
                                        <X size={11} />
                                      </button>
                                    </span>
                                  )}
                                </div>
                              ))}
                              {canValidate && (
                                <select
                                  value=""
                                  onChange={e => { const m = deptMembers.find(x => x.id === e.target.value); if (m) setMemberSection(m, sec.id); }}
                                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-[11px] bg-white text-bc-text-secondary focus:outline-none focus:border-bc-green"
                                >
                                  <option value="">+ Ajouter un membre…</option>
                                  {deptMembers.filter(m => selectedDept && m.deptSections?.[selectedDept] !== sec.id).map(m => (
                                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'nouveaux' && (
                <div className="space-y-4">
                  {/* P4.4 — ce sous-onglet n'est PAS un doublon de l'Espace Intégrateur (NouveauxView) :
                      celui-ci est le pipeline local du Responsable (réception dept-scoped via
                      receptionValidated, puis Stagiaire, puis promotion Boss) ; l'Espace Intégrateur
                      est le pipeline transverse ADN/Intégration (suivi via integrationFollowStatus,
                      tous départements). Publics et granularité différents — garder séparés, pas de
                      fusion. Chaque changement de statut se confirme via un clic sur la personne, qui
                      ouvre une popup de confirmation (statusConfirm) plutôt qu'une mutation directe. */}
                  {/* Réceptions à valider par le Responsable du département — inclut à la fois les
                      Nouveaux ADN (receptionValidated) et les membres enregistrés directement par un
                      responsable hiérarchique Bloom Bus (deptAttachmentStatus), deux origines distinctes
                      réunies dans cette même section (cf. spec). */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-1 flex items-center gap-2"><UserCheck size={15} /> Réceptions à valider ({pendingReception.length + pendingBloomBusAttachment.length})</h3>
                    <p className="text-[11px] text-bc-text-secondary mb-4">Nouveaux affectés à ce département par l'ADN, ou membres enregistrés directement par un responsable Bloom Bus, en attente de ta validation.</p>
                    <div className="space-y-2">
                      {pendingReception.length === 0 && pendingBloomBusAttachment.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucune réception en attente.</p>}
                      {pendingReception.map(m => (
                        <div
                          key={m.id}
                          onClick={() => canValidate && setStatusConfirm({ member: m, transition: 'reception' })}
                          className={`flex items-center justify-between bg-bc-warning/10 border border-bc-warning/30 rounded-xl px-4 py-2.5 ${canValidate ? 'cursor-pointer hover:bg-bc-warning/20' : ''}`}
                        >
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.ojFlag ? 'OJ' : 'NV'} · {m.phone}</span>
                          </div>
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-warning/10 text-bc-warning">
                            <CheckCircle size={13} /> À valider
                          </span>
                        </div>
                      ))}
                      {pendingBloomBusAttachment.map(m => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between bg-bc-warning/10 border border-bc-warning/30 rounded-xl px-4 py-2.5"
                        >
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.phone}</span>
                            <span className="ml-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-bc-green/10 text-bc-green">Origine : Bloom Bus</span>
                          </div>
                          {canManageDeptMembers ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setStatusConfirm({ member: m, transition: 'bloom_bus_validate' })}
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-success/10 text-bc-success active-scale"
                              >
                                <CheckCircle size={13} /> Valider
                              </button>
                              <button
                                onClick={() => setStatusConfirm({ member: m, transition: 'bloom_bus_reject' })}
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-danger/10 text-bc-danger active-scale"
                              >
                                <X size={13} /> Refuser
                              </button>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-warning/10 text-bc-warning">
                              <CheckCircle size={13} /> En attente
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reçus, en attente d'entretien avant passage Stagiaire */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-1 flex items-center gap-2"><Users size={15} /> En attente d'entretien ({receivedNouveaux.length})</h3>
                    <p className="text-[11px] text-bc-text-secondary mb-4">Reçus, en attente d'un entretien avec le Responsable avant de passer Stagiaire.</p>
                    <div className="space-y-2">
                      {receivedNouveaux.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun nouveau en attente d'entretien.</p>}
                      {receivedNouveaux.map(m => (
                        <div
                          key={m.id}
                          onClick={() => canValidate && setStatusConfirm({ member: m, transition: 'stagiaire' })}
                          className={`flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 ${canValidate ? 'cursor-pointer hover:bg-bc-canvas' : ''}`}
                        >
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.ojFlag ? 'OJ' : 'NV'} · {m.integrationFollowStatus ?? 'Non suivi'}</span>
                          </div>
                          {canValidate && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-text-secondary/10 text-bc-text-secondary">
                              <ChevronRight size={13} /> Stagiaire
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stagiaires, suivis jusqu'à devenir membre (Boss) */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-1 flex items-center gap-2"><ChevronRight size={15} /> Stagiaires ({deptStagiaires.length})</h3>
                    <p className="text-[11px] text-bc-text-secondary mb-4">Suivis jusqu'à devenir membre (Boss) du département.</p>
                    <div className="space-y-2">
                      {deptStagiaires.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun stagiaire en cours.</p>}
                      {deptStagiaires.map(m => (
                        <div
                          key={m.id}
                          onClick={() => canValidate && setStatusConfirm({ member: m, transition: 'membre' })}
                          className={`flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 ${canValidate ? 'cursor-pointer hover:bg-bc-canvas' : ''}`}
                        >
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.ojFlag ? 'OJ' : 'NV'} · Stagiaire</span>
                          </div>
                          {canValidate && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-bc-green/10 text-bc-green">
                              <ChevronRight size={13} /> Membre (Boss)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'agenda' && (
                <div className="bg-white rounded-2xl border border-bc-border p-6">
                  <h3 className="font-bold text-bc-text text-sm mb-2 flex items-center gap-2"><Calendar size={15} /> Agenda & activités</h3>
                  <p className="text-xs text-bc-text-secondary">Routines et activités récurrentes du département (audience : membres du département).</p>
                  <div className="mt-4 space-y-2">
                    {activities.filter(a => a.departmentId === selectedDept).length === 0 && (
                      <p className="text-xs text-bc-text-secondary italic">Aucune activité pour ce département.</p>
                    )}
                    {activities.filter(a => a.departmentId === selectedDept).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2">
                        <span className="flex items-center gap-2">
                          <Activity size={12} className="text-bc-green" />
                          <span className="font-bold text-bc-text">{a.title}</span>
                          <span className="text-bc-text-secondary">· {a.recurrence}{a.day ? ` · ${a.day}` : ''}{a.time ? ` · ${a.time}` : ''}</span>
                        </span>
                        {canValidate && <button onClick={() => removeActivity(a.id)} className="text-bc-text-secondary hover:text-bc-danger active-scale"><X size={12} /></button>}
                      </div>
                    ))}
                  </div>
                  {canValidate && (
                    <div className="mt-4 pt-4 border-t border-bc-border grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input value={newActTitle} onChange={e => setNewActTitle(e.target.value)} placeholder="Activité…" className="sm:col-span-2 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                      <select value={newActRec} onChange={e => setNewActRec(e.target.value as ActivityEntity['recurrence'])} className="border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white">
                        {['Hebdomadaire', 'Mensuel', 'Annuel', 'Ponctuel'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input value={newActDay} onChange={e => setNewActDay(e.target.value)} placeholder="Jour" className="min-w-0 flex-1 border border-bc-border rounded-full px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                        <input value={newActTime} onChange={e => setNewActTime(e.target.value)} placeholder="Heure" className="w-16 border border-bc-border rounded-full px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                        <button onClick={addActivity} disabled={!newActTitle.trim()} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40 shrink-0 active-scale"><Plus size={13} /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'reports' && (
                <div className="bg-white rounded-2xl border border-bc-border p-6">
                  <h3 className="font-bold text-bc-text text-sm mb-4 flex items-center gap-2"><FileText size={15} /> Rapports du département</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REPORT_ROWS.map(r => (
                      <div key={r.type} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                        <span className="font-medium text-bc-text">{r.label}</span>
                        {canValidate ? (
                          <button onClick={() => openReportModal(r.type)} className="text-[10px] font-bold text-bc-green hover:underline active-scale">Rédiger</button>
                        ) : (
                          <span className="text-[10px] text-bc-text-secondary">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'suivi' && (() => {
                // Suivi = qui suit qui, via Member.mentorId (ligne de mentorat).
                const mentorIds = [...new Set(deptMembers.map(m => m.mentorId).filter(Boolean))] as string[];
                const unmentored = deptMembers.filter(m => !m.mentorId);
                return (
                  <div className="space-y-4">
                    {mentorIds.length === 0 && (
                      <div className="bg-white rounded-2xl border border-bc-border p-6">
                        <p className="text-xs text-bc-text-secondary italic">Aucune ligne de suivi — assigne un mentor (Coach/Leader) aux membres depuis leur fiche 360.</p>
                      </div>
                    )}
                    {mentorIds.map(mid => {
                      const coach = members.find(m => m.id === mid);
                      const suivis = deptMembers.filter(m => m.mentorId === mid);
                      return (
                        <div key={mid} className="bg-white rounded-2xl border border-bc-border p-6">
                          <div className="flex items-center gap-3 mb-3">
                            <Avatar src={coach?.avatarUrl} initials={coach ? `${coach.firstName[0]}${coach.lastName[0]}` : '?'} size="sm" className="w-8 h-8 text-[10px] bg-bc-purple/10 text-bc-purple" />
                            <div>
                              <h3 className="font-bold text-bc-text text-sm">{coach ? `${coach.firstName} ${coach.lastName}` : 'Coach inconnu'}</h3>
                              <p className="text-[10px] text-bc-text-secondary">{labelFor(coach?.level)} · suit {suivis.length} personne{suivis.length > 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {suivis.map(m => (
                              <div key={m.id} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                                <span className="font-medium text-bc-text">{m.firstName} {m.lastName} <span className="text-bc-text-secondary">· {labelFor(m.level)}</span></span>
                                {canValidate ? (
                                  <button onClick={() => openReportModal('rapport_suivi_coach', m.id)} className="text-[10px] font-bold text-bc-green hover:underline active-scale">Rédiger un suivi</button>
                                ) : (
                                  <span className="text-[10px] text-bc-text-secondary">—</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {unmentored.length > 0 && (
                      <div className="bg-white rounded-2xl border border-bc-border p-6">
                        <h3 className="font-bold text-bc-text text-sm mb-3">Non suivis ({unmentored.length})</h3>
                        <div className="space-y-2">
                          {unmentored.map(m => (
                            <div key={m.id} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                              <span className="font-medium text-bc-text">{m.firstName} {m.lastName} <span className="text-bc-text-secondary">· {labelFor(m.level)}</span></span>
                              {canValidate ? (
                                <button onClick={() => openReportModal('rapport_suivi_coach', m.id)} className="text-[10px] font-bold text-bc-green hover:underline active-scale">Rédiger un suivi</button>
                              ) : (
                                <span className="text-[10px] text-bc-text-secondary">—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeTab === 'delegation' && isDeptResponsable && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-4">Déléguer un droit</h3>
                    {!deptResponsable ? (
                      <p className="text-xs text-bc-text-secondary italic">Ce département n'a pas de Responsable identifié.</p>
                    ) : (
                      <div className="flex flex-wrap gap-3 items-end">
                        <div>
                          <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">À</label>
                          <select value={delTo} onChange={e => setDelTo(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white min-w-[180px]">
                            <option value="">Choisir un membre...</option>
                            {deptMembers.filter(m => m.id !== deptResponsable.id).map(m => (
                              <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({labelFor(m.departments[selectedDept!])})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">Droit</label>
                          <select value={delRight} onChange={e => setDelRight(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white min-w-[220px]">
                            {DELEGABLE_CAPS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                        <button onClick={addDeptDelegation} disabled={!delTo} className="px-4 py-2 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 disabled:opacity-40 active-scale">
                          Déléguer
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-4">Délégations actives · {selectedDeptData?.name}</h3>
                    <div className="space-y-2">
                      {deptDelegations.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucune délégation active dans ce département.</p>}
                      {deptDelegations.map(d => (
                        <div key={d.id} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                          <div>
                            <span className="font-medium text-bc-text">{d.from} → {d.to}</span>
                            <span className="text-bc-text-secondary ml-2">{DELEGABLE_CAPS.find(c => c.key === d.right)?.label ?? d.right}</span>
                          </div>
                          <button onClick={() => revokeDelegation(d.id)} className="text-[10px] font-bold text-bc-danger hover:underline active-scale">Révoquer</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-bc-text-secondary p-8">
            <LayoutList size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium text-center max-w-sm">Sélectionnez un département dans l'arborescence pour afficher sa console.</p>
          </div>
        )}
      </div>


      {/* Fiche membre 360 au clic sur un membre du département */}
      {show360Member && permissionMatrix && (
        <Member360View
          member={show360Member}
          onClose={() => setShow360Member(null)}
          onEdit={(m) => { setShow360Member(null); setEditingMember(m); setShowMemberForm(true); }}
          onUpdate={(m) => { onUpdateMember?.(m); setShow360Member(m); }}
          reports={reports}
          onAddReport={onAddReport}
          simulatedRole={simulatedRole}
          audits={audits}
          operator={operator}
          permissionMatrix={permissionMatrix}
          forms={forms}
        />
      )}

      <MemberFormModal
        open={showMemberForm}
        onClose={() => setShowMemberForm(false)}
        member={editingMember}
        onAdd={(m) => onAddMember?.(m)}
        onUpdate={(m) => onUpdateMember?.(m)}
        existingMembers={members}
        departments={departments}
        busLines={busLines}
        activeBranch={activeBranch}
        simulatedRole={simulatedRole}
        forms={forms}
        lockDepartmentId={editingMember ? undefined : (selectedDept ?? undefined)}
        canEditDepartments={editingMember ? canEditMemberDepartments : true}
      />

      <Modal
        open={!!statusConfirm}
        onClose={() => setStatusConfirm(null)}
        title="Confirmer le changement de statut"
        icon={<CheckCircle size={18} className="text-bc-green" />}
        maxWidth="max-w-sm"
      >
        {statusConfirm && (
          <>
            <p className="text-sm text-bc-text-secondary mb-6">
              {statusConfirm.transition === 'reception' && (
                <>Confirmer la réception de <strong className="text-bc-text">{statusConfirm.member.firstName} {statusConfirm.member.lastName}</strong> ? La personne passera au statut « en attente d'entretien ».</>
              )}
              {statusConfirm.transition === 'stagiaire' && (
                <>Confirmer le passage de <strong className="text-bc-text">{statusConfirm.member.firstName} {statusConfirm.member.lastName}</strong> au statut « Stagiaire », après entretien ?</>
              )}
              {statusConfirm.transition === 'membre' && (
                <>Confirmer le passage de <strong className="text-bc-text">{statusConfirm.member.firstName} {statusConfirm.member.lastName}</strong> au statut « Membre » ? La personne quittera l'onglet Intégration et n'apparaîtra plus que dans Membres.</>
              )}
              {statusConfirm.transition === 'bloom_bus_validate' && (
                <>Valider le rattachement de <strong className="text-bc-text">{statusConfirm.member.firstName} {statusConfirm.member.lastName}</strong> (origine Bloom Bus) à ce département ? Le membre sera définitivement rattaché.</>
              )}
              {statusConfirm.transition === 'bloom_bus_reject' && (
                <>Refuser le rattachement de <strong className="text-bc-text">{statusConfirm.member.firstName} {statusConfirm.member.lastName}</strong> à ce département ? Le membre sera retiré de ce département (il reste en base et rattaché à son Bloom Bus).</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStatusConfirm(null)}>Annuler</Button>
              <Button variant="primary" onClick={applyStatusTransition}>Confirmer</Button>
            </div>
          </>
        )}
      </Modal>

      {reportModalType && (
        <Modal
          open={!!reportModalType}
          onClose={() => setReportModalType(null)}
          maxWidth="max-w-lg"
          title={
            reportModalType === 'rapport_suivi_coach'
              ? `Rapport de suivi — ${deptMembers.find(m => m.id === reportTargetMemberId)?.firstName ?? ''} ${deptMembers.find(m => m.id === reportTargetMemberId)?.lastName ?? ''}`
              : REPORT_ROWS.find(r => r.type === reportModalType)?.label
          }
        >
            <form onSubmit={handleSaveReport} className="space-y-4">
              {reportModalType === 'rapport_service' && (
                <div>
                  <label className="text-xs font-bold text-bc-text-secondary">{serviceLabel('f0', 'Évènement concerné')} *</label>
                  <select
                    required
                    value={reportEventId}
                    onChange={e => setReportEventId(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-4 py-2 text-sm bg-white mt-2 focus:outline-none focus:border-bc-green"
                  >
                    <option value="">Choisir un évènement récent…</option>
                    {recentEvents.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {new Date(ev.date).toLocaleDateString('fr-FR')} — {ev.title}
                      </option>
                    ))}
                  </select>
                  {recentEvents.length === 0 && <p className="text-[10px] text-bc-text-secondary italic mt-1">Aucun évènement récent — crée d'abord l'évènement dans l'agenda.</p>}
                </div>
              )}
              {reportModalType === 'rapport_activite' && (
                <div>
                  <label className="text-xs font-bold text-bc-text-secondary">Activité concernée *</label>
                  <select
                    required
                    value={reportActivityId}
                    onChange={e => setReportActivityId(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-4 py-2 text-sm bg-white mt-2 focus:outline-none focus:border-bc-green"
                  >
                    <option value="">Choisir une activité du département…</option>
                    {deptActivities.map(a => (
                      <option key={a.id} value={a.id}>{a.title} — {a.recurrence}{a.day ? ` · ${a.day}` : ''}</option>
                    ))}
                  </select>
                  {deptActivities.length === 0 && <p className="text-[10px] text-bc-text-secondary italic mt-1">Aucune activité — ajoute-la d'abord dans l'onglet Agenda & Activités.</p>}
                </div>
              )}
              {(reportModalType === 'rapport_service' || reportModalType === 'rapport_activite') && (
                <div>
                  <label className="text-xs font-bold text-bc-text-secondary">{serviceLabel('f1', 'Serviteurs présents')}</label>
                  <div className="flex flex-wrap gap-2 mt-2 max-h-40 overflow-y-auto">
                    {deptMembers.map(m => (
                      <button type="button" key={m.id} onClick={() => toggleServiteur(m.id)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border active-scale ${reportServiteurs.includes(m.id) ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text border-bc-border'}`}>
                        {m.firstName} {m.lastName}
                      </button>
                    ))}
                    {deptMembers.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun membre dans ce département.</p>}
                  </div>
                </div>
              )}
              {reportModalType === 'rapport_rsa' && (
                <div>
                  <label className="text-xs font-bold text-bc-text-secondary">{rsaLabel('f0', 'Actions confiées')}</label>
                  <div className="space-y-2 mt-2">
                    {reportActions.map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-3 py-2 text-xs">
                        <span>{a.label} — <span className="text-bc-text-secondary">{a.statut}</span></span>
                        <button type="button" onClick={() => removeReportAction(idx)} className="text-bc-text-secondary hover:text-bc-danger active-scale"><X size={12} /></button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input value={reportActionLabel} onChange={e => setReportActionLabel(e.target.value)} placeholder="Nouvelle action…" className="flex-1 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                      <button type="button" onClick={addReportAction} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold active-scale"><Plus size={13} /></button>
                    </div>
                  </div>
                </div>
              )}
              {reportModalType === 'rapport_observation' && (
                <div>
                  <label className="text-xs font-bold text-bc-text-secondary">Mode</label>
                  <div className="flex gap-2 mt-2">
                    {(['informatif', 'suivi'] as const).map(mode => (
                      <button type="button" key={mode} onClick={() => setReportObsMode(mode)}
                        className={`flex-1 text-xs font-bold px-3 py-2 rounded-full border active-scale ${reportObsMode === mode ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text border-bc-border'}`}>
                        {mode === 'informatif' ? 'Informatif (sans suivi)' : 'Avec suivi'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-bc-text-secondary">
                  {reportModalType === 'rapport_rsa' ? rsaLabel('f1', 'Notes') : reportModalType === 'rapport_service' ? serviceLabel('f2', 'Notes') : 'Notes'}
                </label>
                <textarea value={reportNotes} onChange={e => setReportNotes(e.target.value)} rows={4} className="w-full mt-2 border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" placeholder="Observations, détails…" />
              </div>
              <button type="submit" className="w-full bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 active-scale">
                Soumettre le rapport
              </button>
            </form>
        </Modal>
      )}
      <ConfirmDialog
        open={!!confirmingSectionId}
        onCancel={() => setConfirmingSectionId(null)}
        onConfirm={() => confirmingSectionId && removeSection(confirmingSectionId)}
        title="Supprimer la section"
        message="Cette section et son contenu seront définitivement supprimés. Cette action est irréversible."
      />
    </div>
  );
}
