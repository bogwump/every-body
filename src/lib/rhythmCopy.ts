import type { CheckInEntry, InsightMetricKey, UserData } from '../types';
import type { InsightSignal } from './insightEngine';
import { generateCandidateInsights, rankInsights, scoreInsights } from './insightEngine';
import { getExperimentsForSignal, getHelpfulPatternsForMetrics } from './experimentLearning';
import { getRhythmPhrase } from './confidenceCopy';

export type RhythmPhaseKey = 'reset' | 'rebuilding' | 'expressive' | 'protective';

const PHASE_METRIC_PRIORITY: Record<RhythmPhaseKey, InsightMetricKey[]> = {
  reset: ['pain', 'cramps', 'fatigue', 'sleep', 'flow', 'energy'],
  rebuilding: ['energy', 'mood', 'focus', 'fatigue'],
  expressive: ['energy', 'mood', 'libido', 'sleep'],
  protective: ['sleep', 'stress', 'irritability', 'appetite', 'breastTenderness', 'nightSweats', 'energy'],
};

function metricLabel(key: InsightMetricKey, userData?: UserData): string {
  const fallback: Record<string, string> = {
    mood: 'mood',
    energy: 'energy',
    sleep: 'sleep',
    pain: 'pain',
    headache: 'headaches',
    cramps: 'cramps',
    jointPain: 'joint pain',
    flow: 'bleeding',
    stress: 'stress',
    anxiety: 'anxiety',
    irritability: 'irritability',
    focus: 'focus',
    bloating: 'bloating',
    digestion: 'digestion',
    acidReflux: 'acid reflux',
    nausea: 'nausea',
    hairShedding: 'hair shedding',
    facialSpots: 'facial spots',
    cysts: 'cysts',
    brainFog: 'brain fog',
    fatigue: 'fatigue',
    dizziness: 'dizziness',
    appetite: 'appetite',
    libido: 'libido',
    breastTenderness: 'breast tenderness',
    hotFlushes: 'hot flushes',
    nightSweats: 'night sweats',
  };

  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const custom = userData?.customSymptoms?.find((item) => item.id === id);
    return custom?.label?.toLowerCase?.() ?? 'that symptom';
  }
  return fallback[String(key)] ?? String(key).toLowerCase();
}

function metricSupportPhrase(key: InsightMetricKey, userData?: UserData): string {
  const label = metricLabel(key, userData);
  const phrases: Record<string, string> = {
    sleep: 'Protect your wind-down tonight if you can.',
    energy: 'Let energy build gradually rather than forcing momentum.',
    stress: 'Give yourself a little more breathing room today, if you can.',
    fatigue: 'Let recovery count as progress today.',
    mood: 'Keep the day a little gentler and easier to land in.',
    appetite: 'Keep satisfying snacks nearby so the day feels easier to support.',
    brainFog: 'Keep things simple and give yourself a bit less to carry.',
    pain: 'Choose comfort where you can and keep plans flexible.',
    cramps: 'Warmth, rest, and a lighter pace may help today feel easier.',
    nightSweats: 'Keep your evening setup cool and low effort tonight.',
    focus: 'Use any clear patch well, then step back before you push too far.',
  };
  return phrases[String(key)] ?? `Keep an eye on ${label} and go gently with yourself.`;
}

function copyForSignal(signal: InsightSignal, userData: UserData, phaseKey: RhythmPhaseKey): string | null {
  const metricA = signal.metrics[0];
  const metricB = signal.metrics[1];
  const a = metricA ? metricLabel(metricA, userData) : 'things';
  const b = metricB ? metricLabel(metricB, userData) : 'things';

  if (signal.type === 'phase_shift' && metricA) {
    if (signal.direction === 'higher') return `Based on your logs, ${a} ${getRhythmPhrase(signal.confidence)} rises around here.`;
    if (signal.direction === 'lower') return `Based on your logs, ${a} ${getRhythmPhrase(signal.confidence)} feels a little lower around here.`;
  }

  if (signal.type === 'trend_shift' && metricA) {
    if (signal.direction === 'higher') {
      if (metricA === 'energy') return `Based on your logs, energy ${getRhythmPhrase(signal.confidence)} starts to lift around here.`;
      if (metricA === 'sleep') return `Sleep ${getRhythmPhrase(signal.confidence)} feels a bit heavier around here.`;
      return `Lately, ${a} has been creeping up around this point.`;
    }
    if (signal.direction === 'lower') {
      if (metricA === 'sleep') return 'Sleep can still feel uneven during this phase.';
      if (metricA === 'energy') return 'Energy can still feel patchy during this phase.';
      return `Lately, ${a} has tended to ease off around here.`;
    }
  }

  if (signal.type === 'metric_pair' && metricA && metricB) {
    if (signal.direction === 'inverse') {
      if ((metricA === 'stress' && metricB === 'mood') || (metricA === 'mood' && metricB === 'stress')) {
        return 'When stress has been higher, mood has often felt lower.';
      }
      if ((metricA === 'sleep' && metricB === 'energy') || (metricA === 'energy' && metricB === 'sleep')) {
        return 'Sleep and energy often pull against each other for you here.';
      }
      return `${a[0].toUpperCase() + a.slice(1)} and ${b} ${getRhythmPhrase(signal.confidence)} move in opposite directions for you here.`;
    }
    if ((metricA === 'stress' && metricB === 'fatigue') || (metricA === 'fatigue' && metricB === 'stress')) {
      return `Stress and fatigue ${getRhythmPhrase(signal.confidence)} rise together for you here.`;
    }
    if ((metricA === 'sleep' && metricB === 'energy') || (metricA === 'energy' && metricB === 'sleep')) {
      return `Better sleep ${getRhythmPhrase(signal.confidence)} lines up with steadier energy here.`;
    }
    return `${a[0].toUpperCase() + a.slice(1)} and ${b} ${getRhythmPhrase(signal.confidence)} move together for you around here.`;
  }

  if (signal.type === 'weekday_pattern' && metricA) {
    // Rhythm should not feel weekly-schedule driven, so keep this subtle.
    return `Your ${a} has looked a bit more changeable lately.`;
  }

  const phaseFallback: Record<RhythmPhaseKey, string> = {
    reset: 'This can be a more inward phase, so softer pacing may suit you better.',
    rebuilding: 'This can be a gradual lift phase, so momentum may come back in small bursts.',
    expressive: 'This phase can feel more outward, so energy may be easier to use here.',
    protective: 'This phase can ask for more softness, even if you still want to keep moving.',
  };

  return phaseFallback[phaseKey] ?? null;
}

function signalPriority(signal: InsightSignal, phaseKey: RhythmPhaseKey): number {
  const phaseMetrics = PHASE_METRIC_PRIORITY[phaseKey] ?? [];
  const phaseMetricHits = signal.metrics.reduce((total, metric) => total + (phaseMetrics.includes(metric) ? 1 : 0), 0);
  const phaseBonus = signal.phase && ['Menstrual', 'Follicular', 'Ovulation', 'Luteal'].includes(signal.phase) ? 8 : 0;
  const typeBonus = signal.type === 'phase_shift' ? 12 : signal.type === 'metric_pair' ? 7 : signal.type === 'trend_shift' ? 5 : 0;
  const penalty = signal.type === 'weekday_pattern' ? 16 : signal.type === 'low_data' ? 100 : 0;
  return signal.score + phaseMetricHits * 9 + phaseBonus + typeBonus - penalty;
}

export function getRhythmRelevantSignals(
  entries: CheckInEntry[],
  userData: UserData,
  phaseKey: RhythmPhaseKey,
  limit = 2,
): InsightSignal[] {
  const ranked = rankInsights(scoreInsights(generateCandidateInsights(entries, userData)));
  const filtered = ranked.filter((signal) => signal.type !== 'low_data');
  const sorted = filtered
    .slice()
    .sort((a, b) => signalPriority(b, phaseKey) - signalPriority(a, phaseKey));

  const out: InsightSignal[] = [];
  const seenCopy = new Set<string>();
  for (const signal of sorted) {
    const copy = copyForSignal(signal, userData, phaseKey);
    if (!copy) continue;
    if (seenCopy.has(copy)) continue;
    seenCopy.add(copy);
    out.push(signal);
    if (out.length >= limit) break;
  }
  return out;
}

export function getRhythmPatternLines(
  entries: CheckInEntry[],
  userData: UserData,
  phaseKey: RhythmPhaseKey,
  limit = 2,
): { lines: string[]; strongestSignal: InsightSignal | null } {
  const signals = getRhythmRelevantSignals(entries, userData, phaseKey, limit);
  const lines = signals
    .map((signal) => copyForSignal(signal, userData, phaseKey))
    .filter((line): line is string => Boolean(line))
    .slice(0, limit);
  return { lines, strongestSignal: signals[0] ?? null };
}

export function getRhythmSupportNudge(args: {
  phaseKey: RhythmPhaseKey;
  strongestSignal: InsightSignal | null;
  userData: UserData;
  entries: CheckInEntry[];
}): string {
  const signalMetric = args.strongestSignal?.metrics?.[0];

  const helpfulForSignal = args.strongestSignal
    ? getExperimentsForSignal(String(args.strongestSignal.id || '')).filter((item) => item.confidence !== 'low')[0] ?? null
    : null;
  const helpfulForMetric = signalMetric
    ? getHelpfulPatternsForMetrics([signalMetric]).filter((item) => item.confidence !== 'low')[0] ?? null
    : null;
  const helpful = helpfulForSignal ?? helpfulForMetric;

  if (helpful) {
    if (helpful.signal === 'sleep_before_bleed' || helpful.signal === 'sleep_support_general') {
      return 'Earlier nights have seemed helpful for you in this phase before.';
    }
    if (helpful.signal === 'stress_sleep_link') {
      return 'Lower-friction evenings have looked helpful for you after stressful days before.';
    }
    return helpful.shortText;
  }

  if (signalMetric) {
    const phrase = metricSupportPhrase(signalMetric, args.userData);
    if (phrase === 'Give yourself a little more breathing room today, if you can.') return 'Give yourself a little more breathing room today, if you can.';
    return phrase;
  }

  const phaseFallback: Record<RhythmPhaseKey, string> = {
    reset: 'Keep the day simple where you can. Comfort counts.',
    rebuilding: 'Let momentum build gently rather than expecting a full bounce-back.',
    expressive: 'Use the lift if it is there, but leave yourself some breathing room.',
    protective: 'Protect your energy a little more than usual and keep things kind to yourself.',
  };

  void args.entries;
  return phaseFallback[args.phaseKey] ?? 'Focus on noticing how you feel today.';
}

export function getRhythmLowDataPatternLines(): string[] {
  return [
    'We are still learning how your energy, sleep and symptoms move across your rhythm.',
    'A few more check-ins will help this feel more personal and clear.',
  ];
}

export function getRhythmLowDataNudge(): string {
  return 'Focus on noticing how you feel today. Small observations now help build clearer insights later.';
}
