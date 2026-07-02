import React, { useState, useEffect } from 'react';
import { load, save, seeds, useDepartments } from './data';

const CULT_TYPES = ['Culte du Dimanche', 'Culte de Prière', 'Veillée', 'Culte des Jeunes', 'Réunion de Maison'];
import { 
  Member, 
  Event, 
  Report, 
  AuditLog, 
  AppNotification, 
  PermissionMatrix, 
  Branch 
} from './types';
import { motion, AnimatePresence } from 'motion/react';

// Import Views
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import MembersView from './components/MembersView';
import NouveauxView from './components/NouveauxView';
import BloomBusView from './components/BloomBusView';
import EventsView from './components/EventsView';
import ReportsView from './components/ReportsView';
import ProgrammesView from './components/ProgrammesView';
import FormationsView from './components/FormationsView';
import MinisteresView from './components/MinisteresView';
import DepartmentsView from './components/DepartmentsView';
import AccountsView from './components/AccountsView';
import SettingsView from './components/SettingsView';
import FormBuilderView from './components/FormBuilderView';
import PermissionsView from './components/PermissionsView';
import AuditView from './components/AuditView';
import ProjectsView from './components/ProjectsView';
import CursusView from './components/CursusView';
import ProfileView from './components/ProfileView';

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
  const [events, setEvents] = useState<Event[]>(() => load('bc_events', seeds.events));
  const [reports, setReports] = useState<Report[]>(() => load('bc_reports', seeds.reports));
  const [audits, setAudits] = useState<AuditLog[]>(() => load('bc_audits', seeds.audits));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => load('bc_notifications', seeds.notifications));
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>(() => load('bc_permissions', seeds.permissions));

  // Persist on change — single swap point lives in ./data.
  useEffect(() => { save('bc_members', members); }, [members]);
  useEffect(() => { save('bc_events', events); }, [events]);
  useEffect(() => { save('bc_reports', reports); }, [reports]);
  useEffect(() => { save('bc_audits', audits); }, [audits]);
  useEffect(() => { save('bc_notifications', notifications); }, [notifications]);
  useEffect(() => { save('bc_permissions', permissionMatrix); }, [permissionMatrix]);

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
  const departmentOptions = useDepartments();

  const handleAddMember = (m: Member) => {
    setMembers(prev => [m, ...prev]);
    
    // Log Audit
    const log: AuditLog = {
      id: `aud_reg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: m.level === 'Nouveau' ? 'MEMBER_REGISTERED_ADN' : 'MEMBER_CREATED_MANUAL',
      operatorName: 'Affeny Grah',
      operatorId: 'mem_1',
      details: `Création du profil de ${m.firstName} ${m.lastName} (${m.level}).`,
      branch: m.branch
    };
    handleAddAuditLog(log);
  };

  const handleUpdateMember = (m: Member) => {
    setMembers(prev => prev.map(item => item.id === m.id ? m : item));
    
    // Log Audit
    const log: AuditLog = {
      id: `aud_upd_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'MEMBER_PROFILE_UPDATED',
      operatorName: 'Affeny Grah',
      operatorId: 'mem_1',
      details: `Mise à jour des coordonnées/axes de ${m.firstName} ${m.lastName}.`,
      branch: m.branch
    };
    handleAddAuditLog(log);
  };

  const handleAddReport = (r: Report) => {
    setReports(prev => [r, ...prev]);
    
    // Log Audit
    const log: AuditLog = {
      id: `aud_rep_${Date.now()}`,
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
    
    // Log Audit
    const log: AuditLog = {
      id: `aud_evt_${Date.now()}`,
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
        id: `aud_perm_${Date.now()}`,
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
    if (!quickFirstname || !quickLastname || !quickPhone) {
      alert('Veuillez remplir les informations obligatoires.');
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
      gps: {
        lat: 5.3854,
        lng: -3.9781,
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

    alert('Nouveau membre enregistré avec succès par l\'ADN (Accueil des Nouveaux) !');
    setActiveTab('integration');
  };

  // Render view depending on activeTab and simulated role permissions
  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            members={members}
            events={events}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            setActiveTab={setActiveTab}
            onOpenQuickNewForm={() => setShowGlobalQuickForm(true)}
          />
        );
      case 'members':
        return (
          <MembersView 
            members={members} 
            onUpdateMember={handleUpdateMember} 
            onAddMember={handleAddMember}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
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
            onUpdateMember={handleUpdateMember} 
            onAddReport={handleAddReport}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
          />
        );
      case 'events':
        return (
          <EventsView
            events={events}
            reports={reports}
            onAddEvent={handleAddEvent}
            onAddReport={handleAddReport}
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
          />
        );
      case 'projects':
        return (
          <ProjectsView 
            activeBranch={activeBranch} 
            simulatedRole={simulatedRole} 
          />
        );
      case 'cursus':
        return (
          <CursusView
            activeBranch={activeBranch}
            simulatedRole={simulatedRole}
            members={members}
            onUpdateMember={handleUpdateMember}
          />
        );
      case 'ministeres':
        return <MinisteresView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} />;
      case 'departments':
        return <DepartmentsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} onUpdateMember={handleUpdateMember} selectedDept={selectedDept} setSelectedDept={setSelectedDept} />;
      case 'formations':
        return <FormationsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} />;
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
        return <AccountsView activeBranch={activeBranch} simulatedRole={simulatedRole} members={members} audits={audits} onAddAuditLog={handleAddAuditLog} />;
      case 'settings':
        return <SettingsView activeBranch={activeBranch} simulatedRole={simulatedRole} />;
      case 'formbuilder':
        return <FormBuilderView activeBranch={activeBranch} simulatedRole={simulatedRole} />;
      case 'audit':
        return <AuditView audits={audits} activeBranch={activeBranch} />;
      case 'profile':
        // ponytail: operator is the logged-in user; hardcoded to mem_1 until auth lands
        return <ProfileView operator={members.find(m => m.id === 'mem_1') ?? members[0]} simulatedRole={simulatedRole} onUpdateMember={handleUpdateMember} />;
      default:
        return <div className="p-8">Section en cours de construction.</div>;
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-bc-canvas">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        activeBranch={activeBranch}
        simulatedRole={simulatedRole}
        setSimulatedRole={setSimulatedRole}
        selectedDept={selectedDept}
        setSelectedDept={setSelectedDept}
      />

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header toolbar */}
        <Header 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeBranch={activeBranch}
          setActiveBranch={setActiveBranch}
          notifications={notifications}
          markNotificationAsRead={markNotificationAsRead}
          simulatedRole={simulatedRole}
          setSidebarCollapsed={setSidebarCollapsed}
        />

        {/* Content canvas */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative no-scrollbar">
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
                {renderActiveView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Floating Action Buttons per Tab */}
      {activeTab === 'dashboard' && ['ADN', 'Intégration', 'Portier', 'GDC'].includes(simulatedRole) && (
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
                <label className="block text-xs font-bold text-bc-text mb-1">Type de membre *</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Date d'activité (culte) *</label>
                  <input
                    type="date"
                    required
                    value={quickActivityDate}
                    onChange={(e) => setQuickActivityDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Type de culte</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Prénom *</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Nom *</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Contact *</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Genre</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Date de naissance</label>
                  <input
                    type="date"
                    value={quickBirthDate}
                    onChange={(e) => setQuickBirthDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Commune / Quartier</label>
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

              {/* Souhaites-tu être… (membre vs simple visiteur) */}
              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Souhaites-tu être…</label>
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
                <label className="block text-xs font-bold text-bc-text mb-1">Département d'intérêt</label>
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
    </div>
  );
}
