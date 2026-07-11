import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  Filter, 
  Users, 
  Compass, 
  ShieldAlert, 
  Eye, 
  CheckCircle,
  Clock
} from 'lucide-react';
import { Report, Branch } from '../types';
import { motion } from 'motion/react';
import { staggerParent, staggerItem } from './ui/motion';

interface ReportsViewProps {
  reports: Report[];
  activeBranch: Branch;
  simulatedRole: string;
}

export default function ReportsView({
  reports,
  activeBranch,
  simulatedRole
}: ReportsViewProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  // E2 — un rapport serveur sans `content` ne doit pas faire crasher le détail : on défaut
  // à {} plutôt que de déréférencer rc.X sur undefined.
  const rc: any = selectedReport?.content ?? {};

  const isChurch = activeBranch === 'church';

  // Filter reports according to active branch and confidentiality rules
  const visibleReports = reports.filter(rep => {
    // Branch filter
    if (activeBranch !== 'global' && rep.targetBranch !== activeBranch) return false;

    // Type filter
    if (filterType !== 'all' && rep.reportType !== filterType) return false;

    // §8.3 — confidentialité du rapport pastoral : la confidentialité du corps pastoral
    // prime même sur Admin/Super Admin, qui NE voient PAS ce contenu (PROFILS-INTERFACES.md:73,78,107).
    // Visible seulement au corps pastoral opérationnel (Pasteur/Pasteur Principal/Ministre) ;
    // à un Coach/Responsable uniquement si le secret est explicitement partagé (partagerAvecResponsableDept).
    if (rep.confidential) {
      const pastoralCorps = ['Pasteur', 'Pasteur Principal', 'Ministre'].includes(simulatedRole);
      const coachWithShare = ['Coach', 'Responsable'].includes(simulatedRole) && !!rep.partagerAvecResponsableDept;
      if (!pastoralCorps && !coachWithShare) return false;
    }

    return true;
  });

  const getReportBadgeStyle = (type: string) => {
    switch (type) {
      case 'rapport_culte': return 'bg-bc-green/10 text-bc-text';
      case 'rapport_adn': return 'bg-bc-gold/20 text-bc-text border border-bc-gold/30';
      case 'rapport_bloom_bus_life': return 'bg-bc-green/10 text-bc-text';
      case 'rapport_bloom_bus_member': return 'bg-bc-purple/10 text-bc-purple';
      case 'rapport_pastoral': return 'bg-bc-purple text-white';
      default: return 'bg-bc-canvas text-bc-text-secondary';
    }
  };

  const getReportName = (type: string) => {
    switch (type) {
      case 'rapport_service': return 'Rapport de Service Hebdomadaire';
      case 'rapport_rsa': return 'Rapport de Suivi d\'Actions (RSA)';
      case 'rapport_bloom_bus_member': return 'Évaluation de Santé Spirituelle';
      case 'rapport_bloom_bus_life': return 'Rapport d\'Activité Bloom Bus';
      case 'rapport_adn': return 'Comptage ADN Nouveaux & OJ';
      case 'rapport_portiers': return 'Comptage Affluence Portiers';
      case 'rapport_culte': return 'Synthèse de Culte Complète';
      case 'rapport_pastoral': return 'Évaluation Confidentielle du Cursus';
      default: return 'Rapport d\'Activité';
    }
  };

  const triggerPDFDownloadSimulation = (rep: Report) => {
    alert(`[PDF Export Simulation]\nLe rapport "${getReportName(rep.reportType)}" daté du ${rep.date} a été compilé en PDF et téléchargé avec succès !`);
  };

  return (
    <div className="space-y-6">
      {/* Reports Cascade Header Selector */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Cascade selector */}
          <select
            id="reports-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Tous les Rapports</option>
            <option value="rapport_service">Cascade 1 : Service (Département)</option>
            <option value="rapport_bloom_bus_life">Cascade 2 : Territoriale (Activité Bus)</option>
            <option value="rapport_bloom_bus_member">Cascade 2 : Territoriale (Suivi Spirituel)</option>
            <option value="rapport_pastoral">Cascade 3 : Cursus Pastoral (Confidentiel)</option>
            <option value="rapport_culte">Synthèse Générale des Cultes</option>
          </select>
        </div>

        <div className="text-xs text-bc-text-secondary font-medium italic">
          Branche d'imputation : <span className="font-bold text-bc-text">{isChurch ? 'Bloom Church' : 'Bloom Light'}</span>
        </div>
      </div>

      {/* Split visual layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Reports Directory - 6 cols */}
        <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-6 space-y-4">
          <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2">
            <FileText size={16} className="text-bc-text" /> Registre des Rapports de la Paroisse
          </h3>
          
          <motion.div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1" variants={staggerParent} initial="hidden" animate="show">
            {visibleReports.length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-12">Aucun rapport disponible pour cette section.</p>
            ) : (
              visibleReports.map((rep) => (
                <motion.div
                  key={rep.id}
                  variants={staggerItem}
                  onClick={() => setSelectedReport(rep)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                    selectedReport?.id === rep.id
                      ? 'border-bc-green bg-bc-canvas'
                      : 'border-bc-border bg-white hover:bg-bc-canvas/25'
                  }`}
                >
                  <div className="space-y-1">
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${getReportBadgeStyle(rep.reportType)}`}>
                      {rep.reportType.replace('_', ' ')}
                    </span>
                    <h4 className="font-ui font-bold text-bc-text text-xs pt-1">
                      {getReportName(rep.reportType)}
                    </h4>
                    <p className="text-[10px] text-bc-text-secondary">
                      Rédigé par : <span className="font-semibold">{rep.authorName}</span> ({rep.authorRole})
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-bc-text-secondary font-mono">{rep.date}</span>
                    {rep.confidential && (
                      <span className="text-[8px] bg-bc-purple/10 text-bc-purple px-1.5 py-0.2 rounded font-bold uppercase">SECRET</span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>

        {/* Report Preview panel - 6 cols */}
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm lg:col-span-6">
          {selectedReport ? (
            <div className="space-y-5 h-full flex flex-col justify-between">
              
              {/* Header preview */}
              <div className="border-b border-bc-border pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-ui font-black text-bc-text text-sm">
                      {getReportName(selectedReport.reportType)}
                    </h4>
                    <p className="text-[10px] text-bc-text-secondary mt-1">
                      Auteur : <span className="font-bold text-bc-text">{selectedReport.authorName}</span> — {selectedReport.authorRole}
                    </p>
                    <p className="text-[10px] text-bc-text-secondary">
                      Date de Saisie : <span className="font-mono">{selectedReport.date}</span>
                    </p>
                  </div>

                  <button
                    id="rpt-download-pdf-btn"
                    onClick={() => triggerPDFDownloadSimulation(selectedReport)}
                    className="p-2 bg-bc-canvas hover:bg-bc-border border border-bc-border rounded-full text-bc-text transition-colors active-scale flex items-center space-x-1"
                    title="Exporter en PDF"
                  >
                    <Download size={14} />
                    <span className="text-[10px] font-bold font-ui">PDF</span>
                  </button>
                </div>
              </div>

              {/* Dynamic content rendering based on type */}
              <div className="bg-bc-canvas/40 border border-bc-border rounded-[2rem] p-4 flex-1 overflow-y-auto max-h-[35vh]">
                <span className="text-[9px] uppercase font-bold tracking-wider text-bc-text-secondary block mb-3">Contenu du rapport</span>
                
                {selectedReport.reportType === 'rapport_culte' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary block">Présences physiques (Portiers)</span>
                        <span className="text-base font-ui font-black text-bc-text">{rc.attendancePortiers}</span>
                      </div>
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary block">Nouveaux arrivants (ADN)</span>
                        <span className="text-base font-ui font-black text-[color:var(--accent-1)]">{rc.attendanceADN}</span>
                      </div>
                    </div>
                    {rc.offertory && (
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary block">Offrandes collectées</span>
                        <span className="text-sm font-mono font-bold text-bc-text">{rc.offertory.toLocaleString()} FCFA</span>
                      </div>
                    )}
                    {(rc.predicateur || rc.theme || rc.officiant) && (
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl space-y-1">
                        <span className="text-[9px] text-bc-text-secondary block">Infos générales</span>
                        {rc.predicateur && <span className="block">Prédicateur : <b>{rc.predicateur}</b></span>}
                        {rc.officiant && <span className="block">Officiant : <b>{rc.officiant}</b></span>}
                        {rc.theme && <span className="block">Thème : <b>{rc.theme}</b></span>}
                      </div>
                    )}
                    {typeof rc.ferveur === 'number' && (
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary block mb-1">Atmosphère spirituelle (/5)</span>
                        <span className="block">Ferveur : <b>{rc.ferveur}</b> · Louange : <b>{rc.louange}</b> · Appel : <b>{rc.deroulementAppel}</b></span>
                      </div>
                    )}
                    {Array.isArray(rc.incidents) && rc.incidents.length > 0 && (
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl space-y-1">
                        <span className="text-[9px] text-bc-text-secondary block">Journal des incidents</span>
                        {rc.incidents.map((inc: any, idx: number) => (
                          <span key={idx} className="block">
                            <b>{inc.type}</b>{inc.departments ? ` (${inc.departments})` : ''} — {inc.details}
                          </span>
                        ))}
                      </div>
                    )}
                    {typeof rc.attendeesEnfants === 'number' && (
                      <div className="p-2.5 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary block">Enfants émargés</span>
                        <span className="text-base font-ui font-black text-bc-text">{rc.attendeesEnfants}</span>
                      </div>
                    )}
                    <p className="font-serif italic text-bc-text-secondary leading-relaxed mt-2 pt-2 border-t border-bc-border/40">
                      "{rc.notes}"
                    </p>
                  </div>
                )}

                {selectedReport.reportType === 'rapport_adn' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary">Nouveaux (H)</span>
                        <span className="block font-ui font-bold">{rc.nouveauxHommes}</span>
                      </div>
                      <div className="p-2 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary">Nouveaux (F)</span>
                        <span className="block font-ui font-bold">{rc.nouveauxFemmes}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="p-2 bg-white border border-bc-border rounded-2xl bg-bc-gold/10">
                        <span className="text-[9px] text-bc-text-secondary">Oui à Jésus (H)</span>
                        <span className="block font-ui font-bold text-bc-text">{rc.ojHommes}</span>
                      </div>
                      <div className="p-2 bg-white border border-bc-border rounded-2xl bg-bc-gold/10">
                        <span className="text-[9px] text-bc-text-secondary">Oui à Jésus (F)</span>
                        <span className="block font-ui font-bold text-bc-text">{rc.ojFemmes}</span>
                      </div>
                    </div>
                    {rc.notes && (
                      <p className="font-serif italic text-bc-text-secondary leading-relaxed mt-2">
                        "{rc.notes}"
                      </p>
                    )}
                  </div>
                )}

                {selectedReport.reportType === 'rapport_bloom_bus_life' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary">Mobilisés au car</span>
                        <span className="block font-ui font-bold text-bc-text">{rc.mobilised} personnes</span>
                      </div>
                      <div className="p-2 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary">Présents au culte</span>
                        <span className="block font-ui font-bold text-[color:var(--accent-1)]">{rc.presencesCulte} personnes</span>
                      </div>
                    </div>
                    {Array.isArray(rc.visitesRealisees) && (
                      <div className="p-2 bg-white border border-bc-border rounded-2xl">
                        <span className="text-[9px] text-bc-text-secondary">Membres visités</span>
                        <span className="block font-ui font-bold text-bc-text">{rc.visitesRealisees.length} membre(s)</span>
                      </div>
                    )}
                    {rc.incidents && (
                      <p className="text-[10px] bg-white border border-bc-border rounded-2xl p-2 font-mono text-bc-purple mt-2">
                        🚨 Incident: {rc.incidents}
                      </p>
                    )}
                  </div>
                )}

                {selectedReport.reportType === 'rapport_bloom_bus_member' && (
                  <div className="space-y-3 text-xs">
                    <p className="font-bold text-bc-text">
                      Suivi holistique du membre : <span className="text-bc-text">{rc.memberName}</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="flex justify-between border-b border-bc-border/40 py-1">
                        <span className="text-bc-text-secondary">Spirituel</span>
                        <span className="font-bold font-mono">{rc.sprVal}/5</span>
                      </div>
                      <div className="flex justify-between border-b border-bc-border/40 py-1">
                        <span className="text-bc-text-secondary">Social</span>
                        <span className="font-bold font-mono">{rc.socVal}/5</span>
                      </div>
                      <div className="flex justify-between border-b border-bc-border/40 py-1">
                        <span className="text-bc-text-secondary">Financier</span>
                        <span className="font-bold font-mono">{rc.finVal}/5</span>
                      </div>
                      <div className="flex justify-between border-b border-bc-border/40 py-1">
                        <span className="text-bc-text-secondary">Physique</span>
                        <span className="font-bold font-mono">{rc.phyVal}/5</span>
                      </div>
                    </div>
                    {Array.isArray(rc.culteIds) && (
                      <p className="text-bc-text-secondary">
                        Présence au culte : <span className="font-bold text-bc-text">{rc.culteIds.length} culte(s)</span>
                      </p>
                    )}
                  </div>
                )}

                {selectedReport.reportType === 'rapport_pastoral' && (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-bc-purple/10 border border-bc-purple/30 rounded-full">
                      <span className="text-[9px] text-bc-purple font-black uppercase tracking-widest block mb-1">AXE CURSUS SPIRITUEL</span>
                      <p className="font-bold">Évaluation spirituelle du collaborateur pastoral.</p>
                    </div>
                    <div className="space-y-1 mt-2">
                      <div className="flex justify-between py-1 border-b">
                        <span className="text-bc-text-secondary">Niveau Spirituel</span>
                        <span className="font-bold text-bc-purple">{rc.spiritualLevel}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b">
                        <span className="text-bc-text-secondary">Leadership & Capacité</span>
                        <span className="font-bold text-bc-purple">{rc.leadershipLevel}</span>
                      </div>
                    </div>
                    {rc.notes && (
                      <p className="font-serif italic text-bc-text-secondary leading-relaxed mt-2 pt-2 border-t">
                        "{rc.notes}"
                      </p>
                    )}
                  </div>
                )}

                {selectedReport.reportType === 'rapport_portiers' && (
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="p-2 bg-white border border-bc-border rounded-2xl text-center">
                      <span className="text-[9px] text-bc-text-secondary block">Hommes</span>
                      <span className="font-ui font-bold">{rc.men}</span>
                    </div>
                    <div className="p-2 bg-white border border-bc-border rounded-2xl text-center">
                      <span className="text-[9px] text-bc-text-secondary block">Femmes</span>
                      <span className="font-ui font-bold">{rc.women}</span>
                    </div>
                    <div className="p-2 bg-white border border-bc-border rounded-2xl text-center">
                      <span className="text-[9px] text-bc-text-secondary block">En ligne</span>
                      <span className="font-ui font-bold">{rc.online ?? 0}</span>
                    </div>
                    <div className="p-2 bg-bc-green/10 border border-bc-border rounded-2xl text-center">
                      <span className="text-[9px] text-bc-text-secondary block">Total</span>
                      <span className="font-ui font-bold">{rc.total}</span>
                    </div>
                  </div>
                )}

                {/* Fallback — types sans bloc dédié (service, rsa…) : jamais de panneau vide */}
                {!['rapport_culte', 'rapport_adn', 'rapport_bloom_bus_life', 'rapport_bloom_bus_member', 'rapport_pastoral', 'rapport_portiers'].includes(selectedReport.reportType) && (
                  <div className="text-xs text-bc-text-secondary">
                    {rc?.notes ? (
                      <p className="font-serif italic leading-relaxed">"{rc.notes}"</p>
                    ) : (
                      <p className="italic">Détails du rapport non structurés.</p>
                    )}
                  </div>
                )}

              </div>

              {/* Warning label for confidentiality */}
              <div className="p-3 bg-bc-canvas rounded-full text-[10px] text-bc-text-secondary flex items-center gap-2">
                <Clock size={12} />
                <span>Rapports régis par la matrice de permissions et les cascades territoriales d'Abidjan.</span>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-center p-12 text-bc-text-secondary">
              <FileText className="text-bc-warmgrey mb-2" size={32} />
              <p className="text-xs">Sélectionnez un rapport pour prévisualiser son contenu et l'exporter en PDF.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
