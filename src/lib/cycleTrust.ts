import type { CheckInEntry, UserData } from '../types';
import { computeCycleStats, getRhythmModel, sortByDateAsc } from './analytics';
import { isoTodayLocal } from './date';
import { getRhythmPhaseState } from './phaseChange';

export type CyclePhaseTrust = 'learning' | 'estimated' | 'confirmed';
export type CyclePredictionTrust = 'none' | 'early' | 'established' | 'stale';

export type CycleTrustModel = {
  cycleEnabled: boolean;
  anchorCount: number;
  hasCycleAnchor: boolean;
  phaseTrust: CyclePhaseTrust;
  predictionTrust: CyclePredictionTrust;
  gapMode: string | null;
  showCurrentCyclePrediction: boolean;
  showFutureCycleStart: boolean;
  showFutureOvulation: boolean;
};

export function getCycleTrustModel(
  entriesRaw: CheckInEntry[] | unknown,
  userData: UserData,
  refISO: string = isoTodayLocal(),
): CycleTrustModel {
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';
  if (!cycleEnabled) {
    return {
      cycleEnabled,
      anchorCount: 0,
      hasCycleAnchor: false,
      phaseTrust: 'learning',
      predictionTrust: 'none',
      gapMode: null,
      showCurrentCyclePrediction: false,
      showFutureCycleStart: false,
      showFutureOvulation: false,
    };
  }

  const sorted = sortByDateAsc(entriesRaw);
  const cycleStats = computeCycleStats(sorted);
  const anchorCount = cycleStats.cycleStarts.length;
  const hasCycleAnchor = anchorCount > 0;
  const rhythmModel = getRhythmModel(sorted, userData, refISO);
  const phaseState = getRhythmPhaseState();
  const gapMode = typeof (phaseState as any)?.gapMode === 'string' ? String((phaseState as any).gapMode) : null;

  const phaseTrust: CyclePhaseTrust = !hasCycleAnchor
    ? 'learning'
    : gapMode === 'stale' || gapMode === 'catchup' || phaseState?.historyLockLevel !== 'confirmed' || rhythmModel.source === 'inferred' || anchorCount < 2
      ? 'estimated'
      : 'confirmed';

  const predictionTrust: CyclePredictionTrust = !hasCycleAnchor
    ? 'none'
    : gapMode === 'stale'
      ? 'stale'
      : anchorCount < 2
        ? 'early'
        : 'established';

  return {
    cycleEnabled,
    anchorCount,
    hasCycleAnchor,
    phaseTrust,
    predictionTrust,
    gapMode,
    showCurrentCyclePrediction: hasCycleAnchor && predictionTrust !== 'stale',
    showFutureCycleStart: hasCycleAnchor && predictionTrust !== 'stale',
    showFutureOvulation: hasCycleAnchor && predictionTrust === 'established',
  };
}
