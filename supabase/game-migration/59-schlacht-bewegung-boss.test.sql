/* ======================================================
   PRUEFUNG ZU 59-schlacht-bewegung-boss.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 58 und 59 eingespielt wurden.
   Ein einziger DO-Block. Alles Geschriebene (Freigaben, Epoche,
   Testspieler, Probe-Schlachten) steht in einem inneren Block, der
   mit einer Ausnahme endet - Postgres rollt ihn zurueck. Eine
   laufende echte Schlacht wird dafuer nur innerhalb dieses Blocks
   beendet.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt; zwei weitere Testspieler kaempfen fuer die Aliens.
   Alle Probe-Schlachten spielen ohne Ort (neutral).
   Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '59aa0000-0000-0000-0000-0000000000ff';
  a1      constant text := '59aa0000-0000-0000-0000-0000000000a1';
  a2      constant text := '59aa0000-0000-0000-0000-0000000000a2';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  s       public.sternenschlacht;
  e       public.sternenschlacht_einheiten;
  z       public.sternenschlacht_einheiten;
  w       record;
  erwartet numeric;
  la      numeric;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'hangarAusruestung' - 'schlachtBewegung' - 'schlachtBoss'
             - 'schlachtParteien' - 'schlachtOrte') where id = 'main';
    insert into public.players (firebase_uid, nickname, seite, currency) values
      (ad, 'BossAdmin', 'menschen', 0), (a1, 'Alien1', 'aliens', 0), (a2, 'Alien2', 'aliens', 0);
    insert into public.hangar_einheiten (firebase_uid, typ, waffe, modul1, modul2) values (ad, 'jaeger', 'plasma', 'panzer', 'schild');
    insert into public.schiff_rang (firebase_uid, xp) values (ad, 700);
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);

    /* T1: die Freigaben gelten ab dem Start der Schlacht. */
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    ok := s.mit_ausruestung = false and s.mit_bewegung = false and s.modus = 'normal' and e.rang = 0 and e.waffe is null;
    perform app.admin_schlacht_beenden();
    update public.site_config set data = jsonb_set(jsonb_set(data, '{featureFlags,hangarAusruestung}', 'true'::jsonb),
           '{featureFlags,schlachtBewegung}', 'true'::jsonb) where id = 'main';
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.mit_ausruestung = true and s.mit_bewegung = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Freigaben beim Start festgehalten' || E'\n';

    /* T2: Ausruestung und Rang beim Aufstellen - Kommandant (+6 %),
       Verbundpanzer (+15 % Leben). */
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    select * into w from app.schlacht_werte('jaeger', 'menschen', 0, 0, 0);
    ok := e.rang = 3 and e.waffe = 'plasma' and e.modul1 = 'panzer' and e.modul2 = 'schild'
      and e.leben = round(w.leben * 1.06 * 1.15) and e.schaden = round(w.schaden * 1.06 * 10) / 10.0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Ausruestung und Rang beim Aufstellen' || E'\n';

    /* T3: Zielschuss mit Plasmakanone (+15 %); Lichtlanze laedt 8 s,
       mit Zielcomputer 7 s, und trifft +35 %. */
    /* Grosse Seiten, damit ein Zielschuss sie nicht gleich leert. */
    update public.sternenschlacht set leben0_menschen = 100000, leben0_aliens = 100000 where id = sid;
    update public.sternenschlacht_einheiten set leben = 3000 where schlacht_id = sid and firebase_uid in (a1, a2);
    erg := app.schlacht_ziel(a1);
    ok := (erg ->> 'wert')::numeric = round(e.schaden * 10 * 1.15, 1)
      and app.schlacht_ziel(a1) ->> 'grund' = 'zu-schnell';
    update public.sternenschlacht_einheiten set waffe = 'lanze', ziel_at = now() - interval '6 seconds'
     where schlacht_id = sid and firebase_uid = ad;
    ok := ok and app.schlacht_ziel(a1) ->> 'grund' = 'zu-schnell';
    update public.sternenschlacht_einheiten set modul2 = 'zielcomputer', ziel_at = now() - interval '7.5 seconds'
     where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_ziel(a1);
    ok := ok and (erg ->> 'takt')::numeric = 7 and (erg ->> 'wert')::numeric = round(e.schaden * 10 * 1.35, 1);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Sonderwaffen am Zielschuss' || E'\n';

    /* T4: Bewegen - Takt, Hoechstgeschwindigkeit; Front und Ausweichen
       am Zielschuss, Deflektorschild -20 %. */
    erg := app.schlacht_bewegen(1, 0.5);
    ok := (erg ->> 'x')::numeric = 1 and app.schlacht_bewegen(0, 0.5) ->> 'grund' = 'zu-schnell';
    update public.sternenschlacht_einheiten set bewegt_at = now() - interval '1 second' where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_bewegen(0, 0.5);
    ok := ok and (erg ->> 'x')::numeric = 0.35;
    update public.sternenschlacht_einheiten set modul2 = 'schild' where schlacht_id = sid and firebase_uid = ad;
    perform set_config('request.jwt.claims', '{"sub":"' || a1 || '","role":"authenticated"}', true);
    select * into z from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = a1;
    erg := app.schlacht_ziel(ad);
    ok := ok and (erg ->> 'wert')::numeric = round(z.schaden * 10 * (0.85 + 0.3 * 0.35) * 0.75 * 0.8, 1);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Bewegen, Front, Ausweichen, Schild' || E'\n';

    /* T5: Huelle - zerstoert, dann kein Zielschuss mehr auf und vom
       Wrack; nach 45 s Notsprung mit voller Huelle. */
    update public.sternenschlacht_einheiten set treffer = 4 * leben where schlacht_id = sid and firebase_uid = ad;
    update public.sternenschlacht_einheiten set ziel_at = null where schlacht_id = sid and firebase_uid = a1;
    erg := app.schlacht_ziel(ad);
    ok := (erg ->> 'zerstoert')::boolean = true;
    update public.sternenschlacht_einheiten set ziel_at = null where schlacht_id = sid and firebase_uid = a1;
    ok := ok and app.schlacht_ziel(ad) ->> 'grund' = 'falsches-ziel';
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    ok := ok and app.schlacht_spezial() ->> 'grund' = 'zerstoert';
    update public.sternenschlacht_einheiten set zerstoert_at = now() - interval '46 seconds', bewegt_at = null
     where schlacht_id = sid and firebase_uid = ad;
    /* Erst bewegen (loest den Notsprung aus), dann nachsehen - in einem
       "and" waere die Reihenfolge nicht garantiert. */
    erg := app.schlacht_bewegen(0.5, 0.5);
    ok := ok and (erg ->> 'ok')::boolean = true
      and (select treffer = 0 and zerstoert_at is null from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Huelle, Zerstoerung, Notsprung' || E'\n';

    /* T6: Tesla springt mit 50 % auf das zweite Ziel ueber; der
       Reaktor laesst den Spezial nach 45 statt 60 s zu. */
    update public.sternenschlacht_einheiten set waffe = 'tesla', ziel_at = null where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_ziel(a1);
    ok := erg ->> 'kette' = a2 and (erg ->> 'kette_wert')::numeric = round((erg ->> 'wert')::numeric * 0.5, 1)
      and exists (select 1 from public.sternenschlacht_aktionen where schlacht_id = sid and ziel_uid = a2 and firebase_uid = ad);
    update public.sternenschlacht set runde_at = now() - interval '50 seconds' where id = sid;
    update public.sternenschlacht_einheiten set spezial_at = null, modul2 = 'reaktor' where schlacht_id = sid and firebase_uid = ad;
    ok := ok and (app.schlacht_spezial() ->> 'ok')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Tesla-Uebersprung und Reaktor' || E'\n';

    /* T7: Erfahrung am Ende der Schlacht. */
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    perform app.admin_schlacht_beenden();
    select * into s from public.sternenschlacht where id = sid;
    erwartet := 700 + 30 + least(300, floor(e.schaden_gesamt / 50)) + case when s.sieger = 'menschen' then 40 else 0 end;
    ok := (select xp from public.schiff_rang where firebase_uid = ad) = erwartet
      and (select schlachten from public.schiff_rang where firebase_uid = ad) = 1
      and (select xp from public.schiff_rang where firebase_uid = a1) >= 30;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Erfahrung fuer den Schiffs-Rang' || E'\n';

    /* T8: BOSS - nur mit Freigabe; Sammeln, Mutterschiff mit Leben aus
       der Allianz, Salven, Schild, Runde verloren (Boss behaelt sein
       Leben), Boss besiegt. */
    begin
      perform app.admin_boss_starten(10, null, 30, 2);
      ok := false;
    exception when others then ok := sqlerrm = 'boss-gesperrt';
    end;
    update public.site_config set data = jsonb_set(data, '{featureFlags,schlachtBoss}', 'true'::jsonb) where id = 'main';
    sid := app.admin_boss_starten(10, null, 30, 2);
    erg := app.schlacht_partei_waehlen('menschen', 'kreuzer');
    perform set_config('request.jwt.claims', '{"sub":"' || a1 || '","role":"authenticated"}', true);
    ok := ok and app.schlacht_partei_waehlen('kristall', 'prisma') ->> 'grund' = 'falsche-partei'
      and (app.schlacht_partei_waehlen('aliens', 'drohne') ->> 'ok')::boolean = true
      and (erg ->> 'ok')::boolean = true;
    update public.sternenschlacht set beginn_at = now() - interval '1 second' where id = sid;
    perform app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.aufgestellt and s.anzahl_aliens = 1 and s.boss_phase = 1
      and s.boss_max = greatest(2000, round(2 * s.dps_menschen * 600)) and s.leben0_aliens = s.boss_max
      and (select count(*) from public.sternenschlacht_einheiten where schlacht_id = sid and seite = 'menschen') = 2
      and exists (select 1 from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = 'ki-boss' and partei = 'boss');
    /* Zwei Salven nach 65 s (Phase 1: alle 30 s 2 %). */
    update public.sternenschlacht set runde_at = now() - interval '65 seconds' where id = sid;
    ok := ok and abs(app.schlacht_leben(sid, 'menschen', now())
                     - (s.leben0_menschen - s.dps_aliens * 65 - 2 * 0.02 * s.leben0_menschen)) < 0.05;
    /* Schild ab Phase 2: von 30 s die Sekunden 28..30 mit 60 % weniger. */
    update public.sternenschlacht set boss_phase = 2, runde_at = now() - interval '30 seconds' where id = sid;
    delete from public.sternenschlacht_aktionen where schlacht_id = sid;
    ok := ok and abs(app.schlacht_leben(sid, 'aliens', now()) - (s.leben0_aliens - s.dps_menschen * 30 + s.dps_menschen * 0.6 * 2)) < 0.5;
    update public.sternenschlacht_einheiten set ziel_at = null where schlacht_id = sid and firebase_uid = a1;
    select * into z from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = a1;
    ok := ok and (app.schlacht_ziel('ki-boss') ->> 'wert')::numeric = round(z.schaden * 10 * 0.4, 1)
      and (app.schlacht_stand(sid) -> 'boss' ->> 'schild')::boolean = true;
    /* Runde verloren: nach 700 s ist die Allianz gefallen, der Boss nicht. */
    delete from public.sternenschlacht_aktionen where schlacht_id = sid;
    update public.sternenschlacht set runde_at = now() - interval '700 seconds' where id = sid;
    la := app.schlacht_leben(sid, 'aliens', now());
    perform app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.status = 'laeuft' and s.runde = 2 and s.punkte_aliens = 1 and abs(s.leben0_aliens - la) < 1
      and s.leben0_aliens < s.boss_max;
    /* Boss besiegt: Schlacht gewonnen, Endstand 100. */
    update public.sternenschlacht set runde_at = now() - interval '9000 seconds' where id = sid;
    perform app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.status = 'vorbei' and s.sieger = 'menschen' and s.endstand_menschen = 100 and s.boss_rest = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Boss-Mutterschiff' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T9: Rechte. */
  ok := has_function_privilege('authenticated', 'app.schlacht_huelle(bigint, text)', 'execute') = false
    and has_function_privilege('authenticated', 'app.schlacht_boss_frei()', 'execute') = false
    and has_function_privilege('authenticated', 'app.schlacht_ausruestung(text, boolean)', 'execute') = false
    and has_function_privilege('anon', 'public.schlacht_bewegen(numeric, numeric)', 'execute') = false
    and has_function_privilege('authenticated', 'public.schlacht_bewegen(numeric, numeric)', 'execute') = true
    and has_function_privilege('anon', 'public.admin_boss_starten(integer, text, integer, numeric)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T9 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
