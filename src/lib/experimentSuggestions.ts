import type { InsightSignal } from './insightEngine';
import type { InsightMetricKey } from '../types';
import { getExperimentHistoryContext } from './experimentLearning';
import { getExperimentSuggestionSuppression } from './companionLogic';
import { isoTodayLocal } from './date';

export type ExperimentSuggestion = {
  id: string;
  title: string;
  note: string;
  metrics: string[];
  rank: number;
  experimentId?: string;
  experimentName?: string;
  experimentDescription?: string;
  durationDays?: number;
  changeKey?: string;
};

export type ExperimentForSignal = {
  experimentId: string;
  experimentName: string;
  experimentDescription: string;
  metrics: string[];
  durationDays?: number;
  changeKey?: string;
};

function hasMetric(signal: InsightSignal, key: string): boolean {
  return Array.isArray(signal.metrics) && signal.metrics.some((metric) => String(metric) === key);
}

function hasAnyMetric(signal: InsightSignal, keys: string[]): boolean {
  return keys.some((key) => hasMetric(signal, key));
}

function uniqueMetrics(metrics: Array<InsightMetricKey | string>): string[] {
  return metrics.map((metric) => String(metric)).filter((value, idx, arr) => value && arr.indexOf(value) === idx);
}


function metricDisplayLabel(metric: string): string {
  if (!metric) return 'that symptom';
  if (metric.startsWith('custom:')) return metric.slice('custom:'.length).replace(/[-_]+/g, ' ');
  return metric.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}

export function getExperimentForSignal(signal: InsightSignal): ExperimentForSignal | null {
  const metric = String(signal.metrics?.[0] ?? '');
  const metrics = uniqueMetrics(signal.metrics ?? []);
  const metricBlob = metrics.join('|');
  const signalId = String(signal.id ?? '');

  if (signalId.includes('sleep_before_bleed') || (signalId.includes('phase-sleep') && signal.phase === 'Luteal') || metric === 'sleep') {
    return {
      experimentId: 'wind_down',
      experimentName: 'Wind-down experiment',
      experimentDescription: 'A short evening routine can help test whether sleep feels easier to support in this window.',
      metrics: uniqueMetrics(['sleep', 'energy', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'lateNight',
    };
  }

  if ((hasMetric(signal, 'stress') && hasMetric(signal, 'sleep')) || metric === 'stress') {
    return {
      experimentId: 'evening_reset',
      experimentName: 'Evening reset experiment',
      experimentDescription: 'A lower-friction evening can help you test whether stressful days lead to lighter sleep.',
      metrics: uniqueMetrics(['stress', 'sleep', 'mood', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'stressfulDay',
    };
  }

  if (hasAnyMetric(signal, ['energy', 'fatigue']) || metric === 'energy' || metric === 'fatigue') {
    return {
      experimentId: 'morning_light',
      experimentName: 'Morning light experiment',
      experimentDescription: 'A steadier morning rhythm can help you test whether energy feels easier to lift and hold.',
      metrics: uniqueMetrics(['energy', 'fatigue', 'sleep', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'exercise',
    };
  }

  if (hasAnyMetric(signal, ['brainFog', 'focus']) || metricBlob.includes('brainFog')) {
    return {
      experimentId: 'focus_buffer',
      experimentName: 'Focus buffer experiment',
      experimentDescription: 'A simpler, lower-friction day can help you test whether brain fog feels easier to carry.',
      metrics: uniqueMetrics(['brainFog', 'stress', 'sleep', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'stressfulDay',
    };
  }

  if (hasAnyMetric(signal, ['hairShedding', 'facialSpots', 'cysts'])) {
    const includesBrainFog = hasMetric(signal, 'brainFog');
    const includesStress = hasMetric(signal, 'stress');
    return {
      experimentId: includesBrainFog || includesStress ? 'recovery_buffer' : 'symptom_load_reset',
      experimentName: includesBrainFog || includesStress ? 'Recovery buffer experiment' : 'Symptom load reset experiment',
      experimentDescription: includesBrainFog || includesStress
        ? 'A gentler evening and steadier recovery window can help you test whether this cluster settles at all.'
        : 'A lower-friction few days can help you test whether this cluster settles or stays much the same.',
      metrics: uniqueMetrics(['hairShedding', 'brainFog', 'stress', 'sleep', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'lateNight',
    };
  }

  if (hasAnyMetric(signal, ['nightSweats', 'hotFlushes'])) {
    return {
      experimentId: 'cool_evening',
      experimentName: 'Cooler evening experiment',
      experimentDescription: 'A cooler, steadier bedtime setup can help you test whether nights feel a little less disruptive.',
      metrics: uniqueMetrics(['nightSweats', 'sleep', 'energy', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'lateNight',
    };
  }

  if (hasAnyMetric(signal, ['headache', 'migraine', 'dizziness'])) {
    return {
      experimentId: 'hydration_support',
      experimentName: 'Hydration support experiment',
      experimentDescription: 'A steadier hydration rhythm can help you test whether headaches or dizziness feel easier to support.',
      metrics: uniqueMetrics(['headache', 'dizziness', 'energy', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'lowHydration',
    };
  }

  if (hasAnyMetric(signal, ['anxiety', 'irritability']) || metricBlob.includes('mood')) {
    return {
      experimentId: 'caffeine_timing',
      experimentName: 'Caffeine timing experiment',
      experimentDescription: 'A small caffeine timing tweak can help you test whether stress, mood, or sleep feel steadier.',
      metrics: uniqueMetrics(['anxiety', 'stress', 'sleep', 'mood', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'caffeine',
    };
  }

  if (metric.startsWith('custom:')) {
    const readable = metricDisplayLabel(metric);
    return {
      experimentId: `custom_support:${metric}`,
      experimentName: `${readable.charAt(0).toUpperCase() + readable.slice(1)} support experiment`,
      experimentDescription: `A gentler, lower-friction few days can help you test whether ${readable} settles at all or keeps feeling much the same.`,
      metrics: uniqueMetrics([metric, 'mood', 'stress', 'sleep', ...metrics]).slice(0, 5),
      durationDays: 3,
      changeKey: 'stressfulDay',
    };
  }


  return null;
}



export function scoreExperimentSuggestion(signal: InsightSignal, experiment: ExperimentForSignal): number {
  const history = getExperimentHistoryContext(experiment.experimentId, {
    experimentId: experiment.experimentId,
    title: experiment.experimentName,
    changeKey: experiment.changeKey,
    metrics: experiment.metrics as any,
  } as any);
  const confidenceBoost = signal.confidence === 'high' ? 18 : signal.confidence === 'medium' ? 10 : 3;
  const strengthBoost = signal.strength === 'strong' ? 12 : signal.strength === 'moderate' ? 7 : 2;
  const typeBoost = signal.type === 'metric_pair' ? 12 : signal.type === 'phase_shift' ? 9 : signal.type === 'trend_shift' ? 7 : 4;
  const multiMetricBoost = Array.isArray(signal.metrics) ? Math.min(8, Math.max(0, signal.metrics.length - 1) * 4) : 0;
  const sampleBoost = Math.min(8, Math.max(0, Number(signal.sampleSize || 0) - 3));
  const historyBoost = history.tone === 'helped' ? 10 : history.tone === 'mixed' ? 4 : 0;
  return Number(signal.score || 0) + confidenceBoost + strengthBoost + typeBoost + multiMetricBoost + sampleBoost + historyBoost;
}

function suggestionForSignal(signal: InsightSignal): ExperimentSuggestion | null {
  const experiment = getExperimentForSignal(signal);
  if (!experiment) return null;
  const historyContext = getExperimentHistoryContext(experiment.experimentId, { experimentId: experiment.experimentId, title: experiment.experimentName, changeKey: experiment.changeKey, metrics: experiment.metrics as any } as any);
  const note = historyContext.text
    ? `${experiment.experimentDescription} ${historyContext.text}`
    : experiment.experimentDescription;
  return {
    id: `experiment:${signal.id}`,
    title: `Try a ${experiment.experimentName.toLowerCase()}`,
    note,
    metrics: experiment.metrics,
    rank: scoreExperimentSuggestion(signal, experiment),
    experimentId: experiment.experimentId,
    experimentName: experiment.experimentName,
    experimentDescription: experiment.experimentDescription,
    durationDays: experiment.durationDays,
    changeKey: experiment.changeKey,
  };
}

export function generateExperimentSuggestions(signals: InsightSignal[]): ExperimentSuggestion[] {
  const suppression = getExperimentSuggestionSuppression(isoTodayLocal());
  if (suppression.active || suppression.recentCompletion) return [];
  const out: ExperimentSuggestion[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const suggestion = suggestionForSignal(signal);
    if (!suggestion) continue;
    const dedupeKey = suggestion.experimentId || suggestion.title;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(suggestion);
  }
  return out;
}

export function rankExperimentSuggestions(suggestions: ExperimentSuggestion[]): ExperimentSuggestion[] {
  return suggestions.slice().sort((a, b) => b.rank - a.rank);
}
