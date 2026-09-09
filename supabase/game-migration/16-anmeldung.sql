/* ======================================================
   ANMELDUNG: DER SERVER ENTSCHEIDET, WER VERIFIZIERT IST
   ---------------------------------------------------
   WAS VORHER FALSCH WAR
   Twitch- und Discord-Login liefen komplett im Browser. Sie holten
   Name und Bild und legten beides in localStorage; die players-
   Zeile bekam den Namen anschliessend vom Client geschrieben. Der
   Server prueft am nickname aber nur Laenge (1-30) und die
   Sperrliste - er konnte gar nicht wissen, ob der Name erarbeitet
   oder eingetippt war.

   Wer die Browser-Konsole oeffnete und

     localStorage.wheelNickname = "Ändii"

   setzte, stand danach in der Rangliste wie der Streamer selbst.

   WAS DIESE MIGRATION AENDERT
   1. players.anmeldeart haelt fest, WIE jemand angemeldet ist.
      Geschrieben wird das ausschliesslich von einer Funktion, die
      den Wert aus dem signierten Token liest - der Browser kann
      den Wert nicht setzen (die Spalte ist fuer Spieler schreib-
      geschuetzt, siehe app.valid_anmeldung_write() weiter unten).
   2. Ein Name, den ein verifiziertes Konto fuehrt, ist fuer alle
      anderen gesperrt. Damit laesst sich niemand mehr als jemand
      ausgeben, der sich wirklich angemeldet hat.

   REIHENFOLGE: nach 13-admin-werkzeuge.sql einspielen (setzt
   app.name_erlaubt() voraus).
====================================================== */


/* ======================================================
   1. DIE SPALTE
====================================================== */
alter table public.players
  add column if not exists anmeldeart text
    check (anmeldeart is null or anmeldeart in
           ('anon','twitch','discord','google','email'));

comment on column public.players.anmeldeart is
  'Wie sich dieses Konto angemeldet hat. Wird NUR von '
  'app.anmeldeart_festhalten() aus dem Token gesetzt, nie vom Browser.';

/* Ein verifizierter Name darf nur einmal vergeben sein. Teilindex,
   weil anonyme Konten sich denselben Wunschnamen teilen duerfen -
   erst der Nachweis macht den Namen exklusiv.
   lower(), damit "Aendii" und "aendii" nicht als verschieden
   durchgehen. */
create unique index if not exists players_verifizierter_name_idx
  on public.players (lower(nickname))
  where anmeldeart is not null and anmeldeart <> 'anon' and nickname is not null;


/* ======================================================
   2. DIE ANMELDEART AUS DEM TOKEN LESEN
   ---------------------------------------------------
   Supabase legt den Anbieter in app_metadata.provider ab, und
   app_metadata ist der Teil des Tokens, den der Nutzer NICHT
   veraendern kann (im Gegensatz zu user_metadata). Genau deshalb
   wird hier von dort gelesen und nicht aus einem Argument.
====================================================== */
create or replace function app.meine_anmeldeart() returns text
language sql stable
as $$
  select case
    when app.firebase_uid() is null then null
    -- Anonyme Sitzungen tragen is_anonymous = true im Token.
    when coalesce((auth.jwt() -> 'is_anonymous')::boolean, false) then 'anon'
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') in
         ('twitch','discord','google','email')
      then auth.jwt() -> 'app_metadata' ->> 'provider'
    -- Angemeldet, aber ueber einen Weg, den wir hier nicht kennen:
    -- lieber als anon fuehren als faelschlich als verifiziert.
    else 'anon'
  end
$$;

create or replace function app.anmeldeart_festhalten() returns text
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  art  text := app.meine_anmeldeart();
begin
  if uid is null then
    return null;
  end if;

  /* SECURITY DEFINER, weil die Spalte fuer Spieler bewusst
     schreibgeschuetzt ist. Die Funktion schreibt ausschliesslich
     die eigene Zeile und ausschliesslich den aus dem Token
     gelesenen Wert - ein Argument gibt es absichtlich nicht. */
  update public.players
     set anmeldeart = art
   where firebase_uid = uid
     and anmeldeart is distinct from art;

  return art;
end
$$;

create or replace function public.anmeldeart_festhalten() returns text
language sql
as $$ select app.anmeldeart_festhalten() $$;

grant execute on function public.anmeldeart_festhalten() to anon, authenticated;


/* ======================================================
   3. VERIFIZIERTE NAMEN SIND GESCHUETZT
   ---------------------------------------------------
   Der Unique-Index oben verhindert schon, dass ZWEI verifizierte
   Konten denselben Namen fuehren. Er hindert aber kein ANONYMES
   Konto daran, den Namen eines verifizierten anzunehmen - dort
   greift der Teilindex ja nicht.

   Diese Funktion schliesst genau diese Luecke.
====================================================== */
create or replace function app.name_frei_fuer(p_uid text, p_name text) returns boolean
language sql stable
as $$
  select p_name is null
      or not exists (
           select 1 from public.players
            where lower(nickname) = lower(p_name)
              and firebase_uid <> p_uid
              and anmeldeart is not null
              and anmeldeart <> 'anon'
         )
$$;


/* ======================================================
   4. IN DIE SCHREIBREGEL EINHAENGEN
   ---------------------------------------------------
   Bewusst NICHT durch Neuschreiben von app.valid_players_write():
   die Funktion steht in 01-players-ship-progression.sql und ist
   dort ueber vierzig Zeilen lang. Sie hier zu kopieren hiesse, zwei
   Fassungen zu pflegen, die irgendwann auseinanderlaufen - und die
   Kopie wuerde beim naechsten Einspielen von 01-... still
   ueberschrieben.

   Stattdessen kommt eine ZWEITE, kleine Bedingung dazu, und die
   Policy verlangt beide. So bleibt jede Regel an genau einer
   Stelle.
====================================================== */
create or replace function app.valid_anmeldung_write(p_uid text, new_row public.players)
returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
begin
  /* Die Anmeldeart ist fuer den Spieler unveraenderlich. Ohne
     diese Zeile koennte sich jeder selbst auf 'twitch' setzen und
     haette damit Abzeichen UND Namensschutz - die ganze Migration
     waere umsonst. Gesetzt wird sie nur von
     app.anmeldeart_festhalten(), und die liest den Wert aus dem
     signierten Token. */
  if new_row.anmeldeart is distinct from old_row.anmeldeart then
    return false;
  end if;

  /* Ein Name, den ein verifiziertes Konto fuehrt, ist gesperrt.
     Nur pruefen, wenn der Name sich ueberhaupt aendert - sonst
     scheitert jeder gewoehnliche Schreibvorgang eines verifizierten
     Kontos an seinem eigenen Namen. */
  if new_row.nickname is distinct from old_row.nickname
     and not app.name_frei_fuer(p_uid, new_row.nickname) then
    return false;
  end if;

  return true;
end
$$;

/* Beim Anlegen gilt dasselbe: die Anmeldeart muss leer bleiben
   (app.anmeldeart_festhalten() traegt sie gleich danach nach), und
   ein fremder verifizierter Name ist tabu. */
create or replace function app.valid_anmeldung_insert(new_row public.players)
returns boolean
language sql stable
as $$
  select new_row.anmeldeart is null
     and app.name_frei_fuer(new_row.firebase_uid, new_row.nickname)
$$;

/* Die Insert-Policy muss mitgezogen werden. Ohne sie koennte man
   sich beim ANLEGEN der eigenen Zeile gleich auf 'twitch' setzen
   und haette die Update-Sperre umgangen - eine Regel, die nur beim
   Aendern greift, ist keine Regel.

   ACHTUNG: die uebrigen Bedingungen sind Zeile fuer Zeile aus
   01-players-ship-progression.sql uebernommen und muessen dort
   mitgezogen werden, wenn sich etwas aendert. Beim ersten Versuch
   hatte ich sie aus dem Gedaechtnis geschrieben und dabei drei
   Bedingungen verfehlt - deshalb steht das hier so deutlich. */
drop policy if exists "players_insert_own" on public.players;
create policy "players_insert_own" on public.players
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and currency = 0
    and games_played = 0
    and games_won = 0
    and total_currency_earned = 0
    and streak <= 1
    and codes_cracked <= 1
    and last_wheel_spin_at is null
    and last_spielothek_play_at is null
    and app.valid_anmeldung_insert(players.*)
  );

drop policy if exists "players_update_own" on public.players;
create policy "players_update_own" on public.players
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (
    firebase_uid = app.firebase_uid()
    and app.valid_players_write(firebase_uid, players.*)
    and app.valid_anmeldung_write(firebase_uid, players.*)
  );
