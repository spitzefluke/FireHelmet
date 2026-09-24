/* ======================================================
   PRUEFUNG ZU 28-code-uebersicht.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 28 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Die Test-Codes werden direkt in die Code-Tabellen geschrieben,
   nicht ueber admin_code_setzen() - sonst stuenden Eintraege im
   Admin-Protokoll. Alle Testzeilen (Notiz "28TEST") werden am Ende
   wieder geloescht. Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '28aa0000-0000-0000-0000-00000000000a';
  admin   constant text := '28ad0000-0000-0000-0000-0000000000ad';
  dhash   constant text := encode(extensions.digest('28test-schatz', 'sha256'), 'hex');
  bhash   constant text := encode(extensions.digest('28TEST-KRAKEN', 'sha256'), 'hex');
  angriff text;
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  zeile   record;
begin
  perform set_config('role', 'postgres', true);
  delete from public.admin_code_klartext where code_sha256 in (dhash, bhash);
  delete from public.currency_codes where code_sha256 = dhash;
  delete from public.boss_special_codes where code_sha256 = bhash;
  delete from public.players where firebase_uid = uid;

  select schluessel into angriff from public.boss_attack_defs where art = 'spezial' order by schluessel limit 1;
  insert into public.currency_codes (code_sha256, betrag, bemerkung) values (dhash, 77, '28TEST');
  insert into public.boss_special_codes (code_sha256, schluessel, bemerkung) values (bhash, angriff, '28TEST');

  /* T1: ein Nicht-Admin kann weder merken noch die Liste sehen. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  ok := true;
  begin
    perform app.admin_code_klartext_merken('dublonen', '28test-schatz');
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform * from app.admin_codes_uebersicht();
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Nicht-Admin kann nicht merken und nichts sehen' || E'\n';

  /* T2: der Admin sieht den neuen Code - noch ohne Klartext. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || admin || '","role":"authenticated","is_anonymous":false,"email":"y.n.trott@gmail.com"}', true);
  select * into zeile from app.admin_codes_uebersicht() u where u.code_sha256 = dhash;
  ausgabe := ausgabe || case when zeile.art = 'dublonen' and zeile.wert = 77 and zeile.klartext is null
                                  and zeile.notiz = '28TEST' and zeile.einloesungen = 0
                             then 'PASS' else 'FAIL' end
          || '  T2 Uebersicht zeigt den Dublonen-Code (77, ohne Klartext, 0 Einloesungen)' || E'\n';

  /* T3: ein falscher Code oder die falsche Art wird nicht gemerkt. */
  ok := app.admin_code_klartext_merken('dublonen', '28test-falsch') = false
        and app.admin_code_klartext_merken('boss', '28test-schatz') = false
        and app.admin_code_klartext_merken('xp', '28test-schatz') = false
        and not exists (select 1 from public.admin_code_klartext where code_sha256 = dhash);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 falscher Code und falsche Art werden nicht gemerkt' || E'\n';

  /* T4: Gross-/Kleinschreibung und Leerzeichen wie beim Einloesen. */
  ok := app.admin_code_klartext_merken('dublonen', '  28TEST-Schatz ') = true;
  select * into zeile from app.admin_codes_uebersicht() u where u.code_sha256 = dhash;
  ausgabe := ausgabe || case when ok = true and zeile.klartext = '28TEST-Schatz' then 'PASS' else 'FAIL' end
          || '  T4 Dublonen-Code wird nachgetragen (klein/gross egal, war: ' || coalesce(zeile.klartext, 'null') || ')' || E'\n';

  /* T5: Boss-Codes werden GROSS gehasht - klein getippt geht trotzdem. */
  ok := app.admin_code_klartext_merken('boss', '28test-kraken') = true;
  select * into zeile from app.admin_codes_uebersicht() u where u.code_sha256 = bhash;
  ausgabe := ausgabe || case when ok = true and zeile.art = 'boss' and zeile.schluessel = angriff
                                  and zeile.klartext = '28test-kraken'
                             then 'PASS' else 'FAIL' end
          || '  T5 Boss-Code wird nachgetragen, Angriff "' || coalesce(angriff, 'null') || '"' || E'\n';

  /* T6: Einloesungen werden gezaehlt. */
  perform set_config('role', 'postgres', true);
  insert into public.players (firebase_uid, nickname, redeemed_currency_codes)
       values (uid, 'Testpirat28', jsonb_build_object(dhash, true));
  select u.einloesungen into n from app.admin_codes_uebersicht() u where u.code_sha256 = dhash;
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T6 eine Einloesung wird gezaehlt (war: ' || coalesce(n, -1) || ')' || E'\n';

  /* T7: niemand ausser den Funktionen liest die Klartext-Tabelle. */
  ok := true;
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into n from public.admin_code_klartext;
    ok := false;
  exception when insufficient_privilege then null; when others then ok := false; end;
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.admin_code_klartext;
    ok := false;
  exception when insufficient_privilege then null; when others then ok := false; end;
  perform set_config('role', 'postgres', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 anon und authenticated koennen die Klartexte nicht lesen' || E'\n';

  /* T8: wird ein Code geloescht, verschwindet sein Klartext beim
     naechsten Merken mit. */
  delete from public.currency_codes where code_sha256 = dhash;
  perform app.admin_code_klartext_merken('boss', '28TEST-KRAKEN');
  ok := not exists (select 1 from public.admin_code_klartext where code_sha256 = dhash)
        and exists (select 1 from public.admin_code_klartext where code_sha256 = bhash);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T8 Klartext eines geloeschten Codes wird aufgeraeumt' || E'\n';

  /* T9: anon darf die Funktionen gar nicht erst aufrufen. */
  ok := has_function_privilege('anon', 'public.admin_codes_uebersicht()', 'execute') = false
        and has_function_privilege('anon', 'public.admin_code_klartext_merken(text,text)', 'execute') = false
        and has_function_privilege('anon', 'app.admin_codes_uebersicht()', 'execute') = false
        and has_function_privilege('anon', 'app.admin_code_klartext_merken(text,text)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T9 anon hat kein Ausfuehrrecht auf die Admin-Funktionen' || E'\n';

  /* Aufraeumen */
  perform set_config('request.jwt.claims', '', true);
  delete from public.admin_code_klartext where code_sha256 in (dhash, bhash);
  delete from public.currency_codes where code_sha256 = dhash;
  delete from public.boss_special_codes where code_sha256 = bhash;
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.admin_code_klartext where code_sha256 in (dhash, bhash);
  delete from public.currency_codes where code_sha256 = dhash;
  delete from public.boss_special_codes where code_sha256 = bhash;
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
