/* ======================================================
   STERNENSCHLACHT: DESIGN V2 - DREI NEUE KAMPFORTE UND
   EIN FUENFTER SCHIFFSTYP JE PARTEI
   ---------------------------------------------------
   Das Design V2 (Claude Design, "Schlacht Design") zeichnet in
   schiffe.js und schlacht-orte.js mehr, als die Datenbank bisher
   kennt. Diese Migration traegt es nach - nur Zeilen und eine
   erweiterte Pruefung, keine neue Kampfregel.

   1. KAMPFORTE (Tabelle aus 55). Ausgelost wird wie bisher aus allen
      Zeilen, sobald die Freigabe "schlachtOrte" an ist (56):
        pulsar    Pulsar Vela-9          Strahlenkegel, abwechselnd
                  Zielschuesse -15 %, Spezial +15 %
        friedhof  Schiffsfriedhof Nekros Minenfeld, abwechselnd
                  wendige Schiffe -10 %, Heilung +25 %, Schilde +10 %
        mondring  Ringe von Tethra       Mondschatten, abwechselnd
                  Dauerfeuer -10 %, wendige Schiffe +20 %
      Die Zahlen stehen genauso in schlacht-orte.js (STANDARD).

   2. FUENFTER TYP JE PARTEI (Tabelle aus 57). Schwere Grossschiffe:
      viel Leben, wenig Dauerfeuer, starker Spezialangriff. Gewaehlt
      wird wie jeder andere Typ - in der Sammelphase (57) bzw. fuer
      Menschen und Aliens auch im Hangar.
        schlachtschiff  Menschen   250 Leben  8 Schaden  sofort 550
        koenigin        Aliens     200        7          heilt 450
        rammer          Piraten    165       12          sofort 560
        titan           Maschinen  260        7          Gegner -45 %, 25 s
        kathedrale      Kristall   210        7          heilt 480
        leviathan       Geister    230       10          Gegner +40 %, 25 s
      Dieselben Zahlen in hangar-data.js.

   3. HANGAR (48): Die Liste der bekannten Typen und
      app.hangar_typ_passt() kennen bisher nur die acht Typen von
      Menschen und Aliens. Jetzt liest hangar_typ_passt() aus
      schlacht_typen - ein neuer Typ braucht dort nur noch seine Zeile
      (und einen Eintrag in hangar_typ_bekannt).

   Einspielen nach 62. Danach 63-schlacht-design-v2.test.sql.
====================================================== */

/* ======================================================
   1. KAMPFORTE
====================================================== */
insert into public.schlacht_orte
  (ort_id, dauerfeuer, ziel, wendig, spezial, heilung, schild, laden, ereignis_sek, ereignis_anteil, ereignis_art) values
  /* Der Strahl des Pulsars streift abwechselnd eine Seite; Sensoren flimmern. */
  ('pulsar',   1.00, 0.85, 1.00, 1.15, 1.00, 1.00, 1.00, 35, 0.020, 'abwechselnd'),
  /* Minen zwischen den Wracks; Ersatzteile und Deckung fuer die Reparatur. */
  ('friedhof', 1.00, 1.00, 0.90, 1.00, 1.25, 1.10, 1.00, 45, 0.025, 'abwechselnd'),
  /* Der Mondschatten verdeckt eine Seite; im Ring sind kleine Schiffe im Vorteil. */
  ('mondring', 0.90, 1.00, 1.20, 1.00, 1.00, 1.00, 1.00, 55, 0.015, 'abwechselnd')
on conflict (ort_id) do nothing;


/* ======================================================
   2. FUENFTER TYP JE PARTEI
====================================================== */
insert into public.schlacht_typen
  (typ, partei, ordnung, leben, schaden, anzahl, spezial_wirkung, spezial_betrifft, spezial_wert, spezial_je, spezial_sek) values
  ('schlachtschiff', 'menschen',  5, 250,  8, 1, 'schaden', 'gegner', 550, 0,    0),
  ('koenigin',       'aliens',    5, 200,  7, 1, 'heilung', 'eigene', 450, 0,    0),
  ('rammer',         'piraten',   5, 165, 12, 1, 'schaden', 'gegner', 560, 0,    0),
  ('titan',          'maschinen', 5, 260,  7, 1, 'fenster', 'eigene',   0, 0.45, 25),
  ('kathedrale',     'kristall',  5, 210,  7, 1, 'heilung', 'eigene', 480, 0,    0),
  ('leviathan',      'geister',   5, 230, 10, 1, 'fenster', 'gegner',   0, 0.40, 25)
on conflict (typ) do nothing;


/* ======================================================
   3. HANGAR
====================================================== */
alter table public.hangar_einheiten drop constraint if exists hangar_typ_bekannt;
alter table public.hangar_einheiten add constraint hangar_typ_bekannt check (typ in
  ('jaeger', 'fregatte', 'kreuzer', 'traeger', 'schlachtschiff',
   'drohne', 'stachel', 'weber', 'brutschiff', 'koenigin'));

/* NEU 63: aus schlacht_typen statt fester Liste (aus 48). */
create or replace function app.hangar_typ_passt(p_seite text, p_typ text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select p_seite in ('menschen', 'aliens')
     and exists (select 1 from public.schlacht_typen t where t.typ = p_typ and t.partei = p_seite)
$$;

revoke execute on function app.hangar_typ_passt(text, text) from public, anon, authenticated;
