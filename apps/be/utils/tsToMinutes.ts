
export function tfToMinutes(tf: string | number, fallback: number = 60): number {
  if (typeof tf === 'number' && Number.isFinite(tf) && tf > 0) return tf;

  const raw = String(tf ?? '').trim().toLowerCase();
  if (!raw) return fallback;

  // nếu là số thuần trong string, ví dụ "60"
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  // pattern: số + đơn vị (m|h|d)
  const match = raw.match(/^(\d+)\s*([mhd])$/);
  if (!match) return fallback;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return fallback;

  switch (unit) {
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 1440;
    default:  return fallback;
  }
}
export function isValidTimeframe(tf: string | number): boolean {
  const minutes = tfToMinutes(tf, -1);
  return Number.isFinite(minutes) && minutes > 0;
}
