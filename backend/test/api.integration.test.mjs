import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let child;
let baseUrl;
let dataDir;
let startupOutput = '';

describe('FloodShield local API', { concurrency: false }, () => {
before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'floodshield-test-'));
  child = spawn(process.execPath, [fileURLToPath(new URL('../src/local-server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', FLOODSHIELD_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`FloodShield API did not start. Output: ${startupOutput}`)), 8000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      startupOutput += chunk;
      const match = startupOutput.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        baseUrl = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { startupOutput += chunk; });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      if (!baseUrl) {
        clearTimeout(timeout);
        reject(new Error(`FloodShield API exited before startup (${code}). Output: ${startupOutput}`));
      }
    });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      child.kill('SIGTERM');
    });
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: response.status === 204 ? null : await response.json() };
}

test('local API exposes health and creates validated reports', async () => {
  const health = await jsonRequest('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.storage, 'local-json');

  const created = await jsonRequest('/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: 'Mandi House Underpass', detail: 'Water is pooling across both lanes.', level: 'Moderate' })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.place, 'Mandi House Underpass');
  assert.equal(created.body.freshness, 'Fresh');

  const duplicate = await jsonRequest('/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: 'Mandi House Underpass', detail: 'Water is pooling across both lanes.', level: 'Moderate' })
  });
  assert.equal(duplicate.response.status, 409);

  const invalid = await jsonRequest('/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: 'X', detail: 'short', level: 'Extreme' })
  });
  assert.equal(invalid.response.status, 400);
});

test('authority actions must follow Assign → Start → Resolve', async () => {
  const postAction = (status) => jsonRequest('/authority/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hotspotId: 'iit-gate', status })
  });

  assert.equal((await postAction('Assigned')).response.status, 201);
  assert.equal((await postAction('Resolved')).response.status, 409);
  assert.equal((await postAction('In progress')).response.status, 201);
  assert.equal((await postAction('Resolved')).response.status, 201);
  assert.equal((await postAction('Resolved')).response.status, 409);
});

test('locations and route-aware risk change when a corridor report arrives', async () => {
  const locations = await jsonRequest('/locations');
  assert.equal(locations.response.status, 200);
  assert.ok(locations.body.some((place) => place.name.includes('DTU')));

  const west = await jsonRequest('/risk?origin=Dwarka%20Sector%2021&destination=Vasant%20Kunj');
  assert.equal(west.response.status, 200);
  assert.equal(west.body.matched, true);
  assert.equal(west.body.exposedHotspots.some((spot) => spot.id === 'mandi-house'), false);

  const before = await jsonRequest('/risk?origin=DTU%2C%20Rohini&destination=Mandi%20House');
  assert.equal(before.body.matched, true);
  assert.ok(before.body.exposedHotspots.some((spot) => spot.id === 'mandi-house'));

  const uniqueDetail = `Knee-deep water on the underpass floor ${Date.now()}.`;
  const created = await jsonRequest('/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: 'Mandi House Underpass', detail: uniqueDetail, level: 'Severe' })
  });
  assert.equal(created.response.status, 201);

  const queue = await jsonRequest('/authority/queue');
  const mandi = queue.body.find((spot) => spot.id === 'mandi-house');
  assert.ok(mandi.reports >= 1);

  const after = await jsonRequest('/risk?origin=DTU%2C%20Rohini&destination=Mandi%20House');
  assert.ok(after.body.roadReports >= before.body.roadReports);
  assert.ok(after.body.risk >= before.body.risk);
});
});
