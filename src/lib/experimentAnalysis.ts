import type { CheckInEntry, ExperimentPlan, InsightMetricKey, UserData } from '../types';

// IMPORTANT: Keep this return shape aligned with Insights.tsx.
// The UI expects window.beforeStartISO etc.

export type ExperimentMetricComparison = {
  key: InsightMetricKey;
  before: { avg: number | null; count: number };
  during: { avg: number | null; count: number };
  delta: number | null;
  hasEnoughData: boolean;
};

export type ExperimentComparisonResult = {
  // Baseline A: immediate pre-window (quick check)
  window: {
    beforeStartISO: string;
    beforeEndISO: string;
    duringStartISO: string;
    duringEndISO: string;
  };
  metrics: ExperimentMetricComparison[];
  /** True if at least one metric has enough baseline + during data */
  enoughData: boolean;
  /** How many days are included in each window */
  durationDays: number;
  /** Count of unique days (not points) with any selected metric logged */
  beforeDaysWithAny: number;
  duringDaysWithAny: number;

  // Baseline B: rolling personal baseline (more meaningful)
  // Present only when there is enough history to be trustworthy.
  usual?: {
    window: {
      /** Earliest included baseline day (from the rolling set) */
      beforeStartISO: string;
      /** Latest included baseline day (from the rolling set) */
      beforeEndISO: string;
      duringStartISO: string;
      duringEndISO: string;
    };
    metrics: ExperimentMetricComparison[];
    enoughData: boolean;
    durationDays: number;
    beforeDaysWithAny: number;
    duringDaysWithAny: number;
    /** Target window length in days (rolling) */
    baselineDaysTarget: number;
    /** Unique baseline days actually used */
    baselineDaysUsed: number;
    /** Summary of how the baseline is computed */
    method: 'median' | 'trimmedMean';
  };
};

function parseISO(iso: string): Date | null {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = iso.split('-').map((s) => Number(s));
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function isoFromUTCDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(iso: string, days: number): string {
  const dt = parseISO(iso);
  if (!dt) return iso;
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoFromUTCDate(dt);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function getMetricValue(entry: CheckInEntry, key: InsightMetricKey): number | null {
  if (!entry) return null;
  if (key === 'mood') {
    const v = entry.mood;
    return typeof v === 'number' ? v : null;
  }
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const v = entry.customValues?.[id];
    return typeof v === 'number' ? v : null;
  }
  // SymptomKey lives in entry.values 0–10
  const v = (entry.values as any)?.[key as any];
  return typeof v === 'number' ? v : null;
}

function inRange(iso: string, startISO: string, endISO: string): boolean {
  return iso >= startISO && iso <= endISO;
}

export function computeExperimentComparison(args: {
  entries: CheckInEntry[];
  experiment: ExperimentPlan;
  user: UserData;
  maxMetrics?: number;
  minPointsPerWindow?: number;
  // Baseline B settings
  usualBaselineDays?: number; // default 30
  minDaysForUsualBaseline?: number; // default 10
  usualMethod?: 'median' | 'trimmedMean'; // default 'median'
}): ExperimentComparisonResult {
  const {
    entries,
    experiment,
    maxMetrics = 5,
    minPointsPerWindow = 3,
    usualBaselineDays = 30,
    minDaysForUsualBaseline = 10,
    usualMethod = 'median',
  } = args;

  const startISO = experiment.startDateISO;
  const durationDays = Math.max(1, Number(experiment.durationDays ?? 3));
  const duringStart = startISO;
  const duringEnd = addDaysISO(startISO, durationDays - 1);

  // Baseline A (quick check): immediately before the window, same length as the experiment.
  const baselineEnd = addDaysISO(startISO, -1);
  const baselineStart = addDaysISO(startISO, -durationDays);

  const metricKeys = (Array.isArray(experiment.metrics) ? experiment.metrics : []).slice(0, maxMetrics);

  const beforeDays = new Set<string>();
  const duringDays = new Set<string>();

  const metrics: ExperimentMetricComparison[] = metricKeys.map((key) => {
    const beforeVals: number[] = [];
    const duringVals: number[] = [];

    for (const e of entries) {
      if (!e?.dateISO) continue;
      const v = getMetricValue(e, key);
      if (typeof v !== 'number') continue;

      if (inRange(e.dateISO, baselineStart, baselineEnd)) {
        beforeVals.push(v);
        beforeDays.add(e.dateISO);
      }
      if (inRange(e.dateISO, duringStart, duringEnd)) {
        duringVals.push(v);
        duringDays.add(e.dateISO);
      }
    }

    const beforeAvg = avg(beforeVals);
    const duringAvg = avg(duringVals);
    const delta = beforeAvg != null && duringAvg != null ? duringAvg - beforeAvg : null;

    const beforeCount = beforeVals.length;
    const duringCount = duringVals.length;
    const hasEnoughData = beforeCount >= minPointsPerWindow && duringCount >= minPointsPerWindow;

    return {
      key,
      before: { avg: beforeAvg, count: beforeCount },
      during: { avg: duringAvg, count: duringCount },
      delta,
      hasEnoughData,
    };
  });

  const enoughData = metrics.some((m) => m.hasEnoughData);

  const result: ExperimentComparisonResult = {
    window: {
      beforeStartISO: baselineStart,
      beforeEndISO: baselineEnd,
      duringStartISO: duringStart,
      duringEndISO: duringEnd,
    },
    metrics,
    enoughData,
    durationDays,
    beforeDaysWithAny: beforeDays.size,
    duringDaysWithAny: duringDays.size,
  };

  // Baseline B (usual pattern): last N *logged* days before the experiment, excluding experiment days.
  // Only shown when there is enough history to be meaningful.
  try {
    const sorted = (Array.isArray(entries) ? entries : [])
      .filter((e) => typeof e?.dateISO === 'string')
      .slice()
      .sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));

    // Collect unique candidate days BEFORE the experiment start that have at least one selected metric point.
    const candidateDays: string[] = [];
    const seen = new Set<string>();

    for (let i = sorted.length - 1; i >= 0; i--) {
      const e = sorted[i];
      const d = String(e.dateISO);
      if (d >= duringStart) continue; // only before
      if (seen.has(d)) continue;

      let hasAny = false;
      for (const key of metricKeys) {
        const v = getMetricValue(e, key);
        if (typeof v === 'number') {
          hasAny = true;
          break;
        }
      }

      if (hasAny) {
        candidateDays.push(d);
        seen.add(d);
      }

      if (candidateDays.length >= usualBaselineDays) break;
    }

    const baselineDaysUsed = candidateDays.length;

    if (baselineDaysUsed >= minDaysForUsualBaseline && metricKeys.length) {
      const daySet = new Set(candidateDays);
      const baselineFromISO = candidateDays[candidateDays.length - 1]; // oldest in the collected list
      const baselineToISO = candidateDays[0]; // newest

      const usualBeforeDays = new Set<string>();
      const usualDuringDays = new Set<string>();

      const usualMetrics: ExperimentMetricComparison[] = metricKeys.map((key) => {
        const beforeVals: number[] = [];
        const duringVals: number[] = [];

        for (const e of sorted) {
          const d = String(e.dateISO);
          const v = getMetricValue(e, key);
          if (typeof v !== 'number') continue;

          if (daySet.has(d)) {
            beforeVals.push(v);
            usualBeforeDays.add(d);
          }
          if (inRange(d, duringStart, duringEnd)) {
            duringVals.push(v);
            usualDuringDays.add(d);
          }
        }

        const beforeAvg = (usualMethod === 'median') ? median(beforeVals) : avg(beforeVals);
        const duringAvg = avg(duringVals);
        const delta = beforeAvg != null && duringAvg != null ? duringAvg - beforeAvg : null;

        const beforeCount = beforeVals.length;
        const duringCount = duringVals.length;

        // For the usual baseline, require enough baseline points AND enough during points.
        const hasEnoughData = beforeCount >= minPointsPerWindow && duringCount >= minPointsPerWindow;

        return {
          key,
          before: { avg: beforeAvg, count: beforeCount },
          during: { avg: duringAvg, count: duringCount },
          delta,
          hasEnoughData,
        };
      });

      const usualEnough = usualMetrics.some((m) => m.hasEnoughData);

      result.usual = {
        window: {
          beforeStartISO: baselineFromISO,
          beforeEndISO: baselineToISO,
          duringStartISO: duringStart,
          duringEndISO: duringEnd,
        },
        metrics: usualMetrics,
        enoughData: usualEnough,
        durationDays,
        beforeDaysWithAny: usualBeforeDays.size,
        duringDaysWithAny: usualDuringDays.size,
        baselineDaysTarget: usualBaselineDays,
        baselineDaysUsed,
        method: usualMethod,
      };
    }
  } catch {
    // ignore
  }

  return result;
}
export function formatDelta(delta: number, decimals = 1): string {
  const abs = Math.abs(delta);
  const fixed = abs.toFixed(decimals);
  return delta >= 0 ? `+${fixed}` : `-${fixed}`;
}
