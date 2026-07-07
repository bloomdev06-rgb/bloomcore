import React from 'react';
import { Branch, AppSettings, NotifChannels, NotifTrigger } from '../types';
import { Settings, Bell, Clock, Globe, Palette, Check, Smartphone, Mail, MessageSquare, Phone } from 'lucide-react';

interface SettingsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
}

// P5.4 — les 6 couleurs de marque réelles (index.css), pas les 4 précédentes
// (dont "vert" qui est la couleur de chrome de l'app, pas un accent de branche).
const ACCENTS: { key: string; label: string; className: string }[] = [
  { key: 'cerulean', label: 'Céruléen', className: 'bg-bc-cerulean' },
  { key: 'orange', label: 'Orange', className: 'bg-bc-orange' },
  { key: 'fushia', label: 'Fushia', className: 'bg-bc-fushia' },
  { key: 'turquoise', label: 'Turquoise', className: 'bg-bc-turquoise' },
  { key: 'anis', label: 'Anis', className: 'bg-bc-anis' },
  { key: 'purple', label: 'Violet', className: 'bg-bc-purple' },
];
const CHANNELS: { key: keyof NotifChannels; label: string; icon: any }[] = [
  { key: 'app', label: 'App', icon: Smartphone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', icon: Phone },
];
const TIMEZONES = ['Africa/Abidjan', 'Africa/Lagos', 'Africa/Kinshasa', 'Europe/Paris', 'America/New_York', 'UTC'];

export default function SettingsView({ activeBranch, simulatedRole, settings, onUpdateSettings }: SettingsViewProps) {
  // §11 — accès à l'onglet déjà restreint à Super Admin/Admin/Pasteur Principal (view_settings) ;
  // 'Pasteur' seul n'atteint jamais cet écran, donc pas de rôle mort dans cette liste.
  const canEdit = ['Admin', 'Super Admin', 'Pasteur Principal'].includes(simulatedRole);

  const update = (patch: Partial<AppSettings>) => onUpdateSettings({ ...settings, ...patch });
  const updateTrigger = (id: string, patch: Partial<NotifTrigger>) =>
    onUpdateSettings({ ...settings, triggers: settings.triggers.map(t => (t.id === id ? { ...t, ...patch } : t)) });
  const toggleChannel = (id: string, ch: keyof NotifChannels) =>
    onUpdateSettings({ ...settings, triggers: settings.triggers.map(t => (t.id === id ? { ...t, channels: { ...t.channels, [ch]: !t.channels[ch] } } : t)) });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <Settings size={28} className={'text-bc-text'} />
            Configuration Système
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Paramètres globaux, alertes et seuils configurables. {canEdit ? 'Enregistré automatiquement.' : 'Lecture seule (droits insuffisants).'}
          </p>
        </div>
      </div>

      {/* Branches & Thèmes */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Palette size={20} className="text-bc-text" />
          <h3 className="font-ui font-bold text-bc-text">Branches & Thèmes</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['church', 'light'] as const).map(b => (
            <div key={b} className="border border-bc-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-bc-text">{b === 'church' ? 'Bloom Church' : 'Bloom Light'}</span>
                <button
                  disabled={!canEdit}
                  onClick={() => update({ branches: { ...settings.branches, [b]: { ...settings.branches[b], enabled: !settings.branches[b].enabled } } })}
                  role="switch"
                  aria-checked={settings.branches[b].enabled}
                  aria-label={`Activer ${b === 'church' ? 'Bloom Church' : 'Bloom Light'}`}
                  // P5.5 — p-3 -m-3 étend la cible tactile à 48px sans agrandir le switch visuel
                  className="p-3 -m-3 rounded-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-green focus-visible:ring-offset-2 active-scale"
                >
                  <span className={`block w-11 h-6 rounded-full p-1 transition-colors ${settings.branches[b].enabled ? 'bg-bc-green' : 'bg-bc-border'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${settings.branches[b].enabled ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-wide text-bc-text-secondary font-bold mb-2">Couleur d'accent</p>
              <div className="flex gap-2">
                {ACCENTS.map(a => (
                  <button
                    key={a.key}
                    disabled={!canEdit}
                    onClick={() => update({ branches: { ...settings.branches, [b]: { ...settings.branches[b], accent: a.key } } })}
                    title={a.label}
                    aria-label={a.label}
                    aria-pressed={settings.branches[b].accent === a.key}
                    className="p-2.5 -m-2.5 rounded-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-green focus-visible:ring-offset-2 active-scale"
                  >
                    <span className={`w-7 h-7 rounded-full ${a.className} flex items-center justify-center ring-2 ring-offset-2 transition-all ${settings.branches[b].accent === a.key ? 'ring-bc-text' : 'ring-transparent'}`}>
                      {settings.branches[b].accent === a.key && <Check size={13} className="text-white" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Déclencheurs de notifications + canaux */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Bell size={20} className="text-bc-text" />
          <h3 className="font-ui font-bold text-bc-text">Déclencheurs de notifications & Canaux</h3>
        </div>
        <div className="space-y-3">
          {settings.triggers.map(t => (
            <div key={t.id} className="border border-bc-border rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-bc-text">{t.label}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-bc-text-secondary font-bold uppercase">Délai</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={t.delayDays}
                    onChange={e => updateTrigger(t.id, { delayDays: Math.max(0, Number(e.target.value)) })}
                    className="w-14 p-1.5 border border-bc-border rounded-lg text-xs text-center disabled:opacity-50"
                  />
                  <span className="text-xs text-bc-text-secondary">jours</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(({ key, label, icon: Icon }) => {
                  const on = t.channels[key];
                  return (
                    <button
                      key={key}
                      disabled={!canEdit}
                      onClick={() => toggleChannel(t.id, key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors disabled:opacity-50 active-scale ${on ? 'bg-bc-green/10 border-bc-green/30 text-bc-text' : 'bg-bc-canvas border-bc-border text-bc-text-secondary'}`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fuseau & Langue */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Globe size={20} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text">Fuseau horaire & Langue</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-bc-text-secondary block mb-1">Fuseau horaire</label>
              <select
                disabled={!canEdit}
                value={settings.timezone}
                onChange={e => update({ timezone: e.target.value })}
                className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white disabled:opacity-50"
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-bc-text-secondary block mb-1">Langue de l'interface</label>
              <select
                disabled={!canEdit}
                value={settings.language}
                onChange={e => update({ language: e.target.value })}
                className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white disabled:opacity-50"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Périodes */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Clock size={20} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text">Périodes & Seuils</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-bc-text-secondary block mb-1">Définition "Membre Actif"</label>
              <select
                disabled={!canEdit}
                value={settings.periods.activeMemberMonths}
                onChange={e => update({ periods: { ...settings.periods, activeMemberMonths: Number(e.target.value) } })}
                className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white disabled:opacity-50"
              >
                <option value={1}>A servi au cours du dernier mois (≤ 1 mois)</option>
                <option value={3}>A servi au cours des 3 derniers mois</option>
                <option value={6}>A servi au cours des 6 derniers mois</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-bc-text-secondary block mb-1">Début de semaine</label>
                <select
                  disabled={!canEdit}
                  value={settings.periods.weekStart}
                  onChange={e => update({ periods: { ...settings.periods, weekStart: e.target.value } })}
                  className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white disabled:opacity-50"
                >
                  <option>Lundi</option>
                  <option>Dimanche</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-bc-text-secondary block mb-1">Début d'exercice</label>
                <select
                  disabled={!canEdit}
                  value={settings.periods.fiscalStart}
                  onChange={e => update({ periods: { ...settings.periods, fiscalStart: e.target.value } })}
                  className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white disabled:opacity-50"
                >
                  {['Janvier', 'Avril', 'Juillet', 'Septembre', 'Octobre'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
