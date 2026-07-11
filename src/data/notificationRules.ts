// P1.2 — dérivation des alertes temporelles (NOTIFICATIONS.md : "réception non validée
// 3j", "statut bloqué en attente 7j / au rouge"). Ces déclencheurs n'ont pas de site
// d'action dans le code (rien ne "se passe", c'est le temps qui passe) : un vrai
// scheduler serveur les évaluerait en tâche de fond.
// ponytail: calcul pur ; App.tsx l'appelle sur un effet dépendant de members/settings
// (pas un vrai cron serveur) et déduplique par id avant d'insérer dans bc_notifications.
// delays vient de Settings > Déclencheurs (integ1 = pending, integ2 = red).
import { Member, AppNotification, Department, Ministry } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// §6.2 — à J+7, l'escalade cible le Ministre de tutelle du ministère dont dépend
// le département du membre, pas une alerte générique. Prend le premier département
// assigné au membre (un membre a rarement plusieurs départements en désaccord de tutelle).
function tuteurIdFor(m: Member, departments: Department[], ministries: Ministry[]): string | undefined {
  const deptId = Object.keys(m.departments ?? {})[0];
  const dept = departments.find(d => d.id === deptId);
  const ministry = ministries.find(mi => mi.id === dept?.ministryId);
  return ministry?.tuteurId;
}

// D6 — NOTIFICATIONS.md : « membre au rouge → Coach/Leader/Responsable assigné » (en plus
// du Ministre de tutelle). Le coach assigné = mentorId ; le responsable = le Responsable
// des départements du membre.
function encadrantIdsFor(m: Member, members: Member[]): string[] {
  const ids: string[] = [];
  if (m.mentorId) ids.push(m.mentorId);
  const deptIds = Object.keys(m.departments ?? {});
  for (const x of members) {
    if (x.id === m.id) continue;
    if (Object.entries(x.departments ?? {}).some(([dId, fn]) => deptIds.includes(dId) && fn === 'Responsable')) {
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
    if (m.integrationState !== 'En attente' || !m.integrationDateRegistered) continue;
    const days = (now.getTime() - new Date(m.integrationDateRegistered).getTime()) / DAY_MS;
    if (days > delays.red) {
      // D6 — une alerte par destinataire (Ministre de tutelle + coach assigné + responsable
      // de dépt), dédupliquée. id unique par (membre, destinataire).
      const recipients = new Set<string>();
      const tut = tuteurIdFor(m, departments, ministries);
      if (tut) recipients.add(tut);
      for (const id of encadrantIdsFor(m, members)) recipients.add(id);
      const mk = (rid?: string) => ({
        id: rid ? `notif_red_${m.id}_${rid}` : `notif_red_${m.id}`,
        timestamp: now.toISOString(),
        title: 'Membre au rouge',
        message: `${m.firstName} ${m.lastName} est en attente depuis plus de ${delays.red} jours.`,
        type: 'alert' as const,
        read: false,
        branch: m.branch,
        targetMemberId: rid,
      });
      if (recipients.size === 0) out.push(mk());
      else for (const rid of recipients) out.push(mk(rid));
    } else if (days > delays.pending && !m.receptionValidated) {
      // WORKFLOWS §2.1 : après validation, le membre reste « En attente » mais
      // receptionValidated=true → ne plus alerter « à valider » (D1, sinon faux positifs).
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
  return out;
}
