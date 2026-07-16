import React, { useState } from 'react';
import { DoorOpen, CheckCircle, Wifi } from 'lucide-react';
import { Member, Report, Event, Branch } from '../types';
import { toast } from './ui/Toast';

// Onglet Dénombrement — département Portier (lot 4) : par culte/événement, nombre de
// présents (hommes / femmes) et de personnes connectées en ligne. Un seul comptage
// officiel par événement (upsert, concilié avec la clôture d'EventsView).
// Visibilité : matrice view_denombrement = staff (pasteurs/ministres/admins) + Portier.
interface DenombrementViewProps {
  events: Event[];
  reports: Report[];
  operator?: Member;
  activeBranch: Branch;
  simulatedRole: string;
  onAddReport: (r: Report) => void;
  onUpdateReport: (r: Report) => void;
}

export default function DenombrementView({ events, reports, operator, activeBranch, simulatedRole, onAddReport, onUpdateReport }: DenombrementViewProps) {
  const todayIso = new Date().toISOString().split('T')[0];
  const floor = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  const recent = events
    .filter((e) => !e.cancelled && (activeBranch === 'global' || e.branch === activeBranch || e.branch === 'global') && e.date >= floor && e.date <= todayIso)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));

  const reportOf = (eventId: string) => reports.find((r) => r.reportType === 'rapport_portiers' && r.eventId === eventId);

  const [eventId, setEventId] = useState('');
  const [men, setMen] = useState(0);
  const [women, setWomen] = useState(0);
  const [online, setOnline] = useState(0);
  const existing = eventId ? reportOf(eventId) : undefined;

  const selectEvent = (id: string) => {
    setEventId(id);
    const c = reportOf(id)?.content ?? {};
    setMen(Number(c.men ?? 0));
    setWomen(Number(c.women ?? 0));
    setOnline(Number(c.online ?? 0));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !operator) return;
    const ev = events.find((x) => x.id === eventId);
    const content = { men, women, total: men + women, online };
    if (existing) {
      onUpdateReport({ ...existing, content: { ...existing.content, ...content } });
    } else {
      onAddReport({
        id: `rep_portiers_${Date.now()}`,
        authorId: operator.id,
        authorName: `${operator.firstName} ${operator.lastName}`,
        authorRole: simulatedRole,
        targetBranch: ev?.branch === 'global' ? (activeBranch === 'global' ? 'church' : activeBranch) : (ev?.branch ?? (activeBranch === 'global' ? 'church' : activeBranch)),
        date: ev?.date ?? todayIso,
        reportType: 'rapport_portiers',
        eventId,
        departmentId: 'dept_ushers',
        confidential: false,
        content,
      });
    }
    toast.success('Dénombrement enregistré pour cet événement.');
  };

  const inputCls = 'w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none focus:border-bc-green';
  const labelCls = 'block text-xs font-bold text-bc-text mb-1';

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm">
        <h2 className="text-lg font-ui font-extrabold text-bc-text flex items-center gap-2 mb-1">
          <DoorOpen size={20} /> Dénombrement — Portiers
        </h2>
        <p className="text-xs text-bc-text-secondary">Présents (hommes / femmes) et connectés en ligne, par culte/événement.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Saisie */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Culte / Événement *</label>
              <select id="denomb-event" required value={eventId} onChange={(e) => selectEvent(e.target.value)} className={inputCls}>
                <option value="">— Sélectionner —</option>
                {recent.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {new Date(`${ev.date}T12:00:00`).toLocaleDateString('fr-FR')}{ev.time ? ` ${ev.time}` : ''}
                  </option>
                ))}
              </select>
              {existing && <p className="text-[10px] text-bc-warning font-bold mt-1">Un dénombrement existe déjà — l'enregistrement le mettra à jour.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Hommes présents</label>
                <input id="denomb-men" type="number" min={0} value={men} onChange={(e) => setMen(Math.max(0, Number(e.target.value)))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Femmes présentes</label>
                <input id="denomb-women" type="number" min={0} value={women} onChange={(e) => setWomen(Math.max(0, Number(e.target.value)))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}><Wifi size={10} className="inline mr-1" />Connectés en ligne</label>
                <input id="denomb-online" type="number" min={0} value={online} onChange={(e) => setOnline(Math.max(0, Number(e.target.value)))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Total présents</label>
                <div className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-bc-canvas font-black tabular-nums">{men + women}</div>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-bc-border">
              <button id="denomb-submit" type="submit" disabled={!eventId} className="flex items-center gap-2 px-5 py-2 bg-bc-green text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active-scale disabled:opacity-40">
                <CheckCircle size={13} /> {existing ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>

        {/* Historique */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-7">
          <h3 className="text-sm font-ui font-bold text-bc-text mb-3">Dénombrements saisis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-bc-border text-bc-text-secondary">
                  <th className="py-2 pr-3">Événement</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 text-right">H</th>
                  <th className="py-2 pr-3 text-right">F</th>
                  <th className="py-2 pr-3 text-right">En ligne</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.filter((ev) => reportOf(ev.id)).map((ev) => {
                  const c = reportOf(ev.id)!.content ?? {};
                  return (
                    <tr key={ev.id} className="border-b border-bc-border/50 hover:bg-bc-canvas/40 cursor-pointer" onClick={() => selectEvent(ev.id)}>
                      <td className="py-2 pr-3 font-bold text-bc-text">{ev.title}</td>
                      <td className="py-2 pr-3 text-bc-text-secondary">{new Date(`${ev.date}T12:00:00`).toLocaleDateString('fr-FR')}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{Number(c.men ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{Number(c.women ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{Number(c.online ?? 0)}</td>
                      <td className="py-2 text-right font-bold tabular-nums">{Number(c.total ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {recent.every((ev) => !reportOf(ev.id)) && (
              <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucun dénombrement saisi sur les 30 derniers jours.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
