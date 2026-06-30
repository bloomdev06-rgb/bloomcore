import React from 'react';
import { Branch } from '../types';
import { Settings, Bell, Clock, Globe } from 'lucide-react';

interface SettingsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

export default function SettingsView({ activeBranch, simulatedRole }: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <Settings size={28} className={'text-bc-text'} />
            Configuration Système
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Paramètres globaux, alertes et seuils configurables.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Bell size={20} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text">Notifications & Alertes</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Alerte Intégration - Étape 1 (Réception)</label>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue={3} className="w-16 p-2 border border-bc-border rounded-lg text-sm text-center" />
                <span className="text-sm text-bc-text-secondary">jours</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Alerte envoyée au département d'intégration si non réceptionné.</p>
            </div>
            
            <div className="pt-2 border-t border-bc-border">
              <label className="text-xs font-bold text-slate-700 block mb-1">Alerte Intégration - Étape 2 (Au rouge)</label>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue={7} className="w-16 p-2 border border-bc-border rounded-lg text-sm text-center" />
                <span className="text-sm text-bc-text-secondary">jours</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Le membre passe au rouge, escalade au Ministre.</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Clock size={20} className="text-bc-text" />
            <h3 className="font-ui font-bold text-bc-text">Seuils Analytiques</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Définition "Membre Actif"</label>
              <select className="w-full p-2 border border-bc-border rounded-lg text-sm">
                <option value="1">A servi au cours du dernier mois (≤ 1 mois)</option>
                <option value="3">A servi au cours des 3 derniers mois</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
