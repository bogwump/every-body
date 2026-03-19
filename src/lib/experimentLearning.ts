import type { ExperimentHistoryItem, InsightMetricKey } from '../types';
import { getHelpfulPhrase } from './confidenceCopy';
import { getExperimentMatchKey, getExperimentOutcomeTone } from './experimentMeta';

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
    return Array.isArray(parsed) ? (parsed as ExperimentHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function isUsefulOutcome(status?: string): boolean {
  return status === 'helped';
}

function scoreOutcome(status?: string): number {
  if (status === 'helped') return 1;
  return 0;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function containsAny(blob: string, needles: string[]): boolean {
  return needles.some((needle) => blob.includes(needle));
}

function humanMetricLabel(metric: string): string {
  return String(metric || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toLowerCase())
    .trim();
}

function classifyExperiment(
  item: ExperimentHistoryItem,
): Omit<HelpfulPattern, 'confidence' | 'evidenceCount' | 'experimentIds' | 'lastEvidenceDate'> | null {
  const experimentId = String(item?.experimentId || '').toLowerCase();
  const changeKey = String(item?.changeKey || '').toLowerCase();
  const title = String(item?.title || '').toLowerCase();
  const note = String(item?.outcome?.note || '').toLowerCase();
  const blob = [experimentId, changeKey, title, note].join(' ');
  const metrics = (Array.isArray(item?.metrics) ? item.metrics : []).filter(Boolean) as InsightMetricKey[];
  const hasMetric = (key: string) => metrics.some((metric) => String(metric).toLowerCase() === key.toLowerCase());

  if (
    containsAny(blob, ['stressfulday', 'stressful day', 'evening reset', 'lower friction', 'low friction', 'calmer evening', 'gentler evening']) ||
    (hasMetric('stress') && (hasMetric('sleep') || hasMetric('mood')))
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'stress_sleep_link',
      intervention: 'lower_friction_evenings',
      metrics: uniq(['stress', 'sleep', 'mood', ...metrics]) as InsightMetricKey[],
      text: `Lower-friction evenings ${getHelpfulPhrase('high')} sleep after stressful days.`,
      shortText: `Lower-friction evenings ${getHelpfulPhrase('high')} sleep after stressful days.`,
    };
  }

  if (
    containsAny(blob, ['latenight', 'late night', 'bedtime', 'wind down', 'wind-down', 'sleep consistency', 'quieter evening', 'cooler evening']) ||
    (hasMetric('sleep') && containsAny(blob, ['evening', 'night', 'bed', 'sleep']))
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'sleep_support_general',
      intervention: 'sleep_support',
      metrics: uniq(['sleep', 'energy', ...metrics]) as InsightMetricKey[],
      text: `A steadier evening rhythm ${getHelpfulPhrase('moderate')} sleep feel easier to support.`,
      shortText: `A steadier evening rhythm ${getHelpfulPhrase('moderate')} sleep.`,
    };
  }

  if (
    containsAny(blob, ['exercise', 'movement', 'walk', 'morning', 'outside', 'light', 'stretch']) ||
    hasMetric('energy') ||
    hasMetric('fatigue') ||
    hasMetric('motivation') ||
    hasMetric('focus')
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'energy_support',
      intervention: 'steadier_rhythm',
      metrics: uniq(['energy', 'fatigue', 'focus', 'motivation', ...metrics]) as InsightMetricKey[],
      text: `A steadier daily rhythm ${getHelpfulPhrase('moderate')} your energy.`,
      shortText: `A steadier daily rhythm ${getHelpfulPhrase('moderate')} your energy.`,
    };
  }

  if (
    containsAny(blob, ['hydration', 'drink', 'water', 'fluid']) ||
    hasMetric('headache') ||
    hasMetric('dizziness')
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'hydration_support',
      intervention: 'hydration_support',
      metrics: uniq(['headache', 'energy', ...metrics]) as InsightMetricKey[],
      text: `A steadier hydration rhythm ${getHelpfulPhrase('moderate')} things feel a bit steadier.`,
      shortText: `A steadier hydration rhythm ${getHelpfulPhrase('moderate')}.`,
    };
  }

  if (
    containsAny(blob, ['caffeine', 'coffee', 'tea']) ||
    hasMetric('anxiety') ||
    hasMetric('insomnia') ||
    hasMetric('restlessLegs')
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'stimulation_load',
      intervention: 'caffeine_timing',
      metrics: uniq(['sleep', 'stress', 'restlessLegs', ...metrics]) as InsightMetricKey[],
      text: `Tweaking stimulation earlier in the day ${getHelpfulPhrase('moderate')} your evenings feel calmer.`,
      shortText: `Tweaking stimulation earlier ${getHelpfulPhrase('moderate')} calmer evenings.`,
    };
  }

  if (
    containsAny(blob, ['snack', 'meal', 'eat', 'food', 'nourish', 'nourishment', 'appetite', 'reflux']) ||
    hasMetric('appetite') ||
    hasMetric('acidReflux') ||
    hasMetric('nausea')
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'nourishment_support',
      intervention: 'food_timing',
      metrics: uniq(['appetite', 'energy', 'acidReflux', 'nausea', ...metrics]) as InsightMetricKey[],
      text: `More regular nourishment ${getHelpfulPhrase('moderate')} your body feel steadier.`,
      shortText: `More regular nourishment ${getHelpfulPhrase('moderate')} steadier days.`,
    };
  }

  if (
    containsAny(blob, ['recovery', 'rest', 'downtime', 'lighter', 'gentler', 'simpler', 'buffer', 'pacing', 'bandwidth', 'social']) ||
    hasMetric('stress') ||
    hasMetric('fatigue') ||
    hasMetric('brainFog') ||
    hasMetric('mood')
  ) {
    return {
      type: 'helpful_pattern',
      signal: 'recovery_buffer',
      intervention: 'gentler_pacing',
      metrics: uniq(['stress', 'fatigue', 'mood', 'brainFog', ...metrics]) as InsightMetricKey[],
      text: `Keeping things simpler ${getHelpfulPhrase('moderate')} when your system feels under more load.`,
      shortText: `Keeping things simpler ${getHelpfulPhrase('moderate')} under heavier days.`,
    };
  }

  if (metrics.length) {
    const primary = humanMetricLabel(String(metrics[0]));
    return {
      type: 'helpful_pattern',
      signal: `${primary.replace(/\s+/g, '_')}_support`,
      intervention: 'custom_support',
      metrics: uniq(metrics) as InsightMetricKey[],
      text: `One of your past experiments ${getHelpfulPhrase('low')} for ${primary}.`,
      shortText: `A past experiment ${getHelpfulPhrase('low')} for ${primary}.`,
    };
  }

  return {
    type: 'helpful_pattern',
    signal: 'general_support',
    intervention: 'custom_support',
    metrics: [] as InsightMetricKey[],
    text: `One of your past experiments ${getHelpfulPhrase('low')} before.`,
    shortText: `A past experiment ${getHelpfulPhrase('low')} before.`,
  };
}

export function getHelpfulPatternsFromExperiments(options?: { sinceDateISO?: string | null }): HelpfulPattern[] {
  const sinceDateISO = typeof options?.sinceDateISO === 'string' && options.sinceDateISO ? options.sinceDateISO : null;

  const history = readExperimentHistory().filter((item) => {
    if (!isUsefulOutcome(item?.outcome?.status)) return false;
    const completed = typeof item?.outcome?.completedAtISO === 'string' ? item.outcome.completedAtISO.slice(0, 10) : '';
    if (sinceDateISO && completed && completed < sinceDateISO) return false;
    return true;
  });

  const grouped = new Map<
    string,
    {
      base: Omit<HelpfulPattern, 'confidence' | 'evidenceCount' | 'experimentIds' | 'lastEvidenceDate'>;
      score: number;
      evidenceCount: number;
      experimentIds: string[];
      lastEvidenceDate?: string;
    }
  >();

  for (const item of history) {
    const base = classifyExperiment(item);
    if (!base) continue;
    const key = `${base.signal}::${base.intervention}`;
    const existing =
      grouped.get(key) ??
      {
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
        group.score >= 2 ? 'high' : group.score >= 1 ? 'moderate' : 'very_low';

      return {
        ...group.base,
        confidence,
        evidenceCount: group.evidenceCount,
        experimentIds: uniq(group.experimentIds.filter(Boolean)),
        lastEvidenceDate: group.lastEvidenceDate,
      } satisfies HelpfulPattern;
    })
    .sort((a, b) => {
      const conf =
        (a.confidence === 'high' ? 2 : a.confidence === 'moderate' ? 1 : 0) -
        (b.confidence === 'high' ? 2 : b.confidence === 'moderate' ? 1 : 0);
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
  return getHelpfulPatternsFromExperiments().filter((item) =>
    item.metrics.some((metric) => wanted.includes(String(metric).toLowerCase())),
  );
}

export function getExperimentHistoryContext(
  experimentId: string,
  sample?: Partial<ExperimentHistoryItem> | null,
): { tone: 'helped' | 'mixed' | null; text: string | null; runCount?: number } {
  const history = readExperimentHistory();
  const sampleLike = sample ?? ({ experimentId } as Partial<ExperimentHistoryItem>);
  const targetKey = getExperimentMatchKey(sampleLike as any);
  const directTarget = String(experimentId || '').toLowerCase();

  const matches = history
    .filter((item) => {
      const sameKey = targetKey ? getExperimentMatchKey(item as any) === targetKey : false;
      const sameId = directTarget ? String(item?.experimentId || '').toLowerCase() === directTarget : false;
      return sameKey || sameId;
    })
    .sort((a, b) =>
      String(b?.outcome?.completedAtISO || b?.startDateISO || '').localeCompare(
        String(a?.outcome?.completedAtISO || a?.startDateISO || ''),
      ),
    );

  if (!matches.length) return { tone: null, text: null, runCount: 0 };

  const helpful = matches.filter((item) => item?.outcome?.status === 'helped').length;
  const mixed = matches.filter((item) => item?.outcome?.status === 'notReally').length;
  const unclear = matches.filter((item) => item?.outcome?.status === 'abandoned' || item?.outcome?.status === 'stopped').length;
  const latest = matches[0];
  const latestTone = getExperimentOutcomeTone(latest?.outcome?.status);

  if (helpful > 0) {
    return {
      tone: 'helped',
      text:
        matches.length > 1
          ? `You have tried something similar ${matches.length} times. The latest run looked ${latestTone}.`
          : 'A similar experiment looked helpful before. Worth trying again?',
      runCount: matches.length,
    };
  }

  if (mixed > 0 || unclear > 0) {
    return {
      tone: 'mixed',
      text:
        matches.length > 1
          ? `You have tried something similar ${matches.length} times. So far the results have looked mixed.`
          : 'You have tested something similar before. Results looked mixed.',
      runCount: matches.length,
    };
  }

  return { tone: null, text: null, runCount: matches.length };
}
