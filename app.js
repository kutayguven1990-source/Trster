/* Trster — kart tara, şarkı Spotify'da tam olarak çalsın, adı görünmesin.
 * Sunucu yok: Spotify girişi PKCE ile tarayıcıda yapılır, çalma komutu
 * Spotify Web API üzerinden kullanıcının Spotify uygulamasına gönderilir.
 */
(() => {
  "use strict";

  const SCOPES = "user-modify-playback-state user-read-playback-state";
  const API = "https://api.spotify.com/v1";
  const REDIRECT_URI = location.origin + location.pathname;
  const LS = {
    get: (k, d = null) => { try { const v = localStorage.getItem("trster." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("trster." + k, JSON.stringify(v)); } catch {} },
    del: (k) => { try { localStorage.removeItem("trster." + k); } catch {} },
  };

  const $ = (id) => document.getElementById(id);
  const screens = ["login", "ready", "scan", "playing", "error"];
  function show(name) {
    screens.forEach((s) => ($("screen-" + s).hidden = s !== name));
    document.body.classList.toggle("playing", name === "playing");
  }

  const clientId = () => (LS.get("clientId") || window.TRSTER_CONFIG.CLIENT_ID || "").trim();

  // ---------- PKCE / token ----------
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function randomString(n = 64) {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return Array.from(a, (x) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[x % 62]).join("");
  }

  async function login() {
    if (!clientId() || clientId() === "BURAYA_CLIENT_ID") {
      return fail("Client ID eksik", "Ayarlar → 'Kendi Spotify uygulamanı kullan' bölümüne Client ID gir.");
    }
    const verifier = randomString(64);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    LS.set("verifier", verifier);
    const state = randomString(16); LS.set("state", state);
    const p = new URLSearchParams({
      client_id: clientId(), response_type: "code", redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES, state,
    });
    location.href = "https://accounts.spotify.com/authorize?" + p;
  }

  async function tokenRequest(body) {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId(), ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || "token hatası");
    LS.set("token", {
      access: j.access_token,
      refresh: j.refresh_token || (LS.get("token") || {}).refresh,
      exp: Date.now() + (j.expires_in - 60) * 1000,
    });
  }

  async function handleCallback(params) {
    if (params.get("error")) throw new Error("Spotify girişi iptal edildi.");
    if (params.get("state") !== LS.get("state")) throw new Error("Giriş doğrulanamadı, tekrar dene.");
    await tokenRequest({ grant_type: "authorization_code", code: params.get("code"), redirect_uri: REDIRECT_URI, code_verifier: LS.get("verifier") });
    LS.del("verifier"); LS.del("state");
  }

  async function accessToken() {
    const t = LS.get("token");
    if (!t) return null;
    if (Date.now() < t.exp) return t.access;
    if (!t.refresh) return null;
    try { await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh }); return LS.get("token").access; }
    catch { LS.del("token"); return null; }
  }

  async function api(method, path, body) {
    const tok = await accessToken();
    if (!tok) { show("login"); throw Object.assign(new Error("login"), { code: "LOGIN" }); }
    const r = await fetch(API + path, {
      method, headers: { Authorization: "Bearer " + tok, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204 || r.status === 202) return null;
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error((j && j.error && j.error.message) || "HTTP " + r.status);
      e.status = r.status; e.reason = j && j.error && j.error.reason; throw e;
    }
    return j;
  }

  // ---------- cihazlar ----------
  async function getDevices() { return ((await api("GET", "/me/player/devices")) || {}).devices || []; }

  function pickDevice(devices) {
    const saved = LS.get("deviceId");
    return devices.find((d) => d.id === saved) || devices.find((d) => d.is_active) ||
      devices.find((d) => d.type === "Smartphone") || devices[0];
  }

  async function renderDevices() {
    const box = $("device-list");
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const ds = await getDevices();
      if (!ds.length) { box.innerHTML = '<p class="muted small">Cihaz bulunamadı. Spotify uygulamasını aç ve tekrar dene.</p>'; return; }
      const saved = LS.get("deviceId");
      box.innerHTML = "";
      const mk = (id, label, devName) => {
        const l = document.createElement("label"); l.className = "device" + ((saved || "") === id ? " active" : "");
        const i = document.createElement("input"); i.type = "radio"; i.name = "dev"; i.value = id; i.checked = (saved || "") === id;
        i.onchange = () => {
          if (id) { LS.set("deviceId", id); LS.set("deviceName", devName); } else { LS.del("deviceId"); LS.del("deviceName"); }
          renderDevices(); updateDeviceLine();
        };
        l.append(i, document.createTextNode(label)); box.append(l);
      };
      mk("", "Otomatik (telefonum)", null);
      ds.forEach((d) => mk(d.id, `${d.name} · ${d.type}`, d.name));
    } catch (e) { box.innerHTML = '<p class="muted small">Cihazlar alınamadı.</p>'; }
  }

  function updateDeviceLine() {
    const n = LS.get("deviceName");
    $("device-line").textContent = LS.get("deviceId") && n ? "Çalma cihazı: " + n : "Çalma cihazı: otomatik";
  }

  // ---------- çalma ----------
  let current = null, timerInt = null, startedAt = 0, pausedTotal = 0, pausedAt = 0, autoStopT = null;

  async function play(trackId) {
    current = trackId;
    $("play-status").textContent = "Başlatılıyor…";
    show("playing");
    try {
      const devices = await getDevices();
      const dev = pickDevice(devices);
      if (!dev) throw Object.assign(new Error(), { reason: "NO_ACTIVE_DEVICE" });
      await api("PUT", "/me/player/play?device_id=" + encodeURIComponent(dev.id), { uris: ["spotify:track:" + trackId] });
      startTimer();
    } catch (e) {
      if (e.code === "LOGIN") return;
      if (e.reason === "NO_ACTIVE_DEVICE" || e.status === 404) {
        fail("Spotify bulunamadı", "Telefonundaki Spotify uygulamasını aç (bir şarkıyı başlatıp durdurman yeterli), sonra buraya dönüp Tekrar dene'ye bas.", true);
      } else if (e.reason === "PREMIUM_REQUIRED" || e.status === 403) {
        fail("Premium gerekiyor", "Spotify şarkıyı tam çalmak için Premium hesap istiyor. Hesabının Premium olduğundan ve bu uygulamaya izin verilen kullanıcılar arasında olduğundan emin ol.");
      } else {
        fail("Çalınamadı", e.message || "Bilinmeyen hata");
      }
    }
  }

  function startTimer() {
    clearInterval(timerInt); clearTimeout(autoStopT);
    startedAt = Date.now(); pausedTotal = 0; pausedAt = 0;
    document.body.classList.remove("paused");
    $("btn-toggle").textContent = "Duraklat";
    $("play-status").textContent = "Çalıyor…";
    const tick = () => {
      const now = pausedAt || Date.now();
      const s = Math.floor((now - startedAt - pausedTotal) / 1000);
      $("timer").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    };
    tick(); timerInt = setInterval(tick, 250);
    const lim = +LS.get("autoStop", 0);
    if (lim) autoStopT = setTimeout(() => { if (!pausedAt) togglePause(); }, lim * 1000);
  }

  async function togglePause() {
    try {
      if (!pausedAt) {
        await api("PUT", "/me/player/pause"); pausedAt = Date.now();
        document.body.classList.add("paused"); $("btn-toggle").textContent = "Devam"; $("play-status").textContent = "Duraklatıldı";
      } else {
        await api("PUT", "/me/player/play"); pausedTotal += Date.now() - pausedAt; pausedAt = 0;
        document.body.classList.remove("paused"); $("btn-toggle").textContent = "Duraklat"; $("play-status").textContent = "Çalıyor…";
      }
    } catch (e) { /* önemsiz */ }
  }

  async function next() {
    clearInterval(timerInt); clearTimeout(autoStopT);
    if (!pausedAt) api("PUT", "/me/player/pause").catch(() => {});
    startScan();
  }

  // ---------- QR ----------
  function parseTrackId(text) {
    if (!text) return null;
    let m = text.match(/[?&#]t=([A-Za-z0-9]{22})/);           // Trster kartı
    if (m) return m[1];
    m = text.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/); // düz Spotify linki
    if (m) return m[1];
    m = text.match(/spotify:track:([A-Za-z0-9]{22})/);
    return m ? m[1] : null;
  }

  let stream = null, scanning = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  async function startScan() {
    show("scan");
    const video = $("video");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch (e) {
      return fail("Kamera açılamadı", "Tarayıcının kamera iznini kontrol et. İstersen kartı telefonun normal kamerasıyla da tarayabilirsin, aynı şekilde çalışır.");
    }
    video.srcObject = stream; await video.play().catch(() => {});
    scanning = true;
    const loop = () => {
      if (!scanning) return;
      if (video.readyState >= 2) {
        const w = video.videoWidth, h = video.videoHeight, s = Math.min(w, h);
        const size = Math.min(640, s);
        canvas.width = canvas.height = size;
        ctx.drawImage(video, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
        const img = ctx.getImageData(0, 0, size, size);
        const code = jsQR(img.data, size, size, { inversionAttempts: "attemptBoth" });
        const id = code && parseTrackId(code.data);
        if (id) { stopScan(); if (navigator.vibrate) navigator.vibrate(60); play(id); return; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function stopScan() {
    scanning = false;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  // ---------- hata ----------
  let retryFn = null;
  function fail(title, text, spotifyBtn = false) {
    stopScan();
    $("err-title").textContent = title; $("err-text").textContent = text;
    $("btn-open-spotify").hidden = !spotifyBtn;
    $("btn-retry").hidden = !current;
    retryFn = current ? () => play(current) : null;
    show("error");
  }

  // ---------- ayarlar ----------
  function openSettings() {
    $("redirect-uri").textContent = REDIRECT_URI;
    $("custom-client-id").value = LS.get("clientId") || "";
    $("auto-stop").value = String(LS.get("autoStop", 0));
    $("settings").showModal();
    if (LS.get("token")) renderDevices(); else $("device-list").innerHTML = '<p class="muted small">Önce Spotify ile bağlan.</p>';
  }

  function saveSettings() {
    const cid = $("custom-client-id").value.trim();
    const changed = cid !== (LS.get("clientId") || "");
    if (cid) LS.set("clientId", cid); else LS.del("clientId");
    LS.set("autoStop", +$("auto-stop").value);
    if (changed) { LS.del("token"); show("login"); }
  }

  // ---------- başlangıç ----------
  async function init() {
    $("btn-login").onclick = login;
    $("btn-scan").onclick = startScan;
    $("btn-cancel-scan").onclick = () => { stopScan(); show("ready"); };
    $("btn-toggle").onclick = togglePause;
    $("btn-next").onclick = next;
    $("btn-retry").onclick = () => retryFn && retryFn();
    $("btn-back").onclick = () => show(LS.get("token") ? "ready" : "login");
    $("btn-settings").onclick = openSettings;
    $("btn-close-settings").onclick = saveSettings;
    $("btn-refresh-devices").onclick = renderDevices;
    $("btn-logout").onclick = () => { LS.del("token"); $("settings").close(); show("login"); };
    updateDeviceLine();

    const params = new URLSearchParams(location.search);
    // Kart normal kamerayla tarandıysa (?t=...) şarkıyı girişten sonra da hatırla
    const t = params.get("t");
    if (t && /^[A-Za-z0-9]{22}$/.test(t)) LS.set("pending", t);

    try {
      if (params.get("code") || params.get("error")) await handleCallback(params);
    } catch (e) {
      history.replaceState(null, "", REDIRECT_URI);
      return fail("Giriş başarısız", e.message);
    }
    if (location.search) history.replaceState(null, "", REDIRECT_URI);

    if (!(await accessToken())) return show("login");
    const pending = LS.get("pending");
    if (pending) { LS.del("pending"); return play(pending); }
    show("ready");
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden && scanning) { stopScan(); show("ready"); } });
  init();
})();
