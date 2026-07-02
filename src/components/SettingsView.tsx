import React, { useState, useEffect } from 'react';
import { Branch } from '../types';
import { load, save } from '../data';
import { Settings, Bell, Clock, Globe, Palette, Check, Smartphone, Mail, MessageSquare, Phone } from 'lucide-react';

interface SettingsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

type Channels = { app: boolean; email: boolean; sms: boolean; whatsapp: boolean };
interface Trigger { id: string; label: string; delayDays: number; channels: Channels }
interface AppSettings {
  branches: { church: { enabled: boolean; accent: string }; light: { enabled: boolean; accent: string } };
  triggers: Trigger[];
  timezone: string;
  language: string;
  periods: { activeMemberMonths: number; weekStart: string; fiscalStart: string };
}

const DEFAULT_SETTINGS: AppSettings = {
  branches: {
    church: { enabled: true, accent: 'green' },
    light: { enabled: true, accent: 'orange' },
  },
  triggers: [
    { id: 'integ1', label: 'Intégration — Étape 1 (Réception)', delayDays: 3, channels: { app: true, email: true, sms: false, whatsapp: false } },
    { id: 'integ2', label: 'Intégration — Étape 2 (Au rouge)', delayDays: 7, channels: { app: true, email: true, sms: true, whatsapp: false } },
    { id: 'birthday', label: 'Anniversaire d\'un membre', delayDays: 0, channels: { app: true, email: false, sms: false, whatsapp: true } },
    { id: 'absence', label: 'Absence culte prolongée', delayDays: 14, channels: { app: true, email: false, sms: true, whatsapp: false } },
  ],
  timezone: 'Africa/Abidjan',
  language: 'fr',
  periods: { activeMemberMonths: 1, weekStart: 'Lundi', fiscalStart: 'Janvier' },
};

const ACCENTS: { key: string; label: string; className: string }[] = [
  { key: 'green', label: 'Vert', className: 'bg-bc-green' },
  { key: 'orange', label: 'Orange', className: 'bg-bc-orange' },
  { key: 'purple', label: 'Violet', className: 'bg-bc-purple' },
  { key: 'cerulean', label: 'Céruléen', className: 'bg-bc-cerulean' },
];
const CHANNELS: { key: keyof Channels; label: string; icon: any }[] = [
  { key: 'app', label: 'App', icon: Smartphone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', icon: Phone },
];
const TIMEZONES = ['Africa/Abidjan', 'Africa/Lagos', 'Africa/Kinshasa', 'Europe/Paris', 'America/New_York', 'UTC'];

export default function SettingsView({ activeBranch, simulatedRole }: SettingsViewProps) {
  const canEdit = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);
  const [settings, setSettings] = useState<AppSettings>(() => load('bc_settings', DEFAULT_SETTINGS));
  useEffect(() => { save('bc_settings', settings); }, [settings]);

  const update = (patch: Partial<AppSettings>) => setSettings(prev => ({ ...prev, ...patch }));
  const updateTrigger = (id: string, patch: Partial<Trigger>) =>
    setSettings(prev => ({ ...prev, triggers: prev.triggers.map(t => (t.id === id ? { ...t, ...patch } : t)) }));
  const toggleChannel = (id: string, ch: keyof Channels) =>
    setSettings(prev => ({ ...prev, triggers: prev.triggers.map(t => (t.id === id ? { ...t, channels: { ...t.channels, [ch]: !t.channels[ch] } } : t)) }));

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
                  className={`w-11 h-6 rounded-full p-1 transition-colors disabled:opacity-50 ${settings.branches[b].enabled ? 'bg-bc-green' : 'bg-slate-300'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${settings.branches[b].enabled ? 'translate-x-5' : ''}`} />
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
                    className={`w-7 h-7 rounded-full ${a.className} flex items-center justify-center ring-2 ring-offset-2 transition-all disabled:opacity-50 ${settings.branches[b].accent === a.key ? 'ring-bc-text' : 'ring-transparent'}`}
                  >
                    {settings.branches[b].accent === a.key && <Check size={13} className="text-white" />}
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
                      className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors disabled:opacity-50 ${on ? 'bg-bc-green/10 border-bc-green/30 text-bc-text' : 'bg-slate-50 border-bc-border text-slate-400'}`}
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Fuseau horaire</label>
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Langue de l'interface</label>
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Définition "Membre Actif"</label>
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
                <label className="text-xs font-bold text-slate-700 block mb-1">Début de semaine</label>
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
                <label className="text-xs font-bold text-slate-700 block mb-1">Début d'exercice</label>
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
