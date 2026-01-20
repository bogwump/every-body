import type { CheckInEntry, SymptomKey } from '../types';

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sortByDateAsc(entries: CheckInEntry[]): CheckInEntry[] {
  return [...entries].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

export function filterByDays(entries: CheckInEntry[], days: number): CheckInEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.dateISO >= cutoffISO);
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return NaN;
  return num / den;
}

export function getSeries(entries: CheckInEntry[], key: SymptomKey): Array<{ dateISO: string; value: number }> {
  return sortByDateAsc(entries)
    .map((e) => ({ dateISO: e.dateISO, value: e.values[key] }))
    .filter((p): p is { dateISO: string; value: number } => typeof p.value === 'number');
}

export function calculateStreak(entries: CheckInEntry[]): number {
  const set = new Set(entries.map((e) => e.dateISO));
  let streak = 0;
  const d = new Date();
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function labelCorrelation(r: number): string {
  if (!isFinite(r)) return 'Not enough data';
  const abs = Math.abs(r);
  const strength = abs >= 0.7 ? 'Strong' : abs >= 0.4 ? 'Moderate' : abs >= 0.2 ? 'Weak' : 'No clear';
  const direction = r > 0.05 ? 'positive' : r < -0.05 ? 'negative' : 'relationship';
  return `${strength} ${direction} correlation`;
}

export type CyclePhase = 'Menstrual' | 'Follicular' | 'Ovulation' | 'Luteal';

/**
 * Lightweight heuristic cycle-phase estimator.
 * - Uses logged flow (>= 20) as period day marker.
 * - Estimates phase by counting days since last bleeding.
 * - This is only used when the user explicitly enables cycle tracking.
 */
export function estimatePhaseByFlow(dateISO: string, entries: CheckInEntry[]): CyclePhase | null {
  const sorted = sortByDateAsc(entries);
  const idx = sorted.findIndex((e) => e.dateISO === dateISO);
  if (idx < 0) return null;

  // find most recent day with flow >= 20 up to idx
  let lastBleedIndex = -1;
  for (let i = idx; i >= 0; i--) {
    const flow = sorted[i].values.flow;
    if (typeof flow === 'number' && flow >= 20) {
      lastBleedIndex = i;
      break;
    }
  }
  if (lastBleedIndex === -1) return null;

  const daySince = idx - lastBleedIndex; // 0 = bleeding day

  if (daySince <= 4) return 'Menstrual';
  if (daySince <= 12) return 'Follicular';
  if (daySince <= 15) return 'Ovulation';
  return 'Luteal';
}
