import type { CheckInEntry, CyclePhase, InsightMetricKey, SymptomKey, SymptomKind, UserData } from '../types';
import { estimatePhaseByFlow, pearsonCorrelation, sortByDateAsc } from './analytics';
import { isoTodayLocal } from './date';
import { isMetricInScope } from './insightsScope';
import { SYMPTOM_META } from './symptomMeta';

export type InsightConfidence = 'low' | 'medium' | 'high';
export type InsightStrength = 'weak' | 'moderate' | 'strong';
export type InsightSignalType = 'phase_shift' | 'trend_shift' | 'metric_pair' | 'weekday_pattern' | 'low_data';

export interface InsightSignal {
  id: string;
  type: InsightSignalType;
  score: number;
  confidence: InsightConfidence;
  strength: InsightStrength;
  metrics: InsightMetricKey[];
  phase?: string | null;
  direction?: 'higher' | 'lower' | 'together' | 'inverse';
  sampleSize: number;
  summary: {
    metric?: InsightMetricKey;
    otherMetric?: InsightMetricKey;
    day?: string;
    delta?: number;
    slope?: number;
    correlation?: number;
  };
}

export interface StoredDiscoveredPattern {
  id: string;
  firstDetected: string;
  confidence: number;
}

export interface HeroRotationState {
  lastRotation: string;
  insightIds: string[];
}

export const DISCOVERED_PATTERNS_KEY = 'everybody:v2:discovered_patterns';
export const INSIGHTS_HERO_ROTATION_KEY = 'everybody:v2:insights_hero_rotation';

const DEFAULT_METRICS: InsightMetricKey[] = ['sleep', 'energy', 'stress', 'fatigue', 'brainFog', 'pain', 'nightSweats', 'mood'];
const ROTATION_DAYS = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hasNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalise10(v: unknown): number | undefined {
  if (!hasNum(v)) return undefined;
  const scaled = v > 10 ? Math.round(v / 10) : v;
  return clamp(scaled, 0, 10);
}

function moodTo10(mood?: 1 | 2 | 3): number | undefined {
  if (!mood) return undefined;
  return mood === 1 ? 2 : mood === 2 ? 5 : 8;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (xs.length - 1);
}

function slope(values: Array<{ x: number; y: number }>): number {
  if (values.length < 3) return NaN;
  const xs = values.map((p) => p.x);
  const ys = values.map((p) => p.y);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return NaN;
  return num / den;
}

function labelForMetric(key: InsightMetricKey, user?: UserData): string {
  const fallback: Record<string, string> = {
    mood: 'Overall mood',
    energy: 'Energy',
    sleep: 'Sleep',
    pain: 'Pain',
    headache: 'Headache',
    cramps: 'Cramps',
    jointPain: 'Joint pain',
    flow: 'Bleeding/spotting',
    stress: 'Stress',
    anxiety: 'Anxiety',
    irritability: 'Irritability',
    focus: 'Focus',
    bloating: 'Bloating',
    digestion: 'Digestion',
    acidReflux: 'Acid reflux',
    nausea: 'Nausea',
    hairShedding: 'Hair shedding',
    facialSpots: 'Facial spots',
    cysts: 'Cysts',
    brainFog: 'Brain fog',
    fatigue: 'Fatigue',
    dizziness: 'Dizziness',
    appetite: 'Appetite',
    libido: 'Libido',
    breastTenderness: 'Breast tenderness',
    hotFlushes: 'Hot flushes',
    nightSweats: 'Night sweats',
  };
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user?.customSymptoms ?? []).find((s) => s.id === id);
    return found?.label ?? 'Custom symptom';
  }
  return SYMPTOM_META[key as SymptomKey]?.label ?? fallback[key] ?? String(key);
}

function getKindForMetric(key: InsightMetricKey, user: UserData): SymptomKind {
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user.customSymptoms ?? []).find((s) => s.id === id);
    return found?.kind ?? 'other';
  }
  return SYMPTOM_META[key as SymptomKey]?.kind ?? 'other';
}

function getMetricValue(entry: CheckInEntry, key: InsightMetricKey, userData: UserData): number | undefined {
  if (!isMetricInScope(userData, String(key), String(entry.dateISO))) return undefined;
  if (key === 'mood') return moodTo10(entry.mood);
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    return normalise10((entry as any)?.customValues?.[id]);
  }
  return normalise10((entry.values as any)?.[key]);
}

function confidenceFromStrength(value: number, sampleSize: number): InsightConfidence {
  if (value >= 0.65 && sampleSize >= 12) return 'high';
  if (value >= 0.5 && sampleSize >= 8) return 'medium';
  return 'low';
}

function confidenceToNumber(confidence: InsightConfidence): number {
  return confidence === 'high' ? 0.8 : confidence === 'medium' ? 0.6 : 0.4;
}

function strengthFromValue(value: number): InsightStrength {
  if (value >= 1.25) return 'strong';
  if (value >= 0.8) return 'moderate';
  return 'weak';
}

function qualityScore(rAbs: number, n: number): number {
  const strength = Math.min(1, Math.max(0, (rAbs - 0.35) / 0.45));
  const support = Math.min(1, n / 14);
  return Math.round(100 * (0.65 * strength + 0.35 * support));
}

function insightQualityScore(args: {
  r: number;
  n: number;
  kindA: SymptomKind;
  kindB: SymptomKind;
}): number {
  const rAbs = Math.abs(args.r);
  let score = qualityScore(rAbs, args.n);
  const { kindA, kindB, n } = args;
  const isBehaviourState =
    (kindA === 'behaviour' && kindB === 'state') || (kindA === 'state' && kindB === 'behaviour');
  const isPhysPair =
    (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');
  const mixesBodyAndLife =
    (kindA === 'behaviour' && (kindB === 'physio' || kindB === 'hormonal')) ||
    (kindB === 'behaviour' && (kindA === 'physio' || kindA === 'hormonal'));

  if (isBehaviourState) score += 10;
  if (isPhysPair) score -= 15;
  if (mixesBodyAndLife) score -= 10;
  if (n < 6) score = Math.min(score, 55);
  if (rAbs < 0.4) score -= 12;

  return clamp(Math.round(score), 0, 100);
}

function dedupeSignals(signals: InsightSignal[]): InsightSignal[] {
  const seen = new Set<string>();
  const out: InsightSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.type}:${signal.metrics.join('|')}:${signal.phase ?? ''}:${signal.direction ?? ''}:${signal.summary.day ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function getCurrentPhase(entries: CheckInEntry[], userData: UserData): string | null {
  if (userData.cycleTrackingMode !== 'cycle' || !entries.length) return null;
  try {
    return estimatePhaseByFlow(isoTodayLocal(), entries) ?? null;
  } catch {
    return null;
  }
}

function getPhaseBuckets(entries: CheckInEntry[], userData: UserData): Record<string, CheckInEntry[]> {
  const buckets: Record<string, CheckInEntry[]> = {
    Menstrual: [],
    Follicular: [],
    Ovulation: [],
    Luteal: [],
    Unknown: [],
  };
  if (userData.cycleTrackingMode !== 'cycle') return buckets;
  for (const entry of entries) {
    const phase = estimatePhaseByFlow(String(entry.dateISO), entries) ?? 'Unknown';
    const key = phase in buckets ? phase : 'Unknown';
    buckets[key].push(entry);
  }
  return buckets;
}

function metricPrioritiesForPhase(phase: string | null): string[] {
  const phasePriorities: Record<string, string[]> = {
    Menstrual: ['pain', 'cramps', 'fatigue', 'sleep', 'flow', 'energy'],
    Follicular: ['energy', 'mood', 'focus', 'fatigue'],
    Ovulation: ['energy', 'mood', 'libido', 'sleep'],
    Ovulatory: ['energy', 'mood', 'libido', 'sleep'],
    Luteal: ['sleep', 'stress', 'irritability', 'appetite', 'breastTenderness', 'nightSweats', 'energy'],
  };
  return phase ? (phasePriorities[phase] ?? []) : [];
}

export function generateCandidateInsights(
  entriesInput: CheckInEntry[],
  userData: UserData,
  selectedMetrics: InsightMetricKey[] = [],
): InsightSignal[] {
  const entries = sortByDateAsc(entriesInput) as CheckInEntry[];
  if (!entries.length) {
    return [
      {
        id: 'low-data-empty',
        type: 'low_data',
        score: 1,
        confidence: 'low',
        strength: 'weak',
        metrics: [],
        phase: null,
        direction: undefined,
        sampleSize: 0,
        summary: {},
      },
    ];
  }

  const candidateMetrics = Array.from(new Set<InsightMetricKey>([...selectedMetrics, ...DEFAULT_METRICS]));
  const currentPhase = getCurrentPhase(entries, userData);
  const phaseBuckets = getPhaseBuckets(entries, userData);
  const preferred = metricPrioritiesForPhase(currentPhase);
  const metricCounts = new Map<InsightMetricKey, number>();
  candidateMetrics.forEach((metric) => {
    let count = 0;
    entries.forEach((entry) => {
      if (getMetricValue(entry, metric, userData) != null) count += 1;
    });
    metricCounts.set(metric, count);
  });

  const phaseWeight = (metrics: InsightMetricKey[]) => {
    if (!preferred.length) return 0;
    return metrics.reduce((score, metric) => score + (preferred.includes(String(metric)) ? 14 : 0), 0);
  };

  const signals: InsightSignal[] = [];

  if (currentPhase && (phaseBuckets[currentPhase] ?? []).length >= 3 && entries.length >= 8) {
    const bucket = phaseBuckets[currentPhase] ?? [];
    candidateMetrics.forEach((metric) => {
      const phaseVals = bucket.map((entry) => getMetricValue(entry, metric, userData)).filter(hasNum);
      const allVals = entries.map((entry) => getMetricValue(entry, metric, userData)).filter(hasNum);
      if (phaseVals.length < 3 || allVals.length < 6) return;
      const delta = mean(phaseVals) - mean(allVals);
      if (Math.abs(delta) < 0.8) return;
      const strength = strengthFromValue(Math.abs(delta));
      const confidence = confidenceFromStrength(Math.min(1, Math.abs(delta) / 2), Math.min(phaseVals.length, allVals.length));
      signals.push({
        id: `phase-${String(metric)}-${String(currentPhase).toLowerCase()}`,
        type: 'phase_shift',
        score: 58 + Math.round(Math.abs(delta) * 18) + phaseWeight([metric]),
        confidence,
        strength,
        metrics: [metric],
        phase: currentPhase,
        direction: delta > 0 ? 'higher' : 'lower',
        sampleSize: phaseVals.length,
        summary: { metric, delta },
      });
    });
  }

  candidateMetrics.forEach((metric) => {
    const pts: Array<{ x: number; y: number }> = [];
    entries.forEach((entry, idx) => {
      const value = getMetricValue(entry, metric, userData);
      if (value != null) pts.push({ x: idx, y: value });
    });
    if (pts.length < 4) return;
    const metricSlope = slope(pts);
    if (!Number.isFinite(metricSlope) || Math.abs(metricSlope) < 0.18) return;
    const slopeAbs = Math.abs(metricSlope);
    signals.push({
      id: `trend-${String(metric)}`,
      type: 'trend_shift',
      score: 45 + Math.round(slopeAbs * 40) + phaseWeight([metric]),
      confidence: confidenceFromStrength(Math.min(1, slopeAbs), pts.length),
      strength: strengthFromValue(slopeAbs * 4),
      metrics: [metric],
      phase: currentPhase,
      direction: metricSlope > 0 ? 'higher' : 'lower',
      sampleSize: pts.length,
      summary: { metric, slope: metricSlope },
    });
  });

  const pairKeys = candidateMetrics.slice(0, 14);
  for (let i = 0; i < pairKeys.length; i++) {
    for (let j = i + 1; j < pairKeys.length; j++) {
      const aKey = pairKeys[i];
      const bKey = pairKeys[j];
      if (aKey === bKey) continue;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const entry of entries) {
        const av = getMetricValue(entry, aKey, userData);
        const bv = getMetricValue(entry, bKey, userData);
        if (hasNum(av) && hasNum(bv)) {
          xs.push(av);
          ys.push(bv);
        }
      }
      const n = xs.length;
      if (n < 4) continue;
      if (variance(xs) < 0.15 || variance(ys) < 0.15) continue;
      const r = pearsonCorrelation(xs, ys);
      if (!Number.isFinite(r) || Math.abs(r) < 0.4) continue;
      const kindA = getKindForMetric(aKey, userData);
      const kindB = getKindForMetric(bKey, userData);
      const bothBodyish = (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');
      if (bothBodyish) continue;
      signals.push({
        id: `pair-${String(aKey)}-${String(bKey)}`,
        type: 'metric_pair',
        score: insightQualityScore({ r, n, kindA, kindB }) + phaseWeight([aKey, bKey]),
        confidence: confidenceFromStrength(Math.abs(r), n),
        strength: strengthFromValue(Math.abs(r) * 1.8),
        metrics: [aKey, bKey],
        phase: currentPhase,
        direction: r >= 0 ? 'together' : 'inverse',
        sampleSize: n,
        summary: { metric: aKey, otherMetric: bKey, correlation: r },
      });
    }
  }

  if (entries.length >= 6) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    candidateMetrics.forEach((metric) => {
      const rows = weekdays.map((day, dayIndex) => {
        const vals = entries
          .filter((entry) => {
            const dt = new Date(`${entry.dateISO}T00:00:00`);
            return dt.getDay() === dayIndex;
          })
          .map((entry) => getMetricValue(entry, metric, userData))
          .filter(hasNum);
        return { day, vals, avg: vals.length ? mean(vals) : null };
      }).filter((row) => row.avg != null && row.vals.length >= 2);
      if (rows.length < 2) return;
      const sortedRows = rows.slice().sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      const strongest = sortedRows[0];
      const quietest = sortedRows[sortedRows.length - 1];
      if (strongest.avg == null || quietest.avg == null) return;
      const delta = strongest.avg - quietest.avg;
      if (delta < 1.4) return;
      signals.push({
        id: `weekday-${String(metric)}-${strongest.day.toLowerCase()}`,
        type: 'weekday_pattern',
        score: 44 + Math.round(delta * 14) + phaseWeight([metric]),
        confidence: confidenceFromStrength(Math.min(1, delta / 3), strongest.vals.length),
        strength: strengthFromValue(delta),
        metrics: [metric],
        phase: currentPhase,
        direction: 'higher',
        sampleSize: strongest.vals.length,
        summary: { metric, day: strongest.day, delta },
      });
    });
  }

  if (!signals.length) {
    return [
      {
        id: `low-data-${entries.length}`,
        type: 'low_data',
        score: 1,
        confidence: 'low',
        strength: 'weak',
        metrics: [],
        phase: currentPhase,
        sampleSize: entries.length,
        summary: {},
      },
    ];
  }

  return dedupeSignals(signals);
}

export function scoreInsights(candidates: InsightSignal[]): InsightSignal[] {
  return candidates.map((candidate) => {
    const confidenceBoost = candidate.confidence === 'high' ? 10 : candidate.confidence === 'medium' ? 5 : 0;
    const strengthBoost = candidate.strength === 'strong' ? 8 : candidate.strength === 'moderate' ? 4 : 0;
    return { ...candidate, score: candidate.score + confidenceBoost + strengthBoost };
  });
}

export function rankInsights(scoredInsights: InsightSignal[]): InsightSignal[] {
  return dedupeSignals(scoredInsights)
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return b.metrics.length - a.metrics.length;
    });
}

export function getTopInsights(
  entries: CheckInEntry[],
  userData: UserData,
  limit = 3,
  selectedMetrics: InsightMetricKey[] = [],
): InsightSignal[] {
  return rankInsights(scoreInsights(generateCandidateInsights(entries, userData, selectedMetrics))).slice(0, limit);
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDiscoveredPatterns(): StoredDiscoveredPattern[] {
  return safeReadJson<StoredDiscoveredPattern[]>(DISCOVERED_PATTERNS_KEY, []);
}

export function markPatternsDiscovered(signals: InsightSignal[]): void {
  if (!signals.length) return;
  const existing = getDiscoveredPatterns();
  const map = new Map(existing.map((item) => [item.id, item]));
  const today = isoTodayLocal();
  signals.forEach((signal) => {
    if (signal.type === 'low_data') return;
    if (map.has(signal.id)) return;
    map.set(signal.id, {
      id: signal.id,
      firstDetected: today,
      confidence: confidenceToNumber(signal.confidence),
    });
  });
  safeWriteJson(DISCOVERED_PATTERNS_KEY, Array.from(map.values()));
}

export function isDiscoveredPattern(id: string): boolean {
  return getDiscoveredPatterns().some((item) => item.id === id);
}

function getRotationState(): HeroRotationState | null {
  return safeReadJson<HeroRotationState | null>(INSIGHTS_HERO_ROTATION_KEY, null);
}

function saveRotationState(state: HeroRotationState): void {
  safeWriteJson(INSIGHTS_HERO_ROTATION_KEY, state);
}

function hashIds(ids: string[]): number {
  return ids.join('|').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function selectStableHeroInsights(rankedSignals: InsightSignal[], limit = 3): Array<InsightSignal & { isNewPattern: boolean }> {
  const ranked = rankInsights(rankedSignals);
  if (!ranked.length) return [];

  const today = isoTodayLocal();
  const discovered = new Set(getDiscoveredPatterns().map((item) => item.id));
  const fallback = ranked.slice(0, Math.max(1, limit));
  const existingRotation = getRotationState();
  const availableIds = new Set(ranked.map((signal) => signal.id));

  if (
    existingRotation?.lastRotation &&
    Array.isArray(existingRotation.insightIds) &&
    existingRotation.insightIds.length &&
    daysBetween(existingRotation.lastRotation, today) < ROTATION_DAYS &&
    existingRotation.insightIds.every((id) => availableIds.has(id))
  ) {
    const sticky = existingRotation.insightIds
      .map((id) => ranked.find((signal) => signal.id === id))
      .filter((signal): signal is InsightSignal => !!signal)
      .slice(0, limit);
    if (sticky.length) {
      return sticky.map((signal) => ({ ...signal, isNewPattern: !discovered.has(signal.id) && signal.type !== 'low_data' }));
    }
  }

  const undiscovered = ranked.filter((signal) => !discovered.has(signal.id) && signal.type !== 'low_data');
  const lead = undiscovered[0] ?? fallback[0];
  const remaining = ranked.filter((signal) => signal.id !== lead.id);
  const rotationSeed = Math.floor(hashIds(ranked.map((signal) => signal.id)) / 17) + Math.floor(daysBetween('2026-01-01', today) / ROTATION_DAYS);
  const rotated = remaining.length
    ? remaining.map((_, idx, arr) => arr[(idx + (rotationSeed % arr.length)) % arr.length])
    : [];
  const selected = [lead, ...rotated].slice(0, Math.max(1, limit));
  saveRotationState({ lastRotation: today, insightIds: selected.map((signal) => signal.id) });
  return selected.map((signal) => ({ ...signal, isNewPattern: !discovered.has(signal.id) && signal.type !== 'low_data' }));
}

export function metricLabelsForSignal(signal: InsightSignal, userData: UserData): string[] {
  return signal.metrics.map((metric) => labelForMetric(metric, userData));
}
