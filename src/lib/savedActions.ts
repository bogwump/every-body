import { isoTodayLocal } from './date';

export const SAVED_ACTIONS_KEY = 'everybody:v2:saved_actions';

export type SavedAction = {
  type: 'experiment' | 'dismissed';
  experimentId: string;
  savedAt: string;
  title?: string;
  description?: string;
  metrics?: string[];
  signalId?: string;
};

function readJson<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(SAVED_ACTIONS_KEY);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(value: SavedAction[]) {
  try {
    localStorage.setItem(SAVED_ACTIONS_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function getSavedActions(): SavedAction[] {
  return readJson<SavedAction[]>([]).filter((item) => item && typeof item.experimentId === 'string');
}

export function saveAction(action: Omit<SavedAction, 'savedAt'> & { savedAt?: string }) {
  const current = getSavedActions().filter(
    (item) => !(item.type === action.type && item.experimentId === action.experimentId && (item.signalId || '') === (action.signalId || '')),
  );
  current.unshift({ ...action, savedAt: action.savedAt || isoTodayLocal() });
  writeJson(current.slice(0, 50));
}

export function removeSavedAction(experimentId: string, type?: SavedAction['type']) {
  const current = getSavedActions().filter((item) => !(item.experimentId === experimentId && (!type || item.type === type)));
  writeJson(current);
}

export function isSavedAction(experimentId: string): boolean {
  return getSavedActions().some((item) => item.type === 'experiment' && item.experimentId === experimentId);
}

export function isDismissedAction(experimentId: string): boolean {
  return getSavedActions().some((item) => item.type === 'dismissed' && item.experimentId === experimentId);
}
