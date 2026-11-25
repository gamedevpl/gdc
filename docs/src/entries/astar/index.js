// Playable Entry #1: A* Pathfinding (Walk the 3D Stone Maze yourself with WASD/Arrows,
// click any tile to paint walls live, Shift+Click to move Goal (0), generate random mazes, or hit Auto-Solve!)
import { createMazeRenderer, MAZE_W, MAZE_H } from "./maze-renderer.js";

const DEFAULT_MAZE = [
  "###########",
  "#..#......#",
  "#..#.##.#.#",
  "#....#..#.#",
  "####.#.##.#",
  "#....#....#",
  "#.####.##.#",
  "#.#....#..#",
  "#.#.##.##.#",
  "#...#.....#",
  "#.###.###.#",
  "#.....#...#",
  "#.###.#.#.#",
  "#.....#...#",
  "###########",
];

function generateSolvableMaze(start, goal) {
  // Carve guaranteed solvable braided stone dungeon via randomized DFS + extra loops!
  const g = Array.from({ length: MAZE_H }, () => Array(MAZE_W).fill("#"));
  const visited = new Set();
  function carve(x, z) {
    visited.add(`${x},${z}`);
    g[z][x] = ".";
    const dirs = [[2,0],[-2,0],[0,2],[0,-2]].sort(() => Math.random() - 0.5);
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (nx > 0 && nx < MAZE_W - 1 && nz > 0 && nz < MAZE_H - 1 && !visited.has(`${nx},${nz}`)) {
        g[z + dz / 2][x + dx / 2] = ".";
        carve(nx, nz);
      }
    }
  }
  carve(1, 1);
  // Knock out a few extra interior walls so there are fun competing routes!
  for (let i = 0; i < 14; i++) {
    const rx = 1 + Math.floor(Math.random() * (MAZE_W - 2));
    const rz = 1 + Math.floor(Math.random() * (MAZE_H - 2));
    g[rz][rx] = ".";
  }
  g[start.z][start.x] = ".";
  g[goal.z][goal.x] = ".";
  return g;
}

function project3D(world, vp, w, h) {
  const [x, y, z] = world;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
}

function drawBadge(ctx, x, y, text, bg, fg = "#ffffff", maxW = 1200) {
  ctx.save();
  ctx.font = "800 13px 'Proxima', -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  const pw = tw + 14, ph = 22;
  const cx = Math.max(pw / 2 + 8, Math.min(maxW - pw / 2 - 8, x));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - pw / 2, y - ph / 2, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(15,14,24,0.85)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + 0.5);
  ctx.restore();
}

function drawMazeHud(ctx, ow, state, lang) {
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 24, 410);
  const boxH = 38;
  const x = ow - boxW - 18;
  const y = 78;
  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.playerMode ? "#00e4ac" : "#38bdf8";
  ctx.stroke();

  const dHere = state.distHere >= 0 ? state.distHere : "∞";
  const lbl = state.playerMode
    ? (pl
      ? `KROKI: ${state.stepsTaken} · DO METY: ${dHere} · OPTIMUM: ${state.bestFromStart}`
      : `STEPS: ${state.stepsTaken} · TO GOAL: ${dHere} · OPTIMAL: ${state.bestFromStart}`)
    : (pl ? `AUTO-SOLVE · KROKÓW: ${state.bestFromStart} · WASD = CHODŹ SAM` : `AUTO-SOLVE · BEST: ${state.bestFromStart} · PRESS WASD TO WALK`);
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.playerMode ? "#76ddaf" : "#bae6fd";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(lbl, x + 12, y + boxH / 2 + 0.5);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh } = {}) {
  let grid = DEFAULT_MAZE.map(r => r.split(""));
  let start = { x: 1, z: 13 };
  let goal = { x: 9, z: 1 };
  let showNumbers = true;
  let playerMode = false; // switches to true on WASD/Arrows; Space triggers Auto-Solve!
  let prevPlayerMode = false;
  let wavePhase = 0;
  let heroT = 0;
  let time = 0;
  let stepsTaken = 0;
  let reachedGoal = false;

  // Player live tile + smooth hop interpolation
  let pTile = { x: start.x, z: start.z };
  let pFrom = { x: start.x, z: start.z };
  let pMoveT = 1.0;
  let pYaw = 0;
  let pTrail = [{ x: start.x, z: start.z }];
  let moveCooldown = 0;

  let dist = new Int16Array(MAZE_W * MAZE_H);
  let path = [];
  let maxDist = 1;
  let bestFromStart = 0;
  const tileRgba = new Uint8Array(MAZE_W * MAZE_H * 4);
  const sparks = [];

  const renderer = createMazeRenderer(gl, grid.map(r => r.join("")));

  function computeField() {
    dist.fill(-1);
    const q = [[goal.x, goal.z]];
    dist[goal.z * MAZE_W + goal.x] = 0;
    maxDist = 1;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let qi = 0;
    while (qi < q.length) {
      const [cx, cz] = q[qi++];
      const d = dist[cz * MAZE_W + cx];
      if (d > maxDist) maxDist = d;
      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (nx <= 0 || nx >= MAZE_W - 1 || nz <= 0 || nz >= MAZE_H - 1) continue;
        if (grid[nz][nx] === "#") continue;
        const ni = nz * MAZE_W + nx;
        if (dist[ni] !== -1) continue;
        dist[ni] = d + 1;
        q.push([nx, nz]);
      }
    }
    bestFromStart = Math.max(0, dist[start.z * MAZE_W + start.x]);
    // Trace shortest downhill path from current start (or player tile in auto-solve)
    path = [];
    const orig = playerMode ? pTile : start;
    let cx = orig.x, cz = orig.z;
    if (dist[cz * MAZE_W + cx] >= 0) {
      path.push({ x: cx, z: cz });
      let guard = 0;
      while ((cx !== goal.x || cz !== goal.z) && guard++ < 220) {
        let best = null, bestD = dist[cz * MAZE_W + cx];
        for (const [dx, dz] of dirs) {
          const nx = cx + dx, nz = cz + dz;
          const nd = dist[nz * MAZE_W + nx];
          if (nd >= 0 && nd < bestD) { bestD = nd; best = [nx, nz]; }
        }
        if (!best) break;
        cx = best[0]; cz = best[1];
        path.push({ x: cx, z: cz });
      }
    }
  }
  computeField();

  function burstCelebration(gx, gz) {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      sparks.push({
        x: gx + 0.5, y: 0.45, z: gz + 0.5,
        vx: Math.cos(a) * (1.2 + Math.random() * 1.5),
        vy: 1.9 + Math.random() * 1.6,
        vz: Math.sin(a) * (1.2 + Math.random() * 1.5),
        r: 1.0, g: 0.85, b: 0.25, life: 1.0,
      });
    }
  }

  function startAutoSolve() {
    playerMode = false;
    reachedGoal = false;
    wavePhase = 0;
    heroT = 0;
    sparks.length = 0;
    computeField();
  }

  function resetPlayerToStart() {
    pTile = { x: start.x, z: start.z };
    pFrom = { x: start.x, z: start.z };
    pMoveT = 1.0;
    stepsTaken = 0;
    reachedGoal = false;
    pTrail = [{ x: start.x, z: start.z }];
  }

  function tryStepPlayer(dx, dz) {
    if (moveCooldown > 0) return;
    if (!playerMode) {
      playerMode = true;
      wavePhase = maxDist + 4;
      resetPlayerToStart();
    }
    const nx = pTile.x + dx, nz = pTile.z + dz;
    if (nx <= 0 || nx >= MAZE_W - 1 || nz <= 0 || nz >= MAZE_H - 1) return;
    if (grid[nz][nx] === "#") return;
    pFrom = { ...pTile };
    pTile = { x: nx, z: nz };
    pMoveT = 0;
    pYaw = Math.atan2(dx, dz);
    moveCooldown = 0.14;
    stepsTaken++;
    pTrail.push({ x: nx, z: nz });
    if (pTrail.length > 60) pTrail.shift();
    computeField();
    if (nx === goal.x && nz === goal.z && !reachedGoal) {
      reachedGoal = true;
      burstCelebration(goal.x, goal.z);
    }
  }

  function reset() {
    grid = DEFAULT_MAZE.map(r => r.split(""));
    start = { x: 1, z: 13 };
    goal = { x: 9, z: 1 };
    playerMode = false;
    resetPlayerToStart();
    renderer.rebuildMaze(grid.map(r => r.join("")));
    startAutoSolve();
  }

  function randomizeMaze() {
    start = { x: 1, z: 13 };
    goal = { x: 9, z: 1 };
    grid = generateSolvableMaze(start, goal);
    resetPlayerToStart();
    renderer.rebuildMaze(grid.map(r => r.join("")));
    if (playerMode) {
      wavePhase = maxDist + 4;
      computeField();
    } else {
      startAutoSolve();
    }
  }

  function onClickWorld(worldPt, { shiftKey }) {
    const tx = Math.floor(worldPt[0] + MAZE_W * 0.5);
    const tz = Math.floor(worldPt[2] + MAZE_H * 0.5);
    if (tx <= 0 || tx >= MAZE_W - 1 || tz <= 0 || tz >= MAZE_H - 1) return;
    if (shiftKey) {
      if (grid[tz][tx] !== "#" && (tx !== start.x || tz !== start.z)) {
        goal = { x: tx, z: tz };
        reachedGoal = false;
        computeField();
        if (!playerMode) startAutoSolve();
      }
      return;
    }
    if ((tx === start.x && tz === start.z) || (tx === goal.x && tz === goal.z)) return;
    if (playerMode && tx === pTile.x && tz === pTile.z) return;
    grid[tz][tx] = grid[tz][tx] === "#" ? "." : "#";
    renderer.rebuildMaze(grid.map(r => r.join("")));
    computeField();
    if (!playerMode) startAutoSolve();
    else wavePhase = maxDist + 4;
  }

  function update(dt, keys = new Set()) {
    const h = Math.min(0.05, Math.max(0.001, dt));
    time += h;
    moveCooldown = Math.max(0, moveCooldown - h);

    // Continuous WASD / Arrow walking!
    if (keys.has("KeyW") || keys.has("ArrowUp")) tryStepPlayer(0, -1);
    else if (keys.has("KeyS") || keys.has("ArrowDown")) tryStepPlayer(0, 1);
    else if (keys.has("KeyA") || keys.has("ArrowLeft")) tryStepPlayer(-1, 0);
    else if (keys.has("KeyD") || keys.has("ArrowRight")) tryStepPlayer(1, 0);
    if (playerMode !== prevPlayerMode) {
      prevPlayerMode = playerMode;
      requestHudRefresh?.();
    }

    if (playerMode) {
      wavePhase = Math.max(wavePhase, maxDist + 4);
      pMoveT = Math.min(1, pMoveT + h * 7.5);
    } else {
      wavePhase += h * 10.0;
      const walkStart = maxDist + 2.0;
      if (path.length >= 2 && wavePhase > walkStart) {
        const prevIdx = Math.floor(heroT);
        heroT = Math.min(path.length - 1, heroT + h * 3.6);
        if (heroT >= path.length - 1 && prevIdx < path.length - 1) {
          burstCelebration(goal.x, goal.z);
        }
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      s.vy -= 4.2 * h;
      s.life -= h * 1.1;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    tileRgba.fill(0);
    const onPathSet = new Set();
    if (playerMode) {
      for (const pt of path) onPathSet.add(pt.z * MAZE_W + pt.x);
    } else if (wavePhase > maxDist + 1.5) {
      const curStep = Math.floor(heroT);
      for (let i = 0; i <= Math.min(curStep, path.length - 1); i++) {
        onPathSet.add(path[i].z * MAZE_W + path[i].x);
      }
    }

    for (let z = 0; z < MAZE_H; z++) {
      for (let x = 0; x < MAZE_W; x++) {
        const idx = z * MAZE_W + x;
        const d = dist[idx];
        const o = idx * 4;
        if (d < 0) continue;
        const reveal = Math.max(0, Math.min(1, wavePhase - d));
        if (reveal <= 0) continue;
        const normD = Math.min(1, d / Math.max(1, maxDist));
        tileRgba[o + 0] = Math.round(reveal * 210);
        tileRgba[o + 1] = Math.round((1 - normD) * 235);
        tileRgba[o + 2] = onPathSet.has(idx) ? 245 : 0;
        tileRgba[o + 3] = 255;
      }
    }

    let hx = start.x, hz = start.z, hy = 0, hyaw = 0;
    let trailPts = [];
    let nextHint = null;
    if (playerMode) {
      hx = pFrom.x + (pTile.x - pFrom.x) * pMoveT;
      hz = pFrom.z + (pTile.z - pFrom.z) * pMoveT;
      hy = Math.sin(pMoveT * Math.PI) * 0.24;
      hyaw = pYaw;
      trailPts = [...pTrail, { x: hx, z: hz }];
      if (path.length >= 2) nextHint = { from: path[0], to: path[1] };
    } else if (path.length >= 2) {
      const i0 = Math.min(path.length - 1, Math.floor(heroT));
      const i1 = Math.min(path.length - 1, i0 + 1);
      const f = heroT - i0;
      hx = path[i0].x + (path[i1].x - path[i0].x) * f;
      hz = path[i0].z + (path[i1].z - path[i0].z) * f;
      hy = Math.sin(f * Math.PI) * 0.22;
      if (i1 !== i0) hyaw = Math.atan2(path[i1].x - path[i0].x, path[i1].z - path[i0].z);
      for (let i = 0; i <= i0; i++) trailPts.push(path[i]);
      trailPts.push({ x: hx, z: hz });
    }

    const { viewProj, HALF_W, HALF_H } = renderer.render({
      w, h, cam, time, tileRgba,
      hero: { x: hx, y: hy, z: hz, yaw: hyaw },
      goal,
      compassAlpha: 0.75,
      trailPts,
      sparks,
      nextHint,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const distHere = dist[pTile.z * MAZE_W + pTile.x];
      drawMazeHud(ovCtx, ow, { playerMode, stepsTaken, distHere, bestFromStart }, lang);

      if (showNumbers) {
        ovCtx.save();
        ovCtx.textAlign = "center";
        ovCtx.textBaseline = "middle";
        const fontPx = Math.max(12, Math.min(20, Math.round(ow / 56)));
        ovCtx.font = `900 ${fontPx}px 'Proxima', -apple-system, sans-serif`;
        for (let z = 1; z < MAZE_H - 1; z++) {
          for (let x = 1; x < MAZE_W - 1; x++) {
            const idx = z * MAZE_W + x;
            const d = dist[idx];
            if (d < 0) continue;
            const rev = Math.max(0, Math.min(1, wavePhase - d));
            if (rev < 0.15) continue;
            const p = project3D([x + 0.5 - HALF_W, 0.14, z + 0.5 - HALF_H], viewProj, ow, oh);
            if (!p) continue;
            const isPath = onPathSet.has(idx);
            ovCtx.globalAlpha = rev * (isPath ? 1.0 : 0.82);
            ovCtx.lineWidth = 4;
            ovCtx.strokeStyle = "rgba(12,14,26,0.92)";
            ovCtx.strokeText(String(d), p.x, p.y);
            ovCtx.fillStyle = d === 0 ? "#fde047" : isPath ? "#fef08a" : "#e2f8ff";
            ovCtx.fillText(String(d), p.x, p.y);
          }
        }
        ovCtx.restore();
      }
      const pHero = project3D([hx + 0.5 - HALF_W, 1.35 + hy, hz + 0.5 - HALF_H], viewProj, ow, oh);
      if (pHero) {
        const lbl = reachedGoal ? `WIN! (${stepsTaken} STEPS)` : playerMode ? "YOU (WASD)" : "HERO";
        drawBadge(ovCtx, pHero.x, pHero.y, lbl, reachedGoal ? "#fde047" : "#10b981", "#071a14", ow);
      }
      const pGoal = project3D([goal.x + 0.5 - HALF_W, 1.45, goal.z + 0.5 - HALF_H], viewProj, ow, oh);
      if (pGoal) drawBadge(ovCtx, pGoal.x, pGoal.y, "GOAL (0)", "#f59e0b", "#1c1204", ow);
    }
  }

  return {
    id: "astar",
    defaultCam: { yaw: 0.08, pitch: 0.94, dist: 21.5, targetX: 0, targetY: 0, targetZ: 0.3, fovDeg: 40 },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "play", label: pl ? (playerMode ? "Chodzisz (WASD)" : "Zagraj (WASD)") : (playerMode ? "Walking (WASD)" : "Walk (WASD)"), pressed: playerMode },
        { id: "autosolve", label: pl ? "Auto-Solve (Spacja)" : "Auto-Solve (Space)", pressed: !playerMode },
        { id: "numbers", label: pl ? (showNumbers ? "Liczby: WŁ" : "Liczby: WYŁ") : (showNumbers ? "Numbers: ON" : "Numbers: OFF"), pressed: showNumbers },
        { id: "random", label: pl ? "Losuj labirynt" : "Random Maze", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "play") { playerMode = true; wavePhase = maxDist + 4; resetPlayerToStart(); computeField(); }
      if (id === "autosolve") startAutoSolve();
      if (id === "numbers") showNumbers = !showNumbers;
      if (id === "random") randomizeMaze();
    },
    onKeyDown(code, repeat) {
      if (code === "Space" && !repeat) startAutoSolve();
    },
    onClickWorld,
    getDebugState() {
      return { playerMode, pTile, stepsTaken, bestFromStart, reachedGoal };
    },
    reset,
    update,
    render,
  };
}
