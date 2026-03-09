import type { CheckInEntry, UserData } from '../types';
import { getRhythmModel, isoToday, sortByDateAsc } from './analytics';
import { createMoment } from './companionMoments';
import { getCurrentPhaseEntry, getPhaseElapsedDays, savePhaseHistory, type PhaseHistoryEntry, type PhaseHistoryPhase, updatePhaseHistory } from './phaseHistory';

const LAST_DETECTED_PHASE_KEY = 'everybody:v2:last_detected_phase';
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
  return (
    getCurrentPhaseEntry()?.phase ??
    getStoredPhase()?.phase ??
    getDetectedPhaseKey(previousEntries, userData, refISO) ??
    null
  );
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
  const proposedPhase = getDetectedPhaseKey(args.nextEntries, args.userData, refISO);
  const previousConfirmed = getConfirmedPreviousPhase(args.previousEntries, args.userData, refISO);

  if (previousConfirmed && proposedPhase === previousConfirmed) {
    restoreMissingPhaseHistory(previousConfirmed, refISO);
  }

  const validation = validatePhaseTransition({
    previousPhase: previousConfirmed,
    proposedPhase,
    refISO,
  });

  const currentPhase = validation.acceptedPhase;
  const changed = validation.changed;

  if (currentPhase) {
    if (changed && previousConfirmed && previousConfirmed !== currentPhase) {
      setRecentPhaseChange(currentPhase, refISO);
      updatePhaseHistory(currentPhase, refISO);
      createMoment({ type: 'phase_change', date: refISO, data: { phase: currentPhase } });
    } else if (!getCurrentPhaseEntry()) {
      restoreMissingPhaseHistory(currentPhase, refISO);
      if (!getCurrentPhaseEntry()) updatePhaseHistory(currentPhase, refISO);
    }
    setStoredPhase(currentPhase, refISO);
  }

  return {
    changed,
    previousPhase: previousConfirmed,
    currentPhase,
    proposedPhase,
    transitionReason: validation.reason,
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
