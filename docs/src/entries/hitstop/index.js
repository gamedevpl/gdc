// Playable Entry #5: Hitstop & Game Juice — Visceral 3D Forge Hammer Impact Playground!
// Swing your giant Runed Warhammer (Space / Click) at 3 Runic Stone Golems and compare:
//   - Raw (0 ms, No Juice) -> flat wet-cardboard hits!
//   - Full Juice (55 ms or 110 ms Hitstop + Wind-up Anticipation + 1-Frame White Flash + Directional Camera Kick + Sparks!)
// Watch the live 60 FPS Frame Timeline in the top-right corner light up GOLD during Hitstop freezes while sparks keep flying!
import { clamp, lerp } from "../../gl-utils.js";
import { createForgeRenderer, projectPoint } from "./forge-renderer.js";

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smoothstep01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function drawBadge(ctx, x, y, text, bg, fg = "#ffffff", maxW = 1200) {
  ctx.save();
  ctx.font = "800 12.5px 'Proxima', -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  const pw = tw + 14, ph = 22;
  const cx = Math.max(pw / 2 + 8, Math.min(maxW - pw / 2 - 8, x));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - pw / 2, y - ph / 2, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(15,14,24,0.9)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + 0.5);
  ctx.restore();
}

function drawHpPips(ctx, x, y, hp, maxHp) {
  ctx.save();
  const r = 4.5, gap = 12;
  const startX = x - ((maxHp - 1) * gap) * 0.5;
  for (let i = 0; i < maxHp; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i < hp ? "#38bdf8" : "rgba(15,23,42,0.75)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.restore();
}

function drawFrameTimelineHud(ctx, ow, st, lang) {
  const pl = lang === "pl";
  if (ow < 520) {
    const lbl = st.hitstopActive
      ? (pl ? `⚡ ZAMROŻONO ${st.lastFreezeMs} ms` : `⚡ HITSTOP FREEZE ${st.lastFreezeMs} ms`)
      : st.juiceOn
        ? (pl ? `JUICE WŁ · HITSTOP ${st.effectiveMs}ms · CIOSY ${st.hits}` : `JUICE ON · HITSTOP ${st.effectiveMs}ms · HITS ${st.hits}`)
        : (pl ? `RAW 0ms · ZERO JUICE · CIOSY ${st.hits}` : `RAW 0ms · NO JUICE · HITS ${st.hits}`);
    ctx.save();
    ctx.font = "700 10.5px 'Courier New', monospace";
    const tw = Math.min(ow - 24, ctx.measureText(lbl).width + 22);
    const x = (ow - tw) * 0.5, y = 56;
    ctx.fillStyle = "rgba(21,20,35,0.88)";
    ctx.beginPath(); ctx.roundRect(x, y, tw, 24, 7); ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = st.hitstopActive ? "#fbbf24" : (st.juiceOn ? "#f59e0b" : "#94a3b8");
    ctx.stroke();
    ctx.fillStyle = st.hitstopActive ? "#fde047" : (st.juiceOn ? "#ffe1a2" : "#cbd5e1");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(lbl, ow * 0.5, y + 12.5, tw - 14);
    ctx.restore();
    return;
  }
  const boxW = Math.min(ow - 28, 410);
  const boxH = 84;
  const x = ow - boxW - 18;
  const y = 72;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.88)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = st.hitstopActive ? "#fbbf24" : (st.juiceOn ? "#f59e0b" : "#94a3b8");
  ctx.stroke();

  const headerTxt = st.playerControl
    ? (pl
      ? `HITSTOP ${st.effectiveMs} ms · CIOSY ${st.hits} · ROZBITE ${st.shatters} · H=MS · T=JUICE`
      : `HITSTOP ${st.effectiveMs} ms · HITS ${st.hits} · SHATTERS ${st.shatters} · H=MS · T=JUICE`)
    : (pl
      ? `AUTO-DEMO (${st.juiceOn ? "JUICE ON" : "RAW 0 ms"}) · GRAJ: WASD + SPACJA/LPM`
      : `AUTO-DEMO (${st.juiceOn ? "JUICE ON" : "RAW 0 ms"}) · PLAY: WASD + SPACE/CLICK`);

  ctx.font = "700 11px 'Courier New', monospace";
  ctx.fillStyle = st.hitstopActive ? "#fde047" : (st.juiceOn ? "#ffe1a2" : "#cbd5e1");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(headerTxt, x + 12, y + 17);

  // Live 60 FPS Frame Timeline strip (28 frames): shows WIND-UP (orange), HITSTOP FREEZE (bright gold), ACTIVE (cyan), IDLE (slate)
  const stripX = x + 12;
  const stripY = y + 32;
  const stripW = boxW - 24;
  const stripH = 22;
  const n = st.frameTape.length;
  const cellW = stripW / n;

  for (let i = 0; i < n; i++) {
    const k = st.frameTape[i]; // 0=idle, 1=windup, 2=swing, 3=HITSTOP FREEZE!
    ctx.fillStyle =
      k === 3 ? "#fbbf24" :
      k === 2 ? "#38bdf8" :
      k === 1 ? "#ea580c" : "rgba(51,65,85,0.55)";
    ctx.fillRect(stripX + i * cellW + 1, stripY, Math.max(2, cellW - 2), stripH);
  }

  // Footer legend / status line
  ctx.font = "700 10.5px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = st.hitstopActive ? "#fde047" : "#94a3b8";
  const statusTxt = st.hitstopActive
    ? (pl ? `⚡ ZAMROŻONO ${st.lastFreezeMs} ms (${Math.round(st.lastFreezeMs / 16.7)} KLATKI) — ISKRY LECĄ!` : `⚡ FROZEN ${st.lastFreezeMs} ms (${Math.round(st.lastFreezeMs / 16.7)} FRAMES) — SPARKS LIVE!`)
    : (pl
      ? (st.juiceOn ? `ZAMACH + HITSTOP ${st.effectiveMs} ms + ${st.kickFlash ? "BŁYSK & ODRZUT" : "BEZ BŁYSKU"}` : "SUROWA ANIMACJA (0 ms · ZERO JUICE)")
      : (st.juiceOn ? `WIND-UP + ${st.effectiveMs} ms HITSTOP + ${st.kickFlash ? "FLASH & KICK" : "NO FLASH"}` : "RAW ANIMATION (0 ms · NO JUICE)"));
  ctx.fillText(statusTxt, stripX, y + 68);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createForgeRenderer(gl);

  let juiceOn = true;       // Master toggle: Full Game Juice vs Raw 0 ms wet cardboard!
  let hitstopMs = 60;       // 0 | 60 | 115 ms!
  let kickFlashOn = true;   // Toggle 1-frame white flash + directional camera kick + sparks
  let playerControl = false;
  let prevPlayerControl = false;

  let realTime = 0;
  let hitstopTimer = 0;
  let lastFreezeMs = 0;
  let hits = 0;
  let shatters = 0;
  let freezeGlow = 0;
  let banner = null;

  // Directional damped camera kick (smooth spring recoil along blow vector — zero ugly noise!)
  let camKickX = 0, camKickZ = 0, camKickY = 0;
  let camKickVx = 0, camKickVz = 0, camKickVy = 0;
  let impactLight = { x: 0, y: 1.4, z: 0, str: 0 };

  const frameTape = new Array(28).fill(0);
  let tapeAcc = 0;

  const smearPoints = [];
  const rings = [];
  const sparks = [];
  const debris = [];

  const hero = {
    x: -1.45, y: 0, z: 0.4, vx: 0, vz: 0, yaw: Math.PI * 0.5,
    torsoYaw: 0, hammerPitch: -0.25, hammerYaw: 0,
    walkPhase: 0, walkAmp: 0, squash: 0,
    whiteFlash: 0, chargeGlow: 0,
    // Swing state machine: idle | windup | active | recover
    swingState: "idle",
    swingTimer: 0,
    swingDur: 0,
    swingHitDone: false,
    comboStep: 0,
    comboReset: 0,
    cooldown: 0,
  };

  const GOLEM_HOMES = [
    { x: 1.55, z: 0.35 },
    { x: 0.15, z: -2.45 },
    { x: -2.15, z: -1.95 },
  ];

  const golems = GOLEM_HOMES.map((home, id) => ({
    id,
    homeX: home.x, homeZ: home.z,
    x: home.x, y: 0, z: home.z,
    vx: 0, vz: 0,
    yaw: Math.atan2(hero.x - home.x, hero.z - home.z),
    hp: 4, maxHp: 4,
    recoil: 0, squash: 0, armLift: 0,
    whiteFlash: 0, vibMag: 0, vibX: 0, vibY: 0, vibZ: 0,
    scale: 1.0, respawnTimer: 0,
  }));

  // Auto-demo alternates 2 Full Juice strikes -> 2 Raw 0 ms strikes so viewers immediately feel the A/B contrast!
  let demoTimer = 0.65;
  let demoStrikeCount = 0;

  function showBanner(text, bg, fg = "#ffffff", dur = 0.90) {
    banner = { text, bg, fg, timer: dur };
  }

  function spawnSparks(x, y, z, col, count = 20, speed = 5.5, lift = 3.5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.85);
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: lift * (0.35 + Math.random() * 0.9),
        vz: Math.sin(a) * sp,
        r: col[0], g: col[1], b: col[2],
        life: 0.55 + Math.random() * 0.45,
        size: 0.13 + Math.random() * 0.11,
      });
    }
  }

  function spawnDebris(x, y, z, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.4 + Math.random() * 4.4;
      const isRune = i % 4 === 0;
      debris.push({
        x: x + (Math.random() - 0.5) * 0.7,
        y: y + 0.5 + Math.random() * 1.1,
        z: z + (Math.random() - 0.5) * 0.7,
        vx: Math.cos(a) * sp,
        vy: 3.2 + Math.random() * 4.2,
        vz: Math.sin(a) * sp,
        s: isRune ? 0.12 : (0.14 + Math.random() * 0.12),
        col: isRune ? [0.18, 0.92, 1.0] : [0.36, 0.38, 0.44],
        life: 1.2 + Math.random() * 0.5,
      });
    }
  }

  function reset(keepPlayer = false) {
    hitstopTimer = 0;
    freezeGlow = 0;
    camKickX = camKickY = camKickZ = 0;
    camKickVx = camKickVy = camKickVz = 0;
    impactLight.str = 0;
    smearPoints.length = 0;
    rings.length = 0;
    sparks.length = 0;
    debris.length = 0;
    frameTape.fill(0);
    hero.x = -1.45; hero.z = 0.4; hero.vx = 0; hero.vz = 0;
    hero.yaw = Math.PI * 0.5;
    hero.torsoYaw = 0; hero.hammerPitch = -0.25; hero.hammerYaw = 0;
    hero.squash = 0; hero.chargeGlow = 0; hero.swingState = "idle"; hero.cooldown = 0; hero.comboStep = 0;
    for (const g of golems) {
      g.x = g.homeX; g.z = g.homeZ; g.vx = 0; g.vz = 0;
      g.hp = g.maxHp; g.recoil = 0; g.squash = 0; g.whiteFlash = 0;
      g.vibMag = 0; g.vibX = g.vibY = g.vibZ = 0; g.scale = 1.0; g.respawnTimer = 0;
      g.yaw = Math.atan2(hero.x - g.x, hero.z - g.z);
    }
    if (!keepPlayer) {
      hits = 0; shatters = 0; banner = null;
      demoTimer = 0.55; demoStrikeCount = 0;
    }
  }
  reset(false);

  function nearestLivingGolem() {
    let best = null, bestD = 999;
    for (const g of golems) {
      if (g.respawnTimer > 0) continue;
      const d = Math.hypot(g.x - hero.x, g.z - hero.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return { golem: best, dist: bestD };
  }

  function startSwing(aimWorld = null, fromPlayer = true) {
    if (hero.swingState !== "idle" || hero.cooldown > 0) return;
    if (fromPlayer) playerControl = true;

    if (aimWorld) {
      const dx = aimWorld[0] - hero.x, dz = aimWorld[2] - hero.z;
      if (Math.hypot(dx, dz) > 0.25) hero.yaw = Math.atan2(dx, dz);
    } else {
      const { golem, dist } = nearestLivingGolem();
      if (golem && dist < 5.0) hero.yaw = Math.atan2(golem.x - hero.x, golem.z - hero.z);
    }

    hero.comboStep = hero.comboReset > 0 ? (hero.comboStep + 1) % 3 : 0;
    hero.comboReset = 1.2;
    hero.swingHitDone = false;
    smearPoints.length = 0;

    if (juiceOn) {
      // Crisp Wind-Up Anticipation! (longer & heavier on 3rd-hit Overhead Anvil Crush!)
      hero.swingState = "windup";
      hero.swingDur = hero.comboStep === 2 ? 0.17 : 0.12;
      hero.swingTimer = 0;
    } else {
      // Raw 0 ms mode: skips anticipation completely, jumps straight into flat linear swing!
      hero.swingState = "active";
      hero.swingDur = 0.18;
      hero.swingTimer = 0;
      audio?.hammerSwing?.(false);
    }
  }

  function resolveHammerImpact() {
    const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
    const isHeavy = hero.comboStep === 2;
    const reach = isHeavy ? 4.0 : 3.55;
    let hitTarget = null;
    let hitCount = 0;

    for (const g of golems) {
      if (g.respawnTimer > 0) continue;
      const dx = g.x - hero.x, dz = g.z - hero.z;
      const d = Math.hypot(dx, dz);
      if (d < reach) {
        const dot = (dx * fx + dz * fz) / Math.max(0.01, d);
        if (dot > 0.15 || d < 1.9) {
          hitCount++;
          if (!hitTarget) hitTarget = g;
          hits++;
          const dmg = isHeavy ? 2 : 1;
          g.hp -= dmg;

          if (juiceOn) {
            const nx = dx / Math.max(0.1, d), nz = dz / Math.max(0.1, d);
            const kb = isHeavy ? 7.8 : 5.2;
            g.vx += nx * kb;
            g.vz += nz * kb;
            g.recoil = isHeavy ? 0.65 : 0.44;
            g.squash = isHeavy ? -0.78 : -0.52; // instant heavy crush compression!
            g.armLift = -0.85;

            if (kickFlashOn) {
              g.whiteFlash = 1.0; // crisp 1-frame pure white arcade hit-flash!
              const cx = (hero.x + g.x) * 0.5 + fx * 0.35;
              const cz = (hero.z + g.z) * 0.5 + fz * 0.35;
              impactLight = { x: cx, y: 1.35, z: cz, str: isHeavy ? 2.2 : 1.4 };
              rings.push({ x: cx, y: 1.25, z: cz, rad: 0.3, maxRad: isHeavy ? 2.5 : 1.8, r: 1.0, g: 0.85, b: 0.35, a: 0.95, vertical: true });
              rings.push({ x: g.x, y: 0.08, z: g.z, rad: 0.35, maxRad: isHeavy ? 3.1 : 2.1, r: 1.0, g: 0.68, b: 0.20, a: 0.90, vertical: false });
              spawnSparks(cx, 1.3, cz, [1.0, 0.86, 0.28], isHeavy ? 30 : 18, isHeavy ? 7.2 : 5.2, isHeavy ? 4.6 : 3.2);
              spawnSparks(cx, 1.3, cz, [0.22, 0.92, 1.0], isHeavy ? 14 : 8, 4.8, 3.0);

              // Directional Camera Kick along the exact hammer blow direction!
              const kAmp = isHeavy ? 7.2 : 4.2;
              camKickVx += nx * kAmp;
              camKickVz += nz * kAmp;
              camKickVy -= isHeavy ? 2.8 : 1.5;
            }

            // HITSTOP FREEZE! Freeze both fighters while sparks & embers keep flying!
            const effectiveMs = isHeavy ? Math.round(hitstopMs * 1.45) : hitstopMs;
            if (effectiveMs > 0) {
              hitstopTimer = effectiveMs / 1000;
              lastFreezeMs = effectiveMs;
              freezeGlow = 1.0;
              g.vibMag = isHeavy ? 0.14 : 0.095;
            }
          } else {
            // Raw 0 ms mode: NO freeze, NO flash, NO sparks, NO kick — tiny lifeless nudge!
            g.recoil = 0.12;
          }

          if (g.hp <= 0) {
            shatters++;
            g.respawnTimer = 1.8;
            g.scale = 0.0;
            if (juiceOn && kickFlashOn) {
              spawnDebris(g.x, 0.2, g.z, 18);
              spawnSparks(g.x, 1.2, g.z, [0.22, 0.95, 1.0], 26, 6.8, 4.8);
              rings.push({ x: g.x, y: 0.1, z: g.z, rad: 0.4, maxRad: 3.6, r: 0.25, g: 0.92, b: 1.0, a: 0.95, vertical: false });
              showBanner(isHeavy ? `ANVIL SHATTER! (#${shatters})` : `GOLEM SHATTERED! (#${shatters})`, "#38bdf8", "#041c24", 1.0);
            } else {
              showBanner(`K.O. (#${shatters})`, "#64748b", "#ffffff", 0.7);
            }
            audio?.golemShatter?.(juiceOn);
          }
        }
      }
    }

    if (hitCount > 0) {
      const effectiveMs = juiceOn ? (isHeavy ? Math.round(hitstopMs * 1.45) : hitstopMs) : 0;
      if (!banner || banner.timer < 0.3) {
        if (!juiceOn) {
          showBanner("RAW HIT (0 ms · NO JUICE)", "#64748b", "#f1f5f9", 0.75);
        } else if (effectiveMs > 0) {
          showBanner(isHeavy ? `MEGA HITSTOP! (${effectiveMs} ms)` : `HITSTOP! (${effectiveMs} ms)`, "#f59e0b", "#1c1204", 0.85);
        } else {
          showBanner("JUICE (0 ms HITSTOP)", "#fb923c", "#1c1204", 0.75);
        }
      }
      audio?.hammerImpact?.(juiceOn, isHeavy);
      requestHudRefresh?.();
    }
  }

  function update(dt, keys = new Set()) {
    const rawH = Math.min(0.035, Math.max(0.001, dt));
    realTime += rawH;
    freezeGlow = Math.max(0, freezeGlow - rawH * 3.8);
    impactLight.str = Math.max(0, impactLight.str - rawH * 7.5);
    if (banner) {
      banner.timer -= rawH;
      if (banner.timer <= 0) banner = null;
    }

    // Damped spring physics for directional Camera Kick (always ticks in real time!)
    const kStiff = 190.0, kDamp = 18.0;
    camKickVx += (-kStiff * camKickX - kDamp * camKickVx) * rawH;
    camKickVy += (-kStiff * camKickY - kDamp * camKickVy) * rawH;
    camKickVz += (-kStiff * camKickZ - kDamp * camKickVz) * rawH;
    camKickX += camKickVx * rawH;
    camKickY += camKickVy * rawH;
    camKickZ += camKickVz * rawH;

    // Sparks, shockwaves & stone debris ALWAYS animate at full 60 fps EVEN DURING HITSTOP FREEZE!
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.rad = lerp(rg.rad, rg.maxRad, 1 - Math.exp(-10.5 * rawH));
      rg.a -= rawH * 2.4;
      if (rg.a <= 0.02) rings.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx * rawH; sp.y += sp.vy * rawH; sp.z += sp.vz * rawH;
      sp.vy -= 11.0 * rawH;
      if (sp.y < 0.06) { sp.y = 0.06; sp.vy *= -0.35; sp.vx *= 0.75; sp.vz *= 0.75; }
      sp.life -= rawH * 1.45;
      if (sp.life <= 0) sparks.splice(i, 1);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.x += d.vx * rawH; d.y += d.vy * rawH; d.z += d.vz * rawH;
      d.vy -= 15.0 * rawH;
      if (d.y < d.s) { d.y = d.s; d.vy *= -0.38; d.vx *= 0.72; d.vz *= 0.72; }
      d.life -= rawH;
      if (d.life <= 0) debris.splice(i, 1);
    }
    for (let i = smearPoints.length - 1; i >= 0; i--) {
      smearPoints[i].a -= rawH * (hitstopTimer > 0 ? 0.6 : 5.2);
      if (smearPoints[i].a <= 0.01) smearPoints.splice(i, 1);
    }

    // Record live 60 FPS frame state into timeline tape
    tapeAcc += rawH;
    if (tapeAcc >= 1 / 30) {
      tapeAcc = 0;
      const code =
        hitstopTimer > 0 ? 3 :
        hero.swingState === "active" ? 2 :
        hero.swingState === "windup" ? 1 : 0;
      frameTape.push(code);
      if (frameTape.length > 28) frameTape.shift();
    }

    // HITSTOP FREEZE! Actors freeze completely while struck Golem vibrates with pent-up kinetic tension!
    if (hitstopTimer > 0) {
      hitstopTimer = Math.max(0, hitstopTimer - rawH);
      for (const g of golems) {
        if (g.vibMag > 0.002) {
          g.vibX = Math.sin(realTime * 195 + g.id) * g.vibMag;
          g.vibY = Math.cos(realTime * 160 + g.id) * g.vibMag * 0.35;
          g.vibZ = Math.cos(realTime * 210 + g.id) * g.vibMag;
        }
        // Decay 1-frame white flash crisp & punchy (holds bright across initial freeze frames!)
        g.whiteFlash = Math.max(0, g.whiteFlash - rawH * 9.5);
      }
      return;
    }

    // Reset Hitstop vibration once freeze ends!
    for (const g of golems) { g.vibX = g.vibY = g.vibZ = 0; g.vibMag *= Math.exp(-16 * rawH); }

    // Normal gameplay step (h = rawH)
    const h = rawH;
    hero.cooldown = Math.max(0, hero.cooldown - h);
    hero.comboReset = Math.max(0, hero.comboReset - h);
    hero.whiteFlash = Math.max(0, hero.whiteFlash - h * 6);
    hero.squash *= Math.exp(-11 * h);
    hero.chargeGlow *= Math.exp(-8 * h);

    const up = keys.has("KeyW") || keys.has("ArrowUp");
    const dn = keys.has("KeyS") || keys.has("ArrowDown");
    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");

    if (up || dn || lt || rt) playerControl = true;
    if (playerControl !== prevPlayerControl) {
      prevPlayerControl = playerControl;
      requestHudRefresh?.();
    }

    if (playerControl) {
      let mx = (rt ? 1 : 0) - (lt ? 1 : 0);
      let mz = (dn ? 1 : 0) - (up ? 1 : 0);
      const ml = Math.hypot(mx, mz);
      const maxSpd = hero.swingState === "idle" ? 5.6 : 1.6;
      const tvx = ml > 0.01 ? (mx / ml) * maxSpd : 0;
      const tvz = ml > 0.01 ? (mz / ml) * maxSpd : 0;
      hero.vx += (tvx - hero.vx) * (1 - Math.exp(-12 * h));
      hero.vz += (tvz - hero.vz) * (1 - Math.exp(-12 * h));
      hero.x = clamp(hero.x + hero.vx * h, -5.2, 5.2);
      hero.z = clamp(hero.z + hero.vz * h, -4.4, 5.2);
      if (ml > 0.01 && hero.swingState === "idle") {
        hero.yaw += angleDiff(Math.atan2(mx, mz), hero.yaw) * (1 - Math.exp(-11 * h));
      }
    } else {
      // Auto-Demo: walks smoothly toward nearest living Golem and alternates 3 Juice hits vs 2 Raw hits!
      const { golem, dist } = nearestLivingGolem();
      if (golem) {
        const dx = golem.x - hero.x, dz = golem.z - hero.z;
        const desired = 2.45;
        if (dist > desired + 0.25 && hero.swingState === "idle") {
          const sp = Math.min(4.2, (dist - desired) * 3.0);
          hero.vx += ((dx / dist) * sp - hero.vx) * (1 - Math.exp(-8 * h));
          hero.vz += ((dz / dist) * sp - hero.vz) * (1 - Math.exp(-8 * h));
        } else {
          hero.vx *= Math.exp(-10 * h);
          hero.vz *= Math.exp(-10 * h);
        }
        hero.x = clamp(hero.x + hero.vx * h, -5.0, 5.0);
        hero.z = clamp(hero.z + hero.vz * h, -4.2, 5.0);
        if (hero.swingState === "idle") {
          hero.yaw += angleDiff(Math.atan2(dx, dz), hero.yaw) * (1 - Math.exp(-10 * h));
        }
        if (dist < 3.1 && hero.swingState === "idle") {
          demoTimer -= h;
          if (demoTimer <= 0) {
            // Cycle 3 Juice swings -> 2 Raw swings automatically so visitors see the stark A/B contrast!
            const phaseIdx = demoStrikeCount % 5;
            const wantJuice = phaseIdx < 3;
            if (wantJuice !== juiceOn) {
              juiceOn = wantJuice;
              requestHudRefresh?.();
            }
            demoStrikeCount++;
            demoTimer = 1.05;
            startSwing(null, false);
          }
        }
      }
    }

    // Warhammer Swing Kinematics (Wind-up Anticipation -> Explosive Active Strike -> Follow-Through!)
    const isHeavy = hero.comboStep === 2;
    if (hero.swingState === "windup") {
      hero.swingTimer += h;
      const u = smoothstep01(hero.swingTimer / hero.swingDur);
      hero.chargeGlow = u;
      hero.squash = -0.32 * u; // coiling crouch!
      if (isHeavy) {
        hero.hammerPitch = lerp(-0.25, -2.05, u);
        hero.hammerYaw = lerp(0.0, 0.12, u);
        hero.torsoYaw = lerp(0.0, -0.32, u);
      } else {
        const dir = hero.comboStep === 1 ? -1 : 1;
        hero.hammerPitch = lerp(-0.25, -0.95, u);
        hero.hammerYaw = lerp(0.0, -1.05 * dir, u);
        hero.torsoYaw = lerp(0.0, -0.68 * dir, u);
      }
      if (hero.swingTimer >= hero.swingDur) {
        hero.swingState = "active";
        hero.swingDur = isHeavy ? 0.11 : 0.095;
        hero.swingTimer = 0;
        // Forward momentum lunge into strike!
        const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
        hero.vx += fx * (isHeavy ? 6.5 : 4.2);
        hero.vz += fz * (isHeavy ? 6.5 : 4.2);
        audio?.hammerSwing?.(true);
      }
    } else if (hero.swingState === "active") {
      hero.swingTimer += h;
      const u = smoothstep01(hero.swingTimer / hero.swingDur);
      hero.chargeGlow = juiceOn ? 1.0 : 0.0;
      hero.squash = juiceOn ? 0.25 * Math.sin(u * Math.PI) : 0;
      if (isHeavy && juiceOn) {
        hero.hammerPitch = lerp(-2.05, 0.92, u);
        hero.hammerYaw = lerp(0.12, 0.0, u);
        hero.torsoYaw = lerp(-0.32, 0.22, u);
      } else {
        const dir = hero.comboStep === 1 ? -1 : 1;
        const startYaw = juiceOn ? -1.05 * dir : -0.65 * dir;
        hero.hammerPitch = lerp(juiceOn ? -0.95 : -0.30, 0.55, u);
        hero.hammerYaw = lerp(startYaw, 1.05 * dir, u);
        hero.torsoYaw = lerp(juiceOn ? -0.68 * dir : -0.25 * dir, 0.62 * dir, u);
      }

      // Append glowing molten hammer arc smear point when Juice is ON!
      if (juiceOn && kickFlashOn) {
        const ang = hero.yaw + hero.torsoYaw + hero.hammerYaw;
        const fx = Math.sin(ang), fz = Math.cos(ang);
        const hY = isHeavy ? (2.4 - u * 1.9) : 1.15;
        smearPoints.push({
          inner: [hero.x + fx * 0.95, hY, hero.z + fz * 0.95],
          outer: [hero.x + fx * 2.25, hY + (isHeavy ? 0.25 : 0.05), hero.z + fz * 2.25],
          a: 0.95,
        });
        if (smearPoints.length > 10) smearPoints.shift();
      }

      if (!hero.swingHitDone && u >= 0.48) {
        hero.swingHitDone = true;
        resolveHammerImpact();
      }

      if (hero.swingTimer >= hero.swingDur) {
        hero.swingState = "recover";
        hero.swingDur = isHeavy ? 0.34 : 0.24;
        hero.swingTimer = 0;
        hero.cooldown = isHeavy ? 0.22 : 0.14;
      }
    } else if (hero.swingState === "recover") {
      hero.swingTimer += h;
      const u = smoothstep01(hero.swingTimer / hero.swingDur);
      hero.hammerPitch = lerp(hero.hammerPitch, -0.25, u * 0.28);
      hero.hammerYaw = lerp(hero.hammerYaw, 0.0, u * 0.28);
      hero.torsoYaw = lerp(hero.torsoYaw, 0.0, u * 0.28);
      if (hero.swingTimer >= hero.swingDur) {
        hero.swingState = "idle";
      }
    } else {
      hero.hammerPitch += (-0.25 + Math.sin(realTime * 2.6) * 0.06 - hero.hammerPitch) * (1 - Math.exp(-8 * h));
      hero.hammerYaw *= Math.exp(-10 * h);
      hero.torsoYaw *= Math.exp(-10 * h);
    }

    // Walk cycle
    const hSpd = Math.hypot(hero.vx, hero.vz);
    hero.walkAmp += ((hSpd > 0.35 ? Math.min(1, hSpd / 4.8) : 0) - hero.walkAmp) * (1 - Math.exp(-10 * h));
    if (hero.walkAmp > 0.02) hero.walkPhase += h * (4.2 + hSpd * 1.25);

    // Golem spring recovery, knockback friction & respawn
    for (const g of golems) {
      g.whiteFlash = Math.max(0, g.whiteFlash - h * 11.0);
      g.recoil *= Math.exp(-7.5 * h);
      g.squash *= Math.exp(-9.5 * h);
      g.armLift *= Math.exp(-7.0 * h);

      if (g.respawnTimer > 0) {
        g.respawnTimer -= h;
        if (g.respawnTimer <= 0) {
          g.x = g.homeX; g.z = g.homeZ; g.vx = 0; g.vz = 0;
          g.hp = g.maxHp; g.scale = 0.05; g.recoil = 0; g.squash = 0.45;
          spawnSparks(g.x, 1.0, g.z, [0.22, 0.92, 1.0], 12, 3.0, 2.5);
        }
      } else {
        g.scale = lerp(g.scale, 1.0, 1 - Math.exp(-9 * h));
        // Gentle pull back toward home stone spot so Golems stay cleanly positioned in arena
        const hx = g.homeX - g.x, hz = g.homeZ - g.z;
        g.vx += (hx * 1.2 - g.vx * 4.8) * h;
        g.vz += (hz * 1.2 - g.vz * 4.8) * h;
        g.x = clamp(g.x + g.vx * h, -5.0, 5.0);
        g.z = clamp(g.z + g.vz * h, -4.4, 4.8);
        g.yaw += angleDiff(Math.atan2(hero.x - g.x, hero.z - g.z), g.yaw) * (1 - Math.exp(-6 * h));
      }
    }
  }

  function getCameraOverride(baseCam) {
    return {
      targetX: baseCam.targetX + camKickX,
      targetY: baseCam.targetY + camKickY,
      targetZ: baseCam.targetZ + camKickZ,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    const { viewProj } = renderer.render({
      w, h, cam, time: realTime, hero, golems,
      smearPoints, rings, sparks, debris,
      impactLight,
      freezeGlow,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const noHud = typeof document !== "undefined" && document.body.classList.contains("no-hud");
      if (!noHud) {
        drawFrameTimelineHud(ovCtx, ow, {
          juiceOn,
          effectiveMs: juiceOn ? hitstopMs : 0,
          kickFlash: kickFlashOn,
          playerControl,
          hitstopActive: hitstopTimer > 0,
          lastFreezeMs,
          hits,
          shatters,
          frameTape,
        }, lang);
      }

      if (banner) {
        const p = projectPoint([hero.x, 2.95, hero.z], viewProj, ow, oh);
        if (p) drawBadge(ovCtx, p.x, p.y, banner.text, banner.bg, banner.fg, ow);
      }

      for (const g of golems) {
        if (g.respawnTimer > 0) continue;
        if (g.hp < g.maxHp) {
          const pHp = projectPoint([g.x, 2.65, g.z], viewProj, ow, oh);
          if (pHp) drawHpPips(ovCtx, pHp.x, pHp.y, g.hp, g.maxHp);
        }
      }
    }
  }

  return {
    id: "hitstop",
    defaultCam: { yaw: 0.14, pitch: 0.56, dist: 14.5, targetX: 0.0, targetY: 0.7, targetZ: -0.4, fovDeg: 38 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "juice", label: pl ? "Full Juice (ON)" : "Full Juice (ON)", pressed: juiceOn },
        { id: "raw", label: pl ? "Raw (0 ms · OFF)" : "Raw (0 ms · OFF)", pressed: !juiceOn },
        { id: "ms", label: `Hitstop: ${juiceOn ? hitstopMs : 0} ms`, pressed: juiceOn && hitstopMs > 0 },
        { id: "kick", label: kickFlashOn ? (pl ? "Błysk+Odrzut: WŁ" : "Flash+Kick: ON") : (pl ? "Błysk+Odrzut: WYŁ" : "Flash+Kick: OFF"), pressed: juiceOn && kickFlashOn },
        { id: "smash", label: pl ? "Uderz (Spacja)" : "Smash (Space)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "juice") { juiceOn = true; if (hitstopMs === 0) hitstopMs = 60; }
      if (id === "raw") { juiceOn = false; }
      if (id === "ms") {
        juiceOn = true;
        hitstopMs = hitstopMs === 0 ? 60 : hitstopMs === 60 ? 115 : 0;
      }
      if (id === "kick") { kickFlashOn = !kickFlashOn; }
      if (id === "smash") { startSwing(null, true); }
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space" || code === "KeyJ" || code === "Enter") startSwing(null, true);
      if (code === "KeyT") { juiceOn = !juiceOn; }
      if (code === "KeyH") { juiceOn = true; hitstopMs = hitstopMs === 0 ? 60 : hitstopMs === 60 ? 115 : 0; }
      if (code === "KeyK") { kickFlashOn = !kickFlashOn; }
      if (code === "ShiftLeft" || code === "ShiftRight" || code === "KeyE") {
        const { golem, dist } = nearestLivingGolem();
        if (golem && dist > 1.8) {
          const dx = (golem.x - hero.x) / dist, dz = (golem.z - hero.z) / dist;
          hero.yaw = Math.atan2(dx, dz);
          hero.vx = dx * 11.0;
          hero.vz = dz * 11.0;
        }
        startSwing(null, true);
      }
    },
    onClickWorld(worldPt, { button }) {
      if (button === 0) startSwing(worldPt, true);
    },
    getDebugState() {
      return {
        juiceOn,
        hitstopMs: juiceOn ? hitstopMs : 0,
        kickFlashOn,
        hitstopActive: hitstopTimer > 0,
        lastFreezeMs,
        hits,
        shatters,
        comboStep: hero.comboStep,
        swingState: hero.swingState,
        camKickMag: +Math.hypot(camKickX, camKickY, camKickZ).toFixed(3),
      };
    },
    reset: () => reset(false),
    update,
    render,
  };
}
