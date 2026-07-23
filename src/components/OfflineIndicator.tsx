import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { syncQueueLength, isSyncing } from '../data';

// Bascule visuelle « Sauvegardé localement » (ARCHITECTURE_TECHNIQUE.md §7).
// Rien à afficher quand tout est en ligne et synchronisé ; sinon une pastille
// discrète. Écoute online/offline + 'bc-sync-changed' (émis par api.ts à l'enfilage,
// au démarrage et à la fin de chaque flush). ponytail: pas de store, l'état vit ici.
export default function OfflineIndicator() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pending, setPending] = useState(() => syncQueueLength());
  const [syncing, setSyncing] = useState(() => isSyncing());

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onChange = () => { setPending(syncQueueLength()); setSyncing(isSyncing()); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('bc-sync-changed', onChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('bc-sync-changed', onChange);
    };
  }, []);

  if (online && pending === 0) return null;

  const offline = !online;
  // Le spinner ne tourne QUE pendant un vrai flush en vol — jamais en boucle « à vide ».
  // En ligne mais en attente (échec transitoire, pas d'auth) → badge statique « En attente ».
  const label = offline ? 'Sauvegardé localement' : syncing ? 'Synchro…' : 'En attente';
  const title = offline
    ? 'Hors ligne — vos saisies sont sauvegardées localement et synchronisées au retour du réseau'
    : syncing
      ? `Synchronisation en cours (${pending} modification(s))`
      : `${pending} modification(s) en attente — nouvelle tentative automatique`;
  return (
    <div
      title={title}
      className={`rounded-full px-2.5 py-1 flex items-center gap-1.5 text-xs font-ui font-bold ${
        offline ? 'bg-bc-canvas text-bc-text-secondary' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {offline
        ? <CloudOff size={14} />
        : <RefreshCw size={14} className={syncing ? 'animate-spin motion-reduce:animate-none' : ''} />}
      <span className="hidden sm:inline">{label}</span>
      {pending > 0 && <span className="tabular-nums">{pending}</span>}
    </div>
  );
}
