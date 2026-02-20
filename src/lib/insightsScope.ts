import type { UserData } from '../types';

/**
 * Insights scope rules:
 * - Global cutoff: userData.insightsFromISO (if set)
 * - Per-metric cutoff: userData.metricRetiredFromISO[metricId]
 * The effective cutoff is the later of the two.
 */

export function metricIdFromKey(key: string): string {
  // Keep exactly the keys used throughout the app (eg "sleep", "stress", "custom:abc").
  return String(key);
}

export function getMetricCutoffISO(userData: UserData, metricKey: string): string | null {
  const global = userData.insightsFromISO ? String(userData.insightsFromISO) : null;
  const per = (userData.metricRetiredFromISO ?? {})[metricIdFromKey(metricKey)] ?? null;

  if (global && per) return global > per ? global : per;
  return global ?? per;
}

export function isMetricInScope(userData: UserData, metricKey: string, dateISO: string): boolean {
  const cutoff = getMetricCutoffISO(userData, metricKey);
  if (!cutoff) return true;
  return String(dateISO) >= cutoff;
}
