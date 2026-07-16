import React, { useState } from 'react';
import { ClipboardList, CheckCircle, AlertTriangle, Trash2, Plus } from 'lucide-react';
import { Member, Report, Event, Branch } from '../types';
import { toast } from './ui/Toast';

// Onglet « Rapport de culte » (FORMULAIRES.md §12, modèle onglet Intégration) : la GDC remplit
// le rapport complet en 4 blocs pour chaque culte/événement déroulé. Même schéma de `content`
// que le rapport auto-généré à la clôture (EventsView) → upsert par eventId, jamais de doublon.
interface CulteReportViewProps {
  events: Event[];
  reports: Report[];
  operator?: Member;
  activeBranch: Branch;
  simulatedRole: string;
  onAddReport: (r: Report) => void;
  onUpdateReport: (r: Report) => void;
}

type Incident = { type: string; departments: string; details: string };

const RATING_LABELS = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Très bon'];

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold text-bc-text-secondary mb-1.5">{label}</label>
      <div className="flex gap-1.5">
        {RATING_LABELS.map((l, i) => (
          <button
            key={l}
            type="button"
            title={l}
            onClick={() => onChange(i + 1)}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold border transition-colors active-scale ${value === i + 1 ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CulteReportView({ events, reports, operator, activeBranch, simulatedRole, onAddReport, onUpdateReport }: CulteReportViewProps) {
  const todayIso = new Date().toISOString().split('T')[0];
  // Les cultes/événements déroulés de la branche, les plus récents d'abord.
  const pastEvents = events
    .filter((e) => (activeBranch === 'global' || e.branch === activeBranch) && e.date <= todayIso)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));

  const reportOf = (eventId: string) => reports.find((r) => r.reportType === 'rapport_culte' && r.eventId === eventId);
  const statusOf = (eventId: string): 'complet' | 'comptages' | 'a_remplir' => {
    const r = reportOf(eventId);
    if (!r) return 'a_remplir';
    return r.content?.predicateur || r.content?.theme ? 'complet' : 'comptages';
  };

  const [selectedEventId, setSelectedEventId] = useState('');
  // Bloc 1 — infos générales
  const [predicateur, setPredicateur] = useState('');
  const [theme, setTheme] = useState('');
  const [officiant, setOfficiant] = useState('');
  // Bloc 2 — atmosphère spirituelle (1-5)
  const [ferveur, setFerveur] = useState(3);
  const [louange, setLouange] = useState(3);
  const [appel, setAppel] = useState(3);
  // Bloc 3 — incidents
  const [incidents, setIncidents] = useState<Incident[]>([]);
  // Bloc 4 — fréquentation
  const [adultes, setAdultes] = useState(0);
  const [enfants, setEnfants] = useState(0);
  const [decisions, setDecisions] = useState(0);
  // Remarques libres
  const [notes, setNotes] = useState('');

  const selectEvent = (id: string) => {
    setSelectedEventId(id);
    const c = reportOf(id)?.content ?? {};
    setPredicateur(c.predicateur ?? '');
    setTheme(c.theme ?? '');
    setOfficiant(c.officiant ?? '');
    setFerveur(Number(c.ferveur ?? 3));
    setLouange(Number(c.louange ?? 3));
    setAppel(Number(c.deroulementAppel ?? 3));
    setIncidents(Array.isArray(c.incidents) ? c.incidents : []);
    setAdultes(Number(c.attendeesAdultes ?? 0));
    setEnfants(Number(c.attendeesEnfants ?? 0));
    setDecisions(Number(c.nouvellesDecisions ?? 0));
    setNotes(c.notes ?? '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !operator) return;
    const ev = events.find((x) => x.id === selectedEventId);
    const content = {
      predicateur, theme, officiant,
      ferveur, louange, deroulementAppel: appel,
      incidents,
      attendeesAdultes: adultes, attendeesEnfants: enfants, nouvellesDecisions: decisions,
      notes,
    };
    const existing = reportOf(selectedEventId);
    if (existing) {
      onUpdateReport({ ...existing, content: { ...existing.content, ...content } });
    } else {
      onAddReport({
        id: `rep_culte_${Date.now()}`,
        authorId: operator.id,
        authorName: `${operator.firstName} ${operator.lastName}`,
        authorRole: simulatedRole,
        targetBranch: ev?.branch ?? (activeBranch === 'global' ? 'church' : activeBranch),
        date: ev?.date ?? todayIso,
        reportType: 'rapport_culte',
        eventId: selectedEventId,
        departmentId: 'dept_gdc',
        confidential: false,
        content,
      });
    }
    toast.success('Rapport de culte enregistré.');
  };

  const inputCls = 'w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green';
  const labelCls = 'block text-xs font-bold text-bc-text mb-1';
  const STATUS_UI = {
    complet: { label: 'Complet', cls: 'bg-bc-green/10 text-bc-green border-bc-green/30' },
    comptages: { label: 'Comptages seuls', cls: 'bg-bc-warning/10 text-bc-text border-bc-warning/30' },
    a_remplir: { label: 'À remplir', cls: 'bg-bc-canvas text-bc-text-secondary border-bc-border' },
  } as const;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm">
        <h2 className="text-lg font-ui font-extrabold text-bc-text flex items-center gap-2 mb-1">
          <ClipboardList size={20} /> Rapport de culte — Gestion des Cultes
        </h2>
        <p className="text-xs text-bc-text-secondary">Rapport complet en 4 blocs par culte/événement (§12) : infos générales, atmosphère spirituelle, incidents, fréquentation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Liste des cultes/événements déroulés */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-5 space-y-2 max-h-[70vh] overflow-y-auto">
          {pastEvents.length === 0 ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-8">Aucun culte/événement déroulé.</p>
          ) : (
            pastEvents.map((ev) => {
              const st = STATUS_UI[statusOf(ev.id)];
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => selectEvent(ev.id)}
                  className={`w-full text-left p-3 rounded-2xl border transition-colors flex items-center justify-between gap-2 ${selectedEventId === ev.id ? 'border-bc-green bg-bc-canvas' : 'border-bc-border bg-white hover:bg-bc-canvas/40'}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-bc-text truncate">{ev.title}</p>
                    <p className="text-[10px] text-bc-text-secondary">
                      {new Date(`${ev.date}T12:00:00`).toLocaleDateString('fr-FR')}{ev.time ? ` · ${ev.time}` : ''}{ev.endTime ? `–${ev.endTime}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Formulaire 4 blocs */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-7">
          {!selectedEventId ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-16">Sélectionnez un culte/événement à gauche pour remplir son rapport.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Infos générales */}
              <div>
                <h4 className="text-xs font-ui font-bold text-bc-text uppercase tracking-wider mb-2">1. Informations générales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Prédicateur</label>
                    <input id="culte-predicateur" type="text" value={predicateur} onChange={(e) => setPredicateur(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Thème</label>
                    <input id="culte-theme" type="text" value={theme} onChange={(e) => setTheme(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Officiant</label>
                    <input id="culte-officiant" type="text" value={officiant} onChange={(e) => setOfficiant(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* 2. Atmosphère spirituelle */}
              <div>
                <h4 className="text-xs font-ui font-bold text-bc-text uppercase tracking-wider mb-2">2. Atmosphère spirituelle (1–5)</h4>
                <div className="space-y-3">
                  <RatingRow label="Ferveur" value={ferveur} onChange={setFerveur} />
                  <RatingRow label="Louange" value={louange} onChange={setLouange} />
                  <RatingRow label="Déroulement de l'appel" value={appel} onChange={setAppel} />
                </div>
              </div>

              {/* 3. Journal des incidents */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-ui font-bold text-bc-text uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle size={12} /> 3. Journal des incidents
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIncidents((prev) => [...prev, { type: '', departments: '', details: '' }])}
                    className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border border-bc-border hover:bg-bc-canvas active-scale"
                  >
                    <Plus size={10} /> Ajouter
                  </button>
                </div>
                {incidents.length === 0 ? (
                  <p className="text-[10px] text-bc-text-secondary italic">Aucun incident signalé.</p>
                ) : (
                  <div className="space-y-2">
                    {incidents.map((inc, i) => (
                      <div key={i} className="grid grid-cols-[1fr,1fr,2fr,auto] gap-2 items-center">
                        <input type="text" placeholder="Type" value={inc.type}
                          onChange={(e) => setIncidents((prev) => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className={inputCls} />
                        <input type="text" placeholder="Département(s)" value={inc.departments}
                          onChange={(e) => setIncidents((prev) => prev.map((x, j) => j === i ? { ...x, departments: e.target.value } : x))} className={inputCls} />
                        <input type="text" placeholder="Détails" value={inc.details}
                          onChange={(e) => setIncidents((prev) => prev.map((x, j) => j === i ? { ...x, details: e.target.value } : x))} className={inputCls} />
                        <button type="button" onClick={() => setIncidents((prev) => prev.filter((_, j) => j !== i))} className="p-1.5 text-bc-danger active-scale">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Stats de fréquentation */}
              <div>
                <h4 className="text-xs font-ui font-bold text-bc-text uppercase tracking-wider mb-2">4. Fréquentation</h4>
                <div className="grid grid-cols-3 gap-3">
                  {([['Adultes émargés', adultes, setAdultes], ['Enfants', enfants, setEnfants], ['Nouvelles décisions', decisions, setDecisions]] as const).map(([label, value, setter]) => (
                    <div key={label}>
                      <label className={labelCls}>{label}</label>
                      <input type="number" min={0} value={value} onChange={(e) => setter(Math.max(0, Number(e.target.value)))} className={inputCls} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Remarques libres</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 border border-bc-border rounded-xl text-xs font-medium h-20 bg-bc-canvas focus:bg-white focus:outline-none resize-none" />
              </div>

              <div className="flex justify-end pt-3 border-t border-bc-border">
                <button id="culte-report-submit" type="submit" className="flex items-center gap-2 px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active-scale">
                  <CheckCircle size={13} /> {reportOf(selectedEventId) ? 'Mettre à jour le rapport' : 'Enregistrer le rapport'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
