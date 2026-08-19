// Schéma Zod de l'entité Member — premier schéma d'entité "frontière de confiance" (Phase 4,
// T4.1, ARCHITECTURE_TECHNIQUE.md §4 « Validation : Zod »). Modèle pour tous les schémas
// d'entité suivants (reports, events, ...). Calqué CHAMP PAR CHAMP sur l'interface Member
// (packages/domain/types.ts) — toute divergence entre les deux est un bug de ce fichier.
//
// .strict() partout : un payload avec un champ inconnu est REJETÉ (400), pas silencieusement
// ignoré — c'est le cœur de la frontière de confiance (contrairement aux schémas de rapport
// legacy de packages/shared/schemas/report.ts, qui tolèrent les champs extra pour rester
// compatibles avec la sync whole-array existante). Les endpoints Membres (T4.2) sont un
// chemin neuf, pas de legacy à tolérer ici.
import { z } from 'zod';

const branch = z.enum(['church', 'light', 'global']);
const communityLevel = z.enum(['nouveau', 'stagiaire', 'boss', 'leader', 'coach']);
const deptFunction = z.enum([
  'responsable', 'adjoint', 'tresorier', 'responsable_section', 'membre',
  'capitaine', 'responsable_zone', 'responsable_commune',
]);
const integrationState = z.enum(['en_attente', 'suivi', 'integre']);
const integrationFollowStatus = z.enum(['Non suivi', 'En attente', 'En cours', 'À recontacter', 'Intégré', 'Non intégré']);
const pastoralCursus = z.enum([
  'aucun', 'appele', 'serviteur', 'gagneur_ame', 'assistant_pasteur', 'pasteur_assistant', 'pasteur_titulaire',
]);

const notifChannels = z.object({
  app: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  whatsapp: z.boolean(),
  webpush: z.boolean().optional(),
}).strict();

const gps = z.object({
  lat: z.number(),
  lng: z.number(),
  commune: z.string(),
}).strict();

const healthKPIs = z.object({
  spirituel: z.number(),
  social: z.number(),
  financier: z.number(),
  physique: z.number(),
  presenceCulte: z.number(),
  presenceService: z.number(),
}).strict();

export const MemberSchema = z.object({
  id: z.string().min(1),
  lastName: z.string(),
  firstName: z.string(),
  phone: z.string(),
  phoneParent: z.string().optional(),
  emergencyContact: z.string().optional(),
  nationality: z.string().optional(),
  neighborhood: z.string().optional(),
  email: z.string(),
  gender: z.enum(['H', 'F']),
  birthDate: z.string(),
  maritalStatus: z.enum(['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)']),
  profession: z.string(),
  schoolLevel: z.string().optional(),
  avatarUrl: z.string().optional(),
  source: z.string().optional(),
  gps: gps.optional(),
  entryDate: z.string(),
  branch,
  level: communityLevel,
  pastoralCursus,
  // Record clés dynamiques (deptId -> fonction) : .catchall garde .strict() sur le reste de
  // l'objet racine tout en acceptant des clés libres ICI — pas de z.any(), la valeur reste
  // contrôlée par l'enum deptFunction.
  departments: z.record(z.string(), deptFunction),
  deptSections: z.record(z.string(), z.string()).optional(),
  testRole: z.string().optional(),
  bloomBusId: z.string().optional(),
  deptAttachmentStatus: z.enum(['pending', 'validated', 'rejected']).optional(),
  deptAttachmentOrigin: z.literal('bloom_bus').optional(),
  integrationState: integrationState.optional(),
  integrationFollowStatus: integrationFollowStatus.optional(),
  membershipWish: z.enum(['Membre', 'Visiteur']).optional(),
  receptionValidated: z.boolean().optional(),
  integrationAssignedTo: z.string().optional(),
  integrationDateRegistered: z.string().optional(),
  receivedEventId: z.string().optional(),
  lastContact: z.string().optional(),
  ojFlag: z.boolean().optional(),
  integrationNotes: z.string().optional(),
  hasPassedToBossForm: z.boolean().optional(),
  healthKPIs,
  baptismStatus: z.enum(['non_baptise', 'baptise']),
  baptismDate: z.string().optional(),
  baptismViaDepartment: z.boolean().optional(),
  isDrachme: z.boolean().optional(),
  bloomEntry: z.string().optional(),
  academy: z.string().optional(),
  currentStepId: z.string().optional(),
  mentorId: z.string().optional(),
  notifChannels: notifChannels.optional(),
}).strict();

export type MemberInput = z.infer<typeof MemberSchema>;

// Patch partiel : tous les champs optionnels sauf id (identifie la ressource, jamais absent).
export const MemberPatchSchema = MemberSchema.partial().extend({ id: z.string().min(1) });

export type MemberPatchInput = z.infer<typeof MemberPatchSchema>;
