// Entry #37: Influence Maps & Tactical Flanking — Playable 3D Courtyard Heatmap AI!
// Live 12x10 3D Influence Map scores every floor tile: Red = Player Turret LOS Threat,
// Emerald = Cover shadow behind stone walls, Gold = Flanking positions behind/beside turret.
// Influence AI Raiders hug stone cover and flank behind the turret vs Naive Direct Charge!
import { clamp } from "../../gl-utils.js";
import {
  createStudioRenderer,
  pushBox,
  projectToScreen,
  drawWorldPill,
  drawBanner,
  drawMobilePill,
} from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const COLS = 12;
const ROWS = 10;
const CELL = 1.15;
const GRID_X0 = -(COLS * CELL) * 0.5; // -6.9
const GRID_Z0 = -(ROWS * CELL) * 0.5; // -5.75

const TURRET_POS = { x: 0.0, z: 2.3 };
const CONE_HALF = 0.62; // ~35.5 deg half-angle (71 deg total fire cone)
const CONE_RANGE = 10.4;

// 4 waist-high stone cover walls creating a central kill-zone and protected flanking lanes!
const COVER_WALLS = [
  { x0: -4.25, x1: -2.05, z0: -2.45, z1: -1.35 },
  { x0:  2.05, x1:  4.25, z0: -2.45, z1: -1.35 },
  { x0: -4.70, x1: -2.95, z0:  0.85, z1:  2.15 },
  { x0:  2.95, x1:  4.70, z0:  0.85, z1:  2.15 },
];

const RAIDER_SPAWNS = [
  { x: -4.4, z: -4.65 },
  { x: -1.5, z: -4.65 },
  { x:  1.5, z: -4.65 },
  { x:  4.4, z: -4.65 },
];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function segmentIntersectsRect(x0, z0, x1, z1, r) {
  let t0 = 0.0, t1 = 1.0;
  const dx = x1 - x0, dz = z1 - z0;
  const checks = [
    [-dx, x0 - r.x0],
    [ dx, r.x1 - x0],
    [-dz, z0 - r.z0],
    [ dz, r.z1 - z0],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-6) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

function hasLOS(ax, az, bx, bz) {
  for (const w of COVER_WALLS) {
    if (segmentIntersectsRect(ax, az, bx, bz, w)) return false;
  }
  return true;
}

function pointInWall(x, z, pad = 0.0) {
  for (const w of COVER_WALLS) {
    if (x >= w.x0 - pad && x <= w.x1 + pad && z >= w.z0 - pad && z <= w.z1 + pad) return w;
  }
  return null;
}

function distToNearestWall(x, z) {
  let best = 99;
  for (const w of COVER_WALLS) {
    const cx = clamp(x, w.x0, w.x1);
    const cz = clamp(z, w.z0, w.z1);
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) best = d;
  }
  return best;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.03, 0.04, 0.10],
    skyMid: [0.07, 0.09, 0.18],
    skyBot: [0.12, 0.10, 0.20],
    lightDir: [0.30, 0.88, 0.38],
    ambLow: [0.10, 0.12, 0.20],
    ambHigh: [0.32, 0.38, 0.54],
  });

  const m = getLagMeshes();
  const sniperGpu = studio.uploadMesh(m.sniper);
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build 12x10 Tactical Courtyard with 4 waist-high stone cover walls
  const wBuf = [];
  // Floor
  pushBox(wBuf, -7.2, 7.2, -0.45, 0.0, -6.0, 6.0, [0.20, 0.23, 0.32], 0);
  // Courtyard stone perimeter curbs
  pushBox(wBuf, -7.2, 7.2, 0.0, 0.85, -6.35, -5.90, [0.28, 0.32, 0.42], 1);
  pushBox(wBuf, -7.2, -6.92, 0.0, 0.55, -5.90, 6.0, [0.26, 0.30, 0.40], 1);
  pushBox(wBuf,  6.92,  7.2, 0.0, 0.55, -5.90, 6.0, [0.26, 0.30, 0.40], 1);
  // 4 waist-high stone cover pillars/walls with bevel caps
  for (const w of COVER_WALLS) {
    pushBox(wBuf, w.x0, w.x1, 0.0, 1.32, w.z0, w.z1, [0.46, 0.49, 0.58], 1);
    pushBox(wBuf, w.x0 - 0.05, w.x1 + 0.05, 1.32, 1.44, w.z0 - 0.05, w.z1 + 0.05, [0.34, 0.38, 0.48], 1);
  }
  // Player Turret elevated pad
  pushBox(wBuf, TURRET_POS.x - 0.95, TURRET_POS.x + 0.95, 0.0, 0.16, TURRET_POS.z - 0.95, TURRET_POS.z + 0.95, [0.28, 0.30, 0.40], 1);
  pushBox(wBuf, TURRET_POS.x - 1.0, TURRET_POS.x + 1.0, 0.0, 0.06, TURRET_POS.z - 1.02, TURRET_POS.z - 0.92, [1.0, 0.72, 0.14], 5);
  studio.setWorldData(wBuf);

  const defaultCam = {
    yaw: 0.05,
    pitch: 0.78,
    dist: 17.5,
    targetX: 0.0,
    targetY: 0.3,
    targetZ: 0.4,
    fovDeg: 40,
  };

  let time = 0;
  let influenceOn = true; // [T] Influence Map AI vs Naive Direct Charge
  let xrayOn = true;      // [X] 3D Floor Heatmap visibility
  let autoSweep = true;
  let userInteracted = false;

  const turret = {
    yaw: Math.PI,
    targetYaw: Math.PI,
    recoil: 0,
    fireCd: 0.25,
  };

  // Pre-allocated 12x10 Influence Grid + Dijkstra cost-to-flank field (prevents local minima behind cover!)
  const grid = Array.from({ length: ROWS * COLS }, (_, idx) => {
    const c = idx % COLS;
    const r = Math.floor(idx / COLS);
    const cx = GRID_X0 + (c + 0.5) * CELL;
    const cz = GRID_Z0 + (r + 0.5) * CELL;
    const blocked = !!pointInWall(cx, cz, 0.05);
    return { c, r, cx, cz, blocked, threat: 0, cover: 0, flank: 0, score: 0, flowCost: 999 };
  });

  let raiders = [];
  let beams = [];
  let sparks = [];
  let flanksScored = 0;
  let casualties = 0;

  let bannerText = "";
  let bannerColor = "#4ade80";
  let bannerTimer = 0;

  function setBanner(t, c = "#4ade80", dur = 2.0) {
    bannerText = t;
    bannerColor = c;
    bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 2.6;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.4 + Math.random() * 2.2,
        vz: Math.sin(a) * sp,
        r, g, b,
        life: 0.42, maxLife: 0.42,
      });
    }
  }

  function recomputeInfluenceGrid() {
    const rearYaw = wrapAngle(turret.yaw + Math.PI);
    const rearX = clamp(TURRET_POS.x + Math.sin(rearYaw) * 2.35, -5.8, 5.8);
    const rearZ = clamp(TURRET_POS.z + Math.cos(rearYaw) * 2.35, -4.8, 4.8);
    const queue = [];

    for (const cell of grid) {
      cell.flowCost = 999;
      if (cell.blocked) {
        cell.threat = 0; cell.cover = 0; cell.flank = 0; cell.score = -9;
        continue;
      }
      const dx = cell.cx - TURRET_POS.x;
      const dz = cell.cz - TURRET_POS.z;
      const dist = Math.hypot(dx, dz);
      const angToCell = Math.atan2(dx, dz);
      const diff = Math.abs(wrapAngle(angToCell - turret.yaw));
      const los = hasLOS(TURRET_POS.x, TURRET_POS.z, cell.cx, cell.cz);

      // Threat: intense inside live LOS cone, mild in exposed mid-range
      let threat = 0;
      if (los && dist < CONE_RANGE) {
        const coneFactor = clamp(1.0 - (diff / (CONE_HALF * 1.18)), 0, 1);
        const distFactor = clamp(1.15 - dist / CONE_RANGE, 0.25, 1.0);
        threat = coneFactor * distFactor;
        if (diff < CONE_HALF) threat = Math.max(threat, 0.58 * distFactor);
      }

      // Cover: shadowed behind stone walls from the turret!
      const wallD = distToNearestWall(cell.cx, cell.cz);
      const cover = (!los && wallD < 2.65) ? clamp(1.0 - wallD / 2.65, 0.25, 1.0) : 0;

      // Flank: behind or deep beside the turret's aim cone!
      let flank = 0;
      if (diff > 1.28 && dist > 1.20 && dist < 5.4) {
        flank = clamp((diff - 1.28) / 1.35, 0, 1) * clamp(1.0 - Math.abs(dist - 2.45) / 3.2, 0.25, 1.0);
      }

      cell.threat = threat;
      cell.cover = cover;
      cell.flank = flank;
      cell.score = cover * 1.15 + flank * 1.85 - threat * 2.6;

      // Seed Dijkstra flow-field at prime gold flanking tiles behind/beside turret!
      const dRear = Math.hypot(cell.cx - rearX, cell.cz - rearZ);
      if ((flank > 0.58 && threat < 0.15) || dRear < 1.15) {
        cell.flowCost = dRear * 0.25;
        queue.push(cell);
      }
    }

    // 120-cell Dijkstra gradient field: routes raiders strictly through emerald cover & around red threat!
    const dirs = [
      [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
      [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414],
    ];
    while (queue.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].flowCost < queue[bestIdx].flowCost) bestIdx = i;
      }
      const cur = queue.splice(bestIdx, 1)[0];
      for (const [dc, dr, stepLen] of dirs) {
        const nc = cur.c + dc;
        const nr = cur.r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const nb = grid[nr * COLS + nc];
        if (nb.blocked) continue;
        // Penalize red Threat tiles heavily and reward emerald Cover shadows!
        const tileWeight = Math.max(0.45, 1.0 + nb.threat * 18.0 - nb.cover * 0.45 - nb.flank * 0.35);
        const nd = cur.flowCost + stepLen * tileWeight;
        if (nd < nb.flowCost) {
          nb.flowCost = nd;
          queue.push(nb);
        }
      }
    }
  }

  function makeRaider(i) {
    const sp = RAIDER_SPAWNS[i % RAIDER_SPAWNS.length];
    return {
      id: i,
      x: sp.x,
      z: sp.z,
      yaw: 0,
      walkPhase: i * 1.4,
      hp: 100,
      alive: true,
      respT: 0,
      flanked: false,
      flankHoldT: 0,
      hitFlash: 0,
      sidePref: i < 2 ? -1 : 1,
    };
  }

  function reset() {
    time = 0;
    autoSweep = true;
    turret.yaw = Math.PI;
    turret.targetYaw = Math.PI;
    turret.recoil = 0;
    turret.fireCd = 0.25;
    flanksScored = 0;
    casualties = 0;
    beams = [];
    sparks = [];
    bannerTimer = 0;
    raiders = [0, 1, 2, 3].map(makeRaider);
    // Nudge raiders slightly into courtyard so at t=0.8s they're actively splitting around walls!
    raiders[0].x = -3.6; raiders[0].z = -3.4;
    raiders[1].x = -1.7; raiders[1].z = -3.8;
    raiders[2].x =  1.7; raiders[2].z = -3.8;
    raiders[3].x =  3.6; raiders[3].z = -3.4;
    recomputeInfluenceGrid();
  }
  reset();

  function cellAt(x, z) {
    const c = clamp(Math.floor((x - GRID_X0) / CELL), 0, COLS - 1);
    const r = clamp(Math.floor((z - GRID_Z0) / CELL), 0, ROWS - 1);
    return grid[r * COLS + c];
  }

  function pickInfluenceStep(raider) {
    // Follow steepest descent on the live Influence Map Dijkstra flow-field toward flanking gold tiles!
    const cur = cellAt(raider.x, raider.z);
    let bestX = cur.cx, bestZ = cur.cz, bestCost = cur.flowCost;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = cur.c + dc;
        const nr = cur.r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const cand = grid[nr * COLS + nc];
        if (cand.blocked) continue;
        const sideNudge = Math.sign(cand.cx) === raider.sidePref ? -0.15 : 0.0;
        const cost = cand.flowCost + sideNudge;
        if (cost < bestCost) {
          bestCost = cost;
          bestX = cand.cx;
          bestZ = cand.cz;
        }
      }
    }
    return { x: bestX, z: bestZ };
  }

  function moveRaiderSafe(r, vx, vz, dt) {
    let nx = clamp(r.x + vx * dt, -6.25, 6.25);
    let nz = clamp(r.z + vz * dt, -5.1, 5.1);

    // Slide smoothly around 4 stone cover walls
    const hitW = pointInWall(nx, nz, 0.36);
    if (hitW) {
      if (!pointInWall(nx, r.z, 0.36)) {
        nz = r.z;
      } else if (!pointInWall(r.x, nz, 0.36)) {
        nx = r.x;
      } else {
        // Push out along nearest edge
        const cx = (hitW.x0 + hitW.x1) * 0.5;
        nx = r.x + (r.x >= cx ? 1 : -1) * 2.2 * dt;
        nz = r.z;
      }
    }

    // Keep out of turret plinth center
    const tdx = nx - TURRET_POS.x;
    const tdz = nz - TURRET_POS.z;
    const td = Math.hypot(tdx, tdz);
    if (td < 1.35 && td > 0.01) {
      nx = TURRET_POS.x + (tdx / td) * 1.35;
      nz = TURRET_POS.z + (tdz / td) * 1.35;
    }

    r.x = nx;
    r.z = nz;
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    turret.recoil = Math.max(0, turret.recoil - dt * 2.8);
    turret.fireCd = Math.max(0, turret.fireCd - dt);

    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt;
      if (beams[i].life <= 0) beams.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.5 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.05, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    // Turret aim controls: A/D or Arrow keys, or gentle auto-sweep
    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoSweep = false;
      userInteracted = true;
      turret.targetYaw = wrapAngle(turret.targetYaw + ((left ? 1 : 0) - (right ? 1 : 0)) * 2.1 * dt);
    } else if (autoSweep) {
      turret.targetYaw = wrapAngle(Math.PI + Math.sin(time * 0.40) * 0.52);
    }
    const yawDiff = wrapAngle(turret.targetYaw - turret.yaw);
    turret.yaw = wrapAngle(turret.yaw + yawDiff * clamp(dt * 8.5, 0, 1));

    // Recompute live 12x10 Influence Heatmap!
    recomputeInfluenceGrid();

    // Update 4 Squad Raiders
    let bestTarget = null;
    let bestDist = 99;

    for (const r of raiders) {
      if (r.hitFlash > 0) r.hitFlash = Math.max(0, r.hitFlash - dt * 2.8);

      if (!r.alive) {
        r.respT -= dt;
        if (r.respT <= 0) {
          const sp = RAIDER_SPAWNS[r.id];
          r.x = sp.x; r.z = sp.z; r.hp = 100; r.alive = true; r.flanked = false; r.flankHoldT = 0;
        }
        continue;
      }

      if (r.flanked) {
        r.flankHoldT -= dt;
        r.yaw = Math.atan2(TURRET_POS.x - r.x, TURRET_POS.z - r.z);
        if (r.flankHoldT <= 0) {
          const sp = RAIDER_SPAWNS[r.id];
          r.x = sp.x; r.z = sp.z; r.hp = 100; r.flanked = false;
        }
        continue;
      }

      let dirX = 0, dirZ = 0;
      if (influenceOn) {
        const tgt = pickInfluenceStep(r);
        dirX = tgt.x - r.x;
        dirZ = tgt.z - r.z;
      } else {
        // Naive Direct Charge straight down the center kill-zone toward turret!
        dirX = TURRET_POS.x - r.x;
        dirZ = TURRET_POS.z - r.z;
      }

      // Soft squad separation
      for (const o of raiders) {
        if (o === r || !o.alive) continue;
        const sx = r.x - o.x, sz = r.z - o.z;
        const sd = Math.hypot(sx, sz);
        if (sd < 0.95 && sd > 0.01) {
          dirX += (sx / sd) * (0.95 - sd) * 2.2;
          dirZ += (sz / sd) * (0.95 - sd) * 2.2;
        }
      }

      const len = Math.hypot(dirX, dirZ) || 1;
      const spd = influenceOn ? 3.45 : 3.20;
      moveRaiderSafe(r, (dirX / len) * spd, (dirZ / len) * spd, dt);
      r.yaw = Math.atan2(dirX, dirZ);
      r.walkPhase += dt * 11.5;

      // Check if raider successfully flanked behind/beside turret!
      const dxT = r.x - TURRET_POS.x;
      const dzT = r.z - TURRET_POS.z;
      const dT = Math.hypot(dxT, dzT);
      const angRel = Math.abs(wrapAngle(Math.atan2(dxT, dzT) - turret.yaw));

      if (influenceOn && angRel > 1.32 && dT < 3.25) {
        r.flanked = true;
        r.flankHoldT = 1.35;
        flanksScored++;
        beams.push({ sx: r.x, sz: r.z, ex: TURRET_POS.x, ez: TURRET_POS.z, friendly: false, life: 0.36, maxLife: 0.36 });
        spawnSparks(TURRET_POS.x, 1.0, TURRET_POS.z, 1.0, 0.80, 0.18, 12);
        if (userInteracted) audio?.coinPickup?.();
      }

      // Check if turret can tag this raider inside its red LOS fire-cone!
      if (dT < CONE_RANGE && angRel < CONE_HALF && hasLOS(TURRET_POS.x, TURRET_POS.z, r.x, r.z)) {
        if (dT < bestDist) {
          bestDist = dT;
          bestTarget = r;
        }
      }
    }

    // Turret fires crisp laser bursts at exposed raiders in its fire-cone!
    if (bestTarget && turret.fireCd <= 0) {
      turret.fireCd = 0.26;
      turret.recoil = 0.28;
      bestTarget.hp -= 55;
      bestTarget.hitFlash = 1.0;
      const mx = TURRET_POS.x + Math.sin(turret.yaw) * 1.25;
      const mz = TURRET_POS.z + Math.cos(turret.yaw) * 1.25;
      beams.push({ sx: mx, sz: mz, ex: bestTarget.x, ez: bestTarget.z, friendly: true, life: 0.24, maxLife: 0.24 });
      spawnSparks(bestTarget.x, 1.0, bestTarget.z, 1.0, 0.28, 0.30, 12);
      if (userInteracted) audio?.laserShot?.(true);

      if (bestTarget.hp <= 0) {
        bestTarget.alive = false;
        bestTarget.respT = 1.15;
        casualties++;
        if (userInteracted) audio?.laserHit?.();
        if (!influenceOn && casualties % 2 === 1) {
          setBanner("NAIVE CHARGE MOWED DOWN IN RED KILL-ZONE! PRESS [T] FOR INFLUENCE AI ✗", "#f87171", 1.9);
        }
      }
    }
  }

  function drawMiniHeatmap(ctx, px, py, mapW, mapH) {
    const cw = mapW / COLS;
    const ch = mapH / ROWS;
    ctx.save();
    ctx.fillStyle = "rgba(10, 14, 28, 0.94)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(px, py, mapW, mapH, 5);
    ctx.fill();
    ctx.stroke();

    for (const cell of grid) {
      const x = px + cell.c * cw;
      const y = py + cell.r * ch;
      if (cell.blocked) {
        ctx.fillStyle = "#64748b";
      } else if (cell.threat > 0.30) {
        ctx.fillStyle = `rgba(248, 113, 113, ${0.28 + cell.threat * 0.65})`;
      } else if (cell.flank > 0.38) {
        ctx.fillStyle = `rgba(250, 204, 21, ${0.26 + cell.flank * 0.65})`;
      } else if (cell.cover > 0.28) {
        ctx.fillStyle = `rgba(52, 211, 153, ${0.24 + cell.cover * 0.62})`;
      } else {
        ctx.fillStyle = "rgba(30, 41, 59, 0.55)";
      }
      ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    }

    // Turret dot
    const tx = px + ((TURRET_POS.x - GRID_X0) / (COLS * CELL)) * mapW;
    const ty = py + ((TURRET_POS.z - GRID_Z0) / (ROWS * CELL)) * mapH;
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(tx, ty, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Raider dots
    for (const r of raiders) {
      if (!r.alive) continue;
      const rx = px + ((r.x - GRID_X0) / (COLS * CELL)) * mapW;
      const ry = py + ((r.z - GRID_Z0) / (ROWS * CELL)) * mapH;
      ctx.fillStyle = r.flanked ? "#fde047" : (r.hitFlash > 0.2 ? "#f87171" : "#ffffff");
      ctx.beginPath();
      ctx.arc(rx, ry, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Turret pill
      const tp = projectToScreen(viewProj, TURRET_POS.x, 2.0, TURRET_POS.z, cssW, cssH);
      if (tp) {
        drawWorldPill(
          ctx,
          tp.x,
          tp.y,
          isPl ? "WIEŻYCZKA GRACZA (KLIK / A·D = CELUJ)" : "PLAYER TURRET (CLICK / A·D = AIM)",
          "#38bdf8",
          cssW,
          cssH,
          isCompact ? 8.5 : 9.5
        );
      }

      // Highlight up to 2 most informative raiders so labels stay crisp and uncluttered
      let shownFlank = false;
      let shownHit = false;
      for (const r of raiders) {
        if (!r.alive) continue;
        if (r.flanked && !shownFlank) {
          shownFlank = true;
          const rp = projectToScreen(viewProj, r.x, 2.2, r.z, cssW, cssH);
          if (rp) drawWorldPill(ctx, rp.x, rp.y, isPl ? "FLANKOWANIE ✓" : "FLANKING ✓", "#facc15", cssW, cssH, isCompact ? 9 : 10.5);
        } else if (!influenceOn && r.hitFlash > 0.15 && !shownHit) {
          shownHit = true;
          const rp = projectToScreen(viewProj, r.x, 2.2, r.z, cssW, cssH);
          if (rp) drawWorldPill(ctx, rp.x, rp.y, isPl ? "SKOSZONY W STREFIE OGNIA! ✗" : "MOWED DOWN! ✗", "#f87171", cssW, cssH, isCompact ? 9 : 10.5);
        }
      }
      // Show a cover-hugging badge if Influence AI is actively using cover before flanking
      if (influenceOn && !shownFlank) {
        const covRaider = raiders.find((r) => r.alive && cellAt(r.x, r.z).cover > 0.35);
        if (covRaider) {
          const rp = projectToScreen(viewProj, covRaider.x, 2.2, covRaider.z, cssW, cssH);
          if (rp) drawWorldPill(ctx, rp.x, rp.y, isPl ? "OSŁONA → FLANKA ✓" : "HUGGING COVER → FLANK ✓", "#4ade80", cssW, cssH, isCompact ? 9 : 10);
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${influenceOn ? "INFLUENCE AI" : "NAIVE CHARGE"} · FLANKS ${flanksScored} · KILLS ${casualties}`,
          influenceOn ? "#4ade80" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14;
        const panelW = 340;
        const panelH = 204;
        const px = cssW - panelW - pad;
        const bw = panelW - 24;

        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 28, 0.90)";
        ctx.strokeStyle = influenceOn ? "rgba(52, 211, 153, 0.80)" : "rgba(248, 113, 113, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = influenceOn ? "#34d399" : "#f87171";
        ctx.fillText(
          influenceOn
            ? (isPl ? "MAPA WPŁYWÓW · TAKTYCZNE FLANKOWANIE" : "INFLUENCE MAP AI · TACTICAL FLANKING")
            : (isPl ? "NAIWNA SZARŻA · PROSTO W OGIEŃ ✗" : "NAIVE DIRECT CHARGE · KILL-ZONE ✗"),
          px + 12,
          py + 21,
          bw
        );

        // Mini 12x10 Heatmap radar on left
        drawMiniHeatmap(ctx, px + 12, py + 32, 132, 106);

        // Legend & stats on right
        const rx = px + 156;
        const rw = panelW - 168;
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#f87171";
        ctx.fillText(isPl ? "■ CZERWONY = ZAGROŻENIE LOS" : "■ RED = LOS THREAT", rx, py + 45, rw);
        ctx.fillStyle = "#34d399";
        ctx.fillText(isPl ? "■ ZIELONY  = CIEŃ OSŁONY" : "■ EMERALD = WALL COVER", rx, py + 62, rw);
        ctx.fillStyle = "#facc15";
        ctx.fillText(isPl ? "■ ZŁOTY    = FLANKA TYŁEM" : "■ GOLD = REAR FLANK", rx, py + 79, rw);

        ctx.font = "700 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Udane flanki: ${flanksScored}` : `Flanks Scored: ${flanksScored}`, rx, py + 106, rw);
        ctx.fillStyle = "#fca5a5";
        ctx.fillText(isPl ? `Skoszeni: ${casualties}` : `Mowed Down: ${casualties}`, rx, py + 126, rw);

        // Bottom controls
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "Klik / A·D = Obrót wieżyczki · V = Obrót o 90°" : "Click / A·D = Aim Turret · V = Sweep Turret 90°",
          px + 12,
          py + 164,
          bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "X = Mapa 3D WŁ/WYŁ · T = Influence AI vs Szarża" : "X = 3D Heatmap ON/OFF · T = Influence vs Naive",
          px + 12,
          py + 185,
          bw
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
          id: "toggle-influence",
          label: influenceOn
            ? (pl ? "Mapa Wpływów AI: WŁ [T]" : "Influence AI: ON [T]")
            : (pl ? "Naiwna Szarża [T]" : "Naive Charge [T]"),
          pressed: influenceOn,
        },
        {
          id: "sweep-90",
          label: pl ? "Obróć Wieżyczkę 90° [V]" : "Sweep Turret 90° [V]",
          pressed: false,
        },
        {
          id: "toggle-xray",
          label: xrayOn
            ? (pl ? "Mapa Cieplna 3D: WŁ [X]" : "3D Heatmap: ON [X]")
            : (pl ? "Mapa Cieplna 3D: WYŁ [X]" : "3D Heatmap: OFF [X]"),
          pressed: xrayOn,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-influence") {
        influenceOn = !influenceOn;
        audio?.ruleSwitch?.(influenceOn);
        setBanner(
          influenceOn
            ? "INFLUENCE MAP AI ON: RAIDERS HUG STONE COVER & FLANK BEHIND TURRET ✓"
            : "NAIVE CHARGE ON: RAIDERS MARCH STRAIGHT INTO RED LOS KILL-ZONE ✗",
          influenceOn ? "#4ade80" : "#f87171",
          2.1
        );
      } else if (id === "sweep-90") {
        autoSweep = false;
        turret.targetYaw = wrapAngle(turret.targetYaw + Math.PI * 0.5);
        audio?.wallClick?.(true);
        setBanner("TURRET SWEPT 90° — WATCH INFLUENCE HEATMAP & FLANK ROUTES RECOMPUTE LIVE!", "#38bdf8", 1.9);
      } else if (id === "toggle-xray") {
        xrayOn = !xrayOn;
        audio?.ruleSwitch?.(xrayOn);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-influence");
      else if (code === "KeyV") this.onAction("sweep-90");
      else if (code === "KeyX") this.onAction("toggle-xray");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        autoSweep = false;
        turret.targetYaw = Math.atan2(world[0] - TURRET_POS.x, world[2] - TURRET_POS.z);
        audio?.wallClick?.(true);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        {
          gpu: sniperGpu,
          x: TURRET_POS.x,
          y: 0.16,
          z: TURRET_POS.z,
          yaw: turret.yaw,
          animA: turret.recoil,
          scale: 1.22,
          animMode: 1,
          tint: [0.24, 0.72, 1.0, 0.22],
        },
      ];

      for (const r of raiders) {
        if (!r.alive) continue;
        const tint = r.hitFlash > 0.1
          ? [1.0, 0.20, 0.24, 0.85]
          : (r.flanked
              ? [1.0, 0.82, 0.16, 0.68]
              : (influenceOn ? [0.22, 0.94, 0.62, 0.34] : [1.0, 0.36, 0.24, 0.44]));
        meshes.push({
          gpu: runnerGpu,
          x: r.x,
          y: 0.0,
          z: r.z,
          yaw: r.yaw,
          animA: r.walkPhase,
          animB: r.flanked ? 0.0 : 1.0,
          scale: 1.02,
          animMode: 2,
          tint,
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // 12x10 Live 3D Floor Influence Heatmap!
          if (xrayOn) {
            const half = CELL * 0.47;
            for (const cell of grid) {
              if (cell.blocked) continue;
              let col = null;
              if (cell.threat > 0.28) {
                col = [1.0, 0.20, 0.24, 0.22 + cell.threat * 0.56];
              } else if (cell.flank > 0.36) {
                col = [1.0, 0.80, 0.16, 0.22 + cell.flank * 0.54];
              } else if (cell.cover > 0.26) {
                col = [0.14, 0.94, 0.56, 0.20 + cell.cover * 0.52];
              }
              if (col) {
                fx.quadXZ(cell.cx - half, cell.cx + half, 0.04, cell.cz - half, cell.cz + half, col);
              }
            }
          }

          // Turret fire-cone overlay
          fx.coneXZ(TURRET_POS.x, 0.09, TURRET_POS.z, turret.yaw, CONE_HALF, 7.8, [1.0, 0.26, 0.30, 0.52]);

          // Flanked raider rings
          for (const r of raiders) {
            if (!r.alive) continue;
            if (r.flanked) {
              fx.ringXZ(r.x, 0.08, r.z, 0.82, [1.0, 0.82, 0.16, 0.90]);
            }
          }

          // Laser fire beams
          for (const b of beams) {
            const a = clamp(b.life / b.maxLife, 0, 1);
            fx.beam(
              b.sx, 1.05, b.sz, b.ex, 1.05, b.ez,
              0.16,
              b.friendly ? [1.0, 0.30, 0.34, a] : [1.0, 0.82, 0.18, a],
              0
            );
          }

          // Impact sparks
          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, 0.15 * a + 0.04, basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });

      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const activeFlankers = raiders.filter((r) => r.alive && r.flanked).length;
      return {
        influenceOn,
        xrayOn,
        turretYawDeg: Math.round(((turret.yaw * 180) / Math.PI + 360) % 360),
        flanksScored,
        casualties,
        activeFlankers,
      };
    },
  };
}
