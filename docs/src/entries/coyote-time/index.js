// Playable Entry #4: Coyote Time & Jump Buffering — Live 3D Floating-Islands Platformer!
// Run with A/D (or Arrows), jump with Space/W/Click (variable jump height!).
// Toggle Forgiving (110ms Coyote + 120ms Buffer) vs Strict (0 ms Raw Physics) and watch the live Millisecond Timing Gauge!
import { clamp, lerp } from "../../gl-utils.js";
import { createPlatformRenderer, ISLANDS, COINS_DEF, GOAL_X, GOAL_Y, projectPoint } from "./platform-renderer.js";

const COYOTE_WINDOW = 0.115; // 115 ms emerald invisible ledge grace after stepping off edge!
const BUFFER_WINDOW = 0.125; // 125 ms cyan jump queue before feet touch stone!
const RUN_SPEED = 7.4;
const GRAVITY = 27.5;
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

function drawTimingGauge(ctx, ow, state, lang) {
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 28, 392);
  const boxH = 82;
  const x = ow - boxW - 18;
  const y = 72;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.88)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.forgiving ? "#00e4ac" : "#f43f5e";
  ctx.stroke();

  // Header line: mode + counters
  const modeTxt = state.playerControl
    ? (pl
      ? `COYOTE ${state.coyoteSaves} · BUFOR ${state.bufferSaves} · ZJEDZONE ${state.missedInputs} · MONETY ${state.coinsCollected}/5`
      : `COYOTE ${state.coyoteSaves} · BUFFER ${state.bufferSaves} · DROPPED ${state.missedInputs} · COINS ${state.coinsCollected}/5`)
    : (pl ? `AUTO-DEMO · GRAJ: A/D + SPACJA (T = TRYB)` : `AUTO-DEMO · PLAY: A/D + SPACE (T = MODE)`);

  ctx.font = "700 11px 'Courier New', monospace";
  ctx.fillStyle = state.playerControl ? (state.forgiving ? "#76ddaf" : "#fda4af") : "#ffe1a2";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(modeTxt, x + 12, y + 17);

  // Millisecond Timing Bar: [-125 ms EARLY (BUFFER)] --- 0 ms (GROUND/EDGE) --- [+115 ms LATE (COYOTE)]
  const barX = x + 14;
  const barY = y + 36;
  const barW = boxW - 28;
  const barH = 16;
  const midX = barX + barW * 0.52;

  // Bar background
  ctx.fillStyle = "rgba(10,12,24,0.85)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 4);
  ctx.fill();

  if (state.forgiving) {
    // Cyan Jump Buffer zone (left of 0 ms)
    const bufW = barW * 0.42;
    ctx.fillStyle = "rgba(56,189,248,0.42)";
    ctx.fillRect(midX - bufW, barY + 1, bufW, barH - 2);
    // Emerald Coyote Time zone (right of 0 ms)
    const coyW = barW * 0.38;
    ctx.fillStyle = "rgba(16,185,129,0.48)";
    ctx.fillRect(midX, barY + 1, coyW, barH - 2);
  } else {
    // Strict 0 ms: tiny hairline only!
    ctx.fillStyle = "rgba(244,63,94,0.22)";
    ctx.fillRect(barX + 1, barY + 1, barW - 2, barH - 2);
  }

  // Center 0 ms ground/edge tick
  ctx.fillStyle = "#ffe1a2";
  ctx.fillRect(midX - 1.5, barY - 2, 3, barH + 4);

  // Plot last jump timing delta dot!
  if (state.lastPress) {
    const ms = clamp(state.lastPress.ms, -150, 150);
    const px = midX + (ms / 150) * (barW * 0.48);
    ctx.beginPath();
    ctx.arc(px, barY + barH * 0.5, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = state.lastPress.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  // Labels below bar
  ctx.font = "700 10.5px 'Courier New', monospace";
  ctx.fillStyle = "#7dd3fc";
  ctx.textAlign = "left";
  ctx.fillText(pl ? "-125ms BUFOR" : "-125ms BUFFER", barX, y + 66);
  ctx.fillStyle = "#ffe1a2";
  ctx.textAlign = "center";
  ctx.fillText(state.lastPress ? state.lastPress.label : "0 ms", midX, y + 66);
  ctx.fillStyle = "#6ee7b7";
  ctx.textAlign = "right";
  ctx.fillText("+115ms COYOTE", barX + barW, y + 66);

  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createPlatformRenderer(gl);

  let forgiving = true; // true = 115ms Coyote + 125ms Buffer; false = 0 ms Strict Raw Physics!
  let followCam = true;
  let playerControl = false;
  let prevPlayerControl = false;
  let time = 0;

  let coyoteSaves = 0;
  let bufferSaves = 0;
  let missedInputs = 0;
  let clears = 0;
  let alertFlash = 0;
  let lastPress = null; // { ms, label, color }
  let banner = null;    // { text, bg, fg, timer }
  let trailAcc = 0;
  let activeTrailColor = [0.45, 0.95, 0.72];

  const coins = COINS_DEF.map((c) => ({ ...c, collected: false }));
  const trails = [];
  const rings = [];
  const sparks = [];

  const runner = {
    x: -1.6, y: 0.0, z: 0.0,
    vx: 0, vy: 0,
    yaw: Math.PI * 0.5,
    tilt: 0,
    runPhase: 0, runAmp: 0, airBlend: 0, squash: 0,
    grounded: true,
    islandId: 0,
    lastIslandId: 0,
    coyoteTimer: 0,
    timeSinceLeftGround: 0,
    bufferTimer: 0,
    bufferPressTime: -99,
    jumpHeld: false,
    flash: [1, 1, 1, 0],
    respawnTimer: 0,
    winTimer: 0,
  };

  let camFollowX = runner.x + 2.6;
  let camFollowY = 1.1;

  // Auto-Demo state so visitors immediately watch Coyote Saves & Buffered Jumps live!
  const demo = { triggeredCoyote: new Set(), triggeredBuffer: new Set() };

  function spawnSparks(x, y, z, col, count = 12, spread = 2.6, lift = 2.4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * spread;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: lift * (0.4 + Math.random() * 0.8),
        vz: Math.sin(a) * sp * 0.6,
        r: col[0], g: col[1], b: col[2],
        life: 0.75 + Math.random() * 0.35,
        size: 0.13 + Math.random() * 0.09,
      });
    }
  }

  function spawnRing(x, y, z, col, maxRad = 1.65) {
    rings.push({ x, y, z, rad: 0.25, maxRad, r: col[0], g: col[1], b: col[2], a: 0.95 });
  }

  function showBanner(text, bg, fg = "#ffffff", dur = 0.95) {
    banner = { text, bg, fg, timer: dur };
  }

  function findSupportIsland(x, y, prevY) {
    for (const isl of ISLANDS) {
      if (x >= isl.x0 - 0.18 && x <= isl.x1 + 0.18) {
        if (prevY >= isl.y - 0.14 && y <= isl.y + 0.08) {
          return isl;
        }
      }
    }
    return null;
  }

  function resetRun(keepStats = false) {
    runner.x = -1.8;
    runner.y = 0.0;
    runner.z = 0.0;
    runner.vx = 0;
    runner.vy = 0;
    runner.yaw = Math.PI * 0.5;
    runner.tilt = 0;
    runner.runPhase = 0;
    runner.runAmp = 0;
    runner.airBlend = 0;
    runner.squash = 0;
    runner.grounded = true;
    runner.islandId = 0;
    runner.lastIslandId = 0;
    runner.coyoteTimer = 0;
    runner.timeSinceLeftGround = 0;
    runner.bufferTimer = 0;
    runner.flash = [1, 1, 1, 0];
    runner.respawnTimer = 0;
    runner.winTimer = 0;
    camFollowX = runner.x + 2.8;
    camFollowY = 1.1;
    trails.length = 0;
    rings.length = 0;
    sparks.length = 0;
    demo.triggeredCoyote.clear();
    demo.triggeredBuffer.clear();
    for (let i = 0; i < coins.length; i++) coins[i].collected = false;
    if (!keepStats) {
      coyoteSaves = 0;
      bufferSaves = 0;
      missedInputs = 0;
      clears = 0;
      lastPress = null;
      banner = null;
    }
  }
  resetRun(false);

  function executeJump(kind = "normal", deltaMs = 0) {
    runner.vy = JUMP_VEL;
    runner.grounded = false;
    runner.coyoteTimer = 0;
    runner.bufferTimer = 0;
    runner.squash = 0.85; // crisp jump stretch!
    runner.jumpHeld = true;

    if (kind === "coyote") {
      coyoteSaves++;
      activeTrailColor = [0.16, 0.96, 0.65];
      runner.flash = [0.16, 1.0, 0.68, 1.0];
      spawnRing(runner.x, runner.y + 0.05, runner.z, [0.16, 0.98, 0.68], 1.85);
      spawnSparks(runner.x, runner.y + 0.08, runner.z, [0.22, 1.0, 0.72], 16, 3.0, 2.2);
      const msStr = `+${Math.round(deltaMs)} ms`;
      lastPress = { ms: deltaMs, label: `COYOTE ${msStr}`, color: "#10b981" };
      showBanner(`COYOTE SAVE! (${msStr})`, "#10b981", "#042117", 1.05);
      audio?.coyoteSave?.();
    } else if (kind === "buffer") {
      bufferSaves++;
      activeTrailColor = [0.22, 0.85, 1.0];
      runner.flash = [0.24, 0.88, 1.0, 1.0];
      spawnRing(runner.x, runner.y + 0.05, runner.z, [0.25, 0.88, 1.0], 1.85);
      spawnSparks(runner.x, runner.y + 0.08, runner.z, [0.35, 0.92, 1.0], 16, 3.0, 2.5);
      const msStr = `-${Math.round(deltaMs)} ms`;
      lastPress = { ms: -deltaMs, label: `BUFFER ${msStr}`, color: "#38bdf8" };
      showBanner(`BUFFERED JUMP! (${msStr})`, "#38bdf8", "#041b26", 1.05);
      audio?.bufferLaunch?.();
    } else {
      activeTrailColor = [0.96, 0.82, 0.34];
      spawnRing(runner.x, runner.y + 0.04, runner.z, [0.95, 0.84, 0.42], 1.25);
      spawnSparks(runner.x, runner.y + 0.05, runner.z, [0.92, 0.86, 0.72], 8, 2.0, 1.4);
      lastPress = { ms: 0, label: "ON GROUND (0 ms)", color: "#fbbf24" };
      audio?.jump?.();
    }
    requestHudRefresh?.();
  }

  function handleJumpPress() {
    if (runner.respawnTimer > 0 || runner.winTimer > 0) return;

    // 1) Normal grounded jump
    if (runner.grounded) {
      executeJump("normal", 0);
      return;
    }

    // 2) Coyote Time check (pressed shortly AFTER stepping off a cliff!)
    if (forgiving && runner.coyoteTimer > 0) {
      const lateMs = Math.max(8, runner.timeSinceLeftGround * 1000);
      executeJump("coyote", lateMs);
      return;
    }

    // 3) Mid-air Jump Buffer check (pressed slightly BEFORE landing!)
    if (forgiving && runner.vy < 2.2) {
      runner.bufferTimer = BUFFER_WINDOW;
      runner.bufferPressTime = time;
      spawnSparks(runner.x, runner.y + 0.14, runner.z, [0.30, 0.90, 1.0], 6, 1.4, 0.8);
      return;
    }

    // 4) Strict mode (0 ms) -> Input DROPPED / IGNORED!
    if (!forgiving) {
      missedInputs++;
      alertFlash = 1.0;
      runner.flash = [1.0, 0.22, 0.25, 1.0];
      spawnRing(runner.x, runner.y + 0.12, runner.z, [0.98, 0.24, 0.28], 1.35);
      spawnSparks(runner.x, runner.y + 0.15, runner.z, [1.0, 0.26, 0.30], 10, 2.4, 1.6);
      if (runner.timeSinceLeftGround > 0 && runner.timeSinceLeftGround < 0.28 && runner.vy <= 0.5) {
        const lateMs = Math.round(runner.timeSinceLeftGround * 1000);
        lastPress = { ms: lateMs, label: `IGNORED (+${lateMs}ms)`, color: "#f43f5e" };
        showBanner(`JUMP IGNORED! (+${lateMs} ms LATE)`, "#ef4444", "#ffffff", 1.0);
      } else {
        lastPress = { ms: -65, label: "IGNORED (IN AIR)", color: "#f43f5e" };
        showBanner("JUMP IGNORED! (EARLY / AIR)", "#ef4444", "#ffffff", 1.0);
      }
      audio?.inputIgnored?.();
      requestHudRefresh?.();
    }
  }

  function updateAutoDemo() {
    // Showcase BOTH tricks gracefully in Auto-Demo until the visitor takes control!
    const x = runner.x;
    // Island 0 -> Coyote Time showcase right past x1=3.4!
    if (forgiving) {
      if (!runner.grounded && runner.coyoteTimer > 0 && runner.timeSinceLeftGround >= 0.072 && !demo.triggeredCoyote.has(runner.lastIslandId)) {
        if (runner.lastIslandId === 0 || runner.lastIslandId === 1 || runner.lastIslandId === 4) {
          demo.triggeredCoyote.add(runner.lastIslandId);
          handleJumpPress();
        }
      }
      // Island 2 & 3 -> Jump Buffering showcase: press jump ~75ms before landing on islands 2 & 3!
      for (const targetId of [2, 3]) {
        const isl = ISLANDS[targetId];
        if (!runner.grounded && runner.vy < -1.5 && x >= isl.x0 + 0.1 && x <= isl.x1 - 0.1) {
          const distY = runner.y - isl.y;
          if (distY > 0.12 && distY < 0.72 && !demo.triggeredBuffer.has(targetId)) {
            demo.triggeredBuffer.add(targetId);
            handleJumpPress();
          }
        }
      }
      // If standing on island 2/3 past midpoint without buffered launch, jump normally
      if (runner.grounded && (runner.islandId === 2 || runner.islandId === 3) && x > ISLANDS[runner.islandId].x1 - 0.55) {
        handleJumpPress();
      }
    } else {
      // Strict mode demo: demonstrate late-edge press getting IGNORED right after x1=3.4!
      if (!runner.grounded && runner.timeSinceLeftGround >= 0.055 && !demo.triggeredCoyote.has(runner.lastIslandId)) {
        demo.triggeredCoyote.add(runner.lastIslandId);
        handleJumpPress();
      }
    }
    return 1; // run right
  }

  function update(dt, keys = new Set()) {
    const h = Math.min(0.035, Math.max(0.001, dt));
    time += h;
    alertFlash = Math.max(0, alertFlash - h * 2.6);
    runner.flash[3] = Math.max(0, runner.flash[3] - h * 3.2);
    runner.squash *= Math.exp(-12 * h);

    if (banner) {
      banner.timer -= h;
      if (banner.timer <= 0) banner = null;
    }

    const leftKey = keys.has("KeyA") || keys.has("ArrowLeft");
    const rightKey = keys.has("KeyD") || keys.has("ArrowRight");
    const jumpHoldKey = keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp");

    if (leftKey || rightKey || jumpHoldKey) playerControl = true;
    if (playerControl !== prevPlayerControl) {
      prevPlayerControl = playerControl;
      requestHudRefresh?.();
    }

    // Handle respawn or victory celebration timers
    if (runner.respawnTimer > 0) {
      runner.respawnTimer -= h;
      if (runner.respawnTimer <= 0) resetRun(true);
    } else if (runner.winTimer > 0) {
      runner.winTimer -= h;
      runner.vx *= Math.exp(-8 * h);
      runner.runAmp *= Math.exp(-8 * h);
      runner.yaw += (0 - runner.yaw) * Math.min(1, h * 7); // turn heroically toward camera!
      runner.tilt *= Math.exp(-8 * h);
      if (runner.winTimer <= 0) resetRun(true);
    } else {
      let moveDir = 0;
      if (playerControl) {
        moveDir = (rightKey ? 1 : 0) - (leftKey ? 1 : 0);
        if (!jumpHoldKey) runner.jumpHeld = false;
      } else {
        moveDir = updateAutoDemo();
      }

      // Crisp platformer horizontal acceleration & air control
      const targetVx = moveDir * RUN_SPEED;
      const accel = runner.grounded ? (moveDir !== 0 ? 18.0 : 16.0) : 10.5;
      runner.vx += (targetVx - runner.vx) * (1 - Math.exp(-accel * h));

      // Variable jump height (releasing Space early cuts upward momentum gently!)
      const effGrav = (runner.vy > 0 && !runner.jumpHeld && playerControl) ? GRAVITY * 1.85 : GRAVITY;
      if (!runner.grounded) {
        runner.vy -= effGrav * h;
        runner.timeSinceLeftGround += h;
        runner.coyoteTimer = Math.max(0, runner.coyoteTimer - h);
      } else {
        runner.vy = 0;
        runner.timeSinceLeftGround = 0;
        runner.coyoteTimer = forgiving ? COYOTE_WINDOW : 0;
      }
      runner.bufferTimer = Math.max(0, runner.bufferTimer - h);

      const prevY = runner.y;
      runner.x += runner.vx * h;
      runner.y += runner.vy * h;
      runner.x = Math.max(-4.0, Math.min(48.0, runner.x));

      // Ground & Island Edge Detection
      if (runner.grounded) {
        const curIsl = ISLANDS[runner.islandId];
        if (!curIsl || runner.x < curIsl.x0 - 0.16 || runner.x > curIsl.x1 + 0.16) {
          // Stepped off the cliff edge! Start Coyote Timer!
          runner.grounded = false;
          runner.lastIslandId = runner.islandId;
          runner.timeSinceLeftGround = 0.001;
          runner.coyoteTimer = forgiving ? COYOTE_WINDOW : 0;
        } else {
          runner.y = curIsl.y;
        }
      } else if (runner.vy <= 0) {
        const landIsl = findSupportIsland(runner.x, runner.y, prevY);
        if (landIsl) {
          runner.y = landIsl.y;
          runner.vy = 0;
          runner.grounded = true;
          runner.islandId = landIsl.id;
          runner.lastIslandId = landIsl.id;
          runner.squash = -0.68; // tactile landing squash!
          spawnSparks(runner.x, runner.y + 0.04, runner.z, [0.85, 0.82, 0.72], 7, 1.8, 0.9);
          audio?.land?.();

          // Instant Jump Buffer fire on touchdown!
          if (forgiving && runner.bufferTimer > 0) {
            const earlyMs = Math.max(8, (time - runner.bufferPressTime) * 1000);
            executeJump("buffer", earlyMs);
          }
        }
      }

      // Coin pickups
      for (const cn of coins) {
        if (!cn.collected && Math.hypot(runner.x - cn.x, (runner.y + 0.85) - cn.y) < 1.05) {
          cn.collected = true;
          spawnSparks(cn.x, cn.y, cn.z, [1.0, 0.86, 0.24], 14, 2.8, 2.2);
          spawnRing(cn.x, cn.y - 0.1, cn.z, [1.0, 0.86, 0.24], 1.15);
          audio?.coinPickup?.();
        }
      }

      // Summit Goal Shrine check!
      if (runner.grounded && runner.x >= GOAL_X - 0.9 && Math.abs(runner.y - GOAL_Y) < 0.5) {
        clears++;
        runner.winTimer = 1.65;
        spawnRing(GOAL_X, GOAL_Y + 0.1, 0, [1.0, 0.86, 0.24], 2.6);
        spawnSparks(GOAL_X, GOAL_Y + 1.5, 0, [1.0, 0.88, 0.25], 28, 4.5, 3.8);
        showBanner(`SUMMIT REACHED! (#${clears})`, "#f59e0b", "#1c1204", 1.5);
        audio?.goalWin?.();
        requestHudRefresh?.();
      }

      // Abyss fall check
      if (runner.y < -5.8) {
        runner.respawnTimer = 0.65;
        alertFlash = 0.9;
        showBanner("FELL INTO ABYSS!", "#ef4444", "#ffffff", 0.75);
        audio?.fallVoid?.();
      }

      // Smooth facing yaw, sprint lean & stride kinematics
      const targetYaw = Math.abs(runner.vx) > 0.3 ? (runner.vx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) : runner.yaw;
      runner.yaw += (targetYaw - runner.yaw) * (1 - Math.exp(-14 * h));
      const spdNorm = Math.min(1, Math.abs(runner.vx) / RUN_SPEED);
      const targetTilt = (runner.grounded ? 0.18 * spdNorm : clamp(-runner.vy * 0.022, -0.18, 0.24));
      runner.tilt += (targetTilt - runner.tilt) * (1 - Math.exp(-10 * h));
      runner.runAmp += ((runner.grounded ? spdNorm : 0) - runner.runAmp) * (1 - Math.exp(-12 * h));
      runner.airBlend += ((runner.grounded ? 0 : 1) - runner.airBlend) * (1 - Math.exp(-14 * h));
      if (runner.runAmp > 0.02) runner.runPhase += h * (4.2 + Math.abs(runner.vx) * 1.48);

      // Breadcrumb jump arc trail
      if (!runner.grounded) {
        trailAcc += h;
        if (trailAcc >= 0.036) {
          trailAcc = 0;
          trails.push({
            x: runner.x, y: runner.y + 0.24, z: runner.z,
            r: activeTrailColor[0], g: activeTrailColor[1], b: activeTrailColor[2],
            a: 0.85, size: 0.15,
          });
          if (trails.length > 42) trails.shift();
        }
      }
    }

    // Update trails, rings, sparks
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].a -= h * 0.58;
      if (trails[i].a <= 0.02) trails.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.rad = lerp(rg.rad, rg.maxRad, 1 - Math.exp(-8.5 * h));
      rg.a -= h * 1.9;
      if (rg.a <= 0.02) rings.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx * h;
      sp.y += sp.vy * h;
      sp.z += sp.vz * h;
      sp.vy -= 9.5 * h;
      sp.life -= h * 1.45;
      if (sp.life <= 0) sparks.splice(i, 1);
    }

    // Silky Follow-Cam Look-Ahead along the floating islands (framed cleanly above bottom-left card!)
    const lookAhead = clamp(runner.vx * 0.32, -1.6, 2.3);
    camFollowX += (clamp(runner.x + lookAhead, -0.5, 44.5) - camFollowX) * (1 - Math.exp(-5.2 * h));
    camFollowY += (clamp(runner.y * 0.38 + 0.22, -0.8, 2.4) - camFollowY) * (1 - Math.exp(-4.2 * h));
  }

  function getCameraOverride() {
    if (!followCam) {
      return { yaw: 0.04, pitch: 0.28, dist: 38.0, targetX: 22.0, targetY: 1.4, targetZ: 0.0, fovDeg: 40 };
    }
    return {
      yaw: 0.09,
      pitch: 0.22,
      dist: 15.2,
      targetX: camFollowX,
      targetY: camFollowY,
      targetZ: 0.0,
      fovDeg: 38,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    const coyoteFrac = (forgiving && !runner.grounded) ? clamp(runner.coyoteTimer / COYOTE_WINDOW, 0, 1) : 0;
    const bufferFrac = (forgiving && !runner.grounded) ? clamp(runner.bufferTimer / BUFFER_WINDOW, 0, 1) : 0;

    const { viewProj } = renderer.render({
      w, h, cam, time, runner,
      coyoteEnabled: forgiving,
      coyoteFrac,
      activeCoyoteIsland: runner.lastIslandId,
      coyoteReach: RUN_SPEED * COYOTE_WINDOW * 1.48,
      bufferFrac,
      coins,
      trails,
      rings,
      sparks,
      alertFlash,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const noHud = typeof document !== "undefined" && document.body.classList.contains("no-hud");
      if (!noHud) {
        const coinsCollected = coins.filter((c) => c.collected).length;
        drawTimingGauge(ovCtx, ow, {
          forgiving, playerControl, coyoteSaves, bufferSaves, missedInputs, coinsCollected, lastPress,
        }, lang);
      }

      // Floating badge over runner for active Coyote / Buffer / Ignored events
      if (banner) {
        const p = projectPoint([runner.x, runner.y + 2.55, runner.z], viewProj, ow, oh);
        if (p) drawBadge(ovCtx, p.x, p.y, banner.text, banner.bg, banner.fg, ow);
      } else if (forgiving && bufferFrac > 0.05) {
        const p = projectPoint([runner.x, runner.y + 2.35, runner.z], viewProj, ow, oh);
        if (p) drawBadge(ovCtx, p.x, p.y, "JUMP BUFFERED!", "#0284c7", "#ffffff", ow);
      } else if (forgiving && coyoteFrac > 0.05) {
        const p = projectPoint([runner.x, runner.y + 2.35, runner.z], viewProj, ow, oh);
        if (p) {
          const msLeft = Math.round(runner.coyoteTimer * 1000);
          drawBadge(ovCtx, p.x, p.y, `COYOTE ${msLeft} ms`, "#10b981", "#042117", ow);
        }
      }

      // Label the first emerald Coyote Ledge clearly in world space so newcomers immediately understand it!
      if (forgiving && runner.x < 11.0) {
        const pEdge = projectPoint([ISLANDS[0].x1 + 0.65, ISLANDS[0].y - 0.55, 1.3], viewProj, ow, oh);
        if (pEdge) {
          drawBadge(
            ovCtx, pEdge.x, pEdge.y,
            lang === "pl" ? "NIEWIDZIALNA PÓŁKA (115 ms)" : "INVISIBLE COYOTE LEDGE (115 ms)",
            "rgba(6,78,59,0.92)", "#6ee7b7", ow,
          );
        }
      }
    }
  }

  return {
    id: "coyote-time",
    defaultCam: { yaw: 0.10, pitch: 0.22, dist: 14.8, targetX: 1.0, targetY: 1.1, targetZ: 0.0, fovDeg: 38 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "forgiving", label: pl ? "Coyote + Bufor (Fair)" : "Coyote + Buffer (Fair)", pressed: forgiving },
        { id: "strict", label: pl ? "Strict (0 ms)" : "Strict (0 ms)", pressed: !forgiving },
        { id: "jump", label: pl ? "Skok (Spacja)" : "Jump (Space)", pressed: false },
        { id: "cam", label: followCam ? (pl ? "Kamera: Follow" : "Cam: Follow") : (pl ? "Kamera: Cały tor" : "Cam: Overview"), pressed: !followCam },
      ];
    },
    onAction(id) {
      if (id === "forgiving") { forgiving = true; resetRun(playerControl); }
      if (id === "strict") { forgiving = false; resetRun(playerControl); }
      if (id === "jump") { playerControl = true; handleJumpPress(); }
      if (id === "cam") { followCam = !followCam; }
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
        playerControl = true;
        handleJumpPress();
      }
      if (code === "KeyC") followCam = !followCam;
      if (code === "KeyT" || code === "KeyE" || code === "KeyF") {
        forgiving = !forgiving;
        resetRun(true);
      }
    },
    onKeyUp(code) {
      if (code === "Space" || code === "KeyW" || code === "ArrowUp") runner.jumpHeld = false;
    },
    onClickWorld(_world, { button }) {
      if (button === 0) {
        playerControl = true;
        handleJumpPress();
      }
    },
    getDebugState() {
      return {
        forgiving,
        playerControl,
        x: +runner.x.toFixed(2),
        y: +runner.y.toFixed(2),
        vx: +runner.vx.toFixed(2),
        vy: +runner.vy.toFixed(2),
        grounded: runner.grounded,
        coyoteSaves,
        bufferSaves,
        missedInputs,
        clears,
        coinsCollected: coins.filter((c) => c.collected).length,
        lastPress,
      };
    },
    reset: () => resetRun(false),
    update,
    render,
  };
}
