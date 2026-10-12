/* ======================================================
   GEGENHACK: AUFGABEN TAEGLICH ERNEUERN
   ------------------------------------------------------
   Ein Pirat kann dieselben drei Aufgaben jetzt einmal pro
   Kalendertag loesen, solange dieselbe Community-Quest laeuft.
   Der Tageswechsel folgt der deutschen Zeitzone.
   Bestehende Beitraege behalten den Tag ihres Zeitstempels.
====================================================== */

alter table public.gegenhack_beitraege
  add column if not exists tag date;

update public.gegenhack_beitraege
   set tag = (am at time zone 'Europe/Berlin')::date
 where tag is null;

alter table public.gegenhack_beitraege
  alter column tag set default ((now() at time zone 'Europe/Berlin')::date),
  alter column tag set not null;

alter table public.gegenhack_beitraege
  drop constraint if exists gegenhack_beitraege_pkey;
alter table public.gegenhack_beitraege
  add constraint gegenhack_beitraege_pkey
  primary key (quest_id, firebase_uid, aufgabe, tag);

create index if not exists gegenhack_beitraege_quest_uid_tag
  on public.gegenhack_beitraege (quest_id, firebase_uid, tag, aufgabe);

/* Der Gesamtfortschritt zaehlt alle Tage. "meine" zeigt nur heute,
   damit die drei Aufgaben nach Mitternacht wieder spielbar sind. */
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
                   where b.quest_id = q.quest_id
                     and b.firebase_uid = app.firebase_uid()
                     and b.tag = (now() at time zone 'Europe/Berlin')::date), '[]'::jsonb),
      'meine_dublonen', (select g.dublonen from public.gegenhack_belohnungen g
                   where g.quest_id = q.quest_id and g.firebase_uid = app.firebase_uid())
    ) end
    from (select 1) eins
    left join public.gegenhack_quests q on q.quest_id = p_quest
$$;
