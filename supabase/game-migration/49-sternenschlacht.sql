/* ======================================================
   ZEITMASCHINE 2100, ETAPPE 4: LIVE-STERNENSCHLACHT
   ---------------------------------------------------
   Der Admin startet im Jahr 2100 eine Schlacht (Standard 10 min).
   Beim Start haelt die Datenbank fest, wer mitkaempft: jeder Spieler
   mit Seite (Migration 47), mit seiner Einheit aus dem Hangar (48) -
   ohne Hangar-Eintrag mit dem ersten Typ seiner Seite auf Stufe 0.

   RECHENWEG (Spezifikation: Weg A - die Datenbank ist massgeblich)
   Jede Seite hat Startleben (Summe ihrer Einheiten) und Dauerfeuer
   (Summe des Schadens). Der Stand zu einem Zeitpunkt ist eine reine
   Rechnung aus der Zeit und den Aktionen - schlacht_stand():

     Leben(X) = Startleben(X)
              - Dauerfeuer(Gegner) * skala * Formation(Gegner)
                  * Summe ueber alle Sekunden der Wirkfenster-Faktoren
              - direkter Schaden (Ziel-Schuesse, Sofort-Spezial)
              + Heilung (Reparaturdrohnen)
              + Nachladen der Schilde (nur Menschen)

   skala wird beim Start so gewaehlt, dass das Dauerfeuer allein bei
   gleich starken Seiten am Ende rund 87 % abgetragen haette - den
   Rest entscheiden die Spieler mit Zielen und Spezialangriffen.

   Das Banner zeigt den Anteil am verbliebenen Leben, jeweils relativ
   zum eigenen Start (beide beginnen bei 50 %). Es gewinnt die Seite
   mit dem groesseren Rest. Fruehes Ende, wenn eine Seite bei 0 ist.

   SEITEN IN DER SCHLACHT (Migration 47, Spezifikation)
     Menschen: Leben x1,25, Schaden x0,85 (schon in den Einheiten),
               Schilde laden nach (+0,02 % Startleben je Sekunde),
               Formation +2 % Dauerfeuer je Einheit, hoechstens +20 %,
               Spezialangriff erst nach 60 s.
     Aliens:   Leben x0,80, Schaden x1,30, Drohnen doppelt,
               keine Schild-Regeneration, Spezial schon nach 30 s.

   AKTIONEN
     Ziel antippen: hoechstens alle 5 s, Schaden = eigener Schaden x 10,
       Fokusfeuer +10 % je weiterem Spieler auf demselben Ziel in den
       letzten 5 s (hoechstens +50 %).
     Spezial (einmal je Schlacht, Staerke = 1 + 0,25 je Spezial-Stufe):
       jaeger  Sofort 300 Schaden     drohne     Sofort 250 Schaden
       stachel Sofort 450 Schaden     traeger    Heilt 400
       fregatte Gegner -30 % Schaden, 15 s
       kreuzer  eigene Seite -50 % eingehender Schaden, 20 s
       weber    Gegner -40 % Schaden, 20 s
       brutschiff Gegner bekommt +25 % Dauerfeuer ab, 30 s
     Fenster-Faktoren werden mit der Staerke skaliert und nie unter 0,1.

   Waehrend einer laufenden Schlacht sperrt hangar_typ_waehlen (neue
   Fassung von 48, wortgleich + Block "Schlacht (NEU in 49)") den
   Typwechsel fuer Mitkaempfer.

   RUHM: Am Ende stehen Sieger, Endstand und je Seite die zwei Spieler
   mit dem meisten Schaden in der Schlacht-Zeile (ruhm). Keine
   Dublonen, keine XP.

   Realtime: sternenschlacht und sternenschlacht_aktionen kommen in
   die Publikation supabase_realtime (wenn es sie gibt).

   REIHENFOLGE: nach 48 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. TABELLEN
====================================================== */
create table if not exists public.sternenschlacht (
  id                 bigint generated always as identity primary key,
  start_at           timestamptz not null default now(),
  ende_at            timestamptz not null,
  status             text not null default 'laeuft',
  skala              numeric not null,
  leben0_menschen    numeric not null,
  leben0_aliens      numeric not null,
  dps_menschen       numeric not null,
  dps_aliens         numeric not null,
  formation_menschen numeric not null default 1,
  anzahl_menschen    integer not null,
  anzahl_aliens      integer not null,
  sieger             text,
  endstand_menschen  numeric,
  ruhm               jsonb,
  constraint sternenschlacht_status check (status in ('laeuft', 'vorbei')),
  constraint sternenschlacht_sieger check (sieger is null or sieger in ('menschen', 'aliens', 'unentschieden'))
);
create unique index if not exists sternenschlacht_eine_laeuft
  on public.sternenschlacht (status) where status = 'laeuft';

create table if not exists public.sternenschlacht_einheiten (
  schlacht_id     bigint not null references public.sternenschlacht(id) on delete cascade,
  firebase_uid    text not null,
  nickname        text,
  seite           text not null,
  typ             text not null,
  leben           numeric not null,
  schaden         numeric not null,
  spezial         numeric not null,
  spezial_at      timestamptz,
  ziel_at         timestamptz,
  schaden_gesamt  numeric not null default 0,
  primary key (schlacht_id, firebase_uid),
  constraint schlacht_einheit_seite check (seite in ('menschen', 'aliens'))
);

create table if not exists public.sternenschlacht_aktionen (
  id            bigint generated always as identity primary key,
  schlacht_id   bigint not null references public.sternenschlacht(id) on delete cascade,
  firebase_uid  text not null,
  seite         text not null,              -- wer handelt
  art           text not null,              -- 'ziel' | 'spezial'
  typ           text,                       -- Einheitentyp beim Spezial
  ziel_uid      text,
  wirkung       text not null,              -- 'schaden' | 'heilung' | 'fenster'
  betroffen     text not null,              -- Seite, die es trifft
  wert          numeric not null default 0, -- Schaden/Heilung in Leben
  faktor        numeric not null default 1, -- Fenster: Faktor auf eingehendes Dauerfeuer
  at            timestamptz not null default now(),
  bis           timestamptz,
  constraint schlacht_aktion_art check (art in ('ziel', 'spezial')),
  constraint schlacht_aktion_wirkung check (wirkung in ('schaden', 'heilung', 'fenster')),
  constraint schlacht_aktion_betroffen check (betroffen in ('menschen', 'aliens'))
);
create index if not exists sternenschlacht_aktionen_schlacht on public.sternenschlacht_aktionen (schlacht_id, at);

alter table public.sternenschlacht           enable row level security;
alter table public.sternenschlacht           force row level security;
alter table public.sternenschlacht_einheiten enable row level security;
alter table public.sternenschlacht_einheiten force row level security;
alter table public.sternenschlacht_aktionen  enable row level security;
alter table public.sternenschlacht_aktionen  force row level security;

drop policy if exists sternenschlacht_lesen on public.sternenschlacht;
create policy sternenschlacht_lesen on public.sternenschlacht for select to anon, authenticated using (true);
drop policy if exists sternenschlacht_einheiten_lesen on public.sternenschlacht_einheiten;
create policy sternenschlacht_einheiten_lesen on public.sternenschlacht_einheiten for select to anon, authenticated using (true);
drop policy if exists sternenschlacht_aktionen_lesen on public.sternenschlacht_aktionen;
create policy sternenschlacht_aktionen_lesen on public.sternenschlacht_aktionen for select to anon, authenticated using (true);

revoke all on public.sternenschlacht, public.sternenschlacht_einheiten, public.sternenschlacht_aktionen from anon, authenticated;
grant select on public.sternenschlacht, public.sternenschlacht_einheiten, public.sternenschlacht_aktionen to anon, authenticated;


/* ======================================================
   2. KAMPFWERTE (wie hangarWerte() in scripts/hangar/hangar-data.js)
====================================================== */
create or replace function app.schlacht_werte(p_typ text, p_seite text, sl integer, ss integer, sp integer,
  out leben numeric, out schaden numeric, out spezial numeric)
language plpgsql immutable
as $$
declare
  bl numeric; bs numeric; anzahl integer := case when p_typ = 'drohne' then 2 else 1 end;
  ml numeric := case p_seite when 'menschen' then 1.25 when 'aliens' then 0.80 else 1 end;
  ms numeric := case p_seite when 'menschen' then 0.85 when 'aliens' then 1.30 else 1 end;
begin
  select x.l, x.s into bl, bs from (values
    ('jaeger', 80, 14), ('fregatte', 120, 10), ('kreuzer', 200, 7), ('traeger', 100, 5),
    ('drohne', 50, 9), ('stachel', 70, 18), ('weber', 110, 8), ('brutschiff', 140, 6)
  ) as x(t, l, s) where x.t = p_typ;
  leben   := round(bl * (1 + 0.2 * coalesce(sl, 0)) * ml) * anzahl;
  schaden := round(bs * (1 + 0.2 * coalesce(ss, 0)) * ms * 10) / 10.0 * anzahl;
  spezial := 1 + 0.25 * coalesce(sp, 0);
end
$$;


/* ======================================================
   3. STAND
   Reine Rechnung: Leben je Seite zum Zeitpunkt p_zeit.
====================================================== */
create or replace function app.schlacht_leben(p_id bigint, p_seite text, p_zeit timestamptz) returns numeric
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s        public.sternenschlacht;
  t        timestamptz;
  sek      integer;
  leben0   numeric;
  feuer    numeric;
  fenster  numeric;
  direkt   numeric;
  heil     numeric;
  regen    numeric := 0;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then return null; end if;
  t := least(p_zeit, s.ende_at);
  sek := greatest(0, floor(extract(epoch from (t - s.start_at)))::integer);

  if p_seite = 'menschen' then
    leben0 := s.leben0_menschen;
    feuer  := s.dps_aliens * s.skala;
    regen  := s.leben0_menschen * 0.0002 * sek;
  else
    leben0 := s.leben0_aliens;
    feuer  := s.dps_menschen * s.skala * s.formation_menschen;
  end if;

  /* Summe ueber alle Sekunden: Produkt der Fenster, die in der
     Sekundenmitte wirken (ohne Fenster = 1). */
  select coalesce(sum(coalesce((
           select exp(sum(ln(a.faktor)))
             from public.sternenschlacht_aktionen a
            where a.schlacht_id = p_id and a.wirkung = 'fenster' and a.betroffen = p_seite
              and a.at <= g.ts and a.bis > g.ts), 1)), 0)
    into fenster
    from generate_series(0, sek - 1) as n,
         lateral (select s.start_at + make_interval(secs => n + 0.5) as ts) g;

  select coalesce(sum(wert) filter (where wirkung = 'schaden'), 0),
         coalesce(sum(wert) filter (where wirkung = 'heilung'), 0)
    into direkt, heil
    from public.sternenschlacht_aktionen
   where schlacht_id = p_id and betroffen = p_seite and at <= t;

  return greatest(0, least(leben0, leben0 - feuer * fenster - direkt + heil + regen));
end
$$;

/* Faktor auf eingehendes Dauerfeuer fuer p_seite JETZT (fuer
   Ziel-Schuesse und Sofort-Schaden, damit der Schildwall auch diese
   abfaengt). */
create or replace function app.schlacht_fenster_jetzt(p_id bigint, p_seite text) returns numeric
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce(exp(sum(ln(faktor))), 1)
    from public.sternenschlacht_aktionen
   where schlacht_id = p_id and wirkung = 'fenster' and betroffen = p_seite
     and at <= now() and bis > now()
$$;

/* Abschluss: Sieger, Endstand, Ruhm. Nur einmal. */
create or replace function app.schlacht_abschliessen(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s    public.sternenschlacht;
  ende timestamptz;
  lm   numeric; la numeric; rm numeric; ra numeric;
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found or s.status <> 'laeuft' then return; end if;
  ende := least(now(), s.ende_at);
  lm := app.schlacht_leben(p_id, 'menschen', ende);
  la := app.schlacht_leben(p_id, 'aliens', ende);
  rm := case when s.leben0_menschen > 0 then lm / s.leben0_menschen else 0 end;
  ra := case when s.leben0_aliens > 0 then la / s.leben0_aliens else 0 end;

  update public.sternenschlacht
     set status = 'vorbei',
         ende_at = ende,
         sieger = case when rm > ra then 'menschen' when ra > rm then 'aliens' else 'unentschieden' end,
         endstand_menschen = case when rm + ra > 0 then round(100 * rm / (rm + ra), 1) else 50 end,
         ruhm = jsonb_build_object(
           'menschen', (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'menschen' and schaden_gesamt > 0
                                 order by schaden_gesamt desc limit 2) x),
           'aliens',   (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'aliens' and schaden_gesamt > 0
                                 order by schaden_gesamt desc limit 2) x))
   where id = p_id;
end
$$;

/* Stand fuer den Browser - schliesst eine faellige Schlacht ab. */
create or replace function app.schlacht_stand(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s  public.sternenschlacht;
  lm numeric; la numeric; rm numeric; ra numeric;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if s.status = 'laeuft' then
    lm := app.schlacht_leben(p_id, 'menschen', now());
    la := app.schlacht_leben(p_id, 'aliens', now());
    if now() >= s.ende_at or lm <= 0 or la <= 0 then
      perform app.schlacht_abschliessen(p_id);
      select * into s from public.sternenschlacht where id = p_id;
    end if;
  end if;
  lm := app.schlacht_leben(p_id, 'menschen', least(now(), s.ende_at));
  la := app.schlacht_leben(p_id, 'aliens', least(now(), s.ende_at));
  rm := case when s.leben0_menschen > 0 then lm / s.leben0_menschen else 0 end;
  ra := case when s.leben0_aliens > 0 then la / s.leben0_aliens else 0 end;
  return jsonb_build_object(
    'ok', true, 'id', s.id, 'status', s.status, 'start_at', s.start_at, 'ende_at', s.ende_at,
    'jetzt', now(),
    'menschen', jsonb_build_object('leben', round(lm), 'leben0', s.leben0_menschen, 'rest', round(rm, 4), 'anzahl', s.anzahl_menschen),
    'aliens',   jsonb_build_object('leben', round(la), 'leben0', s.leben0_aliens,   'rest', round(ra, 4), 'anzahl', s.anzahl_aliens),
    'prozent_menschen', case when s.status = 'vorbei' then s.endstand_menschen
                             when rm + ra > 0 then round(100 * rm / (rm + ra), 1) else 50 end,
    'sieger', s.sieger, 'ruhm', s.ruhm);
end
$$;


/* ======================================================
   4. ADMIN: STARTEN UND BEENDEN
====================================================== */
create or replace function app.admin_schlacht_starten(p_minuten integer default 10) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid   bigint;
  lm numeric; la numeric; dm numeric; da numeric; nm integer; na integer;
  form  numeric;
  dauer numeric;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if app.epoche_jetzt() <> '2100' then
    raise exception 'nicht-2100';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  /* Eine faellige alte Schlacht erst abschliessen. */
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  dauer := p_minuten * 60;
  insert into public.sternenschlacht (ende_at, skala, leben0_menschen, leben0_aliens, dps_menschen, dps_aliens,
                                      anzahl_menschen, anzahl_aliens)
       values (now() + make_interval(mins => p_minuten), 1, 0, 0, 0, 0, 0, 0)
  returning id into sid;

  insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, typ, leben, schaden, spezial)
  select sid, p.firebase_uid, p.nickname, p.seite, x.typ, w.leben, w.schaden, w.spezial
    from public.players p
    left join public.hangar_einheiten h on h.firebase_uid = p.firebase_uid
    cross join lateral (select case when h.typ is not null and app.hangar_typ_passt(p.seite, h.typ) then h.typ
                                    when p.seite = 'aliens' then 'drohne' else 'jaeger' end as typ) x
    cross join lateral app.schlacht_werte(x.typ, p.seite, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) w
   where p.seite in ('menschen', 'aliens')
     and not private.account_is_suspended(p.firebase_uid);

  select coalesce(sum(leben) filter (where seite = 'menschen'), 0), coalesce(sum(leben) filter (where seite = 'aliens'), 0),
         coalesce(sum(schaden) filter (where seite = 'menschen'), 0), coalesce(sum(schaden) filter (where seite = 'aliens'), 0),
         count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into lm, la, dm, da, nm, na
    from public.sternenschlacht_einheiten where schlacht_id = sid;

  if nm = 0 or na = 0 then
    raise exception 'zu-wenige-kaempfer';
  end if;

  form := 1 + least(0.2, 0.02 * nm);
  update public.sternenschlacht
     set skala = (lm + la) / ((dm * form + da) * dauer * 1.15),
         leben0_menschen = lm, leben0_aliens = la, dps_menschen = dm, dps_aliens = da,
         formation_menschen = form, anzahl_menschen = nm, anzahl_aliens = na
   where id = sid;
  return sid;
end
$$;

create or replace function app.admin_schlacht_beenden() returns bigint
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  sid bigint;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select id into sid from public.sternenschlacht where status = 'laeuft';
  if sid is null then
    return null;
  end if;
  perform app.schlacht_abschliessen(sid);
  return sid;
end
$$;


/* ======================================================
   5. MITKAEMPFEN: ZIEL UND SPEZIAL
====================================================== */
/* Gemeinsame Pruefung: laufende Schlacht, Spieler kaempft mit. */
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
  if now() >= s.ende_at then
    perform app.schlacht_abschliessen(s.id);
    grund := 'vorbei'; return;
  end if;
  select * into e from public.sternenschlacht_einheiten where schlacht_id = s.id and firebase_uid = p_uid for update;
  if not found then grund := 'nicht-dabei'; return; end if;
end
$$;

create or replace function app.schlacht_ziel(p_ziel_uid text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  ich  record;
  z    public.sternenschlacht_einheiten;
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

  /* Fokusfeuer: andere Spieler auf demselben Ziel in den letzten 5 s. */
  select count(distinct firebase_uid) into n from public.sternenschlacht_aktionen
   where schlacht_id = (ich.s).id and art = 'ziel' and ziel_uid = p_ziel_uid
     and firebase_uid <> uid and at > now() - interval '5 seconds';
  wert := round((ich.e).schaden * 10 * (1 + least(0.5, 0.1 * n))
                * app.schlacht_fenster_jetzt((ich.s).id, z.seite), 1);

  insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert)
       values ((ich.s).id, uid, (ich.e).seite, 'ziel', p_ziel_uid, 'schaden', z.seite, wert);
  update public.sternenschlacht_einheiten
     set ziel_at = now(), schaden_gesamt = schaden_gesamt + wert
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'wert', wert, 'fokus', n);
end
$$;

create or replace function app.schlacht_spezial(p_ziel_uid text default null) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  ich     record;
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
  if (ich.e).spezial_at is not null then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  eigene := (ich.e).seite;
  gegner := case eigene when 'menschen' then 'aliens' else 'menschen' end;
  warten := case eigene when 'menschen' then 60 else 30 end;
  if now() < (ich.s).start_at + make_interval(secs => warten) then
    return jsonb_build_object('ok', false, 'grund', 'laedt',
      'ab', (ich.s).start_at + make_interval(secs => warten));
  end if;
  st := (ich.e).spezial;

  case (ich.e).typ
    when 'jaeger'     then wirkung := 'schaden'; betr := gegner; wert := 300 * st;
    when 'drohne'     then wirkung := 'schaden'; betr := gegner; wert := 250 * st;
    when 'stachel'    then wirkung := 'schaden'; betr := gegner; wert := 450 * st;
    when 'traeger'    then wirkung := 'heilung'; betr := eigene; wert := 400 * st;
    when 'fregatte'   then wirkung := 'fenster'; betr := eigene; faktor := greatest(0.1, 1 - 0.30 * st); sekunden := 15;
    when 'kreuzer'    then wirkung := 'fenster'; betr := eigene; faktor := greatest(0.1, 1 - 0.50 * st); sekunden := 20;
    when 'weber'      then wirkung := 'fenster'; betr := eigene; faktor := greatest(0.1, 1 - 0.40 * st); sekunden := 20;
    when 'brutschiff' then wirkung := 'fenster'; betr := gegner; faktor := 1 + 0.25 * st;                 sekunden := 30;
    else return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end case;
  if wirkung = 'schaden' then
    wert := round(wert * app.schlacht_fenster_jetzt((ich.s).id, betr), 1);
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


/* ======================================================
   6. HANGAR: KEIN TYPWECHSEL IN DER SCHLACHT
   hangar_typ_waehlen wortgleich aus 48, ergaenzt um den Block
   "Schlacht (NEU in 49)".
====================================================== */
create or replace function app.hangar_typ_waehlen(p_typ text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  seite text := app.hangar_vorab(uid);
  e     public.hangar_einheiten;
begin
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if p_typ is null or not app.hangar_typ_passt(seite, p_typ) then
    return jsonb_build_object('ok', false, 'grund', 'falscher-typ');
  end if;

  /* ---------- Schlacht (NEU in 49) ---------- */
  if exists (select 1 from public.sternenschlacht s
               join public.sternenschlacht_einheiten u on u.schlacht_id = s.id
              where s.status = 'laeuft' and s.ende_at > now() and u.firebase_uid = uid) then
    return jsonb_build_object('ok', false, 'grund', 'schlacht');
  end if;

  insert into public.hangar_einheiten (firebase_uid, typ) values (uid, p_typ)
  on conflict (firebase_uid) do update set typ = excluded.typ, updated_at = now()
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid');
end
$$;


/* ======================================================
   7. WRAPPER, RECHTE, REALTIME
====================================================== */
create or replace function public.schlacht_stand(p_id bigint) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_stand(p_id) $$;
create or replace function public.schlacht_ziel(p_ziel_uid text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_ziel(p_ziel_uid) $$;
create or replace function public.schlacht_spezial(p_ziel_uid text default null) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schlacht_spezial(p_ziel_uid) $$;
create or replace function public.admin_schlacht_starten(p_minuten integer default 10) returns bigint
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_schlacht_starten(p_minuten) $$;
create or replace function public.admin_schlacht_beenden() returns bigint
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_schlacht_beenden() $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.schlacht_werte(text, text, integer, integer, integer)     from public, anon, authenticated;
revoke execute on function app.schlacht_leben(bigint, text, timestamptz)                from public, anon, authenticated;
revoke execute on function app.schlacht_fenster_jetzt(bigint, text)                     from public, anon, authenticated;
revoke execute on function app.schlacht_abschliessen(bigint)                            from public, anon, authenticated;
revoke execute on function app.schlacht_ich(text)                                       from public, anon, authenticated;
revoke execute on function app.schlacht_stand(bigint)                                   from public;
revoke execute on function app.schlacht_ziel(text)                                      from public, anon;
revoke execute on function app.schlacht_spezial(text)                                   from public, anon;
revoke execute on function app.admin_schlacht_starten(integer)                          from public, anon;
revoke execute on function app.admin_schlacht_beenden()                                 from public, anon;
revoke execute on function public.schlacht_ziel(text)                                   from public, anon;
revoke execute on function public.schlacht_spezial(text)                                from public, anon;
revoke execute on function public.admin_schlacht_starten(integer)                       from public, anon;
revoke execute on function public.admin_schlacht_beenden()                              from public, anon;
grant  execute on function app.schlacht_stand(bigint)                                   to anon, authenticated;
grant  execute on function public.schlacht_stand(bigint)                                to anon, authenticated;
grant  execute on function app.schlacht_ziel(text)                                      to authenticated;
grant  execute on function app.schlacht_spezial(text)                                   to authenticated;
grant  execute on function app.admin_schlacht_starten(integer)                          to authenticated;
grant  execute on function app.admin_schlacht_beenden()                                 to authenticated;
grant  execute on function public.schlacht_ziel(text)                                   to authenticated;
grant  execute on function public.schlacht_spezial(text)                                to authenticated;
grant  execute on function public.admin_schlacht_starten(integer)                       to authenticated;
grant  execute on function public.admin_schlacht_beenden()                              to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'sternenschlacht') then
      alter publication supabase_realtime add table public.sternenschlacht;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'sternenschlacht_aktionen') then
      alter publication supabase_realtime add table public.sternenschlacht_aktionen;
    end if;
  end if;
end $$;
