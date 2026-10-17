/* ======================================================
   DIAMANTEN UND DER TANZ (PIRATENPASS #2)
   ---------------------------------------------------
   1. DIAMANTEN - eine zweite Waehrung, die NUR der Admin verteilt.
      Sie liegt nicht in players (dort duerfte der Browser per RLS
      schreiben, valid_players_write kennt die Spalte nicht), sondern
      in einer eigenen Tabelle ohne jedes Schreibrecht fuer Spieler.
      Gutschrift nur ueber admin_diamanten_geben() /
      admin_diamanten_an_alle(), Abbuchung nur ueber den Kauf unten.
      Jede Bewegung steht in diamanten_buchungen.

   2. KAPITAENSPASS kostet jetzt 100 Diamanten statt 950 Dublonen
      (pass_kapitaen_kaufen() aus 53 wird ersetzt).

   3. ENDBELOHNUNG Kapitaen Stufe 50: ein Tanz nach Wahl im Wert von
      500 V-Bucks, unbegrenzt. Abgeholt wird er NICHT ueber
      pass_belohnung_holen() (das meldet "tanz-formular"), sondern
      ueber pass_tanz_holen() mit Epic-Name und Tanzwunsch. Beides
      sieht nur der Admin (admin_tanz_zusagen). Ist der Tanz
      verschenkt, loescht admin_tanz_erledigt() den Epic-Namen wieder
      (Datensparsamkeit, siehe Datenschutzerklaerung Punkt 5).

   Konto loeschen (18) kennt die neuen Tabellen nicht; ein Trigger
   auf players raeumt sie mit ab, sobald die Spielerzeile geht.

   REIHENFOLGE: nach 53 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. DIAMANTEN
====================================================== */
create table if not exists public.diamanten_konto (
  firebase_uid text primary key,
  stand        integer not null default 0,
  updated_at   timestamptz not null default now(),
  constraint diamanten_stand_sane check (stand between 0 and 1000000)
);

create table if not exists public.diamanten_buchungen (
  id           bigserial primary key,
  firebase_uid text not null,
  delta        integer not null,
  grund        text not null,
  am           timestamptz not null default now()
);

alter table public.diamanten_konto enable row level security;
alter table public.diamanten_konto force row level security;
alter table public.diamanten_buchungen enable row level security;
alter table public.diamanten_buchungen force row level security;

drop policy if exists diamanten_konto_eigenes on public.diamanten_konto;
create policy diamanten_konto_eigenes on public.diamanten_konto
  for select to authenticated using (firebase_uid = app.firebase_uid());

revoke all on public.diamanten_konto from anon, authenticated;
revoke all on public.diamanten_buchungen from anon, authenticated;
grant select on public.diamanten_konto to authenticated;

/* Eine Buchung. Unter 0 faellt der Stand nie: zieht der Admin mehr
   ab als da ist, landet er bei 0. Rueckgabe: neuer Stand. */
create or replace function app.diamanten_buchen(p_uid text, p_delta integer, p_grund text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  neu integer;
begin
  insert into public.diamanten_konto (firebase_uid, stand) values (p_uid, 0)
  on conflict (firebase_uid) do nothing;
  update public.diamanten_konto
     set stand = least(1000000, greatest(0, stand + p_delta)), updated_at = now()
   where firebase_uid = p_uid
  returning stand into neu;
  insert into public.diamanten_buchungen (firebase_uid, delta, grund) values (p_uid, p_delta, p_grund);
  return neu;
end
$$;

create or replace function app.admin_diamanten_geben(p_uid text, p_anzahl integer) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_anzahl is null or p_anzahl = 0 or p_anzahl < -100000 or p_anzahl > 100000 then
    raise exception 'diamanten-anzahl';
  end if;
  if not exists (select 1 from public.players where firebase_uid = p_uid) then
    raise exception 'spieler-unbekannt';
  end if;
  return app.diamanten_buchen(p_uid, p_anzahl, 'admin');
end
$$;

/* An alle Spieler mit Spielerzeile. Rueckgabe: Anzahl Konten. */
create or replace function app.admin_diamanten_an_alle(p_anzahl integer) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  n integer := 0;
  r record;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_anzahl is null or p_anzahl < 1 or p_anzahl > 10000 then
    raise exception 'diamanten-anzahl';
  end if;
  for r in select firebase_uid from public.players loop
    perform app.diamanten_buchen(r.firebase_uid, p_anzahl, 'admin-alle');
    n := n + 1;
  end loop;
  return n;
end
$$;


/* ======================================================
   2. TANZ-ZUSAGEN
====================================================== */
alter table public.pass_belohnungen add column if not exists tanz_vbucks integer;

create table if not exists public.pass_tanz_zusagen (
  firebase_uid text not null,
  pass_id      text not null,
  nickname     text,
  epic_name    text,
  tanz         text not null,
  vbucks       integer not null,
  angefragt_am timestamptz not null default now(),
  erledigt_am  timestamptz,
  primary key (firebase_uid, pass_id),
  constraint tanz_epic_len check (epic_name is null or char_length(epic_name) between 3 and 32),
  constraint tanz_wunsch_len check (char_length(tanz) between 2 and 60)
);

alter table public.pass_tanz_zusagen enable row level security;
alter table public.pass_tanz_zusagen force row level security;
drop policy if exists pass_tanz_eigene on public.pass_tanz_zusagen;
create policy pass_tanz_eigene on public.pass_tanz_zusagen
  for select to authenticated using (firebase_uid = app.firebase_uid());
revoke all on public.pass_tanz_zusagen from anon, authenticated;
grant select on public.pass_tanz_zusagen to authenticated;

/* Kapitaen Stufe 50: statt Galeone, Titel und 1000 Dublonen der Tanz. */
update public.pass_belohnungen
   set dublonen = 0, xp = 0, skillpunkte = 0, avatar_id = null, avatar_tage = null, titel_id = null, tanz_vbucks = 500
 where pass_id = 'season2' and stufe = 50 and spur = 'kapitaen';


/* ======================================================
   3. KAUF, STAND, ABHOLEN
====================================================== */
create or replace function app.pass_kapitaen_kaufen(p_pass_id text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  preis integer := 100;
  stand integer;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  if not app.pass_saison_offen(p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'keine-saison');
  end if;
  if exists (select 1 from public.pass_kapitaen where firebase_uid = uid and pass_id = p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  /* "for update": zwei gleichzeitige Kaeufe sehen nicht beide den
     alten Stand. */
  select d.stand into stand from public.diamanten_konto d where d.firebase_uid = uid for update;
  if stand is null or stand < preis then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'diamanten', coalesce(stand, 0));
  end if;
  insert into public.pass_kapitaen (firebase_uid, pass_id, preis) values (uid, p_pass_id, preis)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  return jsonb_build_object('ok', true, 'diamanten', app.diamanten_buchen(uid, -preis, 'kapitaenspass:' || p_pass_id));
end
$$;

/* Wie in 53, dazu Diamanten, Waehrung des Kapitaenspasses, tanz_vbucks
   je Belohnung und die eigene Tanz-Zusage. */
create or replace function app.pass_stand(p_pass_id text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  prog public.player_progression;
  pxp  integer := 0;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into prog from public.player_progression where firebase_uid = uid;
  if found and prog.pass_id is not distinct from p_pass_id then
    pxp := coalesce(prog.pass_xp, 0);
  end if;
  return jsonb_build_object(
    'offen', app.pass_saison_offen(p_pass_id),
    'pass_xp', pxp,
    'stufe', app.skill_level(pxp),
    'kapitaen', exists (select 1 from public.pass_kapitaen k where k.firebase_uid = uid and k.pass_id = p_pass_id),
    'preis', 100,
    'waehrung', 'diamanten',
    'dublonen', coalesce((select currency from public.players where firebase_uid = uid), 0),
    'diamanten', coalesce((select d.stand from public.diamanten_konto d where d.firebase_uid = uid), 0),
    'tanz', (select jsonb_build_object('tanz', z.tanz, 'vbucks', z.vbucks, 'erledigt', z.erledigt_am is not null)
               from public.pass_tanz_zusagen z where z.firebase_uid = uid and z.pass_id = p_pass_id),
    'geholt', coalesce((select jsonb_agg(g.stufe || ':' || g.spur) from public.pass_belohnungen_geholt g
                         where g.firebase_uid = uid and g.pass_id = p_pass_id), '[]'::jsonb),
    'belohnungen', coalesce((select jsonb_agg(jsonb_build_object(
                         'stufe', b.stufe, 'spur', b.spur, 'dublonen', b.dublonen, 'xp', b.xp,
                         'skillpunkte', b.skillpunkte, 'avatar_id', b.avatar_id, 'avatar_tage', b.avatar_tage,
                         'titel_id', b.titel_id, 'titel_text', t.text, 'titel_stil', t.stil,
                         'tanz_vbucks', b.tanz_vbucks)
                         order by b.stufe, b.spur)
                       from public.pass_belohnungen b
                       left join public.event_titel t on t.titel_id = b.titel_id
                      where b.pass_id = p_pass_id), '[]'::jsonb));
end
$$;

/* Gemeinsame Pruefung aus 53: Saison, Stufe erreicht, Kapitaen. Gibt
   null zurueck, wenn alles passt, sonst den Grund. */
create or replace function app.pass_stufe_pruefen(p_uid text, p_pass_id text, p_stufe integer, p_spur text) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  prog public.player_progression;
  pxp  integer := 0;
begin
  if app.current_account_suspended() then
    return 'gesperrt';
  end if;
  if not app.pass_saison_offen(p_pass_id) then
    return 'keine-saison';
  end if;
  select * into prog from public.player_progression where firebase_uid = p_uid;
  if found and prog.pass_id is not distinct from p_pass_id then
    pxp := coalesce(prog.pass_xp, 0);
  end if;
  if app.skill_level(pxp) < p_stufe then
    return 'zu-frueh';
  end if;
  if p_spur = 'kapitaen'
     and not exists (select 1 from public.pass_kapitaen where firebase_uid = p_uid and pass_id = p_pass_id) then
    return 'kein-kapitaen';
  end if;
  return null;
end
$$;

/* Rumpf aus 53, dazu EINE Weiche: Tanz-Stufen gehen nur ueber
   pass_tanz_holen(). Dadurch ueberspringt auch pass_alle_holen()
   den Tanz (der Grund "tanz-formular" bricht dort nicht ab). */
create or replace function app.pass_belohnung_holen(p_pass_id text, p_stufe integer, p_spur text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  b     public.pass_belohnungen;
  grund text;
  erg   jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into b from public.pass_belohnungen where pass_id = p_pass_id and stufe = p_stufe and spur = p_spur;
  if not found then
    if not app.pass_saison_offen(p_pass_id) then
      return jsonb_build_object('ok', false, 'grund', 'keine-saison');
    end if;
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  grund := app.pass_stufe_pruefen(uid, p_pass_id, p_stufe, p_spur);
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if b.tanz_vbucks is not null then
    return jsonb_build_object('ok', false, 'grund', 'tanz-formular');
  end if;

  begin
    insert into public.pass_belohnungen_geholt (firebase_uid, pass_id, stufe, spur)
    values (uid, p_pass_id, p_stufe, p_spur)
    on conflict do nothing;
    if not found then
      return jsonb_build_object('ok', false, 'grund', 'schon');
    end if;

    if b.dublonen > 0 or (b.avatar_id is not null and b.avatar_tage is not null) then
      insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
      update public.players
         set currency = currency + b.dublonen,
             total_currency_earned = total_currency_earned + b.dublonen,
             temp_avatar_id = case when b.avatar_tage is not null then b.avatar_id else temp_avatar_id end,
             temp_avatar_expires_at = case when b.avatar_tage is not null
               then (extract(epoch from now()) * 1000)::bigint + b.avatar_tage * 86400000
               else temp_avatar_expires_at end
       where firebase_uid = uid;
    end if;
    if b.xp > 0 or b.skillpunkte > 0 then
      /* least(): Deckel aus 22 (bonus_skill_points <= 500). */
      update public.player_progression
         set xp = xp + b.xp,
             bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + b.skillpunkte),
             updated_at = now()
       where firebase_uid = uid;
    end if;
    if b.titel_id is not null then
      insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, b.titel_id)
      on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
    end if;
  exception when others then
    /* Tagesdeckel (41): nichts verbucht, die Stufe bleibt offen. */
    if sqlerrm = 'dublonen-tageslimit' then
      return jsonb_build_object('ok', false, 'grund', 'tageslimit');
    end if;
    raise;
  end;

  if b.dublonen > 0 then erg := erg || jsonb_build_object('dublonen', b.dublonen); end if;
  if b.xp > 0 then erg := erg || jsonb_build_object('xp', b.xp); end if;
  if b.skillpunkte > 0 then erg := erg || jsonb_build_object('skillpunkte', b.skillpunkte); end if;
  if b.avatar_id is not null then
    erg := erg || jsonb_build_object('avatar_id', b.avatar_id, 'avatar_tage', b.avatar_tage);
  end if;
  if b.titel_id is not null then
    erg := erg || jsonb_build_object('titel', (select jsonb_build_object('text', t.text, 'stil', t.stil)
                                                 from public.event_titel t where t.titel_id = b.titel_id));
  end if;
  return jsonb_build_object('ok', true, 'stufe', p_stufe, 'spur', p_spur) || erg;
end
$$;

/* Den Tanz anfordern: Epic-Name (3-32 Zeichen, so wie Epic sie
   zulaesst, ohne Steuerzeichen) und Wunsch-Tanz (2-60 Zeichen). */
create or replace function app.pass_tanz_holen(p_pass_id text, p_epic_name text, p_tanz text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  b     public.pass_belohnungen;
  grund text;
  epic  text := btrim(coalesce(p_epic_name, ''));
  wahl  text := btrim(coalesce(p_tanz, ''));
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into b from public.pass_belohnungen
   where pass_id = p_pass_id and tanz_vbucks is not null
   order by stufe desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if char_length(epic) not between 3 and 32 or epic ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'grund', 'epic-name');
  end if;
  if char_length(wahl) not between 2 and 60 or wahl ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'grund', 'tanz-name');
  end if;
  grund := app.pass_stufe_pruefen(uid, p_pass_id, b.stufe, b.spur);
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;

  insert into public.pass_belohnungen_geholt (firebase_uid, pass_id, stufe, spur)
  values (uid, p_pass_id, b.stufe, b.spur)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  insert into public.pass_tanz_zusagen (firebase_uid, pass_id, nickname, epic_name, tanz, vbucks)
  values (uid, p_pass_id, (select nickname from public.players where firebase_uid = uid), epic, wahl, b.tanz_vbucks);
  return jsonb_build_object('ok', true, 'tanz', wahl, 'vbucks', b.tanz_vbucks);
end
$$;

/* Admin: offene und erledigte Zusagen, offene zuerst. */
create or replace function app.admin_tanz_zusagen() returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
            'uid', z.firebase_uid, 'pass_id', z.pass_id, 'nickname', z.nickname, 'epic_name', z.epic_name,
            'tanz', z.tanz, 'vbucks', z.vbucks, 'angefragt_am', z.angefragt_am, 'erledigt_am', z.erledigt_am)
            order by (z.erledigt_am is not null), z.angefragt_am)
          from public.pass_tanz_zusagen z), '[]'::jsonb);
end
$$;

/* Admin: als verschenkt abhaken. Der Epic-Name wird dabei geloescht. */
create or replace function app.admin_tanz_erledigt(p_uid text, p_pass_id text) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  update public.pass_tanz_zusagen
     set erledigt_am = coalesce(erledigt_am, now()), epic_name = null
   where firebase_uid = p_uid and pass_id = p_pass_id;
  return found;
end
$$;


/* ======================================================
   4. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.pass2_konto_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  delete from public.diamanten_konto         where firebase_uid = old.firebase_uid;
  delete from public.diamanten_buchungen     where firebase_uid = old.firebase_uid;
  delete from public.pass_tanz_zusagen       where firebase_uid = old.firebase_uid;
  delete from public.pass_kapitaen           where firebase_uid = old.firebase_uid;
  delete from public.pass_belohnungen_geholt where firebase_uid = old.firebase_uid;
  return old;
end
$$;

drop trigger if exists pass2_konto_aufraeumen on public.players;
create trigger pass2_konto_aufraeumen
  after delete on public.players
  for each row execute function app.pass2_konto_aufraeumen();


/* ======================================================
   5. WRAPPER UND RECHTE
====================================================== */
create or replace function public.admin_diamanten_geben(p_uid text, p_anzahl integer) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_diamanten_geben(p_uid, p_anzahl) $$;
create or replace function public.admin_diamanten_an_alle(p_anzahl integer) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_diamanten_an_alle(p_anzahl) $$;
create or replace function public.pass_tanz_holen(p_pass_id text, p_epic_name text, p_tanz text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.pass_tanz_holen(p_pass_id, p_epic_name, p_tanz) $$;
create or replace function public.admin_tanz_zusagen() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.admin_tanz_zusagen() $$;
create or replace function public.admin_tanz_erledigt(p_uid text, p_pass_id text) returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_tanz_erledigt(p_uid, p_pass_id) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.diamanten_buchen(text, integer, text)               from public, anon, authenticated;
revoke execute on function app.pass_stufe_pruefen(text, text, integer, text)       from public, anon, authenticated;
revoke execute on function app.pass2_konto_aufraeumen()                            from public, anon, authenticated;
revoke execute on function app.admin_diamanten_geben(text, integer)                from public, anon;
revoke execute on function app.admin_diamanten_an_alle(integer)                    from public, anon;
revoke execute on function app.pass_tanz_holen(text, text, text)                   from public, anon;
revoke execute on function app.admin_tanz_zusagen()                                from public, anon;
revoke execute on function app.admin_tanz_erledigt(text, text)                     from public, anon;
revoke execute on function public.admin_diamanten_geben(text, integer)             from public, anon;
revoke execute on function public.admin_diamanten_an_alle(integer)                 from public, anon;
revoke execute on function public.pass_tanz_holen(text, text, text)                from public, anon;
revoke execute on function public.admin_tanz_zusagen()                             from public, anon;
revoke execute on function public.admin_tanz_erledigt(text, text)                  from public, anon;
grant  execute on function app.admin_diamanten_geben(text, integer)                to authenticated;
grant  execute on function app.admin_diamanten_an_alle(integer)                    to authenticated;
grant  execute on function app.pass_tanz_holen(text, text, text)                   to authenticated;
grant  execute on function app.admin_tanz_zusagen()                                to authenticated;
grant  execute on function app.admin_tanz_erledigt(text, text)                     to authenticated;
grant  execute on function public.admin_diamanten_geben(text, integer)             to authenticated;
grant  execute on function public.admin_diamanten_an_alle(integer)                 to authenticated;
grant  execute on function public.pass_tanz_holen(text, text, text)                to authenticated;
grant  execute on function public.admin_tanz_zusagen()                             to authenticated;
grant  execute on function public.admin_tanz_erledigt(text, text)                  to authenticated;
