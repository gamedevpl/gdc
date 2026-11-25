// Interactive Entry #2: Attack Tokens (Blender Knight vs 5 Skeleton Warriors)
// Toggle between OFF (all 5 dogpile at once!), 1 Token (fair cinematic turns), and 2 Tokens (hard mode)!
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

export function createEntry(gl) {
  const renderer = createArenaRenderer(gl);
  let tokenCount = 1; // 0 = OFF (dogpile!), 1 = Fair 1-token, 2 = Hard 2-tokens
  let time = 0;
  let hp = 100;
  let koTimer = 0;
  let turnTimer = 0;
  let activeIds = [0];
  let flyOrb = null; // { fromId, toId, t }
  const sparks = [];

  const hero = {
    x: 0, y: 0, z: 0, yaw: 0,
    torsoYaw: 0, headYaw: 0, shieldPitch: 0.18, swordPitch: 0, tilt: 0, hitFlash: 0,
  };

  const guards = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    baseAngle: (i / 5) * Math.PI * 2 + 0.3,
    x: 0, y: 0, z: 0, yaw: 0,
    hasToken: false, danger: 0,
    torsoYaw: 0, shieldPitch: 0.1, swordPitch: 0, tilt: 0,
    slashAlpha: 0,
    phase: i * 1.25,
    attackProgress: 0,
  }));

  function spawnSparks(x, z, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 2.8;
      sparks.push({
        x, y: 0.8 + Math.random() * 0.5, z,
        vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.2, vz: Math.sin(a) * spd,
        r: color[0], g: color[1], b: color[2], life: 0.9,
      });
    }
  }

  function reset() {
    time = 0; hp = 100; koTimer = 0; turnTimer = 0;
    activeIds = tokenCount === 0 ? [] : tokenCount === 1 ? [0] : [0, 2];
    flyOrb = null;
    sparks.length = 0;
    hero.tilt = 0; hero.hitFlash = 0;
  }

  function setTokens(n) {
    tokenCount = n;
    reset();
  }

  function update(dt) {
    const h = Math.min(0.05, dt);
    time += h;
    hero.hitFlash = Math.max(0, hero.hitFlash - h * 2.2);

    if (tokenCount === 0) {
      // DOGPILE CHAOS! All 5 rush in at once -> instant K.O. -> brief pause -> auto-reset
      if (koTimer > 0) {
        koTimer -= h;
        hero.tilt = Math.min(1.45, hero.tilt + h * 6);
        if (koTimer <= 0) reset();
      } else {
        const rush = Math.min(1, time / 0.85);
        const rad = 4.3 - rush * 2.85;
        for (const g of guards) {
          const ang = g.baseAngle + time * 0.28;
          g.x = Math.sin(ang) * rad;
          g.z = Math.cos(ang) * rad;
          g.yaw = Math.atan2(-g.x, -g.z);
          g.hasToken = false;
          g.danger = rush;
          const sw = Math.sin(time * 13 + g.phase);
          g.swordPitch = rush > 0.7 ? sw * 1.15 : 0.1;
          g.torsoYaw = rush > 0.7 ? sw * 0.45 : 0;
          g.slashAlpha = rush > 0.7 && sw > 0.45 ? (sw - 0.45) * 1.8 : 0;
        }
        if (rush > 0.75) {
          hp = Math.max(0, hp - h * 72);
          hero.hitFlash = 0.85;
          hero.yaw = Math.sin(time * 9) * 1.2;
          hero.shieldPitch = 0.7;
          if (Math.random() < 0.45) spawnSparks(0, 0, [1.0, 0.25, 0.22], 3);
          if (hp <= 0) {
            koTimer = 1.9;
            spawnSparks(0, 0, [1.0, 0.22, 0.18], 18);
          }
        }
      }
    } else {
      // FAIR ATTACK TOKENS (1 or 2 golden tokens rotating visibly around the ring!)
      hp = 100;
      hero.tilt *= Math.max(0, 1 - h * 8);
      turnTimer += h;
      const TURN_DUR = 2.65;

      if (turnTimer >= TURN_DUR) {
        turnTimer = 0;
        const oldPrimary = activeIds[0] ?? 0;
        const nextPrimary = (oldPrimary + 1) % 5;
        flyOrb = { fromId: oldPrimary, toId: nextPrimary, t: 0 };
        activeIds = tokenCount === 1 ? [nextPrimary] : [nextPrimary, (nextPrimary + 2) % 5];
      }
      if (flyOrb) {
        flyOrb.t += h * 2.2;
        if (flyOrb.t >= 1) flyOrb = null;
      }

      const primary = guards[activeIds[0] ?? 0];
      // Hero smoothly faces primary token holder & parries/counters!
      const targetYaw = Math.atan2(primary.x, primary.z);
      let dy = targetYaw - hero.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      hero.yaw += dy * Math.min(1, h * 7.0);

      for (const g of guards) {
        const isAct = activeIds.includes(g.id) && (!flyOrb || flyOrb.toId !== g.id);
        g.hasToken = isAct;
        g.danger = 0;
        const ang = g.baseAngle + time * 0.26;
        const targetR = isAct ? 1.85 : 4.35;
        const tx = Math.sin(ang) * targetR;
        const tz = Math.cos(ang) * targetR;
        g.x += (tx - g.x) * Math.min(1, h * 5.0);
        g.z += (tz - g.z) * Math.min(1, h * 5.0);
        g.yaw = Math.atan2(-g.x, -g.z);

        if (isAct) {
          const cyc = (turnTimer / TURN_DUR);
          if (cyc > 0.25 && cyc < 0.72) {
            const u = (cyc - 0.25) / 0.47;
            // Dramatic overhead windup -> crisp downward strike!
            g.swordPitch = u < 0.45 ? -1.15 * (u / 0.45) : -1.15 + 2.45 * ((u - 0.45) / 0.55);
            g.torsoYaw = u < 0.45 ? -0.45 * (u / 0.45) : -0.45 + 1.0 * ((u - 0.45) / 0.55);
            g.slashAlpha = u > 0.48 && u < 0.82 ? Math.sin(((u - 0.48) / 0.34) * Math.PI) : 0;
            if (Math.abs(u - 0.62) < h * 1.4) {
              spawnSparks(g.x * 0.4, g.z * 0.4, [1.0, 0.82, 0.25], 10);
            }
          } else {
            g.swordPitch *= Math.max(0, 1 - h * 8);
            g.torsoYaw *= Math.max(0, 1 - h * 8);
            g.slashAlpha = 0;
          }
        } else {
          g.swordPitch = Math.sin(time * 2.5 + g.phase) * 0.12;
          g.torsoYaw = Math.sin(time * 1.8 + g.phase) * 0.10;
          g.slashAlpha = 0;
        }
      }
      // Hero shield parry & counter swing synced with primary attacker
      const cyc = turnTimer / TURN_DUR;
      hero.shieldPitch = (cyc > 0.40 && cyc < 0.68) ? 0.92 : 0.20;
      hero.swordPitch = (cyc > 0.65 && cyc < 0.90) ? Math.sin(((cyc - 0.65) / 0.25) * Math.PI) * 1.25 : -0.1;
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      s.vy -= 5.2 * h;
      s.life -= h * 1.5;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h) {
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
      dangerFlash: tokenCount === 0 && koTimer <= 0 ? 0.55 : 0.0,
      sparks,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const pHero = project3D([hero.x, 2.55, hero.z], viewProj, ow, oh);
      if (pHero) {
        const lbl = hp <= 0 ? "K.O.! (0 HP)" : `KNIGHT · ${Math.round(hp)} HP`;
        drawBadge(ovCtx, pHero.x, pHero.y, lbl, hp <= 0 ? "#ef4444" : "#10b981", hp <= 0 ? "#fff" : "#062119", ow);
      }
      if (tokenCount > 0) {
        for (const g of guards) {
          const pg = project3D([g.x, g.hasToken ? 2.95 : 2.35, g.z], viewProj, ow, oh);
          if (!pg) continue;
          if (g.hasToken) drawBadge(ovCtx, pg.x, pg.y, "TOKEN", "#f59e0b", "#1c1204", ow);
          else drawBadge(ovCtx, pg.x, pg.y, "WAITING", "rgba(18,28,48,0.88)", "#7dd3fc", ow);
        }
        if (tokenOrb) {
          const po = project3D([tokenOrb.x, tokenOrb.y + 0.55, tokenOrb.z], viewProj, ow, oh);
          if (po) drawBadge(ovCtx, po.x, po.y, "PASS!", "#fde047", "#1c1204", ow);
        }
      } else if (koTimer <= 0 && time > 0.55) {
        const pt = project3D([0, 3.25, 0], viewProj, ow, oh);
        if (pt) drawBadge(ovCtx, pt.x, pt.y, "5× HIT AT ONCE!", "#ef4444", "#ffffff", ow);
      }
    }
  }

  return {
    id: "attack-tokens",
    defaultCam: { yaw: 0.05, pitch: 0.72, dist: 19.8, targetX: 0, targetY: 0.4, targetZ: 0.2, fovDeg: 40 },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "tok0", label: pl ? "Bez tokenów (Chaos)" : "Tokens: OFF (Chaos)", pressed: tokenCount === 0 },
        { id: "tok1", label: pl ? "1 Token (Fair)" : "1 Token (Fair)", pressed: tokenCount === 1 },
        { id: "tok2", label: pl ? "2 Tokeny (Hard)" : "2 Tokens (Hard)", pressed: tokenCount === 2 },
      ];
    },
    onAction(id) {
      if (id === "tok0") setTokens(0);
      if (id === "tok1") setTokens(1);
      if (id === "tok2") setTokens(2);
    },
    reset,
    update,
    render,
  };
}
