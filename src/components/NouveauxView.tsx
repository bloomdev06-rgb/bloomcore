import React, { useState } from 'react';
import { 
  UserCheck, 
  Plus, 
  MapPin, 
  Clock, 
  ShieldAlert, 
  Sparkles, 
  CheckCircle, 
  AlertCircle,
  X,
  ChevronRight,
  RefreshCw,
  Phone,
  Flame
} from 'lucide-react';
import { Member, Branch, IntegrationState, CommunityLevel } from '../types';
import { INITIAL_DEPARTMENTS, INITIAL_BUS_LINES } from '../mockData';

interface NouveauxViewProps {
  members: Member[];
  onAddMember: (member: Member) => void;
  onUpdateMember: (member: Member) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

export default function NouveauxView({
  members,
  onAddMember,
  onUpdateMember,
  activeBranch,
  simulatedRole
}: NouveauxViewProps) {
  const [showNouveauModal, setShowNouveauModal] = useState(false);
  const isChurch = activeBranch === 'church';

  // Form Fields State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneParent, setPhoneParent] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'H' | 'F'>('H');
  const [birthDate, setBirthDate] = useState('2000-01-01');
  const [commune, setCommune] = useState('Cocody');
  const [ojFlag, setOjFlag] = useState(false);
  const [targetDept, setTargetDept] = useState('dept_louange');
  const [notes, setNotes] = useState('');

  // Get only nouveaux of active branch
  const nouveaux = members.filter(m => m.level === 'Nouveau' && (activeBranch === 'global' || m.branch === activeBranch));

  // Helper to calculate days since registration
  const getDaysSinceRegistered = (dateStr?: string) => {
    if (!dateStr) return 0;
    const regDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - regDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleSaveNouveau = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone) {
      alert('Veuillez remplir les informations obligatoires.');
      return;
    }

    const newNouveau: Member = {
      id: `new_custom_${Date.now()}`,
      firstName,
      lastName,
      phone,
      phoneParent,
      email,
      gender,
      birthDate,
      maritalStatus: 'Célibataire',
      profession: 'Étudiant',
      branch: activeBranch,
      level: 'Nouveau',
      pastoralCursus: 'Aucun',
      departments: { [targetDept]: 'Membre' },
      entryDate: new Date().toISOString().split('T')[0],
      integrationState: 'En attente',
      integrationDateRegistered: new Date().toISOString().split('T')[0],
      ojFlag,
      integrationNotes: notes,
      hasPassedToBossForm: false,
      gps: {
        lat: 5.3854,
        lng: -3.9781,
        commune
      },
      healthKPIs: {
        spirituel: 2,
        social: 2,
        financier: 2,
        physique: 3,
        presenceCulte: 1,
        presenceService: 1
      },
      baptismStatus: 'Non baptisé'
    };

    onAddMember(newNouveau);
    setShowNouveauModal(false);
    
    // Clear fields
    setFirstName('');
    setLastName('');
    setPhone('');
    setPhoneParent('');
    setEmail('');
    setOjFlag(false);
    setNotes('');
  };

  const handleTransitionState = (nouveau: Member, newState: IntegrationState) => {
    const updated: Member = {
      ...nouveau,
      integrationState: newState
    };

    // If Nouveau reaches "Intégré", they are automatically ready to be promoted to Stagiaire or Boss!
    if (newState === 'Intégré') {
      updated.level = 'Stagiaire';
      updated.hasPassedToBossForm = true; // Mark graduation
    }

    onUpdateMember(updated);
  };

  return (
    <div className="space-y-6">
      {/* Overview stats panel */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-ui font-bold text-bc-text">
            Pipeline d'intégration ADN (Accueil & Suivi)
          </h3>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gérez les nouveaux arrivants et les déclarations OJ "Oui à Jésus" pour {activeBranch === 'global' ? 'les deux branches' : isChurch ? 'Bloom Church' : 'Bloom Light'}.
          </p>
        </div>
        
        <button
          id="nouveau-register-btn"
          onClick={() => setShowNouveauModal(true)}
          className={`w-full sm:w-auto px-4 py-2.5 rounded-full font-ui font-bold text-xs text-white shadow-sm flex items-center justify-center space-x-1.5 transition-transform hover:scale-105 active:scale-95 cursor-pointer ${
            'bg-bc-green'
          }`}
        >
          <Plus size={16} />
          <span>Fiche ADN Nouveau & OJ</span>
        </button>
      </div>

      {/* Integration Board Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: En attente */}
        <div className="bg-bc-canvas/50 border border-bc-border rounded-[2rem] p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-ui font-bold text-bc-text flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-bc-green" />
              1. En attente ({nouveaux.filter(n => n.integrationState === 'En attente').length})
            </span>
            <span className="text-[10px] bg-bc-green/10 text-bc-text font-bold px-2 py-0.5 rounded-full">Relance</span>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {nouveaux.filter(n => n.integrationState === 'En attente').length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucun nouveau en attente.</p>
            ) : (
              nouveaux.filter(n => n.integrationState === 'En attente').map(nouveau => {
                const days = getDaysSinceRegistered(nouveau.integrationDateRegistered);
                const isOverdue3Days = days >= 3 && days < 7;
                const isOverdue7Days = days >= 7;

                return (
                  <div 
                    key={nouveau.id}
                    className={`p-4 rounded-full border bg-white shadow-sm transition-all relative ${
                      isOverdue7Days 
                        ? 'border-bc-purple bg-bc-purple/5' 
                        : isOverdue3Days 
                          ? 'border-bc-orange/50 bg-bc-green/5' 
                          : 'border-bc-border'
                    }`}
                  >
                    {/* Alerter Indicator */}
                    {isOverdue7Days && (
                      <div className="absolute top-2 right-2 text-bc-purple flex items-center gap-1 animate-pulse">
                        <ShieldAlert size={14} />
                        <span className="text-[8px] font-black uppercase">CRITIQUE (Pas de suivi)</span>
                      </div>
                    )}
                    {isOverdue3Days && !isOverdue7Days && (
                      <div className="absolute top-2 right-2 text-bc-text flex items-center gap-1">
                        <Clock size={14} />
                        <span className="text-[8px] font-bold uppercase">Relance &gt; 3j</span>
                      </div>
                    )}

                    <h4 className="font-ui font-bold text-bc-text text-xs">{nouveau.lastName} {nouveau.firstName}</h4>
                    <p className="text-[10px] text-bc-text-secondary font-mono mt-1">Tél: {nouveau.phone}</p>
                    
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[8px] bg-bc-canvas text-bc-text-secondary px-1.5 py-0.2 rounded font-medium">📍 {nouveau.gps?.commune}</span>
                      {nouveau.ojFlag && (
                        <span className="text-[8px] bg-bc-gold/20 text-bc-text px-1.5 py-0.2 rounded font-black flex items-center"><Flame size={10} className="mr-0.5 inline text-orange-500" /> OJ (Oui à Jésus)</span>
                      )}
                    </div>

                    <div className="border-t border-bc-border/60 pt-2.5 mt-3 flex justify-between items-center">
                      <span className="text-[9px] text-bc-text-secondary">Inscrit il y a {days} jour(s)</span>
                      <button
                        id={`transition-suivi-btn-${nouveau.id}`}
                        onClick={() => handleTransitionState(nouveau, 'Suivi')}
                        className={`px-2.5 py-1 rounded text-[9px] font-ui font-bold text-white flex items-center gap-1 ${
                          'bg-bc-green'
                        }`}
                      >
                        Valider contact <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: En cours de Suivi */}
        <div className="bg-bc-canvas/50 border border-bc-border rounded-[2rem] p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-ui font-bold text-bc-text flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-bc-cerulean" />
              2. En cours de Suivi ({nouveaux.filter(n => n.integrationState === 'Suivi').length})
            </span>
            <span className="text-[10px] bg-bc-cerulean/10 text-bc-cerulean font-bold px-2 py-0.5 rounded-full">Actif</span>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {nouveaux.filter(n => n.integrationState === 'Suivi').length === 0 ? (
              <p className="text-xs text-bc-text-secondary italic text-center py-6">Aucun nouveau en suivi actif.</p>
            ) : (
              nouveaux.filter(n => n.integrationState === 'Suivi').map(nouveau => (
                <div key={nouveau.id} className="p-4 rounded-full border border-bc-border bg-white shadow-sm">
                  <h4 className="font-ui font-bold text-bc-text text-xs">{nouveau.lastName} {nouveau.firstName}</h4>
                  <p className="text-[10px] text-bc-text-secondary font-mono mt-1">Tél: {nouveau.phone}</p>
                  
                  {nouveau.integrationNotes && (
                    <p className="text-[10px] bg-bc-canvas p-1.5 rounded text-bc-text-secondary italic mt-2 font-serif">
                      "{nouveau.integrationNotes}"
                    </p>
                  )}

                  <div className="border-t border-bc-border/60 pt-2.5 mt-3 flex justify-between items-center">
                      <span className="text-[9px] text-bc-text-secondary">Assiduité en cours</span>
                      <button
                        id={`transition-integre-btn-${nouveau.id}`}
                        onClick={() => handleTransitionState(nouveau, 'Intégré')}
                        className="px-2.5 py-1 rounded text-[9px] font-ui font-bold text-white bg-bc-anis flex items-center gap-1"
                      >
                        Intégrer comme Boss <CheckCircle size={10} />
                      </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Intégré / Nouveau Membre diplômé */}
        <div className="bg-bc-canvas/50 border border-bc-border rounded-[2rem] p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-ui font-bold text-bc-text flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-bc-anis" />
              3. Intégré (Diplômé)
            </span>
            <span className="text-[10px] bg-bc-anis/10 text-bc-anis font-bold px-2 py-0.5 rounded-full">Succès</span>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="p-4 bg-bc-anis/5 border border-bc-anis rounded-full text-center">
              <Sparkles className="mx-auto text-bc-anis mb-1.5" size={20} />
              <p className="text-[10px] text-bc-text-secondary font-medium">
                Les nouveaux atteignant ce statut sont automatiquement intégrés dans le répertoire actif en tant que <span className="font-bold text-bc-text">Stagiaires</span>.
              </p>
            </div>
            
            {members.filter(m => m.level !== 'Nouveau' && (activeBranch === 'global' || m.branch === activeBranch) && m.hasPassedToBossForm).slice(0, 3).map(grad => (
              <div key={grad.id} className="p-3.5 rounded-full border border-bc-border bg-white shadow-sm opacity-80">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-full bg-bc-anis/20 text-bc-anis font-ui font-black text-[10px] flex items-center justify-center">
                    {grad.firstName[0]}{grad.lastName[0]}
                  </div>
                  <div>
                    <h4 className="font-ui font-bold text-bc-text text-xs">{grad.lastName} {grad.firstName}</h4>
                    <p className="text-[9px] text-bc-anis font-bold">🎓 Diplômé le {grad.entryDate}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Formulaire ADN Nouveau Modal */}
      {showNouveauModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 border border-bc-border shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              id="close-nouveau-modal-btn"
              onClick={() => setShowNouveauModal(false)}
              className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-purple transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
              <UserCheck size={18} className={'text-bc-text'} />
              Formulaire ADN (Nouveau & Oui à Jésus)
            </h3>

            <form onSubmit={handleSaveNouveau} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Prénom *</label>
                  <input
                    id="nouveau-firstname"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Nom *</label>
                  <input
                    id="nouveau-lastname"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Téléphone de contact *</label>
                <input
                  id="nouveau-phone"
                  type="text"
                  required
                  placeholder="+225..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Téléphone Parent/Proche</label>
                  <input
                    id="nouveau-parent-phone"
                    type="text"
                    placeholder="+225..."
                    value={phoneParent}
                    onChange={(e) => setPhoneParent(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Commune</label>
                  <select
                    id="nouveau-commune"
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    <option value="Cocody">Cocody</option>
                    <option value="Yopougon">Yopougon</option>
                    <option value="Abobo">Abobo</option>
                    <option value="Koumassi">Koumassi</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Genre</label>
                  <div className="flex space-x-2">
                    <button
                      id="nouveau-gender-h"
                      type="button"
                      onClick={() => setGender('H')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full border ${gender === 'H' ? 'bg-bc-green text-white border-bc-green' : 'border-bc-border'}`}
                    >
                      Homme
                    </button>
                    <button
                      id="nouveau-gender-f"
                      type="button"
                      onClick={() => setGender('F')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full border ${gender === 'F' ? 'bg-bc-green text-white border-bc-green' : 'border-bc-border'}`}
                    >
                      Femme
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Département de Service Souhaité</label>
                  <select
                    id="nouveau-dept-target"
                    value={targetDept}
                    onChange={(e) => setTargetDept(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs bg-white focus:outline-none"
                  >
                    {INITIAL_DEPARTMENTS.filter(d => d.type === 'service').map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Oui à Jésus Toggles */}
              <div className="p-3 border border-bc-border rounded-full bg-bc-gold/10 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-bc-text block">Déclaration "Oui à Jésus" (OJ)</span>
                  <span className="text-[10px] text-bc-text-secondary">Cochez si la personne a donné sa vie au culte d'aujourd'hui.</span>
                </div>
                <button
                  id="nouveau-oj-toggle"
                  type="button"
                  onClick={() => setOjFlag(!ojFlag)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ${ojFlag ? 'bg-bc-green' : 'bg-bc-warmgrey'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${ojFlag ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-bc-text mb-1">Notes initiales</label>
                <textarea
                  id="nouveau-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  placeholder="Attentes, requêtes de prières..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-bc-border">
                <button
                  id="nouveau-cancel-btn"
                  type="button"
                  onClick={() => setShowNouveauModal(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas"
                >
                  Annuler
                </button>
                <button
                  id="nouveau-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 ${'bg-bc-green'}`}
                >
                  Enregistrer Nouveau
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
