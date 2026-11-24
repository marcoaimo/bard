-- Fiati tascabili: tabella delle beffe crudeli scritte o modificate da te.
-- Esegui dopo schema.sql e allowlist.sql (SQL Editor → New query → Run).
-- Stessa struttura e stesse regole della tabella degli spartiti: ognuno vede solo le proprie,
-- e solo se la sua email è nell'elenco delle email abilitate.

create table if not exists public.beffe (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  id         text        not null,
  title      text        not null default '',  -- il testo della beffa, per leggerla dal pannello
  data       jsonb,                             -- testo, bersaglio, momento, stile, tema, volgarità, fonte
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists beffe_user_synced on public.beffe (user_id, synced_at);

alter table public.beffe enable row level security;

drop policy if exists "beffe_select_own" on public.beffe;
drop policy if exists "beffe_insert_own" on public.beffe;
drop policy if exists "beffe_update_own" on public.beffe;
drop policy if exists "beffe_delete_own" on public.beffe;
create policy "beffe_select_own" on public.beffe for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "beffe_insert_own" on public.beffe for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "beffe_update_own" on public.beffe for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()))
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "beffe_delete_own" on public.beffe for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));

grant select, insert, update, delete on public.beffe to authenticated;

-- L'ora di arrivo la decide sempre il server (stessa funzione della tabella degli spartiti)
create or replace function public.songs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists beffe_touch on public.beffe;
create trigger beffe_touch before insert or update on public.beffe
for each row execute function public.songs_touch();
