const DELHI = { latitude: 28.6139, longitude: 77.2090 };
const CACHE_MS = 15 * 60 * 1000;
const FALLBACK = Object.freeze({
  rainfallMmHr: 0,
  next3hRainfallMm: 0,
  next3hPeakMmHr: 0,
  peakProbability: 0,
  trend: 'unknown',
  source: 'No live forecast available; using fallback signal',
  observedAt: null,
  stale: true
});
let cached = null;
let cachedAt = 0;

export async function getDelhiRainfall() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const params = new URLSearchParams({
      latitude: String(DELHI.latitude),
      longitude: String(DELHI.longitude),
      current: 'precipitation,rain,showers',
      hourly: 'precipitation,precipitation_probability',
      forecast_days: '1',
      timezone: 'Asia/Kolkata'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error(`Forecast request failed (${response.status})`);
    const data = await response.json();
    const current = data.current || {};
    const times = Array.isArray(data.hourly?.time) ? data.hourly.time : [];
    let currentIndex = times.indexOf(current.time);
    if (currentIndex < 0 && current.time) {
      const currentHour = String(current.time).slice(0, 13);
      currentIndex = times.findIndex((time) => String(time).startsWith(currentHour));
    }
    if (currentIndex < 0) currentIndex = 0;
    const nextHours = (data.hourly?.precipitation || []).slice(currentIndex, currentIndex + 3).map((value) => Number(value) || 0);
    const probabilities = (data.hourly?.precipitation_probability || []).slice(currentIndex, currentIndex + 3).map((value) => Number(value) || 0);
    const next3hRainfallMm = Number(nextHours.reduce((sum, value) => sum + value, 0).toFixed(1));
    const next3hPeakMmHr = Math.max(0, ...nextHours);
    const first = nextHours[0] || 0;
    const last = nextHours.at(-1) || 0;
    const currentRain = Number(current.precipitation ?? ((Number(current.rain) || 0) + (Number(current.showers) || 0)));
    cached = {
      rainfallMmHr: Number.isFinite(currentRain) ? Math.max(0, currentRain) : 0,
      next3hRainfallMm,
      next3hPeakMmHr,
      peakProbability: Math.max(0, ...probabilities),
      trend: last > first ? 'rising' : last < first ? 'easing' : 'steady',
      source: 'Open-Meteo forecast',
      observedAt: current.time || new Date().toISOString(),
      stale: false
    };
    cachedAt = Date.now();
    return cached;
  } catch {
    if (cached) return { ...cached, source: 'Open-Meteo cached forecast (refresh failed)', stale: true };
    return { ...FALLBACK };
  }
}
