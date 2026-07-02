import React, { useMemo, useState } from 'react';
import { Branch, Project, ProjectTask } from '../types';
import { Activity, Target, Users, Calendar, ArrowLeft, Plus, X, Check } from 'lucide-react';
import { useProjects, useMinistries } from '../data';

interface ProjectsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

const COLUMNS: { key: ProjectTask['status']; label: string }[] = [
  { key: 'todo', label: 'À faire' },
  { key: 'doing', label: 'En cours' },
  { key: 'done', label: 'Fait' },
];

const TEAM_ROLES = ['PMO', 'Responsable COM', 'Logistique', 'Finance', 'Membre'];

export default function ProjectsView({ activeBranch, simulatedRole }: ProjectsViewProps) {
  const seed = useProjects();
  const ministries = useMinistries();
  const ministryName = (id?: string) => ministries.find((m) => m.id === id)?.name ?? 'Ministère';
  const scopeLabel = (p: Project) =>
    p.scope === 'both' ? 'Transverse' : p.scope === 'ministry' ? ministryName(p.ministryId) : p.scope === 'church' ? 'Bloom Church' : 'Bloom Light';
  // ponytail: local session state; move mutations to ./data when the backend lands.
  const [projects, setProjects] = useState<Project[]>(seed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = ['Pasteur', 'Admin', 'Responsable', 'Super Admin', 'Ministre'].includes(simulatedRole);

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (p.scope === 'both' || p.scope === 'ministry' || activeBranch === 'global' || p.scope === activeBranch) &&
          (filterStatus === 'all' || p.status === filterStatus),
      ),
    [projects, activeBranch, filterStatus],
  );

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Project>) =>
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const moveTask = (project: Project, taskId: string, dir: -1 | 1) => {
    const order: ProjectTask['status'][] = ['todo', 'doing', 'done'];
    update(project.id, {
      actions: (project.actions ?? []).map((t) => {
        if (t.id !== taskId) return t;
        const i = Math.max(0, Math.min(2, order.indexOf(t.status) + dir));
        return { ...t, status: order[i] };
      }),
    });
  };

  const toggleObjective = (project: Project, objId: string) =>
    update(project.id, {
      objectives: (project.objectives ?? []).map((o) => (o.id === objId ? { ...o, done: !o.done } : o)),
    });

  // --- Editing handlers (§16: objectifs, actions, équipe éditables) ---
  const addObjective = (project: Project, label: string) =>
    update(project.id, { objectives: [...(project.objectives ?? []), { id: `o_${Date.now()}`, label, done: false }] });
  const removeObjective = (project: Project, objId: string) =>
    update(project.id, { objectives: (project.objectives ?? []).filter((o) => o.id !== objId) });
  const addAction = (project: Project, title: string, assignee: string, due: string) =>
    update(project.id, { actions: [...(project.actions ?? []), { id: `a_${Date.now()}`, title, assignee: assignee || 'Non assigné', due: due || undefined, status: 'todo' }] });
  const addTeamMember = (project: Project, member: string, role: string) =>
    update(project.id, { team: [...(project.team ?? []), { member, role }] });
  const removeTeamMember = (project: Project, idx: number) =>
    update(project.id, { team: (project.team ?? []).filter((_, i) => i !== idx) });

  // Inline add-form inputs
  const [newObj, setNewObj] = useState('');
  const [newActTitle, setNewActTitle] = useState('');
  const [newActAssignee, setNewActAssignee] = useState('');
  const [newActDue, setNewActDue] = useState('');
  const [newTeamMember, setNewTeamMember] = useState('');
  const [newTeamRole, setNewTeamRole] = useState(TEAM_ROLES[0]);

  // ---------- Project space (detail) ----------
  if (selected) {
    const objs = selected.objectives ?? [];
    const done = objs.filter((o) => o.done).length;
    const progress = objs.length ? Math.round((done / objs.length) * 100) : 0;
    const actions = selected.actions ?? [];

    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-xs font-bold text-bc-text-secondary hover:text-bc-text">
          <ArrowLeft size={14} /> Retour aux projets
        </button>

        <div className="flex flex-wrap justify-between items-end gap-3">
          <div>
            <h2 className="text-2xl font-ui font-extrabold text-bc-text tracking-tight">{selected.name}</h2>
            <p className="text-xs text-bc-text-secondary mt-0.5">
              PMO : {selected.pmo} · {scopeLabel(selected)}
              {selected.endDate && ` · échéance ${selected.endDate}`}
            </p>
          </div>
          <span className="text-[10px] font-bold px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">{selected.status}</span>
        </div>

        {/* Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={<Target size={14} />} label="Objectifs" value={`${done}/${objs.length}`} />
          <Stat icon={<Activity size={14} />} label="Avancement" value={`${progress}%`} />
          <Stat icon={<Users size={14} />} label="Équipe" value={`${(selected.team ?? []).length}`} />
          <Stat icon={<Calendar size={14} />} label="Actions" value={`${actions.filter((a) => a.status !== 'done').length} ouvertes`} />
        </div>
        <div className="h-2 bg-bc-canvas rounded-full overflow-hidden">
          <div className="h-full bg-bc-green transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Team */}
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
            <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2"><Users size={16} /> Équipe</h3>
            <div className="space-y-2">
              {(selected.team ?? []).length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun membre.</p>}
              {(selected.team ?? []).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2">
                  <span className="font-bold text-bc-text">{t.member}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-bc-text-secondary">{t.role}</span>
                    {canCreate && <button onClick={() => removeTeamMember(selected, i)} className="text-bc-text-secondary hover:text-red-500"><X size={12} /></button>}
                  </div>
                </div>
              ))}
            </div>
            {canCreate && (
              <div className="mt-3 pt-3 border-t border-bc-border space-y-2">
                <input value={newTeamMember} onChange={(e) => setNewTeamMember(e.target.value)} placeholder="Membre…" className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                <div className="flex gap-2">
                  <select value={newTeamRole} onChange={(e) => setNewTeamRole(e.target.value)} className="flex-1 border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white">
                    {TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => { if (newTeamMember.trim()) { addTeamMember(selected, newTeamMember.trim(), newTeamRole); setNewTeamMember(''); } }}
                    disabled={!newTeamMember.trim()}
                    className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40"
                  ><Plus size={13} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Objectives checklist */}
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
            <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2"><Target size={16} /> Objectifs</h3>
            <div className="space-y-2">
              {objs.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun objectif.</p>}
              {objs.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-xs py-1.5 group">
                  <button onClick={() => toggleObjective(selected, o.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${o.done ? 'bg-bc-green border-bc-green text-white' : 'border-bc-border'}`}>
                      {o.done && <Check size={11} />}
                    </span>
                    <span className={o.done ? 'line-through text-bc-text-secondary' : 'text-bc-text'}>{o.label}</span>
                  </button>
                  {canCreate && <button onClick={() => removeObjective(selected, o.id)} className="text-bc-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={12} /></button>}
                </div>
              ))}
            </div>
            {canCreate && (
              <div className="mt-3 pt-3 border-t border-bc-border flex gap-2">
                <input value={newObj} onChange={(e) => setNewObj(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newObj.trim()) { addObjective(selected, newObj.trim()); setNewObj(''); } }} placeholder="Nouvel objectif…" className="flex-1 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                <button onClick={() => { if (newObj.trim()) { addObjective(selected, newObj.trim()); setNewObj(''); } }} disabled={!newObj.trim()} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40"><Plus size={13} /></button>
              </div>
            )}
          </div>

          {/* Kanban */}
          <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-1">
            <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2"><Activity size={16} /> Actions</h3>
            {canCreate && (
              <div className="mb-4 pb-4 border-b border-bc-border space-y-2">
                <input value={newActTitle} onChange={(e) => setNewActTitle(e.target.value)} placeholder="Nouvelle action…" className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                <div className="flex gap-2">
                  <input value={newActAssignee} onChange={(e) => setNewActAssignee(e.target.value)} placeholder="Responsable" className="flex-1 min-w-0 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                  <input type="date" value={newActDue} onChange={(e) => setNewActDue(e.target.value)} className="border border-bc-border rounded-full px-2 py-1.5 text-[11px] bg-white" />
                  <button
                    onClick={() => { if (newActTitle.trim()) { addAction(selected, newActTitle.trim(), newActAssignee.trim(), newActDue); setNewActTitle(''); setNewActAssignee(''); setNewActDue(''); } }}
                    disabled={!newActTitle.trim()}
                    className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40 shrink-0"
                  ><Plus size={13} /></button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {COLUMNS.map((col) => (
                <div key={col.key}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-1.5">{col.label}</p>
                  <div className="space-y-1.5">
                    {actions.filter((a) => a.status === col.key).map((a) => (
                      <div key={a.id} className="bg-bc-canvas/50 border border-bc-border rounded-xl px-3 py-2 text-xs">
                        <div className="font-bold text-bc-text">{a.title}</div>
                        <div className="text-[10px] text-bc-text-secondary">{a.assignee}{a.due && ` · ${a.due}`}</div>
                        <div className="flex gap-1 mt-1.5">
                          {col.key !== 'todo' && <button onClick={() => moveTask(selected, a.id, -1)} className="text-[10px] px-2 py-0.5 rounded-full border border-bc-border hover:bg-white">◀</button>}
                          {col.key !== 'done' && <button onClick={() => moveTask(selected, a.id, 1)} className="text-[10px] px-2 py-0.5 rounded-full border border-bc-border hover:bg-white">▶</button>}
                        </div>
                      </div>
                    ))}
                    {actions.filter((a) => a.status === col.key).length === 0 && <p className="text-[10px] text-bc-text-secondary italic">—</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- List ----------
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2 tracking-tight">
            <Activity size={28} /> Module Projets
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">Initiatives, objectifs et actions de l'organisation.</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 transition-colors shadow-sm flex items-center gap-1.5">
            <Plus size={14} /> Nouveau Projet
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-bc-border rounded-full px-3 py-2 text-xs bg-white">
          <option value="all">Tous les statuts</option>
          <option value="Planifié">Planifié</option>
          <option value="En cours">En cours</option>
          <option value="Terminé">Terminé</option>
        </select>
        <span className="text-xs text-bc-text-secondary self-center">{filtered.length} projet(s)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((project) => {
          const objs = project.objectives ?? [];
          const done = objs.filter((o) => o.done).length;
          return (
            <div key={project.id} onClick={() => setSelectedId(project.id)} className="bg-white border border-bc-border rounded-[1.5rem] p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-sm text-bc-text group-hover:underline">{project.name}</h4>
                  <p className="text-[10px] text-bc-text-secondary">PMO : {project.pmo} • {scopeLabel(project)}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">{project.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Mini icon={<Target size={14} className="text-slate-400 mb-1" />} value={`${done}/${objs.length} Obj.`} />
                <Mini icon={<Users size={14} className="text-slate-400 mb-1" />} value={`${(project.team ?? []).length} Memb.`} />
                <Mini icon={<Calendar size={14} className="text-slate-400 mb-1" />} value={project.endDate ?? 'À définir'} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun projet pour ces filtres.</p>}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={(p) => { setProjects((prev) => [p, ...prev]); setShowCreate(false); }} />}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
      <div className="flex items-center gap-2 text-bc-text-secondary mb-1">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
      <div className="text-lg font-ui font-extrabold text-bc-text">{value}</div>
    </div>
  );
}

function Mini({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="bg-bc-canvas rounded-xl p-2 flex flex-col items-center justify-center text-center">
      {icon}
      <span className="text-[10px] font-bold text-slate-700">{value}</span>
    </div>
  );
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Project) => void }) {
  const ministries = useMinistries();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Project['scope']>('both');
  const [ministryId, setMinistryId] = useState(ministries[0]?.id ?? '');
  const [pmo, setPmo] = useState('');
  const [endDate, setEndDate] = useState('');

  const submit = () => {
    if (!name.trim() || !pmo.trim()) return;
    onCreate({ id: `proj_${Date.now()}`, name: name.trim(), scope, ministryId: scope === 'ministry' ? ministryId : undefined, status: 'Planifié', pmo: pmo.trim(), endDate: endDate || undefined, team: [{ member: pmo.trim(), role: 'PMO' }], objectives: [], actions: [] });
  };

  return (
    <div className="fixed inset-0 bg-bc-text/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-ui font-bold text-bc-text">Nouveau projet</h3>
          <button onClick={onClose} className="text-bc-text-secondary hover:text-bc-text"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du projet" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
          <input value={pmo} onChange={(e) => setPmo(e.target.value)} placeholder="PMO (chef de projet)" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
          <select value={scope} onChange={(e) => setScope(e.target.value as Project['scope'])} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
            <option value="both">Transverse (2 branches)</option>
            <option value="church">Bloom Church</option>
            <option value="light">Bloom Light</option>
            <option value="ministry">Ministère</option>
          </select>
          {scope === 'ministry' && (
            <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <label className="block text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary">Échéance</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
        </div>
        <button onClick={submit} disabled={!name.trim() || !pmo.trim()} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40">
          Créer le projet
        </button>
      </div>
    </div>
  );
}
