export const COMPANION_MOMENTS_KEY = 'everybody:v2:companion_moments';

export type CompanionMomentType = 'phase_change' | 'first_insight' | 'experiment_ready' | 'deeper_insights_ready';

export type CompanionMoment = {
  id: string;
  type: CompanionMomentType;
  date: string;
  dismissed: boolean;
  phase?: string;
  createdAtISO?: string;
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

function normaliseMoment(value: unknown): CompanionMoment | null {
  if (!value || typeof value !== 'object') return null;
  const moment = value as Record<string, unknown>;
  if (typeof moment.id !== 'string' || typeof moment.type !== 'string' || !isISODate(moment.date)) return null;
  return {
    id: moment.id,
    type: moment.type as CompanionMomentType,
    date: moment.date,
    dismissed: Boolean(moment.dismissed),
    phase: typeof moment.phase === 'string' ? moment.phase : undefined,
    createdAtISO: typeof moment.createdAtISO === 'string' ? moment.createdAtISO : undefined,
  };
}

export function getCompanionMoments(): CompanionMoment[] {
  return readJson<unknown[]>(COMPANION_MOMENTS_KEY, [])
    .map(normaliseMoment)
    .filter((item): item is CompanionMoment => Boolean(item))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getActiveMoments(): CompanionMoment[] {
  return getCompanionMoments().filter((moment) => !moment.dismissed);
}

export function createMoment(input: Omit<CompanionMoment, 'id' | 'dismissed' | 'createdAtISO'> & { id?: string }) {
  const moments = getCompanionMoments();
  const id = input.id ?? `${input.type}:${input.phase ?? 'none'}:${input.date}`;
  const exists = moments.some((moment) => moment.id === id);
  if (exists) return moments;
  const next = [{ id, dismissed: false, createdAtISO: new Date().toISOString(), ...input }, ...moments].slice(0, 24);
  writeJson(COMPANION_MOMENTS_KEY, next);
  return next;
}

export function dismissMoment(id: string) {
  const next = getCompanionMoments().map((moment) => (moment.id === id ? { ...moment, dismissed: true } : moment));
  writeJson(COMPANION_MOMENTS_KEY, next);
  return next;
}
