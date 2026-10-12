/* ======================================================
   DUBLONEN: FESTES KONTOLIMIT UND TAGESDECKEL
   ------------------------------------------------------
   Schuetzt die virtuelle Waehrung unabhaengig vom Client:
   - maximal 2 Mio. Dublonen Kontostand
   - maximal 30.000 neue Dublonen pro Berlin-Tag
   Der Tageszaehler wird atomar pro Spieler gefuehrt.
====================================================== */

create schema if not exists private;

create table if not exists private.dublonen_tageskonto (
  firebase_uid text not null,
  tag date not null,
  erarbeitet integer not null default 0,
  primary key (firebase_uid, tag),
  constraint dublonen_tageskonto_nichtnegativ check (erarbeitet >= 0),
  constraint dublonen_tageskonto_deckel check (erarbeitet <= 30000)
);

alter table private.dublonen_tageskonto enable row level security;
alter table private.dublonen_tageskonto force row level security;
revoke all on table private.dublonen_tageskonto from public, anon, authenticated;

create or replace function app.dublonen_tageslimit_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  gutschrift integer := new.currency - old.currency;
begin
  if new.currency > 2000000 and new.currency > old.currency then
    raise exception 'dublonen-kontolimit';
  end if;

  if gutschrift <= 0 then
    return new;
  end if;

  insert into private.dublonen_tageskonto (firebase_uid, tag, erarbeitet)
  values (new.firebase_uid, (now() at time zone 'Europe/Berlin')::date, gutschrift)
  on conflict (firebase_uid, tag) do update
    set erarbeitet = private.dublonen_tageskonto.erarbeitet + excluded.erarbeitet
    where private.dublonen_tageskonto.erarbeitet + excluded.erarbeitet <= 30000;
  if not found then
    raise exception 'dublonen-tageslimit';
  end if;

  return new;
end
$$;

revoke all on function app.dublonen_tageslimit_schuetzen() from public, anon, authenticated;

drop trigger if exists players_dublonen_tageslimit on public.players;
create trigger players_dublonen_tageslimit
  before update on public.players
  for each row execute function app.dublonen_tageslimit_schuetzen();
