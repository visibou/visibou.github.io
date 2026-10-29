/* =====================================================================
   PRIVILEA — CIVIC WEIGHTING TERMINAL · kiosk logic
   Flow: idle → scan → alarm → ballot (×N) → thanks → idle
   ===================================================================== */
(() => {
  "use strict";

  const { CONFIG, FACTORS, CITIZENS, QUESTIONS } = window.PRIVILEA;
  const T = CONFIG.timing;
  const STORAGE_KEY = "privilea.votes.v1";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const fmtW = (w) => w.toFixed(CONFIG.weight.decimals);
  const fmtId = (id) => id.replace(new RegExp(`(\\d{${CONFIG.idGroupSize}})(?=\\d)`, "g"), "$1-");

  /* ------------------------------------------------------------------
     Session token: every async sequence checks it, so Esc / timeouts
     cancel whatever animation is running.
     ------------------------------------------------------------------ */
  let session = 0;
  const CANCEL = Symbol("cancel");
  const sleep = (ms) => {
    const token = session;
    return new Promise((res, rej) => setTimeout(() => (token === session ? res() : rej(CANCEL)), ms));
  };
  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (e) { if (e !== CANCEL) console.error(e); }
  };

  let state = { screen: "idle", digits: "", citizen: null, result: null, q: 0, answers: [], lastInput: Date.now() };

  /* ------------------------------------------------------------------
     Sound — synthesised, no files needed
     ------------------------------------------------------------------ */
  const Sound = {
    ctx: null, master: null, on: CONFIG.sound, drone: null,
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.on ? 0.6 : 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    toggle() {
      this.on = !this.on;
      if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.6 : 0, this.ctx.currentTime, 0.05);
      $("#muteBtn").setAttribute("aria-pressed", String(!this.on));
    },
    tone(freq, dur, { type = "square", vol = 0.06, slide = null, delay = 0 } = {}) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.3, freq = 400, delay = 0 } = {}) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = buf; f.type = "lowpass"; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    key() { this.tone(1250, 0.045, { vol: 0.05 }); },
    error() {
      this.tone(150, 0.2, { type: "sawtooth", vol: 0.12 });
      this.tone(112, 0.3, { type: "sawtooth", vol: 0.12, delay: 0.22 });
    },
    blip() { this.tone(rand(1500, 2800), 0.022, { vol: 0.018 }); },
    tick() {
      this.tone(660, 0.07, { type: "triangle", vol: 0.09 });
      this.tone(990, 0.09, { type: "triangle", vol: 0.07, delay: 0.07 });
    },
    lock() { [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.08, { type: "triangle", vol: 0.07, delay: i * 0.06 })); },
    klaxon(times = 3) {
      for (let i = 0; i < times; i++) {
        this.tone(380, 0.5, { type: "sawtooth", vol: 0.1, slide: 760, delay: i * 0.62 });
        this.tone(190, 0.5, { type: "square", vol: 0.05, slide: 380, delay: i * 0.62 });
      }
    },
    slam() {
      this.noise(0.6, { vol: 0.55, freq: 260 });
      this.tone(70, 0.6, { type: "sine", vol: 0.5, slide: 32 });
    },
    roll() { this.tone(rand(300, 900), 0.03, { vol: 0.03 }); },
    select() {
      this.tone(784, 0.09, { type: "triangle", vol: 0.1 });
      this.tone(1175, 0.16, { type: "triangle", vol: 0.1, delay: 0.09 });
      this.noise(0.18, { vol: 0.25, freq: 900, delay: 0.02 });
    },
    thanks() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: "triangle", vol: 0.08, delay: i * 0.12 })); },
    droneStart() {
      if (!this.ctx || this.drone) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 55;
      o2.type = "sawtooth"; o2.frequency.value = 55.6;
      f.type = "lowpass"; f.frequency.value = 340;
      lfo.frequency.value = 0.7; lg.gain.value = 120;
      lfo.connect(lg).connect(f.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 1);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
      o.start(); o2.start(); lfo.start();
      this.drone = { o, o2, lfo, g };
    },
    droneStop() {
      if (!this.drone) return;
      const { o, o2, lfo, g } = this.drone;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.15);
      [o, o2, lfo].forEach((n) => n.stop(t + 0.8));
      this.drone = null;
    },
  };

  /* ------------------------------------------------------------------
     RGB-shift — the screen's colour channels slide apart. Like the hover
     shader it is based on, the shift follows a velocity that is kicked
     and then springs back to rest; here the calculation does the kicking.
     The SVG filter is only attached while there is something to show.
     ------------------------------------------------------------------ */
  const RGB = {
    nodes: { r: $("#rgbR"), g: $("#rgbG"), b: $("#rgbB") },
    vx: 0, vy: 0,       // current shift (px), decays to 0
    hum: 0,             // steady wobble while OMNI is "thinking"
    target: 0,          // hum eases toward this
    raf: 0,
    kick(strength, angle = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5)) {
      if (reducedMotion) return;
      this.vx += Math.cos(angle) * strength;
      this.vy += Math.sin(angle) * strength * 0.6;
      this.run();
    },
    humTo(px) { if (!reducedMotion) { this.target = px; this.run(); } },
    run() {
      if (this.raf) return;
      document.body.classList.add("rgb-shift");
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(50, now - last) / 16.67; last = now;
        const decay = Math.pow(0.87, dt);
        this.vx *= decay; this.vy *= decay;
        this.hum += (this.target - this.hum) * Math.min(1, 0.06 * dt);
        const wob = this.hum * (Math.sin(now / 70) * 0.6 + (Math.random() - 0.5) * 0.8);
        const x = this.vx + wob, y = this.vy + this.hum * 0.25 * Math.sin(now / 110);
        if (Math.abs(x) + Math.abs(y) < 0.12 && this.hum < 0.05 && this.target === 0) return this.stop();
        this.set(x, y);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    },
    set(x, y) {
      this.nodes.r.setAttribute("dx", x.toFixed(2)); this.nodes.r.setAttribute("dy", y.toFixed(2));
      this.nodes.g.setAttribute("dx", (x * -0.15).toFixed(2));
      this.nodes.b.setAttribute("dx", (-x).toFixed(2)); this.nodes.b.setAttribute("dy", (-y).toFixed(2));
    },
    stop() {
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.vx = this.vy = this.hum = this.target = 0;
      this.set(0, 0);
      document.body.classList.remove("rgb-shift");
    },
  };

  /* ------------------------------------------------------------------
     The eye
     ------------------------------------------------------------------ */
  let eyeCount = 0;
  function eyeSVG() {
    const n = ++eyeCount;
    let ticks = "";
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180, major = i % 5 === 0;
      const r1 = major ? 75 : 79, r2 = 86;
      ticks += `<line class="${major ? "major" : ""}" x1="${(Math.cos(a) * r1).toFixed(2)}" y1="${(Math.sin(a) * r1).toFixed(2)}" x2="${(Math.cos(a) * r2).toFixed(2)}" y2="${(Math.sin(a) * r2).toFixed(2)}"/>`;
    }
    return `
<svg class="eye" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="iris${n}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFF1B8"/>
      <stop offset=".16" stop-color="#FFB13B"/>
      <stop offset=".34" stop-color="#FF2B1A"/>
      <stop offset=".72" stop-color="#B80008"/>
      <stop offset="1" stop-color="#3D0003"/>
    </radialGradient>
    <radialGradient id="glow${n}" cx="50%" cy="50%" r="50%">
      <stop offset=".45" stop-color="#FF2B1A" stop-opacity=".55"/>
      <stop offset="1" stop-color="#FF2B1A" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="sock${n}"><circle r="70"/></clipPath>
  </defs>
  <g transform="translate(100 100)">
    <circle class="eye-housing" r="98"/>
    <circle class="eye-rim" r="91"/>
    <g class="eye-ticks">${ticks}</g>
    <circle class="eye-socket" r="70"/>
    <g clip-path="url(#sock${n})">
      <g class="eye-look">
        <circle class="eye-glow" r="68" fill="url(#glow${n})"/>
        <g class="eye-iris">
          <circle r="42" fill="url(#iris${n})"/>
          <circle class="iris-lines" r="34"/>
          <circle class="iris-ring" r="24"/>
          <circle class="iris-lines" r="18"/>
          <circle r="9" fill="#2A0000" opacity=".55"/>
          <circle class="eye-core" r="5.5" fill="#FFF6D6"/>
        </g>
      </g>
      <rect class="eye-lid" x="-70" y="-70" width="140" height="140"/>
    </g>
    <ellipse cx="-22" cy="-30" rx="13" ry="6" fill="#fff" opacity=".22" transform="rotate(-32 -22 -30)"/>
  </g>
</svg>`;
  }
  const eyes = {};
  $$(".eye-slot").forEach((slot) => {
    slot.innerHTML = eyeSVG();
    eyes[slot.dataset.eye] = $(".eye", slot);
  });
  const gaze = (eye, x, y) => { $(".eye-look", eye).style.transform = `translate(${x * 20}px, ${y * 20}px)`; };
  const blink = (eye) => {
    eye.classList.remove("is-blinking"); void eye.getBoundingClientRect(); eye.classList.add("is-blinking");
  };

  // Idle eye: follows the pointer, otherwise wanders and blinks
  let lastPointer = 0;
  document.addEventListener("pointermove", (e) => {
    if (state.screen !== "idle") return;
    const r = eyes.idle.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 500);
    gaze(eyes.idle, (dx / d) * k, (dy / d) * k);
    lastPointer = Date.now();
  });
  (function wander() {
    const eye = state.screen === "idle" ? eyes.idle : state.screen === "scan" ? eyes.scan : null;
    if (eye && Date.now() - lastPointer > 2500) {
      const a = rand(0, Math.PI * 2), k = state.screen === "scan" ? rand(0.3, 1) : rand(0, 0.9);
      gaze(eye, Math.cos(a) * k, Math.sin(a) * k);
    }
    if (eye && Math.random() < 0.25) blink(eye);
    setTimeout(wander, state.screen === "scan" ? rand(250, 700) : rand(1400, 3800));
  })();

  /* ------------------------------------------------------------------
     Chrome: labels, clock, ticker
     ------------------------------------------------------------------ */
  $("#terminalLabel").textContent = `${CONFIG.terminalName} · ${CONFIG.terminalUnit}`;
  $("#beingStatus").textContent = `${CONFIG.beingName} ONLINE`;
  $("#idleBeingName").textContent = CONFIG.beingName;
  $("#idleBeingName2").textContent = CONFIG.beingName;
  $("#idleKicker").textContent = `${CONFIG.terminalName} // ${CONFIG.electionName}`;

  const clock = () => {
    const d = new Date();
    $("#clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  clock(); setInterval(clock, 1000);

  const track = $("#tickerTrack");
  const tickerItems = CONFIG.ticker.map((t) => `<span>${t}</span>`).join("");
  track.innerHTML = tickerItems + tickerItems;
  requestAnimationFrame(() => track.style.setProperty("--ticker-dur", `${track.scrollWidth / 2 / 90}s`));

  const silhouette = `<svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="50" cy="44" r="19" fill="currentColor"/><path d="M12 125C12 90 29 71 50 71s38 19 38 54z" fill="currentColor"/></svg>`;
  function photoInto(el, c) {
    el.innerHTML = silhouette;
    if (!c.photo) return;
    const img = new Image();
    img.alt = "";
    img.onload = () => { el.innerHTML = ""; el.appendChild(img); };
    img.src = c.photo;
  }

  /* ------------------------------------------------------------------
     Screen switching
     ------------------------------------------------------------------ */
  const themes = { idle: "paper", scan: "dark", alarm: "alarm", ballot: "paper", thanks: "paper" };
  function show(name) {
    const prev = $(".screen.is-active");
    const next = $(`.screen[data-screen="${name}"]`);
    state.screen = name;
    document.body.dataset.screen = name;
    document.body.dataset.theme = themes[name];
    if (prev && prev !== next) {
      prev.classList.remove("is-active");
      prev.classList.add("is-leaving");
      setTimeout(() => prev.classList.remove("is-leaving"), 330);
    }
    next.classList.remove("is-active"); void next.offsetWidth; next.classList.add("is-active");
  }

  /* ------------------------------------------------------------------
     1. ID entry
     ------------------------------------------------------------------ */
  const boxes = $("#idBoxes");
  function renderBoxes(popIndex = -1) {
    let html = "";
    for (let i = 0; i < CONFIG.idLength; i++) {
      if (i > 0 && i % CONFIG.idGroupSize === 0) html += `<span class="id-dash"></span>`;
      const ch = state.digits[i];
      const cls = ["id-box", ch ? "is-filled" : "", i === state.digits.length ? "is-current" : "", i === popIndex ? "pop" : ""].join(" ");
      html += `<span class="${cls}">${ch || ""}</span>`;
    }
    boxes.innerHTML = html;
    boxes.setAttribute("aria-label", state.digits ? `Citizen ID ${state.digits.split("").join(" ")}` : "Citizen ID empty");
    $("#idSubmit").disabled = state.digits.length !== CONFIG.idLength;
  }
  function setError(msg) {
    $("#idError").textContent = msg;
    boxes.classList.remove("is-error");
    if (msg) { void boxes.offsetWidth; boxes.classList.add("is-error"); }
  }
  function pressKey(k) {
    if (state.screen !== "idle") return;
    Sound.init();
    const btn = $(`.keypad [data-key="${k}"]`);
    if (btn) { btn.classList.add("is-pressed"); setTimeout(() => btn.classList.remove("is-pressed"), 110); }
    setError("");
    if (/^\d$/.test(k)) {
      if (state.digits.length >= CONFIG.idLength) return;
      state.digits += k;
      Sound.key();
      renderBoxes(state.digits.length - 1);
    } else if (k === "back") {
      state.digits = state.digits.slice(0, -1); Sound.key(); renderBoxes();
    } else if (k === "clear") {
      state.digits = ""; Sound.key(); renderBoxes();
    }
  }
  $("#keypad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-key]");
    if (b) pressKey(b.dataset.key);
  });
  $("#idForm").addEventListener("submit", (e) => { e.preventDefault(); submitId(); });

  function submitId() {
    if (state.screen !== "idle") return;
    Sound.init();
    if (state.digits.length !== CONFIG.idLength) {
      Sound.error();
      setError(`INCOMPLETE ID — ${CONFIG.idLength} DIGITS REQUIRED.`);
      return;
    }
    if (state.digits === CONFIG.operatorId) {
      state.digits = ""; renderBoxes(); toggleAdmin(true);
      return;
    }
    const c = CITIZENS.find((x) => x.id === state.digits);
    if (!c) {
      Sound.error();
      setError("CITIZEN NOT FOUND. THIS INCIDENT HAS BEEN REPORTED.");
      blink(eyes.idle);
      state.digits = ""; renderBoxes();
      return;
    }
    runScan(c);
  }

  /* ------------------------------------------------------------------
     Privilege maths
     ------------------------------------------------------------------ */
  function assess(c) {
    const totalImportance = FACTORS.reduce((s, f) => s + f.importance, 0);
    const rows = FACTORS.map((f) => {
      const d = (c.factors && c.factors[f.key]) || { value: "UNKNOWN", score: 0.5 };
      const score = Math.max(0, Math.min(1, d.score));
      return { f, value: String(d.value).toUpperCase(), score, pts: (score * f.importance / totalImportance) * 100 };
    });
    const index = rows.reduce((s, r) => s + r.pts, 0);
    const { min, max, curve, decimals, favour = "less" } = CONFIG.weight;
    const x = favour === "less" ? 1 - index / 100 : index / 100;
    const computed = min + Math.pow(x, curve) * (max - min);
    const weight = Number((c.voteWeight ?? computed).toFixed(decimals));
    const tier = CONFIG.tiers.find((t) => weight >= t.min) || CONFIG.tiers[CONFIG.tiers.length - 1];
    return { rows, index, weight, tier };
  }

  /* ------------------------------------------------------------------
     Text effects
     ------------------------------------------------------------------ */
  const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/<>=+";
  function decode(el, text, dur = 600, { sound = true } = {}) {
    const token = session;
    return new Promise((res, rej) => {
      const t0 = performance.now();
      let lastBlip = 0;
      (function frame(now) {
        if (token !== session) return rej(CANCEL);
        const p = Math.min(1, (now - t0) / dur);
        const shown = Math.floor(p * text.length);
        let out = text.slice(0, shown);
        for (let i = shown; i < text.length; i++) out += text[i] === " " ? " " : pick(GLYPHS);
        el.textContent = out;
        if (sound && now - lastBlip > 55) { Sound.blip(); lastBlip = now; }
        if (p < 1) requestAnimationFrame(frame); else { el.textContent = text; res(); }
      })(t0);
    });
  }
  function countTo(el, from, to, dur, decimals, fmt = (v) => v.toFixed(decimals)) {
    const t0 = performance.now();
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  /* ------------------------------------------------------------------
     2. Scan
     ------------------------------------------------------------------ */
  const consoleEl = $("#console");
  function log(text, cls = "") {
    const p = document.createElement("p");
    p.textContent = text;
    if (cls) p.className = cls;
    consoleEl.appendChild(p);
    while (consoleEl.children.length > 40) consoleEl.firstChild.remove();
  }
  const hex = (n = 6) => Math.floor(Math.random() * 16 ** n).toString(16).toUpperCase().padStart(n, "0");
  const noiseLine = () => pick([
    () => `  · SAMPLE 0x${hex()} … ${rand(0, 1).toFixed(4)}`,
    () => `  · NODE ${pad(Math.floor(rand(0, 99)))}/${pad(Math.floor(rand(0, 99)))} SYNC ${Math.floor(rand(80, 100))}%`,
    () => `  · HASH ${hex(8)}${hex(8)}`,
    () => `  · CROSSREF ${Math.floor(rand(1000, 99999))} RECORDS`,
    () => `  · CONFIDENCE ${rand(94, 99.99).toFixed(2)}%`,
  ])();

  const gaugeLen = 267.04;
  (function buildGaugeTicks() {
    let g = "";
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      const x1 = 100 + Math.cos(a) * 72, y1 = 100 - Math.sin(a) * 72;
      const x2 = 100 + Math.cos(a) * 78, y2 = 100 - Math.sin(a) * 78;
      g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    $("#gaugeTicks").innerHTML = g;
  })();

  const runScan = guard(async (c) => {
    session++;
    state.citizen = c;
    state.result = assess(c);
    state.answers = [];
    const { rows, index, weight } = state.result;
    const speed = reducedMotion ? 0.6 : 1;

    // reset panels
    const list = $("#factorList");
    list.innerHTML = rows.map((r, i) => `
      <li class="factor">
        <span class="f-idx">${pad(i + 1)}</span>
        <span class="f-label">${r.f.label}<small>${r.f.source}</small></span>
        <span class="f-value">— — —</span>
        <span class="f-bar"><i></i></span>
        <span class="f-pts"></span>
      </li>`).join("");
    const fields = [
      ["NAME", c.name, true], ["CITIZEN ID", fmtId(c.id)], ["AGE", String(c.age ?? "—")],
      ["DISTRICT", c.district || "—"], ["OCCUPATION", c.occupation || "—"],
    ];
    $("#dossierFields").innerHTML = fields.map(([k, , big]) => `<div><dt>${k}</dt><dd class="${big ? "big" : ""}"></dd></div>`).join("");
    const photo = $(".dossier .photo");
    photo.classList.remove("is-locked");
    const photoImg = $("#dossierPhoto");
    photoImg.classList.remove("is-visible");
    photoInto(photoImg, c);
    $("#dossierLock").textContent = "SEARCHING";
    $("#dossierLock").classList.remove("is-ok");
    $("#indexValue").textContent = "00.0";
    $("#gaugeFill").style.strokeDashoffset = gaugeLen;
    $("#scanBar").style.width = "0%";
    $("#scanPct").textContent = "000%";
    consoleEl.innerHTML = "";
    $("#consult").classList.remove("is-visible");
    $("#consultText").textContent = "";
    eyes.scan.classList.add("is-scanning");
    eyes.consult.classList.remove("is-alarm");

    show("scan");
    Sound.droneStart();
    RGB.kick(18);

    // timer + noise
    const t0 = performance.now();
    const token = session;
    (function timer(now) {
      if (token !== session || state.screen !== "scan") return;
      const s = (now - t0) / 1000;
      $("#scanTimer").textContent = `T+${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}.${pad(Math.floor((s % 1) * 100))}`;
      requestAnimationFrame(timer);
    })(t0);
    const noise = setInterval(() => {
      if (token !== session || state.screen !== "scan") return clearInterval(noise);
      log(noiseLine());
    }, 240);

    const total = rows.length;
    const setProgress = (p) => {
      $("#scanBar").style.width = `${p * 100}%`;
      $("#scanPct").textContent = `${pad(Math.round(p * 100), 3)}%`;
    };

    // intro: lock on to the subject
    log(`> LINK ESTABLISHED WITH ${CONFIG.beingName}`, "ok");
    log(`> CITIZEN ID ${fmtId(c.id)} RECEIVED`);
    log("> RETRIEVING BIOMETRIC RECORD...");
    await sleep(T.scanIntro * 0.4 * speed);
    photo.classList.add("is-locked");
    RGB.kick(7);
    photoImg.classList.add("is-visible");
    $("#dossierLock").textContent = "LOCKED";
    $("#dossierLock").classList.add("is-ok");
    Sound.lock();
    log("> SUBJECT IDENTIFIED", "ok");
    const dds = $$("#dossierFields dd");
    for (let i = 0; i < fields.length; i++) {
      decode(dds[i], fields[i][1], 380 * speed, { sound: i === 0 });
      await sleep(T.scanIntro * 0.12 * speed);
    }
    await sleep(T.scanIntro * 0.1 * speed);

    // factors
    let running = 0;
    const items = $$(".factor", list);
    for (let i = 0; i < total; i++) {
      const r = rows[i], li = items[i];
      const per = T.perFactor * speed;
      li.classList.add("is-active");
      log(`> QUERYING ${r.f.source}...`);
      const logs = r.f.log || [];
      logs.forEach((line, j) => setTimeout(() => token === session && log(`  ${line}`), (per * 0.5 * (j + 1)) / (logs.length + 1)));
      await decode($(".f-value", li), r.value, per * 0.45);
      li.classList.add(r.score >= 0.66 ? "tone-high" : r.score <= 0.33 ? "tone-low" : "tone-mid");
      li.classList.toggle("favoured", (CONFIG.weight.favour || "less") === "less" ? r.score <= 0.33 : r.score >= 0.66);
      li.classList.toggle("penalised", (CONFIG.weight.favour || "less") === "less" ? r.score >= 0.66 : r.score <= 0.33);
      $(".f-bar i", li).style.width = `${r.score * 100}%`;
      countTo($(".f-pts", li), 0, r.pts, per * 0.35, 1, (v) => `+${v.toFixed(1)}`);
      countTo($("#indexValue"), running, running + r.pts, per * 0.4, 1, (v) => pad(v.toFixed(1), 4));
      running += r.pts;
      $("#gaugeFill").style.strokeDashoffset = gaugeLen * (1 - running / 100);
      Sound.tick();
      RGB.kick(rand(6, 11));
      log(`  ${r.f.label}: ${r.value} → +${r.pts.toFixed(1)}`, li.classList.contains("penalised") ? "warn" : "ok");
      setProgress((i + 1) / total);
      await sleep(per * 0.55);
      li.classList.remove("is-active");
      li.classList.add("is-done");
    }

    // outro: hand over to the being
    clearInterval(noise);
    log(`> PRIVILEGE INDEX FINALISED: ${index.toFixed(1)} / 100`, "ok");
    if ((CONFIG.weight.favour || "less") === "less") log("> APPLYING INVERSE PRIVILEGE CORRECTION", "warn");
    log(`> TRANSMITTING TO ${CONFIG.beingName}...`, "warn");
    await sleep(450 * speed);
    eyes.consult.classList.add("is-alarm");
    $("#consult").classList.add("is-visible");
    RGB.kick(10);
    RGB.humTo(4);
    Sound.droneStop();
    Sound.tone(110, 1.6, { type: "sawtooth", vol: 0.08, slide: 440 });
    const ct = $("#consultText");
    await decode(ct, `CONSULTING ${CONFIG.beingName}`, 500 * speed, { sound: false });
    for (let i = 0; i < 3; i++) { await sleep(T.scanOutro * 0.18 * speed); ct.textContent += "."; Sound.blip(); RGB.humTo(4 + i * 4); }
    await sleep(T.scanOutro * 0.2 * speed);
    await decode(ct, "VOTE WEIGHT DETERMINED", 450 * speed, { sound: false });
    await sleep(T.scanOutro * 0.15 * speed);
    eyes.scan.classList.remove("is-scanning");
    RGB.humTo(0);
    RGB.kick(24);
    runAlarm(weight);
  });

  /* ------------------------------------------------------------------
     3. Alarm
     ------------------------------------------------------------------ */
  const flash = $(".fx-flash");
  const runAlarm = guard(async (weight) => {
    const { index, tier } = state.result;
    const c = state.citizen;
    const screen = $(".screen-alarm");
    const num = $("#alarmWeight");
    const late = [$("#alarmSub"), $(".alarm-meta"), $("#alarmNext"), $("#alarmAuto")];
    late.forEach((el) => { el.classList.add("reveal-late"); el.classList.remove("is-in"); });
    screen.classList.remove("is-revealed");
    $(".alarm-number").classList.remove("is-slam");
    $("#alarmName").textContent = c.name;
    $("#alarmSub").innerHTML = `1 ballot cast by this citizen counts as <strong>${fmtW(weight)} ${weight === 1 ? "VOTE" : "VOTES"}</strong>.`;
    const stamp = $("#alarmTier");
    stamp.textContent = tier.label;
    stamp.className = `stamp tone-${tier.tone || "ink"}`;
    $("#alarmIndex").textContent = `PRIVILEGE INDEX ${index.toFixed(1)} / 100`;
    $("#alarmAuto").textContent = "";
    num.textContent = "0.00";

    show("alarm");
    flash.classList.add("is-pulsing");
    Sound.klaxon(3);

    // slot-machine roll, then slam
    const rollMs = reducedMotion ? 300 : 1700;
    const t0 = performance.now(), token = session;
    await new Promise((res) => {
      let last = 0;
      (function frame(now) {
        if (token !== session) return res();
        const p = Math.min(1, (now - t0) / rollMs);
        if (now - last > 45 + p * 90) {
          num.textContent = fmtW(p < 0.8 ? rand(0, CONFIG.weight.max) : weight + rand(-0.3, 0.3) * (1 - p));
          Sound.roll(); last = now;
        }
        if (p < 1) requestAnimationFrame(frame); else res();
      })(t0);
    });
    await sleep(0);
    num.textContent = fmtW(weight);
    $(".alarm-number").classList.add("is-slam");
    flash.classList.remove("is-hit"); void flash.offsetWidth; flash.classList.add("is-hit");
    setTimeout(() => flash.classList.remove("is-hit"), 700);   // hand back to the edge pulse
    screen.classList.add("is-revealed");
    Sound.slam();
    RGB.kick(16, rand(-0.3, 0.3));
    await sleep(600);
    for (const el of late) { el.classList.add("is-in"); await sleep(220); }
    $("#alarmNext").focus({ preventScroll: true });
    state.lastInput = Date.now();

    if (T.alarmAutoAdvance > 0) {
      const end = Date.now() + T.alarmAutoAdvance;
      while (state.screen === "alarm") {
        const left = Math.ceil((end - Date.now()) / 1000);
        if (left <= 0) { goBallot(); break; }
        $("#alarmAuto").textContent = `TAP THE BUTTON OR PRESS ENTER · CONTINUING AUTOMATICALLY IN ${left}S`;
        await sleep(250);
      }
    }
  });
  $("#alarmNext").addEventListener("click", () => goBallot());

  /* ------------------------------------------------------------------
     4. Ballot
     ------------------------------------------------------------------ */
  function goBallot() {
    if (state.screen !== "alarm") return;
    flash.classList.remove("is-pulsing");
    const c = state.citizen;
    photoInto($("#chipPhoto"), c);
    $("#chipName").textContent = c.name;
    $("#chipWeight").textContent = `×${fmtW(state.result.weight)}`;
    state.q = 0;
    renderQuestion();
    show("ballot");
    Sound.tick();
  }
  function renderQuestion() {
    const q = QUESTIONS[state.q];
    $("#qCounter").textContent = `QUESTION ${pad(state.q + 1)} / ${pad(QUESTIONS.length)}`;
    $("#qSegments").innerHTML = QUESTIONS.map((_, i) =>
      `<i class="${i < state.q ? "is-done" : i === state.q ? "is-current" : ""}"></i>`).join("");
    $("#questionText").textContent = q.text;
    $("#optA").textContent = q.a;
    $("#optB").textContent = q.b;
    $(".options").classList.remove("is-locked");
    $$(".option").forEach((o) => {
      o.classList.remove("is-chosen", "is-dimmed");
      $(".opt-stamp", o).textContent = `+${fmtW(state.result.weight)} VOTES`;
    });
  }
  const choose = guard(async (choice) => {
    if (state.screen !== "ballot" || $(".options").classList.contains("is-locked")) return;
    Sound.init();
    $(".options").classList.add("is-locked");
    $$(".option").forEach((o) => o.classList.add(o.dataset.choice === choice ? "is-chosen" : "is-dimmed"));
    Sound.select();
    state.answers.push(choice);
    await sleep(T.voteConfirm);
    if (state.q < QUESTIONS.length - 1) {
      const wrap = $("#questionWrap");
      wrap.classList.remove("is-swapping"); void wrap.offsetWidth; wrap.classList.add("is-swapping");
      await sleep(230);
      state.q++;
      renderQuestion();
      await sleep(270);
      wrap.classList.remove("is-swapping");
    } else {
      runThanks();
    }
  });
  $$(".option").forEach((o) => o.addEventListener("click", () => choose(o.dataset.choice)));

  /* ------------------------------------------------------------------
     5. Thanks
     ------------------------------------------------------------------ */
  let thanksReady = 0;
  const runThanks = guard(async () => {
    const { weight, index } = state.result;
    saveVote({
      at: new Date().toISOString(),
      citizenId: state.citizen.id,
      name: state.citizen.name,
      index: Number(index.toFixed(1)),
      weight,
      answers: state.answers,
    });
    const n = QUESTIONS.length;
    $("#thanksText").innerHTML = `Your ${n} weighted ${n === 1 ? "ballot" : "ballots"} <strong>(×${fmtW(weight)} each)</strong> have been delivered to ${CONFIG.beingName}. Every voice is heard. Some are heard more clearly.`;
    const bar = $("#resetBar");
    bar.style.transition = "none"; bar.style.transform = "scaleX(1)";
    show("thanks");
    Sound.thanks();
    thanksReady = Date.now() + 1500;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `transform ${T.thankYou}ms linear`;
      bar.style.transform = "scaleX(0)";
    }));
    const end = Date.now() + T.thankYou;
    while (state.screen === "thanks") {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { resetToIdle(); break; }
      $("#resetText").textContent = `TERMINAL RESETS FOR THE NEXT CITIZEN IN ${left}S · TAP OR PRESS ENTER TO RESTART NOW`;
      await sleep(250);
    }
  });
  $(".screen-thanks").addEventListener("click", () => {
    if (state.screen === "thanks" && Date.now() > thanksReady) resetToIdle();
  });

  function resetToIdle() {
    session++;
    Sound.droneStop();
    RGB.stop();
    flash.classList.remove("is-pulsing", "is-hit");
    eyes.scan.classList.remove("is-scanning");
    state = { ...state, digits: "", citizen: null, result: null, q: 0, answers: [], lastInput: Date.now() };
    setError("");
    renderBoxes();
    show("idle");
  }

  /* ------------------------------------------------------------------
     Storage + operator panel
     ------------------------------------------------------------------ */
  function loadVotes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function saveVote(v) {
    try { const all = loadVotes(); all.push(v); localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* storage unavailable: kiosk keeps running */ }
  }
  const admin = $("#admin");
  function renderAdmin() {
    const votes = loadVotes();
    const rowsHtml = QUESTIONS.map((q, i) => {
      let ra = 0, rb = 0, wa = 0, wb = 0;
      votes.forEach((v) => {
        if (v.answers[i] === "a") { ra++; wa += v.weight; }
        if (v.answers[i] === "b") { rb++; wb += v.weight; }
      });
      const rawWin = ra === rb ? "TIE" : ra > rb ? "A" : "B";
      const wWin = Math.abs(wa - wb) < 1e-9 ? "TIE" : wa > wb ? "A" : "B";
      return `<tr><td>Q${i + 1}<br><small>${q.a} / ${q.b}</small></td><td>${ra} / ${rb}</td><td>${wa.toFixed(2)} / ${wb.toFixed(2)}</td>
        <td>${rawWin}</td><td class="${rawWin !== wWin ? "flip" : ""}">${wWin}${rawWin !== wWin ? " (FLIPPED)" : ""}</td></tr>`;
    }).join("");
    $("#adminBody").innerHTML = `
      <p class="admin-summary">Completed sessions: <b>${votes.length}</b></p>
      <table><thead><tr><th>QUESTION</th><th>RAW A / B</th><th>WEIGHTED A / B</th><th>RAW WINNER</th><th>WEIGHTED WINNER</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>`;
  }
  function toggleAdmin(open = admin.hidden) {
    admin.hidden = !open;
    if (open) renderAdmin();
  }
  $("#adminClose").addEventListener("click", () => toggleAdmin(false));
  $("#adminExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), questions: QUESTIONS, votes: loadVotes() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `privilea-votes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#adminClear").addEventListener("click", () => {
    if (confirm("Delete every recorded vote on this machine?")) { localStorage.removeItem(STORAGE_KEY); renderAdmin(); }
  });
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  $("#adminFull").addEventListener("click", toggleFullscreen);
  $("#muteBtn").addEventListener("click", () => { Sound.init(); Sound.toggle(); });
  $("#muteBtn").setAttribute("aria-pressed", String(!Sound.on));

  /* ------------------------------------------------------------------
     Keyboard + inactivity
     ------------------------------------------------------------------ */
  document.addEventListener("keydown", (e) => {
    state.lastInput = Date.now();
    if (e.ctrlKey && e.altKey && e.code === "KeyO") { e.preventDefault(); toggleAdmin(); return; }
    if (!admin.hidden) { if (e.key === "Escape") toggleAdmin(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;

    if (k === "Escape") { resetToIdle(); return; }
    if (k.toLowerCase() === "m") { Sound.init(); Sound.toggle(); return; }

    switch (state.screen) {
      case "idle":
        if (/^\d$/.test(k)) pressKey(k);
        else if (k === "Backspace") pressKey("back");
        else if (k === "Delete") pressKey("clear");
        else if (k === "Enter") { e.preventDefault(); submitId(); }
        else if (k.toLowerCase() === "f") toggleFullscreen();
        break;
      case "alarm":
        if (k === "Enter" || k === " ") { e.preventDefault(); if ($("#alarmNext").classList.contains("is-in")) goBallot(); }
        break;
      case "ballot":
        if (["a", "y", "1", "ArrowLeft"].includes(k.length === 1 ? k.toLowerCase() : k)) choose("a");
        if (["b", "n", "2", "ArrowRight"].includes(k.length === 1 ? k.toLowerCase() : k)) choose("b");
        break;
      case "thanks":
        if ((k === "Enter" || k === " ") && Date.now() > thanksReady) resetToIdle();
        break;
    }
  });
  document.addEventListener("pointerdown", () => { state.lastInput = Date.now(); Sound.init(); });
  // Touch hygiene: no long-press menus, no dragging, and a tapped button doesn't
  // keep focus (otherwise Space/Enter on a keyboard would re-press it).
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    if (e.detail > 0) e.target.closest("button")?.blur();
  });
  setInterval(() => {
    if ((state.screen === "alarm" || state.screen === "ballot") && admin.hidden && Date.now() - state.lastInput > T.inactivityReset) resetToIdle();
  }, 1000);

  renderBoxes();
  document.fonts?.ready.then(() => track.style.setProperty("--ticker-dur", `${track.scrollWidth / 2 / 90}s`));
})();
