import { useSyncExternalStore } from "react";
import type { UserData } from "../types";

export const APP_NAME = "EveryBody";
export const COMPANION_NAME = "Eve";


// Storage keys
const USER_KEY = "everybody:user";
const ENTRIES_KEY = "everybody:entries";
const CHAT_KEY = "everybody:chat";

// ---- Types (use your real ones if you have them elsewhere) ----
export type CheckInEntry = any;
export type ChatMessage = any;

// ---- Stable fallbacks (must be stable references) ----
const EMPTY_ENTRIES: CheckInEntry[] = [];
const EMPTY_CHAT: ChatMessage[] = [];

// ---- Per-key pub/sub (avoids re-rendering everything) ----
type Listener = () => void;
const listenersByKey = new Map<string, Set<Listener>>();

function subscribeKey(key: string, listener: Listener) {
  let set = listenersByKey.get(key);
  if (!set) {
    set = new Set();
    listenersByKey.set(key, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

function emitKey(key: string) {
  const set = listenersByKey.get(key);
  if (!set) return;
  for (const l of set) l();
}

// ---- Cached snapshot layer (prevents infinite loops) ----
const parsedCache = new Map<string, unknown>();
const rawCache = new Map<string, string | null>();

function readCached<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);

  // If raw hasn't changed, return the same parsed reference
  if (rawCache.get(key) === raw && parsedCache.has(key)) {
    return parsedCache.get(key) as T;
  }

  rawCache.set(key, raw);

  if (raw == null) {
    parsedCache.set(key, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    parsedCache.set(key, parsed);
    return parsed;
  } catch {
    // Corrupt JSON: fall back safely
    parsedCache.set(key, fallback);
    return fallback;
  }
}

function writeCached<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));

  // Keep caches in sync so the next snapshot is stable
  rawCache.set(key, localStorage.getItem(key));
  parsedCache.set(key, value);

  emitKey(key);
}

// Cross-tab updates (storage event fires in other tabs)
window.addEventListener("storage", (e) => {
  if (!e.key) return;

  if (e.key === USER_KEY || e.key === ENTRIES_KEY || e.key === CHAT_KEY) {
    // Invalidate caches for that key and notify subscribers
    rawCache.delete(e.key);
    parsedCache.delete(e.key);
    emitKey(e.key);
  }
});

// ---- Hooks ----
export function useUser(defaultUser: UserData) {
  const user = useSyncExternalStore(
    (listener) => subscribeKey(USER_KEY, listener),
    () => readCached<UserData>(USER_KEY, defaultUser),
    () => defaultUser
  );

  const updateUser = (updater: UserData | ((prev: UserData) => UserData)) => {
    const prev = readCached<UserData>(USER_KEY, defaultUser);
    const next = typeof updater === "function" ? (updater as (p: UserData) => UserData)(prev) : updater;
    writeCached<UserData>(USER_KEY, next);
  };

  return { user, updateUser };
}

export function useEntries(): CheckInEntry[] {
  return useSyncExternalStore(
    (listener) => subscribeKey(ENTRIES_KEY, listener),
    () => readCached<CheckInEntry[]>(ENTRIES_KEY, EMPTY_ENTRIES),
    () => EMPTY_ENTRIES
  );
}

export function setEntries(next: CheckInEntry[]) {
  writeCached(ENTRIES_KEY, next);
}

export function useChat(): ChatMessage[] {
  return useSyncExternalStore(
    (listener) => subscribeKey(CHAT_KEY, listener),
    () => readCached<ChatMessage[]>(CHAT_KEY, EMPTY_CHAT),
    () => EMPTY_CHAT
  );
}

export function setChat(next: ChatMessage[]) {
  writeCached(CHAT_KEY, next);
}
