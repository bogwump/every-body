import type { InsightSignal } from './insightEngine';

export type ExperimentSuggestion = {
  id: string;
  title: string;
  note: string;
  metrics: string[];
  rank: number;
};

function suggestionForSignal(signal: InsightSignal): ExperimentSuggestion | null {
  const metric = String(signal.metrics?.[0] ?? '');
  if (signal.id.includes('sleep_before_bleed') || metric === 'sleep') {
    return {
      id: `experiment:${signal.id}`,
      title: 'Try a 3-day evening wind-down experiment',
      note: 'A steadier evening routine can help test whether sleep feels easier to support here.',
      metrics: ['sleep', 'energy'],
      rank: signal.score + 10,
    };
  }
  if (metric === 'stress') {
    return {
      id: `experiment:${signal.id}`,
      title: 'Try a 3-day breathing-room experiment',
      note: 'Lighter evenings, fewer extras, or a calmer start can help test whether stress eases a little.',
      metrics: ['stress', 'mood'],
      rank: signal.score + 6,
    };
  }
  if (metric === 'energy' || metric === 'fatigue') {
    return {
      id: `experiment:${signal.id}`,
      title: 'Try a 3-day gentle energy experiment',
      note: 'Keep the basics steady and notice whether energy feels more even when you build gradually.',
      metrics: ['energy', 'fatigue', 'sleep'],
      rank: signal.score + 4,
    };
  }
  return null;
}

export function generateExperimentSuggestions(signals: InsightSignal[]): ExperimentSuggestion[] {
  const out: ExperimentSuggestion[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const suggestion = suggestionForSignal(signal);
    if (!suggestion) continue;
    if (seen.has(suggestion.title)) continue;
    seen.add(suggestion.title);
    out.push(suggestion);
  }
  return out;
}

export function rankExperimentSuggestions(suggestions: ExperimentSuggestion[]): ExperimentSuggestion[] {
  return suggestions.slice().sort((a, b) => b.rank - a.rank);
}
