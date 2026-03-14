import type { InsightMetricKey } from '../types';

export const DRIVER_LABELS = {
  hormones: 'Hormones',
  poor_sleep: 'Poor sleep',
  stress: 'Stress',
  workload: 'Workload',
  overwhelm: 'Overwhelm',
  anxiety: 'Anxiety',
  pain_tension: 'Pain or tension',
  recovery_illness: 'Recovery or illness',
  temperature: 'Temperature',
  nutrition: 'Nutrition',
  caffeine: 'Caffeine',
  hydration: 'Hydration',
  routine: 'Routine',
  inflammation: 'Inflammation',
  digestion: 'Digestion',
  activity: 'Activity',
  cycle_timing: 'Cycle timing',
  overstimulation: 'Overstimulation',
  not_sure: 'Not sure',
} as const;

export type PatternDriverHint = keyof typeof DRIVER_LABELS;

type DriverOption = { key: PatternDriverHint; label: string };

const DRIVER_PRIORITY: Record<PatternDriverHint, number> = {
  hormones: 10,
  poor_sleep: 9,
  stress: 8,
  workload: 6,
  overwhelm: 6,
  anxiety: 5,
  pain_tension: 6,
  recovery_illness: 7,
  temperature: 6,
  nutrition: 7,
  caffeine: 4,
  hydration: 4,
  routine: 5,
  inflammation: 5,
  digestion: 4,
  activity: 4,
  cycle_timing: 6,
  overstimulation: 5,
  not_sure: 0,
};

const METRIC_DRIVER_MAP: Partial<Record<InsightMetricKey | string, PatternDriverHint[]>> = {
  mood: ['hormones', 'stress', 'poor_sleep', 'overwhelm', 'recovery_illness'],
  energy: ['poor_sleep', 'hormones', 'nutrition', 'recovery_illness', 'stress'],
  motivation: ['poor_sleep', 'stress', 'hormones', 'overwhelm', 'recovery_illness'],
  sleep: ['stress', 'hormones', 'pain_tension', 'routine', 'caffeine', 'temperature'],
  insomnia: ['stress', 'hormones', 'temperature', 'caffeine', 'routine', 'pain_tension'],
  pain: ['hormones', 'inflammation', 'activity', 'stress', 'pain_tension'],
  headache: ['stress', 'hormones', 'poor_sleep', 'hydration', 'caffeine'],
  migraine: ['hormones', 'stress', 'poor_sleep', 'hydration', 'caffeine'],
  backPain: ['pain_tension', 'activity', 'inflammation', 'hormones'],
  cramps: ['hormones', 'cycle_timing', 'inflammation', 'stress'],
  jointPain: ['inflammation', 'hormones', 'activity', 'recovery_illness'],
  flow: ['hormones', 'cycle_timing', 'stress'],
  stress: ['poor_sleep', 'workload', 'overwhelm', 'hormones', 'anxiety'],
  anxiety: ['hormones', 'poor_sleep', 'caffeine', 'overstimulation', 'stress'],
  irritability: ['hormones', 'poor_sleep', 'stress', 'overstimulation', 'temperature'],
  focus: ['poor_sleep', 'stress', 'hormones', 'overstimulation', 'nutrition'],
  brainFog: ['poor_sleep', 'hormones', 'stress', 'overstimulation', 'recovery_illness', 'nutrition'],
  fatigue: ['poor_sleep', 'hormones', 'recovery_illness', 'nutrition', 'pain_tension', 'stress'],
  dizziness: ['hydration', 'nutrition', 'recovery_illness', 'hormones', 'poor_sleep'],
  bloating: ['hormones', 'digestion', 'nutrition', 'stress'],
  digestion: ['nutrition', 'stress', 'hormones', 'digestion'],
  nausea: ['digestion', 'hormones', 'nutrition', 'stress'],
  constipation: ['digestion', 'hydration', 'nutrition', 'hormones'],
  diarrhoea: ['digestion', 'stress', 'nutrition', 'recovery_illness'],
  acidReflux: ['digestion', 'nutrition', 'stress', 'routine'],
  hairShedding: ['hormones', 'nutrition', 'stress', 'recovery_illness', 'cycle_timing'],
  facialSpots: ['hormones', 'stress', 'nutrition', 'cycle_timing'],
  cysts: ['hormones', 'cycle_timing', 'stress', 'inflammation'],
  skinDryness: ['hormones', 'hydration', 'nutrition', 'temperature'],
  appetite: ['hormones', 'stress', 'nutrition', 'recovery_illness'],
  libido: ['hormones', 'stress', 'poor_sleep', 'pain_tension'],
  breastTenderness: ['hormones', 'cycle_timing', 'inflammation'],
  hotFlushes: ['hormones', 'temperature', 'stress', 'caffeine'],
  nightSweats: ['hormones', 'temperature', 'poor_sleep', 'recovery_illness', 'stress'],
  restlessLegs: ['poor_sleep', 'nutrition', 'stress', 'activity'],
};

const METRIC_TO_DRIVER_EQUIVALENT: Partial<Record<InsightMetricKey | string, PatternDriverHint>> = {
  sleep: 'poor_sleep',
  insomnia: 'poor_sleep',
  stress: 'stress',
  anxiety: 'anxiety',
  headache: 'pain_tension',
  migraine: 'pain_tension',
  backPain: 'pain_tension',
  pain: 'pain_tension',
  cramps: 'pain_tension',
  jointPain: 'pain_tension',
  digestion: 'digestion',
  nausea: 'digestion',
  constipation: 'digestion',
  diarrhoea: 'digestion',
  acidReflux: 'digestion',
  flow: 'cycle_timing',
};

function uniqueMetrics(metrics: Array<InsightMetricKey | string>): string[] {
  return Array.from(new Set(metrics.map((metric) => String(metric)).filter(Boolean)));
}

export function getSuggestedDriverOptionsForMetrics(metrics: Array<InsightMetricKey | string>): DriverOption[] {
  const metricKeys = uniqueMetrics(metrics);
  const excluded = new Set<PatternDriverHint>();
  const scores = new Map<PatternDriverHint, number>();

  metricKeys.forEach((metric) => {
    const equivalent = METRIC_TO_DRIVER_EQUIVALENT[metric];
    if (equivalent) excluded.add(equivalent);
  });

  metricKeys.forEach((metric) => {
    const options = METRIC_DRIVER_MAP[metric] ?? ['poor_sleep', 'hormones', 'stress', 'routine'];
    options.forEach((option, index) => {
      if (option === 'not_sure' || excluded.has(option)) return;
      const next = (scores.get(option) ?? 0) + 10 - index + (DRIVER_PRIORITY[option] ?? 0);
      scores.set(option, next);
    });
  });

  const sorted = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || (DRIVER_PRIORITY[b[0]] ?? 0) - (DRIVER_PRIORITY[a[0]] ?? 0))
    .slice(0, 3)
    .map(([key]) => ({ key, label: DRIVER_LABELS[key] }));

  const fallback: PatternDriverHint[] = ['poor_sleep', 'hormones', 'stress'];
  fallback.forEach((key) => {
    if (sorted.length >= 3 || excluded.has(key) || sorted.some((item) => item.key === key)) return;
    sorted.push({ key, label: DRIVER_LABELS[key] });
  });

  sorted.push({ key: 'not_sure', label: DRIVER_LABELS.not_sure });
  return sorted;
}
