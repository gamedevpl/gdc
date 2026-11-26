// Playable Entry #1: A* Pathfinding — Full Click-and-Drag 3D Stone Maze Editor + Live WASD Walking!
// Left-Click & Drag directly across tiles to paint/erase stone walls in real time (Right-Drag orbits camera),
// Shift+Click (or Move Goal tool) moves Goal (0), Clear wipes board to draw from scratch, WASD walks live!
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
  for (let i = 0; i < 14; i++) {
    const rx = 1 + Math.floor(Math.random() * (MAZE_W - 2));
    const rz = 1 + Math.floor(Math.random() * (MAZE_H - 2));
    g[rz][rx] = ".";
  }
  g[start.z][start.x] = ".";
  g[goal.z][goal.x] = ".";
  return g;
}

function makeEmptyMaze() {
  const g = Array.from({ length: MAZE_H }, (_, z) =>
    Array.from({ length: MAZE_W }, (_, x) =>
      (x === 0 || x === MAZE_W - 1 || z === 0 || z === MAZE_H - 1) ? "#" : "."
    )
  );
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
  const boxW = Math.min(ow - 24, 435);
  const boxH = 38;
  const x = ow - boxW - 18;
  const y = 78;
  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.blocked ? "#ef4444" : state.playerMode ? "#00e4ac" : "#38bdf8";
  ctx.stroke();

  const dHere = state.distHere >= 0 ? state.distHere : "∞";
  let lbl = "";
  if (state.blocked) {
    lbl = pl ? "BRAK DROGI! Usuń jedną ze ścian" : "PATH BLOCKED! Erase a wall to open route";
  } else if (state.playerMode) {
    lbl = pl
      ? `KROKI: ${state.stepsTaken} · DO METY: ${dHere} · OPTIMUM: ${state.bestFromStart}`
      : `STEPS: ${state.stepsTaken} · TO GOAL: ${dHere} · OPTIMAL: ${state.bestFromStart}`;
  } else {
    lbl = pl
      ? `EDYTOR ŚCIAN (PRZECIĄGNIJ) · OPTIMUM: ${state.bestFromStart} · WASD = CHODŹ`
      : `DRAG TO PAINT WALLS · BEST: ${state.bestFromStart} · WASD = WALK`;
  }
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.blocked ? "#fca5a5" : state.playerMode ? "#76ddaf" : "#bae6fd";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(lbl, x + 12, y + boxH / 2 + 0.5);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  let grid = DEFAULT_MAZE.map(r => r.split(""));
  let start = { x: 1, z: 13 };
  let goal = { x: 9, z: 1 };
  let showNumbers = true;
  let tool = "wall"; // "wall" (drag paint/erase) | "goal" (click place goal) | "orbit"
  let playerMode = false;
  let prevPlayerMode = false;
  let wavePhase = 25;
  let heroT = 0;
  let time = 0;
  let stepsTaken = 0;
  let reachedGoal = false;

  // Live hover & click-drag brush state
  let hoverTile = null; // { x, z }
  let paintBrush = null; // "#" | "." while left-dragging walls!
  let lastPaintedKey = "";

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

  function worldToTile(worldPt) {
    if (!worldPt) return null;
    const tx = Math.floor(worldPt[0] + MAZE_W * 0.5);
    const tz = Math.floor(worldPt[2] + MAZE_H * 0.5);
    if (tx <= 0 || tx >= MAZE_W - 1 || tz <= 0 || tz >= MAZE_H - 1) return null;
    return { x: tx, z: tz };
  }

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
    bestFromStart = dist[start.z * MAZE_W + start.x];
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
    audio?.goalWin?.();
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

  function applyPaintAt(tile) {
    if (!tile) return;
    const { x: tx, z: tz } = tile;
    if ((tx === start.x && tz === start.z) || (tx === goal.x && tz === goal.z)) return;
    if (playerMode && tx === pTile.x && tz === pTile.z) return;
    const key = `${tx},${tz}`;
    if (key === lastPaintedKey) return;
    lastPaintedKey = key;
    if (grid[tz][tx] === paintBrush) return;

    grid[tz][tx] = paintBrush;
    renderer.rebuildMaze(grid.map(r => r.join("")));
    audio?.wallClick?.(paintBrush === "#");
    computeField();
    // Keep distance field immediately visible while editing walls so player sees numbers update live!
    wavePhase = Math.max(wavePhase, maxDist + 4);
    if (!playerMode) heroT = 0;
  }

  function placeGoalAt(tile) {
    if (!tile) return;
    const { x: tx, z: tz } = tile;
    if (grid[tz][tx] === "#" || (tx === start.x && tz === start.z)) return;
    goal = { x: tx, z: tz };
    reachedGoal = false;
    audio?.wallClick?.(false);
    computeField();
    wavePhase = Math.max(wavePhase, maxDist + 4);
    if (!playerMode) heroT = 0;
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
    const dNow = dist[nz * MAZE_W + nx];
    if (nx === goal.x && nz === goal.z && !reachedGoal) {
      reachedGoal = true;
      burstCelebration(goal.x, goal.z);
    } else if (dNow >= 0) {
      audio?.stepTone?.(dNow);
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

  function clearMaze() {
    start = { x: 1, z: 13 };
    goal = { x: 9, z: 1 };
    grid = makeEmptyMaze();
    resetPlayerToStart();
    renderer.rebuildMaze(grid.map(r => r.join("")));
    audio?.wallClick?.(false);
    computeField();
    wavePhase = maxDist + 4;
    heroT = 0;
  }

  function randomizeMaze() {
    start = { x: 1, z: 13 };
    goal = { x: 9, z: 1 };
    grid = generateSolvableMaze(start, goal);
    resetPlayerToStart();
    renderer.rebuildMaze(grid.map(r => r.join("")));
    audio?.wallClick?.(true);
    if (playerMode) {
      wavePhase = maxDist + 4;
      computeField();
    } else {
      startAutoSolve();
    }
  }

  // Claim Left-Click & Drag inside the maze when Paint Walls / Move Goal is active (Right-Drag always orbits!)
  function onPointerDown({ world, button, shiftKey }) {
    if (button !== 0 || tool === "orbit") return false;
    const tile = worldToTile(world);
    if (!tile) return false; // dragging outside the maze orbits camera seamlessly!
    if (shiftKey || tool === "goal") {
      placeGoalAt(tile);
      return true;
    }
    paintBrush = grid[tile.z][tile.x] === "#" ? "." : "#";
    lastPaintedKey = "";
    applyPaintAt(tile);
    return true;
  }

  function onPointerMove({ world, down, claimed }) {
    hoverTile = worldToTile(world);
    if (down && claimed && paintBrush && hoverTile) {
      applyPaintAt(hoverTile);
    }
  }

  function onPointerUp() {
    paintBrush = null;
    lastPaintedKey = "";
  }

  function update(dt, keys = new Set()) {
    const h = Math.min(0.05, Math.max(0.001, dt));
    time += h;
    moveCooldown = Math.max(0, moveCooldown - h);

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
      wavePhase += h * 10.5;
      const walkStart = maxDist + 1.8;
      if (path.length >= 2 && wavePhase > walkStart) {
        const prevIdx = Math.floor(heroT);
        heroT = Math.min(path.length - 1, heroT + h * 3.8);
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
    } else if (wavePhase > maxDist + 1.2) {
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
      const blocked = playerMode ? distHere < 0 : bestFromStart < 0;
      drawMazeHud(ovCtx, ow, { playerMode, stepsTaken, distHere, bestFromStart: Math.max(0, bestFromStart), blocked }, lang);

      // Draw crisp projected hover tile outline so maze editing feels snappy like a real level editor!
      if (hoverTile && tool !== "orbit") {
        const x0 = hoverTile.x - HALF_W, z0 = hoverTile.z - HALF_H;
        const yH = grid[hoverTile.z][hoverTile.x] === "#" ? 0.92 : 0.06;
        const corners = [
          project3D([x0 + 0.04, yH, z0 + 0.04], viewProj, ow, oh),
          project3D([x0 + 0.96, yH, z0 + 0.04], viewProj, ow, oh),
          project3D([x0 + 0.96, yH, z0 + 0.96], viewProj, ow, oh),
          project3D([x0 + 0.04, yH, z0 + 0.96], viewProj, ow, oh),
        ];
        if (corners.every(Boolean)) {
          ovCtx.save();
          ovCtx.beginPath();
          ovCtx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < 4; i++) ovCtx.lineTo(corners[i].x, corners[i].y);
          ovCtx.closePath();
          ovCtx.fillStyle = tool === "goal" ? "rgba(245,158,11,0.28)" : "rgba(0,228,172,0.22)";
          ovCtx.fill();
          ovCtx.lineWidth = 2.5;
          ovCtx.strokeStyle = tool === "goal" ? "#fbbf24" : "#00e4ac";
          ovCtx.stroke();
          ovCtx.restore();
        }
      }

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
    defaultCam: { yaw: 0.08, pitch: 0.96, dist: 21.5, targetX: 0, targetY: 0, targetZ: 0.3, fovDeg: 40 },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "tool_wall", label: pl ? "Rysuj ściany" : "Paint Walls", pressed: tool === "wall" },
        { id: "tool_goal", label: pl ? "Przenieś Metę" : "Move Goal", pressed: tool === "goal" },
        { id: "autosolve", label: pl ? "Auto-Solve (Spacja)" : "Auto-Solve (Space)", pressed: !playerMode },
        { id: "clear", label: pl ? "Wyczyść" : "Clear", pressed: false },
        { id: "random", label: pl ? "Losuj" : "Random", pressed: false },
        { id: "numbers", label: pl ? (showNumbers ? "Liczby: WŁ" : "Liczby: WYŁ") : (showNumbers ? "Numbers: ON" : "Numbers: OFF"), pressed: showNumbers },
      ];
    },
    onAction(id) {
      if (id === "tool_wall") tool = "wall";
      if (id === "tool_goal") tool = "goal";
      if (id === "autosolve") startAutoSolve();
      if (id === "clear") clearMaze();
      if (id === "random") randomizeMaze();
      if (id === "numbers") showNumbers = !showNumbers;
    },
    onKeyDown(code, repeat) {
      if (code === "Space" && !repeat) startAutoSolve();
    },
    onPointerDown,
    onPointerMove,
    onPointerUp,
    getDebugState() {
      let wallCount = 0;
      for (let z = 1; z < MAZE_H - 1; z++) for (let x = 1; x < MAZE_W - 1; x++) if (grid[z][x] === "#") wallCount++;
      return { playerMode, tool, pTile, stepsTaken, bestFromStart, wallCount, reachedGoal };
    },
    reset,
    update,
    render,
  };
}
