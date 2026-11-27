// Entry #11: Bullet Magnetism & Aim Assist — Playable 3D Space Station Firing Range!
// Studio Overhaul: Self-demonstrating Auto-Demo on load (+5.2° deliberate near-miss shots curving in mid-air!) +
// crisp world-space 3D callout pills ("YOUR AIM (MISS!)", "MAGNET CURVE (+5.2° -> HIT!)", "MAGNET ZONE ±7.5°") +
// seamless manual mouse/keyboard takeover!
import { clamp, lerp } from "../../gl-utils.js";
import { createRangeRenderer } from "./range-renderer.js";

const MAGNET_DEG = 7.5;
const MAGNET_RAD = (MAGNET_DEG * Math.PI) / 180;
const MAGNET_BUBBLE_R = 1.18;
const TRUE_HITBOX_R = 0.44;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

function drawWorldPill(ctx, x, y, text, color, cssW, cssH, fontPx = 11) {
  ctx.save();
  ctx.font = `800 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 14;
  const ph = fontPx + 10;
  const px = clamp(x - pw * 0.5, 8, cssW - pw - 8);
  const py = clamp(y - ph * 0.5, 56, cssH - ph - 8);
  ctx.fillStyle = "rgba(10, 13, 28, 0.90)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, px + pw * 0.5, py + ph * 0.5 + 0.5);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createRangeRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.74, dist: 18.2, targetX: 0.0, targetY: 0.65, targetZ: -0.1, fovDeg: 40 };

  let time = 0;
  let assistOn = true;
  let showOverlay = true;
  let autoDemo = true;
  let autoShotCd = 0.25;
  let userInteracted = false;

  let shots = 0;
  let rawHits = 0;
  let magnetSaves = 0;
  let misses = 0;
  let lastBendDeg = 0;
  let frictionActive = false;

  let testBurst = null;
  let bannerText = "";
  let bannerColor = "#fb7185";
  let bannerTimer = 0;

  const turret = { x: 0.0, z: 4.9, yaw: Math.PI, targetYaw: Math.PI, recoil: 0 };
  let targets = [];
  let bolts = [];
  let trails = [];
  let sparks = [];

  function setBanner(text, color = "#fb7185", dur = 2.0) {
    bannerText = text; bannerColor = color; bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.2;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.3 + Math.random() * 2.6,
        vz: Math.sin(a) * sp,
        r, g, b,
        size: 0.15 + Math.random() * 0.11,
        life: 0.40 + Math.random() * 0.30,
        maxLife: 0.70,
      });
    }
  }

  function reset() {
    time = 0;
    shots = 0; rawHits = 0; magnetSaves = 0; misses = 0;
    lastBendDeg = 0;
    testBurst = null;
    autoDemo = true;
    autoShotCd = 0.25;
    turret.yaw = Math.PI;
    turret.targetYaw = Math.PI;
    turret.recoil = 0;
    bolts = []; trails = []; sparks = [];
    targets = [
      { id: 0, baseX: -4.4, x: -4.4, z: -4.2, amp: 1.5, spd: 0.85, phase: 0.3, hitTilt: 0, flash: 0 },
      { id: 1, baseX:  4.4, x:  4.4, z: -4.2, amp: 1.5, spd: 1.05, phase: 2.6, hitTilt: 0, flash: 0 },
      { id: 2, baseX:  0.0, x:  0.0, z: -1.6, amp: 1.9, spd: 0.92, phase: 0.8, hitTilt: 0, flash: 0 },
      { id: 3, baseX: -4.4, x: -4.4, z:  0.9, amp: 1.4, spd: 1.18, phase: 4.0, hitTilt: 0, flash: 0 },
    ];
    bannerTimer = 0;
  }

  reset();

  function evaluateShot(aimYaw) {
    const ox = turret.x, oz = turret.z;
    const dx = Math.sin(aimYaw), dz = Math.cos(aimYaw);
    let bestTrue = null;
    let bestMag = null;
    let bestMagAng = MAGNET_RAD;

    for (const tg of targets) {
      const rx = tg.x - ox, rz = tg.z - oz;
      const dist = Math.hypot(rx, rz);
      const tProj = rx * dx + rz * dz;
      if (tProj <= 0.5) continue;
      const perp = Math.abs(rx * dz - rz * dx);
      const ang = Math.abs(wrapAngle(Math.atan2(rx, rz) - aimYaw));

      if (perp <= TRUE_HITBOX_R) {
        if (!bestTrue || dist < bestTrue.dist) bestTrue = { tg, dist, ang };
      } else if (assistOn && (ang <= MAGNET_RAD || perp <= MAGNET_BUBBLE_R)) {
        if (ang < bestMagAng) {
          bestMagAng = ang;
          bestMag = { tg, dist, ang };
        }
      }
    }
    return { bestTrue, bestMag };
  }

  function fireShot(overrideYaw = null, { silent = false } = {}) {
    const aimYaw = overrideYaw != null ? overrideYaw : turret.yaw;
    turret.yaw = aimYaw;
    turret.recoil = 0.34;
    shots++;
    if (!silent) audio?.laserShot?.(true);

    const sx = turret.x + Math.sin(aimYaw) * 1.15;
    const sz = turret.z + Math.cos(aimYaw) * 1.15;
    const rawEx = turret.x + Math.sin(aimYaw) * 11.4;
    const rawEz = turret.z + Math.cos(aimYaw) * 11.4;

    const { bestTrue, bestMag } = evaluateShot(aimYaw);
    const chosen = bestTrue || bestMag;
    const magnetized = !bestTrue && Boolean(bestMag);
    const bendDeg = bestMag ? (bestMag.ang * 180) / Math.PI : 0;

    // Smooth quadratic Bezier arc so magnetized shots VISIBLY BEND in 3D space!
    const ex = chosen ? chosen.tg.x : rawEx;
    const ez = chosen ? chosen.tg.z : rawEz;
    const ey = chosen ? 1.54 : 1.14;
    const midDist = chosen ? chosen.dist * 0.58 : 5.8;
    const cx = turret.x + Math.sin(aimYaw) * midDist;
    const cz = turret.z + Math.cos(aimYaw) * midDist;
    const cy = 1.28;

    const pts = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const px = u * u * sx + 2 * u * t * cx + t * t * ex;
      const py = u * u * 1.14 + 2 * u * t * cy + t * t * ey;
      const pz = u * u * sz + 2 * u * t * cz + t * t * ez;
      pts.push([px, py, pz]);
    }

    const trailLife = silent ? 2.2 : 2.1;
    trails.push({
      sx, sz, rawEx, rawEz, ex, ey, ez,
      midPt: pts[Math.floor(steps * 0.64)],
      rawLblPt: [lerp(sx, rawEx, 0.78), 1.18, lerp(sz, rawEz, 0.78)],
      points: pts, magnetized, hit: Boolean(chosen), bendDeg,
      life: trailLife, maxLife: trailLife,
    });
    if (trails.length > 6) trails.shift();
    bolts.push({ points: pts, t: 0, dur: 0.15, x: sx, y: 1.14, z: sz, magnetized, chosen });

    if (bestTrue) {
      rawHits++;
      lastBendDeg = 0;
      bestTrue.tg.hitTilt = 0.42;
      bestTrue.tg.flash = 1.0;
      spawnSparks(ex, ey, ez, 0.24, 1.0, 0.64, 14);
      if (!silent) audio?.hitEnemy?.(false);
    } else if (bestMag) {
      magnetSaves++;
      lastBendDeg = bendDeg;
      bestMag.tg.hitTilt = 0.55;
      bestMag.tg.flash = 1.0;
      spawnSparks(ex, ey, ez, 0.16, 0.96, 1.0, 20);
      if (!silent) audio?.coyoteSave?.();
      if (!testBurst && !silent) {
        setBanner(`MAGNET SAVE! CURVED +${lastBendDeg.toFixed(1)}° INTO HEADSHOT!`, "#22d3ee", 1.5);
      }
    } else {
      misses++;
      lastBendDeg = 0;
      if (!silent) audio?.inputIgnored?.();
      if (!testBurst && !silent) {
        setBanner(assistOn ? "MISS (OUTSIDE ±7.5° CONE)" : "MISS! (RAW 0° HITBOX — ZERO MAGNETISM)", "#f87171", 1.3);
      }
    }
  }

  function computeDemoNearMissYaw() {
    const tg = targets[2]; // Center Hero Target Bot
    const exactYaw = Math.atan2(tg.x - turret.x, tg.z - turret.z);
    const offsetSign = tg.x > 0 ? 1 : -1; // deliberately aim +5.2° into the clear lane side!
    return exactYaw + offsetSign * (5.2 * Math.PI / 180);
  }

  function startNearMissTest() {
    userInteracted = true;
    autoDemo = false;
    trails = [];
    testBurst = { remaining: 5, cd: 0.05, hits: 0, misses: 0 };
    setBanner(
      assistOn ? "NEAR-MISS TEST (+5.2° OFF) · MAGNETISM ON..." : "NEAR-MISS TEST (+5.2° OFF) · RAW 0°...",
      assistOn ? "#22d3ee" : "#f87171",
      1.6
    );
  }

  function update(dt, keys, pointer) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    turret.recoil = Math.max(0, turret.recoil - dt * 2.4);

    for (const tg of targets) {
      tg.x = tg.baseX + Math.sin(time * tg.spd + tg.phase) * tg.amp;
      tg.hitTilt = lerp(tg.hitTilt, 0, clamp(dt * 9, 0, 1));
      tg.flash = Math.max(0, tg.flash - dt * 3.8);
    }

    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoDemo = false;
      userInteracted = true;
      const sens = (assistOn && frictionActive) ? 0.85 : 1.65;
      turret.targetYaw = clamp(turret.targetYaw + ((left ? 1 : 0) - (right ? 1 : 0)) * sens * dt, Math.PI - 1.05, Math.PI + 1.05);
    } else if (!autoDemo && pointer?.world && pointer.world[2] < turret.z - 0.8) {
      const desired = Math.atan2(pointer.world[0] - turret.x, pointer.world[2] - turret.z);
      turret.targetYaw = Math.PI + clamp(wrapAngle(desired - Math.PI), -1.05, 1.05);
    } else if (autoDemo && !testBurst) {
      // Self-demonstrating showcase: hold deliberate +5.2° off-target aim beside Target #2 & fire gently!
      turret.targetYaw = computeDemoNearMissYaw();
      autoShotCd -= dt;
      if (autoShotCd <= 0) {
        trails = [];
        fireShot(turret.targetYaw, { silent: !userInteracted });
        autoShotCd = 1.65;
      }
    }

    const { bestTrue, bestMag } = evaluateShot(turret.yaw);
    frictionActive = Boolean(bestTrue || bestMag);
    const trackRate = (assistOn && frictionActive) ? 7.5 : 14.5;
    turret.yaw = lerp(turret.yaw, turret.targetYaw, clamp(dt * trackRate, 0, 1));

    if (testBurst) {
      testBurst.cd -= dt;
      if (testBurst.cd <= 0 && testBurst.remaining > 0) {
        const offYaw = computeDemoNearMissYaw();
        const prevHits = rawHits + magnetSaves;
        fireShot(offYaw, { silent: false });
        if (rawHits + magnetSaves > prevHits) testBurst.hits++;
        else testBurst.misses++;
        testBurst.remaining--;
        testBurst.cd = 0.24;
        if (testBurst.remaining === 0) {
          setBanner(
            assistOn
              ? `MAGNETISM ON: ${testBurst.hits}/5 CURVED HEADSHOTS!`
              : `RAW 0° HITBOX: ${testBurst.hits}/5 HITS (${testBurst.misses} NEAR-MISSES!)`,
            assistOn ? "#22d3ee" : "#f87171",
            2.4
          );
          testBurst = null;
        }
      }
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt;
      const u = clamp(b.t / b.dur, 0, 1);
      const idx = Math.min(b.points.length - 1, Math.floor(u * (b.points.length - 1)));
      b.x = b.points[idx][0]; b.y = b.points[idx][1]; b.z = b.points[idx][2];
      if (u >= 1) bolts.splice(i, 1);
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life -= dt;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.5 * dt;
      s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const acc = shots > 0 ? Math.round(((rawHits + magnetSaves) / shots) * 100) : 0;
    const isCompact = cssW < 640;

    // 1. World-Space 3D Storytelling Callouts (instant 2-second comprehension right on the action!)
    if (showOverlay && viewProj) {
      const hero = targets[2];
      const hp = projectToScreen(viewProj, hero.x, 2.55, hero.z, cssW, cssH);
      if (hp) {
        drawWorldPill(
          ctx, hp.x, hp.y,
          assistOn
            ? (isPl ? `STREFA MAGNETYZMU ±${MAGNET_DEG}°` : `MAGNET ZONE ±${MAGNET_DEG}°`)
            : (isPl ? "SUROWY HITBOX 0°" : "RAW 0° HITBOX"),
          assistOn ? "#fb7185" : "#94a3b8",
          cssW, cssH, isCompact ? 9.5 : 10.5
        );
      }

      const lastTrail = trails[trails.length - 1];
      if (lastTrail && lastTrail.life > 0.15) {
        const rp = projectToScreen(viewProj, lastTrail.rawLblPt[0], lastTrail.rawLblPt[1] + 0.55, lastTrail.rawLblPt[2], cssW, cssH);
        const mp = projectToScreen(viewProj, lastTrail.midPt[0], lastTrail.midPt[1] + 0.45, lastTrail.midPt[2], cssW, cssH);
        if (lastTrail.magnetized) {
          if (rp) {
            drawWorldPill(
              ctx, rp.x, rp.y,
              isPl ? "TWÓJ CEL (PUDŁO!)" : "YOUR AIM (MISS!)",
              "#f87171", cssW, cssH, isCompact ? 9.5 : 10.5
            );
          }
          if (mp) {
            drawWorldPill(
              ctx, mp.x, mp.y + 18,
              isPl
                ? `ZAKRZYWIENIE +${lastTrail.bendDeg.toFixed(1)}° → TRAFIONY!`
                : `MAGNET CURVE (+${lastTrail.bendDeg.toFixed(1)}° → HIT!)`,
              "#22d3ee", cssW, cssH, isCompact ? 9.5 : 11
            );
          }
        } else if (!lastTrail.hit && rp) {
          drawWorldPill(
            ctx, rp.x, rp.y,
            isPl ? "PUDŁO! (BRAK MAGNETYZMU ✗)" : "MISSED BY +5.2° (RAW 0° ✗)",
            "#f87171", cssW, cssH, isCompact ? 9.5 : 11
          );
        } else if (lastTrail.hit && mp) {
          drawWorldPill(
            ctx, mp.x, mp.y,
            isPl ? "CZYSTE TRAFIENIE ✓" : "DIRECT HIT ✓",
            "#4ade80", cssW, cssH, isCompact ? 9.5 : 10.5
          );
        }
      }

      if (!autoDemo && assistOn && frictionActive && !isCompact) {
        const tp = projectToScreen(viewProj, turret.x, 1.9, turret.z, cssW, cssH);
        if (tp) {
          drawWorldPill(ctx, tp.x, tp.y, isPl ? "TARCIE CELOWNIKA 0.5×" : "RETICLE FRICTION 0.5×", "#4ade80", cssW, cssH, 10);
        }
      }
    }

    // 2. Corner Telemetry HUD (hidden in ?hud=0 clean thumbnails)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (isCompact) {
        const pill = assistOn
          ? (isPl ? `MAGNET ±${MAGNET_DEG}° · Celność ${acc}% · Ratunki ${magnetSaves}` : `MAGNET ±${MAGNET_DEG}° · Acc ${acc}% · Saves ${magnetSaves}`)
          : (isPl ? `RAW 0° · Celność ${acc}% · Pudła ${misses}` : `RAW 0° · Acc ${acc}% · Misses ${misses}`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(10, 13, 28, 0.88)";
        ctx.strokeStyle = assistOn ? "rgba(244, 63, 94, 0.72)" : "rgba(148, 163, 184, 0.65)";
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = assistOn ? "#fda4af" : "#cbd5e1";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(302, cssW - 28), panelH = 148;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(10, 13, 28, 0.88)";
        ctx.strokeStyle = assistOn ? "rgba(244, 63, 94, 0.72)" : "rgba(148, 163, 184, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = assistOn ? "#fb7185" : "#cbd5e1";
        ctx.fillText(
          assistOn
            ? (isPl ? `BULLET MAGNETISM · ±${MAGNET_DEG}° + TARCIE` : `BULLET MAGNETISM · ±${MAGNET_DEG}° + FRICTION`)
            : (isPl ? "SUROWY HITBOX · 0° ASYSTY" : "RAW HITBOX · 0° AIM ASSIST"),
          px + 12, py + 21
        );

        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, bw, 15, 4); ctx.fill();
        if (acc > 0) {
          ctx.fillStyle = assistOn ? "#22d3ee" : "#f59e0b";
          ctx.beginPath(); ctx.roundRect(bx, py + 34, Math.max(6, bw * (acc / 100)), 15, 4); ctx.fill();
        }
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(isPl ? `CELNOŚĆ: ${acc}% (${rawHits + magnetSaves}/${shots})` : `ACCURACY: ${acc}% (${rawHits + magnetSaves}/${shots})`, bx + 6, py + 45);

        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? `Zakrzywione trafienia: ${magnetSaves} (+${lastBendDeg.toFixed(1)}°)` : `Magnet Saves: ${magnetSaves} (bend +${lastBendDeg.toFixed(1)}°)`, px + 12, py + 72);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(isPl ? `Czyste trafienia: ${rawHits}  ·  Pudła: ${misses}` : `True Hits: ${rawHits}  ·  Misses: ${misses}`, px + 12, py + 94);
        ctx.fillStyle = autoDemo ? "#fde047" : (frictionActive && assistOn ? "#4ade80" : "#94a3b8");
        ctx.fillText(
          autoDemo
            ? (isPl ? "Auto-Demo (+5.2°): kliknij aby strzelać!" : "Auto-Demo (+5.2°): click to aim & fire!")
            : (assistOn
                ? (isPl ? `Tarcie celownika: ${frictionActive ? "AKTYWNE (0.5×)" : "CZUWA"}` : `Reticle Friction: ${frictionActive ? "ENGAGED (0.5×)" : "IDLE"}`)
                : (isPl ? "Tarcie celownika: WYŁ (1.0×)" : "Reticle Friction: OFF (1.0×)")),
          px + 12, py + 118
        );
        ctx.restore();
      }
    }

    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = "800 13.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = Math.min(cssW - 24, tw + 26);
      const bx = (cssW - bw) * 0.5, by = isCompact ? 86 : 76;
      ctx.fillStyle = "rgba(10, 13, 28, 0.92)";
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, 30, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = bannerColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(bannerText, cssW * 0.5, by + 15.5);
      ctx.restore();
    }
  }

  return {
    defaultCam,
    reset,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "toggle-assist", label: assistOn ? (pl ? "Asysta: Magnetyzm [T]" : "Assist: Magnetism [T]") : (pl ? "Asysta: Raw 0° [T]" : "Assist: Raw 0° [T]"), pressed: assistOn },
        { id: "near-miss", label: pl ? "Test +5.2° Pudła [V]" : "Near-Miss Test [V]", pressed: Boolean(testBurst) },
        { id: "fire", label: pl ? "Strzał [Spacja / Klik]" : "Fire [Space / Click]", pressed: false },
        { id: "toggle-overlay", label: showOverlay ? (pl ? "Stożek i Linie: WŁ [X]" : "Cones & Lines: ON [X]") : (pl ? "Stożek i Linie: WYŁ [X]" : "Cones & Lines: OFF [X]"), pressed: showOverlay },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-assist") {
        assistOn = !assistOn;
        audio?.ruleSwitch?.(assistOn);
        if (autoDemo) {
          // Immediately fire a fresh comparison shot so toggling T shows the exact contrast in <0.1s!
          autoShotCd = 0.08;
        }
        setBanner(assistOn ? "BULLET MAGNETISM ON (±7.5° CURVE!)" : "RAW 0° HITBOX (ZERO ASSIST!)", assistOn ? "#22d3ee" : "#f87171", 1.8);
      } else if (id === "near-miss") {
        startNearMissTest();
      } else if (id === "fire") {
        autoDemo = false;
        fireShot(null, { silent: false });
      } else if (id === "toggle-overlay") {
        showOverlay = !showOverlay;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-assist");
      else if (code === "KeyV") this.onAction("near-miss");
      else if (code === "Space") this.onAction("fire");
      else if (code === "KeyX") this.onAction("toggle-overlay");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        autoDemo = false;
        const aim = Math.atan2(world[0] - turret.x, world[2] - turret.z);
        turret.targetYaw = Math.PI + clamp(wrapAngle(aim - Math.PI), -1.05, 1.05);
        fireShot(turret.targetYaw, { silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time, assistOn, showOverlay, turret, targets, bolts, trails, sparks,
        magnetRad: MAGNET_RAD, magnetBubbleR: MAGNET_BUBBLE_R,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { assistOn, autoDemo, shots, rawHits, magnetSaves, misses, lastBendDeg: Number(lastBendDeg.toFixed(2)), burstActive: Boolean(testBurst) };
    },
  };
}
