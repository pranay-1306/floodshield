export const hotspots = [
  { id: 'mandi-house', name: 'Mandi House Underpass', ward: 'New Delhi', baseRisk: 68, action: 'Deploy pump crew', lat: 28.6291, lng: 77.2254 },
  { id: 'iit-gate', name: 'IIT Gate Crossing', ward: 'Hauz Khas', baseRisk: 54, action: 'Inspect drain', lat: 28.5457, lng: 77.1926 },
  { id: 'saket-metro', name: 'Saket Metro Approach', ward: 'Saket', baseRisk: 43, action: 'Clear debris', lat: 28.5245, lng: 77.2066 },
  { id: 'lajpat-ring', name: 'Lajpat Nagar Ring Road', ward: 'South East', baseRisk: 28, action: 'Monitor', lat: 28.5675, lng: 77.2430 }
];

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
    return {
      ...spot,
      risk,
      reports: nearby.length,
      status: risk >= 75 ? 'High' : risk >= 50 ? 'Watch' : 'Low',
      actionStatus: latestAction?.status || 'Unassigned'
    };
  }).sort((a, b) => b.risk - a.risk);
}

export function calculateRisk({ origin = '', destination = '', reports = [], rainfallMmHr = 18, forecast = null, actions = [] } = {}) {
  const queue = calculateQueue(reports, rainfallMmHr, actions);
  const from = String(origin ?? '');
  const to = String(destination ?? '');
  const matched = queue.filter((spot) => contains(to, spot.name.split(' ')[0]) || contains(from, spot.name.split(' ')[0]));
  const routeHotspot = matched[0] || queue.find((spot) => contains(to, 'mandi')) || queue[0];
  const risk = Math.max(18, Math.min(99, Math.round(routeHotspot.risk * (matched.length ? 1 : 0.7))));
  const roadReports = routeHotspot.reports;
  const confidence = roadReports >= 3 ? 'High' : roadReports > 0 ? 'Medium' : forecast?.stale ? 'Limited' : 'Forecast-led';
  const recommendation = risk >= 75
    ? `Delay travel if possible and avoid ${routeHotspot.name}. Check official advisories and live directions before departing.`
    : risk >= 50
      ? `Allow 15 extra minutes and avoid low-lying underpasses near ${routeHotspot.name}.`
      : 'Leave as planned. Keep FloodShield alerts on while you travel.';
  return {
    risk,
    confidence,
    rainfallMmHr: Number(Number(rainfallMmHr || 0).toFixed(1)),
    roadReports,
    hotspot: routeHotspot.name,
    recommendation,
    reasons: [
      forecast ? `Next 3h: ${Number(forecast.next3hRainfallMm || 0)} mm forecast; peak chance ${Number(forecast.peakProbability || 0)}%` : `${Number(rainfallMmHr || 0)} mm/hr forecast rainfall`,
      `${roadReports} recent community report${roadReports === 1 ? '' : 's'}`,
      `${routeHotspot.name} is a monitored low-drainage location`
    ],
    updatedAt: new Date().toISOString()
  };
}
