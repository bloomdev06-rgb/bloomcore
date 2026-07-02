export type Branch = 'church' | 'light' | 'global';

export type CommunityLevel = 'Nouveau' | 'Stagiaire' | 'Boss' | 'Leader' | 'Coach';

export type IntegrationState = 'En attente' | 'Suivi' | 'Intégré';
export type IntegrationFollowStatus = 'Non suivi' | 'En attente' | 'En cours' | 'À recontacter' | 'Intégré' | 'Non intégré';

export type PastoralCursus = 
  | 'Aucun' 
  | 'Appelé' 
  | 'Serviteur' 
  | 'Gagneur d\'âme' 
  | 'Assistant Pasteur' 
  | 'Pasteur Assistant' 
  | 'Pasteur Titulaire';

export type DepartmentType = 'service' | 'spécial';

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
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  tuteurId?: string; // Member ID of the "Ministre de tutelle"
}

export interface Member {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  phoneParent?: string;
  email: string;
  gender: 'H' | 'F';
  birthDate: string;
  maritalStatus: 'Célibataire' | 'Marié(e)' | 'Divorcé(e)' | 'Veuf(ve)';
  profession: string;
  avatarUrl?: string;
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
  departments: { [deptId: string]: 'Responsable' | 'Adjoint' | 'Membre' | 'Capitaine de Bus' | 'Responsable de Zone' | 'Responsable de Commune' };
  
  // Special territorial coordinates
  bloomBusId?: string; // Attached bus ID
  
  // Integration tracking for Nouveaux
  integrationState?: IntegrationState;
  integrationFollowStatus?: IntegrationFollowStatus; // Integrator follow-up status (Espace Intégrateur). undefined = 'Non suivi'
  membershipWish?: 'Membre' | 'Visiteur'; // ADN saisie "Souhaites-tu être…" — aspiring member vs simple visitor
  receptionValidated?: boolean; // §6.2 — Responsable validated the reception (gate into "En attente"). undefined = treated as validated (legacy seeds)
  integrationAssignedTo?: string; // Member ID who follows up
  integrationDateRegistered?: string; // Date ADN registered them
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

  baptismStatus: 'Non baptisé' | 'Baptisé';
  baptismDate?: string;
  baptismViaDepartment?: boolean; // §7 — baptism went through the Baptism department process (vs hors process)
  isDrachme?: boolean; // §2.5 — "Drachme (perdu)": strayed member, manually flagged, distinct from "au rouge"
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
}

export interface Event {
  id: string;
  title: string;
  type: 'dimanche_1er' | 'dimanche_2e' | 'dimanche_unique' | 'special_inside' | 'special_altar' | 'special_nss';
  date: string;
  branch: Branch;
  closed: boolean;
  scope?: 'church' | 'light' | 'both';
  organizer?: string;
  projectId?: string;
}

export interface Report {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  targetBranch: Branch;
  date: string;
  reportType: 
    | 'rapport_service' 
    | 'rapport_rsa' 
    | 'rapport_bloom_bus_member'
    | 'rapport_bloom_bus_life'
    | 'rapport_adn'
    | 'rapport_portiers'
    | 'rapport_culte'
    | 'rapport_pastoral'
    | 'rapport_activite'      // §7.3 — observations + serviteurs
    | 'rapport_suivi_coach'   // §8 — suivi d'un membre par son Coach
    | 'rapport_observation';  // §8 — observation typée (avec/sans suivi)
  eventId?: string; // Optional links to cultes/events
  confidential: boolean;
  partagerAvecResponsableDept?: boolean; // §8.3 — lève le secret du rapport pastoral vers le Responsable
  content: any; // Dynamic JSON content depending on the reportType
}

export interface ProjectTask {
  id: string;
  title: string;
  assignee: string;
  due?: string;
  status: 'todo' | 'doing' | 'done';
}

export interface Project {
  id: string;
  name: string;
  scope: 'church' | 'light' | 'both' | 'ministry'; // §16 — transverse, branche, ou ministère
  ministryId?: string; // when scope === 'ministry'
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
