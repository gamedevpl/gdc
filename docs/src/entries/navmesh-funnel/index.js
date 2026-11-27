// Entry #40: NavMesh & Funnel Algorithm (String Pulling) — Playable 3D Courtyard Navigation!
// Hand-verified 20-triangle conformal NavMesh around 3 staggered stone pillars with real triangle A*,
// shared neon Portal Edges, and the Simple Stupid Funnel Algorithm vs jagged Raw Triangle Centroids!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const HALF_X = 5.5;
const HALF_Z = 4.0;

// 16 NavMesh vertices: 4 courtyard outer corners + 3x4 agent-radius-inflated pillar cutouts (zero T-junctions!)
const VERTS = [
  [-5.5, -4.0], // 0: NW outer
  [ 5.5, -4.0], // 1: NE outer
  [ 5.5,  4.0], // 2: SE outer
  [-5.5,  4.0], // 3: SW outer
  // Pillar 1 cutout (West-North)
  [-3.0, -2.2], // 4: P1 NW
  [-1.5, -2.2], // 5: P1 NE
  [-1.5, -0.2], // 6: P1 SE
  [-3.0, -0.2], // 7: P1 SW
  // Pillar 2 cutout (Center-South)
  [-0.7,  0.2], // 8: P2 NW
  [ 0.9,  0.2], // 9: P2 NE
  [ 0.9,  2.3], // 10: P2 SE
  [-0.7,  2.3], // 11: P2 SW
  // Pillar 3 cutout (East-North)
  [ 1.8, -2.2], // 12: P3 NW
  [ 3.3, -2.2], // 13: P3 NE
  [ 3.3, -0.1], // 14: P3 SE
  [ 1.8, -0.1], // 15: P3 SW
];

// Visual stone pillars slightly inset (0.18m clearance) inside each NavMesh hole so the runner hugs cleanly without clipping!
const PILLARS = [
  { x0: -2.82, x1: -1.68, z0: -2.02, z1: -0.38, h: 2.35 },
  { x0: -0.52, x1:  0.72, z0:  0.38, z1:  2.12, h: 2.60 },
  { x0:  1.98, x1:  3.12, z0: -2.02, z1: -0.28, h: 2.25 },
];

// 20 exact non-overlapping, consistently oriented triangles covering 100% of walkable courtyard!
const TRIS = [
  [0, 1, 5],   // 0
  [0, 5, 4],   // 1
  [1, 12, 5],  // 2
  [1, 13, 12], // 3
  [0, 4, 7],   // 4
  [0, 7, 3],   // 5
  [3, 7, 11],  // 6
  [5, 12, 15], // 7
  [5, 15, 6],  // 8
  [6, 15, 8],  // 9
  [8, 15, 9],  // 10
  [7, 6, 8],   // 11
  [7, 8, 11],  // 12
  [3, 11, 10], // 13
  [3, 10, 2],  // 14
  [9, 15, 14], // 15
  [9, 14, 10], // 16
  [10, 14, 2], // 17
  [1, 2, 14],  // 18
  [1, 14, 13], // 19
];

function cross2(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

// Precompute triangle centroids, unique edges, and exact shared-portal adjacency!
const TRI_CENTERS = TRIS.map(([a, b, c]) => ({
  x: (VERTS[a][0] + VERTS[b][0] + VERTS[c][0]) / 3,
  z: (VERTS[a][1] + VERTS[b][1] + VERTS[c][1]) / 3,
}));

const TRI_ADJ = TRIS.map(() => []);
const ALL_EDGES = [];
{
  const edgeMap = new Map();
  for (let ti = 0; ti < TRIS.length; ti++) {
    const t = TRIS[ti];
    for (let e = 0; e < 3; e++) {
      const u = t[e], v = t[(e + 1) % 3];
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { ti, u, v });
        ALL_EDGES.push([u, v]);
      } else {
        const prev = edgeMap.get(key);
        // Because every triangle has identical orientation (cross2(a,b,c) > 0), walking OUT of triangle `ti`
        // across directed edge `u -> v` ALWAYS places vertex `u` on the LEFT and vertex `v` on the RIGHT!
        TRI_ADJ[ti].push({ to: prev.ti, left: u, right: v });
        TRI_ADJ[prev.ti].push({ to: ti, left: prev.u, right: prev.v });
      }
    }
  }
}

function pointInTri(px, pz, ti) {
  const [ia, ib, ic] = TRIS[ti];
  const a = VERTS[ia], b = VERTS[ib], c = VERTS[ic];
  const c1 = cross2(a[0], a[1], b[0], b[1], px, pz);
  const c2 = cross2(b[0], b[1], c[0], c[1], px, pz);
  const c3 = cross2(c[0], c[1], a[0], a[1], px, pz);
  return c1 >= -1e-4 && c2 >= -1e-4 && c3 >= -1e-4;
}

function findTriForPoint(px, pz) {
  for (let i = 0; i < TRIS.length; i++) {
    if (pointInTri(px, pz, i)) return { ti: i, x: px, z: pz, inside: true };
  }
  // Clicked on a pillar or outside: snap cleanly to the nearest triangle centroid!
  let best = 0, bestD = Infinity;
  for (let i = 0; i < TRIS.length; i++) {
    const d = Math.hypot(TRI_CENTERS[i].x - px, TRI_CENTERS[i].z - pz);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { ti: best, x: TRI_CENTERS[best].x, z: TRI_CENTERS[best].z, inside: false };
}

// Triangle-graph A* returning ordered triangle corridor + shared portal edges
function solveTriAStar(startTi, goalTi, goalX, goalZ) {
  if (startTi === goalTi) return { triPath: [startTi], portals: [] };
  const n = TRIS.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const cameEdge = new Array(n).fill(null);
  const closed = new Uint8Array(n);

  gScore[startTi] = 0;
  fScore[startTi] = Math.hypot(TRI_CENTERS[startTi].x - goalX, TRI_CENTERS[startTi].z - goalZ);
  const open = [startTi];

  while (open.length > 0) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
    }
    const cur = open.splice(bestI, 1)[0];
    if (cur === goalTi) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    for (const edge of TRI_ADJ[cur]) {
      const nxt = edge.to;
      if (closed[nxt]) continue;
      // Edge weight = midpoint-to-midpoint / centroid distance
      const step = Math.hypot(
        TRI_CENTERS[nxt].x - TRI_CENTERS[cur].x,
        TRI_CENTERS[nxt].z - TRI_CENTERS[cur].z
      );
      const tentG = gScore[cur] + step;
      if (tentG < gScore[nxt]) {
        cameFrom[nxt] = cur;
        cameEdge[nxt] = edge;
        gScore[nxt] = tentG;
        fScore[nxt] = tentG + Math.hypot(TRI_CENTERS[nxt].x - goalX, TRI_CENTERS[nxt].z - goalZ);
        if (!open.includes(nxt)) open.push(nxt);
      }
    }
  }

  const triPath = [];
  const portals = [];
  let cur = goalTi;
  while (cur !== -1) {
    triPath.push(cur);
    const e = cameEdge[cur];
    if (e) {
      portals.push({
        left: { x: VERTS[e.left][0], z: VERTS[e.left][1] },
        right: { x: VERTS[e.right][0], z: VERTS[e.right][1] },
      });
    }
    cur = cameFrom[cur];
  }
  triPath.reverse();
  portals.reverse();
  return { triPath, portals };
}

// Simple Stupid Funnel Algorithm (Mikko Mononen / Recast) — pulls a razor-taut string through portals!
function runFunnel(start, goal, sharedPortals) {
  const portals = [
    { left: { x: start.x, z: start.z }, right: { x: start.x, z: start.z } },
    ...sharedPortals,
    { left: { x: goal.x, z: goal.z }, right: { x: goal.x, z: goal.z } },
  ];

  // With our triangle orientation (cross2(a,b,c) > 0), walking across portal (left -> right),
  // area2(apex, a, b) = cross2(apex, a, b):
  //   if b is to the RIGHT of (apex -> a), area2 > 0; if b is to the LEFT of (apex -> a), area2 < 0!
  const area2 = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const samePt = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-4;

  const pts = [{ x: start.x, z: start.z }];
  let portalApex = portals[0].left;
  let portalLeft = portals[0].left;
  let portalRight = portals[0].right;
  let apexIndex = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  for (let i = 1; i < portals.length; i++) {
    const left = portals[i].left;
    const right = portals[i].right;

    // Update RIGHT funnel edge (tighten leftwards means area2(apex, portalRight, right) <= 0)
    if (area2(portalApex, portalRight, right) <= 1e-6) {
      if (samePt(portalApex, portalRight) || area2(portalApex, portalLeft, right) > 1e-6) {
        portalRight = right;
        rightIndex = i;
      } else {
        // Right crossed over Left -> emit portalLeft as tight corner waypoint!
        if (!samePt(pts[pts.length - 1], portalLeft)) pts.push({ x: portalLeft.x, z: portalLeft.z });
        portalApex = portalLeft;
        apexIndex = leftIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }

    // Update LEFT funnel edge (tighten rightwards means area2(apex, portalLeft, left) >= 0)
    if (area2(portalApex, portalLeft, left) >= -1e-6) {
      if (samePt(portalApex, portalLeft) || area2(portalApex, portalRight, left) < -1e-6) {
        portalLeft = left;
        leftIndex = i;
      } else {
        // Left crossed over Right -> emit portalRight as tight corner waypoint!
        if (!samePt(pts[pts.length - 1], portalRight)) pts.push({ x: portalRight.x, z: portalRight.z });
        portalApex = portalRight;
        apexIndex = rightIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
  }

  if (!samePt(pts[pts.length - 1], goal)) pts.push({ x: goal.x, z: goal.z });
  return pts;
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return len;
}

const ROUTES = [
  { start: { x: -4.4, z:  2.7 }, goal: { x:  4.4, z: -2.8 } }, // SW -> NE across all 3 pillars!
  { start: { x: -4.4, z: -2.9 }, goal: { x:  4.4, z:  2.8 } }, // NW -> SE weaving under/over pillars!
  { start: { x: -4.5, z:  0.4 }, goal: { x:  4.5, z: -0.6 } }, // West -> East tight S-slalom!
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.03, 0.07, 0.10],
    skyMid: [0.07, 0.14, 0.18],
    skyBot: [0.12, 0.20, 0.22],
    lightDir: [0.35, 0.88, 0.32],
    ambLow: [0.10, 0.17, 0.20],
    ambHigh: [0.34, 0.48, 0.50],
    orthoHalf: 11.4,
    maxWorldVerts: 28000,
    maxFxVerts: 20000,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Asymmetric Stone Courtyard + 3 Sculpted Staggered Stone Pillars
  const wBuf = [];
  pushBox(wBuf, -HALF_X - 0.45, HALF_X + 0.45, -0.52, 0.0, -HALF_Z - 0.45, HALF_Z + 0.45, [0.22, 0.30, 0.32], 0);
  // Low stone courtyard rim curb
  pushBox(wBuf, -HALF_X - 0.45, HALF_X + 0.45, 0.0, 0.48, -HALF_Z - 0.45, -HALF_Z, [0.32, 0.42, 0.44], 1);
  pushBox(wBuf, -HALF_X - 0.45, HALF_X + 0.45, 0.0, 0.48, HALF_Z, HALF_Z + 0.45, [0.32, 0.42, 0.44], 1);
  pushBox(wBuf, -HALF_X - 0.45, -HALF_X, 0.0, 0.48, -HALF_Z, HALF_Z, [0.32, 0.42, 0.44], 1);
  pushBox(wBuf, HALF_X, HALF_X + 0.45, 0.0, 0.48, -HALF_Z, HALF_Z, [0.32, 0.42, 0.44], 1);

  for (const p of PILLARS) {
    // Plinth base
    pushBox(wBuf, p.x0 - 0.06, p.x1 + 0.06, 0.0, 0.24, p.z0 - 0.06, p.z1 + 0.06, [0.34, 0.40, 0.44], 1);
    // Main carved stone pillar shaft
    pushBox(wBuf, p.x0, p.x1, 0.24, p.h, p.z0, p.z1, [0.54, 0.60, 0.62], 1);
    // Glowing emerald architectural accent band
    pushBox(wBuf, p.x0 - 0.03, p.x1 + 0.03, p.h - 0.22, p.h - 0.08, p.z0 - 0.03, p.z1 + 0.03, [0.16, 0.88, 0.72], 2);
    // Top stone cap
    pushBox(wBuf, p.x0 - 0.08, p.x1 + 0.08, p.h, p.h + 0.18, p.z0 - 0.08, p.z1 + 0.08, [0.64, 0.68, 0.70], 1);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.04, pitch: 0.80, dist: 17.6, targetX: 0.0, targetY: 0.25, targetZ: 0.3, fovDeg: 40 };

  let time = 0;
  let funnelOn = true;   // ON: Simple Stupid Funnel String-Pulling | OFF: Jagged Raw Triangle Centroids!
  let showMesh = true;   // [X] NavMesh wireframe + portal overlay
  let routeIdx = 0;
  let userInteracted = false;

  let startPt = { x: ROUTES[0].start.x, z: ROUTES[0].start.z };
  let goalPt = { x: ROUTES[0].goal.x, z: ROUTES[0].goal.z };
  let triPath = [];
  let corridorSet = new Set();
  let portals = [];
  let funnelPath = [];
  let centroidPath = [];
  let funnelLen = 0;
  let centroidLen = 0;

  const runner = { x: startPt.x, z: startPt.z, yaw: 0.8, segIdx: 1, walkPhase: 0, speedNorm: 1, pauseT: 0 };

  let bannerText = "";
  let bannerColor = "#34d399";
  let bannerTimer = 0;
  function setBanner(t, c = "#34d399", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function recomputePath(fromPt, toPt, { snapRunner = true } = {}) {
    const sRes = findTriForPoint(fromPt.x, fromPt.z);
    const gRes = findTriForPoint(toPt.x, toPt.z);
    startPt = { x: sRes.x, z: sRes.z };
    goalPt = { x: gRes.x, z: gRes.z };

    const solved = solveTriAStar(sRes.ti, gRes.ti, goalPt.x, goalPt.z);
    triPath = solved.triPath;
    corridorSet = new Set(triPath);
    portals = solved.portals;

    funnelPath = runFunnel(startPt, goalPt, portals);
    centroidPath = [startPt, ...triPath.map((ti) => TRI_CENTERS[ti]), goalPt];
    funnelLen = pathLength(funnelPath);
    centroidLen = pathLength(centroidPath);

    if (snapRunner) {
      runner.x = startPt.x;
      runner.z = startPt.z;
    }
    runner.segIdx = 1;
    runner.pauseT = 0;
  }

  function reset() {
    time = 0;
    funnelOn = true;
    showMesh = true;
    routeIdx = 0;
    bannerTimer = 0;
    recomputePath(ROUTES[0].start, ROUTES[0].goal, { snapRunner: true });
    // Advance runner slightly along first leg so Frame 1 immediately shows live sprinting along taut golden path!
    runner.walkPhase = 1.4;
  }
  reset();

  function activePath() { return funnelOn ? funnelPath : centroidPath; }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    const pts = activePath();
    if (pts.length < 2) return;

    if (runner.pauseT > 0) {
      runner.pauseT = Math.max(0, runner.pauseT - dt);
      runner.speedNorm = Math.max(0, runner.speedNorm - dt * 5);
      if (runner.pauseT === 0) {
        // Flip direction back across the courtyard automatically so the demo stays in lively motion!
        const prevStart = { ...startPt };
        const prevGoal = { ...goalPt };
        recomputePath(prevGoal, prevStart, { snapRunner: true });
      }
      return;
    }

    const target = pts[Math.min(runner.segIdx, pts.length - 1)];
    const dx = target.x - runner.x;
    const dz = target.z - runner.z;
    const d = Math.hypot(dx, dz);
    const speed = 3.55;

    if (d <= speed * dt + 0.05) {
      runner.x = target.x;
      runner.z = target.z;
      runner.segIdx++;
      if (runner.segIdx >= pts.length) {
        runner.pauseT = 0.75;
        if (userInteracted) audio?.goalWin?.();
      }
    } else {
      runner.x += (dx / d) * speed * dt;
      runner.z += (dz / d) * speed * dt;
      runner.yaw = Math.atan2(dx, dz);
      runner.walkPhase += dt * 11.5;
      runner.speedNorm = 1.0;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const extraPct = funnelLen > 0.01 ? Math.round(((centroidLen - funnelLen) / funnelLen) * 100) : 0;

    if (viewProj) {
      // Runner live mode pill
      const rp = projectToScreen(viewProj, runner.x, 1.55, runner.z, cssW, cssH);
      if (rp) {
        const txt = funnelOn
          ? (isPl ? "LEJEK: NAPIĘTA ŚCIEŻKA PRZY FILARACH ✓" : "FUNNEL: TAUT CORNER-HUGGING PATH ✓")
          : (isPl ? `CENTROIDY: ZYGZAK (+${extraPct}% DŁUŻSZA!) ✗` : `RAW CENTROIDS: ZIG-ZAG (+${extraPct}% LONGER!) ✗`);
        drawWorldPill(ctx, rp.x, rp.y, txt, funnelOn ? "#facc15" : "#f472b6", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Goal beacon pill
      const gp = projectToScreen(viewProj, goalPt.x, 1.35, goalPt.z, cssW, cssH);
      if (gp) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && gp.y < 235) ? Math.min(gp.x, cssW - 375) : gp.x;
        drawWorldPill(ctx, safeX, gp.y, isPl ? "CEL (KLIK = PRZESTAW)" : "GOAL (CLICK TO MOVE)", "#34d399", cssW, cssH, isCompact ? 8.5 : 9.2);
      }

      // Highlight a shared Portal Edge in the middle of the corridor!
      if (showMesh && portals.length > 0) {
        const midP = portals[Math.floor(portals.length * 0.5)];
        const mx = (midP.left.x + midP.right.x) * 0.5;
        const mz = (midP.left.z + midP.right.z) * 0.5;
        const pp = projectToScreen(viewProj, mx, 0.55, mz, cssW, cssH);
        if (pp) {
          drawWorldPill(ctx, pp.x, pp.y, isPl ? "KRAWĘDŹ PORTALU" : "PORTAL EDGE", "#2dd4bf", cssW, cssH, isCompact ? 8 : 8.8);
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${funnelOn ? `FUNNEL ${funnelLen.toFixed(1)}m ✓` : `CENTROIDS ${centroidLen.toFixed(1)}m (+${extraPct}%)`} · ${triPath.length} Tris`,
          funnelOn ? "#facc15" : "#f472b6",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 330, panelH = 164, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 18, 22, 0.90)";
        ctx.strokeStyle = funnelOn ? "rgba(250, 204, 21, 0.84)" : "rgba(244, 114, 182, 0.86)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = funnelOn ? "#facc15" : "#f472b6";
        ctx.fillText(
          funnelOn
            ? (isPl ? "NAVMESH · ALGORYTM LEJKA (STRING PULL)" : "NAVMESH · FUNNEL STRING-PULLING ✓")
            : (isPl ? "NAVMESH · SUROWE CENTROIDY (ZYGZAK!) ✗" : "NAVMESH · RAW TRIANGLE CENTROIDS ✗"),
          px + 12, py + 21, bw
        );

        // Length comparison bar!
        const ratio = clamp(funnelLen / Math.max(0.1, centroidLen), 0.2, 1.0);
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = funnelOn ? "#eab308" : "#ec4899";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw * (funnelOn ? ratio : 1.0), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          `FUNNEL: ${funnelLen.toFixed(1)}m (${funnelPath.length} pts) vs RAW: ${centroidLen.toFixed(1)}m (+${extraPct}%)`,
          px + 18, py + 45.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#5eead4";
        ctx.fillText(
          isPl
            ? `Korytarz A*: ${triPath.length} / ${TRIS.length} trójkątów · ${portals.length} portali`
            : `Corridor A*: ${triPath.length} / ${TRIS.length} tris · ${portals.length} portals`,
          px + 12, py + 76, bw
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl ? "Mięta = Portale · Złoto = Lejek · Róż = Centroidy" : "Mint = Portals · Gold = Funnel · Pink = Raw",
          px + 12, py + 98, bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "Klik = Nowy Cel · V = Zamień Narożniki" : "Click = Move Goal · V = Swap Corner Route",
          px + 12, py + 124, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "T = Lejek / Centroidy · X = Siatka NavMesh" : "T = Funnel / Raw Centroids · X = NavMesh",
          px + 12, py + 146, bw
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
          id: "toggle-funnel",
          label: funnelOn
            ? (pl ? "Lejek (Gładki): WŁ [T]" : "Funnel Smooth: ON [T]")
            : (pl ? "Surowe Centroidy [T]" : "Raw Centroids [T]"),
          pressed: funnelOn,
        },
        {
          id: "swap-route",
          label: pl ? "Zmień Trasę [V]" : "Swap Route [V]",
          pressed: false,
        },
        {
          id: "toggle-mesh",
          label: showMesh
            ? (pl ? "NavMesh: WŁ [X]" : "NavMesh: ON [X]")
            : (pl ? "NavMesh: WYŁ [X]" : "NavMesh: OFF [X]"),
          pressed: showMesh,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-funnel") {
        funnelOn = !funnelOn;
        // Restart cleanly from startPt so you immediately watch the smooth vs zig-zag contrast!
        runner.x = startPt.x; runner.z = startPt.z; runner.segIdx = 1; runner.pauseT = 0;
        audio?.ruleSwitch?.(funnelOn);
        const extraPct = funnelLen > 0.01 ? Math.round(((centroidLen - funnelLen) / funnelLen) * 100) : 0;
        setBanner(
          funnelOn
            ? `FUNNEL STRING-PULLING ON: SHORTEST TAUT ${funnelLen.toFixed(1)}m PATH HUGGING CORNERS!`
            : `RAW CENTROIDS OFF: UGLY ZIG-ZAG WOBBLE (+${extraPct}% EXTRA DISTANCE)!`,
          funnelOn ? "#facc15" : "#f472b6",
          2.1
        );
      } else if (id === "swap-route") {
        routeIdx = (routeIdx + 1) % ROUTES.length;
        const r = ROUTES[routeIdx];
        recomputePath(r.start, r.goal, { snapRunner: true });
        audio?.coinPickup?.();
        setBanner(`DIAGONAL ROUTE #${routeIdx + 1}: ${triPath.length} CORRIDOR TRIS · ${portals.length} PORTALS!`, "#2dd4bf", 1.9);
      } else if (id === "toggle-mesh") {
        showMesh = !showMesh;
        audio?.ruleSwitch?.(showMesh);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-funnel");
      else if (code === "KeyV") this.onAction("swap-route");
      else if (code === "KeyX") this.onAction("toggle-mesh");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        const wx = clamp(world[0], -HALF_X + 0.25, HALF_X - 0.25);
        const wz = clamp(world[2], -HALF_Z + 0.25, HALF_Z - 0.25);
        recomputePath({ x: runner.x, z: runner.z }, { x: wx, z: wz }, { snapRunner: false });
        audio?.coinPickup?.();
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        {
          gpu: runnerGpu, x: runner.x, y: 0.02, z: runner.z, yaw: runner.yaw,
          animA: runner.walkPhase, animB: runner.speedNorm, scale: 0.90, animMode: 2,
          tint: funnelOn ? [1.0, 0.84, 0.22, 0.35] : [0.98, 0.28, 0.68, 0.45],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Start & Goal markers
          fx.ringXZ(startPt.x, 0.06, startPt.z, 0.48, [0.22, 0.94, 0.86, 0.78]);
          fx.ringXZ(goalPt.x, 0.07, goalPt.z, 0.62 + 0.10 * Math.sin(time * 5), [0.24, 0.96, 0.62, 0.92]);
          fx.billboard(goalPt.x, 0.88, goalPt.z, 0.30, basis.right, basis.up, [0.24, 0.98, 0.66, 0.90], 2);

          if (showMesh) {
            // 1. All NavMesh triangle edges in translucent cyan
            for (const [u, v] of ALL_EDGES) {
              fx.beam(VERTS[u][0], 0.04, VERTS[u][1], VERTS[v][0], 0.04, VERTS[v][1], 0.05, [0.16, 0.78, 0.92, 0.34], 0);
            }
            // 2. Highlight active A* corridor triangle borders & centroids
            for (const ti of triPath) {
              const [a, b, c] = TRIS[ti];
              const col = [0.18, 0.94, 0.82, 0.64];
              fx.beam(VERTS[a][0], 0.055, VERTS[a][1], VERTS[b][0], 0.055, VERTS[b][1], 0.075, col, 0);
              fx.beam(VERTS[b][0], 0.055, VERTS[b][1], VERTS[c][0], 0.055, VERTS[c][1], 0.075, col, 0);
              fx.beam(VERTS[c][0], 0.055, VERTS[c][1], VERTS[a][0], 0.055, VERTS[a][1], 0.075, col, 0);
              const ctr = TRI_CENTERS[ti];
              fx.ringXZ(ctr.x, 0.06, ctr.z, funnelOn ? 0.16 : 0.28, funnelOn ? [0.22, 0.88, 0.86, 0.36] : [0.98, 0.30, 0.70, 0.88]);
            }
            // 3. Shared Portal Edges in bright neon mint!
            for (const pt of portals) {
              fx.beam(pt.left.x, 0.09, pt.left.z, pt.right.x, 0.09, pt.right.z, 0.13, [0.18, 1.0, 0.68, 0.92], 0);
            }
          }

          // Ghost reference of the opposite mode (subtle dashed) so A/B difference is immediately visible!
          const ghostPts = funnelOn ? centroidPath : funnelPath;
          const ghostCol = funnelOn ? [0.96, 0.30, 0.68, 0.34] : [1.0, 0.84, 0.20, 0.38];
          for (let i = 1; i < ghostPts.length; i++) {
            fx.beam(ghostPts[i - 1].x, 0.12, ghostPts[i - 1].z, ghostPts[i].x, 0.12, ghostPts[i].z, 0.065, ghostCol, 4);
          }

          // Active Path (Taut Golden Funnel vs Jagged Magenta Centroids!)
          const pts = activePath();
          const activeCol = funnelOn ? [1.0, 0.84, 0.16, 0.98] : [0.98, 0.24, 0.68, 0.96];
          for (let i = 1; i < pts.length; i++) {
            fx.beam(pts[i - 1].x, 0.18, pts[i - 1].z, pts[i].x, 0.18, pts[i].z, 0.14, activeCol, 0);
          }
          // Highlight funnel corner-pull pins!
          if (funnelOn) {
            for (let i = 1; i < funnelPath.length - 1; i++) {
              fx.ringXZ(funnelPath[i].x, 0.19, funnelPath[i].z, 0.34, [1.0, 0.88, 0.28, 0.95]);
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const savedPct = centroidLen > 0.01 ? Math.round(((centroidLen - funnelLen) / centroidLen) * 100) : 0;
      return {
        funnelOn,
        showMesh,
        routeIdx,
        corridorTris: triPath.length,
        portalCount: portals.length,
        funnelLen: Number(funnelLen.toFixed(2)),
        centroidLen: Number(centroidLen.toFixed(2)),
        savedPct,
        funnelWaypoints: funnelPath.length,
        centroidWaypoints: centroidPath.length,
      };
    },
  };
}
