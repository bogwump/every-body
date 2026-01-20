import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CheckInEntry, UserData } from '../types';
import { ENTRIES_KEY, USER_KEY, loadFromStorage, saveToStorage } from './storage';

/**
 * Single source of truth for persisted app state.
 * - Reads from localStorage
 * - Updates notify the whole app (same tab) via a custom event
 * - Components subscribe via useSyncExternalStore for live updates
 */

export const APP_NAME = 'EveryBody';
// Friendly companion name used in Chat and gentle nudges.
export const COMPANION_NAME = 'Eve';

export const CHAT_KEY = 'everybody:chat:v1';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestampISO: string;
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    // If another tab updates any key, refresh.
    if (!e.key) return;
    callback();
  };
  const onInternal = (e: Event) => {
    const ev = e as CustomEvent<{ key: string }>;
    if (!ev?.detail?.key) return;
    callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('everybody:storage', onInternal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('everybody:storage', onInternal);
  };
}

function useStoredValue<T>(key: string, fallback: T) {
  const getSnapshot = useCallback(() => loadFromStorage<T>(key, fallback), [key, fallback]);
  // SSR not used in Vite, but keep API happy
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------- User ----------

export function useUser(userFallback: UserData) {
  const user = useStoredValue<UserData>(USER_KEY, userFallback);

  const setUser = useCallback((next: UserData) => saveToStorage(USER_KEY, next), []);
  const updateUser = useCallback(
    (updater: UserData | ((prev: UserData) => UserData)) => {
      const current = loadFromStorage<UserData>(USER_KEY, userFallback);
      const next = typeof updater === 'function' ? (updater as (p: UserData) => UserData)(current) : updater;
      saveToStorage(USER_KEY, next);
    },
    [userFallback]
  );

  return { user, setUser, updateUser };
}

// ---------- Entries ----------

function upsertByDate(entries: CheckInEntry[], entry: CheckInEntry): CheckInEntry[] {
  const idx = entries.findIndex((e) => e.dateISO === entry.dateISO);
  if (idx >= 0) {
    const updated = [...entries];
    updated[idx] = entry;
    return updated;
  }
  return [...entries, entry];
}

export function useEntries() {
  const entries = useStoredValue<CheckInEntry[]>(ENTRIES_KEY, []);

  const setEntries = useCallback((next: CheckInEntry[]) => saveToStorage(ENTRIES_KEY, next), []);

  const upsertEntry = useCallback((entry: CheckInEntry) => {
    const current = loadFromStorage<CheckInEntry[]>(ENTRIES_KEY, []);
    const updated = upsertByDate(current, entry);
    saveToStorage(ENTRIES_KEY, updated);
  }, []);

  return { entries, setEntries, upsertEntry };
}

// ---------- Chat ----------

export function useChat() {
  const messages = useStoredValue<ChatMessage[]>(CHAT_KEY, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id'> & { id?: string }) => {
    const current = loadFromStorage<ChatMessage[]>(CHAT_KEY, []);
    const next: ChatMessage = {
      id: msg.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: msg.text,
      sender: msg.sender,
      timestampISO: msg.timestampISO,
    };
    saveToStorage(CHAT_KEY, [...current, next]);
  }, []);

  const clear = useCallback(() => saveToStorage<ChatMessage[]>(CHAT_KEY, []), []);

  // convenience: derive Date objects in a stable way for rendering
  const messagesWithDate = useMemo(
    () => messages.map((m) => ({ ...m, timestamp: new Date(m.timestampISO) })),
    [messages]
  );

  return { messages, messagesWithDate, addMessage, clear };
}
