/* ======================================================
   PRUEFUNG ZU 18-konto-loeschen.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 18 eingespielt wurde.
   Alles laeuft in einer Transaktion und wird am Ende
   zurueckgerollt - es bleibt nichts stehen.

   Geprueft wird vor allem das, was NICHT passieren darf:
   ein verifiziertes Konto loeschen, und ein fremdes Konto
   mitnehmen.

   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
begin;

/* Huelle, damit eine Ausnahme den Test nicht abbricht, sondern
   als Text in der Ergebnisspalte landet.

   Die Rolle wird NUR hier drin auf authenticated gesetzt, nicht
   fuer die ganze Datei. Ob eine Zeile hinterher weg ist, ist eine
   Tatsache ueber die Tabelle - keine Frage danach, was ein Client
   sehen DARF. Prueft man das als authenticated, scheitert man an
   den Leserechten und haelt das faelschlich fuer ein Ergebnis. */
create or replace function pg_temp.probe(p_claims text) returns text
language plpgsql as $p$
declare n integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', p_claims, true);
  begin
    n := public.mein_konto_loeschen();
    perform set_config('role', 'postgres', true);
    return 'GELOESCHT:' || n;
  exception when others then
    perform set_config('role', 'postgres', true);
    return 'ABGELEHNT:' || sqlerrm;
  end;
end $p$;

/* Die Ansprueche der beiden Testkonten. */
create or replace function pg_temp.anon_a() returns text language sql as $p$
  select '{"sub":"18000000-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}'
$p$;
create or replace function pg_temp.twitch_c() returns text language sql as $p$
  select '{"sub":"18000000-0000-0000-0000-00000000000c","role":"authenticated","app_metadata":{"provider":"twitch"}}'
$p$;

/* --- Testdaten: zwei anonyme Konten und ein verifiziertes ---
   Die UIDs sind bewusst weit weg von echten Werten. */
insert into auth.users (id, created_at) values
  ('18000000-0000-0000-0000-00000000000a', now()),
  ('18000000-0000-0000-0000-00000000000b', now()),
  ('18000000-0000-0000-0000-00000000000c', now())
on conflict (id) do nothing;

insert into public.players (firebase_uid, nickname, currency) values
  ('18000000-0000-0000-0000-00000000000a', 'LoeschMich',  100),
  ('18000000-0000-0000-0000-00000000000b', 'BleibDa',     100),
  ('18000000-0000-0000-0000-00000000000c', 'Verifiziert', 100)
on conflict (firebase_uid) do nothing;

insert into public.ship_repair (firebase_uid) values
  ('18000000-0000-0000-0000-00000000000a')
on conflict (firebase_uid) do nothing;

insert into public.site_ratings (firebase_uid, value, nickname) values
  ('18000000-0000-0000-0000-00000000000a', 5, 'LoeschMich');


/* ======================================================
   T1-T4: das anonyme Konto A loescht sich selbst
====================================================== */
create temp table ergebnis (nr int, test text, wert text);

insert into ergebnis
select 1, 'T1 anonymes Konto darf sich loeschen',
       case when pg_temp.probe(pg_temp.anon_a()) like 'GELOESCHT:%' then 'PASS' else 'FAIL' end;

insert into ergebnis
select 2, 'T2 players-Zeile ist weg',
       case when exists (select 1 from public.players
                          where firebase_uid = '18000000-0000-0000-0000-00000000000a') = false
            then 'PASS' else 'FAIL' end;

insert into ergebnis
select 3, 'T3 ship_repair-Zeile ist weg',
       case when exists (select 1 from public.ship_repair
                          where firebase_uid = '18000000-0000-0000-0000-00000000000a') = false
            then 'PASS' else 'FAIL' end;

insert into ergebnis
select 4, 'T4 auth.users-Zeile ist weg',
       case when exists (select 1 from auth.users
                          where id = '18000000-0000-0000-0000-00000000000a') = false
            then 'PASS' else 'FAIL' end;

/* T5: die Bewertung bleibt stehen, nur ohne Bezug zur Person.
   Bewusst gegen "= false" geprueft und nicht gegen "is not true":
   Letzteres bestuende auch, wenn die Zeile ganz fehlte. */
insert into ergebnis
select 5, 'T5 Bewertung bleibt, aber ohne UID',
       case when exists (select 1 from public.site_ratings
                          where value = 5 and nickname = 'LoeschMich'
                            and firebase_uid is null)
             and exists (select 1 from public.site_ratings
                          where firebase_uid = '18000000-0000-0000-0000-00000000000a') = false
            then 'PASS' else 'FAIL' end;

/* T6: das NACHBARKONTO darf nicht mitgegangen sein. */
insert into ergebnis
select 6, 'T6 fremdes Konto B unangetastet',
       case when exists (select 1 from public.players
                          where firebase_uid = '18000000-0000-0000-0000-00000000000b')
            then 'PASS' else 'FAIL' end;


/* ======================================================
   T7: ein VERIFIZIERTES Konto darf sich NICHT loeschen
   ---------------------------------------------------
   Das ist die wichtigste Zeile dieser Datei. Ginge sie durch,
   wuerde ein Abmelden ein echtes Konto vernichten.
====================================================== */
insert into ergebnis
select 7, 'T7 verifiziertes Konto wird abgelehnt',
       case when pg_temp.probe(pg_temp.twitch_c()) = 'ABGELEHNT:nur-anonyme-konten'
            then 'PASS' else 'FAIL' end;

insert into ergebnis
select 8, 'T8 verifizierte players-Zeile steht noch',
       case when exists (select 1 from public.players
                          where firebase_uid = '18000000-0000-0000-0000-00000000000c')
            then 'PASS' else 'FAIL' end;


select nr, test, wert from ergebnis order by nr;

rollback;
