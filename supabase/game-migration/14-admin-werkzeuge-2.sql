/* ======================================================
   ADMIN-WERKZEUGE, RUNDE 2
   Boss steuern, Geheimcodes verwalten, Turnier-Feinsteuerung,
   Wochenrennen verwalten
   ---------------------------------------------------
   Baut auf 13-admin-werkzeuge.sql auf (app.admin_notiz()).
   Wie dort laeuft alles ueber SECURITY DEFINER mit app.is_admin()
   als erster Zeile.
====================================================== */


/* ======================================================
   1. BOSS STEUERN
====================================================== */
create or replace function app.admin_boss_uebersicht()
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare erg jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select jsonb_build_object(
    'monate', (select coalesce(jsonb_agg(jsonb_build_object(
                        'monat', month_id, 'hp', hp, 'max_hp', max_hp, 'besiegt', defeated)
                        order by month_id desc), '[]'::jsonb)
                 from (select * from public.community_boss order by month_id desc limit 6) m),
    'top', (select coalesce(jsonb_agg(jsonb_build_object(
                     'name', nickname, 'uid', firebase_uid, 'schaden', total_damage)
                     order by total_damage desc), '[]'::jsonb)
              from (select * from public.community_boss_damage
                     where month_id = (select max(month_id) from public.community_boss)
                     order by total_damage desc limit 10) d)
  ) into erg;

  return erg;
end
$$;

create or replace function public.admin_boss_uebersicht() returns jsonb
language sql
as $$ select app.admin_boss_uebersicht() $$;

/* HP und Obergrenze setzen. null heisst "unveraendert lassen".
   p_max_hp ist der Hebel, den die Spezialangriffe brauchen: mit
   Angriffen bis 400 Schaden ist ein 5000-HP-Boss in wenigen Tagen
   umgefallen - siehe die Balance-Warnung in 10-boss-attacks.sql.
   Aendere ihn am Monatswechsel, nicht mittendrin. */
create or replace function app.admin_boss_setzen(
  p_month_id text,
  p_hp integer default null,
  p_max_hp integer default null,
  p_besiegt boolean default null
) returns public.community_boss
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare b public.community_boss;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_hp is not null and p_hp < 0 then
    raise exception 'hp-negativ';
  end if;
  if p_max_hp is not null and p_max_hp < 1 then
    raise exception 'max-hp-zu-klein';
  end if;

  select * into b from public.community_boss where month_id = p_month_id for update;
  if not found then
    raise exception 'boss-unbekannt';
  end if;

  update public.community_boss
     set hp       = least(coalesce(p_hp, hp), coalesce(p_max_hp, max_hp)),
         max_hp   = coalesce(p_max_hp, max_hp),
         defeated = coalesce(p_besiegt, defeated),
         updated_at = now()
   where month_id = p_month_id
  returning * into b;

  perform app.admin_notiz('boss-gesetzt', p_month_id,
    jsonb_build_object('vorher_hp', b.hp, 'hp', p_hp, 'max_hp', p_max_hp, 'besiegt', p_besiegt));
  return b;
end
$$;

create or replace function public.admin_boss_setzen(
  p_month_id text, p_hp integer default null, p_max_hp integer default null, p_besiegt boolean default null
) returns public.community_boss
language sql
as $$ select * from app.admin_boss_setzen(p_month_id, p_hp, p_max_hp, p_besiegt) $$;

/* Boss auf volle HP zuruecksetzen. Die Schadensrangliste bleibt
   standardmaessig stehen - wer schon mitgekaempft hat, soll seinen
   Eintrag nicht verlieren, nur weil du die HP korrigierst. Mit
   p_schaden_loeschen = true faengt der Monat wirklich bei null an. */
create or replace function app.admin_boss_zuruecksetzen(
  p_month_id text,
  p_schaden_loeschen boolean default false
) returns public.community_boss
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare b public.community_boss;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  update public.community_boss
     set hp = max_hp, defeated = false, updated_at = now()
   where month_id = p_month_id
  returning * into b;
  if not found then
    raise exception 'boss-unbekannt';
  end if;

  if p_schaden_loeschen then
    delete from public.community_boss_damage where month_id = p_month_id;
  end if;

  perform app.admin_notiz('boss-zurueckgesetzt', p_month_id,
    jsonb_build_object('schaden_geloescht', p_schaden_loeschen));
  return b;
end
$$;

create or replace function public.admin_boss_zuruecksetzen(p_month_id text, p_schaden_loeschen boolean default false)
returns public.community_boss
language sql
as $$ select * from app.admin_boss_zuruecksetzen(p_month_id, p_schaden_loeschen) $$;

/* Einem Spieler einen Spezialangriff von Hand freischalten - fuer
   Gewinnspiele im Stream, oder wenn ein Code nicht angekommen ist. */
create or replace function app.admin_spezial_freischalten(p_uid text, p_schluessel text)
returns text[]
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare frei_neu text[];
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if not exists (select 1 from public.boss_attack_defs
                  where schluessel = p_schluessel and art = 'spezial') then
    raise exception 'kein-spezialangriff';
  end if;

  insert into public.boss_attack_state (firebase_uid, frei) values (p_uid, array[p_schluessel])
  on conflict (firebase_uid) do update
     set frei = (select array(select distinct unnest(public.boss_attack_state.frei || array[p_schluessel]))),
         aktualisiert = now()
  returning frei into frei_neu;

  perform app.admin_notiz('spezial-freigeschaltet', p_uid, jsonb_build_object('angriff', p_schluessel));
  return frei_neu;
end
$$;

create or replace function public.admin_spezial_freischalten(p_uid text, p_schluessel text) returns text[]
language sql
as $$ select app.admin_spezial_freischalten(p_uid, p_schluessel) $$;


/* ======================================================
   2. DUBLONEN-CODES: AUS DEM CASE IN EINE TABELLE
   ---------------------------------------------------
   Bisher standen die acht Code-Hashes samt Betrag als CASE-Zweige
   MITTEN IN app.valid_code_redemption() (01-players-ship-progression.
   sql). Jeder neue Code brauchte damit eine Migration - im Panel
   verwalten liess sich das gar nicht.

   Ab hier steht dasselbe in einer Tabelle, und die Funktion schlaegt
   dort nach. Inhaltlich aendert sich NICHTS: die acht Zeilen unten
   sind Hash fuer Hash und Betrag fuer Betrag aus dem alten CASE
   uebernommen (im Test gegengeprueft).

   Wie bei den Boss-Geheimcodes steht auch hier nur der SHA-256 in
   der Datenbank, nie der Code selbst.
====================================================== */
create table if not exists public.currency_codes (
  code_sha256 text primary key check (code_sha256 ~ '^[0-9a-f]{64}$'),
  betrag integer not null check (betrag > 0 and betrag <= 5000),
  bemerkung text,
  erstellt timestamptz not null default now()
);

alter table public.currency_codes enable row level security;
alter table public.currency_codes force row level security;
-- Keine Policy, keine Rechte: sonst liesse sich die Liste der gueltigen
-- Betraege auslesen und mit einer Wortliste abgleichen.
revoke all on public.currency_codes from anon, authenticated;

insert into public.currency_codes (code_sha256, betrag, bemerkung) values
  ('516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769', 100, 'aus dem alten CASE'),
  ('a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4',  25, 'aus dem alten CASE'),
  ('8bfe3282c066093f84dc23ea2215dff3eae0c7bb2a0d7a11585800adc3d7efb1',  25, 'aus dem alten CASE'),
  ('8f42ea772af5c16d5b27feb56aae75e6407d8b85e9174e79e468320b9ed88dba', 300, 'aus dem alten CASE'),
  ('d422fd99131807e57e4c5b71defeeab9544b77d9d9201cf36a922f14bf5f226d', 300, 'aus dem alten CASE'),
  ('80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c', 500, 'aus dem alten CASE'),
  ('484aab2f2cd0f77b3c30f91521ba9a76c8c501112a53e100154a098c274f03d3', 300, 'aus dem alten CASE'),
  ('5836a4ee100cdabe7e2cf26b1a73d9dba43e43b17e27a4d159de60ebc6b41d22', 400, 'Detektiv-Raetsel, vergibt zusaetzlich den Meisterdetektiv-Avatar')
on conflict (code_sha256) do nothing;

/* Nachschlagen statt CASE. SECURITY DEFINER, weil die Tabelle fuer
   niemanden lesbar ist - der Aufrufer ist der Spieler selbst. */
create or replace function app.code_betrag(p_hash text) returns integer
language sql stable security definer set search_path = public, app, pg_temp
as $$ select betrag from public.currency_codes where code_sha256 = p_hash $$;

grant execute on function app.code_betrag(text) to anon, authenticated;

/* app.valid_code_redemption() aus 01-players-ship-progression.sql,
   unveraendert bis auf den Schluss: das CASE ist durch den
   Tabellen-Nachschlag ersetzt. */
create or replace function app.valid_code_redemption(
  p_uid text,
  new_codes jsonb,
  new_currency integer,
  new_last_wheel_spin timestamptz,
  new_last_spielothek_play timestamptz
) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
  old_codes jsonb := coalesce(old_row.redeemed_currency_codes, '{}'::jsonb);
  old_currency integer := coalesce(old_row.currency, 0);
  delta integer := new_currency - old_currency;
  new_hash text;
  soll integer;
begin
  if new_codes = old_codes then
    -- Schatzrad-Preise und Spielothek-Gewinne setzen IMMER
    -- last_wheel_spin_at bzw. last_spielothek_play_at im selben
    -- Schreibvorgang; deren Aenderung wird eigenstaendig geprueft.
    if new_last_wheel_spin is distinct from old_row.last_wheel_spin_at
       or new_last_spielothek_play is distinct from old_row.last_spielothek_play_at then
      return true;
    end if;
    return delta <= 0;
  end if;
  if jsonb_typeof(new_codes) <> 'object' or (select count(*) from jsonb_object_keys(new_codes)) > 50 then
    return false;
  end if;
  -- genau EIN neuer Eintrag
  if (select count(*) from jsonb_object_keys(new_codes) k where not old_codes ? k) <> 1
     or (select count(*) from jsonb_object_keys(new_codes)) <> (select count(*) from jsonb_object_keys(old_codes)) + 1 then
    return false;
  end if;

  select k into new_hash from jsonb_object_keys(new_codes) k where not old_codes ? k;

  soll := app.code_betrag(new_hash);
  return soll is not null and delta = soll;
end;
$$;

/* Verwaltung. Der Code wird als Klartext uebergeben und hier
   gehasht - dieselbe Rechnung wie im Browser (SHA-256 ueber den
   Code in Grossbuchstaben, ohne Rand-Leerzeichen). */
create or replace function app.admin_code_setzen(p_code text, p_betrag integer, p_bemerkung text default null)
returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare hash text;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_code is null or char_length(btrim(p_code)) < 3 then
    raise exception 'code-zu-kurz';
  end if;
  if p_betrag is null or p_betrag < 1 or p_betrag > 5000 then
    raise exception 'betrag-ungueltig';
  end if;

  hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  insert into public.currency_codes (code_sha256, betrag, bemerkung)
       values (hash, p_betrag, p_bemerkung)
  on conflict (code_sha256) do update set betrag = excluded.betrag, bemerkung = excluded.bemerkung;

  perform app.admin_notiz('dublonen-code-gesetzt', hash, jsonb_build_object('betrag', p_betrag, 'bemerkung', p_bemerkung));
  return hash;
end
$$;

create or replace function public.admin_code_setzen(p_code text, p_betrag integer, p_bemerkung text default null)
returns text
language sql
as $$ select app.admin_code_setzen(p_code, p_betrag, p_bemerkung) $$;

create or replace function app.admin_code_loeschen(p_code text) returns boolean
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare hash text; weg int;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  delete from public.currency_codes where code_sha256 = hash;
  get diagnostics weg = row_count;
  perform app.admin_notiz('dublonen-code-geloescht', hash, null);
  return weg > 0;
end
$$;

create or replace function public.admin_code_loeschen(p_code text) returns boolean
language sql
as $$ select app.admin_code_loeschen(p_code) $$;

/* Liste OHNE die Codes selbst - die stehen nirgends, auch nicht fuer
   dich. Nur Betrag, Bemerkung und die ersten acht Hashzeichen, damit
   sich Zeilen auseinanderhalten lassen. */
create or replace function app.admin_codes()
returns table (kennung text, betrag integer, bemerkung text, erstellt timestamptz, art text)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select left(c.code_sha256, 8), c.betrag, c.bemerkung, c.erstellt, 'dublonen'::text
      from public.currency_codes c
    union all
    select left(b.code_sha256, 8), null::integer, coalesce(b.bemerkung, b.schluessel), b.erstellt, 'boss'::text
      from public.boss_special_codes b
    order by 5, 4 desc;
end
$$;

create or replace function public.admin_codes()
returns table (kennung text, betrag integer, bemerkung text, erstellt timestamptz, art text)
language sql
as $$ select * from app.admin_codes() $$;

/* Boss-Spezialcode anlegen oder aendern. */
create or replace function app.admin_boss_code_setzen(p_code text, p_schluessel text, p_bemerkung text default null)
returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare hash text;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_code is null or char_length(btrim(p_code)) < 3 then
    raise exception 'code-zu-kurz';
  end if;
  if not exists (select 1 from public.boss_attack_defs where schluessel = p_schluessel and art = 'spezial') then
    raise exception 'kein-spezialangriff';
  end if;

  hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  insert into public.boss_special_codes (code_sha256, schluessel, bemerkung)
       values (hash, p_schluessel, p_bemerkung)
  on conflict (code_sha256) do update set schluessel = excluded.schluessel, bemerkung = excluded.bemerkung;

  perform app.admin_notiz('boss-code-gesetzt', hash, jsonb_build_object('angriff', p_schluessel));
  return hash;
end
$$;

create or replace function public.admin_boss_code_setzen(p_code text, p_schluessel text, p_bemerkung text default null)
returns text
language sql
as $$ select app.admin_boss_code_setzen(p_code, p_schluessel, p_bemerkung) $$;


/* ======================================================
   3. TURNIER-FEINSTEUERUNG
====================================================== */

/* Ein Match-Ergebnis von Hand setzen. Laeuft ueber dieselbe
   Funktion wie ein echtes Spielende (app.tournament_resolve_match),
   damit der Sieger korrekt in die naechste Runde vorrueckt und der
   Verlierer als ausgeschieden markiert wird - von Hand an den
   Tabellen zu schrauben wuerde genau das vergessen. */
create or replace function app.admin_match_entscheiden(p_match_id bigint, p_winner_uid text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare m public.tournament_matches;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select * into m from public.tournament_matches where id = p_match_id;
  if not found then
    raise exception 'match-unbekannt';
  end if;
  if p_winner_uid is distinct from m.player_1_uid and p_winner_uid is distinct from m.player_2_uid then
    raise exception 'spieler-nicht-in-diesem-match';
  end if;
  if m.status = 'complete' then
    raise exception 'match-schon-entschieden';
  end if;

  -- p_via_bye = false ist hier zwingend: mit true ueberspringt
  -- tournament_resolve_match() das Ausscheiden des Verlierers (fuer ein
  -- Freilos gibt es ja keinen). Bei einer Admin-Entscheidung gibt es
  -- sehr wohl einen Verlierer, und der muss ausscheiden.
  perform app.tournament_resolve_match(p_match_id, p_winner_uid, false);
  perform app.admin_notiz('match-entschieden', p_match_id::text, jsonb_build_object('sieger', p_winner_uid));
end
$$;

create or replace function public.admin_match_entscheiden(p_match_id bigint, p_winner_uid text) returns void
language sql
as $$ select app.admin_match_entscheiden(p_match_id, p_winner_uid) $$;

/* Jemanden nachtragen - nur solange die Anmeldung offen ist. Waehrend
   ein Turnier laeuft, ginge das nicht: der Turnierbaum steht schon
   und haette keinen Platz mehr. */
create or replace function app.admin_teilnehmer_nachtragen(p_tournament_id text, p_uid text, p_nickname text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id and status = 'registration') then
    raise exception 'nur-waehrend-der-anmeldung';
  end if;
  if char_length(coalesce(btrim(p_nickname), '')) not between 1 and 30 then
    raise exception 'name-laenge';
  end if;

  insert into public.tournament_participants (tournament_id, firebase_uid, nickname)
       values (p_tournament_id, p_uid, btrim(p_nickname))
  on conflict (tournament_id, firebase_uid) do nothing;

  perform app.admin_notiz('teilnehmer-nachgetragen', p_tournament_id,
                          jsonb_build_object('uid', p_uid, 'name', p_nickname));
end
$$;

create or replace function public.admin_teilnehmer_nachtragen(p_tournament_id text, p_uid text, p_nickname text)
returns void
language sql
as $$ select app.admin_teilnehmer_nachtragen(p_tournament_id, p_uid, p_nickname) $$;

create or replace function app.admin_teilnehmer_entfernen(p_tournament_id text, p_uid text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id and status = 'registration') then
    raise exception 'nur-waehrend-der-anmeldung';
  end if;

  delete from public.tournament_participants
   where tournament_id = p_tournament_id and firebase_uid = p_uid;

  perform app.admin_notiz('teilnehmer-entfernt', p_tournament_id, jsonb_build_object('uid', p_uid));
end
$$;

create or replace function public.admin_teilnehmer_entfernen(p_tournament_id text, p_uid text) returns void
language sql
as $$ select app.admin_teilnehmer_entfernen(p_tournament_id, p_uid) $$;


/* ======================================================
   4. WOCHENRENNEN
====================================================== */
create or replace function app.admin_rennen_woche(p_week text default null)
returns table (week text, firebase_uid text, nickname text, progress integer, aktualisiert timestamptz)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare w text := coalesce(p_week, (select max(r.week) from public.race_progress r));
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select r.week, r.firebase_uid, r.nickname, r.progress, r.updated_at
      from public.race_progress r
     where r.week = w
     order by r.progress desc
     limit 50;
end
$$;

create or replace function public.admin_rennen_woche(p_week text default null)
returns table (week text, firebase_uid text, nickname text, progress integer, aktualisiert timestamptz)
language sql
as $$ select * from app.admin_rennen_woche(p_week) $$;

create or replace function app.admin_rennen_setzen(p_week text, p_uid text, p_progress integer)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_progress is null or p_progress < 0 then
    raise exception 'punkte-ungueltig';
  end if;
  update public.race_progress
     set progress = p_progress, updated_at = now()
   where week = p_week and firebase_uid = p_uid;
  if not found then
    raise exception 'eintrag-unbekannt';
  end if;
  perform app.admin_notiz('rennen-gesetzt', p_week, jsonb_build_object('uid', p_uid, 'punkte', p_progress));
end
$$;

create or replace function public.admin_rennen_setzen(p_week text, p_uid text, p_progress integer) returns void
language sql
as $$ select app.admin_rennen_setzen(p_week, p_uid, p_progress) $$;

create or replace function app.admin_rennen_eintrag_loeschen(p_week text, p_uid text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  delete from public.race_progress where week = p_week and firebase_uid = p_uid;
  perform app.admin_notiz('rennen-eintrag-geloescht', p_week, jsonb_build_object('uid', p_uid));
end
$$;

create or replace function public.admin_rennen_eintrag_loeschen(p_week text, p_uid text) returns void
language sql
as $$ select app.admin_rennen_eintrag_loeschen(p_week, p_uid) $$;

/* Ganze Woche leeren. Bewusst mit Pflichtangabe der Woche statt
   "die aktuelle" - damit sich niemand vertippt und die falsche
   loescht. */
create or replace function app.admin_rennen_woche_leeren(p_week text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare weg int;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if coalesce(btrim(p_week), '') = '' then
    raise exception 'woche-fehlt';
  end if;
  delete from public.race_progress where week = p_week;
  get diagnostics weg = row_count;
  perform app.admin_notiz('rennen-woche-geleert', p_week, jsonb_build_object('geloescht', weg));
  return weg;
end
$$;

create or replace function public.admin_rennen_woche_leeren(p_week text) returns integer
language sql
as $$ select app.admin_rennen_woche_leeren(p_week) $$;


/* ======================================================
   5. RECHTE
====================================================== */
grant execute on function app.admin_boss_uebersicht()                                 to authenticated;
grant execute on function public.admin_boss_uebersicht()                              to authenticated;
grant execute on function app.admin_boss_setzen(text, integer, integer, boolean)      to authenticated;
grant execute on function public.admin_boss_setzen(text, integer, integer, boolean)   to authenticated;
grant execute on function app.admin_boss_zuruecksetzen(text, boolean)                 to authenticated;
grant execute on function public.admin_boss_zuruecksetzen(text, boolean)              to authenticated;
grant execute on function app.admin_spezial_freischalten(text, text)                  to authenticated;
grant execute on function public.admin_spezial_freischalten(text, text)               to authenticated;
grant execute on function app.admin_code_setzen(text, integer, text)                  to authenticated;
grant execute on function public.admin_code_setzen(text, integer, text)               to authenticated;
grant execute on function app.admin_code_loeschen(text)                               to authenticated;
grant execute on function public.admin_code_loeschen(text)                            to authenticated;
grant execute on function app.admin_codes()                                           to authenticated;
grant execute on function public.admin_codes()                                        to authenticated;
grant execute on function app.admin_boss_code_setzen(text, text, text)                to authenticated;
grant execute on function public.admin_boss_code_setzen(text, text, text)             to authenticated;
grant execute on function app.admin_match_entscheiden(bigint, text)                   to authenticated;
grant execute on function public.admin_match_entscheiden(bigint, text)                to authenticated;
grant execute on function app.admin_teilnehmer_nachtragen(text, text, text)           to authenticated;
grant execute on function public.admin_teilnehmer_nachtragen(text, text, text)        to authenticated;
grant execute on function app.admin_teilnehmer_entfernen(text, text)                  to authenticated;
grant execute on function public.admin_teilnehmer_entfernen(text, text)               to authenticated;
grant execute on function app.admin_rennen_woche(text)                                to authenticated;
grant execute on function public.admin_rennen_woche(text)                             to authenticated;
grant execute on function app.admin_rennen_setzen(text, text, integer)                to authenticated;
grant execute on function public.admin_rennen_setzen(text, text, integer)             to authenticated;
grant execute on function app.admin_rennen_eintrag_loeschen(text, text)               to authenticated;
grant execute on function public.admin_rennen_eintrag_loeschen(text, text)            to authenticated;
grant execute on function app.admin_rennen_woche_leeren(text)                         to authenticated;
grant execute on function public.admin_rennen_woche_leeren(text)                      to authenticated;
