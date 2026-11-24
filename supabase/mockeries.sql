-- Fiati tascabili: tabella delle beffe crudeli (mockeries) scritte o modificate da te.
-- Esegui dopo schema.sql e allowlist.sql (SQL Editor → New query → Run).
-- Stessa struttura e stesse regole della tabella degli spartiti: ognuno vede solo le proprie,
-- e solo se la sua email è nell'elenco delle email abilitate.
-- Se avevi già creato la tabella con il vecchio nome «beffe», lo script la rinomina e conserva i dati.

do $$
begin
  if to_regclass('public.beffe') is not null and to_regclass('public.mockeries') is null then
    alter table public.beffe rename to mockeries;
    alter table public.mockeries rename constraint beffe_pkey to mockeries_pkey;
    if exists (select 1 from pg_constraint where conname = 'beffe_user_id_fkey') then
      alter table public.mockeries rename constraint beffe_user_id_fkey to mockeries_user_id_fkey;
    end if;
    alter index if exists public.beffe_user_synced rename to mockeries_user_synced;
    drop trigger if exists beffe_touch on public.mockeries;
    drop policy if exists "beffe_select_own" on public.mockeries;
    drop policy if exists "beffe_insert_own" on public.mockeries;
    drop policy if exists "beffe_update_own" on public.mockeries;
    drop policy if exists "beffe_delete_own" on public.mockeries;
  end if;
end $$;

create table if not exists public.mockeries (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  id         text        not null,
  title      text        not null default '',  -- il testo della beffa, per leggerla dal pannello
  data       jsonb,                             -- testo, bersaglio, momento, stile, tema, volgarità, fonte
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists mockeries_user_synced on public.mockeries (user_id, synced_at);

alter table public.mockeries enable row level security;

drop policy if exists "mockeries_select_own" on public.mockeries;
drop policy if exists "mockeries_insert_own" on public.mockeries;
drop policy if exists "mockeries_update_own" on public.mockeries;
drop policy if exists "mockeries_delete_own" on public.mockeries;
create policy "mockeries_select_own" on public.mockeries for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "mockeries_insert_own" on public.mockeries for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "mockeries_update_own" on public.mockeries for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()))
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "mockeries_delete_own" on public.mockeries for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));

grant select, insert, update, delete on public.mockeries to authenticated;

-- L'ora di arrivo la decide sempre il server (stessa funzione della tabella degli spartiti)
create or replace function public.songs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists mockeries_touch on public.mockeries;
create trigger mockeries_touch before insert or update on public.mockeries
for each row execute function public.songs_touch();
