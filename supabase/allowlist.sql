-- Fiati tascabili: accesso riservato alle email in elenco.
-- Esegui dopo schema.sql (SQL Editor → New query → Run), poi aggiungi la tua email:
--   insert into public.allowed_emails (email) values ('tua@email.it');
-- L'elenco non è leggibile dall'app: si gestisce solo dal pannello di Supabase.

create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;  -- nessuna regola: invisibile ai client
revoke all on public.allowed_emails from anon, authenticated;

-- Vero se l'utente collegato ha un'email in elenco
create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_allowed() from public;
grant execute on function public.is_allowed() to authenticated;

-- Nessun nuovo account con un'email fuori elenco
create or replace function public.block_unlisted_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails a where lower(a.email) = lower(new.email)
  ) then
    raise exception 'email non abilitata';
  end if;
  return new;
end $$;

drop trigger if exists block_unlisted_signup on auth.users;
create trigger block_unlisted_signup before insert on auth.users
for each row execute function public.block_unlisted_signup();

-- Spartiti: solo i propri, e solo se l'email è ancora in elenco
drop policy if exists "songs_select_own" on public.songs;
drop policy if exists "songs_insert_own" on public.songs;
drop policy if exists "songs_update_own" on public.songs;
drop policy if exists "songs_delete_own" on public.songs;
create policy "songs_select_own" on public.songs for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "songs_insert_own" on public.songs for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "songs_update_own" on public.songs for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()))
  with check ((select auth.uid()) = user_id and (select public.is_allowed()));
create policy "songs_delete_own" on public.songs for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_allowed()));
