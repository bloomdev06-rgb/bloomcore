// Vérifie le moteur de capacités §5 : base ⊕ overrides ⊕ specialAuth (harnais node:assert).
import assert from 'node:assert';
import { resolveCapability } from './permissions';
import { Member, PermissionMatrix, CapabilityOverride, SpecialAuthorization } from '../types';

const CAP = 'consulter_situation_financiere';

// Matrice : le rôle 'Leader' n'a PAS la capacité de base ; 'Responsable' l'a.
const matrix: PermissionMatrix = { [CAP]: { Responsable: true } };

const member = (over: Partial<Member> = {}): Member =>
  ({ id: 'm1', branch: 'church', level: 'Leader', pastoralCursus: 'Serviteur', departments: {} as any, ...over } as Member);

const ov = (o: Partial<CapabilityOverride>): CapabilityOverride =>
  ({ id: 'o', subjectType: 'level', subjectValue: 'Leader', branchId: 'church', capability: CAP, enabled: true, ...o } as CapabilityOverride);

// 1. base seule : sans override/specialAuth, résultat identique à la matrice de rôle.
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Leader', []), false, 'base: Leader sans capacité');
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Responsable', []), true, 'base: Responsable a la capacité');

// 2. override par NIVEAU accorde à un Leader ce que la base refuse.
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Leader', [], [ov({})]), true, 'override level accorde');

// 3. override par FONCTION (le membre est Responsable d'un département).
const respMember = member({ departments: { dep1: 'Responsable' } as any });
assert.strictEqual(
  resolveCapability(matrix, CAP, respMember, 'Leader', [], [ov({ subjectType: 'function', subjectValue: 'Responsable' })]),
  true,
  'override function accorde via fonction de département',
);

// 4. override par CURSUS.
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Leader', [], [ov({ subjectType: 'cursus', subjectValue: 'Serviteur' })]),
  true,
  'override cursus accorde',
);

// 5. scope BRANCHE : un override sur 'light' ne s'applique pas à un membre 'church'.
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Leader', [], [ov({ branchId: 'light' })]), false, 'override autre branche ignoré');

// 6. override REVOKE : enabled=false retire la capacité même si la base l'accordait.
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Responsable', [], [ov({ enabled: false })]),
  false,
  'override révoque par-dessus la base',
);

// 7. deny-wins : override accorde + override révoque sur le même membre → révoqué.
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Leader', [], [ov({ id: 'a', enabled: true }), ov({ id: 'b', subjectType: 'cursus', subjectValue: 'Serviteur', enabled: false })]),
  false,
  'deny-wins entre overrides conflictuels',
);

// 8. specialAuth NOMINATIVE : ré-accorde même quand un override révoque.
const sa: SpecialAuthorization = { id: 's1', memberId: 'm1', capability: CAP, branchId: 'church', grantedById: 'past1', createdAt: '2026-01-01' };
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Responsable', [], [ov({ enabled: false })], [sa]),
  true,
  'specialAuth ré-accorde par-dessus une révocation',
);
// specialAuth d'un autre membre ne s'applique pas
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Leader', [], [], [{ ...sa, memberId: 'autre' }]),
  false,
  'specialAuth nominative ne fuite pas vers un autre membre',
);
// specialAuth branchId null = toutes branches
assert.strictEqual(
  resolveCapability(matrix, CAP, member(), 'Leader', [], [], [{ ...sa, branchId: null }]),
  true,
  'specialAuth global (branchId null) accorde',
);

// 9. items soft-deleted ignorés (override ET specialAuth).
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Leader', [], [ov({ deletedAt: '2026-01-02' })]), false, 'override supprimé ignoré');
assert.strictEqual(resolveCapability(matrix, CAP, member(), 'Leader', [], [], [{ ...sa, deletedAt: '2026-01-02' }]), false, 'specialAuth supprimée ignorée');

// 10. Super Admin garde tout (garde-fou base inchangé).
assert.strictEqual(resolveCapability(matrix, 'n_importe_quoi', member(), 'Super Admin', []), true, 'Super Admin conserve tout');

console.log('permissions.check OK');
