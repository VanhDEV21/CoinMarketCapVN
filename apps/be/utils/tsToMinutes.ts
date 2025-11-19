export function tfToMinutes(tf: string): number | null {
  const t = String(tf || '').toLowerCase();
  if (t === '5m') return 5;
  if (t === '10m') return 10;
  if (t === '15m') return 15;
  if (t === '30m') return 30;
  if (t === '1h' || t === '60m' || t === 'h1') return 60;
  return null;
}

export function isValidTimeframe(tf: string): boolean {
  return ['5m','10m','15m','30m','1h','60m','h1'].includes(String(tf).toLowerCase());
}
