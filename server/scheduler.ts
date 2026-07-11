// Scheduler des alertes temporelles (réception 3j / au rouge 7j + escalade
// Ministre) — le "vrai cron" que App.tsx simulait côté client. Réutilise la
// même dérivation pure que le client (notificationRules.ts) : les ids sont
// déterministes (notif_red_<memberId>…), donc l'insertion est idempotente entre
// restarts ET dédupliquée avec l'effet client resté en fallback hors-ligne.
import { deriveTimeBasedNotifications } from '../src/data/notificationRules.ts';
import { AppSettings, Member } from '../src/types.ts';
import { getKv, appendToCollection } from './db.ts';
import { readCollection } from './guards.ts';
import { dispatch, drainOutbox } from './notify.ts';

const HOUR_MS = 60 * 60 * 1000;
const OUTBOX_DRAIN_MS = 60 * 1000; // draine l'outbox toutes les minutes

export function runSweep(now: Date = new Date()): number {
  const members = readCollection('members') as Member[];
  const settings = getKv<AppSettings>('settings');
  const integ1 = settings?.triggers.find((t) => t.id === 'integ1');
  const integ2 = settings?.triggers.find((t) => t.id === 'integ2');
  const derived = deriveTimeBasedNotifications(
    members,
    now,
    { pending: integ1?.delayDays ?? 3, red: integ2?.delayDays ?? 7 },
    readCollection('departments'),
    readCollection('ministries'),
  );
  const existing = new Set(readCollection('notifications', true).map((n: any) => n.id));
  const fresh = derived.filter((n) => !existing.has(n.id));
  if (fresh.length) {
    appendToCollection('notifications', fresh);
    dispatch(fresh, members, settings);
  }
  return fresh.length;
}

export function startScheduler(): void {
  const tick = () => {
    try {
      const n = runSweep();
      if (n) console.log(`[scheduler] ${n} alerte(s) temporelle(s) dérivée(s)`);
    } catch (e) {
      console.error('[scheduler] sweep failed:', e);
    }
  };
  tick(); // au boot
  setInterval(tick, HOUR_MS).unref?.();

  // Worker d'envoi : vide les lignes outbox 'pending' (email/SMS/WhatsApp réels).
  const drain = () => { drainOutbox().catch((e) => console.error('[outbox] drain failed:', e)); };
  drain();
  setInterval(drain, OUTBOX_DRAIN_MS).unref?.();
}
