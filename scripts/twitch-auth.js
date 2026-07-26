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

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get("access_token");

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
  const loginBtn = document.getElementById("twitch-login-btn");
  const loggedInBox = document.getElementById("twitch-logged-in");
  const avatarImg = document.getElementById("twitch-avatar");
  const nameEl = document.getElementById("twitch-logged-in-name");
  const nicknameBox = document.getElementById("wheel-nickname-box");

  const nickname = localStorage.getItem("wheelNickname") || "";
  const avatar = localStorage.getItem("twitchAvatar") || "";
  const isLoggedIn = !!localStorage.getItem("twitchToken");

  if (!loginBtn || !loggedInBox) return;

  if (isLoggedIn) {
    loginBtn.style.display = "none";
    loggedInBox.style.display = "flex";
    if (avatarImg && avatar) avatarImg.src = avatar;
    if (nameEl) nameEl.textContent = nickname;
    if (nicknameBox) nicknameBox.style.display = "none";
  } else {
    loginBtn.style.display = "inline-flex";
    loggedInBox.style.display = "none";
    if (nicknameBox) nicknameBox.style.display = "flex";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  handleTwitchRedirect();
  refreshTwitchLoginUI();
});
