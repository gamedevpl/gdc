// Interactive Entry #1: A* Pathfinding (Distance Field & Shortest Path)
// Click any floor/wall tile to reshape the stone maze live, watch the distance numbers flood from Goal (0),
// and follow the hero walking downhill from highest -> 0!
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

function project3D(world, vp, w, h) {
  const [x, y, z] = world;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
}

function drawBadge(ctx, x, y, text, bg, fg = "#ffffff") {
  ctx.save();
  ctx.font = "800 13px 'Proxima', -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  const pw = tw + 14, ph = 22;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(15,14,24,0.85)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

export function createEntry(gl) {
  let grid = DEFAULT_MAZE.map(r => r.split(""));
  let start = { x: 1, z: 13 };
  let goal = { x: 9, z: 1 };
  let showNumbers = true;
  let wavePhase = 0; // sweeps 0..maxDist+2 smoothly
  let heroT = 0;     // walks along path after wave
  let time = 0;
  let dist = new Int16Array(MAZE_W * MAZE_H);
  let path = [];
  let maxDist = 1;
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
    // Trace shortest downhill path from start -> goal
    path = [];
    let cx = start.x, cz = start.z;
    if (dist[cz * MAZE_W + cx] >= 0) {
      path.push({ x: cx, z: cz });
      let guard = 0;
      while ((cx !== goal.x || cz !== goal.z) && guard++ < 200) {
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

  function replayWave() {
    wavePhase = 0;
    heroT = 0;
    sparks.length = 0;
  }

  function reset() {
    grid = DEFAULT_MAZE.map(r => r.split(""));
    start = { x: 1, z: 13 };
    goal = { x: 9, z: 1 };
    renderer.rebuildMaze(grid.map(r => r.join("")));
    computeField();
    replayWave();
  }

  function onClickTile(worldPt, shiftKey) {
    const tx = Math.floor(worldPt[0] + MAZE_W * 0.5);
    const tz = Math.floor(worldPt[2] + MAZE_H * 0.5);
    if (tx <= 0 || tx >= MAZE_W - 1 || tz <= 0 || tz >= MAZE_H - 1) return;
    if (shiftKey) {
      if (grid[tz][tx] !== "#" && (tx !== start.x || tz !== start.z)) {
        goal = { x: tx, z: tz };
        computeField();
        replayWave();
      }
      return;
    }
    if ((tx === start.x && tz === start.z) || (tx === goal.x && tz === goal.z)) return;
    grid[tz][tx] = grid[tz][tx] === "#" ? "." : "#";
    renderer.rebuildMaze(grid.map(r => r.join("")));
    computeField();
    replayWave();
  }

  function update(dt) {
    const h = Math.min(0.05, dt);
    time += h;
    wavePhase += h * 9.5;
    const walkStart = maxDist + 2.5;
    if (path.length >= 2 && wavePhase > walkStart) {
      const prevIdx = Math.floor(heroT);
      heroT = Math.min(path.length - 1, heroT + h * 3.4);
      if (heroT >= path.length - 1 && prevIdx < path.length - 1) {
        // Celebration burst on reaching 0!
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          sparks.push({
            x: goal.x + 0.5, y: 0.4, z: goal.z + 0.5,
            vx: Math.cos(a) * (1.2 + Math.random() * 1.4),
            vy: 1.8 + Math.random() * 1.5,
            vz: Math.sin(a) * (1.2 + Math.random() * 1.4),
            r: 1.0, g: 0.85, b: 0.25, life: 1.0,
          });
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

  function render(w, h, cam, ovCtx, ow = w, oh = h) {
    // Build per-tile RGBA glow texture
    tileRgba.fill(0);
    const curStep = Math.floor(heroT);
    const onPathSet = new Set();
    if (wavePhase > maxDist + 1.5) {
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
        // R: wave brightness, G: warm-to-cool normalized distance, B: active path glow
        const normD = Math.min(1, d / Math.max(1, maxDist));
        tileRgba[o + 0] = Math.round(reveal * 210);
        tileRgba[o + 1] = Math.round((1 - normD) * 235);
        tileRgba[o + 2] = onPathSet.has(idx) ? 245 : 0;
        tileRgba[o + 3] = 255;
      }
    }

    // Interpolate hero pawn along path
    let hx = start.x, hz = start.z, hy = 0, hyaw = 0;
    const trailPts = [];
    if (path.length >= 2) {
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
      nextHint: null,
    });

    // Draw crisp 3D-projected distance numbers & Start/Goal pills!
    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
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
      if (pHero) drawBadge(ovCtx, pHero.x, pHero.y, "HERO", "#10b981", "#071a14");
      const pGoal = project3D([goal.x + 0.5 - HALF_W, 1.45, goal.z + 0.5 - HALF_H], viewProj, ow, oh);
      if (pGoal) drawBadge(ovCtx, pGoal.x, pGoal.y, "GOAL (0)", "#f59e0b", "#1c1204");
    }
  }

  return {
    id: "astar",
    defaultCam: { yaw: 0.08, pitch: 0.94, dist: 21.5, targetX: 0, targetY: 0, targetZ: 0.3, fovDeg: 40 },
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "numbers", label: pl ? (showNumbers ? "Liczby: WŁ" : "Liczby: WYŁ") : (showNumbers ? "Numbers: ON" : "Numbers: OFF"), pressed: showNumbers },
        { id: "replay", label: pl ? "Puść falę" : "Replay Wave", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "numbers") showNumbers = !showNumbers;
      if (id === "replay") replayWave();
    },
    onClickTile,
    reset,
    update,
    render,
  };
}
