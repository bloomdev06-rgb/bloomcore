import { Member, Department, Ministry, BloomBusEntity, AuditLog, AppNotification, Event, Report, PermissionMatrix, Project, Activity, AppSettings, FormDef, Field, AdminAccount } from './types';
import { buildCanonicalEvents } from './data/events';

// Comptes Admin seed. Convention d'id `adm_<memberId>` (voir types.ts AdminAccount) :
// le serveur en dérive les rôles Admin/Super Admin. Seul Affeny Grah (mem_1) existe
// dans les membres seed — les anciens "Ps. Kacou"/"Yannick G." étaient fictifs et
// irrésolubles côté RBAC, retirés.
export const INITIAL_ADMINS: AdminAccount[] = [
  { id: 'adm_mem_1', name: 'Affeny Grah', subtitle: 'Super Admin (Système)', role: 'Super Admin' },
  // Profils de test — comptes admin réels adossés aux membres mem_test_1/2 (voir TEST_PROFILES)
  // pour que les écritures admin côté serveur (permissions, settings) soient autorisées.
  { id: 'adm_mem_test_1', name: 'Test SuperAdmin', subtitle: 'Profil de test — Super Admin', role: 'Super Admin' },
  { id: 'adm_mem_test_2', name: 'Test Admin', subtitle: 'Profil de test — Admin', role: 'Admin' },
];

// P1.4 — labels generated for the plain text-only forms; the others list fields explicitly.
const genFields = (labels: string[]): Field[] =>
  labels.map((label, i) => ({ id: `f${i}`, label, type: 'text', required: i === 0 }));

export const INITIAL_FORMS: FormDef[] = [
  { id: 'fd_nouveau', name: 'Formulaire Nouveau', scope: 'ADN', version: 2, kind: 'form', fields: [
    { id: 'f0', label: 'Type de membre', type: 'choice', required: true },
    { id: 'f1', label: "Date d'activité (culte)", type: 'date', required: true },
    { id: 'f2', label: 'Type de culte', type: 'choice', required: false },
    { id: 'f3', label: 'Prénom', type: 'text', required: true },
    { id: 'f4', label: 'Nom', type: 'text', required: true },
    { id: 'f5', label: 'Contact', type: 'text', required: true },
    { id: 'f6', label: 'Genre', type: 'choice', required: false },
    { id: 'f7', label: 'Date de naissance', type: 'date', required: false },
    { id: 'f8', label: 'Commune / Quartier', type: 'choice', required: false },
    { id: 'f9', label: 'Photo', type: 'text', required: true },
    { id: 'f10', label: 'Comment nous a-t-il connu ?', type: 'choice', required: false },
    { id: 'f11', label: 'Souhaites-tu être…', type: 'choice', required: false },
    { id: 'f12', label: "Département d'intérêt", type: 'choice', required: false },
  ] },
  { id: 'fd_membre', name: 'Formulaire Membre', scope: 'Responsable', version: 5, kind: 'form', fields: [
    { id: 'f20', label: 'Photo du membre', type: 'text', required: false },
    { id: 'f0', label: 'Nom de famille', type: 'text', required: true },
    { id: 'f1', label: 'Prénom(s)', type: 'text', required: true },
    { id: 'f2', label: 'Téléphone unique', type: 'text', required: true },
    { id: 'f3', label: 'Téléphone Parent/Proche', type: 'text', required: false },
    { id: 'f4', label: 'Genre', type: 'choice', required: true },
    { id: 'f5', label: 'Date de Naissance', type: 'date', required: true },
    { id: 'f6', label: 'État Matrimonial', type: 'choice', required: false },
    { id: 'f7', label: 'Email', type: 'text', required: false },
    { id: 'f8', label: 'Profession', type: 'text', required: false },
    { id: 'f9', label: 'Commune', type: 'choice', required: false },
    { id: 'f10', label: 'Latitude', type: 'text', required: false },
    { id: 'f11', label: 'Longitude', type: 'text', required: false },
    { id: 'f12', label: 'Niveau Communautaire', type: 'choice', required: false },
    { id: 'f13', label: 'Cursus Pastoral', type: 'choice', required: false },
    { id: 'f14', label: "Branche d'affectation", type: 'choice', required: false },
    { id: 'f15', label: 'Département', type: 'choice', required: false },
    { id: 'f16', label: 'Fonction occupée', type: 'choice', required: false },
    { id: 'f17', label: 'Baptême', type: 'choice', required: false },
    { id: 'f18', label: 'Date de baptême', type: 'date', required: false },
    { id: 'f19', label: 'Voie de baptême', type: 'choice', required: false },
  ] },
  { id: 'fd_service', name: 'Rapport de service', scope: 'Standard', version: 2, kind: 'form', fields: [
    { id: 'f0', label: 'Évènement concerné', type: 'choice', required: true },
    { id: 'f1', label: 'Serviteurs présents', type: 'checkbox', required: false },
    { id: 'f2', label: 'Notes', type: 'text', required: false },
  ] },
  { id: 'fd_rsa', name: 'Rapport RSA', scope: 'Standard', version: 2, kind: 'form', fields: [
    { id: 'f0', label: 'Actions confiées', type: 'text', required: false },
    { id: 'f1', label: 'Notes', type: 'text', required: false },
  ] },
  { id: 'fd_bus_sante', name: 'Rapport Bloom Bus (Santé)', scope: 'Capitaine / Leader', version: 1, kind: 'form', fields: [
    { id: 'f0', label: 'Vie spirituelle', type: 'scale', required: true },
    { id: 'f1', label: 'Vie sociale', type: 'scale', required: true },
    { id: 'f2', label: 'Santé physique', type: 'scale', required: true },
    { id: 'f3', label: 'Situation financière', type: 'scale', required: true },
    { id: 'f4', label: 'Présence au culte', type: 'scale', required: true },
  ] },
  { id: 'fd_adn', name: 'Rapport ADN (Comptage)', scope: 'ADN', version: 1, kind: 'form', fields: [
    { id: 'f0', label: 'Nouveaux (H)', type: 'number', required: true },
    { id: 'f1', label: 'Nouveaux (F)', type: 'number', required: true },
    { id: 'f2', label: 'OJ (H)', type: 'number', required: true },
    { id: 'f3', label: 'OJ (F)', type: 'number', required: true },
  ] },
  { id: 'fd_bapteme', name: 'Parcours Baptême', scope: 'Parcours à étapes', version: 1, kind: 'steps', fields: [], steps: [
    { id: 's0', label: 'Inscription au parcours', validator: 'Responsable' },
    { id: 's1', label: 'Suivi des 3 cours', validator: 'Leader' },
    { id: 's2', label: 'Entretien de baptême', validator: 'Responsable' },
    { id: 's3', label: 'Baptême physique', validator: 'Pasteur' },
  ] },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj_nss',
    name: 'Nouvelle Semaine Spirituelle (NSS)',
    scope: 'both',
    status: 'En cours',
    pmo: 'Esther Bamba',
    startDate: '2026-06-01',
    endDate: '2026-08-15',
    team: [
      { member: 'Esther Bamba', role: 'PMO' },
      { member: 'Jean Kouassi', role: 'Responsable COM' },
      { member: 'Paul Adjé', role: 'Logistique' },
    ],
    objectives: [
      { id: 'o1', label: 'Réserver la salle principale', done: true },
      { id: 'o2', label: 'Valider le programme des 7 soirées', done: true },
      { id: 'o3', label: 'Mobiliser 500 participants', done: false },
      { id: 'o4', label: 'Boucler le budget sono/lumière', done: false },
    ],
    actions: [
      { id: 'a1', title: 'Contrat prestataire son', assignee: 'Paul Adjé', due: '2026-07-10', status: 'doing' },
      { id: 'a2', title: 'Visuels réseaux sociaux', assignee: 'Jean Kouassi', due: '2026-07-05', status: 'todo' },
      { id: 'a3', title: 'Liste des orateurs', assignee: 'Esther Bamba', due: '2026-06-20', status: 'done' },
      { id: 'a4', title: 'Plan de salle & protocole', assignee: 'Paul Adjé', status: 'todo' },
    ],
  },
  { id: 'proj_rsa', name: 'RSA', scope: 'both', status: 'En cours', pmo: 'Non assigné' },
  { id: 'proj_game_changers', name: 'Game Changers', scope: 'both', status: 'En cours', pmo: 'Non assigné' },
  { id: 'proj_finances', name: 'Les Finances', scope: 'both', status: 'En cours', pmo: 'Non assigné' },
  { id: 'proj_inside', name: 'Inside (ex RDV Spécial)', scope: 'light', status: 'En cours', pmo: 'Non assigné' },
  { id: 'proj_after', name: 'Le After', scope: 'church', status: 'En cours', pmo: 'Non assigné' },
];

export const INITIAL_MINISTRIES: Ministry[] = [
  { id: 'min_intimite', name: "Ministère de l'Intimité", description: 'MRES, Bloom Praise, Intercession, Sainte Cène' },
  { id: 'min_art', name: "Ministère de l'Art", description: 'Bloom Dancers, Bloom Cinema, Trap Church, Bloom Art' },
  { id: 'min_tech_scene', name: "Ministère de la Tech & Scène", description: 'Prod & Tech, Décoration, Traduction, Dirigeants' },
  { id: 'min_retention', name: "Ministère de la Rétention", description: 'Resho Bloom, ADN, Social, Intégration, OJ', tuteurId: 'mem_1' },
  { id: 'min_expansion', name: "Ministère de l'Expansion", description: 'Team Media, Bloom Inter, Bloom Bus, Happy Club, Bloom Vie, La Wev' },
  { id: 'min_coordination', name: "Ministère de la Coordination", description: 'Ushers, GDC, Protocole, Dress Code' },
  { id: 'min_affermissement', name: "Ministère de l'Affermissement", description: 'Eden Zero, Académie, GEMS, Réunion des C&L, Bible Coffee, Baptême' },
];

export const INITIAL_DEPARTMENTS: Department[] = [
  // 1. Ministère de l'Intimité
  { id: 'dept_mres', name: 'MRES', type: 'service', ministryId: 'min_intimite', description: '' },
  { id: 'dept_louange', name: 'Bloom Praise', type: 'service', ministryId: 'min_intimite', description: '' },
  { id: 'dept_intercession', name: 'Intercession', type: 'service', ministryId: 'min_intimite', description: '' },
  { id: 'dept_sainte_cene', name: 'Sainte Cène', type: 'service', ministryId: 'min_intimite', description: '' },

  // 2. Ministère de l'Art
  { id: 'dept_dancers', name: 'Bloom Dancers', type: 'service', ministryId: 'min_art', description: '' },
  { id: 'dept_cinema', name: 'Bloom Cinema', type: 'service', ministryId: 'min_art', description: '' },
  { id: 'dept_trap_church', name: 'Trap Church', type: 'service', ministryId: 'min_art', description: '' },
  { id: 'dept_bloom_art', name: 'Bloom Art', type: 'service', ministryId: 'min_art', description: '' },

  // 3. Ministère de la Tech & Scène
  { id: 'dept_tech', name: 'Prod & Tech', type: 'service', ministryId: 'min_tech_scene', description: '' },
  { id: 'dept_decoration', name: 'Décoration', type: 'service', ministryId: 'min_tech_scene', description: '' },
  { id: 'dept_traduction', name: 'Traduction', type: 'service', ministryId: 'min_tech_scene', description: '' },
  { id: 'dept_dirigeants', name: 'Dirigeants', type: 'service', ministryId: 'min_tech_scene', description: '' },

  // 4. Ministère de la Rétention
  { id: 'dept_resho_bloom', name: 'Resho Bloom', type: 'service', ministryId: 'min_retention', description: '' },
  { id: 'dept_adn', name: 'ADN', type: 'spécial', specialFunction: 'adn', ministryId: 'min_retention', description: 'Accueil des nouveaux' },
  { id: 'dept_social', name: 'Social', type: 'service', ministryId: 'min_retention', description: '' },
  { id: 'dept_integration', name: 'Intégration', type: 'spécial', specialFunction: 'integration', ministryId: 'min_retention', description: 'Suivi des nouveaux' },
  { id: 'dept_oj', name: 'OJ', type: 'service', ministryId: 'min_retention', description: '' },

  // 5. Ministère de l'Expansion
  { id: 'dept_media', name: 'Team Media', type: 'service', ministryId: 'min_expansion', description: '' },
  { id: 'dept_inter', name: 'Bloom Inter', type: 'service', ministryId: 'min_expansion', description: '' },
  { id: 'dept_bloom_bus', name: 'Bloom Bus', type: 'spécial', specialFunction: 'bloom_bus', ministryId: 'min_expansion', description: 'Evangélisation territoriale' },
  { id: 'dept_happy_club', name: 'Happy Club', type: 'service', ministryId: 'min_expansion', description: '' },
  { id: 'dept_bloom_vie', name: 'Bloom Vie', type: 'service', ministryId: 'min_expansion', description: '' },
  { id: 'dept_la_wev', name: 'La Wev', type: 'service', ministryId: 'min_expansion', description: '' },

  // 6. Ministère de la Coordination
  { id: 'dept_ushers', name: 'Ushers', type: 'spécial', specialFunction: 'portiers', ministryId: 'min_coordination', description: 'Placement et comptage' },
  { id: 'dept_gdc', name: 'GDC', type: 'spécial', specialFunction: 'gestion_cultes', ministryId: 'min_coordination', description: 'Gestion des cultes' },
  { id: 'dept_protocole', name: 'Protocole', type: 'service', ministryId: 'min_coordination', description: '' },
  { id: 'dept_dress_code', name: 'Dress Code', type: 'service', ministryId: 'min_coordination', description: '' },

  // 7. Ministère de l'Affermissement
  { id: 'dept_eden_zero', name: 'Eden Zero', type: 'spécial', specialFunction: 'parcours_etapes', ministryId: 'min_affermissement', description: 'Parcours étapes' },
  { id: 'dept_academie', name: 'Académie', type: 'service', ministryId: 'min_affermissement', description: '' },
  { id: 'dept_gems', name: 'GEMS', type: 'service', ministryId: 'min_affermissement', description: '' },
  { id: 'dept_reunion_cl', name: 'Réunion des C&L', type: 'service', ministryId: 'min_affermissement', description: '' },
  { id: 'dept_bible_coffee', name: 'Bible Coffee', type: 'service', ministryId: 'min_affermissement', description: '' },
  { id: 'dept_bapteme', name: 'Baptême', type: 'spécial', specialFunction: 'parcours_etapes', ministryId: 'min_affermissement', description: 'Parcours étapes' },
];

export const INITIAL_ACTIVITIES: Activity[] = [
  { id: 'act_1', departmentId: 'dept_adn', title: 'Réunion de département', recurrence: 'Hebdomadaire', day: 'Samedi', time: '16:00' },
  { id: 'act_2', departmentId: 'dept_adn', title: 'Temps de prière', recurrence: 'Hebdomadaire', day: 'Mardi', time: '19:00' },
  { id: 'act_3', departmentId: 'dept_louange', title: 'Répétition', recurrence: 'Hebdomadaire', day: 'Jeudi', time: '18:30' },
  { id: 'act_4', departmentId: 'dept_louange', title: 'RSA', recurrence: 'Hebdomadaire', day: 'Vendredi', time: '20:00' },
];

export const INITIAL_BUS_LINES: BloomBusEntity[] = [
  { id: 'bus_yop_maroc', name: 'Yopougon Maroc - Ligne 1', commune: 'Yopougon', zone: 'Zone Ouest', centerLat: 5.3436, centerLng: -4.0722 },
  { id: 'bus_yop_niangon', name: 'Yopougon Niangon - Ligne 2', commune: 'Yopougon', zone: 'Zone Ouest', centerLat: 5.3321, centerLng: -4.0895 },
  { id: 'bus_coc_angre', name: 'Cocody Angré - Ligne 3', commune: 'Cocody', zone: 'Zone Est', centerLat: 5.3854, centerLng: -3.9781 },
  { id: 'bus_coc_rivera', name: 'Cocody Riviera - Ligne 4', commune: 'Cocody', zone: 'Zone Est', centerLat: 5.3621, centerLng: -3.9542 },
  { id: 'bus_abo_gendarmerie', name: 'Abobo Gendarmerie - Ligne 5', commune: 'Abobo', zone: 'Zone Nord', centerLat: 5.4182, centerLng: -4.0194 },
  { id: 'bus_kou_sogefiha', name: 'Koumassi Sogefiha - Ligne 6', commune: 'Koumassi', zone: 'Zone Sud', centerLat: 5.2912, centerLng: -3.9312 }
];

// Profils de test — un compte de connexion réel par rôle (remplace le panneau « Simuler
// profil » retiré). Connexion : le téléphone ci-dessous + mot de passe démo `bloom2026`.
// `testRole` force le rôle UI ; les attributs réels (departments/level/pastoralCursus/
// bloomBusId) donnent le contexte pour que le scope et les écrans dédiés fonctionnent.
const testProfile = (n: number, testRole: string, firstName: string, extra: Partial<Member> = {}): Member => ({
  id: `mem_test_${n}`,
  lastName: 'Test',
  firstName,
  phone: `+22507000000${String(n).padStart(2, '0')}`,
  email: `test.${firstName.toLowerCase()}@bloom.test`,
  gender: n % 2 === 0 ? 'F' : 'H',
  birthDate: '1995-01-01',
  maritalStatus: 'Célibataire',
  profession: 'Testeur',
  branch: 'church',
  level: 'Boss',
  pastoralCursus: 'Aucun',
  departments: {},
  entryDate: '2024-01-01',
  hasPassedToBossForm: true,
  gps: { lat: 5.3854, lng: -3.9781, commune: 'Cocody' },
  healthKPIs: { spirituel: 4, social: 4, financier: 4, physique: 4, presenceCulte: 4, presenceService: 4 },
  baptismStatus: 'Baptisé',
  testRole,
  ...extra,
});

export const TEST_PROFILES: Member[] = [
  testProfile(1, 'Super Admin', 'SuperAdmin'),
  testProfile(2, 'Admin', 'Admin'),
  testProfile(3, 'Pasteur Principal', 'PasteurPrincipal', { pastoralCursus: 'Pasteur Titulaire' }),
  testProfile(4, 'Pasteur', 'Pasteur', { pastoralCursus: 'Pasteur Assistant' }),
  testProfile(5, 'Ministre', 'Ministre'),
  testProfile(6, 'Responsable', 'Responsable', { departments: { dept_louange: 'Responsable' } }),
  testProfile(7, 'Adjoint', 'Adjoint', { departments: { dept_louange: 'Adjoint' } }),
  testProfile(8, 'Coach', 'Coach', { level: 'Coach' }),
  testProfile(9, 'Leader', 'Leader', { level: 'Leader' }),
  testProfile(10, 'Capitaine de Bus', 'Capitaine', { departments: { dept_bloom_bus: 'Capitaine de Bus' }, bloomBusId: 'bus_yop_maroc' }),
  testProfile(11, 'Responsable de Zone', 'Zone', { departments: { dept_bloom_bus: 'Responsable de Zone' }, bloomBusId: 'bus_coc_angre' }),
  testProfile(12, 'Responsable de Commune', 'Commune', { departments: { dept_bloom_bus: 'Responsable de Commune' }, bloomBusId: 'bus_coc_angre' }),
  // ADN/GDC en 'Adjoint' (pas 'Membre') : le RBAC serveur exige une fonction d'encadrement
  // pour écrire des reports — testRole est purement UI, resolveRoles lit departments.
  testProfile(13, 'ADN', 'ADN', { departments: { dept_adn: 'Adjoint' } }),
  testProfile(14, 'Portier', 'Portier', { departments: { dept_ushers: 'Membre' } }),
  testProfile(15, 'GDC', 'GDC', { departments: { dept_gdc: 'Adjoint' } }),
  testProfile(16, 'Intégration', 'Integration', { departments: { dept_integration: 'Membre' } }),
  testProfile(17, 'Membre', 'Membre'),
  testProfile(18, 'Nouveau', 'Nouveau', { level: 'Nouveau', hasPassedToBossForm: false }),
];

export const INITIAL_MEMBERS: Member[] = [
  {
    id: 'mem_1',
    lastName: 'Grah',
    firstName: 'Affeny',
    phone: '+2250707123456',
    email: 'Affeny.grah@gmail.com',
    gender: 'H',
    birthDate: '1995-04-12',
    maritalStatus: 'Célibataire',
    profession: 'Ingénieur DevOps',
    branch: 'church',
    level: 'Coach',
    pastoralCursus: 'Serviteur',
    departments: { 'dept_bloom_bus': 'Responsable de Zone', 'dept_integration': 'Responsable' },
    bloomBusId: 'bus_coc_angre',
    entryDate: '2023-01-15',
    hasPassedToBossForm: true,
    gps: { lat: 5.3854, lng: -3.9781, commune: 'Cocody' },
    healthKPIs: { spirituel: 5, social: 4, financier: 4, physique: 5, presenceCulte: 5, presenceService: 5 },
    baptismStatus: 'Baptisé',
    baptismDate: '2023-05-20'
  },
  {
    id: 'mem_2',
    lastName: 'Kouamé',
    firstName: 'Jean-Marc',
    phone: '+2250102030405',
    email: 'jm.kouame@bloom.org',
    gender: 'H',
    birthDate: '1988-08-25',
    maritalStatus: 'Marié(e)',
    profession: 'Consultant Financier',
    branch: 'church',
    level: 'Coach',
    pastoralCursus: 'Pasteur Assistant',
    departments: { 'dept_gdc': 'Responsable' },
    entryDate: '2022-06-10',
    hasPassedToBossForm: true,
    gps: { lat: 5.3621, lng: -3.9542, commune: 'Cocody' },
    healthKPIs: { spirituel: 5, social: 5, financier: 5, physique: 4, presenceCulte: 5, presenceService: 5 },
    baptismStatus: 'Baptisé',
    baptismDate: '2015-11-12'
  },
  {
    id: 'mem_3',
    lastName: 'Bamba',
    firstName: 'Kady',
    phone: '+2250505123478',
    email: 'kady.bamba@gmail.com',
    gender: 'F',
    birthDate: '1997-11-30',
    maritalStatus: 'Célibataire',
    profession: 'Architecte d\'Intérieur',
    branch: 'light',
    level: 'Leader',
    pastoralCursus: 'Aucun',
    departments: { 'dept_adn': 'Responsable', 'dept_louange': 'Membre' },
    bloomBusId: 'bus_yop_maroc',
    entryDate: '2024-02-18',
    hasPassedToBossForm: true,
    gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' },
    healthKPIs: { spirituel: 4, social: 4, financier: 3, physique: 4, presenceCulte: 5, presenceService: 4 },
    baptismStatus: 'Baptisé',
    baptismDate: '2024-04-14'
  },
  {
    id: 'mem_4',
    lastName: 'Eshun',
    firstName: 'Nathalie',
    phone: '+2250708991122',
    email: 'nathalie.eshun@bloom.org',
    gender: 'F',
    birthDate: '1992-02-05',
    maritalStatus: 'Marié(e)',
    profession: 'Responsable Marketing',
    branch: 'light',
    level: 'Coach',
    pastoralCursus: 'Pasteur Titulaire',
    departments: { 'dept_ushers': 'Responsable' },
    entryDate: '2021-09-01',
    hasPassedToBossForm: true,
    gps: { lat: 5.2912, lng: -3.9312, commune: 'Koumassi' },
    healthKPIs: { spirituel: 5, social: 5, financier: 4, physique: 5, presenceCulte: 5, presenceService: 5 },
    baptismStatus: 'Baptisé',
    baptismDate: '2018-03-24'
  },
  // Nouveaux for integration flow
  {
    id: 'new_1',
    lastName: 'Diomandé',
    firstName: 'Moustapha',
    phone: '+2250747883399',
    phoneParent: '+2250707111222',
    email: 'moustapha.dio@yahoo.fr',
    gender: 'H',
    birthDate: '2001-09-15',
    maritalStatus: 'Célibataire',
    profession: 'Étudiant en Droit',
    branch: 'church',
    level: 'Nouveau',
    pastoralCursus: 'Aucun',
    departments: { 'dept_louange': 'Membre' }, // Chosen dept for integration
    bloomBusId: 'bus_yop_niangon',
    entryDate: '2026-06-24', // registered 1 day ago (Safe)
    integrationState: 'En attente',
    receptionValidated: false, // §6.2 — demo: awaits Responsable's reception validation
    integrationDateRegistered: '2026-06-24',
    ojFlag: true,
    integrationNotes: 'A exprimé une grande envie de s\'impliquer dans la chorale. Très bon contact initial.',
    hasPassedToBossForm: false,
    gps: { lat: 5.3321, lng: -4.0895, commune: 'Yopougon' },
    healthKPIs: { spirituel: 3, social: 3, financier: 2, physique: 4, presenceCulte: 3, presenceService: 2 },
    baptismStatus: 'Non baptisé'
  },
  {
    id: 'new_2',
    lastName: 'Koné',
    firstName: 'Mariam',
    phone: '+2250155667788',
    phoneParent: '+2250102030405',
    email: 'mariam.kone@gmail.com',
    gender: 'F',
    birthDate: '1999-05-18',
    maritalStatus: 'Célibataire',
    profession: 'Comptable stagiaire',
    branch: 'church',
    level: 'Nouveau',
    pastoralCursus: 'Aucun',
    departments: { 'dept_tech': 'Membre' },
    bloomBusId: 'bus_abo_gendarmerie',
    entryDate: '2026-06-21', // Registered 4 days ago (Trigger 3 days alert!)
    integrationState: 'En attente',
    integrationDateRegistered: '2026-06-21',
    ojFlag: false,
    integrationNotes: 'Habite à Abobo, souhaite rejoindre le département Technique. En attente de validation par le responsable.',
    hasPassedToBossForm: false,
    gps: { lat: 5.4182, lng: -4.0194, commune: 'Abobo' },
    healthKPIs: { spirituel: 2, social: 3, financier: 3, physique: 4, presenceCulte: 2, presenceService: 1 },
    baptismStatus: 'Non baptisé'
  },
  {
    id: 'new_3',
    lastName: 'Aka',
    firstName: 'Koffi Paul',
    phone: '+2250566778899',
    phoneParent: '+2250505123456',
    email: 'paul.aka@gmail.com',
    gender: 'H',
    birthDate: '1994-12-05',
    maritalStatus: 'Célibataire',
    profession: 'Infographiste',
    branch: 'light',
    level: 'Nouveau',
    pastoralCursus: 'Aucun',
    departments: { 'dept_ushers': 'Membre' },
    bloomBusId: 'bus_coc_rivera',
    entryDate: '2026-06-15', // Registered 10 days ago (Trigger 7 days alert! Passage au rouge, escalates to Minister!)
    integrationState: 'En attente',
    integrationDateRegistered: '2026-06-15',
    ojFlag: true,
    integrationNotes: 'A besoin d\'un suivi d\'urgence. S\'est inscrit au baptême.',
    hasPassedToBossForm: false,
    gps: { lat: 5.3621, lng: -3.9542, commune: 'Cocody' },
    healthKPIs: { spirituel: 1, social: 2, financier: 2, physique: 3, presenceCulte: 1, presenceService: 1 },
    baptismStatus: 'Non baptisé'
  },
  {
    id: 'new_4',
    lastName: 'Yao',
    firstName: 'Marie-Laure',
    phone: '+2250788990011',
    email: 'marielaure@gmail.com',
    gender: 'F',
    birthDate: '2003-03-20',
    maritalStatus: 'Célibataire',
    profession: 'Étudiante',
    branch: 'light',
    level: 'Nouveau',
    pastoralCursus: 'Aucun',
    departments: { 'dept_louange': 'Membre' },
    entryDate: '2026-06-10',
    integrationState: 'Suivi',
    integrationDateRegistered: '2026-06-10',
    ojFlag: true,
    integrationNotes: 'Assidue aux réunions de suivi de la louange. S\'intègre très vite.',
    hasPassedToBossForm: false,
    gps: { lat: 5.3854, lng: -3.9781, commune: 'Cocody' },
    healthKPIs: { spirituel: 4, social: 4, financier: 3, physique: 4, presenceCulte: 4, presenceService: 3 },
    baptismStatus: 'Non baptisé'
  },
  // Active Boss and Leaders for list richness
  {
    id: 'mem_5',
    lastName: 'N\'Guessan',
    firstName: 'Désiré',
    phone: '+2250102121212',
    email: 'desire.nguessan@gmail.com',
    gender: 'H',
    birthDate: '1990-10-14',
    maritalStatus: 'Marié(e)',
    profession: 'Chauffeur VTC',
    branch: 'church',
    level: 'Boss',
    pastoralCursus: 'Aucun',
    departments: { 'dept_bloom_bus': 'Capitaine de Bus' },
    bloomBusId: 'bus_yop_maroc',
    entryDate: '2024-05-12',
    hasPassedToBossForm: true,
    gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' },
    healthKPIs: { spirituel: 4, social: 4, financier: 3, physique: 5, presenceCulte: 4, presenceService: 4 },
    baptismStatus: 'Baptisé',
    baptismDate: '2024-06-30'
  },
  {
    id: 'mem_6',
    lastName: 'Touré',
    firstName: 'Fatoumata',
    phone: '+2250709445566',
    email: 'fatou.toure@gmail.com',
    gender: 'F',
    birthDate: '1996-01-22',
    maritalStatus: 'Marié(e)',
    profession: 'Infirmière',
    branch: 'light',
    level: 'Boss',
    pastoralCursus: 'Aucun',
    departments: { 'dept_tech': 'Adjoint' },
    entryDate: '2023-11-05',
    hasPassedToBossForm: true,
    gps: { lat: 5.2912, lng: -3.9312, commune: 'Koumassi' },
    healthKPIs: { spirituel: 4, social: 5, financier: 4, physique: 3, presenceCulte: 5, presenceService: 5 },
    baptismStatus: 'Baptisé',
    baptismDate: '2024-01-10'
  },
  ...TEST_PROFILES,
];

// Événements canoniques (lot 4) : cultes du dimanche à nom dynamique (Bloom/Super Sunday,
// Talk Show, Light Sunday/Show), 80/20 du vendredi, Inside du 1er samedi — générés avec des
// ids déterministes par date, l'horizon avance à chaque chargement/boot (reconcileMissingById).
export const INITIAL_EVENTS: Event[] = buildCanonicalEvents();

export const INITIAL_REPORTS: Report[] = [
  {
    id: 'rep_1',
    authorId: 'mem_2',
    authorName: 'Jean-Marc Kouamé',
    authorRole: 'Responsable de Gestion des Cultes',
    targetBranch: 'church',
    date: '2026-06-21',
    reportType: 'rapport_culte',
    eventId: 'evt_1',
    departmentId: 'dept_gdc',
    confidential: false,
    content: {
      attendancePortiers: 1240, // 1240 total
      attendanceADN: 32, // 32 new arrivals
      offertory: 450000,
      notes: 'Un culte puissant sous l\'onction. Louange inspirée et parole percutante. Les portiers ont parfaitement géré le placement des fidèles malgré l\'affluence.'
    }
  },
  {
    id: 'rep_2',
    authorId: 'mem_3',
    authorName: 'Kady Bamba',
    authorRole: 'Responsable ADN',
    targetBranch: 'light',
    date: '2026-06-21',
    reportType: 'rapport_adn',
    eventId: 'evt_3',
    departmentId: 'dept_adn',
    confidential: false,
    content: {
      nouveauxHommes: 14,
      nouveauxFemmes: 18,
      ojHommes: 8,
      ojFemmes: 12,
      notes: 'Excellente moisson au cours du culte unique. Les nouveaux ont été chaleureusement reçus à la fin du service.'
    }
  },
  {
    id: 'rep_3',
    authorId: 'mem_1',
    authorName: 'Affeny Grah',
    authorRole: 'Responsable de Zone Bloom Bus',
    targetBranch: 'church',
    date: '2026-06-21',
    reportType: 'rapport_bloom_bus_life',
    departmentId: 'dept_bloom_bus',
    confidential: false,
    content: {
      busId: 'bus_coc_angre',
      mobilised: 45, // clé alignée sur BloomBusView.handleSaveLifeReport (P1.3 — 'mobilises' était un typo divergent)
      presencesCulte: 42,
      visitesRealisees: ['mem_1'],
      moissonNouveaux: 3,
      incidents: 'Aucun incident signalé. Trajet fluide.'
    }
  },
  {
    id: 'rep_4',
    authorId: 'mem_1',
    authorName: 'Affeny Grah',
    authorRole: 'Responsable Intégration',
    targetBranch: 'church',
    date: '2026-06-21',
    reportType: 'rapport_service',
    departmentId: 'dept_integration',
    confidential: false,
    content: {
      presencesService: ['mem_1', 'mem_2', 'mem_5'],
      qualiteService: 'Excellent',
      actionsACompleter: 'Relancer l\'appel hebdomadaire des nouveaux enregistrés le dimanche précédent.',
      notesIndividuelles: 'L\'équipe a fait preuve d\'un dévouement exceptionnel.'
    }
  },
  {
    id: 'rep_5',
    authorId: 'mem_4',
    authorName: 'Nathalie Eshun',
    authorRole: 'Pasteur Titulaire',
    targetBranch: 'light',
    date: '2026-06-22',
    reportType: 'rapport_pastoral',
    confidential: true,
    content: {
      evalId: 'mem_3', // Evaluating Kady Bamba
      spiritualLevel: 'Très bon',
      leadershipLevel: 'Bon',
      faithfulness: 'Excellente',
      notes: 'Kady progresse très bien dans son cursus spirituel et sa gestion de l\'ADN. Elle a un excellent potentiel pour assumer de futures responsabilités pastorales.'
    }
  }
];

export const INITIAL_AUDITS: AuditLog[] = [
  {
    id: 'aud_1',
    timestamp: '2026-06-25T10:00:00-07:00',
    actionType: 'MEMBER_REGISTERED_ADN',
    operatorName: 'Kady Bamba',
    operatorId: 'mem_3',
    details: 'Enregistrement initial du nouveau Moustapha Diomandé par l\'ADN.',
    branch: 'church'
  },
  {
    id: 'aud_2',
    timestamp: '2026-06-25T11:15:00-07:00',
    actionType: 'BRANCH_TRANSFER',
    operatorName: 'SuperAdmin',
    operatorId: 'system',
    details: 'Transfert de branche de Cocody Angré - Ligne 3 vers Bloom Light.',
    previousValue: 'Bloom Church',
    newValue: 'Bloom Light',
    branch: 'light'
  },
  {
    id: 'aud_3',
    timestamp: '2026-06-25T14:30:00-07:00',
    actionType: 'ROLE_PERMISSION_UPDATED',
    operatorName: 'Nathalie Eshun',
    operatorId: 'mem_4',
    details: 'Mise à jour des capacités de consultation financière pour le rôle Responsable.'
  }
];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'not_1',
    timestamp: '2026-06-25T12:00:00-07:00',
    title: 'Alerte d\'intégration 3 jours',
    message: 'Le nouveau Mariam Koné enregistré par l\'ADN il y a 4 jours est toujours au statut "En attente".',
    type: 'warning',
    read: false,
    branch: 'church'
  },
  {
    id: 'not_2',
    timestamp: '2026-06-25T08:00:00-07:00',
    title: 'URGENT: Alerte d\'intégration 7 jours au Rouge',
    message: 'Koffi Paul Aka (inscrit il y a 10 jours) n\'a pas été validé et est passé au rouge. Escaladé au Ministre de tutelle.',
    type: 'alert',
    read: false,
    branch: 'light'
  },
  {
    id: 'not_3',
    timestamp: '2026-06-24T18:00:00-07:00',
    title: 'Nouveau Rapport de Culte soumis',
    message: 'Jean-Marc Kouamé a validé le rapport complet pour le 1er Culte du Dimanche 21 Juin.',
    type: 'success',
    read: true,
    branch: 'church'
  }
];

// P1.2b — réglages globaux (branches/thèmes, déclencheurs+canaux, fuseau/langue, périodes).
export const INITIAL_SETTINGS: AppSettings = {
  branches: {
    church: { enabled: true, accent: 'cerulean' },
    light: { enabled: true, accent: 'orange' },
  },
  triggers: [
    { id: 'integ1', label: 'Intégration — Étape 1 (Réception)', delayDays: 3, channels: { app: true, email: true, sms: false, whatsapp: false } },
    { id: 'integ2', label: 'Intégration — Étape 2 (Au rouge)', delayDays: 7, channels: { app: true, email: true, sms: true, whatsapp: false } },
    { id: 'birthday', label: 'Anniversaire d\'un membre', delayDays: 0, channels: { app: true, email: false, sms: false, whatsapp: true } },
    { id: 'absence', label: 'Absence culte prolongée', delayDays: 14, channels: { app: true, email: false, sms: true, whatsapp: false } },
  ],
  timezone: 'Africa/Abidjan',
  language: 'fr',
  periods: { activeMemberMonths: 1, weekStart: 'Lundi', fiscalStart: 'Janvier' },
};

// P1.1 — accès aux onglets piloté par la matrice : une capability `view_<tab>` par onglet.
// Rôles = spec PROFILS-INTERFACES / ECRANS-PAR-ONGLET (corrige Capitaine/Membre/Leader/Nouveau
// oubliés par les anciennes listes en dur de la Sidebar). Sparse : seuls les rôles autorisés sont listés.
const allow = (...roles: string[]) => Object.fromEntries(roles.map((r) => [r, true]));
const STAFF = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre'];
const ALL_PROFILES = [
  ...STAFF, 'Responsable', 'Adjoint', 'Coach', 'Leader', 'Capitaine de Bus',
  'Responsable de Zone', 'Responsable de Commune', 'ADN', 'Portier', 'GDC',
  'Intégration', 'Membre', 'Nouveau',
];

export const VIEW_PERMISSIONS: PermissionMatrix = {
  'view_dashboard': allow(...ALL_PROFILES),
  'view_members': allow(...STAFF, 'Responsable', 'Adjoint', 'Coach', 'Leader', 'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune'),
  // Onglet visible pour les profils Responsable → Pasteur Principal (lecture de la liste +
  // départements par ministère) ; le détail d'un ministère (clic sur une carte) reste
  // restreint, cf. MinisteresView canViewDetails.
  'view_ministeres': allow(...STAFF, 'Responsable', 'Adjoint'),
  'view_departments': allow(...STAFF, 'Responsable', 'Adjoint', 'ADN', 'Portier', 'GDC', 'Intégration'),
  // D2 — aligné sur CAN_ACCESS_INTEGRATION (NouveauxView) : la Console Intégration est réservée
  // au département Intégration + la ligne pastorale. Coach/Leader/ADN/Portier/GDC ne doivent pas voir l'onglet.
  'view_integration': allow(...STAFF, 'Intégration'),
  'view_adn': allow(...STAFF, 'ADN'),
  'view_rapportculte': allow(...STAFF, 'GDC'),
  'view_denombrement': allow(...STAFF, 'Portier'),
  'view_bloombus': allow(...STAFF, 'Responsable', 'Adjoint', 'Coach', 'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune', 'Membre', 'Nouveau'),
  'view_events': allow(...STAFF, 'Responsable', 'Adjoint', 'ADN', 'Portier', 'GDC'),
  // P4.2 (résiduel) : un équipier de projet peut être de n'importe quel profil
  // (Project.team n'est pas restreint par rôle) — ouvert à tous plutôt qu'une
  // liste en dur qui oublierait toujours un profil.
  'view_projects': allow(...ALL_PROFILES),
  'view_cursus': allow(...STAFF, 'Responsable', 'Coach', 'Leader', 'ADN', 'Portier', 'GDC', 'Intégration', 'Membre'),
  'view_formations': allow(...STAFF, 'Responsable', 'Coach', 'Leader', 'Membre', 'ADN', 'Portier', 'GDC', 'Intégration', 'Nouveau'),
  'view_permissions': allow('Super Admin', 'Admin', 'Pasteur Principal'),
  'view_accounts': allow('Super Admin', 'Admin', 'Pasteur Principal'),
  'view_settings': allow('Super Admin', 'Admin', 'Pasteur Principal'),
  'view_formbuilder': allow('Super Admin', 'Admin', 'Pasteur Principal'),
  'view_audit': allow('Super Admin', 'Admin', 'Pasteur Principal'),
  // P4.20 — ReportsView/ProgrammesView existaient déjà (fonctionnels) mais n'étaient
  // routés nulle part. Rapports agrège des données confidentielles inter-départements
  // (rapport_suivi_coach, etc.) → même niveau que view_audit + Responsable.
  'view_reports': allow(...STAFF, 'Responsable'),
  'view_programs': allow(...STAFF, 'Responsable', 'ADN', 'Intégration'),
};

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  ...VIEW_PERMISSIONS,
  'consulter_rapports_de_vie': {
    'Super Admin': true,
    'Pasteur': true,
    'Admin': true,
    'Responsable': true,
    'Coach': true,
    'Membre': false
  },
  'consulter_situation_financiere': {
    'Super Admin': true,
    'Pasteur': true,
    'Admin': true,
    'Responsable': false,
    'Coach': false,
    'Membre': false
  },
  'consulter_historique_presence': {
    'Super Admin': true,
    'Pasteur': true,
    'Admin': true,
    'Responsable': true,
    'Coach': true,
    'Membre': true
  },
  'modifier_jalons_bapteme_integration': {
    'Super Admin': true,
    'Pasteur': true,
    'Admin': true,
    'Responsable': true,
    'Coach': true,
    'Membre': false
  },
  'inscrire_formations_certifications': {
    'Super Admin': true,
    'Pasteur': true,
    'Admin': true,
    'Responsable': true,
    'Coach': false,
    'Membre': false
  }
};
