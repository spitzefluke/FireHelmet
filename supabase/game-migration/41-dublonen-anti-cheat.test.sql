/* ======================================================
   TEST 41: DUBLONEN-KONTOLIMIT UND TAGESDECKEL
   Nach Migration 41 im Supabase-SQL-Editor ausfuehren.
   Erwartet: 4 PASS-Meldungen; keine Daten bleiben zurueck.
====================================================== */
do $test$
declare
  uid_tag text := 'anti-cheat-' || md5(random()::text || clock_timestamp()::text);
  uid_code text := 'anti-cheat-code-' || md5(random()::text || clock_timestamp()::text);
  blockiert boolean := false;
  stand integer;
begin
  insert into public.players (firebase_uid, currency, total_currency_earned)
  values (uid_tag, 0, 0);
  insert into public.players (firebase_uid, currency, total_currency_earned)
  values (uid_code, 0, 0);

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

  update public.players set currency = 2000001 where firebase_uid = uid_tag;

  select currency into stand from public.players where firebase_uid = uid_tag;
  if stand <> 30000 or not app.dublonen_konto_gesperrt(uid_tag) then
    raise exception 'FAIL: Kontolimit verwirft die Aenderung oder markiert die Sperre nicht';
  end if;
  raise notice 'PASS - Kontolimit verwirft Erhoehung und markiert Konto zur Pruefung';

  update public.players set codes_cracked = 1 where firebase_uid = uid_code;
  select codes_cracked into stand from public.players where firebase_uid = uid_code;
  if stand <> 0 or not app.dublonen_konto_gesperrt(uid_code) then
    raise exception 'FAIL: direkter Ranglistenzaehler wird nicht blockiert und markiert';
  end if;
  raise notice 'PASS - manipulierter Ranglistenzaehler wird blockiert';

  if has_table_privilege('anon', 'private.dublonen_tageskonto', 'select')
     or has_table_privilege('authenticated', 'private.dublonen_tageskonto', 'select') then
    raise exception 'FAIL: Tageskonto ist fuer API-Rollen lesbar';
  end if;
  raise notice 'PASS - Tageskonto ist fuer anon/authenticated gesperrt';

  delete from public.players where firebase_uid in (uid_tag, uid_code);
  delete from private.dublonen_tageskonto where firebase_uid = uid_tag;
  delete from private.dublonen_kontosperren where firebase_uid in (uid_tag, uid_code);
  delete from private.ranglisten_code_einloesungen where firebase_uid in (uid_tag, uid_code);
end
$test$;
