// Playable Entry #6: Fake 1 HP & Death's Door Mercy — Live 3D Cyber-Arena X-Ray Firefight!
// Reveals the 3 secret survival tricks games use in red HP:
//   1) Non-Linear Fake HUD Bar (bottom 20% of red bar secretly holds 50% of your REAL HP!)
//   2) Death's Door 1 HP Clamp (lethal hits clamp to 1 HP + 1.15s glowing Mercy Shield dome!)
//   3) Mercy Aim Scatter (enemy laser cones visibly flare from ±3° to ±27° when you enter red HP!)
// Move with WASD, Dash with Shift, Shoot drones with Space/Click, toggle Mercy Tricks (T) & X-Ray (X)!
import { clamp, lerp } from "../../gl-utils.js";
import { createCyberRenderer, projectPoint } from "./cyber-renderer.js";

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// The secret non-linear HUD curve! Bottom 20% of the red HUD bar secretly holds a FULL 50% of your real HP!
function realToHudHp(realHp, mercyOn) {
  if (!mercyOn) return clamp(realHp, 0, 100);
  if (realHp <= 0) return 0;
  if (realHp <= 50) return Math.max(1, (realHp / 50) * 20);
  return 20 + ((realHp - 50) / 50) * 80;
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

function drawDualHealthHud(ctx, ow, st, lang) {
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 28, 412);
  const boxH = st.xrayOn ? 116 : 64;
  const x = ow - boxW - 18;
  const y = 72;

  ctx.save();
  ctx.fillStyle = "rgba(15,17,32,0.90)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = st.shieldActive ? "#2dd4bf" : (st.hudHp <= 25 ? "#f43f5e" : "#38bdf8");
  ctx.stroke();

  const barX = x + 14;
  const barW = boxW - 28;

  // 1) FAKE PLAYER HUD HP BAR (always visible!)
  const hudCrit = st.hudHp <= 25;
  ctx.font = "700 11px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hudCrit ? "#fda4af" : "#e2e8f0";
  const hudTitle = pl
    ? `PASEK GRACZA (HUD): ${Math.round(st.hudHp)}%${hudCrit ? "  ⚠ KRYTYCZNE!" : ""}`
    : `PLAYER HUD BAR: ${Math.round(st.hudHp)}%${hudCrit ? "  ⚠ CRITICAL!" : ""}`;
  ctx.fillText(hudTitle, barX, y + 17);

  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    pl ? `1HP-SAVE ${st.oneHpSaves} · ZGONY ${st.deaths}` : `1HP SAVES ${st.oneHpSaves} · K.O.s ${st.deaths}`,
    barX + barW, y + 17,
  );

  // HUD bar track + fill
  ctx.fillStyle = "rgba(7,10,20,0.9)";
  ctx.beginPath();
  ctx.roundRect(barX, y + 28, barW, 18, 4);
  ctx.fill();
  const hudFill = clamp(st.hudHp / 100, 0, 1) * (barW - 2);
  ctx.fillStyle = st.hudHp <= 22 ? "#ef4444" : st.hudHp <= 50 ? "#f59e0b" : "#10b981";
  if (hudFill > 0) ctx.fillRect(barX + 1, y + 29, hudFill, 16);
  // Subtle 20% red-zone tick
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(barX + barW * 0.20, y + 27, 1.5, 20);

  if (st.xrayOn) {
    // 2) X-RAY REAL HIDDEN HP BAR!
    const diff = Math.round(st.realHp - st.hudHp);
    ctx.font = "700 11px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#6ee7b7";
    const realTitle = pl
      ? `X-RAY PRAWDZIWE HP: ${Math.round(st.realHp)}%${diff > 2 ? ` (+${diff}% UKRYTE!)` : ""}`
      : `X-RAY REAL HP: ${Math.round(st.realHp)}%${diff > 2 ? ` (+${diff}% HIDDEN!)` : ""}`;
    ctx.fillText(realTitle, barX, y + 62);

    ctx.textAlign = "right";
    ctx.fillStyle = st.scatterActive ? "#fbbf24" : "#cbd5e1";
    ctx.fillText(
      st.scatterActive
        ? (pl ? "ROZRZUT AI: ±27°!" : "AI AIM: ±27° WIDE!")
        : (pl ? "CELNOŚĆ AI: ±3°" : "AI AIM: ±3° TIGHT"),
      barX + barW, y + 62,
    );

    ctx.fillStyle = "rgba(7,10,20,0.9)";
    ctx.beginPath();
    ctx.roundRect(barX, y + 73, barW, 18, 4);
    ctx.fill();
    const realFill = clamp(st.realHp / 100, 0, 1) * (barW - 2);
    ctx.fillStyle = st.mercyOn ? "#2dd4bf" : "#38bdf8";
    if (realFill > 0) ctx.fillRect(barX + 1, y + 74, realFill, 16);

    // Bottom live mercy readout
    ctx.font = "700 10.5px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = st.shieldActive ? "#5eead4" : "#94a3b8";
    const foot = st.shieldActive
      ? (pl ? "🛡 TARCZA 1 HP AKTYWNA — ŚMIERTELNY CIOS ZATRZYMANY!" : "🛡 1 HP MERCY SHIELD ACTIVE — LETHAL BLOW CLAMPED!")
      : st.mercyOn
        ? (pl ? `UNIKI ROZRZUTU: ${st.mercyMisses} · TARCZA 1 HP: GOTOWA · T=TRYB · X=X-RAY` : `MERCY MISSES: ${st.mercyMisses} · 1 HP CLAMP: READY · T=MODE · X=X-RAY`)
        : (pl ? "UCZCIWA MATEMATYKA (1:1 HP · BEZ TARCZY 1 HP · CELNY OGIEŃ)" : "HONEST MATH (1:1 HP · NO 1 HP CLAMP · TIGHT AIM)");
    ctx.fillText(foot, barX, y + 104);
  }

  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createCyberRenderer(gl);

  let mercyOn = true;     // Master toggle: Fake 1 HP Tricks ON vs Honest Math OFF!
  let xrayOn = true;      // Show hidden Real HP bar + 3D volumetric enemy aim cones!
  let playerControl = false;
  let prevPlayerControl = false;

  let time = 0;
  let realHp = 100;
  let hudHp = 100;
  let mercyShieldTimer = 0;
  let oneHpSaves = 0;
  let mercyMisses = 0;
  let deaths = 0;
  let droneKills = 0;
  let koTimer = 0;
  let banner = null;

  const bolts = [];
  const rings = [];
  const sparks = [];

  const hero = {
    x: 0.0, y: 0.0, z: 1.8, vx: 0, vz: 0, yaw: Math.PI,
    walkPhase: 0, walkAmp: 0, recoil: 0, tilt: 0,
    fireCooldown: 0, dashTimer: 0, dashCooldown: 0,
    flash: [1, 1, 1, 0],
  };

  const DRONE_SLOTS = [
    { ang: -0.95, rad: 4.5 },
    { ang: 0.0,   rad: 4.7 },
    { ang: 0.95,  rad: 4.5 },
  ];

  const drones = DRONE_SLOTS.map((sl, id) => ({
    id,
    baseAng: sl.ang,
    rad: sl.rad,
    x: Math.sin(sl.ang) * sl.rad,
    z: -Math.cos(sl.ang) * sl.rad,
    yaw: 0,
    hoverY: 0,
    hp: 3, maxHp: 3,
    fireTimer: 0.55 + id * 0.42,
    recoil: 0, flash: 0,
    scale: 1.0, respawnTimer: 0,
  }));

  function showBanner(text, bg, fg = "#ffffff", dur = 1.0) {
    banner = { text, bg, fg, timer: dur };
  }

  function spawnSparks(x, y, z, col, count = 14, sp = 4.2, lift = 2.8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.35 + Math.random() * 0.8);
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * v,
        vy: lift * (0.3 + Math.random() * 0.9),
        vz: Math.sin(a) * v,
        r: col[0], g: col[1], b: col[2],
        life: 0.55 + Math.random() * 0.35,
        size: 0.13 + Math.random() * 0.08,
      });
    }
  }

  function reset(keepStats = false) {
    realHp = 100;
    hudHp = 100;
    mercyShieldTimer = 0;
    koTimer = 0;
    bolts.length = 0;
    rings.length = 0;
    sparks.length = 0;
    hero.x = 0.0; hero.z = 1.8; hero.vx = 0; hero.vz = 0; hero.yaw = Math.PI;
    hero.recoil = 0; hero.tilt = 0; hero.dashTimer = 0; hero.dashCooldown = 0; hero.flash = [1, 1, 1, 0];
    for (const d of drones) {
      d.x = Math.sin(d.baseAng) * d.rad;
      d.z = -Math.cos(d.baseAng) * d.rad;
      d.hp = d.maxHp; d.scale = 1.0; d.respawnTimer = 0; d.fireTimer = 0.50 + d.id * 0.38;
      d.recoil = 0; d.flash = 0;
    }
    if (!keepStats) {
      oneHpSaves = 0;
      mercyMisses = 0;
      deaths = 0;
      droneKills = 0;
      banner = null;
    }
  }
  reset(false);

  function applyDamageToHero(rawDmg) {
    if (koTimer > 0 || hero.dashTimer > 0.02) return;
    if (mercyShieldTimer > 0) {
      // Blocked by 1 HP Death's Door Grace Shield!
      rings.push({ x: hero.x, y: 0.15, z: hero.z, rad: 0.4, maxRad: 2.1, r: 0.22, g: 1.0, b: 0.88, a: 0.95 });
      spawnSparks(hero.x, 1.1, hero.z, [0.22, 1.0, 0.88], 12, 3.8, 2.5);
      showBanner("MERCY SHIELD ABSORBED!", "#14b8a6", "#04211c", 0.85);
      audio?.mercyShield?.();
      return;
    }

    const prevReal = realHp;
    const nextReal = realHp - rawDmg;

    // Secret Trick #2: Death's Door 1 HP Clamp! Never die from above 1 HP on a single big blast!
    if (mercyOn && prevReal > 3.0 && nextReal <= 0) {
      realHp = 2.5;
      hudHp = realToHudHp(realHp, mercyOn); // clamps cleanly to 1%!
      mercyShieldTimer = 1.25;
      oneHpSaves++;
      hero.flash = [0.22, 1.0, 0.88, 1.0];
      rings.push({ x: hero.x, y: 0.12, z: hero.z, rad: 0.35, maxRad: 2.6, r: 0.22, g: 1.0, b: 0.88, a: 0.98 });
      spawnSparks(hero.x, 1.05, hero.z, [0.22, 1.0, 0.88], 24, 5.2, 3.6);
      showBanner("DEATH'S DOOR! CLAMPED TO 1 HP!", "#14b8a6", "#04211c", 1.25);
      audio?.mercyShield?.();
      requestHudRefresh?.();
      return;
    }

    realHp = Math.max(0, nextReal);
    hudHp = realToHudHp(realHp, mercyOn);
    hero.flash = [1.0, 0.18, 0.24, 1.0];
    spawnSparks(hero.x, 1.05, hero.z, [1.0, 0.20, 0.28], 14, 4.2, 2.8);
    audio?.laserHit?.();

    if (realHp <= 0) {
      deaths++;
      koTimer = 1.65;
      rings.push({ x: hero.x, y: 0.12, z: hero.z, rad: 0.35, maxRad: 2.8, r: 1.0, g: 0.16, b: 0.24, a: 0.95 });
      banner = null;
      audio?.playerHurt?.();
      requestHudRefresh?.();
    } else if (mercyOn && hudHp <= 20 && realHp > 20) {
      showBanner(`HUD ${Math.round(hudHp)}% · REAL ${Math.round(realHp)}% HP!`, "#f59e0b", "#1c1204", 0.95);
    }
  }

  function firePlayerCarbine(aimWorld = null) {
    if (koTimer > 0 || hero.fireCooldown > 0) return;
    if (aimWorld) {
      const dx = aimWorld[0] - hero.x, dz = aimWorld[2] - hero.z;
      if (Math.hypot(dx, dz) > 0.25) hero.yaw = Math.atan2(dx, dz);
    } else {
      // Auto-aim nearest living drone if pressing Space!
      let best = null, bestD = 999;
      for (const d of drones) {
        if (d.respawnTimer > 0) continue;
        const dist = Math.hypot(d.x - hero.x, d.z - hero.z);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      if (best) hero.yaw = Math.atan2(best.x - hero.x, best.z - hero.z);
    }

    hero.fireCooldown = 0.22;
    hero.recoil = 1.0;
    const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
    bolts.push({
      x: hero.x + fx * 0.85,
      y: 1.06,
      z: hero.z + fz * 0.85,
      vx: fx * 17.5,
      vz: fz * 17.5,
      friendly: true,
      r: 0.16, g: 0.94, b: 1.0,
      life: 1.4,
      nearChecked: false,
    });
    spawnSparks(hero.x + fx * 0.9, 1.06, hero.z + fz * 0.9, [0.22, 0.95, 1.0], 5, 2.2, 1.2);
    audio?.laserShot?.(true);
  }

  function fireDroneBolt(d) {
    const toHero = Math.atan2(hero.x - d.x, hero.z - d.z);
    const scatterActive = mercyOn && hudHp <= 25;
    let spread = 0;
    if (scatterActive) {
      // Secret Trick #3: Stormtrooper Mercy Aim! Widens cone to ±27° and biases shots dramatically past hero's shoulders!
      const side = ((d.id + Math.floor(time * 3)) % 2 === 0) ? 1 : -1;
      spread = side * (0.20 + Math.random() * 0.24);
    } else {
      // Tight ±3° laser aim!
      spread = (Math.random() - 0.5) * 0.09;
    }
    const ang = toHero + spread;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    d.recoil = 0.35;
    bolts.push({
      x: d.x + fx * 0.65,
      y: 1.15,
      z: d.z + fz * 0.65,
      vx: fx * 11.2,
      vz: fz * 11.2,
      friendly: false,
      r: scatterActive ? 1.0 : 1.0,
      g: scatterActive ? 0.58 : 0.16,
      b: scatterActive ? 0.14 : 0.28,
      life: 1.8,
      nearChecked: false,
      wasMercyScatter: scatterActive,
    });
    audio?.laserShot?.(false);
  }

  function performDash(keys) {
    if (koTimer > 0 || hero.dashCooldown > 0) return;
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
    hero.vx = dx * 12.5;
    hero.vz = dz * 12.5;
    hero.dashTimer = 0.24;
    hero.dashCooldown = 0.75;
    spawnSparks(hero.x, 0.9, hero.z, [0.22, 0.94, 1.0], 10, 3.0, 1.4);
    audio?.dodge?.();
  }

  function update(dt, keys = new Set(), pointer = {}) {
    const h = Math.min(0.035, Math.max(0.001, dt));
    time += h;
    hero.fireCooldown = Math.max(0, hero.fireCooldown - h);
    hero.dashTimer = Math.max(0, hero.dashTimer - h);
    hero.dashCooldown = Math.max(0, hero.dashCooldown - h);
    hero.recoil *= Math.exp(-14 * h);
    hero.flash[3] = Math.max(0, hero.flash[3] - h * 4.5);
    mercyShieldTimer = Math.max(0, mercyShieldTimer - h);

    if (banner) {
      banner.timer -= h;
      if (banner.timer <= 0) banner = null;
    }

    const up = keys.has("KeyW") || keys.has("ArrowUp");
    const dn = keys.has("KeyS") || keys.has("ArrowDown");
    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");
    const dashKey = keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (up || dn || lt || rt || dashKey) playerControl = true;
    if (playerControl !== prevPlayerControl) {
      prevPlayerControl = playerControl;
      requestHudRefresh?.();
    }

    if (dashKey && hero.dashCooldown <= 0) performDash(keys);

    if (koTimer > 0) {
      koTimer -= h;
      hero.vx *= Math.exp(-8 * h);
      hero.vz *= Math.exp(-8 * h);
      hero.tilt = Math.min(1.42, hero.tilt + h * 5.5);
      if (koTimer <= 0) reset(true);
    } else if (playerControl) {
      hero.tilt *= Math.exp(-10 * h);
      if (hero.dashTimer <= 0) {
        let mx = (rt ? 1 : 0) - (lt ? 1 : 0);
        let mz = (dn ? 1 : 0) - (up ? 1 : 0);
        const ml = Math.hypot(mx, mz);
        const tvx = ml > 0.01 ? (mx / ml) * 5.8 : 0;
        const tvz = ml > 0.01 ? (mz / ml) * 5.8 : 0;
        hero.vx += (tvx - hero.vx) * (1 - Math.exp(-12 * h));
        hero.vz += (tvz - hero.vz) * (1 - Math.exp(-12 * h));
        if (pointer?.world) {
          const dx = pointer.world[0] - hero.x, dz = pointer.world[2] - hero.z;
          if (Math.hypot(dx, dz) > 0.4) hero.yaw += angleDiff(Math.atan2(dx, dz), hero.yaw) * (1 - Math.exp(-12 * h));
        } else if (ml > 0.01) {
          hero.yaw += angleDiff(Math.atan2(mx, mz), hero.yaw) * (1 - Math.exp(-10 * h));
        }
      }
      hero.x = clamp(hero.x + hero.vx * h, -5.2, 5.2);
      hero.z = clamp(hero.z + hero.vz * h, -4.6, 5.2);
    } else {
      // Auto-Demo: hero weaves smoothly in front of drones, shoots back, takes dramatic hits into the red zone & triggers 1 HP Saves!
      hero.tilt *= Math.exp(-10 * h);
      const tx = Math.sin(time * 0.95) * 1.9;
      const tz = 1.65 + Math.cos(time * 0.72) * 0.75;
      hero.vx += ((tx - hero.x) * 2.4 - hero.vx) * (1 - Math.exp(-8 * h));
      hero.vz += ((tz - hero.z) * 2.4 - hero.vz) * (1 - Math.exp(-8 * h));
      hero.x = clamp(hero.x + hero.vx * h, -5.0, 5.0);
      hero.z = clamp(hero.z + hero.vz * h, -4.4, 5.0);
      if (hero.fireCooldown <= 0 && Math.sin(time * 3.1) > 0.82) firePlayerCarbine(null);
    }

    const hSpd = Math.hypot(hero.vx, hero.vz);
    hero.walkAmp += ((koTimer <= 0 && hSpd > 0.3 ? Math.min(1, hSpd / 5.0) : 0) - hero.walkAmp) * (1 - Math.exp(-10 * h));
    if (hero.walkAmp > 0.02) hero.walkPhase += h * (4.4 + hSpd * 1.3);

    // Update Hover Laser Sentinel Drones
    for (const d of drones) {
      d.recoil *= Math.exp(-8 * h);
      d.flash = Math.max(0, d.flash - h * 6);
      d.hoverY = Math.sin(time * 2.8 + d.id * 2.1) * 0.16;

      if (d.respawnTimer > 0) {
        d.respawnTimer -= h;
        if (d.respawnTimer <= 0) {
          d.hp = d.maxHp; d.scale = 0.05; d.fireTimer = 0.85;
          spawnSparks(d.x, 1.35, d.z, [1.0, 0.22, 0.35], 12, 3.2, 2.0);
        }
      } else {
        d.scale = lerp(d.scale, 1.0, 1 - Math.exp(-8 * h));
        const ang = d.baseAng + Math.sin(time * 0.45 + d.id * 1.8) * 0.32;
        const tx = Math.sin(ang) * d.rad;
        const tz = -Math.cos(ang) * d.rad;
        d.x += (tx - d.x) * (1 - Math.exp(-4.5 * h));
        d.z += (tz - d.z) * (1 - Math.exp(-4.5 * h));
        d.yaw += angleDiff(Math.atan2(hero.x - d.x, hero.z - d.z), d.yaw) * (1 - Math.exp(-8 * h));

        if (koTimer <= 0) {
          d.fireTimer -= h;
          if (d.fireTimer <= 0) {
            d.fireTimer = 1.18 + (d.id % 2) * 0.25;
            fireDroneBolt(d);
          }
        }
      }
    }

    // Update Plasma Bolts & Collisions
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * h;
      b.z += b.vz * h;
      b.life -= h;
      let hit = false;

      if (b.friendly) {
        for (const d of drones) {
          if (d.respawnTimer > 0) continue;
          if (Math.hypot(b.x - d.x, b.z - d.z) < 0.92) {
            hit = true;
            d.hp--;
            d.flash = 1.0;
            d.recoil = 0.55;
            spawnSparks(b.x, b.y, b.z, [0.20, 0.94, 1.0], 10, 3.8, 2.2);
            if (d.hp <= 0) {
              droneKills++;
              d.respawnTimer = 2.6;
              d.scale = 0;
              rings.push({ x: d.x, y: 0.12, z: d.z, rad: 0.3, maxRad: 2.3, r: 1.0, g: 0.25, b: 0.38, a: 0.92 });
              spawnSparks(d.x, 1.35, d.z, [1.0, 0.35, 0.22], 22, 5.5, 3.6);
              audio?.enemyKo?.();
            } else {
              audio?.hitEnemy?.(false);
            }
            break;
          }
        }
      } else if (koTimer <= 0) {
        const distH = Math.hypot(b.x - hero.x, b.z - hero.z);
        if (distH < 0.72) {
          hit = true;
          applyDamageToHero(16);
        } else if (b.wasMercyScatter && !b.nearChecked && distH < 1.65) {
          b.nearChecked = true;
          mercyMisses++;
          spawnSparks(b.x, b.y, b.z, [1.0, 0.78, 0.22], 4, 1.5, 0.8);
          if (!banner) showBanner("STORMTROOPER MISS! (MERCY AIM)", "#f59e0b", "#1c1204", 0.75);
        }
      }

      if (hit || b.life <= 0 || Math.abs(b.x) > 7.4 || Math.abs(b.z) > 7.4) {
        bolts.splice(i, 1);
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.rad = lerp(rg.rad, rg.maxRad, 1 - Math.exp(-8.5 * h));
      rg.a -= h * 2.1;
      if (rg.a <= 0.02) rings.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx * h; sp.y += sp.vy * h; sp.z += sp.vz * h;
      sp.vy -= 9.2 * h;
      sp.life -= h * 1.55;
      if (sp.life <= 0) sparks.splice(i, 1);
    }

    // Keep hudHp synced cleanly
    hudHp = realToHudHp(realHp, mercyOn);
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    const scatterActive = mercyOn && hudHp <= 25;
    const aimHalfAngle = scatterActive ? 0.47 : 0.055; // 27° wide mercy scatter vs 3° lethal lock!
    const redPulse = hudHp <= 25 ? (0.55 + 0.45 * Math.sin(time * 8.5)) : 0.0;

    const { viewProj } = renderer.render({
      w, h, cam, time, hero, drones,
      hudHpRatio: hudHp / 100,
      redPulse,
      xrayOn,
      aimHalfAngle,
      mercyScatterActive: scatterActive,
      mercyShieldFrac: clamp(mercyShieldTimer / 1.25, 0, 1),
      bolts,
      rings,
      sparks,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const noHud = typeof document !== "undefined" && document.body.classList.contains("no-hud");
      if (!noHud) {
        drawDualHealthHud(ovCtx, ow, {
          hudHp, realHp, mercyOn, xrayOn,
          shieldActive: mercyShieldTimer > 0,
          scatterActive,
          oneHpSaves, mercyMisses, deaths,
        }, lang);
      }

      const pHero = projectPoint([hero.x, 2.38, hero.z], viewProj, ow, oh);
      if (pHero) {
        const lbl = realHp <= 0
          ? "K.O.! (0 HP)"
          : xrayOn && mercyOn && hudHp <= 25
            ? `HUD ${Math.round(hudHp)}% · REAL ${Math.round(realHp)}%`
            : `HP ${Math.round(hudHp)}%`;
        drawBadge(
          ovCtx, pHero.x, pHero.y, lbl,
          mercyShieldTimer > 0 ? "#14b8a6" : (hudHp <= 25 ? "#ef4444" : "#10b981"),
          mercyShieldTimer > 0 || hudHp > 25 ? "#042119" : "#ffffff",
          ow,
        );
      }

      if (banner) {
        const pb = projectPoint([hero.x, 3.12, hero.z], viewProj, ow, oh);
        if (pb) drawBadge(ovCtx, pb.x, pb.y, banner.text, banner.bg, banner.fg, ow);
      }

      if (xrayOn && scatterActive) {
        const pCone = projectPoint([drones[1].x, 2.45, drones[1].z], viewProj, ow, oh);
        if (pCone) {
          drawBadge(
            ovCtx, pCone.x, pCone.y,
            lang === "pl" ? "ROZRZUT AI ±27°!" : "MERCY SCATTER ±27°!",
            "#f59e0b", "#1c1204", ow,
          );
        }
      }
    }
  }

  return {
    id: "fake-1hp",
    defaultCam: { yaw: 0.06, pitch: 0.64, dist: 17.5, targetX: 0.0, targetY: 0.4, targetZ: 0.2, fovDeg: 40 },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "mercy", label: pl ? "Triki 1 HP (ON)" : "Fake 1 HP (ON)", pressed: mercyOn },
        { id: "honest", label: pl ? "Uczciwe HP (OFF)" : "Honest Math (OFF)", pressed: !mercyOn },
        { id: "xray", label: xrayOn ? (pl ? "X-Ray: WŁ" : "X-Ray: ON") : (pl ? "X-Ray: WYŁ" : "X-Ray: OFF"), pressed: xrayOn },
        { id: "hit", label: pl ? "Otrzymaj cios (H)" : "Take Big Hit (H)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "mercy") { mercyOn = true; reset(false); }
      if (id === "honest") { mercyOn = false; reset(false); }
      if (id === "xray") { xrayOn = !xrayOn; }
      if (id === "hit") { applyDamageToHero(28); }
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space" || code === "KeyJ" || code === "Enter") { playerControl = true; firePlayerCarbine(null); }
      if (code === "KeyT") { mercyOn = !mercyOn; reset(false); }
      if (code === "KeyX") { xrayOn = !xrayOn; }
      if (code === "KeyH") { applyDamageToHero(28); }
    },
    onClickWorld(worldPt, { button }) {
      if (button === 0) { playerControl = true; firePlayerCarbine(worldPt); }
    },
    getDebugState() {
      return {
        mercyOn,
        xrayOn,
        realHp: +realHp.toFixed(1),
        hudHp: +hudHp.toFixed(1),
        shieldActive: mercyShieldTimer > 0,
        scatterActive: mercyOn && hudHp <= 25,
        oneHpSaves,
        mercyMisses,
        deaths,
        droneKills,
      };
    },
    reset: () => reset(false),
    update,
    render,
  };
}
