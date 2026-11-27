// Entry #42: Jump Point Search (JPS) vs Classic A* — Playable 3D Open-Grid Pathfinding Race!
// Implements BOTH true 8-directional no-corner-cutting Jump Point Search (Harabor & Grastien) AND
// Classic A* on the exact same 18x12 arena, animating their live search waves in slow-mo so you watch
// violet Jump Rays leap straight across open rooms (~8-10x fewer nodes) for the EXACT same optimal path!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const COLS = 18;
const ROWS = 12;
const CELL = 0.72;
const HALF_W = (COLS * CELL) * 0.5;
const HALF_H = (ROWS * CELL) * 0.5;

const D_ORTHO = 1.0;
const D_DIAG = Math.SQRT2;
const WAVE_RATE = 18.0; // Slow-mo search expansion rate (steps/sec)

// Two sleek L-shaped stone wall layouts creating long open corridors & forced-neighbor corners!
const LAYOUTS = [
  {
    name: "L-Chambers",
    start: { c: 1, r: 9 },
    goal: { c: 16, r: 2 },
    walls: [
      // Wall L1 (left)
      [5,2],[5,3],[5,4],[5,5],[5,6],[5,7],[5,8], [3,2],[4,2],
      // Wall L2 (center-bottom)
      [9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[9,10], [10,4],[11,4],
      // Wall L3 (right)
      [13,1],[13,2],[13,3],[13,4],[13,5],[13,6],[13,7], [14,7],[15,7],
    ],
  },
  {
    name: "Vault Corridors",
    start: { c: 1, r: 2 },
    goal: { c: 16, r: 9 },
    walls: [
      // Wall B1 (left-top)
      [4,1],[4,2],[4,3],[4,4],[4,5],[4,6], [5,6],[6,6],
      // Wall B2 (center-bottom)
      [8,5],[8,6],[8,7],[8,8],[8,9],[8,10], [6,5],[7,5],
      // Wall B3 (right-top)
      [13,1],[13,2],[13,3],[13,4],[13,5],[13,6],[13,7],[13,8], [11,8],[12,8],
    ],
  },
];

function idxOf(c, r) { return r * COLS + c; }
function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
function cellToWorld(c, r) {
  return { x: -HALF_W + (c + 0.5) * CELL, z: -HALF_H + (r + 0.5) * CELL };
}
function worldToCell(x, z) {
  return {
    c: clamp(Math.floor((x + HALF_W) / CELL), 0, COLS - 1),
    r: clamp(Math.floor((z + HALF_H) / CELL), 0, ROWS - 1),
  };
}
function octile(c0, r0, c1, r1) {
  const dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0);
  return D_ORTHO * (dx + dy) + (D_DIAG - 2 * D_ORTHO) * Math.min(dx, dy);
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.05, 0.03, 0.13],
    skyMid: [0.11, 0.07, 0.23],
    skyBot: [0.18, 0.11, 0.28],
    lightDir: [0.34, 0.88, 0.34],
    ambLow: [0.14, 0.11, 0.24],
    ambHigh: [0.40, 0.34, 0.56],
    orthoHalf: 12.2,
    maxWorldVerts: 36000,
    maxFxVerts: 26000,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  const defaultCam = { yaw: 0.0, pitch: 0.90, dist: 19.8, targetX: 0.0, targetY: 0.2, targetZ: 0.3, fovDeg: 40 };

  const blocked = new Uint8Array(COLS * ROWS);
  function isWalkable(c, r) { return inBounds(c, r) && !blocked[idxOf(c, r)]; }

  let time = 0;
  let jpsOn = true;      // ON: Jump Point Search (Violet Jump Rays) | OFF: Classic A* (Amber Tile Flood)
  let layoutIdx = 0;
  let userInteracted = false;

  let start = { c: 1, r: 9 };
  let goal = { c: 16, r: 2 };

  // Recorded search results for both algorithms on the exact same grid
  let jpsRes = null;
  let astarRes = null;
  let waveStep = 0;
  let waveDone = false;

  const runner = { x: 0, z: 0, yaw: 0.8, segIdx: 1, walkPhase: 0, speedNorm: 0, waitT: 0 };

  let bannerText = "";
  let bannerColor = "#c084fc";
  let bannerTimer = 0;
  function setBanner(t, c = "#c084fc", dur = 2.1) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  // 1. Classic 8-Directional A* (strict no-corner-cutting)
  function solveAStar() {
    const N = COLS * ROWS;
    const gScore = new Float64Array(N).fill(Infinity);
    const fScore = new Float64Array(N).fill(Infinity);
    const parent = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const steps = [];

    const sIdx = idxOf(start.c, start.r);
    const gIdx = idxOf(goal.c, goal.r);
    gScore[sIdx] = 0;
    fScore[sIdx] = octile(start.c, start.r, goal.c, goal.r);
    const open = [sIdx];

    const dirs = [
      [1, 0, D_ORTHO], [-1, 0, D_ORTHO], [0, 1, D_ORTHO], [0, -1, D_ORTHO],
      [1, 1, D_DIAG], [1, -1, D_DIAG], [-1, 1, D_DIAG], [-1, -1, D_DIAG],
    ];

    let found = false;
    while (open.length > 0) {
      let bestI = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestI]] - 1e-9 ||
           (Math.abs(fScore[open[i]] - fScore[open[bestI]]) <= 1e-9 && gScore[open[i]] > gScore[open[bestI]])) {
          bestI = i;
        }
      }
      const cur = open.splice(bestI, 1)[0];
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % COLS, cr = Math.floor(cur / COLS);
      steps.push({ c: cc, r: cr });

      if (cur === gIdx) { found = true; break; }

      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (!isWalkable(nc, nr)) continue;
        if (dc !== 0 && dr !== 0 && (!isWalkable(cc + dc, cr) || !isWalkable(cc, cr + dr))) continue;
        const nIdx = idxOf(nc, nr);
        if (closed[nIdx]) continue;
        const tentG = gScore[cur] + cost;
        if (tentG < gScore[nIdx] - 1e-9) {
          parent[nIdx] = cur;
          gScore[nIdx] = tentG;
          fScore[nIdx] = tentG + octile(nc, nr, goal.c, goal.r);
          if (!open.includes(nIdx)) open.push(nIdx);
        }
      }
    }

    const path = [];
    if (found) {
      let cur = gIdx;
      while (cur !== -1) {
        path.push(cellToWorld(cur % COLS, Math.floor(cur / COLS)));
        cur = parent[cur];
      }
      path.reverse();
    }
    return {
      found,
      cost: found ? gScore[gIdx] : 0,
      expanded: steps.length,
      steps,
      path,
    };
  }

  // 2. True 8-Directional Jump Point Search (Harabor & Grastien, strict no-corner-cutting!)
  function solveJPS() {
    const N = COLS * ROWS;
    const gScore = new Float64Array(N).fill(Infinity);
    const fScore = new Float64Array(N).fill(Infinity);
    const parent = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const steps = [];

    // Jump recursively along (dc, dr) until hitting Goal, a Forced Neighbor corner, or a wall!
    function jump(c, r, dc, dr, rayLog, recordRay) {
      let curC = c, curR = r;
      const originC = c, originR = r;
      while (true) {
        const nc = curC + dc, nr = curR + dr;
        if (!isWalkable(nc, nr)) {
          if (recordRay && (curC !== originC || curR !== originR)) {
            rayLog.push({ c0: originC, r0: originR, c1: curC, r1: curR, hitJP: false });
          }
          return null;
        }
        if (dc !== 0 && dr !== 0 && (!isWalkable(curC + dc, curR) || !isWalkable(curC, curR + dr))) {
          if (recordRay && (curC !== originC || curR !== originR)) {
            rayLog.push({ c0: originC, r0: originR, c1: curC, r1: curR, hitJP: false });
          }
          return null;
        }

        if (nc === goal.c && nr === goal.r) {
          if (recordRay) rayLog.push({ c0: originC, r0: originR, c1: nc, r1: nr, hitJP: true });
          return [nc, nr];
        }

        if (dc !== 0 && dr !== 0) {
          // Diagonal step: check both cardinal sub-jumps for forced-neighbor corners or goal!
          if (jump(nc, nr, dc, 0, rayLog, false) !== null || jump(nc, nr, 0, dr, rayLog, false) !== null) {
            if (recordRay) rayLog.push({ c0: originC, r0: originR, c1: nc, r1: nr, hitJP: true });
            return [nc, nr];
          }
        } else if (dc !== 0) {
          // Horizontal step (no-corner-cutting): forced neighbor when wall sits behind-above/below an open turn!
          const forceUp = isWalkable(nc, nr - 1) && !isWalkable(nc - dc, nr - 1);
          const forceDn = isWalkable(nc, nr + 1) && !isWalkable(nc - dc, nr + 1);
          if (forceUp || forceDn) {
            if (recordRay) rayLog.push({ c0: originC, r0: originR, c1: nc, r1: nr, hitJP: true });
            return [nc, nr];
          }
        } else {
          // Vertical step (no-corner-cutting): forced neighbor when wall sits behind-left/right an open turn!
          const forceL = isWalkable(nc - 1, nr) && !isWalkable(nc - 1, nr - dr);
          const forceR = isWalkable(nc + 1, nr) && !isWalkable(nc + 1, nr - dr);
          if (forceL || forceR) {
            if (recordRay) rayLog.push({ c0: originC, r0: originR, c1: nc, r1: nr, hitJP: true });
            return [nc, nr];
          }
        }
        curC = nc; curR = nr;
      }
    }

    function prunedDirs(cc, cr, pIdx) {
      if (pIdx === -1) {
        return [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      }
      const pc = pIdx % COLS, pr = Math.floor(pIdx / COLS);
      const dc = Math.sign(cc - pc), dr = Math.sign(cr - pr);
      const out = [];
      if (dc !== 0 && dr !== 0) {
        if (isWalkable(cc + dc, cr)) out.push([dc, 0]);
        if (isWalkable(cc, cr + dr)) out.push([0, dr]);
        if (isWalkable(cc + dc, cr) && isWalkable(cc, cr + dr)) out.push([dc, dr]);
      } else if (dc !== 0) {
        if (isWalkable(cc + dc, cr)) out.push([dc, 0]);
        if (isWalkable(cc, cr - 1) && !isWalkable(cc - dc, cr - 1)) {
          out.push([0, -1]);
          if (isWalkable(cc + dc, cr)) out.push([dc, -1]);
        }
        if (isWalkable(cc, cr + 1) && !isWalkable(cc - dc, cr + 1)) {
          out.push([0, 1]);
          if (isWalkable(cc + dc, cr)) out.push([dc, 1]);
        }
      } else {
        if (isWalkable(cc, cr + dr)) out.push([0, dr]);
        if (isWalkable(cc - 1, cr) && !isWalkable(cc - 1, cr - dr)) {
          out.push([-1, 0]);
          if (isWalkable(cc, cr + dr)) out.push([-1, dr]);
        }
        if (isWalkable(cc + 1, cr) && !isWalkable(cc + 1, cr - dr)) {
          out.push([1, 0]);
          if (isWalkable(cc, cr + dr)) out.push([1, dr]);
        }
      }
      return out;
    }

    const sIdx = idxOf(start.c, start.r);
    const gIdx = idxOf(goal.c, goal.r);
    gScore[sIdx] = 0;
    fScore[sIdx] = octile(start.c, start.r, goal.c, goal.r);
    const open = [sIdx];

    let found = false;
    while (open.length > 0) {
      let bestI = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestI]] - 1e-9 ||
           (Math.abs(fScore[open[i]] - fScore[open[bestI]]) <= 1e-9 && gScore[open[i]] > gScore[open[bestI]])) {
          bestI = i;
        }
      }
      const cur = open.splice(bestI, 1)[0];
      if (closed[cur]) continue;
      closed[cur] = 1;

      const cc = cur % COLS, cr = Math.floor(cur / COLS);
      const rays = [];
      const pIdx = parent[cur];
      const stepRec = {
        c: cc, r: cr,
        fromC: pIdx === -1 ? cc : pIdx % COLS,
        fromR: pIdx === -1 ? cr : Math.floor(pIdx / COLS),
        rays,
      };
      steps.push(stepRec);

      if (cur === gIdx) { found = true; break; }

      for (const [dc, dr] of prunedDirs(cc, cr, pIdx)) {
        const jp = jump(cc, cr, dc, dr, rays, true);
        if (!jp) continue;
        const [jc, jr] = jp;
        const jIdx = idxOf(jc, jr);
        if (closed[jIdx]) continue;
        const tentG = gScore[cur] + octile(cc, cr, jc, jr);
        if (tentG < gScore[jIdx] - 1e-9) {
          parent[jIdx] = cur;
          gScore[jIdx] = tentG;
          fScore[jIdx] = tentG + octile(jc, jr, goal.c, goal.r);
          if (!open.includes(jIdx)) open.push(jIdx);
        }
      }
    }

    // Reconstruct straight-line Jump Point chain
    const path = [];
    if (found) {
      let cur = gIdx;
      while (cur !== -1) {
        path.push(cellToWorld(cur % COLS, Math.floor(cur / COLS)));
        cur = parent[cur];
      }
      path.reverse();
    }
    return {
      found,
      cost: found ? gScore[gIdx] : 0,
      expanded: steps.length,
      steps,
      path,
    };
  }

  function rebuildWorldMesh() {
    const wBuf = [];
    // Dark cosmic slate foundation plinth
    pushBox(wBuf, -HALF_W - 0.42, HALF_W + 0.42, -0.48, -0.06, -HALF_H - 0.42, HALF_H + 0.42, [0.10, 0.08, 0.19], 1);
    // Outer frame rails
    pushBox(wBuf, -HALF_W - 0.42, HALF_W + 0.42, -0.06, 0.34, -HALF_H - 0.42, -HALF_H, [0.22, 0.18, 0.36], 1);
    pushBox(wBuf, -HALF_W - 0.42, HALF_W + 0.42, -0.06, 0.34, HALF_H, HALF_H + 0.42, [0.22, 0.18, 0.36], 1);
    pushBox(wBuf, -HALF_W - 0.42, -HALF_W, -0.06, 0.34, -HALF_H, HALF_H, [0.22, 0.18, 0.36], 1);
    pushBox(wBuf, HALF_W, HALF_W + 0.42, -0.06, 0.34, -HALF_H, HALF_H, [0.22, 0.18, 0.36], 1);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x0 = -HALF_W + c * CELL, x1 = x0 + CELL - 0.025;
        const z0 = -HALF_H + r * CELL, z1 = z0 + CELL - 0.025;
        const chk = (c + r) % 2 === 0;
        if (blocked[idxOf(c, r)]) {
          // Sleek chamfered obsidian-stone L-wall block with violet emissive trim!
          pushBox(wBuf, x0, x1, -0.06, 1.38, z0, z1, [0.36, 0.30, 0.50], 1);
          pushBox(wBuf, x0 + 0.05, x1 - 0.05, 1.38, 1.46, z0 + 0.05, z1 - 0.05, [0.68, 0.40, 0.98], 2);
        } else {
          pushBox(wBuf, x0, x1, -0.06, 0.0, z0, z1, chk ? [0.19, 0.17, 0.30] : [0.23, 0.21, 0.35], 0);
        }
      }
    }
    studio.setWorldData(wBuf);
  }

  function applyLayout(idx) {
    layoutIdx = idx % LAYOUTS.length;
    const lay = LAYOUTS[layoutIdx];
    blocked.fill(0);
    for (const [wc, wr] of lay.walls) blocked[idxOf(wc, wr)] = 1;
    start = { ...lay.start };
    goal = { ...lay.goal };
    rebuildWorldMesh();
    recomputeSearch({ prewarm: 0 });
  }

  function recomputeSearch({ prewarm = 0 } = {}) {
    jpsRes = solveJPS();
    astarRes = solveAStar();
    waveStep = prewarm;
    const curRes = jpsOn ? jpsRes : astarRes;
    waveDone = waveStep >= curRes.steps.length;

    const sw = cellToWorld(start.c, start.r);
    runner.x = sw.x;
    runner.z = sw.z;
    runner.yaw = Math.PI * 0.5;
    runner.segIdx = 1;
    runner.speedNorm = 0;
    runner.waitT = 0;
  }

  function reset() {
    time = 0;
    jpsOn = true;
    bannerTimer = 0;
    applyLayout(0);
    // Pre-warm wave slightly so Frame 1 already shows dramatic violet Jump Rays leaping across the open arena!
    recomputeSearch({ prewarm: 7 });
  }
  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    const active = jpsOn ? jpsRes : astarRes;
    if (!active) return;

    if (!waveDone) {
      // Animate live search expansion at 18 steps/sec (slightly brisker for A* after 30 tiles? Keep steady 18 steps/sec so race contrast is genuine!)
      waveStep += dt * WAVE_RATE;
      if (waveStep >= active.steps.length) {
        waveStep = active.steps.length;
        waveDone = true;
        if (userInteracted) audio?.coinPickup?.();
      }
      return;
    }

    // Wave finished -> sprint our Runner cleanly along the optimal path!
    const pts = active.path;
    if (!pts || pts.length < 2) return;

    if (runner.waitT > 0) {
      runner.waitT = Math.max(0, runner.waitT - dt);
      runner.speedNorm = Math.max(0, runner.speedNorm - dt * 5);
      if (runner.waitT === 0) {
        // Replay live search wave cleanly so the diorama stays vividly animated!
        recomputeSearch({ prewarm: 0 });
      }
      return;
    }

    const target = pts[Math.min(runner.segIdx, pts.length - 1)];
    const dx = target.x - runner.x;
    const dz = target.z - runner.z;
    const d = Math.hypot(dx, dz);
    const sp = 4.4;

    if (d <= sp * dt + 0.05) {
      runner.x = target.x;
      runner.z = target.z;
      runner.segIdx++;
      if (runner.segIdx >= pts.length) {
        runner.waitT = 1.15;
        if (userInteracted) audio?.goalWin?.();
      }
    } else {
      runner.x += (dx / d) * sp * dt;
      runner.z += (dz / d) * sp * dt;
      runner.yaw = Math.atan2(dx, dz);
      runner.walkPhase += dt * 12.0;
      runner.speedNorm = 1.0;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    const jpsN = jpsRes?.expanded || 1;
    const astN = astarRes?.expanded || 1;
    const speedup = (astN / Math.max(1, jpsN)).toFixed(1);
    const shownSteps = Math.min(Math.floor(waveStep), (jpsOn ? jpsN : astN));

    if (viewProj) {
      const sw = cellToWorld(start.c, start.r);
      const gw = cellToWorld(goal.c, goal.r);

      const sp = projectToScreen(viewProj, sw.x, 1.30, sw.z, cssW, cssH);
      if (sp) drawWorldPill(ctx, sp.x, sp.y, "START", "#34d399", cssW, cssH, isCompact ? 8.2 : 9.0);

      const gp = projectToScreen(viewProj, gw.x, 1.40, gw.z, cssW, cssH);
      if (gp) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && gp.y < 235) ? Math.min(gp.x, cssW - 385) : gp.x;
        drawWorldPill(ctx, safeX, gp.y, isPl ? "CEL (KLIK = PRZESTAW)" : "GOAL (CLICK ANY TILE)", "#facc15", cssW, cssH, isCompact ? 8.2 : 9.2);
      }

      // Live search comparison callout near arena center!
      const mp = projectToScreen(viewProj, 0.0, 2.0, -0.6, cssW, cssH);
      if (mp) {
        const txt = jpsOn
          ? (isPl ? `JPS: ${shownSteps}/${jpsN} WĘZŁÓW (${speedup}× SZYBCIEJ ✓)` : `JPS: ${shownSteps}/${jpsN} NODES (${speedup}× FEWER ✓)`)
          : (isPl ? `A*: ZALEWA ${shownSteps}/${astN} PÓL! ✗` : `CLASSIC A*: FLOODING ${shownSteps}/${astN} TILES! ✗`);
        drawWorldPill(ctx, mp.x, mp.y, txt, jpsOn ? "#c084fc" : "#fb923c", cssW, cssH, isCompact ? 8.8 : 9.8);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${jpsOn ? `JPS: ${jpsN} nodes` : `A*: ${astN} nodes`} · ${speedup}× speedup`,
          jpsOn ? "#c084fc" : "#fb923c",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 342, panelH = 166, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(14, 10, 28, 0.90)";
        ctx.strokeStyle = jpsOn ? "rgba(192, 132, 252, 0.86)" : "rgba(251, 146, 60, 0.86)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = jpsOn ? "#d8b4fe" : "#fdba74";
        ctx.fillText(
          jpsOn
            ? (isPl ? "JUMP POINT SEARCH · SKOKI PO PROSTYCH ✓" : "JUMP POINT SEARCH · OPEN-SPACE LEAPS ✓")
            : (isPl ? "KLASYCZNY A* · PEŁNE ZALEWANIE SIATKI" : "CLASSIC A* · EXPANDS EVERY OPEN TILE"),
          px + 12, py + 21, bw
        );

        // Dual side-by-side expansion bar!
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        const frac = jpsOn ? clamp(jpsN / Math.max(1, astN), 0.08, 1.0) : clamp(shownSteps / Math.max(1, astN), 0.08, 1.0);
        ctx.fillStyle = jpsOn ? "#a855f7" : "#f97316";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw * frac, 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          `JPS: ${jpsN} nodes vs A*: ${astN} nodes · ${speedup}× speedup!`,
          px + 18, py + 45.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#86efac";
        ctx.fillText(
          isPl
            ? `Ten sam optymalny koszt: ${(jpsRes?.cost || 0).toFixed(2)} (A*: ${(astarRes?.cost || 0).toFixed(2)})`
            : `Exact same optimal cost: ${(jpsRes?.cost || 0).toFixed(2)} (A*: ${(astarRes?.cost || 0).toFixed(2)})`,
          px + 12, py + 76, bw
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl
            ? `Fala na żywo: ${shownSteps} / ${jpsOn ? jpsN : astN} · Mapa: ${LAYOUTS[layoutIdx].name}`
            : `Live Wave: ${shownSteps} / ${jpsOn ? jpsN : astN} · Arena: ${LAYOUTS[layoutIdx].name}`,
          px + 12, py + 98, bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "Klik = Przenieś Cel · V = Powtórz / Zmień Mury" : "Click = Move Goal · V = Replay / Swap Walls",
          px + 12, py + 124, bw
        );
        ctx.fillStyle = "#c084fc";
        ctx.fillText(
          isPl ? "T = Jump Point Search / Klasyczny A*" : "T = Jump Point Search / Classic A*",
          px + 12, py + 148, bw
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
          id: "toggle-jps",
          label: jpsOn
            ? (pl ? "JPS (Skoki): WŁ [T]" : "Jump Point Search: ON [T]")
            : (pl ? "Klasyczny A* [T]" : "Classic A* [T]"),
          pressed: jpsOn,
        },
        {
          id: "swap-replay",
          label: pl ? "Zmień Mury / Powtórz [V]" : "Swap Walls / Replay [V]",
          pressed: false,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-jps") {
        jpsOn = !jpsOn;
        recomputeSearch({ prewarm: 0 });
        audio?.ruleSwitch?.(jpsOn);
        const speedup = ((astarRes?.expanded || 1) / Math.max(1, jpsRes?.expanded || 1)).toFixed(1);
        setBanner(
          jpsOn
            ? `JUMP POINT SEARCH ON: ONLY ${jpsRes.expanded} NODES EXPANDED (${speedup}× FEWER THAN A*)!`
            : `CLASSIC A* OFF: EXPANDS ${astarRes.expanded} OPEN TILES FOR THE EXACT SAME PATH!`,
          jpsOn ? "#c084fc" : "#fb923c",
          2.2
        );
      } else if (id === "swap-replay") {
        applyLayout((layoutIdx + 1) % LAYOUTS.length);
        audio?.wallClick?.(true);
        setBanner(`ARENA "${LAYOUTS[layoutIdx].name.toUpperCase()}" — REPLAYING SEARCH WAVE!`, "#c084fc", 1.9);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-jps");
      else if (code === "KeyV") this.onAction("swap-replay");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        const cell = worldToCell(world[0], world[2]);
        if (isWalkable(cell.c, cell.r) && (cell.c !== start.c || cell.r !== start.r)) {
          goal = { c: cell.c, r: cell.r };
          recomputeSearch({ prewarm: 0 });
          audio?.coinPickup?.();
          requestHudRefresh?.();
        } else {
          audio?.inputIgnored?.();
        }
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        {
          gpu: runnerGpu, x: runner.x, y: 0.02, z: runner.z, yaw: runner.yaw,
          animA: runner.walkPhase, animB: runner.speedNorm, scale: 0.78, animMode: 2,
          tint: jpsOn ? [0.76, 0.44, 1.0, 0.45] : [1.0, 0.62, 0.18, 0.45],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          const sw = cellToWorld(start.c, start.r);
          const gw = cellToWorld(goal.c, goal.r);

          // Start & Goal glowing pads
          fx.ringXZ(sw.x, 0.06, sw.z, 0.42, [0.22, 0.96, 0.66, 0.90]);
          fx.ringXZ(gw.x, 0.06, gw.z, 0.48 + 0.08 * Math.sin(time * 5), [1.0, 0.84, 0.18, 0.94]);
          fx.billboard(gw.x, 0.76, gw.z, 0.25, basis.right, basis.up, [1.0, 0.86, 0.22, 0.90], 2);

          const active = jpsOn ? jpsRes : astarRes;
          if (!active) return;

          const count = Math.min(Math.floor(waveStep), active.steps.length);

          if (jpsOn) {
            // Render glowing violet Jump Rays + Neon Jump Point rings!
            for (let i = 0; i < count; i++) {
              const st = active.steps[i];
              const isRecent = i >= count - 2 && !waveDone;
              const p = cellToWorld(st.c, st.r);

              // Violet Jump Rays firing across open rooms
              for (const ray of st.rays) {
                const a = cellToWorld(ray.c0, ray.r0);
                const b = cellToWorld(ray.c1, ray.r1);
                const col = ray.hitJP
                  ? [0.80, 0.42, 1.0, isRecent ? 0.96 : 0.64]
                  : [0.46, 0.34, 0.88, isRecent ? 0.52 : 0.24];
                fx.beam(a.x, 0.09, a.z, b.x, 0.09, b.z, ray.hitJP ? 0.095 : 0.045, col, ray.hitJP ? 0 : 4);
              }

              // Jump Point node ring + subtle tile glow!
              const x0 = p.x - CELL * 0.44, x1 = p.x + CELL * 0.44;
              const z0 = p.z - CELL * 0.44, z1 = p.z + CELL * 0.44;
              fx.quadXZ(x0, x1, 0.055, z0, z1, isRecent ? [0.86, 0.56, 1.0, 0.78] : [0.58, 0.32, 0.96, 0.44]);
              fx.ringXZ(p.x, 0.10, p.z, isRecent ? 0.40 : 0.29, isRecent ? [0.22, 0.98, 1.0, 0.96] : [0.82, 0.50, 1.0, 0.88]);
            }
          } else {
            // Classic A*: Amber tile flood expanding across open rooms!
            for (let i = 0; i < count; i++) {
              const st = active.steps[i];
              const isHead = i >= count - 3 && !waveDone;
              const p = cellToWorld(st.c, st.r);
              const x0 = p.x - CELL * 0.45, x1 = p.x + CELL * 0.45;
              const z0 = p.z - CELL * 0.45, z1 = p.z + CELL * 0.45;
              fx.quadXZ(
                x0, x1, 0.055, z0, z1,
                isHead ? [1.0, 0.86, 0.24, 0.86] : [0.96, 0.52, 0.14, 0.48]
              );
            }
          }

          // Once search finishes, draw the crisp optimal path!
          if (waveDone && active.path.length >= 2) {
            const pathCol = jpsOn ? [0.22, 0.98, 0.78, 0.96] : [1.0, 0.84, 0.20, 0.96];
            for (let i = 1; i < active.path.length; i++) {
              const a = active.path[i - 1], b = active.path[i];
              fx.beam(a.x, 0.16, a.z, b.x, 0.16, b.z, 0.12, pathCol, 0);
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const jpsN = jpsRes?.expanded || 0;
      const astN = astarRes?.expanded || 0;
      return {
        jpsOn,
        layoutIdx,
        jpsExpanded: jpsN,
        astarExpanded: astN,
        speedup: Number((astN / Math.max(1, jpsN)).toFixed(2)),
        jpsCost: Number((jpsRes?.cost || 0).toFixed(3)),
        astarCost: Number((astarRes?.cost || 0).toFixed(3)),
        waveDone,
        goalCell: [goal.c, goal.r],
      };
    },
  };
}
