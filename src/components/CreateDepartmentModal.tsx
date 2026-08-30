import React, { useState } from 'react';
import { Department, DepartmentType, SpecialFunction } from '../types';
import { buildDepartmentsForScope } from '../data/departmentFamily';
import { Modal } from './ui/Modal';

// Fichier séparé (pas un export de DepartmentsView) : monté depuis App via la sidebar,
// alors que DepartmentsView est lazy-loadé — l'importer de là tirerait tout son chunk.
export const SPECIAL_LABEL: Record<SpecialFunction, string> = {
  adn: 'ADN', portiers: 'Portiers', integration: 'Intégration',
  bloom_bus: 'Département Bloom Bus', gestion_cultes: 'Gestion des Cultes', parcours_etapes: 'Parcours à étapes', bapteme: 'Parcours Baptême',
};

type Scope = 'church' | 'light' | 'both';

export default function CreateDepartmentModal({
  ministries,
  onClose,
  onCreate,
}: {
  ministries: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (departments: Department[]) => void;
}) {
  const [name, setName] = useState('');
  const [nameLight, setNameLight] = useState('');
  const [sameName, setSameName] = useState(true);
  const [scope, setScope] = useState<Scope>('both');
  const [ministryId, setMinistryId] = useState(ministries[0]?.id ?? '');
  const [type, setType] = useState<DepartmentType>('normal');
  const [special, setSpecial] = useState<SpecialFunction | ''>('');

  const nameChurch = name.trim();
  const nameLightFinal = sameName ? nameChurch : nameLight.trim();
  const canSubmit = !!nameChurch && !!ministryId && (scope !== 'both' || sameName || !!nameLightFinal);

  const submit = () => {
    if (!canSubmit) return;
    onCreate(buildDepartmentsForScope(scope, { church: nameChurch, light: nameLightFinal }, {
      ministryId,
      type,
      description: '',
      specialFunction: type === 'special' && special ? special : undefined,
    }));
  };

  return (
    <Modal open={true} onClose={onClose} title="Créer un département" maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">Portée</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
              <option value="both">Les deux branches</option>
              <option value="church">Bloom Church uniquement</option>
              <option value="light">Bloom Light uniquement</option>
            </select>
          </div>

          <input id="create-dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={scope === 'both' ? 'Nom (Bloom Church)' : 'Nom du département'} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />

          {scope === 'both' && (
            <>
              <label className="flex items-center gap-2 text-xs text-bc-text-secondary">
                <input type="checkbox" checked={sameName} onChange={(e) => setSameName(e.target.checked)} />
                Même nom dans les deux branches
              </label>
              {!sameName && (
                <input value={nameLight} onChange={(e) => setNameLight(e.target.value)} placeholder="Nom (Bloom Light)" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
              )}
            </>
          )}

          <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as DepartmentType)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
            <option value="normal">Type : normal</option>
            <option value="special">Type : spécial</option>
          </select>
          {type === 'special' && (
            <select value={special} onChange={(e) => setSpecial(e.target.value as SpecialFunction)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">— Fonction spéciale —</option>
              {(['adn', 'portiers', 'integration', 'bloom_bus', 'gestion_cultes', 'parcours_etapes', 'bapteme'] as SpecialFunction[]).map((f) => (
                <option key={f} value={f}>{SPECIAL_LABEL[f]}</option>
              ))}
            </select>
          )}
        </div>
        <button id="create-dept-submit" onClick={submit} disabled={!canSubmit} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40 active-scale">
          Créer le département
        </button>
    </Modal>
  );
}
