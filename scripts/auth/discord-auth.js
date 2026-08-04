/* ======================================================
   DISCORD LOGIN
   Läuft komplett im Browser (kein eigener Server nötig),
   genau wie der Twitch-Login:
   1. Klick auf "Mit Discord anmelden" -> Weiterleitung zu Discord
   2. Nutzer bestätigt bei Discord
   3. Discord schickt zurück mit einem Zugriffstoken in der URL
   4. Wir fragen damit Name + Profilbild bei Discord ab
   5. Name/Bild werden als "verifizierter" Rangliste-Name übernommen
====================================================== */

function isDiscordConfigured() {
  return typeof discordConfig !== "undefined" && discordConfig.clientId !== "DEINE-DISCORD-CLIENT-ID";
}

function loginWithDiscord() {
  if (!isDiscordConfigured()) {
    alert("Discord-Login ist noch nicht eingerichtet (scripts/discord-config.js fehlt die Client ID).");
    return;
  }

  sessionStorage.setItem("pendingLoginProvider", "discord");

  const params = new URLSearchParams({
    client_id: discordConfig.clientId,
    redirect_uri: discordConfig.redirectUri,
    response_type: "token",
    scope: "identify",
  });

  window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/* ------------------------------------------------------
   NUTZERDATEN VON DISCORD ABRUFEN
------------------------------------------------------ */
function fetchDiscordUser(token) {
  return fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Discord-Anfrage fehlgeschlagen (Status " + res.status + ")");
      return res.json();
    })
    .then((user) => {
      if (!user || !user.id) throw new Error("Keine Nutzerdaten erhalten");

      // Discord nutzt seit 2023 "global_name" (Anzeigename), ältere
      // Accounts ohne global_name fallen auf den klassischen "username" zurück
      const displayName = user.global_name || user.username;

      // Profilbild-URL selbst zusammenbauen (Discord liefert nur den Hash)
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

      localStorage.setItem("discordToken", token);
      localStorage.setItem("wheelNickname", displayName);
      localStorage.setItem("discordAvatar", avatarUrl);
      localStorage.setItem("loginProvider", "discord");

      refreshTwitchLoginUI();
      if (typeof refreshWheelStatus === "function") refreshWheelStatus();
    })
    .catch((err) => {
      console.error("Discord-Login fehlgeschlagen:", err);
      alert("Discord-Login hat leider nicht geklappt. Versuch es nochmal.");
    });
}

/* ------------------------------------------------------
   WEITERLEITUNG NACH DEM LOGIN AUSWERTEN
   Discord hängt das Token als #access_token=... an die URL,
   genau wie Twitch - daher reicht ein gemeinsamer Check.
------------------------------------------------------ */
function handleDiscordRedirect() {
  if (!window.location.hash.includes("access_token")) return;

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get("access_token");
  const state = hashParams.get("state");

  // Nur weiterverarbeiten, wenn dieser Redirect tatsächlich von Discord kam
  // (unterscheiden wir per State-Marker, den wir vorher gesetzt haben)
  if (sessionStorage.getItem("pendingLoginProvider") !== "discord") return;

  sessionStorage.removeItem("pendingLoginProvider");
  history.replaceState(null, "", window.location.pathname);

  if (token) {
    fetchDiscordUser(token);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  handleDiscordRedirect();
});
