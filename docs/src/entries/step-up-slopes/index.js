// Entry #30: Character Controller (Step-Up & Slope Limits) — Playable 3D Parkour Physics Course!
// Shows the 2 hidden rules inside every great character controller:
// (1) Auto Step-Up smoothly climbs 28cm curbs without snagging, AND
// (2) Max Slope Limit (45°) lets you walk 26° ramps while sliding off 58° hazard cliffs (no Skyrim-horse glitch)!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const CURB_X = -2.75;
const CURB_H = 0.28;
const RAMP_X0 = -1.20;
const RAMP_X1 =  1.25;
const RAMP_TOP_H = 1.48; // ~26° smooth walkable slope!
const PLATEAU_X1 = 2.45;
const CLIFF_X0 = 3.25;
const CLIFF_X1 = 4.65;
const CLIFF_TOP_H = 2.25; // ~58° too-steep hazard cliff (> 45° limit)!

function surfaceAt(x) {
  if (x < CURB_X) return { h: 0.0, slopeDeg: 0, zone: "FLAT" };
  if (x < RAMP_X0) return { h: CURB_H, slopeDeg: 0, zone: "CURB_DECK" };
  if (x <= RAMP_X1) {
    const t = (x - RAMP_X0) / (RAMP_X1 - RAMP_X0);
    return { h: CURB_H + t * (RAMP_TOP_H - CURB_H), slopeDeg: 26, zone: "RAMP_26" };
  }
  if (x <= PLATEAU_X1) return { h: RAMP_TOP_H, slopeDeg: 0, zone: "PLATEAU" };
  if (x < CLIFF_X0) return { h: 0.0, slopeDeg: 0, zone: "PIT" };
  if (x <= CLIFF_X1) {
    const t = (x - CLIFF_X0) / (CLIFF_X1 - CLIFF_X0);
    return { h: t * CLIFF_TOP_H, slopeDeg: 58, zone: "CLIFF_58" };
  }
  return { h: CLIFF_TOP_H, slopeDeg: 0, zone: "CLIFF_TOP" };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.05, 0.03, 0.11],
    skyMid: [0.14, 0.08, 0.22],
    skyBot: [0.24, 0.13, 0.28],
    lightDir: [0.36, 0.86, 0.38],
    orthoHalf: 10.5,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build 3-Zone Character Controller Test Course along X:
  // 1) 28cm Curb Step, 2) Walkable 26° Emerald Ramp, 3) Too-Steep 58° Crimson Hazard Cliff!
  const wBuf = [];
  // Ground floor
  pushBox(wBuf, -7.0, 6.8, -0.5, 0.0, -3.2, 3.2, [0.22, 0.24, 0.34], 0);
  // Zone 1: 28cm Stone Curb Deck (x = -2.75 .. -1.20)
  pushBox(wBuf, CURB_X, RAMP_X0, 0.0, CURB_H, -1.75, 1.75, [0.52, 0.56, 0.66], 1);
  // Bright amber stripe marking the 28cm vertical curb lip!
  pushBox(wBuf, CURB_X - 0.04, CURB_X + 0.06, 0.0, CURB_H + 0.01, -1.76, 1.76, [0.98, 0.72, 0.14], 2);

  // Zone 2: Walkable 26° Ramp (28 fine strips -> smooth angled slope!)
  const rSteps = 28;
  for (let i = 0; i < rSteps; i++) {
    const t0 = i / rSteps, t1 = (i + 1) / rSteps;
    const sx0 = RAMP_X0 + t0 * (RAMP_X1 - RAMP_X0);
    const sx1 = RAMP_X0 + t1 * (RAMP_X1 - RAMP_X0);
    const sh = CURB_H + t1 * (RAMP_TOP_H - CURB_H);
    pushBox(wBuf, sx0, sx1 + 0.01, 0.0, sh, -1.75, 1.75, [0.20, 0.68, 0.48], 4);
  }
  // Upper Walkable Plateau
  pushBox(wBuf, RAMP_X1, PLATEAU_X1, 0.0, RAMP_TOP_H, -1.75, 1.75, [0.28, 0.72, 0.52], 0);

  // Zone 3: Too-Steep 58° Hazard Cliff (24 steep strips!) + Top Ledge + Safety Chevron Base
  const cSteps = 24;
  for (let i = 0; i < cSteps; i++) {
    const t0 = i / cSteps, t1 = (i + 1) / cSteps;
    const sx0 = CLIFF_X0 + t0 * (CLIFF_X1 - CLIFF_X0);
    const sx1 = CLIFF_X0 + t1 * (CLIFF_X1 - CLIFF_X0);
    const sh = t1 * CLIFF_TOP_H;
    pushBox(wBuf, sx0, sx1 + 0.01, 0.0, sh, -1.75, 1.75, [0.84, 0.22, 0.34], 1);
  }
  pushBox(wBuf, CLIFF_X1, 6.2, 0.0, CLIFF_TOP_H, -1.75, 1.75, [0.64, 0.24, 0.34], 1);
  pushBox(wBuf, PLATEAU_X1 + 0.05, CLIFF_X0, 0.0, 0.04, -1.75, 1.75, [1, 0.7, 0.1], 5);
  studio.setWorldData(wBuf);

  // Side-3/4 camera angle showcasing the Curb, 26° Ramp & 58° Cliff silhouette in one crystal-clear frame!
  const defaultCam = { yaw: 0.0, pitch: 0.26, dist: 14.5, targetX: 0.25, targetY: 1.25, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let smartOn = true; // ON: Auto Step-Up (30cm) + 45° Max Slope Slide | OFF: Snags on 28cm Curb & Horse-Climbs 58° Cliff!
  let autoDemo = true;
  let cliffTest = false;
  let userInteracted = false;

  const player = {
    x: -4.2, y: 0.0, yaw: Math.PI * 0.5, walkPhase: 0, speedNorm: 0,
    status: "RUNNING", // STEP_UP | WALK_26 | SLIDE_BLOCKED | CURB_STUCK | CLIFF_GLITCH
    stepUps: 0,
    curbSnags: 0,
    cliffSlides: 0,
    cliffGlitches: 0,
  };

  let bannerText = "";
  let bannerColor = "#ec4899";
  let bannerTimer = 0;
  function setBanner(t, c = "#ec4899", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0; autoDemo = true; cliffTest = false;
    player.x = -4.3; player.y = 0.0; player.yaw = Math.PI * 0.5;
    player.walkPhase = 0; player.speedNorm = 0; player.status = "RUNNING";
    player.stepUps = 0; player.curbSnags = 0; player.cliffSlides = 0; player.cliffGlitches = 0;
    bannerTimer = 0;
  }
  reset();

  function triggerCliffTest({ silent = false } = {}) {
    cliffTest = true;
    autoDemo = false;
    player.x = PLATEAU_X1 + 0.35; // Drop right in front of the 58° Hazard Cliff!
    player.y = 0.0;
    player.yaw = Math.PI * 0.5;
    if (!silent) audio?.ruleSwitch?.(true);
    if (!silent) {
      setBanner(
        smartOn
          ? "58° CLIFF TEST: SMART CONTROLLER BLOCKS & SLIDES BACK (>45° LIMIT) ✓"
          : "58° CLIFF TEST: NAIVE CAPSULE GLITCH-CLIMBS STRAIGHT UP THE 58° WALL! ✗",
        smartOn ? "#4ade80" : "#f87171",
        2.1
      );
    }
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    let dir = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) dir -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) dir += 1;
    if (dir !== 0) { autoDemo = false; cliffTest = false; userInteracted = true; }
    else if (cliffTest || autoDemo) { dir = 1; }

    const prevX = player.x;
    const prevSurf = surfaceAt(prevX);
    const speed = 2.65;
    let nextX = clamp(prevX + dir * speed * dt, -5.6, 5.4);
    const nextSurf = surfaceAt(nextX);
    const stepDelta = nextSurf.h - prevSurf.h;

    if (smartOn) {
      // 1) Auto Step-Up up to 0.35m!
      if (dir > 0 && prevX < CURB_X && nextX >= CURB_X && stepDelta <= 0.35) {
        player.stepUps++;
        player.status = "STEP_UP";
        if (userInteracted) audio?.jump?.();
      }
      // 2) Enforce 45° Max Slope Limit on the 58° Hazard Cliff!
      if (nextSurf.slopeDeg > 45) {
        // Slide back gently off the steep face instead of mountain-goating up!
        nextX = Math.max(PLATEAU_X1 + 0.25, prevX - 1.2 * dt);
        if (player.status !== "SLIDE_BLOCKED") {
          player.cliffSlides++;
          if (userInteracted) audio?.inputIgnored?.();
        }
        player.status = "SLIDE_BLOCKED";
      } else if (nextSurf.zone === "RAMP_26") {
        player.status = "WALK_26";
      } else if (nextSurf.zone === "CURB_DECK") {
        player.status = "STEP_UP";
      } else {
        player.status = "RUNNING";
      }
    } else {
      // NAIVE CAPSULE PHYSICS (OFF):
      // 1) Snags DEAD-STOP against the tiny 28cm vertical curb!
      if (dir > 0 && prevX < CURB_X && nextX >= CURB_X - 0.18) {
        nextX = CURB_X - 0.19;
        if (player.status !== "CURB_STUCK") {
          player.curbSnags++;
          if (userInteracted) audio?.inputIgnored?.();
        }
        player.status = "CURB_STUCK";
      } else if (nextSurf.slopeDeg > 45) {
        // 2) No slope-angle limit: glitches right up the 58° wall!
        if (player.status !== "CLIFF_GLITCH") player.cliffGlitches++;
        player.status = "CLIFF_GLITCH";
      } else {
        player.status = "RUNNING";
      }
    }

    player.x = nextX;
    player.y = surfaceAt(player.x).h;
    if (dir !== 0) {
      player.yaw = dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      player.walkPhase += dt * 10.5;
      player.speedNorm = 1.0;
    } else {
      player.speedNorm = 0.0;
    }

    // Loop smoothly in Auto-Demo once reaching the far cliff or bouncing off the 58° wall for a moment
    if (autoDemo && ((smartOn && player.x > PLATEAU_X1 + 0.55 && Math.sin(time * 0.9) > 0.85) || player.x >= 5.2)) {
      player.x = -4.6;
      player.y = 0.0;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Static 3-Zone Course Signposts cleanly positioned
      const z1 = projectToScreen(viewProj, CURB_X, 0.95, -1.6, cssW, cssH);
      if (z1) drawWorldPill(ctx, z1.x, z1.y, isPl ? "KRAWĘŻNIK 28cm" : "28cm CURB STEP", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
      const z2 = projectToScreen(viewProj, 0.1, 1.55, -1.6, cssW, cssH);
      if (z2) drawWorldPill(ctx, z2.x, z2.y, isPl ? "RAMPA 26° (OK ≤ 45°)" : "26° RAMP (OK ≤ 45°)", "#4ade80", cssW, cssH, isCompact ? 8.5 : 9.5);
      const z3 = projectToScreen(viewProj, CLIFF_X1 - 0.3, 2.75, -1.0, cssW, cssH);
      if (z3) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && z3.y < 230) ? Math.min(z3.x, cssW - 400) : z3.x;
        drawWorldPill(ctx, safeX, z3.y, isPl ? "KLIF 58° (>45° LIMIT!)" : "58° CLIFF (>45° LIMIT!)", "#fb7185", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Live Player Controller Status Pill!
      const pp = projectToScreen(viewProj, player.x, player.y + 2.15, 0.0, cssW, cssH);
      if (pp) {
        const meta = {
          STEP_UP:       { t: isPl ? "AUTO STEP-UP: WEJŚCIE 28cm ✓" : "AUTO STEP-UP: CLIMBED 28cm ✓", c: "#facc15" },
          WALK_26:       { t: isPl ? "RAMPA 26°: PŁYNNY CHÓD ✓" : "26° SLOPE: SMOOTH WALK ✓", c: "#4ade80" },
          SLIDE_BLOCKED: { t: isPl ? "58° > 45°: ZSUWA SIĘ (OK ✓)" : "58° > 45°: SLIDE BLOCKED ✓", c: "#22d3ee" },
          CURB_STUCK:    { t: isPl ? "ZABLOKOWANY NA 28cm KRAWĘŻNIKU! ✗" : "STUCK ON 28cm CURB! ✗", c: "#f87171" },
          CLIFF_GLITCH:  { t: isPl ? "GLITCH: WCHODZI PO ŚCIANIE 58°! ✗" : "GLITCH: CLIMBS 58° WALL! ✗", c: "#f87171" },
          RUNNING:       { t: isPl ? "KONTROLER GRACZA (A/D)" : "PLAYER CONTROLLER (A/D)", c: "#f8fafc" },
        }[player.status];
        drawWorldPill(ctx, pp.x, pp.y, meta.t, meta.c, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const curSurf = surfaceAt(player.x);
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${smartOn ? "SMART CTRL (Step 35cm · Max 45°)" : "NAIVE CAPSULE"} · Slope ${curSurf.slopeDeg}°`,
          smartOn ? "#ec4899" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 160, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(14, 10, 24, 0.90)";
        ctx.strokeStyle = smartOn ? "rgba(236, 72, 153, 0.84)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = smartOn ? "#f472b6" : "#f87171";
        ctx.fillText(smartOn ? "SMART CONTROLLER · STEP 35cm · MAX 45°" : "NAIVE CAPSULE · 0cm STEP · NO SLOPE CAP!", px + 12, py + 21, bw);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = curSurf.slopeDeg > 45 ? "#ef4444" : "#22c55e";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, Math.max(14, bw * (curSurf.slopeDeg / 65)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`GROUND SLOPE: ${curSurf.slopeDeg}°  (LIMIT: ${smartOn ? "45°" : "NONE"})`, px + 18, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Auto Step-Up: ${player.stepUps} · Blokady na progu: ${player.curbSnags}` : `Auto Step-Ups: ${player.stepUps} · Curb Snags: ${player.curbSnags}`, px + 12, py + 76, bw);
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Zsuwy 58°: ${player.cliffSlides} · Glitche ściany: ${player.cliffGlitches}` : `58° Slide Blocks: ${player.cliffSlides} · Wall Glitches: ${player.cliffGlitches}`, px + 12, py + 98, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "V = Test Klifu 58° · A/D = Biegnij" : "V = 58° Cliff Test · A/D = Run Course", px + 12, py + 122, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "T = Smart Kontroler / Naiwna Kapsuła" : "T = Smart Controller / Naive Capsule", px + 12, py + 144, bw);
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
        { id: "toggle-smart", label: smartOn ? (pl ? "Smart Kontroler: WŁ [T]" : "Smart Controller: ON [T]") : (pl ? "Naiwna Kapsuła (Błędy) [T]" : "Naive Capsule (Broken) [T]"), pressed: smartOn },
        { id: "cliff", label: pl ? "Test Klifu 58° [V]" : "58° Cliff Test [V]", pressed: cliffTest },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-smart") {
        smartOn = !smartOn;
        audio?.ruleSwitch?.(smartOn);
        if (!smartOn) {
          // Place right before the 28cm curb so player immediately sees the Curb Snag!
          player.x = CURB_X - 0.9; player.y = 0.0; cliffTest = false; autoDemo = true;
          setBanner("NAIVE CAPSULE OFF: GETS DEAD-STUCK ON A TINY 28cm CURB!", "#f87171", 2.0);
        } else {
          setBanner("SMART CONTROLLER ON: AUTO STEP-UP 35cm + 45° SLOPE LIMIT!", "#4ade80", 2.0);
        }
      } else if (id === "cliff") {
        triggerCliffTest({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-smart");
      else if (code === "KeyV") this.onAction("cliff");
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const bad = player.status === "CURB_STUCK" || player.status === "CLIFF_GLITCH";
      const meshes = [
        {
          gpu: runnerGpu, x: player.x, y: player.y, z: 0.0, yaw: player.yaw,
          animA: player.walkPhase, animB: player.speedNorm, scale: 1.08, animMode: 2,
          tint: bad ? [1.0, 0.20, 0.28, 0.65] : [1, 1, 1, 0],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          // Draw lower-shin & upper-knee Step-Up probe rays directly in front of the Runner!
          const dir = player.yaw >= 0 ? 1 : -1;
          const col = bad ? [1.0, 0.22, 0.30, 0.92] : [0.96, 0.32, 0.72, 0.86];
          fx.beam(player.x, player.y + 0.16, 0.0, player.x + dir * 0.85, player.y + 0.16, 0.0, 0.08, [1.0, 0.76, 0.16, 0.86], 0);
          fx.beam(player.x, player.y + 0.44, 0.0, player.x + dir * 0.85, player.y + 0.44, 0.0, 0.08, [0.22, 0.96, 0.62, 0.86], 0);
          fx.ringXZ(player.x, player.y + 0.04, 0.0, 0.62, col);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        smartOn, status: player.status,
        x: Number(player.x.toFixed(2)),
        stepUps: player.stepUps, curbSnags: player.curbSnags,
        cliffSlides: player.cliffSlides, cliffGlitches: player.cliffGlitches,
      };
    },
  };
}
