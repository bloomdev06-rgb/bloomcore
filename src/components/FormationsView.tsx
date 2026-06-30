import React, { useState } from 'react';
import { 
  GraduationCap, 
  Award, 
  ExternalLink, 
  Sliders, 
  Code, 
  Send, 
  CheckCircle,
  HelpCircle,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Member, Branch } from '../types';

interface FormationsViewProps {
  members: Member[];
  activeBranch: Branch;
  simulatedRole: string;
}

export default function FormationsView({
  members,
  activeBranch,
  simulatedRole
}: FormationsViewProps) {
  const [webhookUrl, setWebhookUrl] = useState('https://bloom-school.api/v1/sync-formation');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const isChurch = activeBranch === 'church';

  // Academic static paths simulation
  const academies = [
    { title: "Fondements de la foi (Eden 0)", enrolled: 12, certified: 45 },
    { title: "Classes de Maturité (Vases d'Honneur)", enrolled: 8, certified: 32 },
    { title: "Cursus du Ministre Appelé", enrolled: 3, certified: 14 }
  ];

  const handleSimulateWebhook = () => {
    setSyncStatus('loading');
    setTimeout(() => {
      setSyncStatus('success');
      setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Académie Bloom & Intégrations Vases d'Honneur
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gérez les classes de maturité, suivez les progrès académiques des serviteurs et raccordez l'école externe.
          </p>
        </div>

        <div className="flex gap-2">
          <span className="text-[10px] bg-bc-cerulean/10 text-bc-cerulean border border-bc-cerulean/20 px-3 py-1 rounded-full font-bold">
            Classe active : Eden 0
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* VH Academies overview - 7 cols */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-7 space-y-4">
          <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary">
            📚 Classes de l'Académie gérées en interne
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {academies.map((ac, idx) => (
              <div key={idx} className="border border-bc-border rounded-full p-4 bg-bc-canvas/20 hover:bg-bc-canvas/40 transition-colors text-center">
                <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 ${'bg-slate-100 text-bc-text'}`}>
                  <GraduationCap size={20} />
                </div>
                <h5 className="font-ui font-bold text-xs text-bc-text line-clamp-1">{ac.title}</h5>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
                  <div className="bg-white p-1.5 rounded-full border border-bc-border">
                    <span className="text-[14px] font-ui font-black block text-bc-text">{ac.enrolled}</span>
                    <span className="text-[8px] text-bc-text-secondary font-medium uppercase">Inscrits</span>
                  </div>
                  <div className="bg-white p-1.5 rounded-full border border-bc-border">
                    <span className="text-[14px] font-ui font-black block text-bc-anis">{ac.certified}</span>
                    <span className="text-[8px] text-bc-text-secondary font-medium uppercase">Certifiés</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-bc-green/5 border border-bc-green/20 rounded-[2rem]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text block mb-1">Règle de promotion</span>
            <p className="text-[10px] text-bc-text-secondary leading-relaxed font-serif">
              Les certifications obtenues dans l'académie permettent la promotion manuelle des Stagiaires vers le statut de <span className="font-bold text-bc-text">Boss</span> ou de <span className="font-bold text-bc-text">Leader</span> par le corps pastoral d'Abidjan.
            </p>
          </div>
        </div>

        {/* Outer School Webhook Contract - 5 cols */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary">
                  🔌 Raccordement École Externe Bloom
                </h4>
                <p className="text-[10px] text-bc-text-secondary mt-1">
                  Contrat d'intégration pour la phase 2 d'Abidjan (découplage).
                </p>
              </div>
              <Code size={16} className="text-bc-cerulean" />
            </div>

            {/* Simulated Webhook Config Panel */}
            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-[10px] font-bold text-bc-text mb-1">Endpoint API entrant sécurisé</label>
                <input
                  id="formation-webhook-url"
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-2.5 py-1.5 text-xs font-mono bg-bc-canvas/40"
                />
              </div>

              <div className="bg-bc-canvas p-3 rounded-full border border-bc-border font-mono text-[9px] text-bc-text-secondary">
                <span className="font-bold text-bc-text block mb-1">POST /api/webhook/school-sync</span>
                {`{
  "memberPhone": "+2250707...",
  "classCompleted": "Maturite_VH_Niveau1",
  "score": 85,
  "certificateIssued": true
}`}
              </div>
            </div>
          </div>

          {/* Test connection trigger */}
          <div className="pt-4 mt-4 border-t border-bc-border">
            <button
              id="formation-test-sync-btn"
              onClick={handleSimulateWebhook}
              disabled={syncStatus === 'loading'}
              className={`w-full px-4 py-2 rounded-full font-ui font-bold text-xs text-white shadow-sm flex items-center justify-center space-x-2 cursor-pointer ${
                syncStatus === 'success' ? 'bg-bc-anis' : 'bg-bc-green'
              }`}
            >
              {syncStatus === 'loading' && <RefreshCw size={14} className="animate-spin mr-1" />}
              {syncStatus === 'success' && <CheckCircle size={14} />}
              <span>
                {syncStatus === 'loading' ? 'Synchronisation...' : syncStatus === 'success' ? 'Synchronisation validée (200 OK)' : 'Simuler Webhook d\'école externe'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
