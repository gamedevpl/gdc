// Playable 3D Figure-8 Overpass Racing Simulation with REAL 2D Rigid-Body Impulse & Tire-Grip Physics!
// True world velocity (vx, vz) + angular velocity (omega), lateral tire grip & subtle drift,
// angle-dependent glancing wall restitution + Coulomb friction (zero teleporting!),
// and true elastic 2D momentum-transfer car-to-car collisions across Figure-8 bridge elevations.
import { sampleTrack, TRACK_LENGTH, START_S, TRACK_HW } from "./track-renderer.js";

export const CAR_PRESETS = [
  { id: 0, name: "YOU",   isPlayer: true,  livery: [0.06, 0.90, 0.62], lane: -0.76, baseSpeed: 14.4 },
  { id: 1, name: "AI #1", isPlayer: false, livery: [0.94, 0.16, 0.24], lane:  0.76, baseSpeed: 14.15 },
  { id: 2, name: "AI #2", isPlayer: false, livery: [0.98, 0.64, 0.08], lane: -0.24, baseSpeed: 14.00 },
  { id: 3, name: "AI #3", isPlayer: false, livery: [0.24, 0.50, 0.98], lane:  0.28, baseSpeed: 13.85 },
];

// Local projection around hintS (+/- 8.5 units) keeps upper bridge deck cleanly separated from lower underpass!
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
    s: START_S - i * 2.7,
    speed: p.baseSpeed,
    speedMult: 1.0,
    laneCur: p.lane,
    // True 2D rigid-body velocity & rotational state!
    vx: 0, vz: 0, omega: 0,
    impVx: 0, impVz: 0, // AI collision impulse offset that naturally recovers via AI tire grip
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

  function syncCarFromTrack(c, resetVel = false) {
    const st = sampleTrack(c.s);
    c.x = st.x + st.rx * c.laneCur;
    c.y = st.y;
    c.z = st.z + st.rz * c.laneCur;
    c.yaw = st.yaw;
    c.pitch = st.pitch;
    c.tx = st.tx;
    c.tz = st.tz;
    if (resetVel) {
      c.vx = st.tx * c.speed;
      c.vz = st.tz * c.speed;
      c.omega = 0;
    }
  }
  cars.forEach(c => syncCarFromTrack(c, true));

  function spawnSparkBurst(x, y, z, n = 10, withSmoke = false) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 1.4 + Math.random() * 3.4;
      const isSpark = !withSmoke || (i % 2 === 0);
      particles.push({
        x, y: y + 0.32 + Math.random() * 0.18, z,
        vx: Math.cos(a) * spd, vy: 1.3 + Math.random() * 2.1, vz: Math.sin(a) * spd,
        life: 0, maxLife: isSpark ? 0.42 + Math.random() * 0.20 : 0.78 + Math.random() * 0.30,
        size: isSpark ? 0.14 : 0.34,
        r: isSpark ? 2.5 : 0.92,
        g: isSpark ? 1.25 : 0.95,
        b: isSpark ? 0.28 : 1.0,
        a: isSpark ? 0.90 : 0.40,
      });
    }
  }

  function triggerCrash() {
    const p = cars[0];
    p.crashTimer = 1.40;
    p.boostTimer = 0;
    p.hitFlash = 0.9;
    p.vx *= 0.35;
    p.vz *= 0.35;
    p.speed *= 0.35;
    p.omega = (Math.random() < 0.5 ? 1 : -1) * 7.5;
    spawnSparkBurst(p.x, p.y, p.z, 20, true);
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
      c.s = START_S - i * 2.7;
      c.speed = c.baseSpeed;
      c.speedMult = 1.0;
      c.laneCur = c.lane;
      c.impVx = 0; c.impVz = 0;
      c.crashTimer = 0;
      c.boostTimer = 0;
      c.spinOffset = 0;
      c.hitFlash = 0;
      c.brakeGlow = 0;
      c.boostGlow = 0;
      c.wallGrind = false;
      c.gapToPlayer = 0;
      syncCarFromTrack(c, true);
    });
  }

  function step(dt, keys = new Set()) {
    const h = Math.min(0.04, Math.max(0.001, dt));
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
      if (!playerControl) {
        // Hand over current track velocity seamlessly into rigid-body physics!
        p.vx = Math.sin(p.yaw) * p.speed;
        p.vz = Math.cos(p.yaw) * p.speed;
        p.omega = 0;
      }
      playerControl = true;
      steerTarget = null;
    }

    let usingNitro = false;

    // 1) Player Car: Smooth 2D Rigid-Body Tire-Grip, Drift & Glancing Wall Physics!
    if (p.crashTimer > 0) {
      p.crashTimer = Math.max(0, p.crashTimer - h);
      p.vx *= Math.exp(-2.8 * h);
      p.vz *= Math.exp(-2.8 * h);
      p.x += p.vx * h;
      p.z += p.vz * h;
      p.yaw += p.omega * h;
      p.omega *= Math.exp(-3.4 * h);
      p.hitFlash = Math.max(0, p.hitFlash - h * 1.4);
      p.boostGlow = 0;
      p.brakeGlow = 0.6;
      const proj = projectWorldToTrack(p.x, p.z, p.s);
      p.s = proj.s; p.y = proj.st.y; p.laneCur = proj.lat;
      p.pitch = proj.st.pitch * Math.cos(p.yaw - proj.st.yaw);
      p.speed = Math.hypot(p.vx, p.vz);
      if (Math.random() < 0.38) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * 0.35, y: p.y + 0.22, z: p.z + (Math.random() - 0.5) * 0.35,
          vx: (Math.random() - 0.5) * 0.6, vy: 1.0 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.6,
          life: 0, maxLife: 0.70, size: 0.32, r: 0.90, g: 0.93, b: 0.98, a: 0.38,
        });
      }
    } else if (playerControl) {
      p.spinOffset *= Math.exp(-10 * h);
      p.hitFlash = Math.max(0, p.hitFlash - h * 3.0);

      let steerIn = (lt ? 1 : 0) - (rt ? 1 : 0);
      let throttle = up ? 1 : dn ? -0.65 : 0;
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
          steerIn = Math.max(-1, Math.min(1, diff * 2.2));
          throttle = 1.0;
        }
      }

      usingNitro = (boostKey && nitro > 0.04) || p.boostTimer > 0;
      if (usingNitro && !prevNitroOn) audio?.nitro?.();
      prevNitroOn = usingNitro;
      if (p.boostTimer > 0) p.boostTimer = Math.max(0, p.boostTimer - h);
      if (boostKey && nitro > 0.04) nitro = Math.max(0, nitro - h * 0.36);
      else nitro = Math.min(1, nitro + h * 0.22);

      // Local basis of car nose (fx, fz) & right (rx, rz)
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const rx = -fz, rz = fx;
      let vFwd = p.vx * fx + p.vz * fz;
      let vLat = p.vx * rx + p.vz * rz;

      // Engine thrust & braking with aerodynamic quadratic drag!
      const engineAccel = usingNitro ? 26.0 : 17.5;
      const topSpd = usingNitro ? 20.6 : 16.2;
      if (throttle > 0) {
        vFwd += engineAccel * (1 - Math.max(0, vFwd / (topSpd * 1.12))) * h;
      } else if (throttle < 0) {
        vFwd += (vFwd > 0.5 ? -24.0 : -11.0) * h;
        vFwd = Math.max(-5.0, vFwd);
      } else {
        vFwd *= Math.exp(-0.95 * h);
      }

      // Smooth angular steering response + tire lateral grip (subtle, controllable arcade-sim drift!)
      const spdFactor = Math.min(1, Math.abs(vFwd) / 6.5);
      const targetOmega = steerIn * 2.85 * (0.28 + 0.72 * spdFactor) * (vFwd >= -0.2 ? 1 : -1);
      p.omega += (targetOmega - p.omega) * Math.min(1, h * 11.5);
      p.yaw += p.omega * h;

      // Lateral tire friction kills sideways slip smoothly (gives natural grip on turns & real slide after bumps!)
      const latGrip = Math.abs(vLat) > 4.5 ? 5.2 : 8.2;
      vLat *= Math.exp(-latGrip * h);

      // Reconstruct world velocity along new car heading
      const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
      const nrx = -nfz, nrz = nfx;
      p.vx = nfx * vFwd + nrx * vLat;
      p.vz = nfz * vFwd + nrz * vLat;

      p.x += p.vx * h;
      p.z += p.vz * h;

      // Project onto continuous 3D Figure-8 elevation
      const proj = projectWorldToTrack(p.x, p.z, p.s);
      p.s = proj.s;
      p.y = proj.st.y;
      p.pitch = proj.st.pitch * Math.cos(p.yaw - proj.st.yaw);
      p.laneCur = proj.lat;

      const cleanGripLat = TRACK_HW - 0.28; // 1.64
      const barrierLat = TRACK_HW + 0.02;   // 1.94
      if (Math.abs(proj.lat) > barrierLat) {
        // REAL 2D RIGID-BODY GUARDRAIL COLLISION (exact surface contact, ZERO teleport jump!)
        const sign = Math.sign(proj.lat);
        const nx = -proj.st.rx * sign; // inward unit normal pointing back toward track center
        const nz = -proj.st.rz * sign;
        // Clamp cleanly onto guardrail surface (zero artificial -0.14 jump)
        p.x = proj.st.x + proj.st.rx * barrierLat * sign;
        p.z = proj.st.z + proj.st.rz * barrierLat * sign;
        p.laneCur = barrierLat * sign;

        const vn = p.vx * nx + p.vz * nz; // negative when moving INTO barrier
        const vt = p.vx * proj.st.tx + p.vz * proj.st.tz; // tangential speed along barrier

        if (vn < 0) {
          // Restitution bounce proportional ONLY to perpendicular impact speed (glancing touch barely bounces!)
          const restitution = 0.26;
          const jn = -(1 + restitution) * vn;
          p.vx += nx * jn;
          p.vz += nz * jn;

          // Subtle physical yaw deflection proportional to impact angle
          const impactMag = -vn;
          p.omega += (-sign) * Math.min(2.8, impactMag * 0.24);

          if (impactMag > 2.2 && wallCooldown <= 0) {
            wallCooldown = 0.22;
            p.hitFlash = Math.min(0.6, impactMag * 0.08);
            spawnSparkBurst(p.x, p.y, p.z, Math.min(14, Math.round(impactMag * 2.2)), false);
            audio?.wallScrape?.();
          }
        }

        // Smooth continuous Coulomb barrier friction (steady drag prevents wall-grinding cheese without jerky speed cliffs!)
        const wallDrag = Math.exp(-2.8 * h);
        const curVt = p.vx * proj.st.tx + p.vz * proj.st.tz;
        const newVt = Math.min(curVt, Math.max(7.2, curVt * wallDrag));
        const curVn = p.vx * nx + p.vz * nz;
        p.vx = proj.st.tx * newVt + nx * curVn;
        p.vz = proj.st.tz * newVt + nz * curVn;
        if (Math.abs(vt) > 5.0) p.wallGrind = true;
      } else if (Math.abs(proj.lat) > cleanGripLat) {
        // Gentle apex curb drag (subtle realistic traction loss off racing line)
        const curbDrag = Math.exp(-0.85 * h);
        p.vx *= curbDrag;
        p.vz *= curbDrag;
      }

      p.speed = Math.hypot(p.vx, p.vz);
      p.wheelAngle += (p.vx * nfx + p.vz * nfz) * h * 3.6;
      p.boostGlow = usingNitro ? 1.0 : Math.max(0, p.boostGlow - h * 5);
      p.brakeGlow = dn ? 0.9 : Math.max(0, p.brakeGlow - h * 5);
    } else {
      // Smooth Auto-Demo cruise until visitor drives
      let pTargetSpeed = p.baseSpeed * (1.0 + 0.04 * Math.sin(time * 0.9));
      if (p.boostTimer > 0) {
        p.boostTimer = Math.max(0, p.boostTimer - h);
        pTargetSpeed = p.baseSpeed * 1.42;
        p.boostGlow = 1.0;
        usingNitro = true;
      } else {
        p.boostGlow *= Math.max(0, 1 - h * 5);
      }
      p.spinOffset *= Math.exp(-8 * h);
      p.brakeGlow *= Math.max(0, 1 - h * 5);
      p.speed += (pTargetSpeed - p.speed) * Math.min(1, h * 4.5);
      p.s += p.speed * h;
      p.wheelAngle += p.speed * h * 3.6;
      p.laneCur += (p.lane + Math.sin(time * 0.7) * 0.30 - p.laneCur) * Math.min(1, h * 2.0);
      syncCarFromTrack(p, true);
    }

    audio?.setEngine?.(playerControl ? Math.min(1, p.speed / 16.5) : 0, usingNitro);

    // 2) AI Rivals with Elastic Rubber Banding + smooth rigid-body impulse recovery!
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
      c.speed += (aiTarget - c.speed) * Math.min(1, h * 3.6);

      // Decay any collision impulse offset smoothly via tire grip!
      c.impVx *= Math.exp(-4.2 * h);
      c.impVz *= Math.exp(-4.2 * h);

      const stPrev = sampleTrack(c.s);
      const impFwd = c.impVx * stPrev.tx + c.impVz * stPrev.tz;
      const impLat = c.impVx * stPrev.rx + c.impVz * stPrev.rz;

      c.s += Math.max(1.5, c.speed + impFwd) * h;
      c.wheelAngle += c.speed * h * 3.6;
      const desiredLane = c.lane + Math.sin(time * 0.85 + i * 1.8) * 0.34;
      c.laneCur += impLat * h + (desiredLane - c.laneCur) * Math.min(1, h * 2.2);
      c.laneCur = Math.max(-TRACK_HW * 0.78, Math.min(TRACK_HW * 0.78, c.laneCur));

      const targetBoost = (rubberBandOn && mode === "boost" && tension > 0.08) ? tension : 0;
      const targetBrake = (rubberBandOn && mode === "slow" && tension > 0.08) ? tension : 0;
      c.boostGlow += (targetBoost - c.boostGlow) * Math.min(1, h * 6.0);
      c.brakeGlow += (targetBrake - c.brakeGlow) * Math.min(1, h * 6.0);
      syncCarFromTrack(c, false);
      c.vx = c.tx * c.speed + c.impVx;
      c.vz = c.tz * c.speed + c.impVz;
    }

    // 3) REAL 2D ELASTIC RIGID-BODY CAR-TO-CAR COLLISIONS (same bridge elevation only!)
    const MIN_SEP = 1.24;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (Math.abs(a.y - b.y) > 1.15) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < MIN_SEP) {
          const nx = dx / d, nz = dz / d;
          const overlap = MIN_SEP - d;

          // Positional separation (50/50 smooth depenetration, zero teleport!)
          const sep = overlap * 0.5;
          if (a.isPlayer && playerControl) {
            a.x -= nx * sep; a.z -= nz * sep;
          } else {
            const stA = sampleTrack(a.s);
            a.laneCur = Math.max(-TRACK_HW * 0.80, Math.min(TRACK_HW * 0.80, a.laneCur - (nx * stA.rx + nz * stA.rz) * sep));
            a.s -= (nx * stA.tx + nz * stA.tz) * sep;
            syncCarFromTrack(a, false);
          }
          const stB = sampleTrack(b.s);
          b.laneCur = Math.max(-TRACK_HW * 0.80, Math.min(TRACK_HW * 0.80, b.laneCur + (nx * stB.rx + nz * stB.rz) * sep));
          b.s += (nx * stB.tx + nz * stB.tz) * sep;
          syncCarFromTrack(b, false);

          // Real 2D Momentum-Conserving Rigid-Body Impulse (equal mass, restitution e = 0.35)!
          const rvx = b.vx - a.vx;
          const rvz = b.vz - a.vz;
          const rvn = rvx * nx + rvz * nz;
          if (rvn < 0) {
            const e = 0.35;
            const jImp = -(1 + e) * rvn * 0.5;
            const ix = nx * jImp, iz = nz * jImp;

            if (a.isPlayer && playerControl) {
              a.vx -= ix; a.vz -= iz;
              // Off-center physical torque nudges yaw realistically!
              const sideCross = (Math.sin(a.yaw) * nz - Math.cos(a.yaw) * nx);
              a.omega += sideCross * Math.min(2.4, jImp * 0.25);
            } else {
              a.impVx -= ix; a.impVz -= iz;
            }
            b.impVx += ix; b.impVz += iz;

            // Only spark & thump on meaningful impact velocity (smooth door-to-door rubbing stays quiet!)
            if ((a.isPlayer || b.isPlayer) && -rvn > 2.2) {
              collisionCount++;
              a.hitFlash = Math.min(0.55, -rvn * 0.08);
              b.hitFlash = Math.min(0.55, -rvn * 0.08);
              if (bumpCooldown <= 0) {
                bumpCooldown = 0.24;
                spawnSparkBurst((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5, 10, false);
                audio?.carBump?.();
              }
            }
          }
        }
      }
    }

    // Build 3D elastic rubber bands
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
      pt.a = (1 - pt.life / pt.maxLife) * 0.70;
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
    setSteerTarget(pt) {
      if (!playerControl) {
        const p = cars[0];
        p.vx = Math.sin(p.yaw) * p.speed;
        p.vz = Math.cos(p.yaw) * p.speed;
        p.omega = 0;
      }
      playerControl = true;
      steerTarget = pt;
    },
    getRubberBandOn: () => rubberBandOn,
    setRubberBandOn: (v) => { rubberBandOn = !!v; audio?.elasticTwang?.(rubberBandOn); },
    getPlayerControl: () => playerControl,
    setPlayerControl: (v) => {
      if (v && !playerControl) {
        const p = cars[0];
        p.vx = Math.sin(p.yaw) * p.speed;
        p.vz = Math.cos(p.yaw) * p.speed;
        p.omega = 0;
      }
      playerControl = !!v;
      steerTarget = null;
      if (!playerControl) audio?.setEngine?.(0, false);
    },
    getCars: () => cars,
  };
}
