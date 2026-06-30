import React, { useState } from 'react';
import { Branch, Member } from '../types';
import { LayoutList, ChevronDown, ChevronRight, Settings, Users, Calendar, Activity, Plus } from 'lucide-react';
import { INITIAL_MINISTRIES, INITIAL_DEPARTMENTS } from '../mockData';

interface DepartmentsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
}

export default function DepartmentsView({ activeBranch, simulatedRole, members = [] }: DepartmentsViewProps) {
  const isChurch = activeBranch === 'church';
  const [expandedMinistry, setExpandedMinistry] = useState<string | null>('min_retention');
  const [selectedDept, setSelectedDept] = useState<string | null>('dept_adn');
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const selectedDeptData = INITIAL_DEPARTMENTS.find(d => d.id === selectedDept);
  const selectedMinistryData = INITIAL_MINISTRIES.find(m => m.id === selectedDeptData?.ministryId);

  const deptMembers = members.filter(m => selectedDept && Object.keys(m.departments).includes(selectedDept));
  const deptResponsable = deptMembers.find(m => selectedDept && m.departments[selectedDept] === 'Responsable');

  const internalTabs = [
    { id: 'members', label: 'Membres' },
    { id: 'hierarchy', label: 'Hiérarchie & Assignations' },
    { id: 'nouveaux', label: 'Validation Nouveaux' },
    { id: 'agenda', label: 'Agenda & Activités' },
    { id: 'reports', label: 'Rapports' },
    { id: 'suivi', label: 'Suivi' },
  ];

  const handleSelectDept = (deptId: string) => {
    if (selectedDept === deptId) {
      setSelectedDept(null);
      setActiveTab(null);
    } else {
      setSelectedDept(deptId);
      setActiveTab(null); // When clicking the department, show its dashboard
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-full gap-6 pb-6 flex-1">
      {/* Sidebar - Accordion */}
      <div className="w-full lg:w-72 bg-white rounded-[2rem] border border-bc-border shadow-sm flex flex-col shrink-0 lg:overflow-hidden min-h-[400px]">
        <div className="p-5 border-b border-bc-border flex justify-between items-center shrink-0">
          <h3 className="font-ui font-bold text-bc-text">Organisation</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {INITIAL_MINISTRIES.map(min => {
            const minDepts = INITIAL_DEPARTMENTS.filter(d => d.ministryId === min.id);
            if (minDepts.length === 0) return null;
            
            return (
            <div key={min.id} className="space-y-1">
              <button 
                onClick={() => setExpandedMinistry(expandedMinistry === min.id ? null : min.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-bc-canvas transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-800 pr-2">{min.name}</span>
                {expandedMinistry === min.id ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
              </button>
              
              {expandedMinistry === min.id && (
                <div className="pl-3 space-y-1 pb-2">
                  {minDepts.map(dept => (
                    <div key={dept.id}>
                      <button
                        onClick={() => handleSelectDept(dept.id)}
                        className={`w-full flex justify-between items-center p-3 rounded-xl text-left text-xs transition-colors ${
                          selectedDept === dept.id && activeTab === null ? 'bg-bc-green text-white font-bold shadow-md' : 'text-slate-600 hover:bg-bc-canvas font-medium'
                        }`}
                      >
                        <span className="line-clamp-1">{dept.name}</span>
                        {selectedDept === dept.id ? <ChevronDown size={14} className={activeTab === null ? 'text-white/70' : 'text-slate-400'} /> : null}
                      </button>
                      
                      {/* Internal Tabs for Selected Department */}
                      {selectedDept === dept.id && (
                        <div className="pl-4 mt-1 border-l-2 border-bc-border ml-3 space-y-0.5">
                          {internalTabs.map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`w-full text-left px-3 py-2 text-[11px] rounded-lg transition-colors ${
                                activeTab === tab.id ? 'bg-slate-100 text-bc-text font-bold' : 'text-bc-text-secondary hover:text-slate-700 hover:bg-bc-canvas'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )})}
        </div>
        {['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole) && (
          <div className="p-4 border-t border-bc-border shrink-0">
            <button className="w-full py-2.5 bg-bc-green text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
              <Plus size={14} /> Créer un département
            </button>
          </div>
        )}
      </div>

      {/* Main Content - Department Console */}
      <div className="flex-1 bg-white rounded-[2rem] border border-bc-border shadow-sm flex flex-col min-h-[500px] overflow-hidden">
        {selectedDeptData ? (
          <>
            <div className="p-6 border-b border-bc-border shrink-0">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div>
                  <h2 className="text-2xl font-ui font-extrabold text-bc-text">
                    Département {selectedDeptData.name}
                  </h2>
                  <p className="text-xs text-bc-text-secondary mt-1">{selectedMinistryData?.name} • Type : {selectedDeptData.type}</p>
                </div>
                {['Pasteur', 'Admin', 'Super Admin'].includes(simulatedRole) && (
                  <button className="p-2 border border-bc-border rounded-full hover:bg-bc-canvas text-bc-text-secondary transition-colors">
                    <Settings size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-bc-canvas/30">
              {activeTab === null && (
                <div className="space-y-6">
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
                <div className="bg-white p-8 rounded-2xl border border-bc-border text-center text-bc-text-secondary text-sm font-medium">Lier Membres ↔ Leaders ↔ Coachs.</div>
              )}
              {activeTab === 'nouveaux' && (
                <div className="bg-white p-8 rounded-2xl border border-bc-border text-center text-bc-text-secondary text-sm font-medium">File d'attente d'intégration et réceptions en attente.</div>
              )}
              {activeTab === 'agenda' && (
                <div className="bg-white p-8 rounded-2xl border border-bc-border text-center text-bc-text-secondary text-sm font-medium">Routines, événements et alertes.</div>
              )}
              {activeTab === 'reports' && (
                <div className="bg-white p-8 rounded-2xl border border-bc-border text-center text-bc-text-secondary text-sm font-medium">Rapports de service, RSA, activité et observations.</div>
              )}
              {activeTab === 'suivi' && (
                <div className="bg-white p-8 rounded-2xl border border-bc-border text-center text-bc-text-secondary text-sm font-medium">Liste des membres à suivre (entretien & visite) pour la cellule.</div>
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
    </div>
  );
}
