import React, { useMemo, useState } from 'react';
import { History, Shield, Clock, ArrowRight, Database, Search, Download } from 'lucide-react';
import { AuditLog, Branch } from '../types';
import { periodRange, Period } from '../data/kpi';

interface AuditViewProps {
  audits: AuditLog[];
  activeBranch: Branch;
}

// Entity affected by a log — stored if present, else derived from the action type.
const entityOf = (a: AuditLog): string => {
  if (a.entity) return a.entity;
  const t = a.actionType;
  if (t.startsWith('MEMBER') || t === 'BRANCH_TRANSFER') return 'Membre';
  if (t.startsWith('BAPTISM')) return 'Baptême';
  if (t.startsWith('ROLE')) return 'Rôle & Permissions';
  if (t.startsWith('ADMIN')) return 'Compte Admin';
  if (t.startsWith('REPORT')) return 'Rapport';
  if (t.startsWith('EVENT')) return 'Événement';
  if (t.startsWith('CERT') || t.startsWith('FORMATION')) return 'Formation';
  return 'Autre';
};
const BRANCH_LABEL: Record<Branch, string> = { church: 'Bloom Church', light: 'Bloom Light', global: 'Global' };

export default function AuditView({ audits }: AuditViewProps) {
  const [search, setSearch] = useState('');
  const [actionType, setActionType] = useState('all');
  const [operator, setOperator] = useState('all');
  const [entity, setEntity] = useState('all');
  const [branch, setBranch] = useState<Branch | 'all'>('all');
  const [period, setPeriod] = useState<Period>('custom');

  const actionTypes = useMemo(() => Array.from(new Set(audits.map(a => a.actionType))).sort(), [audits]);
  const operators = useMemo(() => Array.from(new Set(audits.map(a => a.operatorName))).sort(), [audits]);
  const entities = useMemo(() => Array.from(new Set(audits.map(entityOf))).sort(), [audits]);

  const filtered = useMemo(() => {
    const { from } = periodRange(period);
    const q = search.toLowerCase();
    return audits.filter(a =>
      (actionType === 'all' || a.actionType === actionType) &&
      (operator === 'all' || a.operatorName === operator) &&
      (entity === 'all' || entityOf(a) === entity) &&
      (branch === 'all' || a.branch === branch) &&
      new Date(a.timestamp) >= from &&
      (q === '' || a.details.toLowerCase().includes(q) || a.operatorName.toLowerCase().includes(q))
    );
  }, [audits, search, actionType, operator, entity, branch, period]);

  const exportCsv = () => {
    const cell = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['timestamp', 'actionType', 'operator', 'operatorId', 'previous', 'new', 'details'],
      ...filtered.map(a => [a.timestamp, a.actionType, a.operatorName, a.operatorId, a.previousValue ?? '', a.newValue ?? '', a.details]),
    ];
    const csv = rows.map(r => r.map(cell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Journal d'Audit Central & Immuabilité
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Historique complet des actions d'encadrement, d'enregistrement ADN et d'administration de la base d'Abidjan.
          </p>
        </div>

        <span className="text-[10px] bg-bc-purple/10 text-bc-purple border border-bc-purple/20 px-3 py-1 rounded-full font-bold flex items-center gap-1">
          <Database size={12} /> Journal Inviolable
        </span>
      </div>

      {/* Filters toolbar */}
      <div className="bg-white p-4 rounded-[2rem] border border-bc-border shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bc-text-secondary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (détail, opérateur)…"
            className="w-full border border-bc-border rounded-full pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-bc-green"
          />
        </div>
        <select value={actionType} onChange={e => setActionType(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="all">Toutes les actions</option>
          {actionTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={operator} onChange={e => setOperator(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="all">Tous les opérateurs</option>
          {operators.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={entity} onChange={e => setEntity(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="all">Toutes les entités</option>
          {entities.map(en => <option key={en} value={en}>{en}</option>)}
        </select>
        <select value={branch} onChange={e => setBranch(e.target.value as Branch | 'all')} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="all">Toutes les branches</option>
          <option value="church">Bloom Church</option>
          <option value="light">Bloom Light</option>
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="custom">Toute période</option>
          <option value="week">7 derniers jours</option>
          <option value="month">30 derniers jours</option>
          <option value="year">12 derniers mois</option>
        </select>
        <button onClick={exportCsv} className="flex items-center gap-1.5 bg-bc-green text-white rounded-full px-4 py-2 text-xs font-bold hover:opacity-90">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Audit List Timeline */}
      <div className="bg-white border border-bc-border shadow-sm rounded-[2rem] p-6 space-y-6">
        <h4 className="text-xs uppercase font-bold tracking-wider text-bc-text-secondary">
          ⏱ Chronologie des opérations récentes · {filtered.length} entrée(s)
        </h4>

        <div className="relative border-l border-bc-border pl-6 space-y-6">
          {filtered.length === 0 && (
            <p className="text-xs text-bc-text-secondary italic">Aucune entrée pour ces filtres.</p>
          )}
          {filtered.map((log) => (
            <div key={log.id} className="relative group">
              {/* Timeline marker */}
              <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${
                log.actionType === 'BAPTISM_COMPLETED' ? 'bg-bc-gold' :
                log.actionType === 'ROLE_PERMISSION_UPDATED' ? 'bg-bc-purple' :
                'bg-bc-green'
              }`} />

              <div className="space-y-1 bg-bc-canvas/20 border border-bc-border hover:bg-bc-canvas/40 transition-colors p-4 rounded-full max-w-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="font-ui font-bold text-xs text-bc-text tracking-tight uppercase">
                    🛠 {log.actionType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-bc-text-secondary font-mono flex items-center gap-1">
                    <Clock size={11} /> {log.timestamp.replace('T', ' ').split('.')[0]}
                  </span>
                </div>

                <p className="text-xs text-bc-text-secondary leading-relaxed pt-1.5 font-serif">
                  {log.details}
                </p>

                {/* Old / New Value indicators if present */}
                {(log.previousValue || log.newValue) && (
                  <div className="mt-2.5 flex items-center space-x-2 text-[9px] font-mono font-bold bg-white border border-bc-border/60 rounded-full p-2 max-w-fit">
                    <span className="text-bc-text-secondary uppercase">Ancien :</span>
                    <span className="text-bc-purple line-through">{log.previousValue || 'N/A'}</span>
                    <ArrowRight size={10} className="text-bc-text-secondary" />
                    <span className="text-bc-text-secondary uppercase">Nouveau :</span>
                    <span className="text-bc-text">{log.newValue || 'N/A'}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-bc-text-secondary">{entityOf(log)}</span>
                  {log.branch && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-bc-cerulean/10 text-bc-cerulean">{BRANCH_LABEL[log.branch]}</span>}
                </div>

                <div className="pt-2 border-t border-bc-border/40 mt-3 flex items-center justify-between text-[10px] text-bc-text-secondary font-medium">
                  <span>Opérateur : <span className="font-bold text-bc-text">{log.operatorName}</span></span>
                  <span className="font-mono text-[9px] uppercase">ID: {log.operatorId}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
