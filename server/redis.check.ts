// Run: npx tsx server/redis.check.ts
// Sans REDIS_URL (cas du dev local et de la CI) : getRedis()/redisHealthy() doivent
// rester des no-op sûrs — c'est la garantie que Redis est réellement optionnel.
import assert from 'node:assert';

delete process.env.REDIS_URL;
const { getRedis, redisHealthy, REDIS_KEY_PREFIX } = await import('./redis.ts');

assert.equal(await getRedis(), null, 'sans REDIS_URL, getRedis() doit renvoyer null');
assert.equal(await redisHealthy(), null, 'sans REDIS_URL, redisHealthy() doit renvoyer null (non configuré ≠ en panne)');
assert.equal(REDIS_KEY_PREFIX, 'bc:', 'préfixe de clé attendu');

console.log('redis.check OK');
