import React, { useState } from 'react';
import { Bell, Search, RefreshCw, Layers, CheckCircle, ShieldAlert, Heart, Calendar, Menu } from 'lucide-react';
import { Branch, AppNotification } from '../types';
import { ThemeToggle } from './ui/theme-toggle';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeBranch: Branch;
  setActiveBranch: (branch: Branch) => void;
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => void;
  simulatedRole: string;
  setSidebarCollapsed?: (collapsed: boolean) => void;
}

export default function Header({
  activeTab,
  setActiveTab,
  activeBranch,
  setActiveBranch,
  notifications,
  markNotificationAsRead,
  simulatedRole,
  setSidebarCollapsed
}: HeaderProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [isSweepActive, setIsSweepActive] = useState(false);
  
  const unreadNotifs = notifications.filter(n => !n.read);
  const isChurch = activeBranch === 'church';

  const handleBranchSwitch = (branch: Branch) => {
    if (branch === activeBranch) return;
    setIsSweepActive(true);
    setActiveBranch(branch);
    setTimeout(() => {
      setIsSweepActive(false);
    }, 600);
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Tableau de Bord & Radar de Santé';
      case 'members': return 'Annuaire & Fiches Membres';
      case 'integration': return 'Suivi des Nouveaux & ADN';
      case 'bloombus': return 'Réseau Territorial Bloom Bus';
      case 'events': return 'Planification des Cultes & Comptages';
      case 'reports': return 'Rapports & Synthèses d\'Événement';
      case 'programs': return 'Parcours de Baptême & Classes';
      case 'formations': return 'Académie Vases d\'Honneur';
      case 'governance': return 'Gouvernance & Matrice Dynamique';
      case 'audit': return 'Historique des Actions (Audit)';
      default: return 'BloomCore Portal';
    }
  };

  return (
    <header className="bg-white border-b border-bc-border sticky top-0 z-20 h-16 px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 w-full md:w-auto">
        {setSidebarCollapsed && (
          <button 
            className="lg:hidden p-2 -ml-2 text-bc-text hover:bg-slate-100 rounded-full"
            onClick={() => setSidebarCollapsed(false)}
          >
            <Menu size={20} />
          </button>
        )}
        
        {/* Search Bar (WowDash Style) */}
        <div className="hidden md:flex items-center w-96 bg-slate-100 rounded-full px-4 py-2">
          <Search size={18} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search anything..." 
            className="bg-transparent border-none focus:ring-0 focus:outline-none w-full ml-3 text-sm text-slate-700 placeholder-slate-400" 
          />
        </div>
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        {/* Mobile menu toggle could go here, omitting for now to keep clean */}
        
        {/* Branch Switcher (Multi-branch commuter) */}
        <div className="bg-slate-100 rounded-full p-1 flex items-center space-x-1 relative">
          <button
            id="branch-switch-church-btn"
            onClick={() => handleBranchSwitch('church')}
            className={`px-3 py-1.5 rounded-full text-xs font-ui font-bold tracking-wide transition-colors active-scale ease-out-spring flex items-center space-x-1.5 relative z-10 ${
              activeBranch === 'church' 
                ? 'text-white' 
                : 'text-bc-text-secondary hover:text-bc-text'
            }`}
          >
            {activeBranch === 'church' && (
              <motion.div
                layoutId="activeBranchIndicator"
                className="absolute inset-0 rounded-full bg-bc-green -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'church' ? 'bg-white' : 'bg-slate-400'}`} />
            <span>Bloom Church</span>
          </button>
          <button
            id="branch-switch-light-btn"
            onClick={() => handleBranchSwitch('light')}
            className={`px-3 py-1.5 rounded-full text-xs font-ui font-bold tracking-wide transition-colors active-scale ease-out-spring flex items-center space-x-1.5 relative z-10 ${
              activeBranch === 'light' 
                ? 'text-white' 
                : 'text-bc-text-secondary hover:text-bc-text'
            }`}
          >
            {activeBranch === 'light' && (
              <motion.div
                layoutId="activeBranchIndicator"
                className="absolute inset-0 rounded-full bg-bc-green -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'light' ? 'bg-white' : 'bg-slate-400'}`} />
            <span>Bloom Light</span>
          </button>
          <button
            id="branch-switch-global-btn"
            onClick={() => handleBranchSwitch('global')}
            className={`px-3 py-1.5 rounded-full text-xs font-ui font-bold tracking-wide transition-colors active-scale ease-out-spring flex items-center space-x-1.5 relative z-10 ${
              activeBranch === 'global' 
                ? 'text-white' 
                : 'text-bc-text-secondary hover:text-bc-text'
            }`}
          >
            {activeBranch === 'global' && (
              <motion.div
                layoutId="activeBranchIndicator"
                className="absolute inset-0 rounded-full bg-bc-green -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'global' ? 'bg-white' : 'bg-slate-400'}`} />
            <span>Global</span>
          </button>
        </div>

        {/* Theme Toggle */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>

        {/* Notifications Center */}
        <div className="relative">
          <button
            id="header-notification-bell-btn"
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            className="p-2.5 rounded-full hover:bg-slate-100 transition-colors relative cursor-pointer"
          >
            <Bell size={20} className="text-slate-600" />
            {unreadNotifs.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-bc-purple text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadNotifs.length}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          <AnimatePresence>
            {showNotifDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-3 w-80 bg-white border border-bc-border rounded-[2rem] shadow-xl z-50 overflow-hidden origin-top-right"
              >
                <div className="px-4 py-3 border-b border-bc-border flex justify-between items-center bg-bc-canvas/40">
                  <span className="text-xs font-ui font-bold text-bc-text">Notifications & Alertes</span>
                  <span className="text-[10px] bg-bc-purple/10 text-bc-purple font-bold px-2 py-0.5 rounded-full">
                    {unreadNotifs.length} Actives
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-bc-border">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-bc-text-secondary">
                      Aucune notification active.
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div 
                        key={notif.id} 
                        className={`p-3 text-xs transition-colors hover:bg-bc-canvas/30 ${notif.read ? 'opacity-60' : 'bg-bc-green/5'}`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-semibold text-bc-text tracking-tight">{notif.title}</span>
                          {!notif.read && (
                            <button 
                              onClick={() => markNotificationAsRead(notif.id)}
                              className="text-[10px] text-bc-text hover:underline font-bold"
                            >
                              Lu
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-bc-text-secondary mt-1">{notif.message}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-bc-warmgrey font-mono">{notif.timestamp.split('T')[0]}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                            notif.type === 'alert' ? 'bg-bc-purple/10 text-bc-purple' :
                            notif.type === 'warning' ? 'bg-bc-green/10 text-bc-text' :
                            'bg-bc-green/10 text-bc-text'
                          }`}>
                            {notif.type}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Operator Profile */}
        <div className="flex items-center gap-3 pl-4 border-l border-bc-border relative">
          {/* Avatar → directly opens Mon Profil (préférences/logout live there) */}
          <button
            className="flex items-center gap-3 text-left focus:outline-none"
            onClick={() => setActiveTab('profile')}
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden hover:bg-slate-200 transition-colors">
              <span className="font-ui font-bold text-slate-600">AG</span>
            </div>
            <div className="hidden sm:block">
              <h4 className="text-sm font-ui font-bold text-slate-800 leading-tight">Affeny Grah</h4>
              <p className="text-xs text-bc-text-secondary">{simulatedRole}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Color Sweep Backdrop */}
      <AnimatePresence>
        {isSweepActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
          >
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className={`w-[200%] h-full absolute top-0 left-0 ${
                isChurch ? 'bg-gradient-to-r from-transparent via-bc-cerulean/30 to-transparent' : 'bg-gradient-to-r from-transparent via-bc-orange/30 to-transparent'
              }`} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
