import type { SymptomKey, InsightMetricKey, UserData } from '../types';
import { SYMPTOM_META } from './symptomMeta';

export type AppMetricKey = 'mood' | SymptomKey | string;
export type MetricPolarity = 'positive' | 'burden' | 'neutral';

const POSITIVE_METRICS = new Set<AppMetricKey>([
  'mood',
  'energy',
  'motivation',
  'sleep',
  'focus',
  'libido',
]);

const BURDEN_METRICS = new Set<AppMetricKey>([
  'stress',
  'anxiety',
  'irritability',
  'bloating',
  'digestion',
  'nausea',
  'constipation',
  'diarrhoea',
  'pain',
  'headache',
  'migraine',
  'backPain',
  'cramps',
  'jointPain',
  'flow',
  'hairShedding',
  'facialSpots',
  'cysts',
  'skinDryness',
  'brainFog',
  'fatigue',
  'dizziness',
  'breastTenderness',
  'hotFlushes',
  'nightSweats',
  'restlessLegs',
  'insomnia',
]);

export function getMetricPolarity(metric: AppMetricKey): MetricPolarity {
  if (POSITIVE_METRICS.has(metric)) return 'positive';
  if (BURDEN_METRICS.has(metric)) return 'burden';
  return 'neutral';
}

export function isPositiveMetric(metric: AppMetricKey): boolean {
  return getMetricPolarity(metric) === 'positive';
}

export function isBurdenMetric(metric: AppMetricKey): boolean {
  return getMetricPolarity(metric) === 'burden';
}

export function getMoodLabel(value: number | null | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value === 1) return 'Low';
  if (value === 2) return 'Okay';
  if (value === 3) return 'Good';
  if (value <= 3) return 'Low';
  if (value <= 7) return 'Okay';
  return 'Good';
}

export function getMoodValue10(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value === 1) return 1;
  if (value === 2) return 5;
  if (value === 3) return 10;
  const rounded = Math.round(value * 10) / 10;
  return Math.max(0, Math.min(10, rounded));
}

export function getMetricDisplayLabel(metric: InsightMetricKey | AppMetricKey, user?: UserData): string {
  if (metric === 'mood') return 'Mood';
  if (typeof metric === 'string' && metric.startsWith('custom:')) {
    const id = metric.slice('custom:'.length);
    return user?.customSymptoms?.find((item) => item.id === id)?.label ?? 'Custom symptom';
  }
  if (typeof metric === 'string' && metric in SYMPTOM_META) {
    return SYMPTOM_META[metric as SymptomKey].label;
  }
  return String(metric);
}

export function formatMetricDisplayValue(metric: AppMetricKey, value: number | null | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (metric === 'mood') return getMoodLabel(value);
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${Math.trunc(rounded)}/10` : `${rounded.toFixed(1)}/10`;
}

export function describeHighValue(metric: AppMetricKey, count: number, days: number): string {
  if (metric === 'mood') {
    return `${count} day${count === 1 ? '' : 's'} logged as Good in the last ${days}.`;
  }
  if (isPositiveMetric(metric)) {
    return `${count} day${count === 1 ? '' : 's'} at the stronger end of your scale in the last ${days}.`;
  }
  return `${count} day${count === 1 ? '' : 's'} at the more noticeable end of your scale in the last ${days}.`;
}
