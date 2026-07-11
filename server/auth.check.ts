// Vérifications auth — exécuter : npx tsx server/auth.check.ts
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { hashPassword, verifyPassword, signToken, verifyToken, createOneTimeToken, consumeOneTimeToken, upsertCredentials } = await import('./auth.ts');
const { db } = await import('./db.ts');

// --- hash / verify ---
const h = hashPassword('secret123');
assert.ok(verifyPassword('secret123', h), 'bon mot de passe accepté');
assert.ok(!verifyPassword('mauvais', h), 'mauvais mot de passe rejeté');
assert.notEqual(hashPassword('secret123'), h, 'sel aléatoire (2 hashes différents)');

// --- session token ---
const t = signToken('mem_1');
assert.equal(verifyToken(t), 'mem_1', 'token valide');
assert.equal(verifyToken(t.slice(0, -2) + 'xx'), null, 'signature falsifiée rejetée');
assert.equal(verifyToken('garbage'), null, 'token malformé rejeté');

// --- one-time tokens ---
const ot = createOneTimeToken('mem_2', 'reset');
const consumed = consumeOneTimeToken(ot);
assert.ok(consumed && consumed.memberId === 'mem_2' && consumed.purpose === 'reset', 'consommation ok');
assert.equal(consumeOneTimeToken(ot), null, 'usage unique : 2e consommation rejetée');
assert.equal(consumeOneTimeToken('inexistant'), null, 'token inconnu rejeté');

// expiration : forcer expires_at dans le passé
const ot2 = createOneTimeToken('mem_3', 'activate');
db.prepare('UPDATE tokens SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, ot2);
assert.equal(consumeOneTimeToken(ot2), null, 'token expiré rejeté');

// --- upsert credentials ---
upsertCredentials('mem_4', 'premier');
upsertCredentials('mem_4', 'second');
const row = db.prepare('SELECT password_hash FROM credentials WHERE member_id = ?').get('mem_4') as any;
assert.ok(verifyPassword('second', row.password_hash), 'upsert remplace le hash');
assert.ok(!verifyPassword('premier', row.password_hash), 'ancien mot de passe invalide');

console.log('auth.check OK');
