/* ======================================================
   SKILL-TREE: KNOTEN, PUNKTE, FREISCHALTUNG
   ---------------------------------------------------
   Eine neue Seite mit einem Fertigkeitsbaum. Jeder Knoten kostet
   Skillpunkte und gibt einen dauerhaften Vorteil.

   WOHER DIE PUNKTE KOMMEN
   Ein Punkt je erreichter Passstufe - "pro Level ein Punkt".
   Die Stufe ergibt sich aus pass_xp nach genau derselben Formel
   wie im Browser (passXpRequiredForTier in progression-data.js:
   Stufe N braucht N*(N+1)*50 Punkte, Deckel 50). Zusaetzlich
   koennen Punkte bei einem Live-Event verteilt werden - dafuer
   das Feld bonus_skill_points, das spaeter eine Admin-Funktion
   fuellt.

   Verfuegbar = Passstufe + bonus_skill_points - bereits ausgegeben.

   WER DARF WAS SCHREIBEN
   Welche Knoten ein Spieler HAT (unlocked_skills), entscheidet
   allein die Funktion app.skill_freischalten() - der Browser kann
   die Spalte NICHT direkt setzen. Genau wie bei den XP-Codes
   liegt Kosten und Verfuegbarkeit auf dem Server; der Browser
   schickt nur "diesen Knoten bitte". So kann sich niemand per
   Konsole einen Knoten schenken, den er nicht bezahlt hat.

   Die WIRKUNG der Knoten (mehr Rad-Dublonen usw.) rechnet der
   Browser wie bisher selbst; die Datenbank deckelt weiterhin den
   Kontostand-Sprung (valid_players_write). Die Boni sind bewusst
   so klein gewaehlt, dass sie in den bestehenden Deckeln Platz
   haben - keine Regel wird dafuer gelockert.

   REIHENFOLGE: nach 21 einspielen. Von Hand im SQL-Editor.
   Idempotent.
====================================================== */


/* ======================================================
   1. ZWEI NEUE SPALTEN AUF player_progression
====================================================== */
alter table public.player_progression
  add column if not exists unlocked_skills text[] not null default '{}';
alter table public.player_progression
  add column if not exists bonus_skill_points integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progression_unlocked_skills_len') then
    alter table public.player_progression
      add constraint progression_unlocked_skills_len
      check (coalesce(array_length(unlocked_skills,1),0) <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'progression_bonus_points_sane') then
    alter table public.player_progression
      add constraint progression_bonus_points_sane
      check (bonus_skill_points between 0 and 500);
  end if;
end $$;


/* ======================================================
   2. DIE KNOTEN
   ---------------------------------------------------
   art/wert werden vom Browser gelesen und angewandt. "benoetigt"
   ist die Liste der Knoten, die vorher freigeschaltet sein
   muessen (Baumstruktur).

   Absichtlich keine Lese-Beschraenkung: der Baum muss fuer alle
   sichtbar sein. Geschrieben wird hier NUR von Hand / per
   Migration, nie vom Client (keine Insert/Update-Policy).
====================================================== */
create table if not exists public.skill_nodes (
  node_id     text primary key,
  kosten      integer not null,
  benoetigt   text[]  not null default '{}',
  art         text    not null,
  wert        numeric not null default 0,
  bezeichnung text,
  angelegt_am timestamptz not null default now(),

  constraint skill_nodes_kosten_sane check (kosten between 1 and 10),
  constraint skill_nodes_art_bekannt check (art in
    ('raddublonen','slotdublonen','xpbonus','titel','abzeichen'))
);

alter table public.skill_nodes enable row level security;
alter table public.skill_nodes force row level security;

create policy "skill_nodes_select_public" on public.skill_nodes
  for select to anon, authenticated using (true);

/* Startbaum. Drei Wirkzweige (Rad / Spielothek / XP) plus zwei
   kosmetische Endknoten. Die Prozente sind klein gehalten -
   siehe Deckel-Hinweis oben. */
insert into public.skill_nodes (node_id, kosten, benoetigt, art, wert, bezeichnung) values
  ('rad1',     1, '{}',            'raddublonen',  5,  'Gluecksstraehne I - +5% Rad-Dublonen'),
  ('rad2',     2, '{rad1}',        'raddublonen', 10,  'Gluecksstraehne II - +10% Rad-Dublonen'),
  ('slot1',    1, '{}',            'slotdublonen', 5,  'Spielerglueck I - +5% Spielothek-Gewinn'),
  ('slot2',    2, '{slot1}',       'slotdublonen',10,  'Spielerglueck II - +10% Spielothek-Gewinn'),
  ('xp1',      1, '{}',            'xpbonus',      5,  'Erfahren I - +5% XP'),
  ('xp2',      2, '{xp1}',         'xpbonus',     10,  'Erfahren II - +10% XP'),
  ('titel1',   3, '{rad2,slot2}',  'titel',        0,  'Titel: Gluecksritter'),
  ('abzeichen1',3,'{xp2}',         'abzeichen',    0,  'Abzeichen: Seebaer')
on conflict (node_id) do update
  set kosten = excluded.kosten, benoetigt = excluded.benoetigt,
      art = excluded.art, wert = excluded.wert, bezeichnung = excluded.bezeichnung;


/* ======================================================
   3. DIE PASSSTUFE AUS pass_xp (Server-Spiegel der JS-Formel)
====================================================== */
create or replace function app.skill_level(p_pass_xp integer) returns integer
language plpgsql immutable
as $$
declare
  stufe integer := 0;
begin
  /* Stufe N braucht N*(N+1)*50 Punkte. Hochzaehlen bis der naechste
     Schritt nicht mehr gedeckt ist, Deckel 50 wie im Pass. */
  while stufe < 50 and (stufe + 1) * (stufe + 2) * 50 <= coalesce(p_pass_xp, 0) loop
    stufe := stufe + 1;
  end loop;
  return stufe;
end
$$;


/* ======================================================
   4. FREISCHALTEN
   ---------------------------------------------------
   Rueckgabe:
     > 0  Kosten des soeben freigeschalteten Knotens
       0  schon freigeschaltet
      -1  unbekannter Knoten
      -2  Voraussetzung fehlt
      -3  nicht genug Punkte
====================================================== */
create or replace function app.skill_freischalten(p_node text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid        text := app.firebase_uid();
  prog       public.player_progression;
  knoten     public.skill_nodes;
  ausgegeben integer := 0;
  verfuegbar integer;
  fehlt      text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into knoten from public.skill_nodes where node_id = p_node;
  if not found then
    return -1;
  end if;

  /* Zeile anlegen, falls der Spieler noch keine hat. */
  insert into public.player_progression (firebase_uid) values (uid)
  on conflict (firebase_uid) do nothing;
  select * into prog from public.player_progression where firebase_uid = uid;

  if knoten.node_id = any(prog.unlocked_skills) then
    return 0;
  end if;

  /* Voraussetzungen: jeder benoetigte Knoten muss schon da sein. */
  foreach fehlt in array knoten.benoetigt loop
    if not (fehlt = any(prog.unlocked_skills)) then
      return -2;
    end if;
  end loop;

  /* Bereits ausgegebene Punkte = Summe der Kosten aller
     freigeschalteten Knoten. */
  select coalesce(sum(sk.kosten), 0) into ausgegeben
    from public.skill_nodes sk
   where sk.node_id = any(prog.unlocked_skills);

  verfuegbar := app.skill_level(prog.pass_xp) + coalesce(prog.bonus_skill_points, 0) - ausgegeben;
  if verfuegbar < knoten.kosten then
    return -3;
  end if;

  update public.player_progression
     set unlocked_skills = array_append(unlocked_skills, knoten.node_id),
         updated_at = now()
   where firebase_uid = uid;

  return knoten.kosten;
end
$$;

/* Wrapper security definer - das Schema app hat kein USAGE-Recht
   fuer authenticated (dieselbe Begruendung wie bei 18/19). */
create or replace function public.skill_freischalten(p_node text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.skill_freischalten(p_node) $$;

grant execute on function public.skill_freischalten(text) to authenticated;


/* ======================================================
   5. DER SCHREIB-WAECHTER: unlocked_skills/bonus NICHT vom Client
   ---------------------------------------------------
   valid_progression_write() wird um zwei Bedingungen ERWEITERT
   (nicht neu geschrieben): ein direkter Client-Schreibzugriff
   darf unlocked_skills und bonus_skill_points nicht veraendern.
   Beide aendert nur die SECURITY-DEFINER-Funktion oben, die die
   RLS ohnehin umgeht. Der bestehende Rumpf (xp/pass_xp/claimed/
   cap-Deckel aus Migration 08) bleibt Wort fuer Wort erhalten.
====================================================== */
create or replace function app.valid_progression_write(p_uid text, new_row public.player_progression) returns boolean
language plpgsql stable
as $$
declare
  old_row public.player_progression := app.old_progression(p_uid);
  old_xp integer := coalesce(old_row.xp, 0);
  old_pass_id text := old_row.pass_id;
  old_pass_xp integer := coalesce(old_row.pass_xp, 0);
  old_claimed_count integer := coalesce(array_length(old_row.claimed_reward_ids,1), 0);
  new_claimed_count integer := coalesce(array_length(new_row.claimed_reward_ids,1), 0);
begin
  return new_row.xp <= old_xp + 500
    and (new_row.pass_id != old_pass_id or new_row.pass_xp <= old_pass_xp + 500)
    and new_claimed_count >= old_claimed_count
    and new_claimed_count <= old_claimed_count + 1
    and new_row.has_flitzpiepen_cap = coalesce(old_row.has_flitzpiepen_cap, false)
    /* NEU: der Skill-Baum wird nur ueber die RPC geaendert. */
    and new_row.unlocked_skills = coalesce(old_row.unlocked_skills, '{}')
    and new_row.bonus_skill_points = coalesce(old_row.bonus_skill_points, 0);
end;
$$;
