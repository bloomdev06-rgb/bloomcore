// P1.2 — dérivation des alertes temporelles (NOTIFICATIONS.md : "réception non validée
// 3j", "statut bloqué en attente 7j / au rouge"). Ces déclencheurs n'ont pas de site
// d'action dans le code (rien ne "se passe", c'est le temps qui passe) : un vrai
// scheduler serveur les évaluerait en tâche de fond.
// ponytail: calcul pur ; App.tsx l'appelle sur un effet dépendant de members/settings
// (pas un vrai cron serveur) et déduplique par id avant d'insérer dans bc_notifications.
// delays vient de Settings > Déclencheurs (integ1 = pending, integ2 = red).
import { Member, AppNotification, Department, Ministry } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// §7.2 — cadence de relance graduée sur un membre suivi non contacté (jours). Ajustable ;
// promouvable en AppSettings.triggers si un réglage runtime devient nécessaire.
const RELANCE_DAYS = { mentor: 3, responsable: 7, ministre: 10 };

// §6.2 — l'escalade cible le Ministre de tutelle du ministère dont dépend le département du
// membre. Prend le premier département assigné (un membre a rarement plusieurs départements
// en désaccord de tutelle).
function tuteurIdFor(m: Member, departments: Department[], ministries: Ministry[]): string | undefined {
  const deptId = Object.keys(m.departments ?? {})[0];
  const dept = departments.find(d => d.id === deptId);
  const ministry = ministries.find(mi => mi.id === dept?.ministryId);
  return ministry?.tuteurId;
}

// Le(s) Responsable(s) des départements du membre.
function responsableIdsFor(m: Member, members: Member[]): string[] {
  const ids: string[] = [];
  const deptIds = Object.keys(m.departments ?? {});
  for (const x of members) {
    if (x.id === m.id) continue;
    if (Object.entries(x.departments ?? {}).some(([dId, fn]) => deptIds.includes(dId) && fn === 'responsable')) {
      ids.push(x.id);
    }
  }
  return ids;
}

export function deriveTimeBasedNotifications(
  members: Member[],
  now: Date = new Date(),
  delays: { pending: number; red: number } = { pending: 3, red: 7 },
  departments: Department[] = [],
  ministries: Ministry[] = [],
): AppNotification[] {
  const out: AppNotification[] = [];
  for (const m of members) {
    // §7.2 — relance graduée : membre suivi (en_attente || suivi) dont l'horloge de contact
    // (dernier contact, sinon date d'enregistrement) dépasse chaque palier. Chaque palier
    // notifie un cran plus haut et une seule fois par épisode : l'id inclut la date-horloge,
    // donc un NOUVEL épisode (après un contact qui réarme lastContact) ré-alerte, mais un même
    // épisode ne harcèle pas à chaque tick.
    const followed = m.integrationState === 'en_attente' || m.integrationState === 'suivi';
    const clock = m.lastContact || m.integrationDateRegistered;
    if (followed && clock) {
      const days = (now.getTime() - new Date(clock).getTime()) / DAY_MS;
      const clockDay = new Date(clock).toISOString().slice(0, 10);
      const tiers: { key: string; rid: string; days: number; type: 'warning' | 'alert' }[] = [];
      if (days > RELANCE_DAYS.mentor && m.mentorId) {
        tiers.push({ key: 'mentor', rid: m.mentorId, days: RELANCE_DAYS.mentor, type: 'warning' });
      }
      if (days > RELANCE_DAYS.responsable) {
        for (const id of responsableIdsFor(m, members)) tiers.push({ key: 'resp', rid: id, days: RELANCE_DAYS.responsable, type: 'warning' });
      }
      if (days > RELANCE_DAYS.ministre) {
        const tut = tuteurIdFor(m, departments, ministries);
        if (tut) tiers.push({ key: 'min', rid: tut, days: RELANCE_DAYS.ministre, type: 'alert' });
      }
      for (const t of tiers) {
        out.push({
          id: `notif_relance_${t.key}_${m.id}_${t.rid}_${clockDay}`,
          timestamp: now.toISOString(),
          title: 'Relance suivi',
          message: `${m.firstName} ${m.lastName} n'a pas été contacté depuis plus de ${t.days} jours.`,
          type: t.type,
          read: false,
          branch: m.branch,
          targetMemberId: t.rid,
        });
      }
    }

    // WORKFLOWS §2.1 — réception non validée (concern distinct de la relance) : membre encore
    // « En attente », non réceptionné, au-delà du délai. Après validation receptionValidated=true
    // → ne plus alerter (D1, sinon faux positifs).
    if (m.integrationState === 'en_attente' && m.integrationDateRegistered && !m.receptionValidated) {
      const rdays = (now.getTime() - new Date(m.integrationDateRegistered).getTime()) / DAY_MS;
      if (rdays > delays.pending) {
        out.push({
          id: `notif_pending3j_${m.id}`,
          timestamp: now.toISOString(),
          title: 'Réception à valider',
          message: `${m.firstName} ${m.lastName} attend une validation de réception depuis plus de ${delays.pending} jours.`,
          type: 'warning',
          read: false,
          branch: m.branch,
        });
      }
    }
  }
  return out;
}
