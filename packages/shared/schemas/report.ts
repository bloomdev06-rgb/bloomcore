// Schémas Zod des payloads de rapport (ARCHITECTURE_TECHNIQUE.md §2.4, §4 « Validation : Zod »).
// Source de vérité partagée front/API. Calqués sur les payloads RÉELS produits aujourd'hui par
// le client (pas les noms idéalisés du doc §2.4) — sinon on rejetterait en prod tout ce que
// l'app écrit. La convergence des noms de champs suivra la migration (jalon M5), ici même.
//
// Tightening INCRÉMENTAL : un type sans schéma est accepté tel quel. On ajoute les schémas un
// par un. L'ENFORCEMENT (rejet 400) n'est PAS branché sur la sync whole-array (elle re-valide
// tous les rapports legacy à chaque save → un vieux rapport malformé bloquerait tout le lot) :
// il arrivera sur l'endpoint par-item POST /reports (jalon M2), qui ne valide que l'entrant.
import { z } from 'zod';
import { ReportType } from '../enums';

const count = z.number().int().min(0); // compteurs H/F : entiers ≥ 0

// rapport_adn — { nouveauxH, nouveauxF, ojH, ojF } (M5 §3, convergé depuis nouveauxHommes/…).
// Alimente Moisson/OJ : des compteurs invalides corrompent les KPI → à durcir.
export const rapportAdnSchema = z.object({
  nouveauxH: count,
  nouveauxF: count,
  ojH: count,
  ojF: count,
});

// Registre type → schéma. Partiel : on complète au fil des jalons.
export const reportPayloadSchemas: Partial<Record<ReportType, z.ZodType>> = {
  rapport_adn: rapportAdnSchema,
};

// Valide le payload d'UN rapport. Schéma absent → accepté (incrémental). Champs extra tolérés
// (Zod objet par défaut ignore les clés inconnues → success), seuls les champs connus sont
// contrôlés : on n'exige pas que le legacy soit parfait, on empêche l'entrant d'être invalide.
export function parseReportPayload(
  reportType: string,
  content: unknown,
): { ok: true } | { ok: false; error: string } {
  const schema = reportPayloadSchemas[reportType as ReportType];
  if (!schema) return { ok: true };
  const res = schema.safeParse(content ?? {});
  if (res.success) return { ok: true };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`).join('; ') };
}
