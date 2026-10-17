/* ======================================================
   STERNENSCHLACHT: BEWEGEN, HUELLE, AUSRUESTUNG, BOSS
   ---------------------------------------------------
   Drei Freigaben (Live-Event -> Freigaben). Was beim Start einer
   Schlacht freigegeben ist, gilt fuer die ganze Schlacht - ein
   Trigger haelt es in mit_ausruestung / mit_bewegung fest.

   1. AUSRUESTUNG IN DER SCHLACHT ("hangarAusruestung", 58)
      Beim Aufstellen werden Sonderwaffe, Module und Rang jeder
      Einheit festgehalten. Rang: je Stufe +2 % Leben und Schaden.
      Verbundpanzer: Leben +15 %. Die Waffen wirken auf den Zielschuss
      (Plasma +15 %, Raketen +10 % und Fokus bis +80 %, Tesla springt
      mit 50 % auf ein zweites Ziel, Lichtlanze +35 % bei 8 s
      Ladezeit), der Zielcomputer verkuerzt sie um 1 s, der Reaktor
      die Spezial-Ladezeit um 25 %, der Deflektorschild senkt
      erhaltenen Zielschuss um 20 %.
      Am Ende einer solchen Schlacht gibt es Erfahrung (schiff_rang):
      30 + Schaden/50 (hoechstens 300) + 40 fuer die Siegerseite.

   2. BEWEGEN UND HUELLE ("schlachtBewegung")
      Jeder Spieler steuert sein Schiff in der eigenen Haelfte
      (schlacht_bewegen; pos_x 0 = hinten .. 1 = vorn, pos_y quer).
      Hoechstens 0,5 Felder je Sekunde, mit Nachbrenner 0,75.
        - Front: Zielschuesse von vorn treffen bis +15 %, nach vorn
          gerichtete Schiffe nehmen auch bis +15 % mehr (hinten -15 %).
        - Ausweichen: wer sich in den letzten 3 s bewegt hat, nimmt
          25 % weniger Zielschuss (Nachbrenner: 40 %).
      Jedes Schiff hat eine eigene HUELLE: das Vierfache seines Lebens
      mal dem Anteil, den seine Seite noch hat, minus den
      Zielschuessen, die es selbst abbekommen hat (eine Drohne haelt
      so etwa drei, ein Kreuzer etwa sieben Treffer aus). Bei 0 ist es
      ZERSTOERT: kein Zielschuss, kein
      Spezial, kein Bewegen - nach 45 s Notsprung mit voller Huelle,
      spaetestens zur naechsten Runde.

   3. BOSS-MUTTERSCHIFF ("schlachtBoss")
      admin_boss_starten: alle Spieler gegen ein Mutterschiff. Erst
      sammeln sich die Spieler (Wahl je Schlacht, jede freigegebene
      Partei), dann greift die Allianz (Slot links) das Mutterschiff
      (Slot rechts, 'ki-boss') an. Sein Leben bleibt ueber die Runden
      erhalten: Faellt die Allianz, beginnt eine neue Runde gegen den
      angeschlagenen Boss. Faellt der Boss, ist die Schlacht gewonnen.
        Leben  = Staerke (1..10, Standard 3) x Allianz-Dauerfeuer x Tempo
        Phase 1 (> 66 %)  Salve alle 30 s: 2 % der Allianz
        Phase 2 (> 33 %)  Salve alle 25 s: 2,5 %, Schild, Feuer x1,25
        Phase 3           Salve alle 20 s: 3 %,   Schild, Feuer x1,6
        Schild: in jedem 40-s-Takt die letzten 12 s - der Boss nimmt
        dann nur 40 % Schaden. Die Phase gilt je Runde.

   Neue Fassungen ("NEU 59" markiert die Aenderungen):
   schlacht_aufstellen (57), schlacht_leben (57), schlacht_runde_pruefen
   (57), schlacht_stand (57), schlacht_ich (57), schlacht_ziel (57),
   schlacht_spezial (57), schlacht_partei_waehlen (57),
   schlacht_abschliessen (50).

   REIHENFOLGE: nach 58 einspielen. Von Hand, im SQL-Editor.
   Idempotent.
====================================================== */


/* ======================================================
   1. SPALTEN, PARTEIEN, FREIGABEN
====================================================== */
alter table public.sternenschlacht add column if not exists mit_ausruestung boolean not null default false;
alter table public.sternenschlacht add column if not exists mit_bewegung    boolean not null default false;
alter table public.sternenschlacht add column if not exists modus           text not null default 'normal';
alter table public.sternenschlacht add column if not exists boss_max        numeric;
alter table public.sternenschlacht add column if not exists boss_rest       numeric;
alter table public.sternenschlacht add column if not exists boss_phase      integer not null default 0;
alter table public.sternenschlacht add column if not exists boss_staerke    numeric;
alter table public.sternenschlacht drop constraint if exists sternenschlacht_modus;
alter table public.sternenschlacht add constraint sternenschlacht_modus check (modus in ('normal', 'boss'));

alter table public.sternenschlacht_einheiten add column if not exists pos_x        numeric;
alter table public.sternenschlacht_einheiten add column if not exists pos_y        numeric;
alter table public.sternenschlacht_einheiten add column if not exists bewegt_at    timestamptz;
alter table public.sternenschlacht_einheiten add column if not exists treffer      numeric not null default 0;
alter table public.sternenschlacht_einheiten add column if not exists zerstoert_at timestamptz;
alter table public.sternenschlacht_einheiten add column if not exists waffe        text;
alter table public.sternenschlacht_einheiten add column if not exists modul1       text;
alter table public.sternenschlacht_einheiten add column if not exists modul2       text;
alter table public.sternenschlacht_einheiten add column if not exists rang         integer not null default 0;

/* Allianz (alle Spieler gegen den Boss) und das Mutterschiff. */
insert into public.schlacht_parteien (partei, leben_mod, schaden_mod, laden_sek, ordnung) values
  ('allianz', 1, 1, 45, 7),
  ('boss',    1, 1, 60, 8)
on conflict (partei) do nothing;
insert into public.schlacht_typen
  (typ, partei, ordnung, leben, schaden, anzahl, spezial_wirkung, spezial_betrifft, spezial_wert, spezial_je, spezial_sek) values
  ('mutterschiff', 'boss', 1, 1000, 0, 1, 'schaden', 'gegner', 0, 0, 0)
on conflict (typ) do nothing;

create or replace function app.schlacht_bewegung_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'schlachtBewegung' = 'true'
                     from public.site_config where id = 'main'), false)
$$;
create or replace function app.schlacht_boss_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'schlachtBoss' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

/* Die Freigaben beim Start festhalten - fuer jeden Start, ohne
   admin_schlacht_starten (57) neu zu fassen. */
create or replace function app.schlacht_regeln_festhalten() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  new.mit_ausruestung := app.hangar_ausruestung_frei();
  new.mit_bewegung := app.schlacht_bewegung_frei();
  return new;
end
$$;
drop trigger if exists schlacht_regeln_festhalten on public.sternenschlacht;
create trigger schlacht_regeln_festhalten
  before insert on public.sternenschlacht
  for each row execute function app.schlacht_regeln_festhalten();


/* ======================================================
   2. HILFEN
====================================================== */
/* Ausruestung und Rang einer Einheit beim Aufstellen. */
create or replace function app.schlacht_ausruestung(p_uid text, p_an boolean,
  out waffe text, out modul1 text, out modul2 text, out rang integer, out f_leben numeric, out f_schaden numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  rang := 0; f_leben := 1; f_schaden := 1;
  if not p_an then return; end if;
  select h.waffe, h.modul1, h.modul2 into waffe, modul1, modul2 from public.hangar_einheiten h where h.firebase_uid = p_uid;
  rang := app.rang_stufe((select xp from public.schiff_rang r where r.firebase_uid = p_uid));
  f_leben := (1 + 0.02 * rang) * case when 'panzer' in (modul1, modul2) then 1.15 else 1 end;
  f_schaden := 1 + 0.02 * rang;
end
$$;

/* Boss-Phase je Runde und ihre Regeln. */
create or replace function app.boss_phase(p_rest numeric, p_max numeric) returns integer
language sql immutable
as $$ select case when coalesce(p_max, 0) <= 0 or p_rest / p_max > 0.66 then 1 when p_rest / p_max > 0.33 then 2 else 3 end $$;

/* Sekunden mit Boss-Schild bis sek (je 40 s die letzten 12 s), ab Phase 2. */
create or replace function app.boss_schild_sek(p_phase integer, p_sek numeric) returns numeric
language sql immutable
as $$
  select case when coalesce(p_phase, 0) < 2 then 0
              else floor(p_sek / 40) * 12 + greatest(0, p_sek - floor(p_sek / 40) * 40 - 28) end
$$;

/* Huelle einer Einheit jetzt: 4 x Leben x Anteil der Seite - eigene Treffer. */
create or replace function app.schlacht_huelle(p_id bigint, p_uid text) returns numeric
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s public.sternenschlacht;
  e public.sternenschlacht_einheiten;
  l0 numeric;
begin
  select * into s from public.sternenschlacht where id = p_id;
  select * into e from public.sternenschlacht_einheiten where schlacht_id = p_id and firebase_uid = p_uid;
  if not found then return 0; end if;
  l0 := case e.seite when 'menschen' then s.leben0_menschen else s.leben0_aliens end;
  return 4 * e.leben * case when l0 > 0 then app.schlacht_leben(p_id, e.seite, now()) / l0 else 0 end - e.treffer;
end
$$;

/* Zerstoert (noch im Notsprung)? */
create or replace function app.schlacht_zerstoert(p_e public.sternenschlacht_einheiten) returns boolean
language sql stable
as $$ select p_e.zerstoert_at is not null and now() < p_e.zerstoert_at + interval '45 seconds' $$;


/* ======================================================
   3. AUFSTELLEN (aus 57)
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
  bmax  numeric; brest numeric; bphase integer; bdps numeric;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found then
    raise exception 'unbekannt';
  end if;

  if s.mit_wahl then
    delete from public.sternenschlacht_einheiten u
     where u.schlacht_id = p_id
       and (u.firebase_uid like 'ki-%'
            or not exists (select 1 from public.schlacht_wahl w
                            where w.schlacht_id = p_id and w.firebase_uid = u.firebase_uid
                              and not private.account_is_suspended(w.firebase_uid)));

    /* NEU 59: Ausruestung und Rang; im Boss-Modus alle links. */
    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial,
                                                  waffe, modul1, modul2, rang, treffer, zerstoert_at)
    select p_id, w.firebase_uid, p.nickname,
           case when s.modus = 'boss' or w.partei = s.partei_links then 'menschen' else 'aliens' end,
           w.partei, w.typ, round(x.leben * a.f_leben), round(x.schaden * a.f_schaden * 10) / 10.0, x.spezial,
           a.waffe, a.modul1, a.modul2, a.rang, 0, null
      from public.schlacht_wahl w
      join public.players p on p.firebase_uid = w.firebase_uid
      left join public.hangar_einheiten h on h.firebase_uid = w.firebase_uid
      cross join lateral app.schlacht_werte(w.typ, w.partei, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) x
      cross join lateral app.schlacht_ausruestung(w.firebase_uid, s.mit_ausruestung) a
     where w.schlacht_id = p_id
       and (s.modus = 'boss' or w.partei in (s.partei_links, s.partei_rechts))
       and not private.account_is_suspended(w.firebase_uid)
    on conflict (schlacht_id, firebase_uid) do update
       set nickname = excluded.nickname, seite = excluded.seite, partei = excluded.partei, typ = excluded.typ,
           leben = excluded.leben, schaden = excluded.schaden, spezial = excluded.spezial,
           waffe = excluded.waffe, modul1 = excluded.modul1, modul2 = excluded.modul2, rang = excluded.rang,
           treffer = 0, zerstoert_at = null;
  else
    delete from public.sternenschlacht_einheiten u
     where u.schlacht_id = p_id
       and (u.firebase_uid like 'ki-%'
            or not exists (select 1 from public.players p
                            where p.firebase_uid = u.firebase_uid and p.seite in ('menschen', 'aliens')
                              and not private.account_is_suspended(p.firebase_uid)));

    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial,
                                                  waffe, modul1, modul2, rang, treffer, zerstoert_at)
    select p_id, p.firebase_uid, p.nickname, p.seite, p.seite, x.typ,
           round(w.leben * a.f_leben), round(w.schaden * a.f_schaden * 10) / 10.0, w.spezial,
           a.waffe, a.modul1, a.modul2, a.rang, 0, null
      from public.players p
      left join public.hangar_einheiten h on h.firebase_uid = p.firebase_uid
      cross join lateral (select case when h.typ is not null and app.hangar_typ_passt(p.seite, h.typ) then h.typ
                                      when p.seite = 'aliens' then 'drohne' else 'jaeger' end as typ) x
      cross join lateral app.schlacht_werte(x.typ, p.seite, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) w
      cross join lateral app.schlacht_ausruestung(p.firebase_uid, s.mit_ausruestung) a
     where p.seite in ('menschen', 'aliens')
       and not private.account_is_suspended(p.firebase_uid)
    on conflict (schlacht_id, firebase_uid) do update
       set nickname = excluded.nickname, seite = excluded.seite, partei = excluded.partei, typ = excluded.typ,
           leben = excluded.leben, schaden = excluded.schaden, spezial = excluded.spezial,
           waffe = excluded.waffe, modul1 = excluded.modul1, modul2 = excluded.modul2, rang = excluded.rang,
           treffer = 0, zerstoert_at = null;
  end if;

  /* NEU 59: BOSS - links die Allianz (sonst eine Uebungsflotte),
     rechts das Mutterschiff mit dem Leben, das ihm geblieben ist. */
  if s.modus = 'boss' then
    if not exists (select 1 from public.sternenschlacht_einheiten where schlacht_id = p_id and seite = 'menschen') then
      insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
      select p_id, 'ki-menschen-' || i, 'Übungsflotte', 'menschen', 'menschen', 'jaeger', x.leben, x.schaden, x.spezial
        from generate_series(1, 6) as i
        cross join lateral app.schlacht_werte('jaeger', 'menschen', 1, 1, 0) x;
    end if;
    select coalesce(sum(leben), 0), coalesce(sum(schaden), 0), count(*) into lm, dm, nm
      from public.sternenschlacht_einheiten where schlacht_id = p_id and seite = 'menschen';
    bmax := coalesce(s.boss_max, greatest(2000, round(coalesce(s.boss_staerke, 3) * dm * coalesce(s.tempo_sek, 600))));
    brest := greatest(1, coalesce(s.boss_rest, bmax));
    bphase := app.boss_phase(brest, bmax);
    bdps := round(lm / coalesce(s.tempo_sek, 600) * case bphase when 1 then 1 when 2 then 1.25 else 1.6 end, 2);
    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
    values (p_id, 'ki-boss', 'Mutterschiff', 'aliens', 'boss', 'mutterschiff', brest, bdps, 1);
    update public.sternenschlacht
       set skala = 1, leben0_menschen = lm, leben0_aliens = brest, dps_menschen = dm, dps_aliens = bdps,
           formation_menschen = 1, anzahl_menschen = nm, anzahl_aliens = 1,
           boss_max = bmax, boss_rest = brest, boss_phase = bphase,
           runde_at = now(), aufgestellt = true
     where id = p_id;
    return;
  end if;

  select count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into nm, na
    from public.sternenschlacht_einheiten where schlacht_id = p_id;

  if nm = 0 and na = 0 then
    if not s.mit_wahl then
      raise exception 'zu-wenige-kaempfer';
    end if;
    foreach slot in array array['menschen', 'aliens'] loop
      partei := case slot when 'menschen' then s.partei_links else s.partei_rechts end;
      insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, partei, typ, leben, schaden, spezial)
      select p_id, 'ki-' || slot || '-' || i, 'Übungsflotte', slot, partei, app.partei_grundtyp(partei), x.leben, x.schaden, x.spezial
        from generate_series(1, 6) as i
        cross join lateral app.schlacht_werte(app.partei_grundtyp(partei), partei, 1, 1, 0) x;
    end loop;
  elsif nm = 0 or na = 0 then
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

  form := case when s.partei_links = 'menschen' then 1 + least(0.2, 0.02 * nm) else 1 end;
  update public.sternenschlacht
     set skala = (lm + la) / ((dm * form + da) * coalesce(s.tempo_sek, 600) * 1.15),
         leben0_menschen = lm, leben0_aliens = la, dps_menschen = dm, dps_aliens = da,
         formation_menschen = form, anzahl_menschen = nm, anzahl_aliens = na,
         runde_at = now(), aufgestellt = true
   where id = p_id;
end
$$;


/* ======================================================
   4. LEBEN JE SEITE (aus 57)
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
  boss     numeric := 0;
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

  /* NEU 59: Boss - Salven auf die Allianz, Schild gegen ihr Dauerfeuer. */
  if s.modus = 'boss' and s.aufgestellt then
    if p_seite = 'menschen' then
      boss := floor(sek / case s.boss_phase when 3 then 20 when 2 then 25 else 30 end)
              * case s.boss_phase when 3 then 0.03 when 2 then 0.025 else 0.02 end * leben0;
    else
      boss := -feuer * 0.6 * app.boss_schild_sek(s.boss_phase, sek);
    end if;
  end if;

  return greatest(0, least(leben0, leben0 - feuer * fenster - direkt + heil + regen
                                    - treffer * o.ereignis_anteil * leben0 - boss));
end
$$;


/* ======================================================
   5. RUNDE, ENDE, STAND (aus 57 bzw. 50)
====================================================== */
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
  if not found or s.status <> 'laeuft' or not s.endlos or not s.aufgestellt then return; end if;
  if app.schlacht_leben(p_id, 'menschen', now()) > 0 and app.schlacht_leben(p_id, 'aliens', now()) > 0 then
    return;
  end if;

  select * into s from public.sternenschlacht where id = p_id for update;
  if s.status <> 'laeuft' then return; end if;
  lm := app.schlacht_leben(p_id, 'menschen', now());
  la := app.schlacht_leben(p_id, 'aliens', now());
  if lm > 0 and la > 0 then return; end if;

  gewinner := case when lm <= 0 and la <= 0 then 'unentschieden' when la <= 0 then 'menschen' else 'aliens' end;
  /* NEU 59: Boss besiegt - Schlacht gewonnen. Faellt die Allianz,
     behaelt der Boss sein Leben fuer die naechste Runde. */
  if s.modus = 'boss' and la <= 0 then gewinner := 'menschen'; end if;
  update public.sternenschlacht
     set punkte_menschen = punkte_menschen + case when gewinner = 'menschen' then 1 else 0 end,
         punkte_aliens   = punkte_aliens   + case when gewinner = 'aliens'   then 1 else 0 end,
         runden = runden || jsonb_build_array(jsonb_build_object('nr', runde, 'sieger', gewinner, 'at', now())),
         runde = runde + 1,
         boss_rest = case when modus = 'boss' then greatest(0, la) else boss_rest end
   where id = p_id;
  if s.modus = 'boss' and la <= 0 then
    perform app.schlacht_abschliessen(p_id);
    return;
  end if;

  begin
    perform app.schlacht_aufstellen(p_id);
  exception when others then
    perform app.schlacht_abschliessen(p_id);
  end;
end
$$;

create or replace function app.schlacht_abschliessen(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s    public.sternenschlacht;
  ende timestamptz;
  lm   numeric; la numeric; rm numeric; ra numeric;
  gewinner text;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found or s.status <> 'laeuft' then return; end if;
  ende := least(now(), coalesce(s.ende_at, 'infinity'::timestamptz));
  lm := app.schlacht_leben(p_id, 'menschen', ende);
  la := app.schlacht_leben(p_id, 'aliens', ende);
  rm := case when s.leben0_menschen > 0 then lm / s.leben0_menschen else 0 end;
  ra := case when s.leben0_aliens > 0 then la / s.leben0_aliens else 0 end;

  gewinner := case
    when s.endlos and s.punkte_menschen > s.punkte_aliens then 'menschen'
    when s.endlos and s.punkte_aliens > s.punkte_menschen then 'aliens'
    when rm > ra then 'menschen' when ra > rm then 'aliens' else 'unentschieden' end;
  /* NEU 59: Boss - gewonnen nur, wenn das Mutterschiff gefallen ist.
     Endstand = wie viel Prozent des Bosses zerstoert sind. */
  if s.modus = 'boss' then
    gewinner := case when coalesce(s.boss_rest, 1) <= 0 or (s.aufgestellt and la <= 0) then 'menschen' else 'aliens' end;
  end if;

  update public.sternenschlacht
     set status = 'vorbei',
         ende_at = ende,
         sieger = gewinner,
         boss_rest = case when modus = 'boss' and aufgestellt then greatest(0, least(coalesce(boss_rest, la), la)) else boss_rest end,
         endstand_menschen = case
           when modus = 'boss' then case when gewinner = 'menschen' then 100
                                         when coalesce(boss_max, 0) > 0 then round(100 * (1 - (case when aufgestellt then la else boss_max end) / boss_max), 1)
                                         else 0 end
           when rm + ra > 0 then round(100 * rm / (rm + ra), 1) else 50 end,
         ruhm = jsonb_build_object(
           'menschen', (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'menschen' and schaden_gesamt > 0
                                   and firebase_uid not like 'ki-%'
                                 order by schaden_gesamt desc limit case when modus = 'boss' then 3 else 2 end) x),
           'aliens',   (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'aliens' and schaden_gesamt > 0
                                   and firebase_uid not like 'ki-%'
                                 order by schaden_gesamt desc limit 2) x))
   where id = p_id;

  /* NEU 59: Erfahrung fuer den Schiffs-Rang (58). */
  if s.mit_ausruestung then
    insert into public.schiff_rang (firebase_uid, xp, schlachten, siege)
    select e.firebase_uid,
           30 + least(300, floor(e.schaden_gesamt / 50))::int + case when e.seite = gewinner then 40 else 0 end,
           1, case when e.seite = gewinner then 1 else 0 end
      from public.sternenschlacht_einheiten e
     where e.schlacht_id = p_id and e.firebase_uid not like 'ki-%'
    on conflict (firebase_uid) do update
       set xp = public.schiff_rang.xp + excluded.xp,
           schlachten = public.schiff_rang.schlachten + 1,
           siege = public.schiff_rang.siege + excluded.siege,
           updated_at = now();
  end if;
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
  sek numeric;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
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
  sek := extract(epoch from (t - coalesce(s.runde_at, s.start_at)));
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
    'partei_links', s.partei_links, 'partei_rechts', s.partei_rechts, 'mit_wahl', s.mit_wahl,
    'phase', case when s.aufgestellt then 'kampf' else 'sammeln' end, 'beginn_at', s.beginn_at,
    'wahl', case when s.mit_wahl then jsonb_build_object(
              'links',  (select count(*) from public.schlacht_wahl w where w.schlacht_id = s.id
                           and (s.modus = 'boss' or w.partei = s.partei_links)),
              'rechts', (select count(*) from public.schlacht_wahl w where w.schlacht_id = s.id
                           and s.modus <> 'boss' and w.partei = s.partei_rechts)) end,
    'meine_wahl', case when uid is not null then (select jsonb_build_object('partei', w.partei, 'typ', w.typ)
                                                    from public.schlacht_wahl w where w.schlacht_id = s.id and w.firebase_uid = uid) end,
    /* NEU 59 */
    'modus', s.modus, 'mit_bewegung', s.mit_bewegung, 'mit_ausruestung', s.mit_ausruestung,
    'boss', case when s.modus = 'boss' then jsonb_build_object(
              'max', s.boss_max, 'phase', s.boss_phase, 'staerke', s.boss_staerke,
              'leben', case when s.aufgestellt and s.status = 'laeuft' then round(la) else round(coalesce(s.boss_rest, s.boss_max)) end,
              'schild', s.aufgestellt and s.boss_phase >= 2 and sek - floor(sek / 40) * 40 >= 28) end);
end
$$;


/* ======================================================
   6. MITKAEMPFEN (aus 57)
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
      if exists (select 1 from public.schlacht_wahl where schlacht_id = s.id and firebase_uid = p_uid) then
        grund := case when s.aufgestellt then 'naechste-runde' else 'sammeln' end;
      else
        grund := 'keine-wahl';
      end if;
    elsif s.endlos and exists (select 1 from public.players where firebase_uid = p_uid and seite in ('menschen', 'aliens')) then
      grund := 'naechste-runde';
    else
      grund := 'nicht-dabei';
    end if;
    return;
  end if;
  /* NEU 59: zerstoert - nach 45 s Notsprung mit voller Huelle. */
  if e.zerstoert_at is not null then
    if app.schlacht_zerstoert(e) then
      grund := 'zerstoert'; return;
    end if;
    update public.sternenschlacht_einheiten set treffer = 0, zerstoert_at = null
     where schlacht_id = s.id and firebase_uid = p_uid
    returning * into e;
  end if;
end
$$;

create or replace function app.schlacht_ziel(p_ziel_uid text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  ich  record;
  z    public.sternenschlacht_einheiten;
  z2   public.sternenschlacht_einheiten;
  o    public.schlacht_orte;
  tl   public.hangar_teile;
  n    integer;
  wert numeric;
  wert2 numeric;
  takt numeric := 5;
  fokus numeric := 0.5;
  sek  numeric;
  zerstoert boolean := false;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  /* NEU 59: Sonderwaffe und Zielcomputer (58). */
  if (ich.s).mit_ausruestung then
    select * into tl from public.hangar_teile where teil = (ich.e).waffe;
    if (ich.e).waffe = 'lanze' then takt := tl.wert2; end if;
    if (ich.e).waffe = 'raketen' then fokus := tl.wert2; end if;
    if 'zielcomputer' in ((ich.e).modul1, (ich.e).modul2) then takt := takt - 1; end if;
  end if;
  if (ich.e).ziel_at is not null and (ich.e).ziel_at > now() - make_interval(secs => takt) then
    return jsonb_build_object('ok', false, 'grund', 'zu-schnell');
  end if;
  select * into z from public.sternenschlacht_einheiten
   where schlacht_id = (ich.s).id and firebase_uid = p_ziel_uid;
  if not found or z.seite = (ich.e).seite or ((ich.s).mit_bewegung and app.schlacht_zerstoert(z)) then
    return jsonb_build_object('ok', false, 'grund', 'falsches-ziel');
  end if;
  o := app.schlacht_ort((ich.s).id);

  select count(distinct firebase_uid) into n from public.sternenschlacht_aktionen
   where schlacht_id = (ich.s).id and art = 'ziel' and ziel_uid = p_ziel_uid
     and firebase_uid <> uid and at > now() - interval '5 seconds';
  wert := (ich.e).schaden * 10 * (1 + least(fokus, 0.1 * n))
          * app.schlacht_fenster_jetzt((ich.s).id, z.seite)
          * o.ziel * case when coalesce((select t.wendig from public.schlacht_typen t where t.typ = (ich.e).typ), false)
                          then o.wendig else 1 end;
  /* NEU 59 */
  if (ich.s).mit_ausruestung then
    if (ich.e).waffe in ('plasma', 'raketen', 'lanze') then wert := wert * (1 + tl.wert); end if;
    if 'schild' in (z.modul1, z.modul2) then wert := wert * 0.8; end if;
  end if;
  if (ich.s).mit_bewegung then
    wert := wert * (0.85 + 0.3 * coalesce((ich.e).pos_x, 0.5)) * (0.85 + 0.3 * coalesce(z.pos_x, 0.5));
    if z.bewegt_at is not null and z.bewegt_at > now() - interval '3 seconds' then
      wert := wert * case when 'nachbrenner' in (z.modul1, z.modul2) then 0.6 else 0.75 end;
    end if;
  end if;
  if (ich.s).modus = 'boss' and z.firebase_uid = 'ki-boss' then
    sek := extract(epoch from (now() - coalesce((ich.s).runde_at, (ich.s).start_at)));
    if (ich.s).boss_phase >= 2 and sek - floor(sek / 40) * 40 >= 28 then wert := wert * 0.4; end if;
  end if;
  wert := round(wert, 1);

  insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert)
       values ((ich.s).id, uid, (ich.e).seite, 'ziel', p_ziel_uid, 'schaden', z.seite, wert);
  update public.sternenschlacht_einheiten
     set ziel_at = now(), schaden_gesamt = schaden_gesamt + wert
   where schlacht_id = (ich.s).id and firebase_uid = uid;

  /* NEU 59: Huelle des Ziels (der Boss ist seine ganze Seite). */
  if (ich.s).mit_bewegung and z.firebase_uid <> 'ki-boss' then
    update public.sternenschlacht_einheiten set treffer = treffer + wert
     where schlacht_id = (ich.s).id and firebase_uid = p_ziel_uid;
    if app.schlacht_huelle((ich.s).id, p_ziel_uid) <= 0 then
      update public.sternenschlacht_einheiten set zerstoert_at = now()
       where schlacht_id = (ich.s).id and firebase_uid = p_ziel_uid;
      zerstoert := true;
    end if;
  end if;

  /* NEU 59: Tesla - Uebersprung auf ein zweites Ziel. */
  if (ich.s).mit_ausruestung and (ich.e).waffe = 'tesla' then
    select * into z2 from public.sternenschlacht_einheiten u
     where u.schlacht_id = (ich.s).id and u.seite = z.seite and u.firebase_uid <> p_ziel_uid
       and not app.schlacht_zerstoert(u)
     order by random() limit 1;
    if found then
      wert2 := round(wert * tl.wert, 1);
      insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert)
           values ((ich.s).id, uid, (ich.e).seite, 'ziel', z2.firebase_uid, 'schaden', z.seite, wert2);
      update public.sternenschlacht_einheiten set schaden_gesamt = schaden_gesamt + wert2
       where schlacht_id = (ich.s).id and firebase_uid = uid;
      if (ich.s).mit_bewegung then
        update public.sternenschlacht_einheiten set treffer = treffer + wert2
         where schlacht_id = (ich.s).id and firebase_uid = z2.firebase_uid;
        if app.schlacht_huelle((ich.s).id, z2.firebase_uid) <= 0 then
          update public.sternenschlacht_einheiten set zerstoert_at = now()
           where schlacht_id = (ich.s).id and firebase_uid = z2.firebase_uid and zerstoert_at is null;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'wert', wert, 'fokus', n, 'takt', takt, 'zerstoert', zerstoert,
                            'kette', z2.firebase_uid, 'kette_wert', wert2);
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
  sek     numeric;
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
  warten := round(coalesce((select laden_sek from public.schlacht_parteien
                             where partei = coalesce((ich.e).partei, eigene)),
                           case eigene when 'menschen' then 60 else 30 end) * o.laden
                  /* NEU 59: Ueberladereaktor */
                  * case when (ich.s).mit_ausruestung and 'reaktor' in ((ich.e).modul1, (ich.e).modul2) then 0.75 else 1 end);
  if now() < r0 + make_interval(secs => warten) then
    return jsonb_build_object('ok', false, 'grund', 'laedt',
      'ab', r0 + make_interval(secs => warten));
  end if;
  st := (ich.e).spezial;

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
    /* NEU 59: Boss-Schild */
    if (ich.s).modus = 'boss' and betr = 'aliens' then
      sek := extract(epoch from (now() - r0));
      if (ich.s).boss_phase >= 2 and sek - floor(sek / 40) * 40 >= 28 then wert := round(wert * 0.4, 1); end if;
    end if;
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

/* NEU 59: Bewegen in der eigenen Haelfte. */
create or replace function app.schlacht_bewegen(p_x numeric, p_y numeric) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  ich  record;
  x0 numeric; y0 numeric; x numeric; y numeric;
  d numeric; erlaubt numeric; tempo numeric := 0.5;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  if not (ich.s).mit_bewegung then
    return jsonb_build_object('ok', false, 'grund', 'keine-bewegung');
  end if;
  if p_x is null or p_y is null then
    return jsonb_build_object('ok', false, 'grund', 'falsche-position');
  end if;
  if (ich.e).bewegt_at is not null and (ich.e).bewegt_at > now() - interval '400 milliseconds' then
    return jsonb_build_object('ok', false, 'grund', 'zu-schnell');
  end if;
  if (ich.s).mit_ausruestung and 'nachbrenner' in ((ich.e).modul1, (ich.e).modul2) then tempo := 0.75; end if;
  x := greatest(0, least(1, p_x));
  y := greatest(0, least(1, p_y));
  x0 := coalesce((ich.e).pos_x, x);
  y0 := coalesce((ich.e).pos_y, y);
  /* Hoechstgeschwindigkeit: weiter Weg wird gekuerzt. */
  d := sqrt((x - x0) ^ 2 + (y - y0) ^ 2);
  erlaubt := 0.15 + tempo * least(10, coalesce(extract(epoch from (now() - (ich.e).bewegt_at)), 10));
  if d > erlaubt then
    x := x0 + (x - x0) * erlaubt / d;
    y := y0 + (y - y0) * erlaubt / d;
  end if;
  update public.sternenschlacht_einheiten
     set pos_x = round(x, 3), pos_y = round(y, 3), bewegt_at = now()
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'x', round(x, 3), 'y', round(y, 3));
end
$$;

/* Partei und Schiffstyp waehlen (aus 57) - im Boss-Modus jede
   freigegebene Partei. */
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
  /* NEU 59 */
  if s.modus = 'boss' then
    if p_partei is null or p_partei in ('allianz', 'boss')
       or (not app.schlacht_parteien_frei() and p_partei not in ('menschen', 'aliens'))
       or not exists (select 1 from public.schlacht_parteien where partei = p_partei) then
      return jsonb_build_object('ok', false, 'grund', 'falsche-partei');
    end if;
  elsif p_partei is null or p_partei not in (s.partei_links, s.partei_rechts) then
    return jsonb_build_object('ok', false, 'grund', 'falsche-partei');
  end if;
  if not exists (select 1 from public.schlacht_typen where typ = p_typ and partei = p_partei) then
    return jsonb_build_object('ok', false, 'grund', 'falscher-typ');
  end if;
  select partei into alt from public.sternenschlacht_einheiten where schlacht_id = s.id and firebase_uid = uid;
  /* Im Boss-Modus kaempfen alle auf einer Seite - Partei frei. */
  if s.modus <> 'boss' and alt is not null and alt <> p_partei then
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
   7. ADMIN: BOSS STARTEN
====================================================== */
create or replace function app.admin_boss_starten(p_minuten integer default 10, p_ort text default null,
  p_sammeln_sek integer default 90, p_staerke numeric default 3) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid     bigint;
  ort     text;
  beginn  timestamptz;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if not app.schlacht_boss_frei() then
    raise exception 'boss-gesperrt';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  if p_ort is not null and p_ort <> '' then
    select ort_id into ort from public.schlacht_orte where ort_id = p_ort;
    if not found then
      raise exception 'ort-unbekannt';
    end if;
  elsif app.schlacht_orte_frei() then
    select ort_id into ort from public.schlacht_orte order by random() limit 1;
  end if;
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at is not null and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  beginn := now() + make_interval(secs => greatest(30, least(300, coalesce(p_sammeln_sek, 90))));
  insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                      dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens, ort,
                                      partei_links, partei_rechts, mit_wahl, aufgestellt, beginn_at, runde_at,
                                      modus, boss_staerke)
       values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0, ort,
               'allianz', 'boss', true, false, beginn, beginn,
               'boss', greatest(1, least(10, coalesce(p_staerke, 3))))
  returning id into sid;
  return sid;
end
$$;


/* ======================================================
   8. WRAPPER UND RECHTE
   Neu gefasste Funktionen behalten ihre Rechte aus 49/50/55/57.
====================================================== */
create or replace function public.schlacht_bewegen(p_x numeric, p_y numeric) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_bewegen(p_x, p_y) $$;
create or replace function public.admin_boss_starten(p_minuten integer default 10, p_ort text default null,
  p_sammeln_sek integer default 90, p_staerke numeric default 3) returns bigint
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_boss_starten(p_minuten, p_ort, p_sammeln_sek, p_staerke) $$;

revoke execute on function app.schlacht_bewegung_frei()                                    from public, anon, authenticated;
revoke execute on function app.schlacht_boss_frei()                                        from public, anon, authenticated;
revoke execute on function app.schlacht_regeln_festhalten()                                from public, anon, authenticated;
revoke execute on function app.schlacht_ausruestung(text, boolean)                         from public, anon, authenticated;
revoke execute on function app.schlacht_huelle(bigint, text)                               from public, anon, authenticated;
revoke execute on function app.schlacht_bewegen(numeric, numeric)                          from public, anon;
revoke execute on function app.admin_boss_starten(integer, text, integer, numeric)         from public, anon;
revoke execute on function public.schlacht_bewegen(numeric, numeric)                       from public, anon;
revoke execute on function public.admin_boss_starten(integer, text, integer, numeric)      from public, anon;
grant  execute on function app.schlacht_bewegen(numeric, numeric)                          to authenticated;
grant  execute on function app.admin_boss_starten(integer, text, integer, numeric)         to authenticated;
grant  execute on function public.schlacht_bewegen(numeric, numeric)                       to authenticated;
grant  execute on function public.admin_boss_starten(integer, text, integer, numeric)      to authenticated;
