import type { InsightSignal } from './insightEngine';
import type { PatternDriverHint } from './patternDrivers';
import type { InsightMetricKey } from '../types';

export type PatternFeedbackStatus = 'active' | 'suppressed' | 'confirmed';
export type PatternUserFeedback = 'yes' | 'no' | 'unsure';
export type { PatternDriverHint } from './patternDrivers';

export interface PatternFeedbackRecord {
  id: string;
  patternId: string;
  canonicalMetrics: string[];
  status: PatternFeedbackStatus;
  userContradicted?: boolean;
  userFeedback?: PatternUserFeedback;
  lastFeedback: string;
  confidence?: number;
  previousScore?: number;
  resurfacedAt?: string;
  suppressPromptUntil?: string;
  restoredAt?: string;
  historyNote?: string;
  userDriverHint?: PatternDriverHint;
}


export interface PatternFeedbackHistoryEntry {
  eventId: string;
  patternFeedbackId: string;
  patternId: string;
  canonicalMetrics: string[];
  action: 'confirmed' | 'suppressed' | 'unsure' | 'restored' | 'reopened';
  date: string;
  confidence?: number;
  previousScore?: number;
  userDriverHint?: PatternDriverHint;
}

const PATTERN_FEEDBACK_KEY = 'everybody:v2:pattern_feedback';
const PATTERN_FEEDBACK_HISTORY_KEY = 'everybody:v2:pattern_feedback_history';
const FEEDBACK_COOLDOWN_DAYS = 14;

function toISODate(value?: Date | string | null): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date();
  return date.toISOString().slice(0, 10);
}

function readStore(): Record<string, PatternFeedbackRecord> {
  try {
    const raw = localStorage.getItem(PATTERN_FEEDBACK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, PatternFeedbackRecord>) {
  try {
    localStorage.setItem(PATTERN_FEEDBACK_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}


function readHistoryStore(): PatternFeedbackHistoryEntry[] {
  try {
    const raw = localStorage.getItem(PATTERN_FEEDBACK_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function writeHistoryStore(history: PatternFeedbackHistoryEntry[]) {
  try {
    localStorage.setItem(PATTERN_FEEDBACK_HISTORY_KEY, JSON.stringify(history.slice(-200)));
  } catch {
    // ignore
  }
}

function appendHistoryEvent(entry: Omit<PatternFeedbackHistoryEntry, 'eventId'>): PatternFeedbackHistoryEntry {
  const next: PatternFeedbackHistoryEntry = {
    ...entry,
    eventId: `${entry.patternFeedbackId}:${entry.action}:${entry.date}:${Date.now().toString(36)}`,
  };
  const history = readHistoryStore();
  history.push(next);
  writeHistoryStore(history);
  return next;
}

export function listPatternFeedbackHistory(): PatternFeedbackHistoryEntry[] {
  return readHistoryStore().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.eventId || '').localeCompare(String(a.eventId || '')));
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function canonicalPairKey(a: InsightMetricKey | string, b: InsightMetricKey | string): string {
  return [String(a), String(b)].sort().join('::');
}

export function getPatternFeedbackIdFromMetrics(a: InsightMetricKey | string, b: InsightMetricKey | string): string {
  return `pair:${canonicalPairKey(a, b)}`;
}

export function getPatternFeedbackIdFromSignal(signal: Pick<InsightSignal, 'type' | 'metrics'>): string | null {
  if (!signal || signal.type !== 'metric_pair' || !Array.isArray(signal.metrics) || signal.metrics.length < 2) return null;
  return getPatternFeedbackIdFromMetrics(signal.metrics[0], signal.metrics[1]);
}

export function listPatternFeedback(): PatternFeedbackRecord[] {
  return Object.values(readStore());
}

export function getPatternFeedback(id: string | null | undefined): PatternFeedbackRecord | null {
  if (!id) return null;
  return readStore()[id] ?? null;
}

function upsert(record: PatternFeedbackRecord): PatternFeedbackRecord {
  const store = readStore();
  store[record.id] = record;
  writeStore(store);
  return record;
}

export function suppressPattern(args: { id: string; patternId?: string; metrics: Array<InsightMetricKey | string>; previousScore?: number; confidence?: number; driverHint?: PatternDriverHint; }): PatternFeedbackRecord {
  const today = toISODate();
  const existing = getPatternFeedback(args.id);
  const record = upsert({
    id: args.id,
    patternId: args.patternId ?? args.id,
    canonicalMetrics: args.metrics.map(String).slice(0, 2).sort(),
    status: 'suppressed',
    userContradicted: true,
    userFeedback: 'no',
    lastFeedback: today,
    confidence: typeof args.confidence === 'number' ? args.confidence : existing?.confidence,
    previousScore: typeof args.previousScore === 'number' ? args.previousScore : existing?.previousScore,
    suppressPromptUntil: addDays(today, FEEDBACK_COOLDOWN_DAYS),
    historyNote: 'Later marked by you as unlikely.',
    userDriverHint: args.driverHint ?? existing?.userDriverHint,
  });
  appendHistoryEvent({
    patternFeedbackId: record.id,
    patternId: record.patternId,
    canonicalMetrics: record.canonicalMetrics,
    action: 'suppressed',
    date: today,
    confidence: record.confidence,
    previousScore: record.previousScore,
    userDriverHint: record.userDriverHint,
  });
  return record;
}

export function confirmPattern(args: { id: string; patternId?: string; metrics: Array<InsightMetricKey | string>; previousScore?: number; confidence?: number; driverHint?: PatternDriverHint; }): PatternFeedbackRecord {
  const today = toISODate();
  const existing = getPatternFeedback(args.id);
  const nextConfidenceBase = typeof args.confidence === 'number' ? args.confidence : existing?.confidence ?? 0.6;
  const record = upsert({
    id: args.id,
    patternId: args.patternId ?? args.id,
    canonicalMetrics: args.metrics.map(String).slice(0, 2).sort(),
    status: 'confirmed',
    userContradicted: false,
    userFeedback: 'yes',
    lastFeedback: today,
    confidence: Math.min(0.98, nextConfidenceBase + 0.12),
    previousScore: typeof args.previousScore === 'number' ? args.previousScore : existing?.previousScore,
    suppressPromptUntil: addDays(today, FEEDBACK_COOLDOWN_DAYS),
    userDriverHint: args.driverHint ?? existing?.userDriverHint,
  });
  appendHistoryEvent({
    patternFeedbackId: record.id,
    patternId: record.patternId,
    canonicalMetrics: record.canonicalMetrics,
    action: 'confirmed',
    date: today,
    confidence: record.confidence,
    previousScore: record.previousScore,
    userDriverHint: record.userDriverHint,
  });
  return record;
}

export function markPatternUnsure(args: { id: string; patternId?: string; metrics: Array<InsightMetricKey | string>; previousScore?: number; confidence?: number; driverHint?: PatternDriverHint; }): PatternFeedbackRecord {
  const today = toISODate();
  const existing = getPatternFeedback(args.id);
  const record = upsert({
    id: args.id,
    patternId: args.patternId ?? args.id,
    canonicalMetrics: args.metrics.map(String).slice(0, 2).sort(),
    status: existing?.status ?? 'active',
    userContradicted: Boolean(existing?.userContradicted),
    userFeedback: 'unsure',
    lastFeedback: today,
    confidence: typeof args.confidence === 'number' ? args.confidence : existing?.confidence,
    previousScore: typeof args.previousScore === 'number' ? args.previousScore : existing?.previousScore,
    suppressPromptUntil: addDays(today, FEEDBACK_COOLDOWN_DAYS),
    userDriverHint: args.driverHint ?? existing?.userDriverHint,
  });
  appendHistoryEvent({
    patternFeedbackId: record.id,
    patternId: record.patternId,
    canonicalMetrics: record.canonicalMetrics,
    action: 'unsure',
    date: today,
    confidence: record.confidence,
    previousScore: record.previousScore,
    userDriverHint: record.userDriverHint,
  });
  return record;
}

export function restorePattern(id: string, reducedConfidence = 0.45): PatternFeedbackRecord | null {
  const existing = getPatternFeedback(id);
  if (!existing) return null;
  const today = toISODate();
  const record = upsert({
    ...existing,
    status: 'active',
    confidence: Math.min(reducedConfidence, existing.confidence ?? reducedConfidence),
    userContradicted: false,
    userFeedback: undefined,
    lastFeedback: today,
    restoredAt: today,
    historyNote: 'Restored by you for further observation.',
    suppressPromptUntil: undefined,
    userDriverHint: existing.userDriverHint,
  });
  appendHistoryEvent({
    patternFeedbackId: record.id,
    patternId: record.patternId,
    canonicalMetrics: record.canonicalMetrics,
    action: 'restored',
    date: today,
    confidence: record.confidence,
    previousScore: record.previousScore,
    userDriverHint: record.userDriverHint,
  });
  return record;
}

export function reopenPatternForReview(id: string, reducedConfidence = 0.45): PatternFeedbackRecord | null {
  const existing = getPatternFeedback(id);
  if (!existing) return null;
  const today = toISODate();
  const record = upsert({
    ...existing,
    status: 'active',
    confidence: Math.min(reducedConfidence, existing.confidence ?? reducedConfidence),
    userContradicted: false,
    userFeedback: undefined,
    lastFeedback: today,
    restoredAt: today,
    historyNote: 'Reopened by you for reassessment after more logging.',
    suppressPromptUntil: undefined,
    userDriverHint: existing.userDriverHint,
  });
  appendHistoryEvent({
    patternFeedbackId: record.id,
    patternId: record.patternId,
    canonicalMetrics: record.canonicalMetrics,
    action: 'reopened',
    date: today,
    confidence: record.confidence,
    previousScore: record.previousScore,
    userDriverHint: record.userDriverHint,
  });
  return record;
}

export function shouldPromptPatternFeedback(id: string | null | undefined, cycleScoped = false, currentCycleKey?: string | null): boolean {
  const record = getPatternFeedback(id);
  if (!record) return true;
  if (record.status === 'suppressed') return false;
  if (record.suppressPromptUntil && record.suppressPromptUntil >= toISODate()) return false;
  if (record.status === 'confirmed' && cycleScoped && currentCycleKey) {
    return !String(record.lastFeedback || '').startsWith(currentCycleKey);
  }
  return true;
}

export function getFeedbackForMetrics(a: InsightMetricKey | string, b: InsightMetricKey | string): PatternFeedbackRecord | null {
  return getPatternFeedback(getPatternFeedbackIdFromMetrics(a, b));
}

export function isSuppressedPair(a: InsightMetricKey | string, b: InsightMetricKey | string, currentScore?: number): boolean {
  const record = getFeedbackForMetrics(a, b);
  if (!record || record.status !== 'suppressed') return false;
  const baseline = Number(record.previousScore ?? 0);
  if (typeof currentScore === 'number' && baseline > 0 && currentScore > baseline * 2) return false;
  return true;
}

export function getResurfacingNoteForPair(a: InsightMetricKey | string, b: InsightMetricKey | string, currentScore?: number): string | null {
  const record = getFeedbackForMetrics(a, b);
  if (!record || record.status !== 'suppressed') return null;
  const baseline = Number(record.previousScore ?? 0);
  if (typeof currentScore === 'number' && baseline > 0 && currentScore > baseline * 2) {
    return 'Earlier this pattern didn’t feel accurate, but new data suggests it may be worth another look.';
  }
  return null;
}

export function filterSignalsByPatternFeedback(signals: InsightSignal[]): InsightSignal[] {
  return signals
    .filter((signal) => {
      const id = getPatternFeedbackIdFromSignal(signal);
      if (!id) return true;
      const score = typeof signal.score === 'number' ? signal.score : undefined;
      return !isSuppressedPair(signal.metrics[0], signal.metrics[1], score);
    })
    .map((signal) => {
      const id = getPatternFeedbackIdFromSignal(signal);
      const record = getPatternFeedback(id);
      if (!record || signal.type !== 'metric_pair') return signal;
      if (record.status === 'confirmed') {
        return { ...signal, score: Math.round(signal.score + 8) };
      }
      return signal;
    });
}
