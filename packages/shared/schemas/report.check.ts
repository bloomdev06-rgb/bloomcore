// Vérifie les schémas Zod des payloads de rapport (harnais node:assert, comme src/data/*.check).
import assert from 'node:assert';
import { parseReportPayload, rapportAdnSchema } from './report';

// rapport_adn valide
assert.deepStrictEqual(
  parseReportPayload('rapport_adn', { nouveauxH: 3, nouveauxF: 5, ojH: 1, ojF: 2 }),
  { ok: true },
  'payload adn valide accepté',
);

// champs extra (legacy merge) tolérés
assert.strictEqual(
  parseReportPayload('rapport_adn', { nouveauxH: 0, nouveauxF: 0, ojH: 0, ojF: 0, _legacy: 'x' }).ok,
  true,
  'champs extra tolérés',
);

// invalides rejetés
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxH: -1, nouveauxF: 0, ojH: 0, ojF: 0 }).ok, false, 'compteur négatif rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxH: 1.5, nouveauxF: 0, ojH: 0, ojF: 0 }).ok, false, 'compteur non entier rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxH: 'x', nouveauxF: 0, ojH: 0, ojF: 0 }).ok, false, 'compteur non numérique rejeté');
assert.strictEqual(parseReportPayload('rapport_adn', { nouveauxH: 1 }).ok, false, 'champ manquant rejeté');

// le message d'erreur nomme le champ fautif
const bad = parseReportPayload('rapport_adn', { nouveauxH: -1, nouveauxF: 0, ojH: 0, ojF: 0 });
assert.ok(!bad.ok && bad.error.includes('nouveauxH'), 'erreur nomme le champ');

// type sans schéma → accepté tel quel (tightening incrémental)
assert.deepStrictEqual(parseReportPayload('rapport_culte', { n_importe: true }), { ok: true }, 'type non schématisé accepté');
assert.deepStrictEqual(parseReportPayload('rapport_adn', undefined), parseReportPayload('rapport_adn', {}), 'content absent = objet vide (→ champs manquants)');

// le schéma est directement réutilisable (front : validation avant submit)
assert.strictEqual(rapportAdnSchema.safeParse({ nouveauxH: 2, nouveauxF: 2, ojH: 0, ojF: 0 }).success, true);

console.log('report.check OK');
