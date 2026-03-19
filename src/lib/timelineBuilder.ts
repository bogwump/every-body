import { getArchivedMomentSnapshots, getCompanionMoments, type ArchivedCompanionMoment, type CompanionMoment } from './companionMoments';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { compareExperimentOutcomes, findPreviousExperimentRun, getExperimentMatchKey, getExperimentOutcomeThreadText, getExperimentOutcomeTone } from './experimentMeta';
import { safeFormatMonthYearFromKey } from './browserSafe';
import { getDiscoveredPatterns } from './insightEngine';
import { getPhaseHistory } from './phaseHistory';
import { phaseLabelFromKey } from './phaseChange';
import { getPatternFeedback, getPatternFeedbackIdFromMetrics, listPatternFeedbackHistory, type PatternFeedbackHistoryEntry } from './patternFeedback';

export type TimelineEvent = {
  id: string;
  type:
    | 'phase_change'
    | 'pattern_discovered'
    | 'pattern_strengthened'
    | 'helpful_pattern'
    | 'experiment_started'
    | 'experiment_completed'
    | 'experiment_helped'
    | 'rhythm_shift';
  date: string;
  title: string;
  description: string;
  evidence?: string;
  signals?: string[];
  confidence?: string;
  source: 'phase' | 'insights' | 'experiments' | 'rhythm' | 'moments' | 'archive';
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


function confidenceSnapshotText(confidence: unknown): string {
  if (typeof confidence === 'number') {
    if (confidence >= 0.85) return 'It had started to look fairly reliable at the time.';
    if (confidence >= 0.65) return 'It had started to look more consistent at the time.';
    if (confidence >= 0.45) return 'It was still early, but repeatable enough to save.';
    return 'It was still emerging, but worth keeping in view.';
  }

  const value = String(confidence || '').toLowerCase();
  if (value === 'high') return 'It had started to look fairly reliable at the time.';
  if (value === 'moderate' || value === 'medium') return 'It had started to look more consistent at the time.';
  if (value === 'low') return 'It was still early, but repeatable enough to save.';
  if (value === 'very_low') return 'It was still emerging, but worth keeping in view.';
  return '';
}

function discoveryEvidenceText(confidence: unknown): string {
  const snapshot = confidenceSnapshotText(confidence);
  return snapshot
    ? `Saved when this pattern first looked strong enough to keep in your history. ${snapshot}`
    : 'Saved when this pattern first looked strong enough to keep in your history.';
}

function metricsSummary(metrics: unknown): string {
  const list = Array.isArray(metrics) ? metrics.map((metric) => metricLabel(String(metric))).filter(Boolean) : [];
  return list;
}

function describeSignalId(signalId: string): { description: string; signals: string[] } {
  const id = String(signalId || '').toLowerCase();
  if (id.includes('sleep_before_bleed')) {
    return { description: 'Sleep tends to dip before bleeding starts.', signals: ['sleep', 'bleeding'] };
  }
  if (id.includes('stress') && id.includes('sleep')) {
    return { description: 'Stress and sleep often move together.', signals: ['stress', 'sleep'] };
  }
  if (id.includes('brainfog') || id.includes('brain_fog')) {
    return { description: 'Brain fog has started to show a repeat pattern.', signals: ['brain fog'] };
  }
  if (id.includes('night') && id.includes('sweat')) {
    return { description: 'Night sweats have started to show a repeat pattern.', signals: ['night sweats'] };
  }
  if (id.includes('weekday') && id.includes('brainfog')) {
    return { description: 'Brain fog has started to show a mid-week pattern.', signals: ['brain fog'] };
  }
  if (id.includes('weekday')) {
    return { description: 'One of your symptoms has started to show a day-of-week pattern.', signals: [] };
  }
  if (id.includes('trend')) {
    return { description: 'One of your symptoms has started to shift over time.', signals: [] };
  }
  if (id.includes('phase')) {
    const metricGuess = id
      .split(/[:_-]/)
      .find((part) => ['sleep', 'energy', 'mood', 'stress', 'pain', 'brainfog', 'fatigue', 'appetite'].includes(part));
    if (metricGuess) {
      return { description: `${toTitleCase(metricLabel(metricGuess))} tends to shift with your rhythm.`, signals: [metricLabel(metricGuess)] };
    }
  }
  return { description: 'One of your signals has started to look more repeatable over time.', signals: [] };
}

function helpfulEvidenceText(item: { evidenceCount?: number; experimentIds?: string[]; confidence?: string }): string {
  const count = Number(item.evidenceCount || 0);
  if (count > 0) {
    return `Based on ${count} helpful experiment result${count === 1 ? '' : 's'} and related tracking history.`;
  }
  if (item.confidence === 'high' || item.confidence === 'moderate') {
    return 'Based on past experiment results that looked helpful.';
  }
  return 'Based on experiment history and symptom logs.';
}


function getInsightTargetForSignals(signals: string[] | undefined, kind?: string): string {
  const joined = (Array.isArray(signals) ? signals : []).join(' ').toLowerCase();
  if (kind === 'helpful_pattern') return 'insights:helpful';
  if (joined.includes('sleep') || joined.includes('restless legs') || joined.includes('restlesslegs')) return 'insights:sleep';
  return 'insights:connections';
}

function resolveInsightTarget(rawTarget: string | undefined, signals: string[] | undefined, kind?: string): string {
  const target = String(rawTarget || '').trim().toLowerCase();
  if (!target || target === 'insights' || target === 'insights:full-insights' || target === 'insights:full_insights') {
    return getInsightTargetForSignals(signals, kind);
  }
  return rawTarget as string;
}

function patternSignalsFromData(data: Record<string, unknown>): string[] {
  const raw = Array.isArray((data as any).signals) ? (data as any).signals : [];
  if (!raw.length && typeof (data as any).signalId === 'string') return describeSignalId(String((data as any).signalId)).signals;
  return raw.map((item) => metricLabel(String(item))).filter(Boolean);
}

function mapMomentToEvent(moment: CompanionMoment): TimelineEvent | null {
  const data = moment.data && typeof moment.data === 'object' ? moment.data as Record<string, unknown> : {};
  switch (moment.type) {
    case 'new_pattern': {
      const described = describeSignalId(String((data as any).signalId || ''));
      return {
        id: `moment:${moment.id}`,
        type: 'pattern_discovered',
        date: moment.date,
        title: 'Pattern discovered',
        description: tidySentence(typeof (data as any).body === 'string' ? String((data as any).body) : '', described.description),
        evidence: 'Saved from the moment this pattern first started to stand out.',
        signals: patternSignalsFromData(data),
        confidence: typeof (data as any).confidence === 'string' ? String((data as any).confidence) : undefined,
        source: 'moments',
        actionLabel: 'Open related insight',
        actionTarget: resolveInsightTarget(undefined, patternSignalsFromData(data), 'pattern_discovered'),
        metadata: { signalId: (data as any).signalId },
      };
    }
    case 'helpful_pattern_detected': {
      return {
        id: `moment:${moment.id}`,
        type: 'helpful_pattern',
        date: moment.date,
        title: 'Helpful pattern identified',
        description: tidySentence(typeof (data as any).body === 'string' ? String((data as any).body) : '', 'A past experiment or pattern looked worth keeping in mind.'),
        evidence: 'Saved from a companion update based on earlier experiments and tracking history.',
        signals: patternSignalsFromData(data),
        confidence: typeof (data as any).confidence === 'string' ? String((data as any).confidence) : undefined,
        source: 'moments',
        actionLabel: 'Review helpful insight',
        actionTarget: resolveInsightTarget(undefined, patternSignalsFromData(data), 'helpful_pattern'),
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




function formatArchiveDateLabel(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInteractionPhrase(item: ArchivedCompanionMoment): string {
  const button = String(item.button || '').toLowerCase();
  const screen = String(item.screen || '').toLowerCase();
  if (button.includes('review experiment')) return 'when you reviewed the experiment';
  if (button.includes('try experiment')) return 'when you opened the experiment';
  if (button.includes('see insights') || button.includes('view insights')) return 'when you viewed the insight';
  if (button.includes('view rhythm')) return 'when you viewed the rhythm update';
  if (button.includes('open history')) return 'when you opened History';
  if (button.includes('open calendar')) return 'when you opened Calendar';
  if (button.includes('customise symptoms')) return 'when you opened symptom customisation';
  if (button.includes('edit cycle')) return 'when you opened cycle settings';
  if (button.includes('open check-in') || screen === 'check-in') return 'when you opened check-in';
  if (screen === 'insights') return 'when you viewed the insight';
  if (screen === 'rhythm') return 'when you viewed the rhythm update';
  return 'when you interacted with the card';
}

function getArchivedMomentEvidence(item: ArchivedCompanionMoment): string {
  const archivedDate = formatArchiveDateLabel(item.archivedAtISO);
  const dateSuffix = archivedDate ? ` on ${archivedDate}.` : '.';
  if (item.archivedReason === 'interacted') {
    return `Saved from the homepage ${getInteractionPhrase(item)}${dateSuffix}`;
  }
  if (item.archivedReason === 'dismissed') {
    return `Saved from the homepage when you dismissed it${dateSuffix}`;
  }
  if (item.archivedReason === 'replaced') {
    return 'Saved from the homepage when a more relevant update took its place.';
  }
  return 'Saved from the homepage after it had been visible for a few days.';
}

function mapArchivedMomentToEvent(item: ArchivedCompanionMoment): TimelineEvent | null {
  const metadata = { ...(item.metadata ?? {}), archivedReason: item.archivedReason, archivedAtISO: item.archivedAtISO, momentId: item.momentId };
  switch (item.type) {
    case 'new_pattern':
      return {
        id: `archive:${item.archiveId}`,
        type: 'pattern_discovered',
        date: item.date,
        title: item.title,
        description: tidySentence(item.body, 'A new pattern was saved to your history.'),
        evidence: getArchivedMomentEvidence(item),
        signals: item.signals,
        confidence: item.confidence,
        source: 'archive',
        actionLabel: item.button,
        actionTarget: resolveInsightTarget(item.focusTarget || (item.type === 'helpful_pattern_detected' ? 'insights:helpful' : item.type === 'new_pattern' ? getInsightTargetForSignals(item.signals, 'pattern_discovered') : item.screen), item.signals, item.type === 'helpful_pattern_detected' ? 'helpful_pattern' : item.type === 'new_pattern' ? 'pattern_discovered' : undefined),
        metadata,
      };
    case 'helpful_pattern_detected':
      return {
        id: `archive:${item.archiveId}`,
        type: 'helpful_pattern',
        date: item.date,
        title: item.title,
        description: tidySentence(item.body, 'A helpful pattern was saved to your history.'),
        evidence: getArchivedMomentEvidence(item),
        signals: item.signals,
        confidence: item.confidence,
        source: 'archive',
        actionLabel: item.button,
        actionTarget: resolveInsightTarget(item.focusTarget || (item.type === 'helpful_pattern_detected' ? 'insights:helpful' : item.type === 'new_pattern' ? getInsightTargetForSignals(item.signals, 'pattern_discovered') : item.screen), item.signals, item.type === 'helpful_pattern_detected' ? 'helpful_pattern' : item.type === 'new_pattern' ? 'pattern_discovered' : undefined),
        metadata,
      };
    case 'rhythm_shift':
    case 'phase_change':
      return {
        id: `archive:${item.archiveId}`,
        type: 'rhythm_shift',
        date: item.date,
        title: item.title,
        description: tidySentence(item.body, 'A rhythm update was saved to your history.'),
        evidence: getArchivedMomentEvidence(item),
        signals: item.signals,
        confidence: item.confidence,
        source: 'archive',
        actionLabel: item.button,
        actionTarget: item.focusTarget || item.screen,
        metadata,
      };
    case 'experiment_suggestion':
    case 'experiment_result_ready':
    case 'unlock_milestone':
    case 'encouragement':
      return {
        id: `archive:${item.archiveId}`,
        type: 'pattern_discovered',
        date: item.date,
        title: item.title,
        description: tidySentence(item.body, 'A companion update was saved to your history.'),
        evidence: getArchivedMomentEvidence(item),
        signals: item.signals,
        confidence: item.confidence,
        source: 'archive',
        actionLabel: item.button,
        actionTarget: item.focusTarget || item.screen,
        metadata,
      };
    default:
      return null;
  }
}

function getFeedbackIdFromSignalId(signalId: string): string | null {
  const match = String(signalId || '').match(/^pair-([^:]+)-([^:]+)$/);
  if (!match) return null;
  return getPatternFeedbackIdFromMetrics(match[1], match[2]);
}

function applyPatternFeedbackToEvent(event: TimelineEvent): TimelineEvent {
  const signalId = String(event.metadata?.signalId || '');
  const feedbackId = getFeedbackIdFromSignalId(signalId);
  const feedback = feedbackId ? getPatternFeedback(feedbackId) : null;
  if (!feedback) return event;
  const description = feedback.historyNote
    ? `${event.description} ${feedback.historyNote}`.trim()
    : event.description;
  const metadata = {
    ...(event.metadata ?? {}),
    patternFeedbackId: feedback.id,
    patternDismissed: feedback.status === 'suppressed',
    patternRestored: feedback.status === 'active' && Boolean(feedback.restoredAt),
    patternUnsure: feedback.userFeedback === 'unsure',
  };
  return {
    ...event,
    description,
    metadata,
  };
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


function patternFeedbackActionText(item: PatternFeedbackHistoryEntry): { title: string; description: string; evidence: string; type: 'pattern_discovered' | 'pattern_strengthened' } {
  if (item.action === 'confirmed') {
    return {
      title: 'Connection confirmed',
      description: 'You said this connection matched your experience.',
      evidence: 'Saved when you marked this connection as a good fit in Connections.',
      type: 'pattern_strengthened',
    };
  }
  if (item.action === 'suppressed') {
    return {
      title: 'Connection corrected',
      description: 'You said this connection did not feel right for you.',
      evidence: 'Saved when you corrected this connection in Connections.',
      type: 'pattern_strengthened',
    };
  }
  if (item.action === 'reopened' || item.action === 'restored') {
    return {
      title: 'Connection reopened',
      description: 'This connection was reopened for another look after more logging.',
      evidence: 'Saved when you chose to reassess this connection.',
      type: 'pattern_strengthened',
    };
  }
  return {
    title: 'Connection noted',
    description: 'You marked this connection as not sure yet.',
    evidence: 'Saved when you left this connection open for a bit longer.',
    type: 'pattern_strengthened',
  };
}

function buildPatternFeedbackEvents(): TimelineEvent[] {
  const discoveredIds = new Set(getDiscoveredPatterns().map((item) => item.id));
  return listPatternFeedbackHistory()
    .filter((item) => item.action === 'confirmed')
    .map((item) => {
      const metrics = Array.isArray(item.canonicalMetrics) ? item.canonicalMetrics.slice(0, 2) : [];
      if (metrics.length < 2) return null;
      const signalId = `pair-${metrics[0]}-${metrics[1]}`;
      if (discoveredIds.has(signalId)) return null;
      const labels = metrics.map((metric) => metricLabel(metric));
      return {
        id: `pattern-feedback:${item.eventId}`,
        type: 'pattern_strengthened' as const,
        date: item.date,
        title: 'Connection confirmed',
        description: `${labels[0]} + ${labels[1]} · You said this connection matched your experience.`,
        evidence: 'Saved because you confirmed this connection before it was strong enough to earn its own automatic history stamp.',
        signals: labels,
        confidence: typeof item.confidence === 'number' ? (item.confidence >= 0.78 ? 'high' : item.confidence >= 0.58 ? 'medium' : 'low') : undefined,
        source: 'insights' as const,
        actionLabel: 'Open Connections',
        actionTarget: 'insights:connections',
        metadata: {
          patternFeedbackId: item.patternFeedbackId,
          patternFeedbackAction: item.action,
        },
      } as TimelineEvent;
    })
    .filter((event): event is TimelineEvent => Boolean(event));
}

function buildPatternEvents(): TimelineEvent[] {
  const discoveries = getDiscoveredPatterns();
  const base = discoveries.map((item) => {
    const described = describeSignalId(item.id);
    return {
      id: `discovery:${item.id}:${item.firstDetected}`,
      type: 'pattern_discovered' as const,
      date: item.firstDetected,
      title: 'Pattern discovered',
      description: described.description,
      evidence: discoveryEvidenceText(item.confidence),
      signals: described.signals,
      confidence: item.confidence,
      source: 'insights' as const,
      actionLabel: 'Open related insight',
      actionTarget: resolveInsightTarget(undefined, described.signals, 'pattern_discovered'),
      metadata: {
        signalId: item.id,
        confidence: item.confidence,
      },
    };
  });

  const strengthened = discoveries
    .filter((item) => String(item.confidence || '').toLowerCase() === 'high')
    .map((item) => {
      const described = describeSignalId(item.id);
      return {
        id: `pattern-strengthened:${item.id}:${item.firstDetected}`,
        type: 'pattern_strengthened' as const,
        date: item.firstDetected,
        title: 'Pattern strengthened',
        description: described.description,
        evidence: 'This pattern continued to stand out strongly enough to stay in your history over time.',
        signals: described.signals,
        confidence: item.confidence,
        source: 'insights' as const,
        actionLabel: 'Open related insight',
        actionTarget: resolveInsightTarget(undefined, described.signals, 'pattern_discovered'),
        metadata: {
          signalId: item.id,
          confidence: item.confidence,
        },
      };
    });

  const fromMoments = getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'pattern_discovered');

  const fromArchive = getArchivedMomentSnapshots()
    .map(mapArchivedMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'pattern_discovered');

  return [...base, ...strengthened, ...fromMoments, ...fromArchive].map(applyPatternFeedbackToEvent);
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
      signals: Array.isArray(item.metrics) ? item.metrics.map((metric) => metricLabel(String(metric))) : [],
      confidence: item.confidence,
      source: 'experiments' as const,
      actionLabel: 'Review helpful insight',
      actionTarget: resolveInsightTarget(undefined, Array.isArray(item.metrics) ? item.metrics.map((metric) => metricLabel(String(metric))) : [], 'helpful_pattern'),
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

  const fromArchive = getArchivedMomentSnapshots()
    .map(mapArchivedMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'helpful_pattern');

  return [...helpful, ...fromMoments, ...fromArchive];
}

function outcomeLabel(status?: string): string {
  return getExperimentOutcomeTone(status);
}

function buildExperimentEvents(): TimelineEvent[] {
  const history = readExperimentHistory()
    .slice()
    .sort((a, b) => String(a?.startDateISO || '').localeCompare(String(b?.startDateISO || '')));
  const events: TimelineEvent[] = [];

  history.forEach((item, index) => {
    const experimentId = String(item?.experimentId || item?.id || '').trim();
    const title = String(item?.title || 'Your experiment').trim() || 'Your experiment';
    const startDateISO = String(item?.startDateISO || '').slice(0, 10);
    const completedAtISO = datePart(item?.outcome?.completedAtISO);
    const status = String(item?.outcome?.status || '');
    const digestSummary = typeof item?.outcome?.digest?.summarySentence === 'string' ? String(item.outcome.digest.summarySentence) : '';
    const metrics = metricsSummary(item?.metrics);
    const previousRun = findPreviousExperimentRun(history.slice(0, index), item as any);
    const matchKey = getExperimentMatchKey(item as any);
    const runIndex = history.slice(0, index + 1).filter((candidate) => getExperimentMatchKey(candidate as any) === matchKey).length;
    const threadText = getExperimentOutcomeThreadText(previousRun?.outcome?.status, status, runIndex);

    if (experimentId && isISODate(completedAtISO)) {
      const baseDescription = digestSummary
        ? tidySentence(digestSummary, `${title} finished.`)
        : `${title} finished with a ${outcomeLabel(status)} result.`;
      events.push({
        id: `experiment-completed:${experimentId}:${completedAtISO}`,
        type: 'experiment_completed',
        date: completedAtISO,
        title: runIndex > 1 ? `${title} completed again` : `${title} completed`,
        description: threadText ? `${baseDescription} ${threadText}` : baseDescription,
        evidence: `You logged this result as ${outcomeLabel(status)}${metrics.length ? ` for ${metrics.join(', ')}` : ''}.`,
        signals: metrics,
        source: 'experiments',
        actionLabel: 'View experiment result',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, status, metrics: item?.metrics, matchKey, runIndex, previousStatus: previousRun?.outcome?.status || null },
      });
      return;
    }

    if (experimentId && isISODate(startDateISO)) {
      events.push({
        id: `experiment-started:${experimentId}:${startDateISO}`,
        type: 'experiment_started',
        date: startDateISO,
        title: runIndex > 1 ? `${title} started again` : `${title} started`,
        description: `This experiment was set up to explore ${metrics.length ? metrics.join(', ') : 'your chosen focus area'}.${previousRun ? ` Last time it looked ${outcomeLabel(previousRun?.outcome?.status)}.` : ''}`,
        evidence: `Saved from the experiment setup${typeof item?.durationDays === 'number' ? ` for a ${item.durationDays}-day test` : ''}.`,
        signals: metrics,
        source: 'experiments',
        actionLabel: 'View experiment setup',
        actionTarget: 'insights:experiments',
        metadata: { experimentId, title, metrics: item?.metrics, matchKey, runIndex },
      });
    }
  });

  return events;
}

function buildRhythmEvents(): TimelineEvent[] {
  const live = getCompanionMoments()
    .map(mapMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'rhythm_shift');
  const archived = getArchivedMomentSnapshots()
    .map(mapArchivedMomentToEvent)
    .filter((event): event is TimelineEvent => Boolean(event) && event.type === 'rhythm_shift');
  return [...live, ...archived];
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
  if (filter === 'patterns') return events.filter((event) => event.type === 'pattern_discovered' || event.type === 'pattern_strengthened' || event.type === 'helpful_pattern');
  if (filter === 'experiments') return events.filter((event) => event.type === 'experiment_started' || event.type === 'experiment_completed');
  if (filter === 'rhythm') return events.filter((event) => event.type === 'phase_change' || event.type === 'rhythm_shift');
  return events;
}

export function countPatternEvents(events: TimelineEvent[]): number {
  return events.filter((event) => event.type === 'pattern_discovered' || event.type === 'pattern_strengthened').length;
}

export function countHelpfulExperiments(events: TimelineEvent[]): number {
  return events.filter((event) => event.type === 'experiment_completed' && String(event.metadata?.status || '') === 'helped').length;
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
    .map(([key, items]) => ({
      label: safeFormatMonthYearFromKey(key),
      events: sortTimelineEvents(items),
    }));
}

export function buildTimelineEvents(limit = 40): TimelineEvent[] {
  const all = [
    ...buildPhaseEvents(),
    ...buildPatternEvents(),
    ...buildPatternFeedbackEvents(),
    ...buildHelpfulPatternEvents(),
    ...buildExperimentEvents(),
    ...buildRhythmEvents(),
  ];

  return dedupeTimelineEvents(all).slice(0, Math.max(1, Math.min(50, limit)));
}
