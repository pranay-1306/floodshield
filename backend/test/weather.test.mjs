import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

test('weather uses Open-Meteo data and caches a successful result', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      current: { time: '2026-10-09T13:00', precipitation: 2.5, rain: 2.5, showers: 0 },
      hourly: {
        time: ['2026-10-09T13:00', '2026-10-09T14:00', '2026-10-09T15:00'],
        precipitation: [2, 3, 0],
        precipitation_probability: [60, 80, 10]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { getDelhiRainfall } = await import(`../src/weather.mjs?cache-test=${Date.now()}`);
    const first = await getDelhiRainfall();
    const second = await getDelhiRainfall();
    assert.equal(first.source, 'Open-Meteo forecast');
    assert.equal(first.rainfallMmHr, 2.5);
    assert.equal(first.next3hRainfallMm, 5);
    assert.equal(first.next3hPeakMmHr, 3);
    assert.equal(first.peakProbability, 80);
    assert.equal(first.trend, 'easing');
    assert.deepEqual(second, first);
    assert.equal(calls, 1, 'second call should use the 15-minute cache');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('weather returns a safe stale fallback when Open-Meteo is unavailable', async () => {
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try {
    const { getDelhiRainfall } = await import(`../src/weather.mjs?fallback-test=${Date.now()}`);
    const result = await getDelhiRainfall();
    assert.equal(result.stale, true);
    assert.equal(result.rainfallMmHr, 0);
    assert.equal(result.trend, 'unknown');
    assert.match(result.source, /fallback/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
