/* ======================================================
   AUSBRUCH AUS DER VERWAHRUNG (Escape Room, Wettbewerb)
   ---------------------------------------------------
   Der Escape Room aus 67 (scripts/liveevent/zelle.js) wird zu vier
   Raeumen: Zelle C-17, Lueftungsschacht, Wachraum, Asservatenkammer.
   Bisher rechnete der Browser alles selbst. Fuer eine Bestenliste
   und gestaffelte Preise prueft jetzt die Datenbank:

   - zelle_start(p_vorschau): legt je Spieler und Verwahrung einen
     Lauf an (oder setzt den offenen fort). Die Raetsel wuerfelt
     app.zelle_raetsel() je Lauf neu - die Loesung laesst sich nicht
     weitersagen. Der Browser bekommt nur die Hinweise der Raeume,
     die er schon erreicht hat; die Loesungen verlassen die Tabelle
     nie (RLS ohne Policies, nur ueber diese Funktionen).
   - zelle_loesen(lauf, stufe, antwort): prueft die Antwort des
     Raums. Falsch kostet 30 s, hoechstens ein Versuch je 2 s. Jeder
     Raum hat eine Mindestzeit (90/45/90/30 s) - wer schneller ist,
     wartet ("zu-schnell"). Nach Raum 4 ist man draussen.
   - zelle_strafe(lauf, art): Tipp und Erwischt +60 s, Sensor +15 s.
   - zelle_bestenliste(): schnellste Zeit je Spieler.

   Zeit = Serverzeit vom Start bis zum Ausbruch + Strafen. Belohnung
   einmal je Verwahrung: bis 25 min 1500, bis 40 min 1000, sonst 500
   Dublonen, dazu der Titel "Ausbrecher". Scheitert die Gutschrift am
   Tagesdeckel (41), zaehlt der Lauf trotzdem, nur ohne Dublonen.
   Admin-Vorschau (p_vorschau): auch ohne Verwahrung, ohne Belohnung
   und nicht in der Bestenliste.

   Grenze: Wer das JavaScript liest, kann die Hinweise schneller
   deuten - die Mindestzeiten machen das unattraktiv, nicht
   unmoeglich. Virtuelle Waehrung, bewusst so.

   REIHENFOLGE: nach 71 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. TABELLE
====================================================== */
create table if not exists public.zelle_laeufe (
  lauf_id         uuid primary key default extensions.gen_random_uuid(),
  firebase_uid    text not null,
  verwahrung      text not null,            -- reise_welt_ab der Verwahrung, 'vorschau' beim Admin
  vorschau        boolean not null default false,
  daten           jsonb not null,           -- Hinweise je Raum ("1".."4")
  loesungen       jsonb not null,           -- nie herausgegeben
  stufe           smallint not null default 1,   -- 1..4 = Raum, 5 = draussen
  stufe_seit      timestamptz not null default now(),
  gestartet_am    timestamptz not null default now(),
  strafe_sek      integer not null default 0,
  strafen         smallint not null default 0,
  fehlversuche    smallint not null default 0,
  letzter_versuch timestamptz,
  fertig_am       timestamptz,
  zeit_sek        integer,
  belohnung       integer not null default 0,

  constraint zelle_stufe_ok  check (stufe between 1 and 5),
  constraint zelle_strafe_ok check (strafe_sek between 0 and 36000 and strafen between 0 and 400)
);
create index if not exists zelle_laeufe_spieler on public.zelle_laeufe (firebase_uid, verwahrung);
create index if not exists zelle_laeufe_beste on public.zelle_laeufe (zeit_sek) where fertig_am is not null and not vorschau;

alter table public.zelle_laeufe enable row level security;
revoke all on public.zelle_laeufe from public, anon, authenticated;

insert into public.event_titel (titel_id, text, stil) values ('zelle-ausbrecher', 'Ausbrecher', 'feuer')
on conflict (titel_id) do nothing;


/* ======================================================
   2. RAETSEL JE LAUF
   Raum 1  Kerben: vier Symbole an vier Orten der Zelle, je 1..9
           Striche; die Notiz nennt die Reihenfolge der Symbole.
           Loesung: die vier Zahlen in dieser Reihenfolge.
   Raum 2  Labyrinth aus "saat"; am Ende eine Sicherung mit Kennung
           (Loesung). Eingeritzt im Schacht: der Anfang der
           Notruffrequenz.
   Raum 3  Vier Kameras mit Symbolen, ein Rundgang (drei Kameras) -
           das ist der Spind-Code. Passwort des Terminals: ein Wort,
           um so viele Buchstaben verschoben, wie die Uhr zeigt.
           Loesung: das Wort. Das Terminal zeigt danach das
           Schaltmuster fuer den Sicherungskasten und den Rest der
           Frequenz (beides steht in Raum 4).
   Raum 4  Loesung: die Frequenz (z. B. 147.35).
====================================================== */
create or replace function app.zelle_raetsel() returns jsonb
language plpgsql volatile
set search_path = public, app, pg_temp
as $$
declare
  syms   text[] := array['kreis', 'dreieck', 'quadrat', 'kreuz'];
  orte   text[];
  folge  text[];
  zahl   int[] := array[]::int[];
  kerben jsonb := '[]'::jsonb;
  code   text := '';
  worte  text[] := array['ORION', 'KESTREL', 'ANKER', 'NEBULA', 'KOMET', 'LAGUNE', 'FALKE', 'ZENIT', 'POLARIS', 'TRITON', 'SEXTANT', 'KOMPASS'];
  wort   text;
  schieb int := 1 + floor(random() * 11)::int;
  verschl text := '';
  bilder text[];
  plan   int[];
  muster text := '';
  freq   text;
  sicherung text;
  saat   int := floor(random() * 1000000000)::int;
  i int;
begin
  orte  := (select array_agg(o order by random()) from unnest(array['pritsche', 'tuer', 'gitter', 'boden']) o);
  folge := (select array_agg(s order by random()) from unnest(syms) s);
  for i in 1..4 loop
    zahl := zahl || (1 + floor(random() * 9)::int);
    kerben := kerben || jsonb_build_object('sym', syms[i], 'ort', orte[i], 'n', zahl[i]);
  end loop;
  for i in 1..4 loop
    code := code || zahl[array_position(syms, folge[i])]::text;
  end loop;

  sicherung := 'F-' || (10 + floor(random() * 90)::int)::text;
  freq := (110 + floor(random() * 80)::int)::text || '.' || lpad(floor(random() * 100)::int::text, 2, '0');

  wort := worte[1 + floor(random() * array_length(worte, 1))::int];
  for i in 1..char_length(wort) loop
    verschl := verschl || chr(65 + (ascii(substr(wort, i, 1)) - 65 + schieb) % 26);
  end loop;
  bilder := (select array_agg(b order by random()) from unnest(array['anker', 'stern', 'mond', 'schaedel', 'welle', 'krone']) b);
  bilder := bilder[1:4];
  plan := (select array_agg(n order by random()) from unnest(array[1, 2, 3, 4]) n);
  plan := plan[1:3];
  loop
    muster := '';
    for i in 1..8 loop muster := muster || (floor(random() * 2)::int)::text; end loop;
    exit when muster ~ '0' and muster ~ '1';
  end loop;

  return jsonb_build_object(
    'daten', jsonb_build_object(
      '1', jsonb_build_object('kerben', kerben, 'folge', to_jsonb(folge)),
      '2', jsonb_build_object('saat', saat, 'sicherung', sicherung, 'kerbe', substr(freq, 1, 2)),
      '3', jsonb_build_object('kameras', to_jsonb(bilder), 'rundgang', to_jsonb(plan), 'uhr', schieb, 'notiz', verschl),
      '4', jsonb_build_object('muster', muster, 'log', substr(freq, 3))),
    'loesungen', jsonb_build_object('1', code, '2', sicherung, '3', wort, '4', freq));
end
$$;
revoke all on function app.zelle_raetsel() from public, anon, authenticated;


/* Was der Browser von einem Lauf sieht - ohne Loesungen. */
create or replace function app.zelle_sicht(l public.zelle_laeufe) returns jsonb
language sql stable
set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'ok', true, 'lauf', l.lauf_id, 'stufe', l.stufe, 'vorschau', l.vorschau,
    'gestartet_am', l.gestartet_am, 'jetzt', now(), 'strafe_sek', l.strafe_sek,
    'raeume', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(l.daten) e(k, v) where k::int <= least(l.stufe, 4)));
$$;
revoke all on function app.zelle_sicht(public.zelle_laeufe) from public, anon, authenticated;


/* ======================================================
   3. START, LOESEN, STRAFE, BESTENLISTE
====================================================== */
create or replace function app.zelle_start(p_vorschau boolean default false) returns jsonb
language plpgsql security definer
set search_path = public, app, extensions, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  ev   public.live_event;
  schl text;
  l    public.zelle_laeufe;
  r    jsonb;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if coalesce(p_vorschau, false) then
    if not app.is_admin() then
      raise exception 'nur-admin';
    end if;
    schl := 'vorschau';
  else
    select * into ev from public.live_event where id = 1;
    if ev.reise_welt is distinct from 'verwahrung' or ev.reise_welt_ab is null or ev.reise_welt_ab > now() then
      return jsonb_build_object('ok', false, 'grund', 'keine-verwahrung');
    end if;
    schl := to_char(ev.reise_welt_ab at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US');
  end if;

  select * into l from public.zelle_laeufe
   where firebase_uid = uid and verwahrung = schl and fertig_am is null
   order by gestartet_am desc limit 1;
  if not found then
    r := app.zelle_raetsel();
    insert into public.zelle_laeufe (firebase_uid, verwahrung, vorschau, daten, loesungen)
         values (uid, schl, coalesce(p_vorschau, false), r -> 'daten', r -> 'loesungen')
      returning * into l;
  end if;
  return app.zelle_sicht(l);
end
$$;

create or replace function app.zelle_bestenliste() returns jsonb
language plpgsql stable security definer
set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  mein integer;
begin
  select min(zeit_sek) into mein from public.zelle_laeufe
   where firebase_uid = uid and fertig_am is not null and not vorschau;
  return jsonb_build_object(
    'liste', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(p.nickname, 'Pirat'), 'zeit', b.zeit, 'am', b.am, 'ich', b.firebase_uid = uid) order by b.zeit, b.am)
        from (select firebase_uid, min(zeit_sek) as zeit, min(fertig_am) as am
                from public.zelle_laeufe where fertig_am is not null and not vorschau
               group by firebase_uid order by min(zeit_sek), min(fertig_am) limit 10) b
        left join public.players p on p.firebase_uid = b.firebase_uid), '[]'::jsonb),
    'mein', mein,
    'platz', case when mein is null then null else 1 + (
      select count(*) from (select firebase_uid from public.zelle_laeufe
                             where fertig_am is not null and not vorschau and firebase_uid <> uid
                             group by firebase_uid having min(zeit_sek) < mein) x) end);
end
$$;

create or replace function app.zelle_loesen(p_lauf uuid, p_stufe integer, p_antwort text) returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  l       public.zelle_laeufe;
  norm    text;
  soll    text;
  mindest integer;
  warte   integer;
  betrag  integer := 0;
  hinweis text := null;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into l from public.zelle_laeufe where lauf_id = p_lauf and firebase_uid = uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if l.fertig_am is not null then
    return jsonb_build_object('ok', false, 'grund', 'fertig');
  end if;
  if p_stufe is distinct from l.stufe::integer then
    return app.zelle_sicht(l) || jsonb_build_object('ok', false, 'grund', 'stufe');
  end if;
  if l.letzter_versuch is not null and l.letzter_versuch > now() - interval '2 seconds' then
    return jsonb_build_object('ok', false, 'grund', 'zu-oft');
  end if;
  update public.zelle_laeufe set letzter_versuch = now() where lauf_id = l.lauf_id;

  norm := upper(regexp_replace(replace(coalesce(p_antwort, ''), ',', '.'), '\s', '', 'g'));
  soll := upper(l.loesungen ->> l.stufe::text);
  if left(norm, 40) is distinct from soll then
    update public.zelle_laeufe
       set fehlversuche = least(fehlversuche + 1, 32000), strafe_sek = least(strafe_sek + 30, 36000)
     where lauf_id = l.lauf_id;
    return jsonb_build_object('ok', false, 'grund', 'falsch', 'strafe', 30);
  end if;

  mindest := (array[90, 45, 90, 30])[l.stufe];
  if now() < l.stufe_seit + make_interval(secs => mindest) then
    warte := ceil(extract(epoch from (l.stufe_seit + make_interval(secs => mindest) - now())))::integer;
    return jsonb_build_object('ok', false, 'grund', 'zu-schnell', 'warte', greatest(1, warte));
  end if;

  if l.stufe < 4 then
    update public.zelle_laeufe set stufe = stufe + 1, stufe_seit = now() where lauf_id = l.lauf_id returning * into l;
    return app.zelle_sicht(l);
  end if;

  /* Raum 4 geloest: draussen. */
  update public.zelle_laeufe
     set stufe = 5, fertig_am = now(),
         zeit_sek = ceil(extract(epoch from (now() - gestartet_am)))::integer + strafe_sek
   where lauf_id = l.lauf_id returning * into l;

  if not l.vorschau and not exists (
      select 1 from public.zelle_laeufe
       where firebase_uid = uid and verwahrung = l.verwahrung and belohnung > 0 and lauf_id <> l.lauf_id) then
    betrag := case when l.zeit_sek <= 1500 then 1500 when l.zeit_sek <= 2400 then 1000 else 500 end;
    begin
      insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
      update public.players set currency = currency + betrag where firebase_uid = uid;
      update public.zelle_laeufe set belohnung = betrag where lauf_id = l.lauf_id;
    exception when others then
      /* Tagesdeckel (41) oder Kontosperre: Der Lauf zaehlt, nur ohne Dublonen. */
      betrag := 0;
      hinweis := sqlerrm;
    end;
    insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, 'zelle-ausbrecher')
    on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
  end if;

  return jsonb_build_object('ok', true, 'fertig', true, 'zeit_sek', l.zeit_sek, 'strafe_sek', l.strafe_sek,
    'belohnung', betrag, 'hinweis', hinweis, 'vorschau', l.vorschau,
    'titel', case when l.vorschau then null else (select text from public.event_titel where titel_id = 'zelle-ausbrecher') end,
    'bestenliste', app.zelle_bestenliste());
end
$$;

create or replace function app.zelle_strafe(p_lauf uuid, p_art text) returns jsonb
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  sek  integer := case p_art when 'tipp' then 60 when 'erwischt' then 60 when 'sensor' then 15 else null end;
  neu  integer;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if sek is null then
    return jsonb_build_object('ok', false, 'grund', 'art');
  end if;
  update public.zelle_laeufe
     set strafe_sek = least(strafe_sek + sek, 36000), strafen = least(strafen + 1, 400)
   where lauf_id = p_lauf and firebase_uid = uid and fertig_am is null and strafen < 400
  returning strafe_sek into neu;
  if neu is null then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  return jsonb_build_object('ok', true, 'strafe_sek', neu);
end
$$;


/* ======================================================
   4. WRAPPER UND RECHTE (wie 67: die app-Funktionen sind gesperrt,
      der Browser ruft die Wrapper in public)
====================================================== */
create or replace function public.zelle_start(p_vorschau boolean default false) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.zelle_start(p_vorschau) $$;
create or replace function public.zelle_loesen(p_lauf uuid, p_stufe integer, p_antwort text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.zelle_loesen(p_lauf, p_stufe, p_antwort) $$;
create or replace function public.zelle_strafe(p_lauf uuid, p_art text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.zelle_strafe(p_lauf, p_art) $$;
create or replace function public.zelle_bestenliste() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.zelle_bestenliste() $$;

revoke execute on function app.zelle_start(boolean)                from public, anon, authenticated;
revoke execute on function app.zelle_loesen(uuid, integer, text)   from public, anon, authenticated;
revoke execute on function app.zelle_strafe(uuid, text)            from public, anon, authenticated;
revoke execute on function app.zelle_bestenliste()                 from public, anon, authenticated;
revoke execute on function public.zelle_start(boolean)              from public, anon;
revoke execute on function public.zelle_loesen(uuid, integer, text) from public, anon;
revoke execute on function public.zelle_strafe(uuid, text)          from public, anon;
revoke execute on function public.zelle_bestenliste()               from public, anon;
grant  execute on function public.zelle_start(boolean)              to authenticated;
grant  execute on function public.zelle_loesen(uuid, integer, text) to authenticated;
grant  execute on function public.zelle_strafe(uuid, text)          to authenticated;
grant  execute on function public.zelle_bestenliste()               to authenticated;


/* ======================================================
   5. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.zelle_konto_aufraeumen() returns trigger
language plpgsql security definer
set search_path = public, app, pg_temp
as $$
begin
  delete from public.zelle_laeufe where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists zelle_konto_aufraeumen on public.players;
create trigger zelle_konto_aufraeumen
  after delete on public.players
  for each row execute function app.zelle_konto_aufraeumen();
revoke execute on function app.zelle_konto_aufraeumen() from public, anon, authenticated;
