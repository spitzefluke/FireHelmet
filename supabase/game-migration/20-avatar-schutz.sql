/* ======================================================
   AVATAR-FELD: KEINE HTML-ZEICHEN MEHR HINEIN
   ---------------------------------------------------
   ZWEITE SCHICHT, NICHT DIE ERSTE
   Das eigentliche Loch war ein Ausgabe-Problem: der Avatar wurde
   in den Ranglisten roh ins DOM gesetzt, und das vorhandene
   escapeHtml() codiert keine Anfuehrungszeichen. Behoben ist das
   bereits am Sink (escapeAttr, siehe scripts/wheel/wheel.js und
   die uebrigen Render-Stellen) - dort, wo XSS gehoert: bei der
   AUSGABE.

   Diese Migration ist die zweite Schicht (Verteidigung in der
   Tiefe): sie sorgt dafuer, dass ein Angreifer erst gar keinen
   solchen String ABLEGEN kann. Selbst wenn irgendwann eine neue
   Render-Stelle das Escapen vergisst, liegt in der Datenbank
   dann nichts, was sie ausnutzen koennte.

   WARUM NUR < > " '
   Ein legitimer Avatar ist ein Pfad (scripts/avatare/5.png),
   ein Emoji oder eine externe Bild-URL (https://...). Keiner
   davon enthaelt spitze Klammern oder Anfuehrungszeichen - eine
   URL braucht hoechstens & ? = / . und die bleiben erlaubt.
   Genau < und > (Tag) sowie " und ' (Attribut-Ausbruch) sind
   das, was einen HTML-Einschub ueberhaupt moeglich macht. Der
   Spitzname wird BEWUSST nicht so eingeschraenkt: er steht im
   Text zwischen Tags (dort reicht escapeHtml), und ein Name wie
   "<3" soll erlaubt bleiben.

   NOT VALID - MIT ABSICHT
   Die Constraint wird "not valid" hinzugefuegt. Das bedeutet
   NICHT, dass sie nicht wirkt: JEDER neue insert/update wird ab
   sofort geprueft und abgelehnt. "not valid" heisst nur, dass
   BEREITS BESTEHENDE Zeilen beim Hinzufuegen nicht rueckwirkend
   geprueft werden. Das ist hier gewollt: die Seite ist live,
   und falls schon jemand einen Angriff abgelegt hat, soll diese
   Migration nicht daran scheitern, sondern durchlaufen und das
   Ablegen kuenftig verhindern. Aufgeraeumt (und dann validiert)
   wird getrennt - siehe unten.

   REIHENFOLGE: nach 19-xp-codes.sql einspielen.
   Von Hand im Supabase-SQL-Editor, wie alle Migrationen hier.

   Idempotent: die DO-Bloecke legen jede Constraint nur an, wenn
   es sie noch nicht gibt - der Editor darf das Skript also ohne
   Schaden ein zweites Mal ausfuehren.
====================================================== */


/* players.avatar - der in Wheel-Rangliste und Spielerkarte
   gezeigte Avatar. */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_avatar_safe') then
    alter table public.players
      add constraint players_avatar_safe
      check (avatar is null or avatar !~ '[<>"'']') not valid;
  end if;
end $$;

/* players.temp_avatar_id - ein zeitweiliger Avatar (aus Codes /
   Schatzrad). Eine ID braucht ebenfalls nie HTML-Zeichen. */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_temp_avatar_id_safe') then
    alter table public.players
      add constraint players_temp_avatar_id_safe
      check (temp_avatar_id is null or temp_avatar_id !~ '[<>"'']') not valid;
  end if;
end $$;

/* community_boss_damage.avatar - der in der Boss-Rangliste
   gezeigte Avatar. Diese Tabelle hatte bisher gar keine
   Inhaltspruefung auf avatar. */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boss_damage_avatar_safe') then
    alter table public.community_boss_damage
      add constraint boss_damage_avatar_safe
      check (avatar is null or avatar !~ '[<>"'']') not valid;
  end if;
end $$;


/* ======================================================
   NACH DEM EINSPIELEN (optional, aber empfohlen)
   ---------------------------------------------------
   Erst nachsehen, ob bereits eine Zeile einen Angriff traegt.
   Gibt eine der folgenden Abfragen etwas zurueck, steht dort ein
   String mit < > " oder ' - den Wert von Hand auf null setzen
   oder auf einen sauberen Pfad korrigieren, BEVOR validiert wird.

     select firebase_uid, avatar from public.players
      where avatar ~ '[<>"'']';
     select firebase_uid, temp_avatar_id from public.players
      where temp_avatar_id ~ '[<>"'']';
     select month_id, firebase_uid, avatar from public.community_boss_damage
      where avatar ~ '[<>"'']';

   Sind alle drei leer, die Constraints scharf schalten, damit
   auch der Bestand als geprueft gilt:

     alter table public.players
       validate constraint players_avatar_safe;
     alter table public.players
       validate constraint players_temp_avatar_id_safe;
     alter table public.community_boss_damage
       validate constraint boss_damage_avatar_safe;
====================================================== */
