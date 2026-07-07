import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Member, Branch, IntegrationFollowStatus } from '../types';
import { useDepartments, load, save } from '../data';
import { Search, Filter, ClipboardCheck, Phone, ChevronRight, Check, Send, ShieldAlert } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { staggerParent, staggerItem } from './ui/motion';

// Integrator follow-up report (Espace Intégrateur).
interface IntegrationReport {
  id: string;
  memberId: string;
  authorName: string;
  date: string;
  status: IntegrationFollowStatus;
  contactEstablished: boolean;
  visitDone: boolean;
  notes: string;
  motif: string;
}

const STATUSES: { key: IntegrationFollowStatus; card: string; badge: string; text: string; bar: string }[] = [
  { key: 'Non suivi', card: 'bg-white border-bc-text', badge: 'bg-bc-canvas text-bc-text-secondary', text: 'text-bc-text', bar: 'bg-bc-text' },
  { key: 'En attente', card: 'bg-white border-bc-border', badge: 'bg-bc-canvas text-bc-text-secondary', text: 'text-bc-text', bar: 'bg-bc-warmgrey' },
  { key: 'En cours', card: 'bg-white border-bc-warning', badge: 'bg-bc-warning/10 text-bc-warning', text: 'text-bc-warning', bar: 'bg-bc-warning' },
  { key: 'À recontacter', card: 'bg-white border-bc-cerulean', badge: 'bg-bc-cerulean/10 text-bc-cerulean', text: 'text-bc-cerulean', bar: 'bg-bc-cerulean' },
  { key: 'Intégré', card: 'bg-white border-bc-success', badge: 'bg-bc-success/10 text-bc-success', text: 'text-bc-success', bar: 'bg-bc-success' },
  { key: 'Non intégré', card: 'bg-white border-bc-danger', badge: 'bg-bc-danger/10 text-bc-danger', text: 'text-bc-danger', bar: 'bg-bc-danger' },
];
const statusMeta = (s: IntegrationFollowStatus) => STATUSES.find(x => x.key === s) ?? STATUSES[0];

interface NouveauxViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

// PROFILS-INTERFACES.md §13 — Console Intégration réservée au département spécial Intégration
// (un par branche) + à la ligne hiérarchique qui supervise l'oeuvre/la branche.
const CAN_ACCESS_INTEGRATION = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Intégration'];

export default function NouveauxView({ members, onUpdateMember, activeBranch, simulatedRole }: NouveauxViewProps) {
  const INITIAL_DEPARTMENTS = useDepartments();
  const canAccess = CAN_ACCESS_INTEGRATION.includes(simulatedRole);

  const [reports, setReports] = useState<IntegrationReport[]>(() => load('bc_integration_reports', [] as IntegrationReport[]));
  useEffect(() => { save('bc_integration_reports', reports); }, [reports]);
  const reportsFor = (id: string) => reports.filter(r => r.memberId === id);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<IntegrationFollowStatus | null>('Non suivi');
  const [regFrom, setRegFrom] = useState('');
  const [regTo, setRegTo] = useState('');
  const [culteFrom, setCulteFrom] = useState('');
  const [culteTo, setCulteTo] = useState('');

  // Selection + report draft
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<IntegrationFollowStatus>('En cours');
  const [draftContact, setDraftContact] = useState(false);
  const [draftVisit, setDraftVisit] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftMotif, setDraftMotif] = useState('');

  const statusOf = (m: Member): IntegrationFollowStatus => m.integrationFollowStatus ?? 'Non suivi';
  const deptNameOf = (m: Member) => {
    const id = Object.keys(m.departments ?? {})[0];
    return id ? (INITIAL_DEPARTMENTS.find(d => d.id === id)?.name ?? id) : null;
  };

  // Pool = registered nouveaux (+ those already processed), branch-scoped.
  const pool = members.filter(m =>
    (m.level === 'Nouveau' || (m.integrationFollowStatus && m.integrationFollowStatus !== 'Non suivi')) &&
    (activeBranch === 'global' || m.branch === activeBranch)
  );

  const counts = STATUSES.reduce((acc, s) => {
    acc[s.key] = pool.filter(m => statusOf(m) === s.key).length;
    return acc;
  }, {} as Record<IntegrationFollowStatus, number>);

  const deptOptions = INITIAL_DEPARTMENTS.filter(d => pool.some(m => m.departments?.[d.id]));

  const inRange = (date: string | undefined, from: string, to: string) => {
    if (!date) return !from && !to;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  };

  const filtered = pool.filter(m => {
    if (statusFilter && statusOf(m) !== statusFilter) return false;
    if (deptFilter !== 'all' && !m.departments?.[deptFilter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${m.firstName} ${m.lastName}`.toLowerCase().includes(q) && !m.phone.includes(q)) return false;
    }
    if ((regFrom || regTo) && !inRange(m.entryDate, regFrom, regTo)) return false;
    if ((culteFrom || culteTo) && !inRange(m.integrationDateRegistered, culteFrom, culteTo)) return false;
    return true;
  });

  const selected = selectedId ? members.find(m => m.id === selectedId) : undefined;

  const selectMember = (m: Member) => {
    setSelectedId(m.id);
    setDraftStatus(statusOf(m) === 'Non suivi' ? 'En cours' : statusOf(m));
    setDraftContact(false);
    setDraftVisit(false);
    setDraftNotes('');
    setDraftMotif('');
  };

  // P4.4 — pipeline transverse ADN/Intégration (integrationFollowStatus, tous départements),
  // distinct du sous-onglet "Nouveaux" de DepartmentsView (réception dept-scoped par le
  // Responsable, receptionValidated). Complémentaires, pas de fusion prévue.
  const saveReport = () => {
    if (!selected) return;
    const report: IntegrationReport = {
      id: `ir_${selected.id}_${Date.now()}`,
      memberId: selected.id,
      authorName: 'Affeny Grah',
      date: new Date().toISOString().slice(0, 10),
      status: draftStatus,
      contactEstablished: draftContact,
      visitDone: draftVisit,
      notes: draftNotes.trim(),
      motif: draftMotif.trim(),
    };
    setReports(prev => [report, ...prev]);
    // WORKFLOWS §2 — integrationState (En attente → Suivi → Intégré) est dérivé
    // du statut de suivi détaillé. Seul site d'écriture post-création.
    // ponytail: 'Non intégré' (abandon) reste 'Suivi' — la machine à 3 états de la spec ne modélise pas l'abandon.
    const derivedState: Member['integrationState'] =
      draftStatus === 'Intégré' ? 'Intégré'
      : draftStatus === 'Non suivi' || draftStatus === 'En attente' ? 'En attente'
      : 'Suivi';
    // D5 — l'horloge "au rouge" ne se réinitialise que sur un contact réel (échange ou visite),
    // pas sur un simple « à recontacter » (tentative sans réponse) → le membre reste signalé.
    const contactedNow = (draftContact || draftVisit) ? { lastContact: report.date } : {};
    onUpdateMember({ ...selected, integrationFollowStatus: draftStatus, integrationState: derivedState, ...contactedNow });
    setDraftNotes('');
    setDraftMotif('');
  };

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8 flex flex-col items-center justify-center text-center min-h-[60vh]">
        <ShieldAlert size={40} className="text-bc-warmgrey mb-4" />
        <h2 className="font-ui font-bold text-bc-text text-lg mb-1">Accès restreint</h2>
        <p className="text-sm text-bc-text-secondary max-w-sm">
          La console Intégration est réservée au département spécial Intégration et à la ligne pastorale.
          Votre profil ({simulatedRole}) n'y a pas accès.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-ui font-black uppercase tracking-wider text-bc-purple">Espace Intégrateur</p>
        <h2 className="text-2xl font-ui font-extrabold text-bc-text">Suivi de l'intégration</h2>
        <p className="text-xs text-bc-text-secondary mt-0.5">Sélectionne un membre pour ajouter ou mettre à jour son rapport d'intégration.</p>
      </div>

      {/* Status stat cards (clickable filters) */}
      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUSES.map(s => {
          const active = statusFilter === s.key;
          return (
            <motion.button
              key={s.key}
              variants={staggerItem}
              onClick={() => setStatusFilter(active ? null : s.key)}
              className={`text-left rounded-2xl border p-4 transition-all active:scale-95 ${active ? s.card + ' shadow-md' : 'bg-white border-bc-border hover:border-bc-text-secondary/40'}`}
            >
              <div className={`text-[11px] font-bold ${s.text}`}>{s.key}</div>
              <div className="text-2xl font-ui font-black mt-1 text-bc-text">{counts[s.key]}</div>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Barre de proportion du pipeline d'intégration — les 6 statuts forment un entonnoir,
          lecture d'un coup d'œil de la répartition (rigueur widget). */}
      {pool.length > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-bc-canvas" title="Répartition du pipeline d'intégration">
          {STATUSES.map(s => counts[s.key] > 0 && (
            <div
              key={s.key}
              className={`${s.bar} transition-all duration-500 ease-out-spring`}
              style={{ width: `${(counts[s.key] / pool.length) * 100}%` }}
              title={`${s.key} : ${counts[s.key]}`}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: filters + list */}
        <div className="lg:col-span-2 bg-white rounded-[2rem] border border-bc-border p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-bc-text-secondary" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un membre..."
              className="pl-9 pr-4 py-2.5 w-full border border-bc-border rounded-full text-xs focus:outline-none focus:border-bc-green"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={15} className="text-bc-text-secondary shrink-0" />
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="flex-1 border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
            >
              <option value="all">Tous les départements</option>
              {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="bg-bc-canvas/50 rounded-2xl border border-bc-border p-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-bc-text-secondary">Filtres de date</p>
            <div>
              <label className="text-[10px] text-bc-text-secondary font-bold">Enregistrement (du / au)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input type="date" value={regFrom} onChange={e => setRegFrom(e.target.value)} className="border border-bc-border rounded-lg px-2 py-1.5 text-[11px] bg-white" />
                <input type="date" value={regTo} onChange={e => setRegTo(e.target.value)} className="border border-bc-border rounded-lg px-2 py-1.5 text-[11px] bg-white" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-bc-text-secondary font-bold">Date du culte (du / au)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input type="date" value={culteFrom} onChange={e => setCulteFrom(e.target.value)} className="border border-bc-border rounded-lg px-2 py-1.5 text-[11px] bg-white" />
                <input type="date" value={culteTo} onChange={e => setCulteTo(e.target.value)} className="border border-bc-border rounded-lg px-2 py-1.5 text-[11px] bg-white" />
              </div>
            </div>
          </div>

          {/* Member list */}
          <motion.div variants={staggerParent} initial="hidden" animate="show" className="divide-y divide-bc-border max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-bc-text-secondary text-center py-8">Aucun membre pour ces filtres.</p>
            ) : (
              filtered.map(m => {
                const st = statusOf(m);
                const meta = statusMeta(st);
                return (
                  <motion.button
                    key={m.id}
                    variants={staggerItem}
                    onClick={() => selectMember(m)}
                    className={`w-full flex items-center gap-3 py-3 text-left transition-colors active-scale ${selectedId === m.id ? 'bg-bc-canvas' : 'hover:bg-bc-canvas/60'} rounded-xl px-2`}
                  >
                    <Avatar
                      src={m.avatarUrl}
                      initials={`${m.firstName[0]}${m.lastName[0]}`}
                      size="sm"
                      className="w-9 h-9 bg-bc-purple/10 text-bc-purple text-[10px] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-bc-text truncate">{m.lastName} {m.firstName}</p>
                      <p className="text-[10px] text-bc-text-secondary truncate">{deptNameOf(m) ?? 'Sans département'} · {m.ojFlag ? 'OJ' : 'NV'}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${meta.badge} shrink-0`}>{st}</span>
                    <ChevronRight size={14} className="text-bc-text-secondary shrink-0" />
                  </motion.button>
                );
              })
            )}
          </motion.div>
        </div>

        {/* Right: report editor / empty state */}
        <div className="lg:col-span-3 bg-white rounded-[2rem] border border-bc-border p-6">
          {!selected ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center">
              <ClipboardCheck size={40} className="text-bc-text-secondary mb-4" />
              <h3 className="font-ui font-bold text-bc-text">Sélectionne un membre à gauche</h3>
              <p className="text-xs text-bc-text-secondary mt-1 max-w-xs">Tu pourras enregistrer un rapport de suivi : statut d'intégration, contact établi, visite effectuée, notes et motif.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Member header */}
              <div className="flex items-center gap-3 pb-4 border-b border-bc-border">
                <Avatar
                  src={selected.avatarUrl}
                  initials={`${selected.firstName[0]}${selected.lastName[0]}`}
                  size="md"
                  className="w-12 h-12 bg-bc-purple/10 text-bc-purple"
                />
                <div className="flex-1">
                  <h3 className="text-lg font-ui font-bold text-bc-text">{selected.lastName} {selected.firstName}</h3>
                  <p className="text-xs text-bc-text-secondary flex items-center gap-2">
                    <span>{deptNameOf(selected) ?? 'Sans département'} · {selected.ojFlag ? 'OJ' : 'NV'}</span>
                    <span className="flex items-center gap-1"><Phone size={11} /> {selected.phone}</span>
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${statusMeta(statusOf(selected)).badge}`}>{statusOf(selected)}</span>
              </div>

              {/* Report form */}
              <div>
                <label className="text-xs font-bold text-bc-text block mb-2">Statut d'intégration</label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.filter(s => s.key !== 'Non suivi').map(s => (
                    <button
                      key={s.key}
                      onClick={() => setDraftStatus(s.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors active-scale ${draftStatus === s.key ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'}`}
                    >
                      {s.key}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDraftContact(v => !v)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors active-scale ${draftContact ? 'bg-bc-green/10 border-bc-green text-bc-text' : 'bg-white border-bc-border text-bc-text-secondary'}`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center ${draftContact ? 'bg-bc-green text-white' : 'border border-bc-border'}`}>{draftContact && <Check size={11} />}</span>
                  Contact établi
                </button>
                <button
                  onClick={() => setDraftVisit(v => !v)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors active-scale ${draftVisit ? 'bg-bc-green/10 border-bc-green text-bc-text' : 'bg-white border-bc-border text-bc-text-secondary'}`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center ${draftVisit ? 'bg-bc-green text-white' : 'border border-bc-border'}`}>{draftVisit && <Check size={11} />}</span>
                  Visite effectuée
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-bc-text block mb-1">Notes</label>
                <textarea
                  value={draftNotes}
                  onChange={e => setDraftNotes(e.target.value)}
                  rows={3}
                  placeholder="Compte-rendu du suivi…"
                  className="w-full border border-bc-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-bc-green resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-bc-text block mb-1">Motif (si à recontacter / non intégré)</label>
                <input
                  value={draftMotif}
                  onChange={e => setDraftMotif(e.target.value)}
                  placeholder="Motif…"
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                />
              </div>

              <button
                onClick={saveReport}
                className="w-full py-2.5 bg-bc-green text-white rounded-full text-xs font-ui font-bold flex items-center justify-center gap-2 hover:opacity-90 active-scale"
              >
                <Send size={14} /> Enregistrer le rapport
              </button>

              {/* Timeline */}
              {reportsFor(selected.id).length > 0 && (
                <div className="pt-4 border-t border-bc-border">
                  <h4 className="text-xs font-bold text-bc-text mb-3">Historique des rapports</h4>
                  <div className="space-y-2">
                    {reportsFor(selected.id).map(r => (
                      <div key={r.id} className="border border-bc-border rounded-2xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusMeta(r.status).badge}`}>{r.status}</span>
                          <span className="text-[10px] text-bc-text-secondary">{r.date}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {r.contactEstablished && <span className="text-[9px] font-bold text-bc-success flex items-center gap-0.5"><Check size={9} /> Contact établi</span>}
                          {r.visitDone && <span className="text-[9px] font-bold text-bc-success flex items-center gap-0.5"><Check size={9} /> Visite effectuée</span>}
                        </div>
                        {r.notes && <p className="text-xs text-bc-text">{r.notes}</p>}
                        {r.motif && <p className="text-[11px] text-bc-warning italic mt-0.5">Motif : {r.motif}</p>}
                        <p className="text-[10px] text-bc-text-secondary mt-1">par {r.authorName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
