import type { UserData } from '../types';

export type CloudSnapshot = {
  user: UserData;
  entries: any[];
  chat: any[];
  updatedAtISO: string;
};

const URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: any | null = null;

export function isSupabaseConfigured(): boolean {
  return typeof URL === 'string' && URL.trim().length > 0 && typeof ANON === 'string' && ANON.trim().length > 0;
}

async function getClient(): Promise<any> {
  if (_client) return _client;
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.');
  }

  // Dynamic import so the app still runs even if you haven't installed the dependency yet.
  // If you do enable cloud sync, run: npm i @supabase/supabase-js
  const mod: any = await import('@supabase/supabase-js');
  const createClient = mod?.createClient;
  if (typeof createClient !== 'function') {
    throw new Error('Failed to load @supabase/supabase-js. Make sure it is installed.');
  }

  _client = createClient(URL, ANON);
  return _client;
}

export async function getSupabaseUserId(): Promise<string | null> {
  const supabase = await getClient();
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  return user?.id ?? null;
}

export async function signInWithEmailOtp(email: string): Promise<void> {
  const supabase = await getClient();
  const cleaned = (email || '').trim();
  if (!cleaned) throw new Error('Please enter an email address.');
  await supabase.auth.signInWithOtp({ email: cleaned });
}

export async function signOutSupabase(): Promise<void> {
  const supabase = await getClient();
  await supabase.auth.signOut();
}

// ---- Snapshot push/pull ----
// You need a table like:
//
// create table if not exists eb_snapshots (
//   user_id uuid primary key,
//   payload jsonb not null,
//   updated_at timestamptz not null default now()
// );
//
// alter table eb_snapshots enable row level security;
//
// create policy "User can manage their own snapshot" on eb_snapshots
// for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

export async function pushSnapshot(snapshot: CloudSnapshot): Promise<void> {
  const supabase = await getClient();
  const userId = await getSupabaseUserId();
  if (!userId) throw new Error('Not signed in.');

  const row = {
    user_id: userId,
    payload: snapshot,
    updated_at: snapshot.updatedAtISO,
  };

  const { error } = await supabase.from('eb_snapshots').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message || 'Failed to push snapshot');
}

export async function pullSnapshot(): Promise<CloudSnapshot | null> {
  const supabase = await getClient();
  const userId = await getSupabaseUserId();
  if (!userId) throw new Error('Not signed in.');

  const { data, error } = await supabase.from('eb_snapshots').select('payload').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to pull snapshot');
  const payload = data?.payload;
  if (!payload) return null;

  // Trust-but-verify minimal shape
  if (typeof payload !== 'object') return null;
  return payload as CloudSnapshot;
}
