import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Branch, Member, PermissionMatrix } from '../types';
import {
  LayoutDashboard, Users, Grid, LayoutList, Bus, Calendar,
  Activity, Heart, GraduationCap, Shield, UserCog, Settings,
  FormInput, History, X, UserPlus, ChevronDown, FileText, Droplet,
  UserCheck, ClipboardList, Plus, DoorOpen
} from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useDepartments, useMinistries, canView as canViewTab } from '../data';
import { MEMBERS_TAB_DEPT_ONLY_ROLES } from '../data/scope';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activeBranch: Branch;
  simulatedRole: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedDept: string | null;
  setSelectedDept: (id: string | null) => void;
  permissionMatrix: PermissionMatrix;
  members: Member[];
  operator?: Member;
  // Ouvre le modal « Créer un département » (monté dans App) — bouton visible pasteurs/admins.
  onCreateDepartment?: () => void;
}

export default function Sidebar({
  collapsed,
  setCollapsed,
  activeBranch,
  simulatedRole,
  activeTab,
  setActiveTab,
  selectedDept,
  setSelectedDept,
  permissionMatrix,
  members,
  operator,
  onCreateDepartment
}: SidebarProps) {
  const isChurch = activeBranch === 'church';
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const departments = useDepartments();
  const ministries = useMinistries();
  // P4.5 — accordéon Ministère → Départements, au lieu de la liste plate.
  const [expandedMinistries, setExpandedMinistries] = useState<Set<string>>(new Set());
  // Repli/dépli de l'accordéon Départements : re-cliquer l'onglet actif le replie au lieu d'être un no-op.
  const [deptsExpanded, setDeptsExpanded] = useState(true);
  const toggleMinistry = (id: string) => setExpandedMinistries(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Auto-déplier le ministère du département sélectionné — UNIQUEMENT quand la sélection
  // change. Dépendre du tableau `departments` re-déclenchait l'effet à chaque render
  // (useDepartments() = load() → nouvelle identité), ré-ouvrant le ministère juste après
  // chaque tentative de repli : impossible d'enrouler la Rétention (dept auto-sélectionné
  // Intégration/ADN lui appartient). La string dérivée est stable, l'effet ne joue qu'au
  // vrai changement.
  const selectedMinistryId = selectedDept ? departments.find(d => d.id === selectedDept)?.ministryId : undefined;
  useEffect(() => {
    if (selectedMinistryId) setExpandedMinistries(prev => (prev.has(selectedMinistryId) ? prev : new Set(prev).add(selectedMinistryId)));
  }, [selectedMinistryId]);

  // On desktop, we might want to respect the collapsed state from the parent.
  // On mobile, 'collapsed' actually means 'drawer is closed' and !collapsed means 'drawer is open'.
  // Let's ensure the drawer is closed by default on mobile.
  useEffect(() => {
    if (isDesktop) {
      setCollapsed(false);
    } else {
      setCollapsed(true);
    }
  }, [isDesktop, setCollapsed]);

  const mainMenuItems = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
    { id: 'members', label: 'Membres', icon: Users },
    { id: 'ministeres', label: 'Ministères', icon: Grid },
    { id: 'departments', label: 'Départements', icon: LayoutList },
    { id: 'integration', label: 'Intégration', icon: UserPlus },
    { id: 'adn', label: 'ADN', icon: UserCheck },
    { id: 'bloombus', label: 'Bloom Bus', icon: Bus },
    { id: 'events', label: 'Cultes & Événements', icon: Calendar },
    { id: 'rapportculte', label: 'Rapport de culte', icon: ClipboardList },
    { id: 'denombrement', label: 'Dénombrement', icon: DoorOpen },
    { id: 'projects', label: 'Projets', icon: Activity },
    { id: 'cursus', label: 'Cursus Pastoral', icon: Heart },
    { id: 'formations', label: 'Formations', icon: GraduationCap },
    { id: 'programs', label: 'Parcours Baptême', icon: Droplet },
    { id: 'reports', label: 'Rapports', icon: FileText }
  ];

  const adminMenuItems = [
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'accounts', label: 'Comptes & Admins', icon: UserCog },
    { id: 'settings', label: 'Configuration système', icon: Settings },
    { id: 'formbuilder', label: 'Constructeur de form', icon: FormInput },
    { id: 'audit', label: 'Audit', icon: History }
  ];

  // P1.1 — la visibilité des onglets est pilotée par la PermissionMatrix (capability view_<tab>).
  // Règle partagée avec App.tsx (src/data/permissions.ts) pour ne jamais diverger.
  const canView = (tabId: string, role: string = simulatedRole) => canViewTab(permissionMatrix, tabId, role);
  // Tout profil non-STAFF ayant accès à l'onglet Départements est cantonné à son seul
  // département (DepartmentsView l'y fait atterrir directement via ROLE_HOME_DEPT/defaultDept) :
  // pas de liste déroulante pour en parcourir d'autres. Seul le STAFF garde la navigation complète.
  const isDeptScoped = ['Responsable', 'Adjoint', 'Coach', 'Leader', 'ADN', 'Intégration', 'GDC', 'Portier'].includes(simulatedRole);

  // Coach/Leader : l'onglet Membres ne sert que si le Responsable leur a réellement
  // assigné des membres (Member.mentorId, la "ligne de mentorat" posée depuis la fiche
  // 360 — cf. DepartmentsView onglet Suivi). Le partage de département seul (scope.ts
  // DEPARTMENT_PROXY_ROLES) est trop large ici : deux membres du même département sans
  // lien de mentorat ne sont pas "attribués".
  const hasAssignedMembers = !!operator && members.some(m => m.mentorId === operator.id);
  const filteredMainItems = mainMenuItems.filter(item => {
    if (item.id === 'members' && ['Coach', 'Leader'].includes(simulatedRole)) {
      return canView(item.id) && hasAssignedMembers;
    }
    // Responsable/Adjoint gèrent leurs membres depuis l'onglet Membres de leur
    // page Département, pas depuis un onglet Membres global.
    if (item.id === 'members' && MEMBERS_TAB_DEPT_ONLY_ROLES.includes(simulatedRole)) {
      return false;
    }
    return canView(item.id);
  });
  const filteredAdminItems = adminMenuItems.filter(item => canView(item.id));

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white">
      {/* Brand Header */}
      <div>
        <div className={`p-6 flex items-center justify-between border-b border-bc-border bg-bc-canvas`}>
          {(!collapsed || !isDesktop) && (
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="font-ui font-extrabold text-xl tracking-tight text-bc-text">
                  Bloom<span className={'text-bc-text'}>Core</span>
                </h1>
                <p className="text-[10px] uppercase font-bold tracking-wider text-bc-text-secondary">
                  Community Platform
                </p>
              </div>
            </div>
          )}
          {(collapsed && isDesktop) && (
            <div className="mx-auto w-8 h-8 rounded-full bg-bc-green flex items-center justify-center">
              <span className="text-white font-ui font-bold text-sm">B</span>
            </div>
          )}
          {!isDesktop && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-2 text-bc-text-secondary hover:text-bc-text active-scale"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-1 mb-6">
          {filteredMainItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const inactiveClass = 'text-bc-text-secondary hover:bg-bc-canvas hover:text-bc-text';
            
            return (
              <React.Fragment key={item.id}>
              <button
                id={`sidebar-tab-${item.id}`}
                onClick={() => {
                  if (item.id === 'departments' && isActive) {
                    setDeptsExpanded(prev => !prev);
                  } else {
                    setActiveTab(item.id);
                    if (item.id === 'departments') setDeptsExpanded(true);
                  }
                  if (!isDesktop && item.id !== 'departments') setCollapsed(true);
                }}
                className={`w-full flex items-center min-h-[48px] space-x-3.5 px-3 py-2.5 rounded-full text-left transition-colors relative group ${
                  isActive ? 'text-bc-green font-bold' : inactiveClass
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBg"
                    className={`absolute inset-0 rounded-full -z-10 bg-bc-green/10 border-l-4 border-bc-green`}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon size={20} className={`z-10 transition-transform ${isActive ? 'text-bc-green' : 'text-bc-text-secondary group-hover:text-bc-text'}`} />
                {(!collapsed || !isDesktop) && (
                  <span className="font-ui text-sm tracking-wide z-10 flex-1 text-left">
                    {item.label}
                  </span>
                )}
                {item.id === 'departments' && isActive && !isDeptScoped && (!collapsed || !isDesktop) && (
                  <ChevronDown
                    size={16}
                    className={`z-10 transition-transform text-bc-green ${deptsExpanded ? '' : '-rotate-90'}`}
                  />
                )}
              </button>

              {/* Accordéon Ministère → Départements (sous l'item Départements) — masqué pour un
                  Responsable/Adjoint, cantonné à son seul département (pas de liste à parcourir). */}
              {item.id === 'departments' && isActive && deptsExpanded && !isDeptScoped && (!collapsed || !isDesktop) && (
                <div className="mt-1 mb-2 ml-4 pl-3 border-l-2 border-bc-border space-y-0.5">
                  {/* Créer un département — en tête de la liste des ministères, pasteurs & admins seulement */}
                  {['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'].includes(simulatedRole) && onCreateDepartment && (
                    <button
                      id="sidebar-create-dept-btn"
                      onClick={onCreateDepartment}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-bc-green hover:bg-bc-green/10 transition-colors"
                    >
                      <Plus size={12} className="shrink-0" /> Créer un département
                    </button>
                  )}
                  {ministries.map(ministry => {
                    const mDepts = departments.filter(d => d.ministryId === ministry.id);
                    if (mDepts.length === 0) return null;
                    const expanded = expandedMinistries.has(ministry.id);
                    return (
                      <div key={ministry.id}>
                        <button
                          onClick={() => toggleMinistry(ministry.id)}
                          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-bold text-bc-text-secondary hover:bg-bc-canvas transition-colors"
                        >
                          <span className="truncate">{ministry.name}</span>
                          <ChevronDown size={12} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="ml-2 space-y-0.5">
                            {mDepts.map(d => (
                              <button
                                key={d.id}
                                onClick={() => { setSelectedDept(d.id); setActiveTab('departments'); if (!isDesktop) setCollapsed(true); }}
                                className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-colors truncate ${
                                  selectedDept === d.id ? 'bg-bc-green text-white font-bold' : 'text-bc-text-secondary hover:bg-bc-canvas'
                                }`}
                              >
                                {d.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>

        {filteredAdminItems.length > 0 && (
          <>
            {(!collapsed || !isDesktop) && (
              <div className="px-4 mb-2 text-[10px] font-bold text-bc-text-secondary uppercase tracking-wider">
                Administration
              </div>
            )}
            <div className="space-y-1">
              {filteredAdminItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const inactiveClass = 'text-bc-text-secondary hover:bg-bc-canvas hover:text-bc-text';
                
                return (
                  <button
                    key={item.id}
                    id={`sidebar-tab-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (!isDesktop) setCollapsed(true);
                    }}
                    className={`w-full flex items-center min-h-[48px] space-x-3.5 px-3 py-2.5 rounded-full text-left transition-colors relative group ${
                      isActive ? 'text-bc-green font-bold' : inactiveClass
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTabBg"
                        className={`absolute inset-0 rounded-full -z-10 bg-bc-green/10 border-l-4 border-bc-green`}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <Icon size={20} className={`z-10 transition-transform ${isActive ? 'text-bc-green' : 'text-bc-text-secondary group-hover:text-bc-text'}`} />
                    {(!collapsed || !isDesktop) && (
                      <span className="font-ui text-sm tracking-wide z-10">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {!isDesktop && !collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-bc-text/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setCollapsed(true)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isDesktop ? (collapsed ? 80 : 256) : 280,
          x: isDesktop ? 0 : (collapsed ? -280 : 0)
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className={`print:hidden fixed lg:relative z-50 h-dvh bg-white border-r border-bc-border overflow-hidden`}
      >
        {sidebarContent}
      </motion.aside>
    </>
  );
}
