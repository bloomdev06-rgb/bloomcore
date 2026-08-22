// Distance réelle entre deux points GPS — remplace l'égalité de commune (audit Phase 0,
// App.tsx:286) qui prenait le premier bus de la commune sans égard à la zone/distance réelle.

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Aucun bus au-delà de ce rayon n'est proposé comme affectation automatique — au-delà, mieux
// vaut laisser le bus vide (visible comme « à traiter ») qu'assigner un bus à 40km.
// ponytail: seuil arbitraire, à ajuster si le terrain montre une meilleure valeur.
export const MAX_AUTO_ASSIGN_KM = 15;

// Bus triés du plus proche au plus loin — le premier est l'affectation auto candidate, le
// reste les alternatives proposées à l'opérateur pour correction manuelle.
export function nearestBusLines<T extends { centerLat: number; centerLng: number }>(
  point: { lat: number; lng: number },
  busLines: T[],
): (T & { distanceKm: number })[] {
  return busLines
    .map((b) => ({ ...b, distanceKm: haversineKm(point, { lat: b.centerLat, lng: b.centerLng }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Parseur de lien Google Maps — couvre les formats de partage courants (`@lat,lng` dans l'URL,
// ou `?q=lat,lng`) sans dépendance externe ni appel réseau. Les liens raccourcis
// (maps.app.goo.gl/...) ne peuvent pas être résolus côté client sans suivre la redirection
// (bloqué par CORS) : renvoie null, à l'appelant d'inviter à coller le lien complet ou à
// placer le point manuellement.
export function parseGoogleMapsLink(url: string): { lat: number; lng: number } | null {
  const atMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  const qMatch = url.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  return null;
}

// Bornes géographiques valides — appliquée aux 3 méthodes de saisie d'un Bloom Bus (manuel,
// lien Google Maps, glisser sur la carte) pour qu'une seule règle couvre les trois plutôt qu'une
// validation dupliquée par méthode.
export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
