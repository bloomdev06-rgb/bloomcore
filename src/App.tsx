import React, { useState, useEffect, lazy, Suspense } from 'react';
import { load, save, seeds, useDepartments, useMinistries, useBusLines, useAdmins, deriveTimeBasedNotifications, apiBootstrap, apiPut, clearAuthToken, enableSync, canView, openNotificationStream, apiFetchCollection, labelFor } from './data';
import { reportName } from './data/reportNames';
import { resolveMemberRole } from './data/roles';
import { MEMBERS_TAB_DEPT_ONLY_ROLES } from './data/scope';
import { isLegacySeedEventId } from './data/events';
import { DEFAULT_OPERATOR_NAME, operatorDisplayName } from './data/operator';
import { MULTI_BRANCH_ROLES, GLOBAL_VIEW_ROLES } from './data/scope';

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
// reste dans le bundle principal.
// lazyRetry : après un redéploiement, un navigateur qui a l'ancien index.html référence
// des chunks hashés qui n'existent plus → l'import dynamique échoue → onglet qui ne
// s'affiche jamais. On recharge alors la page UNE fois (garde sessionStorage) pour
// récupérer le nouvel index.html ; si ça échoue encore, on laisse remonter l'erreur.
const VIEW_LOADERS: Array<() => Promise<unknown>> = [];
function lazyRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  const loader = () =>
    factory().catch((err) => {
      if (!sessionStorage.getItem('bc_chunk_reload')) {
        sessionStorage.setItem('bc_chunk_reload', '1');
        window.location.reload();
        return new Promise<never>(() => {}); // la page recharge, on ne résout jamais
      }
      throw err;
    });
  VIEW_LOADERS.push(loader);
  return lazy(loader);
}
const DashboardView = lazyRetry(() => import('./components/DashboardView'));
const TrendsView = lazyRetry(() => import('./components/TrendsView'));
const MembersView = lazyRetry(() => import('./components/MembersView'));
const NouveauxView = lazyRetry(() => import('./components/NouveauxView'));
const BloomBusView = lazyRetry(() => import('./components/BloomBusView'));
const EventsView = lazyRetry(() => import('./components/EventsView'));
const ReportsView = lazyRetry(() => import('./components/ReportsView'));
const ProgrammesView = lazyRetry(() => import('./components/ProgrammesView'));
const FormationsView = lazyRetry(() => import('./components/FormationsView'));
const MinisteresView = lazyRetry(() => import('./components/MinisteresView'));
const DepartmentsView = lazyRetry(() => import('./components/DepartmentsView'));
const AccountsView = lazyRetry(() => import('./components/AccountsView'));
const SettingsView = lazyRetry(() => import('./components/SettingsView'));
const FormBuilderView = lazyRetry(() => import('./components/FormBuilderView'));
const PermissionsView = lazyRetry(() => import('./components/PermissionsView'));
const AuditView = lazyRetry(() => import('./components/AuditView'));
const ProjectsView = lazyRetry(() => import('./components/ProjectsView'));
const CursusView = lazyRetry(() => import('./components/CursusView'));
const AdnView = lazyRetry(() => import('./components/AdnView'));
const CulteReportView = lazyRetry(() => import('./components/CulteReportView'));
const DenombrementView = lazyRetry(() => import('./components/DenombrementView'));
const ProfileView = lazyRetry(() => import('./components/ProfileView'));
import AuthView from './components/AuthView';
import CreateDepartmentModal from './components/CreateDepartmentModal';
import { ToastContainer } from './components/ui/Toast';
import { PageSkeleton } from './components/ui/Skeleton';

import { UserCheck, Sparkles, X, Heart } from 'lucide-react';

export default function App() {
  // Navigation states
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDept, setSelectedDept] = useState<string | null>(null); // département sélectionné depuis la Sidebar
  const [activeBranch, setActiveBranch] = useState<Branch>('church');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState('Pasteur');

  // Persistence States
  const [members, setMembers] = useState<Member[]>(() => load('bc_members', seeds.members));
  // Lot 4 : purge des anciens events seed d'un localStorage existant (le serveur fait pareil au boot).
  const [events, setEvents] = useState<Event[]>(() => load('bc_events', seeds.events).filter((e: Event) => !isLegacySeedEventId(e.id)));
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

  // Préchargement des vues en arrière-plan après connexion : le premier clic sur un onglet
  // ne paie plus le chargement du chunk (transform Vite en dev, aller-réseau en prod).
  useEffect(() => {
    if (!loggedInMemberId) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 800));
    idle(() => { VIEW_LOADERS.forEach((l) => { l().catch(() => {}); }); });
  }, [loggedInMemberId]);


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
  }, [loggedInMemberId]);

  // Temps réel (§7) : à chaque poke SSE du serveur (nouvelle notif / alerte
  // d'intégration), re-fetch la collection notifications sans re-bootstrap complet.
  useEffect(() => {
    if (!loggedInMemberId) return;
    const close = openNotificationStream(() => {
      void apiFetchCollection('notifications').then((list) => {
        if (list) setNotifications(list as AppNotification[]);
      });
    });
    return close;
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

  const departmentOptions = useDepartments();
  const ministrySeeds = useMinistries();
  // Modal « Créer un département » — ouvert depuis la sidebar (pasteurs/admins).
  const [showCreateDept, setShowCreateDept] = useState(false);
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
    const departments = m.ojFlag ? { ...m.departments, dept_bapteme: 'membre' as const } : m.departments;
    const enriched: Member = { ...m, ...(bus && { bloomBusId: bus.id }), departments };

    setMembers(prev => [enriched, ...prev]);

    if (enriched.level === 'nouveau') {
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
      actionType: enriched.level === 'nouveau' ? 'MEMBER_REGISTERED_ADN' : 'MEMBER_CREATED_MANUAL',
      operatorName: operatorDisplayName(operator),
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
        operatorName: operatorDisplayName(operator),
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
        handleAddNotification(mkNotif('Promotion', `${m.firstName} ${m.lastName} est passé(e) à ${labelFor(m.level)}${m.pastoralCursus && m.pastoralCursus !== 'aucun' ? ` · ${labelFor(m.pastoralCursus)}` : ''}.`, 'success', m.branch));
      }
      if (JSON.stringify(before.departments) !== JSON.stringify(m.departments)) {
        handleAddNotification(mkNotif('Changement d\'affectation', `Affectations départementales de ${m.firstName} ${m.lastName} mises à jour.`, 'info', m.branch));
      }
      if (before.branch !== m.branch) {
        handleAddNotification(mkNotif('Transfert de branche', `${m.firstName} ${m.lastName} transféré(e) vers ${m.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}.`, 'warning', m.branch));
      }
      if (before.baptismStatus !== 'baptise' && m.baptismStatus === 'baptise') {
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
      operatorName: operatorDisplayName(operator),
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
      operatorName: operatorDisplayName(operator),
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

  // Mise à jour en place d'un rapport existant (upsert des comptages ADN/culte par eventId) —
  // sans notification ni audit REPORT_SUBMITTED : c'est une correction, pas une soumission.
  const handleUpdateReport = (r: Report) => {
    setReports(prev => prev.map(x => x.id === r.id ? r : x));
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
      details: `Soumission d'un rapport de type ${reportName(r.reportType)} pour la branche ${r.targetBranch}.`,
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
        operatorName: DEFAULT_OPERATOR_NAME,
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

  // P4.19 — membre connecté (remplace les anciens hardcodes mem_1).
  const operator = members.find(m => m.id === loggedInMemberId) ?? members[0];
  // Cloisonnement par branche (PROFILS-INTERFACES) : un profil mono-branche est verrouillé
  // sur SA branche ; « Global » réservé au staff. Pasteurs/admins/ministres/coachs gardent
  // le commutateur — règle du cahier, inchangée. Miroir UI du garde-fou Header.
  useEffect(() => {
    if (!operator) return;
    if (!MULTI_BRANCH_ROLES.includes(simulatedRole) && operator.branch && activeBranch !== operator.branch) {
      setActiveBranch(operator.branch);
    } else if (!GLOBAL_VIEW_ROLES.includes(simulatedRole) && activeBranch === 'global') {
      setActiveBranch(operator.branch ?? 'church');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedRole, activeBranch, operator?.id]);
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
            onOpenQuickNewForm={() => setActiveTab('adn')}
            operatorId={operator?.id}
            onMarkReportTreated={(reportId) => setReports(prev => prev.map(r =>
              r.id === reportId ? { ...r, content: { ...r.content, traite: true } } : r))}
          />
        );
      case 'trends':
        return <TrendsView members={members} reports={reports} activeBranch={activeBranch} />;
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
      case 'adn':
        return (
          <AdnView
            members={members}
            events={events}
            reports={reports}
            forms={forms}
            operator={operator}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            audits={audits}
            permissionMatrix={permissionMatrix}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onAddReport={handleAddReport}
            onUpdateReport={handleUpdateReport}
          />
        );
      case 'denombrement':
        return (
          <DenombrementView
            events={events}
            reports={reports}
            operator={operator}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            onAddReport={handleAddReport}
            onUpdateReport={handleUpdateReport}
          />
        );
      case 'rapportculte':
        return (
          <CulteReportView
            events={events}
            reports={reports}
            operator={operator}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            onAddReport={handleAddReport}
            onUpdateReport={handleUpdateReport}
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
            onUpdateReport={handleUpdateReport}
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
            onAddReport={handleAddReport}
            operator={operator}
          />
        );
      case 'ministeres':
        return <MinisteresView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} reports={reports} operator={operator} departments={departments} onUpdateDepartments={setDepartments} onAddAuditLog={handleAddAuditLog} />;
      case 'departments':
        return <DepartmentsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} reports={reports} events={events} audits={audits} permissionMatrix={permissionMatrix} forms={forms} departments={departments} onUpdateDepartments={setDepartments} onUpdateMember={handleUpdateMember} onAddMember={handleAddMember} busLines={busLines} onAddReport={handleAddReport} onAddEvent={handleAddEvent} onAddAuditLog={handleAddAuditLog} selectedDept={selectedDept} setSelectedDept={setSelectedDept} operatorId={operator?.id} onOpenQuickNewForm={() => setActiveTab('adn')} />;
      case 'formations':
        return <FormationsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} operator={operator} permissionMatrix={permissionMatrix} />;
      case 'programs':
        return <ProgrammesView members={members} onUpdateMember={handleUpdateMember} onAddAuditLog={handleAddAuditLog} activeBranch={activeBranch} simulatedRole={simulatedRole} operator={operator} permissionMatrix={permissionMatrix} forms={forms} reports={reports} audits={audits} onAddReport={handleAddReport} />;
      case 'reports':
        return <ReportsView reports={reports} activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} events={events} />;
      case 'permissions':
        return (
          <PermissionsView
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            permissionMatrix={permissionMatrix}
            onTogglePermission={handleTogglePermission}
            members={members}
            operator={operator}
            onAddAuditLog={handleAddAuditLog}
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
        onCreateDepartment={() => setShowCreateDept(true)}
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
            {/* Transition volontairement courte : le spring + blur en mode "wait" ajoutait
                ~1 s perçue à CHAQUE changement d'onglet (sortie, puis chunk, puis entrée). */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="flex-1 flex flex-col min-h-full"
              >
                <Suspense fallback={<PageSkeleton />}>
                  {renderActiveView()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* §14.3 — bouton flottant ADN (mobile) : accès rapide à la fiche d'accueil des nouveaux.
          Caché sur desktop (la sidebar porte déjà l'onglet) et masqué si déjà sur l'onglet ADN. */}
      {canView(permissionMatrix, 'adn', simulatedRole) && activeTab !== 'adn' && (
        <button
          onClick={() => setActiveTab('adn')}
          className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-bc-green text-white shadow-lg shadow-bc-green/30 flex items-center justify-center active-scale ease-out-spring"
          aria-label="Accueil ADN — enregistrer un nouveau"
        >
          <UserCheck size={22} />
        </button>
      )}

      {showCreateDept && (
        <CreateDepartmentModal
          ministries={ministrySeeds}
          onClose={() => setShowCreateDept(false)}
          onCreate={(d) => {
            setDepartments(prev => [...prev, d]);
            handleAddAuditLog({
              id: genId('aud_dept'),
              timestamp: new Date().toISOString(),
              actionType: 'DEPT_CREATED',
              operatorName: operator ? `${operator.firstName} ${operator.lastName}` : simulatedRole,
              operatorId: operator?.id ?? '',
              entity: 'department',
              details: `Département « ${d.name} » créé depuis la barre latérale.`,
            });
            setShowCreateDept(false);
            setSelectedDept(d.id);
            setActiveTab('departments');
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
}
