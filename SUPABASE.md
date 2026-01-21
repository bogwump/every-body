# Supabase (optional) cloud sync

EveryBody is **local-first**. Supabase is optional and only needed if you want:
- backup
- cross-device sync

## 1) Install dependency

```bash
npm i @supabase/supabase-js
```

## 2) Add env vars

Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Restart `npm run dev` after changing `.env`.

## 3) Create the table + RLS policy

In Supabase SQL editor, run:

```sql
create table if not exists eb_snapshots (
  user_id uuid primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table eb_snapshots enable row level security;

create policy "User can manage their own snapshot" on eb_snapshots
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 4) Turn it on in the app

Profile & Settings → **Cloud sync (optional)**

- Enable toggle
- Enter your email and send a magic link
- Click the magic link on the same device
- Use **Upload now** or **Download now**

Notes:
- Cloud sync is a single snapshot (user + entries + chat). Simple on purpose.
- If you download, the app refreshes so your UI picks up the new local data.
