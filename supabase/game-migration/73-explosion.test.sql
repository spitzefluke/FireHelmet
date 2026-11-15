/* ======================================================
   PRUEFUNG ZU 73-explosion.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 73 eingespielt wurde.
   Ein einziger DO-Block. ALLES Geschriebene - auch das Loeschen in T5 -
   steht in einem inneren Block, der mit einer Ausnahme endet: Postgres
   rollt ihn vollstaendig zurueck, die Live-Daten bleiben unberuehrt.
   Die Zeit laeuft nicht im Test - das Ziel wird dafuer direkt in
   public.explosion zurueckgesetzt.
   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '73aa0000-0000-0000-0000-0000000000ff';
  p1      constant text := '73aa0000-0000-0000-0000-0000000000a1';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  geld    integer;
  pass    integer;
  zelle   integer;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Zustand dicht, Rechte, Einspielen loescht nichts. */
  ok := (select relrowsecurity from pg_class where oid = 'public.explosion'::regclass) = true
    and not exists (select 1 from pg_policies where tablename = 'explosion')
    and has_table_privilege('authenticated', 'public.explosion', 'select') = false
    and has_function_privilege('anon', 'public.explosion_ausloesen()', 'execute') = false
    and has_function_privilege('authenticated', 'public.explosion_ausloesen()', 'execute') = true
    and has_function_privilege('authenticated', 'app.explosion_loeschen()', 'execute') = false
    and has_function_privilege('authenticated', 'app.explosion_ausloesen()', 'execute') = false
    and (select ausgeloest_am from public.explosion where id = 1) is null
    and has_function_privilege('authenticated', 'public.mine_hacken(integer)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Zustand ohne Policies, Rechte, nichts geloescht' || E'\n';

  begin
    insert into public.players (firebase_uid, nickname, currency, last_wheel_spin_at)
    values (p1, 'Testpirat73', 777, now()) on conflict (firebase_uid) do update set currency = 777, last_wheel_spin_at = now();
    insert into public.player_progression (firebase_uid, pass_xp, unlocked_skills, bonus_skill_points)
    values (p1, 1234, array['test-knoten'], 3)
    on conflict (firebase_uid) do update set pass_xp = 1234, unlocked_skills = array['test-knoten'], bonus_skill_points = 3;
    insert into public.mine_stand (firebase_uid) values (p1) on conflict do nothing;
    insert into public.race_progress (week, firebase_uid, nickname) values ('2099-W01', p1, 'Testpirat73') on conflict do nothing;
    insert into public.hangar_einheiten (firebase_uid, typ) values (p1, 'jaeger') on conflict do nothing;
    geld  := (select currency from public.players where firebase_uid = p1);
    pass  := (select count(*) from public.pass_belohnungen);
    zelle := (select count(*) from public.event_titel);
    update public.explosion set ziel = null, scharf_am = null, story_id = null, ausgeloest_am = null where id = 1;

    /* T2: Nur der Admin setzt ein Ziel, und nur 2 min bis 30 Tage voraus. */
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    begin perform public.admin_explosion_ziel(now() + interval '1 hour'); ok := false; exception when others then ok := sqlerrm = 'nur-admin'; end;
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    begin perform public.admin_explosion_ziel(now() + interval '30 seconds'); ok := false; exception when others then ok := ok and sqlerrm = 'ziel-ungueltig'; end;
    begin perform public.admin_explosion_ziel(now() + interval '40 days'); ok := false; exception when others then ok := ok and sqlerrm = 'ziel-ungueltig'; end;
    /* Ohne Ziel laesst sich die Story nicht scharf schalten. */
    begin perform public.admin_live_story('explosion'); ok := false; exception when others then ok := ok and sqlerrm = 'explosion-ohne-ziel'; end;
    erg := public.admin_explosion_ziel(now() + interval '1 hour');
    ok := ok and (erg ->> 'ok')::boolean = true
      and (select explosion_ziel from public.live_event where id = 1) is not null
      and (select scharf_am from public.explosion where id = 1) is null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Ziel nur Admin, 2 min bis 30 Tage, Story nur mit Ziel' || E'\n';

    /* T3: Story scharf; vor dem Ziel loest niemand aus, keine andere Story. */
    perform public.admin_live_story('explosion');
    ok := (select scharf_am from public.explosion where id = 1) is not null
      and (select story from public.live_event where id = 1) = 'explosion'
      and (select explosion_scharf_am from public.live_event where id = 1) is not null;
    begin perform public.admin_live_story('sturm'); ok := false; exception when others then ok := ok and sqlerrm = 'explosion-laeuft'; end;
    begin perform public.admin_explosion_ziel(now() + interval '2 hours'); ok := false; exception when others then ok := ok and sqlerrm = 'explosion-laeuft'; end;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := public.explosion_ausloesen();
    ok := ok and erg ->> 'grund' = 'noch-nicht'
      and exists (select 1 from public.mine_stand where firebase_uid = p1)
      and (select count(*) from public.skill_nodes) > 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Scharf, vor dem Ziel nichts, keine andere Story' || E'\n';

    /* T4: Abbrechen vor dem Ziel; danach loest auch ein altes Ziel nichts aus. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    perform public.admin_explosion_abbrechen();
    ok := (select scharf_am from public.explosion where id = 1) is null
      and (select story from public.live_event where id = 1) is null;
    update public.explosion set ziel = now() - interval '1 minute' where id = 1;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    ok := ok and public.explosion_ausloesen() ->> 'grund' = 'noch-nicht'
      and exists (select 1 from public.mine_stand where firebase_uid = p1);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Abbrechen vor dem Ziel entschaerft' || E'\n';

    /* T7: Verweist eine fremde Tabelle auf eine der Tabellen, bricht das
       Loeschen ab - und es ist GAR NICHTS geloescht oder gesperrt. */
    create table public.t73_fremd (k text references public.skill_nodes (node_id));
    insert into public.t73_fremd values ((select node_id from public.skill_nodes limit 1));
    update public.explosion set scharf_am = now() - interval '1 hour', ziel = now() - interval '1 second' where id = 1;
    erg := public.explosion_ausloesen();
    ok := erg ->> 'grund' = 'fehler'
      and (select fehler from public.explosion where id = 1) is not null
      and (select ausgeloest_am from public.explosion where id = 1) is null
      and exists (select 1 from public.mine_stand where firebase_uid = p1)
      and (select count(*) from public.skill_nodes) > 0
      and (select last_wheel_spin_at from public.players where firebase_uid = p1) is not null
      and has_function_privilege('authenticated', 'public.mine_hacken(integer)', 'execute') = true;
    drop table public.t73_fremd;
    update public.explosion set scharf_am = null, ziel = null, fehler = null where id = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Fremder Verweis: Abbruch, nichts geloescht' || E'\n';

    /* T5: Scharf + Ziel erreicht: genau einmal loeschen, Bleibendes bleibt. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    perform public.admin_explosion_ziel(now() + interval '10 minutes');
    perform public.admin_live_story('explosion');
    update public.explosion set ziel = now() - interval '1 second' where id = 1;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := public.explosion_ausloesen();
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'schon')::boolean = false
      and not exists (select 1 from public.mine_stand)
      and not exists (select 1 from public.race_progress)
      and not exists (select 1 from public.hangar_einheiten)
      and not exists (select 1 from public.skill_nodes)
      and not exists (select 1 from public.schlacht_typen)
      and not exists (select 1 from public.boss_attack_defs)
      and (select last_wheel_spin_at from public.players where firebase_uid = p1) is null
      and (select cardinality(unlocked_skills) from public.player_progression where firebase_uid = p1) = 0
      and (select bonus_skill_points from public.player_progression where firebase_uid = p1) = 0
      /* Bleibt: Dublonen, Pass-XP, Pass-Belohnungen, Titel */
      and (select currency from public.players where firebase_uid = p1) = geld
      and (select pass_xp from public.player_progression where firebase_uid = p1) = 1234
      and (select count(*) from public.pass_belohnungen) = pass
      and (select count(*) from public.event_titel) = zelle
      /* Gesperrt: Funktionen und Schreiben; Bleibendes weiter offen */
      and has_function_privilege('authenticated', 'public.mine_hacken(integer)', 'execute') = false
      and has_function_privilege('authenticated', 'public.skill_freischalten(text)', 'execute') = false
      and has_function_privilege('authenticated', 'public.schlacht_stand(bigint)', 'execute') = false
      and has_table_privilege('authenticated', 'public.race_progress', 'insert') = false
      and has_function_privilege('authenticated', 'public.pass_stand(text)', 'execute') = true
      and has_function_privilege('authenticated', 'public.zelle_start(boolean)', 'execute') = true
      and (select explosion_weg_ab from public.live_event where id = 1) is not null
      and (select bericht -> 'tabellen' ->> 'mine_stand' from public.explosion where id = 1) is not null;
    erg := public.explosion_ausloesen();
    ok := ok and (erg ->> 'schon')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Bei 0 einmal geloescht, Dublonen/Pass/Titel bleiben' || E'\n';

    /* T6: Danach ist es endgueltig: kein neues Ziel, kein Abbrechen, keine neue Explosion. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    begin perform public.admin_explosion_ziel(now() + interval '1 hour'); ok := false; exception when others then ok := sqlerrm = 'schon-explodiert'; end;
    begin perform public.admin_explosion_abbrechen(); ok := false; exception when others then ok := ok and sqlerrm = 'schon-explodiert'; end;
    begin perform public.admin_live_story('explosion'); ok := false; exception when others then ok := ok and sqlerrm = 'schon-explodiert'; end;
    ok := ok and public.admin_live_story('sturm') is not null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Endgueltig: kein neues Ziel, andere Storys wieder frei' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
