import { useSyncExternalStore } from "react";
import type { UserData, CheckInEntry } from "../types";

export const APP_NAME = "EveryBody";
export const COMPANION_NAME = "Eve";

// Storage keys
const USER_KEY = "everybody:user";
const ENTRIES_KEY = "everybody:entries";
const CHAT_KEY = "everybody:chat";

// ---- Chat Types ----
export type ChatMessageStored = {
  sender: "user" | "ai";
  text: string;
  timestampISO: string;
};

export type ChatMessageWithDate = ChatMessageStored & {
  timestamp: Date;
};

// ---- Stable fallbacks (must be stable references) ----
const EMPTY_ENTRIES: CheckInEntry[] = [];
const EMPTY_CHAT: ChatMessageStored[] = [];

// ---- Per-key pub/sub ----
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

// ---- Cached snapshot layer ----
const parsedCache = new Map<string, unknown>();
const rawCache = new Map<string, string | null>();

function readCached<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);

  // If localStorage value hasn't changed, return the same parsed reference
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
  rawCache.set(key, localStorage.getItem(key));
  parsedCache.set(key, value);
  emitKey(key);
}

// Cross-tab updates (fires in other tabs)
window.addEventListener("storage", (e) => {
  if (!e.key) return;
  if (e.key === USER_KEY || e.key === ENTRIES_KEY || e.key === CHAT_KEY) {
    rawCache.delete(e.key);
    parsedCache.delete(e.key);
    emitKey(e.key);
  }
});

// ---- User ----
export function useUser(defaultUser: UserData) {
  const user = useSyncExternalStore(
    (listener) => subscribeKey(USER_KEY, listener),
    () => readCached<UserData>(USER_KEY, defaultUser),
    () => defaultUser
  );

  const updateUser = (updater: UserData | ((prev: UserData) => UserData)) => {
    const prev = readCached<UserData>(USER_KEY, defaultUser);
    const next =
      typeof updater === "function"
        ? (updater as (p: UserData) => UserData)(prev)
        : updater;
    writeCached<UserData>(USER_KEY, next);
  };

  return { user, updateUser };
}

// ---- Entries ----
// Components expect: const { entries, upsertEntry } = useEntries();
export function useEntries() {
  const entries = useSyncExternalStore(
    (listener) => subscribeKey(ENTRIES_KEY, listener),
    () => readCached<CheckInEntry[]>(ENTRIES_KEY, EMPTY_ENTRIES),
    () => EMPTY_ENTRIES
  );

  const setEntries = (next: CheckInEntry[]) => writeCached(ENTRIES_KEY, next);

  const upsertEntry = (entry: CheckInEntry) => {
    const prev = readCached<CheckInEntry[]>(ENTRIES_KEY, EMPTY_ENTRIES);
    const idx = prev.findIndex((e) => e.dateISO === entry.dateISO);
    const next =
      idx >= 0 ? prev.map((e, i) => (i === idx ? entry : e)) : [...prev, entry];
    writeCached(ENTRIES_KEY, next);
  };

  const clearEntries = () => writeCached(ENTRIES_KEY, EMPTY_ENTRIES);

  return { entries, setEntries, upsertEntry, clearEntries };
}

// Backwards-compatible setters (if any code still calls them)
export function setEntries(next: CheckInEntry[]) {
  writeCached(ENTRIES_KEY, next);
}

// ---- Chat ----
// Components expect: const { messagesWithDate, addMessage } = useChat();
export function useChat() {
  const messages = useSyncExternalStore(
    (listener) => subscribeKey(CHAT_KEY, listener),
    () => readCached<ChatMessageStored[]>(CHAT_KEY, EMPTY_CHAT),
    () => EMPTY_CHAT
  );

  const addMessage = (msg: ChatMessageStored) => {
    const prev = readCached<ChatMessageStored[]>(CHAT_KEY, EMPTY_CHAT);
    const next = [...prev, msg];
    writeCached(CHAT_KEY, next);
  };

  const clearChat = () => writeCached(CHAT_KEY, EMPTY_CHAT);

  const messagesWithDate: ChatMessageWithDate[] = messages.map((m) => ({
    ...m,
    timestamp: new Date(m.timestampISO),
  }));

  return { messages, messagesWithDate, addMessage, clearChat };
}

export function setChat(next: ChatMessageStored[]) {
  writeCached(CHAT_KEY, next);
}
