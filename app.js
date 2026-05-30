// Now Brief — GitHub Pages shell.
// Talks to a Tailscale-served Flask backend. Backend URL + auth token are
// stored in localStorage; first run shows a setup screen to capture them.

const $ = (id) => document.getElementById(id);

const LS_BACKEND = "nb_backend_url";
const LS_TOKEN = "nb_token";
const LS_POS = "nb_pos_v1";
const POS_MAX_AGE_MS = 30 * 60 * 1000;

const ICON = {
  "01d": "☀️", "01n": "🌙",
  "02d": "🌤️", "02n": "🌤️",
  "03d": "☁️", "03n": "☁️",
  "04d": "☁️", "04n": "☁️",
  "09d": "🌧️", "09n": "🌧️",
  "10d": "🌦️", "10n": "🌧️",
  "11d": "⛈️", "11n": "⛈️",
  "13d": "❄️", "13n": "❄️",
  "50d": "🌫️", "50n": "🌫️",
};

// ── Config ──────────────────────────────────────────────────────
function getConfig() {
  return {
    backend: localStorage.getItem(LS_BACKEND) || "",
    token: localStorage.getItem(LS_TOKEN) || "",
  };
}
function saveConfig(backend, token) {
  localStorage.setItem(LS_BACKEND, backend);
  localStorage.setItem(LS_TOKEN, token);
}
function clearConfig() {
  localStorage.removeItem(LS_BACKEND);
  localStorage.removeItem(LS_TOKEN);
}

// ── Geolocation ────────────────────────────────────────────────
function getCachedPosition() {
  try {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.ts || (Date.now() - p.ts) > POS_MAX_AGE_MS) return null;
    return p;
  } catch { return null; }
}
function savePosition(lat, lon) {
  try { localStorage.setItem(LS_POS, JSON.stringify({ lat, lon, ts: Date.now() })); } catch {}
}
function getFreshPosition() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { savePosition(pos.coords.latitude, pos.coords.longitude);
                 resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: POS_MAX_AGE_MS }
    );
  });
}
async function resolvePosition() { return getCachedPosition() || await getFreshPosition(); }

// ── API ────────────────────────────────────────────────────────
async function fetchSnapshot() {
  const { backend, token } = getConfig();
  if (!backend || !token) throw new Error("Not configured");
  const pos = await resolvePosition();
  let url = backend.replace(/\/$/, "") + "/api/snapshot";
  if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
    const qs = new URLSearchParams({ lat: pos.lat.toFixed(4), lon: pos.lon.toFixed(4) });
    url += "?" + qs.toString();
  }
  const r = await fetch(url, {
    cache: "no-cache",
    headers: { "Authorization": "Bearer " + token },
  });
  if (r.status === 401 || r.status === 403) throw new Error("Auth failed (token wrong?)");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ── Render ─────────────────────────────────────────────────────
function fmtEventWhen(iso, allDay) {
  if (!iso) return "";
  if (allDay) return "All day";
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isToday) return t;
    if (isTomorrow) return "Tomorrow · " + t;
    return d.toLocaleDateString([], { weekday: "short" }) + " · " + t;
  } catch { return ""; }
}

function shortLocation(loc) {
  if (!loc) return "";
  if (/^https?:\/\//i.test(loc)) {
    try { return new URL(loc).hostname.replace(/^www\./, ""); } catch { return "Online"; }
  }
  return loc.length > 50 ? loc.slice(0, 50) + "…" : loc;
}

function fmtAlertEnds(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(",", "");
  } catch { return ""; }
}

function renderHours(hours) {
  const host = $("hours");
  host.innerHTML = "";
  hours.forEach(h => {
    const d = document.createElement("div");
    d.className = "hour";
    d.innerHTML = `<div class="h-label">${h.label}</div><div class="h-icon">${ICON[h.icon] || "·"}</div><div class="h-temp">${h.temp}°</div>`;
    host.appendChild(d);
  });
}

function renderEvents(events) {
  const sec = $("events-section");
  if (!events || !events.length) { sec.hidden = true; return; }
  sec.hidden = false;
  const now = new Date();
  const todayOnly = events.filter(e => e.start && new Date(e.start).toDateString() === now.toDateString());
  const count = todayOnly.length || events.length;
  const noun = count === 1 ? "event" : "events";
  const scope = todayOnly.length ? "today" : "next up";
  $("events-head").innerHTML = `<span class="accent">${count} ${noun}</span> ${scope}.`;
  const host = $("events-list");
  host.innerHTML = "";
  events.slice(0, 4).forEach(ev => {
    const row = document.createElement("div");
    row.className = "event";
    const when = fmtEventWhen(ev.start, ev.all_day);
    const loc = shortLocation(ev.location || "");
    row.innerHTML = `
      <div class="event-bar"></div>
      <div class="event-body">
        <div class="event-title"></div>
        <div class="event-meta">
          ${when ? `<span class="when">${when}</span>` : ""}
          ${loc ? `<span class="pin">📍</span><span class="loc"></span>` : ""}
        </div>
      </div>`;
    row.querySelector(".event-title").textContent = ev.title || "(no title)";
    if (loc) row.querySelector(".loc").textContent = loc;
    host.appendChild(row);
  });
}

function render(snap) {
  $("slot-title").textContent = snap.title || "Now Brief";
  $("slot-lead").textContent = snap.lead || "";

  const affEl = $("affirmation");
  if (snap.affirmation) { affEl.textContent = snap.affirmation; affEl.hidden = false; }
  else affEl.hidden = true;

  const w = snap.weather_hourly || {};
  if (w.hours && w.hours.length) {
    renderHours(w.hours);
    $("weather-city").textContent = w.hub || "";
    $("weather-city").style.display = w.hub ? "" : "none";
    $("weather-card").hidden = false;
  } else $("weather-card").hidden = true;

  const a = snap.severe_alert;
  if (a && a.event) {
    $("alert-section").hidden = false;
    const ends = fmtAlertEnds(a.ends);
    $("alert-pill").innerHTML = `
      <div class="ap-event"><span class="ap-icon">⚠️</span> ${a.severity ? a.severity.toUpperCase() : "ALERT"} · ${a.event}</div>
      <div class="ap-headline">${a.headline || a.event}${ends ? ` <span style="color:rgba(255,255,255,0.55);font-weight:400;">until ${ends}</span>` : ""}</div>`;
  } else $("alert-section").hidden = true;

  renderEvents(snap.events || []);

  const n = snap.news_cluster;
  if (n && n.content) {
    $("news-section").hidden = false;
    $("news-cluster").innerHTML = `<div class="news-section">${(n.section || "").toUpperCase()}</div><div class="news-content"></div>`;
    $("news-cluster").querySelector(".news-content").textContent = n.content;
  } else $("news-section").hidden = true;

  if (snap.active_load) { $("load-section").hidden = false; $("load-card").textContent = snap.active_load; }
  else $("load-section").hidden = true;

  if (snap.bills) { $("bills-section").hidden = false; $("bills-card").textContent = snap.bills; }
  else $("bills-section").hidden = true;

  const chips = [];
  if (snap.streak) chips.push({ text: snap.streak.split("\n")[0], mint: true });
  if (snap.alpha_arc) chips.push({ text: snap.alpha_arc.split("\n")[0], mint: false });
  if (chips.length) {
    $("streak-section").hidden = false;
    const host = $("streak-chips");
    host.innerHTML = "";
    chips.forEach(c => {
      const el = document.createElement("span");
      el.className = "chip" + (c.mint ? " mint" : "");
      el.textContent = c.text;
      host.appendChild(el);
    });
  } else $("streak-section").hidden = true;

  $("foot-slot").textContent = (snap.title || "");
  if (snap.generated_at) {
    const t = new Date(snap.generated_at);
    $("foot-time").textContent = "Updated " + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

// ── Loading ────────────────────────────────────────────────────
async function load() {
  try {
    const snap = await fetchSnapshot();
    render(snap);
  } catch (e) {
    $("slot-title").textContent = "Couldn't load brief";
    $("slot-lead").textContent = String(e.message || e);
    if (String(e).includes("Auth failed")) showSetup("Auth failed — token may be wrong. Re-enter below.");
  }
}

async function refreshWithFeedback() {
  const btn = $("refresh-btn");
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = "…";
  try { await load(); btn.textContent = "✓"; } catch { btn.textContent = "✗"; }
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 900);
}

// ── Setup screen ───────────────────────────────────────────────
function showSetup(errorMsg) {
  $("brief").hidden = true;
  $("setup").hidden = false;
  const cfg = getConfig();
  if (cfg.backend) $("setup-url").value = cfg.backend;
  if (errorMsg) {
    const e = $("setup-error");
    e.textContent = errorMsg;
    e.hidden = false;
  }
}
function hideSetup() {
  $("setup").hidden = true;
  $("brief").hidden = false;
}

async function attemptConnect() {
  const url = $("setup-url").value.trim().replace(/\/$/, "");
  const token = $("setup-token").value.trim();
  const errEl = $("setup-error");
  errEl.hidden = true;
  if (!url || !token) { errEl.textContent = "Both fields required."; errEl.hidden = false; return; }
  const btn = $("setup-go");
  btn.disabled = true; btn.textContent = "Connecting…";
  try {
    const r = await fetch(url + "/api/health", { headers: { "Authorization": "Bearer " + token } });
    if (r.status === 401 || r.status === 403) throw new Error("Auth failed (token rejected)");
    if (!r.ok) throw new Error("Backend returned HTTP " + r.status);
    saveConfig(url, token);
    hideSetup();
    await load();
  } catch (e) {
    errEl.textContent = String(e.message || e);
    errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Connect";
  }
}

// ── Morning brief audio ────────────────────────────────────────
// The mp3 is generated on the Pro by Goose's morning loop (with the soul close
// appended) and served at /api/brief/audio. An <audio src> can't send an Auth
// header, so we fetch the file as a blob with the Bearer token and play it from an
// object URL. The button tap is the user gesture that lets playback start.
let briefObjURL = null;

function setPlayState(state, msg) {
  const btn = $("play-brief");
  if (!btn) return;
  const ico = btn.querySelector(".play-ico");
  const label = btn.querySelector(".play-label");
  btn.classList.remove("loading", "playing");
  const set = (i, t) => { ico.textContent = i; label.textContent = t; };
  switch (state) {
    case "loading": set("…", "Loading your brief…"); btn.classList.add("loading"); break;
    case "playing": set("⏸", "Playing — tap to pause"); btn.classList.add("playing"); break;
    case "paused":  set("▶", "Paused — tap to resume"); break;
    case "none":    set("▶", "No brief audio yet"); break;
    case "auth":    set("▶", "Auth failed — check token"); break;
    case "error":   set("▶", msg ? "Audio error: " + msg : "Couldn't load audio"); break;
    default:        set("▶", "Play morning brief");
  }
}

async function playBrief() {
  const { backend, token } = getConfig();
  if (!backend || !token) { showSetup(); return; }
  const audio = $("brief-audio");

  // Already loaded this session — just toggle play / pause / restart.
  if (briefObjURL && audio.src === briefObjURL) {
    if (audio.ended) audio.currentTime = 0;
    if (audio.paused) audio.play(); else audio.pause();
    return;
  }

  setPlayState("loading");
  try {
    const url = backend.replace(/\/$/, "") + "/api/brief/audio";
    const r = await fetch(url, { cache: "no-cache", headers: { "Authorization": "Bearer " + token } });
    if (r.status === 404) { setPlayState("none"); return; }
    if (r.status === 401 || r.status === 403) { setPlayState("auth"); return; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    if (briefObjURL) URL.revokeObjectURL(briefObjURL);
    briefObjURL = URL.createObjectURL(blob);
    audio.src = briefObjURL;
    audio.onplay = () => setPlayState("playing");
    audio.onpause = () => { if (!audio.ended) setPlayState("paused"); };
    audio.onended = () => setPlayState();
    await audio.play();
  } catch (e) {
    setPlayState("error", e && e.message);
  }
}

// ── Wake-up push ───────────────────────────────────────────────
// One-time opt-in: subscribe this device so the Pro can fire a "brief ready"
// notification each morning. Tapping it opens Now Brief → tap ▶ Play.
function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function setPushState(state, msg) {
  const btn = $("push-btn");
  if (!btn) return;
  const map = {
    on: "🔔 Wake-up on",
    working: "🔔 …",
    denied: "🔔 Allow notifications in settings",
    unsupported: "🔔 Not supported here",
    error: "🔔 Tap to retry",
    off: "🔔 Wake me when the brief is ready",
  };
  btn.textContent = map[state] || map.off;
  btn.classList.toggle("on", state === "on");
}

function initPushState() {
  const on = localStorage.getItem("nb_push") === "1"
    && "Notification" in window && Notification.permission === "granted";
  setPushState(on ? "on" : "off");
}

async function enablePush() {
  const { backend, token } = getConfig();
  if (!backend || !token) { showSetup(); return; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    setPushState("unsupported"); return;
  }
  setPushState("working");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setPushState("denied"); return; }
    const base = backend.replace(/\/$/, "");
    const reg = await navigator.serviceWorker.ready;
    const kr = await fetch(base + "/api/push/public-key", { headers: { "Authorization": "Bearer " + token } });
    const { key } = await kr.json();
    if (!key) { setPushState("error"); return; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const payload = sub.toJSON();
    payload.label = (navigator.userAgent || "").slice(0, 80);
    const r = await fetch(base + "/api/push/subscribe", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    localStorage.setItem("nb_push", "1");
    setPushState("on");
  } catch (e) {
    setPushState("error", e && e.message);
  }
}

// ── PWA install ────────────────────────────────────────────────
let deferredInstall = null;
function wireInstall() {
  const btn = $("install-btn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!deferredInstall) {
      alert("Install option not offered by this browser. Use Chrome ⋮ menu → Install app / Add to Home screen.");
      return;
    }
    btn.disabled = true;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (outcome === "accepted") btn.hidden = true;
    else btn.disabled = false;
  });
  window.addEventListener("appinstalled", () => { btn.hidden = true; });
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    btn.hidden = true;
  }
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  $("setup-go").addEventListener("click", attemptConnect);
  $("setup-token").addEventListener("keydown", (e) => { if (e.key === "Enter") attemptConnect(); });
  $("refresh-btn").addEventListener("click", refreshWithFeedback);
  $("play-brief").addEventListener("click", playBrief);
  $("push-btn").addEventListener("click", enablePush);
  initPushState();
  $("install-btn") && wireInstall();
  $("reset-btn").addEventListener("click", () => {
    if (confirm("Re-enter backend URL and token?")) { clearConfig(); showSetup(); }
  });

  const cfg = getConfig();
  if (!cfg.backend || !cfg.token) {
    showSetup();
  } else {
    hideSetup();
    load();
    setInterval(load, 5 * 60 * 1000);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
