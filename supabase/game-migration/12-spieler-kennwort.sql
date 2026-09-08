/* ======================================================
   SPIELER-KENNWORT (Identitaet ueber Geraetewechsel retten)
   ---------------------------------------------------
   WARUM DAS NOETIG IST (echter Vorfall, 08.09.2026):
   Jeder Besucher bekommt ueber signInAnonymously() ein anonymes
   Konto, dessen Sitzung ausschliesslich im Browserspeicher liegt.
   Raeumt der Browser den weg - Safari/iOS kappt skript-schreibbaren
   Speicher nach 7 Tagen, ebenso privates Fenster, Verlauf loeschen,
   anderes Geraet -, bekommt dieselbe Person beim naechsten Besuch
   ein NEUES Konto mit neuer ID. Alles, was an der alten ID hing
   (Dublonen, Level, Schiffsreparatur, Turnier-Anmeldung), ist damit
   fuer sie unerreichbar.

   Nachgewiesen in der Live-Datenbank: ein Spieler hatte in 17 Tagen
   SIEBEN Identitaeten unter demselben Namen; zwei Turnierteilnehmer
   konnten deshalb ihr Match nicht spielen.

   LOESUNG: jeder Spieler bekommt ein achtstelliges Kennwort. Wer es
   auf einem anderen Geraet (oder nach einem Speicher-Verlust)
   eingibt, bekommt seine alten Daten auf das neue Konto umgezogen.

   WARUM UMZIEHEN STATT ANMELDEN: eine bestehende Supabase-Sitzung
   laesst sich vom Browser aus nicht auf eine fremde Benutzer-ID
   umschreiben - dafuer braeuchte es den Dienstschluessel, der
   niemals in den Browser gehoert. Umgekehrt geht es aber sauber:
   der Besucher meldet sich wie immer anonym an und die Datenbank
   schreibt die alten Zeilen auf diese neue ID um.

   SICHERHEIT:
   - Die Kennwort-Tabellen haben bewusst GAR KEINE Policy. Weder
     lesen noch schreiben ist direkt moeglich, alles laeuft ueber die
     SECURITY DEFINER-Funktionen unten. Ein Spieler kann also weder
     fremde Kennwoerter auslesen noch das eigene faelschen.
   - Hoechstens 10 Fehlversuche je Konto und 24 Stunden.
   - Ein Umzug geht nur auf ein LEERES Konto. Damit kann niemand mit
     einem erratenen Kennwort ein bespieltes Konto ueberschreiben,
     und niemand verliert versehentlich eigenen Fortschritt.
====================================================== */


/* ======================================================
   1. TABELLEN
====================================================== */
create table if not exists public.player_identity_codes (
  firebase_uid text primary key,
  code text not null unique,
  created_at timestamptz not null default now(),
  last_moved_at timestamptz,

  constraint player_identity_codes_len check (char_length(code) = 8)
);

alter table public.player_identity_codes enable row level security;
alter table public.player_identity_codes force row level security;
-- BEWUSST KEINE POLICY: siehe Dateikopf.

create table if not exists public.player_identity_versuche (
  firebase_uid text primary key,
  anzahl integer not null default 0,
  fenster_start timestamptz not null default now()
);

alter table public.player_identity_versuche enable row level security;
alter table public.player_identity_versuche force row level security;
-- BEWUSST KEINE POLICY: siehe Dateikopf.

/* Zusaetzlich zur fehlenden Policy auch die Tabellenrechte entziehen.
   Supabase vergibt ueber "alter default privileges" automatisch Rechte
   an anon/authenticated fuer jede neu angelegte Tabelle in public -
   ohne dieses revoke waere die Tabelle also erreichbar und nur durch
   RLS geschuetzt (die dann zwar 0 Zeilen liefert, aber eben keinen
   Fehler). Mit beidem greift die Sperre auf zwei Ebenen. */
revoke all on public.player_identity_codes    from anon, authenticated;
revoke all on public.player_identity_versuche from anon, authenticated;


/* ======================================================
   2. KENNWORT ERZEUGEN UND ABFRAGEN
====================================================== */

-- Zeichenvorrat ohne 0/O und 1/I/L - beim Abschreiben vom Bildschirm
-- oder Vorlesen im Stream sind das die klassischen Verwechslungen.
-- 32^8 = rund 1,1 Billionen Moeglichkeiten.
create or replace function app.kennwort_wuerfeln() returns text
language sql volatile
as $$
  select string_agg(
           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
           '')
    from generate_series(1, 8)
$$;

-- Das eigene Kennwort. Beim ersten Aufruf wird eines angelegt -
-- deshalb "volatile" und nicht "stable".
create or replace function app.mein_kennwort() returns text
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  c text;
  versuch int := 0;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select code into c from public.player_identity_codes where firebase_uid = uid;
  if c is not null then
    return c;
  end if;

  -- Bei einem Zusammenstoss (astronomisch unwahrscheinlich, aber der
  -- unique-Index entscheidet, nicht die Wahrscheinlichkeit) einfach
  -- neu wuerfeln.
  loop
    versuch := versuch + 1;
    c := app.kennwort_wuerfeln();
    begin
      insert into public.player_identity_codes (firebase_uid, code) values (uid, c);
      return c;
    exception when unique_violation then
      if versuch >= 10 then
        raise exception 'kennwort-erzeugung-fehlgeschlagen';
      end if;
    end;
  end loop;
end
$$;

create or replace function public.mein_kennwort() returns text
language sql
as $$ select app.mein_kennwort() $$;

grant execute on function app.mein_kennwort() to authenticated;
grant execute on function public.mein_kennwort() to authenticated;


/* ======================================================
   3. DER EIGENTLICHE UMZUG
   ---------------------------------------------------
   Welche Tabellen wandern mit - und welche bewusst nicht:

   MIT: alles, was Besitz oder Teilnahme ist (Spielerkonto, Level,
   Schiffsreparatur, Boss-Angriffszustand, Cap-Zusage, Wochenrennen,
   Boss-Schaden, Turnier-Anmeldung und -Matches, Gewinner-Eintraege,
   Verlosungslose).

   OHNE: reine Protokolle (spielothek_rounds, community_boss_attacks,
   leaderboard_snapshots, boss_community_buff, support_reports,
   site_ratings). Die halten fest, WAS WANN passiert ist - das
   nachtraeglich einer anderen ID zuzuschreiben waere eine
   Geschichtsfaelschung und bringt dem Spieler nichts.

   Zeilen des Zielkontos werden vorher geloescht, sonst kollidieren
   die Primaerschluessel. Bei der Spieler-Variante ist das folgenlos
   (das Ziel MUSS leer sein, siehe kennwort_einloesen); beim
   Admin-Werkzeug ersetzt das alte Konto das neue vollstaendig.
====================================================== */
create or replace function app.identitaet_umziehen(p_alt text, p_neu text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if p_alt is null or p_neu is null or p_alt = p_neu then
    raise exception 'ungueltige-ids';
  end if;

  -- Zielzeilen raeumen
  delete from public.players               where firebase_uid = p_neu;
  delete from public.ship_repair           where firebase_uid = p_neu;
  delete from public.player_progression    where firebase_uid = p_neu;
  delete from public.boss_attack_state     where firebase_uid = p_neu;
  delete from public.pass_cap_grants       where firebase_uid = p_neu;
  delete from public.race_progress         where firebase_uid = p_neu;
  delete from public.community_boss_damage where firebase_uid = p_neu;
  delete from public.giveaway_entries      where firebase_uid = p_neu;
  delete from public.tournament_participants where firebase_uid = p_neu;

  -- Besitz umschreiben
  update public.players               set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.ship_repair           set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.player_progression    set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.boss_attack_state     set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.pass_cap_grants       set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.race_progress         set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.community_boss_damage set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.giveaway_entries      set firebase_uid = p_neu where firebase_uid = p_alt;
  update public.tournament_participants set firebase_uid = p_neu where firebase_uid = p_alt;

  -- Turnierbaum: die ID steht in drei Spalten
  update public.tournament_matches set player_1_uid = p_neu where player_1_uid = p_alt;
  update public.tournament_matches set player_2_uid = p_neu where player_2_uid = p_alt;
  update public.tournament_matches set winner_uid   = p_neu where winner_uid   = p_alt;
  update public.tournaments        set winner_uid   = p_neu where winner_uid   = p_alt;
  update public.tournament_prize   set winner_uid   = p_neu where winner_uid   = p_alt;

  -- Das Kennwort wandert mit, damit es beim naechsten Geraetewechsel
  -- wieder funktioniert.
  delete from public.player_identity_codes where firebase_uid = p_neu;
  update public.player_identity_codes
     set firebase_uid = p_neu, last_moved_at = now()
   where firebase_uid = p_alt;
end
$$;


/* ======================================================
   4. KENNWORT EINLOESEN (Spieler)
   ---------------------------------------------------
   GIBT EINEN STATUS ZURUECK STATT ZU WERFEN - und das ist kein
   Stilfrage, sondern noetig: eine plpgsql-Funktion, die
   "raise exception" ausloest, macht ALLES zurueck, was sie selbst
   geschrieben hat. Der Fehlversuchszaehler waere damit bei jedem
   Fehlversuch wieder auf dem alten Stand gelandet und die Bremse
   haette nie gegriffen (im Test nachgewiesen: nach zehn falschen
   Codes stand der Zaehler weiter auf 0).

   Moegliche Rueckgaben:
     'ok'               - Umzug erledigt
     'schon-du'         - der Code gehoert schon diesem Konto
     'code-ungueltig'   - nicht acht Zeichen
     'code-unbekannt'   - kein Konto zu diesem Code
     'ziel-nicht-leer'  - hier wurde schon gespielt
     'zu-viele-versuche'- Bremse hat zugeschlagen
====================================================== */
create or replace function app.kennwort_einloesen(p_code text) returns text
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  neu text := app.firebase_uid();
  alt text;
  norm text;
  offen int;
begin
  if neu is null then
    raise exception 'nicht-angemeldet';
  end if;

  -- Bindestriche, Leerzeichen und Kleinschreibung verzeihen
  norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(norm) <> 8 then
    return 'code-ungueltig';
  end if;

  /* Bremse gegen Durchprobieren: 10 Fehlversuche je Konto und 24
     Stunden. Der Zaehler laeuft VOR der Pruefung hoch und wird bei
     Erfolg zurueckgesetzt - so kostet nur das Raten. */
  insert into public.player_identity_versuche (firebase_uid) values (neu)
    on conflict (firebase_uid) do nothing;

  update public.player_identity_versuche
     set anzahl        = case when fenster_start < now() - interval '24 hours' then 0 else anzahl end,
         fenster_start = case when fenster_start < now() - interval '24 hours' then now() else fenster_start end
   where firebase_uid = neu;

  select anzahl into offen from public.player_identity_versuche where firebase_uid = neu;
  if offen >= 10 then
    return 'zu-viele-versuche';
  end if;
  update public.player_identity_versuche set anzahl = anzahl + 1 where firebase_uid = neu;

  select firebase_uid into alt from public.player_identity_codes where code = norm;
  if alt is null then
    return 'code-unbekannt';
  end if;
  if alt = neu then
    update public.player_identity_versuche set anzahl = 0 where firebase_uid = neu;
    return 'schon-du';
  end if;

  /* Das Zielkonto muss leer sein. Sonst koennte ein erratenes
     Kennwort ein bespieltes Konto ueberschreiben - und niemand soll
     aus Versehen den eigenen Fortschritt wegwerfen. */
  if exists (
    select 1 from public.players
     where firebase_uid = neu
       and (currency > 0 or games_played > 0 or total_currency_earned > 0)
  ) or exists (
    select 1 from public.player_progression where firebase_uid = neu and xp > 0
  ) or exists (
    select 1 from public.tournament_participants where firebase_uid = neu
  ) then
    return 'ziel-nicht-leer';
  end if;

  update public.player_identity_versuche set anzahl = 0 where firebase_uid = neu;
  perform app.identitaet_umziehen(alt, neu);
  return 'ok';
end
$$;

create or replace function public.kennwort_einloesen(p_code text) returns text
language sql
as $$ select app.kennwort_einloesen(p_code) $$;

grant execute on function app.kennwort_einloesen(text) to authenticated;
grant execute on function public.kennwort_einloesen(text) to authenticated;


/* ======================================================
   5. ADMIN-WERKZEUGE
   ---------------------------------------------------
   Fuer den Fall, dass sich jemand meldet, dessen Kennwort weg ist -
   dann ist die Identitaetspruefung deine Aufgabe (Stream, Discord),
   nicht die der Datenbank.
====================================================== */

-- Wer steckt hinter einem Namen? Liefert alle Konten zu einem Namen,
-- neueste zuerst, mit dem Hinweis, welches im laufenden Turnier steht.
create or replace function app.admin_konten_zu_name(p_name text)
returns table (firebase_uid text, angelegt timestamptz, currency integer, im_turnier boolean)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select p.firebase_uid,
           u.created_at,
           p.currency,
           exists (select 1 from public.tournament_participants tp
                    where tp.firebase_uid = p.firebase_uid) as im_turnier
      from public.players p
      left join auth.users u on u.id::text = p.firebase_uid
     where lower(p.nickname) = lower(p_name)
     order by u.created_at desc nulls last;
end
$$;

create or replace function public.admin_konten_zu_name(p_name text)
returns table (firebase_uid text, angelegt timestamptz, currency integer, im_turnier boolean)
language sql
as $$ select * from app.admin_konten_zu_name(p_name) $$;

-- Nur die Turnierzeilen umhaengen (der kleine Eingriff waehrend eines
-- laufenden Turniers - Dublonen und Level bleiben, wo sie sind).
create or replace function app.admin_teilnehmer_umhaengen(p_tournament_id text, p_alt text, p_neu text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_alt = p_neu then
    raise exception 'ungueltige-ids';
  end if;
  if not exists (select 1 from public.tournament_participants
                  where tournament_id = p_tournament_id and firebase_uid = p_alt) then
    raise exception 'alt-nicht-teilnehmer';
  end if;
  if exists (select 1 from public.tournament_participants
              where tournament_id = p_tournament_id and firebase_uid = p_neu) then
    raise exception 'neu-schon-teilnehmer';
  end if;

  update public.tournament_participants set firebase_uid = p_neu
   where tournament_id = p_tournament_id and firebase_uid = p_alt;
  update public.tournament_matches set player_1_uid = p_neu
   where tournament_id = p_tournament_id and player_1_uid = p_alt;
  update public.tournament_matches set player_2_uid = p_neu
   where tournament_id = p_tournament_id and player_2_uid = p_alt;
  update public.tournament_matches set winner_uid = p_neu
   where tournament_id = p_tournament_id and winner_uid = p_alt;
end
$$;

create or replace function public.admin_teilnehmer_umhaengen(p_tournament_id text, p_alt text, p_neu text)
returns void
language sql
as $$ select app.admin_teilnehmer_umhaengen(p_tournament_id, p_alt, p_neu) $$;

-- Das ganze Konto umhaengen (Dublonen, Level, Schiff, Turnier).
-- ACHTUNG: das Zielkonto wird dabei vollstaendig ersetzt.
create or replace function app.admin_identitaet_umhaengen(p_alt text, p_neu text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  perform app.identitaet_umziehen(p_alt, p_neu);
end
$$;

create or replace function public.admin_identitaet_umhaengen(p_alt text, p_neu text) returns void
language sql
as $$ select app.admin_identitaet_umhaengen(p_alt, p_neu) $$;

grant execute on function app.admin_konten_zu_name(text) to authenticated;
grant execute on function public.admin_konten_zu_name(text) to authenticated;
grant execute on function app.admin_teilnehmer_umhaengen(text, text, text) to authenticated;
grant execute on function public.admin_teilnehmer_umhaengen(text, text, text) to authenticated;
grant execute on function app.admin_identitaet_umhaengen(text, text) to authenticated;
grant execute on function public.admin_identitaet_umhaengen(text, text) to authenticated;
