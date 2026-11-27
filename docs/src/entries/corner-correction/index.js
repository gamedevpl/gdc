// Entry #31: Corner Correction & Ceiling Nudge — Playable 3D Platformer Chimney!
// Shows why great 2D/3D platformers (Celeste, Mario, Hollow Knight) feel psychic when jumping up shafts:
// Twin upward head-probe rays detect an outer-corner graze (inner probe open!) and smoothly nudge the hero
// laterally past the stone lip instead of bonking your skull on a 2-pixel overhang!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const GAP_L = -0.75;
const GAP_R =  0.75;
const CEIL_BOT = 2.35;
const CEIL_TOP = 2.95;
const HEAD_H = 1.50;
const HALF_W = 0.34;
const NUDGE_MAX = 0.42;
const GRAVITY = 17.5;
const JUMP_VY = 9.45;
const CRYSTAL_Y = 4.15;

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.03, 0.06, 0.14],
    skyMid: [0.07, 0.13, 0.25],
    skyBot: [0.14, 0.20, 0.32],
    lightDir: [0.34, 0.86, 0.40],
    ambLow: [0.11, 0.16, 0.25],
    ambHigh: [0.36, 0.45, 0.60],
    orthoHalf: 10.6,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Twilight Stone Platformer Chamber with Central Jump Chimney, Glowing Corner Lips & Goal Crystal!
  const wBuf = [];
  // Lower chamber tiled floor
  pushBox(wBuf, -6.8, 6.8, -0.55, 0.0, -3.1, 3.1, [0.19, 0.25, 0.36], 0);
  // Subtle hazard/nudge launch strips on floor beneath the two ceiling corner lips
  pushBox(wBuf, -1.25, GAP_L, 0.0, 0.035, -1.35, 1.35, [0.98, 0.72, 0.14], 5);
  pushBox(wBuf, GAP_R,  1.25, 0.0, 0.035, -1.35, 1.35, [0.98, 0.72, 0.14], 5);
  pushBox(wBuf, GAP_L, GAP_R, 0.0, 0.030, -1.35, 1.35, [0.14, 0.88, 0.96], 2);

  // Outer chamber stone columns supporting the upper ceiling slabs
  for (const sx of [-5.4, 4.7]) {
    pushBox(wBuf, sx, sx + 0.75, 0.0, CEIL_BOT, -1.55, 1.15, [0.32, 0.37, 0.48], 1);
  }
  // Background twilight temple pillars flanking the central open shaft
  for (const bx of [-4.2, -2.0, 2.0, 4.2]) {
    pushBox(wBuf, bx - 0.30, bx + 0.30, 0.0, 4.5, -3.0, -2.45, [0.24, 0.30, 0.42], 1);
    pushBox(wBuf, bx - 0.40, bx + 0.40, 4.4, 4.65, -3.08, -2.38, [0.34, 0.42, 0.56], 1);
  }

  // Left Upper Ceiling Slab (x = -5.8 .. -0.75, y = 2.35 .. 2.95)
  pushBox(wBuf, -5.8, GAP_L, CEIL_BOT, CEIL_TOP, -1.65, 1.65, [0.40, 0.47, 0.59], 1);
  pushBox(wBuf, -5.82, GAP_L + 0.01, CEIL_TOP - 0.07, CEIL_TOP + 0.01, -1.68, 1.68, [0.28, 0.37, 0.50], 0);

  // Right Upper Ceiling Slab (x = +0.75 .. +5.8, y = 2.35 .. 2.95)
  pushBox(wBuf, GAP_R, 5.8, CEIL_BOT, CEIL_TOP, -1.65, 1.65, [0.40, 0.47, 0.59], 1);
  pushBox(wBuf, GAP_R - 0.01, 5.82, CEIL_TOP - 0.07, CEIL_TOP + 0.01, -1.68, 1.68, [0.28, 0.37, 0.50], 0);

  // Glowing Cyan/Amber Corner Nudge Highlight Lips on inner bottom ceiling corners!
  pushBox(wBuf, GAP_L - 0.38, GAP_L + 0.02, CEIL_BOT - 0.02, CEIL_BOT + 0.16, -1.69, 1.69, [0.16, 0.90, 1.0], 2);
  pushBox(wBuf, GAP_L - 0.11, GAP_L + 0.03, CEIL_BOT - 0.03, CEIL_BOT + 0.24, -1.71, 1.71, [1.0, 0.76, 0.16], 2);

  pushBox(wBuf, GAP_R - 0.02, GAP_R + 0.38, CEIL_BOT - 0.02, CEIL_BOT + 0.16, -1.69, 1.69, [0.16, 0.90, 1.0], 2);
  pushBox(wBuf, GAP_R - 0.03, GAP_R + 0.11, CEIL_BOT - 0.03, CEIL_BOT + 0.24, -1.71, 1.71, [1.0, 0.76, 0.16], 2);

  // Golden Goal Crystal suspended triumphantly above the vertical chimney shaft!
  pushBox(wBuf, -0.24, 0.24, CRYSTAL_Y - 0.30, CRYSTAL_Y + 0.30, -0.24, 0.24, [1.0, 0.82, 0.18], 2);
  pushBox(wBuf, -0.15, 0.15, CRYSTAL_Y - 0.48, CRYSTAL_Y + 0.48, -0.15, 0.15, [1.0, 0.92, 0.44], 2);
  pushBox(wBuf, -0.34, 0.34, CRYSTAL_Y - 0.10, CRYSTAL_Y + 0.10, -0.34, 0.34, [1.0, 0.74, 0.12], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.24, dist: 14.2, targetX: 0.0, targetY: 1.65, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let nudgeOn = true; // ON: Corner Correction slides hero past 35cm graze | OFF: Strict head-bonk!
  let autoDemo = true;
  let userInteracted = false;
  let demoSide = -1; // alternates left (-1) and right (+1) corner grazes
  let demoState = "LAUNCH"; // LAUNCH | AIR | UPPER_WAIT | DROP | APPROACH
  let demoTimer = 0;

  const player = {
    x: -0.71,
    y: 0.0,
    vx: 0,
    vy: 0,
    yaw: Math.PI * 0.5,
    grounded: true,
    walkPhase: 0,
    speedNorm: 0,
    status: "READY", // READY | RISING | NUDGED | BONKED | GOAL
    nudges: 0,
    bonks: 0,
    goals: 0,
    lastNudgeCm: 28,
    nudgeFlash: 0,
    nudgeFromX: 0,
    nudgeToX: 0,
    bonkFlash: 0,
    goalFlash: 0,
    leftBlocked: false,
    rightBlocked: false,
    crystalHitThisJump: false,
  };

  let bannerText = "";
  let bannerColor = "#22d3ee";
  let bannerTimer = 0;
  function setBanner(t, c = "#22d3ee", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function doJump(silent = false) {
    if (!player.grounded) return;
    player.vy = JUMP_VY;
    player.grounded = false;
    player.crystalHitThisJump = false;
    player.status = "RISING";
    if (!silent && userInteracted) audio?.jump?.();
  }

  function startGrazeTest({ side = null, silent = false } = {}) {
    if (side != null) demoSide = side;
    else demoSide = -demoSide;
    // Place hero right under the ceiling corner (~0.28m–0.30m graze overlap!) and immediately leap!
    const grazeX = demoSide < 0 ? (GAP_L + 0.04) : (GAP_R - 0.04); // -0.71 or +0.71 -> outer probe overlaps slab by 0.30m!
    player.x = grazeX;
    player.y = 0.0;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.yaw = demoSide < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    player.nudgeFlash = 0;
    player.bonkFlash = 0;
    doJump(silent);
    if (!silent) {
      setBanner(
        nudgeOn
          ? "GRAZE TEST: TWIN PROBES DETECT CORNER → SMOOTH NUDGE THROUGH SHAFT! ✓"
          : "GRAZE TEST (STRICT OFF): 2-PIXEL CORNER HIT → INSTANT HEAD BONK! ✗",
        nudgeOn ? "#22d3ee" : "#f87171",
        2.0
      );
    }
  }

  function reset() {
    time = 0;
    autoDemo = true;
    demoSide = -1;
    demoState = "LAUNCH";
    demoTimer = 0.08; // Launches almost immediately so the nudge happens by ~0.25s and hero soars by 0.65s!
    player.x = GAP_L + 0.04; // -0.71m: outer left probe at -1.05m overlaps left slab (-0.75) by 30cm!
    player.y = 0.0;
    player.vx = 0;
    player.vy = 0;
    player.yaw = Math.PI * 0.5;
    player.grounded = true;
    player.walkPhase = 0;
    player.speedNorm = 0;
    player.status = "READY";
    player.nudges = 0;
    player.bonks = 0;
    player.goals = 0;
    player.lastNudgeCm = 30;
    player.nudgeFlash = 0;
    player.bonkFlash = 0;
    player.goalFlash = 0;
    player.crystalHitThisJump = false;
    bannerTimer = 0;
  }
  reset();

  function update(dt, keys) {
    const sdt = Math.min(dt || 0.016, 0.05);
    time += sdt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - sdt);
    if (player.nudgeFlash > 0) player.nudgeFlash = Math.max(0, player.nudgeFlash - sdt * 1.15);
    if (player.bonkFlash > 0) player.bonkFlash = Math.max(0, player.bonkFlash - sdt * 1.45);
    if (player.goalFlash > 0) player.goalFlash = Math.max(0, player.goalFlash - sdt * 1.25);

    let dir = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) dir -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) dir += 1;
    if (dir !== 0) {
      autoDemo = false;
      userInteracted = true;
    }

    // Continuous showcase auto-demo cycling left & right corner grazes
    if (autoDemo) {
      if (demoState === "LAUNCH") {
        demoTimer -= sdt;
        if (demoTimer <= 0) {
          doJump(true);
          demoState = "AIR";
          demoTimer = 0;
        }
      } else if (demoState === "AIR") {
        // After clearing the ceiling onto the upper zone, drift lightly onto the slab to land cleanly
        if (player.y > CEIL_TOP + 0.15) {
          dir = demoSide < 0 ? -0.45 : 0.45;
        }
        if (player.grounded) {
          demoState = player.y >= CEIL_TOP - 0.05 ? "UPPER_WAIT" : "RECOVER_LOW";
          demoTimer = player.y >= CEIL_TOP - 0.05 ? 0.75 : 0.65;
        }
      } else if (demoState === "UPPER_WAIT") {
        demoTimer -= sdt;
        if (demoTimer <= 0) demoState = "DROP";
      } else if (demoState === "DROP") {
        // Walk back into the shaft center to drop gracefully to the lower floor
        if (Math.abs(player.x) > 0.12) dir = player.x > 0 ? -0.85 : 0.85;
        if (player.grounded && player.y < 0.2) {
          demoSide = -demoSide;
          demoState = "APPROACH";
        }
      } else if (demoState === "RECOVER_LOW") {
        demoTimer -= sdt;
        if (demoTimer <= 0) {
          demoSide = -demoSide;
          demoState = "APPROACH";
        }
      } else if (demoState === "APPROACH") {
        const targetX = demoSide < 0 ? (GAP_L + 0.04) : (GAP_R - 0.04);
        const dx = targetX - player.x;
        if (Math.abs(dx) > 0.06) {
          dir = clamp(dx * 2.2, -0.85, 0.85);
        } else {
          player.x = targetX;
          demoState = "LAUNCH";
          demoTimer = 0.22;
        }
      }
    }

    const moveSpeed = 4.25;
    player.vx = dir * moveSpeed;
    const prevX = player.x;
    const prevY = player.y;
    let nextX = clamp(prevX + player.vx * sdt, -5.0, 5.0);

    // Side-wall containment when hero is vertically inside the stone ceiling thickness!
    const inSlabBand = (prevY + HEAD_H > CEIL_BOT + 0.08) && (prevY < CEIL_TOP - 0.05);
    if (inSlabBand) {
      if (prevX >= GAP_L + HALF_W - 0.06 && prevX <= GAP_R - HALF_W + 0.06) {
        nextX = clamp(nextX, GAP_L + HALF_W, GAP_R - HALF_W);
      }
    }
    player.x = nextX;

    // Step off upper floor into the shaft cleanly
    const overLeftSlab = (player.x - HALF_W) < GAP_L;
    const overRightSlab = (player.x + HALF_W) > GAP_R;
    const overUpperFloor = overLeftSlab || overRightSlab;
    if (player.grounded && player.y >= CEIL_TOP - 0.05 && !overUpperFloor) {
      player.grounded = false;
    }

    // Vertical physics
    if (!player.grounded) {
      player.vy -= GRAVITY * sdt;
      let nextY = prevY + player.vy * sdt;
      const prevHead = prevY + HEAD_H;
      const nextHead = nextY + HEAD_H;

      // Upward ceiling / corner correction check!
      const xL = player.x - HALF_W;
      const xR = player.x + HALF_W;
      const hitLeftSlab = xL < GAP_L;
      const hitRightSlab = xR > GAP_R;

      if (player.vy > 0 && prevHead <= CEIL_BOT + 0.14 && nextHead >= CEIL_BOT && (hitLeftSlab || hitRightSlab)) {
        const leftPen = hitLeftSlab ? (GAP_L - xL) : 0;
        const rightPen = hitRightSlab ? (xR - GAP_R) : 0;
        const canNudgeRight = hitLeftSlab && !hitRightSlab && xR > GAP_L && leftPen <= NUDGE_MAX;
        const canNudgeLeft = hitRightSlab && !hitLeftSlab && xL < GAP_R && rightPen <= NUDGE_MAX;

        if (nudgeOn && (canNudgeRight || canNudgeLeft)) {
          // CORNER CORRECTION! Slide laterally past the ceiling corner while preserving 100% upward velocity!
          const pen = canNudgeRight ? leftPen : rightPen;
          player.nudgeFromX = player.x;
          player.x = canNudgeRight ? (GAP_L + HALF_W + 0.03) : (GAP_R - HALF_W - 0.03);
          player.nudgeToX = player.x;
          player.lastNudgeCm = Math.max(8, Math.round(pen * 100));
          player.nudgeFlash = 1.0;
          player.status = "NUDGED";
          player.nudges++;
          if (userInteracted) audio?.coyoteSave?.();
        } else {
          // STRICT BONK! Zero upward velocity and drop straight back down!
          nextY = CEIL_BOT - HEAD_H;
          player.vy = -0.85;
          player.bonkFlash = 1.0;
          player.status = "BONKED";
          player.bonks++;
          if (userInteracted) audio?.inputIgnored?.();
        }
      }

      // Check golden goal crystal touch above the shaft!
      if (!player.crystalHitThisJump && Math.abs(player.x) < 0.85 && nextY + HEAD_H >= CRYSTAL_Y - 0.42) {
        player.crystalHitThisJump = true;
        player.goals++;
        player.goalFlash = 1.0;
        if (player.status !== "NUDGED") player.status = "GOAL";
        if (userInteracted) audio?.coinPickup?.();
      }

      // Landing on upper floor slabs
      const landedUpper = player.vy <= 0 && prevY >= CEIL_TOP - 0.08 && nextY <= CEIL_TOP && ((player.x - HALF_W) < GAP_L || (player.x + HALF_W) > GAP_R);
      if (landedUpper) {
        nextY = CEIL_TOP;
        player.vy = 0;
        player.grounded = true;
        if (userInteracted) audio?.land?.();
      } else if (nextY <= 0.0) {
        nextY = 0.0;
        player.vy = 0;
        player.grounded = true;
        if (player.bonkFlash < 0.25 && player.nudgeFlash < 0.25) player.status = "READY";
        if (userInteracted) audio?.land?.();
      }
      player.y = nextY;
    }

    // Update live twin upward head-probe readings for rendering & HUD!
    const xL = player.x - HALF_W;
    const xR = player.x + HALF_W;
    const belowCeil = (player.y + HEAD_H) <= CEIL_TOP - 0.05;
    player.leftBlocked = belowCeil && xL < GAP_L;
    player.rightBlocked = belowCeil && xR > GAP_R;

    // Facing & locomotion animation
    if (Math.abs(dir) > 0.08) {
      player.yaw = dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      player.walkPhase += sdt * (player.grounded ? 11.0 : 5.0);
      player.speedNorm = player.grounded ? Math.min(1, Math.abs(dir)) : 0.35;
    } else {
      player.speedNorm = player.grounded ? 0.0 : 0.22;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Static world callouts for the Corner Nudge lips & chimney goal
      const lp = projectToScreen(viewProj, GAP_L - 0.65, CEIL_BOT + 0.58, 1.55, cssW, cssH);
      if (lp) {
        drawWorldPill(
          ctx, lp.x, lp.y,
          nudgeOn ? (isPl ? "STREFA NUDGE (35cm)" : "CORNER NUDGE LIP (35cm)") : (isPl ? "TWARDY RÓG (BONK!)" : "HARD CORNER (BONK!)"),
          nudgeOn ? "#22d3ee" : "#fb7185",
          cssW, cssH, isCompact ? 8.5 : 9.5
        );
      }
      const gp = projectToScreen(viewProj, 0.0, CRYSTAL_Y + 0.72, 0.0, cssW, cssH);
      if (gp) {
        const safeGx = (!isCompact && !document.body.classList.contains("no-hud") && gp.y < 235) ? Math.min(gp.x, cssW - 390) : gp.x;
        drawWorldPill(ctx, safeGx, gp.y, isPl ? "KRYSZTAŁ CELU ★" : "CHIMNEY GOAL ★", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Live Hero Status Pill
      const hp = projectToScreen(viewProj, player.x, player.y + HEAD_H + 0.58, 0.0, cssW, cssH);
      if (hp) {
        let txt = isPl ? "A/D RUCH · SPACJA SKOK" : "A/D MOVE · SPACE JUMP";
        let col = "#e2e8f0";
        if (player.nudgeFlash > 0.15) {
          txt = isPl ? `KOREKTA ROGU! +${(player.lastNudgeCm / 100).toFixed(2)}m ✓` : `CORNER NUDGE! +${(player.lastNudgeCm / 100).toFixed(2)}m ✓`;
          col = "#22d3ee";
        } else if (player.bonkFlash > 0.15) {
          txt = isPl ? "BONK! UDERZENIE GŁOWĄ ✗" : "BONK! HEAD HIT ✗";
          col = "#f87171";
        } else if (player.goalFlash > 0.15) {
          txt = isPl ? "CZYSTE PRZEJŚCIE PRZEZ KOMIN! ★" : "CLEAN SHAFT CLEAR! ★";
          col = "#facc15";
        } else if (!player.grounded) {
          txt = (player.leftBlocked !== player.rightBlocked)
            ? (isPl ? "SONDY GŁOWY: 1 BLOK · 1 WOLNA!" : "HEAD PROBES: 1 BLOCKED · 1 OPEN!")
            : (isPl ? "SKOK W GÓRĘ…" : "JUMPING UP…");
          col = (player.leftBlocked !== player.rightBlocked) ? "#fde047" : "#93c5fd";
        }
        const safeHx = (!isCompact && !document.body.classList.contains("no-hud") && hp.y < 235) ? Math.min(hp.x, cssW - 390) : hp.x;
        drawWorldPill(ctx, safeHx, hp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${nudgeOn ? "CORNER NUDGE: ON" : "STRICT BONK"} · Nudges ${player.nudges} · Bonks ${player.bonks}`,
          nudgeOn ? "#22d3ee" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 330, panelH = 166, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 14, 28, 0.90)";
        ctx.strokeStyle = nudgeOn ? "rgba(34, 211, 238, 0.84)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = nudgeOn ? "#22d3ee" : "#f87171";
        ctx.fillText(
          nudgeOn
            ? (isPl ? "CORNER NUDGE: WŁ · TOLERANCJA ±35cm" : "CORNER NUDGE: ON · ±35cm GRAZE SLIDE")
            : (isPl ? "STRICT BOX: WYŁ · TWARDY SUFIT 0cm!" : "STRICT BOX: OFF · 0cm FORGIVENESS!"),
          px + 12, py + 21, bw
        );

        // Twin Head-Probe live indicator bar
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 18, 4); ctx.fill();
        const halfBar = (bw - 6) * 0.5;
        ctx.fillStyle = player.leftBlocked ? "#ef4444" : "#22c55e";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, halfBar, 18, 4); ctx.fill();
        ctx.fillStyle = player.rightBlocked ? "#ef4444" : "#22c55e";
        ctx.beginPath(); ctx.roundRect(px + 18 + halfBar, py + 34, halfBar, 18, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(player.leftBlocked ? (isPl ? "L-SONDA: SUFIT" : "L-PROBE: HIT") : (isPl ? "L-SONDA: WOLNA" : "L-PROBE: OPEN"), px + 12 + halfBar * 0.5, py + 46.5, halfBar - 6);
        ctx.fillText(player.rightBlocked ? (isPl ? "P-SONDA: SUFIT" : "R-PROBE: HIT") : (isPl ? "P-SONDA: WOLNA" : "R-PROBE: OPEN"), px + 18 + halfBar * 1.5, py + 46.5, halfBar - 6);

        ctx.textAlign = "left";
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? `Korekty rogu (Nudges): ${player.nudges} · Ostatni: +${player.lastNudgeCm}cm` : `Corner Nudges: ${player.nudges} · Last Slide: +${player.lastNudgeCm}cm`, px + 12, py + 76, bw);
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Uderzenia głową (Bonks): ${player.bonks} · Kryształy: ${player.goals}` : `Head Bonks: ${player.bonks} · Crystals Cleared: ${player.goals}`, px + 12, py + 98, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "V = Test Otarcia · Spacja/W = Skok · A/D = Ruch" : "V = Graze Test · Space/W = Jump · A/D = Move", px + 12, py + 124, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "T = Korekta Rogu WŁ / Strict Bonk WYŁ" : "T = Corner Nudge ON / Strict Bonk OFF", px + 12, py + 148, bw);
        ctx.restore();
      }
    }
    drawBanner(ctx, bannerText, bannerColor, bannerTimer, cssW);
  }

  return {
    defaultCam,
    reset,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        {
          id: "toggle-nudge",
          label: nudgeOn
            ? (pl ? "Korekta Rogu: WŁ [T]" : "Corner Nudge: ON [T]")
            : (pl ? "Strict Bonk (WYŁ) [T]" : "Strict Bonk (OFF) [T]"),
          pressed: nudgeOn,
        },
        {
          id: "graze",
          label: pl ? "Test Otarcia [V]" : "Graze Test [V]",
          pressed: player.nudgeFlash > 0.25 || player.bonkFlash > 0.25,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-nudge") {
        nudgeOn = !nudgeOn;
        audio?.ruleSwitch?.(nudgeOn);
        autoDemo = true;
        demoState = "AIR";
        startGrazeTest({ side: -1, silent: false });
      } else if (id === "graze") {
        autoDemo = false;
        startGrazeTest({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-nudge");
      else if (code === "KeyV") this.onAction("graze");
      else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
        userInteracted = true;
        autoDemo = false;
        doJump(false);
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const tint = player.bonkFlash > 0.1
        ? [1.0, 0.18, 0.24, player.bonkFlash * 0.78]
        : (player.nudgeFlash > 0.1
            ? [0.16, 0.94, 1.0, player.nudgeFlash * 0.55]
            : [1, 1, 1, 0]);

      const meshes = [
        {
          gpu: runnerGpu,
          x: player.x,
          y: player.y,
          z: 0.0,
          yaw: player.yaw,
          animA: player.walkPhase,
          animB: player.speedNorm,
          scale: 0.92,
          animMode: 2,
          tint,
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Highlight the two Corner Nudge detection lips in 3D X-Ray!
          const lipCol = nudgeOn ? [0.16, 0.92, 1.0, 0.65] : [1.0, 0.26, 0.32, 0.42];
          fx.xrayBox(GAP_L - 0.38, GAP_L, CEIL_BOT - 0.04, CEIL_BOT + 0.22, -1.35, 1.35, lipCol);
          fx.xrayBox(GAP_R, GAP_R + 0.38, CEIL_BOT - 0.04, CEIL_BOT + 0.22, -1.35, 1.35, lipCol);

          // Twin upward head-probe laser rays (tiny +0.002 Z offset gives crisp camera-facing width!)
          const headY = player.y + HEAD_H - 0.08;
          const rayLen = 0.95;
          const xL = player.x - HALF_W;
          const xR = player.x + HALF_W;
          const topL = player.leftBlocked ? Math.min(headY + rayLen, CEIL_BOT) : (headY + rayLen);
          const topR = player.rightBlocked ? Math.min(headY + rayLen, CEIL_BOT) : (headY + rayLen);

          const colL = player.leftBlocked ? [1.0, 0.32, 0.24, 0.94] : [0.16, 0.98, 0.72, 0.90];
          const colR = player.rightBlocked ? [1.0, 0.32, 0.24, 0.94] : [0.16, 0.98, 0.72, 0.90];

          fx.beam(xL, headY, 0.06, xL, Math.max(headY + 0.12, topL), 0.062, 0.09, colL, 0);
          fx.beam(xR, headY, 0.06, xR, Math.max(headY + 0.12, topR), 0.062, 0.09, colR, 0);
          fx.billboard(xL, Math.max(headY + 0.12, topL), 0.06, 0.16, basis.right, basis.up, colL, 2);
          fx.billboard(xR, Math.max(headY + 0.12, topR), 0.06, 0.16, basis.right, basis.up, colR, 2);

          // Lateral nudge flash vector showing the exact corner-slide correction!
          if (player.nudgeFlash > 0.05) {
            fx.beam(player.nudgeFromX, CEIL_BOT - 0.10, 0.25, player.nudgeToX, CEIL_BOT - 0.10, 0.25, 0.20, [0.16, 0.96, 1.0, player.nudgeFlash], 0);
            fx.billboard(player.nudgeToX, CEIL_BOT - 0.10, 0.25, 0.32 * player.nudgeFlash, basis.right, basis.up, [1.0, 0.86, 0.20, player.nudgeFlash], 2);
          }

          // Crimson bonk spark burst at head impact!
          if (player.bonkFlash > 0.05) {
            fx.billboard(player.x, CEIL_BOT - 0.04, 0.22, 0.55 * player.bonkFlash, basis.right, basis.up, [1.0, 0.22, 0.26, player.bonkFlash], 2);
          }

          // Pulsing halo around the Golden Goal Crystal above the chimney!
          const pulse = 0.85 + 0.15 * Math.sin(time * 4.5);
          fx.billboard(0.0, CRYSTAL_Y, 0.0, 0.72 * pulse, basis.right, basis.up, [1.0, 0.84, 0.22, 0.68], 2);
          fx.ringXZ(0.0, CEIL_TOP + 0.04, 0.0, 0.72, [1.0, 0.82, 0.20, 0.58 + 0.35 * player.goalFlash]);
          fx.ringXZ(player.x, player.y + 0.04, 0.0, 0.56, player.bonkFlash > 0.1 ? [1.0, 0.24, 0.28, 0.88] : [0.18, 0.92, 1.0, 0.72]);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        nudgeOn,
        status: player.status,
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        nudges: player.nudges,
        bonks: player.bonks,
        goals: player.goals,
        lastNudgeCm: player.lastNudgeCm,
      };
    },
  };
}
