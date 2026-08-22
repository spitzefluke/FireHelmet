-- Minimaler Supabase-Stub fuer lokale RLS-Tests (Rollen + auth.jwt()).
-- Bildet NUR das nach, was fuer die RLS-Policies in schema.sql
-- relevant ist - kein vollstaendiges Supabase.

drop schema if exists auth cascade;
create schema auth;

create or replace function auth.jwt() returns jsonb as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
$$ language sql stable;

-- Bildet Supabases eigenes, natives auth.uid() nach (nicht mehr die
-- Third-Party-Auth-JWT-Bruecke) - liest dieselbe "sub"-Claim, die bei
-- einer echten Supabase-Sitzung (signInAnonymously()/signInWithOAuth())
-- die eigene Supabase-User-UUID enthaelt.
create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$ language sql stable;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_test_runner') then
    create role app_test_runner login superuser;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
