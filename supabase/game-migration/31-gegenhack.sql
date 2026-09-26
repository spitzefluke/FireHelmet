/* ======================================================
   COMMUNITY-QUEST "GEGENHACK" UND WERBUNGSFLUT
   ---------------------------------------------------
   Etappe 2 des Claude-Design-Entwurfs "Live-Event Zuschauer",
   so wie der Betreiber es festgelegt hat:

   QUEST
   Der Admin startet eine Quest mit Titel, Ziel (Zahl geloester
   Aufgaben) und Termin (nur Anzeige: "Gegenhack · Sa 03.10., 20:00").
   Solange sie laeuft, steht live_event.quest_id - daran haengen die
   eigene Seite im Menue und der Hinweis auf der Startseite.
   Drei Aufgaben (Datenfragmente, Gegensignal, Zugangscode) zaehlen
   je Spieler einmal.

   FINALE
   Die Quest laeuft bis zum naechsten Event und entscheidet dessen
   Ausgang. Der Admin loest waehrend des Events admin_gegenhack_finale()
   aus:
   - geloest >= Ziel: Sieg. Jeder Helfer bekommt sofort +500 Dublonen
     je eigener Aufgabe (hoechstens 1500) und das Abzeichen
     "Gegenhacker: <Titel>" - auch wer gerade nicht online ist.
     Alle sehen die Story "gegenhack_sieg".
   - sonst: Niederlage. Keine Belohnung. Alle sehen die Story
     "gegenhack_niederlage": ??? zeigt sich, dann die Werbungsflut.
     Die Seite bleibt danach gehackt - bis zum naechsten Event
     (Trigger unten; admin_event_starten() aus 30 bleibt unberuehrt).

   WERBUNGSFLUT
   Auch als eigene Story "werbung". Sechs Fenster verraten ein
   Secret; +25 Dublonen je Secret, hoechstens 150 - ueber
   live_story_belohnung(..., 'werbung', Zahl der Secrets).

   Die beiden Funktionen aus 29 (admin_live_story, live_story_belohnung)
   pruefen feste Story-Listen. Sie werden hier WORTGLEICH neu
   angelegt, nur um die neuen Storys ergaenzt - jede Aenderung
   gegenueber 29 ist mit "31:" markiert.

   REIHENFOLGE: nach 30 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. QUEST, BEITRAEGE, BELOHNUNGEN
====================================================== */
create table if not exists public.gegenhack_quests (
  quest_id        text primary key,
  titel           text not null,
  ziel            integer not null,
  termin          timestamptz,
  gestartet_am    timestamptz not null default now(),
  beendet_am      timestamptz,
  ergebnis        text,
  stand_geloest   integer,
  stand_helfer    integer,
  finale_story_id text,
  constraint gegenhack_titel_len check (char_length(btrim(titel)) between 1 and 60),
  constraint gegenhack_ziel_sinnvoll check (ziel between 1 and 100000),
  constraint gegenhack_ergebnis_bekannt check (ergebnis is null or ergebnis in ('sieg', 'niederlage', 'abgebrochen'))
);

alter table public.gegenhack_quests enable row level security;
alter table public.gegenhack_quests force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'gegenhack_quests' and policyname = 'gegenhack_quests_select_public') then
    create policy "gegenhack_quests_select_public" on public.gegenhack_quests
      for select to anon, authenticated using (true);
  end if;
end $$;

revoke insert, update, delete on public.gegenhack_quests from anon, authenticated;
grant select on public.gegenhack_quests to anon, authenticated;

create table if not exists public.gegenhack_beitraege (
  quest_id     text not null references public.gegenhack_quests(quest_id) on delete cascade,
  firebase_uid text not null,
  aufgabe      text not null,
  am           timestamptz not null default now(),
  primary key (quest_id, firebase_uid, aufgabe),
  constraint gegenhack_aufgabe_bekannt check (aufgabe in ('frag', 'freq', 'code'))
);

create index if not exists gegenhack_beitraege_quest_am on public.gegenhack_beitraege (quest_id, am desc);

alter table public.gegenhack_beitraege enable row level security;
alter table public.gegenhack_beitraege force row level security;
-- Keine Policy: lesen und schreiben nur ueber die Funktionen unten.
revoke all on public.gegenhack_beitraege from anon, authenticated;

create table if not exists public.gegenhack_belohnungen (
  quest_id     text not null references public.gegenhack_quests(quest_id) on delete cascade,
  firebase_uid text not null,
  dublonen     integer not null,
  am           timestamptz not null default now(),
  primary key (quest_id, firebase_uid)
);

alter table public.gegenhack_belohnungen enable row level security;
alter table public.gegenhack_belohnungen force row level security;
revoke all on public.gegenhack_belohnungen from anon, authenticated;

alter table public.live_event add column if not exists quest_id text;


/* ======================================================
   2. NEUE STORYS IN DEN LISTEN AUS 29
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage'));

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage'));

alter table public.live_story_belohnungen drop constraint if exists live_story_belohnungen_art_bekannt;
alter table public.live_story_belohnungen add constraint live_story_belohnungen_art_bekannt
  check (art in ('wetter', 'hacked', 'hintertueren', 'schatz', 'werbung'));


/* admin_live_story aus 29, wortgleich - 31: 'werbung' darf der Admin
   direkt starten. Die beiden Gegenhack-Storys nur ueber das Finale. */
create or replace function app.admin_live_story(p_story text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  sid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;

  if p_story is null then
    update public.live_event
       set story = null, story_id = null, story_at = null, story_ende_at = null, updated_at = now()
     where id = 1;
    return null;
  end if;

  if p_story not in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco', 'werbung') then  -- 31: 'werbung'
    raise exception 'unbekannte-story';
  end if;

  sid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_storys (story_id, story) values (sid, p_story);
  update public.live_event
     set story = p_story, story_id = sid, story_at = now(), story_ende_at = null, updated_at = now()
   where id = 1;
  return sid;
end
$$;


/* live_story_belohnung aus 29, wortgleich - 31: Art 'werbung'
   (Werbungsflut allein oder nach der Gegenhack-Niederlage):
   25 Dublonen je Secret, hoechstens 6 Secrets. Fruehestens 8 s. */
create or replace function app.live_story_belohnung(p_story_id text, p_art text, p_beute integer default 0)
  returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  st     public.live_storys;
  dub    integer := 0;
  sp     integer := 0;
  titel  text := null;
  ab     integer;
  beute  integer := greatest(0, least(60, coalesce(p_beute, 0)));
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into st from public.live_storys where story_id = p_story_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if st.gestartet_am < now() - interval '2 hours' then
    return jsonb_build_object('ok', false, 'grund', 'zu-spaet');
  end if;

  if p_art = 'wetter' and st.story in ('sturm', 'nordlicht', 'nebel', 'flut') then
    dub := 150; ab := 5;
  elsif p_art = 'hacked' and st.story = 'hacked' then
    sp := 1; titel := 'firewall-pirat'; ab := 25;
  elsif p_art = 'hintertueren' and st.story = 'hacked' then
    sp := 1; ab := 30;
  elsif p_art = 'schatz' and st.story = 'schatz' then
    dub := beute * 10;
    if beute >= 25 then sp := 1; end if;
    ab := 18;
  elsif p_art = 'werbung' and st.story in ('werbung', 'gegenhack_niederlage') then  -- 31
    dub := least(6, beute) * 25;
    ab := 8;
  else
    return jsonb_build_object('ok', false, 'grund', 'falsche-art');
  end if;

  if now() < st.gestartet_am + make_interval(secs => ab) then
    return jsonb_build_object('ok', false, 'grund', 'zu-frueh');
  end if;

  insert into public.live_story_belohnungen (firebase_uid, story_id, art, dublonen, skillpunkte)
       values (uid, st.story_id, p_art, dub, sp)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;

  if dub > 0 then
    insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
    update public.players set currency = currency + dub where firebase_uid = uid;
  end if;

  if sp > 0 then
    insert into public.player_progression (firebase_uid) values (uid)
      on conflict (firebase_uid) do nothing;
    /* least(): Deckel aus 22 (bonus_skill_points <= 500) - kappen statt scheitern. */
    update public.player_progression
       set bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + sp),
           updated_at = now()
     where firebase_uid = uid;
  end if;

  if titel is not null then
    /* Schon einmal bekommen: nach vorn holen, damit er als neuester zaehlt. */
    insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, titel)
    on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
  end if;

  return jsonb_build_object('ok', true, 'dublonen', dub, 'skillpunkte', sp,
    'titel', (select t.text from public.event_titel t where t.titel_id = titel));
end
$$;


/* ======================================================
   3. NIEDERLAGE: GEHACKT BIS ZUM NAECHSTEN EVENT
   Eine zweite Bedingung neben admin_event_starten() aus 30 (das
   nur 'ende' aufraeumt): Beginnt ein NEUES Event, waehrend die
   Niederlage-Story steht, verschwindet sie mit.
====================================================== */
create or replace function app.live_event_niederlage_aufraeumen() returns trigger
language plpgsql set search_path = public, app, pg_temp
as $$
begin
  if new.event_id is not null
     and new.event_id is distinct from old.event_id
     and new.story = 'gegenhack_niederlage' then
    new.story := null;
    new.story_id := null;
    new.story_at := null;
    new.story_ende_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists live_event_niederlage_aufraeumen on public.live_event;
create trigger live_event_niederlage_aufraeumen
  before update on public.live_event
  for each row execute function app.live_event_niederlage_aufraeumen();


/* ======================================================
   4. ADMIN: QUEST STARTEN, ABBRECHEN, FINALE
====================================================== */
create or replace function app.admin_gegenhack_starten(p_titel text, p_ziel integer, p_termin timestamptz)
  returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  qid   text := encode(extensions.gen_random_bytes(9), 'hex');
  titel text := btrim(coalesce(nullif(btrim(p_titel), ''), 'Gegenhack vorbereiten'));
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if char_length(titel) > 60 then
    raise exception 'titel-zu-lang';
  end if;
  if p_ziel is null or p_ziel < 1 or p_ziel > 100000 then
    raise exception 'ziel-ungueltig';
  end if;

  /* Eine laufende Quest gilt damit als abgebrochen - ohne Belohnung. */
  update public.gegenhack_quests set beendet_am = now(), ergebnis = 'abgebrochen'
   where beendet_am is null;

  insert into public.gegenhack_quests (quest_id, titel, ziel, termin)
       values (qid, titel, p_ziel, p_termin);
  update public.live_event set quest_id = qid, updated_at = now() where id = 1;
  return qid;
end
$$;

/* true, wenn eine Quest lief. */
create or replace function app.admin_gegenhack_abbrechen() returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  lief boolean;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  update public.gegenhack_quests set beendet_am = now(), ergebnis = 'abgebrochen'
   where beendet_am is null;
  lief := found;
  update public.live_event set quest_id = null, updated_at = now() where id = 1 and quest_id is not null;
  return lief;
end
$$;

/* Nur waehrend eines Events. Rueckgabe:
   {"ergebnis": "sieg"|"niederlage", "geloest": n, "ziel": n, "helfer": n} */
create or replace function app.admin_gegenhack_finale() returns jsonb
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  q       public.gegenhack_quests;
  eid     text;
  n       integer;
  helfer  integer;
  erg     text;
  sid     text := encode(extensions.gen_random_bytes(9), 'hex');
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select event_id into eid from public.live_event where id = 1;
  if eid is null then
    raise exception 'kein-event';
  end if;
  select * into q from public.gegenhack_quests
   where quest_id = (select quest_id from public.live_event where id = 1) and beendet_am is null;
  if not found then
    raise exception 'keine-quest';
  end if;

  select count(*), count(distinct firebase_uid) into n, helfer
    from public.gegenhack_beitraege where quest_id = q.quest_id;
  erg := case when n >= q.ziel then 'sieg' else 'niederlage' end;

  if erg = 'sieg' then
    /* Dublonen: 500 je eigener Aufgabe, hoechstens 1500. */
    insert into public.gegenhack_belohnungen (quest_id, firebase_uid, dublonen)
    select q.quest_id, b.firebase_uid, least(1500, 500 * count(*))::integer
      from public.gegenhack_beitraege b
     where b.quest_id = q.quest_id
     group by b.firebase_uid
    on conflict do nothing;

    insert into public.players (firebase_uid)
    select g.firebase_uid from public.gegenhack_belohnungen g where g.quest_id = q.quest_id
    on conflict (firebase_uid) do nothing;

    update public.players p set currency = p.currency + g.dublonen
      from public.gegenhack_belohnungen g
     where g.quest_id = q.quest_id and g.firebase_uid = p.firebase_uid;

    /* Abzeichen fuer alle Helfer (Tabellen aus 30). */
    insert into public.event_abzeichen (abzeichen_id, art, titel, event_id)
         values ('gegenhacker-' || q.quest_id, 'gegenhacker', left('Gegenhacker: ' || q.titel, 80), eid)
    on conflict (abzeichen_id) do nothing;
    insert into public.spieler_abzeichen (firebase_uid, abzeichen_id)
    select distinct b.firebase_uid, 'gegenhacker-' || q.quest_id
      from public.gegenhack_beitraege b where b.quest_id = q.quest_id
    on conflict do nothing;
  end if;

  update public.gegenhack_quests
     set beendet_am = now(), ergebnis = erg, stand_geloest = n, stand_helfer = helfer, finale_story_id = sid
   where quest_id = q.quest_id;

  insert into public.live_storys (story_id, story) values (sid, 'gegenhack_' || erg);
  update public.live_event
     set quest_id = null,
         story = 'gegenhack_' || erg, story_id = sid, story_at = now(), story_ende_at = null,
         updated_at = now()
   where id = 1;

  insert into public.live_logbuch (event_id, text)
       values (eid, case when erg = 'sieg' then 'Gegenhack gelungen' else 'Gegenhack fehlgeschlagen' end);

  return jsonb_build_object('ergebnis', erg, 'geloest', n, 'ziel', q.ziel, 'helfer', helfer);
end
$$;

create or replace function public.admin_gegenhack_starten(p_titel text, p_ziel integer, p_termin timestamptz) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_gegenhack_starten(p_titel, p_ziel, p_termin) $$;
create or replace function public.admin_gegenhack_abbrechen() returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_gegenhack_abbrechen() $$;
create or replace function public.admin_gegenhack_finale() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_gegenhack_finale() $$;


/* ======================================================
   5. FUER ALLE: BEITRAGEN, STAND, CREW-FEED
====================================================== */

/* 1 = gezaehlt, 0 = hattest du schon, -1 = keine laufende Quest. */
create or replace function app.gegenhack_beitragen(p_quest text, p_aufgabe text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_aufgabe not in ('frag', 'freq', 'code') then
    return -1;
  end if;
  if not exists (select 1 from public.gegenhack_quests where quest_id = p_quest and beendet_am is null) then
    return -1;
  end if;
  insert into public.gegenhack_beitraege (quest_id, firebase_uid, aufgabe) values (p_quest, uid, p_aufgabe)
  on conflict do nothing;
  return case when found then 1 else 0 end;
end
$$;

/* Stand der Quest - Summen, nie wer was geloest hat (ausser mir). */
create or replace function app.gegenhack_stand(p_quest text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select case when q.quest_id is null then jsonb_build_object('ok', false) else
    jsonb_build_object(
      'ok', true,
      'titel', q.titel, 'ziel', q.ziel, 'termin', q.termin, 'gestartet_am', q.gestartet_am,
      'beendet', q.beendet_am is not null, 'ergebnis', q.ergebnis,
      'geloest', (select count(*) from public.gegenhack_beitraege b where b.quest_id = q.quest_id),
      'helfer',  (select count(distinct b.firebase_uid) from public.gegenhack_beitraege b where b.quest_id = q.quest_id),
      'aktiv',   (select count(distinct b.firebase_uid) from public.gegenhack_beitraege b
                   where b.quest_id = q.quest_id and b.am > now() - interval '1 hour'),
      'meine',   coalesce((select jsonb_agg(b.aufgabe order by b.aufgabe) from public.gegenhack_beitraege b
                   where b.quest_id = q.quest_id and b.firebase_uid = app.firebase_uid()), '[]'::jsonb),
      'meine_dublonen', (select g.dublonen from public.gegenhack_belohnungen g
                   where g.quest_id = q.quest_id and g.firebase_uid = app.firebase_uid())
    ) end
    from (select 1) eins
    left join public.gegenhack_quests q on q.quest_id = p_quest
$$;

/* Die letzten Taten der Crew: Name und Bild wie in der Rangliste
   (players ist ohnehin oeffentlich lesbar). */
create or replace function app.gegenhack_feed(p_quest text)
  returns table (name text, avatar text, aufgabe text, am timestamptz, ich boolean)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select nullif(btrim(p.nickname), ''), p.avatar, b.aufgabe, b.am,
         b.firebase_uid = app.firebase_uid()
    from public.gegenhack_beitraege b
    left join public.players p on p.firebase_uid = b.firebase_uid
   where b.quest_id = p_quest
   order by b.am desc
   limit 6
$$;

create or replace function public.gegenhack_beitragen(p_quest text, p_aufgabe text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.gegenhack_beitragen(p_quest, p_aufgabe) $$;
create or replace function public.gegenhack_stand(p_quest text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.gegenhack_stand(p_quest) $$;
create or replace function public.gegenhack_feed(p_quest text)
  returns table (name text, avatar text, aufgabe text, am timestamptz, ich boolean)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.gegenhack_feed(p_quest) $$;


/* ======================================================
   6. RECHTE
   "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28).
====================================================== */
revoke execute on function app.live_event_niederlage_aufraeumen()                         from public, anon, authenticated;
revoke execute on function app.admin_gegenhack_starten(text, integer, timestamptz)       from public, anon;
revoke execute on function public.admin_gegenhack_starten(text, integer, timestamptz)    from public, anon;
revoke execute on function app.admin_gegenhack_abbrechen()                               from public, anon;
revoke execute on function public.admin_gegenhack_abbrechen()                            from public, anon;
revoke execute on function app.admin_gegenhack_finale()                                  from public, anon;
revoke execute on function public.admin_gegenhack_finale()                               from public, anon;
revoke execute on function app.gegenhack_beitragen(text, text)                           from public, anon;
revoke execute on function public.gegenhack_beitragen(text, text)                        from public, anon;

grant execute on function app.admin_gegenhack_starten(text, integer, timestamptz)       to authenticated;
grant execute on function public.admin_gegenhack_starten(text, integer, timestamptz)    to authenticated;
grant execute on function app.admin_gegenhack_abbrechen()                               to authenticated;
grant execute on function public.admin_gegenhack_abbrechen()                            to authenticated;
grant execute on function app.admin_gegenhack_finale()                                  to authenticated;
grant execute on function public.admin_gegenhack_finale()                               to authenticated;
grant execute on function app.gegenhack_beitragen(text, text)                           to authenticated;
grant execute on function public.gegenhack_beitragen(text, text)                        to authenticated;

/* Stand und Feed auch ohne Anmeldung lesbar (Hinweis auf der Startseite). */
grant execute on function app.gegenhack_stand(text)    to anon, authenticated;
grant execute on function public.gegenhack_stand(text) to anon, authenticated;
grant execute on function app.gegenhack_feed(text)     to anon, authenticated;
grant execute on function public.gegenhack_feed(text)  to anon, authenticated;
