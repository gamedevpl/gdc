// Entry #08: Stealth Vision Cones & Suspicion (? -> !) — Playable 3D Moonlit Museum Heist!
// Demonstrates why stealth games shrink guard vision cones (65 deg vs 140 deg human FOV), clip rays cleanly
// around cover pillars, add distance/crouch suspicion meters (? -> !), and let distraction coins lure AI!
import { clamp, lerp } from "../../gl-utils.js";
import { createMuseumRenderer, HALL_BOUNDS, PILLARS } from "./museum-renderer.js";

const PLAY_BOUNDS = { minX: -6.78, maxX: 6.78, minZ: -5.58, maxZ: 5.58 };
const THIEF_R = 0.34;
const EXIT_POS = { x: 0.0, z: 4.9, r: 1.25 };

const RELIC_SPOTS = [
  { x: -5.4, z: -4.1 },
  { x:  0.0, z:  0.0 },
  { x:  5.4, z: -4.1 },
];

const PATROLS = [
  [
    { x: -1.85, z: -0.35, pause: 0.9, look: -Math.PI * 0.32 },
    { x: -1.85, z:  2.35, pause: 0.8, look: -Math.PI * 0.55 },
    { x: -5.45, z:  0.15, pause: 0.7, look:  Math.PI * 0.5 },
    { x: -5.45, z: -4.25, pause: 0.8, look:  0.0 },
    { x: -1.85, z: -4.25, pause: 0.7, look: -Math.PI * 0.25 },
  ],
  [
    { x:  1.85, z: -0.35, pause: 0.9, look:  Math.PI * 0.32 },
    { x:  1.85, z:  2.35, pause: 0.8, look:  Math.PI * 0.55 },
    { x:  5.45, z:  0.15, pause: 0.7, look: -Math.PI * 0.5 },
    { x:  5.45, z: -4.25, pause: 0.8, look:  0.0 },
    { x:  1.85, z: -4.25, pause: 0.7, look:  Math.PI * 0.25 },
  ],
];

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

// 2D Slab Ray-AABB intersection returning distance t >= 0 or Infinity
function rayAabbDist(ox, oz, dx, dz, minX, maxX, minZ, maxZ) {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    let tx1 = (minX - ox) / dx;
    let tx2 = (maxX - ox) / dx;
    if (tx1 > tx2) { const tmp = tx1; tx1 = tx2; tx2 = tmp; }
    tmin = Math.max(tmin, tx1);
    tmax = Math.min(tmax, tx2);
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    let tz1 = (minZ - oz) / dz;
    let tz2 = (maxZ - oz) / dz;
    if (tz1 > tz2) { const tmp = tz1; tz1 = tz2; tz2 = tmp; }
    tmin = Math.max(tmin, tz1);
    tmax = Math.min(tmax, tz2);
  }
  if (tmax < 0 || tmin > tmax) return Infinity;
  return tmin >= 0 ? tmin : tmax;
}

function castRay(ox, oz, dx, dz, maxDist) {
  let best = maxDist;
  // Hall walls
  if (dx < -1e-6) best = Math.min(best, (HALL_BOUNDS.minX - ox) / dx);
  if (dx >  1e-6) best = Math.min(best, (HALL_BOUNDS.maxX - ox) / dx);
  if (dz < -1e-6) best = Math.min(best, (HALL_BOUNDS.minZ - oz) / dz);
  if (dz >  1e-6) best = Math.min(best, (HALL_BOUNDS.maxZ - oz) / dz);
  // 6 Marble Cover Pillars
  for (const p of PILLARS) {
    const t = rayAabbDist(ox, oz, dx, dz, p.x - p.hx, p.x + p.hx, p.z - p.hz, p.z + p.hz);
    if (t >= 0 && t < best) best = t;
  }
  return Math.max(0.05, best);
}

function hasLineOfSight(gx, gz, tx, tz) {
  const dx = tx - gx;
  const dz = tz - gz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return true;
  const hit = castRay(gx, gz, dx / dist, dz / dist, dist + 0.05);
  return hit >= dist - 0.14;
}

function computeVisionCone(guard, halfFov, range) {
  // Sample uniform fan rays + pillar corner rays inside FOV so shadow edges clip with razor accuracy!
  const angles = [];
  const N = 56;
  for (let i = 0; i <= N; i++) {
    angles.push(-halfFov + (i / N) * (halfFov * 2));
  }
  for (const p of PILLARS) {
    const corners = [
      [p.x - p.hx, p.z - p.hz],
      [p.x + p.hx, p.z - p.hz],
      [p.x + p.hx, p.z + p.hz],
      [p.x - p.hx, p.z + p.hz],
    ];
    for (const [cx, cz] of corners) {
      const ang = wrapAngle(Math.atan2(cx - guard.x, cz - guard.z) - guard.yaw);
      if (Math.abs(ang) < halfFov - 0.004) {
        angles.push(ang - 0.0025, ang, ang + 0.0025);
      }
    }
  }
  angles.sort((a, b) => a - b);

  const pts = [];
  for (const rel of angles) {
    const a = guard.yaw + rel;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const d = castRay(guard.x, guard.z, dx, dz, range);
    pts.push({ x: guard.x + dx * d, z: guard.z + dz * d, dist: d, rel });
  }
  return pts;
}

function resolveCircleAabb(x, z, r) {
  let nx = clamp(x, PLAY_BOUNDS.minX + r, PLAY_BOUNDS.maxX - r);
  let nz = clamp(z, PLAY_BOUNDS.minZ + r, PLAY_BOUNDS.maxZ - r);
  for (const p of PILLARS) {
    const minX = p.x - p.hx, maxX = p.x + p.hx;
    const minZ = p.z - p.hz, maxZ = p.z + p.hz;
    const cx = clamp(nx, minX, maxX);
    const cz = clamp(nz, minZ, maxZ);
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        // Inside AABB fallback: push out to nearest face
        const dl = Math.abs(nx - minX), dr = Math.abs(maxX - nx);
        const dt = Math.abs(nz - minZ), db = Math.abs(maxZ - nz);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) nx = minX - r;
        else if (m === dr) nx = maxX + r;
        else if (m === dt) nz = minZ - r;
        else nz = maxZ + r;
      }
    }
  }
  return { x: nx, z: nz };
}

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createMuseumRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.86, dist: 19.6, targetX: 0.0, targetY: 0.25, targetZ: 0.35, fovDeg: 40 };

  let time = 0;
  let realisticMode = false; // false = Game Stealth (65° + ?->! meter), true = Realistic Human Vision (140° + 0ms instant!)
  let showOverlay = true;
  let crouchToggled = false;

  let heists = 0;
  let spottedCount = 0;
  let coinLures = 0;
  let peekSaves = 0;
  let alertPulse = 0;
  let caughtFreeze = 0;
  let bannerText = "";
  let bannerColor = "#a78bfa";
  let bannerTimer = 0;

  // Deterministic 1-Click Peek Test state
  let peekTest = null;

  const thief = {
    x: 5.1, y: 0, z: 3.9,
    yaw: -Math.PI * 0.82,
    walkPhase: 0,
    walkAmp: 0,
    crouching: false,
    crouchBlend: 0,
    tossAnim: 0,
    footstepCd: 0,
    noiseRadius: 0,
  };

  let guards = [];
  let relics = [];
  let coins = [];
  let ripples = [];
  let sparks = [];

  function setBanner(text, color = "#a78bfa", dur = 1.9) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.8;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.5 + Math.random() * 2.6,
        vz: Math.sin(a) * sp,
        r, g, b,
        size: 0.14 + Math.random() * 0.12,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  function spawnRipple(x, z, maxR, col = [1.0, 0.78, 0.22], life = 0.85) {
    ripples.push({ x, z, maxR, col, age: 0, life });
  }

  function getVisionParams() {
    return realisticMode
      ? { halfFov: (70 * Math.PI) / 180, range: 9.2, fillBase: 999.0, noiseRun: 5.0 }
      : { halfFov: (32.5 * Math.PI) / 180, range: 6.8, fillBase: 0.96, noiseRun: 3.2 };
  }

  function initGuards() {
    const vp = getVisionParams();
    guards = PATROLS.map((route, idx) => {
      const start = route[0];
      const g = {
        id: idx,
        x: start.x,
        z: start.z,
        yaw: start.look,
        route,
        wpIdx: 1,
        pauseTimer: 0.35 + idx * 0.3,
        walkPhase: idx * 2.1,
        walkAmp: 0,
        headScan: 0,
        suspicion: 0,
        fillRate: 0,
        seesThief: false,
        investigating: false,
        investigateX: 0,
        investigateZ: 0,
        investigateTimer: 0,
        range: vp.range,
        halfFov: vp.halfFov,
        conePoints: [],
      };
      g.conePoints = computeVisionCone(g, g.halfFov, g.range);
      return g;
    });
  }

  function initRelics() {
    relics = RELIC_SPOTS.map((s) => ({ x: s.x, z: s.z, collected: false }));
  }

  function resetThiefPosition() {
    thief.x = 5.1;
    thief.z = 3.9;
    thief.yaw = -Math.PI * 0.82;
    thief.walkAmp = 0;
    thief.tossAnim = 0;
    thief.noiseRadius = 0;
  }

  function reset(keepCounters = false) {
    peekTest = null;
    caughtFreeze = 0;
    alertPulse = 0;
    coins = [];
    ripples = [];
    sparks = [];
    if (!keepCounters) {
      heists = 0;
      spottedCount = 0;
      coinLures = 0;
      peekSaves = 0;
    }
    resetThiefPosition();
    initGuards();
    initRelics();
    bannerTimer = 0;
  }

  reset(false);

  function alertGuardsBySound(sx, sz, radius, isCoin = false) {
    let lured = 0;
    for (const g of guards) {
      const d = Math.hypot(g.x - sx, g.z - sz);
      if (d <= radius) {
        g.investigating = true;
        g.investigateX = sx;
        g.investigateZ = sz;
        g.investigateTimer = isCoin ? 3.8 : 2.1;
        g.suspicion = Math.max(g.suspicion, isCoin ? 0.28 : 0.34);
        lured++;
      }
    }
    if (lured > 0 && isCoin) {
      coinLures++;
      audio?.suspicionTick?.(0.45);
      setBanner(
        "GUARD LURED! (? INVESTIGATING)",
        "#fbbf24",
        1.7
      );
    }
  }

  function tossCoin(targetX = null, targetZ = null) {
    if (caughtFreeze > 0) return;
    peekTest = null;
    thief.tossAnim = 1.0;
    let tx = targetX;
    let tz = targetZ;
    if (tx == null || tz == null) {
      tx = thief.x + Math.sin(thief.yaw) * 3.8;
      tz = thief.z + Math.cos(thief.yaw) * 3.8;
    }
    const clamped = resolveCircleAabb(tx, tz, 0.22);
    coins.push({
      sx: thief.x, sz: thief.z,
      tx: clamped.x, tz: clamped.z,
      x: thief.x, y: 1.05, z: thief.z,
      t: 0, dur: 0.38,
      landed: false,
      stay: 1.4,
    });
    audio?.dodge?.();
  }

  function startPeekTest() {
    // Deterministic pillar-peek showcase: Guard 0 stands in open West aisle (-1.45, 1.55) looking West past P3 (-3.6, 2.1)!
    // Thief hides 100% occluded behind P3 at (-4.95, 2.15), peeks north to (-4.95, 0.72) for 0.62s, then ducks back!
    // Game Stealth: builds ~48% yellow ? and SURVIVES! Realistic Vision: 0ms INSTANT ! CAUGHT !
    caughtFreeze = 0;
    alertPulse = 0;
    coins = [];
    ripples = [];
    const vp = getVisionParams();
    const g0 = guards[0];
    g0.x = -1.45;
    g0.z = 1.55;
    g0.yaw = -Math.PI * 0.5;
    g0.suspicion = 0;
    g0.investigating = false;
    g0.pauseTimer = 5.0;
    g0.range = vp.range;
    g0.halfFov = vp.halfFov;
    g0.conePoints = computeVisionCone(g0, g0.halfFov, g0.range);

    // Guard 1 patrols East aisle visibly while Guard 0 cleanly isolates the Pillar-Peek demo
    const g1 = guards[1];
    g1.x = 1.85;
    g1.z = -1.1;
    g1.yaw = Math.PI * 0.35;
    g1.suspicion = 0;
    g1.investigating = false;
    g1.pauseTimer = 5.0;
    g1.conePoints = computeVisionCone(g1, vp.halfFov, vp.range);

    thief.x = -4.95;
    thief.z = 2.15;
    thief.yaw = Math.PI * 0.5;
    thief.crouching = false;
    thief.crouchBlend = 0;
    thief.walkAmp = 0;

    peekTest = {
      t: 0,
      maxSusp: 0,
      spotted: false,
      done: false,
    };
    setBanner(
      realisticMode ? "PEEK TEST · REALISTIC (0 ms)..." : "PEEK TEST · GAME STEALTH (? -> !)...",
      realisticMode ? "#ef4444" : "#38bdf8",
      1.4
    );
  }

  function update(dt, keys) {
    time += dt;
    const vp = getVisionParams();

    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (thief.tossAnim > 0) thief.tossAnim = Math.max(0, thief.tossAnim - dt * 3.4);

    // Update sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.8 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.05, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    // Update acoustic ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.age += dt;
      if (rp.age >= rp.life) ripples.splice(i, 1);
    }

    // Update flying/landed brass coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (!c.landed) {
        c.t += dt;
        const u = clamp(c.t / c.dur, 0, 1);
        c.x = lerp(c.sx, c.tx, u);
        c.z = lerp(c.sz, c.tz, u);
        c.y = (1 - u) * 1.05 + 4 * u * (1 - u) * 1.25;
        if (u >= 1) {
          c.landed = true;
          c.y = 0.04;
          audio?.coinClink?.();
          spawnSparks(c.x, 0.14, c.z, 1.0, 0.84, 0.24, 10);
          spawnRipple(c.x, c.z, 5.8, [1.0, 0.80, 0.24], 0.95);
          alertGuardsBySound(c.x, c.z, 5.8, true);
        }
      } else {
        c.stay -= dt;
        if (c.stay <= 0) coins.splice(i, 1);
      }
    }

    // Caught freeze recovery
    if (caughtFreeze > 0) {
      caughtFreeze -= dt;
      alertPulse = clamp(caughtFreeze / 1.15, 0, 1);
      if (caughtFreeze <= 0) {
        alertPulse = 0;
        for (const g of guards) {
          g.suspicion = 0;
          g.investigating = false;
        }
        resetThiefPosition();
      }
      return;
    }

    // Thief Movement (either 1-Click Peek Test autopilot OR live player WASD/Arrows + Shift crouch)
    let moveX = 0, moveZ = 0;
    if (peekTest && !peekTest.done) {
      peekTest.t += dt;
      const t = peekTest.t;
      let targetZ = 2.15;
      if (t < 0.30) {
        targetZ = 2.15; // hidden 100% occluded behind marble pillar P3
      } else if (t < 0.96) {
        targetZ = 0.65; // peek straight into Guard 0's unoccluded beam!
      } else if (t < 1.88) {
        targetZ = 2.15; // duck back into pillar cover!
      } else {
        peekTest.done = true;
        if (!peekTest.spotted) {
          peekSaves++;
          audio?.coyoteSave?.();
          setBanner(
            `PEEK SURVIVED! (? ${Math.round(peekTest.maxSusp * 100)}% -> SAFE)`,
            "#34d399",
            2.4
          );
        }
      }
      const dz = targetZ - thief.z;
      if (Math.abs(dz) > 0.04) {
        moveZ = Math.sign(dz);
      }
      thief.crouching = false;
    } else {
      const w = keys?.has("KeyW") || keys?.has("ArrowUp");
      const s = keys?.has("KeyS") || keys?.has("ArrowDown");
      const a = keys?.has("KeyA") || keys?.has("ArrowLeft");
      const d = keys?.has("KeyD") || keys?.has("ArrowRight");
      moveX = (d ? 1 : 0) - (a ? 1 : 0);
      moveZ = (s ? 1 : 0) - (w ? 1 : 0);
      const shiftHeld = keys?.has("ShiftLeft") || keys?.has("ShiftRight");
      thief.crouching = shiftHeld || crouchToggled;
    }

    thief.crouchBlend = lerp(thief.crouchBlend, thief.crouching ? 1 : 0, clamp(dt * 14, 0, 1));
    const moveLen = Math.hypot(moveX, moveZ);
    const speed = thief.crouching ? 2.65 : 4.85;
    if (moveLen > 0.01) {
      const mx = moveX / moveLen;
      const mz = moveZ / moveLen;
      const next = resolveCircleAabb(thief.x + mx * speed * dt, thief.z + mz * speed * dt, THIEF_R);
      thief.x = next.x;
      thief.z = next.z;
      const desiredYaw = Math.atan2(mx, mz);
      thief.yaw = approachAngle(thief.yaw, desiredYaw, dt * 13.0);
      thief.walkAmp = lerp(thief.walkAmp, thief.crouching ? 0.65 : 1.0, clamp(dt * 12, 0, 1));
      thief.walkPhase += dt * (thief.crouching ? 6.8 : 11.2);

      // Running emits footstep ripples (crouching is 100% silent!)
      if (!thief.crouching && !peekTest) {
        thief.noiseRadius = vp.noiseRun;
        thief.footstepCd -= dt;
        if (thief.footstepCd <= 0) {
          thief.footstepCd = 0.42;
          spawnRipple(thief.x, thief.z, vp.noiseRun, [0.58, 0.42, 1.0], 0.55);
          alertGuardsBySound(thief.x, thief.z, vp.noiseRun, false);
        }
      } else {
        thief.noiseRadius = 0;
      }
    } else {
      thief.walkAmp = lerp(thief.walkAmp, 0, clamp(dt * 12, 0, 1));
      thief.noiseRadius = lerp(thief.noiseRadius, 0, clamp(dt * 10, 0, 1));
    }

    // Collect Relics
    let collectedCount = 0;
    for (const rel of relics) {
      if (rel.collected) {
        collectedCount++;
        continue;
      }
      if (Math.hypot(thief.x - rel.x, thief.z - rel.z) < 1.05) {
        rel.collected = true;
        collectedCount++;
        audio?.coinPickup?.();
        spawnSparks(rel.x, 1.15, rel.z, 0.16, 1.0, 0.68, 20);
        setBanner(
          collectedCount === relics.length
            ? "ALL 3 RELICS STOLEN! HEAD TO SKYLIGHT EXIT!"
            : `RELIC STOLEN (${collectedCount}/${relics.length})`,
          "#34d399",
          1.9
        );
      }
    }

    // Check Skylight Escape Extraction Pad
    const exitReady = collectedCount === relics.length;
    if (exitReady && Math.hypot(thief.x - EXIT_POS.x, thief.z - EXIT_POS.z) < EXIT_POS.r) {
      heists++;
      audio?.goalWin?.();
      spawnSparks(EXIT_POS.x, 0.8, EXIT_POS.z, 0.58, 0.36, 1.0, 26);
      initRelics();
      setBanner(`VAULT HEIST #${heists} COMPLETE!`, "#a78bfa", 2.3);
    }

    // Update Patrolling Lantern Guards + Real-Time Raycast Vision Cones + Suspicion (? -> !)
    let maxSusp = 0;
    for (const g of guards) {
      g.halfFov = vp.halfFov;
      g.range = vp.range;

      // Guard locomotion (skip patrol locomotion while Peek Test locks Guard 0's beam!)
      const lockedForPeek = peekTest && !peekTest.done;
      if (!lockedForPeek) {
        if (g.investigating) {
          const dx = g.investigateX - g.x;
          const dz = g.investigateZ - g.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.65) {
            const desiredYaw = Math.atan2(dx, dz);
            g.yaw = approachAngle(g.yaw, desiredYaw, dt * 4.8);
            const step = Math.min(dist, 2.35 * dt);
            const next = resolveCircleAabb(g.x + (dx / dist) * step, g.z + (dz / dist) * step, 0.42);
            g.x = next.x;
            g.z = next.z;
            g.walkAmp = lerp(g.walkAmp, 0.9, clamp(dt * 10, 0, 1));
            g.walkPhase += dt * 7.8;
            g.headScan = lerp(g.headScan, 0, clamp(dt * 8, 0, 1));
          } else {
            // Reached distraction spot — scan left & right suspiciously!
            g.walkAmp = lerp(g.walkAmp, 0, clamp(dt * 10, 0, 1));
            g.investigateTimer -= dt;
            g.headScan = Math.sin(time * 4.2 + g.id) * 0.52;
            g.yaw = wrapAngle(g.yaw + Math.sin(time * 2.4) * dt * 1.1);
            if (g.investigateTimer <= 0) {
              g.investigating = false;
            }
          }
        } else {
          // Normal waypoint patrol loop
          const wp = g.route[g.wpIdx];
          const dx = wp.x - g.x;
          const dz = wp.z - g.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.14) {
            const desiredYaw = Math.atan2(dx, dz);
            g.yaw = approachAngle(g.yaw, desiredYaw, dt * 4.2);
            const step = Math.min(dist, 1.95 * dt);
            g.x += (dx / dist) * step;
            g.z += (dz / dist) * step;
            g.walkAmp = lerp(g.walkAmp, 0.85, clamp(dt * 10, 0, 1));
            g.walkPhase += dt * 6.5;
            g.headScan = lerp(g.headScan, 0, clamp(dt * 8, 0, 1));
          } else {
            g.walkAmp = lerp(g.walkAmp, 0, clamp(dt * 10, 0, 1));
            g.yaw = approachAngle(g.yaw, wp.look, dt * 3.0);
            g.headScan = Math.sin(time * 2.8 + g.id) * 0.34;
            g.pauseTimer -= dt;
            if (g.pauseTimer <= 0) {
              g.wpIdx = (g.wpIdx + 1) % g.route.length;
              g.pauseTimer = g.route[g.wpIdx].pause;
            }
          }
        }
      } else {
        g.walkAmp = 0;
        g.headScan = 0;
      }

      // Compute exact ray-clipped vision polygon around all 6 marble pillars!
      g.conePoints = computeVisionCone(g, g.halfFov, g.range);

      // Line-of-Sight & FOV Detection Check
      const tx = thief.x - g.x;
      const tz = thief.z - g.z;
      const distToThief = Math.hypot(tx, tz);
      const angToThief = Math.abs(wrapAngle(Math.atan2(tx, tz) - g.yaw));
      const inCone = distToThief <= g.range && angToThief <= g.halfFov;
      const visible = inCone && hasLineOfSight(g.x, g.z, thief.x, thief.z);
      g.seesThief = visible;

      if (visible) {
        if (realisticMode) {
          g.fillRate = 999;
          g.suspicion = 1.0;
        } else {
          const distFactor = clamp(1.32 - distToThief / 7.8, 0.40, 1.32);
          const crouchFactor = thief.crouching ? 0.45 : 1.0;
          g.fillRate = vp.fillBase * distFactor * crouchFactor;
          const prevBucket = Math.floor(g.suspicion * 5);
          g.suspicion = clamp(g.suspicion + g.fillRate * dt, 0, 1);
          if (Math.floor(g.suspicion * 5) > prevBucket && g.suspicion < 1) {
            audio?.suspicionTick?.(g.suspicion);
          }
        }
      } else {
        g.fillRate = 0;
        g.suspicion = Math.max(0, g.suspicion - dt * 0.56);
      }

      maxSusp = Math.max(maxSusp, g.suspicion);
      if (peekTest && !peekTest.done) {
        peekTest.maxSusp = Math.max(peekTest.maxSusp, g.suspicion);
      }

      // Alert Triggered (! SPOTTED !)
      if (g.suspicion >= 0.999) {
        spottedCount++;
        caughtFreeze = 1.25;
        alertPulse = 1.0;
        audio?.alertBuzzer?.();
        spawnSparks(thief.x, 1.2, thief.z, 1.0, 0.16, 0.24, 24);
        if (peekTest && !peekTest.done) {
          peekTest.spotted = true;
          peekTest.done = true;
          setBanner("! INSTA-SPOTTED IN 0 ms ! (REALISTIC FOV)", "#ef4444", 2.3);
        } else {
          setBanner(
            realisticMode ? "! SPOTTED INSTANTLY ! (140° REALISTIC)" : "! SPOTTED ! BACK TO SHADOWS",
            "#ef4444",
            1.8
          );
        }
        break;
      }
    }

    if (caughtFreeze <= 0) {
      alertPulse = lerp(alertPulse, maxSusp > 0.7 ? (maxSusp - 0.7) * 0.9 : 0, clamp(dt * 8, 0, 1));
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);

    const isPl = lang === "pl";
    const collected = relics.filter((r) => r.collected).length;
    const exitReady = collected === relics.length;
    const topGuard = guards.reduce((a, b) => (b.suspicion > a.suspicion ? b : a), guards[0]);
    const maxSusp = topGuard ? topGuard.suspicion : 0;

    // 1) World-space X-Ray Vision Ray Sample Lines + Floating ? / ! Meters above Guards
    if (showOverlay) {
      for (const g of guards) {
        const gHead = projectToScreen(viewProj, g.x, 2.25, g.z, cssW, cssH);
        const gOrig = projectToScreen(viewProj, g.x, 0.10, g.z, cssW, cssH);

        // Draw crisp subtle raycast fan lines hitting pillars!
        if (gOrig && g.conePoints.length > 0) {
          ctx.save();
          ctx.lineWidth = 1;
          ctx.strokeStyle = g.suspicion >= 0.99
            ? "rgba(248,113,113,0.42)"
            : g.suspicion > 0.05 || g.investigating
              ? "rgba(251,191,36,0.34)"
              : realisticMode
                ? "rgba(244,63,94,0.24)"
                : "rgba(56,189,248,0.26)";
          const stride = Math.max(1, Math.floor(g.conePoints.length / 13));
          ctx.beginPath();
          for (let i = 0; i < g.conePoints.length; i += stride) {
            const pt = g.conePoints[i];
            const sp = projectToScreen(viewProj, pt.x, 0.10, pt.z, cssW, cssH);
            if (sp) {
              ctx.moveTo(gOrig.x, gOrig.y);
              ctx.lineTo(sp.x, sp.y);
            }
          }
          ctx.stroke();
          ctx.restore();
        }

        // Floating ? / ! Suspicion Meter Badge above guard helmet
        if (gHead && (g.suspicion > 0.02 || g.investigating)) {
          const isAlert = g.suspicion >= 0.99;
          const r = 17;
          ctx.save();
          ctx.beginPath();
          ctx.arc(gHead.x, gHead.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(11,14,28,0.88)";
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = "rgba(148,163,184,0.28)";
          ctx.stroke();

          // Progress ring arc
          const fill = isAlert ? 1.0 : Math.max(g.suspicion, g.investigating ? 0.25 : 0);
          ctx.beginPath();
          ctx.arc(gHead.x, gHead.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
          ctx.strokeStyle = isAlert ? "#ef4444" : "#fbbf24";
          ctx.stroke();

          ctx.font = "900 18px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = isAlert ? "#fca5a5" : "#fde68a";
          ctx.fillText(isAlert ? "!" : "?", gHead.x, gHead.y + 1);
          ctx.restore();
        }
      }

      // Label Escape Pad
      const exitScr = projectToScreen(viewProj, EXIT_POS.x, 0.25, EXIT_POS.z, cssW, cssH);
      if (exitScr) {
        ctx.save();
        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = exitReady ? "#34d399" : "rgba(196,181,253,0.72)";
        ctx.fillText(
          exitReady ? (isPl ? "WYJŚCIE GOTOWE" : "EXIT OPEN") : (isPl ? "STREFA UCIECZKI" : "SKYLIGHT EXIT"),
          exitScr.x, exitScr.y
        );
        ctx.restore();
      }
    }

    // 2) Top-Right Live Stealth Detection Math Telemetry HUD (compact 1-line pill on mobile, full card on desktop!)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const pillText = realisticMode
          ? (isPl ? `REAL 140° · 0 ms · Relikty ${collected}/${relics.length}` : `REAL 140° · 0 ms · Relics ${collected}/${relics.length}`)
          : (isPl ? `SKRADANIE 65° · ? ${Math.round(maxSusp * 100)}% · Relikty ${collected}/${relics.length}` : `STEALTH 65° · ? ${Math.round(maxSusp * 100)}% · Relics ${collected}/${relics.length}`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pillText).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(10, 12, 26, 0.84)";
        ctx.strokeStyle = realisticMode ? "rgba(239, 68, 68, 0.72)" : "rgba(139, 92, 246, 0.68)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px, py, tw, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = realisticMode ? "#fca5a5" : "#c4b5fd";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pillText, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
      const pad = 14;
      const panelW = Math.min(288, cssW - 28);
      const panelH = 144;
      const px = cssW - panelW - pad;

    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 26, 0.84)";
    ctx.strokeStyle = realisticMode ? "rgba(239, 68, 68, 0.65)" : "rgba(139, 92, 246, 0.58)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 10);
    ctx.fill();
    ctx.stroke();

    // Header badge
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = realisticMode ? "#f87171" : "#c4b5fd";
    ctx.fillText(
      realisticMode
        ? (isPl ? "REALISTYCZNY WZROK · 140° · 0 ms" : "REALISTIC VISION · 140° · 0 ms")
        : (isPl ? "SKRADANIE GRY · 65° + ? → !" : "GAME STEALTH · 65° + ? → !"),
      px + 12, py + 21
    );

    // Suspicion Meter Bar
    const barX = px + 12, barY = py + 34, barW = panelW - 24, barH = 14;
    ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    if (maxSusp > 0.005) {
      ctx.fillStyle = maxSusp >= 0.99 ? "#ef4444" : maxSusp > 0.6 ? "#f97316" : "#fbbf24";
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(4, barW * clamp(maxSusp, 0, 1)), barH, 4);
      ctx.fill();
    }
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(
      isPl ? `PODEJRZENIE (? → !): ${Math.round(maxSusp * 100)}%` : `SUSPICION (? → !): ${Math.round(maxSusp * 100)}%`,
      barX + 6, barY + 10.5
    );

    // Detection Math Row
    const rateLabel = realisticMode
      ? (isPl ? "NATYCHMIAST!" : "INSTANT!")
      : topGuard?.seesThief
        ? `+${Math.round(topGuard.fillRate * 100)}%/s`
        : "0%/s";
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(
      isPl
        ? `Stożek: ${realisticMode ? "140° / 9.2m" : "65° / 6.8m"}  ·  ${rateLabel}`
        : `Cone: ${realisticMode ? "140° / 9.2m" : "65° / 6.8m"}  ·  ${rateLabel}`,
      px + 12, py + 68
    );

    // Posture & Footstep Noise Row
    ctx.fillStyle = thief.crouching ? "#34d399" : "#94a3b8";
    ctx.fillText(
      thief.crouching
        ? (isPl ? "Pozycja: KUCANIE (×0.45 · CISZA 0m)" : "Posture: CROUCH (×0.45 · SILENT)")
        : (isPl ? `Pozycja: BIEG (×1.0 · HAŁAS ${getVisionParams().noiseRun.toFixed(1)}m)` : `Posture: STAND (×1.0 · NOISE ${getVisionParams().noiseRun.toFixed(1)}m)`),
      px + 12, py + 88
    );

    // Counters Row
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(
      isPl
        ? `Relikty: ${collected}/${relics.length}  ·  Skoki: ${heists}  ·  Alarmy: ${spottedCount}`
        : `Relics: ${collected}/${relics.length}  ·  Heists: ${heists}  ·  Alerts: ${spottedCount}`,
      px + 12, py + 110
    );

    ctx.fillStyle = "#a78bfa";
    ctx.fillText(
      isPl
        ? `Wabiki: ${coinLures}  ·  Ocalenia Peek: ${peekSaves}`
        : `Coin Lures: ${coinLures}  ·  Peek Saves: ${peekSaves}`,
      px + 12, py + 130
    );
    ctx.restore();
      }
    }

    // 3) Center Top Action Banner
    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = "800 14px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = tw + 28;
      const bx = (cssW - bw) * 0.5;
      const by = 76;
      ctx.fillStyle = "rgba(10, 12, 26, 0.90)";
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
    reset() {
      reset(false);
    },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        {
          id: "toggle-mode",
          label: realisticMode
            ? (pl ? "Wzrok: Realistyczny (140°) [T]" : "Vision: Realistic (140°) [T]")
            : (pl ? "Wzrok: Skradanie Gry (65°) [T]" : "Vision: Game Stealth (65°) [T]"),
          pressed: !realisticMode,
        },
        {
          id: "toss-coin",
          label: pl ? "Rzuć Monetę [E / Klik]" : "Toss Coin [E / Click]",
          pressed: false,
        },
        {
          id: "peek-test",
          label: pl ? "Test Wychylenia [V]" : "Peek Test [V]",
          pressed: !!(peekTest && !peekTest.done),
        },
        {
          id: "toggle-crouch",
          label: crouchToggled
            ? (pl ? "Kucanie: WŁ [Shift]" : "Crouch: ON [Shift]")
            : (pl ? "Kucanie: WYŁ [Shift]" : "Crouch: OFF [Shift]"),
          pressed: crouchToggled,
        },
        {
          id: "toggle-overlay",
          label: showOverlay
            ? (pl ? "X-Ray Promieni: WŁ [X]" : "X-Ray Rays: ON [X]")
            : (pl ? "X-Ray Promieni: WYŁ [X]" : "X-Ray Rays: OFF [X]"),
          pressed: showOverlay,
        },
      ];
    },
    onAction(id) {
      if (id === "toggle-mode") {
        realisticMode = !realisticMode;
        for (const g of guards) {
          g.suspicion = 0;
          const vp = getVisionParams();
          g.halfFov = vp.halfFov;
          g.range = vp.range;
          g.conePoints = computeVisionCone(g, g.halfFov, g.range);
        }
        setBanner(
          realisticMode ? "REALISTIC HUMAN VISION (140° · 0 ms SPOT!)" : "GAME STEALTH (65° CONE + ? -> ! METER)",
          realisticMode ? "#ef4444" : "#a78bfa",
          1.9
        );
      } else if (id === "toss-coin") {
        tossCoin();
      } else if (id === "peek-test") {
        startPeekTest();
      } else if (id === "toggle-crouch") {
        crouchToggled = !crouchToggled;
      } else if (id === "toggle-overlay") {
        showOverlay = !showOverlay;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-mode");
      else if (code === "KeyE" || code === "Space") this.onAction("toss-coin");
      else if (code === "KeyV") this.onAction("peek-test");
      else if (code === "KeyX") this.onAction("toggle-overlay");
      else if (code === "KeyC") this.onAction("toggle-crouch");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        tossCoin(world[0], world[2]);
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const exitReady = relics.every((r) => r.collected);
      const { viewProj } = renderer.render(w, h, cam, {
        time,
        alertPulse,
        exitReady,
        realisticMode,
        showOverlay,
        thief,
        guards,
        relics,
        coins,
        ripples,
        sparks,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const g0 = guards[0];
      return {
        realisticMode,
        showOverlay,
        crouching: thief.crouching,
        thiefPos: [Number(thief.x.toFixed(2)), Number(thief.z.toFixed(2))],
        relicsCollected: relics.filter((r) => r.collected).length,
        heists,
        spottedCount,
        coinLures,
        peekSaves,
        maxSuspicion: Number(Math.max(...guards.map((g) => g.suspicion)).toFixed(3)),
        guard0ConePts: g0 ? g0.conePoints.length : 0,
        guard0Investigating: g0 ? g0.investigating : false,
        peekTest: peekTest ? { ...peekTest, maxSusp: Number(peekTest.maxSusp.toFixed(3)) } : null,
      };
    },
  };
}
