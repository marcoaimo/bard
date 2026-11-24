-- Fiati tascabili: tabella degli spartiti con accesso riservato al proprietario.
-- Esegui tutto lo script una volta in Supabase → SQL Editor → New query → Run.

create table if not exists public.songs (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  id         text        not null,
  title      text        not null default '',
  data       jsonb,                                  -- bpm, metro, autore e note dello spartito
  deleted    boolean     not null default false,     -- eliminato su un dispositivo, da togliere anche dagli altri
  updated_at timestamptz not null default now(),     -- ora della modifica sul dispositivo
  synced_at  timestamptz not null default now(),     -- ora di arrivo sul server, usata per scaricare le novità
  primary key (user_id, id)
);

create index if not exists songs_user_synced on public.songs (user_id, synced_at);

-- Ogni utente vede e modifica solo i propri spartiti
alter table public.songs enable row level security;

drop policy if exists "songs_select_own" on public.songs;
drop policy if exists "songs_insert_own" on public.songs;
drop policy if exists "songs_update_own" on public.songs;
drop policy if exists "songs_delete_own" on public.songs;
create policy "songs_select_own" on public.songs for select to authenticated using ((select auth.uid()) = user_id);
create policy "songs_insert_own" on public.songs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "songs_update_own" on public.songs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "songs_delete_own" on public.songs for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.songs to authenticated;

-- L’ora di arrivo la decide sempre il server
create or replace function public.songs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before insert or update on public.songs
for each row execute function public.songs_touch();
