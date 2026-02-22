import type { CheckInEntry, SymptomKey, InfluenceKey, UserData } from "../types";
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



export type HomepageHeroTier = "starter" | "early" | "weekly" | "mature";

export type HomepageHeroModel = {
  dateISO: string;
  tier: HomepageHeroTier;
  rhythmTitle: string;
  rhythmHeadline?: string;
  rhythmBody: string;
  howTitle: string;
  howLines: string[];
  relationshipLine?: string;
};

const HOMEPAGE_SYMPTOM_LABELS: Partial<Record<SymptomKey, string>> = {
  energy: "Energy",
  motivation: "Motivation",
  sleep: "Sleep",
  insomnia: "Trouble falling asleep",
  pain: "Pain",
  headache: "Headaches",
  migraine: "Migraines",
  backPain: "Back pain",
  cramps: "Period pain",
  jointPain: "Joint pain",
  flow: "Bleeding",
  stress: "Stress",
  anxiety: "Anxiety",
  irritability: "Irritability",
  focus: "Focus",
  bloating: "Bloating",
  digestion: "Digestion",
  nausea: "Nausea",
  constipation: "Constipation",
  diarrhoea: "Diarrhoea",
  acidReflux: "Acid reflux",
  hairShedding: "Hair shedding",
  facialSpots: "Facial spots",
  cysts: "Cysts",
  skinDryness: "Skin dryness",
  brainFog: "Brain fog",
  fatigue: "Fatigue",
  dizziness: "Dizziness",
  appetite: "Appetite",
  libido: "Libido",
  breastTenderness: "Breast tenderness",
  hotFlushes: "Hot flushes",
  nightSweats: "Night sweats",
  restlessLegs: "Restless legs",
};

const HOMEPAGE_INFLUENCE_LABELS: Record<InfluenceKey, string> = {
  sex: "sex",
  exercise: "exercise",
  travel: "travel",
  illness: "illness",
  alcohol: "alcohol",
  lateNight: "a late night",
  stressfulDay: "a stressful day",
  medication: "medication",
  caffeine: "caffeine",
  socialising: "socialising",
  lowHydration: "low hydration",
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatLocalDateISO(d: Date): string {
  return isoFromDateLocal(d);
}

function getRecentWindow(entries: CheckInEntry[], days: number, endISO: string): CheckInEntry[] {
  const end = new Date(endISO + "T00:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - (Math.max(1, days) - 1));
  const startISO = formatLocalDateISO(start);
  return entries.filter((e) => String(e?.dateISO ?? "") >= startISO && String(e?.dateISO ?? "") <= endISO);
}

function getNumericSymptom(e: any, key: SymptomKey): number | undefined {
  const v = e?.values?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function getMoodAs10(e: any): number | undefined {
  const m = e?.mood as 1 | 2 | 3 | undefined;
  if (m === 1) return 3;
  if (m === 2) return 6;
  if (m === 3) return 9;
  return undefined;
}

type SymptomShift = { key: "mood" | SymptomKey; label: string; delta: number; logsA: number; logsB: number };

function describeShift(label: string, delta: number): string {
  // delta is last7 - prev7 (positive = higher)
  const abs = Math.abs(delta);

  // "clinical" language avoided, so we lean on gentle phrasing.
  if (abs < 0.4) return `${label} has felt fairly steady`;
  if (abs < 1.0) return delta > 0 ? `${label} has been a little higher` : `${label} has been a little lower`;
  if (abs < 2.0) return delta > 0 ? `${label} has been noticeably higher` : `${label} has been noticeably lower`;
  return delta > 0 ? `${label} has been much higher` : `${label} has been much lower`;
}

function safeLabelForSymptom(key: SymptomKey): string {
  return HOMEPAGE_SYMPTOM_LABELS[key] ?? key;
}

function pickTier(daysLogged: number): HomepageHeroTier {
  if (daysLogged < 4) return "starter";
  if (daysLogged < 7) return "early";
  if (daysLogged < 30) return "weekly";
  return "mature";
}

type RelationshipCandidate = {
  influence: InfluenceKey;
  symptomKey: "mood" | SymptomKey;
  symptomLabel: string;
  influenceLabel: string;
  effect: number; // mean(with) - mean(without)
  withN: number;
  withoutN: number;
};

function buildRelationshipLine(c: RelationshipCandidate): string {
  const symptom = c.symptomLabel.toLowerCase();
  const infl = c.influenceLabel;
  const abs = Math.abs(c.effect);

  let strength: "a bit" | "often" | "clearly" = "a bit";
  if (abs >= 1.5) strength = "clearly";
  else if (abs >= 0.8) strength = "often";

  const dir = c.effect > 0 ? "higher" : "lower";

  // Keep tone neutral, especially for alcohol.
  return `It looks like ${symptom} is ${dir} ${strength} on days you log ${infl}.`;
}

/**
 * Builds the content for the Dashboard hero.
 * - Uses the user's enabled modules (plus mood) so we never pigeonhole.
 * - Produces up to 3 "How you've been" lines.
 * - Produces at most 1 relationship insight line (rotates daily if multiple qualify).
 * - Locks outputs per day is handled by the caller (Dashboard) via localStorage cache.
 */
export function buildHomepageHeroModel(
  entriesRaw: CheckInEntry[] | unknown,
  userData: UserData
): HomepageHeroModel {
  const todayISO = isoTodayLocal();
  const sorted = sortByDateAsc(entriesRaw);
  const daysLogged = sorted.length;

  const tier = pickTier(daysLogged);

  // Rhythm block (softened for perimenopause users)
  const isPeri = userData.goal === "perimenopause";
  let rhythmTitle = "Today in your rhythm";
  let rhythmHeadline: string | undefined;
  let rhythmBody = "Log a few days and I’ll start reflecting your rhythm back to you.";

  if (isPeri) rhythmTitle = "Your rhythm lately";

  if (userData.cycleTrackingMode === "cycle") {
    const stats = computeCycleStats(sorted);
    // Use the phase estimator if we have enough context.
    // We only show the phase name once we can place the user in a cycle day.
    if (stats && (stats as any).avgLength) {
      // estimatePhaseByFlow expects entries and a date, and returns phase meta in this app.
      try {
        const phase = estimatePhaseByFlow(sorted, todayISO, (stats as any).avgLength);
        if (phase?.soft) {
          rhythmHeadline = isPeri ? phase.soft.replace("Phase", "").trim() : `You’re in ${phase.soft.replace("Phase", "").trim()}`;
          rhythmBody = isPeri
            ? "Your cycle may feel less predictable. We’ll focus on trends over exact days."
            : "This is a helpful backdrop for planning, but your logged symptoms matter most.";
        }
      } catch {
        // fall back silently
      }
    }
  } else {
    rhythmBody = "Cycle features are off, but you can still track symptoms and patterns.";
  }

  // Eligible symptoms are whatever the user has enabled, plus mood.
  const enabled = new Set<SymptomKey>(userData.enabledModules ?? []);
  // Never use flow as an emotional summary line.
  enabled.delete("flow");

  // Build windows
  const last7 = getRecentWindow(sorted, 7, todayISO);
  const prev7 = getRecentWindow(sorted, 7, formatLocalDateISO(new Date(new Date(todayISO + "T00:00:00").getTime() - 7 * 86400000)));

  const shifts: SymptomShift[] = [];

  // Mood shift
  {
    const a = last7.map(getMoodAs10).filter((n): n is number => typeof n === "number");
    const b = prev7.map(getMoodAs10).filter((n): n is number => typeof n === "number");
    if (a.length >= 2 && b.length >= 2) {
      shifts.push({ key: "mood", label: "Mood", delta: mean(a) - mean(b), logsA: a.length, logsB: b.length });
    }
  }

  // Symptom shifts
  for (const key of enabled) {
    const a = last7.map((e) => getNumericSymptom(e, key)).filter((n): n is number => typeof n === "number");
    const b = prev7.map((e) => getNumericSymptom(e, key)).filter((n): n is number => typeof n === "number");
    if (tier === "early") {
      // For 4-6 days total, compare within last7 only (no prev7 reliable).
      // We'll handle this below with a simpler summary.
      continue;
    }
    if (a.length >= 2 && b.length >= 2) {
      shifts.push({ key, label: safeLabelForSymptom(key), delta: mean(a) - mean(b), logsA: a.length, logsB: b.length });
    }
  }

  let howLines: string[] = [];
  const howTitle = "How you’ve been recently";

  if (tier === "starter") {
    howLines = ["Start logging and I’ll summarise how you’ve been."];
  } else if (tier === "early") {
    // Use last 7 only: pick up to 2 symptoms with the widest range, based on what exists.
    const candidates: Array<{ label: string; range: number }> = [];
    const moodVals = last7.map(getMoodAs10).filter((n): n is number => typeof n === "number");
    if (moodVals.length >= 2) candidates.push({ label: "Mood", range: Math.max(...moodVals) - Math.min(...moodVals) });
    for (const key of enabled) {
      const vals = last7.map((e) => getNumericSymptom(e, key)).filter((n): n is number => typeof n === "number");
      if (vals.length >= 2) candidates.push({ label: safeLabelForSymptom(key), range: Math.max(...vals) - Math.min(...vals) });
    }
    candidates.sort((a, b) => b.range - a.range);
    const pick = candidates.slice(0, 2);
    howLines = pick.length
      ? pick.map((p) => `${p.label} has varied a bit`)
      : ["Keep logging and I’ll start reflecting patterns back to you."];
  } else {
    // Weekly/mature: pick up to 3 by weighted impact
    const weighted = shifts
      .map((s) => {
        const consistency = clamp01(Math.min(s.logsA, s.logsB) / 5); // 0..1
        const impact = Math.abs(s.delta) * (0.6 + 0.4 * consistency);
        return { ...s, impact };
      })
      .sort((a, b) => b.impact - a.impact);

    const top = weighted.filter((s) => Math.abs(s.delta) >= 0.35).slice(0, 3);
    howLines = top.length ? top.map((s) => describeShift(s.label, s.delta)) : ["Things have felt fairly steady recently."];
  }

  // Relationship insight (from 7+ days)
  let relationshipLine: string | undefined;
  if (daysLogged >= 7) {
    const enabledInfluences = (userData.enabledInfluences ?? []) as InfluenceKey[];
    const influences = enabledInfluences.length ? enabledInfluences : [];
    const usableInfluences = influences.filter((k) => k !== "sex");

    const window14 = getRecentWindow(sorted, 14, todayISO);
    const candidates: RelationshipCandidate[] = [];

    // Choose symptoms to test against: mood + enabled symptoms (excluding flow)
    const symptomKeys: Array<"mood" | SymptomKey> = ["mood", ...Array.from(enabled)];

    for (const infl of usableInfluences) {
      const withDays = window14.filter((e: any) => Boolean(e?.events?.[infl]));
      const withoutDays = window14.filter((e: any) => !Boolean(e?.events?.[infl]));

      // Require enough examples both ways
      if (withDays.length < 4 || withoutDays.length < 4) continue;

      for (const sk of symptomKeys) {
        const withVals =
          sk === "mood"
            ? withDays.map(getMoodAs10).filter((n): n is number => typeof n === "number")
            : withDays.map((e) => getNumericSymptom(e, sk)).filter((n): n is number => typeof n === "number");
        const withoutVals =
          sk === "mood"
            ? withoutDays.map(getMoodAs10).filter((n): n is number => typeof n === "number")
            : withoutDays.map((e) => getNumericSymptom(e, sk)).filter((n): n is number => typeof n === "number");

        if (withVals.length < 3 || withoutVals.length < 3) continue;

        const effect = mean(withVals) - mean(withoutVals);
        if (Math.abs(effect) < 0.7) continue; // soft threshold to avoid noisy claims

        candidates.push({
          influence: infl,
          symptomKey: sk,
          symptomLabel: sk === "mood" ? "Mood" : safeLabelForSymptom(sk),
          influenceLabel: HOMEPAGE_INFLUENCE_LABELS[infl] ?? infl,
          effect,
          withN: withVals.length,
          withoutN: withoutVals.length,
        });
      }
    }

    if (candidates.length) {
      // Sort strongest effect first
      candidates.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

      // Rotate daily across the top few so it's not the same one forever.
      const uniqueKeys: RelationshipCandidate[] = [];
      const seen = new Set<string>();
      for (const c of candidates) {
        const k = `${c.influence}|${c.symptomKey}`;
        if (seen.has(k)) continue;
        seen.add(k);
        uniqueKeys.push(c);
      }

      const pickFrom = uniqueKeys.slice(0, 6); // keep rotation small + high quality
      const seed = todayISO.split("-").join("");
      const num = parseInt(seed, 10);
      const idx = Number.isFinite(num) ? num % pickFrom.length : 0;
      relationshipLine = buildRelationshipLine(pickFrom[idx]);
    }
  }

  // If we don't have any enabled symptoms and no mood, always show something reassuring.
  if (!enabled.size && howLines.length === 0) howLines = ["Choose a few things to track and I’ll reflect patterns back to you."];

  return {
    dateISO: todayISO,
    tier,
    rhythmTitle,
    rhythmHeadline,
    rhythmBody,
    howTitle,
    howLines,
    relationshipLine,
  };
}
