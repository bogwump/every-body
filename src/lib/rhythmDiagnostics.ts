import { isoToday } from './analytics';
import { getAverageCycleLength, getAveragePhaseLength, getCurrentPhaseEntry, getPhaseHistory } from './phaseHistory';

export type RhythmDiagnosticSignal = {
  type: 'long_phase' | 'short_cycle' | 'long_cycle';
  phase?: string;
  deviation: 'shorter_than_usual' | 'longer_than_usual';
  amountDays: number;
};

export function detectUnusualPhaseLength(refISO: string = isoToday()): RhythmDiagnosticSignal | null {
  const current = getCurrentPhaseEntry();
  if (!current) return null;
  const avg = getAveragePhaseLength(current.phase);
  if (!avg || avg < 3) return null;
  const elapsed = Math.max(1, Math.round((new Date(`${refISO}T00:00:00`).getTime() - new Date(`${current.startDate}T00:00:00`).getTime()) / 86400000) + 1);
  if (elapsed >= avg + Math.max(3, Math.round(avg * 0.35))) {
    return {
      type: 'long_phase',
      phase: current.phase,
      deviation: 'longer_than_usual',
      amountDays: elapsed - avg,
    };
  }
  return null;
}

export function detectShortCycle(): RhythmDiagnosticSignal | null {
  const history = getPhaseHistory().filter((entry) => entry.phase === 'reset' || entry.phase === 'bleed');
  if (history.length < 2) return null;
  const avg = getAverageCycleLength();
  if (!avg) return null;
  const latest = history[history.length - 1]?.startDate;
  const prev = history[history.length - 2]?.startDate;
  if (!latest || !prev) return null;
  const diff = Math.round((new Date(`${latest}T00:00:00`).getTime() - new Date(`${prev}T00:00:00`).getTime()) / 86400000);
  const threshold = Math.max(3, Math.round(avg * 0.18));
  if (diff <= avg - threshold) {
    return { type: 'short_cycle', deviation: 'shorter_than_usual', amountDays: avg - diff };
  }
  return null;
}

export function detectLongCycle(): RhythmDiagnosticSignal | null {
  const history = getPhaseHistory().filter((entry) => entry.phase === 'reset' || entry.phase === 'bleed');
  if (history.length < 2) return null;
  const avg = getAverageCycleLength();
  if (!avg) return null;
  const latest = history[history.length - 1]?.startDate;
  const prev = history[history.length - 2]?.startDate;
  if (!latest || !prev) return null;
  const diff = Math.round((new Date(`${latest}T00:00:00`).getTime() - new Date(`${prev}T00:00:00`).getTime()) / 86400000);
  const threshold = Math.max(3, Math.round(avg * 0.18));
  if (diff >= avg + threshold) {
    return { type: 'long_cycle', deviation: 'longer_than_usual', amountDays: diff - avg };
  }
  return null;
}
