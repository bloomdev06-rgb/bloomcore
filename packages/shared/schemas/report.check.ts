// Vérifie les schémas Zod des payloads de rapport (harnais node:assert, comme src/data/*.check).
import assert from 'node:assert';
import { parseReportPayload, rapportAdnSchema } from './report';

// rapport_adn valide
assert.deepStrictEqual(
  parseReportPayload('rapport_adn', { nouveauxHommes: 3, nouveauxFemmes: 5, ojHommes: 1, ojFemmes: 2 }),
  { ok: true },
  'payload adn valide accepté',
);

// champs extra (legacy merge) tolérés
assert.strictEqual(
  parseReportPayload('rapport_adn', { nouveauxHommes: 0, nouveauxFemmes: 0, ojHommes: 0, ojFemmes: 0, _legacy: 'x' }).ok,
  true,
  'champs extra tolérés',
);

// invalides rejetés
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxHommes: -1, nouveauxFemmes: 0, ojHommes: 0, ojFemmes: 0 }).ok, false, 'compteur négatif rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxHommes: 1.5, nouveauxFemmes: 0, ojHommes: 0, ojFemmes: 0 }).ok, false, 'compteur non entier rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxHommes: 'x', nouveauxFemmes: 0, ojHommes: 0, ojFemmes: 0 }).ok, false, 'compteur non numérique rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxHommes: 1 }).ok, false, 'champ manquant rejeté');

// le message d'erreur nomme le champ fautif
const bad = parseReportPayload('rapport_adn', { nouveauxHommes: -1, nouveauxFemmes: 0, ojHommes: 0, ojFemmes: 0 });
assert.ok(!bad.ok && bad.error.includes('nouveauxHommes'), 'erreur nomme le champ');

// type sans schéma → accepté tel quel (tightening incrémental)
assert.deepStrictEqual(parseReportPayload('rapport_culte', { n_importe: true }), { ok: true }, 'type non schématisé accepté');
assert.deepStrictEqual(parseReportPayload('rapport_adn', undefined), parseReportPayload('rapport_adn', {}), 'content absent = objet vide (→ champs manquants)');

// le schéma est directement réutilisable (front : validation avant submit)
assert.strictEqual(rapportAdnSchema.safeParse({ nouveauxHommes: 2, nouveauxFemmes: 2, ojHommes: 0, ojFemmes: 0 }).success, true);

console.log('report.check OK');
