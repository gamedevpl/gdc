// Entry #32: Variable Jump & Apex Hang-Time — Playable 3D Sunset Sky Islands!
// Compares an asymmetric Mario/Celeste jump curve (early-release cut vy*=0.48, 0.45x gravity apex hang-time
// when |vy| < 1.8, and snappy 1.9x heavy fall) against a floaty naive symmetric parabola!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const ISLANDS = [
  { x0: -5.5, x1: -1.6, topY: 0.0 },
  { x0: -0.6, x1:  2.0, topY: 0.0 },
  { x0:  3.0, x1:  6.0, topY: 0.0 },
];

// Low hazard spike bar hovering over the middle island (requires crisp Short Hop!)
const SPIKE_X0 = -0.35;
const SPIKE_X1 =  1.75;
const SPIKE_BOT = 2.48; // Runner head is y + 1.50 -> safe feet max y = 0.98m!

// High floating golden star above the right gap (requires Full Held Jump + Apex Hang-Time!)
const STAR_X = 2.50;
const STAR_Y = 2.92;

const HEAD_H = 1.50;
const SMART_VY0 = 8.45;
const SMART_G = 17.5;
const APEX_THRESH = 1.8;
const NAIVE_VY0 = 7.80;
const NAIVE_G = 14.2;

function isOverIsland(x) {
  for (const isl of ISLANDS) {
    if (x >= isl.x0 - 0.24 && x <= isl.x1 + 0.24) return true;
  }
  return false;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.09, 0.04, 0.16],
    skyMid: [0.22, 0.10, 0.26],
    skyBot: [0.38, 0.18, 0.24],
    lightDir: [0.40, 0.84, 0.36],
    ambLow: [0.18, 0.11, 0.22],
    ambHigh: [0.48, 0.34, 0.44],
    orthoHalf: 11.4,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build 3 Floating Sunset Sky Islands + Low Middle Spike Bar + High Right Golden Star!
  const wBuf = [];
  for (const isl of ISLANDS) {
    const cx = (isl.x0 + isl.x1) * 0.5;
    const hw = (isl.x1 - isl.x0) * 0.5;
    // Lush sunset-teal mossy top grass deck
    pushBox(wBuf, isl.x0, isl.x1, -0.18, 0.0, -1.65, 1.65, [0.24, 0.64, 0.54], 4);
    // Warm volcanic sandstone rock layer
    pushBox(wBuf, isl.x0 + 0.10, isl.x1 - 0.10, -0.92, -0.18, -1.50, 1.50, [0.42, 0.28, 0.38], 1);
    // Tapered floating island keel underneath
    pushBox(wBuf, cx - hw * 0.64, cx + hw * 0.64, -1.62, -0.92, -1.05, 1.05, [0.28, 0.18, 0.30], 1);
    // Crisp glowing amber edge trim on takeoff/landing lips
    pushBox(wBuf, isl.x0 - 0.02, isl.x0 + 0.09, -0.06, 0.03, -1.66, 1.66, [0.98, 0.76, 0.26], 2);
    pushBox(wBuf, isl.x1 - 0.09, isl.x1 + 0.02, -0.06, 0.03, -1.66, 1.66, [0.98, 0.76, 0.26], 2);
  }

  // Low Ceiling Spike Bar above Middle Island (x = -0.35 .. 1.75, spikes down to y = 2.48!)
  pushBox(wBuf, SPIKE_X0 - 0.10, SPIKE_X1 + 0.10, 2.74, 3.10, -1.18, 1.18, [0.22, 0.14, 0.28], 1);
  pushBox(wBuf, SPIKE_X0 - 0.12, SPIKE_X1 + 0.12, 2.98, 3.12, -1.20, 1.20, [1.0, 0.68, 0.14], 5);
  // Back support stanchions anchoring the spike gantry to the rear of the middle island
  pushBox(wBuf, SPIKE_X0, SPIKE_X0 + 0.22, 0.0, 3.05, -1.56, -1.24, [0.30, 0.20, 0.36], 1);
  pushBox(wBuf, SPIKE_X1 - 0.22, SPIKE_X1, 0.0, 3.05, -1.56, -1.24, [0.30, 0.20, 0.36], 1);
  // Glowing crimson laser spikes along the bottom edge!
  for (let i = 0; i < 6; i++) {
    const sx = SPIKE_X0 + 0.18 + i * 0.35;
    pushBox(wBuf, sx - 0.10, sx + 0.10, SPIKE_BOT, 2.75, -0.95, 0.95, [1.0, 0.20, 0.36], 2);
  }

  // High Floating Golden Star above the right gap (x = 2.50, y = 2.92!)
  pushBox(wBuf, STAR_X - 0.24, STAR_X + 0.24, STAR_Y - 0.24, STAR_Y + 0.24, -0.24, 0.24, [1.0, 0.84, 0.18], 2);
  pushBox(wBuf, STAR_X - 0.13, STAR_X + 0.13, STAR_Y - 0.44, STAR_Y + 0.44, -0.13, 0.13, [1.0, 0.94, 0.46], 2);
  pushBox(wBuf, STAR_X - 0.42, STAR_X + 0.42, STAR_Y - 0.12, STAR_Y + 0.12, -0.13, 0.13, [1.0, 0.78, 0.16], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.22, dist: 15.0, targetX: 0.2, targetY: 1.7, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let smartJump = true; // ON: Mario/Celeste variable cut + apex hang + heavy fall | OFF: Naive symmetric parabola
  let demoStyle = "short"; // "short" vs "full" (toggled with [V])
  let autoDemo = true;
  let userInteracted = false;

  const player = {
    x: -2.25,
    y: 0.0,
    vx: 0,
    vy: 0,
    yaw: Math.PI * 0.5,
    grounded: true,
    jumpHeld: false,
    jumpCut: false,
    jumpElapsed: 0,
    jumpStartT: 0,
    maxJumpY: 0,
    phase: "GROUND", // GROUND | RISE | APEX | FALL | SYMMETRIC
    walkPhase: 0,
    speedNorm: 0,
    shortHops: 0,
    fullJumps: 0,
    starsCollected: 0,
    spikeHits: 0,
    spikeFlash: 0,
    starFlash: 0,
    starCollectedThisPass: false,
  };

  // Live 3D trajectory ribbon orbs: { x, y, phase, age, smart }
  let trail = [];
  let trailAcc = 0;
  let demoHoldLeft = 0;
  let demoLeg = 0; // 0 = short-hop over Gap 1 under spikes, 1 = full-jump over Gap 2 to star, 2 = loop back!

  let bannerText = "";
  let bannerColor = "#fbbf24";
  let bannerTimer = 0;
  function setBanner(t, c = "#fbbf24", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function beginJump(holdDur, silent = false) {
    if (!player.grounded) return;
    player.grounded = false;
    player.jumpHeld = true;
    player.jumpCut = false;
    player.jumpElapsed = 0;
    player.maxJumpY = 0;
    player.vy = smartJump ? SMART_VY0 : NAIVE_VY0;
    player.phase = smartJump ? "RISE" : "SYMMETRIC";
    demoHoldLeft = holdDur;
    if (holdDur > 0.25) player.fullJumps++;
    else player.shortHops++;
    // Keep previous arc faintly while starting fresh bright points
    for (const pt of trail) pt.age = Math.max(pt.age, 1.35);
    if (!silent && userInteracted) audio?.jump?.();
  }

  function releaseJump() {
    if (!player.jumpHeld) return;
    player.jumpHeld = false;
    if (smartJump && !player.grounded && player.vy > 0 && !player.jumpCut) {
      player.vy *= 0.48;
      player.jumpCut = true;
    }
  }

  function launchStyleDemo(style, silent = false) {
    demoStyle = style;
    autoDemo = true;
    trail = [];
    player.grounded = true;
    player.y = 0.0;
    player.vy = 0;
    player.yaw = Math.PI * 0.5;
    player.spikeFlash = 0;
    player.starFlash = 0;
    player.starCollectedThisPass = false;
    if (style === "short") {
      // Launch right before Gap 1 -> Short Hop straight under the low middle spike bar!
      player.x = -1.95;
      demoLeg = 0;
      beginJump(0.055, silent);
      if (!silent) {
        setBanner(
          smartJump
            ? "SHORT-HOP DEMO: EARLY RELEASE CUTS Vy×0.48 → SKIMS UNDER SPIKES! ✓"
            : "NAIVE SYMMETRIC: NO SHORT-HOP CUT → SMASHES LOW SPIKE BAR! ✗",
          smartJump ? "#38bdf8" : "#f87171",
          2.0
        );
      }
    } else {
      // Launch right before Gap 2 -> Full Held Jump with Gold Apex Hang-Time into the Golden Star!
      player.x = 1.68;
      demoLeg = 1;
      beginJump(0.65, silent);
      if (!silent) {
        setBanner(
          smartJump
            ? "FULL-JUMP DEMO: GOLD APEX HANG-TIME (0.45×g) + HEAVY FALL (1.9×g)! ★"
            : "NAIVE PARABOLA: FLOATY SYMMETRIC MOON-ARC (1.0×g)! ✗",
          smartJump ? "#facc15" : "#c084fc",
          2.0
        );
      }
    }
  }

  function reset() {
    time = 0;
    autoDemo = true;
    demoStyle = "short";
    demoLeg = 0;
    trail = [];
    trailAcc = 0;
    player.x = -2.15;
    player.y = 0.0;
    player.vx = 0;
    player.vy = 0;
    player.yaw = Math.PI * 0.5;
    player.grounded = true;
    player.jumpHeld = false;
    player.jumpCut = false;
    player.jumpElapsed = 0;
    player.phase = "GROUND";
    player.walkPhase = 0;
    player.speedNorm = 0;
    player.shortHops = 0;
    player.fullJumps = 0;
    player.starsCollected = 0;
    player.spikeHits = 0;
    player.spikeFlash = 0;
    player.starFlash = 0;
    player.starCollectedThisPass = false;
    bannerTimer = 0;
    // Kick off immediately so by 0.4s-0.8s a glowing trajectory arc is already soaring!
    beginJump(0.055, true);
  }
  reset();

  function update(dt, keys) {
    const sdt = Math.min(dt || 0.016, 0.05);
    time += sdt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - sdt);
    if (player.spikeFlash > 0) player.spikeFlash = Math.max(0, player.spikeFlash - sdt * 1.4);
    if (player.starFlash > 0) player.starFlash = Math.max(0, player.starFlash - sdt * 1.1);

    let dir = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) dir -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) dir += 1;
    const holdKey = keys?.has("Space") || keys?.has("KeyW") || keys?.has("ArrowUp");

    if (dir !== 0) {
      autoDemo = false;
      userInteracted = true;
    }

    if (!autoDemo) {
      if (!holdKey && player.jumpHeld) releaseJump();
    } else {
      // Auto-demo runs continuously across the 3 sky islands showing BOTH Short Hop & Full Jump!
      dir = 1.0;
      if (!player.grounded && player.jumpHeld) {
        demoHoldLeft -= sdt;
        if (demoHoldLeft <= 0) releaseJump();
      }
      // Gap 1 takeoff (Short Hop under the low spike bar!)
      if (player.grounded && player.x >= -1.85 && player.x <= -1.55) {
        demoLeg = 0;
        demoStyle = "short";
        beginJump(0.055, true);
      }
      // Gap 2 takeoff (Full Held Jump up to the high golden star!)
      if (player.grounded && player.x >= 1.65 && player.x <= 1.98) {
        demoLeg = 1;
        demoStyle = "full";
        beginJump(0.68, true);
      }
      // Loop cleanly once reaching the far right edge
      if (player.x > 5.35) {
        player.x = -4.65;
        player.y = 0.0;
        player.vy = 0;
        player.grounded = true;
        player.starCollectedThisPass = false;
      }
    }

    const runSpeed = 4.35;
    player.vx = dir * runSpeed;
    player.x = clamp(player.x + player.vx * sdt, -5.25, 5.75);

    if (player.grounded && !isOverIsland(player.x)) {
      player.grounded = false;
    }

    if (!player.grounded) {
      player.jumpElapsed += sdt;
      let gEff = NAIVE_G;
      if (smartJump) {
        if (Math.abs(player.vy) < APEX_THRESH && !player.jumpCut) {
          gEff = SMART_G * 0.45; // Golden Apex Hang-Time!
          player.phase = "APEX";
        } else if (player.vy > 0) {
          gEff = SMART_G;
          player.phase = "RISE";
        } else {
          gEff = SMART_G * 1.90; // Snappy Heavy Fall!
          player.phase = "FALL";
        }
      } else {
        gEff = NAIVE_G;
        player.phase = "SYMMETRIC";
      }

      const prevY = player.y;
      player.vy -= gEff * sdt;
      let nextY = prevY + player.vy * sdt;
      if (nextY > player.maxJumpY) player.maxJumpY = nextY;

      // Low Ceiling Spike Bar collision over Middle Island!
      if (player.x >= SPIKE_X0 - 0.25 && player.x <= SPIKE_X1 + 0.25 && nextY + HEAD_H >= SPIKE_BOT && nextY <= 3.05) {
        nextY = Math.min(nextY, SPIKE_BOT - HEAD_H);
        if (player.vy > -0.2) {
          player.vy = -2.2;
          player.spikeHits++;
          player.spikeFlash = 1.0;
          if (userInteracted) audio?.inputIgnored?.();
        }
      }

      // High Golden Star pickup above Right Gap!
      if (!player.starCollectedThisPass && Math.hypot(player.x - STAR_X, (nextY + 0.85) - STAR_Y) < 0.88) {
        player.starCollectedThisPass = true;
        player.starsCollected++;
        player.starFlash = 1.0;
        if (userInteracted) audio?.coinPickup?.();
      }

      // Island landing check
      if (player.vy <= 0 && prevY >= -0.10 && nextY <= 0.0 && isOverIsland(player.x)) {
        nextY = 0.0;
        player.vy = 0;
        player.grounded = true;
        player.jumpHeld = false;
        player.phase = "GROUND";
        if (userInteracted) audio?.land?.();
      }

      // Canyon fall respawn
      if (nextY < -2.4) {
        if (userInteracted) audio?.fallVoid?.();
        player.x = -3.8;
        player.y = 0.0;
        player.vy = 0;
        player.grounded = true;
        player.phase = "GROUND";
        player.starCollectedThisPass = false;
      } else {
        player.y = nextY;
      }

      // Sample 3D glowing trajectory orb ribbon!
      trailAcc += sdt;
      if (trailAcc >= 0.022) {
        trailAcc = 0;
        trail.push({
          x: player.x,
          y: player.y + 0.72,
          phase: player.phase,
          smart: smartJump,
          age: 0,
        });
        if (trail.length > 96) trail.shift();
      }
    }

    // Age trajectory orbs gracefully
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].age += sdt;
      if (trail[i].age > 3.4) trail.splice(i, 1);
    }

    if (Math.abs(dir) > 0.05) {
      player.yaw = dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      player.walkPhase += sdt * (player.grounded ? 11.5 : 4.0);
      player.speedNorm = player.grounded ? 1.0 : 0.30;
    } else {
      player.speedNorm = 0.0;
    }
  }

  // Draw crisp mini Height-vs-Time curve chart comparing Asymmetric Smart Curve vs Naive Parabola!
  function drawCurveChart(ctx, x, y, w, h, isPl) {
    ctx.save();
    ctx.fillStyle = "rgba(18, 12, 32, 0.92)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke();

    const gx0 = x + 10, gy0 = y + h - 10, gw = w - 20, gh = h - 22;
    const tMax = 1.15, hMax = 2.45;

    // Spike clearance threshold dashed line
    const spikeLineY = gy0 - (0.98 / hMax) * gh;
    ctx.strokeStyle = "rgba(251, 113, 133, 0.42)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(gx0, spikeLineY); ctx.lineTo(gx0 + gw, spikeLineY); ctx.stroke();
    ctx.setLineDash([]);

    // 1. Naive Symmetric Parabola (dashed lavender)
    ctx.strokeStyle = smartJump ? "rgba(192, 132, 252, 0.45)" : "rgba(192, 132, 252, 0.96)";
    ctx.lineWidth = smartJump ? 1.4 : 2.3;
    ctx.setLineDash(smartJump ? [4, 3] : []);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * tMax;
      const py = Math.max(0, NAIVE_VY0 * t - 0.5 * NAIVE_G * t * t);
      const sx = gx0 + (t / tMax) * gw;
      const sy = gy0 - (py / hMax) * gh;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Smart Mario/Celeste Asymmetric Curve (Cyan Rise -> Gold Apex -> Coral Heavy Fall!)
    let syVal = 0, svy = SMART_VY0;
    const simDt = 1 / 120;
    let prevX = gx0, prevY = gy0;
    for (let step = 1; step <= 135; step++) {
      const t = step * simDt;
      let g = SMART_G, col = "#22d3ee";
      if (Math.abs(svy) < APEX_THRESH) { g = SMART_G * 0.45; col = "#facc15"; }
      else if (svy < 0) { g = SMART_G * 1.90; col = "#fb7185"; }
      svy -= g * simDt;
      syVal += svy * simDt;
      if (syVal < 0) break;
      const sx = gx0 + (t / tMax) * gw;
      const sy = gy0 - (syVal / hMax) * gh;
      ctx.strokeStyle = smartJump ? col : "rgba(148, 163, 184, 0.30)";
      ctx.lineWidth = smartJump ? 2.4 : 1.1;
      ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(sx, sy); ctx.stroke();
      prevX = sx; prevY = sy;
    }

    // 3. Short-Hop inner cut arc (subtle dotted cyan-amber)
    if (smartJump) {
      let hy = 0, hvy = SMART_VY0, cut = false;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.72)";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gx0, gy0);
      for (let step = 1; step <= 85; step++) {
        const t = step * simDt;
        if (!cut && t >= 0.055) { hvy *= 0.48; cut = true; }
        hvy -= (hvy < 0 ? SMART_G * 1.90 : SMART_G) * simDt;
        hy += hvy * simDt;
        if (hy < 0) break;
        ctx.lineTo(gx0 + (t / tMax) * gw, gy0 - (hy / hMax) * gh);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Live dot showing hero's real-time position along Height vs Time!
    if (!player.grounded) {
      const dotX = gx0 + clamp(player.jumpElapsed / tMax, 0, 1) * gw;
      const dotY = gy0 - clamp(player.y / hMax, 0, 1) * gh;
      const dotCol = !smartJump ? "#c084fc" : (player.phase === "APEX" ? "#facc15" : player.phase === "FALL" ? "#fb7185" : "#22d3ee");
      ctx.fillStyle = dotCol;
      ctx.beginPath(); ctx.arc(dotX, dotY, 4.2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.font = "700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#cbd5e1";
    ctx.textAlign = "left";
    ctx.fillText(isPl ? "WYSOKOŚĆ / CZAS (MARIO vs PARABOLA)" : "HEIGHT vs TIME (SMART vs SYMMETRIC)", x + 8, y + 11);
    ctx.restore();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Static obstacle signposts
      const sp = projectToScreen(viewProj, 0.70, 3.45, 0.0, cssW, cssH);
      if (sp) {
        const safeSx = (!isCompact && !document.body.classList.contains("no-hud") && sp.y < 260) ? Math.min(sp.x, cssW - 410) : sp.x;
        drawWorldPill(ctx, safeSx, sp.y, isPl ? "NISKIE KOLCE (KRÓTKI SKOK!)" : "LOW SPIKES (TAP SHORT-HOP!)", "#fb7185", cssW, cssH, isCompact ? 8.5 : 9.5);
      }
      const stp = projectToScreen(viewProj, STAR_X, STAR_Y + 0.68, 0.0, cssW, cssH);
      if (stp) {
        const safeTx = (!isCompact && !document.body.classList.contains("no-hud") && stp.y < 260) ? Math.min(stp.x, cssW - 405) : stp.x;
        drawWorldPill(ctx, safeTx, stp.y, isPl ? "GWIAZDA (PRZYTRZYMAJ SKOK ★)" : "HIGH STAR (HOLD FULL JUMP ★)", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Live Hero Jump Phase Pill
      const hp = projectToScreen(viewProj, player.x, player.y + HEAD_H + 0.56, 0.0, cssW, cssH);
      if (hp) {
        let txt = isPl ? "PRZYTRZYMAJ / PUKNIJ SPACIĘ" : "TAP OR HOLD SPACE TO JUMP";
        let col = "#f8fafc";
        if (player.spikeFlash > 0.15) {
          txt = isPl ? "TRAFIONY W KOLCE! (ZA WYSOKI SKOK) ✗" : "HIT LOW SPIKES! (NO SHORT-HOP) ✗";
          col = "#f87171";
        } else if (player.starFlash > 0.15) {
          txt = isPl ? "GWIAZDA W APEX HANG-TIME! ★" : "STAR GRABBED IN APEX HANG! ★";
          col = "#facc15";
        } else if (player.phase === "APEX") {
          txt = isPl ? "APEX HANG-TIME (0.45×g) ★" : "APEX HANG-TIME (0.45×g) ★";
          col = "#facc15";
        } else if (player.phase === "FALL") {
          txt = isPl ? "CIĘŻKIE SPADANIE (1.9×g) ↓" : "HEAVY FALL (1.9×g) ↓";
          col = "#fb7185";
        } else if (player.phase === "RISE") {
          txt = player.jumpCut
            ? (isPl ? "KRÓTKI SKOK (Vy×0.48) ✓" : "SHORT HOP CUT (Vy×0.48) ✓")
            : (isPl ? "WZNOSZENIE (1.0×g) ↑" : "RISING (1.0×g) ↑");
          col = "#22d3ee";
        } else if (player.phase === "SYMMETRIC") {
          txt = isPl ? "NAIWNA PARABOLA (1.0×g · PŁYWA)" : "NAIVE PARABOLA (1.0×g FLOATY)";
          col = "#c084fc";
        }
        const safeHx = (!isCompact && !document.body.classList.contains("no-hud") && hp.y < 260) ? Math.min(hp.x, cssW - 405) : hp.x;
        drawWorldPill(ctx, safeHx, hp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${smartJump ? "MARIO CURVE (0.45× / 1.9×g)" : "NAIVE PARABOLA"} · ★${player.starsCollected} · Hits ${player.spikeHits}`,
          smartJump ? "#fbbf24" : "#c084fc",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 336, panelH = 224, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(16, 10, 28, 0.90)";
        ctx.strokeStyle = smartJump ? "rgba(251, 191, 36, 0.85)" : "rgba(192, 132, 252, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = smartJump ? "#fbbf24" : "#c084fc";
        ctx.fillText(
          smartJump
            ? (isPl ? "KRZYWA MARIO/CELESTE · APEX 0.45× · FALL 1.9×" : "MARIO/CELESTE CURVE · APEX 0.45× · FALL 1.9×")
            : (isPl ? "NAIWNA PARABOLA · STAŁE 1.0×g · BRAK SHORT-HOP" : "NAIVE SYMMETRIC PARABOLA · FIXED 1.0×g!"),
          px + 12, py + 21, bw
        );

        // Mini Height vs Time curve chart!
        drawCurveChart(ctx, px + 12, py + 31, bw, 76, isPl);

        // Color legend row
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#22d3ee"; ctx.fillText(isPl ? "● Wzlot" : "● Rise", px + 12, py + 123);
        ctx.fillStyle = "#facc15"; ctx.fillText(isPl ? "● Apex 0.45×g" : "● Apex 0.45×g", px + 76, py + 123);
        ctx.fillStyle = "#fb7185"; ctx.fillText(isPl ? "● Spadek 1.9×g" : "● Fall 1.9×g", px + 186, py + 123);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Gwiazdy: ${player.starsCollected} · Kolce: ${player.spikeHits} · Short/Full: ${player.shortHops}/${player.fullJumps}` : `Stars: ${player.starsCollected} · Spike Hits: ${player.spikeHits} · Hop/Full: ${player.shortHops}/${player.fullJumps}`, px + 12, py + 148, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "V = Demo Krótki vs Pełny Skok · A/D = Biegnij" : "V = Short-Hop vs Full-Jump Demo · A/D = Run", px + 12, py + 174, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Spacja (Puknij/Trzymaj) · T = Krzywa / Parabola" : "Space (Tap/Hold) · T = Smart Curve / Naive", px + 12, py + 198, bw);
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
          id: "toggle-smart",
          label: smartJump
            ? (pl ? "Krzywa Mario: WŁ [T]" : "Smart Curve: ON [T]")
            : (pl ? "Naiwna Parabola [T]" : "Naive Parabola [T]"),
          pressed: smartJump,
        },
        {
          id: "demo-style",
          label: demoStyle === "short"
            ? (pl ? "Demo: Pełny Skok [V]" : "Demo: Full Jump [V]")
            : (pl ? "Demo: Krótki Skok [V]" : "Demo: Short Hop [V]"),
          pressed: demoStyle === "full",
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-smart") {
        smartJump = !smartJump;
        audio?.ruleSwitch?.(smartJump);
        launchStyleDemo(demoStyle, false);
      } else if (id === "demo-style") {
        const nextStyle = demoStyle === "short" ? "full" : "short";
        audio?.ruleSwitch?.(nextStyle === "full");
        launchStyleDemo(nextStyle, false);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-smart");
      else if (code === "KeyV") this.onAction("demo-style");
      else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
        userInteracted = true;
        autoDemo = false;
        beginJump(9.0, false);
      }
    },
    onKeyUp(code) {
      if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
        releaseJump();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const tint = player.spikeFlash > 0.1
        ? [1.0, 0.18, 0.28, player.spikeFlash * 0.78]
        : (player.phase === "APEX" && smartJump
            ? [1.0, 0.86, 0.22, 0.45]
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
          // 3D Glowing Trajectory Ribbon of Orbs (Color-coded by Jump Phase!)
          for (const pt of trail) {
            const fade = clamp(1.0 - pt.age / 3.4, 0.08, 1.0);
            let col = [0.68, 0.56, 0.88, 0.78 * fade]; // Dull lavender for Naive Symmetric
            let rad = 0.12;
            if (pt.smart) {
              if (pt.phase === "APEX") {
                col = [1.0, 0.86, 0.18, 0.96 * fade]; // Radiant Gold Apex Hang-Time!
                rad = 0.17;
              } else if (pt.phase === "FALL") {
                col = [1.0, 0.36, 0.36, 0.88 * fade]; // Snappy Coral Heavy Fall!
                rad = 0.13;
              } else {
                col = [0.16, 0.92, 1.0, 0.90 * fade]; // Crisp Cyan Rise!
                rad = 0.13;
              }
            }
            fx.billboard(pt.x, pt.y, 0.0, rad, basis.right, basis.up, col, 2);
          }

          // Low Spike Hazard X-Ray warning envelope over Middle Island
          fx.xrayBox(SPIKE_X0, SPIKE_X1, SPIKE_BOT - 0.04, 2.75, -1.0, 1.0, [1.0, 0.22, 0.36, 0.35 + 0.50 * player.spikeFlash]);

          // Radiant Golden Star halo above Right Gap
          const sp = 0.85 + 0.15 * Math.sin(time * 5.0);
          fx.billboard(STAR_X, STAR_Y, 0.0, (0.74 + 0.35 * player.starFlash) * sp, basis.right, basis.up, [1.0, 0.86, 0.20, 0.72], 2);

          // Hero ground shadow ring / apex aura
          if (player.grounded) {
            fx.ringXZ(player.x, 0.04, 0.0, 0.58, smartJump ? [0.22, 0.94, 1.0, 0.78] : [0.75, 0.58, 0.96, 0.72]);
          } else if (player.phase === "APEX" && smartJump) {
            fx.billboard(player.x, player.y + 0.85, 0.0, 0.55, basis.right, basis.up, [1.0, 0.86, 0.18, 0.48], 2);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        smartJump,
        demoStyle,
        phase: player.phase,
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        shortHops: player.shortHops,
        fullJumps: player.fullJumps,
        starsCollected: player.starsCollected,
        spikeHits: player.spikeHits,
      };
    },
  };
}
