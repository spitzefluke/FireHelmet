/* ======================================================
   STERNENSCHLACHT: DIE FRONT - ALLE 10 SEKUNDEN PASSIERT WAS
   ---------------------------------------------------
   Mit der Freigabe "schlachtFront" (gilt ab der naechsten gestarteten
   Schlacht, nicht im Boss-Modus) kaempfen beide Seiten um eine FRONT
   in der Mitte. Alle front_takt_sek (Standard 10 s) ist ein TAKT:

   1. DRAENGEN UND VERTEIDIGEN
      Jeder Spieler waehlt seine HALTUNG (schlacht_haltung, jederzeit):
        angriff       draengt stark, verteidigt kaum
        ausgewogen    beides halb (Standard)
        verteidigung  haelt die Front, draengt kaum
      Druck je Seite = Summe Schaden x Anteil Angriff x (1 + 25 % je
      Vorstoss-Stufe), Abwehr ebenso mit Verteidigung und Bollwerk.
      Die Front wandert um 20 x Staerke x (Druck links - Druck rechts)
      / Gesamtkraft, hoechstens 25 je Takt. Zerstoerte Schiffe (59)
      zaehlen nicht.
      Die zurueckgedraengte Seite verliert je Takt |Front| % von 1 %
      ihres Lebens. Erreicht die Front 100: DURCHBRUCH - die Seite
      verliert front_durchbruch (Standard 5 %) ihres Lebens, die Front
      springt zurueck auf 0.

   2. EREIGNIS JE TAKT (fest aus Schlacht, Runde und Takt gewuerfelt,
      fuer alle gleich):
        ruhe          nichts Besonderes
        sturmangriff  die Front wandert doppelt so weit
        nachschub     die zurueckliegende Seite heilt 2 %
        feuerpause    die Front bleibt stehen
        meteorhagel   beide Seiten verlieren 1 %
        gegenstoss    die zurueckliegende Seite draengt doppelt

   3. VERBESSERN IM KAMPF
      Je Takt bekommt jeder Spieler einen Kampfpunkt (KP), zwei, wenn
      seine Seite Boden gutgemacht hat. Ausgeben mit
      schlacht_front_verbessern:
        vorstoss   +25 % Druck   Stufe 1/2/3 fuer 2/4/6 KP
        bollwerk   +25 % Abwehr  Stufe 1/2/3 fuer 2/4/6 KP
        reparatur  heilt die eigene Seite um 1,5 %, 3 KP, alle 30 s
      Zu jeder neuen Runde beginnt das von vorn.

   4. AUSGLEICH (front_ausgleich, Standard an): Kaempfen auf einer
      Seite deutlich weniger echte Spieler (ab 1,5 : 1), bekommen sie
      beim Aufstellen (gross/klein)^0,8 auf Leben und Schaden,
      hoechstens x4 - ein einzelner gegen vier also etwa x3.

   5. ADMIN-REGLER (admin_front_einstellen): Takt 5..30 s, Staerke
      0,25..3, Durchbruch 0..20 %, Ausgleich an/aus. Gilt fuer die
      naechsten Starts UND sofort fuer eine laufende Front-Schlacht.

   Die Takte rechnet schlacht_stand nach (wie die Runden), hoechstens
   60 auf einmal. Wirkungen landen als Aktion 'front' in
   sternenschlacht_aktionen - schlacht_leben zaehlt sie wie jeden
   anderen Schaden.

   Neue Fassungen ("NEU 62"): schlacht_aufstellen (59), schlacht_stand
   (59), schlacht_regeln_festhalten (59).

   REIHENFOLGE: nach 61 einspielen. Von Hand, im SQL-Editor.
   Idempotent.
====================================================== */


/* ======================================================
   1. SPALTEN, REGLER, FREIGABE
====================================================== */
alter table public.sternenschlacht add column if not exists mit_front        boolean not null default false;
alter table public.sternenschlacht add column if not exists mit_ausgleich    boolean not null default true;
alter table public.sternenschlacht add column if not exists front_takt_sek   integer not null default 10;
alter table public.sternenschlacht add column if not exists front_staerke    numeric not null default 1;
alter table public.sternenschlacht add column if not exists front_durchbruch numeric not null default 0.05;
alter table public.sternenschlacht add column if not exists front_wert       numeric not null default 0;
alter table public.sternenschlacht add column if not exists front_takt       integer not null default 0;
alter table public.sternenschlacht add column if not exists front_ereignis   text;
alter table public.sternenschlacht add column if not exists ausgleich_links  numeric not null default 1;
alter table public.sternenschlacht add column if not exists ausgleich_rechts numeric not null default 1;
alter table public.sternenschlacht drop constraint if exists sternenschlacht_front;
alter table public.sternenschlacht add constraint sternenschlacht_front
  check (front_wert between -100 and 100 and front_takt_sek between 5 and 30 and front_staerke between 0.25 and 3
         and front_durchbruch between 0 and 0.2);

alter table public.sternenschlacht_einheiten add column if not exists haltung      text not null default 'ausgewogen';
alter table public.sternenschlacht_einheiten add column if not exists haltung_at   timestamptz;
alter table public.sternenschlacht_einheiten add column if not exists kp           integer not null default 0;
alter table public.sternenschlacht_einheiten add column if not exists vorstoss     smallint not null default 0;
alter table public.sternenschlacht_einheiten add column if not exists bollwerk     smallint not null default 0;
alter table public.sternenschlacht_einheiten add column if not exists reparatur_at timestamptz;
alter table public.sternenschlacht_einheiten drop constraint if exists schlacht_einheit_front;
alter table public.sternenschlacht_einheiten add constraint schlacht_einheit_front
  check (haltung in ('angriff', 'ausgewogen', 'verteidigung') and kp >= 0 and vorstoss between 0 and 3 and bollwerk between 0 and 3);

alter table public.sternenschlacht_aktionen drop constraint if exists schlacht_aktion_art;
alter table public.sternenschlacht_aktionen add constraint schlacht_aktion_art check (art in ('ziel', 'spezial', 'front'));

/* Regler des Admins - eine Zeile. */
create table if not exists public.schlacht_regler (
  id          integer primary key default 1,
  takt_sek    integer not null default 10,
  staerke     numeric not null default 1,
  durchbruch  numeric not null default 0.05,
  ausgleich   boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint schlacht_regler_eine check (id = 1),
  constraint schlacht_regler_werte check (takt_sek between 5 and 30 and staerke between 0.25 and 3 and durchbruch between 0 and 0.2)
);
insert into public.schlacht_regler (id) values (1) on conflict (id) do nothing;
alter table public.schlacht_regler enable row level security;
alter table public.schlacht_regler force row level security;
drop policy if exists schlacht_regler_lesen on public.schlacht_regler;
create policy schlacht_regler_lesen on public.schlacht_regler for select to anon, authenticated using (true);
revoke all on public.schlacht_regler from anon, authenticated;
grant select on public.schlacht_regler to anon, authenticated;

create or replace function app.schlacht_front_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'schlachtFront' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

/* Freigaben beim Start festhalten (aus 59) - NEU 62: Front und Regler. */
create or replace function app.schlacht_regeln_festhalten() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  r public.schlacht_regler;
begin
  new.mit_ausruestung := app.hangar_ausruestung_frei();
  new.mit_bewegung := app.schlacht_bewegung_frei();
  new.mit_front := app.schlacht_front_frei() and coalesce(new.modus, 'normal') <> 'boss';
  select * into r from public.schlacht_regler where id = 1;
  if found then
    new.front_takt_sek := r.takt_sek;
    new.front_staerke := r.staerke;
    new.front_durchbruch := r.durchbruch;
    new.mit_ausgleich := r.ausgleich;
  end if;
  return new;
end
$$;


/* ======================================================
   2. AUFSTELLEN (aus 59, NEU 62: Ausgleich, Front zuruecksetzen)
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
  al    numeric := 1; ar numeric := 1;   -- NEU 62: Ausgleich
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
           treffer = 0, zerstoert_at = null, kp = 0, vorstoss = 0, bollwerk = 0;   -- NEU 62
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
           treffer = 0, zerstoert_at = null, kp = 0, vorstoss = 0, bollwerk = 0;   -- NEU 62
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

  /* NEU 62: AUSGLEICH - sind auf einer Seite deutlich weniger echte
     Spieler, kaempfen sie verstaerkt: (gross/klein)^0,8, hoechstens x4,
     auf Leben, Schaden und Druck an der Front. */
  al := 1; ar := 1;
  if s.mit_front and s.mit_ausgleich and nm > 0 and na > 0 then
    if nm < na and na::numeric / nm >= 1.5 then
      al := round(least(4, power(na::numeric / nm, 0.8)), 2);
    elsif na < nm and nm::numeric / na >= 1.5 then
      ar := round(least(4, power(nm::numeric / na, 0.8)), 2);
    end if;
    if al > 1 or ar > 1 then
      update public.sternenschlacht_einheiten
         set leben = round(leben * case seite when 'menschen' then al else ar end),
             schaden = round(schaden * case seite when 'menschen' then al else ar end * 10) / 10.0
       where schlacht_id = p_id and firebase_uid not like 'ki-%'
         and ((seite = 'menschen' and al > 1) or (seite = 'aliens' and ar > 1));
    end if;
  end if;

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
         runde_at = now(), aufgestellt = true,
         front_wert = 0, front_takt = 0, front_ereignis = null,              -- NEU 62
         ausgleich_links = al, ausgleich_rechts = ar
   where id = p_id;
end
$$;


/* ======================================================
   3. DER TAKT
====================================================== */
/* Ereignis eines Takts - fest aus Schlacht, Runde und Takt. */
create or replace function app.front_ereignis(p_id bigint, p_runde integer, p_k integer) returns text
language sql immutable
as $$
  select (array['ruhe', 'sturmangriff', 'nachschub', 'feuerpause', 'meteorhagel', 'gegenstoss'])
         [1 + abs(hashtext(p_id::text || ':' || p_runde::text || ':' || p_k::text)) % 6]
$$;

create or replace function app.schlacht_front_takt(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s     public.sternenschlacht;
  r0    timestamptz;
  kmax  integer;
  k     integer;
  ev    text;
  al numeric; vl numeric; ar numeric; vr numeric;
  dl numeric; dr numeric; delta numeric; gesamt numeric;
  front numeric;
  vorher numeric;
  hinten text;
  zeit  timestamptz;
  ziel  text;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found or s.status <> 'laeuft' or not s.mit_front or not s.aufgestellt then return; end if;
  r0 := coalesce(s.runde_at, s.start_at);
  kmax := floor(extract(epoch from (now() - r0)) / s.front_takt_sek);
  if kmax <= s.front_takt then return; end if;

  /* Kraefte der Seiten - fuer alle nachzuholenden Takte dieselben. */
  select coalesce(sum(schaden * case haltung when 'angriff' then 1 when 'ausgewogen' then 0.5 else 0.15 end * (1 + 0.25 * vorstoss))
                    filter (where seite = 'menschen'), 0),
         coalesce(sum(schaden * case haltung when 'verteidigung' then 1 when 'ausgewogen' then 0.5 else 0.15 end * (1 + 0.25 * bollwerk))
                    filter (where seite = 'menschen'), 0),
         coalesce(sum(schaden * case haltung when 'angriff' then 1 when 'ausgewogen' then 0.5 else 0.15 end * (1 + 0.25 * vorstoss))
                    filter (where seite = 'aliens'), 0),
         coalesce(sum(schaden * case haltung when 'verteidigung' then 1 when 'ausgewogen' then 0.5 else 0.15 end * (1 + 0.25 * bollwerk))
                    filter (where seite = 'aliens'), 0)
    into al, vl, ar, vr
    from public.sternenschlacht_einheiten e
   where e.schlacht_id = p_id and not (s.mit_bewegung and app.schlacht_zerstoert(e));
  al := al * s.ausgleich_links;  vl := vl * s.ausgleich_links;
  ar := ar * s.ausgleich_rechts; vr := vr * s.ausgleich_rechts;
  gesamt := greatest(1, al + vl + ar + vr);

  front := s.front_wert;
  for k in greatest(s.front_takt + 1, kmax - 59) .. kmax loop
    ev := app.front_ereignis(p_id, s.runde, k);
    zeit := r0 + make_interval(secs => k * s.front_takt_sek);
    hinten := case when front > 0 then 'aliens' when front < 0 then 'menschen' end;
    dl := greatest(0, al * case when ev = 'gegenstoss' and hinten = 'menschen' then 2 else 1 end - vr);
    dr := greatest(0, ar * case when ev = 'gegenstoss' and hinten = 'aliens' then 2 else 1 end - vl);
    delta := 20 * s.front_staerke * (dl - dr) / gesamt;
    if ev = 'sturmangriff' then delta := delta * 2; end if;
    if ev = 'feuerpause' then delta := 0; end if;
    delta := greatest(-25, least(25, delta));
    vorher := front;
    front := greatest(-100, least(100, front + delta));

    /* Kampfpunkte: 1 je Takt, 2 fuer die Seite, die Boden gutgemacht hat. */
    update public.sternenschlacht_einheiten
       set kp = kp + 1 + case when (delta > 0 and seite = 'menschen') or (delta < 0 and seite = 'aliens') then 1 else 0 end
     where schlacht_id = p_id and firebase_uid not like 'ki-%';

    if abs(front) >= 100 then
      ziel := case when front > 0 then 'aliens' else 'menschen' end;
      insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, wert, at)
      values (p_id, 'front', case ziel when 'aliens' then 'menschen' else 'aliens' end, 'front', 'durchbruch', 'schaden', ziel,
              round(s.front_durchbruch * case ziel when 'menschen' then s.leben0_menschen else s.leben0_aliens end, 1), zeit);
      front := 0;
    elsif front <> 0 then
      ziel := case when front > 0 then 'aliens' else 'menschen' end;
      insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, wert, at)
      values (p_id, 'front', case ziel when 'aliens' then 'menschen' else 'aliens' end, 'front', 'druck', 'schaden', ziel,
              round(abs(front) / 100 * 0.01 * case ziel when 'menschen' then s.leben0_menschen else s.leben0_aliens end, 1), zeit);
    end if;

    if ev = 'nachschub' and hinten is not null then
      insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, wert, at)
      values (p_id, 'front', hinten, 'front', 'nachschub', 'heilung', hinten,
              round(0.02 * case hinten when 'menschen' then s.leben0_menschen else s.leben0_aliens end, 1), zeit);
    elsif ev = 'meteorhagel' then
      insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, wert, at)
      values (p_id, 'front', 'menschen', 'front', 'meteorhagel', 'schaden', 'menschen', round(0.01 * s.leben0_menschen, 1), zeit),
             (p_id, 'front', 'aliens',   'front', 'meteorhagel', 'schaden', 'aliens',   round(0.01 * s.leben0_aliens, 1), zeit);
    end if;
  end loop;

  update public.sternenschlacht
     set front_wert = round(front, 2), front_takt = kmax, front_ereignis = ev
   where id = p_id;
end
$$;


/* ======================================================
   4. HALTUNG UND VERBESSERN
====================================================== */
create or replace function app.schlacht_haltung(p_haltung text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  ich record;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null and ich.grund <> 'zerstoert' then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  if not (ich.s).mit_front then
    return jsonb_build_object('ok', false, 'grund', 'keine-front');
  end if;
  if p_haltung is null or p_haltung not in ('angriff', 'ausgewogen', 'verteidigung') then
    return jsonb_build_object('ok', false, 'grund', 'falsche-haltung');
  end if;
  if (ich.e).haltung_at is not null and (ich.e).haltung_at > now() - interval '2 seconds' then
    return jsonb_build_object('ok', false, 'grund', 'zu-schnell');
  end if;
  /* Erst die laufenden Takte mit der alten Haltung abrechnen. */
  perform app.schlacht_front_takt((ich.s).id);
  update public.sternenschlacht_einheiten set haltung = p_haltung, haltung_at = now()
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'haltung', p_haltung);
end
$$;

create or replace function app.schlacht_front_verbessern(p_art text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  ich   record;
  stufe integer;
  preis integer;
  wert  numeric;
  kp_   integer;
  vs_   integer;
  bw_   integer;
begin
  select * into ich from app.schlacht_ich(uid);
  if ich.grund is not null then
    return jsonb_build_object('ok', false, 'grund', ich.grund);
  end if;
  if not (ich.s).mit_front then
    return jsonb_build_object('ok', false, 'grund', 'keine-front');
  end if;
  if p_art is null or p_art not in ('vorstoss', 'bollwerk', 'reparatur') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  perform app.schlacht_front_takt((ich.s).id);
  /* Kampfpunkte nach dem Nachrechnen frisch lesen. */
  select kp, vorstoss, bollwerk into kp_, vs_, bw_
    from public.sternenschlacht_einheiten where schlacht_id = (ich.s).id and firebase_uid = uid;

  if p_art = 'reparatur' then
    if (ich.e).reparatur_at is not null and (ich.e).reparatur_at > now() - interval '30 seconds' then
      return jsonb_build_object('ok', false, 'grund', 'laedt', 'ab', (ich.e).reparatur_at + interval '30 seconds');
    end if;
    preis := 3;
  else
    stufe := case p_art when 'vorstoss' then vs_ else bw_ end;
    if stufe >= 3 then
      return jsonb_build_object('ok', false, 'grund', 'max');
    end if;
    preis := 2 * (stufe + 1);
  end if;
  if kp_ < preis then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig-kp', 'preis', preis);
  end if;

  update public.sternenschlacht_einheiten
     set kp = kp - preis,
         vorstoss = vorstoss + case when p_art = 'vorstoss' then 1 else 0 end,
         bollwerk = bollwerk + case when p_art = 'bollwerk' then 1 else 0 end,
         reparatur_at = case when p_art = 'reparatur' then now() else reparatur_at end
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  if p_art = 'reparatur' then
    wert := round(0.015 * case (ich.e).seite when 'menschen' then (ich.s).leben0_menschen else (ich.s).leben0_aliens end, 1);
    insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, wert)
    values ((ich.s).id, uid, (ich.e).seite, 'front', 'reparatur', 'heilung', (ich.e).seite, wert);
  end if;
  return jsonb_build_object('ok', true, 'art', p_art, 'preis', preis, 'wert', wert,
    'meine', (select jsonb_build_object('haltung', haltung, 'kp', kp, 'vorstoss', vorstoss, 'bollwerk', bollwerk, 'reparatur_at', reparatur_at)
                from public.sternenschlacht_einheiten where schlacht_id = (ich.s).id and firebase_uid = uid));
end
$$;


/* ======================================================
   5. ADMIN-REGLER
====================================================== */
create or replace function app.admin_front_einstellen(p_takt integer, p_staerke numeric, p_durchbruch numeric, p_ausgleich boolean)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  r public.schlacht_regler;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_takt is null or p_takt not between 5 and 30 or p_staerke is null or p_staerke not between 0.25 and 3
     or p_durchbruch is null or p_durchbruch not between 0 and 0.2 then
    raise exception 'regler-ungueltig';
  end if;
  /* Laufende Front-Schlacht: erst bis jetzt mit den alten Werten
     abrechnen, dann den Takt so umstellen, dass kein Takt doppelt
     oder rueckwirkend zaehlt. */
  perform app.schlacht_front_takt(s.id) from public.sternenschlacht s where s.status = 'laeuft' and s.mit_front;
  update public.sternenschlacht
     set front_takt = floor(extract(epoch from (now() - coalesce(runde_at, start_at))) / p_takt),
         front_takt_sek = p_takt, front_staerke = p_staerke, front_durchbruch = p_durchbruch, mit_ausgleich = coalesce(p_ausgleich, true)
   where status = 'laeuft' and mit_front;
  update public.schlacht_regler
     set takt_sek = p_takt, staerke = p_staerke, durchbruch = p_durchbruch, ausgleich = coalesce(p_ausgleich, true), updated_at = now()
   where id = 1
  returning * into r;
  return to_jsonb(r);
end
$$;


/* ======================================================
   6. STAND (aus 59, NEU 62: Front)
====================================================== */
create or replace function app.schlacht_stand(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s  public.sternenschlacht;
  lm numeric; la numeric; rm numeric; ra numeric;
  t  timestamptz;
  uid text := app.firebase_uid();
  sek numeric;
  ich public.sternenschlacht_einheiten;
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
    /* NEU 62: Front-Takte bis jetzt nachrechnen - vor der Rundenpruefung. */
    if s.mit_front and s.aufgestellt then
      perform app.schlacht_front_takt(p_id);
    end if;
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
              'schild', s.aufgestellt and s.boss_phase >= 2 and sek - floor(sek / 40) * 40 >= 28) end)
    /* NEU 62 */
    || case when s.mit_front then jsonb_build_object('front', jsonb_build_object(
         'wert', s.front_wert, 'takt', s.front_takt, 'takt_sek', s.front_takt_sek, 'staerke', s.front_staerke,
         'durchbruch', s.front_durchbruch, 'ereignis', s.front_ereignis,
         'naechster_at', coalesce(s.runde_at, s.start_at) + make_interval(secs => (s.front_takt + 1) * s.front_takt_sek),
         'ausgleich_links', s.ausgleich_links, 'ausgleich_rechts', s.ausgleich_rechts,
         'haltungen', (select jsonb_build_object(
             'links',  jsonb_build_object('angriff', count(*) filter (where seite = 'menschen' and haltung = 'angriff'),
                                          'verteidigung', count(*) filter (where seite = 'menschen' and haltung = 'verteidigung')),
             'rechts', jsonb_build_object('angriff', count(*) filter (where seite = 'aliens' and haltung = 'angriff'),
                                          'verteidigung', count(*) filter (where seite = 'aliens' and haltung = 'verteidigung')))
                         from public.sternenschlacht_einheiten where schlacht_id = s.id),
         'meine', (select jsonb_build_object('haltung', e.haltung, 'kp', e.kp, 'vorstoss', e.vorstoss, 'bollwerk', e.bollwerk,
                                            'reparatur_at', e.reparatur_at)
                     from public.sternenschlacht_einheiten e where e.schlacht_id = s.id and e.firebase_uid = uid)))
       else '{}'::jsonb end;
end
$$;


/* ======================================================
   7. WRAPPER UND RECHTE
====================================================== */
create or replace function public.schlacht_haltung(p_haltung text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_haltung(p_haltung) $$;
create or replace function public.schlacht_front_verbessern(p_art text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_front_verbessern(p_art) $$;
create or replace function public.admin_front_einstellen(p_takt integer, p_staerke numeric, p_durchbruch numeric, p_ausgleich boolean)
returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_front_einstellen(p_takt, p_staerke, p_durchbruch, p_ausgleich) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.schlacht_front_frei()                                         from public, anon, authenticated;
revoke execute on function app.schlacht_front_takt(bigint)                                   from public, anon, authenticated;
revoke execute on function app.front_ereignis(bigint, integer, integer)                      from public, anon, authenticated;
revoke execute on function app.schlacht_haltung(text)                                        from public, anon;
revoke execute on function app.schlacht_front_verbessern(text)                               from public, anon;
revoke execute on function app.admin_front_einstellen(integer, numeric, numeric, boolean)    from public, anon;
revoke execute on function public.schlacht_haltung(text)                                     from public, anon;
revoke execute on function public.schlacht_front_verbessern(text)                            from public, anon;
revoke execute on function public.admin_front_einstellen(integer, numeric, numeric, boolean) from public, anon;
grant  execute on function app.schlacht_haltung(text)                                        to authenticated;
grant  execute on function app.schlacht_front_verbessern(text)                               to authenticated;
grant  execute on function app.admin_front_einstellen(integer, numeric, numeric, boolean)    to authenticated;
grant  execute on function public.schlacht_haltung(text)                                     to authenticated;
grant  execute on function public.schlacht_front_verbessern(text)                            to authenticated;
grant  execute on function public.admin_front_einstellen(integer, numeric, numeric, boolean) to authenticated;
