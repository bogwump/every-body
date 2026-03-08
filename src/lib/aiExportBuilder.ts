import type { CheckInEntry, ExperimentHistoryItem, UserData } from '../types';
import { getRhythmModel } from './analytics';
import { getTopInsights, type InsightSignal } from './insightEngine';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { buildTimelineEvents } from './timelineBuilder';
import { getRhythmTimingModel } from './rhythmTiming';
import { phaseLabelFromKey } from './phaseChange';
import { getAverageCycleLength } from './phaseHistory';

export type AIExportContext = {
  generatedAtISO: string;
  rhythm: {
    currentPhase: string;
    dayInPhase: number | null;
    daysRemaining: number | null;
    typicalCycleLength: number | null;
    summaryLines: string[];
  };
  insights: string[];
  helpfulPatterns: string[];
  experiments: Array<{
    title: string;
    result: string;
    durationDays: number | null;
    metrics: string[];
    notes?: string;
  }>;
  timelineHighlights: Array<{
    date: string;
    title: string;
    description: string;
  }>;
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

function toTitleCase(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function describeSignal(signal: InsightSignal): string {
  const id = String(signal.id || '').toLowerCase();
  const metricA = metricLabel(String(signal.metrics?.[0] || 'this pattern'));
  const metricB = metricLabel(String(signal.metrics?.[1] || ''));

  if (id.includes('sleep_before_bleed')) return 'Sleep tends to dip before bleeding starts.';
  if (id.includes('stress') && id.includes('sleep')) return 'Stressful days are often followed by worse sleep.';
  if (id.includes('brainfog') || id.includes('brain_fog')) return 'Brain fog has started to show a repeat pattern.';
  if (signal.type === 'metric_pair' && metricB) return `${toTitleCase(metricA)} and ${metricB} often move together.`;
  if (signal.type === 'phase_shift' && signal.phase) return `${toTitleCase(metricA)} often shifts during your ${String(signal.phase).toLowerCase()} phase.`;
  if (signal.type === 'trend_shift') return `${toTitleCase(metricA)} has been shifting over time.`;
  if (signal.type === 'weekday_pattern') return `${toTitleCase(metricA)} shows a day-of-week pattern.`;
  return `${toTitleCase(metricA)} is showing a clearer pattern.`;
}

function outcomeLabel(status?: string): string {
  if (status === 'helped') return 'helped';
  if (status === 'notReally') return 'slightly helpful';
  if (status === 'stopped') return 'stopped early';
  if (status === 'abandoned') return 'unclear';
  return 'unclear';
}

export function buildRhythmSummary(entries: CheckInEntry[], userData: UserData) {
  const rhythm = getRhythmModel(entries, userData);
  const timing = getRhythmTimingModel(entries, userData);
  const currentPhase = phaseLabelFromKey(rhythm.phaseKey || rhythm.phase || 'protective');
  const dayInPhase = timing.currentDay ?? null;
  const daysRemaining = timing.daysRemaining ?? null;
  const typicalCycleLength = getAverageCycleLength(rhythm.cycleLen || 28) ?? rhythm.cycleLen ?? null;

  const summaryLines = [
    `Current phase: ${currentPhase}`,
    `Day in phase: ${dayInPhase ?? 'Still learning'}`,
    `Days remaining in phase: ${daysRemaining ?? 'Still learning'}`,
    `Typical cycle length: ${typicalCycleLength ?? 'Still learning'} days`,
  ];

  return { currentPhase, dayInPhase, daysRemaining, typicalCycleLength, summaryLines };
}

export function buildInsightsSummary(entries: CheckInEntry[], userData: UserData): string[] {
  return getTopInsights(entries, userData, 5)
    .filter((signal) => signal.type !== 'low_data')
    .map(describeSignal)
    .slice(0, 5);
}

export function buildHelpfulPatternsSummary(): string[] {
  return getHelpfulPatternsFromExperiments()
    .filter((item) => item.confidence === 'moderate' || item.confidence === 'high')
    .slice(0, 3)
    .map((item) => item.text);
}

export function buildExperimentSummary(): AIExportContext['experiments'] {
  return readExperimentHistory()
    .slice()
    .sort((a, b) => String(b?.outcome?.completedAtISO || b?.startDateISO || '').localeCompare(String(a?.outcome?.completedAtISO || a?.startDateISO || '')))
    .slice(0, 5)
    .map((item) => ({
      title: String(item?.title || 'Experiment').trim() || 'Experiment',
      result: outcomeLabel(item?.outcome?.status),
      durationDays: typeof item?.durationDays === 'number' ? item.durationDays : null,
      metrics: (Array.isArray(item?.metrics) ? item.metrics : []).map((metric) => metricLabel(String(metric))),
      notes: typeof item?.outcome?.note === 'string' && item.outcome.note.trim() ? item.outcome.note.trim() : undefined,
    }));
}

export function buildTimelineHighlights() {
  return buildTimelineEvents(10)
    .slice(0, 8)
    .map((event) => ({
      date: event.date,
      title: event.title,
      description: event.description,
    }));
}

export function buildAIExportContext(entries: CheckInEntry[], userData: UserData): AIExportContext {
  return {
    generatedAtISO: new Date().toISOString(),
    rhythm: buildRhythmSummary(entries, userData),
    insights: buildInsightsSummary(entries, userData),
    helpfulPatterns: buildHelpfulPatternsSummary(),
    experiments: buildExperimentSummary(),
    timelineHighlights: buildTimelineHighlights(),
  };
}

export function buildChatGPTPrompt(entries: CheckInEntry[], userData: UserData): string {
  const context = buildAIExportContext(entries, userData);

  const lines: string[] = [
    `I'm analysing hormone and symptom tracking data from the EveryBody app.`,
    '',
    'Please help me:',
    '• understand patterns in my symptoms',
    '• explore possible links between sleep, mood and cycle timing',
    '• review experiments I have tried',
    '• suggest sensible things I might test next',
    '',
    'Rhythm summary',
    ...context.rhythm.summaryLines.map((line) => `• ${line}`),
    '',
    'Key insights discovered',
    ...(context.insights.length ? context.insights.map((line) => `• ${line}`) : ['• Not enough insight patterns yet.']),
    '',
    "What's been helping",
    ...(context.helpfulPatterns.length ? context.helpfulPatterns.map((line) => `• ${line}`) : ['• Nothing confident enough to call helpful yet.']),
    '',
    'Experiments tried',
    ...(context.experiments.length
      ? context.experiments.map((item) => {
          const metrics = item.metrics.length ? ` Focus: ${item.metrics.join(', ')}.` : '';
          const duration = item.durationDays ? ` (${item.durationDays} days)` : '';
          const notes = item.notes ? ` Note: ${item.notes}` : '';
          return `• ${item.title}${duration}. Result: ${item.result}.${metrics}${notes}`;
        })
      : ['• No completed experiments yet.']),
    '',
    'Timeline highlights',
    ...(context.timelineHighlights.length
      ? context.timelineHighlights.map((item) => `• ${item.date}: ${item.title}. ${item.description}`)
      : ['• No timeline highlights yet.']),
    '',
    'Please keep the analysis careful and non-medical, point out any limitations in the data, and help me think of realistic next questions or experiments.',
  ];

  return lines.join('\n');
}
