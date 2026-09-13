// Isolated HTTP regression: no production database, Redis, scheduler or mail.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
process.env.NODE_ENV = 'test';
process.env.BLOOMCORE_DB = ':memory:';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.AUTH_SECRET = 'scoped-authorization-http-fixture-only';
process.env.ACADEMY_WEBHOOK_SECRET = 'scoped-authorization-webhook-fixture-only';
process.env.FUNCTIONAL_EMAILS_ENABLED = 'false';
process.env.BREVO_API_KEY = '';
process.env.RUN_SCHEDULER = 'false';
process.env.API_HOST = '127.0.0.1';
const allocator = createServer();
await new Promise<void>(resolve => allocator.listen(0, '127.0.0.1', resolve));
const address = allocator.address();
assert.ok(address && typeof address !== 'string');
process.env.API_PORT = String(address.port);
await new Promise<void>(resolve => allocator.close(() => resolve()));
const base = `http://127.0.0.1:${address.port}/api/v1`;
try {
  await import('./index.ts');
  const { setCollection, setKv, getCollection } = await import('./datastore.ts');
  const { signToken } = await import('./auth.ts');
  const member = (id: string, departments: Record<string, string>) => ({ id, firstName: 'Fixture', lastName: id,
    email: `${id}@example.invalid`, phone: '0000000000', gender: 'H', birthDate: '', maritalStatus: 'Célibataire',
    profession: '', entryDate: '2026-01-01', branch: 'church', level: 'coach', pastoralCursus: 'aucun', departments,
    baptismStatus: 'non_baptise', healthKPIs: { spirituel: 3, social: 3, physique: 3, financier: 3, presenceCulte: 3, presenceService: 3 } });
  const people = [member('admin', {}), member('op', { a: 'responsable', b: 'adjoint' }),
    { ...member('target', { a: 'membre', b: 'membre', c: 'membre' }), level: 'stagiaire' }];
  await setCollection('members', people);
  await setCollection('admins', [{ id: 'adm_admin', role: 'Super Admin' }]);
  await setCollection('ministries', []);
  await setCollection('departments', ['a', 'b', 'c'].map(id => ({ id, name: id, type: 'normal', ministryId: 'min' })));
  await setKv('permissions', { view_members: { Responsable: true }, view_reports: { Responsable: true } });
  const tokens = { admin: await signToken('admin'), op: await signToken('op') };
  const send = (path: string, actor: keyof typeof tokens | undefined, body: unknown, method = 'PATCH') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}) },
    body: JSON.stringify(body),
  });
  const nomination = { pastoralCursus: 'serviteur', previousCursus: 'aucun' };
  assert.equal((await send('/members/target/pastoral-cursus', undefined, nomination)).status, 401);
  assert.equal((await send('/members/target', 'op', { pastoralCursus: 'pasteur_titulaire' })).status, 403);
  assert.equal((await send('/members/target', 'admin', { pastoralCursus: 'serviteur' })).status, 403);
  assert.equal((await send('/members/target/pastoral-cursus', 'op', nomination)).status, 403);
  assert.equal((await send('/members/missing/pastoral-cursus', 'op', nomination)).status, 403);
  assert.equal((await send('/members/target/pastoral-cursus', 'op', { ...nomination, previousCursus: 'serviteur' })).status, 403);
  assert.equal((await send('/members/target/pastoral-cursus', 'admin', { ...nomination, level: 'coach' })).status, 400);
  assert.equal((await send('/members/target/pastoral-cursus', 'admin', nomination)).status, 200);
  assert.equal((await send('/members/target/pastoral-cursus', 'admin', { ...nomination, pastoralCursus: 'gagneur_ame' })).status, 409);
  assert.equal((await send('/members/op', 'op', { deptBranches: { a: 'light' } })).status, 403);
  assert.equal((await send('/members/target', 'op', { departments: { a: 'membre', b: 'adjoint', c: 'membre' } })).status, 403);
  const target = (await getCollection('members')).find(m => m.id === 'target');
  assert.equal(target.pastoralCursus, 'serviteur');
  assert.equal((await send('/members', 'admin', { upserts: [{ ...target, pastoralCursus: 'pasteur_titulaire' }], deletes: [] }, 'PUT')).status, 403);
  assert.equal((await getCollection('members')).find(m => m.id === 'target').pastoralCursus, 'serviteur');
  assert.equal((await getCollection('audits')).filter(a => a.actionType === 'MEMBER_PROMOTED' && a.operatorId === 'admin').length, 1);
  const bus = { id: 'http_bus', name: 'Bus fixture', commune: 'Cocody', zone: 'Centre', centerLat: 5.35, centerLng: -4 };
  await setCollection('bus_lines', []);
  assert.equal((await send('/bus_lines', 'admin', bus, 'POST')).status, 400, 'branche obligatoire même admin');
  assert.equal((await send('/bus_lines', 'admin', { ...bus, branch: 'light' }, 'POST')).status, 201);
  assert.equal((await send('/members/target', 'admin', { bloomBusId: bus.id })).status, 409, 'membre Church dans bus Light refusé');
  assert.equal((await send('/bus_lines', 'admin', { ...bus, id: 'http_church', branch: 'church' }, 'POST')).status, 201);
  assert.equal((await send('/members/target', 'admin', { bloomBusId: 'http_church' })).status, 200);
  assert.equal((await send('/bus_lines/http_church', 'admin', { branch: 'light' })).status, 409, 'déplacement du bus habité refusé');
  assert.equal((await send('/bus_lines', 'admin', { upserts: [{ ...bus, id: 'sync_branchless' }], deletes: [] }, 'PUT')).status, 400, 'pas de contournement par synchronisation');
  assert.equal((await getCollection('members')).find(m => m.id === 'target').bloomBusId, 'http_church');
  console.log('scopedAuthorization.http.check OK (pastoral cursus and Bloom Bus branch allow/deny, in-memory only)');
  process.exit(0);
} catch (error) { console.error(error); process.exit(1); }
