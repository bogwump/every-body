import type { CheckInEntry, UserData } from '../types';
import type { RhythmPhaseKey } from './rhythmCopy';
import { getRhythmModel, isoToday } from './analytics';
import { getAverageCycleLength, getAveragePhaseLength, getCurrentPhaseEntry, getPhaseElapsedDays } from './phaseHistory';

export type RhythmTimingModel = {
  currentDay: number | null;
  totalDays: number | null;
  daysRemaining: number | null;
  progressPercent: number;
  timingCopy: string;
  approximate: boolean;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function getPhaseBounds(phaseKey: RhythmPhaseKey, cycleLen: number) {
  const safeLen = clamp(Math.round(cycleLen || 28), 21, 45);
  const ovStart = Math.max(12, Math.min(safeLen - 12, Math.round(safeLen * 0.5)));
  const ovEnd = ovStart + 2;
  switch (phaseKey) {
    case 'reset':
      return { start: 1, end: 5 };
    case 'rebuilding':
      return { start: 6, end: Math.max(6, ovStart - 1) };
    case 'expressive':
      return { start: ovStart, end: ovEnd };
    case 'protective':
    default:
      return { start: ovEnd + 1, end: safeLen };
  }
}

function getDefaultPhaseLength(phaseKey: RhythmPhaseKey) {
  switch (phaseKey) {
    case 'reset':
      return 5;
    case 'rebuilding':
      return 8;
    case 'expressive':
      return 3;
    case 'protective':
    default:
      return 11;
  }
}

export function getPhaseProgressPercent(currentDay: number | null, totalDays: number | null): number {
  if (!currentDay || !totalDays || totalDays <= 0) return 36;
  return clamp((currentDay / totalDays) * 100, 8, 100);
}

export function getTimingStripCopy(model: RhythmTimingModel): string {
  if (model.currentDay && model.daysRemaining != null) {
    const lead = model.currentDay <= 2 ? 'Early in this phase' : `About day ${model.currentDay} of this phase`;
    const tail = model.daysRemaining <= 1 ? 'likely around 1 day left' : `likely around ${model.daysRemaining} days left`;
    return `${lead} · ${tail}`;
  }
  if (model.currentDay) {
    return model.currentDay <= 2 ? 'Settling into this phase' : `Around day ${model.currentDay} of this phase`;
  }
  return 'Still learning your rhythm timing';
}

export function getRhythmTimingModel(entries: CheckInEntry[], userData: UserData) : RhythmTimingModel {
  const distinctDays = new Set((entries ?? []).map((entry) => entry?.dateISO).filter((value): value is string => typeof value === 'string')).size;
  const rhythm = getRhythmModel(entries, userData);
  const phaseKey = (rhythm.phaseKey ?? 'protective') as RhythmPhaseKey;
  const lowData = distinctDays < 5;

  const currentEntry = getCurrentPhaseEntry();
  const historicalPhaseLength = getAveragePhaseLength(phaseKey, null);
  const historicalCycleLength = getAverageCycleLength(rhythm.cycleLen || 28);

  if (currentEntry && currentEntry.phase === phaseKey) {
    const currentDay = getPhaseElapsedDays(isoToday()) ?? null;
    const totalDays = historicalPhaseLength ?? getDefaultPhaseLength(phaseKey);
    const daysRemaining = currentDay ? Math.max(0, totalDays - currentDay) : null;
    const approximate = lowData || !historicalPhaseLength;
    const model: RhythmTimingModel = {
      currentDay,
      totalDays,
      daysRemaining,
      progressPercent: getPhaseProgressPercent(currentDay, totalDays),
      timingCopy: '',
      approximate,
    };
    model.timingCopy = getTimingStripCopy(model);
    return model;
  }

  if (rhythm.dayInCycle != null && rhythm.dayInCycle >= 1) {
    const bounds = getPhaseBounds(phaseKey, historicalCycleLength || rhythm.cycleLen || 28);
    const boundedLength = Math.max(1, bounds.end - bounds.start + 1);
    const totalDays = historicalPhaseLength ?? boundedLength;
    const currentDay = clamp(rhythm.dayInCycle - bounds.start + 1, 1, totalDays);
    const daysRemaining = Math.max(0, totalDays - currentDay);
    const approximate = rhythm.source === 'inferred' || lowData || !historicalPhaseLength;
    const model: RhythmTimingModel = {
      currentDay,
      totalDays,
      daysRemaining,
      progressPercent: getPhaseProgressPercent(currentDay, totalDays),
      timingCopy: '',
      approximate,
    };
    model.timingCopy = getTimingStripCopy(model);
    return model;
  }

  const totalDays = historicalPhaseLength ?? getDefaultPhaseLength(phaseKey);
  const currentDay = lowData ? null : Math.max(1, Math.min(totalDays - 1, Math.round(totalDays * 0.35)));
  const daysRemaining = currentDay ? Math.max(0, totalDays - currentDay) : null;
  const model: RhythmTimingModel = {
    currentDay,
    totalDays,
    daysRemaining,
    progressPercent: getPhaseProgressPercent(currentDay, totalDays),
    timingCopy: '',
    approximate: true,
  };
  model.timingCopy = getTimingStripCopy(model);
  return model;
}
