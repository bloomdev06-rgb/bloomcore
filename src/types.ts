export type { ReportType, CapabilityOverrideSubject } from '../packages/shared/enums';
import type { ReportType, CapabilityOverrideSubject } from '../packages/shared/enums';

export type Branch = 'church' | 'light' | 'global';

// M5 §3 — valeurs snake_case FR (convergées). Libellés d'affichage via labelFor() (packages/shared/migrate).
export type CommunityLevel = 'nouveau' | 'stagiaire' | 'boss' | 'leader' | 'coach';

// Fonction d'un membre au sein d'un département (hiérarchie interne). Sur-ensemble réel
// conservé (§3 illustratif : tresorier/responsable_section réels, coach/leader vivent sur level).
export type DeptFunction =
  | 'responsable' | 'adjoint' | 'tresorier' | 'responsable_section' | 'membre'
  | 'capitaine' | 'responsable_zone' | 'responsable_commune';

export type IntegrationState = 'en_attente' | 'suivi' | 'integre';
export type IntegrationFollowStatus = 'Non suivi' | 'En attente' | 'En cours' | 'À recontacter' | 'Intégré' | 'Non intégré';

export type PastoralCursus =
  | 'aucun'
  | 'appele'
  | 'serviteur'
  | 'gagneur_ame'
  | 'assistant_pasteur'
  | 'pasteur_assistant'
  | 'pasteur_titulaire';

export type DepartmentType = 'normal' | 'special';

export type SpecialFunction = 'adn' | 'portiers' | 'integration' | 'bloom_bus' | 'gestion_cultes' | 'parcours_etapes';

// §7.2 — activité/routine récurrente d'un département (agenda).
export interface Activity {
  id: string;
  departmentId: string;
  title: string;
  recurrence: 'Hebdomadaire' | 'Mensuel' | 'Annuel' | 'Ponctuel';
  day?: string; // ex. 'Mardi' (pour les récurrences hebdo)
  time?: string; // ex. '18:00'
}

export interface Department {
  id: string;
  name: string;
  type: DepartmentType;
  ministryId: string;
  description: string;
  specialFunction?: SpecialFunction;
  // SEED: chaque département existe en 2 instances (une par branche).
  // ponytail: undefined = instance partagée entre branches; la duplication
  // bi-branche des seeds (+ migration des refs membres) attend le backend.
  branch?: Branch;
  // Organisation interne — pôles/sections créés librement par le Responsable.
  sections?: { id: string; name: string }[];
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  tuteurId?: string; // Member ID of the "Ministre de tutelle"
  branch?: Branch; // même convention que Department.branch
}

export interface Member {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  phoneParent?: string;
  emergencyContact?: string; // §2.1 — personne à contacter en cas d'urgence (nom + tél.), distinct de phoneParent
  nationality?: string; // §2.1 — nationalité
  neighborhood?: string; // §2.1 — quartier (précision dans la commune GPS)
  email: string;
  gender: 'H' | 'F';
  birthDate: string;
  maritalStatus: 'Célibataire' | 'Marié(e)' | 'Divorcé(e)' | 'Veuf(ve)';
  profession: string;
  // Niveau scolaire/d'études — renseigné quand la profession est élève ou étudiant (listes par niveau).
  schoolLevel?: string;
  avatarUrl?: string;
  source?: string;
  gps?: {
    lat: number;
    lng: number;
    commune: string;
  };
  entryDate: string;
  branch: Branch; // Branch of membership
  
  // Three axes
  level: CommunityLevel;
  pastoralCursus: PastoralCursus;
  
  // Department memberships: departmentId -> function
  departments: { [deptId: string]: DeptFunction };

  // Organisation interne — appartenance à une section/pôle du département: deptId -> sectionId
  deptSections?: { [deptId: string]: string };
  
  // Profil de test : rôle UI forcé pour ce compte (remplace le panneau « Simuler profil »
  // retiré). Quand présent, App l'utilise tel quel comme simulatedRole au lieu de le dériver
  // via resolveMemberRole — permet un compte de connexion réel par rôle testable, y compris
  // les rôles non dérivables (Pasteur Principal, ADN, Portier, GDC, Intégration).
  testRole?: string;

  // Special territorial coordinates
  bloomBusId?: string; // Attached bus ID

  // Enregistrement direct par un responsable hiérarchique Bloom Bus (hors procédure ADN
  // "nouveau") — rattachement département en attente de validation par le responsable de
  // département. undefined = pas concerné (membre créé normalement).
  deptAttachmentStatus?: 'pending' | 'validated' | 'rejected';
  deptAttachmentOrigin?: 'bloom_bus';

  // Integration tracking for Nouveaux
  integrationState?: IntegrationState;
  integrationFollowStatus?: IntegrationFollowStatus; // Integrator follow-up status (Espace Intégrateur). undefined = 'Non suivi'
  membershipWish?: 'Membre' | 'Visiteur'; // ADN saisie "Souhaites-tu être…" — aspiring member vs simple visitor
  receptionValidated?: boolean; // §6.2 — Responsable validated the reception (gate into "En attente"). undefined = treated as validated (legacy seeds)
  integrationAssignedTo?: string; // Member ID who follows up
  integrationDateRegistered?: string; // Date ADN registered them
  // Événement/culte de réception (fiche d'accueil ADN) : id d'Event, ou 'autre' (reçu hors
  // cadre). undefined = fiches d'avant ce champ → bucket « Autre / non renseigné » au dashboard ADN.
  receivedEventId?: string;
  lastContact?: string; // D5 — date du dernier contact/suivi (visite, rapport coach, MAJ intégration). Réinitialise l'horloge "au rouge".
  ojFlag?: boolean; // Oui à Jésus
  integrationNotes?: string;
  hasPassedToBossForm?: boolean; // Checks if the main full-member form has been completed
  
  // Health Metrics (scale 1-5, matching: Très faible, Faible, Moyen, Bon, Très bon)
  healthKPIs: {
    spirituel: number;
    social: number;
    financier: number;
    physique: number;
    presenceCulte: number;
    presenceService: number;
  };

  baptismStatus: 'non_baptise' | 'baptise';
  baptismDate?: string;
  baptismViaDepartment?: boolean; // §7 — baptism went through the Baptism department process (vs hors process)
  isDrachme?: boolean; // §2.5 — "Drachme (perdu)": strayed member, manually flagged, distinct from "au rouge"

  // FORMULAIRES §2 — champs membre complémentaires
  bloomEntry?: string; // "Entrée à Bloom" — mois + année, format YYYY-MM
  academy?: string; // Académie — "Non inscrit" / "Vases d'Honneur" / …
  currentStepId?: string; // WORKFLOWS §6 — étape courante du parcours à étapes (parcours_etapes)
  mentorId?: string; // Onglet 8 — mentor du parcours pastoral (Member ID), undefined = pas de mentor assigné
  notifChannels?: NotifChannels; // P1.2b — canaux choisis par le membre dans Mon Profil, undefined = défauts (app+email)
}

// P1.2 — canaux de notification (Réglages : déclencheurs globaux ; Mon Profil : préférences membre)
export interface NotifChannels { app: boolean; email: boolean; sms: boolean; whatsapp: boolean; webpush?: boolean }
export interface NotifTrigger { id: string; label: string; delayDays: number; channels: NotifChannels }
export interface AppSettings {
  branches: { church: { enabled: boolean; accent: string }; light: { enabled: boolean; accent: string } };
  triggers: NotifTrigger[];
  timezone: string;
  language: string;
  periods: { activeMemberMonths: number; weekStart: string; fiscalStart: string };
}

export interface BloomBusEntity {
  id: string;
  name: string;
  commune: string;
  zone: string;
  centerLat: number;
  centerLng: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actionType: string;
  operatorName: string;
  operatorId: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  entity?: string; // Affected entity type; usually derived from actionType if absent
  branch?: Branch; // Branch the affected entity belongs to (system-wide actions leave it unset)
}

export interface AppNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  read: boolean;
  branch?: Branch;
  // §6.2 — escalade à J+7 : ciblée sur le Ministre de tutelle plutôt qu'une alerte
  // générique par branche. Absent = notification visible par tous (comportement historique).
  targetMemberId?: string;
}

export type EventRecurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Event {
  id: string;
  title: string;
  type: string; // Catégorie libre (Culte, Séminaire, Retraite…) — liste gérable + ajout de type
  date: string;
  time?: string; // Heure de début 'HH:MM'
  endTime?: string; // Heure de fin 'HH:MM' — events existants en base peuvent ne pas l'avoir : rendu tolérant
  branch: Branch;
  closed: boolean;
  // Occurrence annulée pour ce jour (les autres occurrences de la série restent planifiées).
  // Posé à la main (bouton Annuler) ou automatiquement quand un événement ponctuel chevauche
  // le créneau (le récurrent s'efface par défaut). Exclue des agendas/sélecteurs/stats.
  cancelled?: boolean;
  scope?: 'church' | 'light' | 'both';
  organizer?: string; // Département organisateur : id de département OU 'church'/'light'/'both'
  projectId?: string; // Projet lié (optionnel)
  recurrence?: EventRecurrence; // undefined | 'none' = ponctuel ; sinon fréquence de répétition
}

export interface Report {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  targetBranch: Branch;
  date: string;
  weekOf?: string; // Id de semaine calendaire visée (lundi 'YYYY-MM-DD') — cf. src/data/week.ts
  reportType: ReportType; // source de vérité : packages/shared/enums.ts (§7.3 activité, §8 suivi/observation)
  eventId?: string; // Optional links to cultes/events
  departmentId?: string; // P1.3 — rattache le rapport à un département (KPIs départementaux/ministère, via Department.ministryId)
  confidential: boolean;
  partagerAvecResponsableDept?: boolean; // §8.3 — lève le secret du rapport pastoral vers le Responsable
  // Validation par le capitaine Bloom Bus (rapport_bloom_bus_member) : false = rempli par le
  // membre, en attente de validation ; true = validé (rempli par le capitaine+ OU validé après
  // coup). undefined = validé (rétrocompat des rapports d'avant ce workflow).
  validated?: boolean;
  // Verrou 24h Bloom Bus (src/data/reportLock.ts) : horodatages du remplissage initial et de
  // la validation — le rapport n'est plus modifiable 24h après le dernier de ces événements.
  // undefined = rapports d'avant ce champ (fallback : fin du jour de `date`).
  filledAt?: string;
  validatedAt?: string;
  content: any; // Dynamic JSON content depending on the reportType
}

export interface ProjectTask {
  id: string;
  title: string;
  assignee: string;
  due?: string;
  status: 'a_faire' | 'en_cours' | 'fait';
}

export interface Project {
  id: string;
  name: string;
  scope: 'branche' | 'transverse' | 'ministere'; // §3/§16 — transverse, branche, ou ministère
  branch?: Branch; // §3 M5 — identité de branche quand scope === 'branche' (ex church/light)
  ministryId?: string; // when scope === 'ministere'
  status: 'En cours' | 'Planifié' | 'Terminé';
  pmo: string;
  startDate?: string;
  endDate?: string;
  team?: { member: string; role: string }[];
  objectives?: { id: string; label: string; done: boolean }[];
  actions?: ProjectTask[];
}

// Global configuration for Role Permissions Matrix
export interface PermissionMatrix {
  [capability: string]: {
    [role: string]: boolean; // role e.g. "Pasteur", "Admin", "Responsable", "Coach", "Membre"
  };
}

// §11.3 — délégation d'une capacité (DELEGABLE_CAPS) par un Responsable à un membre
// de son département. `toId` est l'id réel du délégataire : seul un enregistrement
// avec `toId` renseigné peut accorder une capacité effective (cf. data/permissions.ts
// hasCapability). Les entrées saisies en texte libre (console Gouvernance) n'ont pas
// de `toId` et restent donc de la supervision passive, pas un octroi de droit.
export interface Delegation {
  id: string;
  from: string;
  to: string;
  toId?: string;
  scope: string;
  right: string;
}

// §2.6 — matrice de permissions DYNAMIQUE : ajuste la capacité d'une CLASSE de membres
// (par niveau, fonction de département ou cursus), scopée par branche. enabled=true accorde,
// false révoque, par-dessus la base. Cf. resolveCapability (src/data/permissions.ts).
export interface CapabilityOverride {
  id: string;
  subjectType: CapabilityOverrideSubject; // 'level' | 'function' | 'cursus'
  subjectValue: string;                   // ex. 'Leader' | 'Responsable' | 'Serviteur'
  branchId: Branch;
  capability: string;
  enabled: boolean;
  deletedAt?: string;
}

// §2.6 — exception NOMINATIVE accordée par un Ministre/Pasteur (§5). Ré-accorde une capacité
// à un membre précis même si sa classe ne l'a pas (ou qu'un override la révoque).
export interface SpecialAuthorization {
  id: string;
  memberId: string;
  capability: string;
  branchId?: Branch | null; // null/absent = toutes branches
  grantedById: string;
  createdAt: string;
  deletedAt?: string;
}

// Compte Admin/Super Admin (AccountsView + RBAC serveur). Convention d'id :
// `adm_<memberId>` — le suffixe est l'id réel du membre, ce qui permet au
// serveur de résoudre les rôles Admin/Super Admin depuis les données.
export interface AdminAccount {
  id: string;
  name: string;
  subtitle: string;
  role: 'Admin' | 'Super Admin';
  exception?: boolean;
  reason?: string;
}

// P1.4 — FormBuilder's schema catalog. See mockData.ts's INITIAL_FORMS for the seed data.
export type FieldType = 'text' | 'number' | 'choice' | 'scale' | 'checkbox' | 'date';
export interface Field { id: string; label: string; type: FieldType; required: boolean; }
export interface Step { id: string; label: string; validator: string; }
export interface FormDef { id: string; name: string; scope: string; version: number; kind: 'form' | 'steps'; fields: Field[]; steps?: Step[]; }
