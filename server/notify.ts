// Moteur de notifications multicanal — NOTIFICATIONS.md. Le canal in-app est
// réel (collection notifications) ; email/SMS/WhatsApp passent par des adapters
// qui SIMULENT l'envoi (console + outbox) tant que les clés .env sont absentes.
// Brancher un vrai transport = remplir le corps d'UN adapter, l'interface est figée.
import { Member, AppNotification, AppSettings, NotifChannels } from '../src/types.ts';
import { db } from './db.ts';

type Channel = 'email' | 'sms' | 'whatsapp';

const DEFAULT_CHANNELS: NotifChannels = { app: true, email: true, sms: false, whatsapp: false };

// ponytail: adapters simulés — les clés env décident. Twilio/Nodemailer plus tard.
function transportConfigured(channel: Channel): boolean {
  if (channel === 'email') return !!process.env.SMTP_HOST;
  return !!process.env.TWILIO_ACCOUNT_SID;
}

function recipientAddress(channel: Channel, m: Member): string | null {
  if (channel === 'email') return m.email || null;
  return m.phone || null;
}

// S9 — ne jamais logger l'adresse complète (fuite de PII dans les logs).
function maskRecipient(to: string): string {
  if (to.includes('@')) { const [u, d] = to.split('@'); return `${u.slice(0, 2)}***@${d}`; }
  return to.length > 4 ? `***${to.slice(-4)}` : '***';
}

function send(channel: Channel, member: Member, subject: string, body: string, dedupeKey: string): void {
  const to = recipientAddress(channel, member);
  if (!to) return;
  const status = transportConfigured(channel) ? 'pending' : 'simulated';
  const inserted = db
    .prepare(
      'INSERT OR IGNORE INTO outbox (dedupe_key, channel, recipient, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(dedupeKey, channel, to, subject, body, status, new Date().toISOString());
  if ((inserted as any).changes > 0 && status === 'simulated') {
    console.log(`[notify:${channel}→${maskRecipient(to)}] ${subject}`);
  }
  // ponytail: status 'pending' n'est jamais consommé aujourd'hui (aucun transport
  // réel branché) — le worker d'envoi arrivera avec les clés.
}

// Déclencheur d'un AppNotification : les ids temporels sont déterministes
// (notif_red_*/notif_pending3j_* ← scheduler + client) ; le reste retombe sur
// une correspondance par type. Trigger inconnu = canaux par défaut (app+email).
function triggerChannelsFor(n: AppNotification, settings: AppSettings | null): NotifChannels {
  const triggers = settings?.triggers ?? [];
  const id = n.id.startsWith('notif_red_') ? 'integ2' : n.id.startsWith('notif_pending3j_') ? 'integ1' : null;
  const t = (id && triggers.find((x) => x.id === id)) || (n.type === 'alert' ? triggers.find((x) => x.id === 'integ2') : null);
  return t?.channels ?? DEFAULT_CHANNELS;
}

// Fan-out d'un lot de NOUVELLES notifications vers les canaux hors-app.
// Destinataires : targetMemberId si présent, sinon les membres de la branche.
// Canaux = canaux du déclencheur ∩ préférences du membre (Mon Profil).
// dedupe_key = notifId:channel:memberId → idempotent (restart, re-PUT, scheduler).
export function dispatch(newNotifs: AppNotification[], members: Member[], settings: AppSettings | null): void {
  for (const n of newNotifs) {
    const recipients = n.targetMemberId
      ? members.filter((m) => m.id === n.targetMemberId)
      : members.filter((m) => !n.branch || n.branch === 'global' || m.branch === n.branch);
    const triggerChannels = triggerChannelsFor(n, settings);
    for (const m of recipients) {
      const prefs = m.notifChannels ?? DEFAULT_CHANNELS;
      for (const channel of ['email', 'sms', 'whatsapp'] as Channel[]) {
        if (triggerChannels[channel] && prefs[channel]) {
          send(channel, m, n.title, n.message, `${n.id}:${channel}:${m.id}`);
        }
      }
    }
  }
}
