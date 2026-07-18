import React, { useState } from 'react';
import { UserCheck, ClipboardList, BarChart3, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Member, Report, Event, AuditLog, PermissionMatrix, FormDef, Branch } from '../types';
import { useBusLines, useDepartments } from '../data';
import { downscaleAndUpload } from '../lib/image';
import { adnByEvent } from '../data/adn';
import { Period, PeriodInput } from '../data/kpi';
import { Avatar } from './ui/Avatar';
import { PeriodSelector } from './ui/PeriodSelector';
import { toast } from './ui/Toast';
import Member360View from './Member360View';
import { Modal } from './ui/Modal';

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface AdnViewProps {
  members: Member[];
  events: Event[];
  reports: Report[];
  forms: FormDef[];
  operator?: Member;
  activeBranch: Branch;
  simulatedRole: string;
  audits: AuditLog[];
  permissionMatrix: PermissionMatrix;
  onAddMember: (m: Member) => void;
  onUpdateMember: (m: Member) => void;
  onAddReport: (r: Report) => void;
  onUpdateReport: (r: Report) => void;
}

// Événements proposés à la réception / au comptage : cultes & événements de la branche,
// déroulés récemment (J-30) ou aujourd'hui — un nouveau se rattache à un culte qui a eu lieu.
function recentEvents(events: Event[], activeBranch: Branch, now = new Date()): Event[] {
  const today = now.toISOString().split('T')[0];
  const floor = new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0];
  return events
    .filter((e) => !e.cancelled && (activeBranch === 'global' || e.branch === activeBranch) && e.date >= floor && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
}

const eventLabel = (e: Event) =>
  `${e.title} — ${new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}${e.time ? ` ${e.time}` : ''}${e.endTime ? `–${e.endTime}` : ''}`;

export default function AdnView({
  members, events, reports, forms, operator, activeBranch, simulatedRole, audits, permissionMatrix,
  onAddMember, onUpdateMember, onAddReport, onUpdateReport,
}: AdnViewProps) {
  const [tab, setTab] = useState<'fiche' | 'comptage' | 'dashboard'>('fiche');
  const busLines = useBusLines();
  const departments = useDepartments();

  // P1.4 — labels lus en live depuis le FormBuilder (fd_nouveau), comme l'ancien quick-form d'App.
  const nouveauForm = forms.find((f) => f.id === 'fd_nouveau');
  const nouveauLabel = (fieldId: string, fallback: string) =>
    nouveauForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;

  // ---- Fiche d'accueil (ex quick-form ADN d'App.tsx) ----
  const [quickFirstname, setQuickFirstname] = useState('');
  const [quickLastname, setQuickLastname] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickCommune, setQuickCommune] = useState('Cocody');
  const [quickOj, setQuickOj] = useState(false); // true = OJ, false = Nouveau (NV)
  const [quickWish, setQuickWish] = useState<'Membre' | 'Visiteur'>('Membre');
  const [quickActivityDate, setQuickActivityDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickEventId, setQuickEventId] = useState<string>('autre'); // Event.id ou 'autre' (hors cadre)
  const [quickGender, setQuickGender] = useState<'H' | 'F'>('H');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickDept, setQuickDept] = useState('dept_louange');
  const [quickPhotoUrl, setQuickPhotoUrl] = useState('');
  const [quickGps, setQuickGps] = useState<{ lat: number; lng: number } | null>(null);
  const [quickSource, setQuickSource] = useState('Invitation');
  // Rattachement Bloom Bus optionnel — indépendant du département d'intérêt.
  const [quickBusZone, setQuickBusZone] = useState('');
  const [quickBusId, setQuickBusId] = useState('');

  const receptionEvents = recentEvents(events, activeBranch);
  const busZones = [...new Set(busLines.map((b: { zone: string }) => b.zone))];
  const busesForZone = busLines.filter((b: { zone: string }) => b.zone === quickBusZone);

  const handleSaveQuickNouveau = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFirstname || !quickLastname || !quickPhone || !quickPhotoUrl) {
      toast.error('Veuillez remplir les informations obligatoires (Prénom, Nom, Contact, Photo).');
      return;
    }
    if (members.some((m) => m.phone === quickPhone)) {
      toast.error('Ce numéro de téléphone est déjà utilisé par un autre membre.');
      return;
    }

    const receptionEvent = quickEventId !== 'autre' ? events.find((ev) => ev.id === quickEventId) : undefined;
    const activityDate = receptionEvent?.date ?? quickActivityDate;
    const newNouveau: Member = {
      id: `new_quick_${Date.now()}`,
      firstName: quickFirstname,
      lastName: quickLastname,
      phone: quickPhone,
      email: `${quickFirstname.toLowerCase()}.${quickLastname.toLowerCase()}@gmail.com`,
      gender: quickGender,
      birthDate: quickBirthDate || '2000-01-01',
      maritalStatus: 'Célibataire',
      profession: 'Étudiant',
      branch: activeBranch === 'global' ? (receptionEvent?.branch === 'light' ? 'light' : 'church') : activeBranch,
      level: 'nouveau',
      pastoralCursus: 'aucun',
      departments: { [quickDept]: 'membre' },
      entryDate: activityDate,
      integrationState: 'en_attente',
      receptionValidated: false, // §6.2 — awaits Responsable's reception validation
      membershipWish: quickWish,
      integrationDateRegistered: activityDate,
      receivedEventId: quickEventId, // Event.id ou 'autre' — alimente le dashboard ADN par événement
      ojFlag: quickOj,
      hasPassedToBossForm: false,
      avatarUrl: quickPhotoUrl,
      source: quickSource,
      // Rattachement Bloom Bus indépendant du département — un Nouveau peut être d'un bus
      // sans être intégré à un département.
      bloomBusId: quickBusId || undefined,
      gps: {
        lat: quickGps?.lat ?? 5.3854,
        lng: quickGps?.lng ?? -3.9781,
        commune: quickCommune,
      },
      healthKPIs: { spirituel: 2, social: 2, financier: 2, physique: 3, presenceCulte: 1, presenceService: 1 },
      baptismStatus: 'non_baptise',
    };

    onAddMember(newNouveau);
    setQuickFirstname(''); setQuickLastname(''); setQuickPhone(''); setQuickOj(false);
    setQuickWish('Membre'); setQuickGender('H'); setQuickBirthDate(''); setQuickDept('dept_louange');
    setQuickEventId('autre'); setQuickActivityDate(new Date().toISOString().split('T')[0]);
    setQuickPhotoUrl(''); setQuickGps(null); setQuickSource('Invitation');
    setQuickBusZone(''); setQuickBusId('');
    toast.success('Nouveau enregistré par l\'ADN — visible dans le dashboard et l\'Intégration.');
  };

  // ---- Comptage ADN (rapport_adn par événement, upsert) ----
  const [countEventId, setCountEventId] = useState('');
  const [countNH, setCountNH] = useState(0);
  const [countNF, setCountNF] = useState(0);
  const [countOJH, setCountOJH] = useState(0);
  const [countOJF, setCountOJF] = useState(0);

  const existingAdnReport = countEventId
    ? reports.find((r) => r.reportType === 'rapport_adn' && r.eventId === countEventId)
    : undefined;

  const selectCountEvent = (id: string) => {
    setCountEventId(id);
    const existing = reports.find((r) => r.reportType === 'rapport_adn' && r.eventId === id);
    setCountNH(Number(existing?.content?.nouveauxH ?? 0));
    setCountNF(Number(existing?.content?.nouveauxF ?? 0));
    setCountOJH(Number(existing?.content?.ojH ?? 0));
    setCountOJF(Number(existing?.content?.ojF ?? 0));
  };

  const handleSaveCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countEventId || !operator) return;
    const ev = events.find((x) => x.id === countEventId);
    const content = { nouveauxH: countNH, nouveauxF: countNF, ojH: countOJH, ojF: countOJF };
    if (existingAdnReport) {
      // Upsert par eventId — un seul comptage officiel par événement (la clôture EventsView
      // et cet onglet écrivent le même rapport), sinon Moisson/OJ doublent.
      onUpdateReport({ ...existingAdnReport, content: { ...existingAdnReport.content, ...content } });
    } else {
      onAddReport({
        id: genId('rep_adn'),
        authorId: operator.id,
        authorName: `${operator.firstName} ${operator.lastName}`,
        authorRole: simulatedRole,
        targetBranch: ev?.branch ?? (activeBranch === 'global' ? 'church' : activeBranch),
        date: ev?.date ?? new Date().toISOString().split('T')[0],
        reportType: 'rapport_adn',
        eventId: countEventId,
        departmentId: 'dept_adn',
        confidential: false,
        content,
      });
    }
    toast.success('Comptage ADN enregistré pour cet événement.');
  };

  // ---- Dashboard par événement ----
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selected360, setSelected360] = useState<Member | null>(null);
  // Détail d'un rapport de comptage ADN (clic sur les chiffres du dashboard).
  const [detailReport, setDetailReport] = useState<Report | null>(null);

  const branchMembers = members.filter((m) => activeBranch === 'global' || m.branch === activeBranch);
  const branchReports = reports.filter((r) => activeBranch === 'global' || r.targetBranch === activeBranch);
  const rows = adnByEvent(branchMembers, branchReports, events, effectivePeriod);
  const nouveauxOf = (key: string) =>
    branchMembers.filter((m) => (m.receivedEventId ?? (m.level === 'nouveau' ? 'autre' : '')) === key
      || (key === 'autre' && m.receivedEventId === 'autre'));

  const inputCls = 'w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green';
  const labelCls = 'block text-xs font-bold text-bc-text mb-1';

  return (
    <div className="space-y-6">
      {/* Header + sous-onglets */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm">
        <h2 className="text-lg font-ui font-extrabold text-bc-text flex items-center gap-2 mb-1">
          <UserCheck size={20} /> ADN — Accueil des Nouveaux
        </h2>
        <p className="text-xs text-bc-text-secondary mb-4">Fiches d'accueil, comptages par culte/événement et synthèse des Nouveaux & OJ.</p>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'fiche', label: "Fiche d'accueil", icon: UserCheck },
            { id: 'comptage', label: 'Comptage ADN', icon: ClipboardList },
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          ] as const).map((t) => (
            <button
              key={t.id}
              id={`adn-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-colors active-scale ${tab === t.id ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'}`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Fiche d'accueil ---- */}
      {tab === 'fiche' && (
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm max-w-2xl">
          <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
            <UserCheck size={18} /> Fiche d'Accueil ADN & OJ (Moisson Directe)
          </h3>
          <form onSubmit={handleSaveQuickNouveau} className="space-y-4">
            <div>
              <label className={labelCls}>{nouveauLabel('f0', 'Type de membre')} *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setQuickOj(true)}
                  className={`text-left p-3 rounded-2xl border transition-colors ${quickOj ? 'bg-bc-green/10 border-bc-green' : 'bg-white border-bc-border hover:bg-bc-canvas'}`}>
                  <span className="block text-xs font-bold text-bc-text">Oui Jésus (OJ)</span>
                  <span className="block text-[10px] text-bc-text-secondary">A donné sa vie à Jésus aujourd'hui</span>
                </button>
                <button type="button" onClick={() => setQuickOj(false)}
                  className={`text-left p-3 rounded-2xl border transition-colors ${!quickOj ? 'bg-bc-green/10 border-bc-green' : 'bg-white border-bc-border hover:bg-bc-canvas'}`}>
                  <span className="block text-xs font-bold text-bc-text">Nouveau (NV)</span>
                  <span className="block text-[10px] text-bc-text-secondary">Premier(s) passage(s) à l'église</span>
                </button>
              </div>
            </div>

            {/* Culte / événement de réception — la fiche se remplit surtout pendant un culte ;
                « Autre » = personne reçue hors de ce cadre (comptée dans « Autre », pas un event). */}
            <div>
              <label className={labelCls}>{nouveauLabel('f2', 'Culte / Événement de réception')}</label>
              <select
                id="quick-event-select"
                value={quickEventId}
                onChange={(e) => {
                  setQuickEventId(e.target.value);
                  const ev = events.find((x) => x.id === e.target.value);
                  if (ev) setQuickActivityDate(ev.date);
                }}
                className={inputCls}
              >
                {receptionEvents.map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
                <option value="autre">Autre (reçu hors culte/événement)</option>
              </select>
            </div>
            {quickEventId === 'autre' && (
              <div>
                <label className={labelCls}>{nouveauLabel('f1', 'Date de réception')} *</label>
                <input type="date" required value={quickActivityDate} onChange={(e) => setQuickActivityDate(e.target.value)} className={inputCls} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{nouveauLabel('f3', 'Prénom')} *</label>
                <input id="quick-firstname" type="text" required value={quickFirstname} onChange={(e) => setQuickFirstname(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{nouveauLabel('f4', 'Nom')} *</label>
                <input id="quick-lastname" type="text" required value={quickLastname} onChange={(e) => setQuickLastname(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{nouveauLabel('f5', 'Contact')} *</label>
                <input id="quick-phone" type="text" required placeholder="+225..." value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>{nouveauLabel('f6', 'Genre')}</label>
                <select value={quickGender} onChange={(e) => setQuickGender(e.target.value as 'H' | 'F')} className={inputCls}>
                  <option value="H">Homme</option>
                  <option value="F">Femme</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{nouveauLabel('f7', 'Date de naissance')}</label>
                <input type="date" value={quickBirthDate} onChange={(e) => setQuickBirthDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{nouveauLabel('f8', 'Commune / Quartier')}</label>
                <select id="quick-commune-select" value={quickCommune} onChange={(e) => setQuickCommune(e.target.value)} className={inputCls}>
                  <option value="Cocody">Cocody</option>
                  <option value="Yopougon">Yopougon</option>
                  <option value="Abobo">Abobo</option>
                  <option value="Koumassi">Koumassi</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{nouveauLabel('f9', 'Photo')} *</label>
                <input
                  id="quick-photo-input"
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // Resize + gestion d'erreur (C2/B6) — une photo pleine résolution
                    // faisait exploser le quota localStorage et crasher en boucle.
                    downscaleAndUpload(file).then(setQuickPhotoUrl).catch((err) => toast.error(err.message));
                  }}
                  className="w-full border border-bc-border rounded-full px-3 py-1.5 text-[10px] bg-white focus:outline-none"
                />
                {quickPhotoUrl && <img src={quickPhotoUrl} alt="Aperçu" className="mt-2 w-12 h-12 rounded-full object-cover border border-bc-border" />}
              </div>
              <div>
                <label className={labelCls}>{nouveauLabel('f10', 'Comment nous a-t-il connu ?')}</label>
                <select value={quickSource} onChange={(e) => setQuickSource(e.target.value)} className={inputCls}>
                  <option value="Invitation">Invitation (ami/famille)</option>
                  <option value="Réseaux sociaux">Réseaux sociaux</option>
                  <option value="Passage devant l'église">Passage devant l'église</option>
                  <option value="Évangélisation">Évangélisation</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    toast.error('Géolocalisation non disponible sur cet appareil.');
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setQuickGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => toast.error('Impossible de récupérer la position GPS.'),
                  );
                }}
                className="text-xs font-bold px-3 py-2 rounded-full border border-bc-border hover:bg-bc-canvas"
              >
                📍 {quickGps ? `Position capturée (${quickGps.lat.toFixed(4)}, ${quickGps.lng.toFixed(4)})` : 'Localiser (GPS)'}
              </button>
            </div>

            <div>
              <label className={labelCls}>{nouveauLabel('f11', 'Souhaites-tu être…')}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Membre', 'Visiteur'] as const).map((opt) => (
                  <button key={opt} type="button" onClick={() => setQuickWish(opt)}
                    className={`px-3 py-2 rounded-full text-xs font-bold border transition-colors ${quickWish === opt ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'}`}>
                    {opt === 'Membre' ? 'Membre' : 'Simple visiteur'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>{nouveauLabel('f12', "Département d'intérêt")}</label>
              <select value={quickDept} onChange={(e) => setQuickDept(e.target.value)} className={inputCls}>
                {departments.map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Bloom Bus optionnel — indépendant du département d'intérêt */}
            <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text-secondary">
                Rattachement Bloom Bus (optionnel)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <select
                  id="quick-bus-zone"
                  value={quickBusZone}
                  onChange={(e) => { setQuickBusZone(e.target.value); setQuickBusId(''); }}
                  className={inputCls}
                >
                  <option value="">— Zone —</option>
                  {busZones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <select
                  id="quick-bus-id"
                  value={quickBusId}
                  onChange={(e) => setQuickBusId(e.target.value)}
                  disabled={!quickBusZone}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  <option value="">— Bus —</option>
                  {busesForZone.map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
              <button id="quick-submit-btn" type="submit" className="px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 bg-bc-green">
                Enregistrer ADN
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Comptage ADN ---- */}
      {tab === 'comptage' && (
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm max-w-2xl">
          <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-1">
            <ClipboardList size={18} /> Comptage ADN — Nouveaux & OJ par événement
          </h3>
          <p className="text-xs text-bc-text-secondary mb-4">Un seul comptage officiel par culte/événement — re-sélectionner un événement corrige le comptage existant.</p>
          <form onSubmit={handleSaveCount} className="space-y-4">
            <div>
              <label className={labelCls}>Culte / Événement *</label>
              <select id="adn-count-event" required value={countEventId} onChange={(e) => selectCountEvent(e.target.value)} className={inputCls}>
                <option value="">— Sélectionner —</option>
                {recentEvents(events, activeBranch).map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
              </select>
              {existingAdnReport && (
                <p className="text-[10px] text-bc-warning font-bold mt-1">Un comptage existe déjà pour cet événement — l'enregistrement le mettra à jour.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['Nouveaux Hommes', countNH, setCountNH],
                ['Nouveaux Femmes', countNF, setCountNF],
                ['OJ Hommes', countOJH, setCountOJH],
                ['OJ Femmes', countOJF, setCountOJF],
              ] as const).map(([label, value, setter]) => (
                <div key={label}>
                  <label className={labelCls}>{label}</label>
                  <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(e) => setter(Math.max(0, Number(e.target.value)))}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3 border-t border-bc-border">
              <button id="adn-count-submit" type="submit" disabled={!countEventId} className="px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 bg-bc-green disabled:opacity-40">
                {existingAdnReport ? 'Mettre à jour le comptage' : 'Enregistrer le comptage'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Dashboard ---- */}
      {tab === 'dashboard' && (
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2">
              <BarChart3 size={18} /> Nouveaux & OJ par culte / événement
            </h3>
            <PeriodSelector
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
            />
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-bc-text-secondary italic text-center py-10">Aucun culte/événement ni nouveau sur la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-bc-border text-bc-text-secondary">
                    <th className="py-2 pr-3">Culte / Événement</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Nouveaux (comptage)</th>
                    <th className="py-2 pr-3 text-right">OJ (comptage)</th>
                    <th className="py-2 text-right">Fiches saisies</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const fiches = nouveauxOf(row.key);
                    const expanded = expandedRow === row.key;
                    return (
                      <React.Fragment key={row.key}>
                        <tr
                          className="border-b border-bc-border/50 hover:bg-bc-canvas/40 cursor-pointer"
                          onClick={() => setExpandedRow(expanded ? null : row.key)}
                        >
                          <td className="py-2.5 pr-3 font-bold text-bc-text">
                            <span className="flex items-center gap-1.5">
                              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              {row.title}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-bc-text-secondary">
                            {row.date ? new Date(`${row.date}T12:00:00`).toLocaleDateString('fr-FR') : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                            {(() => {
                              const rep = branchReports.find((r) => r.reportType === 'rapport_adn' && (r.eventId ?? 'autre') === row.key);
                              return rep ? (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDetailReport(rep); }}
                                  className="underline decoration-dotted underline-offset-2 hover:text-bc-green"
                                  title="Voir le détail du rapport ADN"
                                >
                                  {row.countNouveaux}
                                </button>
                              ) : row.countNouveaux;
                            })()}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold tabular-nums">{row.countOj}</td>
                          <td className="py-2.5 text-right tabular-nums">
                            {row.ficheNouveaux + row.ficheOj}
                            <span className="text-bc-text-secondary font-normal"> ({row.ficheNouveaux} NV · {row.ficheOj} OJ)</span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-bc-border/50 bg-bc-canvas/30">
                            <td colSpan={5} className="py-2 px-4">
                              {fiches.length === 0 ? (
                                <p className="text-[10px] text-bc-text-secondary italic py-1">Aucune fiche individuelle rattachée.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2 py-1">
                                  {fiches.map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSelected360(m); }}
                                      className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white border border-bc-border hover:border-bc-green transition-colors active-scale"
                                    >
                                      <Avatar src={m.avatarUrl} initials={`${m.firstName[0]}${m.lastName[0]}`} size="sm" className="w-6 h-6 text-[9px] bg-bc-canvas border border-bc-border text-bc-text" />
                                      <span className="text-[11px] font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                                      {m.ojFlag && <span className="text-[9px] font-bold text-bc-fushia">OJ</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-bc-text-secondary mt-3 flex items-center gap-1">
            <Users size={11} /> « Comptage » = rapport ADN officiel de l'événement ; « Fiches » = fiches d'accueil individuelles. Cliquer une ligne pour voir les Nouveaux, un nom pour ouvrir sa fiche.
          </p>
        </div>
      )}

      {/* Détail d'un rapport de comptage ADN */}
      {detailReport && (
        <Modal open={true} onClose={() => setDetailReport(null)} title="Détail du comptage ADN" maxWidth="max-w-md">
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-bc-canvas border border-bc-border">
              <span className="block text-[10px] font-bold uppercase text-bc-text-secondary">Événement</span>
              <span className="font-bold text-bc-text">
                {events.find((e) => e.id === detailReport.eventId)?.title ?? 'Autre (hors culte/événement)'}
              </span>
              <span className="block text-[10px] text-bc-text-secondary mt-0.5">
                Rapport du {new Date(`${detailReport.date}T12:00:00`).toLocaleDateString('fr-FR')} — {detailReport.authorName} ({detailReport.authorRole})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['Nouveaux Hommes', detailReport.content?.nouveauxH],
                ['Nouveaux Femmes', detailReport.content?.nouveauxF],
                ['OJ Hommes', detailReport.content?.ojH],
                ['OJ Femmes', detailReport.content?.ojF],
              ] as const).map(([label, value]) => (
                <div key={label} className="p-3 rounded-xl border border-bc-border text-center">
                  <span className="block text-xl font-black text-bc-text tabular-nums">{Number(value ?? 0)}</span>
                  <span className="block text-[10px] font-bold text-bc-text-secondary">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between p-3 rounded-xl bg-bc-green/10 border border-bc-green/30 font-bold text-bc-text">
              <span>Total Nouveaux : {Number(detailReport.content?.nouveauxH ?? 0) + Number(detailReport.content?.nouveauxF ?? 0)}</span>
              <span>Total OJ : {Number(detailReport.content?.ojH ?? 0) + Number(detailReport.content?.ojF ?? 0)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Fiche 360 d'un Nouveau — mêmes infos qu'un membre, récupérables pour la suite */}
      {selected360 && (
        <Member360View
          member={selected360}
          onClose={() => setSelected360(null)}
          simulatedRole={simulatedRole}
          reports={reports}
          audits={audits}
          onAddReport={onAddReport}
          onUpdate={(m) => { onUpdateMember(m); setSelected360(m); }}
          onEdit={() => {}}
          operator={operator}
          permissionMatrix={permissionMatrix}
          forms={forms}
        />
      )}
    </div>
  );
}

