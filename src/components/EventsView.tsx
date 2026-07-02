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
  List,
  LayoutGrid,
  Building2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Event, Branch, Report } from '../types';

interface EventsViewProps {
  events: Event[];
  reports?: Report[];
  onAddEvent: (event: Event) => void;
  onAddReport: (report: Report) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

const TYPE_LABEL: Record<Event['type'], string> = {
  dimanche_1er: '1er Culte',
  dimanche_2e: '2e Culte',
  dimanche_unique: 'Culte Unique',
  special_inside: 'INside',
  special_altar: 'Altar',
  special_nss: 'NSS',
};

export default function EventsView({
  events,
  reports = [],
  onAddEvent,
  onAddReport,
  activeBranch,
  simulatedRole
}: EventsViewProps) {
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'dimanche_1er' | 'dimanche_2e' | 'dimanche_unique' | 'special_inside' | 'special_altar' | 'special_nss'>('dimanche_unique');
  const [eventDate, setEventDate] = useState('2026-06-28');
  const [eventScope, setEventScope] = useState<'church' | 'light' | 'both'>('church');
  const [eventOrganizer, setEventOrganizer] = useState('');
  const [eventProject, setEventProject] = useState('');

  // Counters State
  const [menPortiers, setMenPortiers] = useState(620);
  const [womenPortiers, setWomenPortiers] = useState(680);
  const [newMenADN, setNewMenADN] = useState(15);
  const [newWomenADN, setNewWomenADN] = useState(18);
  const [ojMen, setOjMen] = useState(8);
  const [ojWomen, setOjWomen] = useState(12);
  const [offertory, setOffertory] = useState(350000);

  const isChurch = activeBranch === 'church';

  // Filter events by branch — a 2-branches event (branch 'global') is visible from either branch.
  const branchEvents = events.filter(e => activeBranch === 'global' || e.branch === activeBranch || e.branch === 'global');
  const selectedEvent = events.find(e => e.id === selectedEventId);

  // Sunday Stats: attendance per closed event (from Portiers reports), chronological.
  const sundayData = [...branchEvents]
    .filter(e => e.closed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const p = reports.find(r => r.eventId === e.id && r.reportType === 'rapport_portiers');
      return { name: e.date.slice(5), affluence: p ? (p.content.total ?? 0) : 0 };
    });

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle) return;

    const newEvent: Event = {
      id: `evt_custom_${Date.now()}`,
      title: eventTitle,
      type: eventType,
      date: eventDate,
      branch: eventScope === 'both' ? 'global' : eventScope, // 2 branches → 'global' (visible des deux)
      closed: false,
      scope: eventScope,
      organizer: eventOrganizer || undefined,
      projectId: eventProject || undefined,
    };

    onAddEvent(newEvent);
    setShowAddEventModal(false);
    setEventTitle('');
    setEventOrganizer('');
    setEventProject('');
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
        total: menPortiers + womenPortiers
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
        nouveauxHommes: newMenADN,
        nouveauxFemmes: newWomenADN,
        ojHommes: ojMen,
        ojFemmes: ojWomen
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
        notes: `Comptage validé avec succès par les Portiers et l'ADN. Total de Décideurs OJ : ${ojMen + ojWomen}.`
      }
    };

    onAddReport(portiersReport);
    onAddReport(adnReport);
    onAddReport(culteReport);

    // Update event closed state
    targetEvent.closed = true;

    // Close counters and alert
    setShowCounterModal(false);
    alert('Comptages enregistrés et Culte clôturé avec succès !');
  };

  if (selectedEvent) {
    const evReports = reports.filter(r => r.eventId === selectedEvent.id);
    const portiers = evReports.find(r => r.reportType === 'rapport_portiers');
    const adn = evReports.find(r => r.reportType === 'rapport_adn');
    const affluence = portiers ? (portiers.content.total ?? (portiers.content.men + portiers.content.women)) : 0;
    const nouveaux = adn ? (adn.content.nouveauxHommes || 0) + (adn.content.nouveauxFemmes || 0) : 0;
    const oj = adn ? (adn.content.ojHommes || 0) + (adn.content.ojFemmes || 0) : 0;
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
              <div className={`p-3 rounded-2xl ${selectedEvent.closed ? 'bg-slate-100 text-bc-text-secondary' : 'bg-bc-green text-white'}`}>
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-ui font-extrabold text-bc-text">{selectedEvent.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-bc-text-secondary">
                  <span className="font-mono text-xs">{selectedEvent.date}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="uppercase text-[10px] tracking-wider font-bold">{selectedEvent.type.replace('_', ' ')}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEvent.closed ? 'bg-slate-100 text-bc-text-secondary' : 'bg-emerald-50 text-emerald-600'}`}>
                    {selectedEvent.closed ? 'Clôturé' : 'En cours'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {!selectedEvent.closed && ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole) && (
            <button
              onClick={() => setShowCounterModal(true)}
              className="px-5 py-2.5 bg-bc-green text-white font-bold text-xs rounded-full hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm"
            >
              <CheckCircle size={16} /> Clôturer le Culte
            </button>
          )}
        </div>

        {selectedEvent.closed ? (
          <div className="space-y-6">
            {/* Organizer */}
            <div className="bg-white p-4 rounded-[1.5rem] border border-bc-border shadow-sm flex items-center gap-3 text-sm">
              <Building2 size={16} className="text-bc-text-secondary" />
              <span className="text-bc-text-secondary">Organisateur :</span>
              <span className="font-bold text-bc-text">
                {selectedEvent.organizer || (selectedEvent.scope === 'both' ? 'Événement 2 branches' : 'Événement de branche')}
              </span>
            </div>

            {/* Consolidated stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Affluence (Portiers)" value={affluence} sub={portiers ? `${portiers.content.men} H · ${portiers.content.women} F` : 'aucun rapport'} />
              <StatCard label="Nouveaux (ADN)" value={nouveaux} sub={adn ? `${adn.content.nouveauxHommes} H · ${adn.content.nouveauxFemmes} F` : 'aucun rapport'} />
              <StatCard label="OJ « Oui à Jésus »" value={oj} sub={adn ? `${adn.content.ojHommes} H · ${adn.content.ojFemmes} F` : 'aucun rapport'} />
              <StatCard label="Rapports rattachés" value={evReports.length} sub="consolidés" />
            </div>

            {/* Linked reports */}
            <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
              <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2"><FileText size={16} /> Rapports rattachés</h3>
              <div className="space-y-2">
                {evReports.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun rapport rattaché à cet événement.</p>}
                {evReports.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2">
                    <span className="font-bold text-bc-text">{r.reportType.replace(/_/g, ' ')}</span>
                    <span className="text-bc-text-secondary">{r.authorName} · {r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-12 rounded-[2rem] border border-bc-border shadow-sm flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-bc-canvas rounded-full flex items-center justify-center mb-6 border border-bc-border">
              <Activity size={32} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-ui font-bold text-bc-text mb-2">En attente de clôture</h3>
            <p className="text-sm text-bc-text-secondary text-center max-w-md mb-8">
              Une fois l'événement terminé, clôturez le culte pour consolider les comptages physiques (Portiers) et spirituels (ADN).
            </p>
          </div>
        )}

      {/* Saisir Comptages Modal */}
      {showCounterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 border border-bc-border shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowCounterModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-bc-text transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
              <CheckCircle size={18} className="text-emerald-500" />
              Clôturer : Saisie des Comptages
            </h3>

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
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Femmes installées</label>
                    <input
                      type="number"
                      value={womenPortiers}
                      onChange={(e) => setWomenPortiers(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* 2. ADN counters */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <span className="text-[10px] uppercase font-bold text-bc-text-secondary flex items-center gap-1.5">
                  <Heart size={12} /> 2. Section ADN (Nouveaux & OJ)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Nouveaux (H)</label>
                    <input
                      type="number"
                      value={newMenADN}
                      onChange={(e) => setNewMenADN(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Nouveaux (F)</label>
                    <input
                      type="number"
                      value={newWomenADN}
                      onChange={(e) => setNewWomenADN(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Oui à Jésus (H)</label>
                    <input
                      type="number"
                      value={ojMen}
                      onChange={(e) => setOjMen(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text mb-1">Oui à Jésus (F)</label>
                    <input
                      type="number"
                      value={ojWomen}
                      onChange={(e) => setOjWomen(parseInt(e.target.value) || 0)}
                      className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
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
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCounterModal(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Clôturer le Culte
                </button>
              </div>
            </form>
          </div>
        </div>
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

        {['Pasteur', 'Admin', 'Responsable', 'Super Admin'].includes(simulatedRole) && (
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

      {/* Toolbar: view toggle + Sunday Stats */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="inline-flex bg-white border border-bc-border rounded-full p-1 self-start">
          <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${viewMode === 'list' ? 'bg-bc-green text-white' : 'text-bc-text-secondary'}`}>
            <List size={14} /> Liste
          </button>
          <button onClick={() => setViewMode('calendar')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${viewMode === 'calendar' ? 'bg-bc-green text-white' : 'text-bc-text-secondary'}`}>
            <LayoutGrid size={14} /> Calendrier
          </button>
        </div>
        {sundayData.length > 0 && (
          <div className="flex-1 bg-white border border-bc-border rounded-[1.5rem] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1 px-2 flex items-center gap-1.5"><TrendingUp size={12} /> Sunday Stats · affluence par culte</p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sundayData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="evtAffluence" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#009BDE" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#009BDE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="affluence" stroke="#009BDE" strokeWidth={2} fill="url(#evtAffluence)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {viewMode === 'calendar' && <MonthCalendar events={branchEvents} onSelect={setSelectedEventId} />}

      {/* Grid of Planned Events */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${viewMode === 'calendar' ? 'hidden' : ''}`}>
        {branchEvents.map((evt) => (
          <div 
            key={evt.id} 
            onClick={() => setSelectedEventId(evt.id)}
            className="bg-white border border-bc-border shadow-sm rounded-[2rem] p-5 hover:shadow-md hover:border-slate-300 cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start">
                <div className={`p-2.5 rounded-2xl transition-colors ${evt.closed ? 'bg-slate-100 text-slate-400 group-hover:bg-slate-200' : 'bg-bc-green text-white'}`}>
                  <Calendar size={20} />
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  evt.closed ? 'bg-bc-canvas text-bc-text-secondary border-bc-border' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                }`}>
                  {evt.closed ? 'Clôturé' : 'En cours'}
                </span>
              </div>

              <h4 className="font-ui font-bold text-bc-text text-[14px] mt-4 leading-tight group-hover:underline">{evt.title}</h4>
              <p className="text-[10px] text-bc-text-secondary font-mono mt-1 uppercase tracking-wide">
                Type : {evt.type.replace('_', ' ')}
              </p>
            </div>

            <div className="border-t border-bc-border pt-3 mt-4 flex items-center justify-between text-[11px] text-bc-text-secondary">
              <span className="font-mono">{evt.date}</span>
              <span className="font-bold uppercase tracking-wider">{evt.branch}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Plan Event Modal */}
      {showAddEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-6 border border-bc-border shadow-2xl relative">
            <button
              id="close-add-event-modal-btn"
              onClick={() => setShowAddEventModal(false)}
              className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-purple transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
              <Calendar size={18} className={'text-bc-text'} />
              Planifier un Culte ou Rassemblement
            </h3>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Type d'événement</label>
                  <select
                    id="event-type-select"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    <option value="dimanche_1er">1er Culte Dimanche</option>
                    <option value="dimanche_2e">2e Culte Dimanche</option>
                    <option value="dimanche_unique">Culte Unique</option>
                    <option value="special_inside">INside Spécial</option>
                    <option value="special_altar">Altar Spécial</option>
                    <option value="special_nss">Night of Supernatural</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Date *</label>
                  <input
                    id="event-date-input"
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-xs font-bold text-bc-text mb-1">Organisateur</label>
                  <input
                    type="text"
                    placeholder="Département / branche"
                    value={eventOrganizer}
                    onChange={(e) => setEventOrganizer(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Projet rattaché (optionnel)</label>
                <input
                  type="text"
                  placeholder="ex: NSS 2026"
                  value={eventProject}
                  onChange={(e) => setEventProject(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
                <button
                  id="event-cancel-btn"
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas"
                >
                  Annuler
                </button>
                <button
                  id="event-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 ${'bg-bc-green'}`}
                >
                  Planifier l'événement
                </button>
              </div>
            </form>
          </div>
        </div>
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
              <button key={e.id} onClick={() => onSelect(e.id)} className={`w-full mt-0.5 text-[9px] font-bold rounded px-1 py-0.5 truncate text-left ${e.closed ? 'bg-slate-200 text-slate-600' : 'bg-bc-green text-white'}`} title={e.title}>
                {TYPE_LABEL[e.type]}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
