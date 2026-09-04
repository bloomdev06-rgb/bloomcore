import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { Department, Member, Report } from '../types';
import { apiAssignPoleMember, apiCreatePoleFollowup, apiPoleCandidates, apiRemovePoleMember, PoleCandidate } from '../data';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';

interface PoleViewProps {
  operator: Member;
  members: Member[];
  reports: Report[];
  departments: Department[];
  onMemberChanged: (member: Member) => void;
  onReportAdded: (report: Report) => void;
}

export default function PoleView({ operator, members, reports, departments, onMemberChanged, onReportAdded }: PoleViewProps) {
  const ledPoles = useMemo(() => Object.entries(operator.departments ?? {}).flatMap(([departmentId, fn]) => {
    if (fn !== 'responsable_section') return [];
    const sectionId = operator.deptSections?.[departmentId];
    const department = departments.find((d) => d.id === departmentId);
    const section = department?.sections?.find((s) => s.id === sectionId);
    return sectionId && department && section ? [{ department, section }] : [];
  }), [operator, departments]);
  const [selection, setSelection] = useState('');
  const [candidates, setCandidates] = useState<PoleCandidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [followMemberId, setFollowMemberId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selection && ledPoles[0]) setSelection(`${ledPoles[0].department.id}:${ledPoles[0].section.id}`);
  }, [ledPoles, selection]);
  const current = ledPoles.find(({ department, section }) => `${department.id}:${section.id}` === selection);
  const poleMembers = current ? members.filter((m) =>
    m.id !== operator.id
    && m.departments?.[current.department.id] !== undefined
    && m.deptSections?.[current.department.id] === current.section.id) : [];
  const poleReports = current ? reports.filter((r) => r.departmentId === current.department.id && r.sectionId === current.section.id) : [];

  const refreshCandidates = useCallback(async () => {
    if (!current) return setCandidates([]);
    setCandidates(await apiPoleCandidates(current.department.id, current.section.id));
  }, [current]);
  useEffect(() => { void refreshCandidates(); }, [refreshCandidates]);

  const addMember = async () => {
    if (!current || !candidateId) return;
    setBusy(true);
    const result = await apiAssignPoleMember(current.department.id, current.section.id, candidateId);
    setBusy(false);
    if (!result.ok) return toast.error(result.error ?? 'Ajout impossible');
    onMemberChanged(result.data as Member);
    setCandidateId('');
    await refreshCandidates();
    toast.success('Membre ajouté au pôle');
  };

  const removeMember = async (memberId: string) => {
    if (!current) return;
    setBusy(true);
    const result = await apiRemovePoleMember(current.department.id, current.section.id, memberId);
    setBusy(false);
    if (!result.ok) return toast.error(result.error ?? 'Retrait impossible');
    onMemberChanged(result.data as Member);
    await refreshCandidates();
    toast.success('Membre retiré du pôle');
  };

  const saveFollowup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || !followMemberId || !notes.trim()) return;
    setBusy(true);
    const result = await apiCreatePoleFollowup(current.department.id, current.section.id, followMemberId, notes.trim());
    setBusy(false);
    if (!result.ok) return toast.error(result.error ?? 'Suivi impossible');
    onReportAdded(result.data as Report);
    setFollowMemberId('');
    setNotes('');
    toast.success('Suivi enregistré');
  };

  if (!ledPoles.length) return (
    <div className="p-6 lg:p-10">
      <div className="max-w-2xl rounded-2xl border border-bc-border bg-white p-6">
        <h2 className="font-ui text-xl font-bold text-bc-text">Mon pôle</h2>
        <p className="mt-2 text-sm text-bc-text-secondary">Aucun pôle actif n’est rattaché à votre fonction de Responsable de pôle.</p>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-bc-green">Espace de suivi</p>
            <h2 className="font-ui text-2xl font-extrabold text-bc-text">Mon pôle</h2>
            <p className="mt-1 text-sm text-bc-text-secondary">Membres confiés, affectations et suivis de votre périmètre uniquement.</p>
          </div>
          {ledPoles.length > 1 && (
            <label className="text-xs font-bold text-bc-text-secondary">
              Pôle actif
              <select value={selection} onChange={(e) => setSelection(e.target.value)} className="mt-1 block min-h-11 rounded-xl border border-bc-border bg-white px-3 text-sm text-bc-text">
                {ledPoles.map(({ department, section }) => <option key={`${department.id}:${section.id}`} value={`${department.id}:${section.id}`}>{department.name} · {section.name}</option>)}
              </select>
            </label>
          )}
        </header>

        {current && <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-bc-border bg-white p-5 sm:p-6" aria-labelledby="pole-members-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="pole-members-title" className="font-ui font-bold text-bc-text">{current.department.name} · {current.section.name}</h3>
                <p className="text-xs text-bc-text-secondary">{poleMembers.length} membre{poleMembers.length > 1 ? 's' : ''}, stagiaires inclus</p>
              </div>
              <Users className="text-bc-green" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-2">
              {!poleMembers.length && <p className="rounded-xl bg-bc-canvas p-4 text-sm text-bc-text-secondary">Aucun membre n’est encore affecté à ce pôle.</p>}
              {poleMembers.map((member) => (
                <div key={member.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-bc-border px-3 py-2">
                  <Avatar src={member.avatarUrl} initials={`${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`} className="bg-bc-green/10 text-bc-green" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-bc-text">{member.firstName} {member.lastName}</p>
                    <p className="text-xs capitalize text-bc-text-secondary">{member.level === 'stagiaire' ? 'Stagiaire confié' : member.level}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void removeMember(member.id)} className="min-h-11 min-w-11 rounded-full text-bc-text-secondary hover:bg-red-50 hover:text-bc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-green/50" aria-label={`Retirer ${member.firstName} ${member.lastName} du pôle`}>
                    <UserMinus className="mx-auto" size={17} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-bc-border pt-5">
              <label htmlFor="pole-candidate" className="text-sm font-bold text-bc-text">Ajouter un membre déjà inscrit</label>
              <p className="mb-2 text-xs text-bc-text-secondary">Seuls les membres validés de ce département et sans pôle sont proposés.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select id="pole-candidate" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} className="min-h-12 flex-1 rounded-xl border border-bc-border bg-white px-3 text-sm">
                  <option value="">Choisir un membre…</option>
                  {candidates.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                </select>
                <Button onClick={() => void addMember()} disabled={!candidateId} loading={busy} icon={<UserPlus size={16} />}>Ajouter</Button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-bc-border bg-white p-5 sm:p-6" aria-labelledby="pole-follow-title">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="text-bc-green" size={20} aria-hidden="true" />
              <h3 id="pole-follow-title" className="font-ui font-bold text-bc-text">Nouveau suivi</h3>
            </div>
            <form onSubmit={saveFollowup} className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-bc-text-secondary">Membre
                <select value={followMemberId} onChange={(e) => setFollowMemberId(e.target.value)} required className="mt-1 min-h-12 w-full rounded-xl border border-bc-border bg-white px-3 text-sm text-bc-text">
                  <option value="">Choisir…</option>
                  {poleMembers.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-bc-text-secondary">Notes de suivi
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} required maxLength={5000} rows={5} className="mt-1 w-full resize-y rounded-xl border border-bc-border p-3 text-sm text-bc-text" placeholder="Points observés, accompagnement et prochaine étape…" />
              </label>
              <Button type="submit" loading={busy} disabled={!followMemberId || !notes.trim()} className="w-full">Enregistrer le suivi</Button>
            </form>
            <div className="mt-6 border-t border-bc-border pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-bc-text-secondary">Historique du pôle</p>
              <p className="mt-1 text-2xl font-extrabold text-bc-text">{poleReports.length}</p>
              <p className="text-xs text-bc-text-secondary">suivi{poleReports.length > 1 ? 's' : ''} enregistré{poleReports.length > 1 ? 's' : ''}</p>
            </div>
          </section>
        </div>}
      </div>
    </div>
  );
}
