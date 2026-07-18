import React, { useState } from 'react';
import { BarChart3, Download, Printer, SlidersHorizontal } from 'lucide-react';
import { Report, Branch, Member, Event } from '../types';
import { useBusLines, labelFor } from '../data';
import { weekId } from '../data/week';
import { isRed, moissonTotal, busVisitesTotal, busPresenceCulteTotal, busActivitesTotal } from '../data/kpi';

// Onglet Rapports = GÉNÉRATEUR à la carte (lot 4) : on choisit les indicateurs et la
// période, l'app génère le rapport (tableau + export CSV/impression). Le registre brut
// des rapports n'habite plus ici — chaque type se consulte dans son onglet dédié
// (dashboard ADN, Bloom Bus, Rapport de culte, Dénombrement).
const SYNTH_SECTIONS = [
  { key: 'effectifs', label: 'Effectifs & membres' },
  { key: 'presences', label: 'Présences par culte (Portiers + Bloom Bus)' },
  { key: 'bloombus', label: 'Bloom Bus' },
  { key: 'nouveaux', label: 'Nouveaux & intégration' },
  { key: 'cultes', label: 'Cultes & événements' },
  { key: 'rapports', label: 'Rapports saisis' },
] as const;

// Slot de culte d'un événement — fait le pont avec `content.culte` des rapports de suivi
// Bloom Bus (libellés de créneau stables, indépendants du nom du dimanche).
function culteSlotOf(e: Event): string | null {
  if (e.branch === 'light' && e.time === '10:00') return 'Culte Bloom Light';
  if (e.branch === 'church' && e.time === '07:00') return '1er culte Bloom Church';
  if (e.branch === 'church' && e.time === '13:00') return '2e culte Bloom Church';
  return null;
}

import { REPORT_NAMES } from '../data/reportNames';

interface ReportsViewProps {
  reports: Report[];
  activeBranch: Branch;
  simulatedRole: string;
  members: Member[];
  events: Event[];
}

export default function ReportsView({ reports, activeBranch, simulatedRole, members, events }: ReportsViewProps) {
  const isChurch = activeBranch === 'church';
  const today = new Date();
  const monthStartIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayIso = today.toISOString().split('T')[0];
  const [synthFrom, setSynthFrom] = useState(monthStartIso);
  const [synthTo, setSynthTo] = useState(todayIso);
  const [synthOn, setSynthOn] = useState<Record<string, boolean>>(
    Object.fromEntries(SYNTH_SECTIONS.map(s => [s.key, s.key === 'effectifs' || s.key === 'presences'])),
  );
  const busLines = useBusLines();

  const synthRows = (() => {
    const from = new Date(synthFrom);
    const to = new Date(synthTo);
    to.setHours(23, 59, 59, 999);
    if (!(from <= to)) return [];
    const period = { from, to };
    const inPeriod = (d?: string) => !!d && new Date(d) >= from && new Date(d) <= to;
    const scopeMembers = activeBranch === 'global' ? members : members.filter(m => m.branch === activeBranch);
    // Borne haute assurée par ce pré-filtre (les helpers kpi ne bornent que par le bas) ;
    // semaine visée (weekOf) prioritaire sur la date de saisie, comme partout ailleurs.
    const periodReports = reports.filter(r =>
      (activeBranch === 'global' || r.targetBranch === activeBranch) && inPeriod(r.weekOf ?? r.date),
    );
    const periodEvents = events.filter(e =>
      !e.cancelled && (activeBranch === 'global' || e.branch === activeBranch || e.branch === 'global') && inPeriod(e.date) && e.date <= todayIso,
    ).sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
    const busIds = busLines.map((b: { id: string }) => b.id);
    const rows: { section: string; label: string; value: number | string }[] = [];
    const add = (section: string, label: string, value: number | string) => rows.push({ section, label, value });

    if (synthOn.effectifs) {
      const S = 'Effectifs & membres';
      add(S, 'Membres (total)', scopeMembers.length);
      add(S, 'Hommes', scopeMembers.filter(m => m.gender === 'H').length);
      add(S, 'Femmes', scopeMembers.filter(m => m.gender === 'F').length);
      (['nouveau', 'stagiaire', 'boss', 'leader', 'coach'] as const).forEach(l =>
        add(S, `Niveau ${labelFor(l)}`, scopeMembers.filter(m => m.level === l).length),
      );
      add(S, 'Membres au rouge', scopeMembers.filter(m => isRed(m, to)).length);
      add(S, 'Arrivées sur la période', scopeMembers.filter(m => inPeriod(m.integrationDateRegistered || m.entryDate)).length);
      add(S, 'Baptêmes sur la période', scopeMembers.filter(m => m.baptismStatus === 'baptise' && inPeriod(m.baptismDate)).length);
    }
    if (synthOn.presences) {
      // Exemple canonique du générateur : effectifs de présence aux cultes (Portiers)
      // couplés aux présences Bloom Bus déclarées pour le même créneau.
      const S = 'Présences par culte';
      for (const e of periodEvents) {
        const label = `${e.title} (${new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR')})`;
        const portiers = reports.find(r => r.reportType === 'rapport_portiers' && r.eventId === e.id)?.content;
        const culte = reports.find(r => r.reportType === 'rapport_culte' && r.eventId === e.id)?.content;
        const men = Number(portiers?.men ?? 0);
        const women = Number(portiers?.women ?? 0);
        const online = Number(portiers?.online ?? 0);
        const total = Number(portiers?.total ?? culte?.attendancePortiers ?? men + women);
        add(S, `${label} — Présents (H)`, men);
        add(S, `${label} — Présentes (F)`, women);
        add(S, `${label} — En ligne`, online);
        add(S, `${label} — Total présents`, total);
        const slot = culteSlotOf(e);
        if (slot) {
          const week = weekId(e.date);
          const busPresence = periodReports.filter(r =>
            r.reportType === 'rapport_bloom_bus_member' && r.content?.culte === slot && (r.weekOf ?? weekId(r.date)) === week,
          ).length;
          add(S, `${label} — Présences Bloom Bus déclarées`, busPresence);
        }
      }
      if (periodEvents.length === 0) add(S, 'Aucun culte/événement sur la période', '—');
    }
    if (synthOn.bloombus) {
      const S = 'Bloom Bus';
      add(S, 'Lignes de bus', busIds.length);
      add(S, 'Âmes gagnées (moisson)', moissonTotal(periodReports, period, to, busIds));
      add(S, 'Visites / contacts membres', busVisitesTotal(periodReports, scopeMembers, busIds, period, to));
      add(S, 'Présences au culte déclarées', busPresenceCulteTotal(periodReports, scopeMembers, busIds, period, to));
      add(S, 'Activités de bus', busActivitesTotal(periodReports, busIds, period, to));
      const healthReports = periodReports.filter(r => r.reportType === 'rapport_bloom_bus_member');
      add(S, 'Rapports de suivi membre remplis', healthReports.length);
      const avgOf = (key: string) => {
        const vals = healthReports.map(r => Number(r.content?.[key] ?? 0)).filter(v => v >= 1);
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : '—';
      };
      add(S, 'Santé moyenne — Spirituelle (/5)', avgOf('sprVal'));
      add(S, 'Santé moyenne — Sociale (/5)', avgOf('socVal'));
      add(S, 'Santé moyenne — Physique (/5)', avgOf('phyVal'));
      add(S, 'Santé moyenne — Financière (/5)', avgOf('finVal'));
    }
    if (synthOn.nouveaux) {
      const S = 'Nouveaux & intégration';
      add(S, 'En attente', scopeMembers.filter(m => m.integrationState === 'en_attente').length);
      add(S, 'En suivi', scopeMembers.filter(m => m.integrationState === 'suivi').length);
      add(S, 'Intégrés', scopeMembers.filter(m => m.integrationState === 'integre').length);
      add(S, 'Réception non validée', scopeMembers.filter(m => m.receptionValidated === false).length);
    }
    if (synthOn.cultes) {
      const S = 'Cultes & événements';
      add(S, 'Événements sur la période', periodEvents.length);
      add(S, 'Rapports de culte', periodReports.filter(r => r.reportType === 'rapport_culte').length);
      add(S, 'Comptages ADN', periodReports.filter(r => r.reportType === 'rapport_adn').length);
      add(S, 'Comptages Portiers', periodReports.filter(r => r.reportType === 'rapport_portiers').length);
    }
    if (synthOn.rapports) {
      const S = 'Rapports saisis';
      add(S, 'Total rapports', periodReports.length);
      const byType = new Map<string, number>();
      periodReports.forEach(r => byType.set(r.reportType, (byType.get(r.reportType) ?? 0) + 1));
      Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => add(S, REPORT_NAMES[t] ?? t, n));
    }
    return rows;
  })();

  const downloadSynthCsv = () => {
    const esc = (c: string) => `"${c.replace(/"/g, '""')}"`;
    const lines = [['Section', 'Indicateur', 'Valeur'], ...synthRows.map(r => [r.section, r.label, String(r.value)])];
    // BOM UTF-8 + « ; » : ouverture directe et accents corrects dans Excel FR.
    const csv = '\uFEFF' + lines.map(l => l.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_bloomcore_${synthFrom}_${synthTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sections = [...new Set(synthRows.map(r => r.section))];

  return (
    <div className="space-y-6">
      {/* Composer : période + indicateurs */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-ui font-extrabold text-bc-text flex items-center gap-2">
              <SlidersHorizontal size={18} /> Générateur de rapport
            </h2>
            <p className="text-xs text-bc-text-secondary mt-0.5">
              Choisissez les chiffres et statistiques à inclure, la période, puis générez — export Excel ou PDF.
              Branche : <span className="font-bold text-bc-text">{activeBranch === 'global' ? 'Global' : isChurch ? 'Bloom Church' : 'Bloom Light'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-bc-text-secondary uppercase">Du</label>
            <input id="synth-from" type="date" value={synthFrom} onChange={(e) => setSynthFrom(e.target.value)}
              className="border border-bc-border rounded-full text-xs py-1.5 px-3 bg-white focus:outline-none focus:border-bc-green" />
            <label className="text-[10px] font-bold text-bc-text-secondary uppercase">au</label>
            <input id="synth-to" type="date" value={synthTo} onChange={(e) => setSynthTo(e.target.value)}
              className="border border-bc-border rounded-full text-xs py-1.5 px-3 bg-white focus:outline-none focus:border-bc-green" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SYNTH_SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSynthOn((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors active-scale ${
                synthOn[s.key] ? 'bg-bc-green text-white border-bc-green' : 'bg-white text-bc-text-secondary border-bc-border hover:bg-bc-canvas'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] text-bc-text-secondary font-medium">
            {synthRows.length} indicateur{synthRows.length > 1 ? 's' : ''} sur la période — le CSV s'ouvre dans Excel ; PDF via la boîte d'impression.
          </span>
          <div className="flex gap-2">
            <button
              id="synth-export-csv"
              onClick={downloadSynthCsv}
              disabled={synthRows.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-opacity active-scale disabled:opacity-40"
            >
              <Download size={13} /> Exporter CSV (Excel)
            </button>
            <button
              id="synth-print-pdf"
              onClick={() => window.print()}
              disabled={synthRows.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white text-bc-text border border-bc-border rounded-full text-xs font-bold hover:bg-bc-canvas transition-colors active-scale disabled:opacity-40"
            >
              <Printer size={13} /> Imprimer / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Rapport généré — visible à l'écran ET imprimable */}
      <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm print:border-0 print:shadow-none print:p-0">
        <h3 className="text-sm font-ui font-bold text-bc-text mb-1 flex items-center gap-2">
          <BarChart3 size={16} /> Rapport BloomCore — du {new Date(`${synthFrom}T12:00:00`).toLocaleDateString('fr-FR')} au {new Date(`${synthTo}T12:00:00`).toLocaleDateString('fr-FR')}
        </h3>
        <p className="text-[10px] text-bc-text-secondary mb-4">
          {activeBranch === 'global' ? 'Global (2 branches)' : isChurch ? 'Bloom Church' : 'Bloom Light'} — généré le {today.toLocaleDateString('fr-FR')}
        </p>
        {synthRows.length === 0 ? (
          <p className="text-xs text-bc-text-secondary italic text-center py-10">Sélectionnez au moins un bloc d'indicateurs.</p>
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <div key={section}>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-bc-text-secondary border-b border-bc-border pb-1 mb-2">{section}</h4>
                <table className="w-full text-xs">
                  <tbody>
                    {synthRows.filter(r => r.section === section).map((r, i) => (
                      <tr key={i} className="border-b border-bc-border/40 last:border-0">
                        <td className="py-1.5 pr-3 text-bc-text">{r.label}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums text-bc-text">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
