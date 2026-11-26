// Playable 3D Figure-8 Overpass Racing Simulation for Game Design Codex (/gdc/rubber-banding/)
// Features: 3D overpass ramp elevation + pitch, elevation-aware real Car-to-Car collisions (sparks, knockback, bump SFX),
// and real Anti-Wall-Grinding barrier penalty (scrubbing speed + bounce inward so clean racing lines always beat wall-hugging!).
import { sampleTrack, TRACK_LENGTH, START_S, TRACK_HW } from "./track-renderer.js";

export const CAR_PRESETS = [
  { id: 0, name: "YOU",   isPlayer: true,  livery: [0.06, 0.90, 0.62], lane: -0.76, baseSpeed: 14.2 },
  { id: 1, name: "AI #1", isPlayer: false, livery: [0.94, 0.16, 0.24], lane:  0.76, baseSpeed: 14.0 },
  { id: 2, name: "AI #2", isPlayer: false, livery: [0.98, 0.64, 0.08], lane: -0.24, baseSpeed: 13.85 },
  { id: 3, name: "AI #3", isPlayer: false, livery: [0.24, 0.50, 0.98], lane:  0.28, baseSpeed: 13.70 },
];

// Local projection around hintS (+/- 8.5 units) guarantees the Figure-8 crossing NEVER confuses upper bridge vs lower underpass!
function projectWorldToTrack(x, z, hintS) {
  let bestS = hintS;
  let bestD2 = Infinity;
  const STEPS = 36;
  for (let i = -STEPS; i <= STEPS; i++) {
    const s = hintS + (i / STEPS) * 8.5;
    const st = sampleTrack(s);
    const dx = x - st.x, dz = z - st.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestS = s; }
  }
  const st = sampleTrack(bestS);
  const dx = x - st.x, dz = z - st.z;
  const lat = dx * st.rx + dz * st.rz;
  return { s: bestS, lat, st };
}

export function createRubberBandSim(audio = null) {
  let rubberBandOn = true;
  let playerControl = false;
  let strength = 1.0;
  let time = 0;
  let nitro = 1.0;
  let prevNitroOn = false;
  let prevLap = 1;
  let wallCooldown = 0;
  let bumpCooldown = 0;
  let steerTarget = null;
  let collisionCount = 0;

  const cars = CAR_PRESETS.map((p, i) => ({
    ...p,
    s: START_S - i * 2.5,
    speed: p.baseSpeed,
    speedMult: 1.0,
    laneCur: p.lane,
    lanePushVel: 0,
    wheelAngle: 0,
    crashTimer: 0,
    boostTimer: 0,
    spinOffset: 0,
    hitFlash: 0,
    brakeGlow: 0,
    boostGlow: 0,
    wallGrind: false,
    x: 0, y: 0.03, z: 0, yaw: 0, pitch: 0,
    tx: 0, tz: 1,
    gapToPlayer: 0,
  }));

  const particles = [];

  function syncCarFromTrack(c) {
    const st = sampleTrack(c.s);
    c.x = st.x + st.rx * c.laneCur;
    c.y = st.y;
    c.z = st.z + st.rz * c.laneCur;
    c.yaw = st.yaw;
    c.pitch = st.pitch;
    c.tx = st.tx;
    c.tz = st.tz;
  }
  cars.forEach(syncCarFromTrack);

  function spawnSparkBurst(x, y, z, n = 14, withSmoke = false) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
      const spd = 1.8 + Math.random() * 4.2;
      const isSpark = !withSmoke || (i % 2 === 0);
      particles.push({
        x, y: y + 0.35 + Math.random() * 0.2, z,
        vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * spd,
        life: 0, maxLife: isSpark ? 0.48 + Math.random() * 0.22 : 0.85 + Math.random() * 0.35,
        size: isSpark ? 0.16 : 0.38,
        r: isSpark ? 2.6 : 0.92,
        g: isSpark ? 1.20 : 0.95,
        b: isSpark ? 0.22 : 1.0,
        a: isSpark ? 0.95 : 0.45,
      });
    }
  }

  function triggerCrash() {
    const p = cars[0];
    p.crashTimer = 1.55;
    p.boostTimer = 0;
    p.hitFlash = 1.0;
    p.speed *= 0.25;
    spawnSparkBurst(p.x, p.y, p.z, 24, true);
    audio?.crash?.();
  }

  function triggerBoost() {
    const p = cars[0];
    p.boostTimer = 2.2;
    p.crashTimer = 0;
    audio?.nitro?.();
  }

  function reset() {
    time = 0;
    nitro = 1.0;
    prevLap = 1;
    prevNitroOn = false;
    wallCooldown = 0;
    bumpCooldown = 0;
    collisionCount = 0;
    steerTarget = null;
    particles.length = 0;
    cars.forEach((c, i) => {
      c.s = START_S - i * 2.5;
      c.speed = c.baseSpeed;
      c.speedMult = 1.0;
      c.laneCur = c.lane;
      c.lanePushVel = 0;
      c.crashTimer = 0;
      c.boostTimer = 0;
      c.spinOffset = 0;
      c.hitFlash = 0;
      c.brakeGlow = 0;
      c.boostGlow = 0;
      c.wallGrind = false;
      c.gapToPlayer = 0;
      syncCarFromTrack(c);
    });
  }

  function step(dt, keys = new Set()) {
    const h = Math.min(0.05, Math.max(0.001, dt));
    time += h;
    wallCooldown = Math.max(0, wallCooldown - h);
    bumpCooldown = Math.max(0, bumpCooldown - h);
    const targetStr = rubberBandOn ? 1.0 : 0.0;
    strength += (targetStr - strength) * Math.min(1, h * 6.0);

    const p = cars[0];
    p.wallGrind = false;
    const up = keys.has("KeyW") || keys.has("ArrowUp");
    const dn = keys.has("KeyS") || keys.has("ArrowDown");
    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");
    const boostKey = keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (up || dn || lt || rt || boostKey) {
      playerControl = true;
      steerTarget = null;
    }

    let usingNitro = false;

    if (p.crashTimer > 0) {
      p.crashTimer = Math.max(0, p.crashTimer - h);
      const frac = p.crashTimer / 1.55;
      p.speed += (p.baseSpeed * 0.18 - p.speed) * Math.min(1, h * 5.0);
      p.s += p.speed * h;
      p.spinOffset = Math.sin(frac * Math.PI * 2.5) * 1.9 * frac;
      p.hitFlash = Math.max(0, p.hitFlash - h * 1.4);
      p.boostGlow = 0;
      p.brakeGlow = 0.7;
      syncCarFromTrack(p);
      if (Math.random() < 0.45) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + 0.25, z: p.z + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 0.7, vy: 1.1 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.7,
          life: 0, maxLife: 0.72, size: 0.34, r: 0.90, g: 0.93, b: 0.98, a: 0.42,
        });
      }
    } else if (playerControl) {
      p.spinOffset *= Math.max(0, 1 - h * 9);
      p.hitFlash = Math.max(0, p.hitFlash - h * 3);

      let steerIn = (lt ? 1 : 0) - (rt ? 1 : 0);
      let throttle = up ? 1 : dn ? -0.6 : 0;
      if (steerTarget && !up && !dn && !lt && !rt) {
        const dx = steerTarget[0] - p.x;
        const dz = steerTarget[2] - p.z;
        if (Math.hypot(dx, dz) < 1.6) {
          steerTarget = null;
        } else {
          const desiredYaw = Math.atan2(dx, dz);
          let diff = desiredYaw - p.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          steerIn = Math.max(-1, Math.min(1, diff * 2.3));
          throttle = 1.0;
        }
      }

      usingNitro = (boostKey && nitro > 0.04) || p.boostTimer > 0;
      if (usingNitro && !prevNitroOn) audio?.nitro?.();
      prevNitroOn = usingNitro;

      if (p.boostTimer > 0) p.boostTimer = Math.max(0, p.boostTimer - h);
      if (boostKey && nitro > 0.04) nitro = Math.max(0, nitro - h * 0.36);
      else nitro = Math.min(1, nitro + h * 0.22);

      const maxSpd = usingNitro ? 20.4 : 15.8;
      if (throttle > 0) p.speed = Math.min(maxSpd, p.speed + (usingNitro ? 28 : 18) * h);
      else if (throttle < 0) p.speed = Math.max(-4.5, p.speed - 22 * h);
      else p.speed *= Math.max(0, 1 - h * 1.10);

      const turnRate = 3.05 * (0.35 + 0.65 * Math.min(1, Math.abs(p.speed) / 9.5));
      p.yaw += steerIn * turnRate * h * (p.speed >= -0.1 ? 1 : -1);

      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      p.x += fx * p.speed * h;
      p.z += fz * p.speed * h;

      // Project onto continuous Figure-8 elevation & enforce REAL Anti-Wall-Grinding barrier physics!
      const proj = projectWorldToTrack(p.x, p.z, p.s);
      p.s = proj.s;
      p.y = proj.st.y;
      p.pitch = proj.st.pitch * Math.cos(p.yaw - proj.st.yaw);
      p.laneCur = proj.lat;

      const cleanGripLat = TRACK_HW - 0.30; // 1.62
      const barrierLat = TRACK_HW - 0.04;   // 1.88
      if (Math.abs(proj.lat) > barrierLat) {
        // ANTI-WALL-GRIND PENALTY: hard inward rebound + brutal gravel/barrier speed scrub (max ~6.2 vs AI's 14.0!)
        p.wallGrind = true;
        const sign = Math.sign(proj.lat);
        const bounceLat = (barrierLat - 0.14) * sign;
        p.x = proj.st.x + proj.st.rx * bounceLat;
        p.z = proj.st.z + proj.st.rz * bounceLat;
        p.laneCur = bounceLat;

        // Nudge car heading slightly back toward track center & cap speed sharply so wall-hugging ALWAYS loses!
        let dy = proj.st.yaw - p.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        p.yaw += dy * Math.min(1, h * 7.0) + (-sign) * 0.07;

        const wallCap = 6.2;
        if (p.speed > wallCap) {
          p.speed = Math.max(wallCap, p.speed * (1 - h * 10.5) - 2.6);
        }
        p.hitFlash = Math.max(p.hitFlash, 0.45);
        if (wallCooldown <= 0) {
          wallCooldown = 0.22;
          spawnSparkBurst(p.x, p.y, p.z, 10, false);
          audio?.wallScrape?.();
        }
      } else if (Math.abs(proj.lat) > cleanGripLat) {
        // Red/white apex curb rumble slightly scrubs top speed so staying on dark tarmac is fastest!
        p.speed = Math.min(p.speed, usingNitro ? 16.5 : 12.2);
      }

      p.wheelAngle += p.speed * h * 3.6;
      p.boostGlow = usingNitro ? 1.0 : Math.max(0, p.boostGlow - h * 5);
      p.brakeGlow = dn ? 0.9 : Math.max(0, p.brakeGlow - h * 5);
    } else {
      let pTargetSpeed = p.baseSpeed * (1.0 + 0.04 * Math.sin(time * 0.9));
      if (p.boostTimer > 0) {
        p.boostTimer = Math.max(0, p.boostTimer - h);
        pTargetSpeed = p.baseSpeed * 1.44;
        p.boostGlow = 1.0;
        usingNitro = true;
      } else {
        p.boostGlow *= Math.max(0, 1 - h * 5);
      }
      p.spinOffset *= Math.max(0, 1 - h * 8);
      p.brakeGlow *= Math.max(0, 1 - h * 5);
      p.speed += (pTargetSpeed - p.speed) * Math.min(1, h * 4.5);
      p.s += p.speed * h;
      p.wheelAngle += p.speed * h * 3.6;
      p.laneCur += (p.lane + Math.sin(time * 0.7) * 0.30 - p.laneCur) * Math.min(1, h * 2.0);
      syncCarFromTrack(p);
    }

    audio?.setEngine?.(playerControl ? Math.min(1, Math.abs(p.speed) / 16.5) : 0, usingNitro);

    // 2) AI Rivals with Elastic Rubber Banding + lateral collision recoil!
    for (let i = 1; i < cars.length; i++) {
      const c = cars[i];
      const gap = c.s - p.s;
      c.gapToPlayer = gap;
      c.hitFlash = Math.max(0, c.hitFlash - h * 3.0);

      let mult = 1.0;
      let tension = 0;
      let mode = "boost";
      if (rubberBandOn) {
        if (gap < -2.2) {
          const t = Math.min(1.0, (-gap - 2.2) / 17.0);
          mult = 1.0 + 0.46 * t;
          tension = t;
          mode = "boost";
        } else if (gap > 2.2) {
          const t = Math.min(1.0, (gap - 2.2) / 17.0);
          mult = 1.0 - 0.40 * t;
          tension = t;
          mode = "slow";
        }
      }
      c.speedMult += (mult - c.speedMult) * Math.min(1, h * 4.2);
      const aiTarget = c.baseSpeed * c.speedMult * (1.0 + 0.03 * Math.sin(time * 1.15 + i * 2.1));
      c.speed += (aiTarget - c.speed) * Math.min(1, h * 4.5);
      c.s += c.speed * h;
      c.wheelAngle += c.speed * h * 3.6;

      // Apply physical lateral knockback velocity from car-to-car collisions, smoothly returning to racing lane!
      c.laneCur += c.lanePushVel * h;
      c.lanePushVel *= Math.max(0, 1 - h * 5.5);
      const desiredLane = c.lane + Math.sin(time * 0.85 + i * 1.8) * 0.34;
      c.laneCur += (desiredLane - c.laneCur) * Math.min(1, h * 2.0);
      c.laneCur = Math.max(-TRACK_HW * 0.72, Math.min(TRACK_HW * 0.72, c.laneCur));

      const targetBoost = (rubberBandOn && mode === "boost" && tension > 0.08) ? tension : 0;
      const targetBrake = (rubberBandOn && mode === "slow" && tension > 0.08) ? tension : 0;
      c.boostGlow += (targetBoost - c.boostGlow) * Math.min(1, h * 6.0);
      c.brakeGlow += (targetBrake - c.brakeGlow) * Math.min(1, h * 6.0);
      syncCarFromTrack(c);
    }

    // 3) REAL ELEVATION-AWARE CAR-TO-CAR COLLISIONS (Player <-> AI AND AI <-> AI!)
    // Cars on the Overpass Bridge (y ~ 2.85) cleanly soar OVER cars on the Underpass (y ~ 0.03)!
    const MIN_SEP = 1.24;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (Math.abs(a.y - b.y) > 1.10) continue; // Different bridge deck levels -> zero phantom hit!
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < MIN_SEP) {
          const nx = dx / d, nz = dz / d;
          const overlap = MIN_SEP - d;
          const stA = sampleTrack(a.s);
          const stB = sampleTrack(b.s);

          // Separate cars cleanly along track right & forward axes
          const pushLatA = -(nx * stA.rx + nz * stA.rz) * overlap * 0.65;
          const pushLatB =  (nx * stB.rx + nz * stB.rz) * overlap * 0.65;
          const pushFwdA = -(nx * stA.tx + nz * stA.tz) * overlap * 0.55;
          const pushFwdB =  (nx * stB.tx + nz * stB.tz) * overlap * 0.55;

          if (a.isPlayer && playerControl) {
            a.x -= nx * overlap * 0.55;
            a.z -= nz * overlap * 0.55;
            a.speed = Math.max(4.0, a.speed * 0.90 + (b.speed - a.speed) * 0.25);
            // Slight yaw deflection when sideswiped!
            a.yaw += (nx * stA.rx + nz * stA.rz) * 0.06;
          } else {
            a.laneCur = Math.max(-TRACK_HW * 0.78, Math.min(TRACK_HW * 0.78, a.laneCur + pushLatA));
            a.lanePushVel += pushLatA * 9.0;
            a.s += pushFwdA;
            a.speed = Math.max(5.0, a.speed * 0.92);
            syncCarFromTrack(a);
          }

          b.laneCur = Math.max(-TRACK_HW * 0.78, Math.min(TRACK_HW * 0.78, b.laneCur + pushLatB));
          b.lanePushVel += pushLatB * 9.0;
          b.s += pushFwdB;
          b.speed = Math.max(5.0, b.speed * 0.92 + (a.speed - b.speed) * 0.30);
          syncCarFromTrack(b);

          // Collision sparks, hitFlash & punchy car-bump sound!
          a.hitFlash = Math.max(a.hitFlash, 0.55);
          b.hitFlash = Math.max(b.hitFlash, 0.55);
          if (a.isPlayer || b.isPlayer) {
            collisionCount++;
            if (bumpCooldown <= 0) {
              bumpCooldown = 0.20;
              spawnSparkBurst((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5, 14, false);
              audio?.carBump?.();
            }
          }
        }
      }
    }

    // Build live 3D glowing rubber bands (with real Y elevations!)
    const rubberBands = [];
    for (let i = 1; i < cars.length; i++) {
      const c = cars[i];
      const gap = c.s - p.s;
      if (strength > 0.02 && Math.abs(gap) > 1.6 && Math.abs(gap) < TRACK_LENGTH * 0.45) {
        const mode = gap < 0 ? "boost" : "slow";
        const tension = Math.min(1.0, (Math.abs(gap) - 1.6) / 17.0);
        rubberBands.push({
          carId: c.id,
          x0: p.x, y0: p.y, z0: p.z,
          x1: c.x, y1: c.y, z1: c.z,
          tension,
          mode,
          alpha: strength * Math.min(1.0, (Math.abs(gap) - 1.6) / 2.8),
        });
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life += h;
      if (pt.life >= pt.maxLife) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * h; pt.y += pt.vy * h; pt.z += pt.vz * h;
      pt.vy -= 3.2 * h;
      if (pt.y < 0.08) { pt.y = 0.08; pt.vy *= -0.3; }
      pt.a = (1 - pt.life / pt.maxLife) * 0.72;
    }

    let rank = 1;
    for (let i = 1; i < cars.length; i++) if (cars[i].s > p.s) rank++;
    const lap = Math.max(1, Math.floor((p.s - START_S) / TRACK_LENGTH) + 1);
    if (lap > prevLap) {
      prevLap = lap;
      if (playerControl) audio?.lapChime?.();
    }

    return { time, cars, rubberBands, particles, rubberBandOn, playerControl, nitro, rank, lap, collisionCount };
  }

  return {
    step,
    reset,
    triggerCrash,
    triggerBoost,
    setSteerTarget(pt) { playerControl = true; steerTarget = pt; },
    getRubberBandOn: () => rubberBandOn,
    setRubberBandOn: (v) => { rubberBandOn = !!v; audio?.elasticTwang?.(rubberBandOn); },
    getPlayerControl: () => playerControl,
    setPlayerControl: (v) => { playerControl = !!v; steerTarget = null; if (!playerControl) audio?.setEngine?.(0, false); },
    getCars: () => cars,
  };
}
