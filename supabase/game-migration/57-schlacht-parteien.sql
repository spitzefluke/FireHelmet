/* ======================================================
   STERNENSCHLACHT: SECHS PARTEIEN, ZWEI JE SCHLACHT
   ---------------------------------------------------
   Zu Menschen und Aliens kommen vier Parteien: Piraten-Armada,
   Maschinen-Kollektiv, Kristall-Konklave und Geisterflotte - je mit
   vier eigenen Schiffstypen, eigenen Staerken und eigener Ladezeit
   des Spezialangriffs.

   FREIGABE: Alles Neue gilt erst, wenn der Admin "Weitere Parteien"
   unter Live-Event -> Freigaben einschaltet
   (siteConfig.featureFlags.schlachtParteien). Bis dahin startet die
   Schlacht wie bisher: Menschen gegen Aliens, jeder mit seiner festen
   Seite.

   MIT FREIGABE waehlt der Admin beim Start zwei Parteien. Die Schlacht
   beginnt mit einer SAMMELPHASE (30 bis 300 s, Standard 90): Jeder
   Spieler waehlt fuer DIESE Schlacht eine der beiden Parteien und einen
   ihrer vier Schiffstypen (schlacht_partei_waehlen). Die Hangar-Stufen
   gelten fuer jeden Typ. Am Ende der Sammelphase stellt die Datenbank
   die Flotten auf; wer spaeter waehlt, ist ab der naechsten Runde dabei.
   Eine leere Seite fuellt wie bisher die Uebungsflotte - sind beide
   leer, beide. Wer schon gekaempft hat, bleibt bei seiner Partei (den
   Schiffstyp darf er wechseln).

   INTERN bleiben die beiden Seiten die Slots 'menschen' (links) und
   'aliens' (rechts) - die ganze Rechnung aus 49/50/55 bleibt gueltig.
   Welche Partei in welchem Slot steht, sagen partei_links und
   partei_rechts; jede Einheit traegt ihre Partei in "partei".
   Menschen stehen immer links, Aliens immer rechts: Regeneration und
   Formation sind Menschen-Eigenschaften und haengen am linken Slot.

   KAMPFWERTE UND SPEZIALANGRIFFE stehen jetzt in Tabellen
   (schlacht_parteien, schlacht_typen) statt in Fallunterscheidungen.
   Die acht bisherigen Typen stehen mit exakt denselben Zahlen darin.

   Neue Fassungen ("PARTEI" markiert die Aenderungen, sonst wortgleich):
   schlacht_werte (49), schlacht_aufstellen (50), schlacht_leben (55),
   schlacht_runde_pruefen (50), schlacht_stand (50), schlacht_ich (50),
   schlacht_spezial (55), schlacht_ziel (55), admin_schlacht_starten
   (56, jetzt mit p_links, p_rechts, p_sammeln_sek).

   REIHENFOLGE: nach 56 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. PARTEIEN UND TYPEN
====================================================== */
create table if not exists public.schlacht_parteien (
  partei       text primary key,
  leben_mod    numeric not null,
  schaden_mod  numeric not null,
  laden_sek    integer not null,
  ordnung      integer not null,
  constraint schlacht_partei_werte check (leben_mod between 0.5 and 2 and schaden_mod between 0.5 and 2
                                          and laden_sek between 10 and 120)
);

create table if not exists public.schlacht_typen (
  typ               text primary key,
  partei            text not null references public.schlacht_parteien(partei),
  ordnung           integer not null,
  leben             integer not null,
  schaden           numeric not null,
  anzahl            integer not null default 1,
  spezial_wirkung   text not null,
  spezial_betrifft  text not null,
  spezial_wert      numeric not null default 0,   -- schaden/heilung je Spezialstaerke
  spezial_je        numeric not null default 0,   -- fenster: Aenderung je Spezialstaerke
  spezial_sek       integer not null default 0,
  wendig            boolean not null default false,  -- Ort-Faktor "wendig" auf Zielschuesse (55)
  constraint schlacht_typ_wirkung check (spezial_wirkung in ('schaden', 'heilung', 'fenster')),
  constraint schlacht_typ_betrifft check (spezial_betrifft in ('eigene', 'gegner')),
  constraint schlacht_typ_werte check (leben between 1 and 1000 and schaden between 0 and 100 and anzahl between 1 and 3)
);

alter table public.schlacht_typen add column if not exists wendig boolean not null default false;

alter table public.schlacht_parteien enable row level security;
alter table public.schlacht_parteien force row level security;
alter table public.schlacht_typen enable row level security;
alter table public.schlacht_typen force row level security;
drop policy if exists schlacht_parteien_lesen on public.schlacht_parteien;
create policy schlacht_parteien_lesen on public.schlacht_parteien for select to anon, authenticated using (true);
drop policy if exists schlacht_typen_lesen on public.schlacht_typen;
create policy schlacht_typen_lesen on public.schlacht_typen for select to anon, authenticated using (true);
revoke all on public.schlacht_parteien, public.schlacht_typen from anon, authenticated;
grant select on public.schlacht_parteien, public.schlacht_typen to anon, authenticated;

insert into public.schlacht_parteien (partei, leben_mod, schaden_mod, laden_sek, ordnung) values
  ('menschen',  1.25, 0.85, 60, 1),
  ('aliens',    0.80, 1.30, 30, 2),
  ('piraten',   1.00, 1.10, 45, 3),
  ('maschinen', 1.20, 0.95, 50, 4),
  ('kristall',  0.95, 1.15, 40, 5),
  ('geister',   0.85, 1.25, 35, 6)
on conflict (partei) do nothing;

insert into public.schlacht_typen
  (typ, partei, ordnung, leben, schaden, anzahl, spezial_wirkung, spezial_betrifft, spezial_wert, spezial_je, spezial_sek) values
  /* bisher (48/49) - unveraendert */
  ('jaeger',      'menschen',  1,  80, 14, 1, 'schaden', 'gegner', 300, 0,    0),
  ('fregatte',    'menschen',  2, 120, 10, 1, 'fenster', 'eigene',   0, 0.30, 15),
  ('kreuzer',     'menschen',  3, 200,  7, 1, 'fenster', 'eigene',   0, 0.50, 20),
  ('traeger',     'menschen',  4, 100,  5, 1, 'heilung', 'eigene', 400, 0,    0),
  ('drohne',      'aliens',    1,  50,  9, 2, 'schaden', 'gegner', 250, 0,    0),
  ('stachel',     'aliens',    2,  70, 18, 1, 'schaden', 'gegner', 450, 0,    0),
  ('weber',       'aliens',    3, 110,  8, 1, 'fenster', 'eigene',   0, 0.40, 20),
  ('brutschiff',  'aliens',    4, 140,  6, 1, 'fenster', 'gegner',   0, 0.25, 30),
  /* Piraten-Armada: Enterkommandos und Breitseiten */
  ('kaper',       'piraten',   1,  75, 15, 1, 'schaden', 'gegner', 320, 0,    0),
  ('brigant',     'piraten',   2, 115, 11, 1, 'fenster', 'eigene',   0, 0.35, 15),
  ('galeone',     'piraten',   3, 190,  8, 1, 'schaden', 'gegner', 480, 0,    0),
  ('schmuggler',  'piraten',   4, 105,  6, 1, 'heilung', 'eigene', 380, 0,    0),
  /* Maschinen-Kollektiv: zaeh, Sonden fliegen doppelt */
  ('sonde',       'maschinen', 1,  45, 10, 2, 'schaden', 'gegner', 220, 0,    0),
  ('waechter',    'maschinen', 2, 150,  8, 1, 'fenster', 'eigene',   0, 0.45, 20),
  ('zerstoerer',  'maschinen', 3, 170, 10, 1, 'schaden', 'gegner', 500, 0,    0),
  ('fabrik',      'maschinen', 4, 120,  5, 1, 'heilung', 'eigene', 420, 0,    0),
  /* Kristall-Konklave: Spiegel und Resonanz */
  ('splitter',    'kristall',  1,  65, 17, 1, 'schaden', 'gegner', 420, 0,    0),
  ('prisma',      'kristall',  2, 110,  9, 1, 'fenster', 'eigene',   0, 0.40, 20),
  ('resonator',   'kristall',  3, 120,  8, 1, 'fenster', 'gegner',   0, 0.30, 25),
  ('monolith',    'kristall',  4, 160,  6, 1, 'heilung', 'eigene', 360, 0,    0),
  /* Geisterflotte: wenig Leben, viel Schaden */
  ('irrlicht',    'geister',   1,  55, 14, 1, 'schaden', 'gegner', 280, 0,    0),
  ('phantom',     'geister',   2, 100, 12, 1, 'fenster', 'eigene',   0, 0.50, 15),
  ('banshee',     'geister',   3, 105,  9, 1, 'fenster', 'gegner',   0, 0.35, 25),
  ('totenschiff', 'geister',   4, 180,  9, 1, 'schaden', 'gegner', 520, 0,    0)
on conflict (typ) do nothing;

/* Klein und wendig (Asteroiden-Bonus, Nebel-Malus aus 55): bisher
   Jaeger, Drohne, Stachel - dazu je Partei der leichteste Typ. */
update public.schlacht_typen set wendig = true
 where typ in ('jaeger', 'drohne', 'stachel', 'kaper', 'sonde', 'splitter', 'irrlicht');

/* Erster Typ einer Partei (Uebungsflotte). */
create or replace function app.partei_grundtyp(p_partei text) returns text
language sql stable security definer set search_path = public, app, pg_temp
as $$ select typ from public.schlacht_typen where partei = p_partei order by ordnung limit 1 $$;


/* ======================================================
   2. SPALTEN UND WAHL
====================================================== */
alter table public.sternenschlacht add column if not exists partei_links  text not null default 'menschen' references public.schlacht_parteien(partei);
alter table public.sternenschlacht add column if not exists partei_rechts text not null default 'aliens'   references public.schlacht_parteien(partei);
alter table public.sternenschlacht add column if not exists mit_wahl      boolean not null default false;
alter table public.sternenschlacht add column if not exists aufgestellt   boolean not null default true;
alter table public.sternenschlacht add column if not exists beginn_at     timestamptz;
alter table public.sternenschlacht_einheiten add column if not exists partei text;

create table if not exists public.schlacht_wahl (
  schlacht_id  bigint not null references public.sternenschlacht(id) on delete cascade,
  firebase_uid text not null,
  partei       text not null references public.schlacht_parteien(partei),
  typ          text not null references public.schlacht_typen(typ),
  gewaehlt_am  timestamptz not null default now(),
  primary key (schlacht_id, firebase_uid)
);
alter table public.schlacht_wahl enable row level security;
alter table public.schlacht_wahl force row level security;
drop policy if exists schlacht_wahl_eigene on public.schlacht_wahl;
create policy schlacht_wahl_eigene on public.schlacht_wahl
  for select to authenticated using (firebase_uid = app.firebase_uid());
revoke all on public.schlacht_wahl from anon, authenticated;
grant select on public.schlacht_wahl to authenticated;

/* Freigabe "schlachtParteien" an? Kaputt = aus. */
create or replace function app.schlacht_parteien_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'schlachtParteien' = 'true'
                     from public.site_config where id = 'main'), false)
$$;


/* ======================================================
   3. KAMPFWERTE (aus 49, jetzt aus den Tabellen)
   p_seite ist die PARTEI ('menschen', 'aliens', 'piraten', ...).
====================================================== */
create or replace function app.schlacht_werte(p_typ text, p_seite text, sl integer, ss integer, sp integer,
  out leben numeric, out schaden numeric, out spezial numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  t  public.schlacht_typen;
  ml numeric;
  ms numeric;
begin
  select * into t from public.schlacht_typen where typ = p_typ;
  select leben_mod, schaden_mod into ml, ms from public.schlacht_parteien where partei = p_seite;
  ml := coalesce(ml, 1);
  ms := coalesce(ms, 1);
  leben   := round(t.leben * (1 + 0.2 * coalesce(sl, 0)) * ml) * t.anzahl;
  schaden := round(t.schaden * (1 + 0.2 * coalesce(ss, 0)) * ms * 10) / 10.0 * t.anzahl;
  spezial := 1 + 0.25 * coalesce(sp, 0);
end
$$;


/* ======================================================
   4. AUFSTELLEN (aus 50)
====================================================== */
create or replace function app.schlacht_aufstellen(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  s     public.sternenschlacht;
  lm numeric; la numeric; dm numeric; da numeric; nm integer; na integer;
  leer  text;
  gl    numeric; gs numeric; gn integer; n integer;
  form  numeric;
  slot  text;
  partei text;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found then
    raise exception 'unbekannt';
  end if;

  if s.mit_wahl then
    /* PARTEI: Kaempfer kommen aus der Wahl je Schlacht. */
    delete from public.sternenschlacht_einheiten u
     where u.schlacht_id = p_id
       and (u.firebase_uid like 'ki-%'
            or not exists (select 1 from public.schlacht_wahl w
                            where w.schlacht_id = p_id and w.firebase_uid = u.firebase_uid
                              and not private.account_is_suspended(w.firebase_uid)));

    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
    select p_id, w.firebase_uid, p.nickname,
           case when w.partei = s.partei_links then 'menschen' else 'aliens' end,
           w.partei, w.typ, x.leben, x.schaden, x.spezial
      from public.schlacht_wahl w
      join public.players p on p.firebase_uid = w.firebase_uid
      left join public.hangar_einheiten h on h.firebase_uid = w.firebase_uid
      cross join lateral app.schlacht_werte(w.typ, w.partei, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) x
     where w.schlacht_id = p_id
       and w.partei in (s.partei_links, s.partei_rechts)
       and not private.account_is_suspended(w.firebase_uid)
    on conflict (schlacht_id, firebase_uid) do update
       set nickname = excluded.nickname, seite = excluded.seite, partei = excluded.partei, typ = excluded.typ,
           leben = excluded.leben, schaden = excluded.schaden, spezial = excluded.spezial;
  else
    /* Uebungsflotte und alle, die nicht mehr mitkaempfen duerfen, raus. */
    delete from public.sternenschlacht_einheiten u
     where u.schlacht_id = p_id
       and (u.firebase_uid like 'ki-%'
            or not exists (select 1 from public.players p
                            where p.firebase_uid = u.firebase_uid and p.seite in ('menschen', 'aliens')
                              and not private.account_is_suspended(p.firebase_uid)));

    /* Echte Spieler: neu dazu oder mit aktuellen Hangar-Werten. */
    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
    select p_id, p.firebase_uid, p.nickname, p.seite, p.seite, x.typ, w.leben, w.schaden, w.spezial
      from public.players p
      left join public.hangar_einheiten h on h.firebase_uid = p.firebase_uid
      cross join lateral (select case when h.typ is not null and app.hangar_typ_passt(p.seite, h.typ) then h.typ
                                      when p.seite = 'aliens' then 'drohne' else 'jaeger' end as typ) x
      cross join lateral app.schlacht_werte(x.typ, p.seite, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) w
     where p.seite in ('menschen', 'aliens')
       and not private.account_is_suspended(p.firebase_uid)
    on conflict (schlacht_id, firebase_uid) do update
       set nickname = excluded.nickname, seite = excluded.seite, partei = excluded.partei, typ = excluded.typ,
           leben = excluded.leben, schaden = excluded.schaden, spezial = excluded.spezial;
  end if;

  select count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into nm, na
    from public.sternenschlacht_einheiten where schlacht_id = p_id;

  if nm = 0 and na = 0 then
    if not s.mit_wahl then
      raise exception 'zu-wenige-kaempfer';
    end if;
    /* PARTEI: niemand hat gewaehlt - beide Seiten als Uebungsflotte,
       je sechs Schiffe des Grundtyps mit Stufe 1. */
    foreach slot in array array['menschen', 'aliens'] loop
      partei := case slot when 'menschen' then s.partei_links else s.partei_rechts end;
      insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
      select p_id, 'ki-' || slot || '-' || i, 'Übungsflotte', slot, partei, app.partei_grundtyp(partei), x.leben, x.schaden, x.spezial
        from generate_series(1, 6) as i
        cross join lateral app.schlacht_werte(app.partei_grundtyp(partei), partei, 1, 1, 0) x;
    end loop;
  elsif nm = 0 or na = 0 then
    /* Uebungsflotte fuer eine leere Seite: gleiche Gesamtwerte wie die
       Gegenseite, verteilt auf 3 bis 12 Schiffe. */
    leer := case when nm = 0 then 'menschen' else 'aliens' end;
    partei := case leer when 'menschen' then s.partei_links else s.partei_rechts end;
    select sum(leben), sum(schaden), count(*) into gl, gs, gn
      from public.sternenschlacht_einheiten where schlacht_id = p_id and seite <> leer;
    n := least(12, greatest(3, gn));
    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
    select p_id, 'ki-' || leer || '-' || i, 'Übungsflotte', leer, partei,
           app.partei_grundtyp(partei),
           greatest(1, round(gl / n)), greatest(0.1, round(gs / n * 10) / 10.0), 1
      from generate_series(1, n) as i;
  end if;

  select coalesce(sum(leben) filter (where seite = 'menschen'), 0), coalesce(sum(leben) filter (where seite = 'aliens'), 0),
         coalesce(sum(schaden) filter (where seite = 'menschen'), 0), coalesce(sum(schaden) filter (where seite = 'aliens'), 0),
         count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into lm, la, dm, da, nm, na
    from public.sternenschlacht_einheiten where schlacht_id = p_id;

  /* PARTEI: Formation ist eine Eigenschaft der Menschen. */
  form := case when s.partei_links = 'menschen' then 1 + least(0.2, 0.02 * nm) else 1 end;
  update public.sternenschlacht
     set skala = (lm + la) / ((dm * form + da) * coalesce(s.tempo_sek, 600) * 1.15),
         leben0_menschen = lm, leben0_aliens = la, dps_menschen = dm, dps_aliens = da,
         formation_menschen = form, anzahl_menschen = nm, anzahl_aliens = na,
         runde_at = now(), aufgestellt = true
   where id = p_id;
end
$$;

/* PARTEI: Ende der Sammelphase - einmal aufstellen, unter Sperre. */
create or replace function app.schlacht_sammeln_beenden(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s public.sternenschlacht;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found or s.status <> 'laeuft' or s.aufgestellt or now() < s.beginn_at then
    return;
  end if;
  perform app.schlacht_aufstellen(p_id);
end
$$;


/* ======================================================
   5. STAND (aus 55 bzw. 50)
====================================================== */
create or replace function app.schlacht_leben(p_id bigint, p_seite text, p_zeit timestamptz) returns numeric
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s        public.sternenschlacht;
  o        public.schlacht_orte;
  r0       timestamptz;
  t        timestamptz;
  sek      numeric;
  leben0   numeric;
  feuer    numeric;
  fenster  numeric;
  direkt   numeric;
  heil     numeric;
  regen    numeric := 0;
  k        integer := 0;
  treffer  integer := 0;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then return null; end if;
  o := app.schlacht_ort(p_id);
  r0 := coalesce(s.runde_at, s.start_at);
  t := greatest(r0, least(p_zeit, coalesce(s.ende_at, 'infinity'::timestamptz)));
  sek := extract(epoch from (t - r0));

  if p_seite = 'menschen' then
    leben0 := s.leben0_menschen;
    feuer  := s.dps_aliens * s.skala;
    /* PARTEI: Regeneration nur, wenn links wirklich Menschen stehen. */
    if s.partei_links = 'menschen' then
      regen := s.leben0_menschen * 0.0002 * sek;
    end if;
  else
    leben0 := s.leben0_aliens;
    feuer  := s.dps_menschen * s.skala * s.formation_menschen;
  end if;
  feuer := feuer * o.dauerfeuer;

  with w as (
    select a.at as von, a.bis as bis, a.faktor
      from public.sternenschlacht_aktionen a
     where a.schlacht_id = p_id and a.wirkung = 'fenster' and a.betroffen = p_seite
       and a.bis > r0 and a.at < t
  ), grenzen as (
    select r0 as x union select t
    union select greatest(r0, w.von) from w
    union select least(t, w.bis) from w
  ), abschnitt as (
    select x as a0, lead(x) over (order by x) as a1 from grenzen
  )
  select coalesce(sum(extract(epoch from (ab.a1 - ab.a0)) * coalesce((
           select exp(sum(ln(w.faktor))) from w
            where w.von <= ab.a0 + (ab.a1 - ab.a0) / 2 and w.bis > ab.a0 + (ab.a1 - ab.a0) / 2), 1)), 0)
    into fenster
    from abschnitt ab
   where ab.a1 is not null and ab.a1 > ab.a0;

  select coalesce(sum(wert) filter (where wirkung = 'schaden'), 0),
         coalesce(sum(wert) filter (where wirkung = 'heilung'), 0)
    into direkt, heil
    from public.sternenschlacht_aktionen
   where schlacht_id = p_id and betroffen = p_seite and at >= r0 and at <= t;

  if o.ereignis_sek is not null and o.ereignis_anteil > 0 then
    k := floor(sek / o.ereignis_sek);
    if o.ereignis_art = 'beide' then
      treffer := k;
    elsif (s.runde % 2 = 0) = (p_seite = 'menschen') then
      treffer := k / 2;
    else
      treffer := k - k / 2;
    end if;
  end if;

  return greatest(0, least(leben0, leben0 - feuer * fenster - direkt + heil + regen
                                    - treffer * o.ereignis_anteil * leben0));
end
$$;

create or replace function app.schlacht_runde_pruefen(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s      public.sternenschlacht;
  lm     numeric;
  la     numeric;
  gewinner text;
begin
  select * into s from public.sternenschlacht where id = p_id;
  /* PARTEI: in der Sammelphase gibt es noch keine Runde. */
  if not found or s.status <> 'laeuft' or not s.endlos or not s.aufgestellt then return; end if;
  if app.schlacht_leben(p_id, 'menschen', now()) > 0 and app.schlacht_leben(p_id, 'aliens', now()) > 0 then
    return;
  end if;

  select * into s from public.sternenschlacht where id = p_id for update;
  if s.status <> 'laeuft' then return; end if;
  lm := app.schlacht_leben(p_id, 'menschen', now());
  la := app.schlacht_leben(p_id, 'aliens', now());
  if lm > 0 and la > 0 then return; end if;   -- ein anderer Abruf war schneller

  gewinner := case when lm <= 0 and la <= 0 then 'unentschieden' when la <= 0 then 'menschen' else 'aliens' end;
  update public.sternenschlacht
     set punkte_menschen = punkte_menschen + case when gewinner = 'menschen' then 1 else 0 end,
         punkte_aliens   = punkte_aliens   + case when gewinner = 'aliens'   then 1 else 0 end,
         runden = runden || jsonb_build_array(jsonb_build_object('nr', runde, 'sieger', gewinner, 'at', now())),
         runde = runde + 1
   where id = p_id;

  begin
    perform app.schlacht_aufstellen(p_id);
  exception when others then
    /* Niemand mehr mit Seite da - dann ist die Schlacht vorbei. */
    perform app.schlacht_abschliessen(p_id);
  end;
end
$$;

create or replace function app.schlacht_stand(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s  public.sternenschlacht;
  lm numeric; la numeric; rm numeric; ra numeric;
  t  timestamptz;
  uid text := app.firebase_uid();
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  /* PARTEI: Sammelphase vorbei - Flotten aufstellen. */
  if s.status = 'laeuft' and not s.aufgestellt and now() >= s.beginn_at then
    perform app.schlacht_sammeln_beenden(p_id);
    select * into s from public.sternenschlacht where id = p_id;
  end if;
  if s.status = 'laeuft' then
    if s.endlos then
      perform app.schlacht_runde_pruefen(p_id);
    else
      lm := app.schlacht_leben(p_id, 'menschen', now());
      la := app.schlacht_leben(p_id, 'aliens', now());
      if now() >= s.ende_at or lm <= 0 or la <= 0 then
        perform app.schlacht_abschliessen(p_id);
      end if;
    end if;
    select * into s from public.sternenschlacht where id = p_id;
  end if;
  t := least(now(), coalesce(s.ende_at, 'infinity'::timestamptz));
  lm := app.schlacht_leben(p_id, 'menschen', t);
  la := app.schlacht_leben(p_id, 'aliens', t);
  rm := case when s.leben0_menschen > 0 then lm / s.leben0_menschen else 0 end;
  ra := case when s.leben0_aliens > 0 then la / s.leben0_aliens else 0 end;
  return jsonb_build_object(
    'ok', true, 'id', s.id, 'status', s.status, 'start_at', s.start_at, 'ende_at', s.ende_at,
    'jetzt', now(),
    'endlos', s.endlos, 'runde', s.runde, 'runde_at', coalesce(s.runde_at, s.start_at),
    'punkte_menschen', s.punkte_menschen, 'punkte_aliens', s.punkte_aliens,
    'letzte_runde', s.runden -> -1,
    'menschen', jsonb_build_object('leben', round(lm), 'leben0', s.leben0_menschen, 'rest', round(rm, 4), 'anzahl', s.anzahl_menschen),
    'aliens',   jsonb_build_object('leben', round(la), 'leben0', s.leben0_aliens,   'rest', round(ra, 4), 'anzahl', s.anzahl_aliens),
    'prozent_menschen', case when s.status = 'vorbei' then s.endstand_menschen
                             when rm + ra > 0 then round(100 * rm / (rm + ra), 1) else 50 end,
    'sieger', s.sieger, 'ruhm', s.ruhm,
    /* PARTEI */
    'partei_links', s.partei_links, 'partei_rechts', s.partei_rechts, 'mit_wahl', s.mit_wahl,
    'phase', case when s.aufgestellt then 'kampf' else 'sammeln' end, 'beginn_at', s.beginn_at,
    'wahl', case when s.mit_wahl then jsonb_build_object(
              'links',  (select count(*) from public.schlacht_wahl w where w.schlacht_id = s.id and w.partei = s.partei_links),
              'rechts', (select count(*) from public.schlacht_wahl w where w.schlacht_id = s.id and w.partei = s.partei_rechts)) end,
    'meine_wahl', case when uid is not null then (select jsonb_build_object('partei', w.partei, 'typ', w.typ)
                                                    from public.schlacht_wahl w where w.schlacht_id = s.id and w.firebase_uid = uid) end);
end
$$;


/* ======================================================
   6. MITKAEMPFEN (aus 50 bzw. 55)
====================================================== */
create or replace function app.schlacht_ich(p_uid text, out s public.sternenschlacht, out e public.sternenschlacht_einheiten, out grund text)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then grund := 'gesperrt'; return; end if;
  select * into s from public.sternenschlacht where status = 'laeuft';
  if not found then grund := 'keine-schlacht'; return; end if;
  if s.ende_at is not null and now() >= s.ende_at then
    perform app.schlacht_abschliessen(s.id);
    grund := 'vorbei'; return;
  end if;
  select * into e from public.sternenschlacht_einheiten where schlacht_id = s.id and firebase_uid = p_uid for update;
  if not found then
    if s.mit_wahl then
      /* PARTEI: Wahl je Schlacht. */
      if exists (select 1 from public.schlacht_wahl where schlacht_id = s.id and firebase_uid = p_uid) then
        grund := case when s.aufgestellt then 'naechste-runde' else 'sammeln' end;
      else
        grund := 'keine-wahl';
      end if;
    elsif s.endlos and exists (select 1 from public.players where firebase_uid = p_uid and seite in ('menschen', 'aliens')) then
      /* Seite gewaehlt, aber erst nach dem Aufstellen: ab der naechsten Runde. */
      grund := 'naechste-runde';
    else
      grund := 'nicht-dabei';
    end if;
    return;
  end if;
end
$$;

create or replace function app.schlacht_spezial(p_ziel_uid text default null) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  ich     record;
  o       public.schlacht_orte;
  ty      public.schlacht_typen;
  r0      timestamptz;
  eigene  text;
  gegner  text;
  st      numeric;
  wirkung text;
  betr    text;
  wert    numeric := 0;
  faktor  numeric := 1;
  sekunden integer := 0;
  warten  integer;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  o := app.schlacht_ort((ich.s).id);
  r0 := coalesce((ich.s).runde_at, (ich.s).start_at);
  if (ich.e).spezial_at is not null and (ich.e).spezial_at >= r0 then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  eigene := (ich.e).seite;
  gegner := case eigene when 'menschen' then 'aliens' else 'menschen' end;
  /* PARTEI: Ladezeit je Partei (Menschen 60 s, Aliens 30 s wie bisher). */
  warten := round(coalesce((select laden_sek from public.schlacht_parteien
                             where partei = coalesce((ich.e).partei, eigene)),
                           case eigene when 'menschen' then 60 else 30 end) * o.laden);
  if now() < r0 + make_interval(secs => warten) then
    return jsonb_build_object('ok', false, 'grund', 'laedt',
      'ab', r0 + make_interval(secs => warten));
  end if;
  st := (ich.e).spezial;

  /* PARTEI: Wirkung aus schlacht_typen statt Fallunterscheidung. */
  select * into ty from public.schlacht_typen where typ = (ich.e).typ;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  wirkung := ty.spezial_wirkung;
  betr := case ty.spezial_betrifft when 'eigene' then eigene else gegner end;
  if wirkung in ('schaden', 'heilung') then
    wert := ty.spezial_wert * st;
  elsif betr = eigene then
    faktor := greatest(0.1, 1 - ty.spezial_je * st);
    sekunden := ty.spezial_sek;
  else
    faktor := 1 + ty.spezial_je * st;
    sekunden := ty.spezial_sek;
  end if;

  if wirkung = 'schaden' then
    wert := round(wert * o.spezial * app.schlacht_fenster_jetzt((ich.s).id, betr), 1);
  elsif wirkung = 'heilung' then
    wert := round(wert * o.heilung, 1);
  elsif betr = eigene then
    sekunden := round(sekunden * o.schild);
  end if;

  insert into public.sternenschlacht_aktionen
         (schlacht_id, firebase_uid, seite, art, typ, ziel_uid, wirkung, betroffen, wert, faktor, bis)
  values ((ich.s).id, uid, eigene, 'spezial', (ich.e).typ, p_ziel_uid, wirkung, betr, wert, faktor,
          case when sekunden > 0 then now() + make_interval(secs => sekunden) end);
  update public.sternenschlacht_einheiten
     set spezial_at = now(),
         schaden_gesamt = schaden_gesamt + case when wirkung = 'schaden' then wert else 0 end
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'wirkung', wirkung, 'wert', wert, 'faktor', faktor, 'sekunden', sekunden);
end
$$;

/* Zielschuss (aus 55): "wendig" kommt jetzt aus schlacht_typen. */
create or replace function app.schlacht_ziel(p_ziel_uid text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  ich  record;
  z    public.sternenschlacht_einheiten;
  o    public.schlacht_orte;
  n    integer;
  wert numeric;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  if (ich.e).ziel_at is not null and (ich.e).ziel_at > now() - interval '5 seconds' then
    return jsonb_build_object('ok', false, 'grund', 'zu-schnell');
  end if;
  select * into z from public.sternenschlacht_einheiten
   where schlacht_id = (ich.s).id and firebase_uid = p_ziel_uid;
  if not found or z.seite = (ich.e).seite then
    return jsonb_build_object('ok', false, 'grund', 'falsches-ziel');
  end if;
  o := app.schlacht_ort((ich.s).id);

  /* Fokusfeuer: andere Spieler auf demselben Ziel in den letzten 5 s. */
  select count(distinct firebase_uid) into n from public.sternenschlacht_aktionen
   where schlacht_id = (ich.s).id and art = 'ziel' and ziel_uid = p_ziel_uid
     and firebase_uid <> uid and at > now() - interval '5 seconds';
  wert := round((ich.e).schaden * 10 * (1 + least(0.5, 0.1 * n))
                * app.schlacht_fenster_jetzt((ich.s).id, z.seite)
                * o.ziel * case when coalesce((select t.wendig from public.schlacht_typen t where t.typ = (ich.e).typ), false)
                                then o.wendig else 1 end, 1);   -- PARTEI: wendig aus schlacht_typen

  insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert)
       values ((ich.s).id, uid, (ich.e).seite, 'ziel', p_ziel_uid, 'schaden', z.seite, wert);
  update public.sternenschlacht_einheiten
     set ziel_at = now(), schaden_gesamt = schaden_gesamt + wert
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'wert', wert, 'fokus', n);
end
$$;

/* PARTEI: Partei und Schiffstyp fuer die laufende Schlacht waehlen. */
create or replace function app.schlacht_partei_waehlen(p_partei text, p_typ text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  s    public.sternenschlacht;
  alt  text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  select * into s from public.sternenschlacht where status = 'laeuft';
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'keine-schlacht');
  end if;
  if not s.mit_wahl then
    return jsonb_build_object('ok', false, 'grund', 'keine-wahl');
  end if;
  if p_partei is null or p_partei not in (s.partei_links, s.partei_rechts) then
    return jsonb_build_object('ok', false, 'grund', 'falsche-partei');
  end if;
  if not exists (select 1 from public.schlacht_typen where typ = p_typ and partei = p_partei) then
    return jsonb_build_object('ok', false, 'grund', 'falscher-typ');
  end if;
  /* Wer schon gekaempft hat, bleibt bei seiner Partei. */
  select partei into alt from public.sternenschlacht_einheiten where schlacht_id = s.id and firebase_uid = uid;
  if alt is not null and alt <> p_partei then
    return jsonb_build_object('ok', false, 'grund', 'partei-fest', 'partei', alt);
  end if;

  insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
  insert into public.schlacht_wahl (schlacht_id, firebase_uid, partei, typ) values (s.id, uid, p_partei, p_typ)
  on conflict (schlacht_id, firebase_uid) do update set partei = excluded.partei, typ = excluded.typ, gewaehlt_am = now();
  return jsonb_build_object('ok', true, 'partei', p_partei, 'typ', p_typ,
                            'ab', case when s.aufgestellt then 'naechste-runde' else 'start' end);
end
$$;


/* ======================================================
   7. ADMIN: STARTEN MIT PARTEIEN (aus 56)
====================================================== */
drop function if exists public.admin_schlacht_starten(integer, text);
drop function if exists app.admin_schlacht_starten(integer, text);

create or replace function app.admin_schlacht_starten(p_minuten integer default 10, p_ort text default null,
  p_links text default null, p_rechts text default null, p_sammeln_sek integer default 90) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid     bigint;
  ort     text;
  links   text := coalesce(nullif(p_links, ''), 'menschen');
  rechts  text := coalesce(nullif(p_rechts, ''), 'aliens');
  tausch  text;
  wahl    boolean := app.schlacht_parteien_frei();
  beginn  timestamptz;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  /* PARTEI */
  if not wahl and (links <> 'menschen' or rechts <> 'aliens') then
    raise exception 'parteien-gesperrt';
  end if;
  if not exists (select 1 from public.schlacht_parteien where partei = links)
     or not exists (select 1 from public.schlacht_parteien where partei = rechts) then
    raise exception 'partei-unbekannt';
  end if;
  if links = rechts then
    raise exception 'parteien-gleich';
  end if;
  /* Menschen immer links, Aliens immer rechts (Regeneration, Formation). */
  if rechts = 'menschen' or links = 'aliens' then
    tausch := links; links := rechts; rechts := tausch;
  end if;

  if p_ort is not null and p_ort <> '' then
    select ort_id into ort from public.schlacht_orte where ort_id = p_ort;
    if not found then
      raise exception 'ort-unbekannt';
    end if;
  elsif app.schlacht_orte_frei() then
    select ort_id into ort from public.schlacht_orte order by random() limit 1;
  end if;
  /* Eine faellige alte Schlacht (aus 49, mit Ende) erst abschliessen. */
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at is not null and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  if wahl then
    beginn := now() + make_interval(secs => greatest(30, least(300, coalesce(p_sammeln_sek, 90))));
    insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                        dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens, ort,
                                        partei_links, partei_rechts, mit_wahl, aufgestellt, beginn_at, runde_at)
         values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0, ort,
                 links, rechts, true, false, beginn, beginn)
    returning id into sid;
    return sid;   -- aufgestellt wird am Ende der Sammelphase
  end if;

  insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                      dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens, ort)
       values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0, ort)
  returning id into sid;
  perform app.schlacht_aufstellen(sid);
  return sid;
end
$$;

create or replace function public.admin_schlacht_starten(p_minuten integer default 10, p_ort text default null,
  p_links text default null, p_rechts text default null, p_sammeln_sek integer default 90) returns bigint
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_schlacht_starten(p_minuten, p_ort, p_links, p_rechts, p_sammeln_sek) $$;

create or replace function public.schlacht_partei_waehlen(p_partei text, p_typ text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_partei_waehlen(p_partei, p_typ) $$;


/* ======================================================
   8. RECHTE
   Neu gefasste Funktionen behalten ihre Rechte aus 49/50/55.
   "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28).
====================================================== */
revoke execute on function app.partei_grundtyp(text)                                          from public, anon, authenticated;
revoke execute on function app.schlacht_parteien_frei()                                       from public, anon, authenticated;
revoke execute on function app.schlacht_sammeln_beenden(bigint)                               from public, anon, authenticated;
revoke execute on function app.schlacht_werte(text, text, integer, integer, integer)          from public, anon, authenticated;
revoke execute on function app.admin_schlacht_starten(integer, text, text, text, integer)     from public, anon;
revoke execute on function public.admin_schlacht_starten(integer, text, text, text, integer)  from public, anon;
revoke execute on function app.schlacht_partei_waehlen(text, text)                            from public, anon;
revoke execute on function public.schlacht_partei_waehlen(text, text)                         from public, anon;
grant  execute on function app.admin_schlacht_starten(integer, text, text, text, integer)     to authenticated;
grant  execute on function public.admin_schlacht_starten(integer, text, text, text, integer)  to authenticated;
grant  execute on function app.schlacht_partei_waehlen(text, text)                            to authenticated;
grant  execute on function public.schlacht_partei_waehlen(text, text)                         to authenticated;
