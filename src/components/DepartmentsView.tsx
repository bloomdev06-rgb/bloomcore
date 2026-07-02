import React, { useState } from 'react';
import { Branch, Member, Department, DepartmentType, SpecialFunction, Activity as ActivityEntity } from '../types';
import { LayoutList, ChevronRight, Settings, Users, Calendar, Activity, Plus, X, Sparkles, FileText, CheckCircle, UserCheck } from 'lucide-react';
import { useMinistries, useDepartments, load, save, activitiesSeed } from '../data';

interface DepartmentsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  onUpdateMember?: (m: Member) => void;
  selectedDept?: string | null;
  setSelectedDept?: (id: string | null) => void;
}

const SPECIAL_LABEL: Record<SpecialFunction, string> = {
  adn: 'ADN', portiers: 'Portiers', integration: 'Intégration',
  bloom_bus: 'Bloom Bus', gestion_cultes: 'Gestion des Cultes', parcours_etapes: 'Parcours à étapes',
};

// No specialFunction on seeded rows → infer from the id for the known special depts.
const specialFn = (d?: Department): SpecialFunction | undefined => {
  if (!d) return undefined;
  if (d.specialFunction) return d.specialFunction;
  const id = d.id.toLowerCase();
  if (id.includes('adn')) return 'adn';
  if (id.includes('portier')) return 'portiers';
  if (id.includes('integration') || id.includes('intégration')) return 'integration';
  if (id.includes('bus')) return 'bloom_bus';
  if (id.includes('culte')) return 'gestion_cultes';
  if (id.includes('bapteme') || id.includes('baptême') || id.includes('eden') || id.includes('prd')) return 'parcours_etapes';
  return undefined;
};

export default function DepartmentsView({ activeBranch, simulatedRole, members = [], onUpdateMember, selectedDept: selectedDeptProp, setSelectedDept: setSelectedDeptProp }: DepartmentsViewProps) {
  const INITIAL_MINISTRIES = useMinistries();
  const seedDepts = useDepartments();
  // ponytail: local session state for create; persist via ./data at backend time.
  const [INITIAL_DEPARTMENTS, setDepartments] = useState<Department[]>(seedDepts);
  const [showCreate, setShowCreate] = useState(false);
  const isChurch = activeBranch === 'church';

  // On atterrit directement sur le département du Responsable (opérateur courant).
  // ponytail: opérateur figé à mem_1 tant que l'auth n'est pas là.
  const operator = members.find(m => m.id === 'mem_1');
  const myDeptEntries = Object.entries(operator?.departments ?? {});
  const defaultDept = (myDeptEntries.find(([, fn]) => fn === 'Responsable')?.[0]) || myDeptEntries[0]?.[0] || seedDepts[0]?.id;

  // Département contrôlé par la Sidebar (fallback : le département du responsable).
  const selectedDept = selectedDeptProp ?? defaultDept;
  const setSelectedDept = setSelectedDeptProp ?? (() => {});
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // §7.2 — activités récurrentes du département (localStorage-backed)
  const [activities, setActivities] = useState<ActivityEntity[]>(() => load('bc_activities', activitiesSeed));
  React.useEffect(() => { save('bc_activities', activities); }, [activities]);
  const [newActTitle, setNewActTitle] = useState('');
  const [newActRec, setNewActRec] = useState<ActivityEntity['recurrence']>('Hebdomadaire');
  const [newActDay, setNewActDay] = useState('Samedi');
  const [newActTime, setNewActTime] = useState('18:00');
  const addActivity = () => {
    if (!newActTitle.trim() || !selectedDept) return;
    setActivities(prev => [...prev, { id: `act_${Date.now()}`, departmentId: selectedDept, title: newActTitle.trim(), recurrence: newActRec, day: newActDay || undefined, time: newActTime || undefined }]);
    setNewActTitle('');
  };
  const removeActivity = (id: string) => setActivities(prev => prev.filter(a => a.id !== id));

  const canAdmin = ['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole);
  const selectedDeptData = INITIAL_DEPARTMENTS.find(d => d.id === selectedDept);
  const selectedMinistryData = INITIAL_MINISTRIES.find(m => m.id === selectedDeptData?.ministryId);
  const sf = specialFn(selectedDeptData);

  const deptMembers = members.filter(m => selectedDept && Object.keys(m.departments).includes(selectedDept));
  const deptResponsable = deptMembers.find(m => selectedDept && m.departments[selectedDept] === 'Responsable');
  const byFunction = (fn: string) => deptMembers.filter(m => selectedDept && m.departments[selectedDept] === fn);
  // Nouveaux affectés à ce département, suivis par le Responsable jusqu'à Boss.
  const deptNouveaux = deptMembers.filter(m => m.level === 'Nouveau');
  const pendingReception = deptNouveaux.filter(m => m.receptionValidated === false);
  const receivedNouveaux = deptNouveaux.filter(m => m.receptionValidated !== false);
  const canValidate = ['Responsable', 'Coach', 'Leader', 'Pasteur', 'Ministre', 'Admin', 'Super Admin'].includes(simulatedRole);
  const validateReception = (m: Member) => onUpdateMember?.({ ...m, receptionValidated: true });
  const promoteToBoss = (m: Member) => selectedDept && onUpdateMember?.({
    ...m,
    level: 'Boss',
    hasPassedToBossForm: true, // §6.2 — le passage Boss lève la fiche membre
    departments: { ...m.departments, [selectedDept]: 'Membre' },
  });
  const encadrants = deptMembers.filter(m => selectedDept && ['Coach', 'Leader'].includes(m.departments[selectedDept]));

  const internalTabs = [
    { id: 'members', label: 'Membres' },
    { id: 'hierarchy', label: 'Hiérarchie & Assignations' },
    { id: 'nouveaux', label: 'Validation Nouveaux' },
    { id: 'agenda', label: 'Agenda & Activités' },
    { id: 'reports', label: 'Rapports' },
    { id: 'suivi', label: 'Suivi' },
  ];

  return (
    <div className="pb-6 flex-1">
      {/* Department Console (synthèse du département sélectionné dans la barre latérale) */}
      <div className="flex-1 bg-white rounded-[2rem] border border-bc-border shadow-sm flex flex-col min-h-[500px] overflow-hidden">
        {selectedDeptData ? (
          <>
            <div className="p-6 border-b border-bc-border shrink-0">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div>
                  <h2 className="text-2xl font-ui font-extrabold text-bc-text">
                    Département {selectedDeptData.name}
                  </h2>
                  <p className="text-xs text-bc-text-secondary mt-1 flex items-center gap-2">
                    <span>{selectedMinistryData?.name} • Type : {selectedDeptData.type}</span>
                    {sf && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-bc-green bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                        <Sparkles size={10} /> {SPECIAL_LABEL[sf]}
                      </span>
                    )}
                  </p>
                </div>
                {['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole) && (
                  <>
                    <button onClick={() => setShowCreate(true)} className="px-3 py-2 bg-bc-green text-white rounded-full text-xs font-bold hover:opacity-90 flex items-center gap-1.5">
                      <Plus size={14} /> Créer
                    </button>
                    <button className="p-2 border border-bc-border rounded-full hover:bg-bc-canvas text-bc-text-secondary transition-colors">
                      <Settings size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* Tab bar — synthèse (accueil) + onglets internes du responsable */}
              <div className="flex gap-1 mt-4 overflow-x-auto">
                <button
                  onClick={() => setActiveTab(null)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeTab === null ? 'bg-bc-green text-white' : 'text-bc-text-secondary hover:bg-bc-canvas'}`}
                >
                  Synthèse
                </button>
                {internalTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-bc-green text-white' : 'text-bc-text-secondary hover:bg-bc-canvas'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-bc-canvas/30">
              {activeTab === null && (
                <div className="space-y-6">
                  {sf && (
                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5">
                      <h3 className="font-ui font-bold text-bc-text flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-bc-green" /> Module spécial · {SPECIAL_LABEL[sf]}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {sf === 'adn' && ['+ Formulaire Nouveau', '+ Rapport ADN (comptage)'].map(a => (
                          <button key={a} className="text-xs font-bold bg-white border border-emerald-200 text-bc-green rounded-full px-4 py-2 hover:bg-emerald-50">{a}</button>
                        ))}
                        {sf === 'portiers' && <button className="text-xs font-bold bg-white border border-emerald-200 text-bc-green rounded-full px-4 py-2 hover:bg-emerald-50">+ Rapport de présences (H/F)</button>}
                        {sf === 'gestion_cultes' && <button className="text-xs font-bold bg-white border border-emerald-200 text-bc-green rounded-full px-4 py-2 hover:bg-emerald-50">+ Rapport de culte complet</button>}
                        {sf === 'parcours_etapes' && (
                          <div className="text-xs text-bc-text-secondary">Suivi des étapes du parcours (Inscription → Cours → Entretien → Validation) — voir Constructeur de formulaires.</div>
                        )}
                        {sf === 'bloom_bus' && <div className="text-xs text-bc-text-secondary">Géré dans l'onglet Bloom Bus (maillage territorial).</div>}
                        {sf === 'integration' && <div className="text-xs text-bc-text-secondary">Reçoit automatiquement tous les nouveaux et suit leur parcours (En attente → Suivi → Intégré).</div>}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-5 rounded-2xl border border-bc-border shadow-sm flex flex-col items-center">
                      <Users size={24} className="text-slate-400 mb-2"/>
                      <span className="text-3xl font-black text-bc-text">{deptMembers.length}</span>
                      <span className="text-[10px] uppercase font-bold text-bc-text-secondary mt-1">Membres Actifs</span>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-bc-border shadow-sm flex flex-col items-center">
                      <Activity size={24} className="text-slate-400 mb-2"/>
                      <span className="text-3xl font-black text-bc-text">--</span>
                      <span className="text-[10px] uppercase font-bold text-emerald-600 mt-1">Présence / Santé</span>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-bc-border shadow-sm flex flex-col items-center">
                      <Calendar size={24} className="text-slate-400 mb-2"/>
                      <span className="text-3xl font-black text-bc-text">--</span>
                      <span className="text-[10px] uppercase font-bold text-bc-text-secondary mt-1">Réunions à venir</span>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h3 className="font-ui font-bold text-bc-text mb-4 text-sm">Informations clés</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-slate-50">
                        <span className="text-xs text-bc-text-secondary">Responsable</span>
                        <span className="text-xs font-bold text-bc-text">{deptResponsable ? `${deptResponsable.firstName} ${deptResponsable.lastName}` : 'Non assigné'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-50">
                        <span className="text-xs text-bc-text-secondary">Membres rattachés</span>
                        <span className="text-xs font-bold text-bc-text">{deptMembers.length}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-xs text-bc-text-secondary">Dernière activité</span>
                        <span className="text-xs font-bold text-bc-text">--</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'members' && (
                <div className="bg-white rounded-2xl border border-bc-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-bc-border flex justify-between items-center">
                    <h3 className="font-bold text-bc-text text-sm">Membres du département</h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{deptMembers.length} membres</span>
                  </div>
                  {deptMembers.length === 0 ? (
                    <div className="p-8 text-center text-bc-text-secondary text-xs">Aucun membre assigné à ce département.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {deptMembers.map(m => (
                        <div key={m.id} className="flex justify-between items-center p-4 hover:bg-bc-canvas">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex justify-center items-center font-bold text-[10px]">
                              {m.firstName[0]}{m.lastName[0]}
                            </div>
                            <div>
                              <div className="font-bold text-bc-text text-sm">{m.firstName} {m.lastName}</div>
                              <div className="text-[10px] text-bc-text-secondary">{m.phone}</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                            {selectedDept && m.departments[selectedDept]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'hierarchy' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {['Responsable', 'Coach', 'Leader', 'Membre'].map(fn => (
                    <div key={fn} className="bg-white rounded-2xl border border-bc-border p-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-bc-text-secondary mb-2">{fn} ({byFunction(fn).length})</h4>
                      <div className="space-y-1.5">
                        {byFunction(fn).length === 0 && <p className="text-[11px] text-bc-text-secondary italic">—</p>}
                        {byFunction(fn).map(m => (
                          <div key={m.id} className="text-xs font-medium text-bc-text bg-bc-canvas/40 border border-bc-border rounded-full px-3 py-1.5 truncate">{m.firstName} {m.lastName}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'nouveaux' && (
                <div className="space-y-4">
                  {/* Réceptions à valider par le Responsable du département */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-1 flex items-center gap-2"><UserCheck size={15} /> Réceptions à valider ({pendingReception.length})</h3>
                    <p className="text-[11px] text-bc-text-secondary mb-4">Nouveaux affectés à ce département par l'ADN, en attente de ta validation de réception.</p>
                    <div className="space-y-2">
                      {pendingReception.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucune réception en attente.</p>}
                      {pendingReception.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-amber-50/60 border border-amber-200 rounded-xl px-4 py-2.5">
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.ojFlag ? 'OJ' : 'NV'} · {m.phone}</span>
                          </div>
                          {canValidate ? (
                            <button
                              onClick={() => validateReception(m)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-amber-500 hover:opacity-90 flex items-center gap-1"
                            >
                              <CheckCircle size={13} /> Valider la réception
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">À valider</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nouveaux reçus, suivis jusqu'à devenir membre (Boss) */}
                  <div className="bg-white rounded-2xl border border-bc-border p-6">
                    <h3 className="font-bold text-bc-text text-sm mb-1 flex items-center gap-2"><Users size={15} /> Nouveaux en intégration ({receivedNouveaux.length})</h3>
                    <p className="text-[11px] text-bc-text-secondary mb-4">Suivis jusqu'à devenir membre (Boss) du département.</p>
                    <div className="space-y-2">
                      {receivedNouveaux.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun nouveau en intégration.</p>}
                      {receivedNouveaux.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5">
                          <div>
                            <span className="text-sm font-bold text-bc-text">{m.firstName} {m.lastName}</span>
                            <span className="text-[10px] text-bc-text-secondary ml-2">{m.ojFlag ? 'OJ' : 'NV'} · {m.integrationFollowStatus ?? 'Non suivi'}</span>
                          </div>
                          {canValidate && (
                            <button
                              onClick={() => promoteToBoss(m)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-bc-green hover:opacity-90 flex items-center gap-1"
                            >
                              <ChevronRight size={13} /> Membre (Boss)
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'agenda' && (
                <div className="bg-white rounded-2xl border border-bc-border p-6">
                  <h3 className="font-bold text-bc-text text-sm mb-2 flex items-center gap-2"><Calendar size={15} /> Agenda & activités</h3>
                  <p className="text-xs text-bc-text-secondary">Routines et activités récurrentes du département (audience : membres du département).</p>
                  <div className="mt-4 space-y-2">
                    {activities.filter(a => a.departmentId === selectedDept).length === 0 && (
                      <p className="text-xs text-bc-text-secondary italic">Aucune activité pour ce département.</p>
                    )}
                    {activities.filter(a => a.departmentId === selectedDept).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs bg-bc-canvas/40 border border-bc-border rounded-full px-4 py-2">
                        <span className="flex items-center gap-2">
                          <Activity size={12} className="text-bc-green" />
                          <span className="font-bold text-bc-text">{a.title}</span>
                          <span className="text-bc-text-secondary">· {a.recurrence}{a.day ? ` · ${a.day}` : ''}{a.time ? ` · ${a.time}` : ''}</span>
                        </span>
                        {canValidate && <button onClick={() => removeActivity(a.id)} className="text-bc-text-secondary hover:text-red-500"><X size={12} /></button>}
                      </div>
                    ))}
                  </div>
                  {canValidate && (
                    <div className="mt-4 pt-4 border-t border-bc-border grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input value={newActTitle} onChange={e => setNewActTitle(e.target.value)} placeholder="Activité…" className="sm:col-span-2 border border-bc-border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                      <select value={newActRec} onChange={e => setNewActRec(e.target.value as ActivityEntity['recurrence'])} className="border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white">
                        {['Hebdomadaire', 'Mensuel', 'Annuel', 'Ponctuel'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input value={newActDay} onChange={e => setNewActDay(e.target.value)} placeholder="Jour" className="min-w-0 flex-1 border border-bc-border rounded-full px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                        <input value={newActTime} onChange={e => setNewActTime(e.target.value)} placeholder="Heure" className="w-16 border border-bc-border rounded-full px-2 py-1.5 text-xs focus:outline-none focus:border-bc-green" />
                        <button onClick={addActivity} disabled={!newActTitle.trim()} className="px-3 py-1.5 bg-bc-green text-white rounded-full text-xs font-bold disabled:opacity-40 shrink-0"><Plus size={13} /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'reports' && (
                <div className="bg-white rounded-2xl border border-bc-border p-6">
                  <h3 className="font-bold text-bc-text text-sm mb-4 flex items-center gap-2"><FileText size={15} /> Rapports du département</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['Rapport de service (roster serviteurs)', 'Rapport RSA (hebdomadaire)', "Rapport d'activité", 'Observation typée (avec / sans suivi)'].map(r => (
                      <div key={r} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                        <span className="font-medium text-bc-text">{r}</span>
                        <button className="text-[10px] font-bold text-bc-green hover:underline">Rédiger</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'suivi' && (
                <div className="bg-white rounded-2xl border border-bc-border p-6">
                  <h3 className="font-bold text-bc-text text-sm mb-4">Encadrants & membres à suivre</h3>
                  <div className="space-y-2">
                    {encadrants.length === 0 && <p className="text-xs text-bc-text-secondary italic">Aucun Coach / Leader dans ce département.</p>}
                    {encadrants.map(m => (
                      <div key={m.id} className="flex items-center justify-between bg-bc-canvas/40 border border-bc-border rounded-xl px-4 py-2.5 text-xs">
                        <span className="font-medium text-bc-text">{m.firstName} {m.lastName}</span>
                        <span className="text-bc-text-secondary">{selectedDept && m.departments[selectedDept]} · entretien & visite → rapport_suivi_coach</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <LayoutList size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium text-center max-w-sm">Sélectionnez un département dans l'arborescence pour afficher sa console.</p>
          </div>
        )}
      </div>

      {showCreate && canAdmin && (
        <CreateDepartmentModal
          ministries={INITIAL_MINISTRIES}
          onClose={() => setShowCreate(false)}
          onCreate={(d) => {
            setDepartments((prev) => [...prev, d]);
            setSelectedDept(d.id);
            setActiveTab(null);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateDepartmentModal({
  ministries,
  onClose,
  onCreate,
}: {
  ministries: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (d: Department) => void;
}) {
  const [name, setName] = useState('');
  const [ministryId, setMinistryId] = useState(ministries[0]?.id ?? '');
  const [type, setType] = useState<DepartmentType>('service');
  const [special, setSpecial] = useState<SpecialFunction | ''>('');

  const submit = () => {
    if (!name.trim() || !ministryId) return;
    onCreate({
      id: `dept_${Date.now()}`,
      name: name.trim(),
      ministryId,
      type,
      description: '',
      specialFunction: type === 'spécial' && special ? special : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-bc-text/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-ui font-bold text-bc-text">Créer un département</h3>
          <button onClick={onClose} className="text-bc-text-secondary hover:text-bc-text"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du département" className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-bc-green" />
          <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as DepartmentType)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
            <option value="service">Type : normal (service)</option>
            <option value="spécial">Type : spécial</option>
          </select>
          {type === 'spécial' && (
            <select value={special} onChange={(e) => setSpecial(e.target.value as SpecialFunction)} className="w-full border border-bc-border rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">— Fonction spéciale —</option>
              {(['adn', 'portiers', 'integration', 'bloom_bus', 'gestion_cultes', 'parcours_etapes'] as SpecialFunction[]).map((f) => (
                <option key={f} value={f}>{SPECIAL_LABEL[f]}</option>
              ))}
            </select>
          )}
        </div>
        <button onClick={submit} disabled={!name.trim()} className="w-full mt-5 bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40">
          Créer le département
        </button>
      </div>
    </div>
  );
}
