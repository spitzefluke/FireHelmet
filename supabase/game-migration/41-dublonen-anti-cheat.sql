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

create table if not exists private.dublonen_kontosperren (
  firebase_uid text primary key,
  grund text not null,
  markiert_am timestamptz not null default now()
);

alter table private.dublonen_kontosperren enable row level security;
alter table private.dublonen_kontosperren force row level security;
revoke all on table private.dublonen_kontosperren from public, anon, authenticated;

alter table private.dublonen_tageskonto enable row level security;
alter table private.dublonen_tageskonto force row level security;
revoke all on table private.dublonen_tageskonto from public, anon, authenticated;

create or replace function app.dublonen_konto_gesperrt(p_uid text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from private.dublonen_kontosperren s
    where s.firebase_uid = p_uid
  )
$$;

revoke all on function app.dublonen_konto_gesperrt(text) from public, anon;
grant execute on function app.dublonen_konto_gesperrt(text) to authenticated;

drop policy if exists players_dublonen_kontosperre on public.players;
create policy players_dublonen_kontosperre
  on public.players as restrictive for update to authenticated
  using (not app.dublonen_konto_gesperrt(firebase_uid))
  with check (not app.dublonen_konto_gesperrt(firebase_uid));

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
    insert into private.dublonen_kontosperren (firebase_uid, grund)
    values (new.firebase_uid, 'kontolimit-ueberschreitung')
    on conflict (firebase_uid) do nothing;
    -- Aenderung verwerfen, aber die Kontosperre committen. Der
    -- naechste API-Schreibzugriff wird durch die restrictive policy blockiert.
    return null;
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

create or replace function app.valid_code_redemption(
  p_uid text,
  new_codes jsonb,
  new_currency integer,
  new_last_wheel_spin timestamptz,
  new_last_spielothek_play timestamptz
) returns boolean
language plpgsql stable
set search_path = public, app, pg_temp
as $$
declare  old_row public.players := app.old_player(p_uid);
  old_codes jsonb := coalesce(old_row.redeemed_currency_codes, '{}'::jsonb);
  old_currency integer := coalesce(old_row.currency, 0);
  delta integer := new_currency - old_currency;
  new_hash text;
  soll integer;
begin
  if new_codes = old_codes then
    if new_last_wheel_spin is distinct from old_row.last_wheel_spin_at
       or new_last_spielothek_play is distinct from old_row.last_spielothek_play_at then
      return true;
    end if;
    return delta <= 0;
  end if;

  if jsonb_typeof(new_codes) <> 'object'
     or (select count(*) from jsonb_object_keys(new_codes)) > 50 then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(new_codes) k where not old_codes ? k) <> 1
     or (select count(*) from jsonb_object_keys(new_codes)) <>
        (select count(*) from jsonb_object_keys(old_codes)) + 1 then
    return false;
  end if;

  select k into new_hash from jsonb_object_keys(new_codes) k where not old_codes ? k;
  soll := app.code_betrag(new_hash);

  -- Ein Code darf nur den freien Platz bis zum Kontolimit auszahlen.
  return soll is not null
     and delta = least(soll, greatest(0, 2000000 - old_currency));
end
$$;

drop trigger if exists players_dublonen_tageslimit on public.players;
create trigger players_dublonen_tageslimit
  before update on public.players
  for each row execute function app.dublonen_tageslimit_schuetzen();
