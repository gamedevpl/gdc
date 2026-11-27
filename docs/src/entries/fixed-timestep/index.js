// Entry #33: Fixed Timestep vs Frame-Rate dt Bugs — Playable 3D Dual-Lane Physics Lab!
// Compares a Reference Fixed 1/60s Accumulator + Alpha Interp lane (Back/Cyan) against a Subject lane
// (Front/Amber-Red) at 15/30/60/144 FPS: Raw dt at 15 FPS overshoots jumps & TUNNELS straight through
// a 22cm laser wall, while 144 FPS naive per-frame damping drags the runner short into the pit!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const LANE_REF_Z = -1.70;
const LANE_SUB_Z =  1.70;
const START_X = -4.20;
const GAP_X0 = -1.40;
const GAP_X1 =  1.20;
const WALL_X0 = 3.69;
const WALL_X1 = 3.91; // 0.22m thin laser wall!
const WALL_H = 2.10;
const FIXED_DT = 1 / 60;
const FPS_OPTIONS = [15, 30, 60, 144];

// Unified run/jump physics constants (tuned so 60Hz Fixed = clean chasm jump & crisp wall stop!)
const BASE_ACCEL = 11.2;
const PER_FRAME_DAMP = 0.968;
const BASE_VX = 5.65;
const MAX_VX = 7.40;
const JUMP_VY = 8.40;
const GRAVITY = 28.0;

function hasFloor(x) {
  return x <= GAP_X0 || x >= GAP_X1;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.04, 0.04, 0.09],
    skyMid: [0.08, 0.09, 0.16],
    skyBot: [0.13, 0.11, 0.19],
    lightDir: [0.32, 0.88, 0.38],
    ambLow: [0.11, 0.12, 0.18],
    ambHigh: [0.35, 0.38, 0.52],
    orthoHalf: 11.5,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Dual Parallel Physics Test Lanes + Chasm Pit + Twin Thin Glowing Laser Walls!
  const wBuf = [];
  // Deep pit floor beneath the central chasm
  pushBox(wBuf, GAP_X0 - 0.15, GAP_X1 + 0.15, -2.55, -2.25, -3.2, 3.2, [0.10, 0.09, 0.16], 0);
  pushBox(wBuf, GAP_X0 - 0.10, GAP_X1 + 0.10, -2.25, -2.20, -2.9, 2.9, [0.85, 0.22, 0.28], 5);

  const lanes = [
    { z: LANE_REF_Z, trim: [0.14, 0.88, 1.0], deck: [0.18, 0.24, 0.34] },
    { z: LANE_SUB_Z, trim: [1.0, 0.64, 0.14], deck: [0.24, 0.20, 0.30] },
  ];
  for (const ln of lanes) {
    const z0 = ln.z - 1.02, z1 = ln.z + 1.02;
    // Left launch track
    pushBox(wBuf, -6.2, GAP_X0, -0.55, 0.0, z0, z1, ln.deck, 0);
    // Right landing track
    pushBox(wBuf, GAP_X1, 6.4, -0.55, 0.0, z0, z1, ln.deck, 0);
    // Glowing lane border rails
    pushBox(wBuf, -6.15, GAP_X0, 0.0, 0.04, z0, z0 + 0.09, ln.trim, 2);
    pushBox(wBuf, -6.15, GAP_X0, 0.0, 0.04, z1 - 0.09, z1, ln.trim, 2);
    pushBox(wBuf, GAP_X1, 6.35, 0.0, 0.04, z0, z0 + 0.09, ln.trim, 2);
    pushBox(wBuf, GAP_X1, 6.35, 0.0, 0.04, z1 - 0.09, z1, ln.trim, 2);
    // Glowing Jump Launch Pad right at chasm edge
    pushBox(wBuf, -2.05, GAP_X0 - 0.04, 0.0, 0.05, z0 + 0.16, z1 - 0.16, ln.trim, 2);
    // Thin 22cm Glowing Laser Wall at x = 3.69 .. 3.91!
    pushBox(wBuf, WALL_X0 - 0.08, WALL_X1 + 0.08, 0.0, WALL_H + 0.18, z0 - 0.04, z0 + 0.18, [0.24, 0.26, 0.36], 1);
    pushBox(wBuf, WALL_X0 - 0.08, WALL_X1 + 0.08, 0.0, WALL_H + 0.18, z1 - 0.18, z1 + 0.04, [0.24, 0.26, 0.36], 1);
    pushBox(wBuf, WALL_X0, WALL_X1, 0.04, WALL_H, z0 + 0.16, z1 - 0.16, [1.0, 0.18, 0.36], 2);
    pushBox(wBuf, WALL_X0 - 0.22, WALL_X1 + 0.22, 0.0, 0.04, z0 + 0.12, z1 - 0.12, [1.0, 0.72, 0.14], 5);
  }

  // Central meter ruler divider between Back Lane & Front Lane
  pushBox(wBuf, -6.2, 6.4, -0.35, 0.04, -0.22, 0.22, [0.16, 0.18, 0.28], 1);
  for (let mx = -5; mx <= 5; mx++) {
    pushBox(wBuf, mx - 0.04, mx + 0.04, 0.04, 0.09, -0.24, 0.24, [0.45, 0.56, 0.78], 2);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.06, pitch: 0.42, dist: 15.8, targetX: 0.2, targetY: 0.95, targetZ: 0.2, fovDeg: 38 };

  let time = 0;
  let fixedOn = true; // ON: Fixed 1/60s Accumulator + Alpha Interp | OFF: Raw 1/simFps frame dt!
  let fpsIdx = 0;     // Default 15 FPS so toggling [T] immediately unleashes Euler overshoot + Wall Tunneling!
  let simFps = FPS_OPTIONS[fpsIdx];
  let userInteracted = false;

  function makeRunner() {
    return {
      x: START_X, y: 0.0, vx: BASE_VX, vy: 0.0,
      prevX: START_X, prevY: 0.0,
      renderX: START_X, renderY: 0.0,
      grounded: true, jumped: false,
      stoppedAtWall: false, tunnelled: false, fellInPit: false,
      walkPhase: 0, speedNorm: 1.0,
      maxY: 0,
      trail: [],
    };
  }

  let ref = makeRunner();
  let sub = makeRunner();
  let refAcc = 0;
  let subAcc = 0;
  let simTickAcc = 0;
  let lastSubsteps = 4;
  let lastAlpha = 0;
  let runTimer = 0;

  let wallTunnels = 0;
  let pitFalls = 0;
  let syncStops = 0;
  let runCounted = false;
  let tunnelFlash = 0;

  let bannerText = "";
  let bannerColor = "#38bdf8";
  let bannerTimer = 0;
  function setBanner(t, c = "#38bdf8", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function stepRunner(r, dt, isRawDt) {
    if (r.stoppedAtWall || r.fellInPit) {
      r.speedNorm = 0;
      return;
    }

    const prevX = r.x;
    const prevY = r.y;

    // Auto-jump right off the launch pad before the chasm!
    if (r.grounded && !r.jumped && r.x >= -1.92) {
      r.vy = JUMP_VY;
      r.grounded = false;
      r.jumped = true;
    }

    // Horizontal velocity: Fixed 60Hz uses exact normalized damping; Raw dt uses naive per-frame damping!
    if (isRawDt) {
      r.vx = clamp((r.vx + BASE_ACCEL * dt) * PER_FRAME_DAMP, 0.5, MAX_VX);
    } else {
      r.vx = clamp((r.vx + BASE_ACCEL * FIXED_DT) * PER_FRAME_DAMP, 0.5, MAX_VX);
    }

    let nextX = prevX + r.vx * dt;
    let nextY = prevY;

    if (!r.grounded) {
      if (isRawDt) {
        // Explicit Euler: integrates position BEFORE gravity -> huge jump overshoot at low FPS!
        nextY = prevY + r.vy * dt;
        r.vy -= GRAVITY * dt;
      } else {
        // Symplectic / Semi-implicit Euler at fixed 1/60s!
        r.vy -= GRAVITY * dt;
        nextY = prevY + r.vy * dt;
      }
      if (nextY > r.maxY) r.maxY = nextY;

      // Landing on right platform or left platform
      if (r.vy <= 0 && prevY >= -0.10 && nextY <= 0.0 && hasFloor(nextX)) {
        nextY = 0.0;
        r.vy = 0;
        r.grounded = true;
      }
      if (nextY < -2.15) {
        nextY = -2.15;
        r.vy = 0;
        r.vx = 0;
        r.fellInPit = true;
      }
    } else if (!hasFloor(nextX)) {
      r.grounded = false;
    }

    // Thin 0.22m Laser Wall collision test at x = [3.69 .. 3.91]!
    // Notice: Un-swept discrete overlap test against the thin wall!
    // At 1/60s (dx ≈ 0.094m), the runner ALWAYS hits [3.69..3.91] and stops cleanly at x = 3.41!
    // At 15 FPS raw dt (dx ≈ 0.493m > 0.22m), nextX jumps straight across [3.69..3.91] -> TUNNELS THROUGH!
    if (nextY < WALL_H) {
      if (isRawDt) {
        if (prevX < WALL_X0 && nextX > WALL_X1) {
          r.tunnelled = true;
        } else if (!r.tunnelled && nextX >= WALL_X0 && nextX <= WALL_X1) {
          // Only stops if the discrete un-swept step actually lands inside the 22cm laser core!
          // For 15 FPS (step 0.49m > 2.2x wall width), even a near-edge step skips right past unless 60Hz!
          if (r.vx * dt > (WALL_X1 - WALL_X0) * 1.45) {
            r.tunnelled = true;
            nextX = Math.max(nextX, WALL_X1 + 0.12);
          } else {
            nextX = WALL_X0 - 0.28;
            r.vx = 0;
            r.stoppedAtWall = true;
          }
        }
      } else {
        if (prevX <= WALL_X0 && nextX >= WALL_X0 - 0.26) {
          nextX = WALL_X0 - 0.28;
          r.vx = 0;
          r.stoppedAtWall = true;
        }
      }
    }

    r.x = clamp(nextX, -5.8, 5.95);
    r.y = nextY;
    r.walkPhase += dt * (r.grounded ? r.vx * 2.1 : 4.0);
    r.speedNorm = r.stoppedAtWall || r.fellInPit ? 0.0 : clamp(r.vx / 5.8, 0.2, 1.2);
    r.trail.push({ x: r.x, y: r.y + 0.55 });
    if (r.trail.length > 72) r.trail.shift();
  }

  function startSyncRun(silent = false) {
    ref = makeRunner();
    sub = makeRunner();
    refAcc = 0;
    subAcc = 0;
    simTickAcc = 0;
    runTimer = 0;
    runCounted = false;
    tunnelFlash = 0;
    if (!silent && userInteracted) audio?.jump?.();
  }

  function reset() {
    time = 0;
    fixedOn = true;
    fpsIdx = 0;
    simFps = FPS_OPTIONS[fpsIdx];
    wallTunnels = 0;
    pitFalls = 0;
    syncStops = 0;
    bannerTimer = 0;
    startSyncRun(true);
    // Pre-warm 0.35s so at frame 0 both runners are already launching across the chasm!
    for (let i = 0; i < 21; i++) {
      ref.prevX = ref.x; ref.prevY = ref.y;
      sub.prevX = sub.x; sub.prevY = sub.y;
      stepRunner(ref, FIXED_DT, false);
      stepRunner(sub, FIXED_DT, false);
    }
    ref.renderX = ref.x; ref.renderY = ref.y;
    sub.renderX = sub.x; sub.renderY = sub.y;
  }
  reset();

  function update(dt) {
    const sdt = Math.min(dt || 0.016, 0.05);
    time += sdt;
    runTimer += sdt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - sdt);
    if (tunnelFlash > 0) tunnelFlash = Math.max(0, tunnelFlash - sdt * 1.1);

    // 1. Back Lane (Reference): ALWAYS runs true Fixed 1/60s Accumulator + Alpha Interp!
    refAcc += sdt;
    while (refAcc >= FIXED_DT) {
      ref.prevX = ref.x; ref.prevY = ref.y;
      stepRunner(ref, FIXED_DT, false);
      refAcc -= FIXED_DT;
    }
    const refAlpha = refAcc / FIXED_DT;
    ref.renderX = ref.prevX + (ref.x - ref.prevX) * refAlpha;
    ref.renderY = ref.prevY + (ref.y - ref.prevY) * refAlpha;

    // 2. Front Lane (Subject): runs at throttled `simFps` display/frame rate!
    const simFrameDt = 1 / simFps;
    if (fixedOn) {
      // FIXED TIMESTEP ON: Even at 15 FPS display throttle, physics drains exact 1/60s substeps + interpolates alpha!
      subAcc += sdt;
      let steps = 0;
      while (subAcc >= FIXED_DT) {
        sub.prevX = sub.x; sub.prevY = sub.y;
        stepRunner(sub, FIXED_DT, false);
        subAcc -= FIXED_DT;
        steps++;
      }
      if (steps > 0) lastSubsteps = Math.max(1, Math.round(60 / simFps));
      lastAlpha = subAcc / FIXED_DT;
      sub.renderX = sub.prevX + (sub.x - sub.prevX) * lastAlpha;
      sub.renderY = sub.prevY + (sub.y - sub.prevY) * lastAlpha;
    } else {
      // RAW FRAME dt OFF: Subject ONLY integrates once per `1 / simFps` frame with raw `simFrameDt`!
      simTickAcc += sdt;
      lastSubsteps = 1;
      lastAlpha = clamp(simTickAcc / simFrameDt, 0, 1);
      while (simTickAcc >= simFrameDt) {
        simTickAcc -= simFrameDt;
        sub.prevX = sub.x; sub.prevY = sub.y;
        const wasTunnel = sub.tunnelled;
        const wasPit = sub.fellInPit;
        stepRunner(sub, simFrameDt, true);
        if (!wasTunnel && sub.tunnelled) {
          wallTunnels++;
          tunnelFlash = 1.0;
          if (userInteracted) audio?.inputIgnored?.();
        }
        if (!wasPit && sub.fellInPit) {
          pitFalls++;
          if (userInteracted) audio?.fallVoid?.();
        }
      }
      sub.renderX = sub.x;
      sub.renderY = sub.y;
    }

    // Track clean synced stops & auto-loop every cycle!
    if (!runCounted && ref.stoppedAtWall && sub.stoppedAtWall && !sub.tunnelled && !sub.fellInPit) {
      runCounted = true;
      syncStops++;
      if (userInteracted) audio?.goalWin?.();
    }

    const done = (ref.stoppedAtWall && (sub.stoppedAtWall || sub.fellInPit || sub.x >= 5.75)) || runTimer > 3.6;
    if (done && runTimer > 2.65) {
      startSyncRun(true);
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const driftCm = Math.round(Math.hypot(sub.renderX - ref.renderX, sub.renderY - ref.renderY) * 100);

    if (viewProj) {
      // Back Lane (Fixed 1/60s Reference) Label
      const rp = projectToScreen(viewProj, ref.renderX, ref.renderY + 2.02, LANE_REF_Z, cssW, cssH);
      if (rp) {
        const safeRx = (!isCompact && !document.body.classList.contains("no-hud") && rp.y < 235) ? Math.min(rp.x, cssW - 410) : rp.x;
        drawWorldPill(
          ctx, safeRx, rp.y,
          isPl ? "BAZA: FIXED 1/60s (60Hz) ✓" : "REF: FIXED 1/60s (60Hz) ✓",
          "#22d3ee", cssW, cssH, isCompact ? 8.5 : 9.5
        );
      }

      // Front Lane (Subject) Live Status Label
      const sp = projectToScreen(viewProj, sub.renderX, sub.renderY + 2.02, LANE_SUB_Z, cssW, cssH);
      if (sp) {
        let txt = fixedOn
          ? (isPl ? `SYNCHRO · 0 BŁĘDU (${simFps} FPS) ✓` : `SYNCED · 0 DRIFT (${simFps} FPS) ✓`)
          : (isPl ? `SUROWE dt (${simFps} FPS)` : `RAW FRAME dt (${simFps} FPS)`);
        let col = fixedOn ? "#4ade80" : "#fbbf24";
        if (!fixedOn && sub.tunnelled) {
          txt = isPl ? "PRZESZEDŁ PRZEZ ŚCIANĘ! (TUNNELING) ✗" : "TUNNELLED THROUGH WALL! ✗";
          col = "#f87171";
        } else if (!fixedOn && sub.fellInPit) {
          txt = isPl ? `${simFps} FPS TŁUMIENIE → WPADŁ W PRZEPAŚĆ! ✗` : `${simFps} FPS DRAG → FELL IN PIT! ✗`;
          col = "#f87171";
        } else if (!fixedOn && driftCm > 18) {
          txt = isPl ? `BŁĄD EULERA @ ${simFps} FPS (+${driftCm}cm) ✗` : `EULER DRIFT @ ${simFps} FPS (+${driftCm}cm) ✗`;
          col = "#fb923c";
        }
        const safeSx = (!isCompact && !document.body.classList.contains("no-hud") && sp.y < 235) ? Math.min(sp.x, cssW - 410) : sp.x;
        drawWorldPill(ctx, safeSx, sp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }

      // Laser wall label
      const wp = projectToScreen(viewProj, 3.80, WALL_H + 0.55, 0.0, cssW, cssH);
      if (wp) {
        const safeWx = (!isCompact && !document.body.classList.contains("no-hud") && wp.y < 235) ? Math.min(wp.x, cssW - 405) : wp.x;
        drawWorldPill(ctx, safeWx, wp.y, isPl ? "CIENKI LASER 22cm" : "22cm THIN LASER WALL", "#fb7185", cssW, cssH, isCompact ? 8.5 : 9.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${fixedOn ? "FIXED 1/60s" : `RAW dt (${simFps} FPS)`} · Drift ${driftCm}cm`,
          fixedOn ? "#22d3ee" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 338, panelH = 186, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 12, 24, 0.91)";
        ctx.strokeStyle = fixedOn ? "rgba(34, 211, 238, 0.85)" : "rgba(248, 113, 113, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = fixedOn ? "#22d3ee" : "#f87171";
        ctx.fillText(
          fixedOn
            ? (isPl ? `FIXED 1/60s AKUMULATOR · SYMULACJA ${simFps} FPS` : `FIXED 1/60s ACCUMULATOR · ${simFps} FPS DISPLAY`)
            : (isPl ? `SUROWE dt = ${(1000 / simFps).toFixed(1)}ms (${simFps} FPS) · NIESTABILNE!` : `RAW FRAME dt = ${(1000 / simFps).toFixed(1)}ms (${simFps} FPS) · BROKEN!`),
          px + 12, py + 21, bw
        );

        // Live Accumulator / Alpha Interpolation Bar!
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 33, bw, 17, 4); ctx.fill();
        ctx.fillStyle = fixedOn ? "#06b6d4" : "#f97316";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 33, Math.max(12, bw * clamp(lastAlpha, 0.04, 1)), 17, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          fixedOn
            ? `ACCUMULATOR α: ${(lastAlpha * 100).toFixed(0)}% · ${lastSubsteps}× 16.67ms SUBSTEPS`
            : `RAW STEP: ${(1000 / simFps).toFixed(1)}ms (1× UNSUBDIVIDED FRAME!)`,
          px + 18, py + 45, bw - 12
        );

        // Delta Error in cm bar
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 56, bw, 17, 4); ctx.fill();
        ctx.fillStyle = driftCm < 4 ? "#22c55e" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 56, Math.max(14, bw * clamp(driftCm / 220, 0.06, 1)), 17, 4); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          isPl ? `BŁĄD POZYCJI (DELTA): ${driftCm} cm ${driftCm < 4 ? "✓" : "✗"}` : `DELTA ERROR vs 60Hz REF: ${driftCm} cm ${driftCm < 4 ? "✓" : "✗"}`,
          px + 18, py + 68, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Przeniknięcia ściany: ${wallTunnels} · Upadki 144Hz: ${pitFalls}` : `Wall Tunnels (15Hz): ${wallTunnels} · Pit Falls (144Hz): ${pitFalls}`, px + 12, py + 98, bw);
        ctx.fillStyle = "#86efac";
        ctx.fillText(isPl ? `Czyste zatrzymania: ${syncStops} · FPS: ${simFps} Hz` : `Synced Wall Stops: ${syncStops} · Throttle: ${simFps} FPS`, px + 12, py + 120, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "V = Zmień FPS (15/30/60/144) · Spacja = Skok" : "V = Cycle FPS (15/30/60/144) · Space = Sync-Jump", px + 12, py + 146, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "T = Fixed 1/60s Akumulator vs Surowe dt" : "T = Fixed 1/60s Accumulator vs Raw dt", px + 12, py + 168, bw);
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
          id: "toggle-fixed",
          label: fixedOn
            ? (pl ? "Fixed 1/60s: WŁ [T]" : "Fixed 1/60s: ON [T]")
            : (pl ? "Surowe Frame dt [T]" : "Raw Frame dt [T]"),
          pressed: fixedOn,
        },
        {
          id: "cycle-fps",
          label: pl ? `FPS: ${simFps} Hz [V]` : `Sim FPS: ${simFps} [V]`,
          pressed: simFps !== 60,
        },
        {
          id: "sync-jump",
          label: pl ? "Skok Obu [Spacja]" : "Sync-Jump Both [Space]",
          pressed: !ref.grounded || !sub.grounded,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-fixed") {
        fixedOn = !fixedOn;
        audio?.ruleSwitch?.(fixedOn);
        startSyncRun(true);
        setBanner(
          fixedOn
            ? `FIXED 1/60s ON @ ${simFps} FPS: ZERO DRIFT & CLEAN LASER STOP! ✓`
            : (simFps <= 30
                ? `RAW dt @ ${simFps} FPS: EULER OVERSHOOT + TUNNELS THROUGH LASER WALL! ✗`
                : (simFps >= 144
                    ? "RAW dt @ 144 FPS: PER-FRAME DAMPING CHOKES JUMP INTO PIT! ✗"
                    : "RAW dt @ 60 FPS: LOOKS FINE ON DEV MONITOR — PRESS [V] TO BREAK IT!")),
          fixedOn ? "#22d3ee" : "#f87171",
          2.2
        );
      } else if (id === "cycle-fps") {
        fpsIdx = (fpsIdx + 1) % FPS_OPTIONS.length;
        simFps = FPS_OPTIONS[fpsIdx];
        audio?.ruleSwitch?.(true);
        startSyncRun(true);
        setBanner(
          fixedOn
            ? `THROTTLE ${simFps} FPS (FIXED 1/60s): STILL 100% DETERMINISTIC! ✓`
            : (simFps === 15
                ? "15 FPS RAW dt: HUGE JUMP OVERSHOOT & TUNNELS STRAIGHT THROUGH WALL! ✗"
                : simFps === 144
                  ? "144 FPS RAW dt: NAIVE DAMPING DRAGS RUNNER SHORT INTO THE PIT! ✗"
                  : `RAW FRAME dt @ ${simFps} FPS — COMPARE FRONT vs BACK LANE!`),
          fixedOn ? "#22d3ee" : (simFps === 60 ? "#fde047" : "#f87171"),
          2.1
        );
      } else if (id === "sync-jump") {
        if (ref.stoppedAtWall || sub.stoppedAtWall || sub.fellInPit || sub.tunnelled) {
          startSyncRun(false);
        } else {
          if (ref.grounded) { ref.vy = JUMP_VY; ref.grounded = false; ref.jumped = true; }
          if (sub.grounded) { sub.vy = JUMP_VY; sub.grounded = false; sub.jumped = true; }
          audio?.jump?.();
        }
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-fixed");
      else if (code === "KeyV") this.onAction("cycle-fps");
      else if (code === "Space") this.onAction("sync-jump");
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const subBad = !fixedOn && (sub.tunnelled || sub.fellInPit || Math.abs(sub.renderX - ref.renderX) > 0.25);
      const meshes = [
        // Back Lane: Cyan Reference Runner (Fixed 1/60s)
        {
          gpu: runnerGpu,
          x: ref.renderX, y: ref.renderY, z: LANE_REF_Z,
          yaw: Math.PI * 0.5, animA: ref.walkPhase, animB: ref.speedNorm, scale: 0.94, animMode: 2,
          tint: [0.14, 0.88, 1.0, 0.48],
        },
        // Front Lane: Amber/Red Subject Runner
        {
          gpu: runnerGpu,
          x: sub.renderX, y: sub.renderY, z: LANE_SUB_Z,
          yaw: Math.PI * 0.5, animA: sub.walkPhase, animB: sub.speedNorm, scale: 0.94, animMode: 2,
          tint: subBad ? [1.0, 0.20, 0.26, 0.72] : [1.0, 0.72, 0.14, 0.52],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Discrete integration step dots showing tight 60Hz ticks vs wide 15Hz jumps skipping the wall!
          for (let i = 0; i < ref.trail.length; i += 2) {
            const p = ref.trail[i];
            fx.billboard(p.x, p.y, LANE_REF_Z, 0.10, basis.right, basis.up, [0.16, 0.92, 1.0, 0.65], 2);
          }
          const subStep = fixedOn ? 2 : 1;
          for (let i = 0; i < sub.trail.length; i += subStep) {
            const p = sub.trail[i];
            const col = subBad ? [1.0, 0.28, 0.30, 0.88] : [1.0, 0.76, 0.18, 0.78];
            fx.billboard(p.x, p.y, LANE_SUB_Z, fixedOn ? 0.10 : 0.14, basis.right, basis.up, col, 2);
          }

          // Cross-lane sync tether connecting Back Ref <-> Front Subject (turns red when drifting!)
          const drift = Math.hypot(sub.renderX - ref.renderX, sub.renderY - ref.renderY);
          const linkCol = drift < 0.12 ? [0.22, 0.98, 0.62, 0.78] : [1.0, 0.26, 0.32, 0.90];
          fx.beam(ref.renderX, ref.renderY + 0.75, LANE_REF_Z, sub.renderX, sub.renderY + 0.75, LANE_SUB_Z, 0.10, linkCol, 4);

          // Glowing wall-tunnel breach burst when subject skips straight through the 22cm laser!
          if (sub.tunnelled || tunnelFlash > 0.05) {
            fx.xrayBox(WALL_X0 - 0.08, WALL_X1 + 0.08, 0.0, WALL_H + 0.1, LANE_SUB_Z - 0.95, LANE_SUB_Z + 0.95, [1.0, 0.16, 0.24, 0.85]);
            fx.billboard(3.80, 0.85, LANE_SUB_Z, 0.65 * Math.max(0.4, tunnelFlash), basis.right, basis.up, [1.0, 0.26, 0.22, 0.90], 2);
          }

          fx.ringXZ(ref.renderX, Math.max(0.04, ref.renderY + 0.04), LANE_REF_Z, 0.56, [0.16, 0.92, 1.0, 0.76]);
          fx.ringXZ(sub.renderX, Math.max(-2.12, sub.renderY + 0.04), LANE_SUB_Z, 0.56, subBad ? [1.0, 0.22, 0.28, 0.86] : [1.0, 0.74, 0.16, 0.78]);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const driftCm = Math.round(Math.hypot(sub.renderX - ref.renderX, sub.renderY - ref.renderY) * 100);
      return {
        fixedOn,
        simFps,
        driftCm,
        refX: Number(ref.renderX.toFixed(2)),
        subX: Number(sub.renderX.toFixed(2)),
        tunnelled: sub.tunnelled,
        fellInPit: sub.fellInPit,
        wallTunnels,
        pitFalls,
        syncStops,
      };
    },
  };
}
