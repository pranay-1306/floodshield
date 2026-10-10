import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQueue, calculateRisk } from '../src/risk-engine.mjs';
import { isDuplicate, validateReport } from '../src/report-quality.mjs';

const now = new Date().toISOString();
test('severe fresh Mandi House report pushes the route into high risk', () => {
  const result = calculateRisk({ origin: 'DTU, Rohini', destination: 'Mandi House', reports: [{ place: 'Mandi House Underpass', level: 'Severe', createdAt: now }] });
  assert.ok(result.risk >= 75);
  assert.equal(result.hotspot, 'Mandi House Underpass');
  assert.equal(result.confidence, 'Medium');
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
