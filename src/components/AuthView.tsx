import React, { useState, useEffect } from 'react';
import { Member } from '../types';
import { apiLogin } from '../data';
import { apiRequestActivation, apiRequestReset, apiComplete } from '../data/api';
import { Phone, KeyRound, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

interface AuthViewProps {
  members: Member[];
  onLogin: (memberId: string) => void;
}

type Mode = 'login' | 'activate' | 'reset';

// Lien d'activation/reset (server/index.ts issueAuthLink) : ${APP_URL}/?activate=<token>
// ou ${APP_URL}/?reset=<token>. Lu une seule fois au premier rendu — le clic sur le lien
// de l'email doit amener DIRECTEMENT à l'écran "nouveau mot de passe", sans repasser par
// la demande d'identifiant ni faire saisir le token à la main (UX day-1, cf. retour terrain).
function readLinkToken(): { mode: Mode; token: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const activate = params.get('activate');
  const reset = params.get('reset');
  if (activate) return { mode: 'activate', token: activate };
  if (reset) return { mode: 'reset', token: reset };
  return null;
}

// P4.19 + phase 5 — real auth when the backend (server/) is reachable : login
// par téléphone OU email, activation/réinitialisation réelles (token à usage
// unique, envoi simulé par les adapters serveur ; en dev le token revient dans
// la réponse et est prérempli). Backend injoignable → repli hors-ligne : login
// mock (n'importe quel mot de passe) et message démo pour activation/reset.
export default function AuthView({ members, onLogin }: AuthViewProps) {
  const linkToken = readLinkToken();
  const [mode, setMode] = useState<Mode>(linkToken?.mode ?? 'login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Flux activation/reset : 'request' (identifiant) → 'sent' (vérifie ta boîte mail) → 'offline' (démo)
  // → 'setPassword' (arrivée directe depuis le lien email, token déjà connu, juste le nouveau mdp).
  // Pas d'étape "code à saisir à la main" : le token ne voyage que dans le lien de l'email.
  const [step, setStep] = useState<'request' | 'sent' | 'offline' | 'setPassword'>(
    linkToken ? 'setPassword' : 'request',
  );
  const [code] = useState(linkToken?.token ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Le token ne doit servir qu'une fois et ne pas traîner dans l'historique/URL partageable
  // (capture d'écran, etc.) — on le retire de la barre d'adresse juste après lecture.
  useEffect(() => {
    if (linkToken) window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Mot de passe requis.');
      return;
    }
    const result = await apiLogin(phone, password);
    if (result.ok && result.member) {
      onLogin(result.member.id);
      return;
    }
    if (result.reason === 'invalid') {
      setError('Identifiant ou mot de passe incorrect.');
      return;
    }
    // Backend injoignable. Le repli mock (n'importe quel mot de passe passe) n'est
    // autorisé qu'en DEV — en prod on refuse plutôt que d'ouvrir une session non vérifiée.
    if (!import.meta.env.DEV) {
      setError('Service indisponible. Réessayez plus tard.');
      return;
    }
    const member = members.find(m => m.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')
      || (m.email && m.email.toLowerCase() === phone.trim().toLowerCase()));
    if (!member) {
      setError('Aucun compte ne correspond à cet identifiant.');
      return;
    }
    onLogin(member.id);
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const data = mode === 'activate' ? await apiRequestActivation(phone) : await apiRequestReset(phone);
    if (!data) {
      setStep('offline'); // backend injoignable : message démo historique
      return;
    }
    // Anti-énumération : toujours 200, qu'un compte corresponde ou non. Le token ne voyage
    // que dans le lien envoyé par email/SMS — plus d'écran "code à saisir" ici.
    setStep('sent');
  };

  const submitComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('Mot de passe requis (min 6 caractères).');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const result = await apiComplete(code.trim(), newPassword);
    if (result.ok && result.member) {
      onLogin(result.member.id);
      return;
    }
    setError(result.reason === 'network'
      ? 'Serveur injoignable — réessaie plus tard.'
      : 'Lien invalide, expiré ou déjà utilisé — redemande un nouveau lien.');
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setStep('request');
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
  };

  const identifierField = (
    <div>
      <label className="text-xs font-bold text-bc-text-secondary">Téléphone ou email</label>
      <div className="mt-1 flex items-center gap-2 border border-bc-border rounded-full px-4 py-2.5">
        <Phone size={15} className="text-bc-text-secondary" />
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+225 07 07 12 34 56"
          className="flex-1 outline-none text-sm bg-transparent"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bc-canvas p-4">
      <div className="w-full max-w-sm bg-white rounded-[2rem] border border-bc-border p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-full bg-bc-green flex items-center justify-center text-white">
            <Sparkles size={18} />
          </div>
          <span className="font-ui font-black text-bc-text tracking-tight">BloomCore</span>
        </div>

        {mode === 'login' && (
          <form onSubmit={submitLogin} className="space-y-4">
            <h1 className="text-lg font-ui font-bold text-bc-text">Connexion</h1>
            {identifierField}
            <div>
              <label className="text-xs font-bold text-bc-text-secondary">Mot de passe</label>
              <div className="mt-1 flex items-center gap-2 border border-bc-border rounded-full px-4 py-2.5">
                <KeyRound size={15} className="text-bc-text-secondary" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 outline-none text-sm bg-transparent"
                />
              </div>
            </div>
            {error && <p className="text-xs text-bc-danger">{error}</p>}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-bc-green text-white rounded-full text-sm font-ui font-bold hover:opacity-90"
            >
              Se connecter <ArrowRight size={15} />
            </button>
            <div className="flex justify-between text-xs text-bc-text-secondary pt-1">
              <button type="button" onClick={() => switchMode('activate')} className="hover:text-bc-text">Activer mon compte</button>
              <button type="button" onClick={() => switchMode('reset')} className="hover:text-bc-text">Mot de passe oublié ?</button>
            </div>
          </form>
        )}

        {mode !== 'login' && step === 'request' && (
          <form onSubmit={submitRequest} className="space-y-4">
            <h1 className="text-lg font-ui font-bold text-bc-text">
              {mode === 'activate' ? 'Activer mon compte' : 'Réinitialiser mon mot de passe'}
            </h1>
            {identifierField}
            {error && <p className="text-xs text-bc-danger">{error}</p>}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-bc-green text-white rounded-full text-sm font-ui font-bold hover:opacity-90"
            >
              {mode === 'activate' ? "Envoyer le lien d'activation" : 'Envoyer le lien de réinitialisation'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full text-xs text-bc-text-secondary hover:text-bc-text">
              Retour à la connexion
            </button>
          </form>
        )}

        {mode !== 'login' && step === 'sent' && (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-bc-green/10 flex items-center justify-center text-bc-green">
              <ShieldCheck size={22} />
            </div>
            <h1 className="text-lg font-ui font-bold text-bc-text">Vérifie ta boîte mail</h1>
            <p className="text-sm text-bc-text-secondary">
              Si un compte correspond à cet identifiant, un email {mode === 'activate' ? "d'activation" : 'de réinitialisation'} vient
              d'être envoyé. Clique sur le lien qu'il contient pour {mode === 'activate' ? 'activer ton compte' : 'choisir un nouveau mot de passe'}.
            </p>
            <button type="button" onClick={() => switchMode('login')} className="text-xs font-bold text-bc-green hover:opacity-80">
              Retour à la connexion
            </button>
          </div>
        )}

        {mode !== 'login' && step === 'setPassword' && (
          <form onSubmit={submitComplete} className="space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-bc-green/10 flex items-center justify-center text-bc-green">
              <ShieldCheck size={22} />
            </div>
            <h1 className="text-lg font-ui font-bold text-bc-text text-center">
              {mode === 'activate' ? 'Activer mon compte' : 'Choisir un nouveau mot de passe'}
            </h1>
            <div>
              <label className="text-xs font-bold text-bc-text-secondary">Nouveau mot de passe (min 6)</label>
              <div className="mt-1 flex items-center gap-2 border border-bc-border rounded-full px-4 py-2.5">
                <KeyRound size={15} className="text-bc-text-secondary" />
                <input
                  type="password"
                  autoFocus
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 outline-none text-sm bg-transparent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-bc-text-secondary">Répéter le mot de passe</label>
              <div className="mt-1 flex items-center gap-2 border border-bc-border rounded-full px-4 py-2.5">
                <KeyRound size={15} className="text-bc-text-secondary" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 outline-none text-sm bg-transparent"
                />
              </div>
            </div>
            {error && <p className="text-xs text-bc-danger">{error}</p>}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-bc-green text-white rounded-full text-sm font-ui font-bold hover:opacity-90"
            >
              {mode === 'activate' ? 'Activer et me connecter' : 'Changer et me connecter'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full text-xs text-bc-text-secondary hover:text-bc-text">
              Retour à la connexion
            </button>
          </form>
        )}

        {mode !== 'login' && step === 'offline' && (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-bc-green/10 flex items-center justify-center text-bc-green">
              <ShieldCheck size={22} />
            </div>
            <p className="text-sm text-bc-text">
              Serveur injoignable — mode démo : aucun lien réel n'est envoyé.
            </p>
            <button type="button" onClick={() => switchMode('login')} className="text-xs font-bold text-bc-green hover:opacity-80">
              Retour à la connexion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
