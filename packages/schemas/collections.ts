// Schémas Zod des collections restantes (Phase 4, T4.4→T4.n), même recette que
// packages/schemas/member.ts et report.ts : .strict(), calqué champ par champ sur
// l'interface TypeScript source. Regroupées dans UN fichier (plutôt qu'un fichier par
// entité comme member.ts/report.ts) car chacune est petite (2 à 12 champs) — le split
// initial visait la lisibilité d'un premier schéma modèle, pas une règle à suivre pour
// des entités simples ; ça reste 1 export nommé par entité, testé individuellement dans
// collections.check.ts.
import { z } from 'zod';

const branch = z.enum(['church', 'light', 'global']);

// -- events (packages/domain/types.ts: Event) --
export const EventSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.string(),
  date: z.string(),
  time: z.string().optional(),
  endTime: z.string().optional(),
  branch,
  closed: z.boolean(),
  cancelled: z.boolean().optional(),
  scope: z.enum(['church', 'light', 'both']).optional(),
  organizer: z.string().optional(),
  projectId: z.string().optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).optional(),
}).strict();
export const EventPatchSchema = EventSchema.partial().extend({ id: z.string().min(1) });

// -- notifications (packages/domain/types.ts: AppNotification) --
export const NotificationSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.enum(['info', 'warning', 'alert', 'success']),
  read: z.boolean(),
  branch: branch.optional(),
  targetMemberId: z.string().optional(),
}).strict();
export const NotificationPatchSchema = NotificationSchema.partial().extend({ id: z.string().min(1) });

// -- certifications (src/components/FormationsView.tsx: Certification — pas de type partagé
// dans packages/domain, formalisé ici pour la première fois côté serveur) --
export const CertificationSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  memberName: z.string().optional(),
  formation: z.string().optional(),
  date: z.string().optional(),
  courseTitle: z.string().optional(),
  certifiedAt: z.string().optional(),
  source: z.string().optional(),
  level: z.string().optional(),
}).strict();
export const CertificationPatchSchema = CertificationSchema.partial().extend({ id: z.string().min(1) });

// -- integration_reports (src/components/NouveauxView.tsx: IntegrationReport) --
export const IntegrationReportSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  authorName: z.string(),
  date: z.string(),
  status: z.enum(['Non suivi', 'En attente', 'En cours', 'À recontacter', 'Intégré', 'Non intégré']),
  contactEstablished: z.boolean(),
  visitDone: z.boolean(),
  notes: z.string(),
  motif: z.string(),
}).strict();
export const IntegrationReportPatchSchema = IntegrationReportSchema.partial().extend({ id: z.string().min(1) });

// -- ministries (packages/domain/types.ts: Ministry) --
export const MinistrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  tuteurId: z.string().optional(),
  branch: branch.optional(),
}).strict();
export const MinistryPatchSchema = MinistrySchema.partial().extend({ id: z.string().min(1) });

// -- departments (packages/domain/types.ts: Department) --
export const DepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['normal', 'special']),
  ministryId: z.string(),
  description: z.string(),
  specialFunction: z.enum(['adn', 'portiers', 'integration', 'bloom_bus', 'gestion_cultes', 'parcours_etapes']).optional(),
  branch: branch.optional(),
  sections: z.array(z.object({ id: z.string(), name: z.string() }).strict()).optional(),
}).strict();
export const DepartmentPatchSchema = DepartmentSchema.partial().extend({ id: z.string().min(1) });

// -- activities (packages/domain/types.ts: Activity) --
export const ActivitySchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  title: z.string(),
  recurrence: z.enum(['Hebdomadaire', 'Mensuel', 'Annuel', 'Ponctuel']),
  day: z.string().optional(),
  time: z.string().optional(),
}).strict();
export const ActivityPatchSchema = ActivitySchema.partial().extend({ id: z.string().min(1) });

// -- projects (packages/domain/types.ts: Project / ProjectTask) --
const projectTask = z.object({
  id: z.string().min(1),
  title: z.string(),
  assignee: z.string(),
  due: z.string().optional(),
  status: z.enum(['a_faire', 'en_cours', 'fait']),
}).strict();
export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  scope: z.enum(['branche', 'transverse', 'ministere']),
  branch: branch.optional(),
  ministryId: z.string().optional(),
  status: z.enum(['En cours', 'Planifié', 'Terminé']),
  pmo: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  team: z.array(z.object({ member: z.string(), role: z.string() }).strict()).optional(),
  objectives: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean() }).strict()).optional(),
  actions: z.array(projectTask).optional(),
}).strict();
export const ProjectPatchSchema = ProjectSchema.partial().extend({ id: z.string().min(1) });

// -- bus_lines (packages/domain/types.ts: BloomBusEntity) --
export const BusLineSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  commune: z.string(),
  zone: z.string(),
  centerLat: z.number(),
  centerLng: z.number(),
}).strict();
export const BusLinePatchSchema = BusLineSchema.partial().extend({ id: z.string().min(1) });

// -- forms (packages/domain/types.ts: FormDef / Field / Step) --
const field = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: z.enum(['text', 'number', 'choice', 'scale', 'checkbox', 'date']), // FieldType (packages/domain/types.ts)
  required: z.boolean(),
}).strict();
const step = z.object({
  id: z.string().min(1),
  label: z.string(),
  validator: z.string(),
}).strict();
export const FormSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  scope: z.string(),
  version: z.number(),
  kind: z.enum(['form', 'steps']),
  fields: z.array(field),
  steps: z.array(step).optional(),
}).strict();
export const FormPatchSchema = FormSchema.partial().extend({ id: z.string().min(1) });
