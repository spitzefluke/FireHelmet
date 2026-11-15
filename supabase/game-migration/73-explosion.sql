/* ======================================================
   LIVE-STORY "EXPLOSION" - DIE SEITE EXPLODIERT, DANACH COUNTDOWN,
   BEI 0 SIND DREIZEHN FEATURES FUER ALLE WEG
   ---------------------------------------------------
   Entwurf "Seite explodiert - Countdown" aus Claude Design
   (scripts/liveevent/explosion.js). Ablauf:

   1. Der Admin traegt im Gateway Datum und Uhrzeit ein
      (admin_explosion_ziel). Mindestens 2 Minuten, hoechstens 30 Tage
      voraus. Das allein tut noch nichts.
   2. Der Admin startet die Story "explosion" (admin_live_story). Erst
      damit ist die Explosion SCHARF: Bei allen explodiert die Seite,
      danach laeuft nur noch der Countdown bis zum Ziel.
      Bis zum Ziel kann der Admin abbrechen (admin_explosion_abbrechen).
   3. Ab dem Ziel loest der erste Browser, der fragt, explosion_ausloesen()
      aus. Die DATENBANK entscheidet nach ihrer eigenen Uhr - kein Browser
      kann frueher ausloesen, und es passiert genau einmal.

   WAS BEI 0 GELOESCHT WIRD (Auswahl des Betreibers):
     Schatzrad, Wochenrennen, Community-Boss, THE CHALLENGE (Turnier),
     ??? (Streamraetsel), Skill-Baum, Hangar + Sternenschlacht,
     Gluecksmine, Gegenhack, Rangliste, Characters, Socials, Bewertung.

   "Geloescht" heisst in der Datenbank:
     - alle Zeilen der Tabellen dieser Features (TRUNCATE in EINEM
       Befehl, ohne CASCADE - verweist eine andere Tabelle darauf,
       bricht alles ab und nichts ist geloescht),
     - Schatzrad: players.last_wheel_spin_at, Skill-Baum:
       player_progression.unlocked_skills und bonus_skill_points,
     - die Datenbankfunktionen dieser Features sind fuer Browser
       gesperrt, und in ihre Tabellen darf niemand mehr schreiben.
   Die leeren Tabellen selbst bleiben stehen: Konto loeschen (18),
   Piratenpass 2 (53), Spind (60) und die Aufraeum-Trigger verweisen
   darauf - ohne die Tabellen gingen genau diese bleibenden Teile
   kaputt. Streamraetsel, Rangliste, Characters und Socials haben
   keine eigenen Daten; sie verschwinden nur aus der Seite.
   NICHT betroffen: Dublonen, Codes, Shop, Spielothek, Piratenpass,
   Diamanten, Spind, Storys, Saisons, Escape Room.

   Im Browser blenden live_event.explosion_weg_ab (und schon das
   erreichte Ziel) die Seiten dauerhaft fuer alle aus - auch fuer den
   Admin (seiten-sperre.js).

   NICHT RUECKGAENGIG ZU MACHEN. Vor dem Scharfschalten im Supabase-
   Dashboard eine Sicherung ziehen (Database -> Backups).

   REIHENFOLGE: nach 72 einspielen. Von Hand. Idempotent.
   Das Einspielen selbst loescht NICHTS.
====================================================== */


/* ======================================================
   1. ZUSTAND
   Massgeblich ist allein public.explosion (keine Policies, nur ueber
   die Funktionen unten). live_event bekommt eine Kopie fuer die
   Anzeige - die liest jeder Browser ohnehin in Echtzeit.
====================================================== */
create table if not exists public.explosion (
  id            integer primary key default 1 check (id = 1),
  ziel          timestamptz,
  scharf_am     timestamptz,
  story_id      text,
  ausgeloest_am timestamptz,
  bericht       jsonb,
  fehler        text,
  updated_at    timestamptz not null default now()
);
alter table public.explosion enable row level security;
alter table public.explosion force row level security;
revoke all on table public.explosion from public, anon, authenticated;
insert into public.explosion (id) values (1) on conflict (id) do nothing;

alter table public.live_event add column if not exists explosion_ziel timestamptz;
alter table public.live_event add column if not exists explosion_scharf_am timestamptz;
alter table public.live_event add column if not exists explosion_weg_ab timestamptz;

/* Kopie fuer die Browser nachziehen. */
create or replace function app.explosion_spiegeln() returns void
language sql security definer set search_path = public, app, pg_temp
as $$
  update public.live_event le
     set explosion_ziel = e.ziel, explosion_scharf_am = e.scharf_am, explosion_weg_ab = e.ausgeloest_am,
         updated_at = now()
    from public.explosion e
   where le.id = 1 and e.id = 1;
$$;
revoke execute on function app.explosion_spiegeln() from public, anon, authenticated;

/* Laeuft gerade ein scharfer Countdown, der noch nicht abgelaufen ist? */
create or replace function app.explosion_laeuft() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select scharf_am is not null and ausgeloest_am is null and now() < ziel
                     from public.explosion where id = 1), false);
$$;
revoke execute on function app.explosion_laeuft() from public, anon, authenticated;


/* ======================================================
   2. WAS GELOESCHT WIRD - fest hier, nicht aus einer Tabelle
====================================================== */
create or replace function app.explosion_tabellen() returns text[]
language sql immutable as $$
  select array[
    /* Wochenrennen */      'race_progress',
    /* Community-Boss */    'community_boss', 'community_boss_damage', 'community_boss_attacks',
                            'boss_attack_defs', 'boss_attack_state', 'boss_community_buff', 'boss_special_codes',
    /* THE CHALLENGE */     'tournaments', 'tournament_matches', 'tournament_participants', 'tournament_prize',
    /* Skill-Baum */        'skill_nodes',
    /* Gegenhack */         'gegenhack_quests', 'gegenhack_beitraege', 'gegenhack_belohnungen',
    /* Hangar */            'hangar_einheiten', 'hangar_besitz', 'hangar_teile', 'schiff_rang',
    /* Sternenschlacht */   'sternenschlacht', 'sternenschlacht_aktionen', 'sternenschlacht_einheiten',
                            'schlacht_wahl', 'schlacht_orte', 'schlacht_parteien', 'schlacht_typen', 'schlacht_regler',
    /* Gluecksmine */       'mine_stand',
    /* Bewertung */         'site_ratings'
  ]::text[];
$$;

create or replace function app.explosion_funktionen() returns text[]
language sql immutable as $$
  select array[
    /* Community-Boss */  'admin_boss_code_setzen', 'admin_boss_codes_fehlen', 'admin_boss_setzen', 'admin_boss_uebersicht',
                          'admin_boss_zuruecksetzen', 'admin_spezial_freischalten', 'attack_community_boss', 'boss_attack',
                          'boss_attack_status', 'boss_unlock_special',
    /* Wochenrennen */    'admin_rennen_eintrag_loeschen', 'admin_rennen_setzen', 'admin_rennen_woche', 'admin_rennen_woche_leeren',
    /* THE CHALLENGE */   'admin_create_tournament', 'admin_match_entscheiden', 'admin_reset_tournament',
                          'admin_set_tournament_paused', 'admin_start_tournament', 'admin_teilnehmer_ausschliessen',
                          'admin_teilnehmer_entfernen', 'admin_teilnehmer_nachtragen', 'admin_teilnehmer_umhaengen',
                          'admin_turnier_fortschritt_zuruecksetzen', 'tournament_submit_score',
    /* Gegenhack */       'admin_gegenhack_abbrechen', 'admin_gegenhack_finale', 'admin_gegenhack_starten',
                          'gegenhack_beitragen', 'gegenhack_feed', 'gegenhack_stand',
    /* Skill-Baum */      'skill_freischalten', 'skill_auszeichnungen',
    /* Hangar + Schlacht */ 'admin_boss_starten', 'admin_front_einstellen', 'admin_hangar_zuruecksetzen',
                          'admin_schlacht_beenden', 'admin_schlacht_starten', 'hangar_ausbauen', 'hangar_ausbauen_erz',
                          'hangar_ausbauen_raumerz', 'hangar_ausruestung', 'hangar_teil_anlegen', 'hangar_teil_kaufen',
                          'hangar_typ_waehlen', 'schlacht_bewegen', 'schlacht_front_verbessern', 'schlacht_haltung',
                          'schlacht_partei_waehlen', 'schlacht_spezial', 'schlacht_stand', 'schlacht_ziel',
    /* Gluecksmine */     'mine_abholen', 'mine_bestenliste', 'mine_hacken', 'mine_stand_holen', 'mine_verbessern',
                          'schiff_system_ausbauen'
  ]::text[];
$$;
revoke execute on function app.explosion_tabellen() from public, anon, authenticated;
revoke execute on function app.explosion_funktionen() from public, anon, authenticated;


/* ======================================================
   3. DAS LOESCHEN SELBST (nur aus explosion_ausloesen)
====================================================== */
create or replace function app.explosion_loeschen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  t       text;
  da      text[] := '{}';
  zeilen  jsonb := '{}'::jsonb;
  n       bigint;
  f       regprocedure;
  gesperrt integer := 0;
  rad     integer;
  skill   integer;
begin
  foreach t in array app.explosion_tabellen() loop
    if to_regclass('public.' || t) is not null then
      da := da || t;
      execute format('select count(*) from public.%I', t) into n;
      zeilen := zeilen || jsonb_build_object(t, n);
    end if;
  end loop;

  /* Ein Befehl fuer alle: Verweise untereinander sind erlaubt, ein
     Verweis von aussen bricht ab (kein CASCADE). */
  if array_length(da, 1) > 0 then
    execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(da) x) || ' restart identity';
    foreach t in array da loop
      execute format('revoke insert, update, delete, truncate on table public.%I from public, anon, authenticated', t);
    end loop;
  end if;

  /* Schatzrad: wann zuletzt gedreht wurde. */
  update public.players set last_wheel_spin_at = null where last_wheel_spin_at is not null;
  get diagnostics rad = row_count;

  /* Skill-Baum: freigeschaltete Knoten und Bonuspunkte. Pass-XP bleiben. */
  update public.player_progression
     set unlocked_skills = '{}', bonus_skill_points = 0, updated_at = now()
   where cardinality(unlocked_skills) > 0 or coalesce(bonus_skill_points, 0) <> 0;
  get diagnostics skill = row_count;

  /* Funktionen der Features fuer Browser sperren (public und app). */
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname in ('public', 'app') and p.proname = any(app.explosion_funktionen())
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    gesperrt := gesperrt + 1;
  end loop;

  return jsonb_build_object('tabellen', zeilen, 'schatzrad_spieler', rad, 'skill_spieler', skill, 'funktionen_gesperrt', gesperrt);
end
$$;
revoke execute on function app.explosion_loeschen() from public, anon, authenticated;


/* ======================================================
   4. ADMIN: ZIEL SETZEN, ABBRECHEN, STAND
====================================================== */
create or replace function app.admin_explosion_ziel(p_ziel timestamptz) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  e public.explosion;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select * into e from public.explosion where id = 1 for update;
  if e.ausgeloest_am is not null then
    raise exception 'schon-explodiert';
  end if;
  if e.scharf_am is not null then
    raise exception 'explosion-laeuft';      -- erst abbrechen, dann neu setzen
  end if;
  if p_ziel is not null and (p_ziel < now() + interval '2 minutes' or p_ziel > now() + interval '30 days') then
    raise exception 'ziel-ungueltig';
  end if;
  update public.explosion set ziel = p_ziel, fehler = null, updated_at = now() where id = 1;
  perform app.explosion_spiegeln();
  return app.explosion_stand_intern();
end
$$;

create or replace function app.admin_explosion_abbrechen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  e public.explosion;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select * into e from public.explosion where id = 1 for update;
  if e.ausgeloest_am is not null then
    raise exception 'schon-explodiert';
  end if;
  if e.scharf_am is not null and now() >= e.ziel then
    raise exception 'zu-spaet';
  end if;
  update public.explosion set scharf_am = null, story_id = null, updated_at = now() where id = 1;
  /* Die Story endet fuer alle. */
  update public.live_event
     set story = null, story_id = null, story_at = null, story_ende_at = null, updated_at = now()
   where id = 1 and story = 'explosion';
  perform app.explosion_spiegeln();
  return app.explosion_stand_intern();
end
$$;

create or replace function app.explosion_stand_intern() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select jsonb_build_object('ok', true, 'ziel', ziel, 'scharf_am', scharf_am, 'ausgeloest_am', ausgeloest_am,
                            'bericht', bericht, 'fehler', fehler, 'jetzt', now())
    from public.explosion where id = 1;
$$;
revoke execute on function app.explosion_stand_intern() from public, anon, authenticated;

create or replace function app.admin_explosion_stand() returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  return app.explosion_stand_intern();
end
$$;


/* ======================================================
   5. AUSLOESEN - jeder angemeldete Browser darf fragen,
   die Datenbank entscheidet nach ihrer Uhr. Genau einmal.
====================================================== */
create or replace function app.explosion_ausloesen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  e   public.explosion;
  ber jsonb;
begin
  if app.firebase_uid() is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into e from public.explosion where id = 1 for update;
  if e.ausgeloest_am is not null then
    return jsonb_build_object('ok', true, 'schon', true, 'ausgeloest_am', e.ausgeloest_am);
  end if;
  if e.scharf_am is null or e.ziel is null or now() < e.ziel then
    return jsonb_build_object('ok', false, 'grund', 'noch-nicht');
  end if;

  begin
    ber := app.explosion_loeschen();
  exception when others then
    /* Nichts geloescht (der innere Block rollt zurueck) - Fehler merken. */
    update public.explosion set fehler = sqlerrm, updated_at = now() where id = 1;
    return jsonb_build_object('ok', false, 'grund', 'fehler');
  end;

  update public.explosion set ausgeloest_am = now(), bericht = ber, fehler = null, updated_at = now() where id = 1;
  perform app.explosion_spiegeln();
  return jsonb_build_object('ok', true, 'schon', false, 'ausgeloest_am', now());
end
$$;


/* ======================================================
   6. STORY 'explosion' ZULASSEN
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch', 'explosion'));  -- 73: 'explosion'

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch', 'explosion'));  -- 73: 'explosion'

/* admin_live_story aus 71 - 73: 'explosion' schaltet scharf (nur mit
   gueltigem Ziel), und solange ein scharfer Countdown laeuft, startet
   oder beendet keine andere Story (dafuer gibt es "Abbrechen"). */
create or replace function app.admin_live_story(p_story text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  sid text;
  e   public.explosion;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;

  if app.explosion_laeuft() then
    raise exception 'explosion-laeuft';
  end if;

  if p_story is null then
    update public.live_event
       set story = null, story_id = null, story_at = null, story_ende_at = null, updated_at = now()
     where id = 1;
    return null;
  end if;

  if p_story not in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco', 'werbung',
                     'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch', 'explosion') then  -- 32: 'riss', 38: 'herz', 46: 'zeit', 51: 'nukes', 67: 'reise', 70: 'liebeslied', 71: 'funkspruch', 73: 'explosion'
    raise exception 'unbekannte-story';
  end if;

  if p_story = 'explosion' then
    select * into e from public.explosion where id = 1 for update;
    if e.ausgeloest_am is not null then
      raise exception 'schon-explodiert';
    end if;
    if e.ziel is null then
      raise exception 'explosion-ohne-ziel';
    end if;
    if e.ziel < now() + interval '1 minute' then
      raise exception 'ziel-zu-knapp';
    end if;
  end if;

  sid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_storys (story_id, story) values (sid, p_story);
  update public.live_event
     set story = p_story, story_id = sid, story_at = now(), story_ende_at = null, updated_at = now()
   where id = 1;
  if p_story = 'reise' then  -- 67
    insert into public.reise_laeufe (story_id, gestartet_am) values (sid, now());
  end if;
  if p_story = 'explosion' then  -- 73
    update public.explosion set scharf_am = now(), story_id = sid, fehler = null, updated_at = now() where id = 1;
    perform app.explosion_spiegeln();
  end if;
  return sid;
end
$$;

revoke execute on function app.admin_live_story(text) from public, anon;
grant  execute on function app.admin_live_story(text) to authenticated;


/* ======================================================
   7. RECHTE UND OEFFENTLICHE HUELLEN (wie 67/72)
====================================================== */
revoke execute on function app.admin_explosion_ziel(timestamptz) from public, anon, authenticated;
revoke execute on function app.admin_explosion_abbrechen() from public, anon, authenticated;
revoke execute on function app.admin_explosion_stand() from public, anon, authenticated;
revoke execute on function app.explosion_ausloesen() from public, anon, authenticated;

create or replace function public.admin_explosion_ziel(p_ziel timestamptz) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_explosion_ziel(p_ziel) $$;
create or replace function public.admin_explosion_abbrechen() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_explosion_abbrechen() $$;
create or replace function public.admin_explosion_stand() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_explosion_stand() $$;
create or replace function public.explosion_ausloesen() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.explosion_ausloesen() $$;

revoke execute on function public.admin_explosion_ziel(timestamptz) from public, anon;
revoke execute on function public.admin_explosion_abbrechen() from public, anon;
revoke execute on function public.admin_explosion_stand() from public, anon;
revoke execute on function public.explosion_ausloesen() from public, anon;
grant  execute on function public.admin_explosion_ziel(timestamptz) to authenticated;
grant  execute on function public.admin_explosion_abbrechen() to authenticated;
grant  execute on function public.admin_explosion_stand() to authenticated;
grant  execute on function public.explosion_ausloesen() to authenticated;

select app.explosion_spiegeln();
