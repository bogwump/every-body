import { useSyncExternalStore } from "react";
import type { UserData } from "../types";

export const APP_NAME = "EveryBody";
export const COMPANION_NAME = "Eve";

// Storage keys
const USER_KEY = "everybody:user";
const ENTRIES_KEY = "everybody:entries";
const CHAT_KEY = "everybody:chat";

// ---- Types ----
export type CheckInEntry = any;
export type ChatMessage = any;

// Chat message shapes
type StoredChatMessage = {
  id?: string;
  sender: "user" | "ai";
  text: string;
  timestampISO?: string;
};

export type ChatMessageWithDate = {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
};

// ---- Stable fallbacks ----
const EMPTY_ENTRIES: CheckInEntry[] = [];
const EMPTY_CHAT: ChatMessage[] = [];

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

// ---- Storage normalisers (CRITICAL FIX) ----
function normaliseEntries(value: unknown): CheckInEntry[] {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as any).entries)
  ) {
    return (value as any).entries;
  }

  return [];
}

function normaliseChat(value: unknown): ChatMessage[] {
  if (Array.isArray(value)) return value;

  // Legacy/alternate shape support
  if (value && typeof value === "object" && Array.isArray((value as any).messages)) {
    return (value as any).messages;
  }

  return [];
}

// ---- Cross-tab updates ----
window.addEventListener("storage", (e) => {
  if (!e.key) return;

  if (e.key === USER_KEY || e.key === ENTRIES_KEY || e.key === CHAT_KEY) {
    rawCache.delete(e.key);
    parsedCache.delete(e.key);
    emitKey(e.key);
  }
});

// ---- Hooks ----

export function useUser(defaultUser: UserData) {
  // IMPORTANT:
  // useSyncExternalStore requires getSnapshot to return a cached value.
  // Creating a new object on every call (eg `{ ...defaultUser, ...stored }`)
  // can cause an infinite render loop.
  //
  // So we cache the merged snapshot by the *raw* localStorage string.
  const user = useSyncExternalStore(
    (listener) => subscribeKey(USER_KEY, listener),
    () => {
      const raw = localStorage.getItem(USER_KEY);

      const fnAny = useUser as any;
      const prevRaw: string | null | undefined = fnAny._mergedUserRaw;
      const prevVal: UserData | undefined = fnAny._mergedUserVal;

      if (prevRaw === raw && prevVal) return prevVal;

      const stored = readCached<UserData>(USER_KEY, defaultUser);

      // Merge defaults so newly added settings don't break older stored profiles
      const merged = ({ ...defaultUser, ...(stored as any) } as UserData) || defaultUser;

      fnAny._mergedUserRaw = raw;
      fnAny._mergedUserVal = merged;

      return merged;
    },
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

// ✅ CORRECT API SHAPE
export function useEntries() {
  const raw = useSyncExternalStore(
    (listener) => subscribeKey(ENTRIES_KEY, listener),
    () => readCached<unknown>(ENTRIES_KEY, EMPTY_ENTRIES),
    () => EMPTY_ENTRIES
  );

  const entries = normaliseEntries(raw);

  const setEntries = (next: CheckInEntry[]) => {
    writeCached(ENTRIES_KEY, next);
  };

  const upsertEntry = (entry: CheckInEntry) => {
    const entryISO = (entry as any).dateISO || (entry as any).date;
    const next = [
      ...entries.filter((e) => {
        const iso = (e as any).dateISO || (e as any).date;
        return iso !== entryISO;
      }),
      entry,
    ];
    writeCached(ENTRIES_KEY, next);
  };

  const clearEntries = () => {
    writeCached(ENTRIES_KEY, []);
  };

  return { entries, setEntries, upsertEntry, clearEntries };
}

export function useChat() {
  const raw = useSyncExternalStore(
    (listener) => subscribeKey(CHAT_KEY, listener),
    () => readCached<unknown>(CHAT_KEY, EMPTY_CHAT),
    () => EMPTY_CHAT
  );

  const messages = normaliseChat(raw) as StoredChatMessage[];

  // Convert stored messages to a stable in-memory shape (Date objects, ids)
  const messagesWithDate: ChatMessageWithDate[] = messages.map((m, idx) => {
    const iso = typeof m.timestampISO === "string" && m.timestampISO ? m.timestampISO : "";
    const id =
      typeof m.id === "string" && m.id.trim()
        ? m.id
        : `${m.sender || "msg"}-${iso || "no-ts"}-${idx}`;
    const d = new Date(iso);
    return {
      id,
      sender: m.sender === "user" || m.sender === "ai" ? m.sender : "ai",
      text: typeof m.text === "string" ? m.text : "",
      timestamp: !iso || Number.isNaN(d.getTime()) ? new Date() : d,
    };
  });

  // IMPORTANT: Don't append using the `messages` array from render.
  // Rapid consecutive writes (user message then AI message) can otherwise
  // race and overwrite each other, causing user bubbles to disappear.
  const addMessage = (message: StoredChatMessage) => {
    const next: StoredChatMessage = {
      id: message.id || Date.now().toString(),
      sender: message.sender,
      text: message.text,
      timestampISO: message.timestampISO || new Date().toISOString(),
    };

    const currentRaw = readCached<unknown>(CHAT_KEY, EMPTY_CHAT);
    const current = normaliseChat(currentRaw) as StoredChatMessage[];
    writeCached(CHAT_KEY, [...current, next]);
  };

  const clearChat = () => {
    writeCached(CHAT_KEY, []);
  };

  return { messages, messagesWithDate, addMessage, clearChat };
}