import type { CheckInEntry, InsightMetricKey, UserData } from '../types';
import type { InsightSignal } from './insightEngine';
import { getCycleStarts, getRhythmModel, sortByDateAsc } from './analytics';
import { isoTodayLocal } from './date';
import { getMetricPolarity } from './metricSemantics';
import { buildPatternMemory, getLagPatternForPair, getPatternRecordForSignal } from './patternIntelligence';

export type PairPatternState =
  | 'live_cluster'
  | 'upcoming_cluster'
  | 'passed_cluster'
  | 'stable_recurring_grouping'
  | 'unclear_interesting';

export type PairPatternReason =
  | 'active_now'
  | 'recent_activity'
  | 'approaching_window'
  | 'window_passed'
  | 'recurs_across_cycles'
  | 'lead_symptom_detected'
  | 'weak_repeat_evidence'
  | 'limited_cycle_timing'
  | 'phase_supports_pattern';

export type PairPatternStateResult = {
  state: PairPatternState;
  reasons: PairPatternReason[];
  repeatCount: number;
  currentPhaseKey: string | null;
  currentDayInCycle: number | null;
  likelyWindowDay: number | null;
  likelyWindowSpreadDays: number | null;
  daysUntilLikelyWindow: number | null;
  daysSinceLikelyWindow: number | null;
  isMetricAActiveNow: boolean;
  isMetricBActiveNow: boolean;
  isMetricARecent: boolean;
  isMetricBRecent: boolean;
  hasLeadSymptomLandedThisCycle: boolean;
  leadMetric: InsightMetricKey | null;
  followMetric: InsightMetricKey | null;
  leadConfidence: 'low' | 'medium' | 'high' | null;
  recurringScore: number;
  timingConfidence: 'low' | 'medium' | 'high';
};

type CycleActivation = {
  cycleIndex: number;
  firstADay: number | null;
  firstBDay: number | null;
  earliestPairDay: number | null;
  bothActive: boolean;
};

const ACTIVE_WINDOW_DAYS = 3;
const UPCOMING_WINDOW_DAYS = 4;
const PASSED_WINDOW_BUFFER_DAYS = 1;
const PAIR_LINK_WINDOW_DAYS = 6;

function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((to - from) / 86400000);
}

function normaliseMetricValue(entry: CheckInEntry, key: InsightMetricKey): number | null {
  if (!entry) return null;
  if (key === 'mood') {
    const mood = (entry as any).mood;
    if (mood === 1) return 2;
    if (mood === 2) return 5;
    if (mood === 3) return 8;
    return typeof mood === 'number' ? mood : null;
  }
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const customId = key.slice('custom:'.length);
    const raw = (entry as any).customValues?.[customId];
    if (typeof raw !== 'number') return null;
    return raw > 10 ? Math.round(raw / 10) : raw;
  }
  const raw = (entry as any).values?.[key as any];
  if (typeof raw !== 'number') return null;
  return raw > 10 ? Math.round(raw / 10) : raw;
}

function isMetricElevated(entry: CheckInEntry, key: InsightMetricKey): boolean {
  const value = normaliseMetricValue(entry, key);
  if (value == null) return false;
  const polarity = getMetricPolarity(key);
  if (polarity === 'positive') return value <= 4;
  if (polarity === 'burden') return value >= 6;
  return value >= 6;
}


function getCycleActivations(entries: CheckInEntry[], aKey: InsightMetricKey, bKey: InsightMetricKey): CycleActivation[] {
  const sorted = sortByDateAsc(entries);
  const starts = getCycleStarts(sorted);
  if (!starts.length) return [];

  const activations = new Map<number, CycleActivation>();

  for (const entry of sorted) {
    const dateISO = String(entry?.dateISO || '');
    if (!dateISO) continue;
    let cycleIndex = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (starts[i] <= dateISO) cycleIndex = i;
      else break;
    }
    const startISO = starts[cycleIndex];
    if (!startISO) continue;
    const dayInCycle = Math.max(1, daysBetweenISO(startISO, dateISO) + 1);
    const record = activations.get(cycleIndex) ?? {
      cycleIndex,
      firstADay: null,
      firstBDay: null,
      earliestPairDay: null,
      bothActive: false,
    };
    if (isMetricElevated(entry, aKey) && record.firstADay == null) record.firstADay = dayInCycle;
    if (isMetricElevated(entry, bKey) && record.firstBDay == null) record.firstBDay = dayInCycle;
    if (record.firstADay != null && record.firstBDay != null) {
      const gap = Math.abs(record.firstADay - record.firstBDay);
      if (gap <= PAIR_LINK_WINDOW_DAYS) {
        record.bothActive = true;
        record.earliestPairDay = Math.min(record.firstADay, record.firstBDay);
      }
    }
    activations.set(cycleIndex, record);
  }

  return Array.from(activations.values()).sort((a, b) => a.cycleIndex - b.cycleIndex);
}

function getMedian(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function getWindowSpread(values: number[]): number | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0];
}

function getLeadMetricFromActivations(activations: CycleActivation[], aKey: InsightMetricKey, bKey: InsightMetricKey): {
  leadMetric: InsightMetricKey | null;
  followMetric: InsightMetricKey | null;
  confidence: 'low' | 'medium' | 'high' | null;
} {
  const comparable = activations.filter((item) => item.firstADay != null && item.firstBDay != null && item.bothActive);
  if (comparable.length < 2) return { leadMetric: null, followMetric: null, confidence: null };
  let aLeadCount = 0;
  let bLeadCount = 0;
  let tiedCount = 0;
  for (const item of comparable) {
    if (item.firstADay! < item.firstBDay!) aLeadCount += 1;
    else if (item.firstBDay! < item.firstADay!) bLeadCount += 1;
    else tiedCount += 1;
  }
  const decisive = aLeadCount + bLeadCount;
  if (decisive < 2) return { leadMetric: null, followMetric: null, confidence: null };
  const winnerCount = Math.max(aLeadCount, bLeadCount);
  const ratio = winnerCount / decisive;
  if (ratio < 0.66) return { leadMetric: null, followMetric: null, confidence: 'low' };
  const leadMetric = aLeadCount > bLeadCount ? aKey : bKey;
  const followMetric = aLeadCount > bLeadCount ? bKey : aKey;
  const confidence = ratio >= 0.85 && decisive >= 3 ? 'high' : 'medium';
  void tiedCount;
  return { leadMetric, followMetric, confidence };
}

function getTimingConfidence(repeatCount: number, windowSpread: number | null, leadConfidence: 'low' | 'medium' | 'high' | null): 'low' | 'medium' | 'high' {
  if (repeatCount >= 3 && (windowSpread == null || windowSpread <= 3) && (leadConfidence === 'high' || leadConfidence === 'medium')) return 'high';
  if (repeatCount >= 2 && (windowSpread == null || windowSpread <= 6)) return 'medium';
  return 'low';
}

function getRecentSlice(entries: CheckInEntry[], todayISO: string, days: number): CheckInEntry[] {
  return sortByDateAsc(entries).filter((entry) => {
    const dateISO = String(entry?.dateISO || '');
    return dateISO && daysBetweenISO(dateISO, todayISO) >= 0 && daysBetweenISO(dateISO, todayISO) < days;
  });
}

function calculateRecurringScore(args: {
  repeatCount: number;
  likelyWindowSpreadDays: number | null;
  leadConfidence: 'low' | 'medium' | 'high' | null;
  lagCorrelation: number | null;
}): number {
  const repeatBoost = Math.min(45, args.repeatCount * 12);
  const timingBoost = args.likelyWindowSpreadDays == null ? 6 : Math.max(0, 18 - args.likelyWindowSpreadDays * 3);
  const leadBoost = args.leadConfidence === 'high' ? 14 : args.leadConfidence === 'medium' ? 8 : 0;
  const lagBoost = args.lagCorrelation != null ? Math.round(Math.abs(args.lagCorrelation) * 20) : 0;
  return repeatBoost + timingBoost + leadBoost + lagBoost;
}

export function classifyPatternStateForPairKeys(args: {
  entries: CheckInEntry[];
  userData: UserData;
  metricA: InsightMetricKey;
  metricB: InsightMetricKey;
  signal?: InsightSignal | null;
  todayISO?: string;
}): PairPatternStateResult {
  const { entries, userData, metricA, metricB, signal = null, todayISO = isoTodayLocal() } = args;
  const sorted = sortByDateAsc(entries);
  const rhythm = getRhythmModel(sorted, userData, todayISO);
  const memory = buildPatternMemory(sorted, userData);
  const patternRecord = signal ? getPatternRecordForSignal(signal, memory) : null;
  const activations = getCycleActivations(sorted, metricA, metricB);
  const pairCycles = activations.filter((item) => item.bothActive && item.earliestPairDay != null);
  const likelyWindowValues = pairCycles.map((item) => item.earliestPairDay!).filter((value) => Number.isFinite(value));
  const likelyWindowDay = getMedian(likelyWindowValues);
  const likelyWindowSpreadDays = getWindowSpread(likelyWindowValues);
  const lead = getLeadMetricFromActivations(pairCycles, metricA, metricB);
  const lagPattern = getLagPatternForPair(sorted, metricA, metricB, userData);

  const recentEntries = getRecentSlice(sorted, todayISO, ACTIVE_WINDOW_DAYS);
  const isMetricAActiveNow = recentEntries.some((entry) => isMetricElevated(entry, metricA));
  const isMetricBActiveNow = recentEntries.some((entry) => isMetricElevated(entry, metricB));
  const isMetricARecent = getRecentSlice(sorted, todayISO, 7).some((entry) => isMetricElevated(entry, metricA));
  const isMetricBRecent = getRecentSlice(sorted, todayISO, 7).some((entry) => isMetricElevated(entry, metricB));

  const currentCycleStart = rhythm.starts.length ? rhythm.starts[rhythm.starts.length - 1] : null;
  const currentCycleEntries = currentCycleStart ? sorted.filter((entry) => String(entry?.dateISO || '') >= currentCycleStart) : [];
  const leadMetricToCheck = lead.leadMetric ?? metricA;
  const hasLeadSymptomLandedThisCycle = currentCycleEntries.some((entry) => isMetricElevated(entry, leadMetricToCheck));

  const daysUntilLikelyWindow = rhythm.dayInCycle != null && likelyWindowDay != null ? likelyWindowDay - rhythm.dayInCycle : null;
  const daysSinceLikelyWindow = rhythm.dayInCycle != null && likelyWindowDay != null ? rhythm.dayInCycle - likelyWindowDay : null;
  const repeatCount = Math.max(patternRecord?.repeatCount ?? 0, pairCycles.length);
  const timingConfidence = getTimingConfidence(repeatCount, likelyWindowSpreadDays, lead.confidence);
  const recurringScore = calculateRecurringScore({
    repeatCount,
    likelyWindowSpreadDays,
    leadConfidence: lead.confidence,
    lagCorrelation: lagPattern ? lagPattern.score : null,
  });

  const reasons: PairPatternReason[] = [];
  let state: PairPatternState = 'unclear_interesting';

  if (isMetricAActiveNow && isMetricBActiveNow) {
    state = 'live_cluster';
    reasons.push('active_now');
  } else if ((isMetricARecent || isMetricBRecent) && daysSinceLikelyWindow != null && daysSinceLikelyWindow >= -1 && daysSinceLikelyWindow <= 2) {
    state = 'live_cluster';
    reasons.push('recent_activity');
  } else if (
    likelyWindowDay != null
    && rhythm.dayInCycle != null
    && daysUntilLikelyWindow != null
    && daysUntilLikelyWindow >= 0
    && daysUntilLikelyWindow <= UPCOMING_WINDOW_DAYS
    && !hasLeadSymptomLandedThisCycle
  ) {
    state = 'upcoming_cluster';
    reasons.push('approaching_window');
  } else if (
    likelyWindowDay != null
    && rhythm.dayInCycle != null
    && daysSinceLikelyWindow != null
    && daysSinceLikelyWindow > PASSED_WINDOW_BUFFER_DAYS
    && !isMetricARecent
    && !isMetricBRecent
    && repeatCount >= 2
  ) {
    state = 'passed_cluster';
    reasons.push('window_passed');
  } else if (repeatCount >= 3 || recurringScore >= 45) {
    state = 'stable_recurring_grouping';
    reasons.push('recurs_across_cycles');
  } else {
    state = 'unclear_interesting';
    reasons.push('weak_repeat_evidence');
  }

  if (lead.leadMetric) reasons.push('lead_symptom_detected');
  if (timingConfidence === 'low') reasons.push('limited_cycle_timing');
  if (signal?.phase || rhythm.phaseKey) reasons.push('phase_supports_pattern');

  return {
    state,
    reasons: Array.from(new Set(reasons)),
    repeatCount,
    currentPhaseKey: rhythm.phaseKey ?? null,
    currentDayInCycle: rhythm.dayInCycle ?? null,
    likelyWindowDay,
    likelyWindowSpreadDays,
    daysUntilLikelyWindow,
    daysSinceLikelyWindow,
    isMetricAActiveNow,
    isMetricBActiveNow,
    isMetricARecent,
    isMetricBRecent,
    hasLeadSymptomLandedThisCycle,
    leadMetric: lead.leadMetric,
    followMetric: lead.followMetric,
    leadConfidence: lead.confidence,
    recurringScore,
    timingConfidence,
  };
}

export function classifyPatternStateForSignal(args: {
  entries: CheckInEntry[];
  userData: UserData;
  signal: InsightSignal;
  todayISO?: string;
}): PairPatternStateResult | null {
  const { entries, userData, signal, todayISO } = args;
  if (!signal || signal.type !== 'metric_pair' || !Array.isArray(signal.metrics) || signal.metrics.length < 2) return null;
  return classifyPatternStateForPairKeys({
    entries,
    userData,
    metricA: signal.metrics[0],
    metricB: signal.metrics[1],
    signal,
    todayISO,
  });
}

export function getPatternStateSummaryScore(result: PairPatternStateResult | null): number {
  if (!result) return 0;
  const stateBase = result.state === 'live_cluster'
    ? 100
    : result.state === 'upcoming_cluster'
      ? 82
      : result.state === 'stable_recurring_grouping'
        ? 68
        : result.state === 'passed_cluster'
          ? 52
          : 35;
  const leadBoost = result.leadConfidence === 'high' ? 10 : result.leadConfidence === 'medium' ? 5 : 0;
  const timingBoost = result.timingConfidence === 'high' ? 10 : result.timingConfidence === 'medium' ? 5 : 0;
  const repeatBoost = Math.min(15, result.repeatCount * 3);
  return stateBase + leadBoost + timingBoost + repeatBoost;
}

export function getPatternStateDebugLabel(result: PairPatternStateResult | null): string {
  if (!result) return 'No pattern state';
  const base = result.state.replace(/_/g, ' ');
  const phase = result.currentPhaseKey ? ` · ${result.currentPhaseKey}` : '';
  return `${base}${phase}`;
}
