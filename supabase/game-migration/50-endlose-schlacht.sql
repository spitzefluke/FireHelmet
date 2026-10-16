/* ======================================================
   ZEITMASCHINE 2100: ENDLOSE STERNENSCHLACHT IN RUNDEN
   UND ADMIN-TEST AUSSERHALB VON 2100
   ---------------------------------------------------
   1. ENDLOS IN RUNDEN
      Eine Schlacht laeuft ab dem Start, bis der Admin sie beendet
      (ende_at bleibt leer, endlos = true). Sie ist in Runden geteilt:
      Faellt eine Seite auf 0, bekommt die andere einen Rundensieg
      (beide zugleich: unentschieden, kein Punkt), und beide Flotten
      starten wieder voll. Zu jeder neuen Runde stellt die Datenbank
      die Flotten neu auf (schlacht_aufstellen):
        - wer inzwischen eine Seite gewaehlt hat, kaempft mit,
        - Hangar-Ausbauten und Typwechsel gelten ab jetzt,
        - der Spezialangriff ist wieder frei (einmal je Runde),
        - die Ladezeit des Spezials (60 s / 30 s) zaehlt ab Rundenbeginn.
      Der Typwechsel im Hangar ist deshalb nicht mehr gesperrt
      (hangar_typ_waehlen wieder wie in 48).

      Das Tempo (p_minuten, 3..30, Standard 10) ersetzt die Dauer:
      skala ist so gewaehlt, dass das Dauerfeuer allein bei gleich
      starken Seiten in dieser Zeit rund 87 % abtraegt - eine Runde
      dauert also etwa so lange, den Rest entscheiden die Spieler.

      Beim Beenden siegt, wer mehr Runden gewonnen hat; bei Gleichstand
      entscheidet der Stand der laufenden Runde.

   2. UEBUNGSFLOTTE
      Hat eine Seite niemanden, kaempft dort eine Uebungsflotte mit
      denselben Gesamtwerten wie die Gegenseite (3 bis 12 Schiffe,
      firebase_uid 'ki-...'). Sie handelt nie selbst und taucht im
      Ruhm nicht auf. Sobald ein echter Spieler die Seite waehlt,
      ersetzt er sie ab der naechsten Runde.

   3. ADMIN-TEST AUSSERHALB VON 2100
      Die "Vorschau 2100" im Admin-Bereich ist nur Anzeige - die
      Datenbank kannte bisher nur das echte Jahr, deshalb scheiterten
      dort Seitenwahl, Hangar und Schlachtstart ("nur im Jahr 2100").
      Jetzt duerfen Seitenwahl (seite_waehlen) und Hangar (hangar_vorab)
      fuer den Admin auch ausserhalb von 2100, und der Admin startet
      die Schlacht in jedem Jahr. Fuer alle anderen bleibt es bei 2100.
      Boni (seite_boss_faktor) und die Rennsperre haengen weiter nur am
      echten Jahr.

   Schlachten aus 49 (mit fester ende_at) rechnet die Datenbank
   weiter wie bisher.

   STAND OHNE SEKUNDENSCHLEIFE
   Die Summe der Wirkfenster lief in 49 Sekunde fuer Sekunde
   (generate_series). Bei einer endlosen Schlacht waeren das nach
   einem Tag 86 400 Zeilen je Abruf. schlacht_leben rechnet sie jetzt
   ueber die Abschnitte zwischen den Fenstergrenzen - genau, und nur so
   viele Zeilen wie Fenster.

   REIHENFOLGE: nach 49 einspielen. Von Hand, im SQL-Editor.
   Idempotent.
====================================================== */


/* ======================================================
   1. SPALTEN
====================================================== */
alter table public.sternenschlacht alter column ende_at drop not null;
alter table public.sternenschlacht add column if not exists endlos          boolean not null default false;
alter table public.sternenschlacht add column if not exists tempo_sek       integer;
alter table public.sternenschlacht add column if not exists runde           integer not null default 1;
alter table public.sternenschlacht add column if not exists runde_at        timestamptz;
alter table public.sternenschlacht add column if not exists punkte_menschen integer not null default 0;
alter table public.sternenschlacht add column if not exists punkte_aliens   integer not null default 0;
alter table public.sternenschlacht add column if not exists runden          jsonb not null default '[]'::jsonb;


/* ======================================================
   2. STAND (neue Fassung von 49)
   Leben je Seite zum Zeitpunkt p_zeit, gerechnet ab Beginn der
   laufenden Runde (bei Schlachten aus 49: ab dem Start).
====================================================== */
create or replace function app.schlacht_leben(p_id bigint, p_seite text, p_zeit timestamptz) returns numeric
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s        public.sternenschlacht;
  r0       timestamptz;
  t        timestamptz;
  sek      numeric;
  leben0   numeric;
  feuer    numeric;
  fenster  numeric;
  direkt   numeric;
  heil     numeric;
  regen    numeric := 0;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then return null; end if;
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

  /* Summe der Fenster-Faktoren ueber die Zeit: Abschnitte zwischen
     allen Fenstergrenzen, je Abschnitt das Produkt der Fenster, die
     in seiner Mitte wirken (ohne Fenster = 1), mal seiner Laenge. */
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

  return greatest(0, least(leben0, leben0 - feuer * fenster - direkt + heil + regen));
end
$$;


/* ======================================================
   3. AUFSTELLEN (Start und jede neue Runde)
   Holt alle Spieler mit Seite samt Hangar-Einheit in die Schlacht,
   ergaenzt bei leerer Seite die Uebungsflotte und rechnet Startleben,
   Dauerfeuer, Formation und skala fuer die neue Runde.
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
begin
  select * into s from public.sternenschlacht where id = p_id for update;
  if not found then
    raise exception 'unbekannt';
  end if;

  /* Uebungsflotte und alle, die nicht mehr mitkaempfen duerfen, raus. */
  delete from public.sternenschlacht_einheiten u
   where u.schlacht_id = p_id
     and (u.firebase_uid like 'ki-%'
          or not exists (select 1 from public.players p
                          where p.firebase_uid = u.firebase_uid and p.seite in ('menschen', 'aliens')
                            and not private.account_is_suspended(p.firebase_uid)));

  /* Echte Spieler: neu dazu oder mit aktuellen Hangar-Werten. */
  insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, typ, leben, schaden, spezial)
  select p_id, p.firebase_uid, p.nickname, p.seite, x.typ, w.leben, w.schaden, w.spezial
    from public.players p
    left join public.hangar_einheiten h on h.firebase_uid = p.firebase_uid
    cross join lateral (select case when h.typ is not null and app.hangar_typ_passt(p.seite, h.typ) then h.typ
                                    when p.seite = 'aliens' then 'drohne' else 'jaeger' end as typ) x
    cross join lateral app.schlacht_werte(x.typ, p.seite, h.stufe_leben, h.stufe_schaden, h.stufe_spezial) w
   where p.seite in ('menschen', 'aliens')
     and not private.account_is_suspended(p.firebase_uid)
  on conflict (schlacht_id, firebase_uid) do update
     set nickname = excluded.nickname, seite = excluded.seite, typ = excluded.typ,
         leben = excluded.leben, schaden = excluded.schaden, spezial = excluded.spezial;

  select count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into nm, na
    from public.sternenschlacht_einheiten where schlacht_id = p_id;
  if nm = 0 and na = 0 then
    raise exception 'zu-wenige-kaempfer';
  end if;

  /* Uebungsflotte fuer eine leere Seite: gleiche Gesamtwerte wie die
     Gegenseite, verteilt auf 3 bis 12 Schiffe. */
  if nm = 0 or na = 0 then
    leer := case when nm = 0 then 'menschen' else 'aliens' end;
    select sum(leben), sum(schaden), count(*) into gl, gs, gn
      from public.sternenschlacht_einheiten where schlacht_id = p_id and seite <> leer;
    n := least(12, greatest(3, gn));
    insert into public.sternenschlacht_einheiten (schlacht_id, firebase_uid, nickname, seite, typ, leben, schaden, spezial)
    select p_id, 'ki-' || leer || '-' || i, 'Übungsflotte', leer,
           case leer when 'menschen' then 'jaeger' else 'drohne' end,
           greatest(1, round(gl / n)), greatest(0.1, round(gs / n * 10) / 10.0), 1
      from generate_series(1, n) as i;
  end if;

  select coalesce(sum(leben) filter (where seite = 'menschen'), 0), coalesce(sum(leben) filter (where seite = 'aliens'), 0),
         coalesce(sum(schaden) filter (where seite = 'menschen'), 0), coalesce(sum(schaden) filter (where seite = 'aliens'), 0),
         count(*) filter (where seite = 'menschen'), count(*) filter (where seite = 'aliens')
    into lm, la, dm, da, nm, na
    from public.sternenschlacht_einheiten where schlacht_id = p_id;

  form := 1 + least(0.2, 0.02 * nm);
  update public.sternenschlacht
     set skala = (lm + la) / ((dm * form + da) * coalesce(s.tempo_sek, 600) * 1.15),
         leben0_menschen = lm, leben0_aliens = la, dps_menschen = dm, dps_aliens = da,
         formation_menschen = form, anzahl_menschen = nm, anzahl_aliens = na,
         runde_at = now()
   where id = p_id;
end
$$;


/* ======================================================
   4. RUNDENWECHSEL
   Ist in einer endlosen Schlacht eine Seite bei 0: Punkt fuer die
   andere, Runde festhalten, neu aufstellen. Unter Sperre und mit
   erneuter Pruefung - viele Browser fragen gleichzeitig.
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
  if not found or s.status <> 'laeuft' or not s.endlos then return; end if;
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


/* ======================================================
   5. ABSCHLUSS UND STAND (neue Fassungen von 49)
====================================================== */
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

  update public.sternenschlacht
     set status = 'vorbei',
         ende_at = ende,
         sieger = gewinner,
         endstand_menschen = case when rm + ra > 0 then round(100 * rm / (rm + ra), 1) else 50 end,
         ruhm = jsonb_build_object(
           'menschen', (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'menschen' and schaden_gesamt > 0
                                   and firebase_uid not like 'ki-%'
                                 order by schaden_gesamt desc limit 2) x),
           'aliens',   (select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'schaden', round(schaden_gesamt))), '[]'::jsonb)
                          from (select nickname, schaden_gesamt from public.sternenschlacht_einheiten
                                 where schlacht_id = p_id and seite = 'aliens' and schaden_gesamt > 0
                                   and firebase_uid not like 'ki-%'
                                 order by schaden_gesamt desc limit 2) x))
   where id = p_id;
end
$$;

create or replace function app.schlacht_stand(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  s  public.sternenschlacht;
  lm numeric; la numeric; rm numeric; ra numeric;
  t  timestamptz;
begin
  select * into s from public.sternenschlacht where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
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
    'sieger', s.sieger, 'ruhm', s.ruhm);
end
$$;


/* ======================================================
   6. ADMIN: STARTEN (neue Fassung von 49)
   Endlos; p_minuten ist jetzt das Tempo einer Runde. Kein Jahr-
   Check mehr - der Admin darf auch in der Vorschau testen.
====================================================== */
create or replace function app.admin_schlacht_starten(p_minuten integer default 10) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid bigint;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  /* Eine faellige alte Schlacht (aus 49, mit Ende) erst abschliessen. */
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at is not null and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                      dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens)
       values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0)
  returning id into sid;
  perform app.schlacht_aufstellen(sid);
  return sid;
end
$$;


/* ======================================================
   7. MITKAEMPFEN (neue Fassungen von 49)
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
    /* Seite gewaehlt, aber erst nach dem Aufstellen: ab der naechsten Runde. */
    if s.endlos and exists (select 1 from public.players where firebase_uid = p_uid and seite in ('menschen', 'aliens')) then
      grund := 'naechste-runde';
    else
      grund := 'nicht-dabei';
    end if;
    return;
  end if;
end
$$;

/* Wie in 49, aber einmal je RUNDE; die Ladezeit zaehlt ab Rundenbeginn. */
create or replace function app.schlacht_spezial(p_ziel_uid text default null) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  ich     record;
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
  r0 := coalesce((ich.s).runde_at, (ich.s).start_at);
  if (ich.e).spezial_at is not null and (ich.e).spezial_at >= r0 then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  eigene := (ich.e).seite;
  gegner := case eigene when 'menschen' then 'aliens' else 'menschen' end;
  warten := case eigene when 'menschen' then 60 else 30 end;
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
   8. HANGAR: TYPWECHSEL WIEDER FREI
   hangar_typ_waehlen wortgleich wie in 48 - in der endlosen Schlacht
   gilt ein neuer Typ ab der naechsten Runde.
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

  insert into public.hangar_einheiten (firebase_uid, typ) values (uid, p_typ)
  on conflict (firebase_uid) do update set typ = excluded.typ, updated_at = now()
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid');
end
$$;


/* ======================================================
   9. ADMIN-TEST: SEITENWAHL UND HANGAR AUCH AUSSERHALB VON 2100
   Beide wortgleich aus 47 bzw. 48, nur die Jahr-Pruefung laesst den
   Admin durch.
====================================================== */
create or replace function app.seite_waehlen(p_seite text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  alt text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_seite is null or p_seite not in ('menschen', 'aliens') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if app.epoche_jetzt() <> '2100' and not app.is_admin() then
    return jsonb_build_object('ok', false, 'grund', 'nicht-2100');
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;

  insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
  select seite into alt from public.players where firebase_uid = uid for update;
  if alt is not null then
    return jsonb_build_object('ok', false, 'grund', 'schon', 'seite', alt);
  end if;
  update public.players set seite = p_seite where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'seite', p_seite);
end
$$;

create or replace function app.hangar_vorab(p_uid text) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s text;
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return '!gesperrt';
  end if;
  if app.epoche_jetzt() <> '2100' and not app.is_admin() then
    return '!nicht-2100';
  end if;
  select seite into s from public.players where firebase_uid = p_uid;
  if s is null then
    return '!keine-seite';
  end if;
  return s;
end
$$;


/* ======================================================
   10. RECHTE
   Die neu gefassten Funktionen behalten ihre Rechte aus 47-49.
   "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28).
====================================================== */
revoke execute on function app.schlacht_aufstellen(bigint)    from public, anon, authenticated;
revoke execute on function app.schlacht_runde_pruefen(bigint) from public, anon, authenticated;
