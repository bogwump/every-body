import type { CheckInEntry, UserData } from '../types';
import { getRhythmModel, isoToday, sortByDateAsc } from './analytics';
import { createMoment } from './companionMoments';
import { getCurrentPhaseEntry, getPhaseElapsedDays, savePhaseHistory, type PhaseHistoryEntry, type PhaseHistoryPhase, updatePhaseHistory } from './phaseHistory';

const LAST_DETECTED_PHASE_KEY = 'everybody:v2:last_detected_phase';
const RHYTHM_PHASE_STATE_KEY = 'everybody:v2:rhythm_phase_state';
const RECENT_PHASE_CHANGE_KEY = 'everybody:v2:recent_phase_change';
const RECENT_PHASE_CHANGE_MAX_AGE_MS = 1000 * 60 * 60 * 72;

const PHASE_ORDER = ['reset', 'rebuilding', 'expressive', 'protective'] as const;
const MIN_PHASE_DAYS: Record<string, number> = {
  reset: 2,
  rebuilding: 3,
  expressive: 2,
  protective: 3,
};

export type StoredPhase = {
  phase: string;
  updatedAt: string;
};

export type PhaseConfidenceState = 'very_low' | 'low' | 'moderate' | 'high';
export type HistoryLockLevel = 'provisional' | 'stabilising' | 'confirmed';

export type RhythmPhaseState = {
  estimatedPhase: string | null;
  estimatedPhaseStartedAt: string | null;
  confirmedPhase: string | null;
  confirmedPhaseStartedAt: string | null;
  phaseConfidence: PhaseConfidenceState;
  historyLockLevel: HistoryLockLevel;
  updatedAt: string;
};

export type RecentPhaseChange = {
  phase: string;
  changedAt: string;
  dismissed: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage issues
  }
}

function todayISOOr(dateISO?: string): string {
  return typeof dateISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? dateISO : isoToday();
}

export function getStoredPhase(): StoredPhase | null {
  const parsed = readJson<StoredPhase>(LAST_DETECTED_PHASE_KEY);
  if (!isObject(parsed) || typeof parsed.phase !== 'string' || typeof parsed.updatedAt !== 'string') return null;
  return parsed;
}

export function setStoredPhase(phase: string, updatedAt?: string) {
  writeJson(LAST_DETECTED_PHASE_KEY, {
    phase,
    updatedAt: todayISOOr(updatedAt),
  });
}

export function getRhythmPhaseState(): RhythmPhaseState | null {
  const parsed = readJson<RhythmPhaseState>(RHYTHM_PHASE_STATE_KEY);
  if (!isObject(parsed)) return null;

  const estimatedPhase = typeof parsed.estimatedPhase === 'string' ? parsed.estimatedPhase : null;
  const estimatedPhaseStartedAt = isISODate(parsed.estimatedPhaseStartedAt) ? parsed.estimatedPhaseStartedAt : null;
  const confirmedPhase = typeof parsed.confirmedPhase === 'string' ? parsed.confirmedPhase : null;
  const confirmedPhaseStartedAt = isISODate(parsed.confirmedPhaseStartedAt) ? parsed.confirmedPhaseStartedAt : null;
  const phaseConfidence = ((): PhaseConfidenceState => {
    const value = String((parsed as any).phaseConfidence || 'low');
    if (value === 'very_low' || value === 'low' || value === 'moderate' || value === 'high') return value;
    return 'low';
  })();
  const historyLockLevel = ((): HistoryLockLevel => {
    const value = String((parsed as any).historyLockLevel || 'provisional');
    if (value === 'provisional' || value === 'stabilising' || value === 'confirmed') return value;
    return 'provisional';
  })();
  const updatedAt = isISODate(parsed.updatedAt) ? parsed.updatedAt : isoToday();

  return {
    estimatedPhase,
    estimatedPhaseStartedAt,
    confirmedPhase,
    confirmedPhaseStartedAt,
    phaseConfidence,
    historyLockLevel,
    updatedAt,
  };
}

export function setRhythmPhaseState(next: RhythmPhaseState) {
  writeJson(RHYTHM_PHASE_STATE_KEY, next);
}

function getPhaseIndex(phase: string | null | undefined): number {
  if (!phase) return -1;
  return PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
}

function isNextForwardPhase(previousPhase: string, nextPhase: string): boolean {
  const prevIndex = getPhaseIndex(previousPhase);
  const nextIndex = getPhaseIndex(nextPhase);
  if (prevIndex < 0 || nextIndex < 0) return false;
  return (prevIndex + 1) % PHASE_ORDER.length === nextIndex;
}

function previousPhaseInOrder(phase: string | null | undefined): string | null {
  const idx = getPhaseIndex(phase);
  if (idx < 0) return null;
  return PHASE_ORDER[(idx + PHASE_ORDER.length - 1) % PHASE_ORDER.length];
}

function nextPhaseInOrder(phase: string | null | undefined): string | null {
  const idx = getPhaseIndex(phase);
  if (idx < 0) return null;
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
}

function isAdjacentPhase(previousPhase: string | null | undefined, nextPhase: string | null | undefined): boolean {
  if (!previousPhase || !nextPhase) return false;
  return nextPhase === nextPhaseInOrder(previousPhase) || nextPhase === previousPhaseInOrder(previousPhase);
}

function minimumDaysForPhase(phase: string | null | undefined): number {
  return MIN_PHASE_DAYS[String(phase || '').toLowerCase()] ?? 2;
}

function restoreMissingPhaseHistory(currentPhase: string, refISO: string) {
  const current = getCurrentPhaseEntry();
  if (current) return;

  const stored = getStoredPhase();
  if (!stored || stored.phase !== currentPhase) return;

  const seededStart = isISODate(stored.updatedAt) && stored.updatedAt <= refISO ? stored.updatedAt : refISO;
  const seeded: PhaseHistoryEntry[] = [{ phase: currentPhase as PhaseHistoryPhase, startDate: seededStart }];
  savePhaseHistory(seeded);
}

function countDistinctLoggedDays(entries: CheckInEntry[]): number {
  return new Set(
    (entries ?? [])
      .map((entry) => {
        const iso = (entry as any)?.dateISO ?? (entry as any)?.date;
        return isISODate(iso) ? iso : null;
      })
      .filter((value): value is string => Boolean(value))
  ).size;
}

function derivePhaseConfidence(args: { daysLogged: number; hasAnchor: boolean; hasConfirmedHistory: boolean }): PhaseConfidenceState {
  const { daysLogged, hasAnchor, hasConfirmedHistory } = args;
  if (hasAnchor) return 'high';
  if (daysLogged >= 14 && hasConfirmedHistory) return 'high';
  if (daysLogged >= 7) return 'moderate';
  if (daysLogged >= 3) return 'low';
  return 'very_low';
}

function deriveHistoryLockLevel(args: { daysLogged: number; hasAnchor: boolean; hasConfirmedHistory: boolean }): HistoryLockLevel {
  const { daysLogged, hasAnchor, hasConfirmedHistory } = args;
  if (hasAnchor || (hasConfirmedHistory && daysLogged >= 14)) return 'confirmed';
  if (daysLogged >= 7) return 'stabilising';
  return 'provisional';
}

function buildPhaseState(args: {
  previousState: RhythmPhaseState | null;
  previousConfirmed: string | null;
  proposedPhase: string | null;
  detectedSource: string;
  daysLogged: number;
  refISO: string;
}): RhythmPhaseState {
  const { previousState, previousConfirmed, proposedPhase, detectedSource, daysLogged, refISO } = args;
  const hasConfirmedHistory = Boolean(previousConfirmed || getCurrentPhaseEntry());
  const hasAnchor = detectedSource === 'override' || detectedSource === 'bleed';
  const phaseConfidence = derivePhaseConfidence({ daysLogged, hasAnchor, hasConfirmedHistory });
  const historyLockLevel = deriveHistoryLockLevel({ daysLogged, hasAnchor, hasConfirmedHistory });

  const previousEstimated = previousState?.estimatedPhase ?? previousConfirmed ?? null;
  const estimatedPhase = proposedPhase ?? previousEstimated;
  const estimatedPhaseStartedAt =
    estimatedPhase && estimatedPhase === previousEstimated
      ? previousState?.estimatedPhaseStartedAt ?? refISO
      : estimatedPhase
      ? refISO
      : null;

  let confirmedPhase = previousConfirmed ?? previousState?.confirmedPhase ?? null;
  let confirmedPhaseStartedAt = previousState?.confirmedPhaseStartedAt ?? (confirmedPhase ? refISO : null);

  if (historyLockLevel === 'confirmed' && proposedPhase) {
    confirmedPhase = proposedPhase;
    if (confirmedPhase !== (previousState?.confirmedPhase ?? previousConfirmed ?? null)) {
      confirmedPhaseStartedAt = refISO;
    } else {
      confirmedPhaseStartedAt = previousState?.confirmedPhaseStartedAt ?? confirmedPhaseStartedAt ?? refISO;
    }
  }

  return {
    estimatedPhase,
    estimatedPhaseStartedAt,
    confirmedPhase,
    confirmedPhaseStartedAt,
    phaseConfidence,
    historyLockLevel,
    updatedAt: refISO,
  };
}

export function detectPhaseChange(previousPhase: string | null | undefined, currentPhase: string | null | undefined): boolean {
  if (!previousPhase || !currentPhase) return false;
  return previousPhase !== currentPhase;
}

export function setRecentPhaseChange(phase: string, changedAt?: string) {
  writeJson(RECENT_PHASE_CHANGE_KEY, {
    phase,
    changedAt: todayISOOr(changedAt),
    dismissed: false,
  });
}

export function getRecentPhaseChange(): RecentPhaseChange | null {
  const parsed = readJson<RecentPhaseChange>(RECENT_PHASE_CHANGE_KEY);
  if (!isObject(parsed) || typeof parsed.phase !== 'string' || typeof parsed.changedAt !== 'string') return null;

  const changedAt = new Date(`${parsed.changedAt}T00:00:00`).getTime();
  if (!Number.isFinite(changedAt)) return null;
  if (Date.now() - changedAt > RECENT_PHASE_CHANGE_MAX_AGE_MS) {
    clearRecentPhaseChange();
    return null;
  }
  return {
    phase: parsed.phase,
    changedAt: parsed.changedAt,
    dismissed: Boolean(parsed.dismissed),
  };
}

export function dismissRecentPhaseChange() {
  const current = getRecentPhaseChange();
  if (!current) return;
  writeJson(RECENT_PHASE_CHANGE_KEY, { ...current, dismissed: true });
}

export function clearRecentPhaseChange() {
  try {
    localStorage.removeItem(RECENT_PHASE_CHANGE_KEY);
  } catch {
    // ignore
  }
}

export function getDetectedPhaseKey(entries: CheckInEntry[], userData: UserData, refISO?: string): string | null {
  const model = getRhythmModel(sortByDateAsc(entries), userData, refISO ?? isoToday());
  return model.phaseKey ?? null;
}

function getConfirmedPreviousPhase(previousEntries: CheckInEntry[], userData: UserData, refISO: string): string | null {
  void previousEntries;
  void userData;
  void refISO;
  return getCurrentPhaseEntry()?.phase ?? getRhythmPhaseState()?.confirmedPhase ?? getStoredPhase()?.phase ?? null;
}

function validatePhaseTransition(args: {
  previousPhase: string | null;
  proposedPhase: string | null;
  refISO: string;
}) {
  const { previousPhase, proposedPhase } = args;
  if (!proposedPhase) {
    return { acceptedPhase: previousPhase, changed: false, reason: 'no_proposed_phase' };
  }
  if (!previousPhase) {
    return { acceptedPhase: proposedPhase, changed: true, reason: 'bootstrap' };
  }
  if (previousPhase === proposedPhase) {
    return { acceptedPhase: previousPhase, changed: false, reason: 'same_phase' };
  }

  if (proposedPhase === 'reset') {
    return { acceptedPhase: proposedPhase, changed: true, reason: 'explicit_reset' };
  }

  const elapsed = getPhaseElapsedDays(args.refISO) ?? 0;
  if (!isNextForwardPhase(previousPhase, proposedPhase)) {
    return { acceptedPhase: previousPhase, changed: false, reason: 'blocked_non_forward_transition' };
  }

  if (elapsed > 0 && elapsed < minimumDaysForPhase(previousPhase)) {
    return { acceptedPhase: previousPhase, changed: false, reason: 'blocked_minimum_phase_days' };
  }

  return { acceptedPhase: proposedPhase, changed: true, reason: 'forward_transition' };
}

export function applyPhaseChangeForEntries(args: {
  previousEntries: CheckInEntry[];
  nextEntries: CheckInEntry[];
  userData: UserData;
  refISO?: string;
}) {
  const refISO = todayISOOr(args.refISO);
  const rhythmModel = getRhythmModel(sortByDateAsc(args.nextEntries), args.userData, refISO);
  const proposedPhase = rhythmModel.phaseKey ?? null;
  const previousState = getRhythmPhaseState();
  const previousConfirmed = getConfirmedPreviousPhase(args.previousEntries, args.userData, refISO);
  const daysLogged = countDistinctLoggedDays(args.nextEntries);

  const nextState = buildPhaseState({
    previousState,
    previousConfirmed,
    proposedPhase,
    detectedSource: rhythmModel.source,
    daysLogged,
    refISO,
  });

  let validation: {
    acceptedPhase: string | null;
    changed: boolean;
    reason: string;
  } = {
    acceptedPhase: previousConfirmed,
    changed: false,
    reason: nextState.historyLockLevel === 'confirmed' ? 'no_proposed_phase' : 'estimate_only',
  };

  if (nextState.historyLockLevel === 'confirmed') {
    if (previousConfirmed && proposedPhase === previousConfirmed) {
      restoreMissingPhaseHistory(previousConfirmed, refISO);
    }

    validation = validatePhaseTransition({
      previousPhase: previousConfirmed,
      proposedPhase,
      refISO,
    });

    nextState.confirmedPhase = validation.acceptedPhase ?? nextState.confirmedPhase ?? null;
    if (nextState.confirmedPhase && validation.changed) {
      nextState.confirmedPhaseStartedAt = refISO;
    } else if (nextState.confirmedPhase && !nextState.confirmedPhaseStartedAt) {
      nextState.confirmedPhaseStartedAt = refISO;
    }
  } else {
    const previousEstimated = previousState?.estimatedPhase ?? previousConfirmed;
    if (previousEstimated && proposedPhase && previousEstimated !== proposedPhase && !isAdjacentPhase(previousEstimated, proposedPhase)) {
      nextState.estimatedPhase = previousEstimated;
      nextState.estimatedPhaseStartedAt = previousState?.estimatedPhaseStartedAt ?? refISO;
      validation.reason = 'blocked_non_adjacent_estimate';
    }
  }

  const currentPhase = validation.acceptedPhase ?? nextState.confirmedPhase ?? nextState.estimatedPhase ?? null;
  const changed = validation.changed;

  if (nextState.confirmedPhase) {
    if (changed && previousConfirmed && previousConfirmed !== nextState.confirmedPhase) {
      setRecentPhaseChange(nextState.confirmedPhase, refISO);
      updatePhaseHistory(nextState.confirmedPhase, refISO);
      createMoment({ type: 'phase_change', date: refISO, data: { phase: nextState.confirmedPhase } });
    } else if (!getCurrentPhaseEntry()) {
      restoreMissingPhaseHistory(nextState.confirmedPhase, refISO);
      if (!getCurrentPhaseEntry()) updatePhaseHistory(nextState.confirmedPhase, refISO);
    }
    setStoredPhase(nextState.confirmedPhase, refISO);
  }

  setRhythmPhaseState(nextState);

  return {
    changed,
    previousPhase: previousConfirmed,
    currentPhase,
    proposedPhase,
    transitionReason: validation.reason,
    estimatedPhase: nextState.estimatedPhase,
    confirmedPhase: nextState.confirmedPhase,
    phaseConfidence: nextState.phaseConfidence,
    historyLockLevel: nextState.historyLockLevel,
  };
}

export function phaseLabelFromKey(phase: string | null | undefined): string {
  switch (phase) {
    case 'reset':
      return 'Reset Phase';
    case 'rebuilding':
      return 'Rebuilding Phase';
    case 'expressive':
      return 'Expressive Phase';
    case 'protective':
      return 'Protective Phase';
    default:
      return 'new phase';
  }
}
