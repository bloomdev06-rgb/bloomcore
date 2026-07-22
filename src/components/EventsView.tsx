import React, { useState } from 'react';
import { 
  Calendar, 
  Plus, 
  CheckCircle, 
  Users, 
  TrendingUp, 
  Heart, 
  X, 
  Sliders, 
  Check,
  AlertCircle,
  ArrowLeft,
  FileText,
  Activity,
  Clock,
  Building2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Modal } from './ui/Modal';
import { Event, EventRecurrence, Branch, Report, Member, FormDef } from '../types';
import { useProjects, useDepartments, load, save } from '../data';
import { eventsOverlap } from '../data/events';
import { reportTypeRail } from '../data/domainColors';
import { toast } from './ui/Toast';

const RATINGS = [
  { v: 1, label: 'Très mal' },
  { v: 2, label: 'Mal' },
  { v: 3, label: 'Moyen' },
  { v: 4, label: 'Bien' },
  { v: 5, label: 'Très bien' },
];
function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-bc-text mb-1.5">{label}</label>
      <div className="grid grid-cols-5 gap-1.5">
        {RATINGS.map(r => (
          <button
            key={r.v}
            type="button"
            onClick={() => onChange(r.v)}
            className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors active:scale-95 ${value === r.v ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const INCIDENT_TYPES = ['Technique', 'Sécurité', 'Organisation', 'Autre'];

interface EventsViewProps {
  events: Event[];
  reports?: Report[];
  onAddEvent: (event: Event) => void;
  onUpdateEvent?: (event: Event) => void;
  onAddReport: (report: Report) => void;
  onUpdateReport?: (report: Report) => void;
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  forms?: FormDef[];
}

// Les types d'événement sont des chaînes libres (Culte, 80/20, Inside, Séminaire…)
// affichées telles quelles — les anciens types internes (dimanche_1er…) ont été purgés
// avec leurs événements au lot 4.
const typeLabel = (t: string) => t;

// Types d'événement par défaut (extensibles par l'utilisateur, persistés dans bc_event_types).
const DEFAULT_EVENT_TYPES = ['Culte', 'Culte spécial', 'Séminaire', 'Retraite', 'Programme spécial'];

const RECURRENCE_OPTIONS: { value: EventRecurrence; label: string }[] = [
  { value: 'none', label: 'Aucune (événement unique)' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'biweekly', label: 'Toutes les 2 semaines' },
  { value: 'monthly', label: 'Chaque mois' },
  { value: 'daily', label: 'Chaque jour' },
];

// Portée / organisateur au niveau église (en plus des départements).
const CHURCH_ORGANIZERS: { value: string; label: string }[] = [
  { value: 'church', label: 'Bloom Church' },
  { value: 'light', label: 'Bloom Light' },
  { value: 'both', label: 'Les 2 églises' },
];

export default function EventsView({
  events,
  reports = [],
  onAddEvent,
  onUpdateEvent,
  onAddReport,
  onUpdateReport,
  activeBranch,
  simulatedRole,
  members = [],
  forms = []
}: EventsViewProps) {
  // P1.4 — labels read live from FormBuilder's fd_adn FormDef, id-matched.
  const adnForm = forms.find((f) => f.id === 'fd_adn');
  const adnLabel = (fieldId: string, fallback: string) =>
    adnForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [presentServiteurs, setPresentServiteurs] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProject, setFilterProject] = useState('all');
  const toggleServiteur = (id: string) => setPresentServiteurs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Types d'événement gérables (Culte, Séminaire… + ajout par l'utilisateur), persistés.
  const [eventTypes, setEventTypes] = useState<string[]>(() => load('bc_event_types', DEFAULT_EVENT_TYPES));

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<string>(() => (load('bc_event_types', DEFAULT_EVENT_TYPES)[0] ?? 'Culte'));
  const [eventDate, setEventDate] = useState('2026-06-28');
  const [eventTime, setEventTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventScope, setEventScope] = useState<'church' | 'light' | 'both'>('church');
  const [eventOrganizer, setEventOrganizer] = useState('');
  const [eventProject, setEventProject] = useState('');
  const [eventRecurrence, setEventRecurrence] = useState<EventRecurrence>('none');

  // Counters State
  const [menPortiers, setMenPortiers] = useState(620);
  const [womenPortiers, setWomenPortiers] = useState(680);
  const [onlinePresence, setOnlinePresence] = useState(0);
  const [newMenADN, setNewMenADN] = useState(15);
  const [newWomenADN, setNewWomenADN] = useState(18);
  const [ojMen, setOjMen] = useState(8);
  const [ojWomen, setOjWomen] = useState(12);
  const [offertory, setOffertory] = useState(350000);

  // P2.6 — Rapport de culte, blocs Infos générales / Atmosphère / Incidents / Stats
  const [predicateur, setPredicateur] = useState('');
  const [theme, setTheme] = useState('');
  const [officiant, setOfficiant] = useState('');
  const [ferveurVal, setFerveurVal] = useState(3);
  const [louangeVal, setLouangeVal] = useState(3);
  const [appelVal, setAppelVal] = useState(3);
  const [incidents, setIncidents] = useState<{ type: string; departments: string; details: string }[]>([]);
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [incidentDept, setIncidentDept] = useState('');
  const [incidentDetails, setIncidentDetails] = useState('');
  const [attendeesEnfants, setAttendeesEnfants] = useState(0);
  const [culteRemarques, setCulteRemarques] = useState('');

  const addIncident = () => {
    if (!incidentDetails.trim()) return;
    setIncidents(prev => [...prev, { type: incidentType, departments: incidentDept.trim(), details: incidentDetails.trim() }]);
    setIncidentDept('');
    setIncidentDetails('');
  };
  const removeIncident = (idx: number) => setIncidents(prev => prev.filter((_, i) => i !== idx));

  const isChurch = activeBranch === 'church';

  // Filter events by branch — a 2-branches event (branch 'global') is visible from either branch.
  const projects = useProjects();
  const departments = useDepartments();
  // Résout l'organisateur (id de département ou mot-clé église) en libellé lisible.
  const organizerLabel = (val?: string) => {
    if (!val) return null;
    const church = CHURCH_ORGANIZERS.find(c => c.value === val);
    if (church) return church.label;
    return departments.find(d => d.id === val)?.name ?? val;
  };
  const branchEvents = events.filter(e => activeBranch === 'global' || e.branch === activeBranch || e.branch === 'global');
  const projectIds = Array.from(new Set(branchEvents.map(e => e.projectId).filter((id): id is string => !!id)));
  const filteredEvents = branchEvents
    .filter(e => filterType === 'all' || e.type === filterType)
    .filter(e => filterProject === 'all' || e.projectId === filterProject);
  const selectedEvent = events.find(e => e.id === selectedEventId);

  // Sunday Stats: attendance per closed event (from Portiers reports), chronological.
  const sundayData = [...branchEvents]
    .filter(e => e.closed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const p = reports.find(r => r.eventId === e.id && r.reportType === 'rapport_portiers');
      return { name: e.date.slice(5), affluence: p ? (p.content.total ?? 0) : 0 };
    });

  // Décalage de date sans dérive de fuseau (arithmétique UTC pure, la date reste 'YYYY-MM-DD').
  const addDays = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };
  const addMonths = (iso: string, months: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
  };
  // Génération anticipée d'occurrences selon la récurrence (une seule action de création, pas
  // de régénération continue → pas de doublons). Horizon volontairement borné.
  const occurrenceDate = (start: string, i: number, rec: EventRecurrence): string =>
    rec === 'daily' ? addDays(start, i)
    : rec === 'weekly' ? addDays(start, i * 7)
    : rec === 'biweekly' ? addDays(start, i * 14)
    : rec === 'monthly' ? addMonths(start, i)
    : start;
  const RECUR_COUNT: Record<EventRecurrence, number> = { none: 1, daily: 14, weekly: 8, biweekly: 6, monthly: 6 };

  // Ajout d'un nouveau type d'événement (persisté dans bc_event_types), puis sélection.
  const handleAddEventType = () => {
    const name = window.prompt("Nom du nouveau type d'événement :")?.trim();
    if (!name || eventTypes.includes(name)) { if (name) setEventType(name); return; }
    const next = [...eventTypes, name];
    setEventTypes(next);
    save('bc_event_types', next);
    setEventType(name);
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle) return;

    const base = {
      title: eventTitle,
      type: eventType,
      time: eventTime || undefined,
      endTime: eventEndTime || undefined,
      branch: eventScope === 'both' ? ('global' as const) : eventScope, // 2 branches → 'global'
      closed: false,
      scope: eventScope,
      organizer: eventOrganizer || undefined,
      projectId: eventProject || undefined,
    };

    const count = RECUR_COUNT[eventRecurrence];
    for (let i = 0; i < count; i++) {
      onAddEvent({
        ...base,
        id: `evt_custom_${Date.now()}_${i}`,
        date: occurrenceDate(eventDate, i, eventRecurrence),
        ...(eventRecurrence !== 'none' ? { recurrence: eventRecurrence } : {}),
      });
    }

    // Chevauchement : un événement PONCTUEL qui empiète sur une occurrence récurrente
    // (même jour/branche, plages horaires qui s'intersectent) annule celle-ci par défaut.
    if (eventRecurrence === 'none' && eventTime) {
      const created = { date: eventDate, time: eventTime, endTime: eventEndTime || undefined, branch: base.branch };
      const clashes = events.filter(ev =>
        !ev.cancelled && !ev.closed && ev.recurrence && ev.recurrence !== 'none' && eventsOverlap(created, ev),
      );
      clashes.forEach(ev => onUpdateEvent?.({ ...ev, cancelled: true }));
      if (clashes.length) toast.info(`${clashes.length} occurrence(s) récurrente(s) annulée(s) sur ce créneau (chevauchement).`);
    }

    setShowAddEventModal(false);
    setEventTitle('');
    setEventTime('');
    setEventEndTime('');
    setEventOrganizer('');
    setEventProject('');
    setEventRecurrence('none');
  };

  const handleSaveCounters = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) return;

    const targetEvent = events.find(ev => ev.id === selectedEventId);
    if (!targetEvent) return;

    // Generate Portiers report
    const portiersReport: Report = {
      id: `rep_portiers_${Date.now()}`,
      authorId: 'mem_4', // Simulated Nathalie Eshun or Portier staff
      authorName: 'Equipe Portiers',
      authorRole: 'Responsable Portiers',
      targetBranch: activeBranch,
      date: new Date().toISOString().split('T')[0],
      reportType: 'rapport_portiers',
      eventId: selectedEventId,
      confidential: false,
      content: {
        men: menPortiers,
        women: womenPortiers,
        total: menPortiers + womenPortiers,
        online: onlinePresence
      }
    };

    // Generate ADN report
    const adnReport: Report = {
      id: `rep_adn_${Date.now()}`,
      authorId: 'mem_3',
      authorName: 'Kady Bamba',
      authorRole: 'Responsable ADN',
      targetBranch: activeBranch,
      date: new Date().toISOString().split('T')[0],
      reportType: 'rapport_adn',
      eventId: selectedEventId,
      confidential: false,
      content: {
        nouveauxH: newMenADN,
        nouveauxF: newWomenADN,
        ojH: ojMen,
        ojF: ojWomen
      }
    };

    // Generate full culte synthesis report
    const culteReport: Report = {
      id: `rep_culte_${Date.now()}`,
      authorId: 'mem_2',
      authorName: 'Jean-Marc Kouamé',
      authorRole: 'Responsable de Gestion des Cultes',
      targetBranch: activeBranch,
      date: new Date().toISOString().split('T')[0],
      reportType: 'rapport_culte',
      eventId: selectedEventId,
      confidential: false,
      content: {
        attendancePortiers: menPortiers + womenPortiers,
        attendanceADN: newMenADN + newWomenADN,
        offertory: offertory,
        // Infos générales
        predicateur,
        theme,
        officiant,
        // Atmosphère spirituelle (1-5)
        ferveur: ferveurVal,
        louange: louangeVal,
        deroulementAppel: appelVal,
        // Journal des incidents
        incidents,
        // Stats de fréquentation
        attendeesAdultes: menPortiers + womenPortiers,
        attendeesEnfants,
        nouvellesDecisions: ojMen + ojWomen,
        // Remarques libres
        notes: culteRemarques || `Comptage validé avec succès par les Portiers et l'ADN. Total de Décideurs OJ : ${ojMen + ojWomen}.`,
        presencesService: presentServiteurs
      }
    };

    // Conciliation avec les onglets Dénombrement / ADN / Rapport de culte : un seul
    // rapport de chaque type par événement (upsert), sinon les stats doublent. Les
    // champs texte déjà remplis (prédicateur, thème…) ne sont pas écrasés par du vide.
    const existingPortiers = (reports ?? []).find(r => r.reportType === 'rapport_portiers' && r.eventId === selectedEventId);
    if (existingPortiers && onUpdateReport) {
      onUpdateReport({ ...existingPortiers, content: { ...existingPortiers.content, ...portiersReport.content } });
    } else {
      onAddReport(portiersReport);
    }
    const existingAdn = (reports ?? []).find(r => r.reportType === 'rapport_adn' && r.eventId === selectedEventId);
    const existingCulte = (reports ?? []).find(r => r.reportType === 'rapport_culte' && r.eventId === selectedEventId);
    if (existingAdn && onUpdateReport) {
      onUpdateReport({ ...existingAdn, content: { ...existingAdn.content, ...adnReport.content } });
    } else {
      onAddReport(adnReport);
    }
    if (existingCulte && onUpdateReport) {
      const nonEmpty = Object.fromEntries(Object.entries(culteReport.content).filter(([, v]) => v !== '' && v !== undefined));
      onUpdateReport({ ...existingCulte, content: { ...existingCulte.content, ...nonEmpty } });
    } else {
      onAddReport(culteReport);
    }

    // Clôture persistée (B1) : muter targetEvent.closed en place ne déclenchait aucun
    // setEvents → au reload l'événement redevenait « En cours » et était re-clôturable,
    // doublant les rapports portiers/ADN/culte et les stats du dimanche.
    onUpdateEvent?.({ ...targetEvent, closed: true });

    // Close counters and alert
    setShowCounterModal(false);
    setPredicateur('');
    setTheme('');
    setOfficiant('');
    setFerveurVal(3);
    setLouangeVal(3);
    setAppelVal(3);
    setIncidents([]);
    setAttendeesEnfants(0);
    setCulteRemarques('');
    setPresentServiteurs([]);
    toast.success('Comptages enregistrés et Culte clôturé avec succès !');
  };

  if (selectedEvent) {
    const evReports = reports.filter(r => r.eventId === selectedEvent.id);
    const portiers = evReports.find(r => r.reportType === 'rapport_portiers');
    const adn = evReports.find(r => r.reportType === 'rapport_adn');
    const affluence = portiers ? (portiers.content.total ?? (portiers.content.men + portiers.content.women)) : 0;
    const nouveaux = adn ? (adn.content.nouveauxH || 0) + (adn.content.nouveauxF || 0) : 0;
    const oj = adn ? (adn.content.ojH || 0) + (adn.content.ojF || 0) : 0;
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex justify-between items-start">
          <div>
            <button 
              onClick={() => setSelectedEventId(null)}
              className="flex items-center text-xs font-bold text-bc-text-secondary hover:text-bc-text transition-colors mb-4"
            >
              <ArrowLeft size={14} className="mr-1" /> Retour à l'agenda
            </button>
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${selectedEvent.closed ? 'bg-bc-canvas text-bc-text-secondary' : 'bg-bc-green text-white'}`}>
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-ui font-extrabold text-bc-text">{selectedEvent.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-bc-text-secondary">
                  <span className="font-mono text-xs">{selectedEvent.date}{selectedEvent.time ? ` · ${selectedEvent.time}` : ''}</span>
                  <span className="w-1 h-1 bg-bc-border rounded-full"></span>
                  <span className="uppercase text-[10px] tracking-wider font-bold">{typeLabel(selectedEvent.type)}</span>
                  <span className="w-1 h-1 bg-bc-border rounded-full"></span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEvent.cancelled ? 'bg-bc-danger/10 text-bc-danger' : selectedEvent.closed ? 'bg-bc-canvas text-bc-text-secondary' : 'bg-bc-success/10 text-bc-success'}`}>
                    {selectedEvent.cancelled ? 'Annulé' : selectedEvent.closed ? 'Clôturé' : 'En cours'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Annulation d'une occurrence : ce jour-là l'événement n'a pas lieu, la série continue. */}
            {!selectedEvent.closed && ['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin', 'GDC'].includes(simulatedRole) && (
              <button
                id="event-cancel-btn"
                onClick={() => onUpdateEvent?.({ ...selectedEvent, cancelled: !selectedEvent.cancelled })}
                className={`px-5 py-2.5 font-bold text-xs rounded-full transition-colors flex items-center gap-2 shadow-sm active:scale-95 ${selectedEvent.cancelled ? 'bg-bc-canvas text-bc-text hover:bg-bc-border/40' : 'bg-white border border-bc-danger/40 text-bc-danger hover:bg-bc-danger/10'}`}
              >
                <X size={14} /> {selectedEvent.cancelled ? "Rétablir l'occurrence" : "Annuler l'occurrence"}
              </button>
            )}
            {!selectedEvent.closed && !selectedEvent.cancelled && ['Pasteur', 'Admin', 'Super Admin', 'ADN', 'Portier', 'GDC'].includes(simulatedRole) && (
              <button
                onClick={() => setShowCounterModal(true)}
                className="px-5 py-2.5 bg-bc-green text-white font-bold text-xs rounded-full hover:bg-bc-text transition-colors flex items-center gap-2 shadow-sm active:scale-95"
              >
                <CheckCircle size={16} /> Clôturer le Culte
              </button>
            )}
          </div>
        </div>

        {selectedEvent.closed ? (
          <div className="space-y-6">
            {/* Organizer */}
            <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm flex items-center gap-3 text-sm">
              <Building2 size={16} className="text-bc-text-secondary" />
              <span className="text-bc-text-secondary">Organisateur :</span>
              <span className="font-bold text-bc-text">
                {organizerLabel(selectedEvent.organizer) || (selectedEvent.scope === 'both' ? 'Événement 2 branches' : 'Événement de branche')}
              </span>
            </div>

            {/* Consolidated stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Affluence (Portiers)" value={affluence} sub={portiers ? `${portiers.content.men} H · ${portiers.content.women} F` : 'aucun rapport'} />
              <StatCard label="Nouveaux (ADN)" value={nouveaux} sub={adn ? `${adn.content.nouveauxH} H · ${adn.content.nouveauxF} F` : 'aucun rapport'} />
              <StatCard label="OJ « Oui à Jésus »" value={oj} sub={adn ? `${adn.content.ojH} H · ${adn.content.ojF} F` : 'aucun rapport'} />
              <StatCard label="Rapports rattachés" value={evReports.length} sub="consolidés" />
            </div>

            {/* Linked reports */}
            <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
              <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2"><FileText size={16} /> Rapports rattachés</h3>
              <div className="space-y-2">
                {evReports.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun rapport rattaché à cet événement.</p>}
                {evReports.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2">
                    <span className="flex items-center gap-2 min-w-0">
                      {/* point de type (Move 3) — couleur par type de rapport, cf. domainColors */}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${reportTypeRail(r.reportType)}`} />
                      <span className="font-bold text-bc-text capitalize truncate">{r.reportType.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="text-bc-text-secondary shrink-0 ml-2">{r.authorName} · {r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-12 rounded-[2rem] border border-bc-border shadow-sm flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-bc-canvas rounded-full flex items-center justify-center mb-6 border border-bc-border">
              <Activity size={32} className="text-bc-text-secondary" />
            </div>
            <h3 className="text-xl font-ui font-bold text-bc-text mb-2">En attente de clôture</h3>
            <p className="text-sm text-bc-text-secondary text-center max-w-md mb-8">
              Une fois l'événement terminé, clôturez le culte pour consolider les comptages physiques (Portiers) et spirituels (ADN).
            </p>
          </div>
        )}

      {/* Saisir Comptages Modal */}
      {showCounterModal && (
        <Modal
          open={showCounterModal}
          onClose={() => setShowCounterModal(false)}
          title="Clôturer : Saisie des Comptages"
          icon={<CheckCircle size={18} className="text-bc-success" />}
          maxWidth="max-w-lg"
        >

            <form onSubmit={handleSaveCounters} className="space-y-4">
              {/* 1. Portiers physical counters */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  <Users size={12} /> 1. Section Portiers (Affluence Physique)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Hommes installés</label>
                    <input
                      type="number"
                      value={menPortiers}
                      onChange={(e) => setMenPortiers(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Femmes installées</label>
                    <input
                      type="number"
                      value={womenPortiers}
                      onChange={(e) => setWomenPortiers(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-bc-text mb-1">Présence en ligne</label>
                  <input
                    type="number"
                    value={onlinePresence}
                    onChange={(e) => setOnlinePresence(parseInt(e.target.value) || 0)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* 1bis. Roster — serviteurs présents */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  <Users size={12} /> Serviteurs présents
                </span>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {members.filter(m => activeBranch === 'global' || m.branch === activeBranch).map(m => (
                    <button type="button" key={m.id} onClick={() => toggleServiteur(m.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border active:scale-95 ${presentServiteurs.includes(m.id) ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text border-bc-border'}`}>
                      {m.firstName} {m.lastName}
                    </button>
                  ))}
                  {members.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun membre disponible.</p>}
                </div>
              </div>

              {/* 2. ADN counters */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  <Heart size={12} /> 2. Section ADN (Nouveaux & OJ)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">{adnLabel('f0', 'Nouveaux (H)')}</label>
                    <input
                      type="number"
                      value={newMenADN}
                      onChange={(e) => setNewMenADN(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">{adnLabel('f1', 'Nouveaux (F)')}</label>
                    <input
                      type="number"
                      value={newWomenADN}
                      onChange={(e) => setNewWomenADN(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">{adnLabel('f2', 'Oui à Jésus (H)')}</label>
                    <input
                      type="number"
                      value={ojMen}
                      onChange={(e) => setOjMen(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">{adnLabel('f3', 'Oui à Jésus (F)')}</label>
                    <input
                      type="number"
                      value={ojWomen}
                      onChange={(e) => setOjWomen(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Offertory & synthesized notes */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  💰 3. Finances & Offrandes (Optionnel)
                </span>
                <div>
                  <label className="block text-[10px] font-bold text-bc-text mb-1">Montant total collecté (FCFA)</label>
                  <input
                    type="number"
                    value={offertory}
                    onChange={(e) => setOffertory(parseInt(e.target.value) || 0)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* 4. Infos générales */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  📋 4. Infos générales
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Prédicateur</label>
                    <input
                      type="text"
                      value={predicateur}
                      onChange={(e) => setPredicateur(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Officiant</label>
                    <input
                      type="text"
                      value={officiant}
                      onChange={(e) => setOfficiant(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-bc-text mb-1">Thème</label>
                  <input
                    type="text"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* 5. Atmosphère spirituelle */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  🙏 5. Atmosphère spirituelle
                </span>
                <RatingRow label="Ferveur" value={ferveurVal} onChange={setFerveurVal} />
                <RatingRow label="Louange" value={louangeVal} onChange={setLouangeVal} />
                <RatingRow label="Déroulement de l'appel" value={appelVal} onChange={setAppelVal} />
              </div>

              {/* 6. Journal des incidents */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  ⚠️ 6. Journal des incidents
                </span>
                <div className="space-y-2">
                  {incidents.map((inc, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white border border-bc-border rounded-xl px-3 py-2 text-xs">
                      <span>
                        <span className="font-bold">{inc.type}</span>
                        {inc.departments && <span className="text-bc-text-secondary"> · {inc.departments}</span>}
                        {' — '}{inc.details}
                      </span>
                      <button type="button" onClick={() => removeIncident(idx)} className="text-bc-text-secondary hover:text-bc-danger active:scale-95"><X size={12} /></button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={incidentType}
                      onChange={(e) => setIncidentType(e.target.value)}
                      className="border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white focus:outline-none"
                    >
                      {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      value={incidentDept}
                      onChange={(e) => setIncidentDept(e.target.value)}
                      placeholder="Département(s) concerné(s)"
                      className="border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={incidentDetails}
                      onChange={(e) => setIncidentDetails(e.target.value)}
                      placeholder="Détails de l'incident…"
                      className="flex-1 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green"
                    />
                    <button type="button" onClick={addIncident} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold active:scale-95"><Plus size={13} /></button>
                  </div>
                </div>
              </div>

              {/* 7. Stats de fréquentation */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  📊 7. Stats de fréquentation
                </span>
                <div>
                  <label className="block text-[10px] font-bold text-bc-text mb-1">Enfants émargés</label>
                  <input
                    type="number"
                    value={attendeesEnfants}
                    onChange={(e) => setAttendeesEnfants(parseInt(e.target.value) || 0)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* 8. Remarques libres */}
              <div>
                <label className="block text-[10px] font-bold text-bc-text mb-1">Remarques libres</label>
                <textarea
                  value={culteRemarques}
                  onChange={(e) => setCulteRemarques(e.target.value)}
                  rows={2}
                  className="w-full border border-bc-border rounded-2xl px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCounterModal(false)}
                  className="px-5 py-2.5 bg-bc-canvas text-bc-text-secondary rounded-full text-xs font-bold hover:bg-bc-border/40 transition-colors active:scale-95"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:bg-bc-text transition-colors active:scale-95"
                >
                  Clôturer le Culte
                </button>
              </div>
            </form>
        </Modal>
      )}

      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Planning Header */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Gestion & Planification des Cultes
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Planifiez de nouveaux événements et consolidez les statistiques de participation.
          </p>
        </div>

        {/* CAHIER_DES_CHARGES.md §7.1 — création réservée au Responsable Gestion des Cultes,
            aux Ministres, aux Pasteurs, ou à un département (Responsable). */}
        {['Pasteur', 'Admin', 'Responsable', 'Super Admin', 'Ministre'].includes(simulatedRole) && (
          <div className="flex gap-2 w-full md:w-auto">
            <button
              id="event-plan-btn"
              onClick={() => setShowAddEventModal(true)}
              className="flex-1 md:flex-none px-5 py-2.5 rounded-full font-ui font-bold text-xs text-white shadow-sm flex items-center justify-center space-x-1.5 transition-transform hover:scale-105 active:scale-95 cursor-pointer bg-bc-green"
            >
              <Plus size={16} />
              <span>Planifier un Culte / Événement</span>
            </button>
          </div>
        )}
      </div>

      {/* Toolbar: filtres + Sunday Stats (vue = calendrier uniquement) */}
      <div className="flex flex-col lg:flex-row gap-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-white border border-bc-border rounded-full px-3 py-1.5 text-xs font-bold text-bc-text-secondary self-start"
        >
          <option value="all">Tous les types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {projectIds.length > 0 && (
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="bg-white border border-bc-border rounded-full px-3 py-1.5 text-xs font-bold text-bc-text-secondary self-start"
          >
            <option value="all">Tous les projets</option>
            {projectIds.map(id => (
              <option key={id} value={id}>{projects.find(p => p.id === id)?.name ?? id}</option>
            ))}
          </select>
        )}
        {sundayData.length > 0 && (
          <div className="flex-1 bg-white border border-bc-border rounded-[1.5rem] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1 px-2 flex items-center gap-1.5"><TrendingUp size={12} /> Sunday Stats · affluence par culte</p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sundayData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="evtAffluence" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--color-bc-text-secondary)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--color-bc-text-secondary)' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="affluence" stroke="var(--accent-1)" strokeWidth={2} fill="url(#evtAffluence)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Vue unique : calendrier */}
      <MonthCalendar events={filteredEvents} onSelect={setSelectedEventId} />

      {/* Plan Event Modal */}
      {showAddEventModal && (
        <Modal
          open={showAddEventModal}
          onClose={() => setShowAddEventModal(false)}
          title="Planifier un Culte ou Rassemblement"
          icon={<Calendar size={18} className="text-bc-text" />}
          maxWidth="max-w-md"
        >

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Titre de l'événement *</label>
                <input
                  id="event-title-input"
                  type="text"
                  required
                  placeholder="ex: Culte de Célébration"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Type d'événement</label>
                <select
                  id="event-type-select"
                  value={eventType}
                  onChange={(e) => { if (e.target.value === '__add__') handleAddEventType(); else setEventType(e.target.value); }}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  {eventTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__add__">➕ Ajouter un type…</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Date de début *</label>
                  <input
                    id="event-date-input"
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Heure de début</label>
                  <input
                    id="event-time-input"
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Heure de fin</label>
                  <input
                    id="event-endtime-input"
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Récurrence</label>
                <select
                  id="event-recurrence-select"
                  value={eventRecurrence}
                  onChange={(e) => setEventRecurrence(e.target.value as EventRecurrence)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Portée</label>
                <select
                  value={eventScope}
                  onChange={(e) => setEventScope(e.target.value as 'church' | 'light' | 'both')}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  <option value="church">Bloom Church</option>
                  <option value="light">Bloom Light</option>
                  <option value="both">Les 2 branches</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Département organisateur</label>
                <select
                  id="event-organizer-select"
                  value={eventOrganizer}
                  onChange={(e) => setEventOrganizer(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  <option value="">— Aucun —</option>
                  <optgroup label="Églises">
                    {CHURCH_ORGANIZERS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Départements">
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Projet lié (optionnel)</label>
                <select
                  id="event-project-select"
                  value={eventProject}
                  onChange={(e) => setEventProject(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                >
                  <option value="">— Aucun —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
                <button
                  id="event-cancel-btn"
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active:scale-95"
                >
                  Annuler
                </button>
                <button
                  id="event-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active:scale-95 ${'bg-bc-green'}`}
                >
                  Planifier l'événement
                </button>
              </div>
            </form>
        </Modal>
      )}


    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
      <div className="text-[9px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1">{label}</div>
      <div className="text-xl font-ui font-extrabold text-bc-text">{value}</div>
      {sub && <div className="text-[10px] text-bc-text-secondary mt-0.5">{sub}</div>}
    </div>
  );
}

// Compact month grid built around the month of the first event (fallback: today).
function MonthCalendar({ events, onSelect }: { events: Event[]; onSelect: (id: string) => void }) {
  const base = events.length ? new Date(events[0].date + 'T00:00:00') : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const byDay = (d: number) => events.filter(e => e.date === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const monthLabel = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white border border-bc-border rounded-[2rem] p-4 shadow-sm">
      <h3 className="font-ui font-bold text-bc-text mb-3 capitalize">{monthLabel}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-bc-text-secondary mb-1">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className={`min-h-[64px] rounded-xl p-1 text-left ${d ? 'bg-bc-canvas/40 border border-bc-border' : ''}`}>
            {d && <div className="text-[10px] font-bold text-bc-text-secondary">{d}</div>}
            {d && byDay(d).map(e => (
              <button key={e.id} onClick={() => onSelect(e.id)} className={`w-full mt-0.5 text-[9px] font-bold rounded px-1 py-0.5 truncate text-left active:scale-95 ${e.cancelled ? 'bg-bc-danger/10 text-bc-danger line-through' : e.closed ? 'bg-bc-border text-bc-text-secondary' : 'bg-bc-green text-white'}`} title={`${e.time ? e.time + ' · ' : ''}${e.title}${e.cancelled ? ' (annulé)' : ''}`}>
                {e.time ? `${e.time} ` : ''}{e.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
