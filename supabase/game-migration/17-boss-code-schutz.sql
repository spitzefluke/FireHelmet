/* ======================================================
   BOSS-CODES: PLATZHALTER KOENNEN NICHT MEHR DURCHRUTSCHEN
   ---------------------------------------------------
   WAS PASSIERT IST
   Die Anleitung in 10-boss-attacks.sql zeigte, wie man Codes
   anlegt - mit Platzhaltern wie 'DEIN-CODE-HIER'. In einer
   Unterhaltung wurde daraus eine fertige INSERT-Anweisung fuer
   alle elf Angriffe, in der die Platzhalter noch drinstanden
   ('DEIN-CODE-SALVE', 'DEIN-CODE-BRANDPFEIL', ...). Sie sah aus
   wie etwas, das man ausfuehrt, und wurde ausgefuehrt.

   Datenbank und Browser waren dabei die ganze Zeit in Ordnung.
   Es standen nur elf Codes drin, die NIEMAND kannte - der Server
   lehnte jede Eingabe voellig zu Recht ab.

   ZWEI PROBLEME AUF EINMAL
   1. Die Codes waren unbrauchbar (niemand kannte sie).
   2. Sie waren RATBAR. Das Muster steht in einer oeffentlichen
      Datei im Repository; wer 'DEIN-CODE-SALVE' eintippt, haette
      einen Spezialangriff bekommen. Geprueft: bis jetzt hat das
      niemand getan (boss_attack_state.frei war ueberall leer).

   WAS DIESE DATEI MACHT
   Sie raeumt die Platzhalter weg und baut einen Riegel ein, damit
   so etwas nicht noch einmal still durchgeht.

   REIHENFOLGE: nach 14-admin-werkzeuge-2.sql einspielen.
====================================================== */


/* ======================================================
   1. DIE PLATZHALTER WEG
   ---------------------------------------------------
   Es wird NICHT die ganze Tabelle geleert, sondern nur das
   geloescht, was nachweislich ein Platzhalter ist: der Hash wird
   gegen 'DEIN-CODE-<SCHLUESSEL>' und 'DEIN-CODE-HIER' geprueft.
   Ein echter Code, den du inzwischen selbst angelegt hast, bleibt
   dadurch unangetastet.
====================================================== */
delete from public.boss_special_codes b
 where b.code_sha256 in (
   encode(extensions.digest(upper('DEIN-CODE-' || upper(b.schluessel)), 'sha256'), 'hex'),
   encode(extensions.digest(upper('DEIN-CODE-HIER'), 'sha256'), 'hex')
 );


/* ======================================================
   2. DER RIEGEL
   ---------------------------------------------------
   admin_boss_code_setzen() nimmt einen Platzhalter nicht mehr an.
   Das ist bewusst eine harte Ausnahme und keine stille Ablehnung:
   der Sinn der Sperre ist, dass man den Fehler MERKT.

   Ausserdem faellt jetzt ein Code auf, in dem ein Leerzeichen
   steckt - beim Vorlesen im Stream oder Abschreiben vom Bildschirm
   ist das eine Fehlerquelle, und der Server verzeiht nur
   Leerzeichen am Anfang und am Ende, nicht in der Mitte.

   Der Rest der Funktion ist Zeile fuer Zeile aus
   14-admin-werkzeuge-2.sql uebernommen; aendert sich dort etwas,
   muss es hier mitgezogen werden.
====================================================== */
create or replace function app.admin_boss_code_setzen(p_code text, p_schluessel text, p_bemerkung text default null)
returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  hash  text;
  sauber text := btrim(coalesce(p_code, ''));
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if char_length(sauber) < 3 then
    raise exception 'code-zu-kurz';
  end if;

  -- Der eigentliche Riegel.
  if upper(sauber) like 'DEIN-CODE%' or upper(sauber) = 'HIER-DEN-CODE-EINTIPPEN' then
    raise exception 'platzhalter-code: "%" ist der Beispieltext aus der Anleitung, kein echter Code', sauber;
  end if;

  if sauber like '% %' then
    raise exception 'code-mit-leerzeichen: der Server verzeiht Leerzeichen nur am Anfang und Ende';
  end if;

  if not exists (select 1 from public.boss_attack_defs where schluessel = p_schluessel and art = 'spezial') then
    raise exception 'kein-spezialangriff';
  end if;

  -- btrim() wie in boss_unlock_special(), damit beide Seiten
  -- denselben Text hashen.
  hash := encode(extensions.digest(upper(sauber), 'sha256'), 'hex');
  insert into public.boss_special_codes (code_sha256, schluessel, bemerkung)
       values (hash, p_schluessel, p_bemerkung)
  on conflict (code_sha256) do update set schluessel = excluded.schluessel, bemerkung = excluded.bemerkung;

  perform app.admin_notiz('boss-code-gesetzt', hash, jsonb_build_object('angriff', p_schluessel));
  return hash;
end
$$;


/* ======================================================
   3. NACHSEHEN, WELCHE ANGRIFFE NOCH KEINEN CODE HABEN
   ---------------------------------------------------
   Ohne das merkt man erst im Stream, dass einer fehlt.
====================================================== */
create or replace function app.admin_boss_codes_fehlen()
returns table (schluessel text, hat_code boolean)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select d.schluessel,
           exists (select 1 from public.boss_special_codes c where c.schluessel = d.schluessel)
      from public.boss_attack_defs d
     where d.art = 'spezial'
     order by 2, 1;
end
$$;

create or replace function public.admin_boss_codes_fehlen()
returns table (schluessel text, hat_code boolean)
language sql
as $$ select * from app.admin_boss_codes_fehlen() $$;

grant execute on function app.admin_boss_codes_fehlen()    to authenticated;
grant execute on function public.admin_boss_codes_fehlen() to authenticated;


/* ======================================================
   4. WIE DU DIE CODES JETZT ANLEGST
   ---------------------------------------------------
   AM BESTEN ueber das Admin-Panel: Seite oeffnen, Bereich "Codes",
   Feld "Boss-Code" plus Spezialangriff auswaehlen, absenden. Das
   laeuft durch admin_boss_code_setzen() - also durch den Riegel
   oben - und landet im admin_protokoll.

   Wenn es doch SQL sein soll, dann so. Der do-Block bricht ab,
   bevor irgendetwas geschrieben wird, falls ein Platzhalter
   stehen geblieben ist:

     do $ausfuehren$
     declare
       paare text[][] := array[
         ['salve',         'HIER-DEN-ECHTEN-CODE'],
         ['brandpfeil',    'HIER-DEN-ECHTEN-CODE']
         -- ... die restlichen neun
       ];
       i int;
     begin
       for i in 1 .. array_length(paare, 1) loop
         if upper(paare[i][2]) like 'HIER%' or upper(paare[i][2]) like 'DEIN-CODE%' then
           raise exception 'Platzhalter bei "%" - nichts wurde geschrieben', paare[i][1];
         end if;
       end loop;

       for i in 1 .. array_length(paare, 1) loop
         insert into public.boss_special_codes (code_sha256, schluessel)
              values (encode(extensions.digest(upper(btrim(paare[i][2])),'sha256'),'hex'), paare[i][1])
         on conflict (code_sha256) do update set schluessel = excluded.schluessel;
       end loop;
     end
     $ausfuehren$;

   Danach kontrollieren:
     select * from public.admin_boss_codes_fehlen();
   Steht ueberall true, ist alles besetzt.
====================================================== */
