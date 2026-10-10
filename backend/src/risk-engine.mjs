import { CORRIDOR_KM, distanceToRouteKm, exposureForDistance } from './geo.mjs';
import { hotspots, resolveLocation } from './locations.mjs';

export { hotspots, CORRIDOR_KM };

const severityWeight = { Severe: 22, Moderate: 12, Low: 5 };
const contains = (value, query) => String(value ?? '').toLowerCase().includes(String(query ?? '').toLowerCase());
const ageWeight = (createdAt) => {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageHours = (Date.now() - timestamp) / 3_600_000;
  if (ageHours < 0) return 0;
  return Math.max(0, 1 - ageHours / 6);
};

export function reportCountFor(hotspot, reports = []) {
  const keyword = hotspot.name.split(' ')[0];
  return reports.reduce((sum, report) => sum + (contains(report.place, keyword) ? 1 : 0), 0);
}

export function calculateQueue(reports = [], rainfallMmHr = 18, actions = []) {
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeActions = Array.isArray(actions) ? actions : [];
  const rainfall = Number.isFinite(Number(rainfallMmHr)) ? Math.max(0, Number(rainfallMmHr)) : 0;

  return hotspots.map((spot) => {
    const keyword = spot.name.split(' ')[0];
    const nearby = safeReports.filter((report) => contains(report.place, keyword));
    const reportSignal = nearby.reduce((sum, report) => {
      const weight = severityWeight[report.level] || 8;
      const trust = Number.isFinite(Number(report.trustScore)) ? Math.max(0, Math.min(1, Number(report.trustScore))) : 0.7;
      return sum + weight * ageWeight(report.createdAt) * trust;
    }, 0);
    const rainSignal = Math.min(28, rainfall * 1.25);
    const latestAction = safeActions
      .filter((action) => action.hotspotId === spot.id)
      .sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))[0];
    const mitigation = latestAction?.status === 'Resolved' ? 24 : latestAction?.status === 'In progress' ? 9 : 0;
    const risk = Math.max(0, Math.min(99, Math.round(spot.baseRisk + rainSignal + reportSignal - mitigation)));
    const freshest = nearby
      .slice()
      .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))[0];
    return {
      ...spot,
      risk,
      reports: nearby.length,
      status: risk >= 75 ? 'High' : risk >= 50 ? 'Watch' : 'Low',
      actionStatus: latestAction?.status || 'Unassigned',
      rainSignal: Number(rainSignal.toFixed(1)),
      reportSignal: Number(reportSignal.toFixed(1)),
      mitigation,
      freshestReportAt: freshest?.createdAt || null
    };
  }).sort((a, b) => b.risk - a.risk);
}

function resolveEndpoint(query) {
  const matched = resolveLocation(query);
  if (matched) return { ...matched, query: String(query || '') };
  return { id: null, name: String(query || '').trim() || 'Unknown', area: null, lat: null, lng: null, matched: false, query: String(query || '') };
}

function buildReasons({ forecast, rainfallMmHr, exposed, roadReports, matched }) {
  const weatherReason = forecast
    ? `${forecast.stale ? 'Fallback/cached rain signal' : 'Open-Meteo'}: next 3h ${Number(forecast.next3hRainfallMm || 0)} mm, peak chance ${Number(forecast.peakProbability || 0)}%`
    : `${Number(rainfallMmHr || 0)} mm/hr rainfall signal`;
  if (!matched) {
    return [weatherReason, 'Origin or destination was not matched to the Delhi location set', 'Score is forecast-only until both ends of the trip are recognised'];
  }
  if (exposed.length === 0) {
    return [weatherReason, `${roadReports} community reports on this corridor`, 'No monitored flood hotspot sits within 3 km of this journey'];
  }
  return [
    weatherReason,
    `${roadReports} recent community report${roadReports === 1 ? '' : 's'} on exposed hotspots`,
    ...exposed.slice(0, 3).map((spot) => `${spot.name} is ${spot.distanceKm} km from this corridor (${spot.actionStatus})`)
  ];
}

export function calculateRisk({ origin = '', destination = '', reports = [], rainfallMmHr = 18, forecast = null, actions = [] } = {}) {
  const queue = calculateQueue(reports, rainfallMmHr, actions);
  const from = resolveEndpoint(origin);
  const to = resolveEndpoint(destination);
  const matched = Boolean(from.matched && to.matched);
  const routePoints = matched ? [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }] : [];
  const exposed = queue.map((spot) => {
    const distanceKm = matched ? Number(distanceToRouteKm({ lat: spot.lat, lng: spot.lng }, routePoints).toFixed(2)) : null;
    const exposure = matched ? exposureForDistance(distanceKm) : 0;
    return { ...spot, distanceKm, exposure, onRoute: exposure > 0 };
  }).filter((spot) => spot.onRoute).sort((a, b) => b.exposure - a.exposure || b.risk - a.risk);

  const primary = exposed[0] || null;
  const roadReports = exposed.reduce((sum, spot) => sum + spot.reports, 0);
  const rainOnly = Math.max(0, Math.min(42, Math.round(12 + Number(rainfallMmHr || 0) * 1.1)));
  let risk;
  if (!matched) {
    risk = Math.min(38, rainOnly);
  } else if (!primary) {
    risk = Math.min(46, Math.max(12, rainOnly - 8));
  } else {
    const weighted = exposed.reduce((best, spot) => {
      const contribution = spot.risk * (0.62 + 0.38 * spot.exposure);
      return Math.max(best, contribution);
    }, 0);
    risk = Math.max(18, Math.min(99, Math.round(weighted)));
  }

  const confidence = !matched
    ? 'Limited'
    : roadReports >= 3
      ? 'High'
      : roadReports > 0
        ? 'Medium'
        : forecast?.stale
          ? 'Limited'
          : 'Forecast-led';

  const recommendation = !matched
    ? 'Choose suggested Delhi locations so FloodShield can see which flood hotspots sit on your journey.'
    : risk >= 75
      ? `Delay travel if possible and avoid ${primary.name}. Check official advisories and live directions before departing.`
      : risk >= 50
        ? `Allow extra time and avoid low-lying stretches near ${primary.name}.`
        : exposed.length
          ? `Leave as planned, but watch ${primary.name}. Keep an eye on fresh reports.`
          : 'This corridor currently avoids monitored flood hotspots. Leave as planned and re-check before you travel.';

  return {
    risk,
    confidence,
    rainfallMmHr: Number(Number(rainfallMmHr || 0).toFixed(1)),
    roadReports,
    hotspot: primary?.name || (matched ? 'No monitored hotspot on corridor' : 'Location not matched'),
    recommendation,
    reasons: buildReasons({ forecast, rainfallMmHr, exposed, roadReports, matched }),
    updatedAt: new Date().toISOString(),
    corridorKm: CORRIDOR_KM,
    origin: from,
    destination: to,
    matched,
    exposedHotspots: exposed.map((spot) => ({
      id: spot.id,
      name: spot.name,
      ward: spot.ward,
      risk: spot.risk,
      reports: spot.reports,
      actionStatus: spot.actionStatus,
      distanceKm: spot.distanceKm,
      exposure: spot.exposure,
      action: spot.action
    })),
    signals: {
      rainfallMmHr: Number(Number(rainfallMmHr || 0).toFixed(1)),
      forecastSource: forecast?.source || 'Rainfall signal',
      forecastStale: Boolean(forecast?.stale),
      observedAt: forecast?.observedAt || null,
      reportFreshness: roadReports === 0 ? 'No corridor reports' : 'Weighted by age and trust',
      responseStatus: primary?.actionStatus || 'Unassigned',
      exposedCount: exposed.length
    },
    scoreBreakdown: primary ? {
      hotspotBaseline: primary.baseRisk,
      weatherSignal: primary.rainSignal,
      communityReports: primary.reportSignal,
      responseMitigation: primary.mitigation,
      corridorExposure: Number(primary.exposure.toFixed(2)),
      note: 'Signals are heuristic points, not a probability of flooding.'
    } : {
      hotspotBaseline: 0,
      weatherSignal: rainOnly,
      communityReports: 0,
      responseMitigation: 0,
      corridorExposure: 0,
      note: matched ? 'No monitored hotspot is within 3 km of this corridor.' : 'Choose recognised locations for a route-aware score.'
    }
  };
}
