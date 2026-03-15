import type { InsightSignal } from "./insightEngine";

export type UnifiedConfidence = "very_low" | "low" | "moderate" | "high";

export function normaliseConfidence(level?: string | null): UnifiedConfidence {
  const value = String(level || '').toLowerCase();
  if (value === 'high') return 'high';
  if (value === 'medium' || value === 'moderate') return 'moderate';
  if (value === 'low') return 'low';
  return 'very_low';
}

export function getConfidencePhrase(level?: string | null): string {
  const confidence = normaliseConfidence(level);
  if (confidence === 'high') return 'tends to';
  if (confidence === 'moderate') return 'seems to';
  if (confidence === 'low') return 'might be related to';
  return 'is still emerging';
}

export function getInsightPhrase(level?: string | null): string {
  const confidence = normaliseConfidence(level);
  if (confidence === 'high') return 'has tended to';
  if (confidence === 'moderate') return 'has seemed to';
  if (confidence === 'low') return 'may sometimes';
  return 'is still emerging';
}

export function getRhythmPhrase(level?: string | null): string {
  const confidence = normaliseConfidence(level);
  if (confidence === 'high') return 'often';
  if (confidence === 'moderate') return 'can';
  if (confidence === 'low') return 'might';
  return 'could';
}

export function getHelpfulPhrase(level?: string | null): string {
  const confidence = normaliseConfidence(level);
  if (confidence === 'high') return 'seems to help';
  if (confidence === 'moderate') return 'may support';
  if (confidence === 'low') return 'looked a little helpful before';
  return 'is still emerging';
}

export function describeInsightConfidence(signal: Pick<InsightSignal, 'confidence'>): UnifiedConfidence {
  return normaliseConfidence(signal.confidence);
}

export function downgradeConfidence(level: UnifiedConfidence | string | null | undefined, steps = 1): UnifiedConfidence {
  const order: UnifiedConfidence[] = ['very_low', 'low', 'moderate', 'high'];
  const current = normaliseConfidence(level);
  const idx = order.indexOf(current);
  return order[Math.max(0, idx - Math.max(0, Math.floor(steps)))];
}
