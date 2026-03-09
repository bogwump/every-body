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

function mapMomentToEvent(moment: CompanionMoment): TimelineEvent | null {
  const data = (moment.data && typeof moment.data === 'object') ? moment.data : {};
  switch (moment.type) {
    case 'new_pattern':
      return {
        id: `moment:${moment.id}`,
        type: 'pattern_discovered',
        date: moment.date,
        title: typeof (data as any).title === 'string' ? String((data as any).title) : 'New pattern spotted',
        description: typeof (data as any).body === 'string' ? String((data as any).body) : 'A repeat pattern has started to look meaningful enough to keep in view.',
        source: 'moments',
        actionLabel: 'View insights',
        actionTarget: 'insights',
        metadata: { signalId: (data as any).signalId },
      };
    case 'helpful_pattern_detected':
      return {
        id: `moment:${moment.id}`,
        type: 'helpful_pattern',
        date: moment.date,
        title: typeof (data as any).title === 'string' ? String((data as any).title) : 'Something that seems to help',
        description: typeof (data as any).body === 'string' ? String((data as any).body) : 'Your past experiments have started pointing to something that may help here.',
        source: 'moments',
        actionLabel: 'View insights',
        actionTarget: 'insights',
        metadata: { signalId: (data as any).signalId },
      };
    case 'rhythm_shift':
      return {
        id: `moment:${moment.id}`,
        type: 'rhythm_shift',
        date: moment.date,
        title: typeof (data as any).title === 'string' ? String((data as any).title) : 'Rhythm shift noticed',
        description: typeof (data as any).body === 'string' ? String((data as any).body) : 'Something about your rhythm has looked a little different lately.',
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
    title: 'New pattern spotted',
    description: 'One of your signals has started to look more repeatable over time.',
    source: 'insights' as const,
    actionLabel: 'View insights',
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
      title: 'Something that seems to help',
      description: item.text,
      source: 'experiments' as const,
      actionLabel: 'View insights',
      actionTarget: 'insights',
      metadata: {
        signal: item.signal,
        intervention: item.intervention,
        confidence: item.confidence,
        evidenceCount: item.evidenceCount,
      },
    }));

  const fromMoments = getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'helpful_pattern');

  return [...helpful, ...fromMoments];
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
    const digestSummary = typeof item?.outcome?.digest?.summarySentence === 'string' ? item.outcome.digest.summarySentence : '';

    if (experimentId && isISODate(startDateISO)) {
      events.push({
        id: `experiment-started:${experimentId}:${startDateISO}`,
        type: 'experiment_started',
        date: startDateISO,
        title: 'Experiment started',
        description: `${title} started as a small test to see what might help.`,
        source: 'experiments',
        actionLabel: 'View insights',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title },
      });
    }

    if (experimentId && isISODate(completedAtISO)) {
      events.push({
        id: `experiment-completed:${experimentId}:${completedAtISO}`,
        type: 'experiment_completed',
        date: completedAtISO,
        title: 'Experiment completed',
        description: `${title} finished.${digestSummary ? ` ${digestSummary}` : ''}`,
        source: 'experiments',
        actionLabel: 'View results',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, status },
      });
    }

    if (experimentId && isISODate(completedAtISO) && status === 'helped') {
      events.push({
        id: `experiment-helped:${experimentId}:${completedAtISO}:history`,
        type: 'experiment_helped',
        date: completedAtISO,
        title: 'Experiment looked helpful',
        description: digestSummary || `${title} seemed to support this area for you.`,
        source: 'experiments',
        actionLabel: 'View results',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title },
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
    const desc = item.result === 'helpful'
      ? `${title} looked helpful enough to be worth remembering.`
      : `${title} seemed a little helpful, even if the signal was still early.`;
    events.push({
      id: `experiment-helped:${experimentId}:${date}:outcome`,
      type: 'experiment_helped',
      date,
      title: 'Experiment looked helpful',
      description: desc,
      source: 'experiments',
      actionLabel: 'View results',
      actionTarget: 'insights:experiments',
      metadata: { experimentId, title, result: item.result },
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
