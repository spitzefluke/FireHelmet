/* ======================================================
   STERNENSCHLACHT: KAMPFORTE MIT EIGENEN REGELN
   ---------------------------------------------------
   Jede Schlacht spielt an EINEM Ort, ausgelost beim Start (oder vom
   Admin gewaehlt). Der Ort aendert die Rechnung - fuer beide Seiten
   gleich, damit keine Seite einen festen Vorteil hat:

     dauerfeuer  Faktor auf das Dauerfeuer (Rundenlaenge)
     ziel        Faktor auf Zielschuesse (schlacht_ziel)
     wendig      zusaetzlicher Faktor auf Zielschuesse kleiner,
                 wendiger Schiffe (Jaeger, Drohne, Stachel)
     spezial     Faktor auf Spezial-SCHADEN
     heilung     Faktor auf Spezial-HEILUNG (Traeger)
     schild      Faktor auf die Dauer eigener Schutzfenster
                 (Fregatte, Kreuzer, Weber)
     laden       Faktor auf die Ladezeit des Spezials (60 s / 30 s)
     ereignis    alle ereignis_sek Sekunden ein Treffer des Orts
                 (Einschlag, Eruption, Blitz ...) mit ereignis_anteil
                 des Startlebens - 'beide' trifft beide Seiten,
                 'abwechselnd' wechselt (Startseite nach Rundennummer).

   Die Ereignisse sind reine Rechnung ueber die Zeit seit Rundenbeginn
   (wie das Dauerfeuer) - kein Takt, keine Zeilen. Der Browser zeigt
   sie zu denselben Zeitpunkten (schlacht-orte.js).

   Neue Fassungen: schlacht_leben (aus 50), schlacht_ziel (aus 49),
   schlacht_spezial (aus 50), admin_schlacht_starten (aus 50, jetzt mit
   p_ort). Der jeweilige Rumpf ist uebernommen, geaendert sind nur die
   mit "ORT" markierten Stellen.

   REIHENFOLGE: nach 54 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. ORTE
====================================================== */
create table if not exists public.schlacht_orte (
  ort_id           text primary key,
  dauerfeuer       numeric not null default 1,
  ziel             numeric not null default 1,
  wendig           numeric not null default 1,
  spezial          numeric not null default 1,
  heilung          numeric not null default 1,
  schild           numeric not null default 1,
  laden            numeric not null default 1,
  ereignis_sek     integer,
  ereignis_anteil  numeric not null default 0,
  ereignis_art     text not null default 'beide',
  constraint schlacht_ort_faktoren check (
    dauerfeuer between 0.5 and 2 and ziel between 0.5 and 2 and wendig between 0.5 and 2
    and spezial between 0.5 and 2 and heilung between 0.5 and 2 and schild between 0.5 and 2
    and laden between 0.25 and 2),
  constraint schlacht_ort_ereignis check (
    (ereignis_sek is null or ereignis_sek between 15 and 600)
    and ereignis_anteil between 0 and 0.1
    and ereignis_art in ('beide', 'abwechselnd'))
);

alter table public.schlacht_orte enable row level security;
alter table public.schlacht_orte force row level security;
drop policy if exists schlacht_orte_lesen on public.schlacht_orte;
create policy schlacht_orte_lesen on public.schlacht_orte for select to anon, authenticated using (true);
revoke all on public.schlacht_orte from anon, authenticated;
grant select on public.schlacht_orte to anon, authenticated;

insert into public.schlacht_orte
  (ort_id, dauerfeuer, ziel, wendig, spezial, heilung, schild, laden, ereignis_sek, ereignis_anteil, ereignis_art) values
  /* Einschlaege treffen abwechselnd; kleine Schiffe weichen aus und treffen besser. */
  ('asteroiden',    1.00, 1.00, 1.25, 1.00, 1.00, 1.00, 1.00, 40, 0.020, 'abwechselnd'),
  /* Der Sog beschleunigt alles; Gravitationsschleuder fuer Spezialangriffe. */
  ('schwarzes_loch', 1.25, 1.00, 1.00, 1.35, 0.70, 1.00, 1.00, 60, 0.015, 'beide'),
  /* Deckung in den Wracks, Ersatzteile fuer Reparaturen, Reaktorlecks. */
  ('station',       1.00, 0.80, 1.00, 1.00, 1.50, 1.30, 1.00, 50, 0.025, 'abwechselnd'),
  /* Ionensturm stoert die Zielsensoren; Blitze schlagen abwechselnd ein. */
  ('nebel',         1.00, 0.70, 1.00, 1.20, 1.00, 1.00, 1.00, 30, 0.015, 'abwechselnd'),
  /* Sonneneruptionen treffen beide; die Hitze laesst Schilde schneller fallen. */
  ('sonne',         1.15, 1.00, 1.00, 1.00, 1.20, 0.70, 1.00, 45, 0.030, 'beide'),
  /* Eiskristalle reflektieren: lange Schilde, langsamere Runden. */
  ('eisring',       0.85, 1.10, 1.00, 1.00, 1.00, 1.50, 1.00, 70, 0.010, 'abwechselnd'),
  /* Das Wurmloch laedt die Spezialantriebe doppelt so schnell. */
  ('wurmloch',      1.00, 1.00, 1.00, 1.10, 1.00, 1.00, 0.50, null, 0, 'beide')
on conflict (ort_id) do nothing;

alter table public.sternenschlacht add column if not exists ort text references public.schlacht_orte(ort_id);

/* Ort einer Schlacht; alte Schlachten ohne Ort rechnen neutral. */
create or replace function app.schlacht_ort(p_id bigint) returns public.schlacht_orte
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce(
    (select o from public.schlacht_orte o join public.sternenschlacht s on s.ort = o.ort_id where s.id = p_id),
    row('neutral', 1, 1, 1, 1, 1, 1, 1, null, 0, 'beide')::public.schlacht_orte)
$$;


/* ======================================================
   2. STAND (Rumpf aus 50)
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
    regen  := s.leben0_menschen * 0.0002 * sek;
  else
    leben0 := s.leben0_aliens;
    feuer  := s.dps_menschen * s.skala * s.formation_menschen;
  end if;
  feuer := feuer * o.dauerfeuer;   -- ORT

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

  /* ORT: Ereignisse seit Rundenbeginn. Bei 'abwechselnd' trifft das
     k-te Ereignis die Menschen, wenn k + Runde gerade ist. */
  if o.ereignis_sek is not null and o.ereignis_anteil > 0 then
    k := floor(sek / o.ereignis_sek);
    if o.ereignis_art = 'beide' then
      treffer := k;
    elsif (s.runde % 2 = 0) = (p_seite = 'menschen') then
      treffer := k / 2;            -- gerade k
    else
      treffer := k - k / 2;        -- ungerade k
    end if;
  end if;

  return greatest(0, least(leben0, leben0 - feuer * fenster - direkt + heil + regen
                                    - treffer * o.ereignis_anteil * leben0));
end
$$;


/* ======================================================
   3. ZIELSCHUSS (Rumpf aus 49)
====================================================== */
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
                * o.ziel * case when (ich.e).typ in ('jaeger', 'drohne', 'stachel') then o.wendig else 1 end, 1);   -- ORT

  insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert)
       values ((ich.s).id, uid, (ich.e).seite, 'ziel', p_ziel_uid, 'schaden', z.seite, wert);
  update public.sternenschlacht_einheiten
     set ziel_at = now(), schaden_gesamt = schaden_gesamt + wert
   where schlacht_id = (ich.s).id and firebase_uid = uid;
  return jsonb_build_object('ok', true, 'wert', wert, 'fokus', n);
end
$$;


/* ======================================================
   4. SPEZIALANGRIFF (Rumpf aus 50)
====================================================== */
create or replace function app.schlacht_spezial(p_ziel_uid text default null) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  ich     record;
  o       public.schlacht_orte;
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
  warten := round(case eigene when 'menschen' then 60 else 30 end * o.laden);   -- ORT
  if now() < r0 + make_interval(secs => warten) then
    return jsonb_build_object('ok', false, 'grund', 'laedt',
      'ab', r0 + make_interval(secs => warten));
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
  /* ORT */
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


/* ======================================================
   5. ADMIN: STARTEN MIT ORT (Rumpf aus 50)
   p_ort leer = auslosen. Die alte Fassung mit nur p_minuten muss
   weg, sonst waere ein Aufruf mit einem Argument mehrdeutig.
====================================================== */
drop function if exists public.admin_schlacht_starten(integer);
drop function if exists app.admin_schlacht_starten(integer);

create or replace function app.admin_schlacht_starten(p_minuten integer default 10, p_ort text default null) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid bigint;
  ort text;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  if p_ort is not null and p_ort <> '' then
    select ort_id into ort from public.schlacht_orte where ort_id = p_ort;
    if not found then
      raise exception 'ort-unbekannt';
    end if;
  else
    select ort_id into ort from public.schlacht_orte order by random() limit 1;
  end if;
  /* Eine faellige alte Schlacht (aus 49, mit Ende) erst abschliessen. */
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at is not null and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                      dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens, ort)
       values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0, ort)
  returning id into sid;
  perform app.schlacht_aufstellen(sid);
  return sid;
end
$$;

create or replace function public.admin_schlacht_starten(p_minuten integer default 10, p_ort text default null) returns bigint
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_schlacht_starten(p_minuten, p_ort) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.schlacht_ort(bigint)                         from public, anon, authenticated;
revoke execute on function app.admin_schlacht_starten(integer, text)        from public, anon;
revoke execute on function public.admin_schlacht_starten(integer, text)     from public, anon;
grant  execute on function app.admin_schlacht_starten(integer, text)        to authenticated;
grant  execute on function public.admin_schlacht_starten(integer, text)     to authenticated;
