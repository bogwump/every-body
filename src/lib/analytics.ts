import type { CheckInEntry, SymptomKey } from "../types";
import { isoFromDateLocal, isoTodayLocal } from "./date";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function isoToday(): string {
  return isoTodayLocal();
}

export function sortByDateAsc(entries: CheckInEntry[] | unknown): CheckInEntry[] {
  const safe = asArray<CheckInEntry>(entries);
  return [...safe].sort((a, b) => String(a?.dateISO ?? "").localeCompare(String(b?.dateISO ?? "")));
}

export function filterByDays(entries: CheckInEntry[] | unknown, days: number): CheckInEntry[] {
  const safe = asArray<CheckInEntry>(entries);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Math.max(1, days) - 1));
  const cutoffISO = isoFromDateLocal(cutoff);

  return safe.filter((e) => String(e?.dateISO ?? "") >= cutoffISO);
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

export function getSeries(
  entries: CheckInEntry[] | unknown,
  key: SymptomKey
): Array<{ dateISO: string; value: number }> {
  const sorted = sortByDateAsc(entries);

  return sorted
    .map((e) => ({
      dateISO: String(e?.dateISO ?? ""),
      value: (e as any)?.values?.[key],
    }))
    .filter(
      (p): p is { dateISO: string; value: number } =>
        p.dateISO.length > 0 && typeof p.value === "number" && Number.isFinite(p.value)
    );
}

export function calculateStreak(entries: CheckInEntry[] | unknown): number {
  const safe = asArray<CheckInEntry>(entries);

  // NOTE: In this app, we treat "streak" as a gentle *habit count* (how many
  // days the user has checked in), not a consecutive-days counter.
  // This avoids users feeling penalised if they miss a day.
  const hasAnyMeaningfulData = (e: any): boolean => {
    if (!e) return false;
    // Mood is stored top-level in entries.
    if (typeof e.mood === 'number' && Number.isFinite(e.mood)) return true;

    // Numeric symptom values.
    const v = e.values as Record<string, any> | undefined;
    if (v && typeof v === 'object') {
      for (const val of Object.values(v)) {
        if (typeof val === 'number' && Number.isFinite(val)) return true;
      }
    }

    // Influences/events.
    const ev = e.events as Record<string, any> | undefined;
    if (ev && typeof ev === 'object') {
      for (const val of Object.values(ev)) {
        if (val) return true;
      }
    }

    // Notes.
    if (typeof e.notes === 'string' && e.notes.trim().length > 0) return true;

    // Sleep details.
    const sd = e.sleepDetails as any;
    if (sd && typeof sd === 'object') {
      if (typeof sd.timesWoke === 'number' && sd.timesWoke > 0) return true;
      if (typeof sd.troubleFallingAsleep === 'number' && sd.troubleFallingAsleep > 0) return true;
      if (Boolean(sd.wokeTooEarly)) return true;
      if (Boolean(sd.nightSweats)) return true;
    }

    // Cycle override (manual "new cycle started") still counts as a check-in day.
    if (Boolean(e.cycleStartOverride)) return true;

    return false;
  };

  const set = new Set<string>();
  for (const e of safe) {
    const iso = String((e as any)?.dateISO ?? '');
    if (iso.length !== 10) continue; // crude but effective YYYY-MM-DD check
    if (!hasAnyMeaningfulData(e)) continue;
    set.add(iso);
  }

  return set.size;
}

export function labelCorrelation(r: number): string {
  if (!isFinite(r)) return "Not enough data";

  const abs = Math.abs(r);
  const strength =
    abs >= 0.7 ? "Strong" : abs >= 0.4 ? "Moderate" : abs >= 0.2 ? "Weak" : "No clear";

  const direction = r > 0.05 ? "positive" : r < -0.05 ? "negative" : "relationship";
  return `${strength} ${direction} correlation`;
}

export type CyclePhase = "Menstrual" | "Follicular" | "Ovulation" | "Luteal";

/**
 * Lightweight heuristic cycle-phase estimator.
 * - Uses logged flow (> 0) as period day marker.
 *   (Flow is treated as 0–10; older builds sometimes stored 0–100.)
 * - Estimates phase by counting days since last bleeding.
 * - This is only used when the user explicitly enables cycle tracking.
 */
export function estimatePhaseByFlow(
  dateISO: string,
  entries: CheckInEntry[] | unknown
): CyclePhase | null {
  const sorted = sortByDateAsc(entries);
  const idx = sorted.findIndex((e) => String(e?.dateISO ?? "") === dateISO);
  if (idx < 0) return null;

  const flowTo10 = (v: any): number | null => {
    if (typeof v !== "number") return null;
    // Support older 0–100 values
    const scaled = v > 10 ? Math.round(v / 10) : v;
    return Math.max(0, Math.min(10, scaled));
  };

  // If you are bleeding/spotting *today*, that's Menstrual regardless of day count.
  const todayFlow = flowTo10((sorted[idx] as any)?.values?.flow);
  if (todayFlow != null && todayFlow > 0) return "Menstrual";

  // (Duplicate block removed) bleeding/spotting today already handled above.

  // Find most recent day with flow > 0 up to idx.
  // NOTE: flow is now treated as a 0–10 scale (older builds stored 0–100).
  let lastBleedIndex = -1;
  for (let i = idx; i >= 0; i--) {
    const flow = flowTo10((sorted[i] as any)?.values?.flow);
    if (flow != null && flow > 0) {
      lastBleedIndex = i;
      break;
    }
  }

  if (lastBleedIndex === -1) return null;

  const daySince = idx - lastBleedIndex; // 0 = bleeding day

  if (daySince <= 4) return "Menstrual";
  if (daySince <= 12) return "Follicular";
  if (daySince <= 15) return "Ovulation";
  return "Luteal";
}


export interface CycleStats {
  cycleStarts: string[]; // YYYY-MM-DD sorted asc
  lengths: number[]; // days between consecutive starts
  lastLength: number | null;
  avgLength: number | null;
  predictedNextStartISO: string | null;
  predictionNote: string | null;
}

/**
 * Detect cycle starts using either a manual override, or a flow "start" signal.
 * Rules:
 * - Manual override always counts as a start
 * - Otherwise flow > 0 counts as bleeding, and the first bleeding day after a non-bleeding day is a start
 */
export function getCycleStarts(entries: CheckInEntry[] | unknown): string[] {
  const sorted = sortByDateAsc(entries);
  const starts: string[] = [];

  const flowTo10 = (v: any): number | null => {
    if (typeof v !== 'number') return null;
    // Support older 0–100 values
    const scaled = v > 10 ? Math.round(v / 10) : v;
    return Math.max(0, Math.min(10, scaled));
  };

  // Track bleeding state, treating breakthrough bleeds as NOT resetting the cycle.
  let wasBleeding = false;

  for (let i = 0; i < sorted.length; i++) {
    const e: any = sorted[i];
    const dateISO = String(e?.dateISO ?? '');
    if (!dateISO) continue;

    if (e?.cycleStartOverride === true) {
      starts.push(dateISO);
      wasBleeding = true;
      continue;
    }

    const rawFlow = flowTo10(e?.values?.flow);
    const isBreakthrough = Boolean(e?.breakthroughBleed);
    const effectiveFlow = isBreakthrough ? 0 : (typeof rawFlow === 'number' ? rawFlow : 0);

    const isBleeding = effectiveFlow > 0;
    if (isBleeding && !wasBleeding) starts.push(dateISO);

    wasBleeding = isBleeding;
  }

  return Array.from(new Set(starts)).sort((a, b) => a.localeCompare(b));
}

function daysBetweenISO(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute cycle length stats. This is intentionally "explainable":
 * - starts come from override or flow
 * - prediction defaults to lastStart + avgLength
 * - optional symptom-based hint (fatigue/brain fog/night sweats/skin/hair) nudges the note, not the date
 */
export function computeCycleStats(entries: CheckInEntry[] | unknown): CycleStats {
  const starts = getCycleStarts(entries);
  const lengths: number[] = [];

  for (let i = 0; i < starts.length - 1; i++) {
    const len = daysBetweenISO(starts[i], starts[i + 1]);
    if (Number.isFinite(len) && len >= 10 && len <= 60) {
      lengths.push(len);
    }
  }

  const lastLength = lengths.length ? lengths[lengths.length - 1] : null;

  const recent = lengths.slice(-6);
  const avgLength =
    recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;

  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const predictedNextStartISO =
    lastStart && avgLength ? addDaysISO(lastStart, avgLength) : null;

  // Symptom-based hint (lightweight "AI-ish" signal)
  // We look at last 5 days average for selected symptoms, and if high, we mention it.
  const sorted = sortByDateAsc(entries);
  const last5 = sorted.slice(-5) as any[];

  const keys: SymptomKey[] = ["fatigue", "brainFog", "nightSweats", "hairShedding", "facialSpots", "cysts"];
  let signalCount = 0;

  const normalise10 = (v: any): number | null => {
    if (typeof v !== 'number') return null;
    const scaled = v > 10 ? Math.round(v / 10) : v;
    return Math.max(0, Math.min(10, scaled));
  };

  for (const k of keys) {
    const vals = last5
      .map((e) => normalise10(e?.values?.[k]))
      .filter((v: any) => typeof v === 'number') as number[];
    if (!vals.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    // values are 0–10 (older builds may have 0–100, normalised above)
    if (avg >= 7) signalCount++;
  }

  const predictionNote =
    predictedNextStartISO && signalCount >= 2
      ? "Some recent symptoms often seen pre-period are running higher than usual. Consider using the 'New cycle started today' switch if bleeding is unclear."
      : predictedNextStartISO
      ? "Prediction is based on your recent average cycle length. You can override it anytime."
      : null;

  return {
    cycleStarts: starts,
    lengths,
    lastLength,
    avgLength,
    predictedNextStartISO,
    predictionNote,
  };
}
