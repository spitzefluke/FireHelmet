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


/* ======================================================
   RANGLISTEN-CODES: NUR EINMAL UND NUR GUELTIGE HASHES
   ------------------------------------------------------
   Die bisherige RLS-Regel erlaubte codes_cracked bei jedem
   Schreibvorgang um 1 zu erhoehen. Das war beliebig oft wiederholbar.
====================================================== */
create table if not exists private.gueltige_ranglisten_codes (
  code_sha256 text primary key check (code_sha256 ~ '^[0-9a-f]{64}$'),
  reward text
);
alter table private.gueltige_ranglisten_codes enable row level security;
alter table private.gueltige_ranglisten_codes force row level security;
revoke all on table private.gueltige_ranglisten_codes from public, anon, authenticated;

insert into private.gueltige_ranglisten_codes (code_sha256, reward) values
  ('280d44ab1e9f79b5cce2dd4f58f5fe91f0fbacdac9f7447dffc318ceb79f2d02', null),
  ('c1d6e4fc7422656509d6988df576d75c439f2102297cc477633a02bb7d190c12', null),
  ('2c70e12b7a0646f92279f427c7b38e7334d8e5389cff167a1dc30e73f826b683', null),
  ('61ea0803f8853523b777d414ace3130cd4d3f92de2cd7ff8695c337d79c2eeee', '2500 VBucks-Hinweis'),
  ('59a853d277efc60873b2b9691ffa0e652e3d76b7196844beef971105447ddc00', null),
  ('b63814c6f67f93b490e15534af1e134421bfa76280d6546c38bedc018b1bd7a2', null),
  ('ec6820622d6388215f724a89365d214c25666a951f90b3322e730713bfbd1eec', 'Roblox-Code'),
  ('b0c27fca74fa91934900c9ffcb3dcca5b807a3c059a3b516cdd0788807b5ff49', null),
  ('059f5e543bd484b00e235edc5083558c59d45706bd99c14422bda8868c6c6f90', null),
  ('174f91e07e02eda58bb2c14a4cfbd85efdc2de378f3ff7d09c57123758769080', null),
  ('9d030edcde5e56001ba919be683b8f7ddacf7cd4a0f991448d7b792594a71daa', 'Gewinnspiel-Teilnahme'),
  ('31d8d90581a4e61fddd554f8278fbb51ecb4d52d75705fdef21594ab672d6979', null),
  ('6700869c8ff7480e34a70a708b028700dbaa3a033b5652b903afe89f49a31456', null),
  ('1deb056277cbf73bff5424e04fdc2a866a920e557568b4a6ca746311d2d96322', null),
  ('c35896745c9e780bc800b9601205cd8d0fd7e542b2a831b5884ba80f7f7f706f', null),
  ('4addb2791110e403d458977d8e4f3bc812de8d149e5a49f6f653564aa35ec27a', null),
  ('59858c2960c57e08940d544225e998cdc3a21e7bb429a8d1832c052563eab2d4', null),
  ('ed227bb0d191d168545bec592e8b9c1199ef4ffa122a7395ededa0cf888dc09f', null),
  ('20cb2ba2653ca07b952ed0aeedad987e611188771380e5a50780248291bd7865', '???Tipp???'),
  ('8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', null),
  ('cac24f302a4a4945ae50be622c14407102347c6527c127d530f16fbbdf9c9da9', null),
  ('516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769', null),
  ('a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4', null),
  ('8bfe3282c066093f84dc23ea2215dff3eae0c7bb2a0d7a11585800adc3d7efb1', null),
  ('8f42ea772af5c16d5b27feb56aae75e6407d8b85e9174e79e468320b9ed88dba', null),
  ('d422fd99131807e57e4c5b71defeeab9544b77d9d9201cf36a922f14bf5f226d', null),
  ('80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c', null),
  ('484aab2f2cd0f77b3c30f91521ba9a76c8c501112a53e100154a098c274f03d3', null),
  ('36bf7bd612005654bbeb6c6fc93ae8a9e1a1444916b748764acadbd798c96c76', '50 Pass-XP'),
  ('03e47b55eb59a0d75804d2bcb69487d2376d57a4c1e30113efba8977267ef598', '100 Pass-XP'),
  ('683ec9b4c215b8391f2749b55d645adcea53cf5c571a28d923a18078927d1097', '200 Pass-XP'),
  ('686d22d695e2c21166a89498a3a3f198e8d4ad8b09190bd1d86e350a79597341', '350 Pass-XP'),
  ('0ed2df1bb528a1feb743379a90fa33c50d8b2476cd29796399580aa3bc03b66e', '500 Pass-XP'),
  ('3e6abdb95e1b0acc372908ed8318b086b40400b96a35c59ebd1f4fb83bee5e77', null),
  ('cb6b9c6b4bdd9ef4c7ed6c03eed0011bc0b30d596a4ca4d963917095166e6735', null),
  ('c1b640f91943ee65097f2dc0acfcea746efc718c4d76eb2ed111dd701ba699cc', null),
  ('6cc4f79c97769335dcabf0ea00dd4fc8feb4dd2460388d7817a616fca1de0771', null),
  ('2526513be80527512558a2b3936aff977733d45f7a3a7a689fef645131b88080', null),
  ('ce08e670886c61230efee042c91942e6487ab6549d320b0f68997f4bff6fc7d1', null),
  ('5ec5675c2ea02f56a30e5ecd254d541a1e1dbf54439edd9d8aedf5befe9ed7a8', null),
  ('cc3bc352ea9298a8f994d9d675e7cf2f65978d76bca5c13cf830809dde40f905', null),
  ('3161fa663852bb8cad212ce140f84d6a4e88787db36324bccbfdf1476200cf45', null),
  ('4b40cdd3eb0e8c95da5d8bd34e7684c7021a54eb38d52ce91d84b4b76e32f995', null)
on conflict (code_sha256) do update set reward = excluded.reward;

create table if not exists private.ranglisten_code_einloesungen (
  firebase_uid text not null,
  code_sha256 text not null,
  eingeloest_am timestamptz not null default now(),
  pending boolean not null default true,
  primary key (firebase_uid, code_sha256)
);
alter table private.ranglisten_code_einloesungen enable row level security;
alter table private.ranglisten_code_einloesungen force row level security;
revoke all on table private.ranglisten_code_einloesungen from public, anon, authenticated;

create or replace function app.ranglisten_code_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claim_uid text;
begin
  if new.codes_cracked = old.codes_cracked then
    return new;
  end if;

  if new.codes_cracked = old.codes_cracked + 1
     and new.redeemed_currency_codes is distinct from old.redeemed_currency_codes
     and app.valid_code_redemption(
       old.firebase_uid, new.redeemed_currency_codes, new.currency,
       new.last_wheel_spin_at, new.last_spielothek_play_at
     ) then
    return new;
  end if;

  if new.codes_cracked = old.codes_cracked + 1 then
    select c.firebase_uid into claim_uid
      from private.ranglisten_code_einloesungen c
     where c.firebase_uid = old.firebase_uid and c.pending
     order by c.eingeloest_am
     limit 1
     for update;

    if claim_uid is not null then
      update private.ranglisten_code_einloesungen
         set pending = false
       where firebase_uid = old.firebase_uid
         and code_sha256 = (
           select c.code_sha256 from private.ranglisten_code_einloesungen c
            where c.firebase_uid = old.firebase_uid and c.pending
            order by c.eingeloest_am limit 1
         );
      return new;
    end if;
  end if;

  insert into private.dublonen_kontosperren (firebase_uid, grund)
  values (old.firebase_uid, 'ranglisten-codezaehler-manipulationsverdacht')
  on conflict (firebase_uid) do nothing;
  return null;
end
$$;

revoke all on function app.ranglisten_code_schuetzen() from public, anon, authenticated;
drop trigger if exists players_ranglisten_code_schuetzen on public.players;
drop trigger if exists players_a_ranglisten_code_schuetzen on public.players;
create trigger players_a_ranglisten_code_schuetzen
  before update on public.players
  for each row execute function app.ranglisten_code_schuetzen();

create or replace function public.record_code_crack(p_code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  uid text := app.firebase_uid();
  neu integer;
  auszeichnung text;
  code_hash text;
begin
  if uid is null then raise exception 'nicht-angemeldet'; end if;
  if p_code is null or char_length(p_code) < 2 or char_length(p_code) > 64 then return false; end if;
  code_hash := encode(extensions.digest(lower(btrim(p_code)), 'sha256'), 'hex');

  -- Waehrungscodes werden ausschliesslich durch ihre gepruefte
  -- Kontostand-Transaktion gezaehlt.
  if exists (select 1 from public.currency_codes where code_sha256 = code_hash) then
    return false;
  end if;

  if not exists (select 1 from private.gueltige_ranglisten_codes where code_sha256 = code_hash)
     and not exists (select 1 from public.xp_codes where code_sha256 = code_hash)
     and not exists (select 1 from public.boss_special_codes where code_sha256 = code_hash) then
    return false;
  end if;

  select reward into auszeichnung
    from private.gueltige_ranglisten_codes where code_sha256 = code_hash;

  insert into private.ranglisten_code_einloesungen (firebase_uid, code_sha256)
  values (uid, code_hash)
  on conflict (firebase_uid, code_sha256) do nothing;
  get diagnostics neu = row_count;
  if neu = 0 then return false; end if;

  update public.players
     set codes_cracked = coalesce(codes_cracked, 0) + 1,
         rewards = case
           when auszeichnung is null or auszeichnung = any(coalesce(rewards, array[]::text[]))
             then coalesce(rewards, array[]::text[])
           else array_append(coalesce(rewards, array[]::text[]), auszeichnung)
         end
   where firebase_uid = uid;

  if not found then raise exception 'spieler-nicht-gefunden'; end if;
  return true;
end
$$;

revoke execute on function public.record_code_crack(text) from public, anon;
grant execute on function public.record_code_crack(text) to authenticated;

-- Bereits gespeicherte Zaehler oberhalb aller derzeit bekannten Codes
-- werden vorsorglich zur manuellen Pruefung gesperrt. Kein Wert wird
-- automatisch geloescht oder auf einen niedrigeren Stand gesetzt.
with gueltige_hashes as (
  select code_sha256 from private.gueltige_ranglisten_codes
  union select code_sha256 from public.currency_codes
  union select code_sha256 from public.xp_codes
  union select code_sha256 from public.boss_special_codes
)
insert into private.dublonen_kontosperren (firebase_uid, grund)
select p.firebase_uid, 'ranglisten-codezaehler-oberhalb-gueltiger-codes'
  from public.players p
 where coalesce(p.codes_cracked, 0) > (select count(*) from gueltige_hashes)
on conflict (firebase_uid) do nothing;
