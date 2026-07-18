import React, { useState } from 'react';
import { Department, DepartmentType, SpecialFunction } from '../types';
import { Modal } from './ui/Modal';

// Fichier séparé (pas un export de DepartmentsView) : monté depuis App via la sidebar,
// alors que DepartmentsView est lazy-loadé — l'importer de là tirerait tout son chunk.
export const SPECIAL_LABEL: Record<SpecialFunction, string> = {
  adn: 'ADN', portiers: 'Portiers', integration: 'Intégration',
  bloom_bus: 'Bloom Bus', gestion_cultes: 'Gestion des Cultes', parcours_etapes: 'Parcours à étapes',
};

export default function CreateDepartmentModal({
  ministries,
  onClose,
  onCreate,
}: {
  ministries: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (d: Department) => void;
}) {
  const [name, setName] = useState('');
  const [ministryId, setMinistryId] = useState(ministries[0]?.id ?? '');
  const [type, setType] = useState<DepartmentType>('normal');
  const [special, setSpecial] = useState<SpecialFunction | ''>('');

  const submit = () => {
    if (!name.trim() || !ministryId) return;
    onCreate({
      id: `dept_${Date.now()}`,
      name: name.trim(),
      ministryId,
      type,
      description: '',
      specialFunction: type === 'special' && special ? special : undefined,
    });
  };

  return (
    <Modal open={true} onClose={onClose} title="Créer un département" maxWidth="max-w-md">
        <div className="space-y-3">
          <input id="create-dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du département" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
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
              {(['adn', 'portiers', 'integration', 'bloom_bus', 'gestion_cultes', 'parcours_etapes'] as SpecialFunction[]).map((f) => (
                <option key={f} value={f}>{SPECIAL_LABEL[f]}</option>
              ))}
            </select>
          )}
        </div>
        <button id="create-dept-submit" onClick={submit} disabled={!name.trim()} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40 active-scale">
          Créer le département
        </button>
    </Modal>
  );
}
