const configuredBase = import.meta.env.VITE_API_URL || '/api';
const base = configuredBase.replace(/\/$/, '');

const request = async (path, options) => {
  let response;
  try {
    response = await fetch(`${base}${path}`, options);
  } catch {
    throw new Error('FloodShield API is unreachable. Start the API server and try again.');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `API request failed (${response.status})`);
  return payload;
};

export const getLocations = () => request('/locations');
export const getRisk = (origin, destination) => request(`/risk?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
export const getWeather = () => request('/weather');
export const getReports = () => request('/reports');
export const getQueue = () => request('/authority/queue');
export const createReport = (payload) => request('/reports', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});
export const createAction = (payload) => request('/authority/actions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});
