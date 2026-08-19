// Schéma Zod de l'entité Report (Phase 4, T4.4 — même recette que packages/schemas/member.ts).
// Calqué champ par champ sur l'interface Report (packages/domain/types.ts). `content` est un
// JSON dynamique dont la forme dépend de `reportType` : on NE PEUT PAS le figer ici sans
// dupliquer packages/shared/schemas/report.ts (qui valide déjà le payload par type, de façon
// incrémentale). On délègue donc `content` à parseReportPayload() côté endpoint (T4.4 index.ts),
// et on le type ici en z.unknown() plutôt que z.any() — signale explicitement "non validé à ce
// niveau", pas "n'importe quoi accepté sans réflexion".
import { z } from 'zod';
import { REPORT_TYPES } from '../shared/enums';

export const ReportSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string(),
  authorRole: z.string(),
  targetBranch: z.enum(['church', 'light', 'global']),
  date: z.string(),
  weekOf: z.string().optional(),
  reportType: z.enum(REPORT_TYPES),
  eventId: z.string().optional(),
  departmentId: z.string().optional(),
  confidential: z.boolean(),
  partagerAvecResponsableDept: z.boolean().optional(),
  validated: z.boolean().optional(),
  filledAt: z.string().optional(),
  validatedAt: z.string().optional(),
  content: z.unknown(),
}).strict();

export type ReportInput = z.infer<typeof ReportSchema>;

export const ReportPatchSchema = ReportSchema.partial().extend({ id: z.string().min(1) });

export type ReportPatchInput = z.infer<typeof ReportPatchSchema>;
