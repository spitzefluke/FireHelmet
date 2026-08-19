/* ======================================================
   TWITCH LOGIN
   Läuft komplett im Browser (kein eigener Server nötig):
   1. Klick auf "Mit Twitch anmelden" -> Weiterleitung zu Twitch
   2. Nutzer bestätigt bei Twitch
   3. Twitch schickt zurück mit einem Zugriffstoken in der URL
   4. Wir fragen damit Name + Profilbild bei Twitch ab
   5. Name/Bild werden als "verifizierter" Rangliste-Name übernommen
====================================================== */

function isTwitchConfigured() {
  return typeof twitchConfig !== "undefined" && twitchConfig.clientId !== "DEINE-TWITCH-CLIENT-ID";
}

function loginWithTwitch() {
  if (!isTwitchConfigured()) {
    alert("Twitch-Login ist noch nicht eingerichtet (scripts/twitch-config.js fehlt die Client ID).");
    return;
  }

  sessionStorage.setItem("pendingLoginProvider", "twitch");

  const params = new URLSearchParams({
    client_id: twitchConfig.clientId,
    redirect_uri: twitchConfig.redirectUri,
    response_type: "token",
    scope: "",
  });

  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

function logoutTwitch() {
  localStorage.removeItem("twitchToken");
  localStorage.removeItem("twitchAvatar");
  localStorage.removeItem("discordToken");
  localStorage.removeItem("discordAvatar");
  localStorage.removeItem("loginProvider");
  localStorage.removeItem("wheelNickname");
  refreshTwitchLoginUI();
  if (typeof refreshWheelStatus === "function") refreshWheelStatus();
}

/* ------------------------------------------------------
   NUTZERDATEN VON TWITCH ABRUFEN
------------------------------------------------------ */
function fetchTwitchUser(token) {
  return fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": twitchConfig.clientId,
    },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Twitch-Anfrage fehlgeschlagen (Status " + res.status + ")");
      return res.json();
    })
    .then((json) => {
      const user = json.data && json.data[0];
      if (!user) throw new Error("Keine Nutzerdaten erhalten");

      localStorage.setItem("twitchToken", token);
      localStorage.setItem("wheelNickname", user.display_name);
      localStorage.setItem("twitchAvatar", user.profile_image_url);
      localStorage.setItem("loginProvider", "twitch");

      refreshTwitchLoginUI();
      if (typeof refreshWheelStatus === "function") refreshWheelStatus();
    })
    .catch((err) => {
      console.error("Twitch-Login fehlgeschlagen:", err);
      alert("Twitch-Login hat leider nicht geklappt. Versuch es nochmal.");
    });
}

/* ------------------------------------------------------
   WEITERLEITUNG NACH DEM LOGIN AUSWERTEN
   Twitch hängt das Token als #access_token=... an die URL.
------------------------------------------------------ */
function handleTwitchRedirect() {
  if (!window.location.hash.includes("access_token")) return;
  if (sessionStorage.getItem("pendingLoginProvider") !== "twitch") return;

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get("access_token");

  sessionStorage.removeItem("pendingLoginProvider");

  // Token aus der sichtbaren URL entfernen
  history.replaceState(null, "", window.location.pathname);

  if (token) {
    fetchTwitchUser(token);
  }
}

/* ------------------------------------------------------
   LOGIN-BEREICH IM UI AKTUALISIEREN
------------------------------------------------------ */
function refreshTwitchLoginUI() {
  const twitchBtn = document.getElementById("twitch-login-btn");
  const discordBtn = document.getElementById("discord-login-btn");
  const loggedInBox = document.getElementById("twitch-logged-in");
  const avatarImg = document.getElementById("twitch-avatar");
  const nameEl = document.getElementById("twitch-logged-in-name");
  const providerEl = document.getElementById("login-provider-label");
  const nicknameBox = document.getElementById("wheel-nickname-box");

  const provider = localStorage.getItem("loginProvider") || "";
  const nickname = localStorage.getItem("wheelNickname") || "";
  const avatar =
    provider === "discord"
      ? localStorage.getItem("discordAvatar") || ""
      : localStorage.getItem("twitchAvatar") || "";
  const isLoggedIn = provider === "twitch" || provider === "discord";

  if (typeof refreshPlayerCard === "function") refreshPlayerCard();

  if (!loggedInBox) return;

  if (isLoggedIn) {
    if (twitchBtn) twitchBtn.style.display = "none";
    if (discordBtn) discordBtn.style.display = "none";
    loggedInBox.style.display = "flex";
    if (avatarImg && avatar) avatarImg.src = avatar;
    if (nameEl) nameEl.textContent = nickname;
    if (providerEl) {
      providerEl.textContent = provider === "discord" ? "via Discord" : "via Twitch";
    }
    if (nicknameBox) nicknameBox.style.display = "none";
  } else {
    if (twitchBtn) twitchBtn.style.display = "inline-flex";
    if (discordBtn) discordBtn.style.display = "inline-flex";
    loggedInBox.style.display = "none";
    if (nicknameBox) nicknameBox.style.display = "flex";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Rückwärtskompatibilität: wer sich vor der Discord-Erweiterung schon
  // mit Twitch angemeldet hatte, bekommt jetzt automatisch den Anbieter gesetzt
  if (localStorage.getItem("twitchToken") && !localStorage.getItem("loginProvider")) {
    localStorage.setItem("loginProvider", "twitch");
  }

  handleTwitchRedirect();
  refreshTwitchLoginUI();
});

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateLoginPage(pageID) {
  if (pageID !== "login") return;

  const nicknameInput = document.getElementById("wheel-nickname-input");
  if (nicknameInput) {
    nicknameInput.value = localStorage.getItem("wheelNickname") || "";
  }

  refreshTwitchLoginUI();

  if (typeof syncTempAvatarFromServer === "function") {
    syncTempAvatarFromServer();
  }
}
