import React, { useState, useEffect } from 'react';
import { Member, Branch, NotifChannels } from '../types';
import { useDepartments } from '../data';
import { apiChangePassword } from '../data/api';
import { ThemeToggle } from './ui/theme-toggle';
import { Phone, Mail, Briefcase, Calendar, MapPin, Droplet, ArrowRight, LogOut, Compass, Award, Pencil, Check, X, Smartphone, MessageSquare, Sun, Shield, KeyRound, Monitor, Trash2 } from 'lucide-react';
import { HealthSmiley } from './ui/HealthSmiley';
import { Avatar } from './ui/Avatar';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { toast } from './ui/Toast';

// P4.10 — mode Plein Soleil : même mécanisme que ThemeToggle (classe + localStorage),
// dupliqué en plus simple ici faute de 2e usage ailleurs. Effets CSS réels : P5.2.
function PleinSoleilToggle() {
  const [on, setOn] = useState(
    () => document.documentElement.classList.contains('plein-soleil') || localStorage.getItem('bc_plein_soleil') === '1'
  );
  useEffect(() => {
    document.documentElement.classList.toggle('plein-soleil', on);
    localStorage.setItem('bc_plein_soleil', on ? '1' : '0');
  }, [on]);
  return (
    <button
      onClick={() => setOn(o => !o)}
      role="switch"
      aria-checked={on}
      aria-label="Mode Plein Soleil"
      className={`flex w-14 h-7 p-0.5 rounded-full transition-colors duration-300 active-scale ${on ? 'bg-bc-gold' : 'bg-bc-canvas border border-bc-border'}`}
    >
      <div className={`w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-300 ${on ? 'translate-x-7' : 'translate-x-0'}`}>
        <Sun size={13} className={on ? 'text-bc-gold' : 'text-bc-text-secondary'} />
      </div>
    </button>
  );
}

// Session actuelle réelle dérivée du navigateur (plus de sessions factices). La liste
// multi-appareils viendra d'un endpoint /auth/sessions quand la table `tokens` sera exposée.
function currentSession() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navigateur';
  const os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Appareil';
  return [{ id: 'current', device: `${os} — ${browser}`, location: 'Session actuelle', current: true }];
}

const DEFAULT_NOTIF_CHANNELS: NotifChannels = { app: true, email: true, sms: false, whatsapp: false };
// ponytail: duplicated from SettingsView's CHANNELS list (icons differ from the shared
// NotifChannels type, so it can't live in types.ts) — keep the 4 keys aligned if either changes.
const NOTIF_CHANNELS: { key: keyof NotifChannels; label: string; icon: any }[] = [
  { key: 'app', label: 'App', icon: Smartphone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', icon: Phone },
];

const COMMUNITY_LEVELS = ['Nouveau', 'Stagiaire', 'Boss', 'Leader', 'Coach'];
const CURSUS_LEVELS = ['Aucun', 'Appelé', 'Serviteur', "Gagneur d'âme", 'Assistant Pasteur', 'Pasteur Assistant', 'Pasteur Titulaire'];
const BRANCH_LABEL: Record<Branch, string> = { church: 'Bloom Church', light: 'Bloom Light', global: 'Global' };

function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const idx = steps.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`px-3 py-1 rounded-full ${i < idx ? 'bg-bc-success/10 text-bc-success' : i === idx ? 'bg-bc-green text-white' : 'text-bc-text-secondary'}`}>{s}</span>
          {i < steps.length - 1 && <ArrowRight size={12} className={i < idx ? 'text-bc-success' : 'text-bc-border'} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-bc-canvas flex items-center justify-center shrink-0">
        <Icon size={16} className="text-bc-text-secondary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-bc-text-secondary font-bold">{label}</p>
        <p className="text-sm text-bc-text truncate">{value}</p>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-bc-text-secondary font-bold block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full p-2 border border-bc-border rounded-lg text-sm bg-white focus:outline-none focus:border-bc-green"
      />
    </div>
  );
}

interface ProfileViewProps {
  operator: Member;
  simulatedRole: string;
  onUpdateMember: (m: Member) => void;
  onDeleteMember?: (id: string) => void;
  onLogout?: () => void;
}

export default function ProfileView({ operator, simulatedRole, onUpdateMember, onDeleteMember, onLogout }: ProfileViewProps) {
  const departments = useDepartments();
  // TOUS les hooks AVANT l'early-return `!operator` (react-hooks/rules-of-hooks) : sinon leur
  // nombre change d'un rendu à l'autre quand operator passe de undefined à défini (chargement
  // async des membres) → « rendered fewer hooks than expected », crash. blankDraft est rendu
  // null-safe pour l'initialiseur du premier rendu où operator peut être absent.
  const blankDraft = () => ({ email: operator?.email, phone: operator?.phone, profession: operator?.profession, commune: operator?.gps?.commune ?? '', baptismDate: operator?.baptismDate ?? '' });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sessions, setSessions] = useState(currentSession);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [confirmingSelfDelete, setConfirmingSelfDelete] = useState(false);
  const [pwDraft, setPwDraft] = useState({ current: '', next: '', confirm: '' });
  // E1 — si aucun membre chargé (serveur renvoyant members: []), operator est undefined :
  // early-return plutôt que de crasher sur operator.firstName / operator.departments.
  if (!operator) {
    return (
      <div className="p-8 text-center text-sm text-bc-text-secondary">
        Aucun profil chargé. Reconnectez-vous ou vérifiez la synchronisation.
        {onLogout && (
          <div className="mt-4">
            <button onClick={() => onLogout()} className="px-4 py-2 rounded-full bg-bc-green text-white text-xs font-bold active:scale-95">Se déconnecter</button>
          </div>
        )}
      </div>
    );
  }
  const initials = `${operator.firstName[0] ?? ''}${operator.lastName[0] ?? ''}`.toUpperCase();

  // Édition self-service des coordonnées (état/hooks remontés avant l'early-return ci-dessus).
  // An already-recorded baptism (status + date) is the Baptism department's official record → locked.
  const officialBaptism = operator.baptismStatus === 'Baptisé' && !!operator.baptismDate;

  const startEdit = () => {
    setDraft(blankDraft());
    setEditing(true);
  };
  const saveEdit = () => {
    onUpdateMember({
      ...operator,
      email: draft.email,
      phone: draft.phone,
      profession: draft.profession,
      gps: draft.commune ? { ...(operator.gps ?? { lat: 0, lng: 0 }), commune: draft.commune } : operator.gps,
      // Only self-declare baptism when it isn't the department's official record.
      // Self-declared = hors process (baptismViaDepartment: false).
      ...(officialBaptism ? {} : {
        baptismStatus: draft.baptismDate ? 'Baptisé' : 'Non baptisé',
        baptismDate: draft.baptismDate || undefined,
        baptismViaDepartment: draft.baptismDate ? false : undefined,
      }),
    });
    setEditing(false);
  };

  const notifChannels = operator.notifChannels ?? DEFAULT_NOTIF_CHANNELS;
  const toggleNotifChannel = (key: keyof NotifChannels) =>
    onUpdateMember({ ...operator, notifChannels: { ...notifChannels, [key]: !notifChannels[key] } });

  // Phase 5 — changement de mot de passe réel via POST /auth/change-password (état remonté
  // avant l'early-return). Backend injoignable → message hors-ligne, rien n'est modifié.
  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwDraft.next !== pwDraft.confirm) {
      toast.error('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    const result = await apiChangePassword(pwDraft.current, pwDraft.next);
    if (!result) {
      toast.error('Serveur injoignable — le changement de mot de passe nécessite une connexion.');
      return;
    }
    if (!result.ok) {
      toast.error(result.error ?? 'Échec du changement de mot de passe.');
      return;
    }
    setShowPasswordModal(false);
    setPwDraft({ current: '', next: '', confirm: '' });
    toast.success('Mot de passe modifié.');
  };

  const healthData = [
    { subject: 'Spirituel', A: operator.healthKPIs.spirituel, fullMark: 5 },
    { subject: 'Social', A: operator.healthKPIs.social, fullMark: 5 },
    { subject: 'Physique', A: operator.healthKPIs.physique, fullMark: 5 },
    { subject: 'Financier', A: operator.healthKPIs.financier, fullMark: 5 },
    { subject: 'Présence Culte', A: operator.healthKPIs.presenceCulte, fullMark: 5 },
    { subject: 'Présence Service', A: operator.healthKPIs.presenceService, fullMark: 5 },
  ];

  const deptEntries = Object.entries(operator.departments);

  return (
    <div className="space-y-6">
      {/* Identity header */}
      <div className="bg-white rounded-[2rem] border border-bc-border p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
          <Avatar src={operator.avatarUrl} initials={initials} size="lg" className="w-20 h-20 text-2xl bg-bc-green/10 text-bc-green font-black" />
          <div className="flex-1">
            <h2 className="text-2xl font-ui font-black text-bc-text tracking-tight">{operator.firstName} {operator.lastName}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-bc-purple/10 text-bc-purple">{simulatedRole}</span>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-bc-green/10 text-bc-text">{operator.level}</span>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-bc-canvas text-bc-text-secondary">{BRANCH_LABEL[operator.branch]}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity + trajectory */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2rem] border border-bc-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-ui font-bold text-bc-text">Coordonnées</h3>
              {editing ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs font-bold text-bc-text-secondary px-3 py-1.5 rounded-full hover:bg-bc-canvas active-scale">
                    <X size={13} /> Annuler
                  </button>
                  <button onClick={saveEdit} className="flex items-center gap-1 text-xs font-bold text-white bg-bc-green px-3 py-1.5 rounded-full hover:opacity-90 active-scale">
                    <Check size={13} /> Enregistrer
                  </button>
                </div>
              ) : (
                <button onClick={startEdit} className="flex items-center gap-1 text-xs font-bold text-bc-text-secondary px-3 py-1.5 rounded-full hover:bg-bc-canvas active-scale">
                  <Pencil size={13} /> Modifier
                </button>
              )}
            </div>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <EditField label="Email" type="email" value={draft.email} onChange={v => setDraft(d => ({ ...d, email: v }))} />
                <EditField label="Téléphone" value={draft.phone} onChange={v => setDraft(d => ({ ...d, phone: v }))} />
                <EditField label="Profession" value={draft.profession} onChange={v => setDraft(d => ({ ...d, profession: v }))} />
                <EditField label="Commune" value={draft.commune} onChange={v => setDraft(d => ({ ...d, commune: v }))} />
                {officialBaptism ? (
                  <div className="sm:col-span-2">
                    <label className="text-[10px] uppercase tracking-wide text-bc-text-secondary font-bold block mb-1">Date de baptême</label>
                    <div className="w-full p-2 rounded-lg text-sm bg-bc-canvas border border-bc-border text-bc-text-secondary flex items-center gap-2">
                      <Droplet size={14} /> {operator.baptismDate} · gérée par le département Baptême
                    </div>
                  </div>
                ) : (
                  <EditField label="Date de baptême" type="date" value={draft.baptismDate} onChange={v => setDraft(d => ({ ...d, baptismDate: v }))} />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={Mail} label="Email" value={operator.email} />
                <InfoRow icon={Phone} label="Téléphone" value={operator.phone} />
                <InfoRow icon={Briefcase} label="Profession" value={operator.profession} />
                <InfoRow icon={Calendar} label="Membre depuis" value={operator.entryDate} />
                <InfoRow icon={MapPin} label="Commune" value={operator.gps?.commune ?? '—'} />
                <InfoRow icon={Droplet} label="Baptême" value={operator.baptismStatus === 'Baptisé' ? `Baptisé${operator.baptismDate ? ` · ${operator.baptismDate}` : ''}` : 'Non baptisé'} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2rem] border border-bc-border p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Compass size={15} className="text-bc-green" />
                <h3 className="text-sm font-ui font-bold text-bc-text">Niveau communautaire</h3>
              </div>
              <Stepper steps={COMMUNITY_LEVELS} current={operator.level} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award size={15} className="text-bc-purple" />
                <h3 className="text-sm font-ui font-bold text-bc-text">Cursus pastoral</h3>
              </div>
              <Stepper steps={CURSUS_LEVELS} current={operator.pastoralCursus} />
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-bc-border p-6">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-4">Mes départements</h3>
            {deptEntries.length === 0 ? (
              <p className="text-sm text-bc-text-secondary">Aucune affectation.</p>
            ) : (
              <div className="space-y-2">
                {deptEntries.map(([deptId, fn]) => {
                  const dept = departments.find(d => d.id === deptId);
                  return (
                    <div key={deptId} className="flex items-center justify-between px-4 py-2.5 rounded-full bg-bc-canvas">
                      <span className="text-sm font-semibold text-bc-text">{dept ? dept.name : deptId}</span>
                      <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-white text-bc-text-secondary">{fn}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Health radar + preferences */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] border border-bc-border p-6">
            <h3 className="text-sm font-ui font-bold text-bc-text mb-3">Santé communautaire</h3>
            <div className="bg-bc-canvas p-4 rounded-2xl border border-bc-border">
              <div className="grid grid-cols-3 gap-y-4 gap-x-1">
                {healthData.map(axis => (
                  <div key={axis.subject} className="flex flex-col items-center justify-center">
                    <div title={`${axis.subject}: ${axis.A}/5`}><HealthSmiley value={axis.A} size={24} /></div>
                    <span className="text-[8px] font-bold text-bc-text-secondary mt-1 uppercase text-center truncate w-full">{axis.subject}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-bc-border p-6 space-y-4">
            <h3 className="text-sm font-ui font-bold text-bc-text">Préférences</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bc-text">Thème</p>
                <p className="text-[11px] text-bc-text-secondary">Clair / sombre</p>
              </div>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bc-text">Mode Plein Soleil</p>
                <p className="text-[11px] text-bc-text-secondary">Contraste renforcé (extérieur)</p>
              </div>
              <PleinSoleilToggle />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bc-text">Langue</p>
                <p className="text-[11px] text-bc-text-secondary">Interface</p>
              </div>
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-bc-canvas text-bc-text-secondary">Français</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-bc-text mb-2">Canaux de notification</p>
              {/* ponytail: préférence stockée sur le membre ; pas d'effet réel sur le tri des
                  notifications (pas encore ciblées par membre) — sert le jour où ça le sera. */}
              <div className="flex flex-wrap gap-2">
                {NOTIF_CHANNELS.map(({ key, label, icon: Icon }) => {
                  const on = notifChannels[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleNotifChannel(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors active-scale ${on ? 'bg-bc-green/10 border-bc-green/30 text-bc-text' : 'bg-bc-canvas border-bc-border text-bc-text-secondary'}`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => onLogout?.()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-bc-danger bg-bc-danger/10 hover:bg-bc-danger/20 transition-colors active-scale mt-2"
            >
              <LogOut size={15} /> Déconnexion
            </button>
          </div>

          {/* P4.10 — Sécurité (mock) */}
          <div className="bg-white rounded-[2rem] border border-bc-border p-6 space-y-4">
            <h3 className="text-sm font-ui font-bold text-bc-text flex items-center gap-2">
              <Shield size={15} className="text-bc-text-secondary" /> Sécurité
            </h3>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-bc-text border border-bc-border hover:bg-bc-canvas transition-colors active-scale"
            >
              <KeyRound size={15} /> Changer le mot de passe
            </button>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-bc-text-secondary font-bold mb-2">Sessions actives</p>
              <div className="space-y-2">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-bc-canvas">
                    <div className="flex items-center gap-2 min-w-0">
                      <Monitor size={14} className="text-bc-text-secondary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-bc-text truncate">{s.device}{s.current && <span className="ml-1.5 text-[9px] font-bold text-bc-green">· Cette session</span>}</p>
                        <p className="text-[10px] text-bc-text-secondary truncate">{s.location}</p>
                      </div>
                    </div>
                    {!s.current && (
                      <button onClick={() => setRevokingSessionId(s.id)} className="p-1.5 text-bc-text-secondary hover:text-bc-danger shrink-0 active-scale" aria-label="Révoquer la session">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {onDeleteMember && (
              <button
                onClick={() => setConfirmingSelfDelete(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-bc-danger border border-bc-danger/30 hover:bg-bc-danger/10 transition-colors active-scale"
              >
                <Trash2 size={15} /> Supprimer mon profil
              </button>
            )}
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Changer le mot de passe" maxWidth="max-w-md">
            <form onSubmit={submitPasswordChange} className="space-y-3">
              <EditField label="Mot de passe actuel" type="password" value={pwDraft.current} onChange={v => setPwDraft(d => ({ ...d, current: v }))} />
              <EditField label="Nouveau mot de passe" type="password" value={pwDraft.next} onChange={v => setPwDraft(d => ({ ...d, next: v }))} />
              <EditField label="Confirmer le nouveau mot de passe" type="password" value={pwDraft.confirm} onChange={v => setPwDraft(d => ({ ...d, confirm: v }))} />
              <button type="submit" className="w-full bg-bc-green text-white rounded-full py-2.5 text-sm font-bold hover:opacity-90 active-scale mt-1">
                Enregistrer
              </button>
            </form>
        </Modal>
      )}
      <ConfirmDialog
        open={!!revokingSessionId}
        onCancel={() => setRevokingSessionId(null)}
        onConfirm={() => setSessions(prev => prev.filter(x => x.id !== revokingSessionId))}
        title="Révoquer la session"
        message="Cet appareil sera déconnecté immédiatement. Il devra se reconnecter pour accéder à nouveau au compte."
        confirmLabel="Révoquer"
      />
      <ConfirmDialog
        open={confirmingSelfDelete}
        onCancel={() => setConfirmingSelfDelete(false)}
        onConfirm={() => onDeleteMember?.(operator.id)}
        title="Supprimer mon profil"
        message="Votre profil sera définitivement supprimé et vous serez déconnecté(e). Cette action est irréversible."
        confirmLabel="Supprimer mon profil"
      />
    </div>
  );
}
