// Interactive Rubber Banding Simulation for Game Design Codex (/gdc/rubber-banding/)
// Live physics loop: 1 Player car + 3 AI Rivals on the 3D stadium circuit.
// Toggle Rubber Banding OFF / ON, trigger Player Crash or Player Turbo Boost, and feel the elastic speed cheat live!
import { sampleTrack, TRACK_LENGTH, START_S, TRACK_HW } from "./track-renderer.js";

export const CAR_PRESETS = [
  { id: 0, name: "YOU",   isPlayer: true,  livery: [0.06, 0.90, 0.62], lane: -0.58, baseSpeed: 10.6 },
  { id: 1, name: "AI #1", isPlayer: false, livery: [0.94, 0.16, 0.24], lane:  0.58, baseSpeed: 10.55 },
  { id: 2, name: "AI #2", isPlayer: false, livery: [0.98, 0.64, 0.08], lane: -0.18, baseSpeed: 10.45 },
  { id: 3, name: "AI #3", isPlayer: false, livery: [0.24, 0.50, 0.98], lane:  0.22, baseSpeed: 10.35 },
];

export function createRubberBandSim() {
  let rubberBandOn = true;
  let strength = 1.0; // 0..1 smooth blend
  let time = 0;

  const cars = CAR_PRESETS.map((p, i) => ({
    ...p,
    s: START_S - i * 1.9,
    speed: p.baseSpeed,
    speedMult: 1.0,
    laneCur: p.lane,
    laneTarget: p.lane,
    wheelAngle: 0,
    crashTimer: 0,
    boostTimer: 0,
    spinOffset: 0,
    hitFlash: 0,
    brakeGlow: 0,
    boostGlow: 0,
    x: 0, y: 0.03, z: 0, yaw: 0,
    tx: 0, tz: 1,
    gapToPlayer: 0,
  }));

  const particles = [];

  function syncPositions() {
    for (const c of cars) {
      const st = sampleTrack(c.s);
      c.x = st.x + st.rx * c.laneCur;
      c.z = st.z + st.rz * c.laneCur;
      c.yaw = st.yaw;
      c.tx = st.tx;
      c.tz = st.tz;
    }
  }
  syncPositions();

  function spawnCrashBurst(car) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.random() * 0.2;
      const spd = 1.5 + Math.random() * 3.8;
      const isSpark = i % 2 === 0;
      particles.push({
        x: car.x, y: 0.35 + Math.random() * 0.25, z: car.z,
        vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.6, vz: Math.sin(a) * spd,
        life: 0, maxLife: isSpark ? 0.55 + Math.random() * 0.3 : 0.85 + Math.random() * 0.4,
        size: isSpark ? 0.14 : 0.34,
        r: isSpark ? 2.6 : 1.0,
        g: isSpark ? 1.15 : 1.02,
        b: isSpark ? 0.22 : 1.08,
        a: isSpark ? 0.95 : 0.50,
      });
    }
  }

  function triggerCrash() {
    const p = cars[0];
    p.crashTimer = 1.75;
    p.boostTimer = 0;
    p.hitFlash = 1.0;
    spawnCrashBurst(p);
  }

  function triggerBoost() {
    const p = cars[0];
    p.boostTimer = 2.4;
    p.crashTimer = 0;
  }

  function reset() {
    time = 0;
    particles.length = 0;
    cars.forEach((c, i) => {
      c.s = START_S - i * 1.9;
      c.speed = c.baseSpeed;
      c.speedMult = 1.0;
      c.laneCur = c.lane;
      c.crashTimer = 0;
      c.boostTimer = 0;
      c.spinOffset = 0;
      c.hitFlash = 0;
      c.brakeGlow = 0;
      c.boostGlow = 0;
      c.gapToPlayer = 0;
    });
    syncPositions();
  }

  function step(dt) {
    const h = Math.min(0.05, Math.max(0.001, dt));
    time += h;
    const targetStr = rubberBandOn ? 1.0 : 0.0;
    strength += (targetStr - strength) * Math.min(1, h * 6.0);

    // 1) Player car dynamics
    const p = cars[0];
    let pTargetSpeed = p.baseSpeed;
    if (p.crashTimer > 0) {
      p.crashTimer = Math.max(0, p.crashTimer - h);
      const frac = p.crashTimer / 1.75;
      pTargetSpeed = p.baseSpeed * (0.14 + 0.35 * (1 - frac));
      p.spinOffset = Math.sin(frac * Math.PI * 2.5) * 1.9 * frac;
      p.hitFlash = Math.max(0, p.hitFlash - h * 1.4);
      p.boostGlow = 0;
      p.brakeGlow = 0.7;
      if (Math.random() < 0.45) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * 0.4, y: 0.25, z: p.z + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 0.7, vy: 1.1 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.7,
          life: 0, maxLife: 0.75, size: 0.30, r: 0.85, g: 0.88, b: 0.94, a: 0.42,
        });
      }
    } else if (p.boostTimer > 0) {
      p.boostTimer = Math.max(0, p.boostTimer - h);
      pTargetSpeed = p.baseSpeed * 1.44;
      p.spinOffset *= Math.max(0, 1 - h * 8);
      p.boostGlow = 1.0;
      p.brakeGlow = 0;
    } else {
      // Gentle natural driving pace oscillation
      pTargetSpeed = p.baseSpeed * (1.0 + 0.04 * Math.sin(time * 0.9));
      p.spinOffset *= Math.max(0, 1 - h * 8);
      p.boostGlow *= Math.max(0, 1 - h * 5);
      p.brakeGlow *= Math.max(0, 1 - h * 5);
    }
    p.speed += (pTargetSpeed - p.speed) * Math.min(1, h * 4.5);
    p.s += p.speed * h;
    p.wheelAngle += p.speed * h * 3.8;
    p.laneCur += (p.lane + Math.sin(time * 0.7) * 0.22 - p.laneCur) * Math.min(1, h * 2.0);

    // 2) AI Rivals with explicit Elastic Rubber Banding!
    const rubberBands = [];
    for (let i = 1; i < cars.length; i++) {
      const c = cars[i];
      // Signed track gap: positive = AI is AHEAD of player, negative = AI is BEHIND player
      const gap = c.s - p.s;
      c.gapToPlayer = gap;

      // Rubber band formula:
      // Behind player (gap < -1.5) -> boost up to +38%
      // Ahead of player (gap > +1.5) -> slow down up to -32%
      let mult = 1.0;
      let tension = 0;
      let mode = "boost";
      if (rubberBandOn) {
        if (gap < -1.4) {
          const t = Math.min(1.0, (-gap - 1.4) / 9.5);
          mult = 1.0 + 0.40 * t;
          tension = t;
          mode = "boost";
        } else if (gap > 1.4) {
          const t = Math.min(1.0, (gap - 1.4) / 9.5);
          mult = 1.0 - 0.34 * t;
          tension = t;
          mode = "slow";
        }
      }
      c.speedMult += (mult - c.speedMult) * Math.min(1, h * 4.0);
      const aiTarget = c.baseSpeed * c.speedMult * (1.0 + 0.035 * Math.sin(time * 1.15 + i * 2.1));
      c.speed += (aiTarget - c.speed) * Math.min(1, h * 4.5);
      c.s += c.speed * h;
      c.wheelAngle += c.speed * h * 3.8;
      c.laneCur += (c.lane + Math.sin(time * 0.85 + i * 1.8) * 0.26 - c.laneCur) * Math.min(1, h * 2.0);
      c.laneCur = Math.max(-TRACK_HW * 0.62, Math.min(TRACK_HW * 0.62, c.laneCur));

      const targetBoost = (rubberBandOn && mode === "boost" && tension > 0.08) ? tension : 0;
      const targetBrake = (rubberBandOn && mode === "slow" && tension > 0.08) ? tension : 0;
      c.boostGlow += (targetBoost - c.boostGlow) * Math.min(1, h * 6.0);
      c.brakeGlow += (targetBrake - c.brakeGlow) * Math.min(1, h * 6.0);

      // Update world coordinates before computing rubber band anchors
      const st = sampleTrack(c.s);
      c.x = st.x + st.rx * c.laneCur;
      c.z = st.z + st.rz * c.laneCur;
      c.yaw = st.yaw;
      c.tx = st.tx;
      c.tz = st.tz;

      // Only show rubber band cleanly when cars are within ~half a lap (otherwise visual chord wraps)
      if (strength > 0.02 && Math.abs(gap) > 1.0 && Math.abs(gap) < TRACK_LENGTH * 0.45) {
        const pst = sampleTrack(p.s);
        p.x = pst.x + pst.rx * p.laneCur;
        p.z = pst.z + pst.rz * p.laneCur;
        rubberBands.push({
          carId: c.id,
          x0: p.x, z0: p.z,
          x1: c.x, z1: c.z,
          tension,
          mode,
          alpha: strength * Math.min(1.0, (Math.abs(gap) - 1.0) / 2.2),
        });
      }
    }

    syncPositions();

    // 3) Advance particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life += h;
      if (pt.life >= pt.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * h;
      pt.y += pt.vy * h;
      pt.z += pt.vz * h;
      pt.vy -= 3.2 * h;
      if (pt.y < 0.08) { pt.y = 0.08; pt.vy *= -0.3; }
      const fade = 1 - pt.life / pt.maxLife;
      pt.a = fade * 0.72;
    }

    return { time, cars, rubberBands, particles, rubberBandOn };
  }

  return {
    step,
    reset,
    triggerCrash,
    triggerBoost,
    getRubberBandOn: () => rubberBandOn,
    setRubberBandOn: (v) => { rubberBandOn = !!v; },
    getCars: () => cars,
  };
}
