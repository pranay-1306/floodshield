import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { calculateQueue, calculateRisk, hotspots } from './risk-engine.mjs';
import { getDelhiRainfall } from './weather.mjs';
import { isDuplicate, trustScore, validateReport, withReportMeta } from './report-quality.mjs';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.TABLE_NAME;
const allowedStatuses = new Set(['Assigned', 'In progress', 'Resolved']);
const nextStatus = { Unassigned: 'Assigned', Assigned: 'In progress', 'In progress': 'Resolved' };
const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store'
  },
  body: statusCode === 204 ? '' : JSON.stringify(body)
});

async function scanAll() {
  if (!table) throw new Error('TABLE_NAME is not configured.');
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const now = Math.floor(Date.now() / 1000);
  return items.filter((item) => !Number.isFinite(Number(item.expiresAt)) || Number(item.expiresAt) > now);
}
const publicItem = ({ PK, SK, expiresAt, ...item }) => item;
function parseBody(event) {
  const body = event.body || '{}';
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body);
  } catch {
    return null;
  }
}

export const handler = async (event = {}) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || '/';
  if (method === 'OPTIONS') return response(204, null);
  if (method === 'GET' && path === '/health') return response(200, { status: 'ok', storage: table ? 'dynamodb' : 'unconfigured' });
  if (method === 'GET' && path === '/weather') {
    try { return response(200, await getDelhiRainfall()); }
    catch { return response(503, { message: 'Weather forecast is temporarily unavailable.' }); }
  }

  try {
    if (method === 'GET' && path === '/reports') {
      const items = await scanAll();
      const reports = items.filter((item) => String(item.PK || '').startsWith('REPORT#')).map(publicItem);
      reports.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return response(200, reports.map(withReportMeta));
    }
    if (method === 'GET' && path === '/authority/queue') {
      const [items, weather] = await Promise.all([scanAll(), getDelhiRainfall()]);
      const reports = items.filter((item) => String(item.PK || '').startsWith('REPORT#')).map(publicItem);
      const actions = items.filter((item) => String(item.PK || '').startsWith('ACTION#')).map(publicItem);
      return response(200, calculateQueue(reports, Math.max(weather.rainfallMmHr, weather.next3hPeakMmHr), actions));
    }
    if (method === 'GET' && path === '/risk') {
      const [items, weather] = await Promise.all([scanAll(), getDelhiRainfall()]);
      const reports = items.filter((item) => String(item.PK || '').startsWith('REPORT#')).map(publicItem);
      const actions = items.filter((item) => String(item.PK || '').startsWith('ACTION#')).map(publicItem);
      const rainfallSignal = Math.max(weather.rainfallMmHr, weather.next3hPeakMmHr);
      return response(200, {
        ...calculateRisk({ origin: event.queryStringParameters?.origin || '', destination: event.queryStringParameters?.destination || '', reports, rainfallMmHr: rainfallSignal, forecast: weather, actions }),
        weather
      });
    }
    if (method === 'POST' && path === '/reports') {
      const input = parseBody(event);
      if (!input) return response(400, { message: 'Request body must be valid JSON.' });
      const checked = validateReport(input);
      if (checked.error) return response(400, { message: checked.error });
      const items = await scanAll();
      const reports = items.filter((item) => String(item.PK || '').startsWith('REPORT#')).map(publicItem);
      if (isDuplicate(checked.value, reports)) return response(409, { message: 'A matching report was already received recently.' });
      const report = {
        PK: `REPORT#${randomUUID()}`,
        SK: 'REPORT',
        id: randomUUID(),
        ...checked.value,
        trustScore: trustScore(checked.value, reports),
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 86400
      };
      await db.send(new PutCommand({ TableName: table, Item: report }));
      return response(201, withReportMeta(publicItem(report)));
    }
    if (method === 'POST' && path === '/authority/actions') {
      const input = parseBody(event);
      if (!input) return response(400, { message: 'Request body must be valid JSON.' });
      if (!hotspots.some((spot) => spot.id === input.hotspotId) || !allowedStatuses.has(input.status)) {
        return response(400, { message: 'A valid hotspot and action status are required.' });
      }
      const items = await scanAll();
      const latest = items
        .filter((item) => String(item.PK || '').startsWith('ACTION#') && item.hotspotId === input.hotspotId)
        .sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))[0];
      const current = latest?.status || 'Unassigned';
      if (nextStatus[current] !== input.status) {
        return response(409, { message: `Invalid action transition. ${current} can only move to ${nextStatus[current] || 'no further status'}.` });
      }
      const action = {
        PK: `ACTION#${randomUUID()}`,
        SK: 'ACTION',
        id: randomUUID(),
        hotspotId: input.hotspotId,
        status: input.status,
        updatedAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 86400
      };
      await db.send(new PutCommand({ TableName: table, Item: action }));
      return response(201, publicItem(action));
    }
    return response(404, { message: 'Not found' });
  } catch (error) {
    console.error('FloodShield Lambda error:', error);
    return response(500, { message: 'The API could not complete this request.' });
  }
};
