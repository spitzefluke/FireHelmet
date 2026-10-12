/* ======================================================
   TEST 41: DUBLONEN-KONTOLIMIT UND TAGESDECKEL
   Nach Migration 41 im Supabase-SQL-Editor ausfuehren.
   Erwartet: 3 PASS-Meldungen; keine Daten bleiben zurueck.
====================================================== */
do $test$
declare
  uid_tag text := 'anti-cheat-' || md5(random()::text || clock_timestamp()::text);
  blockiert boolean := false;
  stand integer;
begin
  insert into public.players (firebase_uid, currency, total_currency_earned)
  values (uid_tag, 0, 0);

  update public.players
     set currency = 30000, total_currency_earned = 30000
   where firebase_uid = uid_tag;

  begin
    update public.players
       set currency = 30001, total_currency_earned = 30001
     where firebase_uid = uid_tag;
  exception when others then
    blockiert := sqlerrm = 'dublonen-tageslimit';
  end;

  select currency into stand from public.players where firebase_uid = uid_tag;
  if not blockiert or stand <> 30000 then
    raise exception 'FAIL: Tageslimit blockiert die Ueberschreitung nicht atomar';
  end if;
  raise notice 'PASS - Tagesgutschriften sind auf 30.000 begrenzt';

  blockiert := false;
  begin
    update public.players set currency = 2000001 where firebase_uid = uid_tag;
  exception when others then
    blockiert := sqlerrm = 'dublonen-kontolimit';
  end;

  select currency into stand from public.players where firebase_uid = uid_tag;
  if not blockiert or stand <> 30000 then
    raise exception 'FAIL: Kontolimit blockiert die Ueberschreitung nicht';
  end if;
  raise notice 'PASS - neue Erhoehungen ueber 2.000.000 werden blockiert';

  if has_table_privilege('anon', 'private.dublonen_tageskonto', 'select')
     or has_table_privilege('authenticated', 'private.dublonen_tageskonto', 'select') then
    raise exception 'FAIL: Tageskonto ist fuer API-Rollen lesbar';
  end if;
  raise notice 'PASS - Tageskonto ist fuer anon/authenticated gesperrt';

  delete from public.players where firebase_uid = uid_tag;
  delete from private.dublonen_tageskonto where firebase_uid = uid_tag;
end
$test$;
