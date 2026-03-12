import type { InsightSignal } from './insightEngine';
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

export function getExperimentForSignal(signal: InsightSignal): ExperimentForSignal | null {
  const metric = String(signal.metrics?.[0] ?? '');

  if (String(signal.id).includes('sleep_before_bleed') || (String(signal.id).includes('phase-sleep') && signal.phase === 'Luteal') || metric === 'sleep') {
    return {
      experimentId: 'wind_down',
      experimentName: 'Wind-down experiment',
      experimentDescription: 'A short evening routine can help test whether sleep feels easier to support in this window.',
      metrics: ['sleep', 'energy'],
      durationDays: 3,
      changeKey: 'lateNight',
    };
  }

  if ((hasMetric(signal, 'stress') && hasMetric(signal, 'sleep')) || metric === 'stress') {
    return {
      experimentId: 'evening_reset',
      experimentName: 'Evening reset experiment',
      experimentDescription: 'A lower-friction evening can help you test whether stressful days lead to lighter sleep.',
      metrics: ['stress', 'sleep', 'mood'],
      durationDays: 3,
      changeKey: 'stressfulDay',
    };
  }

  if (hasMetric(signal, 'energy') || hasMetric(signal, 'fatigue') || metric === 'energy' || metric === 'fatigue') {
    return {
      experimentId: 'morning_light',
      experimentName: 'Morning light experiment',
      experimentDescription: 'A steadier morning rhythm can help you test whether energy feels easier to lift and hold.',
      metrics: ['energy', 'fatigue', 'sleep'],
      durationDays: 3,
      changeKey: 'exercise',
    };
  }

  return null;
}

function suggestionForSignal(signal: InsightSignal): ExperimentSuggestion | null {
  const experiment = getExperimentForSignal(signal);
  if (!experiment) return null;
  const historyContext = getExperimentHistoryContext(experiment.experimentId);
  const note = historyContext.text
    ? `${experiment.experimentDescription} ${historyContext.text}`
    : experiment.experimentDescription;
  return {
    id: `experiment:${signal.id}`,
    title: `Try a ${experiment.experimentName.toLowerCase()}`,
    note,
    metrics: experiment.metrics,
    rank: signal.score + (signal.confidence === 'high' ? 10 : signal.confidence === 'medium' ? 6 : 2),
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
