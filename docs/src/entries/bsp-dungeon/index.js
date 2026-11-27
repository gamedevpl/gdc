// Entry #13: Procedural Dungeon Generation (BSP + MST) — Playable 3D Torchlit Crypt Generator!
// Studio Overhaul: Live 4-Stage Animated Generation Sequence (1. BSP Slices -> 2. Carve Rooms -> 3. MST Corridors ->
// 4. Flood-Fill Verified ✓) + crisp 3D World-Space Callout Pills ("START", "BOSS EXIT ✓", "OVERLAP COLLISION!",
// "ISOLATED — NO EXIT ✗") so every visitor understands BSP + MST vs Pure Random in 2 seconds!
import { clamp } from "../../gl-utils.js";
import { createDungeonRenderer, D_COLS, D_ROWS, D_TILE, dTileToWorld } from "./dungeon-renderer.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

function drawWorldPill(ctx, x, y, text, color, cssW, cssH, fontPx = 10.5) {
  ctx.save();
  ctx.font = `800 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 14;
  const ph = fontPx + 10;
  const px = clamp(x - pw * 0.5, 8, cssW - pw - 8);
  const py = clamp(y - ph * 0.5, 56, cssH - ph - 8);
  ctx.fillStyle = "rgba(12, 10, 26, 0.90)";
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
  const renderer = createDungeonRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.88, dist: 20.6, targetX: 0.0, targetY: 0.15, targetZ: 0.25, fovDeg: 40 };

  let time = 0;
  let bspMode = true;
  let showGraph = true;
  let seed = 104;
  let version = 1;

  // Live 4-stage generation animation timer (0..0.65: Stage 1 BSP -> 0.65..1.3: Stage 2 Rooms -> 1.3..1.95: Stage 3 Tree -> 1.95+: Stage 4 Verified!)
  let genTime = 0;
  let genStage = 4;

  const grid = new Uint8Array(D_COLS * D_ROWS);
  let rooms = [];
  let torches = [];
  let bspLines = [];
  let mstEdges = [];
  let reachableSet = new Set();
  let pathList = [];
  let pathSet = new Set();
  let start = { c: 2, r: 2 };
  let exit = { c: 21, r: 15 };
  let overlapMarker = null;
  let exitReachable = true;
  let isolatedRooms = 0;
  let overlappingRooms = 0;

  let delver = { x: 0, z: 0, yaw: 0, pathIdx: 0 };
  let bannerText = "";
  let bannerColor = "#c084fc";
  let bannerTimer = 0;

  function setBanner(text, color = "#c084fc", dur = 2.1) {
    bannerText = text; bannerColor = color; bannerTimer = dur;
  }

  function carveCorridor(c0, r0, c1, r1) {
    let c = c0, r = r0;
    while (c !== c1) {
      if (grid[r * D_COLS + c] === 0) grid[r * D_COLS + c] = 2;
      c += Math.sign(c1 - c);
    }
    while (r !== r1) {
      if (grid[r * D_COLS + c] === 0) grid[r * D_COLS + c] = 2;
      r += Math.sign(r1 - r);
    }
    if (grid[r * D_COLS + c] === 0) grid[r * D_COLS + c] = 2;
  }

  function runFloodFillAndPath() {
    reachableSet = new Set();
    pathList = [];
    pathSet = new Set();
    const sIdx = start.r * D_COLS + start.c;
    const eIdx = exit.r * D_COLS + exit.c;
    const parent = new Int32Array(D_COLS * D_ROWS).fill(-1);
    const q = [sIdx];
    reachableSet.add(sIdx);
    let head = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
      const cur = q[head++];
      const cr = Math.floor(cur / D_COLS), cc = cur % D_COLS;
      for (const [dc, dr] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= D_COLS || nr < 0 || nr >= D_ROWS) continue;
        const ni = nr * D_COLS + nc;
        if (grid[ni] === 0 || reachableSet.has(ni)) continue;
        reachableSet.add(ni);
        parent[ni] = cur;
        q.push(ni);
      }
    }
    exitReachable = reachableSet.has(eIdx);
    if (exitReachable) {
      let cur = eIdx;
      while (cur !== -1) {
        pathSet.add(cur);
        pathList.push({ c: cur % D_COLS, r: Math.floor(cur / D_COLS) });
        cur = parent[cur];
      }
      pathList.reverse();
    }
    isolatedRooms = rooms.filter((rm) => !reachableSet.has(rm.cy * D_COLS + rm.cx)).length;
  }

  function generate({ animate = true } = {}) {
    const rng = mulberry32(seed);
    grid.fill(0);
    rooms = [];
    torches = [];
    bspLines = [];
    mstEdges = [];
    overlappingRooms = 0;
    overlapMarker = null;

    if (bspMode) {
      function splitNode(x, y, w, h, depth) {
        const canH = h >= 8;
        const canV = w >= 9;
        if (depth >= 3 || (!canH && !canV)) {
          const rw = Math.max(3, Math.min(w - 2, 3 + Math.floor(rng() * (w - 4))));
          const rh = Math.max(3, Math.min(h - 2, 3 + Math.floor(rng() * (h - 4))));
          const rx = x + 1 + Math.floor(rng() * Math.max(1, w - rw - 1));
          const ry = y + 1 + Math.floor(rng() * Math.max(1, h - rh - 1));
          const rm = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
          rooms.push(rm);
          for (let r = ry; r < ry + rh; r++) {
            for (let c = rx; c < rx + rw; c++) grid[r * D_COLS + c] = 1;
          }
          torches.push({ c: rx, r: ry });
          return rm;
        }
        const horiz = canH && (!canV || (h > w * 0.85 ? true : rng() < 0.48));
        let leftRm, rightRm;
        if (horiz) {
          const cut = y + 4 + Math.floor(rng() * Math.max(1, h - 7));
          bspLines.push({ c0: x, r0: cut - 0.5, c1: x + w - 1, r1: cut - 0.5 });
          leftRm = splitNode(x, y, w, cut - y, depth + 1);
          rightRm = splitNode(x, cut, w, y + h - cut, depth + 1);
        } else {
          const cut = x + 4 + Math.floor(rng() * Math.max(1, w - 7));
          bspLines.push({ c0: cut - 0.5, r0: y, c1: cut - 0.5, r1: y + h - 1 });
          leftRm = splitNode(x, y, cut - x, h, depth + 1);
          rightRm = splitNode(cut, y, x + w - cut, h, depth + 1);
        }
        carveCorridor(leftRm.cx, leftRm.cy, rightRm.cx, rightRm.cy);
        mstEdges.push({ c0: leftRm.cx, r0: leftRm.cy, c1: rightRm.cx, r1: rightRm.cy });
        return rng() < 0.5 ? leftRm : rightRm;
      }
      splitNode(1, 1, D_COLS - 2, D_ROWS - 2, 0);
    } else {
      const count = 8;
      for (let i = 0; i < count; i++) {
        const rw = 3 + Math.floor(rng() * 3);
        const rh = 3 + Math.floor(rng() * 3);
        const rx = i === count - 1 ? D_COLS - 5 : 1 + Math.floor(rng() * (D_COLS - 10));
        const ry = i === count - 1 ? D_ROWS - 5 : 1 + Math.floor(rng() * (D_ROWS - rh - 2));
        const rm = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
        let overlaps = false;
        for (let r = ry; r < ry + rh; r++) {
          for (let c = rx; c < rx + rw; c++) {
            if (grid[r * D_COLS + c] === 1) {
              grid[r * D_COLS + c] = 3;
              overlaps = true;
              if (!overlapMarker) overlapMarker = { c, r };
            } else {
              grid[r * D_COLS + c] = 1;
            }
          }
        }
        if (overlaps) overlappingRooms++;
        rooms.push(rm);
        torches.push({ c: rx, r: ry });
      }
      for (let i = 0; i < 3 && i + 1 < rooms.length - 1; i++) {
        carveCorridor(rooms[i].cx, rooms[i].cy, rooms[i + 1].cx, rooms[i + 1].cy);
        mstEdges.push({ c0: rooms[i].cx, r0: rooms[i].cy, c1: rooms[i + 1].cx, r1: rooms[i + 1].cy });
      }
    }

    rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    start = { c: rooms[0].cx, r: rooms[0].cy };
    const far = rooms[rooms.length - 1];
    exit = { c: far.cx, r: far.cy };

    runFloodFillAndPath();
    const [sx, sz] = dTileToWorld(start.c, start.r);
    delver = { x: sx, z: sz, yaw: 0, pathIdx: 0 };

    genTime = animate ? 0 : 4.0;
    genStage = animate ? (bspMode ? 1 : 2) : 4;
    version++;
  }

  function reset() {
    seed = 104;
    bspMode = true;
    showGraph = true;
    generate({ animate: true });
    bannerTimer = 0;
  }

  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Advance Live 4-Stage Generation Sequence!
    if (genStage < 4) {
      genTime += dt;
      const nextStage = bspMode
        ? (genTime < 0.65 ? 1 : genTime < 1.30 ? 2 : genTime < 1.95 ? 3 : 4)
        : (genTime < 0.85 ? 2 : genTime < 1.55 ? 3 : 4);
      if (nextStage !== genStage) {
        genStage = nextStage;
      }
    }

    const kw = keys?.has("KeyW") || keys?.has("ArrowUp");
    const ks = keys?.has("KeyS") || keys?.has("ArrowDown");
    const ka = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const kd = keys?.has("KeyD") || keys?.has("ArrowRight");
    const mx = (kd ? 1 : 0) - (ka ? 1 : 0);
    const mz = (ks ? 1 : 0) - (kw ? 1 : 0);

    if (genStage >= 4) {
      if (mx !== 0 || mz !== 0) {
        const l = Math.hypot(mx, mz);
        const nx = delver.x + (mx / l) * 3.8 * dt;
        const nz = delver.z + (mz / l) * 3.8 * dt;
        const tc = Math.floor(nx / D_TILE + D_COLS * 0.5);
        const tr = Math.floor(nz / D_TILE + D_ROWS * 0.5);
        if (tc >= 0 && tc < D_COLS && tr >= 0 && tr < D_ROWS && grid[tr * D_COLS + tc] > 0) {
          delver.x = nx; delver.z = nz;
        }
        delver.yaw = Math.atan2(mx, mz);
      } else if (exitReachable && pathList.length > 1) {
        const targetTile = pathList[delver.pathIdx % pathList.length];
        const [tx, tz] = dTileToWorld(targetTile.c, targetTile.r);
        const dx = tx - delver.x, dz = tz - delver.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.14) {
          delver.pathIdx = (delver.pathIdx + 1) % pathList.length;
        } else {
          delver.x += (dx / d) * 2.8 * dt;
          delver.z += (dz / d) * 2.8 * dt;
          delver.yaw = Math.atan2(dx, dz);
        }
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    // 1. World-Space 3D Storytelling Callouts!
    if (viewProj) {
      if (genStage < 4) {
        // Live Generation Step Pill floating cleanly over the center of the crypt!
        const cp = projectToScreen(viewProj, 0.0, 2.0, 0.0, cssW, cssH);
        if (cp) {
          const stTxt = bspMode
            ? (genStage === 1
                ? (isPl ? "KROK 1/4 · PODZIAŁ BSP (CIĘCIA MAPY)" : "STEP 1/4 · BSP SPACE SLICES")
                : genStage === 2
                  ? (isPl ? "KROK 2/4 · WYDRĄŻ POKOJE (0 KOLIZJI)" : "STEP 2/4 · CARVE ROOMS (0 OVERLAPS)")
                  : (isPl ? "KROK 3/4 · POŁĄCZ KORYTARZE (DRZEWO MST)" : "STEP 3/4 · LINK CORRIDORS (SPANNING TREE)"))
            : (genStage === 2
                ? (isPl ? "LOSOWE POKOJE · KOLIZJE!" : "RANDOM ROOMS · OVERLAPS!")
                : (isPl ? "LOSOWE KORYTARZE · ODCINA WYSPY!" : "RANDOM LINKS · ISOLATED ISLANDS!"));
          const stCol = bspMode
            ? (genStage === 1 ? "#facc15" : genStage === 2 ? "#c084fc" : "#22d3ee")
            : "#f87171";
          drawWorldPill(ctx, cp.x, cp.y, stTxt, stCol, cssW, cssH, isCompact ? 10 : 12);
        }
      } else {
        // Stage 4 Complete: crisp START, BOSS EXIT ✓ / ISOLATED ✗, and OVERLAP COLLISION labels!
        const [sx, sz] = dTileToWorld(start.c, start.r);
        const [ex, ez] = dTileToWorld(exit.c, exit.r);
        const sp = projectToScreen(viewProj, sx, 1.55, sz, cssW, cssH);
        const ep = projectToScreen(viewProj, ex, 1.95, ez, cssW, cssH);
        if (sp) {
          drawWorldPill(ctx, sp.x, sp.y, "START", "#38bdf8", cssW, cssH, isCompact ? 9.5 : 10.5);
        }
        if (ep) {
          drawWorldPill(
            ctx, ep.x, ep.y,
            exitReachable
              ? (isPl ? "WYJŚCIE BOSSA ✓" : "BOSS EXIT ✓")
              : (isPl ? "ODCIĘTE — BRAK WYJŚCIA ✗" : "ISOLATED — NO EXIT ✗"),
            exitReachable ? "#4ade80" : "#f87171",
            cssW, cssH, isCompact ? 9.5 : 11
          );
        }
        if (!bspMode && overlapMarker) {
          const [ox, oz] = dTileToWorld(overlapMarker.c, overlapMarker.r);
          const op = projectToScreen(viewProj, ox, 1.35, oz, cssW, cssH);
          if (op) {
            drawWorldPill(ctx, op.x, op.y, isPl ? "KOLIZJA POKOI!" : "OVERLAP COLLISION!", "#fb923c", cssW, cssH, isCompact ? 9 : 10.5);
          }
        }
        if (bspMode && showGraph && !isCompact && bspLines.length > 0) {
          const b0 = bspLines[0];
          const [bx, bz] = dTileToWorld((b0.c0 + b0.c1) * 0.5, (b0.r0 + b0.r1) * 0.5);
          const bp = projectToScreen(viewProj, bx, 1.45, bz, cssW, cssH);
          if (bp) {
            drawWorldPill(ctx, bp.x, bp.y, isPl ? "CIĘCIA BSP (0 KOLIZJI)" : "BSP SLICE (0 OVERLAPS)", "#facc15", cssW, cssH, 9.5);
          }
        }
      }
    }

    // 2. Corner Telemetry HUD (hidden in ?hud=0)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (isCompact) {
        const pill = bspMode
          ? (isPl ? `BSP + MST · ${rooms.length} pokoi · 100% PRZEJŚCIE` : `BSP + MST · ${rooms.length} rooms · 100% SOLVABLE`)
          : (isPl ? `LOSOWE · Odcięte: ${isolatedRooms} · WYJŚCIE ZABLOK.` : `RANDOM · Isolated: ${isolatedRooms} · UNSOLVABLE!`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(12, 10, 26, 0.88)";
        ctx.strokeStyle = exitReachable ? "rgba(168, 85, 247, 0.72)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = exitReachable ? "#d8b4fe" : "#fca5a5";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(302, cssW - 28), panelH = 144;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(12, 10, 26, 0.88)";
        ctx.strokeStyle = exitReachable ? "rgba(168, 85, 247, 0.72)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = bspMode ? "#d8b4fe" : "#fca5a5";
        ctx.fillText(bspMode ? `BSP + MST · SEED #${seed} (STEP ${genStage}/4)` : `PURE RANDOM · SEED #${seed}`, px + 12, py + 21);

        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = exitReachable ? "#4ade80" : "#f87171";
        ctx.fillText(
          exitReachable
            ? (isPl ? `✓ WYJŚCIE OSIĄGALNE (${pathList.length} kroków)` : `✓ FLOOD-FILL VERIFIED (${pathList.length} tiles)`)
            : (isPl ? "✗ WYJŚCIE ODCIĘTE! (BRAK DROGI)" : "✗ EXIT UNREACHABLE! (BROKEN SEED)"),
          px + 12, py + 48
        );
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(isPl ? `Pokoje: ${rooms.length}  ·  Cięcia BSP: ${bspLines.length}` : `Rooms: ${rooms.length}  ·  BSP Splits: ${bspLines.length}`, px + 12, py + 74);
        ctx.fillStyle = isolatedRooms > 0 || overlappingRooms > 0 ? "#fca5a5" : "#cbd5e1";
        ctx.fillText(isPl ? `Odcięte wyspy: ${isolatedRooms}  ·  Kolizje: ${overlappingRooms}` : `Isolated Islands: ${isolatedRooms}  ·  Overlaps: ${overlappingRooms}`, px + 12, py + 98);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Spacja = Nowy Seed · V = Powtórz 4 Kroki" : "Space = New Seed · V = Replay 4 Steps", px + 12, py + 124);
        ctx.restore();
      }
    }

    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = "800 13.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = Math.min(cssW - 24, tw + 26);
      const bx = (cssW - bw) * 0.5, by = isCompact ? 86 : 76;
      ctx.fillStyle = "rgba(12, 10, 26, 0.92)";
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
        { id: "new-seed", label: pl ? "Nowy Loch [Spacja]" : "New Seed [Space]", pressed: false },
        { id: "replay-steps", label: pl ? "Powtórz 4 Kroki [V]" : "Replay 4 Steps [V]", pressed: genStage < 4 },
        { id: "toggle-mode", label: bspMode ? (pl ? "Algorytm: BSP + MST [T]" : "Algo: BSP + MST [T]") : (pl ? "Algorytm: Losowy [T]" : "Algo: Pure Random [T]"), pressed: bspMode },
        { id: "toggle-graph", label: showGraph ? (pl ? "Drzewo BSP: WŁ [X]" : "BSP Tree: ON [X]") : (pl ? "Drzewo BSP: WYŁ [X]" : "BSP Tree: OFF [X]"), pressed: showGraph },
      ];
    },
    onAction(id) {
      if (id === "new-seed") {
        seed = (seed * 73 + 19) % 997 + 1;
        generate({ animate: true });
        audio?.wallClick?.(true);
        setBanner(bspMode ? `BSP + MST SEED #${seed} · WATCH 4 STEPS!` : `PURE RANDOM #${seed} · ISOLATED ISLANDS!`, bspMode ? "#c084fc" : "#ef4444", 1.8);
      } else if (id === "replay-steps") {
        genTime = 0;
        genStage = bspMode ? 1 : 2;
        audio?.wallClick?.(true);
      } else if (id === "toggle-mode") {
        bspMode = !bspMode;
        generate({ animate: true });
        audio?.ruleSwitch?.(bspMode);
        setBanner(bspMode ? "BSP + MST: 0 OVERLAPS, 100% CONNECTED!" : "PURE RANDOM: OVERLAPS & UNREACHABLE EXIT!", bspMode ? "#4ade80" : "#ef4444", 2.0);
      } else if (id === "toggle-graph") {
        showGraph = !showGraph;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space") this.onAction("new-seed");
      else if (code === "KeyV") this.onAction("replay-steps");
      else if (code === "KeyT") this.onAction("toggle-mode");
      else if (code === "KeyX") this.onAction("toggle-graph");
    },
    onClickWorld() { this.onAction("new-seed"); },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time, version, genStage, grid, torches, bspLines, mstEdges, reachableSet, pathSet, delver, start, exit, exitReachable, showGraph,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { bspMode, seed, genStage, rooms: rooms.length, bspSplits: bspLines.length, exitReachable, isolatedRooms, overlappingRooms, pathLen: pathList.length };
    },
  };
}
