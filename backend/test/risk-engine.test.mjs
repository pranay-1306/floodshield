import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQueue, calculateRisk } from '../src/risk-engine.mjs';
import { isDuplicate, validateReport } from '../src/report-quality.mjs';
import { distanceToRouteKm } from '../src/geo.mjs';
import { resolveLocation } from '../src/locations.mjs';

const now = new Date().toISOString();
const severeMandi = [{ place: 'Mandi House Underpass', level: 'Severe', createdAt: now, trustScore: 0.8 }];

test('severe fresh Mandi House report pushes the Rohini-Mandi corridor into high risk', () => {
  const result = calculateRisk({ origin: 'DTU, Rohini', destination: 'Mandi House', reports: severeMandi });
  assert.ok(result.risk >= 75);
  assert.equal(result.hotspot, 'Mandi House Underpass');
  assert.equal(result.matched, true);
  assert.equal(result.confidence, 'Medium');
  assert.ok(result.exposedHotspots.some((spot) => spot.id === 'mandi-house'));
});

test('queue ranks higher-signal waterlogging points first', () => {
  const queue = calculateQueue([{ place: 'Saket Metro Approach', level: 'Low', createdAt: now }]);
  assert.equal(queue[0].name, 'Mandi House Underpass');
  assert.ok(queue[0].risk > queue.at(-1).risk);
});

test('matching reports within twenty minutes are rejected as duplicates', () => {
  const report = { place: 'Mandi House Underpass', detail: 'Water is collecting near the underpass entrance.', level: 'Moderate' };
  assert.equal(isDuplicate(report, [{ ...report, createdAt: now }]), true);
  assert.equal(validateReport({ ...report, detail: 'short' }).error.includes('12'), true);
});

test('a resolved action lowers a hotspot priority score', () => {
  const before = calculateQueue([], 18).find((spot) => spot.id === 'mandi-house').risk;
  const after = calculateQueue([], 18, [{ hotspotId: 'mandi-house', status: 'Resolved', updatedAt: now }]).find((spot) => spot.id === 'mandi-house').risk;
  assert.ok(after < before);
});

test('Dwarka to Vasant Kunj does not treat Mandi House as on-route', () => {
  const result = calculateRisk({
    origin: 'Dwarka Sector 21',
    destination: 'Vasant Kunj',
    rainfallMmHr: 2,
    reports: severeMandi
  });
  assert.equal(result.matched, true);
  assert.equal(result.exposedHotspots.some((spot) => spot.id === 'mandi-house'), false);
  assert.ok(result.risk < 50, `clear west-Delhi corridor should stay below caution, got ${result.risk}`);
});

test('Hauz Khas to Saket exposes IIT Gate and Saket, not Mandi House', () => {
  const result = calculateRisk({
    origin: 'Hauz Khas',
    destination: 'Saket',
    rainfallMmHr: 4,
    reports: [{ place: 'IIT Gate Crossing', level: 'Moderate', createdAt: now, trustScore: 0.7 }]
  });
  const ids = result.exposedHotspots.map((spot) => spot.id);
  assert.ok(ids.includes('iit-gate'));
  assert.ok(ids.includes('saket-metro'));
  assert.equal(ids.includes('mandi-house'), false);
});

test('unmatched free text stays limited-confidence and forecast-only', () => {
  const result = calculateRisk({ origin: 'Somewhere unknown', destination: 'Also unknown', rainfallMmHr: 20, reports: severeMandi });
  assert.equal(result.matched, false);
  assert.equal(result.confidence, 'Limited');
  assert.equal(result.exposedHotspots.length, 0);
  assert.ok(result.risk <= 38);
});

test('resolving an exposed hotspot lowers the commuter corridor score', () => {
  const open = calculateRisk({ origin: 'DTU, Rohini', destination: 'Mandi House', rainfallMmHr: 18, reports: severeMandi, actions: [] });
  const resolved = calculateRisk({
    origin: 'DTU, Rohini',
    destination: 'Mandi House',
    rainfallMmHr: 18,
    reports: severeMandi,
    actions: [{ hotspotId: 'mandi-house', status: 'Resolved', updatedAt: now }]
  });
  assert.ok(resolved.risk < open.risk);
});

test('location resolver and corridor distance helpers support the route model', () => {
  const dtu = resolveLocation('DTU, Rohini');
  const mandi = resolveLocation('Mandi House');
  const iit = resolveLocation('IIT Delhi');
  assert.ok(dtu && mandi && iit);
  const mandiDistance = distanceToRouteKm({ lat: 28.6291, lng: 77.2254 }, [dtu, mandi]);
  const iitDistance = distanceToRouteKm({ lat: 28.5457, lng: 77.1926 }, [dtu, mandi]);
  assert.ok(mandiDistance < 3);
  assert.ok(iitDistance > 3);
});
