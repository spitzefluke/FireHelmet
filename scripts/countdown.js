/* =====================================================
   COUNTDOWN SYSTEM
   Zählt herunter und löst bei jeder Änderung eine kleine
   Flip-Animation der Zahl sowie ein kurzes Aufleuchten
   der Box aus.
===================================================== */

const targetDate = new Date("2026-08-20T00:00:00");

// Merkt sich die zuletzt angezeigten Werte, um Änderungen zu erkennen
const lastValues = {
  days: null,
  hours: null,
  minutes: null,
  seconds: null,
};

function setValue(id, newValue) {
  const el = document.getElementById(id);
  if (!el) return;

  const formatted = String(newValue).padStart(2, "0");

  if (lastValues[id] === formatted) {
    return; // Wert hat sich nicht geändert, keine Animation nötig
  }

  lastValues[id] = formatted;
  el.textContent = formatted;

  // Flip-Animation neu starten: Klasse entfernen, Reflow erzwingen, wieder hinzufügen
  el.classList.remove("changed");
  void el.offsetWidth;
  el.classList.add("changed");

  // Die umgebende Box kurz aufleuchten lassen
  const box = el.closest(".time-box");
  if (box) {
    box.classList.remove("tick");
    void box.offsetWidth;
    box.classList.add("tick");
  }
}

function updateCountdown() {
  const now = new Date();
  const difference = targetDate - now;

  if (difference <= 0) {
    setValue("days", 0);
    setValue("hours", 0);
    setValue("minutes", 0);
    setValue("seconds", 0);
    return;
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  setValue("days", days);
  setValue("hours", hours);
  setValue("minutes", minutes);
  setValue("seconds", seconds);
}

updateCountdown();
setInterval(updateCountdown, 1000);
