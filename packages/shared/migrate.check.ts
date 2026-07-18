import assert from 'node:assert';
import {
  LEVEL_MAP, INTEGRATION_STATE_MAP, CURSUS_MAP, BAPTISM_MAP, DEPT_FN_MAP, DEPT_TYPE_MAP,
  TASK_STATUS_MAP, PROJECT_SCOPE_MAP, ADN_FIELD_MAP, LABELS, labelFor, canonicalize,
  roleForDeptFn, roleForLevel,
} from './migrate.ts';

// Chaque valeur NOUVELLE a un libellé (sinon un badge afficherait le snake_case brut).
for (const m of [LEVEL_MAP, INTEGRATION_STATE_MAP, CURSUS_MAP, BAPTISM_MAP, DEPT_FN_MAP, DEPT_TYPE_MAP, TASK_STATUS_MAP, PROJECT_SCOPE_MAP]) {
  for (const nv of Object.values(m)) assert.ok(nv in LABELS, `libellé manquant pour "${nv}"`);
}

// Bijection : pas deux anciennes valeurs vers la même nouvelle DANS un même enum
// (PROJECT_SCOPE exclu : church+light→branche est un collapse assumé, l'identité passe en .branch).
for (const m of [LEVEL_MAP, INTEGRATION_STATE_MAP, CURSUS_MAP, BAPTISM_MAP, DEPT_FN_MAP, DEPT_TYPE_MAP, TASK_STATUS_MAP, ADN_FIELD_MAP]) {
  const news = Object.values(m);
  assert.strictEqual(new Set(news).size, news.length, 'collision de valeurs cibles');
}

// canonicalize member : valeurs + fonctions de département.
const mem = canonicalize('members', {
  id: 'm1', level: 'Boss', integrationState: 'En attente', pastoralCursus: "Gagneur d'âme",
  baptismStatus: 'Non baptisé', departments: { d1: 'Responsable', d2: 'Capitaine de Bus' },
});
assert.strictEqual(mem.level, 'boss');
assert.strictEqual(mem.integrationState, 'en_attente');
assert.strictEqual(mem.pastoralCursus, 'gagneur_ame');
assert.strictEqual(mem.baptismStatus, 'non_baptise');
assert.strictEqual(mem.departments.d1, 'responsable');
assert.strictEqual(mem.departments.d2, 'capitaine');

// Idempotence : re-canonicaliser un membre déjà migré ne change rien.
assert.deepStrictEqual(canonicalize('members', mem), mem);

// project : scope + branche préservée + statut d'action.
const p = canonicalize('projects', { id: 'p1', scope: 'church', actions: [{ id: 'a', status: 'todo' }] });
assert.strictEqual(p.scope, 'branche');
assert.strictEqual(p.branch, 'church');
assert.strictEqual(p.actions[0].status, 'a_faire');
assert.strictEqual(canonicalize('projects', { id: 'p2', scope: 'both' }).scope, 'transverse');
assert.strictEqual(canonicalize('projects', { id: 'p3', scope: 'ministry' }).scope, 'ministere');
assert.strictEqual(canonicalize('projects', p).scope, 'branche'); // idempotent

// rapport_adn : rename de champs, autres types intacts.
const r = canonicalize('reports', { id: 'r1', reportType: 'rapport_adn', content: { nouveauxHommes: 3, ojFemmes: 2 } });
assert.strictEqual(r.content.nouveauxH, 3);
assert.strictEqual(r.content.ojF, 2);
assert.ok(!('nouveauxHommes' in r.content));
assert.deepStrictEqual(canonicalize('reports', { id: 'r2', reportType: 'rapport_culte', content: { x: 1 } }).content, { x: 1 });

// capability_overrides : subjectValue mappé selon subjectType.
assert.strictEqual(canonicalize('capability_overrides', { subjectType: 'level', subjectValue: 'Coach' }).subjectValue, 'coach');
assert.strictEqual(canonicalize('capability_overrides', { subjectType: 'function', subjectValue: 'Trésorier' }).subjectValue, 'tresorier');

// valeur → rôle stable.
assert.strictEqual(roleForDeptFn('responsable'), 'Responsable');
assert.strictEqual(roleForDeptFn('capitaine'), 'Capitaine de Bus');
assert.strictEqual(roleForLevel('coach'), 'Coach');
assert.strictEqual(roleForLevel('nouveau'), 'Nouveau');

// libellés.
assert.strictEqual(labelFor('integre'), 'Intégré');
assert.strictEqual(labelFor('gagneur_ame'), "Gagneur d'âme");
assert.strictEqual(labelFor('inconnu_xyz'), 'inconnu_xyz'); // fallback

console.log('migrate.check OK');
