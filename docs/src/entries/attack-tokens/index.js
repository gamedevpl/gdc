// Playable Entry #2: Attack Tokens — Juicy 3-Hit Combo Sword Combat + Hitstop + Screen Shake + Dodge Roll + Parry!
// WASD/Arrows = Move, Left-Click/J/E = 3-Hit Combo Slash, Space/Right-Click = Shield Block & Timed Perfect Parry, Shift = Dodge Roll!
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
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 24, 445);
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
      ? `HP ${Math.round(state.hp)} · KO ${state.kills} · PARRY ${state.parries} · SHIFT = UNIK`
      : `HP ${Math.round(state.hp)} · KOs ${state.kills} · PARRIES ${state.parries} · SHIFT = DODGE`)
    : (pl ? `AUTO-DEMO · WALCZ: WASD + LPM + SPACJA` : `AUTO-DEMO · FIGHT: WASD + CLICK + SPACE`);
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
  let turnTimer = 0;
  let activeIds = [0];
  let flyOrb = null;
  let bannerMsg = null;
  let hitstopTimer = 0;
  let shakeMag = 0;
  const sparks = [];

  const hero = {
    x: 0, y: 0, z: 0, yaw: 0,
    torsoYaw: 0, headYaw: 0, shieldPitch: 0.18, swordPitch: 0, tilt: 0, hitFlash: 0,
    slashTimer: 0, slashDur: 0.24, slashCooldown: 0, slashProg: 0,
    comboStep: 0, comboResetTimer: 0,
    dodgeTimer: 0, dodgeCooldown: 0, dodgeDx: 0, dodgeDz: 0,
    blocking: false, blockStartTime: -10,
  };

  const guards = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    baseAngle: (i / 5) * Math.PI * 2 + 0.3,
    x: 0, y: 0, z: 0, yaw: 0,
    hasToken: false, danger: 0,
    torsoYaw: 0, shieldPitch: 0.1, swordPitch: 0, tilt: 0,
    slashProg: 0, telegraphing: false,
    phase: i * 1.25,
    hp: 3, maxHp: 3, stunTimer: 0, hitFlash: 0,
    attackTimer: 0, dealtHitThisSwing: false,
    knockVx: 0, knockVz: 0,
  }));

  function spawnSparks(x, z, color, n = 10, lift = 1.7) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.4;
      sparks.push({
        x, y: 0.85 + Math.random() * 0.5, z,
        vx: Math.cos(a) * spd, vy: lift + Math.random() * 2.4, vz: Math.sin(a) * spd,
        r: color[0], g: color[1], b: color[2], life: 0.9,
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
      g.yaw = Math.atan2(hero.x - g.x, hero.z - g.z);
      g.hp = g.maxHp; g.stunTimer = 0; g.hitFlash = 0;
      g.attackTimer = 0; g.dealtHitThisSwing = false; g.telegraphing = false;
      g.knockVx = 0; g.knockVz = 0; g.slashProg = 0; g.tilt = 0;
    }
  }

  function reset(keepPlayerMode = false) {
    time = 0; hp = 100; koTimer = 0; turnTimer = 0;
    hitstopTimer = 0; shakeMag = 0;
    if (!keepPlayerMode) { kills = 0; parries = 0; }
    activeIds = tokenCount === 0 ? [] : tokenCount === 1 ? [0] : [0, 2];
    flyOrb = null;
    bannerMsg = null;
    sparks.length = 0;
    hero.x = 0; hero.z = 0; hero.y = 0; hero.yaw = 0;
    hero.tilt = 0; hero.hitFlash = 0;
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
    hero.yaw = Math.atan2(dx, dz);
    spawnSparks(hero.x, hero.z, [0.25, 1.0, 0.90], 8, 0.8);
    audio?.dodge?.();
  }

  function performHeroSlash(aimWorld = null) {
    if (koTimer > 0 || hero.slashCooldown > 0 || hero.dodgeTimer > 0.08) return;
    playerControl = true;
    if (aimWorld) {
      const dx = aimWorld[0] - hero.x, dz = aimWorld[2] - hero.z;
      if (Math.hypot(dx, dz) > 0.2) hero.yaw = Math.atan2(dx, dz);
    }

    // 3-Hit Combo progression: 0 (Right->Left) -> 1 (Left->Right) -> 2 (Heavy Cleave Finisher!)
    const step = hero.comboResetTimer > 0 ? (hero.comboStep + 1) % 3 : 0;
    hero.comboStep = step;
    const isHeavy = step === 2;
    hero.slashDur = isHeavy ? 0.32 : 0.22;
    hero.slashTimer = hero.slashDur;
    hero.slashCooldown = isHeavy ? 0.42 : 0.24;
    hero.comboResetTimer = 0.80;

    // Crisp micro-lunge forward into the swing!
    const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
    const lunge = isHeavy ? 0.62 : 0.36;
    hero.x = Math.max(-4.9, Math.min(4.9, hero.x + fx * lunge));
    hero.z = Math.max(-5.4, Math.min(5.4, hero.z + fz * lunge));

    audio?.slash?.(step);

    const reach = isHeavy ? 3.25 : 2.80;
    const dmg = isHeavy ? 2 : 1;
    let hitAny = false;
    let koAny = false;

    for (const g of guards) {
      const dx = g.x - hero.x, dz = g.z - hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist < reach) {
        const dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
        if (dot > (isHeavy ? -0.15 : 0.08) || dist < 1.45) {
          hitAny = true;
          g.hp -= dmg;
          g.hitFlash = 1.0;
          g.stunTimer = isHeavy ? 0.80 : 0.48;
          g.attackTimer = 0; g.dealtHitThisSwing = false; g.telegraphing = false;
          const push = isHeavy ? 9.5 : 6.4;
          g.knockVx = (dx / Math.max(0.1, dist)) * push;
          g.knockVz = (dz / Math.max(0.1, dist)) * push;
          spawnSparks(g.x, g.z, isHeavy ? [1.0, 0.88, 0.25] : [0.28, 1.0, 0.90], isHeavy ? 20 : 12);
          if (g.hp <= 0) {
            koAny = true;
            kills++;
            spawnSparks(g.x, g.z, [1.0, 0.85, 0.22], 24, 2.2);
            showBanner(isHeavy ? `HEAVY K.O.! (${kills})` : `K.O.! (${kills})`, "#f59e0b", "#1c1204", 0.80);
            const wasActive = activeIds.includes(g.id);
            g.hp = g.maxHp;
            g.stunTimer = 0.45;
            g.baseAngle += Math.PI * 0.85;
            g.x = Math.max(-5.1, Math.min(5.1, Math.sin(g.baseAngle) * 4.8));
            g.z = Math.max(-5.6, Math.min(5.6, Math.cos(g.baseAngle) * 4.8));
            if (wasActive && tokenCount > 0) passTokenFrom(g.id);
          }
        }
      }
    }

    if (hitAny) {
      hitstopTimer = isHeavy ? 0.065 : 0.040;
      shakeMag = Math.max(shakeMag, isHeavy ? 0.34 : 0.18);
      if (koAny) audio?.enemyKo?.();
      else audio?.hitEnemy?.(isHeavy);
      if (!koAny && isHeavy) showBanner("HEAVY CLEAVE!", "#00e4ac", "#042119", 0.55);
    } else {
      spawnSparks(hero.x + fx * 1.15, hero.z + fz * 1.15, [0.30, 0.95, 0.85], 4, 0.9);
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
        g.stunTimer = 1.65;
        g.knockVx = (g.x - hero.x) * 4.6;
        g.knockVz = (g.z - hero.z) * 4.6;
        hitstopTimer = 0.085;
        shakeMag = Math.max(shakeMag, 0.42);
        spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [0.25, 1.0, 0.95], 26, 2.4);
        showBanner("PERFECT PARRY!", "#00e4ac", "#042119", 0.95);
        audio?.parry?.();
        if (tokenCount > 0 && activeIds.includes(g.id)) passTokenFrom(g.id);
        return;
      }
      hp = Math.max(1, hp - 4);
      g.knockVx = (g.x - hero.x) * 2.6;
      g.knockVz = (g.z - hero.z) * 2.6;
      shakeMag = Math.max(shakeMag, 0.14);
      spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [1.0, 0.88, 0.35], 12);
      showBanner("BLOCKED!", "#38bdf8", "#041c24", 0.55);
      audio?.block?.();
      return;
    }

    const dmg = tokenCount === 0 ? 22 : 17;
    hp = Math.max(0, hp - dmg);
    hero.hitFlash = 1.0;
    shakeMag = Math.max(shakeMag, 0.32);
    spawnSparks(hero.x, hero.z, [1.0, 0.22, 0.20], 14);
    audio?.playerHurt?.();
    if (playerControl && hero.blocking && !facingAttacker) {
      showBanner("HIT FROM BEHIND!", "#ef4444", "#ffffff", 0.78);
    }
    if (hp <= 0) {
      koTimer = 1.9;
      spawnSparks(hero.x, hero.z, [1.0, 0.22, 0.18], 24);
      showBanner("K.O.! (0 HP)", "#ef4444", "#ffffff", 1.7);
    }
  }

  function update(dt, keys = new Set(), pointer = {}) {
    const rawH = Math.min(0.05, Math.max(0.001, dt));
    shakeMag = Math.max(0, shakeMag - rawH * 1.9);

    // Tactile Hitstop freeze-frame on heavy sword hits & Perfect Parries!
    if (hitstopTimer > 0) {
      hitstopTimer = Math.max(0, hitstopTimer - rawH);
      return;
    }

    const h = rawH;
    time += h;
    hero.hitFlash = Math.max(0, hero.hitFlash - h * 2.4);
    hero.slashTimer = Math.max(0, hero.slashTimer - h);
    hero.slashCooldown = Math.max(0, hero.slashCooldown - h);
    hero.comboResetTimer = Math.max(0, hero.comboResetTimer - h);
    hero.dodgeCooldown = Math.max(0, hero.dodgeCooldown - h);
    if (bannerMsg) {
      bannerMsg.timer -= h;
      if (bannerMsg.timer <= 0) bannerMsg = null;
    }

    const up = keys.has("KeyW") || keys.has("ArrowUp");
    const dn = keys.has("KeyS") || keys.has("ArrowDown");
    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");
    const blockKey = keys.has("Space") || keys.has("KeyK") || rightMouseBlock;
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
      hero.tilt = Math.min(1.45, hero.tilt + h * 6);
      hero.slashProg = 0;
      if (koTimer <= 0) reset(playerControl);
    } else if (playerControl) {
      if (hero.dodgeTimer > 0) {
        hero.dodgeTimer = Math.max(0, hero.dodgeTimer - h);
        const u = 1 - hero.dodgeTimer / 0.28;
        hero.x = Math.max(-4.9, Math.min(4.9, hero.x + hero.dodgeDx * 11.5 * h));
        hero.z = Math.max(-5.4, Math.min(5.4, hero.z + hero.dodgeDz * 11.5 * h));
        hero.y = Math.sin(u * Math.PI) * 0.45;
        hero.tilt = Math.sin(u * Math.PI) * 0.45;
        hero.blocking = false;
        hero.slashProg = 0;
      } else {
        hero.y = 0;
        hero.tilt *= Math.max(0, 1 - h * 10);

        const wasBlocking = hero.blocking;
        hero.blocking = blockKey && hero.slashTimer <= 0.04;
        if (hero.blocking && !wasBlocking) hero.blockStartTime = time;

        let mx = (rt ? 1 : 0) - (lt ? 1 : 0);
        let mz = (dn ? 1 : 0) - (up ? 1 : 0);
        const ml = Math.hypot(mx, mz);
        const spd = hero.blocking ? 2.7 : 5.4;
        if (ml > 0.01) {
          mx /= ml; mz /= ml;
          hero.x = Math.max(-4.9, Math.min(4.9, hero.x + mx * spd * h));
          hero.z = Math.max(-5.4, Math.min(5.4, hero.z + mz * spd * h));
          if (hero.slashTimer <= 0) {
            hero.yaw += angleDiff(Math.atan2(mx, mz), hero.yaw) * Math.min(1, h * 12);
          }
        } else if (pointer?.world && hero.slashTimer <= 0) {
          const dx = pointer.world[0] - hero.x, dz = pointer.world[2] - hero.z;
          if (Math.hypot(dx, dz) > 0.4) {
            hero.yaw += angleDiff(Math.atan2(dx, dz), hero.yaw) * Math.min(1, h * 10);
          }
        }

        hero.shieldPitch = hero.blocking ? 1.12 : 0.22;
        if (hero.slashTimer > 0) {
          const u = 1 - hero.slashTimer / hero.slashDur;
          const dir = hero.comboStep === 1 ? -1 : 1;
          hero.swordPitch = hero.comboStep === 2
            ? (-1.45 + Math.sin(u * Math.PI) * 2.95)
            : (-0.95 + Math.sin(u * Math.PI) * 2.35);
          hero.torsoYaw = (-0.65 + u * 1.35) * dir;
          hero.slashProg = u;
        } else {
          hero.swordPitch = hero.blocking ? -0.35 : Math.sin(time * 3.5) * 0.1;
          hero.torsoYaw *= Math.max(0, 1 - h * 10);
          hero.slashProg = 0;
        }
      }

      if (tokenCount > 0 && hp < 100) hp = Math.min(100, hp + h * 1.4);
    } else {
      hero.tilt *= Math.max(0, 1 - h * 8);
      hero.blocking = false;
      hero.slashProg = 0;
    }

    if (flyOrb) {
      flyOrb.t += h * 2.2;
      if (flyOrb.t >= 1) flyOrb = null;
    }

    if (tokenCount === 0) {
      for (const g of guards) {
        g.hasToken = false;
        g.danger = 1.0;
        g.telegraphing = false;
        g.stunTimer = Math.max(0, g.stunTimer - h);
        g.hitFlash = Math.max(0, g.hitFlash - h * 3);
        g.x += g.knockVx * h; g.z += g.knockVz * h;
        g.knockVx *= Math.max(0, 1 - h * 8); g.knockVz *= Math.max(0, 1 - h * 8);

        const ang = g.baseAngle + time * 0.45;
        const targetX = hero.x + Math.sin(ang) * 1.45;
        const targetZ = hero.z + Math.cos(ang) * 1.45;
        if (g.stunTimer <= 0 && koTimer <= 0) {
          const dx = targetX - g.x, dz = targetZ - g.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.1) {
            const step = Math.min(d, 3.8 * h);
            g.x += (dx / d) * step;
            g.z += (dz / d) * step;
          }
          g.yaw = Math.atan2(hero.x - g.x, hero.z - g.z);
          if (Math.hypot(hero.x - g.x, hero.z - g.z) < 2.05) {
            g.attackTimer += h;
            const cyc = (g.attackTimer + g.phase * 0.22) % 1.05;
            if (cyc < 0.45) {
              g.swordPitch = -1.1 * (cyc / 0.45);
              g.telegraphing = cyc > 0.20;
              g.slashProg = 0;
              g.dealtHitThisSwing = false;
            } else if (cyc < 0.75) {
              const u = (cyc - 0.45) / 0.30;
              g.swordPitch = -1.1 + u * 2.35;
              g.slashProg = u;
              if (u > 0.45 && !g.dealtHitThisSwing) {
                g.dealtHitThisSwing = true;
                applyEnemyHitToHero(g);
              }
            } else {
              g.swordPitch *= Math.max(0, 1 - h * 10);
              g.slashProg = 0;
            }
          } else {
            g.slashProg = 0;
          }
        } else {
          g.tilt = g.stunTimer > 0 ? Math.sin(time * 28) * 0.22 : 0;
          g.slashProg = 0;
        }
        g.x = Math.max(-5.2, Math.min(5.2, g.x));
        g.z = Math.max(-5.8, Math.min(5.8, g.z));
      }
      if (!playerControl && koTimer <= 0) {
        hero.yaw = Math.sin(time * 7) * 1.4;
        hero.shieldPitch = 0.65;
      }
    } else {
      const TURN_DUR = 2.75;
      turnTimer += h;
      if (turnTimer >= TURN_DUR) passTokenFrom(activeIds[0] ?? 0);

      if (!playerControl) {
        const primary = guards[activeIds[0] ?? 0];
        hero.yaw += angleDiff(Math.atan2(primary.x - hero.x, primary.z - hero.z), hero.yaw) * Math.min(1, h * 7);
        const cyc = turnTimer / TURN_DUR;
        hero.shieldPitch = (cyc > 0.40 && cyc < 0.68) ? 0.92 : 0.20;
        hero.swordPitch = (cyc > 0.65 && cyc < 0.90) ? Math.sin(((cyc - 0.65) / 0.25) * Math.PI) * 1.25 : -0.1;
      }

      for (const g of guards) {
        const isAct = activeIds.includes(g.id) && (!flyOrb || flyOrb.toId !== g.id);
        g.hasToken = isAct;
        g.danger = 0;
        g.telegraphing = false;
        g.stunTimer = Math.max(0, g.stunTimer - h);
        g.hitFlash = Math.max(0, g.hitFlash - h * 3);
        g.x += g.knockVx * h; g.z += g.knockVz * h;
        g.knockVx *= Math.max(0, 1 - h * 8); g.knockVz *= Math.max(0, 1 - h * 8);

        const ang = g.baseAngle + time * 0.30;
        const targetR = isAct ? 1.80 : 4.25;
        const tx = Math.max(-5.1, Math.min(5.1, hero.x + Math.sin(ang) * targetR));
        const tz = Math.max(-5.6, Math.min(5.6, hero.z + Math.cos(ang) * targetR));
        if (g.stunTimer <= 0 && koTimer <= 0) {
          g.tilt *= Math.max(0, 1 - h * 10);
          const dx = tx - g.x, dz = tz - g.z;
          const d = Math.hypot(dx, dz);
          const spd = isAct ? 4.4 : 3.4;
          if (d > 0.08) {
            const step = Math.min(d, spd * h);
            g.x += (dx / d) * step;
            g.z += (dz / d) * step;
          }
          g.yaw = Math.atan2(hero.x - g.x, hero.z - g.z);

          if (isAct && Math.hypot(hero.x - g.x, hero.z - g.z) < 2.40) {
            g.attackTimer += h;
            const u = g.attackTimer / 1.20;
            if (u < 0.50) {
              g.swordPitch = -1.30 * (u / 0.50);
              g.torsoYaw = -0.45 * (u / 0.50);
              g.telegraphing = u > 0.18;
              g.slashProg = 0;
            } else if (u < 0.80) {
              const s = (u - 0.50) / 0.30;
              g.swordPitch = -1.30 + s * 2.65;
              g.torsoYaw = -0.45 + s * 1.05;
              g.slashProg = s;
              if (s > 0.42 && !g.dealtHitThisSwing) {
                g.dealtHitThisSwing = true;
                if (playerControl) applyEnemyHitToHero(g);
                else spawnSparks((hero.x + g.x) * 0.5, (hero.z + g.z) * 0.5, [1.0, 0.85, 0.25], 10);
              }
            } else {
              g.swordPitch *= Math.max(0, 1 - h * 8);
              g.torsoYaw *= Math.max(0, 1 - h * 8);
              g.slashProg = 0;
              if (u >= 1.18) { g.attackTimer = 0; g.dealtHitThisSwing = false; }
            }
          } else {
            g.swordPitch = Math.sin(time * 2.5 + g.phase) * 0.12;
            g.torsoYaw = Math.sin(time * 1.8 + g.phase) * 0.10;
            g.slashProg = 0;
          }
        } else {
          g.tilt = g.stunTimer > 0 ? Math.sin(time * 26) * 0.24 : 0;
          g.slashProg = 0;
        }
      }
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
    if (shakeMag <= 0.005) return null;
    return {
      targetX: baseCam.targetX + (Math.random() - 0.5) * shakeMag,
      targetY: baseCam.targetY + (Math.random() - 0.5) * shakeMag * 0.6,
      targetZ: baseCam.targetZ + (Math.random() - 0.5) * shakeMag,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    let tokenOrb = null;
    if (flyOrb) {
      const a = guards[flyOrb.fromId], b = guards[flyOrb.toId];
      const u = flyOrb.t;
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
      drawCombatHud(ovCtx, ow, { hp, kills, parries, playerControl }, lang);

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
        // Show damaged skeleton HP pips cleanly above their head!
        if (g.hp < g.maxHp) {
          const pHp = project3D([g.x, 2.10, g.z], viewProj, ow, oh);
          if (pHp) drawHpPips(ovCtx, pHp.x, pHp.y, g.hp, g.maxHp);
        }
        const pg = project3D([g.x, g.hasToken ? 2.95 : 2.38, g.z], viewProj, ow, oh);
        if (!pg) continue;
        if (g.stunTimer > 0.25) {
          drawBadge(ovCtx, pg.x, pg.y, "STUNNED!", "#00e4ac", "#041c14", ow);
        } else if (g.telegraphing) {
          // Unmistakable parry timing glint!
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
        { id: "slash", label: pl ? "Combo (LPM / J)" : "Combo (Click / J)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "tok0") { tokenCount = 0; reset(playerControl); }
      if (id === "tok1") { tokenCount = 1; reset(playerControl); }
      if (id === "tok2") { tokenCount = 2; reset(playerControl); }
      if (id === "slash") performHeroSlash(null);
    },
    onKeyDown(code, repeat) {
      if ((code === "KeyJ" || code === "KeyE" || code === "Enter") && !repeat) performHeroSlash(null);
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
      return { playerControl, x: +hero.x.toFixed(2), z: +hero.z.toFixed(2), hp: Math.round(hp), kills, parries, comboStep: hero.comboStep, tokenCount };
    },
    reset: () => reset(false),
    update,
    render,
  };
}
