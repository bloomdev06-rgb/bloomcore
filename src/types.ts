export type Branch = 'church' | 'light' | 'global';

export type CommunityLevel = 'Nouveau' | 'Stagiaire' | 'Boss' | 'Leader' | 'Coach';

export type IntegrationState = 'En attente' | 'Suivi' | 'Intégré';

export type PastoralCursus = 
  | 'Aucun' 
  | 'Appelé' 
  | 'Serviteur' 
  | 'Gagneur d\'âme' 
  | 'Assistant Pasteur' 
  | 'Pasteur Assistant' 
  | 'Pasteur Titulaire';

export type DepartmentType = 'service' | 'spécial';

export interface Department {
  id: string;
  name: string;
  type: DepartmentType;
  ministryId: string;
  description: string;
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
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
    | 'rapport_pastoral';
  eventId?: string; // Optional links to cultes/events
  confidential: boolean;
  content: any; // Dynamic JSON content depending on the reportType
}

export interface Project {
  id: string;
  name: string;
  scope: 'church' | 'light' | 'both';
  status: 'En cours' | 'Planifié' | 'Terminé';
  pmo: string;
}

// Global configuration for Role Permissions Matrix
export interface PermissionMatrix {
  [capability: string]: {
    [role: string]: boolean; // role e.g. "Pasteur", "Admin", "Responsable", "Coach", "Membre"
  };
}
