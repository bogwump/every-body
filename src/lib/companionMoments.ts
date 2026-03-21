import { isoTodayLocal } from './date';

export const COMPANION_MOMENTS_KEY = 'everybody:v2:companion_moments';
export const COMPANION_MOMENT_ARCHIVE_KEY = 'everybody:v2:companion_moment_archive';
const MOMENT_HISTORY_LIMIT = 120;

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

export type ArchivedCompanionMoment = {
  archiveId: string;
  momentId: string;
  type: CompanionMomentType;
  date: string;
  archivedAtISO: string;
  archivedReason: 'expired' | 'dismissed' | 'replaced' | 'interacted';
  eyebrow?: string;
  title: string;
  body: string;
  button?: string;
  screen?: string;
  focusTarget?: string;
  confidence?: string;
  signals?: string[];
  metadata?: Record<string, unknown>;
};

export type CompanionMomentDisplayCopy = {
  eyebrow?: string;
  title: string;
  body: string;
  button: string;
  screen: string;
};

export function getMomentFocusTarget(moment: CompanionMoment): string | undefined {
  const labels = toSignalLabels(moment.data);
  if(labels == null) {
	  return undefined;
  }
  const joinedLables = labels.join(' ').toLowerCase();
  switch (moment.type) {
    case 'experiment_suggestion':
    case 'experiment_result_ready':
      return 'insights:experiments';
    case 'helpful_pattern_detected':
      return 'insights:helpful';
    case 'new_pattern':
      if (joinedLables.includes('sleep') || joinedLables.includes('restless legs') || joinedLables.includes('restlesslegs')) return 'insights:sleep';
      return 'insights:connections';
    case 'unlock_milestone':
      return 'insights:connections';
    default:
      return undefined;
  }
}

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

function normaliseArchive(value: unknown): ArchivedCompanionMoment | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.archiveId !== 'string' || typeof item.momentId !== 'string' || typeof item.type !== 'string' || !isISODate(item.date)) return null;
  return {
    archiveId: item.archiveId,
    momentId: item.momentId,
    type: item.type as CompanionMomentType,
    date: item.date,
    archivedAtISO: typeof item.archivedAtISO === 'string' ? item.archivedAtISO : new Date().toISOString(),
    archivedReason: item.archivedReason === 'expired' || item.archivedReason === 'dismissed' || item.archivedReason === 'replaced' || item.archivedReason === 'interacted' ? item.archivedReason : 'expired',
    eyebrow: typeof item.eyebrow === 'string' ? item.eyebrow : undefined,
    title: typeof item.title === 'string' ? item.title : 'Saved update',
    body: typeof item.body === 'string' ? item.body : '',
    button: typeof item.button === 'string' ? item.button : undefined,
    screen: typeof item.screen === 'string' ? item.screen : undefined,
    focusTarget: typeof item.focusTarget === 'string' ? item.focusTarget : undefined,
    confidence: typeof item.confidence === 'string' ? item.confidence : undefined,
    signals: Array.isArray(item.signals) ? item.signals.map((entry) => String(entry)) : undefined,
    metadata: item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : undefined,
  };
}

function toSignalLabels(data: Record<string, unknown> | undefined): string[] | undefined {
  const raw = Array.isArray(data?.signals) ? data?.signals : [];
  const values = raw.map((item) => String(item)).filter(Boolean);
  return values.length ? values : undefined;
}

export function getMomentDisplayCopy(moment: CompanionMoment): CompanionMomentDisplayCopy {
  const data = moment.data ?? {};
  switch (moment.type) {
    case 'phase_change': {
      const phase = typeof data.phase === 'string' ? String(data.phase) : 'a new phase';
      const phaseLabel = phase === 'reset' ? 'Reset Phase' : phase === 'rebuilding' ? 'Rebuilding Phase' : phase === 'expressive' ? 'Expressive Phase' : phase === 'protective' ? 'Protective Phase' : phase;
      return {
        eyebrow: 'New phase detected',
        title: `You’ve moved into ${phaseLabel}`,
        body: 'Your rhythm page has been updated for this new window.',
        button: 'View rhythm',
        screen: 'rhythm',
      };
    }
    case 'new_pattern':
      return {
        eyebrow: 'New pattern spotted',
        title: typeof data.title === 'string' ? data.title : 'A new pattern has started standing out',
        body: typeof data.body === 'string' ? data.body : 'A new pattern has started standing out in your logs.',
        button: 'See insights',
        screen: 'insights',
      };
    case 'experiment_suggestion':
      return {
        eyebrow: 'Experiment idea',
        title: typeof data.title === 'string' ? data.title : 'Something may be worth testing this week',
        body: typeof data.body === 'string' ? data.body : 'A gentle experiment can help you see whether this pattern is worth supporting differently.',
        button: 'Try experiment',
        screen: 'insights',
      };
    case 'experiment_result_ready':
      return {
        eyebrow: 'Experiment update',
        title: typeof data.title === 'string' ? data.title : 'Your experiment is ready to look back on',
        body: typeof data.body === 'string' ? data.body : 'You now have enough to review what felt useful from that test.',
        button: 'Review experiment',
        screen: 'insights',
      };
    case 'helpful_pattern_detected':
      return {
        eyebrow: 'Something that helps',
        title: typeof data.title === 'string' ? data.title : 'A supportive pattern has started standing out',
        body: typeof data.body === 'string' ? data.body : 'Your past experiments have started pointing to something that may help in this window.',
        button: 'See insights',
        screen: 'insights',
      };
    case 'rhythm_shift':
      return {
        eyebrow: 'Rhythm shift noticed',
        title: typeof data.title === 'string' ? data.title : 'Your rhythm looks a little different lately',
        body: typeof data.body === 'string' ? data.body : 'Rhythm has picked up a small change in timing worth keeping an eye on.',
        button: 'View rhythm',
        screen: 'rhythm',
      };
    case 'unlock_milestone':
      return {
        eyebrow: 'For you',
        title: typeof data.title === 'string' ? data.title : 'New insights unlocked',
        body: typeof data.body === 'string' ? data.body : 'You have logged enough to start seeing more useful patterns.',
        button: 'See insights',
        screen: 'insights',
      };
    case 'encouragement':
    default:
      return {
        eyebrow: 'For you',
        title: typeof data.title === 'string' ? data.title : 'Nice work checking in',
        body: typeof data.body === 'string' ? data.body : 'You are building a clearer picture of your rhythm over time.',
        button: 'Keep going',
        screen: 'check-in',
      };
  }
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

function defaultExpiry(type: CompanionMomentType, dateISO: string): string | undefined {
  const days =
    type === 'unlock_milestone' ? undefined : 3;
  if (days == null) return undefined;
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getMomentPriority(type: CompanionMomentType): number {
  return MOMENT_PRIORITY[type];
}

function isGuideLikeCompanionMoment(moment: CompanionMoment): boolean {
  const title = typeof moment.data?.title === 'string' ? String(moment.data.title).trim() : '';
  const body = typeof moment.data?.body === 'string' ? String(moment.data.body).trim() : '';
  const guideTitles = new Set([
    'You’re building your rhythm',
    "You're building your rhythm",
    'Your first week is taking shape',
    'Your patterns are starting to settle',
    'Your rhythm is getting easier to read',
    'You have built a stronger baseline',
  ]);

  return moment.id === 'building-rhythm'
    || guideTitles.has(title)
    || body === 'A few more check-ins will help this start turning into personalised guidance.'
    || body.includes('You have enough check-ins now for early patterns to feel a little more trustworthy.')
    || body.includes('Patterns are repeating a bit more now, so the app can be calmer and more specific.')
    || body.includes('With a stronger baseline in place, small changes and experiments should be easier to interpret.');
}

export function getCompanionMoments(): CompanionMoment[] {
  const raw = readJson<unknown[]>(COMPANION_MOMENTS_KEY, []);
  const all = raw
    .map(normaliseMoment)
    .filter((item): item is CompanionMoment => Boolean(item));

  const cleaned = all.filter((moment) => !isGuideLikeCompanionMoment(moment));
  if (cleaned.length !== all.length) writeJson(COMPANION_MOMENTS_KEY, cleaned);

  return cleaned.sort(sortByPriorityThenDate);
}

export function getArchivedMomentSnapshots(limit = MOMENT_HISTORY_LIMIT): ArchivedCompanionMoment[] {
  return readJson<unknown[]>(COMPANION_MOMENT_ARCHIVE_KEY, [])
    .map(normaliseArchive)
    .filter((item): item is ArchivedCompanionMoment => Boolean(item))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.archivedAtISO).localeCompare(String(a.archivedAtISO)))
    .slice(0, limit);
}

export function hasArchivedMomentId(id: string): boolean {
  return getArchivedMomentSnapshots(MOMENT_HISTORY_LIMIT).some((item) => item.momentId === id || item.archiveId === id);
}

function writeArchivedMomentSnapshots(items: ArchivedCompanionMoment[]) {
  writeJson(COMPANION_MOMENT_ARCHIVE_KEY, items.slice(0, MOMENT_HISTORY_LIMIT));
}

function archiveMoment(moment: CompanionMoment, reason: ArchivedCompanionMoment['archivedReason']) {
  const snapshots = getArchivedMomentSnapshots(MOMENT_HISTORY_LIMIT);
  const existing = snapshots.find((item) => item.momentId === moment.id && item.archivedReason === reason);
  if (existing) return snapshots;
  const copy = getMomentDisplayCopy(moment);
  const nextItem: ArchivedCompanionMoment = {
    archiveId: `${moment.id}:${reason}`,
    momentId: moment.id,
    type: moment.type,
    date: moment.date,
    archivedAtISO: new Date().toISOString(),
    archivedReason: reason,
    eyebrow: copy.eyebrow,
    title: copy.title,
    body: copy.body,
    button: copy.button,
    screen: copy.screen,
    focusTarget: getMomentFocusTarget(moment),
    confidence: typeof moment.data?.confidence === 'string' ? String(moment.data.confidence) : undefined,
    signals: toSignalLabels(moment.data),
    metadata: {
      ...(moment.data ?? {}),
      expiresAt: moment.expiresAt,
      createdAtISO: moment.createdAtISO,
    },
  };
  const next = [nextItem, ...snapshots].slice(0, MOMENT_HISTORY_LIMIT);
  writeArchivedMomentSnapshots(next);
  return next;
}

export function getMomentHistory(limit = 10): CompanionMoment[] {
  return getCompanionMoments()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function expireMoments(refISO: string = isoTodayLocal()): CompanionMoment[] {
  const moments = getCompanionMoments();
  const active: CompanionMoment[] = [];
  moments.forEach((moment) => {
    const expired = Boolean(moment.expiresAt && moment.expiresAt < refISO);
    if (expired) {
      archiveMoment(moment, 'expired');
      return;
    }
    active.push(moment);
  });
  if (active.length !== moments.length) writeJson(COMPANION_MOMENTS_KEY, active);
  return active;
}

export function getActiveMoments(refISO: string = isoTodayLocal()): CompanionMoment[] {
  return expireMoments(refISO).filter((moment) => !moment.dismissed);
}

export function getHighestPriorityMoment(refISO: string = isoTodayLocal()): CompanionMoment | null {
  const active = getActiveMoments(refISO).sort(sortByPriorityThenDate);
  return active[0] ?? null;
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
  if (duplicate || hasArchivedMomentId(id)) return moments;

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

  const prunedMoments = sameDayHighest ? moments.filter((moment) => {
    if (moment.date === date && !moment.dismissed) {
      archiveMoment(moment, 'replaced');
      return false;
    }
    return true;
  }) : moments;
  const next = [nextMoment, ...prunedMoments].slice(0, 40);
  writeJson(COMPANION_MOMENTS_KEY, next);
  return next;
}

export function dismissMoment(id: string, reason: ArchivedCompanionMoment['archivedReason'] = 'dismissed') {
  const moments = getCompanionMoments();
  const remaining = moments.filter((moment) => {
    if (moment.id === id) {
      archiveMoment(moment, reason);
      return false;
    }
    return true;
  });
  writeJson(COMPANION_MOMENTS_KEY, remaining);
  return remaining;
}
