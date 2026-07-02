import React, { useState } from 'react';
import { Branch } from '../types';
import { FormInput, FileEdit, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';

interface FormBuilderViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

type FieldType = 'text' | 'number' | 'choice' | 'scale' | 'checkbox' | 'date';
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'choice', label: 'Choix' },
  { value: 'scale', label: 'Échelle' },
  { value: 'checkbox', label: 'Case à cocher' },
  { value: 'date', label: 'Date' },
];

interface Field { id: string; label: string; type: FieldType; required: boolean; }
interface Step { id: string; label: string; validator: string; }
interface FormDef { id: string; name: string; scope: string; version: number; kind: 'form' | 'steps'; fields: Field[]; steps?: Step[]; }

// ponytail: seeded in-session with representative fields; back the collection with ./data + real
// FormDefinition versions when the backend lands. Editor logic below is the real deliverable.
const genFields = (labels: string[]): Field[] =>
  labels.map((label, i) => ({ id: `f${i}`, label, type: 'text', required: i === 0 }));

const INITIAL_FORMS: FormDef[] = [
  { id: 'fd_nouveau', name: 'Formulaire Nouveau', scope: 'ADN', version: 1, kind: 'form', fields: genFields(['Nom', 'Prénom', 'Téléphone', 'Genre', 'Oui à Jésus']) },
  { id: 'fd_membre', name: 'Formulaire Membre', scope: 'Responsable', version: 2, kind: 'form', fields: genFields(['Nom', 'Prénom', 'Téléphone', 'Email', 'Date de naissance', 'Commune']) },
  { id: 'fd_service', name: 'Rapport de service', scope: 'Standard', version: 1, kind: 'form', fields: genFields(['Serviteurs présents', 'Observation', 'Culte / Événement']) },
  { id: 'fd_rsa', name: 'Rapport RSA', scope: 'Standard', version: 1, kind: 'form', fields: genFields(['Actions confiées', 'Statut', 'Observation']) },
  { id: 'fd_bus_sante', name: 'Rapport Bloom Bus (Santé)', scope: 'Capitaine / Leader', version: 1, kind: 'form', fields: [
    { id: 'f0', label: 'Vie spirituelle', type: 'scale', required: true },
    { id: 'f1', label: 'Vie sociale', type: 'scale', required: true },
    { id: 'f2', label: 'Santé physique', type: 'scale', required: true },
    { id: 'f3', label: 'Situation financière', type: 'scale', required: true },
    { id: 'f4', label: 'Présence au culte', type: 'scale', required: true },
  ] },
  { id: 'fd_adn', name: 'Rapport ADN (Comptage)', scope: 'ADN', version: 1, kind: 'form', fields: [
    { id: 'f0', label: 'Nouveaux (H)', type: 'number', required: true },
    { id: 'f1', label: 'Nouveaux (F)', type: 'number', required: true },
    { id: 'f2', label: 'OJ (H)', type: 'number', required: true },
    { id: 'f3', label: 'OJ (F)', type: 'number', required: true },
  ] },
  { id: 'fd_bapteme', name: 'Parcours Baptême', scope: 'Parcours à étapes', version: 1, kind: 'steps', fields: [], steps: [
    { id: 's0', label: 'Inscription au parcours', validator: 'Responsable' },
    { id: 's1', label: 'Suivi des 3 cours', validator: 'Leader' },
    { id: 's2', label: 'Entretien de baptême', validator: 'Responsable' },
    { id: 's3', label: 'Baptême physique', validator: 'Pasteur' },
  ] },
];

export default function FormBuilderView({ activeBranch, simulatedRole }: FormBuilderViewProps) {
  const [forms, setForms] = useState<FormDef[]>(INITIAL_FORMS);
  const [editId, setEditId] = useState<string | null>(null);
  const editing = forms.find((f) => f.id === editId) ?? null;

  const update = (id: string, patch: Partial<FormDef>) =>
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch, version: f.version + 1 } : f)));

  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  // ---------- Field / Step editor ----------
  if (editing) {
    return (
      <div className="space-y-6">
        <button onClick={() => setEditId(null)} className="flex items-center gap-1.5 text-xs font-bold text-bc-text-secondary hover:text-bc-text">
          <ArrowLeft size={14} /> Retour aux formulaires
        </button>

        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text tracking-tight">{editing.name}</h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">{editing.scope} · version {editing.version}</p>
        </div>

        {editing.kind === 'form' ? (
          <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6 space-y-3">
            <h3 className="font-ui font-bold text-bc-text mb-2">Champs</h3>
            {editing.fields.map((field, i) => (
              <div key={field.id} className="flex flex-wrap items-center gap-2 bg-bc-canvas/40 border border-bc-border rounded-xl p-2">
                <input
                  value={field.label}
                  onChange={(e) => update(editing.id, { fields: editing.fields.map((f) => (f.id === field.id ? { ...f, label: e.target.value } : f)) })}
                  className="flex-1 min-w-[140px] border border-bc-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green"
                />
                <select
                  value={field.type}
                  onChange={(e) => update(editing.id, { fields: editing.fields.map((f) => (f.id === field.id ? { ...f, type: e.target.value as FieldType } : f)) })}
                  className="border border-bc-border rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[10px] font-bold text-bc-text-secondary">
                  <input type="checkbox" checked={field.required} onChange={(e) => update(editing.id, { fields: editing.fields.map((f) => (f.id === field.id ? { ...f, required: e.target.checked } : f)) })} />
                  Requis
                </label>
                <button onClick={() => update(editing.id, { fields: move(editing.fields, i, -1) })} className="p-1 text-bc-text-secondary hover:text-bc-text"><ChevronUp size={14} /></button>
                <button onClick={() => update(editing.id, { fields: move(editing.fields, i, 1) })} className="p-1 text-bc-text-secondary hover:text-bc-text"><ChevronDown size={14} /></button>
                <button onClick={() => update(editing.id, { fields: editing.fields.filter((f) => f.id !== field.id) })} className="p-1 text-bc-text-secondary hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            {editing.fields.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun champ.</p>}
            <button
              onClick={() => update(editing.id, { fields: [...editing.fields, { id: `f${Date.now()}`, label: 'Nouveau champ', type: 'text', required: false }] })}
              className="flex items-center gap-1.5 text-xs font-bold text-bc-green hover:underline mt-2"
            >
              <Plus size={14} /> Ajouter un champ
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6 space-y-3">
            <h3 className="font-ui font-bold text-bc-text mb-2">Étapes du parcours</h3>
            {(editing.steps ?? []).map((step, i) => (
              <div key={step.id} className="flex flex-wrap items-center gap-2 bg-bc-canvas/40 border border-bc-border rounded-xl p-2">
                <span className="text-[10px] font-bold text-bc-text-secondary w-5 text-center">{i + 1}</span>
                <input
                  value={step.label}
                  onChange={(e) => update(editing.id, { steps: (editing.steps ?? []).map((s) => (s.id === step.id ? { ...s, label: e.target.value } : s)) })}
                  className="flex-1 min-w-[160px] border border-bc-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green"
                />
                <select
                  value={step.validator}
                  onChange={(e) => update(editing.id, { steps: (editing.steps ?? []).map((s) => (s.id === step.id ? { ...s, validator: e.target.value } : s)) })}
                  className="border border-bc-border rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  {['Responsable', 'Adjoint', 'Coach', 'Leader', 'Pasteur', 'Ministre'].map((r) => <option key={r} value={r}>Valide : {r}</option>)}
                </select>
                <button onClick={() => update(editing.id, { steps: move(editing.steps ?? [], i, -1) })} className="p-1 text-bc-text-secondary hover:text-bc-text"><ChevronUp size={14} /></button>
                <button onClick={() => update(editing.id, { steps: move(editing.steps ?? [], i, 1) })} className="p-1 text-bc-text-secondary hover:text-bc-text"><ChevronDown size={14} /></button>
                <button onClick={() => update(editing.id, { steps: (editing.steps ?? []).filter((s) => s.id !== step.id) })} className="p-1 text-bc-text-secondary hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <button
              onClick={() => update(editing.id, { steps: [...(editing.steps ?? []), { id: `s${Date.now()}`, label: 'Nouvelle étape', validator: 'Responsable' }] })}
              className="flex items-center gap-1.5 text-xs font-bold text-bc-green hover:underline mt-2"
            >
              <Plus size={14} /> Ajouter une étape
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- List ----------
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <FormInput size={28} className={'text-bc-text'} />
            Constructeur de Formulaires
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Modifier les schémas par défaut, les champs et les étapes des parcours.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-6">
        <h3 className="font-ui font-bold text-bc-text mb-6">Formulaires Actifs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <div key={form.id} className="border border-bc-border p-4 rounded-2xl flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h4 className="font-bold text-sm text-bc-text line-clamp-1">{form.name}</h4>
                <p className="text-[10px] uppercase font-bold text-bc-text-secondary mt-2 mb-1 bg-bc-canvas inline-block px-2 py-1 rounded">{form.scope}</p>
                <p className="text-xs text-bc-text-secondary mt-1">
                  {form.kind === 'steps' ? `${(form.steps ?? []).length} étapes` : `${form.fields.length} champs`} · v{form.version}
                </p>
              </div>
              <button onClick={() => setEditId(form.id)} className="mt-4 w-full py-2.5 bg-bc-canvas border border-bc-border text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 flex justify-center items-center gap-2 transition-colors">
                <FileEdit size={14} /> Configurer
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
