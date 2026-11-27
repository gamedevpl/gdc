// Entry #39: Sound Propagation & Corridor Acoustics — Playable 3D Stealth Castle!
// Compares true weighted-Dijkstra Corridor Acoustics (blocked by thick masonry walls, dampened -45% dB
// by plush red carpet, and sealable by a Heavy Door) vs Naive Euclidean Radius that alerts guards through 2m stone!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const COLS = 13;
const ROWS = 10;
const CELL = 1.0;
const HALF_W = (COLS * CELL) * 0.5;
const HALF_H = (ROWS * CELL) * 0.5;

const BASE_SOUND_DIST = 10.2;    // Loudness on bare stone (meters)
const CARPET_DAMP = 0.55;        // -45% dB when emitted on plush carpet!
const WAVE_SPEED = 7.4;          // Visual propagation speed (m/s)
const PULSE_LIFETIME = 2.65;     // Total ripple duration (s)

// Static masonry walls dividing the 13x10 castle into Left Room, Right-Top Room (Guard A) & Right-Bottom Corridor (Guard B)
const STATIC_WALLS = new Set([
  // Thick central wall at c=6 (leaving Heavy Doorway open at r=7,8!)
  "6,0", "6,1", "6,2", "6,3", "6,4", "6,5", "6,6", "6,9",
  // Horizontal divider between Right-Top Room & Right-Bottom Corridor (open winding hallway at c=11,12)
  "7,5", "8,5", "9,5", "10,5",
]);

// Heavy Door occupies c=6, r=7..8
const DOOR_CELLS = [
  [6, 7],
  [6, 8],
];

// Plush red Carpet Strip in Left Room (dampens footsteps & acoustic wave!)
const CARPET_SET = new Set();
for (let c = 1; c <= 4; c++) {
  for (let r = 3; r <= 6; r++) CARPET_SET.add(`${c},${r}`);
}

function cellKey(c, r) { return `${c},${r}`; }
function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
function cellToWorld(c, r) {
  return { x: -HALF_W + (c + 0.5) * CELL, z: -HALF_H + (r + 0.5) * CELL };
}
function worldToCell(x, z) {
  return {
    c: clamp(Math.floor((x + HALF_W) / CELL), 0, COLS - 1),
    r: clamp(Math.floor((z + HALF_H) / CELL), 0, ROWS - 1),
  };
}
function isDoorCell(c, r) { return c === 6 && (r === 7 || r === 8); }
function isCarpetCell(c, r) { return CARPET_SET.has(cellKey(c, r)); }

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.02, 0.06, 0.11],
    skyMid: [0.05, 0.12, 0.19],
    skyBot: [0.10, 0.18, 0.24],
    lightDir: [0.34, 0.86, 0.36],
    ambLow: [0.10, 0.15, 0.22],
    ambHigh: [0.32, 0.44, 0.56],
    orthoHalf: 11.8,
    maxWorldVerts: 36000,
    maxFxVerts: 22000,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  const defaultCam = { yaw: 0.0, pitch: 0.84, dist: 18.2, targetX: 0.0, targetY: 0.2, targetZ: 0.3, fovDeg: 40 };

  let time = 0;
  let acousticsOn = true;   // ON: Real Corridor Dijkstra Acoustics | OFF: Naive Euclidean Radius (leaks through stone!)
  let doorOpen = true;      // [V] Heavy Oak/Iron Door open or sealed
  let autoDemo = true;
  let userInteracted = false;
  let pulseTimer = 0;
  let pulseCount = 0;
  let lastPulseRadius = BASE_SOUND_DIST;

  const thief = { x: -2.0, z: -2.5, yaw: Math.PI * 0.5, walkPhase: 0, speedNorm: 0 };
  const guardA = { c: 8, r: 2, x: 2.0, z: -2.5, yaw: -Math.PI * 0.5, alertTimer: 0, heard: false };
  const guardB = { c: 9, r: 7, x: 3.0, z: 2.5, yaw: -Math.PI * 0.5, alertTimer: 0, heard: false };

  let pulses = [];
  let bannerText = "";
  let bannerColor = "#22d3ee";
  let bannerTimer = 0;
  function setBanner(t, c = "#22d3ee", dur = 2.1) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function isWallCell(c, r) {
    if (!inBounds(c, r)) return true;
    if (STATIC_WALLS.has(cellKey(c, r))) return true;
    if (!doorOpen && isDoorCell(c, r)) return true;
    return false;
  }

  // Real 8-directional weighted Dijkstra sound propagation through open rooms & doorways (no diagonal corner leaks!)
  function computeAcousticField(sc, sr, maxDist) {
    const dist = new Float32Array(COLS * ROWS);
    dist.fill(Infinity);
    if (isWallCell(sc, sr)) return dist;

    const visited = new Uint8Array(COLS * ROWS);
    const startIdx = sr * COLS + sc;
    dist[startIdx] = 0;
    const heap = [{ c: sc, r: sr, d: 0 }];

    const dirs = [
      [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];

    while (heap.length > 0) {
      let bestI = 0;
      for (let i = 1; i < heap.length; i++) {
        if (heap[i].d < heap[bestI].d) bestI = i;
      }
      const cur = heap.splice(bestI, 1)[0];
      const idx = cur.r * COLS + cur.c;
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (cur.d > maxDist) continue;

      for (const [dc, dr, stepCost] of dirs) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (isWallCell(nc, nr)) continue;
        // Sound cannot leak diagonally through solid stone corners
        if (dc !== 0 && dr !== 0 && (isWallCell(cur.c + dc, cur.r) || isWallCell(cur.c, cur.r + dr))) continue;
        // Plush carpet absorbs a bit of passing acoustic energy too!
        const surfMult = isCarpetCell(nc, nr) ? 1.25 : 1.0;
        const nd = cur.d + stepCost * surfMult;
        const nIdx = nr * COLS + nc;
        if (nd <= maxDist && nd < dist[nIdx]) {
          dist[nIdx] = nd;
          heap.push({ c: nc, r: nr, d: nd });
        }
      }
    }
    return dist;
  }

  function emitPulse(wx, wz, { silent = false, initialAge = 0 } = {}) {
    const cell = worldToCell(wx, wz);
    let sc = cell.c, sr = cell.r;
    if (isWallCell(sc, sr)) {
      const tc = worldToCell(thief.x, thief.z);
      sc = tc.c; sr = tc.r;
    }
    const origin = cellToWorld(sc, sr);
    const onCarpet = isCarpetCell(sc, sr);
    const maxDist = onCarpet ? BASE_SOUND_DIST * CARPET_DAMP : BASE_SOUND_DIST;
    const distMap = computeAcousticField(sc, sr, maxDist);

    const p = {
      c: sc, r: sr,
      x: origin.x, z: origin.z,
      onCarpet,
      maxDist,
      age: initialAge,
      distMap,
      alertedA: false,
      alertedB: false,
      acousticsSnapshot: acousticsOn,
    };
    pulses.push(p);
    if (pulses.length > 4) pulses.shift();
    pulseCount++;
    lastPulseRadius = maxDist;

    if (!silent) {
      if (onCarpet) audio?.waterRipple?.();
      else audio?.coinClink?.();
    }
    return p;
  }

  function rebuildWorldMesh() {
    const wBuf = [];
    // Foundation plinth
    pushBox(wBuf, -HALF_W - 0.55, HALF_W + 0.55, -0.58, -0.08, -HALF_H - 0.55, HALF_H + 0.55, [0.09, 0.13, 0.19], 1);

    // Outer castle perimeter parapet walls
    const rimH = 1.15;
    pushBox(wBuf, -HALF_W - 0.48, HALF_W + 0.48, -0.08, rimH, -HALF_H - 0.48, -HALF_H, [0.24, 0.30, 0.38], 1);
    pushBox(wBuf, -HALF_W - 0.48, HALF_W + 0.48, -0.08, rimH, HALF_H, HALF_H + 0.48, [0.24, 0.30, 0.38], 1);
    pushBox(wBuf, -HALF_W - 0.48, -HALF_W, -0.08, rimH, -HALF_H, HALF_H, [0.24, 0.30, 0.38], 1);
    pushBox(wBuf, HALF_W, HALF_W + 0.48, -0.08, rimH, -HALF_H, HALF_H, [0.24, 0.30, 0.38], 1);

    // Floor tiles + interior walls + carpet + heavy door
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x0 = -HALF_W + c * CELL, x1 = x0 + CELL;
        const z0 = -HALF_H + r * CELL, z1 = z0 + CELL;
        const carpet = isCarpetCell(c, r);
        const isWall = STATIC_WALLS.has(cellKey(c, r));
        const isDoor = isDoorCell(c, r);

        // Stone tile floor (subtle room tinting so Left Room, Guard A Room & Guard B Hall read clearly)
        const floorCol = c < 6
          ? [0.24, 0.30, 0.38]
          : (r < 5 ? [0.28, 0.27, 0.36] : [0.22, 0.31, 0.36]);
        pushBox(wBuf, x0 + 0.01, x1 - 0.01, -0.08, 0.0, z0 + 0.01, z1 - 0.01, floorCol, 0);

        // Plush Crimson Carpet Strip with warm gold fringe
        if (carpet) {
          pushBox(wBuf, x0 + 0.02, x1 - 0.02, 0.0, 0.045, z0 + 0.02, z1 - 0.02, [0.68, 0.14, 0.22], 4);
          if (c === 1) pushBox(wBuf, x0 + 0.02, x0 + 0.09, 0.045, 0.055, z0 + 0.02, z1 - 0.02, [0.88, 0.68, 0.24], 4);
          if (c === 4) pushBox(wBuf, x1 - 0.09, x1 - 0.02, 0.045, 0.055, z0 + 0.02, z1 - 0.02, [0.88, 0.68, 0.24], 4);
        }

        // Thick Stone Masonry Walls (2m tall, imposing acoustic barrier!)
        if (isWall) {
          pushBox(wBuf, x0 + 0.02, x1 - 0.02, 0.0, 1.95, z0 + 0.02, z1 - 0.02, [0.46, 0.50, 0.56], 1);
          pushBox(wBuf, x0 - 0.02, x1 + 0.02, 1.95, 2.12, z0 - 0.02, z1 + 0.02, [0.34, 0.39, 0.46], 1);
        }

        // Doorway threshold chevron
        if (isDoor) {
          pushBox(wBuf, x0 + 0.12, x1 - 0.12, 0.0, 0.03, z0 + 0.02, z1 - 0.02, [0.9, 0.65, 0.12], 5);
        }
      }
    }

    // Heavy Acoustic Oak-and-Iron Door at c=6, r=7..8 (x = -0.5..0.5, z = 2.0..4.0)
    if (!doorOpen) {
      // Sealed heavy oak & iron acoustic bulkhead!
      pushBox(wBuf, -0.24, 0.24, 0.02, 1.92, 2.02, 3.98, [0.46, 0.26, 0.14], 4);
      pushBox(wBuf, -0.28, 0.28, 0.45, 0.62, 2.0, 4.0, [0.22, 0.26, 0.34], 1);
      pushBox(wBuf, -0.28, 0.28, 1.32, 1.49, 2.0, 4.0, [0.22, 0.26, 0.34], 1);
      // Glowing acoustic seal strip along top
      pushBox(wBuf, -0.29, 0.29, 1.92, 2.06, 2.0, 4.0, [0.16, 0.92, 0.66], 2);
    } else {
      // Swung open cleanly into the corridor alcove so sound pours straight through!
      pushBox(wBuf, 0.22, 1.65, 0.02, 1.85, 3.74, 3.98, [0.46, 0.26, 0.14], 4);
      pushBox(wBuf, 0.20, 1.68, 1.85, 1.95, 3.72, 4.00, [0.96, 0.68, 0.18], 2);
    }

    // Warm wall sconce torches on castle wall pillars for depth & silhouette!
    const torches = [
      [-0.56, 1.55, -2.5], [0.56, 1.55, -2.5],
      [-0.56, 1.55, 1.65], [0.56, 1.55, 1.65],
      [4.5, 1.55, 0.5], [-6.45, 1.0, 0.0], [6.45, 1.0, 0.0],
    ];
    for (const [tx, ty, tz] of torches) {
      pushBox(wBuf, tx - 0.10, tx + 0.10, ty - 0.10, ty + 0.14, tz - 0.10, tz + 0.10, [1.0, 0.68, 0.22], 2);
    }

    studio.setWorldData(wBuf);
  }

  function isPassable(x, z) {
    const pad = 0.28;
    for (const ox of [-pad, 0, pad]) {
      for (const oz of [-pad, 0, pad]) {
        const cell = worldToCell(x + ox, z + oz);
        if (isWallCell(cell.c, cell.r)) return false;
      }
    }
    return true;
  }

  function moveThief(nx, nz) {
    const cx = clamp(nx, -HALF_W + 0.45, HALF_W - 0.45);
    const cz = clamp(nz, -HALF_H + 0.45, HALF_H - 0.45);
    if (isPassable(cx, cz)) { thief.x = cx; thief.z = cz; }
    else if (isPassable(cx, thief.z)) { thief.x = cx; }
    else if (isPassable(thief.x, cz)) { thief.z = cz; }
  }

  function reset() {
    time = 0;
    acousticsOn = true;
    doorOpen = true;
    autoDemo = true;
    pulseTimer = 0.0;
    pulseCount = 0;
    pulses = [];
    thief.x = -2.0; thief.z = -2.5; thief.yaw = Math.PI * 0.5; thief.walkPhase = 0; thief.speedNorm = 0;
    guardA.alertTimer = 0; guardA.heard = false;
    guardB.alertTimer = 0; guardB.heard = false;
    bannerTimer = 0;
    rebuildWorldMesh();
    // Seed an active sound wavefront immediately so Frame 1 already shows glowing corridor ripples!
    emitPulse(thief.x, thief.z, { silent: true, initialAge: 0.62 });
  }
  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // 1. Move Thief via WASD/Arrows or gentle auto-demo patrol between Stone & Carpet!
    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;

    if (mx !== 0 || mz !== 0) {
      autoDemo = false; userInteracted = true;
      const l = Math.hypot(mx, mz);
      moveThief(thief.x + (mx / l) * 3.6 * dt, thief.z + (mz / l) * 3.6 * dt);
      thief.yaw = Math.atan2(mx, mz);
      thief.walkPhase += dt * 11.5;
      thief.speedNorm = 1.0;
    } else if (autoDemo) {
      // Smoothly pace near the central wall (stone tile (4,2) <-> carpet edge (3,4)) so both wall-blocking & corridor waves shine!
      const phase = (time % 11.2);
      const gx = phase < 5.6 ? -2.0 : -3.0;
      const gz = phase < 5.6 ? -2.5 : 0.5;
      const dx = gx - thief.x, dz = gz - thief.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.08) {
        moveThief(thief.x + (dx / d) * Math.min(d, 2.2 * dt), thief.z + (dz / d) * Math.min(d, 2.2 * dt));
        thief.yaw = Math.atan2(dx, dz);
        thief.walkPhase += dt * 9.0;
        thief.speedNorm = 0.85;
      } else {
        thief.speedNorm = Math.max(0, thief.speedNorm - dt * 5);
        thief.yaw = Math.PI * 0.5;
      }
    } else {
      thief.speedNorm = Math.max(0, thief.speedNorm - dt * 6);
    }

    // 2. Auto-emit clean sound pulse every 2.8s so wavefronts are always alive!
    pulseTimer += dt;
    if (pulseTimer >= 2.8) {
      pulseTimer = 0;
      emitPulse(thief.x, thief.z, { silent: !userInteracted });
    }

    // 3. Advance active sound wavefronts & test Guard A / Guard B hearing!
    if (guardA.alertTimer > 0) guardA.alertTimer = Math.max(0, guardA.alertTimer - dt);
    if (guardB.alertTimer > 0) guardB.alertTimer = Math.max(0, guardB.alertTimer - dt);

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.age += dt;
      if (p.age > PULSE_LIFETIME) {
        pulses.splice(i, 1);
        continue;
      }
      const curWave = Math.min(p.maxDist, p.age * WAVE_SPEED);

      // Check Guard A & Guard B hearing under current mode!
      const checkGuard = (g, flagKey) => {
        if (p[flagKey]) return;
        const d = acousticsOn
          ? p.distMap[g.r * COLS + g.c]
          : Math.hypot(g.x - p.x, g.z - p.z);
        if (d <= p.maxDist && curWave >= d) {
          p[flagKey] = true;
          g.alertTimer = 2.1;
          g.yaw = Math.atan2(p.x - g.x, p.z - g.z);
          if (userInteracted) audio?.alertBuzzer?.();
        }
      };
      checkGuard(guardA, "alertedA");
      checkGuard(guardB, "alertedB");
    }

    guardA.heard = guardA.alertTimer > 0;
    guardB.heard = guardB.alertTimer > 0;
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const tc = worldToCell(thief.x, thief.z);
    const onCarpet = isCarpetCell(tc.c, tc.r);

    if (viewProj) {
      // Thief status pill
      const tp = projectToScreen(viewProj, thief.x, 1.55, thief.z, cssW, cssH);
      if (tp) {
        const txt = onCarpet
          ? (isPl ? "ZŁODZIEJ · DYWAN (-45% dB ✓)" : "THIEF · CARPET (-45% dB ✓)")
          : (isPl ? "ZŁODZIEJ · KAMIEŃ (100% dB)" : "THIEF · STONE FLOOR (100% dB)");
        drawWorldPill(ctx, tp.x, tp.y, txt, onCarpet ? "#f472b6" : "#38bdf8", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Guard A (directly behind thick solid stone wall!)
      const gap = projectToScreen(viewProj, guardA.x, 1.65, guardA.z, cssW, cssH);
      if (gap) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && gap.y < 235) ? Math.min(gap.x, cssW - 375) : gap.x;
        const txtA = guardA.heard
          ? (isPl ? "STRAŻNIK A: SŁYSZY PRZEZ MUR! ✗" : "GUARD A: HEARD THROUGH SOLID WALL! ✗")
          : (isPl ? "STRAŻNIK A: BEZPIECZNY · MUR BLOKUJE ✓" : "SAFE · WALL BLOCKS SOUND ✓");
        drawWorldPill(ctx, safeX, gap.y, txtA, guardA.heard ? "#f87171" : "#4ade80", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Guard B (down corridor past Heavy Door!)
      const gbp = projectToScreen(viewProj, guardB.x, 1.65, guardB.z, cssW, cssH);
      if (gbp) {
        const txtB = guardB.heard
          ? (acousticsOn
            ? (isPl ? "STRAŻNIK B: SŁYSZY KORYTARZEM!" : "GUARD B: HEARD VIA CORRIDOR!")
            : (isPl ? "STRAŻNIK B: SŁYSZY PRZEZ ŚCIANY! ✗" : "GUARD B: HEARD THROUGH WALLS! ✗"))
          : (!doorOpen && acousticsOn
            ? (isPl ? "STRAŻNIK B: DRZWI TŁUMIĄ DŹWIĘK ✓" : "GUARD B: DOOR SEALS SOUND ✓")
            : (isPl ? "STRAŻNIK B: POZA ZASIĘGIEM ✓" : "GUARD B: OUT OF EARSHOT ✓"));
        drawWorldPill(ctx, gbp.x, gbp.y, txtB, guardB.heard ? "#fb923c" : "#34d399", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Heavy Door callout pill
      const dp = projectToScreen(viewProj, 0.0, 2.25, 3.0, cssW, cssH);
      if (dp) {
        const dTxt = doorOpen
          ? (isPl ? "DRZWI OTWARTE [V]" : "HEAVY DOOR: OPEN [V]")
          : (isPl ? "DRZWI ZAMKNIĘTE [V] ✓" : "HEAVY DOOR: SEALED [V] ✓");
        drawWorldPill(ctx, dp.x, dp.y, dTxt, doorOpen ? "#facc15" : "#2dd4bf", cssW, cssH, isCompact ? 8.5 : 9.2);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${acousticsOn ? "ACOUSTICS ON" : "NAIVE RADIUS"} · ${doorOpen ? "Door Open" : "Door Shut"} · ${guardA.heard ? "A:ALERT!" : "A:Safe"}`,
          acousticsOn ? "#22d3ee" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 330, panelH = 162, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 16, 28, 0.90)";
        ctx.strokeStyle = acousticsOn ? "rgba(34, 211, 238, 0.84)" : "rgba(248, 113, 113, 0.86)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = acousticsOn ? "#22d3ee" : "#f87171";
        ctx.fillText(
          acousticsOn
            ? (isPl ? "AKUSTYKA KORYTARZOWA · FALA DIJKSTRY" : "CORRIDOR ACOUSTICS · DIJKSTRA WAVE")
            : (isPl ? "NAIWNY PROMIEŃ · IGNORUJE MURY! ✗" : "NAIVE RADIUS SPHERE · IGNORES WALLS! ✗"),
          px + 12, py + 21, bw
        );

        const volPct = onCarpet ? 55 : 100;
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = onCarpet ? "#ec4899" : (acousticsOn ? "#06b6d4" : "#ef4444");
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw * (volPct / 100), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          isPl
            ? `GŁOŚNOŚĆ: ${volPct}% (${onCarpet ? "DYWAN -45% dB" : "KAMIEŃ 10.2m"})`
            : `SOUND REACH: ${lastPulseRadius.toFixed(1)}m (${onCarpet ? "CARPET -45% dB" : "STONE 100%"})`,
          px + 18, py + 45.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = guardA.heard ? "#fca5a5" : "#86efac";
        ctx.fillText(
          isPl
            ? `Strażnik A (za murem 4m): ${guardA.heard ? "ALARM! ✗" : "BEZPIECZNY ✓"}`
            : `Guard A (4m behind stone): ${guardA.heard ? "ALERTED! ✗" : "BLOCKED ✓"}`,
          px + 12, py + 76, bw
        );
        ctx.fillStyle = guardB.heard ? "#fdba74" : "#86efac";
        ctx.fillText(
          isPl
            ? `Strażnik B (korytarz): ${guardB.heard ? "USŁYSZAŁ!" : (doorOpen ? "CISZA ✓" : "DRZWI BLOKUJĄ ✓")}`
            : `Guard B (corridor): ${guardB.heard ? "HEARD PULSE!" : (doorOpen ? "QUIET ✓" : "SEALED BY DOOR ✓")}`,
          px + 12, py + 98, bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "WASD = Ruch · Klik/Spacja = Impuls · V = Drzwi" : "WASD = Move · Click/Space = Ping · V = Door",
          px + 12, py + 124, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "T = Akustyka Korytarzowa / Naiwny Promień" : "T = Corridor Acoustics / Naive Radius Sphere",
          px + 12, py + 146, bw
        );
        ctx.restore();
      }
    }
    drawBanner(ctx, bannerText, bannerColor, bannerTimer, cssW);
  }

  return {
    defaultCam,
    reset,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        {
          id: "toggle-acoustics",
          label: acousticsOn
            ? (pl ? "Akustyka: WŁ [T]" : "Acoustics: ON [T]")
            : (pl ? "Naiwny Promień [T]" : "Naive Radius [T]"),
          pressed: acousticsOn,
        },
        {
          id: "toggle-door",
          label: doorOpen
            ? (pl ? "Zamknij Drzwi [V]" : "Close Door [V]")
            : (pl ? "Otwórz Drzwi [V]" : "Open Door [V]"),
          pressed: !doorOpen,
        },
        {
          id: "ping",
          label: pl ? "Impuls Dźwięku [Spacja]" : "Sound Pulse [Space]",
          pressed: false,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-acoustics") {
        acousticsOn = !acousticsOn;
        pulses = [];
        guardA.alertTimer = 0; guardB.alertTimer = 0;
        pulseTimer = 0;
        audio?.ruleSwitch?.(acousticsOn);
        emitPulse(thief.x, thief.z, { silent: true, initialAge: 0.25 });
        setBanner(
          acousticsOn
            ? "CORRIDOR ACOUSTICS ON: STONE WALL BLOCKS GUARD A · WAVE TRAVELS OPEN HALLS!"
            : "NAIVE RADIUS OFF: SOUND SPHERE IGNORES 2m STONE — GUARD A INSTANTLY ALERTS!",
          acousticsOn ? "#22d3ee" : "#f87171",
          2.2
        );
      } else if (id === "toggle-door") {
        doorOpen = !doorOpen;
        rebuildWorldMesh();
        pulses = [];
        guardA.alertTimer = 0; guardB.alertTimer = 0;
        pulseTimer = 0;
        audio?.wallClick?.(!doorOpen);
        emitPulse(thief.x, thief.z, { silent: true, initialAge: 0.22 });
        setBanner(
          doorOpen
            ? "HEAVY DOOR OPENED — SOUND WAVE NOW FLOWS INTO CORRIDOR TOWARD GUARD B!"
            : "HEAVY DOOR SEALED — ACOUSTIC WAVE COMPLETELY CONTAINED INSIDE LEFT ROOM!",
          doorOpen ? "#facc15" : "#2dd4bf",
          2.1
        );
      } else if (id === "ping") {
        pulseTimer = 0;
        emitPulse(thief.x, thief.z, { silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-acoustics");
      else if (code === "KeyV") this.onAction("toggle-door");
      else if (code === "Space") this.onAction("ping");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        pulseTimer = 0;
        emitPulse(world[0], world[2], { silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const bobA = guardA.heard ? Math.abs(Math.sin(time * 12)) * 0.16 : 0;
      const bobB = guardB.heard ? Math.abs(Math.sin(time * 12)) * 0.16 : 0;
      const meshes = [
        // Stealth Thief
        {
          gpu: runnerGpu, x: thief.x, y: 0.04, z: thief.z, yaw: thief.yaw,
          animA: thief.walkPhase, animB: thief.speedNorm, scale: 0.88, animMode: 2,
          tint: [0.16, 0.88, 0.96, 0.45],
        },
        // Guard A (behind thick central stone wall)
        {
          gpu: runnerGpu, x: guardA.x, y: bobA, z: guardA.z, yaw: guardA.yaw,
          animA: guardA.heard ? time * 10 : 0, animB: guardA.heard ? 0.6 : 0, scale: 0.92, animMode: 2,
          tint: guardA.heard ? [1.0, 0.18, 0.24, 0.82] : [0.86, 0.72, 0.34, 0.35],
        },
        // Guard B (down right-bottom corridor past Heavy Door)
        {
          gpu: runnerGpu, x: guardB.x, y: bobB, z: guardB.z, yaw: guardB.yaw,
          animA: guardB.heard ? time * 10 : 0, animB: guardB.heard ? 0.6 : 0, scale: 0.92, animMode: 2,
          tint: guardB.heard ? [1.0, 0.42, 0.16, 0.82] : [0.86, 0.72, 0.34, 0.35],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Guard listening rings
          fx.ringXZ(guardA.x, 0.06, guardA.z, 0.62 + (guardA.heard ? 0.15 * Math.sin(time * 14) : 0),
            guardA.heard ? [1.0, 0.22, 0.28, 0.92] : [0.30, 0.88, 0.60, 0.48]);
          fx.ringXZ(guardB.x, 0.06, guardB.z, 0.62 + (guardB.heard ? 0.15 * Math.sin(time * 14) : 0),
            guardB.heard ? [1.0, 0.48, 0.16, 0.92] : [0.30, 0.88, 0.60, 0.48]);

          // Render live Sound Propagation Waves!
          for (const p of pulses) {
            const fade = clamp(1.0 - Math.max(0, p.age - 1.55) / (PULSE_LIFETIME - 1.55), 0, 1);
            if (fade <= 0.02) continue;
            const waveDist = Math.min(p.maxDist, p.age * WAVE_SPEED);

            // Origin sonar ping orb + ring
            fx.billboard(p.x, 0.45, p.z, 0.28 * fade, basis.right, basis.up,
              acousticsOn ? [0.22, 0.98, 1.0, 0.90 * fade] : [1.0, 0.26, 0.34, 0.90 * fade], 2);
            fx.ringXZ(p.x, 0.08, p.z, 0.35 + (p.age * 1.4) % 0.85,
              acousticsOn ? [0.24, 0.96, 1.0, 0.72 * fade] : [1.0, 0.26, 0.34, 0.72 * fade]);

            if (acousticsOn) {
              // Real Corridor Dijkstra tile ripples: cyan -> mint wavefront flowing cleanly around walls!
              for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                  const d = p.distMap[r * COLS + c];
                  if (d === Infinity || d > waveDist || d > p.maxDist) continue;
                  const tNorm = d / Math.max(1, p.maxDist);
                  const frontBoost = Math.max(0, 1.0 - Math.abs(waveDist - d) / 1.15);
                  const energy = (1.0 - tNorm * 0.72) * (0.34 + 0.66 * frontBoost) * fade;
                  if (energy < 0.04) continue;
                  const x0 = -HALF_W + c * CELL + 0.05;
                  const x1 = x0 + CELL - 0.10;
                  const z0 = -HALF_H + r * CELL + 0.05;
                  const z1 = z0 + CELL - 0.10;
                  const cr = p.onCarpet ? 0.92 * (1 - tNorm) + 0.20 * tNorm : 0.12 + 0.14 * frontBoost;
                  const cg = p.onCarpet ? 0.35 + 0.55 * frontBoost : 0.78 + 0.22 * frontBoost;
                  const cb = p.onCarpet ? 0.76 : 0.98 - 0.32 * tNorm;
                  fx.quadXZ(x0, x1, 0.065, z0, z1, [cr, cg, cb, clamp(energy * 0.88, 0.06, 0.86)]);
                }
              }
            } else {
              // Naive Euclidean Radius Sphere — cuts right through solid masonry!
              fx.ringXZ(p.x, 0.14, p.z, waveDist, [1.0, 0.20, 0.30, 0.92 * fade]);
              fx.ringXZ(p.x, 0.14, p.z, waveDist * 0.68, [1.0, 0.34, 0.42, 0.50 * fade]);
              fx.ringXZ(p.x, 0.10, p.z, p.maxDist, [1.0, 0.22, 0.32, 0.34 * fade]);

              // Dashed crimson wall-piercing leak beams to any alerted guard!
              if (p.alertedA) {
                fx.beam(p.x, 0.72, p.z, guardA.x, 0.72, guardA.z, 0.13, [1.0, 0.18, 0.26, 0.94 * fade], 4);
              }
              if (p.alertedB) {
                fx.beam(p.x, 0.72, p.z, guardB.x, 0.72, guardB.z, 0.11, [1.0, 0.42, 0.18, 0.86 * fade], 4);
              }
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const tc = worldToCell(thief.x, thief.z);
      return {
        acousticsOn,
        doorOpen,
        onCarpet: isCarpetCell(tc.c, tc.r),
        guardAAlert: guardA.heard,
        guardBAlert: guardB.heard,
        lastPulseRadius: Number(lastPulseRadius.toFixed(2)),
        pulseCount,
        thiefCell: [tc.c, tc.r],
      };
    },
  };
}
