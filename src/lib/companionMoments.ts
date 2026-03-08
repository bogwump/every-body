import { isoTodayLocal } from './date';

export const COMPANION_MOMENTS_KEY = 'everybody:v2:companion_moments';

export type CompanionMomentType =
  | 'phase_change'
  | 'new_pattern'
  | 'experiment_suggestion'
  | 'experiment_result_ready'
  | 'helpful_pattern_detected'
  | 'rhythm_shift'
  | 'unlock_milestone'
  | 'encouragement';

export type CompanionMoment = {
  id: string;
  type: CompanionMomentType;
  date: string;
  dismissed: boolean;
  expiresAt?: string;
  createdAtISO?: string;
  data?: Record<string, unknown>;
};

const MOMENT_PRIORITY: Record<CompanionMomentType, number> = {
  phase_change: 1,
  new_pattern: 2,
  experiment_suggestion: 3,
  experiment_result_ready: 4,
  helpful_pattern_detected: 5,
  rhythm_shift: 6,
  unlock_milestone: 6,
  encouragement: 7,
};

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
    // ignore
  }
}

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayDiff(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86400000);
}

function sortByPriorityThenDate(a: CompanionMoment, b: CompanionMoment): number {
  const prio = MOMENT_PRIORITY[a.type] - MOMENT_PRIORITY[b.type];
  if (prio !== 0) return prio;
  return b.date.localeCompare(a.date);
}

function normaliseMoment(value: unknown): CompanionMoment | null {
  if (!value || typeof value !== 'object') return null;
  const moment = value as Record<string, unknown>;
  if (typeof moment.id !== 'string' || typeof moment.type !== 'string' || !isISODate(moment.date)) return null;
  return {
    id: moment.id,
    type: moment.type as CompanionMomentType,
    date: moment.date,
    dismissed: Boolean(moment.dismissed),
    expiresAt: isISODate(moment.expiresAt) ? moment.expiresAt : undefined,
    createdAtISO: typeof moment.createdAtISO === 'string' ? moment.createdAtISO : undefined,
    data: moment.data && typeof moment.data === 'object' ? (moment.data as Record<string, unknown>) : undefined,
  };
}

export function getMomentPriority(type: CompanionMomentType): number {
  return MOMENT_PRIORITY[type];
}

export function getCompanionMoments(): CompanionMoment[] {
  return readJson<unknown[]>(COMPANION_MOMENTS_KEY, [])
    .map(normaliseMoment)
    .filter((item): item is CompanionMoment => Boolean(item))
    .sort(sortByPriorityThenDate);
}

export function getMomentHistory(limit = 10): CompanionMoment[] {
  return getCompanionMoments()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function expireMoments(refISO: string = isoTodayLocal()): CompanionMoment[] {
  const moments = getCompanionMoments();
  const active = moments.filter((moment) => !moment.expiresAt || moment.expiresAt >= refISO);
  if (active.length !== moments.length) {
    writeJson(COMPANION_MOMENTS_KEY, active);
  }
  return active;
}

export function getActiveMoments(refISO: string = isoTodayLocal()): CompanionMoment[] {
  return expireMoments(refISO).filter((moment) => !moment.dismissed);
}

export function getHighestPriorityMoment(refISO: string = isoTodayLocal()): CompanionMoment | null {
  const active = getActiveMoments(refISO).sort(sortByPriorityThenDate);
  return active[0] ?? null;
}

function defaultExpiry(type: CompanionMomentType, dateISO: string): string | undefined {
  const days =
    type === 'phase_change' ? 2 :
    type === 'new_pattern' ? 5 :
    type === 'experiment_suggestion' ? 5 :
    type === 'experiment_result_ready' ? 5 :
    type === 'helpful_pattern_detected' ? 5 :
    type === 'rhythm_shift' ? 4 :
    type === 'unlock_milestone' ? undefined :
    type === 'encouragement' ? 3 :
    undefined;
  if (days == null) return undefined;
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function serialiseData(data?: Record<string, unknown>): string {
  if (!data) return '';
  try {
    return JSON.stringify(Object.keys(data).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {}));
  } catch {
    return '';
  }
}

export function createMoment(input: {
  id?: string;
  type: CompanionMomentType;
  date?: string;
  data?: Record<string, unknown>;
  expiresAt?: string;
}) {
  const moments = getCompanionMoments();
  const date = input.date && isISODate(input.date) ? input.date : isoTodayLocal();
  const dataSig = serialiseData(input.data);
  const id = input.id ?? `${input.type}:${date}:${dataSig}`;

  const duplicate = moments.some((moment) => moment.id === id || (moment.type === input.type && serialiseData(moment.data) === dataSig && moment.date === date));
  if (duplicate) return moments;

  const sameDayMoments = moments.filter((moment) => moment.date === date && !moment.dismissed);
  const sameDayHighest = sameDayMoments.slice().sort(sortByPriorityThenDate)[0] ?? null;
  if (sameDayHighest && getMomentPriority(sameDayHighest.type) <= getMomentPriority(input.type)) return moments;

  const nextMoment: CompanionMoment = {
    id,
    type: input.type,
    date,
    dismissed: false,
    expiresAt: input.expiresAt ?? defaultExpiry(input.type, date),
    createdAtISO: new Date().toISOString(),
    data: input.data,
  };

  const prunedMoments = sameDayHighest ? moments.filter((moment) => !(moment.date === date && !moment.dismissed)) : moments;
  const next = [nextMoment, ...prunedMoments].slice(0, 40);
  writeJson(COMPANION_MOMENTS_KEY, next);
  return next;
}

export function dismissMoment(id: string) {
  const next = getCompanionMoments().map((moment) => (moment.id === id ? { ...moment, dismissed: true } : moment));
  writeJson(COMPANION_MOMENTS_KEY, next);
  return next;
}
