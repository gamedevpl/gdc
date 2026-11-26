// Playable Entry #7: Camera Deadzone & Look-Ahead — Live 3D Desert Temple Gauntlet!
// Sprint & dash past spinning brass sawblades (A/D + Space Jump + Shift Dash) and compare:
//   - Smart Cam (Deadzone Box + Look-Ahead Tether + Smooth Damping): 0% jitter on micro-steps, +120% forward sightline!
//   - Rigid Locked (Naive): glued straight to player — every tiny step shakes the whole world & traps pop in blind!
import { clamp } from "../../gl-utils.js";
import { createCanyonRenderer, SAWS_DEF, COURSE_MIN_X, COURSE_MAX_X, GOAL_X, projectPoint } from "./canyon-renderer.js";

const DZ_HALF_W = 1.65; // Horizontal Deadzone half-width (3.3m total rock-solid window!)
const DZ_HEIGHT = 2.65; // Vertical Deadzone window so small hops never yank the horizon!
const RUN_SPEED = 7.8;
const DASH_SPEED = 14.5;
const GRAVITY = 28.0;
const JUMP_VEL = 11.4;

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

function drawCameraTelemetryHud(ctx, ow, st, lang) {
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 28, 412);
  const boxH = 92;
  const x = ow - boxW - 18;
  const y = 72;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.88)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = st.smartCam ? "#38bdf8" : "#ef4444";
  ctx.stroke();

  const bx = x + 14;
  const bw = boxW - 28;
  ctx.font = "700 11px 'Courier New', monospace";
  ctx.textBaseline = "middle";

  // Top mode row
  ctx.textAlign = "left";
  ctx.fillStyle = st.smartCam ? "#7dd3fc" : "#fda4af";
  ctx.fillText(
    st.smartCam
      ? (pl ? `SMART CAM · DEADZONE + ${st.lookAheadOn ? "LOOK-AHEAD" : "BEZ WYPRZEDZANIA"}` : `SMART CAM · DEADZONE + ${st.lookAheadOn ? "LOOK-AHEAD" : "NO LOOK-AHEAD"}`)
      : (pl ? "SZTYWNA KAMERA (LOCKED · ZERO DEADZONE!)" : "RIGID LOCKED CAM (0 DEADZONE · 0 LOOK-AHEAD)"),
    bx, y + 17,
  );

  // Jitter Meter
  const jitterPct = clamp(st.jitterScore, 0, 1);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(pl ? "DRGANIA KAMERY:" : "CAM JITTER:", bx, y + 39);
  const jBarX = bx + 114, jBarW = bw - 196;
  ctx.fillStyle = "rgba(10,12,24,0.85)";
  ctx.fillRect(jBarX, y + 33, jBarW, 11);
  ctx.fillStyle = jitterPct > 0.35 ? "#ef4444" : (jitterPct > 0.1 ? "#f59e0b" : "#10b981");
  ctx.fillRect(jBarX + 1, y + 34, Math.max(2, jitterPct * (jBarW - 2)), 9);
  ctx.textAlign = "right";
  ctx.fillStyle = jitterPct > 0.35 ? "#fda4af" : "#6ee7b7";
  ctx.fillText(jitterPct < 0.08 ? (pl ? "STABILNA" : "ROCK SOLID") : (pl ? "TRZĘSIE!" : "SHAKING!"), bx + bw, y + 39);

  // Forward Sightline Meter
  ctx.textAlign = "left";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(pl ? "WIDOK PRZED:" : "SIGHTLINE:", bx, y + 60);
  const leadNorm = clamp(Math.abs(st.lookAheadVal) / 4.0, 0, 1);
  ctx.fillStyle = "rgba(10,12,24,0.85)";
  ctx.fillRect(jBarX, y + 54, jBarW, 11);
  ctx.fillStyle = leadNorm > 0.25 ? "#fbbf24" : "#64748b";
  ctx.fillRect(jBarX + 1, y + 55, Math.max(2, leadNorm * (jBarW - 2)), 9);
  ctx.textAlign = "right";
  ctx.fillStyle = leadNorm > 0.25 ? "#fde047" : "#94a3b8";
  ctx.fillText(`+${Math.abs(st.lookAheadVal).toFixed(1)} m`, bx + bw, y + 60);

  // Bottom quick tip
  ctx.textAlign = "left";
  ctx.font = "700 10.5px 'Courier New', monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    pl
      ? `OMINIĘTE PIŁY: ${st.trapsDodged} · W=SKOK · SHIFT=DASH · V=TEST WIGGLE`
      : `TRAPS CLEARED: ${st.trapsDodged} · SPACE=JUMP · SHIFT=DASH · V=WIGGLE TEST`,
    bx, y + 80,
  );
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createCanyonRenderer(gl);

  let smartCam = true;      // true = Deadzone + Smooth Damping (+ optional Look-Ahead); false = Rigid Locked!
  let lookAheadOn = true;   // Toggle Look-Ahead tether independently!
  let overlayOn = true;     // Toggle 3D Deadzone box + Look-Ahead arrow!
  let playerControl = false;
  let prevPlayerControl = false;

  let time = 0;
  let trapsDodged = 0;
  let clears = 0;
  let wiggleTimer = 0;      // 1-click Micro-Wiggle demo (A-D-A-D inside Deadzone!)
  let jitterScore = 0;      // smoothed camera acceleration/direction-reversal jitter metric (0..1)
  let prevCamX = 0;
  let prevCamVx = 0;
  let banner = null;

  const sparks = [];
  const saws = SAWS_DEF.map((s) => ({ ...s, x: s.baseX, passed: false }));

  const hero = {
    x: 0.0, y: 0.0, z: 0.0,
    vx: 0, vy: 0,
    facing: 1,
    yaw: Math.PI * 0.5,
    tilt: 0,
    runPhase: 0, runAmp: 0, airBlend: 0, squash: 0,
    grounded: true,
    coyoteTimer: 0,
    dashTimer: 0, dashCooldown: 0,
    flash: [1, 1, 1, 0],
    hitTimer: 0,
    winTimer: 0,
  };

  // Camera state
  let deadCenterX = 0.0;
  let deadCenterY = 0.0;
  let lookAheadCur = 2.6;
  let camX = 2.6;
  let camY = 1.15;
  let pushingEdge = false;

  // Auto-Demo sequence: starts with a crisp Micro-Wiggle inside Deadzone, then sprints & leaps across sawblades!
  let demoPhase = "wiggle"; // "wiggle" -> "run"
  let demoClock = 0;

  function showBanner(text, bg, fg = "#ffffff", dur = 0.95) {
    banner = { text, bg, fg, timer: dur };
  }

  function spawnSparks(x, y, z, col, count = 12, sp = 3.2, lift = 2.4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.35 + Math.random() * 0.85);
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * v,
        vy: lift * (0.3 + Math.random() * 0.9),
        vz: Math.sin(a) * v * 0.5,
        r: col[0], g: col[1], b: col[2],
        life: 0.55 + Math.random() * 0.35,
        size: 0.14 + Math.random() * 0.08,
      });
    }
  }

  function resetRun(keepStats = false) {
    hero.x = 0.0; hero.y = 0.0; hero.z = 0.0;
    hero.vx = 0; hero.vy = 0; hero.facing = 1; hero.yaw = Math.PI * 0.5;
    hero.tilt = 0; hero.runPhase = 0; hero.runAmp = 0; hero.airBlend = 0; hero.squash = 0;
    hero.grounded = true; hero.coyoteTimer = 0.1; hero.dashTimer = 0; hero.dashCooldown = 0;
    hero.flash = [1, 1, 1, 0]; hero.hitTimer = 0; hero.winTimer = 0;

    deadCenterX = hero.x;
    deadCenterY = 0.0;
    lookAheadCur = 0.0;
    camX = hero.x;
    camY = 1.15;
    prevCamX = camX;
    prevCamVx = 0;
    jitterScore = 0;
    wiggleTimer = 0;
    demoPhase = "wiggle";
    demoClock = 0;
    sparks.length = 0;
    for (const s of saws) { s.x = s.baseX; s.passed = false; }
    if (!keepStats) {
      trapsDodged = 0; clears = 0; banner = null;
    }
  }
  resetRun(false);

  function doJump() {
    if (hero.hitTimer > 0 || hero.winTimer > 0) return;
    if (hero.grounded || hero.coyoteTimer > 0) {
      hero.vy = JUMP_VEL;
      hero.grounded = false;
      hero.coyoteTimer = 0;
      hero.squash = 0.78;
      spawnSparks(hero.x, 0.06, 0, [0.92, 0.74, 0.44], 8, 2.2, 1.3);
      audio?.jump?.();
    }
  }

  function doDash() {
    if (hero.hitTimer > 0 || hero.winTimer > 0 || hero.dashCooldown > 0) return;
    hero.dashTimer = 0.24;
    hero.dashCooldown = 0.65;
    hero.vx = hero.facing * DASH_SPEED;
    hero.squash = -0.35;
    spawnSparks(hero.x, 0.8, 0, [0.18, 0.90, 1.0], 12, 3.6, 1.5);
    audio?.sandDash?.();
  }

  function triggerWiggleTest() {
    wiggleTimer = 1.6;
    if (!smartCam) {
      deadCenterX = hero.x;
    } else if (Math.abs(hero.x - deadCenterX) > DZ_HALF_W - 0.5) {
      deadCenterX = hero.x;
    }
    showBanner(smartCam ? "MICRO-WIGGLE: CAM ROCK SOLID!" : "MICRO-WIGGLE: CAM SHAKING!", smartCam ? "#0284c7" : "#ef4444", "#ffffff", 1.5);
  }

  function update(dt, keys = new Set()) {
    const h = Math.min(0.035, Math.max(0.001, dt));
    time += h;
    hero.dashTimer = Math.max(0, hero.dashTimer - h);
    hero.dashCooldown = Math.max(0, hero.dashCooldown - h);
    hero.squash *= Math.exp(-12 * h);
    hero.flash[3] = Math.max(0, hero.flash[3] - h * 4.0);
    if (banner) {
      banner.timer -= h;
      if (banner.timer <= 0) banner = null;
    }

    const lt = keys.has("KeyA") || keys.has("ArrowLeft");
    const rt = keys.has("KeyD") || keys.has("ArrowRight");
    const dashKey = keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (lt || rt || dashKey) {
      playerControl = true;
      wiggleTimer = 0;
    }
    if (playerControl !== prevPlayerControl) {
      prevPlayerControl = playerControl;
      requestHudRefresh?.();
    }

    if (dashKey && hero.dashCooldown <= 0) doDash();

    // Update spinning patrolling sawblades
    for (const s of saws) {
      s.x = s.baseX + Math.sin(time * s.spd + s.phase) * s.amp;
    }

    if (hero.hitTimer > 0) {
      hero.hitTimer -= h;
      hero.vx *= Math.exp(-8 * h);
      if (hero.hitTimer <= 0) resetRun(true);
    } else if (hero.winTimer > 0) {
      hero.winTimer -= h;
      hero.vx *= Math.exp(-8 * h);
      hero.yaw += (0 - hero.yaw) * Math.min(1, h * 7);
      if (hero.winTimer <= 0) resetRun(true);
    } else {
      let moveDir = 0;
      if (wiggleTimer > 0) {
        // Rapid left-right micro-steps inside the ±1.65m Deadzone window!
        wiggleTimer -= h;
        moveDir = Math.sin(wiggleTimer * 12.5) > 0 ? 1 : -1;
        // Clamp wiggle strictly inside the Deadzone so Smart Cam stays 100.0% still while Rigid Cam shakes wildly!
        if (hero.x > deadCenterX + DZ_HALF_W - 0.35) moveDir = -1;
        if (hero.x < deadCenterX - DZ_HALF_W + 0.35) moveDir = 1;
      } else if (playerControl) {
        moveDir = (rt ? 1 : 0) - (lt ? 1 : 0);
      } else {
        // Auto-Demo: 1.6s micro-wiggle demonstration inside Deadzone -> then sprint & leap over all 6 sawblades!
        demoClock += h;
        if (demoPhase === "wiggle") {
          moveDir = Math.sin(demoClock * 11.5) > 0 ? 1 : -1;
          if (hero.x > deadCenterX + DZ_HALF_W - 0.35) moveDir = -1;
          if (hero.x < deadCenterX - DZ_HALF_W + 0.35) moveDir = 1;
          if (demoClock > 1.75) { demoPhase = "run"; }
        } else {
          moveDir = 1;
          // Auto-leap cleanly over approaching sawblade!
          for (const s of saws) {
            const dx = s.x - hero.x;
            if (dx > 0.7 && dx < 2.25 && hero.grounded) {
              doJump();
              break;
            }
          }
        }
      }

      if (moveDir !== 0) hero.facing = moveDir;

      if (hero.dashTimer <= 0) {
        const targetVx = moveDir * (wiggleTimer > 0 || demoPhase === "wiggle" ? 5.2 : RUN_SPEED);
        hero.vx += (targetVx - hero.vx) * (1 - Math.exp(-16 * h));
      }

      if (!hero.grounded) {
        hero.vy -= GRAVITY * h;
        hero.coyoteTimer = Math.max(0, hero.coyoteTimer - h);
      } else {
        hero.coyoteTimer = 0.10;
      }

      hero.x = clamp(hero.x + hero.vx * h, COURSE_MIN_X, COURSE_MAX_X);
      hero.y += hero.vy * h;
      if (hero.y <= 0) {
        if (!hero.grounded) {
          hero.squash = -0.58;
          spawnSparks(hero.x, 0.05, 0, [0.88, 0.68, 0.40], 6, 1.8, 0.9);
          audio?.land?.();
        }
        hero.y = 0;
        hero.vy = 0;
        hero.grounded = true;
      }

      // Check sawblade clearance / collision
      for (const s of saws) {
        if (!s.passed && hero.x > s.x + 1.0) {
          s.passed = true;
          trapsDodged++;
        }
        if (Math.hypot(hero.x - s.x, (hero.y + 0.65) - 0.82) < 0.88) {
          hero.hitTimer = 0.75;
          hero.vx = -hero.facing * 6.0;
          hero.vy = 4.5;
          hero.grounded = false;
          hero.flash = [1.0, 0.18, 0.22, 1.0];
          spawnSparks(hero.x, hero.y + 0.8, 0, [1.0, 0.24, 0.24], 16, 4.5, 3.0);
          showBanner("HIT SAWBLADE!", "#ef4444", "#ffffff", 0.8);
          audio?.playerHurt?.();
          break;
        }
      }

      // Finish Temple Archway!
      if (hero.x >= GOAL_X) {
        clears++;
        hero.winTimer = 1.5;
        spawnSparks(GOAL_X, 2.2, 0, [1.0, 0.82, 0.22], 24, 4.8, 3.8);
        showBanner(`GAUNTLET CLEARED! (#${clears})`, "#f59e0b", "#1c1204", 1.4);
        audio?.goalWin?.();
        requestHudRefresh?.();
      }

      const targetYaw = hero.facing > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      hero.yaw += (targetYaw - hero.yaw) * (1 - Math.exp(-15 * h));
      const spdNorm = Math.min(1, Math.abs(hero.vx) / RUN_SPEED);
      hero.tilt += ((hero.grounded ? 0.18 * spdNorm : clamp(-hero.vy * 0.02, -0.18, 0.22)) - hero.tilt) * (1 - Math.exp(-10 * h));
      hero.runAmp += ((hero.grounded ? spdNorm : 0) - hero.runAmp) * (1 - Math.exp(-12 * h));
      hero.airBlend += ((hero.grounded ? 0 : 1) - hero.airBlend) * (1 - Math.exp(-14 * h));
      if (hero.runAmp > 0.02) hero.runPhase += h * (4.5 + Math.abs(hero.vx) * 1.45);
    }

    // ===== CAMERA ENGINE: SMART (DEADZONE + LOOK-AHEAD + DAMPING) vs RIGID LOCKED! =====
    pushingEdge = false;
    if (smartCam) {
      // 1) Horizontal Deadzone: camera anchor ONLY moves if hero pushes outside [deadCenterX ± DZ_HALF_W]!
      if (hero.x > deadCenterX + DZ_HALF_W) {
        deadCenterX = hero.x - DZ_HALF_W;
        pushingEdge = true;
      } else if (hero.x < deadCenterX - DZ_HALF_W) {
        deadCenterX = hero.x + DZ_HALF_W;
        pushingEdge = true;
      }
      // 2) Vertical Deadzone: jumps under DZ_HEIGHT don't yank horizon!
      if (hero.y > deadCenterY + DZ_HEIGHT) deadCenterY = hero.y - DZ_HEIGHT;
      else if (hero.y < deadCenterY) deadCenterY = hero.y;

      // 3) Smooth Look-Ahead Tether: compensates Deadzone offset + damping so camera leads +2.8..+4.2m AHEAD of runner!
      const isWiggling = wiggleTimer > 0 || (!playerControl && demoPhase === "wiggle");
      if (!isWiggling) {
        const desiredLead = lookAheadOn
          ? hero.facing * (DZ_HALF_W + 3.85 + (hero.dashTimer > 0 ? 1.8 : 0))
          : 0.0;
        lookAheadCur += (desiredLead - lookAheadCur) * (1 - Math.exp(-3.8 * h));
      }

      const targetCamX = clamp(deadCenterX + lookAheadCur, -1.5, 56.5);
      const targetCamY = 1.15 + deadCenterY * 0.45;
      camX += (targetCamX - camX) * (1 - Math.exp(-8.2 * h));
      camY += (targetCamY - camY) * (1 - Math.exp(-5.0 * h));
    } else {
      // RIGID LOCKED (NAIVE): glued 1:1 to hero — zero deadzone, zero damping, zero look-ahead!
      deadCenterX = hero.x;
      deadCenterY = hero.y;
      lookAheadCur = 0.0;
      camX = hero.x;
      camY = 1.15 + hero.y;
    }

    // Measure live Camera Jitter (rapid velocity reversals / jerk!)
    const camVx = (camX - prevCamX) / h;
    const camAccel = Math.abs(camVx - prevCamVx) / h;
    const jerkNorm = clamp((camAccel - 14.0) / 48.0, 0, 1);
    jitterScore = Math.max(jitterScore * Math.exp(-3.2 * h), jerkNorm);
    prevCamX = camX;
    prevCamVx = camVx;

    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx * h; sp.y += sp.vy * h; sp.z += sp.vz * h;
      sp.vy -= 10.0 * h;
      sp.life -= h * 1.5;
      if (sp.life <= 0) sparks.splice(i, 1);
    }
  }

  function getCameraOverride() {
    return {
      yaw: 0.04,
      pitch: 0.21,
      dist: 15.6,
      targetX: camX,
      targetY: camY,
      targetZ: 0.0,
      fovDeg: 38,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    const deadBox = {
      x0: deadCenterX - DZ_HALF_W,
      x1: deadCenterX + DZ_HALF_W,
      y0: 0.02 + deadCenterY,
      y1: DZ_HEIGHT + deadCenterY,
      pushingEdge,
    };

    const { viewProj } = renderer.render({
      w, h, cam, time, hero, saws,
      overlayOn,
      smartCam,
      deadBox,
      camTarget: { x: camX, y: camY },
      jitterAlert: smartCam ? 0 : jitterScore,
      sparks,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const noHud = typeof document !== "undefined" && document.body.classList.contains("no-hud");
      if (!noHud) {
        drawCameraTelemetryHud(ovCtx, ow, {
          smartCam, lookAheadOn, jitterScore,
          lookAheadVal: camX - hero.x,
          trapsDodged,
        }, lang);
      }

      if (overlayOn) {
        // Label the 3D Deadzone Window & Camera Target Reticle cleanly in world space!
        if (smartCam) {
          const pBox = projectPoint([deadCenterX, deadBox.y1 + 0.35, 0.85], viewProj, ow, oh);
          if (pBox) {
            drawBadge(
              ovCtx, pBox.x, pBox.y,
              pushingEdge
                ? (lang === "pl" ? "DEADZONE (PRZESUWA)" : "DEADZONE (TRACKING)")
                : (lang === "pl" ? "DEADZONE (KAMERA STOI)" : "DEADZONE (CAM LOCKED STILL)"),
              pushingEdge ? "#d97706" : "rgba(8,66,94,0.92)",
              pushingEdge ? "#ffffff" : "#7dd3fc",
              ow,
            );
          }
        }
        const pCam = projectPoint([camX, camY + 0.95, 0.4], viewProj, ow, oh);
        if (pCam && (smartCam && Math.abs(camX - hero.x) > 1.2)) {
          drawBadge(
            ovCtx, pCam.x, pCam.y,
            lang === "pl" ? `LOOK-AHEAD (+${Math.abs(camX - hero.x).toFixed(1)}m)` : `LOOK-AHEAD (+${Math.abs(camX - hero.x).toFixed(1)}m)`,
            "#f59e0b", "#1c1204", ow,
          );
        } else if (!smartCam) {
          const pLock = projectPoint([camX, Math.max(0, hero.y) - 0.55, 0.5], viewProj, ow, oh);
          if (pLock) {
            drawBadge(
              ovCtx, pLock.x, pLock.y,
              lang === "pl" ? "KAMERA PRZYKLEJONA (0 DEADZONE)" : "RIGID LOCK (0 DEADZONE)",
              "#ef4444", "#ffffff", ow,
            );
          }
        }
      }

      if (banner) {
        const pb = projectPoint([hero.x, hero.y + 2.75, 0], viewProj, ow, oh);
        if (pb) drawBadge(ovCtx, pb.x, pb.y, banner.text, banner.bg, banner.fg, ow);
      }
    }
  }

  return {
    id: "camera-deadzone",
    defaultCam: { yaw: 0.04, pitch: 0.21, dist: 15.6, targetX: 2.6, targetY: 1.15, targetZ: 0.0, fovDeg: 38 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "smart", label: pl ? "Smart Cam (Deadzone)" : "Smart Cam (Deadzone)", pressed: smartCam },
        { id: "rigid", label: pl ? "Sztywna (Locked)" : "Rigid Locked (Naive)", pressed: !smartCam },
        { id: "lead", label: lookAheadOn ? (pl ? "Look-Ahead: WŁ" : "Look-Ahead: ON") : (pl ? "Look-Ahead: WYŁ" : "Look-Ahead: OFF"), pressed: smartCam && lookAheadOn },
        { id: "overlay", label: overlayOn ? (pl ? "Siatka: WŁ" : "Overlay: ON") : (pl ? "Siatka: WYŁ" : "Overlay: OFF"), pressed: overlayOn },
        { id: "wiggle", label: pl ? "Test Wiggle (V)" : "Wiggle Test (V)", pressed: wiggleTimer > 0 },
      ];
    },
    onAction(id) {
      if (id === "smart") { smartCam = true; deadCenterX = hero.x; }
      if (id === "rigid") { smartCam = false; }
      if (id === "lead") { lookAheadOn = !lookAheadOn; }
      if (id === "overlay") { overlayOn = !overlayOn; }
      if (id === "wiggle") { triggerWiggleTest(); }
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space" || code === "KeyW" || code === "ArrowUp") { playerControl = true; doJump(); }
      if (code === "KeyT") { smartCam = !smartCam; deadCenterX = hero.x; }
      if (code === "KeyL") { lookAheadOn = !lookAheadOn; }
      if (code === "KeyX") { overlayOn = !overlayOn; }
      if (code === "KeyV") { triggerWiggleTest(); }
    },
    onClickWorld(_world, { button }) {
      if (button === 0) { playerControl = true; doJump(); }
    },
    getDebugState() {
      return {
        smartCam,
        lookAheadOn,
        overlayOn,
        heroX: +hero.x.toFixed(2),
        camX: +camX.toFixed(2),
        lookAheadDelta: +(camX - hero.x).toFixed(2),
        jitterScore: +jitterScore.toFixed(3),
        trapsDodged,
        clears,
      };
    },
    reset: () => resetRun(false),
    update,
    render,
  };
}
