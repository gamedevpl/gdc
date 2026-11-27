// Entry #13: Procedural Dungeon Generation (BSP + MST) — Playable 3D Roguelike Crypt Generator!
// Compare BSP Partitioning + Spanning Tree Corridors (0 overlaps, 100% Flood-Fill verified solvable!)
// vs Pure Random Room Placement (overlapping blobs & isolated unreachable islands where Exit fails!).
import { clamp, lerp } from "../../gl-utils.js";
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

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createDungeonRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.90, dist: 21.4, targetX: 0.0, targetY: 0.1, targetZ: 0.35, fovDeg: 40 };

  let time = 0;
  let bspMode = true;   // true = BSP + Tree Corridors (100% Solvable!), false = Pure Random (Overlaps & Dead Islands!)
  let showGraph = true;
  let seed = 104;
  let version = 1;

  const grid = new Uint8Array(D_COLS * D_ROWS);
  let rooms = [];
  let bspLines = [];
  let mstEdges = [];
  let reachableSet = new Set();
  let pathList = [];
  let pathSet = new Set();
  let start = { c: 2, r: 2 };
  let exit = { c: 21, r: 15 };
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

  function generate() {
    const rng = mulberry32(seed);
    grid.fill(0);
    rooms = [];
    bspLines = [];
    mstEdges = [];
    overlappingRooms = 0;

    if (bspMode) {
      // Recursive Binary Space Partitioning (BSP) -> 6–8 guaranteed non-overlapping rooms + sibling tree corridors!
      function splitNode(x, y, w, h, depth) {
        const canH = h >= 8;
        const canV = w >= 9;
        if (depth >= 3 || (!canH && !canV)) {
          // Leaf node -> carve a cozy dungeon room inside margins!
          const rw = Math.max(3, Math.min(w - 2, 3 + Math.floor(rng() * (w - 4))));
          const rh = Math.max(3, Math.min(h - 2, 3 + Math.floor(rng() * (h - 4))));
          const rx = x + 1 + Math.floor(rng() * Math.max(1, w - rw - 1));
          const ry = y + 1 + Math.floor(rng() * Math.max(1, h - rh - 1));
          const rm = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
          rooms.push(rm);
          for (let r = ry; r < ry + rh; r++) {
            for (let c = rx; c < rx + rw; c++) grid[r * D_COLS + c] = 1;
          }
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
        // Connect sibling subtrees -> guarantees 100% Connected Spanning Tree!
        carveCorridor(leftRm.cx, leftRm.cy, rightRm.cx, rightRm.cy);
        mstEdges.push({ c0: leftRm.cx, r0: leftRm.cy, c1: rightRm.cx, r1: rightRm.cy });
        return rng() < 0.5 ? leftRm : rightRm;
      }
      splitNode(1, 1, D_COLS - 2, D_ROWS - 2, 0);
    } else {
      // PURE RANDOM ROOMS (No BSP, No Spanning Tree -> overlapping ugly rooms + disconnected Exit island!)
      const count = 8;
      for (let i = 0; i < count; i++) {
        const rw = 3 + Math.floor(rng() * 3);
        const rh = 3 + Math.floor(rng() * 3);
        // Place last room cleanly in far right corner isolated from left cluster to showcase unreachable Exit!
        const rx = i === count - 1 ? D_COLS - 5 : 1 + Math.floor(rng() * (D_COLS - 10));
        const ry = i === count - 1 ? D_ROWS - 5 : 1 + Math.floor(rng() * (D_ROWS - rh - 2));
        const rm = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
        let overlaps = false;
        for (let r = ry; r < ry + rh; r++) {
          for (let c = rx; c < rx + rw; c++) {
            if (grid[r * D_COLS + c] === 1) { grid[r * D_COLS + c] = 3; overlaps = true; }
            else grid[r * D_COLS + c] = 1;
          }
        }
        if (overlaps) overlappingRooms++;
        rooms.push(rm);
      }
      // Only link a couple random nearby pairs -> leaves isolated red islands!
      for (let i = 0; i < 3 && i + 1 < rooms.length - 1; i++) {
        carveCorridor(rooms[i].cx, rooms[i].cy, rooms[i + 1].cx, rooms[i + 1].cy);
        mstEdges.push({ c0: rooms[i].cx, r0: rooms[i].cy, c1: rooms[i + 1].cx, r1: rooms[i + 1].cy });
      }
    }

    // Pick Start (leftmost room) & Boss Exit (farthest room!)
    rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    start = { c: rooms[0].cx, r: rooms[0].cy };
    const far = rooms[rooms.length - 1];
    exit = { c: far.cx, r: far.cy };

    runFloodFillAndPath();
    const [sx, sz] = dTileToWorld(start.c, start.r);
    delver = { x: sx, z: sz, yaw: 0, pathIdx: 0 };
    version++;
  }

  function reset() {
    seed = 104;
    bspMode = true;
    showGraph = true;
    generate();
    bannerTimer = 0;
  }

  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Move Delver manually with WASD OR auto-walk along the verified BFS path from Start to Exit!
    const kw = keys?.has("KeyW") || keys?.has("ArrowUp");
    const ks = keys?.has("KeyS") || keys?.has("ArrowDown");
    const ka = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const kd = keys?.has("KeyD") || keys?.has("ArrowRight");
    const mx = (kd ? 1 : 0) - (ka ? 1 : 0);
    const mz = (ks ? 1 : 0) - (kw ? 1 : 0);

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

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const pill = bspMode
          ? (isPl ? `BSP + MST · ${rooms.length} pokoi · 100% PRZEJŚCIE` : `BSP + MST · ${rooms.length} rooms · 100% SOLVABLE`)
          : (isPl ? `LOSOWE · Odcięte: ${isolatedRooms} · WYJŚCIE ZABLOK.` : `RANDOM · Isolated: ${isolatedRooms} · UNSOLVABLE!`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(16, 12, 32, 0.86)";
        ctx.strokeStyle = exitReachable ? "rgba(168, 85, 247, 0.72)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = exitReachable ? "#d8b4fe" : "#fca5a5";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(298, cssW - 28), panelH = 140;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(16, 12, 32, 0.86)";
        ctx.strokeStyle = exitReachable ? "rgba(168, 85, 247, 0.72)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = bspMode ? "#d8b4fe" : "#fca5a5";
        ctx.fillText(bspMode ? `BSP + MST · SEED #${seed}` : `PURE RANDOM · SEED #${seed}`, px + 12, py + 21);

        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = exitReachable ? "#4ade80" : "#f87171";
        ctx.fillText(
          exitReachable
            ? (isPl ? `✓ WYJŚCIE OSIĄGALNE (${pathList.length} kroków)` : `✓ EXIT VERIFIED (${pathList.length} tiles)`)
            : (isPl ? "✗ WYJŚCIE ODCIĘTE! (BRAK DROGI)" : "✗ EXIT UNREACHABLE! (BROKEN SEED)"),
          px + 12, py + 48
        );
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(isPl ? `Pokoje: ${rooms.length}  ·  Cięcia BSP: ${bspLines.length}` : `Rooms: ${rooms.length}  ·  BSP Splits: ${bspLines.length}`, px + 12, py + 74);
        ctx.fillStyle = isolatedRooms > 0 ? "#fca5a5" : "#cbd5e1";
        ctx.fillText(isPl ? `Odcięte wyspy: ${isolatedRooms}  ·  Kolizje: ${overlappingRooms}` : `Isolated Islands: ${isolatedRooms}  ·  Overlaps: ${overlappingRooms}`, px + 12, py + 98);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Spacja = Nowy Seed · T = BSP / Losowy" : "Space = New Seed · T = BSP / Random", px + 12, py + 122);
        ctx.restore();
      }
    }

    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = "800 13.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = Math.min(cssW - 24, tw + 26);
      const bx = (cssW - bw) * 0.5, by = cssW < 640 ? 86 : 76;
      ctx.fillStyle = "rgba(16, 12, 32, 0.92)";
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
        { id: "toggle-mode", label: bspMode ? (pl ? "Algorytm: BSP + MST [T]" : "Algo: BSP + MST [T]") : (pl ? "Algorytm: Losowy [T]" : "Algo: Pure Random [T]"), pressed: bspMode },
        { id: "toggle-graph", label: showGraph ? (pl ? "Drzewo BSP: WŁ [X]" : "BSP Tree: ON [X]") : (pl ? "Drzewo BSP: WYŁ [X]" : "BSP Tree: OFF [X]"), pressed: showGraph },
      ];
    },
    onAction(id) {
      if (id === "new-seed") {
        seed = (seed * 73 + 19) % 997 + 1;
        generate();
        audio?.wallClick?.(true);
        setBanner(bspMode ? `BSP + MST SEED #${seed} · 100% SOLVABLE!` : `PURE RANDOM #${seed} · ISOLATED ISLANDS!`, bspMode ? "#c084fc" : "#ef4444", 1.8);
      } else if (id === "toggle-mode") {
        bspMode = !bspMode;
        generate();
        audio?.ruleSwitch?.(bspMode);
        setBanner(bspMode ? "BSP + MST: 0 OVERLAPS, 100% CONNECTED!" : "PURE RANDOM: OVERLAPS & UNREACHABLE EXIT!", bspMode ? "#4ade80" : "#ef4444", 2.0);
      } else if (id === "toggle-graph") {
        showGraph = !showGraph;
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space" || code === "KeyV") this.onAction("new-seed");
      else if (code === "KeyT") this.onAction("toggle-mode");
      else if (code === "KeyX") this.onAction("toggle-graph");
    },
    onClickWorld() { this.onAction("new-seed"); },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time, version, grid, bspLines, mstEdges, reachableSet, pathSet, delver, exit, showGraph,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { bspMode, seed, rooms: rooms.length, bspSplits: bspLines.length, exitReachable, isolatedRooms, overlappingRooms, pathLen: pathList.length };
    },
  };
}
