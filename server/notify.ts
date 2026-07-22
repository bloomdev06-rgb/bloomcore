// Moteur de notifications multicanal — NOTIFICATIONS.md. Le canal in-app est
// réel (collection notifications) ; email/SMS/WhatsApp passent par des adapters
// qui SIMULENT l'envoi (console + outbox) tant que les clés .env sont absentes.
// Brancher un vrai transport = remplir le corps d'UN adapter, l'interface est figée.
import { Member, AppNotification, AppSettings, NotifChannels } from '../src/types.ts';
import { insertOutboxIfAbsent, listPendingOutbox, markOutboxSent, markOutboxFailed, listPushSubsForMember, deletePushSub } from './datastore.ts';

type Channel = 'email' | 'sms' | 'whatsapp' | 'webpush';

// webpush:true côté DÉFAUT-déclencheur = le push est un canal candidat pour toute notif ;
// le vrai garde est la préférence membre (prefs.webpush, opt-in via le toggle Mon Profil) ET
// l'existence d'un abonnement (sans abonnement, le fan-out produit 0 ligne).
const DEFAULT_CHANNELS: NotifChannels = { app: true, email: true, sms: false, whatsapp: false, webpush: true };

// Fan-out Web Push (pur, testable) : 1 notif × N abonnements → N lignes outbox à dedupe_key
// distinct (par endpoint) → un même épisode ne re-notifie pas un appareil déjà servi.
export function webpushRows(notifId: string, subs: { endpoint: string; p256dh: string; auth: string }[]) {
  return subs.map((s) => ({
    dedupeKey: `${notifId}:webpush:${s.endpoint}`,
    recipient: JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }),
  }));
}

// ponytail: adapters simulés — les clés env décident. Twilio/Nodemailer/web-push plus tard.
export function transportConfigured(channel: Channel): boolean {
  if (channel === 'email') return !!process.env.SMTP_HOST;
  if (channel === 'webpush') return !!process.env.VAPID_PRIVATE_KEY;
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

async function send(channel: Channel, member: Member, subject: string, body: string, dedupeKey: string): Promise<void> {
  const to = recipientAddress(channel, member);
  if (!to) return;
  const status = transportConfigured(channel) ? 'pending' : 'simulated';
  const { inserted } = await insertOutboxIfAbsent(dedupeKey, channel, to, subject, body, status, new Date().toISOString());
  if (inserted && status === 'simulated') {
    console.log(`[notify:${channel}→${maskRecipient(to)}] ${subject}`);
  }
  // status 'pending' est consommé par drainOutbox() (appelé par le scheduler).
}

// --- Transport réel -------------------------------------------------------
// Email via SMTP (nodemailer, import dynamique optionnel : si le paquet n'est pas
// installé, l'envoi échoue proprement et la ligne reste 'failed', pas de crash).
async function deliverEmail(to: string, subject: string, body: string): Promise<void> {
  const mod: any = await import('nodemailer' as any).catch(() => null);
  if (!mod?.createTransport) throw new Error('nodemailer indisponible (npm i nodemailer)');
  const transport = mod.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text: body });
}

// SMS / WhatsApp via l'API REST Twilio (fetch, aucune dépendance).
async function deliverTwilio(channel: 'sms' | 'whatsapp', to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio non configuré (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
  const from = channel === 'whatsapp' ? `whatsapp:${process.env.TWILIO_WHATSAPP_FROM ?? ''}` : (process.env.TWILIO_FROM ?? '');
  const dest = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const params = new URLSearchParams({ To: dest, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Web Push via VAPID (web-push, import dynamique optionnel). `to` = l'abonnement sérialisé
// ({ endpoint, keys:{p256dh,auth} }). Un abonnement mort (404/410) est purgé, pas compté échec.
async function deliverWebPush(to: string, subject: string, body: string): Promise<void> {
  const mod: any = await import('web-push' as any).catch(() => null);
  if (!mod?.sendNotification) throw new Error('web-push indisponible (npm i web-push)');
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID non configuré (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
  mod.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@bloomcore.app', pub, priv);
  const sub = JSON.parse(to);
  const payload = JSON.stringify({ title: subject, body, url: '/' });
  try {
    await mod.sendNotification(sub, payload);
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) { await deletePushSub(sub.endpoint); return; }
    throw e;
  }
}

async function deliver(channel: Channel, to: string, subject: string, body: string): Promise<void> {
  if (channel === 'email') return deliverEmail(to, subject, body);
  if (channel === 'webpush') return deliverWebPush(to, subject, body);
  return deliverTwilio(channel, to, body);
}

// Worker : draine les lignes outbox 'pending' et tente l'envoi réel. Idempotent
// (statut → 'sent'/'failed'), appelé périodiquement par le scheduler.
export async function drainOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  const rows = await listPendingOutbox(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deliver(row.channel as Channel, row.recipient, row.subject, row.body);
      await markOutboxSent(row.id, new Date().toISOString());
      sent++;
    } catch (e) {
      await markOutboxFailed(row.id, String((e as Error).message).slice(0, 300));
      failed++;
    }
  }
  if (sent || failed) console.log(`[outbox] ${sent} envoyé(s), ${failed} échec(s)`);
  return { sent, failed };
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
export async function dispatch(newNotifs: AppNotification[], members: Member[], settings: AppSettings | null): Promise<void> {
  for (const n of newNotifs) {
    const recipients = n.targetMemberId
      ? members.filter((m) => m.id === n.targetMemberId)
      : members.filter((m) => !n.branch || n.branch === 'global' || m.branch === n.branch);
    const triggerChannels = triggerChannelsFor(n, settings);
    for (const m of recipients) {
      const prefs = m.notifChannels ?? DEFAULT_CHANNELS;
      for (const channel of ['email', 'sms', 'whatsapp'] as Channel[]) {
        if (triggerChannels[channel] && prefs[channel]) {
          await send(channel, m, n.title, n.message, `${n.id}:${channel}:${m.id}`);
        }
      }
      // Web Push : fan-out 1→N (un appareil = un abonnement = une ligne outbox).
      if (triggerChannels.webpush && prefs.webpush) {
        const subs = await listPushSubsForMember(m.id);
        const status = transportConfigured('webpush') ? 'pending' : 'simulated';
        for (const row of webpushRows(n.id, subs)) {
          const { inserted } = await insertOutboxIfAbsent(row.dedupeKey, 'webpush', row.recipient, n.title, n.message, status, new Date().toISOString());
          if (inserted && status === 'simulated') console.log(`[notify:webpush] ${n.title}`);
        }
      }
    }
  }
}
