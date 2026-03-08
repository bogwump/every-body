import type { CheckInEntry, ExperimentHistoryItem, UserData } from '../types';
import { getRhythmModel } from './analytics';
import { getTopInsights, type InsightSignal } from './insightEngine';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { buildTimelineEvents } from './timelineBuilder';
import { getRhythmTimingModel } from './rhythmTiming';
import { phaseLabelFromKey } from './phaseChange';
import { getAverageCycleLength } from './phaseHistory';
import { getConfidencePhrase, getHelpfulPhrase } from './confidenceCopy';

export type AIExportPreset = 'patterns' | 'doctor' | 'helpful' | 'next_tests';

export type AIExportContext = {
  preset: AIExportPreset;
  generatedAtISO: string;
  title: string;
  focusDescription: string;
  intro: string;
  asks: string[];
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
  sections: {
    patterns: string[];
    doctor: string[];
    helpful: string[];
    nextTests: string[];
  };
};

export function getPresetMeta(preset: AIExportPreset): { title: string; description: string; filename: string; copiedMessage: string } {
  if (preset === 'doctor') {
    return {
      title: 'Prepare for a doctor appointment',
      description: 'This export focuses on symptom themes, cycle timing, changes over time, what seems to help, and calm questions worth discussing.',
      filename: 'everybody_doctor_export',
      copiedMessage: 'Your doctor appointment summary has been copied. Paste it into ChatGPT to continue.',
    };
  }
  if (preset === 'helpful') {
    return {
      title: "Review what's been helping",
      description: 'This export focuses on helpful patterns, experiment learnings, what looked slightly helpful, and what may be worth repeating.',
      filename: 'everybody_helpful_export',
      copiedMessage: 'Your helpful patterns summary has been copied. Paste it into ChatGPT to continue.',
    };
  }
  if (preset === 'next_tests') {
    return {
      title: 'Suggest what to test next',
      description: 'This export focuses on unresolved patterns, rhythm context, past experiments, and realistic next things to test.',
      filename: 'everybody_experiment_export',
      copiedMessage: 'Your next experiment summary has been copied. Paste it into ChatGPT to continue.',
    };
  }
  return {
    title: 'Understand my patterns',
    description: 'This export focuses on your main patterns, possible links, recent changes, and the most useful things to pay attention to.',
    filename: 'everybody_patterns_export',
    copiedMessage: 'Your patterns summary has been copied. Paste it into ChatGPT to continue.',
  };
}

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
  const phrase = getConfidencePhrase(signal.confidence);

  if (id.includes('sleep_before_bleed')) return `Sleep ${phrase} dip before bleeding starts.`;
  if (id.includes('stress') && id.includes('sleep')) {
    if (signal.confidence === 'high') return 'Stressful days are often followed by worse sleep.';
    if (signal.confidence === 'medium' || signal.confidence === 'moderate') return 'Stressful days seem to be followed by worse sleep.';
    if (signal.confidence === 'low') return 'Stressful days might sometimes be followed by worse sleep.';
    return 'This sleep pattern is still emerging.';
  }
  if (id.includes('brainfog') || id.includes('brain_fog')) return 'Brain fog is showing a pattern that is still emerging.';
  if (signal.type === 'metric_pair' && metricB) return `${toTitleCase(metricA)} and ${metricB} ${phrase} move together.`;
  if (signal.type === 'phase_shift' && signal.phase) return `${toTitleCase(metricA)} ${phrase} shift during your ${String(signal.phase).toLowerCase()} phase.`;
  if (signal.type === 'trend_shift') return `${toTitleCase(metricA)} has been shifting over time.`;
  if (signal.type === 'weekday_pattern') return `${toTitleCase(metricA)} has shown a day-of-week pattern that is still emerging.`;
  return `${toTitleCase(metricA)} is showing a pattern that is still emerging.`;
}

function outcomeLabel(status?: string): string {
  if (status === 'helped') return 'helped';
  if (status === 'notReally') return 'slightly helpful';
  if (status === 'stopped') return 'stopped early';
  if (status === 'abandoned') return 'unclear';
  return 'unclear';
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
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
    .slice(0, 4)
    .map((item) => item.text.replace('seems to help', getHelpfulPhrase(item.confidence)).replace('may support', getHelpfulPhrase(item.confidence)));
}

export function buildExperimentSummary(): AIExportContext['experiments'] {
  return readExperimentHistory()
    .slice()
    .sort((a, b) => String(b?.outcome?.completedAtISO || b?.startDateISO || '').localeCompare(String(a?.outcome?.completedAtISO || a?.startDateISO || '')))
    .slice(0, 6)
    .map((item) => ({
      title: String(item?.title || 'Experiment').trim() || 'Experiment',
      result: outcomeLabel(item?.outcome?.status),
      durationDays: typeof item?.durationDays === 'number' ? item.durationDays : null,
      metrics: (Array.isArray(item?.metrics) ? item.metrics : []).map((metric) => metricLabel(String(metric))),
      notes: typeof item?.outcome?.note === 'string' && item.outcome.note.trim() ? item.outcome.note.trim() : undefined,
    }));
}

export function buildTimelineHighlights(limit = 8) {
  return buildTimelineEvents(12)
    .slice(0, limit)
    .map((event) => ({
      date: event.date,
      title: event.title,
      description: event.description,
    }));
}

export function buildPatternsSummary(entries: CheckInEntry[], userData: UserData): string[] {
  const insights = buildInsightsSummary(entries, userData);
  const helpful = buildHelpfulPatternsSummary();
  const timeline = buildTimelineHighlights(5).map((item) => `${item.title}: ${item.description}`);
  return uniq([...insights, ...helpful.slice(0, 1), ...timeline]).slice(0, 6);
}

export function buildDoctorSummary(entries: CheckInEntry[], userData: UserData): string[] {
  const rhythm = buildRhythmSummary(entries, userData);
  const insights = buildInsightsSummary(entries, userData);
  const helpful = buildHelpfulPatternsSummary();
  const experiments = buildExperimentSummary();
  const lines = [
    `Current rhythm context: ${rhythm.currentPhase}, day ${rhythm.dayInPhase ?? 'unknown'} of this phase.`,
    ...insights.slice(0, 3),
    ...helpful.slice(0, 2),
    ...experiments.slice(0, 2).map((item) => `${item.title}: ${item.result}.`),
    'Questions worth discussing: do the timing patterns look clinically relevant, are there common explanations worth ruling out, and which changes are most worth tracking next?',
  ];
  return uniq(lines).slice(0, 7);
}

export function buildHelpfulSummary(entries: CheckInEntry[], userData: UserData): string[] {
  const helpful = buildHelpfulPatternsSummary();
  const experiments = buildExperimentSummary();
  const fallback = buildInsightsSummary(entries, userData).slice(0, 1);
  const experimentLines = experiments.slice(0, 3).map((item) => `${item.title}: ${item.result}.`);
  return uniq([...helpful, ...experimentLines, ...fallback]).slice(0, 6);
}

export function buildExperimentPlanningSummary(entries: CheckInEntry[], userData: UserData): string[] {
  const insights = buildInsightsSummary(entries, userData);
  const helpful = buildHelpfulPatternsSummary();
  const experiments = buildExperimentSummary();
  const unresolved = insights.slice(0, 3);
  const tried = experiments.slice(0, 3).map((item) => `${item.title}: ${item.result}.`);
  const maybeRepeat = helpful.slice(0, 2).map((item) => `${item} This may be worth repeating if it still feels relevant.`);
  return uniq([...unresolved, ...tried, ...maybeRepeat]).slice(0, 7);
}

export function buildPresetPrompt(preset: AIExportPreset): { intro: string; asks: string[] } {
  if (preset === 'doctor') {
    return {
      intro: `I'm preparing for a doctor appointment and want help turning my symptom and cycle tracking into a clear summary.`,
      asks: [
        'identify the main themes in my symptoms and timing',
        'highlight what looks notable over time without making diagnostic claims',
        'review what seems to help and what still looks unclear',
        'suggest sensible questions I may want to ask at my appointment',
      ],
    };
  }
  if (preset === 'helpful') {
    return {
      intro: `Please review my tracking data and experiments to help me understand what seems to help most.`,
      asks: [
        'summarise what has looked helpful so far',
        'point out what was only slightly helpful or still unclear',
        'help me spot anything worth keeping in mind or repeating',
      ],
    };
  }
  if (preset === 'next_tests') {
    return {
      intro: `Based on my tracking history, patterns, and past experiments, please suggest the most sensible next things to test.`,
      asks: [
        'focus on realistic, low-effort ideas',
        'avoid repeating things that already looked unhelpful',
        'use my rhythm context and recent patterns to prioritise the best next tests',
      ],
    };
  }
  return {
    intro: `Please help me understand the main patterns in my hormone and symptom tracking data.`,
    asks: [
      'summarise the most important themes',
      'point out possible correlations or timing links worth paying attention to',
      'note what seems to help without overstating certainty',
    ],
  };
}

export function buildAIExportContext(entries: CheckInEntry[], userData: UserData, preset: AIExportPreset = 'patterns'): AIExportContext {
  const meta = getPresetMeta(preset);
  const presetPrompt = buildPresetPrompt(preset);
  return {
    preset,
    generatedAtISO: new Date().toISOString(),
    title: meta.title,
    focusDescription: meta.description,
    intro: presetPrompt.intro,
    asks: presetPrompt.asks,
    rhythm: buildRhythmSummary(entries, userData),
    insights: buildInsightsSummary(entries, userData),
    helpfulPatterns: buildHelpfulPatternsSummary(),
    experiments: buildExperimentSummary(),
    timelineHighlights: buildTimelineHighlights(preset === 'doctor' ? 10 : 6),
    sections: {
      patterns: buildPatternsSummary(entries, userData),
      doctor: buildDoctorSummary(entries, userData),
      helpful: buildHelpfulSummary(entries, userData),
      nextTests: buildExperimentPlanningSummary(entries, userData),
    },
  };
}

export function buildChatGPTPrompt(entries: CheckInEntry[], userData: UserData, preset: AIExportPreset = 'patterns'): string {
  const context = buildAIExportContext(entries, userData, preset);
  const presetSection =
    preset === 'doctor' ? context.sections.doctor :
    preset === 'helpful' ? context.sections.helpful :
    preset === 'next_tests' ? context.sections.nextTests :
    context.sections.patterns;

  const lines: string[] = [
    "I'm analysing hormone and symptom tracking data from the EveryBody app.",
    '',
    context.intro,
    '',
    'Please help me:',
    ...context.asks.map((line) => `• ${line}`),
    '',
    'Rhythm summary',
    ...context.rhythm.summaryLines.map((line) => `• ${line}`),
    '',
    preset === 'doctor' ? 'Doctor appointment summary' : 'Key themes',
    ...(presetSection.length ? presetSection.map((line) => `• ${line}`) : ['• Not enough data yet to draw out clear themes.']),
    '',
    'Key insights discovered',
    ...(context.insights.length ? context.insights.map((line) => `• ${line}`) : ['• Not enough insight patterns yet.']),
    '',
    'What seems to help',
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
    'Please keep the analysis careful and non-medical, point out any limitations in the data, and help me think in a grounded way.',
  ];

  return lines.join('\n');
}
