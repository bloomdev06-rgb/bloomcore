// Régression HTTP de l'auto-inscription : le candidat choisit un Bloom Bus de SA branche,
// tout en restant uniquement en attente dans le département choisi.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.BLOOMCORE_DB = ':memory:';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.AUTH_SECRET = 'register-http-fixture-only';
process.env.ACADEMY_WEBHOOK_SECRET = 'register-webhook-fixture-only';
process.env.FUNCTIONAL_EMAILS_ENABLED = 'false';
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
  const { setCollection, getCollection } = await import('./datastore.ts');
  await setCollection('departments', [
    { id: 'dept_church', name: 'Accueil Church', branch: 'church', type: 'normal', ministryId: 'min_church' },
    { id: 'dept_light', name: 'Accueil Light', branch: 'light', type: 'normal', ministryId: 'min_light' },
  ]);
  await setCollection('bus_lines', [
    { id: 'bus_church', name: 'Cocody Angré', branch: 'church', commune: 'Cocody', zone: 'Angré', centerLat: 5.38, centerLng: -3.97 },
    { id: 'bus_light', name: 'Yopougon Maroc', branch: 'light', commune: 'Yopougon', zone: 'Maroc', centerLat: 5.34, centerLng: -4.07 },
  ]);

  const publicBuses = await fetch(`${base}/public/bloom-buses?branch=church`);
  assert.equal(publicBuses.status, 200);
  const buses = await publicBuses.json();
  assert.deepEqual(buses, [{ id: 'bus_church', name: 'Cocody Angré', commune: 'Cocody', zone: 'Angré' }], 'référentiel public sans GPS ni autre branche');
  const publicDepartments = await fetch(`${base}/public/departments?branch=church`);
  assert.deepEqual(await publicDepartments.json(), [{ id: 'dept_church', name: 'Accueil Church' }], 'départements limités à la branche');

  const form = {
    lastName: 'Inscrit', firstName: 'Bloom', phone: '+2250700000099', email: 'bloom.registration@example.org',
    gender: 'H', birthDate: '1995-01-01', maritalStatus: 'Célibataire', profession: 'Testeur',
    branch: 'church', departmentId: 'dept_church', commune: 'Cocody', zone: 'Angré', bloomBusId: 'bus_church',
  };
  const send = (body: unknown) => fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await send(form)).status, 201, 'inscription au bus de la même branche acceptée');
  const registered = (await getCollection('members')).find((member: any) => member.phone === form.phone) as any;
  assert.equal(registered.bloomBusId, 'bus_church');
  assert.equal(registered.deptAttachmentStatus, 'pending');
  assert.equal(registered.deptAttachmentOrigin, 'self_registration');
  assert.deepEqual(registered.departments, { dept_church: 'membre' });

  assert.equal((await send({ ...form, phone: '+2250700000098', email: 'other@example.org', bloomBusId: 'bus_light' })).status, 400, 'bus d’autre branche refusé');
  assert.equal((await send({ ...form, phone: '+2250700000097', email: 'other2@example.org', departmentId: 'dept_light' })).status, 400, 'département d’autre branche refusé');
  console.log('register.http.check OK');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
