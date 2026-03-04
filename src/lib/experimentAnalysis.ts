import type { CheckInEntry, ExperimentPlan, InsightMetricKey, UserData } from '../types';

// IMPORTANT: Keep this return shape aligned with Insights.tsx.
// The UI expects window.beforeStartISO etc.

export type ExperimentMetricComparison = {
  key: InsightMetricKey;

  /** Quick baseline: the N logged days immediately before the experiment */
  recentBefore: { avg: number | null; count: number };

  /** Personal baseline: median across the last baselineDays (excluding experiment window) */
  usual: { median: number | null; count: number };

  during: { avg: number | null; count: number };

  deltaRecent: number | null;
  deltaUsual: number | null;

  hasEnoughRecent: boolean;
  hasEnoughUsual: boolean;
};

export type ExperimentComparisonResult = {
  window: {
    recentBeforeStartISO: string;
    recentBeforeEndISO: string;
    duringStartISO: string;
    duringEndISO: string;

    usualStartISO: string;
    usualEndISO: string;
    usualDaysTarget: number;
  };
  metrics: ExperimentMetricComparison[];
  /** True if at least one metric has enough baseline + during data (either baseline) */
  enoughData: boolean;

  durationDays: number;

  recentBeforeDaysWithAny: number;
  duringDaysWithAny: number;
  usualDaysWithAny: number;
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
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
  const { entries, experiment, maxMetrics = 5, minPointsPerWindow = 3 } = args;

  const startISO = experiment.startDateISO;
  const durationDays = Math.max(1, Number(experiment.durationDays ?? 3));
  const duringStart = startISO;
  const duringEnd = addDaysISO(startISO, durationDays - 1);

  const recentDaysTarget = Math.min(5, Math.max(3, durationDays));

const recentBeforeEnd = addDaysISO(startISO, -1);
const recentBeforeStart = addDaysISO(startISO, -recentDaysTarget);

const usualDaysTarget = 30;
const usualEnd = recentBeforeEnd;
const usualStart = addDaysISO(startISO, -usualDaysTarget);

const metricKeys = (Array.isArray(experiment.metrics) ? experiment.metrics : []).slice(0, maxMetrics);

  const recentBeforeDays = new Set<string>();
  const usualDays = new Set<string>();
  const duringDays = new Set<string>();

  const metrics: ExperimentMetricComparison[] = metricKeys.map((key) => {
    const recentBeforeVals: number[] = [];
    const usualVals: number[] = [];
    const duringVals: number[] = [];

    for (const e of entries) {
      if (!e?.dateISO) continue;
      const v = getMetricValue(e, key);
      if (typeof v !== 'number') continue;

      if (inRange(e.dateISO, usualStart, usualEnd)) {
        usualVals.push(v);
        usualDays.add(e.dateISO);
      }
      if (inRange(e.dateISO, recentBeforeStart, recentBeforeEnd)) {
        recentBeforeVals.push(v);
        recentBeforeDays.add(e.dateISO);
      }
      if (inRange(e.dateISO, duringStart, duringEnd)) {
        duringVals.push(v);
        duringDays.add(e.dateISO);
      }
    }

    const recentBeforeAvg = avg(recentBeforeVals);
    const usualMedian = median(usualVals);
    const duringAvg = avg(duringVals);

    const deltaRecent = (recentBeforeAvg != null && duringAvg != null) ? (duringAvg - recentBeforeAvg) : null;
    const deltaUsual = (usualMedian != null && duringAvg != null) ? (duringAvg - usualMedian) : null;

    const recentBeforeCount = recentBeforeVals.length;
    const usualCount = usualVals.length;
    const duringCount = duringVals.length;

    const hasEnoughRecent = recentBeforeCount >= minPointsPerWindow && duringCount >= minPointsPerWindow;
    const hasEnoughUsual = usualCount >= 10 && duringCount >= minPointsPerWindow;

    return {
      key,
      recentBefore: { avg: recentBeforeAvg, count: recentBeforeCount },
      usual: { median: usualMedian, count: usualCount },
      during: { avg: duringAvg, count: duringCount },
      deltaRecent,
      deltaUsual,
      hasEnoughRecent,
      hasEnoughUsual,
    };
  });


  const enoughData = metrics.some((m) => m.hasEnoughRecent || m.hasEnoughUsual);

  return {
    window: {
      recentBeforeStartISO: recentBeforeStart,
      recentBeforeEndISO: recentBeforeEnd,
      duringStartISO: duringStart,
      duringEndISO: duringEnd,
      usualStartISO: usualStart,
      usualEndISO: usualEnd,
      usualDaysTarget: usualDaysTarget,
    },
    metrics,
    enoughData,
    durationDays,
    recentBeforeDaysWithAny: recentBeforeDays.size,
    duringDaysWithAny: duringDays.size,
    usualDaysWithAny: usualDays.size,
  };
}

export function formatDelta(delta: number, decimals = 1): string {
  const abs = Math.abs(delta);
  const fixed = abs.toFixed(decimals);
  return delta >= 0 ? `+${fixed}` : `-${fixed}`;
}
