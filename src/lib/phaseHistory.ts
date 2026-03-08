import { isoToday } from './analytics';

export const PHASE_HISTORY_KEY = 'everybody:v2:phase_history';

export type PhaseHistoryPhase = 'reset' | 'rebuilding' | 'expressive' | 'protective' | 'bleed' | string;

export type PhaseHistoryEntry = {
  phase: PhaseHistoryPhase;
  startDate: string;
  endDate?: string;
  duration?: number;
};

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDaysInclusive(startISO: string, endISO: string): number {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / ms) + 1);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage issues
  }
}

function normaliseEntry(value: unknown): PhaseHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.phase !== 'string' || !isISODate(entry.startDate)) return null;
  const out: PhaseHistoryEntry = {
    phase: entry.phase,
    startDate: entry.startDate,
  };
  if (isISODate(entry.endDate)) out.endDate = entry.endDate;
  if (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0) {
    out.duration = Math.round(entry.duration);
  } else if (out.endDate) {
    out.duration = diffDaysInclusive(out.startDate, out.endDate);
  }
  return out;
}

export function getPhaseHistory(): PhaseHistoryEntry[] {
  const raw = readJson<unknown[]>(PHASE_HISTORY_KEY, []);
  return raw
    .map(normaliseEntry)
    .filter((entry): entry is PhaseHistoryEntry => Boolean(entry))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function savePhaseHistory(history: PhaseHistoryEntry[]) {
  writeJson(PHASE_HISTORY_KEY, history);
}

export function getCurrentPhaseEntry(): PhaseHistoryEntry | null {
  const history = getPhaseHistory();
  if (!history.length) return null;
  const open = history.find((entry) => !entry.endDate);
  return open ?? history[history.length - 1] ?? null;
}

export function updatePhaseHistory(newPhase: PhaseHistoryPhase, changedAtISO: string = isoToday()): PhaseHistoryEntry[] {
  if (!newPhase || !isISODate(changedAtISO)) return getPhaseHistory();

  const history = getPhaseHistory();
  const last = history[history.length - 1] ?? null;

  if (!last) {
    const next = [{ phase: newPhase, startDate: changedAtISO }];
    savePhaseHistory(next);
    return next;
  }

  if (last.phase === newPhase) {
    if (!last.endDate) return history;
    if (last.endDate && last.endDate >= changedAtISO) {
      const reopened = history.slice(0, -1).concat([{ phase: last.phase, startDate: last.startDate }]);
      savePhaseHistory(reopened);
      return reopened;
    }
  }

  const next = history.slice();
  const previousEnd = changedAtISO > last.startDate ? addDaysISO(changedAtISO, -1) : changedAtISO;
  const closedLast: PhaseHistoryEntry = {
    ...last,
    endDate: previousEnd,
    duration: diffDaysInclusive(last.startDate, previousEnd),
  };
  next[next.length - 1] = closedLast;
  next.push({ phase: newPhase, startDate: changedAtISO });
  savePhaseHistory(next);
  return next;
}

export function getRecentPhaseDurations(phase: PhaseHistoryPhase, limit = 6): number[] {
  return getPhaseHistory()
    .filter((entry) => entry.phase === phase && typeof entry.duration === 'number' && Number.isFinite(entry.duration))
    .slice(-limit)
    .map((entry) => entry.duration as number)
    .filter((days) => days > 0);
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function getAveragePhaseLength(phase: PhaseHistoryPhase, fallback?: number | null): number | null {
  const durations = getRecentPhaseDurations(phase, 6);
  const avg = average(durations);
  if (avg == null) return fallback ?? null;
  return Math.max(1, Math.round(avg));
}

export function getAverageCycleLength(fallback?: number | null): number | null {
  const resetStarts = getPhaseHistory()
    .filter((entry) => entry.phase === 'reset' || entry.phase === 'bleed')
    .map((entry) => entry.startDate)
    .sort();

  if (resetStarts.length < 2) return fallback ?? null;

  const diffs: number[] = [];
  for (let i = 1; i < resetStarts.length; i++) {
    const start = resetStarts[i - 1];
    const end = resetStarts[i];
    const diff = diffDaysInclusive(start, addDaysISO(end, -1)) + 1;
    if (diff >= 15 && diff <= 60) diffs.push(diff);
  }
  const avg = average(diffs.slice(-6));
  if (avg == null) return fallback ?? null;
  return Math.max(15, Math.round(avg));
}

export function getPhaseElapsedDays(refISO: string = isoToday()): number | null {
  const current = getCurrentPhaseEntry();
  if (!current) return null;
  return diffDaysInclusive(current.startDate, refISO);
}
