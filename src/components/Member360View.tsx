import React, { useState, useRef } from 'react';
import { Member, Branch, Report, AuditLog } from '../types';
import { INITIAL_DEPARTMENTS } from '../mockData';
import { X, Edit, Phone, Mail, Compass, ShieldAlert, Activity, User, Briefcase, Calendar, MapPin, Database, ArrowRight, Clock, Smile, Meh, Star, Frown, CheckCircle2 } from 'lucide-react';

interface Member360ViewProps {
  member: Member;
  onClose: () => void;
  onEdit: (member: Member) => void;
  simulatedRole: string;
}

export default function Member360View({ member, onClose, onEdit, simulatedRole }: Member360ViewProps) {
  const [activeTab, setActiveTab] = useState('perso');
  const tabsRef = useRef<HTMLDivElement>(null);

  const healthData = [
    { subject: 'Spirituel', A: member.healthKPIs.spirituel, fullMark: 5 },
    { subject: 'Social', A: member.healthKPIs.social, fullMark: 5 },
    { subject: 'Physique', A: member.healthKPIs.physique, fullMark: 5 },
    { subject: 'Financier', A: member.healthKPIs.financier, fullMark: 5 },
    { subject: 'Présence Culte', A: member.healthKPIs.presenceCulte, fullMark: 5 },
    { subject: 'Présence Service', A: member.healthKPIs.presenceService, fullMark: 5 },
  ];

  const isAtRisk = member.integrationState === 'En attente' && new Date(member.integrationDateRegistered).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bc-canvas rounded-[2.5rem] w-full max-w-5xl h-[90vh] border border-bc-border shadow-2xl relative flex flex-col overflow-hidden">
        
        {/* Header (Always visible) */}
        <div className="p-6 bg-white border-b border-bc-border shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-slate-100 rounded-full text-bc-text-secondary hover:text-bc-text transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-bc-green text-white font-ui font-black flex items-center justify-center text-xl shadow-sm">
                {member.firstName[0]}{member.lastName[0]}
              </div>
              <div>
                <h2 className="text-2xl font-ui font-extrabold text-bc-text">
                  {member.firstName} {member.lastName}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {member.level}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {member.branch === 'church' ? 'Bloom Church' : 'Bloom Light'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {member.baptismStatus}
                  </span>
                  {isAtRisk && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <ShieldAlert size={10} /> Au rouge
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button 
              onClick={() => onEdit(member)}
              className="px-5 py-2 border border-bc-border rounded-full text-xs font-ui font-bold hover:bg-bc-canvas flex items-center gap-2"
            >
              <Edit size={14} /> Modifier Profil
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Side Dashboard (Health) */}
          <div className="w-full md:w-72 bg-white border-r border-bc-border p-6 shrink-0 overflow-y-auto">
            <h3 className="font-ui font-bold text-bc-text mb-4 flex items-center gap-2">
              <Activity size={16} /> Santé 360°
            </h3>
            
            <div className="mb-6 bg-bc-canvas p-4 rounded-2xl border border-bc-border">
              <div className="grid grid-cols-5 gap-1">
                {healthData.map(axis => {
                  const level = axis.A - 1;
                  const renderIcon = (lvl: number) => {
                    switch(lvl) {
                      case 0: return <Frown className="w-6 h-6 text-red-500" />;
                      case 1: return <Meh className="w-6 h-6 text-orange-400" />;
                      case 2: return <Smile className="w-6 h-6 text-yellow-500" />;
                      case 3: return <Smile className="w-6 h-6 text-emerald-400" />;
                      case 4: return <Star className="w-6 h-6 text-purple-500" />;
                      default: return <Smile className="w-6 h-6 text-slate-400" />;
                    }
                  };
                  return (
                    <div key={axis.subject} className="flex flex-col items-center justify-center">
                      <div title={`${axis.subject}: ${level + 1}/5`}>{renderIcon(level)}</div>
                      <span className="text-[8px] font-bold text-bc-text-secondary mt-1 uppercase text-center truncate w-full">{axis.subject}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Main Tabs Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-bc-canvas/50">
            <div className="flex items-center border-b border-bc-border bg-white shrink-0 px-2">
              <button 
                onClick={() => {
                  tabsRef.current?.scrollBy({ left: -150, behavior: 'smooth' });
                }}
                className="p-2 text-slate-400 hover:text-bc-text transition-colors shrink-0"
              >
                <ArrowRight size={16} className="rotate-180" />
              </button>
              
              <div ref={tabsRef} className="flex flex-1 overflow-x-auto no-scrollbar scroll-smooth">
                {[
                  { id: 'perso', label: 'Infos Personnelles' },
                  { id: 'spirituel', label: 'Infos Spirituelles' },
                  { id: 'evolution', label: 'Évolution Multi-axes' },
                  { id: 'appartenances', label: 'Appartenances & Ancrages' },
                  { id: 'mentorat', label: 'Mentorat & Encadrement' },
                  { id: 'rapports', label: 'Rapports' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab.id ? 'border-bc-green text-bc-text' : 'border-transparent text-bc-text-secondary hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => {
                  tabsRef.current?.scrollBy({ left: 150, behavior: 'smooth' });
                }}
                className="p-2 text-slate-400 hover:text-bc-text transition-colors shrink-0"
              >
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              
              {activeTab === 'perso' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <User size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Identité</span>
                      </div>
                      <p className="text-sm font-bold text-bc-text">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-bc-text-secondary mt-1">Né(e) le: {member.birthDate}</p>
                      <p className="text-xs text-bc-text-secondary">Sexe: {member.gender === 'H' ? 'Homme' : 'Femme'} <span className="mx-1">•</span> Nationalité: Ivoirienne</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Briefcase size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Situation</span>
                      </div>
                      <p className="text-sm font-bold text-bc-text">{member.profession || 'Non renseignée'}</p>
                      <p className="text-xs text-bc-text-secondary mt-1">{member.maritalStatus}</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm col-span-2">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <Phone size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Contacts</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-xs text-bc-text-secondary">Téléphone Principal</p>
                          <p className="font-bold text-bc-text">{member.phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Email</p>
                          <p className="font-bold text-bc-text">{member.email || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Tél. Parent/Proche</p>
                          <p className="font-bold text-bc-text">{member.phoneParent || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Contact d'urgence</p>
                          <p className="font-bold text-bc-text text-red-600">01 02 03 04 05</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-bc-border shadow-sm col-span-2">
                      <div className="flex items-center gap-2 text-bc-text-secondary mb-2">
                        <MapPin size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Localisation</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-xs text-bc-text-secondary">Commune</p>
                          <p className="font-bold text-bc-text">{member.gps?.commune || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Quartier</p>
                          <p className="font-bold text-bc-text">Riviera Palmeraie</p>
                        </div>
                        <div>
                          <p className="text-xs text-bc-text-secondary">Coordonnées GPS</p>
                          <p className="font-mono text-xs text-slate-700">{member.gps?.lat}, {member.gps?.lng}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'spirituel' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Parcours & Intégration</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date 1ère visite</span>
                        <span className="text-sm font-bold text-bc-text">{member.entryDate}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date de conversion</span>
                        <span className="text-sm font-bold text-bc-text">12 Août 2021</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Date d'intégration</span>
                        <span className="text-sm font-bold text-bc-text">{member.integrationState === 'Intégré' ? '15 Octobre 2025' : 'En attente'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-bc-border">
                        <span className="text-xs text-bc-text-secondary">Statut Baptême</span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-bc-text block">{member.baptismStatus}</span>
                          {member.baptismStatus === 'Baptisé' && (
                            <span className="text-[10px] text-emerald-600 font-bold">via dép. Classes, le 24 Mai 2023</span>
                          )}
                          {member.baptismStatus === 'Non baptisé' && (
                            <span className="text-[10px] text-orange-500 font-bold">Parcours en cours (Étape 2/4)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'evolution' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Niveau Communautaire</h4>
                    <div className="flex items-center gap-4 text-xs font-bold">
                      <span className="text-slate-400">Nouveau</span> <ArrowRight size={14} className="text-slate-300" />
                      <span className="text-slate-400">Stagiaire</span> <ArrowRight size={14} className="text-slate-300" />
                      <span className="text-slate-400">Serviteur</span> <ArrowRight size={14} className="text-slate-300" />
                      <span className="text-bc-text bg-slate-100 px-3 py-1 rounded-full">{member.level}</span>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Cursus Pastoral</h4>
                    <p className="text-sm font-bold text-bc-text">{member.pastoralCursus}</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Historique des Fonctions</h4>
                    <div className="space-y-3">
                      {Object.entries(member.departments).map(([deptId, role]) => {
                        const dept = INITIAL_DEPARTMENTS.find(d => d.id === deptId);
                        return (
                          <div key={deptId} className="flex justify-between items-center">
                            <span className="text-sm text-slate-700">{dept ? dept.name : deptId}</span>
                            <span className="text-xs font-bold text-bc-text bg-slate-100 px-2 py-1 rounded">{role}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'appartenances' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Ancrages</h4>
                    <p className="text-xs text-bc-text-secondary italic mb-4">Les affectations sont gérées depuis les modules respectifs.</p>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold text-bc-text-secondary uppercase">Départements</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.keys(member.departments).map(deptId => {
                            const dept = INITIAL_DEPARTMENTS.find(d => d.id === deptId);
                            return (
                              <span key={deptId} className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                                {dept ? dept.name : deptId}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-bc-text-secondary uppercase">Bloom Bus</p>
                        <div className="mt-2">
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">Zone Cocody Centre</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'mentorat' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-white p-6 rounded-2xl border border-bc-border shadow-sm">
                    <h4 className="font-ui font-bold text-bc-text mb-4">Superviseurs & Mentors</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="p-4 border border-bc-border rounded-2xl bg-bc-canvas/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Service (Département)</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-slate-700 border border-bc-border">CO</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Coach Othniel</p>
                            <p className="text-[10px] text-bc-text-secondary">Suivi direct</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border border-bc-border rounded-2xl bg-bc-canvas/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Territoriale (Bloom Bus)</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-slate-700 border border-bc-border">RC</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Resp. Charles</p>
                            <p className="text-[10px] text-bc-text-secondary">Zone Cocody Centre</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border border-amber-100 rounded-2xl bg-amber-50/30 col-span-1 sm:col-span-2">
                        <p className="text-[10px] font-bold text-amber-600/60 uppercase tracking-wider mb-3">Mentor de Cursus</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-amber-700 border border-amber-200">PM</div>
                          <div>
                            <p className="text-sm font-bold text-bc-text cursor-pointer hover:underline">Ps. Marc</p>
                            <p className="text-[10px] text-bc-text-secondary">Ligne de mentorat</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'rapports' && (
                <div className="space-y-6 max-w-2xl">
                  <p className="text-xs text-bc-text-secondary italic">Centralisation des rapports. Les rapports pastoraux et de bus sont confidentiels et limités aux habilitations requises.</p>
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-bc-border shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded uppercase">Rapport de Suivi (Bus)</span>
                        <span className="text-xs text-bc-text-secondary">20 Juin 2026</span>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2">"Membre très engagé, a participé activement à l'évangélisation."</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="relative border-l border-bc-border pl-4 space-y-4">
                    <div className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 bg-bc-green rounded-full border-2 border-white" />
                      <p className="text-xs font-bold text-bc-text">Promotion au statut de Leader</p>
                      <p className="text-[10px] text-bc-text-secondary">12 Janvier 2026 par Ps. Kacou</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 bg-slate-400 rounded-full border-2 border-white" />
                      <p className="text-xs font-bold text-bc-text">Intégration validée</p>
                      <p className="text-[10px] text-bc-text-secondary">15 Octobre 2025 par ADN</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
