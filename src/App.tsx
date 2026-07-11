import React, { useState, useEffect, lazy, Suspense } from 'react';
import { load, save, seeds, useDepartments, useMinistries, useBusLines, useAdmins, deriveTimeBasedNotifications, apiBootstrap, apiPut, clearAuthToken, enableSync, canView } from './data';
import { resolveMemberRole } from './data/roles';
import { MEMBERS_TAB_DEPT_ONLY_ROLES } from './data/scope';
import { downscaleImage } from './lib/image';

const CULT_TYPES = ['Culte du Dimanche', 'Culte de Prière', 'Veillée', 'Culte des Jeunes', 'Réunion de Maison'];
import {
  Member,
  Event,
  Report,
  AuditLog,
  AppNotification,
  PermissionMatrix,
  AppSettings,
  Branch,
  Department,
  FormDef
} from './types';
import { motion, AnimatePresence } from 'motion/react';

// Import Views
import Sidebar from './components/Sidebar';
import Header from './components/Header';
// Vues chargées à la demande (React.lazy) — seule AuthView (écran avant connexion)
// reste dans le bundle principal, tout le reste ne charge qu'au clic sur l'onglet.
const DashboardView = lazy(() => import('./components/DashboardView'));
const MembersView = lazy(() => import('./components/MembersView'));
const NouveauxView = lazy(() => import('./components/NouveauxView'));
const BloomBusView = lazy(() => import('./components/BloomBusView'));
const EventsView = lazy(() => import('./components/EventsView'));
const ReportsView = lazy(() => import('./components/ReportsView'));
const ProgrammesView = lazy(() => import('./components/ProgrammesView'));
const FormationsView = lazy(() => import('./components/FormationsView'));
const MinisteresView = lazy(() => import('./components/MinisteresView'));
const DepartmentsView = lazy(() => import('./components/DepartmentsView'));
const AccountsView = lazy(() => import('./components/AccountsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const FormBuilderView = lazy(() => import('./components/FormBuilderView'));
const PermissionsView = lazy(() => import('./components/PermissionsView'));
const AuditView = lazy(() => import('./components/AuditView'));
const ProjectsView = lazy(() => import('./components/ProjectsView'));
const CursusView = lazy(() => import('./components/CursusView'));
const ProfileView = lazy(() => import('./components/ProfileView'));
import AuthView from './components/AuthView';
import { ToastContainer } from './components/ui/Toast';

import { UserCheck, Sparkles, X, Heart, Loader2 } from 'lucide-react';

export default function App() {
  // Navigation states
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDept, setSelectedDept] = useState<string | null>(null); // département sélectionné depuis la Sidebar
  const [activeBranch, setActiveBranch] = useState<Branch>('church');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState('Pasteur');

  // Persistence States
  const [members, setMembers] = useState<Member[]>(() => load('bc_members', seeds.members));
  const [events, setEvents] = useState<Event[]>(() => load('bc_events', seeds.events));
  const [reports, setReports] = useState<Report[]>(() => load('bc_reports', seeds.reports));
  const [audits, setAudits] = useState<AuditLog[]>(() => load('bc_audits', seeds.audits));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => load('bc_notifications', seeds.notifications));
  // Merge seeds sous le stocké : les nouvelles capabilities (ex. view_*) apparaissent
  // pour les localStorage existants, les réglages utilisateur gardent la priorité.
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>(
    () => ({ ...seeds.permissions, ...load('bc_permissions', {}) }),
  );
  const [settings, setSettings] = useState<AppSettings>(() => load('bc_settings', seeds.settings));
  // P1.4 — FormBuilder's field defs, now persisted + read by BloomBusView/EventsView.
  const [forms, setForms] = useState<FormDef[]>(() => load('bc_forms', seeds.forms));
  // B3 — départements remontés dans App (source unique) : avant, MinisteresView et
  // DepartmentsView tenaient chacun une copie locale et s'écrasaient mutuellement.
  const [departments, setDepartments] = useState<Department[]>(useDepartments);
  // P4.19 — mock auth : identifie l'utilisateur connecté, remplace le hardcode mem_1.
  const [loggedInMemberId, setLoggedInMemberId] = useState<string | null>(() => load('bc_loggedInMemberId', null));

  // Persist on change — single swap point lives in ./data.
  useEffect(() => { save('bc_members', members); }, [members]);
  useEffect(() => { save('bc_events', events); }, [events]);
  useEffect(() => { save('bc_reports', reports); }, [reports]);
  useEffect(() => { save('bc_audits', audits); }, [audits]);
  useEffect(() => { save('bc_notifications', notifications); }, [notifications]);
  useEffect(() => { save('bc_permissions', permissionMatrix); }, [permissionMatrix]);
  // Garde globale : re-valide activeTab à chaque changement de rôle ou de matrice, plutôt que
  // de dépendre uniquement de l'effet de bord local du bouton de rôle dans Sidebar.tsx.
  // 'profile' est volontairement hors matrice (chacun voit toujours son propre profil).
  useEffect(() => {
    if (activeTab !== 'profile' && !canView(permissionMatrix, activeTab, simulatedRole)) {
      setActiveTab('dashboard');
      return;
    }
    // Responsable/Adjoint : pas d'onglet Membres global, même si la matrice
    // l'autorise encore (elle reste nécessaire côté serveur pour l'onglet
    // Membres de leur page Département — cf. Sidebar.tsx).
    if (activeTab === 'members' && MEMBERS_TAB_DEPT_ONLY_ROLES.includes(simulatedRole)) {
      setActiveTab('dashboard');
    }
  }, [simulatedRole, activeTab, permissionMatrix]);
  useEffect(() => { save('bc_settings', settings); }, [settings]);
  useEffect(() => { save('bc_forms', forms); }, [forms]);
  useEffect(() => { save('bc_departments', departments); }, [departments]);
  useEffect(() => { save('bc_loggedInMemberId', loggedInMemberId); }, [loggedInMemberId]);
  // CHARTE-GRAPHIQUE.md §10 — cascade [data-branch] sur la racine, pas seulement le switcher.
  useEffect(() => { document.documentElement.setAttribute('data-branch', activeBranch); }, [activeBranch]);

  // Backend bootstrap: replace localStorage/seed state with the API's data if
  // it's reachable. Never blocks or throws — apiBootstrap() resolves null when
  // the server's down, and initial render already used localStorage/seeds
  // synchronously above, so there's nothing to regress. Re-runs after login
  // (deps [loggedInMemberId]) : les lectures deviennent auth-gated côté serveur,
  // le premier fetch pré-login peut donc être 401 → re-fetch une fois connecté.
  useEffect(() => {
    apiBootstrap().then((data) => {
      if (!data) return;
      // Normalise departments (C3) : un membre serveur sans ce champ ferait crasher
      // Object.keys(m.departments) dans Members/Departments/scope.
      if (data.members) {
        const list = (data.members as Member[]).map(m => ({ ...m, departments: m.departments ?? {} }));
        setMembers(list);
        // #11 — si le membre connecté n'est pas dans la liste serveur faisant autorité
        // (supprimé), déconnecter plutôt que poursuivre sous l'identité de members[0].
        if (loggedInMemberId && !list.some(m => m.id === loggedInMemberId)) {
          clearAuthToken();
          setLoggedInMemberId(null);
        }
      }
      if (data.events) setEvents(data.events as Event[]);
      if (data.reports) setReports(data.reports as Report[]);
      if (data.audits) setAudits(data.audits as AuditLog[]);
      if (data.notifications) setNotifications(data.notifications as AppNotification[]);
      if (data.permissions) setPermissionMatrix({ ...seeds.permissions, ...(data.permissions as PermissionMatrix) });
      if (data.settings) setSettings(data.settings as AppSettings);
      if (data.forms) setForms(data.forms as FormDef[]);
      if (data.departments) setDepartments(data.departments as Department[]);
      // Collections "component-owned" (état local par vue, pas dans App) : on
      // rafraîchit leur source localStorage — les vues montées ensuite lisent
      // les données serveur via load(). ponytail: une vue déjà ouverte garde son
      // état jusqu'au prochain montage, acceptable en offline-first.
      for (const name of ['delegations', 'ministries', 'certifications', 'admins', 'activities', 'integration_reports', 'projects', 'bus_lines']) {
        if (data[name]) localStorage.setItem(`bc_${name}`, JSON.stringify(data[name]));
      }
    }).finally(() => {
      // Sync serveur activée seulement après avoir lu l'état serveur (B2) : évite que les
      // effets de persistance du montage n'écrasent des données serveur plus fraîches.
      enableSync();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInMemberId]);

  const handleLogout = () => {
    clearAuthToken();
    // Poste partagé (contexte église) : purge toutes les données métier du compte, sinon
    // l'utilisateur suivant les verrait (F3). Le reload remonte l'app sur des seeds propres —
    // sans ça, l'état React en mémoire re-persisterait immédiatement les données purgées.
    Object.keys(localStorage).filter((k) => k.startsWith('bc_')).forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  // P1.2b — dérive les alertes temporelles (réception 3j / au rouge 7j) à chaque changement
  // de members ou de réglages, dédupliquées par id, filtrées par le canal "app" du déclencheur
  // concerné (seul canal réellement livré ici — email/SMS/WhatsApp n'ont pas de transport).
  // ponytail: pas un vrai cron — recalculé côté client à chaque re-render pertinent.
  useEffect(() => {
    const integ1 = settings.triggers.find(t => t.id === 'integ1');
    const integ2 = settings.triggers.find(t => t.id === 'integ2');
    // bc_departments/bc_ministries : mêmes clés que MinisteresView/DepartmentsView (source
    // localStorage la plus à jour), avec repli sur les seeds si l'utilisateur n'a jamais
    // ouvert ces écrans dans cette session.
    const derived = deriveTimeBasedNotifications(members, new Date(), {
      pending: integ1?.delayDays ?? 3,
      red: integ2?.delayDays ?? 7,
    }, load('bc_departments', departmentOptions), load('bc_ministries', ministrySeeds))
      .filter(n => (n.type === 'alert' ? integ2?.channels.app : integ1?.channels.app) ?? true);
    setNotifications(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const fresh = derived.filter(n => !existingIds.has(n.id));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, settings]);

  // P1.4 — labels read live from FormBuilder's fd_nouveau FormDef, id-matched.
  const nouveauForm = forms.find((f) => f.id === 'fd_nouveau');
  const nouveauLabel = (fieldId: string, fallback: string) =>
    nouveauForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;

  // Global Quick Form State (ADN)
  const [showGlobalQuickForm, setShowGlobalQuickForm] = useState(false);
  const [quickFirstname, setQuickFirstname] = useState('');
  const [quickLastname, setQuickLastname] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickCommune, setQuickCommune] = useState('Cocody');
  const [quickOj, setQuickOj] = useState(false); // true = OJ, false = Nouveau (NV)
  const [quickWish, setQuickWish] = useState<'Membre' | 'Visiteur'>('Membre');
  const [quickActivityDate, setQuickActivityDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickCultType, setQuickCultType] = useState('Culte du Dimanche');
  const [quickGender, setQuickGender] = useState<'H' | 'F'>('H');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickDept, setQuickDept] = useState('dept_louange');
  const [quickPhotoUrl, setQuickPhotoUrl] = useState('');
  const [quickGps, setQuickGps] = useState<{ lat: number; lng: number } | null>(null);
  const [quickSource, setQuickSource] = useState('Invitation');
  const departmentOptions = useDepartments();
  const ministrySeeds = useMinistries();
  const adminAccounts = useAdmins();
  const busLines = useBusLines();

  // Le rôle qui pilote l'UI est dérivé du membre connecté (le panneau « Simuler profil »
  // a été retiré). Un compte de test peut forcer son rôle via `testRole` (profils de test,
  // un par rôle) ; sinon on le dérive via resolveMemberRole. Sans ça, tout le monde resterait « Pasteur ».
  useEffect(() => {
    if (!loggedInMemberId) return;
    const op = members.find((m) => m.id === loggedInMemberId);
    if (op) setSimulatedRole(op.testRole || resolveMemberRole(op, adminAccounts, ministrySeeds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInMemberId, members]);

  // P1.2 — un seul constructeur de notification, mêmes conventions que AuditLog.
  // ID unique même en boucle synchrone (B8) : Date.now() seul collisionne quand
  // removeSection émet N audits dans la même milliseconde → clés React dupliquées.
  const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const mkNotif = (
    title: string,
    message: string,
    type: AppNotification['type'],
    branch?: Branch,
  ): AppNotification => ({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    title,
    message,
    type,
    read: false,
    branch,
  });

  const handleAddNotification = (n: AppNotification) => {
    setNotifications(prev => [n, ...prev]);
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
  };

  const handleAddMember = (m: Member) => {
    // P4.15 (b) — affectation auto au Bloom Bus de la commune, si pas déjà rattaché.
    // Exclut l'enregistrement direct Bloom Bus : là le bus est choisi explicitement dans le
    // formulaire (cascade Commune→Zone→Bus) ; ne pas le remplacer par le 1er bus de la commune
    // (souvent d'une autre zone) quand un Resp. de Zone/Commune l'a laissé vide.
    const bus = !m.bloomBusId && m.gps?.commune && m.deptAttachmentOrigin !== 'bloom_bus'
      ? busLines.find(b => b.commune === m.gps!.commune)
      : undefined;
    // P4.15 (c) — un "Oui à Jésus" rejoint aussi le département Baptême (parcours à étapes).
    const departments = m.ojFlag ? { ...m.departments, dept_bapteme: 'Membre' as const } : m.departments;
    const enriched: Member = { ...m, ...(bus && { bloomBusId: bus.id }), departments };

    setMembers(prev => [enriched, ...prev]);

    if (enriched.level === 'Nouveau') {
      handleAddNotification(mkNotif(
        'Nouveau enregistré',
        `${enriched.firstName} ${enriched.lastName} enregistré(e) par l'ADN.`,
        'info',
        enriched.branch,
      ));
    }

    // Log Audit
    const log: AuditLog = {
      id: genId('aud_reg'),
      timestamp: new Date().toISOString(),
      actionType: enriched.level === 'Nouveau' ? 'MEMBER_REGISTERED_ADN' : 'MEMBER_CREATED_MANUAL',
      operatorName: operator ? `${operator.firstName} ${operator.lastName}` : 'Affeny Grah',
      operatorId: operator?.id ?? 'mem_1',
      details: `Création du profil de ${enriched.firstName} ${enriched.lastName} (${enriched.level}).`,
      branch: enriched.branch
    };
    handleAddAuditLog(log);

    // P4.15 (a) — dédoublonnage : pas de merge auto (risque de perte de données),
    // on flague et notifie pour que l'opérateur tranche. "Doublon" = même téléphone,
    // même définition que le badge déjà affiché dans MembersView.
    const dupe = members.find(x => x.phone === enriched.phone && x.id !== enriched.id);
    if (dupe) {
      handleAddNotification(mkNotif(
        'Doublon potentiel détecté',
        `${enriched.firstName} ${enriched.lastName} partage le téléphone ${enriched.phone} avec ${dupe.firstName} ${dupe.lastName}.`,
        'alert',
        enriched.branch,
      ));
      handleAddAuditLog({
        id: genId('aud_dup'),
        timestamp: new Date().toISOString(),
        actionType: 'MEMBER_DUPLICATE_FLAGGED',
        operatorName: operator ? `${operator.firstName} ${operator.lastName}` : 'Affeny Grah',
        operatorId: operator?.id ?? 'mem_1',
        details: `${enriched.firstName} ${enriched.lastName} signalé(e) doublon potentiel avec ${dupe.firstName} ${dupe.lastName} (${dupe.id}).`,
        branch: enriched.branch,
      });
    }
  };

  const handleUpdateMember = (m: Member) => {
    // P1.2 — un seul point de diff pour toutes les vues qui appellent onUpdateMember
    // (validation de réception, promotion, changement d'affectation, transfert de
    // branche, baptême, drachme…) plutôt qu'un déclencheur dupliqué par vue.
    const before = members.find(item => item.id === m.id);
    if (before) {
      if (!before.receptionValidated && m.receptionValidated) {
        handleAddNotification(mkNotif('Réception validée', `Réception de ${m.firstName} ${m.lastName} validée.`, 'success', m.branch));
      }
      if (before.integrationState !== m.integrationState) {
        handleAddNotification(mkNotif('Changement de statut', `${m.firstName} ${m.lastName} : ${before.integrationState ?? '—'} → ${m.integrationState ?? '—'}.`, 'info', m.branch));
      }
      if (before.level !== m.level || before.pastoralCursus !== m.pastoralCursus) {
        handleAddNotification(mkNotif('Promotion', `${m.firstName} ${m.lastName} est passé(e) à ${m.level}${m.pastoralCursus && m.pastoralCursus !== 'Aucun' ? ` · ${m.pastoralCursus}` : ''}.`, 'success', m.branch));
      }
      if (JSON.stringify(before.departments) !== JSON.stringify(m.departments)) {
        handleAddNotification(mkNotif('Changement d\'affectation', `Affectations départementales de ${m.firstName} ${m.lastName} mises à jour.`, 'info', m.branch));
      }
      if (before.branch !== m.branch) {
        handleAddNotification(mkNotif('Transfert de branche', `${m.firstName} ${m.lastName} transféré(e) vers ${m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}.`, 'warning', m.branch));
      }
      if (before.baptismStatus !== 'Baptisé' && m.baptismStatus === 'Baptisé') {
        handleAddNotification(mkNotif('Baptême complété', `${m.firstName} ${m.lastName} a été baptisé(e).`, 'success', m.branch));
      }
      if (!before.isDrachme && m.isDrachme) {
        handleAddNotification(mkNotif('Membre Drachme (perdu)', `${m.firstName} ${m.lastName} signalé(e) Drachme (perdu).`, 'alert', m.branch));
      }
    }

    setMembers(prev => prev.map(item => item.id === m.id ? m : item));

    // Log Audit — P4.16/P4.17 : le transfert de branche et la promotion méritent
    // leur propre actionType/previousValue/newValue plutôt que le générique
    // MEMBER_PROFILE_UPDATED, pour que l'Audit et la Fiche 360° puissent les distinguer.
    const isBranchTransfer = !!before && before.branch !== m.branch;
    const isPromotion = !!before && before.pastoralCursus !== m.pastoralCursus;
    const isDrachmeChange = !!before && before.isDrachme !== m.isDrachme;
    const log: AuditLog = {
      id: genId('aud_upd'),
      timestamp: new Date().toISOString(),
      actionType: isPromotion ? 'MEMBER_PROMOTED' : isBranchTransfer ? 'BRANCH_TRANSFER' : isDrachmeChange ? 'MEMBER_DRACHME_FLAGGED' : 'MEMBER_PROFILE_UPDATED',
      operatorName: operator ? `${operator.firstName} ${operator.lastName}` : 'Affeny Grah',
      operatorId: operator?.id ?? 'mem_1',
      details: isPromotion
        ? `Promotion de ${m.firstName} ${m.lastName} : ${before!.pastoralCursus} → ${m.pastoralCursus}.`
        : isBranchTransfer
          ? `Transfert de branche de ${m.firstName} ${m.lastName} : ${before!.branch === 'church' ? 'Bloom Church' : 'Bloom Light'} → ${m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}.`
          : isDrachmeChange
            ? `${m.firstName} ${m.lastName} ${m.isDrachme ? 'signalé(e) Drachme (perdu)' : 'retiré(e) du statut Drachme'}.`
            : `Mise à jour des coordonnées/axes de ${m.firstName} ${m.lastName}.`,
      branch: m.branch,
      ...(isPromotion && { previousValue: before!.pastoralCursus, newValue: m.pastoralCursus }),
      ...(isBranchTransfer && { previousValue: before!.branch, newValue: m.branch }),
    };
    handleAddAuditLog(log);
  };

  // Suppression de profil — un membre peut effacer son propre profil, un
  // admin/pasteur peut effacer celui de n'importe qui (voir MembersView/ProfileView
  // pour le gate de rôle ; le serveur autorise déjà les deux via inMemberScope).
  const handleDeleteMember = async (id: string) => {
    const target = members.find(m => m.id === id);
    if (!target) return;
    const isSelf = id === loggedInMemberId;
    const updated = members.filter(m => m.id !== id);
    setMembers(updated);
    handleAddAuditLog({
      id: genId('aud_del'),
      timestamp: new Date().toISOString(),
      actionType: isSelf ? 'MEMBER_SELF_DELETED' : 'MEMBER_DELETED',
      operatorName: operator ? `${operator.firstName} ${operator.lastName}` : 'Affeny Grah',
      operatorId: operator?.id ?? 'mem_1',
      details: `Suppression du profil de ${target.firstName} ${target.lastName}.`,
      branch: target.branch,
    });
    if (isSelf) {
      // handleLogout() reload()-e immédiatement : le useEffect qui persiste `members`
      // (et donc son PUT serveur fire-and-forget) n'a jamais l'occasion de tourner avant
      // que la page ne se recharge. On pousse explicitement la liste filtrée avant de
      // partir, sinon la suppression de son propre profil ne survit pas au reload.
      await apiPut('members', updated).catch(() => {});
      handleLogout();
    }
  };

  const handleAddReport = (r: Report) => {
    // Upsert par id : les rapports à id unique (Date.now) s'insèrent normalement ; ceux à id
    // déterministe (ex. rapport santé Bloom Bus par membre+semaine) REMPLACENT l'existant au
    // lieu de créer un doublon lors d'une correction/rattrapage.
    setReports(prev => [r, ...prev.filter(x => x.id !== r.id)]);

    // D5 — un rapport de suivi coach EST un contact : réinitialise l'horloge "au rouge" du membre suivi.
    if (r.reportType === 'rapport_suivi_coach' && r.content?.memberId) {
      const today = new Date().toISOString().split('T')[0];
      setMembers(prev => prev.map(m => m.id === r.content.memberId ? { ...m, lastContact: today } : m));
    }

    const isObservation = r.reportType === 'rapport_observation' || r.reportType === 'rapport_suivi_coach';
    handleAddNotification(mkNotif(
      isObservation ? 'Observation soumise' : 'Rapport soumis',
      `${r.authorName} a soumis un ${r.reportType.replace('rapport_', 'rapport ')}.`,
      isObservation ? 'warning' : 'info',
      r.targetBranch,
    ));

    // Log Audit
    const log: AuditLog = {
      id: genId('aud_rep'),
      timestamp: new Date().toISOString(),
      actionType: 'REPORT_SUBMITTED',
      operatorName: r.authorName,
      operatorId: r.authorId,
      details: `Soumission d'un rapport de type ${r.reportType} pour la branche ${r.targetBranch}.`,
      branch: r.targetBranch
    };
    handleAddAuditLog(log);
  };

  const handleAddEvent = (e: Event) => {
    setEvents(prev => [e, ...prev]);

    handleAddNotification(mkNotif(
      'Culte/événement planifié',
      `"${e.title}" programmé le ${e.date}.`,
      'info',
      e.branch,
    ));

    // Log Audit
    const log: AuditLog = {
      id: genId('aud_evt'),
      timestamp: new Date().toISOString(),
      actionType: 'EVENT_PLANNED',
      operatorName: 'Jean-Marc Kouamé',
      operatorId: 'mem_2',
      details: `Planification du culte/événement "${e.title}".`
    };
    handleAddAuditLog(log);
  };

  const handleAddAuditLog = (log: AuditLog) => {
    setAudits(prev => [log, ...prev]);
  };

  const handleTogglePermission = (capability: string, role: string) => {
    // Le Super Admin voit toujours tout (Sidebar.tsx canView bypass) — interdire de toucher
    // aux capacités view_* de son propre rôle, même si l'UI qui appelle ceci a un bug.
    if (role === 'Super Admin' && capability.startsWith('view_')) return;
    setPermissionMatrix(prev => {
      const current = prev[capability]?.[role] || false;
      const updated = {
        ...prev,
        [capability]: {
          ...prev[capability],
          [role]: !current
        }
      };

      // Add audit log
      const log: AuditLog = {
        id: genId('aud_perm'),
        timestamp: new Date().toISOString(),
        actionType: 'ROLE_PERMISSION_UPDATED',
        operatorName: 'Affeny Grah',
        operatorId: 'mem_1',
        details: `Modification de l'habilitation "${capability}" pour le rôle "${role}".`,
        previousValue: current ? 'true' : 'false',
        newValue: !current ? 'true' : 'false'
      };
      handleAddAuditLog(log);

      return updated;
    });
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleSaveQuickNouveau = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFirstname || !quickLastname || !quickPhone || !quickPhotoUrl) {
      alert('Veuillez remplir les informations obligatoires (Prénom, Nom, Contact, Photo).');
      return;
    }

    if (members.some(m => m.phone === quickPhone)) {
      alert('Ce numéro de téléphone est déjà utilisé par un autre membre.');
      return;
    }

    const newNouveau: Member = {
      id: `new_quick_${Date.now()}`,
      firstName: quickFirstname,
      lastName: quickLastname,
      phone: quickPhone,
      email: `${quickFirstname.toLowerCase()}.${quickLastname.toLowerCase()}@gmail.com`,
      gender: quickGender,
      birthDate: quickBirthDate || '2000-01-01',
      maritalStatus: 'Célibataire',
      profession: 'Étudiant',
      branch: activeBranch,
      level: 'Nouveau',
      pastoralCursus: 'Aucun',
      departments: { [quickDept]: 'Membre' },
      entryDate: quickActivityDate,
      integrationState: 'En attente',
      receptionValidated: false, // §6.2 — awaits Responsable's reception validation
      membershipWish: quickWish,
      integrationDateRegistered: quickActivityDate, // date d'activité (culte) = date de saisie ADN
      // ponytail: type de culte stocké en note tant que l'entité Événement/rapport ADN n'est pas branchée
      integrationNotes: `Culte : ${quickCultType}`,
      ojFlag: quickOj,
      hasPassedToBossForm: false,
      avatarUrl: quickPhotoUrl,
      source: quickSource,
      gps: {
        lat: quickGps?.lat ?? 5.3854,
        lng: quickGps?.lng ?? -3.9781,
        commune: quickCommune
      },
      healthKPIs: {
        spirituel: 2,
        social: 2,
        financier: 2,
        physique: 3,
        presenceCulte: 1,
        presenceService: 1
      },
      baptismStatus: 'Non baptisé'
    };

    handleAddMember(newNouveau);
    setShowGlobalQuickForm(false);
    
    // Clear
    setQuickFirstname('');
    setQuickLastname('');
    setQuickPhone('');
    setQuickOj(false);
    setQuickWish('Membre');
    setQuickGender('H');
    setQuickBirthDate('');
    setQuickDept('dept_louange');
    setQuickCultType('Culte du Dimanche');
    setQuickActivityDate(new Date().toISOString().split('T')[0]);
    setQuickPhotoUrl('');
    setQuickGps(null);
    setQuickSource('Invitation');

    alert('Nouveau membre enregistré avec succès par l\'ADN (Accueil des Nouveaux) !');
    setActiveTab('integration');
  };

  // P4.19 — membre connecté (remplace les anciens hardcodes mem_1).
  const operator = members.find(m => m.id === loggedInMemberId) ?? members[0];
  // §6.2 — une notification ciblée (escalade J+7) n'est visible que du Ministre visé ;
  // Admin/Super Admin gardent une vue d'ensemble (même principe que le journal d'audit).
  const visibleNotifications = notifications.filter(n =>
    !n.targetMemberId || n.targetMemberId === operator?.id || ['Admin', 'Super Admin'].includes(simulatedRole)
  );

  // Render view depending on activeTab and simulated role permissions
  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            members={members}
            events={events}
            reports={reports}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            setActiveTab={setActiveTab}
            onOpenQuickNewForm={() => setShowGlobalQuickForm(true)}
            operatorId={operator?.id}
            onMarkReportTreated={(reportId) => setReports(prev => prev.map(r =>
              r.id === reportId ? { ...r, content: { ...r.content, traite: true } } : r))}
          />
        );
      case 'members':
        return (
          <MembersView
            members={members}
            onUpdateMember={handleUpdateMember}
            onAddMember={handleAddMember}
            onDeleteMember={handleDeleteMember}
            reports={reports}
            onAddReport={handleAddReport}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            operator={operator}
            audits={audits}
            permissionMatrix={permissionMatrix}
            forms={forms}
          />
        );
      case 'integration':
        return (
          <NouveauxView
            members={members}
            onUpdateMember={handleUpdateMember}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
          />
        );
      case 'bloombus':
        return (
          <BloomBusView
            members={members}
            reports={reports}
            events={events}
            onUpdateMember={handleUpdateMember}
            onAddReport={handleAddReport}
            onAddMember={handleAddMember}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            forms={forms}
            operator={operator}
          />
        );
      case 'events':
        return (
          <EventsView
            events={events}
            reports={reports}
            onAddEvent={handleAddEvent}
            onUpdateEvent={(ev) => setEvents(prev => prev.map(e => e.id === ev.id ? ev : e))}
            onAddReport={handleAddReport}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            members={members}
            forms={forms}
          />
        );
      case 'projects':
        return (
          <ProjectsView
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            events={events}
            operator={operator}
          />
        );
      case 'cursus':
        return (
          <CursusView
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            members={members}
            onUpdateMember={handleUpdateMember}
            operator={operator}
          />
        );
      case 'ministeres':
        return <MinisteresView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} reports={reports} operator={operator} departments={departments} onUpdateDepartments={setDepartments} onAddAuditLog={handleAddAuditLog} />;
      case 'departments':
        return <DepartmentsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} reports={reports} events={events} audits={audits} permissionMatrix={permissionMatrix} forms={forms} departments={departments} onUpdateDepartments={setDepartments} onUpdateMember={handleUpdateMember} onAddMember={handleAddMember} busLines={busLines} onAddReport={handleAddReport} onAddAuditLog={handleAddAuditLog} selectedDept={selectedDept} setSelectedDept={setSelectedDept} operatorId={operator?.id} onOpenQuickNewForm={() => setShowGlobalQuickForm(true)} />;
      case 'formations':
        return <FormationsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} operator={operator} permissionMatrix={permissionMatrix} />;
      case 'programs':
        return <ProgrammesView members={members} onUpdateMember={handleUpdateMember} onAddAuditLog={handleAddAuditLog} activeBranch={activeBranch} simulatedRole={simulatedRole} operator={operator} permissionMatrix={permissionMatrix} />;
      case 'reports':
        return <ReportsView reports={reports} activeBranch={activeBranch} simulatedRole={simulatedRole} />;
      case 'permissions':
        return (
          <PermissionsView
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            permissionMatrix={permissionMatrix}
            onTogglePermission={handleTogglePermission}
          />
        );
      case 'accounts':
        return <AccountsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} audits={audits} onAddAuditLog={handleAddAuditLog} onAddNotification={handleAddNotification} />;
      case 'settings':
        return <SettingsView activeBranch={activeBranch} simulatedRole={simulatedRole} settings={settings} onUpdateSettings={setSettings} />;
      case 'formbuilder':
        return <FormBuilderView activeBranch={activeBranch} simulatedRole={simulatedRole} forms={forms} onUpdateForms={setForms} />;
      case 'audit':
        return <AuditView audits={audits} activeBranch={activeBranch} />;
      case 'profile':
        return <ProfileView operator={operator} simulatedRole={simulatedRole} onUpdateMember={handleUpdateMember} onDeleteMember={handleDeleteMember} onLogout={handleLogout} />;
      default:
        return <div className="p-8">Section en cours de construction.</div>;
    }
  };

  if (!loggedInMemberId) {
    return <AuthView members={members} onLogin={setLoggedInMemberId} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bc-canvas print:h-auto print:overflow-visible print:block">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        activeBranch={activeBranch}
        simulatedRole={simulatedRole}
        selectedDept={selectedDept}
        setSelectedDept={setSelectedDept}
        permissionMatrix={permissionMatrix}
        members={members}
        operator={operator}
      />

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header toolbar */}
        <Header 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeBranch={activeBranch}
          setActiveBranch={setActiveBranch}
          notifications={visibleNotifications}
          markNotificationAsRead={markNotificationAsRead}
          markAllNotificationsAsRead={markAllNotificationsAsRead}
          simulatedRole={simulatedRole}
          operator={operator}
          setSidebarCollapsed={setSidebarCollapsed}
          churchAccent={settings.branches.church.accent}
          lightAccent={settings.branches.light.accent}
        />

        {/* Content canvas */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative no-scrollbar print:overflow-visible print:p-0">
          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -15, filter: 'blur(2px)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="flex-1 flex flex-col min-h-full"
              >
                <Suspense fallback={<div className="flex-1 flex items-center justify-center py-24"><Loader2 className="animate-spin text-bc-green" size={28} /></div>}>
                  {renderActiveView()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Floating Action Buttons — visible sur toutes les pages pour ces rôles */}
      {['ADN', 'Admin', 'Super Admin'].includes(simulatedRole) && (
        <button
          id="floating-adn-btn"
          onClick={() => setShowGlobalQuickForm(true)}
          className={`fixed bottom-6 right-6 p-4 rounded-full text-white shadow-2xl md:hover:scale-105 transition-transform duration-200 ease-out-spring active-scale z-40 cursor-pointer min-h-[56px] min-w-[56px] flex items-center justify-center ${
            'bg-bc-green'
          }`}
          title="Nouveau & OJ ADN"
        >
          <span className="flex items-center gap-1">
            <UserCheck size={22} />
            <span className="text-xs font-ui font-black uppercase tracking-wider pr-1">➕ ADN</span>
          </span>
        </button>
      )}

      {/* Global Quick ADN Nouveau Modal */}
      {showGlobalQuickForm && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-6 border border-bc-border shadow-2xl relative">
            <button
              id="close-global-quick-btn"
              onClick={() => setShowGlobalQuickForm(false)}
              className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-purple transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
              <UserCheck size={18} className={'text-bc-text'} />
              Fiche d'Accueil ADN & OJ (Moisson Directe)
            </h3>

            <form onSubmit={handleSaveQuickNouveau} className="space-y-4">
              {/* Type de membre (OJ / Nouveau) */}
              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f0', 'Type de membre')} *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickOj(true)}
                    className={`text-left p-3 rounded-2xl border transition-colors ${quickOj ? 'bg-bc-green/10 border-bc-green' : 'bg-white border-bc-border hover:bg-bc-canvas'}`}
                  >
                    <span className="block text-xs font-bold text-bc-text">Oui Jésus (OJ)</span>
                    <span className="block text-[10px] text-bc-text-secondary">A donné sa vie à Jésus aujourd'hui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickOj(false)}
                    className={`text-left p-3 rounded-2xl border transition-colors ${!quickOj ? 'bg-bc-green/10 border-bc-green' : 'bg-white border-bc-border hover:bg-bc-canvas'}`}
                  >
                    <span className="block text-xs font-bold text-bc-text">Nouveau (NV)</span>
                    <span className="block text-[10px] text-bc-text-secondary">Premier(s) passage(s) à l'église</span>
                  </button>
                </div>
              </div>

              {/* Date d'activité (culte) + Type de culte */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f1', "Date d'activité (culte)")} *</label>
                  <input
                    type="date"
                    required
                    value={quickActivityDate}
                    onChange={(e) => setQuickActivityDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f2', 'Type de culte')}</label>
                  <select
                    value={quickCultType}
                    onChange={(e) => setQuickCultType(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    {CULT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f3', 'Prénom')} *</label>
                  <input
                    id="quick-firstname"
                    type="text"
                    required
                    value={quickFirstname}
                    onChange={(e) => setQuickFirstname(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f4', 'Nom')} *</label>
                  <input
                    id="quick-lastname"
                    type="text"
                    required
                    value={quickLastname}
                    onChange={(e) => setQuickLastname(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* Contact + Genre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f5', 'Contact')} *</label>
                  <input
                    id="quick-phone"
                    type="text"
                    required
                    placeholder="+225..."
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f6', 'Genre')}</label>
                  <select
                    value={quickGender}
                    onChange={(e) => setQuickGender(e.target.value as 'H' | 'F')}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    <option value="H">Homme</option>
                    <option value="F">Femme</option>
                  </select>
                </div>
              </div>

              {/* Date de naissance + Commune */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f7', 'Date de naissance')}</label>
                  <input
                    type="date"
                    value={quickBirthDate}
                    onChange={(e) => setQuickBirthDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f8', 'Commune / Quartier')}</label>
                  <select
                    id="quick-commune-select"
                    value={quickCommune}
                    onChange={(e) => setQuickCommune(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    <option value="Cocody">Cocody</option>
                    <option value="Yopougon">Yopougon</option>
                    <option value="Abobo">Abobo</option>
                    <option value="Koumassi">Koumassi</option>
                  </select>
                </div>
              </div>

              {/* Photo (obligatoire) + Source */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f9', 'Photo')} *</label>
                  <input
                    id="quick-photo-input"
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Resize + gestion d'erreur (C2/B6) — une photo pleine résolution
                      // faisait exploser le quota localStorage et crasher en boucle.
                      downscaleImage(file).then(setQuickPhotoUrl).catch((err) => alert(err.message));
                    }}
                    className="w-full border border-bc-border rounded-full px-3 py-1.5 text-[10px] bg-white focus:outline-none"
                  />
                  {quickPhotoUrl && (
                    <img src={quickPhotoUrl} alt="Aperçu" className="mt-2 w-12 h-12 rounded-full object-cover border border-bc-border" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f10', 'Comment nous a-t-il connu ?')}</label>
                  <select
                    value={quickSource}
                    onChange={(e) => setQuickSource(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    <option value="Invitation">Invitation (ami/famille)</option>
                    <option value="Réseaux sociaux">Réseaux sociaux</option>
                    <option value="Passage devant l'église">Passage devant l'église</option>
                    <option value="Évangélisation">Évangélisation</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
              </div>

              {/* Localisation GPS */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      alert('Géolocalisation non disponible sur cet appareil.');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => setQuickGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                      () => alert('Impossible de récupérer la position GPS.')
                    );
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-full border border-bc-border hover:bg-bc-canvas"
                >
                  📍 {quickGps ? `Position capturée (${quickGps.lat.toFixed(4)}, ${quickGps.lng.toFixed(4)})` : 'Localiser (GPS)'}
                </button>
              </div>

              {/* Souhaites-tu être… (membre vs simple visiteur) */}
              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f11', 'Souhaites-tu être…')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Membre', 'Visiteur'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setQuickWish(opt)}
                      className={`px-3 py-2 rounded-full text-xs font-bold border transition-colors ${
                        quickWish === opt ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'
                      }`}
                    >
                      {opt === 'Membre' ? 'Membre' : 'Simple visiteur'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Département d'intérêt */}
              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">{nouveauLabel('f12', "Département d'intérêt")}</label>
                <select
                  value={quickDept}
                  onChange={(e) => setQuickDept(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  {departmentOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
                <button
                  id="quick-cancel-btn"
                  type="button"
                  onClick={() => setShowGlobalQuickForm(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas"
                >
                  Annuler
                </button>
                <button
                  id="quick-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 ${'bg-bc-green'}`}
                >
                  Enregistrer ADN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
