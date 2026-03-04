import type { CheckInEntry, ExperimentHistoryItem, InsightMetricKey } from '../types';

function humaniseKey(key: string): string {
  // Turn camelCase / snake_case into "Title case"
  const spaced = key
    .replace(/^custom:/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.length ? (spaced[0].toUpperCase() + spaced.slice(1)) : key;
}

function metricValue(entry: CheckInEntry, key: InsightMetricKey): number | null {
  if (!entry) return null;
  if (key === 'mood') {
    const v = (entry as any).mood;
    return typeof v === 'number' ? v : null;
  }
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const v = (entry as any).customValues?.[id];
    return typeof v === 'number' ? v : null;
  }
  const v = (entry as any).values?.[key as any];
  return typeof v === 'number' ? v : null;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 6) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i] - mx;
    const vy = ys[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  if (!den) return null;
  return num / den;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inRange(iso: string, startISO: string, endISO: string): boolean {
  return iso >= startISO && iso <= endISO;
}

export type RhythmExperimentLearning = {
  kind: 'change' | 'track';
  title: string;
  body: string;
  confidenceHint?: string;
  // For triggered predictions
  leadKey?: InsightMetricKey;
  followKey?: InsightMetricKey;
  lagDays?: number;
  seenCount?: number;
};

export function getExperimentLearnings(entries: CheckInEntry[], history: ExperimentHistoryItem[]): RhythmExperimentLearning[] {
  if (!Array.isArray(entries) || !Array.isArray(history)) return [];
  const sorted = [...entries].filter((e) => e?.dateISO).sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));

  const learnings: RhythmExperimentLearning[] = [];

  for (const h of history) {
    if (!h?.startDateISO || !h?.metrics?.length) continue;
    const kind = h.kind;

    if (kind === 'change') {
      // Compare during vs usual month baseline (median of last 30 days before start)
      const startISO = h.startDateISO;
      const duringStart = startISO;
      const duringEnd = addDaysISO(startISO, Math.max(1, Number(h.durationDays ?? 3)) - 1);
      const baselineEnd = addDaysISO(startISO, -1);
      const baselineStart = addDaysISO(startISO, -30);

      const metrics = h.metrics.slice(0, 3);
      const lines: string[] = [];

      for (const k of metrics) {
        const duringVals: number[] = [];
        const baseVals: number[] = [];

        for (const e of sorted) {
          const iso = (e as any).dateISO;
          if (typeof iso !== 'string') continue;
          const v = metricValue(e, k);
          if (typeof v !== 'number') continue;

          if (inRange(iso, duringStart, duringEnd)) duringVals.push(v);
          if (inRange(iso, baselineStart, baselineEnd)) baseVals.push(v);
        }

        const duringAvg = avg(duringVals);
        const baseMed = median(baseVals);
        if (duringAvg == null || baseMed == null) continue;

        const delta = duringAvg - baseMed;
        const label = humaniseKey(String(k));
        const dir = Math.abs(delta) < 0.4 ? 'about the same' : (delta > 0 ? 'a bit higher' : 'a bit lower');

        lines.push(`${label} was ${dir} during this experiment.`);
      }

      if (lines.length) {
        const status = h.outcome?.status;
        const statusHint =
          status === 'helped' ? 'You rated it as helpful.' :
          status === 'notReally' ? 'You rated it as not really helpful.' :
          status === 'abandoned' ? 'You didn’t manage to run it this time.' :
          undefined;

        learnings.push({
          kind: 'change',
          title: h.title || 'Experiment',
          body: statusHint ? `${statusHint} ${lines[0]}` : lines[0],
          confidenceHint: (typeof h.outcome?.completedAtISO === 'string') ? `Logged for ${h.durationDays} days.` : undefined,
        });
      }

      continue;
    }

    // Tracking: identify best lag between first two metrics
    const m0 = h.metrics[0];
    const m1 = h.metrics[1];
    if (!m0 || !m1) continue;

    // Build day map for last ~90 entries
    const recent = sorted.slice(Math.max(0, sorted.length - 90));
    const byDate = new Map<string, CheckInEntry>();
    for (const e of recent) {
      const iso = (e as any).dateISO;
      if (typeof iso === 'string') byDate.set(iso, e);
    }

    let bestLag = 0;
    let bestCorr: number | null = null;
    let bestN = 0;

    for (let lag = 0; lag <= 3; lag++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [iso, e] of byDate) {
        const iso2 = addDaysISO(iso, lag);
        const e2 = byDate.get(iso2);
        if (!e2) continue;
        const v0 = metricValue(e, m0);
        const v1 = metricValue(e2, m1);
        if (typeof v0 !== 'number' || typeof v1 !== 'number') continue;
        xs.push(v0);
        ys.push(v1);
      }
      const c = pearson(xs, ys);
      if (c == null) continue;
      if (bestCorr == null || c > bestCorr) {
        bestCorr = c;
        bestLag = lag;
        bestN = xs.length;
      }
    }

    if (bestCorr == null || bestN < 6 || bestCorr < 0.35) continue;

    // Count "seen" occurrences: lead high (>=7) then follow high (>=7) within lag window
    let seen = 0;
    for (const [iso, e] of byDate) {
      const vLead = metricValue(e, m0);
      if (typeof vLead !== 'number' || vLead < 7) continue;
      const iso2 = addDaysISO(iso, bestLag);
      const e2 = byDate.get(iso2);
      if (!e2) continue;
      const vFollow = metricValue(e2, m1);
      if (typeof vFollow !== 'number' || vFollow < 7) continue;
      seen += 1;
    }

    const leadLabel = humaniseKey(String(m0));
    const followLabel = humaniseKey(String(m1));
    const lagTxt = bestLag === 0 ? 'around the same time' : `about ${bestLag} day${bestLag === 1 ? '' : 's'} later`;

    learnings.push({
      kind: 'track',
      title: h.title || 'Tracking experiment',
      body: `Tracking suggests ${leadLabel} and ${followLabel} often show up together, with ${followLabel} ${lagTxt}.`,
      confidenceHint: seen ? `Seen ${seen} time${seen === 1 ? '' : 's'} in your logs.` : undefined,
      leadKey: m0,
      followKey: m1,
      lagDays: bestLag,
      seenCount: seen || undefined,
    });
  }

  // Most recent first
  return learnings.slice(0, 6);
}

export function getWhatsComingPredictions(args: {
  entries: CheckInEntry[];
  learnings: RhythmExperimentLearning[];
}): Array<{ text: string; confidenceHint?: string }> {
  const { entries, learnings } = args;
  if (!Array.isArray(entries) || !Array.isArray(learnings)) return [];
  const sorted = [...entries].filter((e) => e?.dateISO).sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
  const last = sorted.slice(-2);

  // Trigger only if the lead symptom is high in the last 2 logged days
  const preds: Array<{ text: string; confidenceHint?: string }> = [];

  for (const l of learnings) {
    if (l.kind !== 'track' || !l.leadKey || !l.followKey || typeof l.lagDays !== 'number') continue;
    const leadHigh = last.some((e) => {
      const v = metricValue(e, l.leadKey!);
      return typeof v === 'number' && v >= 7;
    });
    if (!leadHigh) continue;

    const leadLabel = humaniseKey(String(l.leadKey));
    const followLabel = humaniseKey(String(l.followKey));
    const lag = l.lagDays;
    const window = lag === 0 ? 'around now' : `in the next ${Math.min(3, lag + 1)} day${Math.min(3, lag + 1) === 1 ? '' : 's'}`;

    preds.push({
      text: `Heads up: when ${leadLabel} is high, ${followLabel} often follows ${window}.`,
      confidenceHint: l.seenCount ? `Seen ${l.seenCount} time${l.seenCount === 1 ? '' : 's'} in your logs.` : l.confidenceHint,
    });

    if (preds.length >= 2) break;
  }

  return preds;
}
