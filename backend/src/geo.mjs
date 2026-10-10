const EARTH_KM = 6371;
export const CORRIDOR_KM = 3;

const toRad = (degrees) => (Number(degrees) * Math.PI) / 180;

export function haversineKm(a = {}, b = {}) {
  if (![a.lat, a.lng, b.lat, b.lng].every((value) => Number.isFinite(Number(value)))) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const startLat = toRad(a.lat);
  const endLat = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toLocalKm(point, origin) {
  const x = toRad(point.lng - origin.lng) * Math.cos(toRad((point.lat + origin.lat) / 2)) * EARTH_KM;
  const y = toRad(point.lat - origin.lat) * EARTH_KM;
  return { x, y };
}

export function pointToSegmentKm(point, start, end) {
  if (haversineKm(start, end) < 0.05) return haversineKm(point, start);
  const origin = start;
  const p = toLocalKm(point, origin);
  const a = toLocalKm(start, origin);
  const b = toLocalKm(end, origin);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return haversineKm(point, start);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const closest = { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t };
  return haversineKm(point, closest);
}

export function distanceToRouteKm(point, routePoints = []) {
  if (!Array.isArray(routePoints) || routePoints.length === 0) return Infinity;
  if (routePoints.length === 1) return haversineKm(point, routePoints[0]);
  let nearest = Infinity;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    nearest = Math.min(nearest, pointToSegmentKm(point, routePoints[index], routePoints[index + 1]));
  }
  return nearest;
}

export function exposureForDistance(distanceKm, corridorKm = CORRIDOR_KM) {
  if (!Number.isFinite(distanceKm) || distanceKm > corridorKm) return 0;
  return Number(Math.max(0, Math.min(1, 1 - distanceKm / corridorKm)).toFixed(3));
}
