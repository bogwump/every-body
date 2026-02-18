import type { CheckInEntry, UserData } from '../types';

/**
 * Fitbit integration (prepared, not yet switched on).
 *
 * Goal: keep the rest of the app unaware of Fitbit specifics.
 * When we wire this up for real, we can:
 *  - complete OAuth (PKCE) in the browser
 *  - store tokens securely (likely via backend or encrypted storage)
 *  - import sleep and map it into the same daily summary fields the app already uses
 */

export type FitbitSleepSummary = {
  dateISO: string; // YYYY-MM-DD
  /** 0–10 derived score so it can feed existing charts */
  sleep10?: number;
  /** Optional richer details if we choose to populate them */
  timesWoke?: number;
  troubleFallingAsleep?: 0 | 1 | 2;
  wokeTooEarly?: boolean;
};

export function isFitbitEnabled(user: UserData): boolean {
  return Boolean(user.fitbitEnabled);
}

/**
 * Placeholder for a future OAuth connect flow.
 * For now it intentionally does nothing.
 */
export async function connectFitbit(): Promise<void> {
  // TODO: Implement OAuth PKCE flow.
  return;
}

/**
 * Placeholder import function.
 * When enabled, it should return sleep summaries that we can merge into entries.
 */
export async function fetchFitbitSleepSummaries(_fromISO: string, _toISO: string): Promise<FitbitSleepSummary[]> {
  // TODO: Call Fitbit APIs (likely via a lightweight backend proxy).
  return [];
}

/**
 * Merge imported Fitbit sleep into existing entries.
 * This keeps manual logging as the priority: if the user logged sleep themselves,
 * we do not overwrite it.
 */
export function mergeFitbitSleepIntoEntries(entries: CheckInEntry[], summaries: FitbitSleepSummary[]): CheckInEntry[] {
  if (!Array.isArray(entries) || !Array.isArray(summaries) || summaries.length === 0) return entries;
  const byISO = new Map<string, FitbitSleepSummary>();
  for (const s of summaries) {
    if (s?.dateISO) byISO.set(s.dateISO, s);
  }

  return entries.map((e) => {
    const s = byISO.get(e.dateISO);
    if (!s) return e;

    const hasManualSleep = typeof (e as any)?.values?.sleep === 'number';
    if (hasManualSleep) return e;

    const nextValues = { ...(e.values ?? {}) } as any;
    if (typeof s.sleep10 === 'number') nextValues.sleep = Math.max(0, Math.min(10, Math.round(s.sleep10)));

    return {
      ...e,
      values: nextValues,
      // Optional: if we decide to populate details, we can do it here.
    };
  });
}
