// Playable Entry #2: Attack Tokens — Silky-Smooth Velocity-Driven 3D Sword & Shield Combat!
// Smooth acceleration/deceleration, smooth velocity-based sword lunge (ZERO teleport!), smooth damped camera impulse,
// smooth skeleton steering & swing easing, natural leg stride, Space/Click = 3-Hit Combo, E/Right-Click = Block & Parry, Shift = Dodge!
import { createArenaRenderer } from "./arena-renderer.js";

function project3D(world, vp, w, h) {
  const [x, y, z] = world;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
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
  const r = 4.2, gap = 12;
  const startX = x - ((maxHp - 1) * gap) * 0.5;
  for (let i = 0; i < maxHp; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i < hp ? "#f43f5e" : "rgba(15,23,42,0.75)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.restore();
}

function drawCombatHud(ctx, ow, state, lang) {
  const pl = lang === "pl";
  if (ow < 520) {
    const tokTxt = state.tokenCount === 0
      ? (pl ? "CHAOS (0 TOKENÓW)" : "TOKENS: OFF (CHAOS)")
      : (pl ? `${state.tokenCount} TOKEN · PARRY ${state.parries}` : `${state.tokenCount} TOKEN · PARRIES ${state.parries}`);
    const lbl = `HP ${Math.round(state.hp)} · ${tokTxt}`;
    ctx.save();
    ctx.font = "700 10.5px 'Courier New', monospace";
    const tw = Math.min(ow - 24, ctx.measureText(lbl).width + 22);
    const x = (ow - tw) * 0.5, y = 56;
    ctx.fillStyle = "rgba(21,20,35,0.88)";
    ctx.beginPath(); ctx.roundRect(x, y, tw, 24, 7); ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = state.tokenCount === 0 ? "#ef4444" : state.playerControl ? "#00e4ac" : "#eea75e";
    ctx.stroke();
    ctx.fillStyle = state.tokenCount === 0 ? "#fda4af" : state.playerControl ? "#76ddaf" : "#ffe1a2";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(lbl, ow * 0.5, y + 12.5, tw - 14);
    ctx.restore();
    return;
  }
  const boxW = Math.min(ow - 24, 460);
  const boxH = 38;
  const x = ow - boxW - 18;
  const y = 78;
  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.86)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.playerControl ? "#00e4ac" : "#eea75e";
  ctx.stroke();

  const lbl = state.playerControl
    ? (pl
      ? `HP ${Math.round(state.hp)} · KO ${state.kills} · PARRY ${state.parries} · SPACJA=CIĘCIE · E/PPM=BLOK`
      : `HP ${Math.round(state.hp)} · KOs ${state.kills} · PARRIES ${state.parries} · SPACE=SLASH · E/RMB=BLOCK`)
    : (pl ? `AUTO-DEMO · WALCZ: WASD + SPACJA/LPM + E/PPM` : `AUTO-DEMO · FIGHT: WASD + SPACE/CLICK + E/RMB`);
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.playerControl ? "#76ddaf" : "#ffe1a2";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(lbl, x + 12, y + boxH / 2 + 0.5);
  ctx.restore();
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createArenaRenderer(gl);
  let tokenCount = 1;
  let playerControl = false;
  let prevPlayerControl = false;
  let rightMouseBlock = false;
  let time = 0;
  let hp = 100;
  let koTimer = 0;
  let kills = 0;
  let parries = 0;
  let lastSlashHits = 0;
  let turnTimer = 0;
  let activeIds = [0];
  let flyOrb = null;
  let bannerMsg = null;
  let slowMoTimer = 0; // gentle smooth slow-mo pulse instead of choppy full-frame freeze!
  let shakeMag = 0;
  let shakePhase = 0;
  const sparks = [];

  const hero = {
    x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0,
    torsoYaw: 0, headYaw: 0, shieldPitch: 0.18, swordPitch: 0, tilt: 0, hitFlash: 0,
    walkPhase: 0, walkAmp: 0,
    slashTimer: 0, slashDur: 0.26, slashCooldown: 0, slashProg: 0,
    comboStep: 0, comboResetTimer: 0,
    dodgeTimer: 0, dodgeCooldown: 0, dodgeDx: 0, dodgeDz: 0,
    blocking: false, blockStartTime: -10,
  };

  const guards = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    baseAngle: (i / 5) * Math.PI * 2 + 0.3,
    x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0,
    hasToken: false, danger: 0,
    torsoYaw: 0, shieldPitch: 0.1, swordPitch: 0, tilt: 0,
    walkPhase: i * 1.1, walkAmp: 0,
    slashProg: 0, telegraphing: false,
    phase: i * 1.25,
    hp: 3, maxHp: 3, stunTimer: 0, hitFlash: 0,
    attackTimer: 0, dealtHitThisSwing: false,
  }));

  function spawnSparks(x, z, color, n = 10, lift = 1.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 2.8;
      sparks.push({
        x, y: 0.85 + Math.random() * 0.45, z,
        vx: Math.cos(a) * spd, vy: lift + Math.random() * 2.1, vz: Math.sin(a) * spd,
        r: color[0], g: color[1], b: color[2], life: 0.85,
      });
    }
  }

  function showBanner(text, bg, fg = "#ffffff", dur = 0.85) {
    bannerMsg = { text, bg, fg, timer: dur };
  }

  function positionGuardsInRing() {
    for (const g of guards) {
      g.x = hero.x + Math.sin(g.baseAngle) * 4.3;
      g.z = hero.z + Math.cos(g.baseAngle) * 4.3;
      g.vx = 0; g.vz = 0;
      g.yaw = Math.atan2(hero.x - g.x, hero.z - g.z);
      g.hp = g.maxHp; g.stunTimer = 0; g.hitFlash = 0;
      g.attackTimer = tokenCount === 0 ? (g.id * 0.24) % 1.15 : 0;
      g.dealtHitThisSwing = false; g.telegraphing = false;
      g.slashProg = 0; g.tilt = 0; g.walkAmp = 0;
    }
  }

  function reset(keepPlayerMode = false) {
    time = 0; hp = 100; koTimer = 0; turnTimer = 0; lastSlashHits = 0;
    slowMoTimer = 0; shakeMag = 0;
    if (!keepPlayerMode) { kills = 0; parries = 0; }
    activeIds = tokenCount === 0 ? [] : tokenCount === 1 ? [0] : [0, 2];
    flyOrb = null;
    bannerMsg = null;
    sparks.length = 0;
    hero.x = 0; hero.z = 0; hero.y = 0; hero.vx = 0; hero.vz = 0; hero.yaw = 0;
    hero.tilt = 0; hero.hitFlash = 0; hero.walkAmp = 0;
    hero.slashTimer = 0; hero.slashCooldown = 0; hero.slashProg = 0;
    hero.comboStep = 0; hero.comboResetTimer = 0;
    hero.dodgeTimer = 0; hero.dodgeCooldown = 0;
    positionGuardsInRing();
  }
  reset();

  function passTokenFrom(fromId) {
    if (tokenCount === 0) return;
    const nextPrimary = (fromId + 1) % 5;
    flyOrb = { fromId, toId: nextPrimary, t: 0 };
    activeIds = tokenCount === 1 ? [nextPrimary] : [nextPrimary, (nextPrimary + 2) % 5];
    turnTimer = 0;
    for (const g of guards) { g.attackTimer = 0; g.dealtHitThisSwing = false; g.telegraphing = false; }
    if (playerControl) audio?.tokenPass?.();
  }

  function performDodge(keys) {
    if (koTimer > 0 || hero.dodgeCooldown > 0 || hero.dodgeTimer > 0) return;
    playerControl = true;
    const up = keys?.has("KeyW") || keys?.has("ArrowUp");
    const dn = keys?.has("KeyS") || keys?.has("ArrowDown");
    const lt = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const rt = keys?.has("KeyD") || keys?.has("ArrowRight");
    let dx = (rt ? 1 : 0) - (lt ? 1 : 0);
    let dz = (dn ? 1 : 0) - (up ? 1 : 0);
    const l = Math.hypot(dx, dz);
    if (l > 0.01) { dx /= l; dz /= l; }
    else { dx = Math.sin(hero.yaw); dz = Math.cos(hero.yaw); }
    hero.dodgeDx = dx; hero.dodgeDz = dz;
    hero.dodgeTimer = 0.28;
    hero.dodgeCooldown = 0.65;
    hero.vx = dx * 9.5;
    hero.vz = dz * 9.5;
    spawnSparks(hero.x, hero.z, [0.25, 1.0, 0.90], 7, 0.7);
    audio?.dodge?.();
  }

  function performHeroSlash(aimWorld = null) {
    if (koTimer > 0 || hero.slashCooldown > 0 || hero.dodgeTimer > 0.08) return;
    playerControl = true;
    if (aimWorld) {
      const dx = aimWorld[0] - hero.x, dz = aimWorld[2] - hero.z;
      if (Math.hypot(dx, dz) > 0.2) hero.yaw = Math.atan2(dx, dz);
    }

    const step = hero.comboResetTimer > 0 ? (hero.comboStep + 1) % 3 : 0;
    hero.comboStep = step;
    const isHeavy = step === 2;
    hero.slashDur = isHeavy ? 0.32 : 0.24;
    hero.slashTimer = hero.slashDur;
    hero.slashCooldown = isHeavy ? 0.42 : 0.26;
    hero.comboResetTimer = 0.85;

    // Smooth forward velocity lunge (NO instant teleport jump!)
    const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
    const lungeVel = isHeavy ? 5.2 : 3.2;
    hero.vx += fx * lungeVel;
    hero.vz += fz * lungeVel;

    audio?.slash?.(step);

    const reach = isHeavy ? 3.15 : 2.75;
    const minDot = isHeavy ? 0.08 : 0.35; // strict front blade cone — never hits enemies behind you!
    const maxTargets = isHeavy ? 2 : 1;   // single-target light slash, 2-target heavy cleave (no 5-man stunlock!)
    const dmg = isHeavy ? 2 : 1;

    const candidates = [];
    for (const g of guards) {
      const dx = g.x - hero.x, dz = g.z - hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist < reach) {
        const dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
        if (dot > minDot) {
          candidates.push({ g, dx, dz, dist, score: dist - dot * 0.45 });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const targets = candidates.slice(0, maxTargets);
    lastSlashHits = targets.length;

    let hitAny = false;
    let koAny = false;

    for (const { g, dx, dz, dist } of targets) {
      hitAny = true;
      g.hp -= dmg;
      g.hitFlash = 1.0;

      // In Chaos mode (Tokens OFF), light slashes cannot interrupt an already-committed skeleton swing!
      const hyperArmor = tokenCount === 0 && !isHeavy && (g.slashProg > 0.08 || g.telegraphing);
      if (!hyperArmor) {
        g.stunTimer = isHeavy ? 0.72 : 0.42;
        g.attackTimer = 0; g.dealtHitThisSwing = false; g.telegraphing = false;
      }
      const push = (isHeavy ? 7.6 : 5.0) * (hyperArmor ? 0.45 : 1.0);
      g.vx += (dx / Math.max(0.1, dist)) * push;
      g.vz += (dz / Math.max(0.1, dist)) * push;
      spawnSparks(g.x, g.z, isHeavy ? [1.0, 0.88, 0.25] : [0.28, 1.0, 0.90], isHeavy ? 18 : 10);
      if (g.hp <= 0) {
        koAny = true;
        kills++;
        spawnSparks(g.x, g.z, [1.0, 0.85, 0.22], 20, 2.0);
        showBanner(isHeavy ? `HEAVY K.O.! (${kills})` : `K.O.! (${kills})`, "#f59e0b", "#1c1204", 0.80);
        const wasActive = activeIds.includes(g.id);
        g.hp = g.maxHp;
        g.stunTimer = 0.35;
        g.attackTimer = tokenCount === 0 ? (g.id * 0.24) % 1.15 : 0;
        g.dealtHitThisSwing = false; g.telegraphing = false;
        // Preserve g.baseAngle so the 5 flanking slots never collapse onto the same angle!
        const spawnAng = g.baseAngle + time * 0.18;
        let rx = Math.sin(spawnAng) * 4.9;
        let rz = Math.cos(spawnAng) * 4.9;
        if (Math.hypot(rx - hero.x, rz - hero.z) < 2.8) { rx = -rx; rz = -rz; }
        g.x = Math.max(-5.1, Math.min(5.1, rx));
        g.z = Math.max(-5.6, Math.min(5.6, rz));
        g.vx = 0; g.vz = 0;
        if (wasActive && tokenCount > 0) passTokenFrom(g.id);
      }
    }

    if (hitAny) {
      if (isHeavy) slowMoTimer = 0.055; // brief smooth slow-mo on heavy finisher only — never stutters!
      shakeMag = Math.max(shakeMag, isHeavy ? 0.11 : 0.055);
      shakePhase = 0;
      if (koAny) audio?.enemyKo?.();
      else audio?.hitEnemy?.(isHeavy);
      if (!koAny && isHeavy) showBanner("HEAVY CLEAVE!", "#00e4ac", "#042119", 0.55);
    } else {
      spawnSparks(hero.x + fx * 1.15, hero.z + fz * 1.15, [0.30, 0.95, 0.85], 4, 0.8);
    }
  }

  function applyEnemyHitToHero(g) {
    if (koTimer > 0 || hero.dodgeTimer > 0.02) {
      if (hero.dodgeTimer > 0.02) showBanner("DODGED!", "#7dd3fc", "#041c24", 0.55);
      return;
    }
    const toEnemyYaw = Math.atan2(g.x - hero.x, g.z - hero.z);
    const facingAttacker = Math.abs(angleDiff(hero.yaw, toEnemyYaw)) < 1.48;
    const isParryWindow = hero.blocking && (time - hero.blockStartTime) < 0.36;

    if (playerControl && hero.blocking && facingAttacker) {
      if (isParryWindow) {
        parries++;
        g.stunTimer = 1.55;
        g.vx = (g.x - hero.x) * 3.8;
        g.vz = (g.z - hero.z) * 3.8;
        slowMoTimer = 0.075;
        shakeMag = Math.max(shakeMag, 0.13);
        shakePhase = 0;
        spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [0.25, 1.0, 0.95], 22, 2.2);
        showBanner("PERFECT PARRY!", "#00e4ac", "#042119", 0.95);
        audio?.parry?.();
        if (tokenCount > 0 && activeIds.includes(g.id)) passTokenFrom(g.id);
        return;
      }
      hp = Math.max(1, hp - 4);
      g.vx = (g.x - hero.x) * 2.2;
      g.vz = (g.z - hero.z) * 2.2;
      shakeMag = Math.max(shakeMag, 0.05);
      shakePhase = 0;
      spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [1.0, 0.88, 0.35], 10);
      showBanner("BLOCKED!", "#38bdf8", "#041c24", 0.55);
      audio?.block?.();
      return;
    }

    const dmg = tokenCount === 0 ? 22 : 17;
    hp = Math.max(0, hp - dmg);
    hero.hitFlash = 1.0;
    shakeMag = Math.max(shakeMag, 0.10);
    shakePhase = 0;
    spawnSparks(hero.x, hero.z, [1.0, 0.22, 0.20], 12);
    audio?.playerHurt?.();
    if (playerControl && hero.blocking && !facingAttacker) {
      showBanner("HIT FROM BEHIND!", "#ef4444", "#ffffff", 0.78);
    }
    if (hp <= 0) {
      koTimer = 1.9;
      spawnSparks(hero.x, hero.z, [1.0, 0.22, 0.18], 20);
      showBanner("K.O.! (0 HP)", "#ef4444", "#ffffff", 1.7);
    }
  }

  function update(dt, keys = new Set(), pointer = {}) {
    const rawH = Math.min(0.04, Math.max(0.001, dt));
    shakeMag *= Math.exp(-9.5 * rawH);
    shakePhase += rawH * 38.0;

    // Smooth brief slow-mo instead of abrupt freeze!
    let timeScale = 1.0;
    if (slowMoTimer > 0) {
      slowMoTimer = Math.max(0, slowMoTimer - rawH);
      timeScale = 0.35;
    }

    const h = rawH * timeScale;
    time += h;
    hero.hitFlash = Math.max(0, hero.hitFlash - h * 2.4);
    hero.slashTimer = Math.max(0, hero.slashTimer - h);
    hero.slashCooldown = Math.max(0, hero.slashCooldown - h);
    hero.comboResetTimer = Math.max(0, hero.comboResetTimer - h);
    hero.dodgeCooldown = Math.max(0, hero.dodgeCooldown - h);
    if (bannerMsg) {
      bannerMsg.timer -= rawH;
      if (bannerMsg.timer <= 0) bannerMsg = null;
    }

    const up = keys.has("KeyW") || keys.has("ArrowUp");
    const dn = keys.has("KeyS") || keys.has("ArrowDown");
    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");
    const blockKey = keys.has("KeyE") || keys.has("KeyK") || keys.has("KeyF") || rightMouseBlock;
    const dodgeKey = keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (up || dn || lt || rt || blockKey || dodgeKey) playerControl = true;
    if (playerControl !== prevPlayerControl) {
      prevPlayerControl = playerControl;
      requestHudRefresh?.();
    }

    if (dodgeKey && hero.dodgeCooldown <= 0 && hero.dodgeTimer <= 0 && koTimer <= 0) {
      performDodge(keys);
    }

    if (koTimer > 0) {
      koTimer -= h;
      hero.vx *= Math.exp(-8 * h);
      hero.vz *= Math.exp(-8 * h);
      hero.tilt = Math.min(1.45, hero.tilt + h * 5.2);
      hero.slashProg = 0;
      if (koTimer <= 0) reset(playerControl);
    } else if (playerControl) {
      if (hero.dodgeTimer > 0) {
        hero.dodgeTimer = Math.max(0, hero.dodgeTimer - h);
        const u = 1 - hero.dodgeTimer / 0.28;
        hero.vx *= Math.exp(-3.5 * h);
        hero.vz *= Math.exp(-3.5 * h);
        hero.x = Math.max(-4.9, Math.min(4.9, hero.x + hero.vx * h));
        hero.z = Math.max(-5.4, Math.min(5.4, hero.z + hero.vz * h));
        hero.y = Math.sin(u * Math.PI) * 0.16;
        hero.tilt = Math.sin(u * Math.PI) * 0.26;
        hero.yaw += angleDiff(Math.atan2(hero.dodgeDx, hero.dodgeDz), hero.yaw) * Math.min(1, h * 14);
        hero.blocking = false;
        hero.slashProg = 0;
      } else {
        hero.y *= Math.exp(-14 * h);
        hero.tilt *= Math.exp(-10 * h);

        const wasBlocking = hero.blocking;
        hero.blocking = blockKey && hero.slashTimer <= 0.04;
        if (hero.blocking && !wasBlocking) hero.blockStartTime = time;

        // Smooth velocity-driven Knight locomotion (silky acceleration & stop!)
        let mx = (rt ? 1 : 0) - (lt ? 1 : 0);
        let mz = (dn ? 1 : 0) - (up ? 1 : 0);
        const ml = Math.hypot(mx, mz);
        const maxSpd = hero.blocking ? 2.8 : 5.2;
        const tvx = ml > 0.01 ? (mx / ml) * maxSpd : 0;
        const tvz = ml > 0.01 ? (mz / ml) * maxSpd : 0;
        const accelBlend = 1 - Math.exp(-(ml > 0.01 ? 11.5 : 10.0) * h);
        hero.vx += (tvx - hero.vx) * accelBlend;
        hero.vz += (tvz - hero.vz) * accelBlend;

        hero.x = Math.max(-4.9, Math.min(4.9, hero.x + hero.vx * h));
        hero.z = Math.max(-5.4, Math.min(5.4, hero.z + hero.vz * h));

        if (ml > 0.01 && hero.slashTimer <= 0) {
          hero.yaw += angleDiff(Math.atan2(mx, mz), hero.yaw) * (1 - Math.exp(-10.0 * h));
        } else if (pointer?.world && hero.slashTimer <= 0) {
          const dx = pointer.world[0] - hero.x, dz = pointer.world[2] - hero.z;
          if (Math.hypot(dx, dz) > 0.5) {
            hero.yaw += angleDiff(Math.atan2(dx, dz), hero.yaw) * (1 - Math.exp(-8.5 * h));
          }
        }

        const targetShield = hero.blocking ? 1.08 : 0.22;
        hero.shieldPitch += (targetShield - hero.shieldPitch) * (1 - Math.exp(-14 * h));

        if (hero.slashTimer > 0) {
          const u = smoothstep01(1 - hero.slashTimer / hero.slashDur);
          const dir = hero.comboStep === 1 ? -1 : 1;
          hero.swordPitch = hero.comboStep === 2
            ? (-1.35 + Math.sin(u * Math.PI) * 2.80)
            : (-0.85 + Math.sin(u * Math.PI) * 2.20);
          hero.torsoYaw = (-0.58 + u * 1.22) * dir;
          hero.slashProg = u;
        } else {
          const restSword = hero.blocking ? -0.32 : Math.sin(time * 3.0) * 0.08;
          hero.swordPitch += (restSword - hero.swordPitch) * (1 - Math.exp(-12 * h));
          hero.torsoYaw *= Math.exp(-10 * h);
          hero.slashProg = 0;
        }
      }

      if (tokenCount > 0 && hp < 100) hp = Math.min(100, hp + h * 1.4);
    } else {
      hero.tilt *= Math.exp(-8 * h);
      hero.blocking = false;
      hero.slashProg = 0;
    }

    if (flyOrb) {
      flyOrb.t += h * 2.0;
      if (flyOrb.t >= 1) flyOrb = null;
    }

    // Smooth Velocity-Steered Skeleton Warriors (zero snappy jumps or jitter!)
    const smoothTurn = 1 - Math.exp(-8.5 * h);
    if (tokenCount === 0) {
      for (const g of guards) {
        g.hasToken = false;
        g.danger = 1.0;
        g.telegraphing = false;
        g.stunTimer = Math.max(0, g.stunTimer - h);
        g.hitFlash = Math.max(0, g.hitFlash - h * 3);

        const ang = g.baseAngle + time * 0.20 + Math.sin(time * 0.55 + g.id * 1.4) * 0.16;
        const targetX = Math.max(-4.9, Math.min(4.9, hero.x + Math.sin(ang) * 1.68));
        const targetZ = Math.max(-5.4, Math.min(5.4, hero.z + Math.cos(ang) * 1.68));
        let dvx = 0, dvz = 0;
        if (g.stunTimer <= 0 && koTimer <= 0) {
          const dx = targetX - g.x, dz = targetZ - g.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.14) {
            const sp = Math.min(3.8, d * 2.5);
            dvx = (dx / d) * sp; dvz = (dz / d) * sp;
          }
          // Active flanking repulsion so skeletons route around each other into a 360° surround instead of queuing!
          for (const o of guards) {
            if (o === g) continue;
            const sx = g.x - o.x, sz = g.z - o.z;
            const sd = Math.hypot(sx, sz);
            if (sd > 0.001 && sd < 2.25) {
              const push = (2.25 - sd) * 2.35;
              dvx += (sx / sd) * push;
              dvz += (sz / sd) * push;
            }
          }
          const dSpd = Math.hypot(dvx, dvz);
          if (dSpd > 4.2) { dvx = (dvx / dSpd) * 4.2; dvz = (dvz / dSpd) * 4.2; }

          g.yaw += angleDiff(Math.atan2(hero.x - g.x, hero.z - g.z), g.yaw) * smoothTurn;
          g.tilt *= Math.exp(-10 * h);

          if (Math.hypot(hero.x - g.x, hero.z - g.z) < 2.35) {
            g.attackTimer += h;
            const cyc = g.attackTimer % 1.15;
            if (cyc < 0.50) {
              const u = smoothstep01(cyc / 0.50);
              g.swordPitch += (-1.15 * u - g.swordPitch) * (1 - Math.exp(-12 * h));
              g.telegraphing = cyc > 0.22;
              g.slashProg = 0;
              g.dealtHitThisSwing = false;
            } else if (cyc < 0.82) {
              const u = smoothstep01((cyc - 0.50) / 0.32);
              g.swordPitch = -1.15 + u * 2.40;
              g.slashProg = u;
              if (u > 0.45 && !g.dealtHitThisSwing) {
                g.dealtHitThisSwing = true;
                applyEnemyHitToHero(g);
              }
            } else {
              g.swordPitch *= Math.exp(-8 * h);
              g.slashProg = 0;
            }
          } else {
            g.swordPitch *= Math.exp(-8 * h);
            g.slashProg = 0;
          }
        } else {
          g.tilt += (Math.sin(time * 12 + g.id) * 0.14 - g.tilt) * (1 - Math.exp(-10 * h));
          g.slashProg = 0;
        }
        g.vx += (dvx - g.vx) * (1 - Math.exp(-6.5 * h));
        g.vz += (dvz - g.vz) * (1 - Math.exp(-6.5 * h));
        g.x = Math.max(-5.1, Math.min(5.1, g.x + g.vx * h));
        g.z = Math.max(-5.6, Math.min(5.6, g.z + g.vz * h));
      }
      if (!playerControl && koTimer <= 0) {
        hero.yaw += angleDiff(Math.sin(time * 4.5) * 1.2, hero.yaw) * smoothTurn;
        hero.shieldPitch += (0.65 - hero.shieldPitch) * smoothTurn;
      }
    } else {
      const TURN_DUR = 2.85;
      turnTimer += h;
      if (turnTimer >= TURN_DUR) passTokenFrom(activeIds[0] ?? 0);

      if (!playerControl) {
        const primary = guards[activeIds[0] ?? 0];
        hero.yaw += angleDiff(Math.atan2(primary.x - hero.x, primary.z - hero.z), hero.yaw) * (1 - Math.exp(-7 * h));
        const cyc = turnTimer / TURN_DUR;
        const tSh = (cyc > 0.40 && cyc < 0.68) ? 0.92 : 0.20;
        hero.shieldPitch += (tSh - hero.shieldPitch) * (1 - Math.exp(-10 * h));
        const tSw = (cyc > 0.65 && cyc < 0.90) ? Math.sin(((cyc - 0.65) / 0.25) * Math.PI) * 1.2 : -0.1;
        hero.swordPitch += (tSw - hero.swordPitch) * (1 - Math.exp(-10 * h));
      }

      for (const g of guards) {
        const isAct = activeIds.includes(g.id) && (!flyOrb || flyOrb.toId !== g.id);
        g.hasToken = isAct;
        g.danger = 0;
        g.telegraphing = false;
        g.stunTimer = Math.max(0, g.stunTimer - h);
        g.hitFlash = Math.max(0, g.hitFlash - h * 3);

        const ang = g.baseAngle + time * 0.28;
        const targetR = isAct ? 1.85 : 4.25;
        const tx = Math.max(-5.1, Math.min(5.1, hero.x + Math.sin(ang) * targetR));
        const tz = Math.max(-5.6, Math.min(5.6, hero.z + Math.cos(ang) * targetR));
        let dvx = 0, dvz = 0;

        if (g.stunTimer <= 0 && koTimer <= 0) {
          g.tilt *= Math.exp(-10 * h);
          const dx = tx - g.x, dz = tz - g.z;
          const d = Math.hypot(dx, dz);
          const maxSp = isAct ? 4.0 : 3.0;
          if (d > 0.12) {
            const sp = Math.min(maxSp, d * 2.6);
            dvx = (dx / d) * sp; dvz = (dz / d) * sp;
          }
          g.yaw += angleDiff(Math.atan2(hero.x - g.x, hero.z - g.z), g.yaw) * smoothTurn;

          if (isAct && Math.hypot(hero.x - g.x, hero.z - g.z) < 2.45) {
            g.attackTimer += h;
            const u = g.attackTimer / 1.25;
            if (u < 0.50) {
              const e = smoothstep01(u / 0.50);
              g.swordPitch += (-1.28 * e - g.swordPitch) * (1 - Math.exp(-12 * h));
              g.torsoYaw += (-0.42 * e - g.torsoYaw) * (1 - Math.exp(-12 * h));
              g.telegraphing = u > 0.18;
              g.slashProg = 0;
            } else if (u < 0.80) {
              const s = smoothstep01((u - 0.50) / 0.30);
              g.swordPitch = -1.28 + s * 2.55;
              g.torsoYaw = -0.42 + s * 0.98;
              g.slashProg = s;
              if (s > 0.42 && !g.dealtHitThisSwing) {
                g.dealtHitThisSwing = true;
                if (playerControl) applyEnemyHitToHero(g);
                else spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [1.0, 0.85, 0.25], 8);
              }
            } else {
              g.swordPitch *= Math.exp(-8 * h);
              g.torsoYaw *= Math.exp(-8 * h);
              g.slashProg = 0;
              if (u >= 1.18) { g.attackTimer = 0; g.dealtHitThisSwing = false; }
            }
          } else {
            const idleSw = Math.sin(time * 2.2 + g.phase) * 0.10;
            g.swordPitch += (idleSw - g.swordPitch) * (1 - Math.exp(-8 * h));
            g.torsoYaw *= Math.exp(-8 * h);
            g.slashProg = 0;
          }
        } else {
          g.tilt += (Math.sin(time * 12 + g.id) * 0.14 - g.tilt) * (1 - Math.exp(-10 * h));
          g.slashProg = 0;
        }
        g.vx += (dvx - g.vx) * (1 - Math.exp(-6.5 * h));
        g.vz += (dvz - g.vz) * (1 - Math.exp(-6.5 * h));
        g.x = Math.max(-5.1, Math.min(5.1, g.x + g.vx * h));
        g.z = Math.max(-5.6, Math.min(5.6, g.z + g.vz * h));
      }
    }

    // Solid 3-pass Fighter-to-Fighter Body Separation (prevents skeleton clumping & mesh stacking in ALL modes!)
    const MIN_GUARD_SEP = 1.38;
    const MIN_HERO_SEP = 1.22;
    const allowHeroCollide = hero.dodgeTimer <= 0.04 && koTimer <= 0;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < guards.length; i++) {
        for (let j = i + 1; j < guards.length; j++) {
          const a = guards[i], b = guards[j];
          let dx = b.x - a.x, dz = b.z - a.z;
          let d = Math.hypot(dx, dz);
          if (d < MIN_GUARD_SEP) {
            let nx, nz;
            if (d < 0.001) {
              const fa = (i * 1.7 + j * 2.3);
              nx = Math.sin(fa); nz = Math.cos(fa);
              d = 0.001;
            } else {
              nx = dx / d; nz = dz / d;
            }
            const push = (MIN_GUARD_SEP - d) * 0.5;
            a.x -= nx * push; a.z -= nz * push;
            b.x += nx * push; b.z += nz * push;
            const rvn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (rvn < 0) {
              const imp = -rvn * 0.5;
              a.vx -= nx * imp; a.vz -= nz * imp;
              b.vx += nx * imp; b.vz += nz * imp;
            }
          }
        }
      }
      if (allowHeroCollide) {
        for (const g of guards) {
          let dx = g.x - hero.x, dz = g.z - hero.z;
          let d = Math.hypot(dx, dz);
          if (d < MIN_HERO_SEP) {
            let nx, nz;
            if (d < 0.001) {
              nx = Math.sin(g.baseAngle); nz = Math.cos(g.baseAngle);
              d = 0.001;
            } else {
              nx = dx / d; nz = dz / d;
            }
            const overlap = MIN_HERO_SEP - d;
            g.x += nx * overlap * 0.78;
            g.z += nz * overlap * 0.78;
            hero.x -= nx * overlap * 0.22;
            hero.z -= nz * overlap * 0.22;
            const rvn = (g.vx - hero.vx) * nx + (g.vz - hero.vz) * nz;
            if (rvn < 0) {
              g.vx -= nx * rvn * 0.75;
              g.vz -= nz * rvn * 0.75;
            }
          }
        }
      }
      hero.x = Math.max(-4.9, Math.min(4.9, hero.x));
      hero.z = Math.max(-5.4, Math.min(5.4, hero.z));
      for (const g of guards) {
        g.x = Math.max(-5.1, Math.min(5.1, g.x));
        g.z = Math.max(-5.6, Math.min(5.6, g.z));
      }
    }

    // Smooth, natural stride cycle proportional to actual velocity!
    const heroSpd = Math.hypot(hero.vx, hero.vz);
    const targetHeroWalk = (koTimer <= 0 && hero.dodgeTimer <= 0 && heroSpd > 0.30) ? Math.min(1, heroSpd / 4.5) : 0;
    hero.walkAmp += (targetHeroWalk - hero.walkAmp) * (1 - Math.exp(-10 * h));
    if (hero.walkAmp > 0.02) hero.walkPhase += h * (3.6 + heroSpd * 1.15);

    for (const g of guards) {
      const gs = Math.hypot(g.vx, g.vz);
      const targetGW = (g.stunTimer <= 0 && gs > 0.25) ? Math.min(1, gs / 3.4) : 0;
      g.walkAmp += (targetGW - g.walkAmp) * (1 - Math.exp(-8 * h));
      if (g.walkAmp > 0.02) g.walkPhase += h * (3.4 + gs * 1.25);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      s.vy -= 5.2 * h;
      s.life -= h * 1.5;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  }

  function getCameraOverride(baseCam) {
    if (shakeMag <= 0.002) return null;
    // Silky damped sinusoidal micro-impulse (ZERO white-noise jitter!)
    return {
      targetX: baseCam.targetX + Math.sin(shakePhase) * shakeMag,
      targetY: baseCam.targetY + Math.cos(shakePhase * 1.3) * shakeMag * 0.45,
      targetZ: baseCam.targetZ + Math.cos(shakePhase * 0.9) * shakeMag * 0.7,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    let tokenOrb = null;
    if (flyOrb) {
      const a = guards[flyOrb.fromId], b = guards[flyOrb.toId];
      const u = smoothstep01(flyOrb.t);
      tokenOrb = {
        x: a.x + (b.x - a.x) * u,
        y: 2.2 + Math.sin(u * Math.PI) * 2.4,
        z: a.z + (b.z - a.z) * u,
        from: a, to: b, t: u,
      };
    }

    const { viewProj } = renderer.render({
      w, h, cam, time, hero, guards,
      waitingRingAlpha: tokenCount > 0 ? 0.85 : 0.0,
      tokenOrb,
      dangerFlash: tokenCount === 0 && koTimer <= 0 ? 0.45 : 0.0,
      sparks,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      if (!document.body.classList.contains("no-hud")) {
        drawCombatHud(ovCtx, ow, { hp, kills, parries, playerControl, tokenCount }, lang);
      }

      const pHero = project3D([hero.x, 2.55 + hero.y, hero.z], viewProj, ow, oh);
      if (pHero) {
        const lbl = hp <= 0
          ? "K.O.! (0 HP)"
          : hero.blocking
            ? `BLOCK · ${Math.round(hp)} HP`
            : `KNIGHT · ${Math.round(hp)} HP`;
        drawBadge(ovCtx, pHero.x, pHero.y, lbl,
          hp <= 0 ? "#ef4444" : hero.blocking ? "#38bdf8" : "#10b981",
          hp <= 0 ? "#fff" : "#062119", ow);
      }
      if (bannerMsg) {
        const pb = project3D([hero.x, 3.38 + hero.y, hero.z], viewProj, ow, oh);
        if (pb) drawBadge(ovCtx, pb.x, pb.y, bannerMsg.text, bannerMsg.bg, bannerMsg.fg, ow);
      }

      for (const g of guards) {
        if (g.hp < g.maxHp) {
          const pHp = project3D([g.x, 2.10, g.z], viewProj, ow, oh);
          if (pHp) drawHpPips(ovCtx, pHp.x, pHp.y, g.hp, g.maxHp);
        }
        const pg = project3D([g.x, g.hasToken ? 2.95 : 2.38, g.z], viewProj, ow, oh);
        if (!pg) continue;
        if (g.stunTimer > 0.25) {
          drawBadge(ovCtx, pg.x, pg.y, "STUNNED!", "#00e4ac", "#041c14", ow);
        } else if (g.telegraphing) {
          drawBadge(ovCtx, pg.x, pg.y, "! PARRY NOW !", "#ef4444", "#ffffff", ow);
        } else if (tokenCount > 0) {
          if (g.hasToken) drawBadge(ovCtx, pg.x, pg.y, "TOKEN", "#f59e0b", "#1c1204", ow);
          else drawBadge(ovCtx, pg.x, pg.y, "WAITING", "rgba(18,28,48,0.88)", "#7dd3fc", ow);
        }
      }
      if (tokenCount > 0 && tokenOrb) {
        const po = project3D([tokenOrb.x, tokenOrb.y + 0.55, tokenOrb.z], viewProj, ow, oh);
        if (po) drawBadge(ovCtx, po.x, po.y, "PASS!", "#fde047", "#1c1204", ow);
      } else if (tokenCount === 0 && koTimer <= 0 && !bannerMsg && time > 0.55) {
        const pt = project3D([hero.x, 3.25, hero.z], viewProj, ow, oh);
        if (pt) drawBadge(ovCtx, pt.x, pt.y, "5× ATTACK AT ONCE!", "#ef4444", "#ffffff", ow);
      }
    }
  }

  return {
    id: "attack-tokens",
    defaultCam: { yaw: 0.05, pitch: 0.72, dist: 19.8, targetX: 0, targetY: 0.4, targetZ: 0.2, fovDeg: 40 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "tok0", label: pl ? "Bez tokenów (Chaos)" : "Tokens: OFF (Chaos)", pressed: tokenCount === 0 },
        { id: "tok1", label: pl ? "1 Token (Fair)" : "1 Token (Fair)", pressed: tokenCount === 1 },
        { id: "tok2", label: pl ? "2 Tokeny (Hard)" : "2 Tokens (Hard)", pressed: tokenCount === 2 },
        { id: "slash", label: pl ? "Combo (Spacja / LPM)" : "Combo (Space / Click)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "tok0") { tokenCount = 0; reset(playerControl); }
      if (id === "tok1") { tokenCount = 1; reset(playerControl); }
      if (id === "tok2") { tokenCount = 2; reset(playerControl); }
      if (id === "slash") performHeroSlash(null);
    },
    onKeyDown(code, repeat) {
      if ((code === "Space" || code === "KeyJ" || code === "Enter") && !repeat) performHeroSlash(null);
    },
    onPointerDown({ button }) {
      if (button === 2) {
        playerControl = true;
        rightMouseBlock = true;
        return true;
      }
      return false;
    },
    onPointerUp({ button }) {
      if (button === 2) rightMouseBlock = false;
    },
    onClickWorld(worldPt, { button }) {
      if (button === 0) performHeroSlash(worldPt);
    },
    getDebugState() {
      let minGuardSep = 99;
      let minHeroSep = 99;
      for (let i = 0; i < guards.length; i++) {
        minHeroSep = Math.min(minHeroSep, Math.hypot(guards[i].x - hero.x, guards[i].z - hero.z));
        for (let j = i + 1; j < guards.length; j++) {
          minGuardSep = Math.min(minGuardSep, Math.hypot(guards[i].x - guards[j].x, guards[i].z - guards[j].z));
        }
      }
      return {
        playerControl,
        x: +hero.x.toFixed(2),
        z: +hero.z.toFixed(2),
        vx: +hero.vx.toFixed(2),
        vz: +hero.vz.toFixed(2),
        hp: Math.round(hp),
        kills,
        parries,
        comboStep: hero.comboStep,
        tokenCount,
        lastSlashHits,
        minGuardSep: +minGuardSep.toFixed(2),
        minHeroSep: +minHeroSep.toFixed(2),
      };
    },
    reset: () => reset(false),
    update,
    render,
  };
}
