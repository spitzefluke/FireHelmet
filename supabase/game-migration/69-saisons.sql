/* ======================================================
   SAISONS: HALLOWEEN, WEIHNACHTEN, NEUJAHR, OSTERN
   ---------------------------------------------------
   Entwurf "FireHelmet Saisons" aus Claude Design. Die Seite
   wechselt nach Datum (deutsche Zeit) ihr Aussehen; dazu gehoeren:

     - Halloween / Ostern: Suchspiel. 17 Kuerbisse bzw. Eier liegen
       ueber die Seiten verteilt. Jeder Fund bringt Dublonen, wer
       alle findet, bekommt einen Titel und einen Bonus.
     - Weihnachten: Adventskalender. Ein Tuerchen je Tag (1.-24.12.),
       nur an seinem Tag zu oeffnen - verpasste Tuerchen verfallen.
     - Neujahr: Countdown, um 0 Uhr Feuerwerk und ein Geschenk.

   Alles, was Dublonen, Spind-Teile oder Titel bringt, rechnet diese
   Datei - der Browser zeigt nur. Die Einstellungen (Zeitfenster,
   Suchspiel, Inhalt der Tuerchen) stehen in saison_config und sind
   NICHT oeffentlich lesbar: sonst laege der Code hinter Tuerchen 21
   schon am 1. Dezember offen. Jeder sieht nur, was ihm zusteht,
   ueber saison_stand().

   Zeitfenster: "MM-TT" wiederholt sich jedes Jahr (auch ueber den
   Jahreswechsel, z. B. 12-27 bis 01-06), "JJJJ-MM-TT" gilt genau
   einmal (Ostern wandert). Der Admin kann eine Saison erzwingen
   (Gateway -> Saisons), etwa um sie vorab fuer alle zu zeigen.

   REIHENFOLGE: nach 68 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. TABELLEN
====================================================== */
create table if not exists public.saison_config (
  id         integer primary key default 1,
  daten      jsonb not null,
  updated_at timestamptz not null default now(),
  constraint saison_config_eine_zeile check (id = 1)
);

create table if not exists public.saison_funde (
  firebase_uid text not null,
  saison       text not null,
  jahr         integer not null,
  nr           integer not null,
  gefunden_am  timestamptz not null default now(),
  primary key (firebase_uid, saison, jahr, nr),
  constraint saison_funde_saison check (saison in ('halloween', 'ostern')),
  constraint saison_funde_nr check (nr between 1 and 17)
);

create table if not exists public.advent_oeffnungen (
  firebase_uid text not null,
  jahr         integer not null,
  tag          integer not null,
  geoeffnet_am timestamptz not null default now(),
  primary key (firebase_uid, jahr, tag),
  constraint advent_tag check (tag between 1 and 24)
);

create table if not exists public.neujahr_geschenke (
  firebase_uid text not null,
  jahr         integer not null,
  abgeholt_am  timestamptz not null default now(),
  primary key (firebase_uid, jahr)
);

alter table public.saison_config     enable row level security;
alter table public.saison_config     force row level security;
alter table public.saison_funde      enable row level security;
alter table public.saison_funde      force row level security;
alter table public.advent_oeffnungen enable row level security;
alter table public.advent_oeffnungen force row level security;
alter table public.neujahr_geschenke enable row level security;
alter table public.neujahr_geschenke force row level security;

/* Keine Policies: gelesen und geschrieben wird nur ueber die
   Funktionen unten (security definer). */
revoke all on public.saison_config, public.saison_funde,
              public.advent_oeffnungen, public.neujahr_geschenke from anon, authenticated;


/* ======================================================
   2. FORM DER EINSTELLUNGEN
====================================================== */
create or replace function app.saison_datum_ok(v jsonb) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(v) = 'string'
    and ((v #>> '{}') ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      or ((v #>> '{}') ~ '^20[2-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
          and to_char(to_date(v #>> '{}', 'YYYY-MM-DD'), 'YYYY-MM-DD') = (v #>> '{}'))), false)
$$;

create or replace function app.saison_zahl_ok(v jsonb, lo integer, hi integer) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]{1,6}$'
                  and (v #>> '{}')::int between lo and hi, false)
$$;

/* Erlaubte Seiten fuer versteckte Funde - die Seiten aus index.html,
   ohne Unterseiten, Admin und Rechtliches. */
create or replace function app.saison_seiten() returns text[]
language sql immutable
as $$
  select array['stand', 'story', 'characters', 'socials', 'shop', 'code', 'wheel',
               'spielothek', 'leaderboard', 'race', 'streamraetsel', 'tournament',
               'hangar', 'sternenschlacht', 'community-boss', 'support', 'skill-tree',
               'gluecksmine', 'rating', 'login']
$$;

create or replace function app.saison_config_ok(j jsonb) returns boolean
language plpgsql stable
set search_path = public, app, pg_temp
as $$
declare
  k text;
  f jsonb;
  s jsonb;
  t jsonb;
  art text;
begin
  if j is null or jsonb_typeof(j) <> 'object' then return false; end if;

  /* Erzwungene Saison: null oder eine bekannte. */
  if j ? 'erzwungen' and jsonb_typeof(j -> 'erzwungen') <> 'null'
     and coalesce(j ->> 'erzwungen', '') not in ('original', 'halloween', 'weihnachten', 'neujahr', 'ostern') then
    return false;
  end if;

  /* Zeitfenster: alle vier, je von/bis. */
  if jsonb_typeof(j -> 'fenster') is distinct from 'object' then return false; end if;
  foreach k in array array['halloween', 'weihnachten', 'neujahr', 'ostern'] loop
    f := j -> 'fenster' -> k;
    if jsonb_typeof(f) is distinct from 'object' then return false; end if;
    if app.saison_datum_ok(f -> 'von') = false or app.saison_datum_ok(f -> 'bis') = false then return false; end if;
    /* Beide Grenzen in derselben Schreibweise. */
    if char_length(f ->> 'von') <> char_length(f ->> 'bis') then return false; end if;
    if char_length(f ->> 'von') = 10 and (f ->> 'von')::date > (f ->> 'bis')::date then return false; end if;
  end loop;

  /* Suchspiel je Saison: 17 Seiten, Belohnung, Bonus, Titel. */
  if jsonb_typeof(j -> 'suche') is distinct from 'object' then return false; end if;
  foreach k in array array['halloween', 'ostern'] loop
    s := j -> 'suche' -> k;
    if jsonb_typeof(s) is distinct from 'object' then return false; end if;
    if app.saison_zahl_ok(s -> 'belohnung', 0, 1000) = false then return false; end if;
    if app.saison_zahl_ok(s -> 'bonus', 0, 10000) = false then return false; end if;
    if coalesce(jsonb_typeof(s -> 'titel'), '') <> 'string'
       or char_length(btrim(s ->> 'titel')) not between 1 and 32 then return false; end if;
    if coalesce(jsonb_typeof(s -> 'seiten'), '') <> 'array' or jsonb_array_length(s -> 'seiten') <> 17 then return false; end if;
    for t in select value from jsonb_array_elements(s -> 'seiten') loop
      if coalesce(jsonb_typeof(t), '') <> 'string' or not ((t #>> '{}') = any(app.saison_seiten())) then return false; end if;
    end loop;
  end loop;

  /* Adventskalender: genau 24 Tuerchen. */
  if coalesce(jsonb_typeof(j -> 'advent'), '') <> 'array' or jsonb_array_length(j -> 'advent') <> 24 then return false; end if;
  for t in select value from jsonb_array_elements(j -> 'advent') loop
    if jsonb_typeof(t) <> 'object' then return false; end if;
    art := coalesce(t ->> 'art', '');
    if art = 'dublonen' then
      if app.saison_zahl_ok(t -> 'wert', 1, 5000) = false then return false; end if;
    elsif art = 'spind' then
      if not exists (select 1 from public.spind_teile st where st.teil_id = t ->> 'wert') then return false; end if;
    elsif art = 'code' then
      if coalesce(t ->> 'wert', '') !~ '^[A-Za-z0-9_-]{2,40}$' then return false; end if;
    elsif art = 'eigen' then
      if coalesce(jsonb_typeof(t -> 'wert'), '') <> 'string'
         or char_length(btrim(t ->> 'wert')) not between 1 and 80 then return false; end if;
      if t ? 'dublonen' and app.saison_zahl_ok(t -> 'dublonen', 0, 5000) = false then return false; end if;
    else
      return false;
    end if;
  end loop;

  /* Neujahr: Geschenk in Dublonen. */
  if jsonb_typeof(j -> 'neujahr') is distinct from 'object'
     or app.saison_zahl_ok(j -> 'neujahr' -> 'geschenk', 0, 5000) = false then return false; end if;

  return true;
end
$$;

alter table public.saison_config drop constraint if exists saison_config_form;
alter table public.saison_config add constraint saison_config_form check (app.saison_config_ok(daten));


/* ======================================================
   3. VORGABE (nur, wenn noch keine Einstellung da ist)
====================================================== */
insert into public.saison_config (id, daten) values (1, jsonb_build_object(
  'erzwungen', null,
  'fenster', jsonb_build_object(
    'halloween',   jsonb_build_object('von', '10-15', 'bis', '11-01'),
    'weihnachten', jsonb_build_object('von', '12-01', 'bis', '12-26'),
    'neujahr',     jsonb_build_object('von', '12-27', 'bis', '01-06'),
    'ostern',      jsonb_build_object('von', '2027-03-21', 'bis', '2027-03-29')),
  'suche', jsonb_build_object(
    'halloween', jsonb_build_object('belohnung', 25, 'bonus', 300, 'titel', 'Kürbiskönig',
      'seiten', '["stand","stand","stand","story","characters","socials","shop","code","wheel","spielothek","leaderboard","tournament","race","community-boss","gluecksmine","support","rating"]'::jsonb),
    'ostern', jsonb_build_object('belohnung', 25, 'bonus', 300, 'titel', 'Osterkapitän',
      'seiten', '["stand","stand","stand","story","characters","socials","shop","code","wheel","spielothek","leaderboard","tournament","race","community-boss","gluecksmine","support","rating"]'::jsonb)),
  'advent', '[
    {"art":"dublonen","wert":50},{"art":"dublonen","wert":75},{"art":"spind","wert":"eis"},
    {"art":"dublonen","wert":50},{"art":"code","wert":"EISBART"},{"art":"spind","wert":"sturm"},
    {"art":"dublonen","wert":100},{"art":"dublonen","wert":50},{"art":"spind","wert":"smaragd"},
    {"art":"dublonen","wert":75},{"art":"code","wert":"LEBKUCHEN"},{"art":"dublonen","wert":150},
    {"art":"spind","wert":"nordlicht"},{"art":"dublonen","wert":75},{"art":"dublonen","wert":100},
    {"art":"code","wert":"KERZENSCHEIN"},{"art":"spind","wert":"feuer"},{"art":"dublonen","wert":100},
    {"art":"dublonen","wert":75},{"art":"spind","wert":"sternennebel"},{"art":"code","wert":"SCHLITTENFAHRT"},
    {"art":"dublonen","wert":150},{"art":"spind","wert":"gold"},
    {"art":"eigen","wert":"Sonderbelohnung der Crew","dublonen":500}]'::jsonb,
  'neujahr', jsonb_build_object('geschenk', 100)))
on conflict (id) do nothing;

/* Die beiden Titel fuer "alle 17 gefunden". Feste IDs, der Text kommt
   aus der Einstellung und wird beim Speichern nachgezogen. */
insert into public.event_titel (titel_id, text, stil) values
  ('saison-halloween', 'Kürbiskönig', 'feuer'),
  ('saison-ostern',    'Osterkapitän', 'regenbogen')
on conflict (titel_id) do nothing;


/* ======================================================
   4. WELCHE SAISON GILT?
====================================================== */
create or replace function app.saison_heute() returns date
language sql stable
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create or replace function app.saison_im_fenster(p_von text, p_bis text, p_tag date) returns boolean
language plpgsql immutable
as $$
declare
  x text := to_char(p_tag, 'MM-DD');
begin
  if p_von is null or p_bis is null then return false; end if;
  if char_length(p_von) = 10 then
    return p_tag between p_von::date and p_bis::date;
  end if;
  if p_von <= p_bis then
    return x between p_von and p_bis;
  end if;
  return x >= p_von or x <= p_bis;   -- ueber den Jahreswechsel
end
$$;

create or replace function app.saison_jetzt() returns text
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
declare
  c jsonb := (select daten from public.saison_config where id = 1);
  d date := app.saison_heute();
  k text;
begin
  if c is null then return 'original'; end if;
  if coalesce(c ->> 'erzwungen', '') <> '' then return c ->> 'erzwungen'; end if;
  /* Feste Reihenfolge, falls sich Fenster ueberschneiden. */
  foreach k in array array['neujahr', 'weihnachten', 'halloween', 'ostern'] loop
    if app.saison_im_fenster(c -> 'fenster' -> k ->> 'von', c -> 'fenster' -> k ->> 'bis', d) then
      return k;
    end if;
  end loop;
  return 'original';
end
$$;

/* Das Jahr, unter dem Funde und Tuerchen zaehlen. Neujahr zaehlt
   zum Jahr, das gerade beginnt - also ab dem 1. Januar zum neuen. */
create or replace function app.saison_jahr() returns integer
language sql stable
as $$ select extract(year from app.saison_heute())::int $$;


/* ======================================================
   5. STAND FUER DEN BROWSER
====================================================== */
create or replace function app.saison_stand() returns jsonb
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  c    jsonb := (select daten from public.saison_config where id = 1);
  s    text := app.saison_jetzt();
  d    date := app.saison_heute();
  sjahr integer := app.saison_jahr();
  erg  jsonb;
  ziel timestamptz;
  tag  integer;
begin
  erg := jsonb_build_object('saison', s, 'heute', to_char(d, 'YYYY-MM-DD'), 'jetzt', now(),
                            'angemeldet', uid is not null);

  if s in ('halloween', 'ostern') and c is not null then
    erg := erg || jsonb_build_object('suche', jsonb_build_object(
      'gesamt', 17,
      'belohnung', (c -> 'suche' -> s -> 'belohnung')::int,
      'bonus',     (c -> 'suche' -> s -> 'bonus')::int,
      'titel',     c -> 'suche' -> s ->> 'titel',
      'seiten',    c -> 'suche' -> s -> 'seiten',
      'gefunden',  coalesce((select jsonb_agg(f.nr order by f.nr) from public.saison_funde f
                              where f.firebase_uid = uid and f.saison = s and f.jahr = sjahr), '[]'::jsonb)));
  end if;

  if s = 'weihnachten' and c is not null then
    tag := case when extract(month from d) = 12 and extract(day from d) <= 24 then extract(day from d)::int end;
    /* Inhalt nur fuer geoeffnete Tuerchen - alles andere bleibt zu. */
    erg := erg || jsonb_build_object('advent', jsonb_build_object(
      'tag', tag,
      'geoeffnet', coalesce((select jsonb_agg(jsonb_build_object('tag', o.tag) || (c -> 'advent' -> (o.tag - 1)) order by o.tag)
                               from public.advent_oeffnungen o
                              where o.firebase_uid = uid and o.jahr = sjahr), '[]'::jsonb)));
  end if;

  if s = 'neujahr' and c is not null then
    /* 0 Uhr des naechsten 1. Januar, deutsche Zeit. Ab dem 1. Januar
       ist das Ziel erreicht und zeigt auf heute 0 Uhr. */
    ziel := case when extract(month from d) = 1
                 then make_timestamptz(extract(year from d)::int, 1, 1, 0, 0, 0, 'Europe/Berlin')
                 else make_timestamptz(extract(year from d)::int + 1, 1, 1, 0, 0, 0, 'Europe/Berlin') end;
    erg := erg || jsonb_build_object('neujahr', jsonb_build_object(
      'ziel', ziel,
      'geschenk', (c -> 'neujahr' -> 'geschenk')::int,
      'abgeholt', exists (select 1 from public.neujahr_geschenke g
                           where g.firebase_uid = uid and g.jahr = extract(year from ziel at time zone 'Europe/Berlin')::int)));
  end if;

  return erg;
end
$$;


/* ======================================================
   6. SPIELEN: FUND, TUERCHEN, NEUJAHRSGESCHENK
====================================================== */
create or replace function app.saison_vorab(p_uid text) returns text
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return 'gesperrt';
  end if;
  return null;
end
$$;

create or replace function app.saison_dublonen(p_uid text, p_wert integer) returns void
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
begin
  if coalesce(p_wert, 0) <= 0 then return; end if;
  insert into public.players (firebase_uid) values (p_uid) on conflict (firebase_uid) do nothing;
  update public.players set currency = currency + p_wert where firebase_uid = p_uid;
end
$$;
revoke execute on function app.saison_dublonen(text, integer) from public, anon, authenticated;

create or replace function app.saison_fund(p_nr integer) returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.saison_vorab(uid);
  s     text := app.saison_jetzt();
  sjahr integer := app.saison_jahr();
  c     jsonb := (select daten from public.saison_config where id = 1);
  n     integer;
  dub   integer;
  bonus integer := 0;
  titel text;
begin
  if grund is not null then return jsonb_build_object('ok', false, 'grund', grund); end if;
  if s not in ('halloween', 'ostern') then return jsonb_build_object('ok', false, 'grund', 'keine-suche'); end if;
  if p_nr is null or p_nr not between 1 and 17 then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;

  /* Ein Spieler zur Zeit: sonst koennten zwei gleichzeitige Funde
     beide (oder keiner) als der 17. zaehlen. */
  perform pg_advisory_xact_lock(hashtext('saison:' || uid));

  insert into public.saison_funde (firebase_uid, saison, jahr, nr) values (uid, s, sjahr, p_nr)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'grund', 'schon'); end if;

  dub := (c -> 'suche' -> s -> 'belohnung')::int;
  select count(*) into n from public.saison_funde f where f.firebase_uid = uid and f.saison = s and f.jahr = sjahr;

  if n = 17 then
    bonus := (c -> 'suche' -> s -> 'bonus')::int;
    insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, 'saison-' || s)
    on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
    titel := (select t.text from public.event_titel t where t.titel_id = 'saison-' || s);
  end if;

  perform app.saison_dublonen(uid, dub + bonus);
  return jsonb_build_object('ok', true, 'gefunden', n, 'gesamt', 17, 'dublonen', dub,
                            'bonus', bonus, 'titel', titel);
end
$$;

create or replace function app.advent_oeffnen(p_tag integer) returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.saison_vorab(uid);
  d     date := app.saison_heute();
  c     jsonb := (select daten from public.saison_config where id = 1);
  tuer  jsonb;
  dub   integer := 0;
begin
  if grund is not null then return jsonb_build_object('ok', false, 'grund', grund); end if;
  if app.saison_jetzt() <> 'weihnachten' then return jsonb_build_object('ok', false, 'grund', 'kein-advent'); end if;
  /* Nur das Tuerchen von heute - verpasste verfallen, kuenftige warten. */
  if p_tag is null or p_tag not between 1 and 24
     or extract(month from d) <> 12 or extract(day from d)::int <> p_tag then
    return jsonb_build_object('ok', false, 'grund', 'nicht-heute');
  end if;

  insert into public.advent_oeffnungen (firebase_uid, jahr, tag) values (uid, extract(year from d)::int, p_tag)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'grund', 'schon'); end if;

  tuer := c -> 'advent' -> (p_tag - 1);
  if tuer ->> 'art' = 'dublonen' then
    dub := (tuer ->> 'wert')::int;
  elsif tuer ->> 'art' = 'eigen' then
    dub := coalesce((tuer ->> 'dublonen')::int, 0);
  elsif tuer ->> 'art' = 'spind' then
    insert into public.spind_besitz (firebase_uid, teil_id) values (uid, tuer ->> 'wert')
    on conflict do nothing;
  end if;
  perform app.saison_dublonen(uid, dub);

  return jsonb_build_object('ok', true, 'tag', p_tag) || tuer;
end
$$;

create or replace function app.neujahr_geschenk() returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.saison_vorab(uid);
  d     date := app.saison_heute();
  c     jsonb := (select daten from public.saison_config where id = 1);
  dub   integer;
begin
  if grund is not null then return jsonb_build_object('ok', false, 'grund', grund); end if;
  /* Erst ab 0 Uhr am 1. Januar - und nur, solange Neujahr laeuft. */
  if app.saison_jetzt() <> 'neujahr' or extract(month from d) <> 1 then
    return jsonb_build_object('ok', false, 'grund', 'noch-nicht');
  end if;
  insert into public.neujahr_geschenke (firebase_uid, jahr) values (uid, extract(year from d)::int)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'grund', 'schon'); end if;
  dub := (c -> 'neujahr' ->> 'geschenk')::int;
  perform app.saison_dublonen(uid, dub);
  return jsonb_build_object('ok', true, 'dublonen', dub);
end
$$;


/* ======================================================
   7. ADMIN
====================================================== */
create or replace function app.admin_saison_lesen() returns jsonb
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
begin
  if coalesce(app.is_admin(), false) = false then
    raise exception 'nur-admin';
  end if;
  return jsonb_build_object('daten', (select daten from public.saison_config where id = 1),
                            'saison', app.saison_jetzt(), 'heute', to_char(app.saison_heute(), 'YYYY-MM-DD'));
end
$$;

create or replace function app.admin_saison_speichern(p_daten jsonb) returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
begin
  if coalesce(app.is_admin(), false) = false then
    raise exception 'nur-admin';
  end if;
  if app.saison_config_ok(p_daten) = false then
    return jsonb_build_object('ok', false, 'grund', 'form');
  end if;
  insert into public.saison_config (id, daten, updated_at) values (1, p_daten, now())
  on conflict (id) do update set daten = excluded.daten, updated_at = now();
  /* Titeltexte nachziehen - wer ihn schon hat, traegt den neuen Text. */
  update public.event_titel set text = btrim(p_daten -> 'suche' -> 'halloween' ->> 'titel') where titel_id = 'saison-halloween';
  update public.event_titel set text = btrim(p_daten -> 'suche' -> 'ostern' ->> 'titel')    where titel_id = 'saison-ostern';
  return jsonb_build_object('ok', true, 'saison', app.saison_jetzt());
end
$$;


/* ======================================================
   8. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.saison_konto_aufraeumen() returns trigger
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
begin
  delete from public.saison_funde      where firebase_uid = old.firebase_uid;
  delete from public.advent_oeffnungen where firebase_uid = old.firebase_uid;
  delete from public.neujahr_geschenke where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists saison_konto_aufraeumen on public.players;
create trigger saison_konto_aufraeumen
  after delete on public.players
  for each row execute function app.saison_konto_aufraeumen();


/* ======================================================
   9. WRAPPER UND RECHTE
====================================================== */
create or replace function public.saison_stand() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.saison_stand() $$;
create or replace function public.saison_fund(p_nr integer) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.saison_fund(p_nr) $$;
create or replace function public.advent_oeffnen(p_tag integer) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.advent_oeffnen(p_tag) $$;
create or replace function public.neujahr_geschenk() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.neujahr_geschenk() $$;
create or replace function public.admin_saison_lesen() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.admin_saison_lesen() $$;
create or replace function public.admin_saison_speichern(p_daten jsonb) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_saison_speichern(p_daten) $$;

/* Den Stand darf auch lesen, wer (noch) nicht angemeldet ist - das
   Aussehen der Saison gilt fuer jeden. Persoenliches kommt dann leer. */
revoke execute on function public.saison_stand() from public;
grant  execute on function public.saison_stand() to anon, authenticated;

revoke execute on function public.saison_fund(integer), public.advent_oeffnen(integer),
                           public.neujahr_geschenk(), public.admin_saison_lesen(),
                           public.admin_saison_speichern(jsonb) from public, anon;
grant  execute on function public.saison_fund(integer), public.advent_oeffnen(integer),
                           public.neujahr_geschenk(), public.admin_saison_lesen(),
                           public.admin_saison_speichern(jsonb) to authenticated;

revoke execute on function app.saison_fund(integer), app.advent_oeffnen(integer), app.neujahr_geschenk(),
                           app.admin_saison_lesen(), app.admin_saison_speichern(jsonb), app.saison_stand()
                      from public, anon;
grant  execute on function app.saison_fund(integer), app.advent_oeffnen(integer), app.neujahr_geschenk(),
                           app.admin_saison_lesen(), app.admin_saison_speichern(jsonb) to authenticated;
grant  execute on function app.saison_stand() to anon, authenticated;
