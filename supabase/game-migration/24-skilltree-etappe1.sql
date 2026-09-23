/* ======================================================
   SKILL-BAUM, ETAPPE 1: STUFE III, ENDKNOTEN, SKILLPUNKTE
   ---------------------------------------------------
   1. Jeder der drei Zweige (Rad, Spielothek, XP) bekommt eine
      Stufe III (2 Punkte, +10 %). Zusammen mit I (+5 %) und
      II (+10 %) sind das +25 % je Zweig.
   2. Titel "Gluecksritter" und Abzeichen "Seebaer" kosten 2 statt
      3 Punkte.
   3. Neuer Endknoten "Legende der sieben Meere" (3 Punkte), frei
      erst mit allen drei Stufen III.
   4. Neue Geschenk-Art "skillpunkte": der Admin verteilt im
      Live-Event 1-10 Skillpunkte an alle. Gutgeschrieben wird
      server-seitig in bonus_skill_points (Deckel 500 aus 22), der
      Browser nennt keinen Betrag.

   DECKEL
   +25 % auf Rad-Gewinne (hoechstens 500 -> 625) und XP (hoechstens
   25 -> 31) bleiben weit unter den Deckeln von
   valid_players_write/valid_progression_write. Die Spielothek kann
   bis 25000 auszahlen; +25 % waeren 31250 und damit ueber dem
   +30000-Deckel - deshalb klemmt spielothek.js den Gewinn NACH dem
   Bonus auf 30000. Nichts davon aendert eine Regel hier.

   WARUM DIE ART-REGEL NEU GESETZT WIRD
   live_grants_art_bekannt ist eine Positivliste. Eine zweite
   Bedingung (wie sonst ueblich, siehe 16-anmeldung.sql) kann eine
   Positivliste nur weiter einschraenken, nie erweitern - also wird
   genau diese eine Regel ersetzt. Die Obergrenze fuer Skillpunkte
   kommt dagegen als ZUSAETZLICHE Bedingung dazu.

   REIHENFOLGE: nach 23 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1.-3. KNOTEN
====================================================== */
insert into public.skill_nodes (node_id, kosten, benoetigt, art, wert, bezeichnung) values
  ('rad3',       2, '{rad2}',            'raddublonen',  10, 'Gluecksstraehne III - +10% Rad-Dublonen'),
  ('slot3',      2, '{slot2}',           'slotdublonen', 10, 'Spielerglueck III - +10% Spielothek-Gewinn'),
  ('xp3',        2, '{xp2}',             'xpbonus',      10, 'Erfahren III - +10% XP'),
  ('titel1',     2, '{rad2,slot2}',      'titel',         0, 'Titel: Gluecksritter'),
  ('abzeichen1', 2, '{xp2}',             'abzeichen',     0, 'Abzeichen: Seebaer'),
  ('legende',    3, '{rad3,slot3,xp3}',  'titel',         0, 'Legende der sieben Meere')
on conflict (node_id) do update
  set kosten = excluded.kosten, benoetigt = excluded.benoetigt,
      art = excluded.art, wert = excluded.wert, bezeichnung = excluded.bezeichnung;


/* ======================================================
   4. SKILLPUNKTE ALS GESCHENK
====================================================== */
alter table public.live_grants drop constraint if exists live_grants_art_bekannt;
alter table public.live_grants add constraint live_grants_art_bekannt
  check (art in ('dublonen', 'avatar', 'skillpunkte'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_grants_skillpunkte_klein') then
    alter table public.live_grants add constraint live_grants_skillpunkte_klein
      check (art <> 'skillpunkte' or wert between 1 and 10);
  end if;
end $$;

/* Wie in 23, nur mit der neuen Art. */
create or replace function app.live_grant_ausloesen(p_art text, p_wert integer, p_avatar text)
  returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  gid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_art not in ('dublonen', 'avatar', 'skillpunkte') then
    raise exception 'unbekannte-art';
  end if;

  gid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_grants (grant_id, art, wert, avatar_id)
    values (gid, p_art, coalesce(p_wert, 0), p_avatar);

  update public.live_event
     set grant_id = gid, grant_at = now(), updated_at = now()
   where id = 1;

  return gid;
end
$$;

/* Wie in 23, dazu der Zweig "skillpunkte".
   Rueckgabe:
     > 0  so viele Dublonen bzw. Skillpunkte gutgeschrieben
       1  Avatar freigeschaltet (art='avatar')
       0  schon eingeloest
      -1  Grant unbekannt oder zu alt */
create or replace function app.live_grant_einloesen(p_grant text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  g      public.live_grants;
  neu    boolean;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into g from public.live_grants where grant_id = p_grant;
  if not found or g.angelegt_am < now() - interval '2 hours' then
    return -1;
  end if;

  insert into public.live_grant_einloesungen (firebase_uid, grant_id)
    values (uid, p_grant) on conflict do nothing;
  get diagnostics neu = row_count;
  if not neu then
    return 0;
  end if;

  if g.art = 'skillpunkte' then
    insert into public.player_progression (firebase_uid) values (uid)
      on conflict (firebase_uid) do nothing;
    /* least(): der Deckel aus 22 (bonus_skill_points <= 500) soll
       das Einloesen nicht scheitern lassen, sondern nur kappen. */
    update public.player_progression
       set bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + g.wert),
           updated_at = now()
     where firebase_uid = uid;
    return g.wert;
  end if;

  /* Spielerzeile sicherstellen. */
  insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;

  if g.art = 'dublonen' then
    update public.players
       set currency = currency + g.wert
     where firebase_uid = uid;
    return g.wert;
  else
    /* Avatar: in unlocked_avatars aufnehmen, falls noch nicht da. */
    update public.players
       set unlocked_avatars = case
             when g.avatar_id = any(coalesce(unlocked_avatars, '{}')) then unlocked_avatars
             else array_append(coalesce(unlocked_avatars, '{}'), g.avatar_id) end
     where firebase_uid = uid;
    return 1;
  end if;
end
$$;
