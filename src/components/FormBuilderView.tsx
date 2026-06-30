import React from 'react';
import { Branch } from '../types';
import { FormInput, FileEdit, Plus } from 'lucide-react';

interface FormBuilderViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

export default function FormBuilderView({ activeBranch, simulatedRole }: FormBuilderViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <FormInput size={28} className={'text-bc-text'} />
            Constructeur de Formulaires
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Modifier les schémas par défaut et les formulaires des départements spéciaux.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-ui font-bold text-bc-text">Formulaires Actifs</h3>
          <button className="px-4 py-2 bg-bc-green text-white rounded-full text-xs font-bold">
            <Plus size={16} className="inline mr-1" /> Nouveau Schéma
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: '1. Formulaire Nouveau', scope: 'ADN', fields: 8 },
            { name: '2. Formulaire Membre', scope: 'Responsable', fields: 12 },
            { name: '3. Rapport de service', scope: 'Standard', fields: 3 },
            { name: '4. Rapport RSA', scope: 'Standard', fields: 3 },
            { name: '5. Rapport d\'activité', scope: 'Responsable', fields: 3 },
            { name: '6. Rapport de suivi coach', scope: 'Coach / Leader', fields: 4 },
            { name: '7. Rapport d\'observation', scope: 'Responsable / Ministre', fields: 4 },
            { name: '8. Rapport Bloom Bus (Santé)', scope: 'Capitaine / Leader', fields: 6 },
            { name: '9. Rapport Bloom Bus (Activité)', scope: 'Capitaine', fields: 6 },
            { name: '10. Rapport ADN (Comptage)', scope: 'ADN', fields: 5 },
            { name: '11. Rapport Portiers (Présences)', scope: 'Portiers', fields: 4 },
            { name: '12. Rapport de culte (GDC)', scope: 'Gestion Cultes', fields: 5 },
            { name: '13. Rapport pastoral', scope: 'Cursus Pastoral', fields: 5 },
          ].map((form, idx) => (
            <div key={idx} className="border border-bc-border p-4 rounded-2xl flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h4 className="font-bold text-sm text-bc-text line-clamp-1">{form.name}</h4>
                <p className="text-[10px] uppercase font-bold text-bc-text-secondary mt-2 mb-1 bg-bc-canvas inline-block px-2 py-1 rounded">{form.scope}</p>
                <p className="text-xs text-bc-text-secondary mt-1">{form.fields} champs définis (Schéma Standard)</p>
              </div>
              <button className="mt-4 w-full py-2.5 bg-bc-canvas border border-bc-border text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 flex justify-center items-center gap-2 transition-colors">
                <FileEdit size={14} /> Configurer
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
