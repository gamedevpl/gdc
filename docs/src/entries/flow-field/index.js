// Entry #10: Flow Field & Dynamic NavMesh — Playable 3D Crowd Pathing Sandbox!
// Demonstrates why RTS & Swarm games compute ONE backwards Dijkstra/BFS Flow Field (O(grid)) instead of
// running 96 separate A* searches: paint/erase 3D walls live or move the Goal Beacon and watch 96 Hover-Bots
// reroute like liquid in < 0.2 ms — vs slamming dead-stuck in Naive Straight-Line mode!
import { clamp, lerp } from "../../gl-utils.js";
import { createFlowRenderer, COLS, ROWS, tileToWorld, worldToTile } from "./flow-renderer.js";

const UNIT_COUNT = 96;
const UNIT_R = 0.22;
const UNIT_SPEED = 3.15;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function approachAngle(curr, target, maxStep) {
  const diff = wrapAngle(target - curr);
  if (Math.abs(diff) <= maxStep) return target;
  return wrapAngle(curr + Math.sign(diff) * maxStep);
}

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createFlowRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.88, dist: 20.8, targetX: 0.0, targetY: 0.2, targetZ: 0.45, fovDeg: 40 };

  let time = 0;
  let flowMode = true;   // true = Shared 1x BFS Flow Field, false = Naive Straight-Line Seek (gets stuck!)
  let showField = true;
  let presetIdx = 0;     // 0 = S-Funnel Canyon, 1 = U-Trap Bastion, 2 = Open Sandbox
  let gridVersion = 1;

  const walls = new Uint8Array(COLS * ROWS);
  const dist = new Float32Array(COLS * ROWS);
  const flowX = new Float32Array(COLS * ROWS);
  const flowZ = new Float32Array(COLS * ROWS);
  let maxDist = 20;
  let lastBfsOps = 0;
  let wallCount = 0;

  const spawn = { c: 1, r: 5 };
  const goal = { c: 14, r: 6 };

  let units = [];
  let sparks = [];
  let arrivals = 0;
  let stuckCount = 0;
  let paintValue = 1; // 1 = paint wall, 0 = erase wall while dragging

  let bannerText = "";
  let bannerColor = "#22c55e";
  let bannerTimer = 0;

  function setBanner(text, color = "#22c55e", dur = 2.0) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.0 + Math.random() * 2.4;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.4 + Math.random() * 2.2,
        vz: Math.sin(a) * sp,
        r, g, b,
        size: 0.13 + Math.random() * 0.09,
        life: 0.42 + Math.random() * 0.28,
        maxLife: 0.70,
      });
    }
  }

  function computeFlowField() {
    // 1 Single Backwards Dijkstra/BFS from Goal Beacon -> computes ALL 192 tiles in O(grid)!
    dist.fill(Infinity);
    flowX.fill(0);
    flowZ.fill(0);
    wallCount = 0;
    for (let i = 0; i < walls.length; i++) if (walls[i]) wallCount++;

    const gIdx = goal.r * COLS + goal.c;
    walls[gIdx] = 0;
    dist[gIdx] = 0;
    const queue = [gIdx];
    let head = 0;
    let ops = 0;
    let maxD = 1;

    // 4-neighbor exact grid integration (cleanly avoids corner clipping!) + smooth 8-dir gradient extraction!
    const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < queue.length) {
      const curr = queue[head++];
      ops++;
      const cr = Math.floor(curr / COLS);
      const cc = curr % COLS;
      const cd = dist[curr];
      if (cd > maxD) maxD = cd;
      for (const [dc, dr] of dirs4) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const ni = nr * COLS + nc;
        if (walls[ni]) continue;
        if (cd + 1 < dist[ni]) {
          dist[ni] = cd + 1;
          queue.push(ni);
        }
      }
    }

    // Extract smooth directional flow vectors pointing strictly downhill toward Goal (0)
    const dirs8 = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (walls[idx] || !Number.isFinite(dist[idx]) || idx === gIdx) continue;
        let bestD = dist[idx];
        let bx = 0, bz = 0;
        for (const [dc, dr] of dirs8) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          const ni = nr * COLS + nc;
          if (walls[ni]) continue;
          // Prevent diagonal corner-cutting through adjacent walls!
          if (dc !== 0 && dr !== 0) {
            if (walls[r * COLS + nc] || walls[nr * COLS + c]) continue;
          }
          const nd = dist[ni] + (dc !== 0 && dr !== 0 ? 0.38 : 0.0);
          if (nd < bestD) {
            bestD = nd;
            bx = dc;
            bz = dr;
          }
        }
        const len = Math.hypot(bx, bz);
        if (len > 0) {
          flowX[idx] = bx / len;
          flowZ[idx] = bz / len;
        }
      }
    }

    maxDist = maxD;
    lastBfsOps = ops;
    gridVersion++;
  }

  function applyMazePreset(idx) {
    presetIdx = idx % 3;
    walls.fill(0);
    spawn.c = 1; spawn.r = 5;
    goal.c = 14; goal.r = 6;

    if (presetIdx === 0) {
      // Interlocking S-Funnel Siege Canyon!
      for (let r = 0; r <= 7; r++) walls[r * COLS + 5] = 1;
      for (let r = 4; r <= 11; r++) walls[r * COLS + 10] = 1;
      walls[3 * COLS + 2] = 1;
      walls[8 * COLS + 2] = 1;
      walls[2 * COLS + 13] = 1;
      setBanner("S-FUNNEL CANYON · FLOW FIELD RE-ROUTES 96 BOTS!", "#22c55e", 2.0);
    } else if (presetIdx === 1) {
      // Concave U-Trap Bastion right in front of the Goal — total trap for Naive Seek!
      for (let r = 2; r <= 9; r++) walls[r * COLS + 9] = 1;
      for (let c = 5; c <= 9; c++) {
        walls[2 * COLS + c] = 1;
        walls[9 * COLS + c] = 1;
      }
      goal.c = 13; goal.r = 5;
      setBanner("U-TRAP BASTION · TRY NAIVE MODE [T] TO SEE STUCK BOTS!", "#fbbf24", 2.4);
    } else {
      // Open Sandbox for freehand wall painting!
      setBanner("OPEN SANDBOX · CLICK & DRAG TO PAINT 3D WALLS!", "#38bdf8", 2.1);
    }
    computeFlowField();
  }

  function respawnUnit(u, spread = false) {
    const [sx, sz] = tileToWorld(spawn.c, spawn.r);
    u.x = sx + (Math.random() - 0.5) * (spread ? 2.6 : 1.1);
    u.z = sz + (Math.random() - 0.5) * (spread ? 5.2 : 2.2);
    // Keep respawn off walls
    const t = worldToTile(u.x, u.z);
    if (!t || walls[t.idx]) {
      u.x = sx + (Math.random() - 0.5) * 0.5;
      u.z = sz + (Math.random() - 0.5) * 0.5;
    }
    u.vx = 0.8;
    u.vz = 0;
    u.stuck = 0;
  }

  function resetUnits() {
    units = [];
    for (let i = 0; i < UNIT_COUNT; i++) {
      const u = { x: 0, z: 0, vx: 1, vz: 0, yaw: Math.PI * 0.5, phase: i * 0.55, stuck: 0 };
      // Distribute initial stream across west chamber so crowd immediately looks alive!
      const col = 0.8 + (i % 4) * 0.85;
      const row = 1.2 + Math.floor(i / 4) * 0.40;
      const [wx, wz] = tileToWorld(clamp(col, 0.5, 4.1), clamp(row, 0.6, 10.8));
      u.x = wx;
      u.z = wz;
      const ti = worldToTile(u.x, u.z);
      if (!ti || walls[ti.idx]) respawnUnit(u, false);
      units.push(u);
    }
  }

  function reset() {
    time = 0;
    flowMode = true;
    showField = true;
    arrivals = 0;
    stuckCount = 0;
    sparks = [];
    applyMazePreset(0);
    resetUnits();
    bannerTimer = 0;
  }

  reset();

  function resolveUnitWalls(u) {
    const hx = COLS * 0.5 - UNIT_R;
    const hz = ROWS * 0.5 - UNIT_R;
    u.x = clamp(u.x, -hx, hx);
    u.z = clamp(u.z, -hz, hz);

    const tile = worldToTile(u.x, u.z);
    if (!tile) return false;
    let hitWall = false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nc = tile.c + dc, nr = tile.r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (!walls[nr * COLS + nc]) continue;
        const [wx, wz] = tileToWorld(nc, nr);
        const minX = wx - 0.5, maxX = wx + 0.5;
        const minZ = wz - 0.5, maxZ = wz + 0.5;
        const cx = clamp(u.x, minX, maxX);
        const cz = clamp(u.z, minZ, maxZ);
        const dx = u.x - cx;
        const dz = u.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < UNIT_R * UNIT_R) {
          hitWall = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            u.x = cx + (dx / d) * UNIT_R;
            u.z = cz + (dz / d) * UNIT_R;
          } else {
            const dl = Math.abs(u.x - minX), dr2 = Math.abs(maxX - u.x);
            const dt = Math.abs(u.z - minZ), db = Math.abs(maxZ - u.z);
            const m = Math.min(dl, dr2, dt, db);
            if (m === dl) u.x = minX - UNIT_R;
            else if (m === dr2) u.x = maxX + UNIT_R;
            else if (m === dt) u.z = minZ - UNIT_R;
            else u.z = maxZ + UNIT_R;
          }
        }
      }
    }
    return hitWall;
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.2 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.05, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    const [gx, gz] = tileToWorld(goal.c, goal.r);
    let stuckNow = 0;

    // 1) Steer all 96 Hover-Bots by sampling the shared O(1) Flow Field tile underneath them + soft separation!
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const prevX = u.x, prevZ = u.z;
      const tile = worldToTile(u.x, u.z);

      let desX = 0, desZ = 0;
      if (flowMode) {
        if (tile && (flowX[tile.idx] !== 0 || flowZ[tile.idx] !== 0)) {
          desX = flowX[tile.idx];
          desZ = flowZ[tile.idx];
          // Center slightly inside narrow corridors for ultra-smooth wall-corner rounding!
          const [twx, twz] = tileToWorld(tile.c, tile.r);
          if (Math.abs(desX) > 0.5 && Math.abs(desZ) < 0.2) {
            desZ += clamp((twz - u.z) * 0.55, -0.35, 0.35);
          } else if (Math.abs(desZ) > 0.5 && Math.abs(desX) < 0.2) {
            desX += clamp((twx - u.x) * 0.55, -0.35, 0.35);
          }
        } else {
          const dx = gx - u.x, dz = gz - u.z;
          const d = Math.hypot(dx, dz) || 1;
          desX = dx / d; desZ = dz / d;
        }
      } else {
        // NAIVE STRAIGHT-LINE SEEK (no Flow Field — rams blindly into walls!)
        const dx = gx - u.x, dz = gz - u.z;
        const d = Math.hypot(dx, dz) || 1;
        desX = dx / d; desZ = dz / d;
      }

      // Soft unit-to-unit crowd separation (prevents clumping into a single point)
      let sepX = 0, sepZ = 0;
      const sepR = UNIT_R * 2.25;
      const sepR2 = sepR * sepR;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const o = units[j];
        const dx = u.x - o.x;
        const dz = u.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < sepR2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (sepR - d) / sepR;
          sepX += (dx / d) * push * 2.1;
          sepZ += (dz / d) * push * 2.1;
        }
      }

      const dLen = Math.hypot(desX, desZ) || 1;
      const targetVx = (desX / dLen) * UNIT_SPEED + sepX;
      const targetVz = (desZ / dLen) * UNIT_SPEED + sepZ;

      u.vx = lerp(u.vx, targetVx, clamp(dt * 9.5, 0, 1));
      u.vz = lerp(u.vz, targetVz, clamp(dt * 9.5, 0, 1));
      const spd = Math.hypot(u.vx, u.vz);
      if (spd > UNIT_SPEED * 1.18) {
        const s = (UNIT_SPEED * 1.18) / spd;
        u.vx *= s; u.vz *= s;
      }

      u.x += u.vx * dt;
      u.z += u.vz * dt;
      resolveUnitWalls(u);

      const moved = Math.hypot(u.x - prevX, u.z - prevZ) / Math.max(0.004, dt);
      if (moved < 0.72) {
        u.stuck = clamp(u.stuck + dt * 1.4, 0, 1);
      } else {
        u.stuck = Math.max(0, u.stuck - dt * 1.8);
      }
      if (u.stuck > 0.45) stuckNow++;

      if (Math.hypot(u.vx, u.vz) > 0.25) {
        u.yaw = approachAngle(u.yaw, Math.atan2(u.vx, u.vz), dt * 11.0);
      }

      // Check Goal Beacon arrival!
      if (Math.hypot(u.x - gx, u.z - gz) < 0.72) {
        arrivals++;
        if (arrivals % 5 === 1) {
          audio?.stepTone?.(0);
          spawnSparks(gx, 0.85, gz, 1.0, 0.84, 0.24, 6);
        }
        respawnUnit(u, false);
      }
    }

    stuckCount = stuckNow;
  }

  function paintTileAtWorld(world, val) {
    if (!world) return;
    const t = worldToTile(world[0], world[2]);
    if (!t) return;
    if (t.c === goal.c && t.r === goal.r) return;
    if (t.c === spawn.c && Math.abs(t.r - spawn.r) <= 1) return;
    if (walls[t.idx] !== val) {
      walls[t.idx] = val;
      computeFlowField();
      audio?.wallClick?.(val === 1);
      const [wx, wz] = tileToWorld(t.c, t.r);
      spawnSparks(wx, 0.7, wz, val ? 0.22 : 0.96, val ? 0.92 : 0.62, val ? 0.58 : 0.24, 6);
    }
  }

  function moveGoalToTile(c, r) {
    if (c === spawn.c && Math.abs(r - spawn.r) <= 1) return;
    walls[r * COLS + c] = 0;
    goal.c = c;
    goal.r = r;
    computeFlowField();
    audio?.tokenPass?.();
    const [gx, gz] = tileToWorld(c, r);
    spawnSparks(gx, 1.0, gz, 1.0, 0.84, 0.24, 14);
    setBanner(`GOAL MOVED -> 1× FLOW FIELD REBUILT (${lastBfsOps} OPS!)`, "#facc15", 1.8);
  }

  function cycleGoalSpot() {
    const spots = [
      { c: 14, r: 6 },
      { c: 13, r: 1 },
      { c: 7, r: 10 },
      { c: 13, r: 10 },
    ];
    const currIdx = spots.findIndex((s) => s.c === goal.c && s.r === goal.r);
    const next = spots[(currIdx + 1) % spots.length];
    moveGoalToTile(next.c, next.r);
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";

    // Crisp World Labels for Spawn Portal & Goal Beacon
    const [gx, gz] = tileToWorld(goal.c, goal.r);
    const [sx, sz] = tileToWorld(spawn.c, spawn.r);
    const gScr = projectToScreen(viewProj, gx, 2.35, gz, cssW, cssH);
    const sScr = projectToScreen(viewProj, sx, 0.45, sz, cssW, cssH);
    ctx.save();
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    if (gScr) {
      ctx.fillStyle = "#fde047";
      ctx.fillText(isPl ? "CEL (0)" : "GOAL (0)", gScr.x, gScr.y);
    }
    if (sScr) {
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(isPl ? "SPAWN (96)" : "SPAWN (96)", sScr.x, sScr.y);
    }
    ctx.restore();

    // Top-Right Telemetry HUD (compact 1-line pill on mobile, full card on desktop, hidden in ?hud=0!)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const pillText = flowMode
          ? (isPl ? `FLOW 1× (${lastBfsOps} op) · Utknięte: ${stuckCount} · Cel: ${arrivals}` : `FLOW 1× (${lastBfsOps} ops) · Stuck: ${stuckCount} · Goal: ${arrivals}`)
          : (isPl ? `NAIWNY · Utknięte: ${stuckCount}/96${stuckCount > 15 ? " (ZATOR!)" : ""}` : `NAIVE · Stuck: ${stuckCount}/96${stuckCount > 15 ? " (JAM!)" : ""}`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pillText).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(10, 22, 24, 0.84)";
        ctx.strokeStyle = flowMode ? "rgba(34, 197, 94, 0.72)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px, py, tw, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = flowMode ? "#4ade80" : "#fca5a5";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pillText, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
      const pad = 14;
      const panelW = Math.min(300, cssW - 28);
      const panelH = 152;
      const px = cssW - panelW - pad;

      ctx.save();
      ctx.fillStyle = "rgba(10, 22, 24, 0.86)";
      ctx.strokeStyle = flowMode ? "rgba(34, 197, 94, 0.65)" : "rgba(239, 68, 68, 0.72)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px, py, panelW, panelH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = flowMode ? "#4ade80" : "#f87171";
      ctx.fillText(
        flowMode
          ? (isPl ? "FLOW FIELD · 1× BFS O(siatki)" : "FLOW FIELD · 1× BFS O(grid)")
          : (isPl ? "NAIWNY RUCH · BEZ POLA WEKTORÓW" : "NAIVE SEEK · NO FLOW FIELD"),
        px + 12, py + 21
      );

      // Cost comparison bars: 1x Flow Field vs 96x Individual A*!
      const barX = px + 12, barW = panelW - 24;
      const astarOps = UNIT_COUNT * Math.max(60, Math.round(lastBfsOps * 0.58));
      const ratio = Math.max(1, Math.round(astarOps / Math.max(1, lastBfsOps)));

      // Bar 1: Shared Flow Field
      ctx.fillStyle = "rgba(15, 35, 34, 0.9)";
      ctx.beginPath();
      ctx.roundRect(barX, py + 32, barW, 13, 4);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.roundRect(barX, py + 32, Math.max(18, barW * (lastBfsOps / astarOps) * 4), 13, 4);
      ctx.fill();
      ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(
        isPl ? `Flow Field (1×): ${lastBfsOps} odwiedzeń` : `Flow Field (1×): ${lastBfsOps} tile ops`,
        barX + 6, py + 41.5
      );

      // Bar 2: 96x Individual A*
      ctx.fillStyle = "rgba(15, 35, 34, 0.9)";
      ctx.beginPath();
      ctx.roundRect(barX, py + 50, barW, 13, 4);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.roundRect(barX, py + 50, barW, 13, 4);
      ctx.fill();
      ctx.fillStyle = "#fff1f2";
      ctx.fillText(
        isPl ? `96× osobne A*: ~${astarOps} (${ratio}× drożej!)` : `96× Separate A*: ~${astarOps} (${ratio}× slower!)`,
        barX + 6, py + 59.5
      );

      // Live Crowd Status
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = stuckCount > 15 ? "#fca5a5" : "#bbf7d0";
      ctx.fillText(
        isPl
          ? `Jednostki: ${UNIT_COUNT}  ·  Utknięte: ${stuckCount} ${stuckCount > 15 ? "(ZATOR!)" : "(PŁYNĄ)"}`
          : `Units: ${UNIT_COUNT}  ·  Stuck: ${stuckCount} ${stuckCount > 15 ? "(JAMMED!)" : "(FLOWING)"}`,
        px + 12, py + 86
      );

      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(
        isPl
          ? `Dotarło do Celu: ${arrivals}  ·  Ściany: ${wallCount}`
          : `Goal Arrivals: ${arrivals}  ·  Walls: ${wallCount}`,
        px + 12, py + 108
      );

      ctx.fillStyle = "#67e8f9";
      ctx.fillText(
        isPl
          ? "Przeciągnij LPM = ściany · Shift+Klik = Cel"
          : "Drag LPM = paint walls · Shift+Click = Goal",
        px + 12, py + 131
      );
      ctx.restore();
      }
    }

    // Center Top Action Banner
    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = "800 14px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = tw + 28;
      const bx = (cssW - bw) * 0.5;
      const by = 76;
      ctx.fillStyle = "rgba(10, 22, 24, 0.92)";
      ctx.strokeStyle = bannerColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = bannerColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bannerText, cssW * 0.5, by + 16.5);
      ctx.restore();
    }
  }

  return {
    defaultCam,
    reset,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        {
          id: "toggle-mode",
          label: flowMode
            ? (pl ? "Tryb: Flow Field (1×) [T]" : "Mode: Flow Field (1×) [T]")
            : (pl ? "Tryb: Naiwny (Bez Pola) [T]" : "Mode: Naive (No Field) [T]"),
          pressed: flowMode,
        },
        {
          id: "cycle-maze",
          label: pl ? "Zmień Labirynt [V]" : "Cycle Maze [V]",
          pressed: presetIdx === 1,
        },
        {
          id: "move-goal",
          label: pl ? "Przenieś Cel [Spacja]" : "Move Goal [Space]",
          pressed: false,
        },
        {
          id: "toggle-field",
          label: showField
            ? (pl ? "Strzałki Pola: WŁ [X]" : "Flow Arrows: ON [X]")
            : (pl ? "Strzałki Pola: WYŁ [X]" : "Flow Arrows: OFF [X]"),
          pressed: showField,
        },
      ];
    },
    onAction(id) {
      if (id === "toggle-mode") {
        flowMode = !flowMode;
        gridVersion++;
        audio?.ruleSwitch?.(flowMode);
        setBanner(
          flowMode ? "FLOW FIELD ON · 96 UNITS GLIDE AROUND WALLS!" : "NAIVE SEEK · UNITS SLAM BLINDLY INTO WALLS!",
          flowMode ? "#22c55e" : "#ef4444",
          2.0
        );
      } else if (id === "cycle-maze") {
        applyMazePreset(presetIdx + 1);
        resetUnits();
      } else if (id === "move-goal") {
        cycleGoalSpot();
      } else if (id === "toggle-field") {
        showField = !showField;
        gridVersion++;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-mode");
      else if (code === "KeyV") this.onAction("cycle-maze");
      else if (code === "Space" || code === "KeyE") this.onAction("move-goal");
      else if (code === "KeyX") this.onAction("toggle-field");
    },
    onPointerDown({ world, button, shiftKey } = {}) {
      // Claim Left-Click inside grid for wall painting or Shift+Click Goal moving (Right-Drag orbits camera!)
      if (button !== 0 || !world) return false;
      const t = worldToTile(world[0], world[2]);
      if (!t) return false;
      if (shiftKey) {
        moveGoalToTile(t.c, t.r);
        requestHudRefresh?.();
        return true;
      }
      paintValue = walls[t.idx] ? 0 : 1;
      paintTileAtWorld(world, paintValue);
      return true;
    },
    onPointerMove({ world, down, claimed } = {}) {
      if (down && claimed && world) {
        paintTileAtWorld(world, paintValue);
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time,
        flowMode,
        showField,
        gridVersion,
        walls,
        dist,
        flowX,
        flowZ,
        maxDist,
        spawn,
        goal,
        units,
        sparks,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        unitCount: units.length,
        flowMode,
        showField,
        presetIdx,
        wallCount,
        lastBfsOps,
        arrivals,
        stuckCount,
        goal: { ...goal },
      };
    },
  };
}
