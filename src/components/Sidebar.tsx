import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Branch } from '../types';
import {
  LayoutDashboard, Users, Grid, LayoutList, Bus, Calendar,
  Activity, Heart, GraduationCap, Shield, UserCog, Settings,
  FormInput, History, User, X, UserPlus
} from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useDepartments } from '../data';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activeBranch: Branch;
  simulatedRole: string;
  setSimulatedRole: (role: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedDept: string | null;
  setSelectedDept: (id: string | null) => void;
}

export default function Sidebar({
  collapsed,
  setCollapsed,
  activeBranch,
  simulatedRole,
  setSimulatedRole,
  activeTab,
  setActiveTab,
  selectedDept,
  setSelectedDept
}: SidebarProps) {
  const isChurch = activeBranch === 'church';
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const departments = useDepartments();

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
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader', 'Membre', 'ADN', 'Portier', 'GDC', 'Intégration', 'Nouveau'] },
    { id: 'members', label: 'Membres', icon: Users, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader'] },
    { id: 'ministeres', label: 'Ministères', icon: Grid, roles: ['Pasteur', 'Ministre'] },
    { id: 'departments', label: 'Départements', icon: LayoutList, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader', 'ADN', 'Portier', 'GDC', 'Intégration'] },
    { id: 'integration', label: 'Intégration', icon: UserPlus, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader', 'ADN', 'Portier', 'GDC', 'Intégration'] },
    { id: 'bloombus', label: 'Bloom Bus', icon: Bus, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Capitaine'] },
    { id: 'events', label: 'Cultes & Événements', icon: Calendar, roles: ['Pasteur', 'Ministre', 'Responsable', 'ADN', 'Portier', 'GDC'] },
    { id: 'projects', label: 'Projets', icon: Activity, roles: ['Pasteur', 'Ministre', 'Responsable'] },
    { id: 'cursus', label: 'Cursus Pastoral', icon: Heart, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader', 'ADN', 'Portier', 'GDC', 'Intégration', 'Membre'] },
    { id: 'formations', label: 'Formations', icon: GraduationCap, roles: ['Pasteur', 'Ministre', 'Responsable', 'Coach', 'Membre', 'ADN', 'Portier', 'GDC', 'Intégration'] }
  ];

  const adminMenuItems = [
    { id: 'permissions', label: 'Permissions', icon: Shield, roles: ['Pasteur Principal', 'Admin'] },
    { id: 'accounts', label: 'Comptes & Admins', icon: UserCog, roles: ['Admin'] },
    { id: 'settings', label: 'Configuration système', icon: Settings, roles: ['Admin'] },
    { id: 'formbuilder', label: 'Constructeur de form', icon: FormInput, roles: ['Admin'] },
    { id: 'audit', label: 'Audit', icon: History, roles: ['Pasteur Principal', 'Admin'] }
  ];

  const filterItems = (items: any[]) => items.filter(item => {
    if (['Super Admin', 'Admin', 'Pasteur Principal'].includes(simulatedRole)) return true;
    if (simulatedRole === 'Pasteur') return item.roles.includes('Pasteur');
    return item.roles.includes(simulatedRole);
  });
  
  const filteredMainItems = filterItems(mainMenuItems);
  const filteredAdminItems = filterItems(adminMenuItems);

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
              className="p-2 text-bc-text-secondary hover:text-bc-text"
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
                  setActiveTab(item.id);
                  if (!isDesktop && item.id !== 'departments') setCollapsed(true);
                }}
                className={`w-full flex items-center min-h-[48px] space-x-3.5 px-3 py-2.5 rounded-full text-left transition-colors relative group ${
                  isActive ? 'text-bc-text font-bold' : inactiveClass
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBg"
                    className={`absolute inset-0 rounded-full -z-10 bg-bc-canvas`}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon size={20} className={`z-10 transition-transform ${isActive ? 'text-bc-text' : 'text-slate-400 group-hover:text-slate-700'}`} />
                {(!collapsed || !isDesktop) && (
                  <span className="font-ui text-sm tracking-wide z-10">
                    {item.label}
                  </span>
                )}
              </button>

              {/* Liste plate des départements (sous l'item Départements) */}
              {item.id === 'departments' && isActive && (!collapsed || !isDesktop) && (
                <div className="mt-1 mb-2 ml-4 pl-3 border-l-2 border-bc-border space-y-0.5">
                  {departments.map(d => (
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
              </React.Fragment>
            );
          })}
        </div>

        {filteredAdminItems.length > 0 && (
          <>
            {(!collapsed || !isDesktop) && (
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                      isActive ? 'text-bc-text font-bold' : inactiveClass
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTabBg"
                        className={`absolute inset-0 rounded-full -z-10 bg-bc-canvas`}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <Icon size={20} className={`z-10 transition-transform ${isActive ? 'text-bc-text' : 'text-slate-400 group-hover:text-slate-700'}`} />
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

      <div className="p-4 border-t border-bc-border bg-bc-canvas">
        {(!collapsed || !isDesktop) ? (
          <div>
            <label className="text-[10px] font-bold text-bc-text-secondary uppercase tracking-wider mb-2 block">
              Simuler profil (Test)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Responsable', 'Coach', 'Leader', 'Capitaine', 'ADN', 'Portier', 'GDC', 'Intégration', 'Membre', 'Nouveau'].map(role => (
                <button
                  key={role}
                  onClick={() => {
                    setSimulatedRole(role);
                    const isAllowed = (role === 'Super Admin' || role === 'Admin') 
                      ? true 
                      : [...mainMenuItems, ...adminMenuItems].find(i => i.id === activeTab)?.roles.includes(role);
                      
                    if (!isAllowed) {
                      setActiveTab('dashboard');
                    }
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-full text-[11px] font-ui font-medium border text-center transition-colors active-scale ease-out-spring ${
                    simulatedRole === role
                      ? 'bg-bc-green text-white border-bc-green'
                      : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className={`p-2 rounded-full text-white bg-bc-green min-h-[44px] min-w-[44px] flex items-center justify-center`} title={`Profil actuel : ${simulatedRole}`}>
              <User size={20} />
            </div>
          </div>
        )}
      </div>
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
        className={`fixed lg:relative z-50 h-dvh bg-white border-r border-bc-border overflow-hidden`}
      >
        {sidebarContent}
      </motion.aside>
    </>
  );
}
