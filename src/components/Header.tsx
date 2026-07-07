import React, { useState } from 'react';
import { Bell, Search, RefreshCw, Layers, CheckCircle, ShieldAlert, Heart, Calendar, Menu, X } from 'lucide-react';
import { Branch, AppNotification, Member } from '../types';
import { ThemeToggle } from './ui/theme-toggle';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeBranch: Branch;
  setActiveBranch: (branch: Branch) => void;
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead?: () => void;
  simulatedRole: string;
  operator?: Member;
  setSidebarCollapsed?: (collapsed: boolean) => void;
  // P5.1 — accent configuré par branche (Settings), pilote la pastille active du switcher.
  churchAccent?: string;
  lightAccent?: string;
}

export default function Header({
  activeTab,
  setActiveTab,
  activeBranch,
  setActiveBranch,
  notifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  simulatedRole,
  operator,
  setSidebarCollapsed,
  churchAccent = 'cerulean',
  lightAccent = 'orange',
}: HeaderProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | AppNotification['type']>('all');
  const [showAllNotifModal, setShowAllNotifModal] = useState(false);
  const [isSweepActive, setIsSweepActive] = useState(false);
  
  const unreadNotifs = notifications.filter(n => !n.read);
  const isChurch = activeBranch === 'church';
  const operatorInitials = operator ? `${operator.firstName[0]}${operator.lastName[0]}` : 'AG';
  const operatorName = operator ? `${operator.firstName} ${operator.lastName}` : 'Affeny Grah';

  const renderNotifList = (list: AppNotification[]) => list.length === 0 ? (
    <div className="p-6 text-center text-xs text-bc-text-secondary">Aucune notification.</div>
  ) : list.map((notif) => (
    <div
      key={notif.id}
      className={`p-3 text-xs transition-colors hover:bg-bc-canvas/30 ${notif.read ? 'opacity-60' : 'bg-bc-green/5'}`}
    >
      <div className="flex items-start justify-between">
        <span className="font-semibold text-bc-text tracking-tight">{notif.title}</span>
        {!notif.read && (
          <button onClick={() => markNotificationAsRead(notif.id)} className="text-[10px] text-bc-text hover:underline font-bold">
            Lu
          </button>
        )}
      </div>
      <p className="text-[11px] text-bc-text-secondary mt-1">{notif.message}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] text-bc-text-secondary font-mono">{notif.timestamp.split('T')[0]}</span>
        <Badge tone={notif.type === 'alert' ? 'purple' : 'gold'} className="uppercase py-0.2">
          {notif.type}
        </Badge>
      </div>
    </div>
  ));

  const handleBranchSwitch = (branch: Branch) => {
    if (branch === activeBranch) return;
    setIsSweepActive(true);
    setActiveBranch(branch);
    setTimeout(() => {
      setIsSweepActive(false);
    }, 600);
  };

  return (
    <header className="print:hidden bg-white border-b border-bc-border sticky top-0 z-20 h-16 px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 w-full md:w-auto">
        {setSidebarCollapsed && (
          <button 
            className="lg:hidden p-2 -ml-2 text-bc-text hover:bg-bc-canvas rounded-full"
            onClick={() => setSidebarCollapsed(false)}
          >
            <Menu size={20} />
          </button>
        )}
        
        {/* Search Bar (WowDash Style) */}
        <div className="hidden md:flex items-center w-96 bg-bc-canvas rounded-full px-4 py-2">
          <Search size={18} className="text-bc-text-secondary" />
          <input 
            type="text" 
            placeholder="Search anything..." 
            className="bg-transparent border-none focus:ring-0 focus:outline-none w-full ml-3 text-sm text-bc-text placeholder-bc-text-secondary"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        {/* Mobile menu toggle could go here, omitting for now to keep clean */}
        
        {/* Branch Switcher (Multi-branch commuter) */}
        <div
          data-branch={activeBranch}
          className={`bg-bc-canvas rounded-full p-1 flex items-center space-x-1 relative color-sweep ${isSweepActive ? 'color-sweep-active' : ''} ${
            activeBranch === 'church' ? 'active-glow-church' : activeBranch === 'light' ? 'active-glow-light' : ''
          }`}
        >
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
                className={`absolute inset-0 rounded-full bg-bc-${churchAccent} -z-10`}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'church' ? 'bg-white' : 'bg-bc-text-secondary'}`} />
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
                className={`absolute inset-0 rounded-full bg-bc-${lightAccent} -z-10`}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'light' ? 'bg-white' : 'bg-bc-text-secondary'}`} />
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
            <span className={`w-2 h-2 rounded-full ${activeBranch === 'global' ? 'bg-white' : 'bg-bc-text-secondary'}`} />
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
            className="p-2.5 rounded-full hover:bg-bc-canvas transition-colors relative cursor-pointer"
          >
            <Bell size={20} className="text-bc-text-secondary" />
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
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-bc-purple/10 text-bc-purple font-bold px-2 py-0.5 rounded-full">
                      {unreadNotifs.length} Actives
                    </span>
                    {markAllNotificationsAsRead && unreadNotifs.length > 0 && (
                      <button
                        onClick={markAllNotificationsAsRead}
                        className="text-[10px] text-bc-text-secondary hover:text-bc-text font-bold underline"
                      >
                        Tout marquer lu
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-4 py-2 border-b border-bc-border flex gap-1.5 overflow-x-auto">
                  {(['all', 'info', 'success', 'warning', 'alert'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setNotifFilter(f)}
                      className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap transition-colors ${
                        notifFilter === f ? 'bg-bc-text text-white' : 'bg-bc-canvas text-bc-text-secondary hover:bg-bc-border'
                      }`}
                    >
                      {f === 'all' ? 'Tout' : f}
                    </button>
                  ))}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-bc-border">
                  {renderNotifList(notifications.filter(n => notifFilter === 'all' || n.type === notifFilter).slice(0, 8))}
                </div>
                <button
                  onClick={() => { setShowAllNotifModal(true); setShowNotifDropdown(false); }}
                  className="w-full px-4 py-2.5 text-[11px] font-bold text-bc-text-secondary hover:text-bc-text hover:bg-bc-canvas/40 border-t border-bc-border transition-colors"
                >
                  Voir toutes les notifications ({notifications.length})
                </button>
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
            <Avatar
              src={operator?.avatarUrl}
              initials={operatorInitials}
              className="w-10 h-10 text-xs bg-bc-canvas text-bc-text-secondary hover:bg-bc-border transition-colors"
            />
            <div className="hidden sm:block">
              <h4 className="text-sm font-ui font-bold text-bc-text leading-tight">{operatorName}</h4>
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
              transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
              className="w-[200%] h-full absolute top-0 left-0 bg-gradient-to-r from-transparent via-[color:var(--accent-1)]/35 to-transparent"
            />
            <motion.div
              initial={{ x: '-130%' }}
              animate={{ x: '70%' }}
              transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
              className="w-[200%] h-full absolute top-0 left-0 bg-gradient-to-r from-transparent via-[color:var(--accent-2)]/25 to-transparent"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toutes les notifications */}
      {showAllNotifModal && (
        <div className="fixed inset-0 bg-bc-text/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAllNotifModal(false)}>
          <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-bc-border">
              <h3 className="text-base font-ui font-bold text-bc-text">Toutes les notifications</h3>
              <button onClick={() => setShowAllNotifModal(false)}><X size={18} className="text-bc-text-secondary" /></button>
            </div>
            <div className="px-4 py-2 border-b border-bc-border flex gap-1.5 overflow-x-auto shrink-0">
              {(['all', 'info', 'success', 'warning', 'alert'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setNotifFilter(f)}
                  className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap transition-colors ${
                    notifFilter === f ? 'bg-bc-text text-white' : 'bg-bc-canvas text-bc-text-secondary hover:bg-bc-border'
                  }`}
                >
                  {f === 'all' ? 'Tout' : f}
                </button>
              ))}
              {markAllNotificationsAsRead && unreadNotifs.length > 0 && (
                <button onClick={markAllNotificationsAsRead} className="ml-auto text-[10px] font-bold text-bc-text-secondary hover:text-bc-text whitespace-nowrap">
                  Tout marquer lu
                </button>
              )}
            </div>
            <div className="overflow-y-auto divide-y divide-bc-border">
              {renderNotifList(notifications.filter(n => notifFilter === 'all' || n.type === notifFilter))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
