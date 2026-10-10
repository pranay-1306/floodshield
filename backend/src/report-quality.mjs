const allowedLevels = new Set(['Low', 'Moderate', 'Severe']);
const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

export function validateReport(input = {}) {
  const safeInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const place = String(safeInput.place ?? '').trim();
  const detail = String(safeInput.detail ?? '').trim();
  if (place.length < 3 || place.length > 100) return { error: 'Enter a location between 3 and 100 characters.' };
  if (detail.length < 12 || detail.length > 280) return { error: 'Describe the condition in 12 to 280 characters.' };
  if (/https?:\/\//i.test(detail)) return { error: 'Links are not allowed in a road report.' };
  if (!allowedLevels.has(safeInput.level)) return { error: 'Choose Low, Moderate, or Severe.' };
  return { value: { place, detail, level: safeInput.level } };
}

export function isDuplicate(input, reports = []) {
  const candidatePlace = normalize(input?.place);
  const candidateDetail = normalize(input?.detail);
  if (!candidatePlace || !candidateDetail) return false;
  return reports.some((report) => {
    const createdAt = Date.parse(report?.createdAt ?? '');
    const ageMinutes = (Date.now() - createdAt) / 60_000;
    return Number.isFinite(createdAt) && ageMinutes >= 0 && ageMinutes < 20
      && normalize(report.place) === candidatePlace
      && normalize(report.detail) === candidateDetail;
  });
}

export function trustScore(input, reports = []) {
  const corroborating = reports.filter((report) => {
    const age = Date.now() - Date.parse(report.createdAt || '');
    return normalize(report.place) === normalize(input.place) && Number.isFinite(age) && age >= 0 && age < 90 * 60_000;
  }).length;
  const detailBonus = input.detail.length >= 40 ? 0.16 : input.detail.length >= 22 ? 0.08 : 0;
  return Math.min(0.92, Number((0.56 + detailBonus + Math.min(0.18, corroborating * 0.06)).toFixed(2)));
}

export function withReportMeta(report) {
  const timestamp = Date.parse(report.createdAt || '');
  const ageMinutes = Number.isFinite(timestamp) ? Math.max(0, Math.round((Date.now() - timestamp) / 60_000)) : null;
  return {
    ...report,
    ageMinutes,
    freshness: ageMinutes === null ? 'Unknown age' : ageMinutes < 15 ? 'Fresh' : ageMinutes < 60 ? 'Recent' : 'Aging'
  };
}
