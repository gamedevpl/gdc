// Entry #34: Ledge Grab & Auto-Mantle — Playable 3D Canyon Temple Rooftops!
// Shows why Uncharted, Mirror's Edge & Celeste never punish a 30cm-short leap:
// Dual forward probes (lower chest ray hits stone wall + upper head ray sees open air!) trigger a crisp
// 0.32s auto-mantle vault onto the roof instead of bumping chest-first and plunging into the canyon!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const ROOFS = [
  { x0: -6.40, x1: -2.35, y: 0.00 },
  { x0: -1.05, x1:  2.15, y: 1.45 },
  { x0:  3.45, x1:  6.80, y: 2.85 },
];

const GRAB_DEPTH = 0.45; // Glowing green Auto-Mantle Grab Zone spans 45cm below each top ledge lip!
const HALF_W = 0.32;
const CHEST_RAY_H = 0.66;
const HEAD_RAY_H = 1.34;
const PROBE_LEN = 0.62;
const MANTLE_DUR = 0.32;
const GRAVITY = 16.5;
const JUMP_VY = 4.65; // Peaks ~0.66m above takeoff -> deliberately ~30cm short of each 1.45m rooftop lip!
const RELIC_X = 5.40;
const RELIC_Y = 3.65;

function roofUnder(x) {
  for (let i = 0; i < ROOFS.length; i++) {
    const r = ROOFS[i];
    if (x >= r.x0 - HALF_W * 0.72 && x <= r.x1 + HALF_W * 0.72) return { idx: i, ...r };
  }
  return null;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.02, 0.08, 0.11],
    skyMid: [0.06, 0.16, 0.20],
    skyBot: [0.14, 0.24, 0.22],
    lightDir: [0.36, 0.86, 0.36],
    ambLow: [0.11, 0.18, 0.20],
    ambHigh: [0.34, 0.48, 0.48],
    orthoHalf: 11.4,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build 3 Stepped Sandstone/Emerald Canyon Temple Rooftops + Shimmering Canyon River + Temple Relic!
  const wBuf = [];
  // Shimmering emerald canyon river far below the rooftops
  pushBox(wBuf, -7.8, 7.8, -2.55, -2.18, -4.0, 3.6, [0.08, 0.36, 0.40], 3);

  // Distant sandstone temple ruins & columns in the background for canyon depth
  for (const bx of [-4.6, -1.6, 1.5, 4.6]) {
    pushBox(wBuf, bx - 0.36, bx + 0.36, -2.2, 3.8 + (bx > 1 ? 0.9 : 0), -3.7, -2.95, [0.36, 0.34, 0.30], 1);
    pushBox(wBuf, bx - 0.48, bx + 0.48, 3.7 + (bx > 1 ? 0.9 : 0), 3.95 + (bx > 1 ? 0.9 : 0), -3.8, -2.88, [0.46, 0.44, 0.38], 1);
  }

  for (let i = 0; i < ROOFS.length; i++) {
    const r = ROOFS[i];
    // Tall weathered sandstone temple tower descending into the canyon
    pushBox(wBuf, r.x0, r.x1, -2.25, r.y - 0.10, -1.72, 1.72, [0.64, 0.54, 0.40], 1);
    // Emerald temple tile rooftop cap
    pushBox(wBuf, r.x0 - 0.03, r.x1 + 0.03, r.y - 0.11, r.y, -1.78, 1.78, [0.22, 0.58, 0.50], 0);
    // Glowing emerald-gold trim marking the climbable front lip on Roof 2 & Roof 3!
    if (i > 0) {
      pushBox(wBuf, r.x0 - 0.04, r.x0 + 0.09, r.y - 0.12, r.y + 0.03, -1.80, 1.80, [0.20, 0.96, 0.62], 2);
      // Carved sandstone ledge relief beneath the lip
      pushBox(wBuf, r.x0 - 0.03, r.x0 + 0.14, r.y - GRAB_DEPTH, r.y - 0.12, -1.74, 1.74, [0.50, 0.44, 0.34], 1);
    }
  }

  // Golden Temple Relic Pedestal on Top Roof #3 (x = 5.40, y = 2.85!)
  pushBox(wBuf, RELIC_X - 0.52, RELIC_X + 0.52, 2.85, 3.16, -0.52, 0.52, [0.48, 0.44, 0.38], 1);
  pushBox(wBuf, RELIC_X - 0.22, RELIC_X + 0.22, RELIC_Y - 0.26, RELIC_Y + 0.26, -0.22, 0.22, [1.0, 0.84, 0.20], 2);
  pushBox(wBuf, RELIC_X - 0.13, RELIC_X + 0.13, RELIC_Y - 0.44, RELIC_Y + 0.44, -0.13, 0.13, [1.0, 0.94, 0.48], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.24, dist: 15.2, targetX: 0.3, targetY: 1.55, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let mantleOn = true; // ON: Dual-probe Auto-Mantle vaults 30cm-short jumps | OFF: Strict capsule chest-bump & fall!
  let autoDemo = true;
  let userInteracted = false;
  let testLedgeIdx = 1; // Alternates testing Roof 2 (idx 1) and Roof 3 (idx 2) on [V]

  const player = {
    x: -2.85,
    y: 0.0,
    vx: 0,
    vy: 0,
    yaw: Math.PI * 0.5,
    grounded: true,
    walkPhase: 0,
    speedNorm: 0,
    status: "RUNNING", // RUNNING | JUMPING | MANTLING | BUMPED | RELIC
    mantling: false,
    mantleT: 0,
    mStartX: 0, mStartY: 0,
    mEndX: 0, mEndY: 0,
    lastGrabCm: 32,
    mantles: 0,
    falls: 0,
    relics: 0,
    mantleFlash: 0,
    bumpFlash: 0,
    relicFlash: 0,
    chestHit: false,
    headClear: true,
    relicGotThisRun: false,
    waitTimer: 0,
  };

  let bannerText = "";
  let bannerColor = "#34d399";
  let bannerTimer = 0;
  function setBanner(t, c = "#34d399", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function doJump(silent = false) {
    if (!player.grounded || player.mantling) return;
    player.vy = JUMP_VY;
    player.grounded = false;
    player.status = "JUMPING";
    if (!silent && userInteracted) audio?.jump?.();
  }

  function launchShortJumpTest({ ledgeIdx = null, silent = false } = {}) {
    if (ledgeIdx != null) testLedgeIdx = ledgeIdx;
    else testLedgeIdx = testLedgeIdx === 1 ? 2 : 1;
    const fromRoof = ROOFS[testLedgeIdx - 1];
    player.mantling = false;
    player.x = fromRoof.x1 - 0.24; // Right on takeoff edge!
    player.y = fromRoof.y;
    player.vx = 2.95;
    player.vy = JUMP_VY;
    player.yaw = Math.PI * 0.5;
    player.grounded = false;
    player.bumpFlash = 0;
    player.mantleFlash = 0;
    player.status = "JUMPING";
    if (!silent && userInteracted) audio?.jump?.();
    if (!silent) {
      setBanner(
        mantleOn
          ? "SHORT-JUMP TEST: CHEST HIT + HEAD CLEAR → 0.32s AUTO-MANTLE VAULT! ✓"
          : "SHORT-JUMP TEST (STRICT OFF): BUMPS CHEST-FIRST → DROPS INTO CANYON! ✗",
        mantleOn ? "#34d399" : "#f87171",
        2.1
      );
    }
  }

  function reset() {
    time = 0;
    autoDemo = true;
    testLedgeIdx = 1;
    player.x = -2.68; // Launches across Gap 1 immediately -> triggers Mantle Grab right at ~0.52s!
    player.y = 0.0;
    player.vx = 0;
    player.vy = 0;
    player.yaw = Math.PI * 0.5;
    player.grounded = true;
    player.walkPhase = 0;
    player.speedNorm = 0;
    player.status = "RUNNING";
    player.mantling = false;
    player.mantleT = 0;
    player.lastGrabCm = 32;
    player.mantles = 0;
    player.falls = 0;
    player.relics = 0;
    player.mantleFlash = 0;
    player.bumpFlash = 0;
    player.relicFlash = 0;
    player.relicGotThisRun = false;
    player.waitTimer = 0;
    bannerTimer = 0;
  }
  reset();

  // Helper: evaluate dual forward probes against roof walls
  function probeForward(px, py, dir) {
    const chestY = py + CHEST_RAY_H;
    const headY = py + HEAD_RAY_H;
    let chestHit = false;
    let headBlocked = false;
    let hitRoof = null;

    if (dir > 0) {
      for (let i = 1; i < ROOFS.length; i++) {
        const r = ROOFS[i];
        if (px < r.x0 && px + PROBE_LEN >= r.x0) {
          if (chestY < r.y && chestY > r.y - 2.4) {
            chestHit = true;
            hitRoof = r;
          }
          if (headY < r.y) headBlocked = true;
        }
      }
    }
    return { chestHit, headClear: !headBlocked, hitRoof };
  }

  function update(dt, keys) {
    const sdt = Math.min(dt || 0.016, 0.05);
    time += sdt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - sdt);
    if (player.mantleFlash > 0) player.mantleFlash = Math.max(0, player.mantleFlash - sdt * 1.15);
    if (player.bumpFlash > 0) player.bumpFlash = Math.max(0, player.bumpFlash - sdt * 1.35);
    if (player.relicFlash > 0) player.relicFlash = Math.max(0, player.relicFlash - sdt * 1.1);

    let dir = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) dir -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) dir += 1;
    if (dir !== 0) {
      autoDemo = false;
      userInteracted = true;
    }

    // Active 0.32s Auto-Mantle Vault Animation!
    if (player.mantling) {
      player.mantleT += sdt / MANTLE_DUR;
      const u = clamp(player.mantleT, 0, 1);
      if (u < 0.55) {
        // Phase 1: Pull straight up along the stone lip
        const k = u / 0.55;
        const ease = 1 - (1 - k) * (1 - k);
        player.x = player.mStartX + (player.mEndX - player.mStartX) * (0.20 * ease);
        player.y = player.mStartY + (player.mEndY + 0.14 - player.mStartY) * ease;
      } else {
        // Phase 2: Vault forward and plant boots cleanly on rooftop!
        const k = (u - 0.55) / 0.45;
        const ease = k * k * (3 - 2 * k);
        player.x = player.mStartX + (player.mEndX - player.mStartX) * (0.20 + 0.80 * ease);
        player.y = (player.mEndY + 0.14) - 0.14 * ease;
      }
      player.walkPhase += sdt * 14.0;
      player.speedNorm = 0.85;
      if (u >= 1.0) {
        player.mantling = false;
        player.x = player.mEndX;
        player.y = player.mEndY;
        player.vy = 0;
        player.grounded = true;
        player.status = "RUNNING";
        if (userInteracted) audio?.land?.();
      }
      const pr = probeForward(player.x, player.y, 1);
      player.chestHit = pr.chestHit;
      player.headClear = pr.headClear;
      return;
    }

    // Auto-demo smoothly runs across the 3 stepped rooftops, leaping 30cm short of each edge!
    if (autoDemo) {
      if (player.waitTimer > 0) {
        player.waitTimer -= sdt;
        dir = 0;
        if (player.waitTimer <= 0) {
          player.x = -4.25;
          player.y = 0.0;
          player.vy = 0;
          player.grounded = true;
          player.relicGotThisRun = false;
          player.status = "RUNNING";
        }
      } else {
        dir = 1.0;
        if (player.grounded) {
          // Takeoff right before Canyon Gap 1 & Canyon Gap 2!
          if (player.x >= ROOFS[0].x1 - 0.30 && player.x <= ROOFS[0].x1 + 0.05 && Math.abs(player.y - ROOFS[0].y) < 0.1) {
            doJump(true);
          } else if (player.x >= ROOFS[1].x1 - 0.30 && player.x <= ROOFS[1].x1 + 0.05 && Math.abs(player.y - ROOFS[1].y) < 0.1) {
            doJump(true);
          }
        }
        if (player.x >= RELIC_X - 0.25 && player.y >= 2.75) {
          dir = 0;
          player.waitTimer = 1.0;
        }
      }
    }

    const moveSpeed = 3.05;
    if (player.bumpFlash > 0.45 && !player.grounded) {
      // Brief knockback off stone wall after strict capsule chest-bump!
      player.vx = -0.85;
    } else {
      player.vx = dir * moveSpeed;
    }

    const prevX = player.x;
    const prevY = player.y;
    let nextX = clamp(prevX + player.vx * sdt, -5.85, 6.25);

    // Horizontal wall collision & Auto-Mantle trigger against Roof 2 & Roof 3 front cliffs!
    for (let i = 1; i < ROOFS.length; i++) {
      const r = ROOFS[i];
      if (prevX <= r.x0 - HALF_W + 0.08 && nextX + HALF_W >= r.x0 && prevY < r.y - 0.06) {
        const chestY = prevY + CHEST_RAY_H;
        const headY = prevY + HEAD_RAY_H;
        const inGrabZone = chestY >= (r.y - GRAB_DEPTH - 0.08) && chestY <= (r.y + 0.12);
        const headOver = headY > r.y;

        if (mantleOn && !player.grounded && inGrabZone && headOver) {
          // DUAL PROBES TRIGGER AUTO-MANTLE VAULT!
          player.mantling = true;
          player.mantleT = 0;
          player.mStartX = r.x0 - HALF_W - 0.02;
          player.mStartY = prevY;
          player.mEndX = r.x0 + 0.42;
          player.mEndY = r.y;
          player.lastGrabCm = clamp(Math.round((r.y - chestY) * 100), 14, 44);
          player.mantles++;
          player.mantleFlash = 1.0;
          player.status = "MANTLING";
          if (userInteracted) audio?.coyoteSave?.();
          return;
        } else {
          // STRICT CAPSULE WALL HIT! Chest bumps solid stone lip!
          nextX = r.x0 - HALF_W - 0.02;
          if (!player.grounded && player.bumpFlash < 0.15) {
            player.vy = Math.min(player.vy, -0.55);
            player.bumpFlash = 1.0;
            player.status = "BUMPED";
            if (userInteracted) audio?.inputIgnored?.();
          }
        }
      }
    }
    player.x = nextX;

    // Check stepping off current roof edge
    const curRoof = roofUnder(player.x);
    if (player.grounded && (!curRoof || Math.abs(curRoof.y - player.y) > 0.15)) {
      player.grounded = false;
    }

    // Vertical gravity & landing
    if (!player.grounded) {
      player.vy -= GRAVITY * sdt;
      let nextY = prevY + player.vy * sdt;
      if (player.vy <= 0 && curRoof && prevY >= curRoof.y - 0.12 && nextY <= curRoof.y) {
        nextY = curRoof.y;
        player.vy = 0;
        player.grounded = true;
        player.status = "RUNNING";
        if (userInteracted) audio?.land?.();
      }
      if (nextY < -2.05) {
        // Fell into the canyon river!
        player.falls++;
        if (userInteracted) audio?.fallVoid?.();
        player.x = -3.85;
        player.y = 0.0;
        player.vy = 0;
        player.grounded = true;
        player.status = "RUNNING";
        player.bumpFlash = 0.25;
      } else {
        player.y = nextY;
      }
    }

    // Golden Temple Relic reach on Roof 3
    if (!player.relicGotThisRun && Math.hypot(player.x - RELIC_X, (player.y + 0.8) - RELIC_Y) < 0.95) {
      player.relicGotThisRun = true;
      player.relics++;
      player.relicFlash = 1.0;
      player.status = "RELIC";
      if (userInteracted) audio?.goalWin?.();
    }

    // Live forward probe status
    const faceDir = player.yaw >= 0 ? 1 : -1;
    const pr = probeForward(player.x, player.y, faceDir);
    player.chestHit = pr.chestHit;
    player.headClear = pr.headClear;

    if (Math.abs(dir) > 0.05) {
      player.yaw = dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      player.walkPhase += sdt * (player.grounded ? 10.5 : 4.5);
      player.speedNorm = player.grounded ? 1.0 : 0.35;
    } else {
      player.speedNorm = 0.0;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Static Grab Zone callouts on Roof 2 & Roof 3 lips
      const g1 = projectToScreen(viewProj, ROOFS[1].x0 - 0.22, ROOFS[1].y + 0.42, 1.35, cssW, cssH);
      if (g1) {
        drawWorldPill(
          ctx, g1.x, g1.y,
          mantleOn ? (isPl ? "STREFA CHWYTU (-45cm)" : "MANTLE GRAB ZONE (-45cm)") : (isPl ? "KRAWĘDŹ BEZ CHWYTU" : "STRICT LIP (NO GRAB)"),
          mantleOn ? "#34d399" : "#fb7185",
          cssW, cssH, isCompact ? 8.5 : 9.5
        );
      }
      const g2 = projectToScreen(viewProj, RELIC_X, RELIC_Y + 0.72, 0.0, cssW, cssH);
      if (g2) {
        const safeGx = (!isCompact && !document.body.classList.contains("no-hud") && g2.y < 235) ? Math.min(g2.x, cssW - 405) : g2.x;
        drawWorldPill(ctx, safeGx, g2.y, isPl ? "RELIKT ŚWIĄTYNI ★" : "TEMPLE RELIC ★", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Live Hero Mantle Status Pill
      const hp = projectToScreen(viewProj, player.x, player.y + 2.02, 0.0, cssW, cssH);
      if (hp) {
        let txt = isPl ? "A/D BIEG · SPACJA SKOK" : "A/D RUN · SPACE JUMP";
        let col = "#e2e8f0";
        if (player.mantling || player.mantleFlash > 0.20) {
          txt = isPl ? `CHWYT KRAWĘDZI! +${player.lastGrabCm}cm ✓` : `MANTLE GRAB! +${player.lastGrabCm}cm ✓`;
          col = "#34d399";
        } else if (player.bumpFlash > 0.20) {
          txt = isPl ? "ZA KRÓTKI SKOK! (SPADA) ✗" : "FELL SHORT! ✗";
          col = "#f87171";
        } else if (player.relicFlash > 0.20) {
          txt = isPl ? "SZCZYT ZDOBYTY! ★" : "ROOFTOP SUMMIT! ★";
          col = "#facc15";
        } else if (!player.grounded) {
          txt = isPl ? "KRÓTKI SKOK (~30cm PONIŻEJ)" : "SHORT LEAP (~30cm BELOW LIP)";
          col = "#67e8f9";
        }
        const safeHx = (!isCompact && !document.body.classList.contains("no-hud") && hp.y < 235) ? Math.min(hp.x, cssW - 405) : hp.x;
        drawWorldPill(ctx, safeHx, hp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${mantleOn ? "AUTO-MANTLE: ON" : "STRICT CAPSULE"} · Mantles ${player.mantles} · Falls ${player.falls}`,
          mantleOn ? "#34d399" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 330, panelH = 166, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 20, 22, 0.90)";
        ctx.strokeStyle = mantleOn ? "rgba(52, 211, 153, 0.85)" : "rgba(248, 113, 113, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = mantleOn ? "#34d399" : "#f87171";
        ctx.fillText(
          mantleOn
            ? (isPl ? "AUTO-MANTLE: WŁ · STREFA 45cm · VAULT 0.32s" : "AUTO-MANTLE: ON · 45cm GRAB · 0.32s VAULT")
            : (isPl ? "STRICT CAPSULE: WYŁ · BRAK CHWYTU KRAWĘDZI!" : "STRICT CAPSULE: OFF · ZERO LEDGE FORGIVENESS!"),
          px + 12, py + 21, bw
        );

        // Dual Forward Probe status readout bar (Head Ray + Chest Ray)
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 18, 4); ctx.fill();
        const halfBar = (bw - 6) * 0.5;
        ctx.fillStyle = player.headClear ? "#10b981" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, halfBar, 18, 4); ctx.fill();
        ctx.fillStyle = player.chestHit ? "#f59e0b" : "#334155";
        ctx.beginPath(); ctx.roundRect(px + 18 + halfBar, py + 34, halfBar, 18, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(player.headClear ? (isPl ? "GŁOWA: POWIETRZE" : "HEAD RAY: OPEN") : (isPl ? "GŁOWA: ŚCIANA" : "HEAD RAY: WALL"), px + 12 + halfBar * 0.5, py + 46.5, halfBar - 6);
        ctx.fillText(player.chestHit ? (isPl ? "KLATKA: ŚCIANA!" : "CHEST RAY: HIT!") : (isPl ? "KLATKA: WOLNA" : "CHEST RAY: AIR"), px + 18 + halfBar * 1.5, py + 46.5, halfBar - 6);

        ctx.textAlign = "left";
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#6ee7b7";
        ctx.fillText(isPl ? `Wspinaczki (Mantles): ${player.mantles} · Ostatni: +${player.lastGrabCm}cm` : `Auto-Mantles: ${player.mantles} · Last Lift: +${player.lastGrabCm}cm`, px + 12, py + 76, bw);
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Upadki w kanion (Falls): ${player.falls} · Relikty: ${player.relics}` : `Canyon Falls: ${player.falls} · Relics Reached: ${player.relics}`, px + 12, py + 98, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "V = Test Krótkiego Skoku · A/D = Bieg · Spacja" : "V = Short-Jump Test · A/D = Run · Space = Jump", px + 12, py + 124, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "T = Auto-Mantle WŁ / Strict Capsule WYŁ" : "T = Auto-Mantle ON / Strict Capsule OFF", px + 12, py + 148, bw);
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
          id: "toggle-mantle",
          label: mantleOn
            ? (pl ? "Auto-Mantle: WŁ [T]" : "Auto-Mantle: ON [T]")
            : (pl ? "Strict Capsule (WYŁ) [T]" : "Strict Capsule (OFF) [T]"),
          pressed: mantleOn,
        },
        {
          id: "short-jump",
          label: pl ? "Test Krótkiego Skoku [V]" : "Short-Jump Test [V]",
          pressed: player.mantling || player.bumpFlash > 0.25,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-mantle") {
        mantleOn = !mantleOn;
        audio?.ruleSwitch?.(mantleOn);
        autoDemo = true;
        launchShortJumpTest({ ledgeIdx: 1, silent: false });
      } else if (id === "short-jump") {
        autoDemo = false;
        launchShortJumpTest({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-mantle");
      else if (code === "KeyV") this.onAction("short-jump");
      else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
        userInteracted = true;
        autoDemo = false;
        doJump(false);
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const tint = player.bumpFlash > 0.1
        ? [1.0, 0.20, 0.28, player.bumpFlash * 0.78]
        : (player.mantling || player.mantleFlash > 0.1
            ? [0.20, 0.96, 0.62, Math.max(player.mantling ? 0.48 : 0, player.mantleFlash * 0.55)]
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
          scale: 0.94,
          animMode: 2,
          tint,
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Glowing Green 3D X-Ray Auto-Mantle Grab Zones (0.45m below each top rooftop lip!)
          const zoneCol = mantleOn ? [0.18, 0.96, 0.58, 0.70] : [1.0, 0.26, 0.32, 0.36];
          for (let i = 1; i < ROOFS.length; i++) {
            const r = ROOFS[i];
            fx.xrayBox(r.x0 - 0.52, r.x0 + 0.02, r.y - GRAB_DEPTH, r.y, -1.25, 1.25, zoneCol);
          }

          // Dual Forward Probe Rays (Upper Head Ray + Lower Chest Ray!)
          const dir = player.yaw >= 0 ? 1 : -1;
          const headY = player.y + HEAD_RAY_H;
          const chestY = player.y + CHEST_RAY_H;
          const headCol = player.headClear ? [0.18, 0.98, 0.68, 0.92] : [1.0, 0.24, 0.28, 0.92];
          const chestCol = player.chestHit ? [1.0, 0.78, 0.16, 0.96] : [0.34, 0.82, 0.96, 0.75];

          fx.beam(player.x, headY, 0.0, player.x + dir * PROBE_LEN, headY, 0.0, 0.11, headCol, 0);
          fx.beam(player.x, chestY, 0.0, player.x + dir * PROBE_LEN, chestY, 0.0, 0.11, chestCol, 0);
          fx.billboard(player.x + dir * PROBE_LEN, headY, 0.0, 0.14, basis.right, basis.up, headCol, 2);
          fx.billboard(player.x + dir * PROBE_LEN, chestY, 0.0, 0.16, basis.right, basis.up, chestCol, 2);

          // Crisp upward vault arc sparkle during/after Auto-Mantle!
          if (player.mantling || player.mantleFlash > 0.08) {
            fx.beam(player.mStartX, player.mStartY + 0.65, 0.18, player.mEndX, player.mEndY + 0.20, 0.18, 0.16, [0.22, 0.98, 0.64, Math.max(0.45, player.mantleFlash)], 4);
            fx.billboard(player.mStartX + 0.25, player.mEndY, 0.20, 0.36 * Math.max(0.5, player.mantleFlash), basis.right, basis.up, [0.22, 0.98, 0.66, 0.85], 2);
          }

          // Crimson chest-bump spark when strict capsule fails!
          if (player.bumpFlash > 0.08) {
            fx.billboard(player.x + dir * HALF_W, chestY, 0.15, 0.48 * player.bumpFlash, basis.right, basis.up, [1.0, 0.22, 0.28, player.bumpFlash], 2);
          }

          // Radiant halo around the Golden Temple Relic on Roof 3
          const rp = 0.86 + 0.14 * Math.sin(time * 4.4);
          fx.billboard(RELIC_X, RELIC_Y, 0.0, 0.72 * rp, basis.right, basis.up, [1.0, 0.84, 0.20, 0.68], 2);
          fx.ringXZ(player.x, player.y + 0.04, 0.0, 0.56, player.bumpFlash > 0.1 ? [1.0, 0.22, 0.28, 0.88] : [0.22, 0.96, 0.64, 0.76]);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        mantleOn,
        status: player.status,
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        mantling: player.mantling,
        mantles: player.mantles,
        falls: player.falls,
        relics: player.relics,
        lastGrabCm: player.lastGrabCm,
      };
    },
  };
}
