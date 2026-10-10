import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { calculateQueue, calculateRisk, hotspots } from './risk-engine.mjs';
import { listLocations } from './locations.mjs';
import { getDelhiRainfall } from './weather.mjs';
import { isDuplicate, trustScore, validateReport, withReportMeta } from './report-quality.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.FLOODSHIELD_DATA_DIR ? resolve(process.env.FLOODSHIELD_DATA_DIR) : join(root, '..', 'data');
const dataPath = join(dataDir, 'reports.json');
const actionsPath = join(dataDir, 'actions.json');
const allowedStatuses = new Set(['Assigned', 'In progress', 'Resolved']);
const seedReports = [
  { id: 'seed-1', place: 'Mandi House Underpass', detail: 'Knee-deep water. Two-wheelers turning back.', level: 'Severe', trustScore: 0.82, createdAt: new Date(Date.now() - 8 * 60_000).toISOString() },
  { id: 'seed-2', place: 'IIT Gate Crossing', detail: 'Water collecting near the bus stop.', level: 'Moderate', trustScore: 0.7, createdAt: new Date(Date.now() - 14 * 60_000).toISOString() },
  { id: 'seed-3', place: 'Saket Metro Approach', detail: 'Drain cover blocked by leaves.', level: 'Moderate', trustScore: 0.7, createdAt: new Date(Date.now() - 22 * 60_000).toISOString() }
];

async function readJson(path, fallback) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read ${path}; restoring fallback data.`, error.message);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}
async function readReports() {
  const reports = await readJson(dataPath, seedReports);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const active = reports.filter((report) => Number.isFinite(Date.parse(report.createdAt || '')) && Date.parse(report.createdAt) >= cutoff);
  if (active.length !== reports.length) await writeJson(dataPath, active);
  return active;
}
async function readActions() {
  const actions = await readJson(actionsPath, []);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const active = actions.filter((action) => Number.isFinite(Date.parse(action.updatedAt || '')) && Date.parse(action.updatedAt) >= cutoff);
  if (active.length !== actions.length) await writeJson(actionsPath, active);
  return active;
}
function latestActionFor(hotspotId, actions) {
  return actions
    .filter((action) => action.hotspotId === hotspotId)
    .sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))[0];
}
const nextStatus = { Unassigned: 'Assigned', Assigned: 'In progress', 'In progress': 'Resolved' };
function reply(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(code === 204 ? '' : JSON.stringify(body));
}
async function readBody(req, limit = 16_384) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }); }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return reply(res, 204, null);
  const url = new URL(req.url, 'http://localhost:8787');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { status: 'ok', storage: 'local-json' });
    if (req.method === 'GET' && url.pathname === '/locations') return reply(res, 200, listLocations());
    if (req.method === 'GET' && url.pathname === '/weather') return reply(res, 200, await getDelhiRainfall());

    if (req.method === 'GET' && url.pathname === '/reports') {
      const reports = await readReports();
      return reply(res, 200, reports.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(withReportMeta));
    }
    if (req.method === 'GET' && url.pathname === '/authority/queue') {
      const [reports, actions, weather] = await Promise.all([readReports(), readActions(), getDelhiRainfall()]);
      return reply(res, 200, calculateQueue(reports, Math.max(weather.rainfallMmHr, weather.next3hPeakMmHr), actions));
    }
    if (req.method === 'GET' && url.pathname === '/risk') {
      const [reports, actions, weather] = await Promise.all([readReports(), readActions(), getDelhiRainfall()]);
      const rainfallSignal = Math.max(weather.rainfallMmHr, weather.next3hPeakMmHr);
      const result = calculateRisk({ origin: url.searchParams.get('origin') || '', destination: url.searchParams.get('destination') || '', reports, rainfallMmHr: rainfallSignal, forecast: weather, actions });
      return reply(res, 200, { ...result, weather });
    }
    if (req.method === 'POST' && url.pathname === '/reports') {
      const input = await readBody(req);
      const checked = validateReport(input);
      if (checked.error) return reply(res, 400, { message: checked.error });
      const reports = await readReports();
      if (isDuplicate(checked.value, reports)) return reply(res, 409, { message: 'A matching report was already received recently.' });
      const report = { id: randomUUID(), ...checked.value, trustScore: trustScore(checked.value, reports), createdAt: new Date().toISOString() };
      reports.unshift(report);
      await writeJson(dataPath, reports);
      return reply(res, 201, withReportMeta(report));
    }
    if (req.method === 'POST' && url.pathname === '/authority/actions') {
      const input = await readBody(req);
      if (!hotspots.some((spot) => spot.id === input.hotspotId) || !allowedStatuses.has(input.status)) {
        return reply(res, 400, { message: 'A valid hotspot and action status are required.' });
      }
      const actions = await readActions();
      const current = latestActionFor(input.hotspotId, actions)?.status || 'Unassigned';
      if (nextStatus[current] !== input.status) {
        return reply(res, 409, { message: `Invalid action transition. ${current} can only move to ${nextStatus[current] || 'no further status'}.` });
      }
      const action = { id: randomUUID(), hotspotId: input.hotspotId, status: input.status, updatedAt: new Date().toISOString() };
      actions.unshift(action);
      await writeJson(actionsPath, actions);
      return reply(res, 201, action);
    }
    return reply(res, 404, { message: 'Not found' });
  } catch (error) {
    console.error('FloodShield local API error:', error);
    return reply(res, error.statusCode || 500, { message: error.statusCode ? error.message : 'The API could not complete this request.' });
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => console.log(`FloodShield API ready at http://localhost:${server.address().port}`));
