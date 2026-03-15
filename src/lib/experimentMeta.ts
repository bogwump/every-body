import type { ExperimentHistoryItem, ExperimentPlan } from '../types';

export type ExperimentTemplateMeta = {
  actionLabel: string;
  explanation: string;
  examples: string[];
};

const DEFAULT_META: ExperimentTemplateMeta = {
  actionLabel: 'One small change',
  explanation: 'Pick one small thing to test for a few days and keep the rest of your routine as steady as you can.',
  examples: [
    'change one thing you can realistically stick to',
    'keep the rest of the day fairly similar',
    'log the same measures each day',
  ],
};

const TEMPLATE_META: Record<string, ExperimentTemplateMeta> = {
  stressfulDay: {
    actionLabel: 'A calmer, lower-friction evening',
    explanation: 'This is about giving stressful days a gentler landing so you can see whether sleep or mood feel steadier afterwards.',
    examples: [
      'get off your phone earlier',
      'reduce late-night stimulation',
      'aim for a steadier wind-down',
      'keep the evening simpler than usual',
    ],
  },
  lateNight: {
    actionLabel: 'A steadier bedtime routine',
    explanation: 'This is about making evenings more predictable so you can test whether sleep feels easier to support.',
    examples: [
      'start winding down a bit earlier',
      'keep bedtime more consistent',
      'avoid a very late night if you can',
      'make the last hour feel quieter',
    ],
  },
  exercise: {
    actionLabel: 'A steadier morning lift',
    explanation: 'This is about gently nudging your morning rhythm to see whether energy feels easier to lift and hold.',
    examples: [
      'get outside earlier',
      'add a short walk or gentle movement',
      'open curtains and get some light early',
      'keep mornings a bit more structured',
    ],
  },
  caffeine: {
    actionLabel: 'A caffeine timing tweak',
    explanation: 'This is about changing when or how much caffeine you have so you can spot whether symptoms shift.',
    examples: [
      'have it earlier in the day',
      'reduce the amount slightly',
      'skip a second coffee',
    ],
  },
  alcohol: {
    actionLabel: 'An alcohol-free window',
    explanation: 'This is about removing or reducing alcohol for a few days so you can see whether anything settles.',
    examples: [
      'skip alcohol for the test window',
      'swap it for a non-alcoholic option',
      'keep evenings otherwise fairly similar',
    ],
  },
  lowHydration: {
    actionLabel: 'A hydration support test',
    explanation: 'This is about being a bit more deliberate with fluids for a few days and seeing whether that changes anything.',
    examples: [
      'keep a drink nearby',
      'have water earlier in the day',
      'aim for a steadier intake',
    ],
  },
};

export function getExperimentTemplateMeta(changeKey?: string, title?: string): ExperimentTemplateMeta {
  const key = String(changeKey || '').trim();
  if (key && TEMPLATE_META[key]) return TEMPLATE_META[key];
  const blob = String(title || '').toLowerCase();
  if (blob.includes('evening reset')) return TEMPLATE_META.stressfulDay;
  if (blob.includes('wind-down') || blob.includes('wind down')) return TEMPLATE_META.lateNight;
  if (blob.includes('morning light')) return TEMPLATE_META.exercise;
  return DEFAULT_META;
}

export function getExperimentMatchKey(input: Partial<ExperimentPlan & ExperimentHistoryItem> | null | undefined): string {
  if (!input) return '';
  const changeKey = String((input as any).changeKey || '').trim().toLowerCase();
  const title = String((input as any).title || '').trim().toLowerCase();
  const kind = String((input as any).kind || 'change').trim().toLowerCase();
  if (changeKey) return `${kind}::${changeKey}`;
  return `${kind}::title:${title}`;
}

export function findPreviousExperimentRun(history: ExperimentHistoryItem[], current: Partial<ExperimentPlan & ExperimentHistoryItem> | null | undefined): ExperimentHistoryItem | null {
  const key = getExperimentMatchKey(current);
  const currentId = String((current as any)?.experimentId || (current as any)?.id || '');
  if (!key) return null;
  const sorted = history.slice().sort((a, b) => String(b?.outcome?.completedAtISO || b?.startDateISO || '').localeCompare(String(a?.outcome?.completedAtISO || a?.startDateISO || '')));
  for (const item of sorted) {
    const itemId = String((item as any)?.experimentId || (item as any)?.id || '');
    if (currentId && itemId === currentId) continue;
    if (getExperimentMatchKey(item) === key) return item;
  }
  return null;
}

export function compareExperimentOutcomes(previousStatus?: string, currentStatus?: string): string | null {
  const prev = String(previousStatus || '');
  const curr = String(currentStatus || '');
  if (!prev || !curr) return null;
  if (prev === curr) {
    if (curr === 'helped') return 'This landed similarly to last time.';
    if (curr === 'notReally') return 'This also did not clearly help, which is useful to know.';
    return 'This landed much the same as last time.';
  }
  if (prev === 'notReally' && curr === 'helped') return 'Last time this did not clearly help. This time it looked more promising.';
  if (prev === 'helped' && curr === 'notReally') return 'Last time this looked more helpful than it did this time.';
  if (curr === 'helped') return 'This looked more encouraging than the last run.';
  if (curr === 'notReally') return 'This looked less convincing than the last run.';
  return 'This gave you a different result from the last run.';
}

export function getExperimentStatusMeta(status?: string): { label: string; neutralLabel: string } {
  if (status === 'helped') return { label: 'Helped', neutralLabel: 'helpful' };
  if (status === 'notReally') return { label: 'Not really', neutralLabel: 'not clearly helpful' };
  if (status === 'abandoned') return { label: 'Didn’t finish', neutralLabel: 'not completed' };
  if (status === 'pending') return { label: 'Awaiting reflection', neutralLabel: 'awaiting reflection' };
  return { label: 'Stopped early', neutralLabel: 'stopped early' };
}

export function getExperimentLifecycle(experiment: ExperimentPlan | null | undefined, todayISO: string, acknowledgementDays = 3) {
  if (!experiment || !experiment.startDateISO) return null;
  const start = new Date(`${experiment.startDateISO}T00:00:00`);
  const today = new Date(`${todayISO}T00:00:00`);
  const dayIndex = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const day = Math.max(1, dayIndex + 1);
  const durationDays = Math.max(1, Number(experiment.durationDays ?? 3));
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + durationDays - 1);
  const endDateISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const daysSinceEnd = Math.floor((today.getTime() - end.getTime()) / 86400000);
  const hasOutcome = Boolean((experiment as any)?.outcome?.status);
  const doneByDate = dayIndex >= durationDays;
  const done = hasOutcome || doneByDate;
  const withinAcknowledgementWindow = done && daysSinceEnd >= 0 && daysSinceEnd <= acknowledgementDays;
  const awaitingOutcome = doneByDate && !hasOutcome;
  const showCompletedState = done && withinAcknowledgementWindow;
  return {
    ex: experiment,
    day,
    done,
    durationDays,
    endDateISO,
    daysSinceEnd,
    hasOutcome,
    awaitingOutcome,
    withinAcknowledgementWindow,
    showCompletedState,
  };
}
