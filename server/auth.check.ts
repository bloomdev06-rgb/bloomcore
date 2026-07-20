// Vérifications auth — exécuter : npx tsx server/auth.check.ts
// Sans DATABASE_URL → backend SQLite (:memory:) via le sélecteur datastore.
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { hashPassword, verifyPassword, signToken, verifyToken, createOneTimeToken, consumeOneTimeToken, upsertCredentials, resolveBindHost } = await import('./auth.ts');
const { db } = await import('./db.ts');

// --- hash / verify --- (restent synchrones : crypto pur)
const h = hashPassword('secret123');
assert.ok(verifyPassword('secret123', h), 'bon mot de passe accepté');
assert.ok(!verifyPassword('mauvais', h), 'mauvais mot de passe rejeté');
assert.notEqual(hashPassword('secret123'), h, 'sel aléatoire (2 hashes différents)');

// --- session token ---
const t = await signToken('mem_1');
assert.equal(await verifyToken(t), 'mem_1', 'token valide');
assert.equal(await verifyToken(t.slice(0, -2) + 'xx'), null, 'signature falsifiée rejetée');
assert.equal(await verifyToken('garbage'), null, 'token malformé rejeté');

// --- one-time tokens ---
const ot = await createOneTimeToken('mem_2', 'reset');
const consumed = await consumeOneTimeToken(ot);
assert.ok(consumed && consumed.memberId === 'mem_2' && consumed.purpose === 'reset', 'consommation ok');
assert.equal(await consumeOneTimeToken(ot), null, 'usage unique : 2e consommation rejetée');
assert.equal(await consumeOneTimeToken('inexistant'), null, 'token inconnu rejeté');

// expiration : forcer expires_at dans le passé (SQLite direct, même backend)
const ot2 = await createOneTimeToken('mem_3', 'activate');
db.prepare('UPDATE tokens SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, ot2);
assert.equal(await consumeOneTimeToken(ot2), null, 'token expiré rejeté');

// --- upsert credentials ---
await upsertCredentials('mem_4', 'premier');
await upsertCredentials('mem_4', 'second');
const row = db.prepare('SELECT password_hash FROM credentials WHERE member_id = ?').get('mem_4') as any;
assert.ok(verifyPassword('second', row.password_hash), 'upsert remplace le hash');
assert.ok(!verifyPassword('premier', row.password_hash), 'ancien mot de passe invalide');

// #11 — révocation des tokens au changement de mot de passe via pwd_version.
await upsertCredentials('mem_rev', 'p0');                 // INSERT → version 0
const tokV0 = await signToken('mem_rev');
assert.equal(await verifyToken(tokV0), 'mem_rev', 'token émis à la version courante = valide');
await upsertCredentials('mem_rev', 'p1');                 // UPDATE → version 1
assert.equal(await verifyToken(tokV0), null, 'token pré-changement révoqué (#11)');
assert.equal(await verifyToken(await signToken('mem_rev')), 'mem_rev', 'token réémis après changement = valide');

// resolveBindHost : secret fort → dual-stack '::' (jamais '0.0.0.0' IPv4-seul, sinon le
// healthcheck `wget localhost`→::1 est refusé) ; secret faible → loopback IPv4 ; override gagne.
assert.strictEqual(resolveBindHost(false), '::', 'secret fort → dual-stack');
assert.strictEqual(resolveBindHost(true), '127.0.0.1', 'secret faible → loopback');
assert.notStrictEqual(resolveBindHost(false), '0.0.0.0', 'jamais IPv4-seul en prod');
assert.strictEqual(resolveBindHost(false, '10.0.0.5'), '10.0.0.5', 'API_HOST override');
assert.strictEqual(resolveBindHost(true, '0.0.0.0'), '0.0.0.0', 'override gagne même en insecure');

console.log('auth.check OK');
