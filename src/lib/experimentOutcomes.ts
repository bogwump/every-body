import { isoTodayLocal } from './date';

export const EXPERIMENT_OUTCOMES_KEY = 'everybody:v2:experiment_outcomes';

export type ExperimentOutcomeResult = 'helpful' | 'slightly_helpful' | 'not_helpful' | 'stopped_early';

export type ExperimentOutcomeRecord = {
  experimentId: string;
  result: ExperimentOutcomeResult;
  date: string;
};

function readJson<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(EXPERIMENT_OUTCOMES_KEY);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(value: ExperimentOutcomeRecord[]) {
  try {
    localStorage.setItem(EXPERIMENT_OUTCOMES_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function getExperimentOutcomes(): ExperimentOutcomeRecord[] {
  return readJson<ExperimentOutcomeRecord[]>([]).filter((item) => item && typeof item.experimentId === 'string');
}

export function recordExperimentOutcome(input: Omit<ExperimentOutcomeRecord, 'date'> & { date?: string }) {
  const current = getExperimentOutcomes().filter((item) => item.experimentId !== input.experimentId);
  current.unshift({ ...input, date: input.date || isoTodayLocal() });
  writeJson(current.slice(0, 50));
}

export function getHelpfulExperiments(): ExperimentOutcomeRecord[] {
  return getExperimentOutcomes().filter((item) => item.result === 'helpful' || item.result === 'slightly_helpful');
}
