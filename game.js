// RUN FROM FRANZ — meme endless chaser runner
// Single-file vanilla JS canvas game.
// Safe parody tone. No logos. No real likeness.

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const timeEl = document.getElementById("timeEl");
  const bestEl = document.getElementById("bestEl");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlaySmall = document.getElementById("overlaySmall");
  const startBtn = document.getElementById("startBtn");
  const howBtn = document.getElementById("howBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const toast = document.getElementById("toast");
  const leftBtn = document.getElementById("leftBtn");
  const rightBtn = document.getElementById("rightBtn");
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // HiDPI support
  function setupCanvasDPR() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = canvas.clientWidth || 420;
    const cssHeight = Math.round(cssWidth * (720 / 420));
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvasDPR();
  window.addEventListener("resize", setupCanvasDPR);

  // Game constants
  const W = () => canvas.clientWidth || 420;
  const H = () => parseInt(canvas.style.height, 10) || 720;

  // Local best
  const BEST_KEY = "rf_best_time";
  function getBest() {
    const v = Number(localStorage.getItem(BEST_KEY) || 0);
    return isFinite(v) ? v : 0;
  }
  function setBest(v) {
    localStorage.setItem(BEST_KEY, String(v));
  }
  function fmt(t) { return t.toFixed(1); }

  // Audio (simple oscillator engine vibe)
  let audioCtx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 90;
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
  }

  function setEngineIntensity(intensity01) {
    // intensity 0..1
    if (!audioCtx || !engineOsc || !engineGain) return;
    const t = audioCtx.currentTime;
    const freq = 90 + intensity01 * 190;
    const vol = muted ? 0 : (0.02 + intensity01 * 0.06);
    engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    engineGain.gain.setTargetAtTime(vol, t, 0.08);
  }

  function stopEngine() {
    if (!audioCtx || !engineGain) return;
    const t = audioCtx.currentTime;
    engineGain.gain.setTargetAtTime(0, t, 0.04);
  }

  // Input
  let moveDir = 0; // -1 left, +1 right, 0 none
  let paused = false;
  let running = false;

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.style.opacity = "0"), 800);
  }

  // Entities
  const state = {
    t: 0,
    dt: 0,
    speed: 210,           // px/s obstacle fall speed (ramps)
    speedRamp: 6.5,       // speed increase per second
    laneCount: 5,
    laneW: 0,
    roadX: 0,
    roadW: 0,
    player: { lane: 2, x: 0, y: 0, w: 26, h: 44, vx: 0 },
    franz: { y: 0, closeness: 0 }, // closeness rises -> catch
    obstacles: [],
    spawnTimer: 0,
    spawnEvery: 0.62,
    scoreTime: 0,
    best: getBest(),
    memeTimer: 0,
    memeEvery: 4.2,
    gameOver: false
  };

  bestEl.textContent = fmt(state.best);

  function reset() {
    state.t = 0;
    state.speed = 210;
    state.spawnTimer = 0;
    state.obstacles = [];
    state.scoreTime = 0;
    state.gameOver = false;
    state.franz.closeness = 0.12;
    state.franz.y = 0;
    state.memeTimer = 0;

    // road sizing based on canvas
    state.roadW = Math.min(380, W() * 0.92);
    state.roadX = (W() - state.roadW) / 2;
    state.laneW = state.roadW / state.laneCount;

    state.player.y = H() - 120;
    state.player.lane = Math.floor(state.laneCount / 2);
    state.player.x = laneCenterX(state.player.lane);
    state.player.vx = 0;
  }

  function laneCenterX(lane) {
    return state.roadX + state.laneW * (lane + 0.5);
  }

  function spawnObstacle() {
    // Avoid spawning in same lane repeatedly sometimes
    const lane = Math.floor(Math.random() * state.laneCount);
    const size = 34 + Math.random() * 10;
    const x = laneCenterX(lane) - size/2;
    const y = -80 - Math.random()*80;

    // type variety
    const r = Math.random();
    const type = r < 0.72 ? "cone" : (r < 0.92 ? "barrier" : "oil");

    state.obstacles.push({
      lane, x, y, w: size, h: size,
      type,
      hitboxPad: type === "cone" ? 6 : 4
    });
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function setOverlay(mode) {
    overlay.style.display = "flex";
    if (mode === "start") {
      overlayTitle.textContent = "RUN FROM FRANZ";
      overlayText.innerHTML = `Dodge obstacles. Survive as long as possible.<br/>If Franz catches you… it’s over.`;
      startBtn.textContent = "Start";
      overlaySmall.style.display = "block";
    } else if (mode === "how") {
      overlayTitle.textContent = "HOW TO PLAY";
      overlayText.innerHTML = `
        <div style="text-align:left; line-height:1.5;">
          <strong>Move:</strong> Left/Right (← →) or A/D<br/>
          <strong>Mobile:</strong> tap ◀ ▶ or tap left/right side of screen<br/>
          <strong>Goal:</strong> survive. Speed increases forever.<br/>
          <strong>Franz:</strong> gets closer over time. If he reaches you, game over.
        </div>`;
      startBtn.textContent = "Back";
      overlaySmall.style.display = "none";
    } else if (mode === "over") {
      overlayTitle.textContent = "FRANZ HERMANN FOUND YOU";
      overlayText.innerHTML = `
        You survived <strong>${fmt(state.scoreTime)}</strong>s.<br/>
        Franz usually catches people in <strong>${fmt(Math.max(12, state.scoreTime - (6 + Math.random()*10)))}</strong>s.
      `;
      startBtn.textContent = "Restart";
      overlaySmall.style.display = "block";
    } else if (mode === "paused") {
      overlayTitle.textContent = "PAUSED";
      overlayText.innerHTML = `Breathe. He’s still behind you.`;
      startBtn.textContent = "Resume";
      overlaySmall.style.display = "none";
    }
  }

  function hideOverlay() {
    overlay.style.display = "none";
  }

  function startGame() {
    reset();
    running = true;
    paused = false;
    hideOverlay();
    showToast("YOU WEREN’T SUPPOSED TO SEE HIM");
    ensureAudio();
  }

  function gameOver() {
    state.gameOver = true;
    running = false;
    paused = false;
    stopEngine();

    if (state.scoreTime > state.best) {
      state.best = state.scoreTime;
      setBest(state.best);
      bestEl.textContent = fmt(state.best);
    }

    setOverlay("over");
  }

  function togglePause() {
    if (!running && !state.gameOver) return;
    if (state.gameOver) return;
    paused = !paused;
    if (paused) {
      setOverlay("paused");
      stopEngine();
    } else {
      hideOverlay();
      ensureAudio();
    }
  }

  // Overlay buttons
  startBtn.addEventListener("click", () => {
    if (overlayTitle.textContent === "HOW TO PLAY") {
      setOverlay("start");
      return;
    }
    if (overlayTitle.textContent === "PAUSED") {
      paused = false;
      hideOverlay();
      ensureAudio();
      return;
    }
    if (overlayTitle.textContent === "FRANZ HERMANN FOUND YOU") {
      startGame();
      return;
    }
    startGame();
  });

  howBtn.addEventListener("click", () => setOverlay("how"));

  pauseBtn.addEventListener("click", () => {
    if (!running) return;
    togglePause();
  });

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = `Sound: ${muted ? "Off" : "On"}`;
    if (muted) stopEngine();
    else ensureAudio();
  });

  // Keyboard
  const keyDown = (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") moveDir = -1;
    if (k === "arrowright" || k === "d") moveDir = 1;

    if (k === "p") togglePause();
    if (k === "r") {
      if (state.gameOver || !running) startGame();
    }
    if (k === " " || k === "enter") {
      if (overlay.style.display !== "none") startBtn.click();
    }
  };
  const keyUp = (e) => {
    const k = e.key.toLowerCase();
    if ((k === "arrowleft" || k === "a") && moveDir === -1) moveDir = 0;
    if ((k === "arrowright" || k === "d") && moveDir === 1) moveDir = 0;
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);

  // Touch buttons
  function bindHold(btn, dir) {
    let holding = false;
    const start = (e) => { e.preventDefault(); holding = true; moveDir = dir; ensureAudio(); };
    const end = (e) => { e.preventDefault(); holding = false; if (moveDir === dir) moveDir = 0; };
    btn.addEventListener("touchstart", start, { passive:false });
    btn.addEventListener("touchend", end, { passive:false });
    btn.addEventListener("touchcancel", end, { passive:false });
    btn.addEventListener("mousedown", start);
    btn.addEventListener("mouseup", end);
    btn.addEventListener("mouseleave", end);
  }
  bindHold(leftBtn, -1);
  bindHold(rightBtn, 1);

  // Tap left/right screen
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    moveDir = x < rect.width / 2 ? -1 : 1;
    ensureAudio();
  });
  canvas.addEventListener("pointerup", () => (moveDir = 0));
  canvas.addEventListener("pointercancel", () => (moveDir = 0));

  // Meme lines
  const memeLines = [
    "FRANZ IS GAINING",
    "NO DEFENSE",
    "HE’S STILL FASTER",
    "FIVE SECONDS PENALTY (FOR YOU)",
    "BLUE FLAGS",
    "DRS ENABLED",
    "IT’S OVER, BRO",
    "HE SMELLS FEAR"
  ];

  // Drawing helpers
  function drawRoad() {
    // Background
    ctx.fillStyle = "#0f0f16";
    ctx.fillRect(0, 0, W(), H());

    // Road
    ctx.fillStyle = "#111122";
    roundRect(state.roadX, 0, state.roadW, H(), 18, true, false);

    // Lane lines
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 18]);
    for (let i = 1; i < state.laneCount; i++) {
      const x = state.roadX + state.laneW * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H());
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Vignette
    const grad = ctx.createLinearGradient(0,0,0,H());
    grad.addColorStop(0, "rgba(0,0,0,.10)");
    grad.addColorStop(0.5, "rgba(0,0,0,.00)");
    grad.addColorStop(1, "rgba(0,0,0,.25)");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W(),H());
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawPlayer() {
    const px = state.player.x - state.player.w/2;
    const py = state.player.y - state.player.h/2;

    // Car body
    ctx.fillStyle = "#f2f2f5";
    roundRect(px, py, state.player.w, state.player.h, 8, true, false);

    // Windshield
    ctx.fillStyle = "rgba(0,0,0,.35)";
    roundRect(px+5, py+7, state.player.w-10, 12, 6, true, false);

    // Tail light
    ctx.fillStyle = "rgba(255,45,85,.9)";
    roundRect(px+6, py+state.player.h-10, state.player.w-12, 6, 6, true, false);
  }

  function drawObstacles() {
    for (const o of state.obstacles) {
      if (o.type === "cone") {
        ctx.fillStyle = "rgba(255,165,0,.95)";
        roundRect(o.x, o.y, o.w, o.h, 8, true, false);
        ctx.fillStyle = "rgba(255,255,255,.55)";
        roundRect(o.x+6, o.y+10, o.w-12, 6, 6, true, false);
      } else if (o.type === "barrier") {
        ctx.fillStyle = "rgba(56,189,248,.9)";
        roundRect(o.x, o.y, o.w, o.h, 10, true, false);
        ctx.fillStyle = "rgba(0,0,0,.28)";
        roundRect(o.x+6, o.y+8, o.w-12, o.h-16, 8, true, false);
      } else {
        // oil / slow zone (we treat as obstacle = instant)
        ctx.fillStyle = "rgba(255,45,85,.65)";
        roundRect(o.x, o.y, o.w, o.h, 18, true, false);
      }
    }
  }

  function drawFranz() {
    // Franz is a red "presence" behind you; he gets closer (higher y + glow)
    const closeness = clamp(state.franz.closeness, 0, 1);

    const baseY = state.player.y + 90;
    const y = baseY - closeness * 160;
    const x = state.roadX + state.roadW/2;

    const w = 46 + closeness * 24;
    const h = 26 + closeness * 10;

    // glow
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,45,85,.28)";
    roundRect(x - (w+40)/2, y - (h+30)/2, w+40, h+30, 24, true, false);
    ctx.restore();

    // car silhouette
    ctx.fillStyle = "rgba(255,45,85,.95)";
    roundRect(x - w/2, y - h/2, w, h, 12, true, false);

    // "helmet dot"
    ctx.fillStyle = "rgba(255,255,255,.85)";
    roundRect(x - 8, y - 6, 16, 12, 8, true, false);

    // warning tint if close
    if (closeness > 0.72) {
      ctx.fillStyle = `rgba(255,45,85,${(closeness-0.72)/0.28 * 0.20})`;
      ctx.fillRect(0,0,W(),H());
    }
  }

  function update(dt) {
    state.dt = dt;
    if (paused || !running) return;

    state.t += dt;
    state.scoreTime += dt;

    // ramp speed
    state.speed += state.speedRamp * dt;

    // obstacle spawn
    state.spawnTimer += dt;
    const spawnRate = Math.max(0.36, state.spawnEvery - state.t * 0.002); // slightly faster over time
    if (state.spawnTimer >= spawnRate) {
      state.spawnTimer = 0;
      spawnObstacle();
      // occasionally spawn 2
      if (Math.random() < 0.18 && state.t > 10) spawnObstacle();
    }

    // player movement (smooth lane)
    const targetX = laneCenterX(state.player.lane);
    const dx = targetX - state.player.x;
    state.player.vx = dx * 12; // spring
    state.player.x += state.player.vx * dt;

    // input -> lane changes
    if (moveDir !== 0) {
      // move continuously but step lanes with cooldown
      if (!state._laneCooldown) state._laneCooldown = 0;
      state._laneCooldown -= dt;
      if (state._laneCooldown <= 0) {
        state.player.lane = clamp(state.player.lane + moveDir, 0, state.laneCount - 1);
        state._laneCooldown = 0.10; // adjust feel
      }
    }

    // obstacles fall
    for (const o of state.obstacles) o.y += state.speed * dt;
    state.obstacles = state.obstacles.filter(o => o.y < H() + 120);

    // collisions
    const px = state.player.x - state.player.w/2;
    const py = state.player.y - state.player.h/2;
    for (const o of state.obstacles) {
      const pad = o.hitboxPad || 4;
      if (rectsOverlap(px+pad, py+pad, state.player.w-2*pad, state.player.h-2*pad, o.x+pad, o.y+pad, o.w-2*pad, o.h-2*pad)) {
        gameOver();
        return;
      }
    }

    // Franz closeness increases with time + speed pressure; slightly reduced if you're "clean"
    const danger = clamp((state.speed - 210) / 600, 0, 1);
    state.franz.closeness += (0.032 + danger * 0.050) * dt;

    // If too many obstacles recently, he gains faster (pressure)
    if (state.obstacles.length > 6) state.franz.closeness += 0.018 * dt;

    // catch condition
    if (state.franz.closeness >= 1) {
      gameOver();
      return;
    }

    // meme events
    state.memeTimer += dt;
    const memeRate = clamp(state.memeEvery - state.t * 0.02, 1.4, 4.2);
    if (state.memeTimer >= memeRate) {
      state.memeTimer = 0;
      const line = memeLines[Math.floor(Math.random() * memeLines.length)];
      showToast(line);
    }

    // engine intensity
    ensureAudio();
    const intensity = clamp(0.15 + danger * 0.85 + (state.franz.closeness * 0.55), 0, 1);
    setEngineIntensity(intensity);

    // UI time
    timeEl.textContent = fmt(state.scoreTime);
  }

  function draw() {
    drawRoad();
    drawObstacles();
    drawFranz();
    drawPlayer();

    // top text hint
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "700 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("DODGE • SURVIVE • DON’T LOOK BACK", state.roadX + 12, 26);

    // closeness bar (subtle)
    const closeness = clamp(state.franz.closeness, 0, 1);
    const barW = state.roadW - 24;
    const barX = state.roadX + 12;
    const barY = 38;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(255,255,255,.10)";
    roundRect(barX, barY, barW, 10, 8, true, false);
    ctx.fillStyle = "rgba(255,45,85,.85)";
    roundRect(barX, barY, barW * closeness, 10, 8, true, false);
    ctx.globalAlpha = 1;
  }

  // Main loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (running && !paused) update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // Initial state
  reset();
  setOverlay("start");
  requestAnimationFrame(loop);

  // Make overlay clickable to start audio on mobile
  overlay.addEventListener("pointerdown", () => {
    // Safari needs a gesture before audio starts
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  });

})();
