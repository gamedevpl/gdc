// Entry #46: Chunk Streaming & Hysteresis — Playable 3D Open-World Level Streaming Visualizer!
// Shows why open-world engines (Minecraft, GTA, Zelda) pair async 1-chunk/frame streaming with a wide
// Hysteresis Deadband (Load at R_in = 2.1, Unload at R_out = 2.85): wiggling across a border triggers
// 0 thrashing reloads and keeps frame time flat at 8.3ms instead of 48ms synchronous hitch spikes!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const GRID = 9;
const CHUNK_SIZE = 1.44;
const R_IN = 2.10;   // Load Radius (chunks)
const R_OUT = 2.85;  // Unload Hysteresis Ring (chunks)
const WORLD_HALF = (GRID * CHUNK_SIZE) * 0.5;

function chunkCenter(cx, cz) {
  return [(cx - (GRID - 1) * 0.5) * CHUNK_SIZE, (cz - (GRID - 1) * 0.5) * CHUNK_SIZE];
}

// Deterministic procedural alpine biome generator for each of the 9x9 chunks
function buildChunkDescriptor(cx, cz) {
  const h = Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453;
  const r = h - Math.floor(h);
  const radial = Math.hypot(cx - 4, cz - 4);
  let biome = 1; // 0=lake, 1=meadow, 2=stone hill, 3=timber spire
  if (radial > 1.2 && r < 0.24) biome = 0;
  else if (r > 0.78) biome = 3;
  else if (r > 0.48) biome = 2;
  else biome = 1;

  const height = biome === 0 ? 0.16 : (biome === 1 ? 0.36 + r * 0.14 : (biome === 2 ? 0.68 + r * 0.36 : 0.42));
  return {
    cx, cz,
    idx: cz * GRID + cx,
    biome,
    height,
    seed: r,
    loaded: false,
    queued: false,
    lastUnloadT: -10,
    thrashFlash: 0,
    loadFlash: 0,
  };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.04, 0.09, 0.18],
    skyMid: [0.10, 0.20, 0.34],
    skyBot: [0.20, 0.30, 0.40],
    lightDir: [0.36, 0.86, 0.36],
    ambLow: [0.12, 0.18, 0.26],
    ambHigh: [0.38, 0.50, 0.62],
    orthoHalf: 12.5,
    maxWorldVerts: 32000,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  const defaultCam = { yaw: 0.14, pitch: 0.72, dist: 18.8, targetX: 0.0, targetY: 0.5, targetZ: 0.4, fovDeg: 40 };

  let time = 0;
  let hysteresisOn = true;     // ON: Async 1/frame + Hysteresis (R_in 2.1 / R_out 2.85) | OFF: Sync Thrash!
  let borderOscillate = false; // [V] Border-Oscillate Thrash Test
  let oscAnchor = { x: 0.72, z: 0.0 };
  let autoPatrol = true;
  let clickTarget = null;
  let userInteracted = false;

  const scout = { x: -0.6, z: 0.2, yaw: 0.8, walkPhase: 0 };

  const chunks = [];
  for (let cz = 0; cz < GRID; cz++) {
    for (let cx = 0; cx < GRID; cx++) {
      chunks.push(buildChunkDescriptor(cx, cz));
    }
  }
  let asyncQueue = [];
  let worldDirty = true;

  // Frame-time oscilloscope & streaming metrics
  const frameHistory = new Float32Array(64).fill(8.3);
  let histIdx = 0;
  let histTimer = 0;
  let lastFrameMs = 8.3;
  let hitchFreezeT = 0;
  let thrashCount = 0;
  let hitchCount = 0;
  let totalLoads = 0;
  let loadedChunks = 0;

  let bannerText = "";
  let bannerColor = "#34d399";
  let bannerTimer = 0;
  function setBanner(t, c = "#34d399", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function rebuildWorldMesh() {
    const buf = [];
    // Subtle dark map tabletop frame underneath the 9x9 streaming grid
    pushBox(buf, -WORLD_HALF - 0.35, WORLD_HALF + 0.35, -0.52, -0.14, -WORLD_HALF - 0.35, WORLD_HALF + 0.35, [0.10, 0.14, 0.21], 1);

    const h = CHUNK_SIZE * 0.475;
    loadedChunks = 0;
    for (const ch of chunks) {
      if (!ch.loaded) continue;
      loadedChunks++;
      const [wx, wz] = chunkCenter(ch.cx, ch.cz);
      // Bedrock base slab
      pushBox(buf, wx - h, wx + h, -0.14, 0.0, wz - h, wz + h, [0.18, 0.22, 0.30], 1);

      if (ch.biome === 0) {
        // Shimmering alpine water lake with sandy bank lip
        pushBox(buf, wx - h, wx + h, 0.0, ch.height, wz - h, wz + h, [0.09, 0.48, 0.76], 3);
      } else if (ch.biome === 1) {
        // Lush emerald meadow + miniature pine clusters
        pushBox(buf, wx - h, wx + h, 0.0, ch.height, wz - h, wz + h, [0.24, 0.68, 0.34], 4);
        const tx = wx + (ch.seed - 0.5) * 0.38;
        const tz = wz + (((ch.cx * 5 + ch.cz * 3) % 5) - 2) * 0.12;
        pushBox(buf, tx - 0.09, tx + 0.09, ch.height, ch.height + 0.22, tz - 0.09, tz + 0.09, [0.46, 0.30, 0.18], 4);
        pushBox(buf, tx - 0.24, tx + 0.24, ch.height + 0.22, ch.height + 0.56, tz - 0.24, tz + 0.24, [0.16, 0.54, 0.28], 4);
      } else if (ch.biome === 2) {
        // Terraced alpine stone hill + snowy crest
        pushBox(buf, wx - h, wx + h, 0.0, ch.height * 0.68, wz - h, wz + h, [0.44, 0.49, 0.58], 1);
        pushBox(buf, wx - h * 0.72, wx + h * 0.72, ch.height * 0.68, ch.height, wz - h * 0.72, wz + h * 0.72, [0.80, 0.87, 0.95], 4);
      } else {
        // Meadow + Timber Watch Spire with glowing amber lantern!
        pushBox(buf, wx - h, wx + h, 0.0, ch.height, wz - h, wz + h, [0.28, 0.66, 0.34], 4);
        pushBox(buf, wx - 0.22, wx + 0.22, ch.height, ch.height + 0.76, wz - 0.22, wz + 0.22, [0.64, 0.42, 0.24], 4);
        pushBox(buf, wx - 0.28, wx + 0.28, ch.height + 0.76, ch.height + 0.96, wz - 0.28, wz + 0.28, [0.98, 0.78, 0.24], 2);
      }
    }
    studio.setWorldData(buf);
    worldDirty = false;
  }

  function updateChunkStreaming({ instantWarmup = false } = {}) {
    const unloadRad = hysteresisOn ? R_OUT : R_IN;
    let syncEvents = 0;

    for (const ch of chunks) {
      const [wx, wz] = chunkCenter(ch.cx, ch.cz);
      const distChunks = Math.hypot(wx - scout.x, wz - scout.z) / CHUNK_SIZE;

      if (!ch.loaded && distChunks <= R_IN) {
        if (instantWarmup || !hysteresisOn) {
          // Synchronous immediate load!
          if (!instantWarmup && time - ch.lastUnloadT < 1.8) {
            thrashCount++;
            ch.thrashFlash = 1.0;
          }
          ch.loaded = true;
          ch.queued = false;
          ch.loadFlash = instantWarmup ? 0 : 1.0;
          totalLoads++;
          syncEvents++;
          worldDirty = true;
        } else if (!ch.queued) {
          ch.queued = true;
          asyncQueue.push(ch);
        }
      } else if (ch.loaded && distChunks > unloadRad) {
        ch.loaded = false;
        ch.queued = false;
        ch.lastUnloadT = time;
        syncEvents++;
        worldDirty = true;
      } else if (ch.queued && distChunks > unloadRad) {
        ch.queued = false;
      }
    }

    // Async Staggered Loading (1 chunk/frame when hysteresisOn = true -> flat 8.3ms frame time!)
    if (hysteresisOn && asyncQueue.length > 0) {
      // Load closest queued chunk first
      let bestIdx = -1, bestD = Infinity;
      for (let i = asyncQueue.length - 1; i >= 0; i--) {
        const ch = asyncQueue[i];
        if (!ch.queued || ch.loaded) { asyncQueue.splice(i, 1); continue; }
        const [wx, wz] = chunkCenter(ch.cx, ch.cz);
        const d = Math.hypot(wx - scout.x, wz - scout.z);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const ch = asyncQueue.splice(bestIdx, 1)[0];
        if (time - ch.lastUnloadT < 1.8) {
          thrashCount++;
          ch.thrashFlash = 1.0;
        }
        ch.loaded = true;
        ch.queued = false;
        ch.loadFlash = 1.0;
        totalLoads++;
        worldDirty = true;
      }
    }

    // In Sync · No Hysteresis mode, synchronous streaming triggers real 48ms frame hitches!
    if (!instantWarmup && !hysteresisOn && syncEvents > 0) {
      const spikeMs = clamp(34 + syncEvents * 14, 42, 68);
      lastFrameMs = spikeMs;
      frameHistory[histIdx] = spikeMs;
      histIdx = (histIdx + 1) % frameHistory.length;
      hitchCount++;
      hitchFreezeT = 0.085;
      if (userInteracted) audio?.inputIgnored?.();
    }
  }

  function reset() {
    time = 0;
    borderOscillate = false;
    autoPatrol = true;
    clickTarget = null;
    scout.x = -0.8; scout.z = 0.2; scout.yaw = 0.6; scout.walkPhase = 0;
    asyncQueue = [];
    frameHistory.fill(8.3);
    histIdx = 0;
    histTimer = 0;
    lastFrameMs = 8.3;
    hitchFreezeT = 0;
    thrashCount = 0;
    hitchCount = 0;
    totalLoads = 0;
    bannerTimer = 0;
    for (const ch of chunks) {
      ch.loaded = false; ch.queued = false; ch.lastUnloadT = -10; ch.thrashFlash = 0; ch.loadFlash = 0;
    }
    // Pre-load initial chunks around Scout so Frame 1 is immediately lush & vibrant!
    updateChunkStreaming({ instantWarmup: true });
    rebuildWorldMesh();
  }
  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    for (const ch of chunks) {
      if (ch.thrashFlash > 0) ch.thrashFlash = Math.max(0, ch.thrashFlash - dt * 1.8);
      if (ch.loadFlash > 0) ch.loadFlash = Math.max(0, ch.loadFlash - dt * 2.2);
    }

    // Record oscilloscope frame time
    histTimer += dt;
    if (histTimer >= 0.04) {
      histTimer = 0;
      const ms = hitchFreezeT > 0 ? lastFrameMs : (hysteresisOn ? 8.3 + Math.sin(time * 5.2) * 0.35 : 9.4 + Math.sin(time * 8) * 0.8);
      lastFrameMs = ms;
      frameHistory[histIdx] = ms;
      histIdx = (histIdx + 1) % frameHistory.length;
    }

    // Visual frame hitch stall in Sync OFF mode!
    if (hitchFreezeT > 0) {
      hitchFreezeT = Math.max(0, hitchFreezeT - dt);
      return;
    }

    // Scout movement: WASD, Border-Oscillate Test, Click Target, or Smooth Auto-Patrol
    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;

    const maxBound = WORLD_HALF - 0.85;
    if (mx !== 0 || mz !== 0) {
      autoPatrol = false;
      borderOscillate = false;
      clickTarget = null;
      userInteracted = true;
      const l = Math.hypot(mx, mz);
      const sp = 3.8;
      scout.x = clamp(scout.x + (mx / l) * sp * dt, -maxBound, maxBound);
      scout.z = clamp(scout.z + (mz / l) * sp * dt, -maxBound, maxBound);
      scout.yaw = Math.atan2(mx, mz);
      scout.walkPhase += dt * 11;
    } else if (borderOscillate) {
      // Rapid tight border straddle (±0.42 chunks across chunk boundary -> 0 thrash with hysteresis, nonstop hitches without!)
      const prevX = scout.x;
      const swing = Math.sin(time * 5.6) * (CHUNK_SIZE * 0.34);
      scout.x = clamp(oscAnchor.x + swing, -maxBound, maxBound);
      scout.z = clamp(oscAnchor.z + Math.cos(time * 2.8) * 0.18, -maxBound, maxBound);
      scout.yaw = scout.x >= prevX ? Math.PI * 0.5 : -Math.PI * 0.5;
      scout.walkPhase += dt * 13;
    } else if (clickTarget) {
      const dx = clickTarget.x - scout.x, dz = clickTarget.z - scout.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.18) {
        const sp = Math.min(4.2, d * 4.5);
        scout.x = clamp(scout.x + (dx / d) * sp * dt, -maxBound, maxBound);
        scout.z = clamp(scout.z + (dz / d) * sp * dt, -maxBound, maxBound);
        scout.yaw = Math.atan2(dx, dz);
        scout.walkPhase += dt * 11;
      } else {
        clickTarget = null;
      }
    } else if (autoPatrol) {
      // Smooth wide figure-8 patrol across alpine chunks so streaming is always active!
      const t = time * 0.44;
      const tx = Math.sin(t) * 3.45;
      const tz = Math.sin(t * 2.0) * 2.35;
      const dx = tx - scout.x, dz = tz - scout.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d, 2.55 * dt);
      scout.x += (dx / d) * step;
      scout.z += (dz / d) * step;
      scout.yaw = Math.atan2(dx, dz);
      scout.walkPhase += dt * 9.5;
    }

    updateChunkStreaming({ instantWarmup: false });
  }

  function drawOscilloscope(ctx, px, py, bw, bh, isPl) {
    ctx.fillStyle = "rgba(7, 14, 26, 0.94)";
    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, py, bw, bh, 5); ctx.fill(); ctx.stroke();

    // 16.6ms (60 FPS) budget reference line
    const y60 = py + bh - (16.6 / 70) * (bh - 8) - 4;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.38)";
    ctx.beginPath(); ctx.moveTo(px + 2, y60); ctx.lineTo(px + bw - 2, y60); ctx.stroke();

    const stepW = (bw - 8) / frameHistory.length;
    for (let i = 0; i < frameHistory.length; i++) {
      const idx = (histIdx + i) % frameHistory.length;
      const ms = frameHistory[idx];
      const h = clamp((ms / 70) * (bh - 8), 2, bh - 8);
      ctx.fillStyle = ms > 22 ? "#ef4444" : (hysteresisOn ? "#22c55e" : "#f59e0b");
      ctx.fillRect(px + 4 + i * stepW, py + bh - 3 - h, Math.max(2, stepW - 0.8), h);
    }

    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = hysteresisOn ? "#4ade80" : "#fca5a5";
    ctx.fillText(
      hysteresisOn
        ? (isPl ? "CZAS KLATKI: PŁASKIE 8.3ms (0 ZACIĘĆ ✓)" : "FRAME TIME: FLAT 8.3ms (0 HITCHES ✓)")
        : (isPl ? "CZAS KLATKI: SKOKI 48ms SYNC HITCH! ✗" : "FRAME TIME: 48ms SYNC HITCH SPIKES! ✗"),
      px + 6, py + 12, bw - 10
    );
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const noHud = document.body.classList.contains("no-hud");

    if (viewProj) {
      // Scout status pill
      const sp = projectToScreen(viewProj, scout.x, 2.35, scout.z, cssW, cssH);
      if (sp) {
        const safeX = (!isCompact && !noHud && sp.y < 260) ? Math.min(sp.x, cssW - 415) : sp.x;
        let txt, col;
        if (!hysteresisOn && (hitchFreezeT > 0 || thrashCount > 0)) {
          txt = isPl ? "48ms FRAME HITCH! (THRASHING) ✗" : "48ms FRAME HITCH! (THRASHING) ✗";
          col = "#f87171";
        } else if (hysteresisOn) {
          txt = borderOscillate
            ? (isPl ? "HISTEREZA: 0 PRZEŁADOWAŃ NA GRANICY ✓" : "HYSTERESIS: 0 THRASH AT BORDER ✓")
            : (isPl ? "ASYNC + HISTEREZA · 0 ZACIĘĆ ✓" : "ASYNC + HYSTERESIS · 0 HITCHES ✓");
          col = "#4ade80";
        } else {
          txt = isPl ? "SYNC · BRAK HISTEREZY (R_in = R_out)" : "SYNC · NO HYSTERESIS (R_in = R_out)";
          col = "#fb923c";
        }
        drawWorldPill(ctx, safeX, sp.y, txt, col, cssW, cssH, isCompact ? 8.5 : 10);
      }

      // Radius ring callouts on the ground
      const rinP = projectToScreen(viewProj, scout.x + R_IN * CHUNK_SIZE, 0.25, scout.z, cssW, cssH);
      if (rinP && !isCompact) {
        const safeX = (!noHud && rinP.y < 260) ? Math.min(rinP.x, cssW - 415) : rinP.x;
        drawWorldPill(ctx, safeX, rinP.y, `R_in = ${R_IN.toFixed(1)}`, "#34d399", cssW, cssH, 8.5);
      }
      if (hysteresisOn && !isCompact) {
        const routP = projectToScreen(viewProj, scout.x - R_OUT * CHUNK_SIZE, 0.25, scout.z, cssW, cssH);
        if (routP) {
          drawWorldPill(ctx, routP.x, routP.y, `R_out = ${R_OUT.toFixed(2)}`, "#fbbf24", cssW, cssH, 8.5);
        }
      }
    }

    if (!noHud) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          hysteresisOn
            ? `HYSTERESIS ON · ${loadedChunks}/81 Chunks · 0 Hitches ✓`
            : `NO HYSTERESIS · Thrash:${thrashCount} · ${hitchCount} HITCHES! ✗`,
          hysteresisOn ? "#34d399" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 334, panelH = 204, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 16, 28, 0.90)";
        ctx.strokeStyle = hitchFreezeT > 0 ? "#ef4444" : (hysteresisOn ? "rgba(52, 211, 153, 0.84)" : "rgba(248, 113, 113, 0.85)");
        ctx.lineWidth = hitchFreezeT > 0 ? 2.4 : 1.6;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = hysteresisOn ? "#34d399" : "#f87171";
        ctx.fillText(
          hysteresisOn
            ? (isPl ? "ASYNC STREAMING + HISTEREZA · 0 ZACIĘĆ" : "ASYNC STREAMING + HYSTERESIS · 0 HITCHES")
            : (isPl ? "SYNC · BRAK HISTEREZY · THRASHING!" : "SYNC · NO HYSTERESIS · BORDER THRASH!"),
          px + 12, py + 20, bw
        );

        // Live Frame-Time Oscilloscope!
        drawOscilloscope(ctx, px + 12, py + 30, bw, 58, isPl);

        // Deadband indicator bar
        ctx.fillStyle = "rgba(24, 38, 56, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 97, bw, 16, 4); ctx.fill();
        ctx.fillStyle = hysteresisOn ? "#10b981" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 97, hysteresisOn ? bw : 16, 16, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          hysteresisOn
            ? `DEADBAND: LOAD R_in ${R_IN.toFixed(1)} · UNLOAD R_out ${R_OUT.toFixed(2)} ✓`
            : `NO DEADBAND: LOAD = UNLOAD = ${R_IN.toFixed(1)} (SYNC STALL!) ✗`,
          px + 18, py + 108.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl
            ? `Załadowane: ${loadedChunks}/${GRID * GRID} · Kolejka Async: ${asyncQueue.length}`
            : `Loaded Chunks: ${loadedChunks}/${GRID * GRID} · Async Queue: ${asyncQueue.length}`,
          px + 12, py + 135, bw
        );
        ctx.fillStyle = thrashCount > 0 ? "#f87171" : "#cbd5e1";
        ctx.fillText(
          isPl
            ? `Przeładowania (Thrash): ${thrashCount} · Zacięcia 48ms: ${hitchCount}`
            : `Border Thrash Reloads: ${thrashCount} · 48ms Hitches: ${hitchCount}`,
          px + 12, py + 156, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl
            ? "WASD/Klik = Leć · V = Test Granicy · T = Histereza"
            : "WASD/Click = Fly · V = Border-Oscillate · T = Hysteresis",
          px + 12, py + 182, bw
        );
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
          id: "toggle-hysteresis",
          label: hysteresisOn
            ? (pl ? "Async + Histereza: WŁ [T]" : "Async + Hysteresis: ON [T]")
            : (pl ? "Sync · Brak Histerezy [T]" : "Sync · No Hysteresis [T]"),
          pressed: hysteresisOn,
        },
        {
          id: "border-test",
          label: borderOscillate
            ? (pl ? "Test Granicy: AKTYWNY [V]" : "Border-Oscillate: ON [V]")
            : (pl ? "Test Granicy (Thrash) [V]" : "Border-Oscillate Test [V]"),
          pressed: borderOscillate,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-hysteresis") {
        hysteresisOn = !hysteresisOn;
        asyncQueue = [];
        audio?.ruleSwitch?.(hysteresisOn);
        setBanner(
          hysteresisOn
            ? "HYSTERESIS ON: R_in 2.1 / R_out 2.85 + ASYNC 1/FRAME → FLAT 8.3ms ✓"
            : "HYSTERESIS OFF (SYNC): SINGLE THRESHOLD → 48ms THRASH HITCHES! ✗",
          hysteresisOn ? "#34d399" : "#f87171",
          2.2
        );
      } else if (id === "border-test") {
        borderOscillate = !borderOscillate;
        autoPatrol = !borderOscillate;
        clickTarget = null;
        if (borderOscillate) {
          // Anchor right on a chunk border so ±0.34 chunks straddles the threshold continuously!
          oscAnchor = { x: CHUNK_SIZE * 0.5, z: 0.0 };
          scout.x = oscAnchor.x;
          scout.z = oscAnchor.z;
          audio?.sandDash?.();
          setBanner(
            hysteresisOn
              ? "BORDER-OSCILLATE TEST: HYSTERESIS DEADBAND KEEPS THRASH AT 0! ✓"
              : "BORDER-OSCILLATE TEST: WATCH NONSTOP LOAD/UNLOAD 48ms HITCHES! ✗",
            hysteresisOn ? "#34d399" : "#f87171",
            2.2
          );
        } else {
          audio?.ruleSwitch?.(false);
        }
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-hysteresis");
      else if (code === "KeyV") this.onAction("border-test");
    },
    onClickWorld(wPos, { button } = {}) {
      if (button === 0 && wPos) {
        userInteracted = true;
        autoPatrol = false;
        borderOscillate = false;
        const maxBound = WORLD_HALF - 0.85;
        clickTarget = {
          x: clamp(wPos[0], -maxBound, maxBound),
          z: clamp(wPos[2], -maxBound, maxBound),
        };
        audio?.coinPickup?.();
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      if (worldDirty) rebuildWorldMesh();

      const hoverY = 1.05 + Math.sin(time * 4.2) * 0.09;
      const meshes = [
        {
          gpu: runnerGpu,
          x: scout.x, y: hoverY, z: scout.z,
          yaw: scout.yaw, animMode: 2, animA: scout.walkPhase, animB: 0.45,
          scale: 0.96,
          tint: hitchFreezeT > 0 ? [1.0, 0.22, 0.28, 0.82] : [0.20, 0.94, 1.0, 0.48],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          const halfC = CHUNK_SIZE * 0.48;
          for (const ch of chunks) {
            const [wx, wz] = chunkCenter(ch.cx, ch.cz);
            if (!ch.loaded) {
              // Unloaded chunk faint wireframe outline (or bright cyan while queued async!)
              const col = ch.thrashFlash > 0.08
                ? [1.0, 0.22, 0.28, 0.55 + ch.thrashFlash * 0.40]
                : (ch.queued ? [0.18, 0.94, 1.0, 0.72] : [0.32, 0.56, 0.78, 0.24]);
              fx.quadXZ(wx - halfC, wx + halfC, 0.04, wz - halfC, wz + halfC, col);
            } else if (ch.thrashFlash > 0.08) {
              // Crimson thrashing highlight on border chunks popping in/out rapidly!
              fx.xrayBox(wx - halfC, wx + halfC, 0.02, ch.height + 0.25, wz - halfC, wz + halfC, [1.0, 0.20, 0.26, ch.thrashFlash * 0.90]);
            } else if (ch.loadFlash > 0.08) {
              // Crisp emerald arrival flash when chunk finishes async streaming
              fx.xrayBox(wx - halfC, wx + halfC, 0.02, ch.height + 0.16, wz - halfC, wz + halfC, [0.22, 0.98, 0.62, ch.loadFlash * 0.62]);
            }
          }

          // Concentric Streaming Rings around Hovering Scout:
          // Inner Load Radius R_in (emerald when hysteresis ON, crimson/orange when single-threshold OFF)
          fx.ringXZ(scout.x, 0.14, scout.z, R_IN * CHUNK_SIZE, hysteresisOn ? [0.18, 0.96, 0.58, 0.92] : [1.0, 0.30, 0.34, 0.95]);
          // Outer Unload Hysteresis Ring R_out (amber, shown ONLY when hysteresisOn = true!)
          if (hysteresisOn) {
            fx.ringXZ(scout.x, 0.13, scout.z, R_OUT * CHUNK_SIZE, [1.0, 0.76, 0.16, 0.86]);
          }

          // Hover scout ground beacon & vertical tether
          fx.ringXZ(scout.x, 0.16, scout.z, 0.45, [0.22, 0.94, 1.0, 0.82]);
          fx.billboard(scout.x, hoverY - 0.12, scout.z, 0.32, basis.right, basis.up, [0.22, 0.94, 1.0, 0.65], 2);

          if (clickTarget) {
            fx.ringXZ(clickTarget.x, 0.18, clickTarget.z, 0.42 + Math.sin(time * 8) * 0.06, [0.98, 0.84, 0.24, 0.88]);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        hysteresisOn,
        borderOscillate,
        loadedChunks,
        totalChunks: GRID * GRID,
        queuedChunks: asyncQueue.length,
        thrashCount,
        hitchCount,
        totalLoads,
        lastFrameMs: +lastFrameMs.toFixed(1),
        scoutX: +scout.x.toFixed(2),
        scoutZ: +scout.z.toFixed(2),
      };
    },
  };
}
