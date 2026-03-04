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
}): ExperimentComparisonResult {
  const { entries, experiment, maxMetrics = 5, minPointsPerWindow = 2 } = args;

  const startISO = experiment.startDateISO;
  const durationDays = Math.max(1, Number(experiment.durationDays ?? 3));
  const duringStart = startISO;
  const duringEnd = addDaysISO(startISO, durationDays - 1);

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
    const delta = (beforeAvg != null && duringAvg != null) ? (duringAvg - beforeAvg) : null;

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

  return {
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
}

export function formatDelta(delta: number, decimals = 1): string {
  const abs = Math.abs(delta);
  const fixed = abs.toFixed(decimals);
  return delta >= 0 ? `+${fixed}` : `-${fixed}`;
}
