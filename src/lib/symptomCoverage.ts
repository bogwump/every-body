import type { UserData } from '../types';

export type SymptomCoverageTier = 'logging_only' | 'basic_patterns' | 'full_insights';

export type SymptomCoverage = {
  tier: SymptomCoverageTier;
  label: string;
  activeCount: number;
  hasCycleAnchor: boolean;
  hasRecoveryAnchor: boolean;
  hasMindAnchor: boolean;
  hasBodyAnchor: boolean;
  recommendedCount: number;
  summary: string;
};

const RECOVERY_ANCHORS = new Set(['sleep', 'energy']);
const MIND_ANCHORS = new Set(['mood', 'brainFog', 'stress', 'focus']);
const BODY_ANCHORS = new Set(['pain', 'nightSweats', 'hairShedding', 'headache', 'cramps', 'hotFlushes', 'bloating']);

export function getSymptomCoverage(userData: UserData): SymptomCoverage {
  const enabled = Array.isArray(userData?.enabledModules) ? userData.enabledModules : [];
  const activeCount = enabled.length;
  const hasCycleAnchor = enabled.includes('flow') || userData?.cycleTrackingMode === 'cycle';
  const hasRecoveryAnchor = enabled.some((key) => RECOVERY_ANCHORS.has(String(key)));
  const hasMindAnchor = enabled.some((key) => MIND_ANCHORS.has(String(key)));
  const hasBodyAnchor = enabled.some((key) => BODY_ANCHORS.has(String(key)));

  let tier: SymptomCoverageTier = 'logging_only';
  if (activeCount >= 5 && hasRecoveryAnchor && hasMindAnchor && hasBodyAnchor && hasCycleAnchor) {
    tier = 'full_insights';
  } else if (activeCount >= 3) {
    tier = 'basic_patterns';
  }

  const label = tier === 'full_insights'
    ? 'Full insights'
    : tier === 'basic_patterns'
    ? 'Basic patterns'
    : 'Logging only';

  const summary = tier === 'full_insights'
    ? 'You have enough signal variety for the full insight experience.'
    : tier === 'basic_patterns'
    ? 'You can still spot simple trends, but broader patterns may be less reliable.'
    : 'You can still log, but pattern detection will be less reliable with fewer active signals.';

  return {
    tier,
    label,
    activeCount,
    hasCycleAnchor,
    hasRecoveryAnchor,
    hasMindAnchor,
    hasBodyAnchor,
    recommendedCount: 5,
    summary,
  };
}
