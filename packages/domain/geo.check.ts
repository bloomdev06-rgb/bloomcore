// Run: npx tsx packages/domain/geo.check.ts
import assert from 'node:assert';
import { haversineKm, nearestBusLines, MAX_AUTO_ASSIGN_KM, parseGoogleMapsLink, isValidCoordinate } from './geo.ts';

// Même point -> distance nulle.
assert.equal(haversineKm({ lat: 5.35, lng: -3.97 }, { lat: 5.35, lng: -3.97 }), 0);

// Cocody -> Yopougon (Abidjan) : ~15-20km à vol d'oiseau, jamais 0 ni >100.
const cocody = { lat: 5.3854, lng: -3.9781 };
const yopougon = { lat: 5.3268, lng: -4.0873 };
const d = haversineKm(cocody, yopougon);
assert.ok(d > 5 && d < 40, `distance Cocody-Yopougon hors plage plausible: ${d}`);

// nearestBusLines trie du plus proche au plus loin et attache distanceKm.
const busLines = [
  { id: 'far', centerLat: 5.3268, centerLng: -4.0873 },
  { id: 'near', centerLat: 5.386, centerLng: -3.978 },
  { id: 'mid', centerLat: 5.36, centerLng: -4.0 },
];
const sorted = nearestBusLines(cocody, busLines);
assert.deepEqual(sorted.map((b) => b.id), ['near', 'mid', 'far']);
assert.ok(sorted[0].distanceKm < sorted[1].distanceKm && sorted[1].distanceKm < sorted[2].distanceKm);

assert.ok(MAX_AUTO_ASSIGN_KM > 0);

// parseGoogleMapsLink : formats @lat,lng et ?q=lat,lng reconnus, reste -> null.
assert.deepEqual(
  parseGoogleMapsLink('https://www.google.com/maps/place/Cocody/@5.3854,-3.9781,15z'),
  { lat: 5.3854, lng: -3.9781 },
);
assert.deepEqual(
  parseGoogleMapsLink('https://maps.google.com/?q=5.3854,-3.9781'),
  { lat: 5.3854, lng: -3.9781 },
);
assert.equal(parseGoogleMapsLink('https://maps.app.goo.gl/xyz123'), null);
assert.equal(parseGoogleMapsLink('pas un lien'), null);

// isValidCoordinate : bornes géographiques, cas limites inclus.
assert.equal(isValidCoordinate(5.3854, -3.9781), true);
assert.equal(isValidCoordinate(90, 180), true);
assert.equal(isValidCoordinate(-90, -180), true);
assert.equal(isValidCoordinate(90.0001, 0), false);
assert.equal(isValidCoordinate(0, -180.0001), false);
assert.equal(isValidCoordinate(NaN, 0), false);
assert.equal(isValidCoordinate(0, NaN), false);

console.log('geo.check OK');
