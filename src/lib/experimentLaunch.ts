export const PENDING_EXPERIMENT_LAUNCH_KEY = "everybody:v2:pending_experiment_launch";

export type PendingExperimentLaunch = {
  experimentId: string;
  experimentName: string;
  experimentDescription: string;
  metrics: string[];
  durationDays?: number;
  changeKey?: string;
  signalId?: string;
  source?: 'companion' | 'history' | 'insights';
};

function isPendingExperimentLaunch(value: unknown): value is PendingExperimentLaunch {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.experimentId === 'string'
    && typeof item.experimentName === 'string'
    && typeof item.experimentDescription === 'string'
    && Array.isArray(item.metrics);
}

export function queuePendingExperimentLaunch(payload: PendingExperimentLaunch) {
  try {
    localStorage.setItem(PENDING_EXPERIMENT_LAUNCH_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readPendingExperimentLaunch(): PendingExperimentLaunch | null {
  try {
    const raw = localStorage.getItem(PENDING_EXPERIMENT_LAUNCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPendingExperimentLaunch(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function consumePendingExperimentLaunch(): PendingExperimentLaunch | null {
  const payload = readPendingExperimentLaunch();
  if (!payload) return null;
  try {
    localStorage.removeItem(PENDING_EXPERIMENT_LAUNCH_KEY);
  } catch {
    // ignore
  }
  return payload;
}


export function inferPendingExperimentLaunchFromText(title?: string, body?: string): PendingExperimentLaunch | null {
  const blob = `${String(title || '')} ${String(body || '')}`.toLowerCase();

  if (blob.includes('breathing-room') || blob.includes('breathing room') || blob.includes('wind-down') || blob.includes('wind down') || blob.includes('stress')) {
    return {
      experimentId: 'evening_reset',
      experimentName: blob.includes('wind-down') || blob.includes('wind down') ? 'Wind-down experiment' : 'Evening reset experiment',
      experimentDescription: 'A lower-friction evening can help you test whether stressful days lead to lighter sleep.',
      metrics: ['stress', 'sleep', 'mood'],
      durationDays: 3,
      changeKey: 'stressfulDay',
    };
  }

  if (blob.includes('sleep')) {
    return {
      experimentId: 'wind_down',
      experimentName: 'Wind-down experiment',
      experimentDescription: 'A short evening routine can help test whether sleep feels easier to support in this window.',
      metrics: ['sleep', 'energy'],
      durationDays: 3,
      changeKey: 'lateNight',
    };
  }

  if (blob.includes('energy') || blob.includes('fatigue') || blob.includes('morning')) {
    return {
      experimentId: 'morning_light',
      experimentName: 'Morning light experiment',
      experimentDescription: 'A steadier morning rhythm can help you test whether energy feels easier to lift and hold.',
      metrics: ['energy', 'fatigue', 'sleep'],
      durationDays: 3,
      changeKey: 'exercise',
    };
  }

  return null;
}
