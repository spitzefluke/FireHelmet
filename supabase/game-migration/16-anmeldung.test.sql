/* ======================================================
   TEST: NIEMAND KANN SICH ALS VERIFIZIERT AUSGEBEN
   ---------------------------------------------------
   Vor 16-anmeldung.sql lief der Twitch-Login komplett im Browser.
   Wer die Konsole oeffnete und

     localStorage.wheelNickname = "Ändii"

   setzte, stand danach in der Rangliste wie der Streamer. Der
   Server prueft am Namen nur Laenge und Sperrliste - er konnte gar
   nicht wissen, ob der Name erarbeitet oder eingetippt war.

   Diese Datei prueft die fuenf Faelle, auf die es ankommt. N3 ist
   der wichtigste: koennte sich ein Konto selbst auf 'twitch'
   setzen, waeren N1 und N2 wertlos - man wuerde sich erst
   verifizieren und dann den Namen nehmen.

   VORHER EINSPIELEN: 00, 01, 03, 05, 07, 08-15, dann 16.
====================================================== */

-- Ausgangslage: ein verifiziertes Twitch-Konto namens "Ändii"
insert into public.players (firebase_uid, nickname, currency)
values ('11111111-0000-0000-0000-000000000001', 'Ändii', 0)
on conflict (firebase_uid) do update set nickname = 'Ändii';
update public.players set anmeldeart = 'twitch'
 where firebase_uid = '11111111-0000-0000-0000-000000000001';

-- und ein anonymes Konto, das sich so nennen moechte
insert into public.players (firebase_uid, nickname, currency)
values ('22222222-0000-0000-0000-000000000002', 'Gast', 0)
on conflict (firebase_uid) do update set nickname = 'Gast';
update public.players set anmeldeart = 'anon'
 where firebase_uid = '22222222-0000-0000-0000-000000000002';

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', false);

do $$
declare n int;
begin
  begin
    update public.players set nickname = 'Ändii'
     where firebase_uid = '22222222-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    raise notice '%  - N1 Anonymer nimmt verifizierten Namen (exakt)',
      case when n > 0 then 'FAIL' else 'PASS' end;
  exception when others then
    raise notice 'PASS - N1 Anonymer nimmt verifizierten Namen (exakt): abgewiesen';
  end;

  begin
    update public.players set nickname = 'ändii'
     where firebase_uid = '22222222-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    raise notice '%  - N2 dasselbe klein geschrieben',
      case when n > 0 then 'FAIL' else 'PASS' end;
  exception when others then
    raise notice 'PASS - N2 dasselbe klein geschrieben: abgewiesen';
  end;

  begin
    update public.players set anmeldeart = 'twitch'
     where firebase_uid = '22222222-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    raise notice '%  - N3 sich selbst als verifiziert eintragen',
      case when n > 0 then 'FAIL' else 'PASS' end;
  exception when others then
    raise notice 'PASS - N3 sich selbst als verifiziert eintragen: abgewiesen';
  end;

  begin
    update public.players set nickname = 'Seebaer_Neu'
     where firebase_uid = '22222222-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    raise notice '%  - N4 freier Name geht weiterhin',
      case when n > 0 then 'PASS' else 'FAIL' end;
  exception when others then
    raise notice 'FAIL - N4 freier Name wurde blockiert: %', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
do $$
declare n int;
begin
  begin
    update public.players set currency = 0
     where firebase_uid = '11111111-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    raise notice '%  - N5 Verifizierter schreibt seine eigene Zeile weiter',
      case when n > 0 then 'PASS' else 'FAIL' end;
  exception when others then
    raise notice 'FAIL - N5 Verifizierter blockiert: %', sqlerrm;
  end;
end $$;
