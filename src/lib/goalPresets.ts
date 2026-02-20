import type { UserData } from '../types';

/**
 * Goal-based defaults (lightweight, sensible starting point).
 * Used by onboarding and by the Goal-change modal.
 */
export const GOAL_PRESETS: Record<NonNullable<UserData['goal']>, Partial<UserData>> = {
  'cycle-health': {
    cycleTrackingMode: 'cycle',
    showCycleBubble: true,
    fertilityMode: true,
    sleepDetailsEnabled: false,
    sleepInsightsEnabled: true,
    enabledModules: ['energy', 'sleep', 'stress', 'focus', 'bloating', 'cramps', 'flow'],
    enabledInfluences: ['sex', 'exercise', 'stressfulDay', 'lateNight', 'alcohol'],
  },
  'perimenopause': {
    cycleTrackingMode: 'cycle',
    showCycleBubble: true,
    fertilityMode: false,
    sleepDetailsEnabled: true,
    sleepInsightsEnabled: true,
    enabledModules: ['energy', 'sleep', 'stress', 'brainFog', 'hotFlushes', 'nightSweats', 'hairShedding', 'facialSpots'],
    enabledInfluences: ['stressfulDay', 'lateNight', 'alcohol', 'caffeine', 'medication'],
  },
  'post-contraception': {
    cycleTrackingMode: 'cycle',
    showCycleBubble: true,
    fertilityMode: true,
    sleepDetailsEnabled: false,
    sleepInsightsEnabled: true,
    enabledModules: ['energy', 'sleep', 'stress', 'focus', 'bloating', 'flow'],
    enabledInfluences: ['sex', 'stressfulDay', 'lateNight', 'alcohol'],
  },
  'wellbeing': {
    cycleTrackingMode: 'no-cycle',
    showCycleBubble: false,
    fertilityMode: false,
    sleepDetailsEnabled: false,
    sleepInsightsEnabled: true,
    enabledModules: ['energy', 'sleep', 'stress', 'focus', 'digestion', 'appetite'],
    enabledInfluences: ['stressfulDay', 'lateNight', 'alcohol', 'exercise', 'caffeine'],
  },
};

export function getGoalPreset(goal: UserData['goal']): Partial<UserData> | null {
  if (!goal) return null;
  return GOAL_PRESETS[goal] ?? null;
}
