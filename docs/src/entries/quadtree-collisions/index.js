// Entry #19: Quadtree & Spatial Hashing — Playable 3D Swarm Broadphase Visualizer!
// Shows how games run 100+ live collisions at 120 FPS: a recursive Quadtree splits crowded areas into tiny cells
// so drones ONLY test nearby neighbors (~400 checks) instead of O(n²) brute-force (~4,560 checks every frame)!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getQuadMeshes } from "../../quad-mesh.js";

const ARENA_X = 7.2;
const ARENA_Z = 5.2;
const DRONE_COUNT = 96;
const DRONE_RAD = 0.30;
const QT_CAP = 4;
const QT_MAX_DEPTH = 4;

class QuadNode {
  constructor(x0, x1, z0, z1, depth = 0) {
    this.x0 = x0; this.x1 = x1; this.z0 = z0; this.z1 = z1;
    this.depth = depth;
    this.items = [];
    this.children = null;
  }
  insert(d) {
    if (this.children) {
      this._insertChild(d);
      return;
    }
    this.items.push(d);
    if (this.items.length > QT_CAP && this.depth < QT_MAX_DEPTH) {
      this.subdivide();
    }
  }
  subdivide() {
    const mx = (this.x0 + this.x1) * 0.5;
    const mz = (this.z0 + this.z1) * 0.5;
    const nd = this.depth + 1;
    this.children = [
      new QuadNode(this.x0, mx, this.z0, mz, nd),
      new QuadNode(mx, this.x1, this.z0, mz, nd),
      new QuadNode(this.x0, mx, mz, this.z1, nd),
      new QuadNode(mx, this.x1, mz, this.z1, nd),
    ];
    for (const item of this.items) this._insertChild(item);
    this.items.length = 0;
  }
  _insertChild(d) {
    const mx = (this.x0 + this.x1) * 0.5;
    const mz = (this.z0 + this.z1) * 0.5;
    const idx = (d.x >= mx ? 1 : 0) + (d.z >= mz ? 2 : 0);
    this.children[idx].insert(d);
  }
  query(qx0, qx1, qz0, qz1, out) {
    if (qx1 < this.x0 || qx0 > this.x1 || qz1 < this.z0 || qz0 > this.z1) return;
    if (this.children) {
      for (let i = 0; i < 4; i++) this.children[i].query(qx0, qx1, qz0, qz1, out);
    } else {
      for (let i = 0; i < this.items.length; i++) out.push(this.items[i]);
    }
  }
  collectLeaves(out) {
    if (this.children) {
      for (let i = 0; i < 4; i++) this.children[i].collectLeaves(out);
    } else {
      out.push(this);
    }
  }
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.015, 0.032, 0.068],
    skyMid: [0.032, 0.065, 0.118],
    skyBot: [0.052, 0.095, 0.155],
    lightDir: [0.30, 0.90, 0.30],
    ambLow: [0.10, 0.14, 0.22],
    ambHigh: [0.34, 0.44, 0.58],
    maxFxVerts: 22000,
  });
  const m = getQuadMeshes();
  const droneGpu = studio.uploadMesh(m.drone);

  // Sleek Dark Cyber Broadphase Arena Floor + Glowing Cyan Trim Border
  const wBuf = [];
  pushBox(wBuf, -ARENA_X - 0.35, ARENA_X + 0.35, -0.45, 0.0, -ARENA_Z - 0.35, ARENA_Z + 0.35, [0.14, 0.18, 0.26], 0);
  // Perimeter walls
  pushBox(wBuf, -ARENA_X - 0.35, ARENA_X + 0.35, 0.0, 0.32, -ARENA_Z - 0.35, -ARENA_Z, [0.22, 0.28, 0.38], 1);
  pushBox(wBuf, -ARENA_X - 0.35, ARENA_X + 0.35, 0.0, 0.32, ARENA_Z, ARENA_Z + 0.35, [0.22, 0.28, 0.38], 1);
  pushBox(wBuf, -ARENA_X - 0.35, -ARENA_X, 0.0, 0.32, -ARENA_Z, ARENA_Z, [0.22, 0.28, 0.38], 1);
  pushBox(wBuf, ARENA_X, ARENA_X + 0.35, 0.0, 0.32, -ARENA_Z, ARENA_Z, [0.22, 0.28, 0.38], 1);
  // Subtle neon cyan arena border strips
  pushBox(wBuf, -ARENA_X, ARENA_X, 0.32, 0.38, -ARENA_Z - 0.08, -ARENA_Z + 0.02, [0.06, 0.84, 0.96], 2);
  pushBox(wBuf, -ARENA_X, ARENA_X, 0.32, 0.38, ARENA_Z - 0.02, ARENA_Z + 0.08, [0.06, 0.84, 0.96], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.96, dist: 17.8, targetX: 0.0, targetY: 0.2, targetZ: 0.15, fovDeg: 40 };

  let time = 0;
  let quadtreeOn = true;
  let showGrid = true;
  let vortexTimer = 0;
  let userInteracted = false;

  let drones = [];
  let leaves = [];
  let checksThisFrame = 0;
  const bruteTotal = (DRONE_COUNT * (DRONE_COUNT - 1)) / 2;
  let collisionsThisFrame = 0;
  let deepestLeaf = null;
  let emptyLeaf = null;
  let magnetX = 2.6;
  let magnetZ = -1.2;
  let magnetActive = false;
  let contactRings = [];

  let bannerText = "";
  let bannerColor = "#06b6d4";
  let bannerTimer = 0;
  function setBanner(t, c = "#06b6d4", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0;
    vortexTimer = 0;
    drones = [];
    contactRings = [];
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < DRONE_COUNT; i++) {
      // Seed ~35 drones in a lively crowd cluster so Frame 1 IMMEDIATELY shows deep Quadtree subdivision vs sparse corners!
      const inCluster = i < 36;
      const x = inCluster ? 2.4 + (rnd() - 0.5) * 3.8 : (rnd() * 2 - 1) * (ARENA_X - 0.6);
      const z = inCluster ? -1.1 + (rnd() - 0.5) * 3.0 : (rnd() * 2 - 1) * (ARENA_Z - 0.6);
      const a = rnd() * Math.PI * 2;
      const sp = 1.3 + rnd() * 1.4;
      drones.push({
        id: i, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        yaw: a, hitFlash: 0,
      });
    }
    bannerTimer = 0;
    rebuildAndCollide(0.016);
  }

  function rebuildAndCollide(dt) {
    // 1. Build Real Recursive Quadtree
    const root = new QuadNode(-ARENA_X, ARENA_X, -ARENA_Z, ARENA_Z, 0);
    for (const d of drones) root.insert(d);
    leaves = [];
    root.collectLeaves(leaves);

    deepestLeaf = null;
    emptyLeaf = null;
    for (const lf of leaves) {
      if (!deepestLeaf || lf.depth > deepestLeaf.depth || (lf.depth === deepestLeaf.depth && lf.items.length > deepestLeaf.items.length)) {
        if (lf.items.length >= 2) deepestLeaf = lf;
      }
      if (lf.items.length === 0 && (!emptyLeaf || lf.depth < emptyLeaf.depth)) {
        emptyLeaf = lf;
      }
    }

    // 2. Broadphase + Narrowphase Pairwise Collision Checks (COUNTED EXACTLY!)
    checksThisFrame = 0;
    collisionsThisFrame = 0;
    const minDist = DRONE_RAD * 2.08;
    const minDist2 = minDist * minDist;

    if (quadtreeOn) {
      const candidates = [];
      for (let i = 0; i < drones.length; i++) {
        const a = drones[i];
        candidates.length = 0;
        root.query(a.x - minDist, a.x + minDist, a.z - minDist, a.z + minDist, candidates);
        for (let k = 0; k < candidates.length; k++) {
          const b = candidates[k];
          if (b.id <= a.id) continue;
          checksThisFrame++;
          const dx = b.x - a.x, dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.0001 && d2 < minDist2) {
            resolveBounce(a, b, dx, dz, Math.sqrt(d2), minDist);
            collisionsThisFrame++;
          }
        }
      }
    } else {
      // O(n²) Brute Force: tests EVERY drone against EVERY other drone!
      for (let i = 0; i < drones.length; i++) {
        const a = drones[i];
        for (let j = i + 1; j < drones.length; j++) {
          const b = drones[j];
          checksThisFrame++;
          const dx = b.x - a.x, dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.0001 && d2 < minDist2) {
            resolveBounce(a, b, dx, dz, Math.sqrt(d2), minDist);
            collisionsThisFrame++;
          }
        }
      }
    }
    for (let i = contactRings.length - 1; i >= 0; i--) {
      contactRings[i].life -= dt;
      if (contactRings[i].life <= 0) contactRings.splice(i, 1);
    }
  }

  function resolveBounce(a, b, dx, dz, dist, minDist) {
    const nx = dx / dist, nz = dz / dist;
    const overlap = (minDist - dist) * 0.52;
    a.x -= nx * overlap; a.z -= nz * overlap;
    b.x += nx * overlap; b.z += nz * overlap;
    const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
    const sep = rvx * nx + rvz * nz;
    if (sep < 0) {
      const imp = -sep * 0.92;
      a.vx -= nx * imp; a.vz -= nz * imp;
      b.vx += nx * imp; b.vz += nz * imp;
    }
    a.hitFlash = 1.0; b.hitFlash = 1.0;
    if (contactRings.length < 18) {
      contactRings.push({ x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5, life: 0.24, maxLife: 0.24 });
    }
  }

  reset();

  function update(dt, keys, pointer) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (vortexTimer > 0) vortexTimer = Math.max(0, vortexTimer - dt);

    // Gentle auto-orbiting crowd attractor (or follow mouse pointer when hovering inside arena!)
    if (pointer?.world && Math.abs(pointer.world[0]) < ARENA_X && Math.abs(pointer.world[2]) < ARENA_Z && userInteracted) {
      magnetX = pointer.world[0];
      magnetZ = pointer.world[2];
      magnetActive = pointer.down || vortexTimer > 0;
    } else {
      magnetX = Math.cos(time * 0.42) * 3.1;
      magnetZ = Math.sin(time * 0.62) * 1.9;
      magnetActive = true;
    }

    const pullStrength = vortexTimer > 0 ? 7.2 : 1.75;
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt * 3.2);
      // Pull ~40 drones lightly toward the moving crowd center so density contrast stays dramatic!
      if (magnetActive && (vortexTimer > 0 || i < 42)) {
        const dx = magnetX - d.x, dz = magnetZ - d.z;
        const dist = Math.hypot(dx, dz) + 0.1;
        if (dist < (vortexTimer > 0 ? 7.5 : 4.6)) {
          d.vx += (dx / dist) * pullStrength * dt;
          d.vz += (dz / dist) * pullStrength * dt;
        }
      }
      // Speed clamp & subtle damping
      const sp = Math.hypot(d.vx, d.vz);
      const maxSp = vortexTimer > 0 ? 4.4 : 2.9;
      if (sp > maxSp) { d.vx = (d.vx / sp) * maxSp; d.vz = (d.vz / sp) * maxSp; }
      else if (sp < 0.85) { d.vx *= 1.03; d.vz *= 1.03; }

      d.x += d.vx * dt;
      d.z += d.vz * dt;
      if (d.x < -ARENA_X + DRONE_RAD) { d.x = -ARENA_X + DRONE_RAD; d.vx = Math.abs(d.vx); }
      if (d.x > ARENA_X - DRONE_RAD) { d.x = ARENA_X - DRONE_RAD; d.vx = -Math.abs(d.vx); }
      if (d.z < -ARENA_Z + DRONE_RAD) { d.z = -ARENA_Z + DRONE_RAD; d.vz = Math.abs(d.vz); }
      if (d.z > ARENA_Z - DRONE_RAD) { d.z = ARENA_Z - DRONE_RAD; d.vz = -Math.abs(d.vz); }
      d.yaw = Math.atan2(d.vx, d.vz);
    }

    rebuildAndCollide(dt);
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      if (quadtreeOn) {
        if (deepestLeaf) {
          const cx = (deepestLeaf.x0 + deepestLeaf.x1) * 0.5;
          const cz = (deepestLeaf.z0 + deepestLeaf.z1) * 0.5;
          const dp = projectToScreen(viewProj, cx, 1.25, cz, cssW, cssH);
          if (dp) {
            drawWorldPill(
              ctx, dp.x, dp.y,
              isPl ? `GĘSTY PODZIAŁ (POZIOM ${deepestLeaf.depth})` : `DEEP SUBDIVISION (DEPTH ${deepestLeaf.depth})`,
              "#22d3ee", cssW, cssH, isCompact ? 9 : 10
            );
          }
        }
        if (emptyLeaf) {
          const ex = (emptyLeaf.x0 + emptyLeaf.x1) * 0.5;
          const ez = (emptyLeaf.z0 + emptyLeaf.z1) * 0.5;
          const ep = projectToScreen(viewProj, ex, 0.65, ez, cssW, cssH);
          if (ep) {
            drawWorldPill(
              ctx, ep.x, ep.y,
              isPl ? "PUSTA ĆWIARTKA (0 TESTÓW ✓)" : "EMPTY QUADRANT (0 CHECKS ✓)",
              "#4ade80", cssW, cssH, isCompact ? 9 : 10
            );
          }
        }
      } else {
        const bp = projectToScreen(viewProj, 0.8, 1.55, -2.0, cssW, cssH);
        if (bp) {
          drawWorldPill(
            ctx, bp.x, bp.y,
            isPl ? `SIEĆ O(n²): KAŻDY Z KAŻDYM (${bruteTotal}!) ✗` : `O(n²) ALL-PAIRS WEB (${bruteTotal} CHECKS!) ✗`,
            "#f87171", cssW, cssH, isCompact ? 9.5 : 10.5
          );
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const speedup = (bruteTotal / Math.max(1, checksThisFrame)).toFixed(1);
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${quadtreeOn ? `QUADTREE (${speedup}× FASTER)` : "BRUTE O(n²)"} · ${checksThisFrame} checks`,
          quadtreeOn ? "#06b6d4" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 328, panelH = 156, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 28, 0.88)";
        ctx.strokeStyle = quadtreeOn ? "rgba(6, 182, 212, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = quadtreeOn ? "#22d3ee" : "#f87171";
        ctx.fillText(quadtreeOn ? `QUADTREE BROADPHASE · ${speedup}× FASTER` : `BRUTE-FORCE O(n²) · ${bruteTotal} PAIRS!`, px + 12, py + 21, panelW - 24);

        // Two comparison bars: Active Checks vs Brute-Force O(n²)
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, bw, 15, 4); ctx.fill();
        ctx.fillStyle = quadtreeOn ? "#06b6d4" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, Math.max(8, bw * (checksThisFrame / bruteTotal)), 15, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`THIS FRAME: ${checksThisFrame} pair checks`, bx + 7, py + 45, bw - 12);

        ctx.fillStyle = "rgba(239, 68, 68, 0.30)";
        ctx.beginPath(); ctx.roundRect(bx, py + 54, bw, 14, 4); ctx.fill();
        ctx.fillStyle = "#fca5a5";
        ctx.fillText(`O(n²) BASELINE (${DRONE_COUNT} drones): ${bruteTotal} pairs`, bx + 7, py + 64.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#4ade80";
        ctx.fillText(isPl ? `Aktywne liście: ${leaves.length} · Zderzenia: ${collisionsThisFrame}` : `Quadtree Leaves: ${leaves.length} · Collisions: ${collisionsThisFrame}`, px + 12, py + 92, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Klik = Wir grawitacyjny (głębszy podział!)" : "Click / Hold = Crowd Vortex (deeper splits!)", px + 12, py + 114, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "T = Quadtree/O(n²) · V = Wir · X = Siatka" : "T = Quadtree/O(n²) · V = Vortex · X = Grid", px + 12, py + 138, bw);
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
        { id: "toggle-qt", label: quadtreeOn ? (pl ? "Quadtree O(n log n) [T]" : "Quadtree O(n log n) [T]") : (pl ? "Brute-Force O(n²) [T]" : "Brute-Force O(n²) [T]"), pressed: quadtreeOn },
        { id: "vortex", label: pl ? "Wir Tłumu [V]" : "Crowd Vortex [V]", pressed: vortexTimer > 0 },
        { id: "grid", label: showGrid ? (pl ? "Komórki: WŁ [X]" : "Cells: ON [X]") : (pl ? "Komórki: WYŁ [X]" : "Cells: OFF [X]"), pressed: showGrid },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-qt") {
        quadtreeOn = !quadtreeOn;
        audio?.ruleSwitch?.(quadtreeOn);
        setBanner(
          quadtreeOn
            ? "QUADTREE ON: SPATIAL CELLS SKIP 85%+ DISTANT PAIR CHECKS!"
            : `BRUTE-FORCE O(n²): TESTING ALL ${bruteTotal} PAIRS EVERY SINGLE FRAME!`,
          quadtreeOn ? "#22d3ee" : "#f87171",
          1.9
        );
      } else if (id === "vortex") {
        vortexTimer = 2.6;
        audio?.waterRipple?.();
        setBanner("CROWD VORTEX! WATCH QUADTREE SUBDIVIDE DEEPER LIVE!", "#22d3ee", 1.8);
      } else if (id === "grid") {
        showGrid = !showGrid;
        audio?.ruleSwitch?.(showGrid);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-qt");
      else if (code === "KeyV") this.onAction("vortex");
      else if (code === "KeyX") this.onAction("grid");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        magnetX = clamp(world[0], -ARENA_X + 1, ARENA_X - 1);
        magnetZ = clamp(world[2], -ARENA_Z + 1, ARENA_Z - 1);
        vortexTimer = 2.0;
        audio?.waterRipple?.();
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [];
      for (let i = 0; i < drones.length; i++) {
        const d = drones[i];
        const isFocal = !quadtreeOn && i < 2;
        const tint = isFocal
          ? [1.0, 0.25, 0.35, 0.85]
          : (d.hitFlash > 0.05 ? [0.24, 1.0, 0.68, d.hitFlash * 0.85] : [1, 1, 1, 0]);
        meshes.push({
          gpu: droneGpu, x: d.x, y: 0.10 + 0.05 * Math.sin(time * 4 + i), z: d.z,
          yaw: d.yaw, scale: isFocal ? 1.25 : 0.94, animMode: 0, tint,
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          if (quadtreeOn && showGrid) {
            for (const lf of leaves) {
              const hot = lf.depth >= 3;
              const col = lf.items.length === 0
                ? [0.16, 0.56, 0.44, 0.30]
                : (hot ? [0.06, 0.92, 1.0, 0.78] : [0.16, 0.74, 0.86, 0.52]);
              fx.quadXZ(lf.x0 + 0.03, lf.x1 - 0.03, 0.04 + lf.depth * 0.008, lf.z0 + 0.03, lf.z1 - 0.03, col);
            }
          } else if (!quadtreeOn) {
            // Shocking O(n²) crimson web: draw comparison lines from 2 focal drones to ALL 95 other drones!
            for (let src = 0; src < 2; src++) {
              const a = drones[src];
              for (let j = 0; j < drones.length; j += 1) {
                if (j === src) continue;
                const b = drones[j];
                fx.beam(a.x, 0.36, a.z, b.x, 0.36, b.z, 0.055, [1.0, 0.20, 0.30, 0.36], 0);
              }
            }
          }

          if (vortexTimer > 0) {
            fx.ringXZ(magnetX, 0.08, magnetZ, 1.65, [0.14, 0.94, 1.0, 0.72]);
          }
          for (const cr of contactRings) {
            const a = clamp(cr.life / cr.maxLife, 0, 1);
            fx.ringXZ(cr.x, 0.12, cr.z, 0.42 + (1 - a) * 0.35, [0.22, 1.0, 0.68, a * 0.85]);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { quadtreeOn, checksThisFrame, bruteTotal, leafCount: leaves.length, collisionsThisFrame };
    },
  };
}
