// Entry #09: Boids & Flocking (3 Rules) — Playable 3D Coral Reef Simulation!
// 72 live 3D Reef Boids obeying Craig Reynolds' 3 local rules (Separation, Alignment, Cohesion) with zero central leader,
// plus an interactive Predator Reef Shark (WASD / Click) and a Gold Inspector Boid showing live force vectors!
import { clamp, lerp } from "../../gl-utils.js";
import { createReefRenderer, REEF_BOUNDS, CORAL_ROCKS } from "./reef-renderer.js";

const BOID_COUNT = 72;
const PERCEPTION_R = 2.75;
const SEPARATION_R = 1.24;
const SHARK_FEAR_R = 3.15;
const MIN_SPEED = 2.6;
const MAX_SPEED = 4.65;
const MAX_FORCE = 8.4;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function limitVec(x, z, maxMag) {
  const m = Math.hypot(x, z);
  if (m > maxMag && m > 1e-6) {
    const s = maxMag / m;
    return [x * s, z * s];
  }
  return [x, z];
}

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createReefRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.84, dist: 21.8, targetX: 0.0, targetY: 0.5, targetZ: 0.4, fovDeg: 40 };

  let time = 0;
  const rules = { separation: true, alignment: true, cohesion: true };
  let showVectors = true;
  let sharkAuto = true;
  let presetIdx = 0; // 0 = All 3 Rules, 1 = No Separation (Clump!), 2 = No Align/Cohesion (Chaos Scatter!)

  let bannerText = "";
  let bannerColor = "#22d3ee";
  let bannerTimer = 0;

  let boids = [];
  let bubbles = [];
  let ripples = [];
  let scatters = 0;

  const shark = {
    active: true,
    x: 4.8, y: 1.05, z: 3.4,
    vx: -2.0, vz: -1.4,
    yaw: -2.3,
    bank: 0,
    wagPhase: 0,
    targetX: null,
    targetZ: null,
  };

  let metrics = {
    polarization: 0,
    avgNearest: 0,
    spread: 0,
    heroNeighbors: 0,
  };

  function setBanner(text, color = "#22d3ee", dur = 2.0) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = dur;
  }

  function initBubbles() {
    bubbles = [];
    for (let i = 0; i < 28; i++) {
      const cr = CORAL_ROCKS[i % CORAL_ROCKS.length];
      bubbles.push({
        x: cr.x + (Math.random() - 0.5) * 1.1,
        y: 0.4 + Math.random() * 4.5,
        z: cr.z + (Math.random() - 0.5) * 1.1,
        speed: 0.65 + Math.random() * 0.85,
        size: 0.07 + Math.random() * 0.08,
        coralIdx: i % CORAL_ROCKS.length,
      });
    }
  }

  function reset() {
    time = 0;
    rules.separation = true;
    rules.alignment = true;
    rules.cohesion = true;
    presetIdx = 0;
    sharkAuto = true;
    shark.x = 5.4;
    shark.z = 3.6;
    shark.vx = -2.2;
    shark.vz = -1.2;
    shark.yaw = Math.atan2(shark.vx, shark.vz);
    shark.targetX = null;
    shark.targetZ = null;
    ripples = [];
    scatters = 0;

    // Seed 72 boids in a crisp organic reef shoal around (-1.5, -0.3)
    const palette = [
      [0.10, 0.82, 0.98],
      [0.20, 0.92, 0.82],
      [0.14, 0.66, 0.96],
      [0.98, 0.58, 0.24],
    ];
    boids = [];
    for (let i = 0; i < BOID_COUNT; i++) {
      const a = (i / BOID_COUNT) * Math.PI * 2 + (i % 5) * 0.25;
      const rad = i === 0 ? 0.4 : 0.9 + (i / BOID_COUNT) * 3.8;
      const bx = clamp(-1.2 + Math.cos(a) * rad, -REEF_BOUNDS.halfX + 1.4, REEF_BOUNDS.halfX - 1.4);
      const bz = clamp(-0.2 + Math.sin(a) * rad * 0.78, -REEF_BOUNDS.halfZ + 1.4, REEF_BOUNDS.halfZ - 1.4);
      const heading = 0.65 + (Math.sin(i * 1.7) * 0.42);
      const spd = 3.4 + (i % 4) * 0.18;
      boids.push({
        isHero: i === 0,
        x: bx,
        y: 1.0 + Math.sin(i * 1.3) * 0.28,
        z: bz,
        vx: Math.sin(heading) * spd,
        vz: Math.cos(heading) * spd,
        yaw: heading,
        bank: 0,
        wagPhase: i * 0.7,
        scale: 0.92 + (i % 5) * 0.055,
        tint: palette[i % palette.length],
        fSepX: 0, fSepZ: 0,
        fAliX: 0, fAliZ: 0,
        fCohX: 0, fCohZ: 0,
      });
    }
    initBubbles();
    bannerTimer = 0;
  }

  reset();

  function applyPreset(idx) {
    presetIdx = idx % 3;
    if (presetIdx === 0) {
      rules.separation = true; rules.alignment = true; rules.cohesion = true;
      setBanner("ALL 3 RULES ON · EMERGENT SCHOOL!", "#22d3ee", 2.0);
    } else if (presetIdx === 1) {
      rules.separation = false; rules.alignment = true; rules.cohesion = true;
      setBanner("SEPARATION OFF · FISH COLLAPSE INTO A CLUMP!", "#f87171", 2.4);
    } else {
      rules.separation = true; rules.alignment = false; rules.cohesion = false;
      setBanner("ALIGN + COHESION OFF · CHAOTIC SCATTER!", "#fbbf24", 2.4);
    }
    audio?.ruleSwitch?.(presetIdx === 0);
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Update rising coral bubbles
    for (const bb of bubbles) {
      bb.y += bb.speed * dt;
      bb.x += Math.sin(time * 2.2 + bb.y * 1.8) * 0.18 * dt;
      if (bb.y > 5.2) {
        const cr = CORAL_ROCKS[bb.coralIdx];
        bb.y = cr.h * 0.7;
        bb.x = cr.x + (Math.random() - 0.5) * 0.9;
        bb.z = cr.z + (Math.random() - 0.5) * 0.9;
      }
    }

    // Update click ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age >= ripples[i].life) ripples.splice(i, 1);
    }

    // 1) Update Predator Reef Shark (WASD manual drive OR Click waypoint OR graceful figure-8 lagoon patrol!)
    const kw = keys?.has("KeyW") || keys?.has("ArrowUp");
    const ks = keys?.has("KeyS") || keys?.has("ArrowDown");
    const ka = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const kd = keys?.has("KeyD") || keys?.has("ArrowRight");
    const manualX = (kd ? 1 : 0) - (ka ? 1 : 0);
    const manualZ = (ks ? 1 : 0) - (kw ? 1 : 0);

    if (shark.active) {
      let desiredVx = shark.vx;
      let desiredVz = shark.vz;
      if (manualX !== 0 || manualZ !== 0) {
        sharkAuto = false;
        shark.targetX = null;
        const l = Math.hypot(manualX, manualZ);
        desiredVx = (manualX / l) * 5.2;
        desiredVz = (manualZ / l) * 5.2;
      } else if (shark.targetX != null) {
        const dx = shark.targetX - shark.x;
        const dz = shark.targetZ - shark.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.45) {
          desiredVx = (dx / d) * 4.8;
          desiredVz = (dz / d) * 4.8;
        } else {
          shark.targetX = null;
        }
      } else if (sharkAuto) {
        // Sweeps a wide curved predator loop through the reef!
        const tx = Math.cos(time * 0.44) * 6.2;
        const tz = Math.sin(time * 0.88) * 3.8;
        const dx = tx - shark.x;
        const dz = tz - shark.z;
        const d = Math.hypot(dx, dz) || 1;
        desiredVx = (dx / d) * 3.9;
        desiredVz = (dz / d) * 3.9;
      } else {
        desiredVx *= 0.96;
        desiredVz *= 0.96;
      }

      // Keep shark steering smoothly around coral rocks
      for (const cr of CORAL_ROCKS) {
        const dx = shark.x - cr.x;
        const dz = shark.z - cr.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const minR = cr.r + 1.05;
        if (d < minR) {
          const push = (minR - d) * 7.5;
          desiredVx += (dx / d) * push;
          desiredVz += (dz / d) * push;
        }
      }

      const prevYaw = shark.yaw;
      shark.vx = lerp(shark.vx, desiredVx, clamp(dt * 4.2, 0, 1));
      shark.vz = lerp(shark.vz, desiredVz, clamp(dt * 4.2, 0, 1));
      shark.x = clamp(shark.x + shark.vx * dt, -REEF_BOUNDS.halfX + 0.9, REEF_BOUNDS.halfX - 0.9);
      shark.z = clamp(shark.z + shark.vz * dt, -REEF_BOUNDS.halfZ + 0.9, REEF_BOUNDS.halfZ - 0.9);
      const sSpd = Math.hypot(shark.vx, shark.vz);
      if (sSpd > 0.25) {
        shark.yaw = Math.atan2(shark.vx, shark.vz);
      }
      const turnRate = wrapAngle(shark.yaw - prevYaw) / Math.max(0.004, dt);
      shark.bank = lerp(shark.bank, clamp(-turnRate * 0.22, -0.45, 0.45), clamp(dt * 8, 0, 1));
      shark.wagPhase += dt * (4.2 + sSpd * 1.45);
    }

    // 2) Craig Reynolds' 3 Boids Rules across all 72 Reef Fish!
    const accX = new Float32Array(BOID_COUNT);
    const accZ = new Float32Array(BOID_COUNT);

    let sumDirX = 0, sumDirZ = 0;
    let sumNearest = 0;
    let sumCx = 0, sumCz = 0;
    let nearSharkNow = 0;

    for (let i = 0; i < BOID_COUNT; i++) {
      const b = boids[i];
      let sepX = 0, sepZ = 0, sepN = 0;
      let aliX = 0, aliZ = 0, aliN = 0;
      let cohX = 0, cohZ = 0, cohN = 0;
      let nearest = Infinity;

      for (let j = 0; j < BOID_COUNT; j++) {
        if (i === j) continue;
        const o = boids[j];
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearest) nearest = d2;
        if (d2 < PERCEPTION_R * PERCEPTION_R && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          aliX += o.vx;
          aliZ += o.vz;
          aliN++;
          cohX += o.x;
          cohZ += o.z;
          cohN++;
          if (d < SEPARATION_R) {
            const w = (SEPARATION_R - d) / SEPARATION_R;
            sepX += (dx / d) * (w / Math.max(0.18, d));
            sepZ += (dz / d) * (w / Math.max(0.18, d));
            sepN++;
          }
        }
      }

      if (i === 0) metrics.heroNeighbors = aliN;
      sumNearest += Math.sqrt(nearest);
      sumCx += b.x;
      sumCz += b.z;

      let fSepX = 0, fSepZ = 0;
      let fAliX = 0, fAliZ = 0;
      let fCohX = 0, fCohZ = 0;

      // RULE 1: SEPARATION (steer away from crowded neighbors)
      if (sepN > 0) {
        const m = Math.hypot(sepX, sepZ) || 1;
        const desX = (sepX / m) * MAX_SPEED;
        const desZ = (sepZ / m) * MAX_SPEED;
        [fSepX, fSepZ] = limitVec(desX - b.vx, desZ - b.vz, MAX_FORCE * 1.15);
      }

      // RULE 2: ALIGNMENT (match average heading of nearby neighbors)
      if (aliN > 0) {
        const ax = aliX / aliN;
        const az = aliZ / aliN;
        const m = Math.hypot(ax, az) || 1;
        const desX = (ax / m) * MAX_SPEED;
        const desZ = (az / m) * MAX_SPEED;
        [fAliX, fAliZ] = limitVec(desX - b.vx, desZ - b.vz, MAX_FORCE * 0.72);
      }

      // RULE 3: COHESION (steer smoothly toward local neighbors' center of mass)
      if (cohN > 0) {
        const cx = cohX / cohN - b.x;
        const cz = cohZ / cohN - b.z;
        const m = Math.hypot(cx, cz) || 1;
        const desX = (cx / m) * MAX_SPEED;
        const desZ = (cz / m) * MAX_SPEED;
        [fCohX, fCohZ] = limitVec(desX - b.vx, desZ - b.vz, MAX_FORCE * 0.64);
      }

      // Store smoothed raw vectors on Hero Gold Boid for live 3D force vector visualization!
      if (b.isHero) {
        b.fSepX = lerp(b.fSepX, fSepX, clamp(dt * 10, 0, 1));
        b.fSepZ = lerp(b.fSepZ, fSepZ, clamp(dt * 10, 0, 1));
        b.fAliX = lerp(b.fAliX, fAliX, clamp(dt * 10, 0, 1));
        b.fAliZ = lerp(b.fAliZ, fAliZ, clamp(dt * 10, 0, 1));
        b.fCohX = lerp(b.fCohX, fCohX, clamp(dt * 10, 0, 1));
        b.fCohZ = lerp(b.fCohZ, fCohZ, clamp(dt * 10, 0, 1));
      }

      let fx = 0, fz = 0;
      if (rules.separation) { fx += fSepX * 2.35; fz += fSepZ * 2.35; }
      if (rules.alignment)  { fx += fAliX * 1.42; fz += fAliZ * 1.42; }
      if (rules.cohesion)   { fx += fCohX * 1.12; fz += fCohZ * 1.12; }

      // Subtle random exploration when alignment + cohesion are OFF so boids genuinely scatter!
      if (!rules.alignment && !rules.cohesion) {
        const wander = time * 1.9 + i * 2.31;
        fx += Math.cos(wander) * 3.6;
        fz += Math.sin(wander * 1.13) * 3.6;
      }

      // Soft Lagoon Wall Avoidance (smooth steering turn back inside the coral lagoon!)
      const margin = 1.65;
      if (b.x > REEF_BOUNDS.halfX - margin) fx -= (b.x - (REEF_BOUNDS.halfX - margin)) * 7.5;
      if (b.x < -REEF_BOUNDS.halfX + margin) fx += ((-REEF_BOUNDS.halfX + margin) - b.x) * 7.5;
      if (b.z > REEF_BOUNDS.halfZ - margin) fz -= (b.z - (REEF_BOUNDS.halfZ - margin)) * 7.5;
      if (b.z < -REEF_BOUNDS.halfZ + margin) fz += ((-REEF_BOUNDS.halfZ + margin) - b.z) * 7.5;

      // Coral Outcrop Obstacle Avoidance
      for (const cr of CORAL_ROCKS) {
        const dx = b.x - cr.x;
        const dz = b.z - cr.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const avoidR = cr.r + 0.95;
        if (d < avoidR) {
          const push = ((avoidR - d) / avoidR) * 18.0;
          fx += (dx / d) * push;
          fz += (dz / d) * push;
        }
      }

      // Predator Reef Shark Evade Force!
      if (shark.active) {
        const dx = b.x - shark.x;
        const dz = b.z - shark.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < SHARK_FEAR_R) {
          nearSharkNow++;
          const flee = ((SHARK_FEAR_R - d) / SHARK_FEAR_R) * 24.0;
          fx += (dx / d) * flee;
          fz += (dz / d) * flee;
        }
      }

      accX[i] = fx;
      accZ[i] = fz;
    }

    if (nearSharkNow >= 6 && Math.floor(time * 2) !== Math.floor((time - dt) * 2)) {
      scatters++;
    }

    // Integrate positions & smooth swimming articulation
    const meanCx = sumCx / BOID_COUNT;
    const meanCz = sumCz / BOID_COUNT;
    let spreadSum = 0;

    for (let i = 0; i < BOID_COUNT; i++) {
      const b = boids[i];
      const prevYaw = b.yaw;
      b.vx += accX[i] * dt;
      b.vz += accZ[i] * dt;
      let spd = Math.hypot(b.vx, b.vz);
      if (spd < MIN_SPEED) {
        const s = MIN_SPEED / Math.max(0.01, spd);
        b.vx *= s; b.vz *= s; spd = MIN_SPEED;
      } else if (spd > MAX_SPEED) {
        const s = MAX_SPEED / spd;
        b.vx *= s; b.vz *= s; spd = MAX_SPEED;
      }
      b.x = clamp(b.x + b.vx * dt, -REEF_BOUNDS.halfX + 0.35, REEF_BOUNDS.halfX - 0.35);
      b.z = clamp(b.z + b.vz * dt, -REEF_BOUNDS.halfZ + 0.35, REEF_BOUNDS.halfZ - 0.35);
      b.y = 1.05 + Math.sin(time * 1.9 + i * 0.85) * 0.22;

      b.yaw = Math.atan2(b.vx, b.vz);
      const turnRate = wrapAngle(b.yaw - prevYaw) / Math.max(0.004, dt);
      b.bank = lerp(b.bank, clamp(-turnRate * 0.25, -0.55, 0.55), clamp(dt * 9, 0, 1));
      b.wagPhase += dt * (6.5 + spd * 2.1);

      sumDirX += b.vx / spd;
      sumDirZ += b.vz / spd;
      spreadSum += Math.hypot(b.x - meanCx, b.z - meanCz);
    }

    metrics.polarization = Math.hypot(sumDirX, sumDirZ) / BOID_COUNT;
    metrics.avgNearest = sumNearest / BOID_COUNT;
    metrics.spread = spreadSum / BOID_COUNT;
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const hero = boids[0];

    // 1) Crisp world labels for Gold Inspector Boid & its 3 Live Force Vectors (SEP / ALI / COH)!
    if (showVectors && hero) {
      const drawMiniTag = (pt, text, col) => {
        if (!pt) return;
        ctx.save();
        ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(text).width + 10;
        ctx.fillStyle = "rgba(6, 18, 32, 0.88)";
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.roundRect(pt.x - tw * 0.5, pt.y - 9, tw, 18, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pt.x, pt.y + 0.5);
        ctx.restore();
      };

      const hs = projectToScreen(viewProj, hero.x, hero.y + 0.65, hero.z, cssW, cssH);
      drawMiniTag(hs, isPl ? "INSPEKTOR BOID" : "HERO BOID", "#fde047");

      if (rules.separation && Math.hypot(hero.fSepX, hero.fSepZ) > 0.28) {
        const sp = projectToScreen(viewProj, hero.x + hero.fSepX * 0.62, hero.y + 0.20, hero.z + hero.fSepZ * 0.62, cssW, cssH);
        drawMiniTag(sp, "SEP", "#fb7185");
      }
      if (rules.alignment && Math.hypot(hero.fAliX, hero.fAliZ) > 0.28) {
        const ap = projectToScreen(viewProj, hero.x + hero.fAliX * 0.62, hero.y + 0.22, hero.z + hero.fAliZ * 0.62, cssW, cssH);
        drawMiniTag(ap, isPl ? "ZGD" : "ALI", "#38bdf8");
      }
      if (rules.cohesion && Math.hypot(hero.fCohX, hero.fCohZ) > 0.28) {
        const cp = projectToScreen(viewProj, hero.x + hero.fCohX * 0.62, hero.y + 0.24, hero.z + hero.fCohZ * 0.62, cssW, cssH);
        drawMiniTag(cp, isPl ? "SPÓ" : "COH", "#34d399");
      }

      if (shark.active) {
        const ss = projectToScreen(viewProj, shark.x, shark.y + 0.95, shark.z, cssW, cssH);
        drawMiniTag(ss, isPl ? "DRAPIEŻNIK" : "PREDATOR", "#fda4af");
      }
    }

    // 2) Top-Right Live Emergent Flocking Metrics HUD (compact 1-line pill on mobile, full card on desktop!)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const polPct = Math.round(metrics.polarization * 100);
        const pillText = isPl
          ? `BOIDS ${BOID_COUNT} · Sync ${polPct}% · Odstęp ${metrics.avgNearest.toFixed(2)}m`
          : `BOIDS ${BOID_COUNT} · Sync ${polPct}% · Space ${metrics.avgNearest.toFixed(2)}m`;
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pillText).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(8, 20, 36, 0.84)";
        ctx.strokeStyle = "rgba(6, 182, 212, 0.68)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px, py, tw, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#67e8f9";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pillText, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
      const pad = 14;
      const panelW = Math.min(292, cssW - 28);
      const panelH = 152;
      const px = cssW - panelW - pad;

      ctx.save();
      ctx.fillStyle = "rgba(8, 20, 36, 0.84)";
      ctx.strokeStyle = "rgba(6, 182, 212, 0.62)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px, py, panelW, panelH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#67e8f9";
      ctx.fillText(
        isPl ? `BOIDS · ${BOID_COUNT} RYB · 0 LIDERÓW` : `BOIDS · ${BOID_COUNT} FISH · 0 LEADERS`,
        px + 12, py + 21
      );

      // 3 Rules color-coded status row
      const rY = py + 41;
      const drawChip = (x, label, on, col) => {
        ctx.fillStyle = on ? col : "rgba(100,116,139,0.28)";
        ctx.beginPath();
        ctx.roundRect(x, rY - 11, 84, 17, 4);
        ctx.fill();
        ctx.fillStyle = on ? "#08121f" : "#94a3b8";
        ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(label, x + 6, rY + 1);
      };
      drawChip(px + 12,  isPl ? "SEP " + (rules.separation ? "WŁ" : "WYŁ") : "SEP " + (rules.separation ? "ON" : "OFF"), rules.separation, "#fb7185");
      drawChip(px + 102, isPl ? "ZGD " + (rules.alignment ? "WŁ" : "WYŁ") : "ALI " + (rules.alignment ? "ON" : "OFF"), rules.alignment, "#38bdf8");
      drawChip(px + 192, isPl ? "SPÓ " + (rules.cohesion ? "WŁ" : "WYŁ") : "COH " + (rules.cohesion ? "ON" : "OFF"), rules.cohesion, "#34d399");

      // Alignment Order Parameter Bar (0..100%)
      const barX = px + 12, barY = py + 58, barW = panelW - 24, barH = 14;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();
      const polPct = Math.round(metrics.polarization * 100);
      ctx.fillStyle = polPct > 65 ? "#22d3ee" : polPct > 38 ? "#fbbf24" : "#f87171";
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(4, barW * clamp(metrics.polarization, 0, 1)), barH, 4);
      ctx.fill();
      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(
        isPl ? `SYNCHRONIZACJA ŁAWICY: ${polPct}%` : `FLOCK ALIGNMENT ORDER: ${polPct}%`,
        barX + 6, barY + 10.5
      );

      // Spacing & Spread Metrics
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = metrics.avgNearest < 0.55 ? "#fca5a5" : "#cbd5e1";
      ctx.fillText(
        isPl
          ? `Odstęp sąsiadów: ${metrics.avgNearest.toFixed(2)} m ${metrics.avgNearest < 0.55 ? "(KŁĄB!)" : "(OK)"}`
          : `Nearest Spacing: ${metrics.avgNearest.toFixed(2)} m ${metrics.avgNearest < 0.55 ? "(CLUMP!)" : "(OK)"}`,
        px + 12, py + 93
      );

      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(
        isPl
          ? `Rozrzut: ${metrics.spread.toFixed(1)} m  ·  Sąsiedzi Złotej: ${metrics.heroNeighbors}`
          : `Flock Spread: ${metrics.spread.toFixed(1)} m  ·  Hero Neigh: ${metrics.heroNeighbors}`,
        px + 12, py + 114
      );

      ctx.fillStyle = "#67e8f9";
      ctx.fillText(
        isPl
          ? `Rekin: ${shark.active ? (sharkAuto ? "AUTO" : "GRACZ") : "WYŁ"}  ·  Rozproszenia: ${scatters}`
          : `Shark: ${shark.active ? (sharkAuto ? "AUTO" : "USER") : "OFF"}  ·  Scatters: ${scatters}`,
        px + 12, py + 135
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
      ctx.fillStyle = "rgba(8, 20, 36, 0.90)";
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
        { id: "toggle-sep", label: pl ? `Separacja: ${rules.separation ? "WŁ" : "WYŁ"} [T]` : `Separation: ${rules.separation ? "ON" : "OFF"} [T]`, pressed: rules.separation },
        { id: "toggle-ali", label: pl ? `Zgodność: ${rules.alignment ? "WŁ" : "WYŁ"} [L]` : `Alignment: ${rules.alignment ? "ON" : "OFF"} [L]`, pressed: rules.alignment },
        { id: "toggle-coh", label: pl ? `Spójność: ${rules.cohesion ? "WŁ" : "WYŁ"} [K]` : `Cohesion: ${rules.cohesion ? "ON" : "OFF"} [K]`, pressed: rules.cohesion },
        { id: "cycle-preset", label: pl ? "Test Reguł [V]" : "Rule Preset [V]", pressed: presetIdx !== 0 },
        { id: "toggle-shark", label: pl ? `Rekin: ${shark.active ? (sharkAuto ? "Auto" : "Klik") : "WYŁ"} [F]` : `Shark: ${shark.active ? (sharkAuto ? "Auto" : "Click") : "OFF"} [F]`, pressed: shark.active },
        { id: "toggle-vectors", label: pl ? `Wektory: ${showVectors ? "WŁ" : "WYŁ"} [X]` : `Vectors: ${showVectors ? "ON" : "OFF"} [X]`, pressed: showVectors },
      ];
    },
    onAction(id) {
      if (id === "toggle-sep") {
        rules.separation = !rules.separation;
        audio?.ruleSwitch?.(rules.separation);
        setBanner(rules.separation ? "SEPARATION ON · PERSONAL SPACE RESTORED" : "SEPARATION OFF · WATCH THE CLUMP!", rules.separation ? "#fb7185" : "#ef4444", 1.8);
      } else if (id === "toggle-ali") {
        rules.alignment = !rules.alignment;
        audio?.ruleSwitch?.(rules.alignment);
        setBanner(rules.alignment ? "ALIGNMENT ON · HEADINGS SYNCED" : "ALIGNMENT OFF · RANDOM HEADINGS", "#38bdf8", 1.8);
      } else if (id === "toggle-coh") {
        rules.cohesion = !rules.cohesion;
        audio?.ruleSwitch?.(rules.cohesion);
        setBanner(rules.cohesion ? "COHESION ON · PULLING INTO SCHOOL" : "COHESION OFF · DRIFTING APART", "#34d399", 1.8);
      } else if (id === "cycle-preset") {
        applyPreset(presetIdx + 1);
      } else if (id === "toggle-shark") {
        if (!shark.active) { shark.active = true; sharkAuto = true; }
        else if (sharkAuto) { sharkAuto = false; }
        else { shark.active = false; }
        audio?.waterRipple?.();
      } else if (id === "toggle-vectors") {
        showVectors = !showVectors;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-sep");
      else if (code === "KeyL") this.onAction("toggle-ali");
      else if (code === "KeyK") this.onAction("toggle-coh");
      else if (code === "KeyV") this.onAction("cycle-preset");
      else if (code === "KeyF") this.onAction("toggle-shark");
      else if (code === "KeyX") this.onAction("toggle-vectors");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        shark.active = true;
        sharkAuto = false;
        shark.targetX = clamp(world[0], -REEF_BOUNDS.halfX + 0.8, REEF_BOUNDS.halfX - 0.8);
        shark.targetZ = clamp(world[2], -REEF_BOUNDS.halfZ + 0.8, REEF_BOUNDS.halfZ - 0.8);
        ripples.push({ x: shark.targetX, z: shark.targetZ, maxR: 2.2, age: 0, life: 0.75 });
        audio?.waterRipple?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time,
        boids,
        shark,
        rules,
        showVectors,
        bubbles,
        ripples,
        perceptionR: PERCEPTION_R,
        separationR: SEPARATION_R,
        sharkFearR: SHARK_FEAR_R,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        boidCount: boids.length,
        rules: { ...rules },
        presetIdx,
        sharkActive: shark.active,
        sharkAuto,
        polarization: Number(metrics.polarization.toFixed(3)),
        avgNearest: Number(metrics.avgNearest.toFixed(3)),
        spread: Number(metrics.spread.toFixed(2)),
        heroNeighbors: metrics.heroNeighbors,
        scatters,
      };
    },
  };
}
