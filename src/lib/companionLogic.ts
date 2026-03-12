import type { CheckInEntry, CyclePhase, ExperimentHistoryItem, InsightMetricKey, UserData } from '../types';
import type { InsightSignal } from './insightEngine';
import { getCompanionMoments, type CompanionMoment, type CompanionMomentType } from './companionMoments';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { getExperimentLearnings, getWhatsComingPredictions } from './rhythmPredictions';

export type CompanionDataStage = 'very_new' | 'building' | 'settling' | 'established';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toDay(isoish?: string | null): string | null {
  if (!isoish || typeof isoish !== 'string') return null;
  const m = isoish.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86400000);
}

export function getDistinctLoggedDays(entries: CheckInEntry[]): number {
  return new Set((entries ?? []).map((entry) => entry?.dateISO).filter((value): value is string => typeof value === 'string')).size;
}

export function getCompanionDataStage(daysLogged: number): CompanionDataStage {
  if (daysLogged < 5) return 'very_new';
  if (daysLogged < 14) return 'building';
  if (daysLogged < 30) return 'settling';
  return 'established';
}

function readExperimentHistory(): ExperimentHistoryItem[] {
  return readJson<ExperimentHistoryItem[]>('everybody:v2:experiment_history', []);
}

function readCurrentExperiment(): any | null {
  return readJson<any | null>('everybody:v2:experiment', null);
}

export function getExperimentSuggestionSuppression(refISO: string): {
  active: boolean;
  recentCompletion: boolean;
  untilISO: string | null;
  daysSinceCompletion: number | null;
} {
  const current = readCurrentExperiment();
  const completedCurrent = toDay(current?.outcome?.completedAtISO);
  const startISO = toDay(current?.startDateISO);
  const duration = Math.max(1, Number(current?.durationDays ?? 3));

  if (startISO && !completedCurrent) {
    const end = new Date(`${startISO}T00:00:00`);
    end.setDate(end.getDate() + duration - 1);
    const endISO = end.toISOString().slice(0, 10);
    if (refISO <= endISO) {
      return { active: true, recentCompletion: false, untilISO: endISO, daysSinceCompletion: null };
    }
  }

  const history = readExperimentHistory()
    .map((item) => toDay(item?.outcome?.completedAtISO))
    .filter((item): item is string => Boolean(item))
    .sort((a, b) => b.localeCompare(a));

  const latestCompletion = completedCurrent ?? history[0] ?? null;
  if (!latestCompletion) {
    return { active: false, recentCompletion: false, untilISO: null, daysSinceCompletion: null };
  }

  const daysSince = daysBetweenISO(latestCompletion, refISO);
  const recentWindow = 5;
  if (daysSince >= 0 && daysSince <= recentWindow) {
    const until = new Date(`${latestCompletion}T00:00:00`);
    until.setDate(until.getDate() + recentWindow);
    return {
      active: false,
      recentCompletion: true,
      untilISO: until.toISOString().slice(0, 10),
      daysSinceCompletion: daysSince,
    };
  }

  return { active: false, recentCompletion: false, untilISO: null, daysSinceCompletion: daysSince >= 0 ? daysSince : null };
}

function recentMomentMatch(args: {
  moments: CompanionMoment[];
  type: CompanionMomentType;
  refISO: string;
  cooldownDays: number;
  signalId?: string;
  experimentId?: string;
  includeDismissed?: boolean;
}): boolean {
  return args.moments.some((moment) => {
    if (moment.type !== args.type) return false;
    if (!args.includeDismissed && moment.dismissed) return false;
    const age = daysBetweenISO(moment.date, args.refISO);
    if (age < 0 || age > args.cooldownDays) return false;
    const data = (moment.data ?? {}) as Record<string, unknown>;
    if (args.signalId && data.signalId && String(data.signalId) !== String(args.signalId)) return false;
    if (args.experimentId && data.experimentId && String(data.experimentId) !== String(args.experimentId)) return false;
    return true;
  });
}

export function shouldSuppressCompanionMoment(args: {
  type: CompanionMomentType;
  refISO: string;
  cooldownDays: number;
  signalId?: string;
  experimentId?: string;
  dismissalCooldownDays?: number;
}): boolean {
  const moments = getCompanionMoments();
  if (recentMomentMatch({ moments, ...args, includeDismissed: false })) return true;
  if ((args.dismissalCooldownDays ?? 0) > 0) {
    return recentMomentMatch({
      moments,
      type: args.type,
      refISO: args.refISO,
      cooldownDays: args.dismissalCooldownDays ?? 0,
      signalId: args.signalId,
      experimentId: args.experimentId,
      includeDismissed: true,
    });
  }
  return false;
}

function metricLabel(key: string, userData: UserData): string {
  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    return userData.customSymptoms?.find((item) => item.id === id)?.label ?? 'that symptom';
  }
  const labels: Record<string, string> = {
    mood: 'Mood', energy: 'Energy', sleep: 'Sleep', pain: 'Pain', headache: 'Headaches', cramps: 'Cramps',
    jointPain: 'Joint pain', flow: 'Bleeding', stress: 'Stress', anxiety: 'Anxiety', irritability: 'Irritability',
    focus: 'Focus', bloating: 'Bloating', digestion: 'Digestion', acidReflux: 'Acid reflux', nausea: 'Nausea',
    hairShedding: 'Hair shedding', facialSpots: 'Facial spots', cysts: 'Cysts', brainFog: 'Brain fog', fatigue: 'Fatigue',
    dizziness: 'Dizziness', appetite: 'Appetite', libido: 'Libido', breastTenderness: 'Breast tenderness',
    hotFlushes: 'Hot flushes', nightSweats: 'Night sweats',
  };
  return labels[key] ?? key;
}

function getPhaseForecastLine(phase: CyclePhase | null, stage: CompanionDataStage): string | null {
  if (!phase) return null;
  const base: Record<CyclePhase, string> = {
    Menstrual: 'A slower, more comfort-led few days may suit you better.',
    Follicular: 'You may notice a little more lift or forward momentum building.',
    Ovulation: 'You may feel a bit more outward-facing or able to use your energy.',
    Luteal: 'Sleep, stress, or sensitivity may need a little more support than usual.',
  };
  if (stage === 'very_new') return base[phase];
  return base[phase];
}

function getSignalForecastLine(signal: InsightSignal | null | undefined, userData: UserData): string | null {
  if (!signal) return null;
  const metric = signal.metrics?.[0];
  if (!metric) return null;
  const label = metricLabel(String(metric), userData);
  if (signal.type === 'phase_shift') {
    if (signal.direction === 'higher') return `${label} may be one of the first things to feel a bit louder in the next few days.`;
    if (signal.direction === 'lower') return `${label} may ease a little over the next few days.`;
  }
  if (signal.type === 'trend_shift') {
    if (signal.direction === 'higher') return `${label} may keep edging up if the recent pattern holds.`;
    if (signal.direction === 'lower') return `${label} may settle a little if the recent pattern holds.`;
  }
  if (signal.type === 'metric_pair' && signal.metrics?.length > 1) {
    const other = metricLabel(String(signal.metrics[1]), userData);
    if (signal.direction === 'inverse') return `${label} and ${other.toLowerCase()} may keep pulling against each other for a few days.`;
    return `${label} and ${other.toLowerCase()} may keep moving together for a few days.`;
  }
  if (metric === 'sleep') return 'Sleep may be one of the first things to feel a bit different, so keep evenings gentle if you can.';
  if (metric === 'energy') return 'Energy may feel changeable, so a steadier pace could help over the next few days.';
  if (metric === 'stress') return 'Stress may show up in your body quite quickly, so leaving a little breathing room may help.';
  if (metric === 'brainFog') return 'Brain fog may feel a little louder than usual, so simpler days may land better.';
  if (metric === 'fatigue') return 'Fatigue may creep in faster than you expect, so it may help to keep things a touch lighter.';
  return `${label} may be worth keeping an eye on over the next few days.`;
}

export function getBodyWeatherLines(args: {
  entries: CheckInEntry[];
  userData: UserData;
  currentPhase: CyclePhase | null;
  heroSignals: InsightSignal[];
  strongPatternSignals: InsightSignal[];
}): string[] {
  const { entries, userData, currentPhase, heroSignals, strongPatternSignals } = args;
  const daysLogged = getDistinctLoggedDays(entries);
  const stage = getCompanionDataStage(daysLogged);
  const lines: string[] = [];

  const experimentLearnings = getExperimentLearnings(entries, readExperimentHistory());
  const whatsComing = getWhatsComingPredictions({ entries, learnings: experimentLearnings });
  const predictiveLine = whatsComing[0]?.text ?? null;
  const helpful = getHelpfulPatternsFromExperiments().filter((item) => item.confidence !== 'low')[0] ?? null;

  const phaseLine = getPhaseForecastLine(currentPhase, stage);
  if (phaseLine) lines.push(phaseLine);
  if (predictiveLine && !lines.includes(predictiveLine)) lines.push(predictiveLine);

  if (lines.length < 2) {
    const signalLine = getSignalForecastLine(strongPatternSignals[0] ?? heroSignals.find((item) => item.type !== 'low_data'), userData);
    if (signalLine && !lines.includes(signalLine)) lines.push(signalLine);
  }

  if (lines.length < 2 && helpful) {
    lines.push(`${helpful.shortText} That may be worth leaning on again over the next few days.`);
  }

  if (!lines.length) {
    if (stage === 'very_new') {
      return ['A few more check-ins will help this section turn into a more personal body weather read.'];
    }
    return ['A few more days of logs will help me make this forecast feel more personal.'];
  }

  return lines.slice(0, 2);
}

export function getWeeklyReflectionMoment(entries: CheckInEntry[], refISO: string): { id: string; title: string; body: string; type: CompanionMomentType } | null {
  const distinctDays = getDistinctLoggedDays(entries);
  const milestones = [7, 14, 21, 30];
  const milestone = milestones.find((value) => distinctDays === value);
  if (!milestone) return null;

  const stage = getCompanionDataStage(distinctDays);
  const title =
    milestone === 7 ? 'Your first week is taking shape' :
    milestone === 14 ? 'Your patterns are starting to settle' :
    milestone === 21 ? 'Your rhythm is getting easier to read' :
    'You have built a stronger baseline';

  const body =
    stage === 'building' ? 'You have enough check-ins now for early patterns to feel a little more trustworthy.' :
    stage === 'settling' ? 'Patterns are repeating a bit more now, so the app can be calmer and more specific.' :
    'With a stronger baseline in place, small changes and experiments should be easier to interpret.';

  return {
    id: `weekly-reflection:${milestone}:${refISO}`,
    title,
    body,
    type: milestone >= 30 ? 'unlock_milestone' : 'encouragement',
  };
}
