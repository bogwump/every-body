import { getCompanionMoments, type CompanionMoment } from './companionMoments';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { safeFormatMonthYearFromKey } from './browserSafe';
import { getExperimentOutcomes } from './experimentOutcomes';
import { getDiscoveredPatterns } from './insightEngine';
import { getPhaseHistory } from './phaseHistory';
import { phaseLabelFromKey } from './phaseChange';

export type TimelineEvent = {
  id: string;
  type:
    | 'phase_change'
    | 'pattern_discovered'
    | 'helpful_pattern'
    | 'experiment_started'
    | 'experiment_completed'
    | 'experiment_helped'
    | 'rhythm_shift';
  date: string;
  title: string;
  description: string;
  evidence?: string;
  source: 'phase' | 'insights' | 'experiments' | 'rhythm' | 'moments';
  actionLabel?: string;
  actionTarget?: string;
  metadata?: Record<string, unknown>;
};

export type TimelineFilter = 'all' | 'patterns' | 'experiments' | 'rhythm';

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function datePart(value?: string): string {
  if (!value || typeof value !== 'string') return '';
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function readExperimentHistory(): any[] {
  try {
    const raw = localStorage.getItem('everybody:v2:experiment_history');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function phaseDescription(phase: string): string {
  switch (phase) {
    case 'reset':
      return 'A more inward phase where rest, comfort, and softer pacing may matter more.';
    case 'rebuilding':
      return 'Energy and motivation often begin lifting a little in this phase.';
    case 'expressive':
      return 'This phase can bring a bit more outward energy, confidence, or momentum.';
    case 'protective':
      return 'This phase can ask for gentler pacing and a little more protection around energy.';
    default:
      return 'Your rhythm shifted into a new phase.';
  }
}

function toTitleCase(text: string): string {
  return String(text || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function metricLabel(metric: string): string {
  const map: Record<string, string> = {
    mood: 'mood',
    sleep: 'sleep',
    energy: 'energy',
    fatigue: 'fatigue',
    stress: 'stress',
    brainFog: 'brain fog',
    appetite: 'appetite',
    pain: 'pain',
    flow: 'bleeding',
    digestion: 'digestion',
    anxiety: 'anxiety',
    irritability: 'irritability',
  };
  return map[metric] || String(metric).replace(/^custom:/, '').replace(/([A-Z])/g, ' $1').toLowerCase();
}

function tidySentence(text: string, fallback: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return fallback;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function metricsSummary(metrics: unknown): string {
  const list = Array.isArray(metrics) ? metrics.map((metric) => metricLabel(String(metric))).filter(Boolean) : [];
  if (!list.length) return 'your chosen focus area';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function describeSignalId(signalId: string): string {
  const id = String(signalId || '').toLowerCase();
  if (id.includes('sleep_before_bleed')) return 'Sleep tends to dip before bleeding starts.';
  if (id.includes('stress') && id.includes('sleep')) return 'Stress and sleep often move together.';
  if (id.includes('brainfog') || id.includes('brain_fog')) return 'Brain fog has started to show a repeat pattern.';
  if (id.includes('night') && id.includes('sweat')) return 'Night sweats have started to show a repeat pattern.';
  if (id.includes('weekday') && id.includes('brainfog')) return 'Brain fog has started to show a mid-week pattern.';
  if (id.includes('weekday')) return 'One of your symptoms has started to show a day-of-week pattern.';
  if (id.includes('trend')) return 'One of your symptoms has started to shift over time.';
  if (id.includes('phase')) {
    const metricGuess = id
      .split(/[:_-]/)
      .find((part) => ['sleep', 'energy', 'mood', 'stress', 'pain', 'brainfog', 'fatigue', 'appetite'].includes(part));
    if (metricGuess) return `${toTitleCase(metricLabel(metricGuess))} tends to shift with your rhythm.`;
  }
  return 'One of your signals has started to look more repeatable over time.';
}

function helpfulEvidenceText(item: { evidenceCount?: number; experimentIds?: string[]; confidence?: string }): string {
  const count = Number(item.evidenceCount || 0);
  const experiments = Array.isArray(item.experimentIds) ? item.experimentIds.filter(Boolean).length : 0;
  if (count > 0) {
    return `Based on ${count} helpful experiment result${count === 1 ? '' : 's'}${experiments > count ? ' and related tracking history' : ''}.`;
  }
  if (item.confidence === 'high' || item.confidence === 'moderate') {
    return 'Based on past experiment results that looked helpful.';
  }
  return 'Based on experiment history and symptom logs.';
}

function mapMomentToEvent(moment: CompanionMoment): TimelineEvent | null {
  const data = moment.data && typeof moment.data === 'object' ? moment.data : {};
  switch (moment.type) {
    case 'new_pattern': {
      const signalText = typeof (data as any).body === 'string' && String((data as any).body).trim()
        ? tidySentence(String((data as any).body), 'A repeat pattern has started to look meaningful enough to keep in view.')
        : describeSignalId(String((data as any).signalId || ''));
      return {
        id: `moment:${moment.id}`,
        type: 'pattern_discovered',
        date: moment.date,
        title: 'Pattern discovered',
        description: signalText,
        evidence: 'Saved from a companion update when this pattern first started to stand out.',
        source: 'moments',
        actionLabel: 'Open related insight',
        actionTarget: 'insights',
        metadata: { signalId: (data as any).signalId },
      };
    }
    case 'helpful_pattern_detected': {
      const body = typeof (data as any).body === 'string' ? String((data as any).body) : '';
      return {
        id: `moment:${moment.id}`,
        type: 'helpful_pattern',
        date: moment.date,
        title: 'Helpful pattern identified',
        description: tidySentence(body, 'A past experiment or pattern looked worth keeping in mind.'),
        evidence: 'Saved from a companion update based on earlier experiments and tracking history.',
        source: 'moments',
        actionLabel: 'Review helpful insight',
        actionTarget: 'insights',
        metadata: { signalId: (data as any).signalId },
      };
    }
    case 'rhythm_shift':
      return {
        id: `moment:${moment.id}`,
        type: 'rhythm_shift',
        date: moment.date,
        title: typeof (data as any).title === 'string' ? String((data as any).title) : 'Rhythm shift noticed',
        description: tidySentence(typeof (data as any).body === 'string' ? String((data as any).body) : '', 'Something about your rhythm has looked a little different lately.'),
        evidence: 'Based on recent rhythm timing and phase history.',
        source: 'rhythm',
        actionLabel: 'Open rhythm',
        actionTarget: 'rhythm',
      };
    default:
      return null;
  }
}

function buildPhaseEvents(): TimelineEvent[] {
  return getPhaseHistory()
    .map((entry) => {
      const phase = String(entry.phase || '');
      const date = String(entry.startDate || '');
      if (!phase || !isISODate(date)) return null;
      return {
        id: `phase:${phase}:${date}`,
        type: 'phase_change' as const,
        date,
        title: `Entered ${phaseLabelFromKey(phase)}`,
        description: phaseDescription(phase),
        evidence: 'Based on your saved phase history.',
        source: 'phase' as const,
        actionLabel: 'Open rhythm',
        actionTarget: 'rhythm',
        metadata: {
          phase,
          duration: entry.duration,
          endDate: entry.endDate,
        },
      };
    })
    .filter((item): item is TimelineEvent => Boolean(item));
}

function buildPatternEvents(): TimelineEvent[] {
  const fromDiscoveries = getDiscoveredPatterns().map((item) => ({
    id: `discovery:${item.id}:${item.firstDetected}`,
    type: 'pattern_discovered' as const,
    date: item.firstDetected,
    title: 'Pattern discovered',
    description: describeSignalId(item.id),
    evidence: 'Saved when this pattern first looked strong enough to keep in your history.',
    source: 'insights' as const,
    actionLabel: 'Open related insight',
    actionTarget: 'insights',
    metadata: {
      signalId: item.id,
      confidence: item.confidence,
    },
  }));

  const fromMoments = getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'pattern_discovered');

  return [...fromDiscoveries, ...fromMoments];
}

function buildHelpfulPatternEvents(): TimelineEvent[] {
  const helpful = getHelpfulPatternsFromExperiments()
    .filter((item) => item.confidence === 'moderate' || item.confidence === 'high')
    .map((item) => ({
      id: `helpful:${item.signal}:${item.intervention}:${item.lastEvidenceDate || ''}`,
      type: 'helpful_pattern' as const,
      date: item.lastEvidenceDate || '9999-12-31',
      title: 'Helpful pattern identified',
      description: tidySentence(item.text, 'A past experiment or pattern looked worth keeping in mind.'),
      evidence: helpfulEvidenceText(item),
      source: 'experiments' as const,
      actionLabel: 'Review helpful insight',
      actionTarget: 'insights',
      metadata: {
        signal: item.signal,
        intervention: item.intervention,
        confidence: item.confidence,
        evidenceCount: item.evidenceCount,
        experimentIds: item.experimentIds,
      },
    }));

  const fromMoments = getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'helpful_pattern');

  return [...helpful, ...fromMoments];
}

function outcomeLabel(status?: string): string {
  if (status === 'helped') return 'helpful';
  if (status === 'notReally') return 'slightly helpful';
  if (status === 'stopped') return 'stopped early';
  if (status === 'abandoned') return 'unclear';
  return 'unclear';
}

function buildExperimentEvents(): TimelineEvent[] {
  const history = readExperimentHistory();
  const outcomes = getExperimentOutcomes();
  const events: TimelineEvent[] = [];

  history.forEach((item) => {
    const experimentId = String(item?.experimentId || item?.id || '').trim();
    const title = String(item?.title || 'Your experiment').trim() || 'Your experiment';
    const startDateISO = String(item?.startDateISO || '').slice(0, 10);
    const completedAtISO = datePart(item?.outcome?.completedAtISO);
    const status = String(item?.outcome?.status || '');
    const digestSummary = typeof item?.outcome?.digest?.summarySentence === 'string' ? String(item.outcome.digest.summarySentence) : '';
    const metrics = metricsSummary(item?.metrics);

    if (experimentId && isISODate(startDateISO)) {
      events.push({
        id: `experiment-started:${experimentId}:${startDateISO}`,
        type: 'experiment_started',
        date: startDateISO,
        title: `${title} started`,
        description: `This experiment was set up to explore ${metrics}.`,
        evidence: `Started as a ${item?.durationDays || 0}-day test${item?.durationDays ? '' : ''} based on your experiment plan.`,
        source: 'experiments',
        actionLabel: 'View experiment setup',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, metrics: item?.metrics },
      });
    }

    if (experimentId && isISODate(completedAtISO)) {
      events.push({
        id: `experiment-completed:${experimentId}:${completedAtISO}`,
        type: 'experiment_completed',
        date: completedAtISO,
        title: `${title} completed`,
        description: digestSummary
          ? tidySentence(digestSummary, `${title} finished.`)
          : `${title} finished with a ${outcomeLabel(status)} result.`,
        evidence: `Result logged as ${outcomeLabel(status)} for ${metrics}.`,
        source: 'experiments',
        actionLabel: 'View experiment result',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, status, metrics: item?.metrics },
      });
    }

    if (experimentId && isISODate(completedAtISO) && (status === 'helped' || status === 'notReally')) {
      events.push({
        id: `experiment-helped:${experimentId}:${completedAtISO}:history`,
        type: 'experiment_helped',
        date: completedAtISO,
        title: `${title} looked ${status === 'helped' ? 'helpful' : 'slightly helpful'}`,
        description: digestSummary
          ? tidySentence(digestSummary, `${title} looked worth remembering.`)
          : `${title} appeared to support ${metrics}.`,
        evidence: `Taken from the experiment result you saved for ${metrics}.`,
        source: 'experiments',
        actionLabel: 'View experiment result',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, status, metrics: item?.metrics },
      });
    }
  });

  outcomes.forEach((item) => {
    const experimentId = String(item?.experimentId || '').trim();
    const date = String(item?.date || '').slice(0, 10);
    if (!experimentId || !isISODate(date)) return;
    if (item.result !== 'helpful' && item.result !== 'slightly_helpful') return;
    const matching = history.find((entry) => String(entry?.experimentId || '').trim() === experimentId);
    const title = String(matching?.title || 'Your experiment').trim() || 'Your experiment';
    const metrics = metricsSummary(matching?.metrics);
    const desc = item.result === 'helpful'
      ? `${title} appeared to support ${metrics}.`
      : `${title} showed an early signal that may support ${metrics}.`;
    events.push({
      id: `experiment-helped:${experimentId}:${date}:outcome`,
      type: 'experiment_helped',
      date,
      title: `${title} looked ${item.result === 'helpful' ? 'helpful' : 'slightly helpful'}`,
      description: desc,
      evidence: 'Taken from your saved experiment outcome.',
      source: 'experiments',
      actionLabel: 'View experiment result',
      actionTarget: 'insights:experiments',
      metadata: { experimentId, title, result: item.result, metrics: matching?.metrics },
    });
  });

  return events;
}

function buildRhythmEvents(): TimelineEvent[] {
  return getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'rhythm_shift');
}

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.slice().sort((a, b) => {
    const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function dedupeTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];

  for (const event of sortTimelineEvents(events)) {
    const meta = event.metadata ?? {};
    const signature = [
      event.type,
      event.date,
      String(meta.experimentId || ''),
      String(meta.signalId || meta.signal || ''),
      event.title.trim().toLowerCase(),
      event.description.trim().toLowerCase(),
    ].join('::');

    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(event);
  }

  return out;
}

export function filterTimelineEvents(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  if (filter === 'all') return events;
  if (filter === 'patterns') return events.filter((event) => event.type === 'pattern_discovered' || event.type === 'helpful_pattern');
  if (filter === 'experiments') return events.filter((event) => event.type === 'experiment_started' || event.type === 'experiment_completed' || event.type === 'experiment_helped');
  if (filter === 'rhythm') return events.filter((event) => event.type === 'phase_change' || event.type === 'rhythm_shift');
  return events;
}

export function countPatternEvents(events: TimelineEvent[]): number {
  return events.filter((event) => event.type === 'pattern_discovered').length;
}

export function countHelpfulExperiments(events: TimelineEvent[]): number {
  return events.filter((event) => event.type === 'experiment_helped').length;
}

export function countPhaseChanges(events: TimelineEvent[]): number {
  return events.filter((event) => event.type === 'phase_change' || event.type === 'rhythm_shift').length;
}

export function getTimelineSummary(events: TimelineEvent[]) {
  return {
    patterns: countPatternEvents(events),
    helpfulExperiments: countHelpfulExperiments(events),
    phaseChanges: countPhaseChanges(events),
  };
}

export function groupEventsByMonth(events: TimelineEvent[]): Array<{ label: string; events: TimelineEvent[] }> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = String(event.date || '').slice(0, 7);
    if (!key) continue;
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const label = safeFormatMonthYearFromKey(key);
      return { label, events: sortTimelineEvents(items) };
    });
}

export function buildTimelineEvents(limit = 40): TimelineEvent[] {
  const all = [
    ...buildPhaseEvents(),
    ...buildPatternEvents(),
    ...buildHelpfulPatternEvents(),
    ...buildExperimentEvents(),
    ...buildRhythmEvents(),
  ];

  return dedupeTimelineEvents(all).slice(0, Math.max(1, Math.min(50, limit)));
}
