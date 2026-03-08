import type { ExperimentHistoryItem, InsightMetricKey } from '../types';
import { getHelpfulPhrase } from './confidenceCopy';

export type HelpfulMemoryConfidence = 'very_low' | 'low' | 'moderate' | 'high';

export type HelpfulPattern = {
  type: 'helpful_pattern';
  signal: string;
  intervention: string;
  confidence: HelpfulMemoryConfidence;
  evidenceCount: number;
  experimentIds: string[];
  metrics: InsightMetricKey[];
  text: string;
  shortText: string;
  lastEvidenceDate?: string;
};

function readExperimentHistory(): ExperimentHistoryItem[] {
  try {
    const raw = localStorage.getItem('everybody:v2:experiment_history');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as ExperimentHistoryItem[] : [];
  } catch {
    return [];
  }
}

function isUsefulOutcome(status?: string): boolean {
  return status === 'helped' || status === 'notReally';
}

function scoreOutcome(status?: string): number {
  if (status === 'helped') return 1;
  if (status === 'notReally') return 0.6;
  return 0;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function classifyExperiment(item: ExperimentHistoryItem): Omit<HelpfulPattern, 'confidence' | 'evidenceCount' | 'experimentIds' | 'lastEvidenceDate'> | null {
  const experimentId = String(item?.experimentId || '').toLowerCase();
  const changeKey = String(item?.changeKey || '').toLowerCase();
  const metrics = (Array.isArray(item?.metrics) ? item.metrics : []).filter(Boolean) as InsightMetricKey[];
  const hasMetric = (key: string) => metrics.some((metric) => String(metric) === key);

  if (experimentId.includes('wind_down') || changeKey === 'latenight' || changeKey === 'lateNight'.toLowerCase()) {
    return {
      type: 'helpful_pattern',
      signal: 'sleep_before_bleed',
      intervention: 'wind_down_routine',
      metrics: uniq(['sleep', 'energy', ...metrics]) as InsightMetricKey[],
      text: `Earlier nights ${getHelpfulPhrase('high')} your sleep quality.`,
      shortText: `Earlier nights ${getHelpfulPhrase('high')} your sleep quality.`,
    };
  }

  if (experimentId.includes('evening_reset') || changeKey === 'stressfulday' || (hasMetric('stress') && hasMetric('sleep'))) {
    return {
      type: 'helpful_pattern',
      signal: 'stress_sleep_link',
      intervention: 'lower_friction_evenings',
      metrics: uniq(['stress', 'sleep', 'mood', ...metrics]) as InsightMetricKey[],
      text: `Lower-friction evenings ${getHelpfulPhrase('high')} sleep after stressful days.`,
      shortText: `Lower-friction evenings ${getHelpfulPhrase('high')} sleep after stressful days.`,
    };
  }

  if (experimentId.includes('morning_light') || hasMetric('energy') || hasMetric('fatigue')) {
    return {
      type: 'helpful_pattern',
      signal: 'energy_morning_boost',
      intervention: 'morning_rhythm',
      metrics: uniq(['energy', 'fatigue', 'sleep', ...metrics]) as InsightMetricKey[],
      text: `A steadier morning rhythm ${getHelpfulPhrase('high')} your energy.`,
      shortText: `A steadier morning rhythm ${getHelpfulPhrase('high')} your energy.`,
    };
  }

  if (hasMetric('appetite')) {
    return {
      type: 'helpful_pattern',
      signal: 'cravings_protective',
      intervention: 'snack_timing',
      metrics: uniq(['appetite', 'energy', ...metrics]) as InsightMetricKey[],
      text: `Having snacks ready earlier ${getHelpfulPhrase('moderate')} steadier energy.`,
      shortText: `Having snacks ready earlier ${getHelpfulPhrase('moderate')} steadier energy.`,
    };
  }

  if (hasMetric('sleep')) {
    return {
      type: 'helpful_pattern',
      signal: 'sleep_support_general',
      intervention: 'sleep_support',
      metrics: uniq(['sleep', ...metrics]) as InsightMetricKey[],
      text: `Earlier nights ${getHelpfulPhrase('low')} for your sleep.`,
      shortText: `Earlier nights ${getHelpfulPhrase('low')} for your sleep.`,
    };
  }

  return null;
}

export function getHelpfulPatternsFromExperiments(): HelpfulPattern[] {
  const history = readExperimentHistory().filter((item) => isUsefulOutcome(item?.outcome?.status));
  const grouped = new Map<string, {
    base: Omit<HelpfulPattern, 'confidence' | 'evidenceCount' | 'experimentIds' | 'lastEvidenceDate'>;
    score: number;
    evidenceCount: number;
    experimentIds: string[];
    lastEvidenceDate?: string;
  }>();

  for (const item of history) {
    const base = classifyExperiment(item);
    if (!base) continue;
    const key = `${base.signal}::${base.intervention}`;
    const existing = grouped.get(key) ?? {
      base,
      score: 0,
      evidenceCount: 0,
      experimentIds: [],
      lastEvidenceDate: undefined,
    };

    existing.score += scoreOutcome(item?.outcome?.status);
    existing.evidenceCount += 1;
    existing.experimentIds.push(String(item.experimentId || ''));
    const completed = typeof item?.outcome?.completedAtISO === 'string' ? item.outcome.completedAtISO.slice(0, 10) : '';
    if (completed && (!existing.lastEvidenceDate || completed > existing.lastEvidenceDate)) {
      existing.lastEvidenceDate = completed;
    }
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const confidence: HelpfulMemoryConfidence =
        group.score >= 2 ? 'high' :
        group.score >= 1 ? 'moderate' :
        'very_low';
      return {
        ...group.base,
        confidence,
        evidenceCount: group.evidenceCount,
        experimentIds: uniq(group.experimentIds.filter(Boolean)),
        lastEvidenceDate: group.lastEvidenceDate,
      } satisfies HelpfulPattern;
    })
    .sort((a, b) => {
      const conf = (a.confidence === 'high' ? 2 : a.confidence === 'moderate' ? 1 : 0) - (b.confidence === 'high' ? 2 : b.confidence === 'moderate' ? 1 : 0);
      if (conf !== 0) return -conf;
      return (b.lastEvidenceDate || '').localeCompare(a.lastEvidenceDate || '');
    });
}

export function getExperimentsForSignal(signal: string): HelpfulPattern[] {
  const target = String(signal || '').toLowerCase();
  return getHelpfulPatternsFromExperiments().filter((item) => {
    if (item.signal.toLowerCase() === target) return true;
    if (target.includes(item.signal.toLowerCase())) return true;
    return item.metrics.some((metric) => target.includes(String(metric).toLowerCase()));
  });
}

export function getSignalsHelpedByExperiment(experimentId: string): string[] {
  const target = String(experimentId || '').toLowerCase();
  return getHelpfulPatternsFromExperiments()
    .filter((item) => item.experimentIds.some((id) => String(id).toLowerCase() === target))
    .map((item) => item.signal);
}

export function getHelpfulPatternsForMetrics(metrics: Array<string | InsightMetricKey>): HelpfulPattern[] {
  const wanted = (Array.isArray(metrics) ? metrics : []).map((metric) => String(metric).toLowerCase());
  return getHelpfulPatternsFromExperiments().filter((item) => item.metrics.some((metric) => wanted.includes(String(metric).toLowerCase())));
}

export function getExperimentHistoryContext(experimentId: string): { tone: 'helped' | 'mixed' | null; text: string | null } {
  const target = String(experimentId || '').toLowerCase();
  const history = readExperimentHistory().filter((item) => String(item?.experimentId || '').toLowerCase() === target);
  if (!history.length) return { tone: null, text: null };

  const helpful = history.filter((item) => item?.outcome?.status === 'helped').length;
  const slight = history.filter((item) => item?.outcome?.status === 'notReally').length;
  const unclear = history.filter((item) => item?.outcome?.status === 'abandoned' || item?.outcome?.status === 'stopped').length;

  if (helpful > 0) {
    return { tone: 'helped', text: 'A similar experiment looked helpful before. Worth trying again?' };
  }
  if (slight > 0 || unclear > 0) {
    return { tone: 'mixed', text: 'You have tested something similar before. Results looked mixed.' };
  }

  return { tone: null, text: null };
}
