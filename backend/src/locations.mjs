const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const hotspots = [
  { id: 'mandi-house', name: 'Mandi House Underpass', ward: 'New Delhi', baseRisk: 68, action: 'Deploy pump crew', lat: 28.6291, lng: 77.2254 },
  { id: 'iit-gate', name: 'IIT Gate Crossing', ward: 'Hauz Khas', baseRisk: 54, action: 'Inspect drain', lat: 28.5457, lng: 77.1926 },
  { id: 'saket-metro', name: 'Saket Metro Approach', ward: 'Saket', baseRisk: 43, action: 'Clear debris', lat: 28.5245, lng: 77.2066 },
  { id: 'lajpat-ring', name: 'Lajpat Nagar Ring Road', ward: 'South East', baseRisk: 28, action: 'Monitor', lat: 28.5675, lng: 77.2430 }
];

export const places = [
  { id: 'dtu-rohini', name: 'DTU, Rohini', area: 'North West Delhi', lat: 28.7501, lng: 77.1176, aliases: ['dtu', 'delhi technological university', 'rohini'] },
  { id: 'rohini-west', name: 'Rohini West Metro', area: 'North West Delhi', lat: 28.7152, lng: 77.1156, aliases: ['rohini west'] },
  { id: 'pitampura', name: 'Pitampura', area: 'North West Delhi', lat: 28.7033, lng: 77.1313, aliases: [] },
  { id: 'kashmere-gate', name: 'Kashmere Gate ISBT', area: 'North Delhi', lat: 28.6676, lng: 77.2281, aliases: ['isbt', 'kashmere gate'] },
  { id: 'civil-lines', name: 'Civil Lines', area: 'North Delhi', lat: 28.6769, lng: 77.2249, aliases: [] },
  { id: 'karol-bagh', name: 'Karol Bagh', area: 'Central Delhi', lat: 28.6518, lng: 77.1905, aliases: [] },
  { id: 'connaught-place', name: 'Connaught Place', area: 'New Delhi', lat: 28.6315, lng: 77.2167, aliases: ['cp', 'rajiv chowk'] },
  { id: 'barakhamba', name: 'Barakhamba Road', area: 'New Delhi', lat: 28.6304, lng: 77.2245, aliases: [] },
  { id: 'mandi-house-place', name: 'Mandi House', area: 'New Delhi', lat: 28.6255, lng: 77.2340, aliases: ['mandi house'] },
  { id: 'ito', name: 'ITO', area: 'Central Delhi', lat: 28.6289, lng: 77.2410, aliases: [] },
  { id: 'india-gate', name: 'India Gate', area: 'New Delhi', lat: 28.6129, lng: 77.2295, aliases: [] },
  { id: 'aiims', name: 'AIIMS', area: 'South Delhi', lat: 28.5672, lng: 77.2100, aliases: [] },
  { id: 'green-park', name: 'Green Park', area: 'South Delhi', lat: 28.5598, lng: 77.2066, aliases: [] },
  { id: 'hauz-khas', name: 'Hauz Khas', area: 'South Delhi', lat: 28.5494, lng: 77.2001, aliases: ['hauz khas'] },
  { id: 'iit-delhi', name: 'IIT Delhi', area: 'Hauz Khas', lat: 28.5456, lng: 77.1926, aliases: ['iit', 'iit gate'] },
  { id: 'nehru-place', name: 'Nehru Place', area: 'South East Delhi', lat: 28.5494, lng: 77.2501, aliases: [] },
  { id: 'lajpat-nagar', name: 'Lajpat Nagar', area: 'South East Delhi', lat: 28.5677, lng: 77.2433, aliases: ['lajpat'] },
  { id: 'south-ex', name: 'South Extension', area: 'South Delhi', lat: 28.5687, lng: 77.2196, aliases: ['south ex'] },
  { id: 'saket', name: 'Saket', area: 'South Delhi', lat: 28.5245, lng: 77.2066, aliases: ['saket metro'] },
  { id: 'malviya-nagar', name: 'Malviya Nagar', area: 'South Delhi', lat: 28.5335, lng: 77.2074, aliases: [] },
  { id: 'vasant-kunj', name: 'Vasant Kunj', area: 'South West Delhi', lat: 28.5245, lng: 77.1554, aliases: [] },
  { id: 'dwarka-21', name: 'Dwarka Sector 21', area: 'South West Delhi', lat: 28.5523, lng: 77.0581, aliases: ['dwarka'] },
  { id: 'igia', name: 'IGI Airport T3', area: 'South West Delhi', lat: 28.5562, lng: 77.1000, aliases: ['airport', 'igi'] }
];

const searchable = [
  ...places.map((place) => ({ ...place, kind: 'place' })),
  ...hotspots.map((spot) => ({
    id: spot.id,
    name: spot.name,
    area: spot.ward,
    lat: spot.lat,
    lng: spot.lng,
    aliases: [spot.name, spot.id.replace('-', ' ')],
    kind: 'hotspot'
  }))
];

function matchScore(query, candidate) {
  const haystack = [candidate.name, candidate.area, ...(candidate.aliases || [])].map(normalize).filter(Boolean);
  if (!query) return 0;
  if (haystack.includes(query)) return 100;
  if (haystack.some((text) => text.startsWith(query) || query.startsWith(text))) return 80;
  if (haystack.some((text) => text.includes(query) || query.includes(text))) return 60;
  const tokens = query.split(' ').filter(Boolean);
  const overlap = tokens.filter((token) => haystack.some((text) => text.includes(token))).length;
  return overlap === 0 ? 0 : 20 + overlap * 10;
}

export function resolveLocation(query) {
  const normalized = normalize(query);
  if (!normalized) return null;
  const ranked = searchable
    .map((candidate) => ({ candidate, score: matchScore(normalized, candidate) }))
    .filter((entry) => entry.score >= 60)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.candidate;
  if (!best) return null;
  return { id: best.id, name: best.name, area: best.area, lat: best.lat, lng: best.lng, matched: true };
}

export function listLocations() {
  const seen = new Set();
  return searchable.filter((item) => {
    const key = normalize(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => ({ id: item.id, name: item.name, area: item.area, lat: item.lat, lng: item.lng }));
}
