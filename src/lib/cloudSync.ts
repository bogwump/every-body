import type { UserData } from '../types';
import { isSupabaseConfigured, signInWithEmailOtp, signOutSupabase, pushSnapshot, pullSnapshot, type CloudSnapshot } from './cloudSyncSupabase';

const USER_KEY = 'everybody:user';
const ENTRIES_KEY = 'everybody:entries';
const CHAT_KEY = 'everybody:chat';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function localSnapshot(defaultUser: UserData): CloudSnapshot {
  const user = safeParse<UserData>(localStorage.getItem(USER_KEY), defaultUser);
  const entries = safeParse<any>(localStorage.getItem(ENTRIES_KEY), []);
  const chat = safeParse<any>(localStorage.getItem(CHAT_KEY), []);
  return {
    user: { ...defaultUser, ...(user as any) },
    entries: Array.isArray(entries) ? entries : (entries as any)?.entries ?? [],
    chat: Array.isArray(chat) ? chat : (chat as any)?.messages ?? [],
    updatedAtISO: new Date().toISOString(),
  };
}

export function applySnapshotToLocal(snapshot: CloudSnapshot) {
  localStorage.setItem(USER_KEY, JSON.stringify(snapshot.user));
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(snapshot.entries));
  localStorage.setItem(CHAT_KEY, JSON.stringify(snapshot.chat));
}

export type CloudStatus =
  | { kind: 'off' }
  | { kind: 'not_configured' }
  | { kind: 'ready' };

export function cloudStatus(user: UserData): CloudStatus {
  if (!user.cloudSyncEnabled) return { kind: 'off' };
  if ((user.cloudProvider ?? 'supabase') === 'supabase' && !isSupabaseConfigured()) return { kind: 'not_configured' };
  return { kind: 'ready' };
}

export async function cloudSignInEmail(email: string) {
  return signInWithEmailOtp(email);
}

export async function cloudSignOut() {
  return signOutSupabase();
}

export async function cloudPush(defaultUser: UserData) {
  const snap = localSnapshot(defaultUser);
  return pushSnapshot(snap);
}

export async function cloudPullAndApply(defaultUser: UserData) {
  const snap = await pullSnapshot();
  if (!snap) return false;
  // merge defaults into user to avoid older payloads breaking new fields
  snap.user = { ...defaultUser, ...(snap.user as any) };
  applySnapshotToLocal(snap);
  return true;
}
