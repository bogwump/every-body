import type { CheckInEntry, CyclePhase, InsightMetricKey, UserData } from '../types';
import type { InsightConfidence, InsightSignal } from './insightEngine';
import { computeCycleStats, estimatePhaseByFlow, getCycleStarts, pearsonCorrelation, sortByDateAsc } from './analytics';
import { getTopInsights } from './insightEngine';
import { filterSignalsByPatternFeedback, isSuppressedPair, getResurfacingNoteForPair } from './patternFeedback';

export type PatternRecord = {
  patternId: string;
  firstSeenCycle: number;
  lastSeenCycle: number;
  repeatCount: number;
  confidence: InsightConfidence;
  phaseContext?: string | null;
  seenInCurrentCycle: boolean;
  seenLastCycle: boolean;
};

export type LagPattern = {
  leadKey: InsightMetricKey;
  followKey: InsightMetricKey;
  leadLabel: string;
  followLabel: string;
  lagDays: number;
  score: number;
  n: number;
  direction: 'together' | 'inverse';
  patternId: string;
};

const CONTEXT_MAP: Record<string, string> = {
  'phase:sleep:luteal:higher': 'This often happens when progesterone drops late in the cycle.',
  'phase:sleep:luteal:lower': 'This often happens when progesterone drops late in the cycle.',
  'phase:stress:luteal:higher': 'Hormone shifts around this time can make the body feel a little more stress-sensitive.',
  'phase:brainFog:luteal:higher': 'Hormone shifts around this time can make focus feel a little less steady.',
  'phase:fatigue:luteal:higher': 'Some people notice their energy dips a little as hormone levels change late in the cycle.',
  'pair:stress:brainFog': 'Stress hormones can sometimes affect concentration and mental clarity.',
  'pair:sleep:energy': 'Lower sleep can make it harder for the body to restore energy.',
  'pair:stress:sleep': 'Stress can sometimes make it harder for the body to settle into deeper rest.',
  'pair:sleep:stress': 'Stress can sometimes make it harder for the body to settle into deeper rest.',
  'pair:stress:mood': 'Stress can sometimes make emotional resilience feel a bit thinner.',
  'pair:mood:stress': 'Stress can sometimes make emotional resilience feel a bit thinner.',
  'pair:energy:fatigue': 'Lower energy and fatigue often travel together because the body is trying to conserve more.',
  'pair:brainFog:sleep': 'Poorer sleep can leave the brain feeling less refreshed the next day.',
  'pair:sleep:brainFog': 'Poorer sleep can leave the brain feeling less refreshed the next day.',
  'pair:nightSweats:sleep': 'Night-time temperature shifts can sometimes make sleep feel more broken.',
  'pair:sleep:nightSweats': 'Night-time temperature shifts can sometimes make sleep feel more broken.',
};

function metricLabel(key: InsightMetricKey | string, userData?: UserData): string {
  const k = String(key || '');
  if (k.startsWith('custom:')) {
    const id = k.slice('custom:'.length);
    return userData?.customSymptoms?.find((item) => item.id === id)?.label ?? 'Custom symptom';
  }
  const labels: Record<string, string> = {
    mood: 'Mood', energy: 'Energy', sleep: 'Sleep', pain: 'Pain', headache: 'Headaches', cramps: 'Cramps',
    jointPain: 'Joint pain', flow: 'Bleeding', stress: 'Stress', anxiety: 'Anxiety', irritability: 'Irritability',
    focus: 'Focus', bloating: 'Bloating', digestion: 'Digestion', acidReflux: 'Acid reflux', nausea: 'Nausea',
    hairShedding: 'Hair shedding', facialSpots: 'Facial spots', cysts: 'Cysts', brainFog: 'Brain fog', fatigue: 'Fatigue',
    dizziness: 'Dizziness', appetite: 'Appetite', libido: 'Libido', breastTenderness: 'Breast tenderness',
    hotFlushes: 'Hot flushes', nightSweats: 'Night sweats',
  };
  return labels[k] ?? k;
}

function canonicalPairKey(aKey: InsightMetricKey | string, bKey: InsightMetricKey | string): string {
  return [String(aKey), String(bKey)].sort((a, b) => a.localeCompare(b)).join(':');
}

function metricValue(entry: CheckInEntry, key: InsightMetricKey): number | null {
  if (!entry) return null;
  if (key === 'mood') {
    const v = (entry as any).mood;
    if (v === 1) return 2;
    if (v === 2) return 5;
    if (v === 3) return 8;
    return typeof v === 'number' ? v : null;
  }
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const v = (entry as any).customValues?.[id];
    if (typeof v !== 'number') return null;
    return v > 10 ? Math.round(v / 10) : v;
  }
  const v = (entry as any).values?.[key as any];
  if (typeof v !== 'number') return null;
  return v > 10 ? Math.round(v / 10) : v;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function confidenceRank(confidence: InsightConfidence): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function maxConfidence(a: InsightConfidence, b: InsightConfidence): InsightConfidence {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

function getCycleIndex(dateISO: string, starts: string[]): number {
  if (!starts.length) return 0;
  let idx = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= dateISO) idx = i;
    else break;
  }
  return idx;
}

function cycleBuckets(entries: CheckInEntry[]): Array<{ cycleIndex: number; entries: CheckInEntry[] }> {
  const sorted = sortByDateAsc(entries);
  const starts = getCycleStarts(sorted);
  if (starts.length < 2) return [];
  const buckets = new Map<number, CheckInEntry[]>();
  for (const entry of sorted) {
    if (!entry?.dateISO) continue;
    const cycleIndex = getCycleIndex(String(entry.dateISO), starts);
    const list = buckets.get(cycleIndex) ?? [];
    list.push(entry);
    buckets.set(cycleIndex, list);
  }
  return Array.from(buckets.entries())
    .map(([cycleIndex, bucketEntries]) => ({ cycleIndex, entries: bucketEntries }))
    .filter((item) => item.entries.length >= 4)
    .sort((a, b) => a.cycleIndex - b.cycleIndex);
}

function detectPairInCycle(entries: CheckInEntry[], aKey: InsightMetricKey, bKey: InsightMetricKey, wantedDirection?: 'together' | 'inverse'): boolean {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const entry of entries) {
    const av = metricValue(entry, aKey);
    const bv = metricValue(entry, bKey);
    if (typeof av === 'number' && typeof bv === 'number') {
      xs.push(av);
      ys.push(bv);
    }
  }
  if (xs.length < 4) return false;
  const r = pearsonCorrelation(xs, ys);
  if (!Number.isFinite(r) || Math.abs(r) < 0.4) return false;
  if (wantedDirection === 'together' && r < 0) return false;
  if (wantedDirection === 'inverse' && r > 0) return false;
  return true;
}

function detectPhaseInCycle(entries: CheckInEntry[], allEntries: CheckInEntry[], metric: InsightMetricKey, phase: string | null | undefined, direction?: 'higher' | 'lower' | 'together' | 'inverse'): boolean {
  if (!phase || (direction !== 'higher' && direction !== 'lower')) return false;
  const phaseVals: number[] = [];
  const allVals: number[] = [];
  for (const entry of entries) {
    const val = metricValue(entry, metric);
    if (typeof val !== 'number') continue;
    allVals.push(val);
    const p = estimatePhaseByFlow(String(entry.dateISO), allEntries);
    if (p === phase) phaseVals.push(val);
  }
  if (phaseVals.length < 2 || allVals.length < 4) return false;
  const delta = mean(phaseVals) - mean(allVals);
  if (Math.abs(delta) < 0.7) return false;
  return direction === 'higher' ? delta > 0 : delta < 0;
}

function detectLagPattern(entries: CheckInEntry[], aKey: InsightMetricKey, bKey: InsightMetricKey, userData?: UserData): LagPattern | null {
  const sorted = sortByDateAsc(entries);
  const candidates: LagPattern[] = [];
  const pairKey = canonicalPairKey(aKey, bKey);
  const aLabel = metricLabel(aKey, userData);
  const bLabel = metricLabel(bKey, userData);

  for (const lag of [1, 2]) {
    const xsAB: number[] = [];
    const ysAB: number[] = [];
    for (let i = 0; i + lag < sorted.length; i++) {
      const av = metricValue(sorted[i], aKey);
      const bv = metricValue(sorted[i + lag], bKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        xsAB.push(av);
        ysAB.push(bv);
      }
    }
    if (xsAB.length >= 6) {
      const r = pearsonCorrelation(xsAB, ysAB);
      if (Number.isFinite(r) && Math.abs(r) >= 0.5) {
        candidates.push({
          leadKey: aKey,
          followKey: bKey,
          leadLabel: aLabel,
          followLabel: bLabel,
          lagDays: lag,
          score: Math.abs(r),
          n: xsAB.length,
          direction: r >= 0 ? 'together' : 'inverse',
          patternId: `lag:${pairKey}:${String(aKey)}:${String(bKey)}:${lag}`,
        });
      }
    }

    const xsBA: number[] = [];
    const ysBA: number[] = [];
    for (let i = 0; i + lag < sorted.length; i++) {
      const bv = metricValue(sorted[i], bKey);
      const av = metricValue(sorted[i + lag], aKey);
      if (typeof bv === 'number' && typeof av === 'number') {
        xsBA.push(bv);
        ysBA.push(av);
      }
    }
    if (xsBA.length >= 6) {
      const r = pearsonCorrelation(xsBA, ysBA);
      if (Number.isFinite(r) && Math.abs(r) >= 0.5) {
        candidates.push({
          leadKey: bKey,
          followKey: aKey,
          leadLabel: bLabel,
          followLabel: aLabel,
          lagDays: lag,
          score: Math.abs(r),
          n: xsBA.length,
          direction: r >= 0 ? 'together' : 'inverse',
          patternId: `lag:${pairKey}:${String(bKey)}:${String(aKey)}:${lag}`,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || b.n - a.n)[0] ?? null;
}

export function getPatternContextForSignal(signal: {
  id?: string;
  type?: string;
  metrics?: Array<string | InsightMetricKey>;
  phase?: string | null;
  direction?: string;
  confidence?: InsightConfidence;
}): string | null {
  if (!signal) return null;
  const confidence = signal.confidence ?? 'low';
  if (confidence === 'low') return null;
  const metrics = Array.isArray(signal.metrics) ? signal.metrics.map(String) : [];
  const pairKey = metrics.length >= 2 ? `pair:${canonicalPairKey(metrics[0], metrics[1]).replace(/:/g, ':')}` : null;
  const specificPairKeys = metrics.length >= 2
    ? [`pair:${metrics[0]}:${metrics[1]}`, `pair:${metrics[1]}:${metrics[0]}`, `pair:${canonicalPairKey(metrics[0], metrics[1]).replace(':', ':')}`]
    : [];
  if (signal.type === 'phase_shift' && metrics[0] && signal.phase && signal.direction) {
    const key = `phase:${metrics[0]}:${String(signal.phase).toLowerCase()}:${String(signal.direction)}`;
    return CONTEXT_MAP[key] ?? null;
  }
  for (const key of specificPairKeys) {
    if (CONTEXT_MAP[key]) return CONTEXT_MAP[key];
  }
  if (pairKey && CONTEXT_MAP[pairKey]) return CONTEXT_MAP[pairKey];
  return null;
}

export function buildPatternMemory(entries: CheckInEntry[], userData: UserData): Record<string, PatternRecord> {
  const sorted = sortByDateAsc(entries);
  const cycles = cycleBuckets(sorted);
  if (cycles.length < 2) return {};
  const currentCycleIndex = cycles[cycles.length - 1]?.cycleIndex ?? 0;
  const latestSignals = filterSignalsByPatternFeedback(getTopInsights(sorted, userData, 10));
  const records = new Map<string, PatternRecord>();

  const upsert = (patternId: string, cycleIndex: number, confidence: InsightConfidence, phaseContext?: string | null) => {
    const existing = records.get(patternId);
    if (!existing) {
      records.set(patternId, {
        patternId,
        firstSeenCycle: cycleIndex,
        lastSeenCycle: cycleIndex,
        repeatCount: 1,
        confidence,
        phaseContext: phaseContext ?? null,
        seenInCurrentCycle: cycleIndex === currentCycleIndex,
        seenLastCycle: cycleIndex === currentCycleIndex - 1,
      });
      return;
    }
    if (existing.lastSeenCycle !== cycleIndex) {
      existing.repeatCount += 1;
      existing.lastSeenCycle = cycleIndex;
      existing.confidence = maxConfidence(existing.confidence, confidence);
      existing.seenInCurrentCycle = existing.seenInCurrentCycle || cycleIndex === currentCycleIndex;
      existing.seenLastCycle = existing.seenLastCycle || cycleIndex === currentCycleIndex - 1;
    }
  };

  for (const signal of latestSignals) {
    if (signal.confidence === 'low') continue;
    if (signal.type === 'metric_pair' && signal.metrics.length >= 2) {
      const [aKey, bKey] = signal.metrics;
      const patternId = `pair:${canonicalPairKey(aKey, bKey)}:${signal.direction ?? 'together'}`;
      for (const cycle of cycles) {
        if (detectPairInCycle(cycle.entries, aKey, bKey, signal.direction === 'inverse' ? 'inverse' : 'together')) {
          upsert(patternId, cycle.cycleIndex, signal.confidence, signal.phase ?? null);
        }
      }
    }
    if (signal.type === 'phase_shift' && signal.metrics[0]) {
      const patternId = `phase:${String(signal.metrics[0])}:${String(signal.phase ?? '').toLowerCase()}:${signal.direction ?? 'higher'}`;
      for (const cycle of cycles) {
        if (detectPhaseInCycle(cycle.entries, sorted, signal.metrics[0], signal.phase, signal.direction)) {
          upsert(patternId, cycle.cycleIndex, signal.confidence, signal.phase ?? null);
        }
      }
    }
  }

  return Object.fromEntries(records.entries());
}

export function getRepeatPatternLine(record?: PatternRecord | null): string | null {
  if (!record || record.repeatCount < 2) return null;
  if (record.repeatCount >= 4) return 'This seems to be a consistent pattern for your body.';
  if (record.repeatCount >= 3) return 'This pattern has shown up across several cycles.';
  if (record.seenLastCycle) return 'This appeared last cycle too.';
  return 'This pattern has shown up before too.';
}

export function getPatternRecordForSignal(signal: InsightSignal, memory: Record<string, PatternRecord>): PatternRecord | null {
  if (signal.type === 'metric_pair' && signal.metrics.length >= 2) {
    const key = `pair:${canonicalPairKey(signal.metrics[0], signal.metrics[1])}:${signal.direction ?? 'together'}`;
    return memory[key] ?? null;
  }
  if (signal.type === 'phase_shift' && signal.metrics[0]) {
    const key = `phase:${String(signal.metrics[0])}:${String(signal.phase ?? '').toLowerCase()}:${signal.direction ?? 'higher'}`;
    return memory[key] ?? null;
  }
  return null;
}

export function getStrongestLagPattern(entries: CheckInEntry[], pairs: Array<{ aKey: InsightMetricKey; bKey: InsightMetricKey }>, userData?: UserData): LagPattern | null {
  const candidates = pairs
    .filter((pair) => !isSuppressedPair(pair.aKey, pair.bKey))
    .map((pair) => detectLagPattern(entries, pair.aKey, pair.bKey, userData))
    .filter((item): item is LagPattern => Boolean(item));
  return candidates.sort((a, b) => b.score - a.score || b.n - a.n)[0] ?? null;
}

export function getLagPatternForPair(entries: CheckInEntry[], aKey: InsightMetricKey, bKey: InsightMetricKey, userData?: UserData): LagPattern | null {
  const found = detectLagPattern(entries, aKey, bKey, userData);
  if (!found) return null;
  return isSuppressedPair(aKey, bKey, found.score) ? null : { ...found, resurfacingNote: getResurfacingNoteForPair(aKey, bKey, found.score) as any };
}

export function getPatternRecordForLag(lag: LagPattern | null, memory: Record<string, PatternRecord>): PatternRecord | null {
  if (!lag) return null;
  const key = `pair:${canonicalPairKey(lag.leadKey, lag.followKey)}:${lag.direction}`;
  return memory[key] ?? null;
}

export function getWeeklyPatternReflection(entries: CheckInEntry[], userData: UserData): { lines: string[]; repeatLine?: string | null } {
  const sorted = sortByDateAsc(entries);
  const week = sorted.slice(-7);
  const memory = buildPatternMemory(sorted, userData);
  const topSignals = getTopInsights(week.length >= 5 ? week : sorted, userData, 5).filter((signal) => signal.confidence !== 'low');
  const lines: string[] = [];
  let repeatLine: string | null = null;

  for (const signal of topSignals) {
    if (signal.type === 'weekday_pattern') continue;
    const labels = signal.metrics.map((metric) => metricLabel(metric, userData));
    if (signal.type === 'metric_pair' && labels.length >= 2) {
      lines.push(`${labels[0].toLowerCase()} and ${labels[1].toLowerCase()} moved together.`);
    } else if (signal.type === 'phase_shift' && labels[0]) {
      lines.push(`${labels[0].toLowerCase()} stood out more than usual.`);
    } else if (signal.type === 'trend_shift' && labels[0]) {
      lines.push(`${labels[0].toLowerCase()} shifted over the week.`);
    }
    const repeat = getRepeatPatternLine(getPatternRecordForSignal(signal, memory));
    if (!repeatLine && repeat) repeatLine = repeat;
    if (lines.length >= 2) break;
  }

  if (!lines.length) lines.push('Patterns are becoming clearer.');
  return { lines: lines.slice(0, 2), repeatLine };
}

export function getCycleAwarePredictionLines(args: {
  entries: CheckInEntry[];
  userData: UserData;
  phase: CyclePhase | null;
  heroSignals: InsightSignal[];
  strongSignals: InsightSignal[];
  existingLines?: string[];
}): string[] {
  const { entries, userData, phase, heroSignals, strongSignals, existingLines = [] } = args;
  const lines = existingLines.filter(Boolean);
  const memory = buildPatternMemory(entries, userData);
  const strongestLag = getStrongestLagPattern(entries, strongSignals.filter((s) => s.type === 'metric_pair').map((s) => ({ aKey: s.metrics[0], bKey: s.metrics[1] })), userData);

  if (strongestLag && strongestLag.score >= 0.55) {
    const base = strongestLag.direction === 'inverse'
      ? `When ${strongestLag.leadLabel.toLowerCase()} rises, ${strongestLag.followLabel.toLowerCase()} can dip ${strongestLag.lagDays === 1 ? 'the next day' : `about ${strongestLag.lagDays} days later`}.`
      : `${strongestLag.leadLabel} can be followed by ${strongestLag.followLabel.toLowerCase()} ${strongestLag.lagDays === 1 ? 'the next day' : `about ${strongestLag.lagDays} days later`}.`;
    lines.push(base);
  }

  for (const signal of [...strongSignals, ...heroSignals]) {
    const context = getPatternContextForSignal(signal);
    const repeat = getRepeatPatternLine(getPatternRecordForSignal(signal, memory));
    if (context && !lines.includes(context)) lines.push(context);
    if (repeat && !lines.includes(repeat)) lines.push(repeat);
    if (lines.length >= 3) break;
  }

  const cycleStats = computeCycleStats(entries);
  if (phase === 'Luteal' && cycleStats.predictedNextStartISO && !lines.some((line) => line.includes('next start'))) {
    lines.push('Some people notice a little more sensitivity as the next bleed gets closer.');
  }

  return Array.from(new Set(lines)).slice(0, 3);
}

export function getResurfacingPatternMoment(entries: CheckInEntry[], userData: UserData): { key: string; title: string; body: string } | null {
  const memory = buildPatternMemory(entries, userData);
  const topSignals = getTopInsights(entries, userData, 6).filter((signal) => signal.confidence !== 'low');
  for (const signal of topSignals) {
    const record = getPatternRecordForSignal(signal, memory);
    const repeat = getRepeatPatternLine(record);
    if (!record || !repeat || !record.seenInCurrentCycle || record.repeatCount < 2) continue;
    const labels = signal.metrics.map((metric) => metricLabel(metric, userData));
    const title = signal.type === 'metric_pair' && labels.length >= 2
      ? `${labels[0]} and ${labels[1]} showed up again`
      : `${labels[0] ?? 'A pattern'} showed up again`;
    return {
      key: `${record.patternId}:${record.lastSeenCycle}`,
      title,
      body: repeat,
    };
  }
  return null;
}
