import type { CheckInEntry, UserData } from '../types';
import { getRhythmModel, isoToday, sortByDateAsc } from './analytics';

const LAST_DETECTED_PHASE_KEY = 'everybody:v2:last_detected_phase';
const RECENT_PHASE_CHANGE_KEY = 'everybody:v2:recent_phase_change';
const RECENT_PHASE_CHANGE_MAX_AGE_MS = 1000 * 60 * 60 * 72;

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

export function applyPhaseChangeForEntries(args: {
  previousEntries: CheckInEntry[];
  nextEntries: CheckInEntry[];
  userData: UserData;
  refISO?: string;
}) {
  const currentPhase = getDetectedPhaseKey(args.nextEntries, args.userData, args.refISO);
  const previousStored = getStoredPhase()?.phase ?? getDetectedPhaseKey(args.previousEntries, args.userData, args.refISO);
  const changed = detectPhaseChange(previousStored, currentPhase);

  if (currentPhase) {
    if (changed) setRecentPhaseChange(currentPhase, args.refISO);
    setStoredPhase(currentPhase, args.refISO);
  }

  return {
    changed,
    previousPhase: previousStored,
    currentPhase,
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
