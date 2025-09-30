(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const baseAngleEl = document.getElementById('baseAngle');
  const fineAngleEl = document.getElementById('fineAngle');
  const totalAngleEl = document.getElementById('totalAngle');
  const rateEl = document.getElementById('rate');
  const downloadedEl = document.getElementById('downloaded');
  const timeEl = document.getElementById('time');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const modeSelect = document.getElementById('modeSelect');
  const speedSlider = document.getElementById('speedSlider');
  const speedLabel = document.getElementById('speedLabel');

  // Modal & leaderboard elements
  const endModal = document.getElementById('endModal');
  const finalScoreEl = document.getElementById('finalScore');
  const scoreForm = document.getElementById('scoreForm');
  const playerNameInput = document.getElementById('playerName');
  const cancelModalBtn = document.getElementById('cancelModal');
  const leaderboardList = document.getElementById('leaderboardList');

  // Canvas size handling
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * devicePixelRatio);
    canvas.height = Math.floor(rect.height * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Game state
  const state = {
    running: false,
    mode: 'timed',
    durationSec: 120,
    elapsed: 0,

    baseAngleDeg: 0,   // coarse (A/D), step 1°
    fineAngleDeg: 0,   // fine (←/→), step 0.1°
    maxBaseDeg: 80,
    maxFineDeg: 5,

    dish: { x: 0, y: 0 },
    beamLength: 2000,

    satellites: [],
    spawnCooldown: 0,
    spawnEveryMin: 1.2,
    spawnEveryMax: 2.5,

    totalDataMB: 0,
    currentRateMBps: 0,

    hiScoreMB: parseFloat(localStorage.getItem('mx_traffic_hi_mb') || '0') || 0,
    gameOver: false,
    // Satellite speed multiplier (0.5x .. 2.5x)
    speedMultiplier: (() => {
      let v = parseFloat(localStorage.getItem('mx_traffic_speed') || '1');
      if (!isFinite(v)) v = 1;
      if (v < 0.5) v = 0.5; else if (v > 2.5) v = 2.5;
      return v;
    })(),
  };

  function resetGame(clearScore = true) {
    state.elapsed = 0;
    state.baseAngleDeg = 0;
    state.fineAngleDeg = 0;
    state.satellites = [];
    state.spawnCooldown = 0;
    state.totalDataMB = clearScore ? 0 : state.totalDataMB;
    state.currentRateMBps = 0;
    state.gameOver = false;
    hideEndModal();
  }

  // Position dish near bottom-center
  function layoutPositions() {
    state.dish.x = canvas.width / devicePixelRatio / 2;
    state.dish.y = canvas.height / devicePixelRatio - 60;
  }
  layoutPositions();

  // Spawn satellites at top with random y (top band)
  function spawnSatellite() {
    const w = canvas.width / devicePixelRatio;
    const y = 40 + Math.random() * 120;
    const dirRight = Math.random() < 0.5;
    const speed = 60 + Math.random() * 80; // px/s
    const radius = 12 + Math.random() * 6;

    const x = dirRight ? -40 : w + 40;
    const vx = dirRight ? speed : -speed;

    const sat = { x, y, vx, radius };
    state.satellites.push(sat);
  }

  function updateSpawn(dt) {
    if (state.spawnCooldown <= 0) {
      spawnSatellite();
      state.spawnCooldown = state.spawnEveryMin + Math.random() * (state.spawnEveryMax - state.spawnEveryMin);
    } else {
      state.spawnCooldown -= dt;
    }
  }

  // Input handling (step on keydown)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'a' || e.key === 'A') {
      state.baseAngleDeg = Math.max(-state.maxBaseDeg, state.baseAngleDeg - 1);
      e.preventDefault();
    } else if (e.key === 'd' || e.key === 'D') {
      state.baseAngleDeg = Math.min(state.maxBaseDeg, state.baseAngleDeg + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      state.fineAngleDeg = Math.max(-state.maxFineDeg, round1(state.fineAngleDeg - 0.1));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      state.fineAngleDeg = Math.min(state.maxFineDeg, round1(state.fineAngleDeg + 0.1));
      e.preventDefault();
    } else if (e.code === 'Space') {
      // Quick toggle pause
      state.running = !state.running;
      e.preventDefault();
    }
  });

  startBtn.addEventListener('click', () => { state.running = true; });
  pauseBtn.addEventListener('click', () => { state.running = false; });
  resetBtn.addEventListener('click', () => { resetGame(true); });
  modeSelect.addEventListener('change', () => {
    state.mode = modeSelect.value;
    resetGame(false);
  });

  // Satellite speed control
  if (speedSlider && speedLabel) {
    speedSlider.value = String(state.speedMultiplier);
    speedLabel.textContent = `${Number(state.speedMultiplier).toFixed(1)}x`;
    speedSlider.addEventListener('input', () => {
      const v = parseFloat(speedSlider.value) || 1;
      state.speedMultiplier = Math.max(0.5, Math.min(2.5, v));
      speedLabel.textContent = `${state.speedMultiplier.toFixed(1)}x`;
      localStorage.setItem('mx_traffic_speed', String(state.speedMultiplier));
    });
  }

  // Modal helpers
  function showEndModal() {
    if (!endModal) return;
    endModal.classList.remove('hidden');
    try { playerNameInput.focus(); } catch {}
  }

  function hideEndModal() {
    if (!endModal) return;
    endModal.classList.add('hidden');
  }

  function onGameEnd() {
    if (state.gameOver) return;
    state.running = false;
    state.gameOver = true;

    // Save hi-score locally
    if (state.totalDataMB > state.hiScoreMB) {
      state.hiScoreMB = state.totalDataMB;
      localStorage.setItem('mx_traffic_hi_mb', String(state.hiScoreMB));
    }

    // Populate modal score
    if (finalScoreEl) finalScoreEl.textContent = formatDataMB(state.totalDataMB);
    // Prefill player name from localStorage
    const prevName = localStorage.getItem('mx_traffic_name') || '';
    if (playerNameInput) playerNameInput.value = prevName;
    showEndModal();
  }

  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', () => hideEndModal());
  }

  if (scoreForm) {
    scoreForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (playerNameInput?.value || '').trim();
      if (!name) return;
      localStorage.setItem('mx_traffic_name', name);
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            score_mb: state.totalDataMB,
            mode: state.mode,
            ts: new Date().toISOString(),
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          console.warn('Score save failed', t);
        }
      } catch (err) {
        console.warn('Score save error', err);
      }
      hideEndModal();
      loadLeaderboard();
    });
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      renderLeaderboard(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      // ignore
    }
  }

  function renderLeaderboard(items) {
    if (!leaderboardList) return;
    leaderboardList.innerHTML = '';
    for (const item of items) {
      const li = document.createElement('li');
      const score = formatDataMB(Number(item.score_mb || 0));
      const name = (item.name || '???').toString().slice(0, 40);
      const mode = item.mode === 'endless' ? '∞' : '120с';
      li.textContent = `${name} — ${score} (${mode})`;
      leaderboardList.appendChild(li);
    }
  }

  function degToRad(d) { return d * Math.PI / 180; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }

  function formatDataMB(mb) {
    if (mb >= 1024) {
      const gb = mb / 1024;
      return gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(2)} GB`;
    }
    return mb >= 100 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(2)} MB`;
  }

  function formatRateMBps(r) {
    if (r >= 1024) return `${(r/1024).toFixed(2)} GB/s`;
    return `${r.toFixed(2)} MB/s`;
  }

  function updateHUD() {
    const totalAngle = state.baseAngleDeg + state.fineAngleDeg;
    baseAngleEl.textContent = `${state.baseAngleDeg.toFixed(1)}°`;
    fineAngleEl.textContent = `${state.fineAngleDeg.toFixed(1)}°`;
    totalAngleEl.textContent = `${totalAngle.toFixed(1)}°`;
    rateEl.textContent = formatRateMBps(state.currentRateMBps);
    downloadedEl.textContent = formatDataMB(state.totalDataMB);

    // Time
    if (state.mode === 'timed') {
      const remaining = Math.max(0, state.durationSec - state.elapsed);
      const m = Math.floor(remaining / 60);
      const s = Math.floor(remaining % 60).toString().padStart(2, '0');
      timeEl.textContent = `${m}:${s}`;
    } else {
      const m = Math.floor(state.elapsed / 60);
      const s = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
      timeEl.textContent = `${m}:${s}`;
    }
  }

  function update(dt) {
    if (!state.running) { state.currentRateMBps = 0; return; }

    // Timer
    state.elapsed += dt;
    if (state.mode === 'timed' && state.elapsed >= state.durationSec) {
      onGameEnd();
      return;
    }

    updateSpawn(dt);

    // Move satellites
    const w = canvas.width / devicePixelRatio;
    for (const sat of state.satellites) {
      sat.x += sat.vx * dt * state.speedMultiplier;
    }
    // Cull or wrap satellites
    state.satellites = state.satellites.filter(s => s.x > -80 && s.x < w + 80);

    // Beam-target interaction
    const totalAngle = state.baseAngleDeg + state.fineAngleDeg;
    const ang = degToRad(totalAngle);
    const v = { x: Math.sin(ang), y: -Math.cos(ang) }; // 0° -> up

    // Compute best intersect & rate
    let bestT = Infinity;
    let bestSat = null;
    let bestAlign = 0;

    for (const sat of state.satellites) {
      const P0 = state.dish;
      const C = { x: sat.x, y: sat.y };
      const r = sat.radius;

      const dx = C.x - P0.x;
      const dy = C.y - P0.y;
      const t = dx * v.x + dy * v.y; // projection length along beam
      if (t <= 0) continue; // behind dish

      const qx = P0.x + v.x * t;
      const qy = P0.y + v.y * t;
      const ddx = C.x - qx;
      const ddy = C.y - qy;
      const dist2 = ddx * ddx + ddy * ddy;
      if (dist2 <= r * r) {
        // Intersects ray
        // Alignment factor based on angle between beam and vector to satellite
        const mag = Math.hypot(dx, dy);
        if (mag > 0) {
          const ux = dx / mag, uy = dy / mag;
          const dot = clamp(ux * v.x + uy * v.y, -1, 1);
          const angleErr = Math.acos(dot); // 0 is perfect alignment
          const align = Math.max(0, Math.cos(angleErr)); // 1 at perfect, 0 at 90°

          // Choose nearest intersect for drawing
          if (t < bestT) {
            bestT = t; bestSat = sat; bestAlign = align;
          }
        }
      }
    }

    // Data rate model (phased array): base max rate depends on distance and array gain.
    // Baseline: 150 MB/s at perfect alignment scaled by 1/sqrt(distance).
    // Array gain: simulate 10-element array combining with stronger gain and tighter main lobe.
    let rate = 0;
    if (bestSat) {
      const dx = bestSat.x - state.dish.x;
      const dy = bestSat.y - state.dish.y;
      const dist = Math.hypot(dx, dy);
      const distanceFactor = 1 / Math.sqrt(1 + dist / 400); // ~0.5..1 range typically
      const arrayGain = 3.0; // effective gain for 10 elements (tunable)
      const maxRate = 150 * arrayGain * distanceFactor; // MB/s
      const tightness = 2.5; // sharpen alignment curve to emulate narrower beam
      const alignTight = Math.pow(Math.max(0, bestAlign), tightness);
      rate = maxRate * alignTight;

      // Accumulate data
      state.totalDataMB += rate * dt;
    }
    state.currentRateMBps = rate;
  }

  function draw() {
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;

    // Clear background (transparent; body handles background). Draw faint horizon glow
    ctx.clearRect(0, 0, w, h);

    // Draw ground line
    const groundY = h - 40;
    const grd = ctx.createLinearGradient(0, groundY - 60, 0, groundY + 20);
    grd.addColorStop(0, 'rgba(0, 80, 160, 0.05)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, groundY - 60, w, 80);

    // Draw satellites
    for (const sat of state.satellites) {
      drawSatellite(sat);
    }

    // Draw dish and beam
    drawDishAndBeam();

    // HUD overlay: high score
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = 'rgba(180, 220, 255, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(`Рекорд: ${formatDataMB(state.hiScoreMB)}`, w - 12, 18);
  }

  function drawSatellite(sat) {
    ctx.save();
    ctx.translate(sat.x, sat.y);

    // Body
    ctx.fillStyle = '#9ad1ff';
    ctx.strokeStyle = 'rgba(150, 200, 255, 0.7)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, sat.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Panels
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(-sat.radius - 14, -4, 12, 8);
    ctx.fillRect(sat.radius + 2, -4, 12, 8);

    ctx.restore();
  }

  function drawDishAndBeam() {
    const totalAngle = state.baseAngleDeg + state.fineAngleDeg;
    const ang = degToRad(totalAngle);
    const v = { x: Math.sin(ang), y: -Math.cos(ang) }; // unit

    const x0 = state.dish.x;
    const y0 = state.dish.y;

    // Compute beam end for drawing: either hit satellite or max length or canvas bounds
    let x1 = x0 + v.x * state.beamLength;
    let y1 = y0 + v.y * state.beamLength;

    // Clip to canvas bounds (simple)
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;

    // Ray-box intersection (0,0,w,h)
    const tVals = [];
    if (v.x !== 0) {
      tVals.push((0 - x0) / v.x);
      tVals.push((w - x0) / v.x);
    }
    if (v.y !== 0) {
      tVals.push((0 - y0) / v.y);
      tVals.push((h - y0) / v.y);
    }
    const tCandidates = tVals.filter(t => t > 0);
    if (tCandidates.length) {
      const tMin = Math.min(...tCandidates);
      x1 = x0 + v.x * tMin;
      y1 = y0 + v.y * tMin;
    }

    // If intersecting a satellite, shorten to the first hit for a nice effect
    let bestT = Infinity; let hitPoint = null;
    for (const sat of state.satellites) {
      const t = rayCircleFirstHit(x0, y0, v.x, v.y, sat.x, sat.y, sat.radius);
      if (t && t > 0 && t < bestT) { bestT = t; hitPoint = { x: x0 + v.x * t, y: y0 + v.y * t }; }
    }
    if (hitPoint) { x1 = hitPoint.x; y1 = hitPoint.y; }

    // Dish base (draw first)
    ctx.save();
    ctx.translate(x0, y0);

    // Mast
    ctx.strokeStyle = 'rgba(150,200,255,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 28);
    ctx.stroke();

    // Parabolic dish look with 10 horizontal antenna elements inside
    ctx.rotate(degToRad(state.baseAngleDeg));

    // Dish bowl (wider)
    ctx.fillStyle = '#0e2a4d';
    ctx.strokeStyle = 'rgba(120,180,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // ellipse(centerX, centerY, radiusX, radiusY)
    ctx.ellipse(0, -8, 34, 18, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    ctx.stroke();

    // Inner horizontal antenna strip: 10 elements across the bowl
    const dishElemCount = 10;
    const aW = 5, aH = 4, aGap = 2;
    const stripW = dishElemCount * aW + (dishElemCount - 1) * aGap; // total width
    let sx = -stripW / 2;
    const sy = -8 - aH / 2; // centered vertically in the bowl

    // Collect world positions of element centers for beam starts
    const subBeamStarts = [];
    const rot = degToRad(state.baseAngleDeg);
    const cosR = Math.cos(rot), sinR = Math.sin(rot);

    for (let i = 0; i < dishElemCount; i++) {
      const rx = sx + i * (aW + aGap);
      const ry = sy;
      ctx.fillStyle = '#0f2342';
      ctx.strokeStyle = 'rgba(120,180,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, aW, aH, 1.5);
      ctx.fill();
      ctx.stroke();

      // subtle highlight
      ctx.strokeStyle = 'rgba(150,200,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(rx + 1, ry + 1);
      ctx.lineTo(rx + aW - 1, ry + 1);
      ctx.stroke();

      // compute world position of element center
      const lcx = rx + aW / 2;
      const lcy = ry + aH / 2;
      const wx = x0 + lcx * cosR - lcy * sinR;
      const wy = y0 + lcx * sinR + lcy * cosR;
      subBeamStarts.push({ x: wx, y: wy });
    }

    ctx.restore();

    // Now draw animated semicircular wavefronts from each element toward the main beam
    const arrayGain = 3.0; // keep in sync with update() model
    const power = clamp(state.currentRateMBps / (150 * arrayGain), 0, 1);
    if (power > 0.01) {
      const theta = Math.atan2(v.y, v.x); // propagation angle
      const spacing = 14;      // distance between arcs (crest-to-crest)
      const speed = 80;        // px/s propagation of wavefronts
      const phase = (state.elapsed * speed) % spacing;

      for (const s of subBeamStarts) {
        // Length to endpoint along beam direction from this element
        const L = Math.max(0, (x1 - s.x) * v.x + (y1 - s.y) * v.y);
        // Step radii so wavefronts reach the end (satellite or edge)
        for (let r = phase; r <= L; r += spacing) {
          if (r <= 6) continue;
          const alpha = (0.10 + 0.26 * power) * (1 - r / (L + 30));
          if (alpha <= 0.01) continue;
          ctx.strokeStyle = `rgba(120,190,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.8 + 0.9 * power;
          ctx.beginPath();
          // forward-facing semicircle centered at s with radius r
          ctx.arc(s.x, s.y, r, theta - Math.PI / 2, theta + Math.PI / 2);
          ctx.stroke();
        }
      }
    }

    // And the combined main beam on top
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, `rgba(80,180,255,${0.25 + 0.35*power})`);
    grad.addColorStop(1, `rgba(0,160,255,${0.05 + 0.25*power})`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 3 + 2 * power;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Returns t for first intersection of ray (x0,y0)+t*(vx,vy) with circle
  function rayCircleFirstHit(x0, y0, vx, vy, cx, cy, r) {
    const dx = x0 - cx;
    const dy = y0 - cy;
    const a = vx*vx + vy*vy; // =1
    const b = 2 * (vx*dx + vy*dy);
    const c = dx*dx + dy*dy - r*r;
    const disc = b*b - 4*a*c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2*a);
    const t2 = (-b + s) / (2*a);
    if (t1 > 0) return t1;
    if (t2 > 0) return t2;
    return null;
  }

  // Main loop
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // cap dt
    last = now;

    layoutPositions();
    update(dt);
    updateHUD();
    draw();

    requestAnimationFrame(tick);
  }
  // Initial data fetch and start loop
  loadLeaderboard();
  requestAnimationFrame(tick);
})();
