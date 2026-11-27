// Entry #45: Structural Support & Collapse Graph — Playable 3D BFS Building Integrity Visualizer!
// Shows how survival & destruction games (Valheim, Fortnite, Red Faction, 7 Days to Die) run a live
// BFS support graph from grounded foundations (y = 0): smash a load-bearing pillar and unsupported wings
// immediately exceed max overhang hops -> flash crimson -> detach & collapse instead of floating in mid-air!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";

const UNIT = 1.06;
const MAX_HOPS = 4; // 0-1 Cyan/Emerald, 2-3 Gold, 4 Orange (Critical), >4 or unreachable -> COLLAPSE!

// Build a procedural 6-face unit cube mesh (centered at 0,0,0) for tumbling 3D falling debris blocks!
function createDebrisCubeMesh() {
  const h = 0.48;
  const faces = [
    [[ -h,  h,  h], [  h,  h,  h], [  h,  h, -h], [ -h,  h, -h], [ 0,  1,  0]], // +Y
    [[ -h, -h, -h], [  h, -h, -h], [  h, -h,  h], [ -h, -h,  h], [ 0, -1,  0]], // -Y
    [[ -h, -h,  h], [  h, -h,  h], [  h,  h,  h], [ -h,  h,  h], [ 0,  0,  1]], // +Z
    [[  h, -h, -h], [ -h, -h, -h], [ -h,  h, -h], [  h,  h, -h], [ 0,  0, -1]], // -Z
    [[  h, -h,  h], [  h, -h, -h], [  h,  h, -h], [  h,  h,  h], [ 1,  0,  0]], // +X
    [[ -h, -h, -h], [ -h, -h,  h], [ -h,  h,  h], [ -h,  h, -h], [-1,  0,  0]], // -X
  ];
  const verts = new Float32Array(24 * 11);
  const indices = new Uint16Array(36);
  let v = 0, idx = 0;
  for (let f = 0; f < 6; f++) {
    const [a, b, c, d, n] = faces[f];
    const baseV = v;
    for (const p of [a, b, c, d]) {
      const o = v * 11;
      verts[o + 0] = p[0]; verts[o + 1] = p[1]; verts[o + 2] = p[2];
      verts[o + 3] = n[0]; verts[o + 4] = n[1]; verts[o + 5] = n[2];
      verts[o + 6] = 0.85; verts[o + 7] = 0.85; verts[o + 8] = 0.85;
      verts[o + 9] = 0.58; // roughness
      verts[o + 10] = 0;   // part 0
      v++;
    }
    indices[idx++] = baseV; indices[idx++] = baseV + 1; indices[idx++] = baseV + 2;
    indices[idx++] = baseV; indices[idx++] = baseV + 2; indices[idx++] = baseV + 3;
  }
  return { verts, indices };
}

// 31-Block Multi-Story Stone & Timber Watchtower Bridge Blueprint
// Every block is within <= 4 BFS hops of the 3 Grounded Foundations (-3,0,0), (0,0,0), (3,0,0)!
const TOWER_BLUEPRINT = [
  // y=0: 3 Grounded Foundation Pillars (0 hops)
  { gx: -3, gy: 0, gz:  0, mat: 1, keyPillar: 0 },
  { gx:  0, gy: 0, gz:  0, mat: 1, keyPillar: 1 },
  { gx:  3, gy: 0, gz:  0, mat: 1, keyPillar: 2 },
  // y=1: Lower Columns (1 hop) + Center Tower Ribs (2 hops)
  { gx: -3, gy: 1, gz:  0, mat: 1 },
  { gx:  0, gy: 1, gz:  0, mat: 1 },
  { gx:  3, gy: 1, gz:  0, mat: 1 },
  { gx:  0, gy: 1, gz: -1, mat: 1 },
  { gx:  0, gy: 1, gz:  1, mat: 1 },
  // y=2: Stone Arches & Cross-Beams (2-3 hops)
  { gx: -3, gy: 2, gz:  0, mat: 1 },
  { gx: -2, gy: 2, gz:  0, mat: 1 },
  { gx: -1, gy: 2, gz:  0, mat: 1 },
  { gx:  0, gy: 2, gz:  0, mat: 1 },
  { gx:  1, gy: 2, gz:  0, mat: 1 },
  { gx:  2, gy: 2, gz:  0, mat: 1 },
  { gx:  3, gy: 2, gz:  0, mat: 1 },
  { gx:  0, gy: 2, gz: -1, mat: 1 },
  { gx:  0, gy: 2, gz:  1, mat: 1 },
  // y=3: Timber Bridge Deck Span & Cantilever Watch Balconies (3-4 hops)
  { gx: -4, gy: 3, gz:  0, mat: 4 },
  { gx: -3, gy: 3, gz:  0, mat: 4 },
  { gx: -2, gy: 3, gz:  0, mat: 4 },
  { gx: -1, gy: 3, gz:  0, mat: 4 },
  { gx:  0, gy: 3, gz:  0, mat: 4 },
  { gx:  1, gy: 3, gz:  0, mat: 4 },
  { gx:  2, gy: 3, gz:  0, mat: 4 },
  { gx:  3, gy: 3, gz:  0, mat: 4 },
  { gx:  4, gy: 3, gz:  0, mat: 4 },
  { gx:  0, gy: 3, gz: -1, mat: 4 },
  { gx:  0, gy: 3, gz:  1, mat: 4 },
  // y=4: Lookout Crown Battlements (4 hops — critical right at edge of stability!)
  { gx: -3, gy: 4, gz:  0, mat: 1 },
  { gx:  0, gy: 4, gz:  0, mat: 1 },
  { gx:  3, gy: 4, gz:  0, mat: 1 },
];

function blockKey(gx, gy, gz) { return `${gx},${gy},${gz}`; }
function gridToWorld(gx, gy, gz) { return [gx * UNIT, gy * UNIT + UNIT * 0.5, gz * UNIT]; }

function integrityColor(hops) {
  if (hops === 0) return [0.16, 0.90, 0.78]; // Cyan-Emerald Grounded
  if (hops === 1) return [0.22, 0.84, 0.48]; // Emerald Strong Support
  if (hops === 2) return [0.92, 0.78, 0.22]; // Gold Load-Bearing
  if (hops === 3) return [0.96, 0.58, 0.16]; // Warm Amber-Gold
  if (hops === 4) return [0.96, 0.36, 0.14]; // Orange Critical Overhang
  return [0.96, 0.18, 0.26];                 // Crimson Unsupported / >4 Hops!
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.06, 0.05, 0.11],
    skyMid: [0.14, 0.11, 0.19],
    skyBot: [0.24, 0.16, 0.18],
    lightDir: [0.38, 0.86, 0.34],
    ambLow: [0.18, 0.13, 0.16],
    ambHigh: [0.46, 0.36, 0.36],
    maxWorldVerts: 32000,
  });
  const debrisGpu = studio.uploadMesh(createDebrisCubeMesh());

  const defaultCam = { yaw: 0.26, pitch: 0.34, dist: 15.8, targetX: 0.0, targetY: 2.0, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let gravityGraphOn = true; // ON: BFS Support Graph collapses unsupported blocks | OFF: Floating Debris!
  let autoDemo = true;
  let autoTimer = 0;
  let autoStep = 0;
  let userInteracted = false;

  let blocks = [];           // { id, gx, gy, gz, mat, keyPillar, alive, hops, parentId, failingT }
  let fallingBlocks = [];    // { x, y, z, vx, vy, vz, yaw, vyaw, pitch, vpitch, col, life, maxLife, bounced }
  let sparks = [];
  let smashFlash = null;     // { x, y, z, life }
  let worldDirty = true;

  let collapsedCount = 0;
  let floatingCount = 0;
  let groundedCount = 3;
  let maxActiveHops = 4;

  let bannerText = "";
  let bannerColor = "#f59e0b";
  let bannerTimer = 0;
  function setBanner(t, c = "#f59e0b", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function spawnDust(x, y, z, col, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 3.4;
      sparks.push({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + (Math.random() - 0.5) * 0.4,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: Math.cos(a) * sp,
        vy: 1.6 + Math.random() * 3.2,
        vz: Math.sin(a) * sp,
        r: col[0], g: col[1], b: col[2],
        size: 0.16 + Math.random() * 0.11,
        life: 0.55 + Math.random() * 0.30,
        maxLife: 0.85,
      });
    }
  }

  function recomputeBFS({ scheduleCollapse = true } = {}) {
    const byKey = new Map();
    for (const b of blocks) {
      b.hops = Infinity;
      b.parentId = -1;
      if (b.alive) byKey.set(blockKey(b.gx, b.gy, b.gz), b);
    }

    const q = [];
    groundedCount = 0;
    for (const b of blocks) {
      if (b.alive && b.gy === 0) {
        b.hops = 0;
        groundedCount++;
        q.push(b);
      }
    }

    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      for (const [dx, dy, dz] of DIRS) {
        const nb = byKey.get(blockKey(cur.gx + dx, cur.gy + dy, cur.gz + dz));
        if (!nb) continue;
        if (cur.hops + 1 < nb.hops) {
          nb.hops = cur.hops + 1;
          nb.parentId = cur.id;
          q.push(nb);
        }
      }
    }

    floatingCount = 0;
    maxActiveHops = 0;
    let newlyFailing = 0;
    for (const b of blocks) {
      if (!b.alive) continue;
      if (b.hops > MAX_HOPS) {
        floatingCount++;
        if (gravityGraphOn && scheduleCollapse && b.failingT === 0) {
          // Staggered fracture telegraph (0.14s..0.34s) so eye tracks the crimson BFS wave!
          b.failingT = 0.14 + Math.min(0.24, (b.gy * 0.045) + Math.abs(b.gx) * 0.02);
          newlyFailing++;
        }
      } else {
        b.failingT = 0;
        if (b.hops > maxActiveHops) maxActiveHops = b.hops;
      }
    }
    worldDirty = true;
    return newlyFailing;
  }

  function detachBlockToFalling(b, breachX = 0, impulseScale = 1.0) {
    if (!b.alive) return;
    b.alive = false;
    b.failingT = 0;
    collapsedCount++;
    const [wx, wy, wz] = gridToWorld(b.gx, b.gy, b.gz);
    const outDir = Math.sign(wx - breachX) || (Math.random() < 0.5 ? -1 : 1);
    fallingBlocks.push({
      x: wx, y: wy, z: wz,
      vx: outDir * (1.1 + Math.random() * 1.8) * impulseScale + (Math.random() - 0.5) * 0.9,
      vy: (0.6 + Math.random() * 1.4) * impulseScale,
      vz: (Math.random() - 0.5) * 2.2 * impulseScale,
      yaw: (Math.random() - 0.5) * 0.3,
      vyaw: (Math.random() - 0.5) * 4.5,
      pitch: 0,
      vpitch: (Math.random() < 0.5 ? -1 : 1) * (3.2 + Math.random() * 4.2),
      col: [0.96, 0.24, 0.24],
      life: 2.6,
      maxLife: 2.6,
      bounced: false,
    });
    spawnDust(wx, wy, wz, [1.0, 0.58, 0.22], 7);
    worldDirty = true;
  }

  function smashBlock(target, { silent = false } = {}) {
    if (!target || !target.alive) return 0;
    const [wx, wy, wz] = gridToWorld(target.gx, target.gy, target.gz);
    smashFlash = { x: wx, y: wy, z: wz, life: 0.45, maxLife: 0.45 };
    detachBlockToFalling(target, wx, 1.45);
    spawnDust(wx, wy, wz, [1.0, 0.72, 0.24], 18);

    const failing = recomputeBFS({ scheduleCollapse: true });
    if (!silent) {
      if (gravityGraphOn && failing > 0) {
        audio?.golemShatter?.(true);
        setBanner(`SUPPORT BROKEN! BFS DETACHING ${failing} UNSUPPORTED BLOCKS!`, "#f97316", 2.1);
      } else if (!gravityGraphOn && floatingCount > 0) {
        audio?.hammerImpact?.(false, true);
        setBanner(`GRAPH OFF: ${floatingCount} BLOCKS FLOATING ABSURDLY IN MID-AIR! ✗`, "#f87171", 2.2);
      } else {
        audio?.hammerImpact?.(true, false);
      }
    }
    return failing;
  }

  function smashNextKeyPillar({ silent = false } = {}) {
    // Smash Left -> Center -> Right foundation pillars in order; if none left, rebuild & smash Left!
    const order = [0, 1, 2];
    for (const kp of order) {
      const b = blocks.find((bl) => bl.alive && bl.keyPillar === kp);
      if (b) {
        smashBlock(b, { silent });
        return;
      }
    }
    // All foundations gone: rebuild cleanly first!
    rebuildTower({ keepMode: true });
    const first = blocks.find((bl) => bl.alive && bl.keyPillar === 0);
    if (first) smashBlock(first, { silent });
  }

  function rebuildWorldMesh() {
    const buf = [];
    // Quarry Arena Floor & Stepped Rim
    pushBox(buf, -7.8, 7.8, -0.60, 0.0, -5.2, 5.2, [0.22, 0.19, 0.21], 0);
    pushBox(buf, -8.2, 8.2, -0.85, -0.32, -5.6, -5.1, [0.30, 0.24, 0.22], 1);
    pushBox(buf, -8.2, 8.2, -0.85, -0.32,  5.1,  5.6, [0.30, 0.24, 0.22], 1);
    pushBox(buf, -8.2, -7.7, -0.85, -0.32, -5.1, 5.1, [0.30, 0.24, 0.22], 1);
    pushBox(buf,  7.7,  8.2, -0.85, -0.32, -5.1, 5.1, [0.30, 0.24, 0.22], 1);
    // Safety quarry demarcation strip & 3 Foundation Footing Plinths
    pushBox(buf, -5.4, 5.4, 0.0, 0.03, 1.95, 2.22, [0.92, 0.62, 0.10], 5);
    for (const fx of [-3, 0, 3]) {
      const wx = fx * UNIT;
      pushBox(buf, wx - 0.68, wx + 0.68, 0.0, 0.05, -0.68, 0.68, [0.16, 0.84, 0.72], 2);
    }

    // All standing Watchtower Bridge blocks colored by live BFS Structural Integrity Hops!
    const h = UNIT * 0.485;
    for (const b of blocks) {
      if (!b.alive) continue;
      const [wx, wy, wz] = gridToWorld(b.gx, b.gy, b.gz);
      const col = b.failingT > 0 ? [0.98, 0.16, 0.24] : integrityColor(b.hops);
      pushBox(buf, wx - h, wx + h, wy - h, wy + h, wz - h, wz + h, col, b.mat);
      // Subtle dark timber/stone cornice trim on bridge deck & crowns
      if (b.gy === 3) {
        pushBox(buf, wx - h * 1.03, wx + h * 1.03, wy + h * 0.72, wy + h * 1.02, wz - h * 1.03, wz + h * 1.03, [col[0] * 0.72, col[1] * 0.72, col[2] * 0.72], 4);
      }
    }
    studio.setWorldData(buf);
    worldDirty = false;
  }

  function rebuildTower({ keepMode = true } = {}) {
    if (!keepMode) gravityGraphOn = true;
    blocks = TOWER_BLUEPRINT.map((bp, i) => ({
      id: i,
      gx: bp.gx, gy: bp.gy, gz: bp.gz,
      mat: bp.mat,
      keyPillar: bp.keyPillar != null ? bp.keyPillar : -1,
      alive: true,
      hops: 0,
      parentId: -1,
      failingT: 0,
    }));
    fallingBlocks = [];
    sparks = [];
    smashFlash = null;
    collapsedCount = 0;
    recomputeBFS({ scheduleCollapse: false });
    worldDirty = true;
  }

  function reset() {
    time = 0;
    autoDemo = true;
    autoTimer = 0.62; // First dramatic pillar smash fires at t = 0.62s so scene is vibrant by 0.8s!
    autoStep = 0;
    bannerTimer = 0;
    rebuildTower({ keepMode: true });
  }
  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (smashFlash) {
      smashFlash.life -= dt;
      if (smashFlash.life <= 0) smashFlash = null;
    }

    // Advance crimson fracture telegraphs -> detach into tumbling physics!
    let detachedAny = false;
    for (const b of blocks) {
      if (b.alive && b.failingT > 0) {
        b.failingT -= dt;
        if (b.failingT <= 0) {
          detachBlockToFalling(b, 0, 1.0);
          detachedAny = true;
        }
      }
    }
    if (detachedAny) {
      recomputeBFS({ scheduleCollapse: true });
      if (userInteracted) audio?.wallClick?.(false);
    }

    // Step falling debris physics with gravity & ground bounce!
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
      const fb = fallingBlocks[i];
      fb.life -= dt;
      if (fb.life <= 0) { fallingBlocks.splice(i, 1); continue; }
      fb.vy -= 18.5 * dt;
      fb.x += fb.vx * dt;
      fb.y += fb.vy * dt;
      fb.z += fb.vz * dt;
      fb.yaw += fb.vyaw * dt;
      fb.pitch += fb.vpitch * dt;
      if (fb.y < 0.46) {
        fb.y = 0.46;
        if (Math.abs(fb.vy) > 1.8) {
          fb.vy = -fb.vy * 0.34;
          fb.vx *= 0.62;
          fb.vz *= 0.62;
          fb.vyaw *= 0.55;
          fb.vpitch *= 0.55;
          if (!fb.bounced) {
            fb.bounced = true;
            spawnDust(fb.x, 0.12, fb.z, [0.95, 0.66, 0.32], 6);
          }
        } else {
          fb.vy = 0;
          fb.vx *= 0.80;
          fb.vz *= 0.80;
          fb.vyaw *= 0.72;
          fb.vpitch *= 0.72;
        }
      }
    }

    // Step quarry dust sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.2 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.05, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    // Auto-demo cycles knocking out load-bearing pillars, letting collapse play out, then rebuilding!
    if (autoDemo) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        if (autoStep === 0) {
          const leftP = blocks.find((b) => b.alive && b.keyPillar === 0);
          if (leftP) smashBlock(leftP, { silent: !userInteracted });
          autoStep = 1;
          autoTimer = 2.6;
        } else if (autoStep === 1) {
          const midP = blocks.find((b) => b.alive && b.keyPillar === 1);
          if (midP) smashBlock(midP, { silent: !userInteracted });
          autoStep = 2;
          autoTimer = 2.8;
        } else if (autoStep === 2 && !gravityGraphOn) {
          const rightP = blocks.find((b) => b.alive && b.keyPillar === 2);
          if (rightP) smashBlock(rightP, { silent: !userInteracted });
          autoStep = 3;
          autoTimer = 2.5;
        } else {
          rebuildTower({ keepMode: true });
          autoStep = 0;
          autoTimer = 1.6;
        }
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const noHud = document.body.classList.contains("no-hud");
    const intact = blocks.filter((b) => b.alive).length;

    if (viewProj) {
      // Main tower status callout
      const tp = projectToScreen(viewProj, 0, 5.15, 0, cssW, cssH);
      if (tp) {
        const safeX = (!isCompact && !noHud && tp.y < 250) ? Math.min(tp.x, cssW - 415) : tp.x;
        let txt, col;
        if (!gravityGraphOn && floatingCount > 0) {
          txt = isPl ? `LEWITUJĄCE GRUZOWISKO! (${floatingCount} BLOKÓW) ✗` : `FLOATING DEBRIS! (${floatingCount} UNSUPPORTED) ✗`;
          col = "#f87171";
        } else if (fallingBlocks.length > 0) {
          txt = isPl ? `BFS ZAWALENIE! (>4 SKOKI OD GRUNTU) ✓` : `BFS COLLAPSE! (>4 HOPS FROM GROUND) ✓`;
          col = "#fb923c";
        } else {
          txt = isPl
            ? `GRAF PODPOROWY BFS · MAKS. ${maxActiveHops}/4 SKOKI ✓`
            : `BFS SUPPORT GRAPH · MAX ${maxActiveHops}/4 HOPS ✓`;
          col = "#34d399";
        }
        drawWorldPill(ctx, safeX, tp.y, txt, col, cssW, cssH, isCompact ? 8.5 : 10);
      }

      // Grounded foundation hint on an intact pillar
      const livePillar = blocks.find((b) => b.alive && b.gy === 0);
      if (livePillar) {
        const [px, , pz] = gridToWorld(livePillar.gx, 0, livePillar.gz);
        const pp = projectToScreen(viewProj, px, 0.55, pz + 0.9, cssW, cssH);
        if (pp) {
          drawWorldPill(ctx, pp.x, pp.y, isPl ? "FUNDAMENT (0 SKOKÓW · KLIKNIJ!)" : "FOUNDATION (0 HOPS · CLICK TO SMASH!)", "#2dd4bf", cssW, cssH, isCompact ? 8.5 : 9.5);
        }
      }
    }

    if (!noHud) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          gravityGraphOn
            ? `BFS GRAPH ON · Intact ${intact}/${blocks.length} · Fallen ${collapsedCount}`
            : `GRAPH OFF · ${floatingCount} FLOATING BLOCKS! ✗`,
          gravityGraphOn ? "#fb923c" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 328, panelH = 196, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(18, 12, 22, 0.90)";
        ctx.strokeStyle = gravityGraphOn ? "rgba(251, 146, 60, 0.84)" : "rgba(248, 113, 113, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = gravityGraphOn ? "#fb923c" : "#f87171";
        ctx.fillText(
          gravityGraphOn
            ? (isPl ? "GRAF PODPARCIA BFS · LIMIT 4 SKOKI" : "STRUCTURAL BFS GRAPH · 4-HOP LIMIT")
            : (isPl ? "BRAK GRAFU · LEWITUJĄCE BLOKI!" : "SUPPORT GRAPH OFF · FLOATING BLOCKS!"),
          px + 12, py + 21, bw
        );

        // Visual BFS Hop-Distance Color Legend Bar
        const segW = bw / 5;
        const legCols = ["#2dd4bf", "#4ade80", "#facc15", "#fb923c", "#ef4444"];
        const legTxt = ["0f", "1f", "2-3f", "4f", ">4 ✗"];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = legCols[i];
          ctx.beginPath(); ctx.roundRect(px + 12 + i * segW, py + 32, segW - 3, 17, 3); ctx.fill();
          ctx.font = "800 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = i < 4 ? "#0f172a" : "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(legTxt[i], px + 12 + i * segW + (segW - 3) * 0.5, py + 43.5);
        }
        ctx.textAlign = "left";

        // Structural Integrity Meter
        const pct = Math.round((intact / blocks.length) * 100);
        ctx.fillStyle = "rgba(38, 28, 44, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 58, bw, 15, 4); ctx.fill();
        ctx.fillStyle = !gravityGraphOn && floatingCount > 0 ? "#ef4444" : (pct > 65 ? "#22c55e" : "#f97316");
        ctx.beginPath(); ctx.roundRect(px + 12, py + 58, Math.max(8, bw * (pct / 100)), 15, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          isPl ? `CAŁOŚĆ KONSTRUKCJI: ${intact}/${blocks.length} (${pct}%)` : `TOWER INTEGRITY: ${intact}/${blocks.length} (${pct}%)`,
          px + 18, py + 69, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl
            ? `Fundamenty (y=0): ${groundedCount}/3 · Zawalenia: ${collapsedCount}`
            : `Foundations (y=0): ${groundedCount}/3 · Collapsed: ${collapsedCount}`,
          px + 12, py + 98, bw
        );
        ctx.fillStyle = floatingCount > 0 ? "#f87171" : "#cbd5e1";
        ctx.fillText(
          isPl
            ? `Bloki bez podparcia: ${floatingCount} (${gravityGraphOn ? "spadają!" : "LEWITUJĄ!"})`
            : `Unsupported Blocks: ${floatingCount} (${gravityGraphOn ? "collapsing!" : "FLOATING!"})`,
          px + 12, py + 120, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "Klik = Rozbij filar · V = Rozbij nośny" : "Click = Smash Pillar · V = Smash Key Pillar",
          px + 12, py + 146, bw
        );
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(
          isPl ? "T = Graf BFS / Lewitacja · R = Odbuduj" : "T = Support Graph / Float · R = Rebuild",
          px + 12, py + 168, bw
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
          id: "toggle-graph",
          label: gravityGraphOn
            ? (pl ? "Graf Podparcia: WŁ [T]" : "Support Graph: ON [T]")
            : (pl ? "Lewitujące Bloki [T]" : "Floating Blocks [T]"),
          pressed: gravityGraphOn,
        },
        {
          id: "smash-pillar",
          label: pl ? "Rozbij Filar Nośny [V]" : "Smash Key Pillar [V]",
          pressed: fallingBlocks.length > 0,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-graph") {
        gravityGraphOn = !gravityGraphOn;
        audio?.ruleSwitch?.(gravityGraphOn);
        if (gravityGraphOn) {
          // Immediately evaluate & collapse any currently floating blocks!
          const failing = recomputeBFS({ scheduleCollapse: true });
          setBanner(
            failing > 0
              ? `SUPPORT GRAPH ON: COLLAPSING ${failing} FLOATING BLOCKS IMMEDIATELY!`
              : "SUPPORT GRAPH ON: REAL BFS LOAD PATHS FROM y=0 FOUNDATIONS!",
            "#fb923c",
            2.1
          );
        } else {
          // Rebuild cleanly & knock out pillars if desired, or let user smash freely!
          setBanner("SUPPORT GRAPH OFF: SMASH FOUNDATIONS TO SEE ABSURD FLOATING DEBRIS!", "#f87171", 2.2);
        }
      } else if (id === "smash-pillar") {
        autoDemo = false;
        smashNextKeyPillar({ silent: false });
      } else if (id === "rebuild") {
        autoDemo = false;
        rebuildTower({ keepMode: true });
        audio?.wallClick?.(true);
        setBanner("WATCHTOWER BRIDGE REBUILT · 31 BLOCKS GROUNDED ✓", "#34d399", 1.7);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-graph");
      else if (code === "KeyV") this.onAction("smash-pillar");
    },
    onClickWorld(wPos, { button } = {}) {
      if (button === 0 && wPos) {
        userInteracted = true;
        autoDemo = false;
        // Pick closest living block near clicked XZ (prefer lower load-bearing blocks!)
        let best = null;
        let bestScore = Infinity;
        for (const b of blocks) {
          if (!b.alive) continue;
          const [bx, , bz] = gridToWorld(b.gx, b.gy, b.gz);
          const dXZ = Math.hypot(bx - wPos[0], bz - wPos[2]);
          if (dXZ < 1.9) {
            const score = dXZ + b.gy * 0.28;
            if (score < bestScore) { bestScore = score; best = b; }
          }
        }
        if (best) smashBlock(best, { silent: false });
        else smashNextKeyPillar({ silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      if (worldDirty) rebuildWorldMesh();

      // Render tumbling detached debris blocks via procedural unit cube mesh!
      const meshes = [];
      for (const fb of fallingBlocks) {
        const alpha = fb.life < 0.55 ? clamp(fb.life / 0.55, 0, 1) : 1.0;
        meshes.push({
          gpu: debrisGpu,
          x: fb.x, y: fb.y, z: fb.z,
          yaw: fb.yaw,
          animMode: 5, animA: fb.pitch, pivot: [0, 0, 0],
          scale: UNIT * 0.96,
          tint: [fb.col[0], fb.col[1], fb.col[2], 0.95],
          alpha,
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Grounded foundation emerald rings
          for (const gx of [-3, 0, 3]) {
            const alive = blocks.some((b) => b.alive && b.gx === gx && b.gy === 0 && b.gz === 0);
            const wx = gx * UNIT;
            fx.ringXZ(wx, 0.08, 0, 0.86, alive ? [0.18, 0.94, 0.78, 0.78] : [1.0, 0.24, 0.28, 0.65]);
          }

          // Crimson fracture stress cages on failing or floating unsupported blocks!
          const hb = UNIT * 0.51;
          for (const b of blocks) {
            if (!b.alive) continue;
            if (b.failingT > 0 || (!gravityGraphOn && b.hops > MAX_HOPS)) {
              const [wx, wy, wz] = gridToWorld(b.gx, b.gy, b.gz);
              const pulse = 0.65 + 0.30 * Math.sin(time * 12 + b.id);
              fx.xrayBox(wx - hb, wx + hb, wy - hb, wy + hb, wz - hb, wz + hb, [1.0, 0.18, 0.26, pulse]);
            }
          }

          // Subtle BFS load-path beams along active parent -> child edges
          for (const b of blocks) {
            if (!b.alive || b.parentId < 0 || b.hops > MAX_HOPS) continue;
            const p = blocks[b.parentId];
            if (!p || !p.alive) continue;
            const [x0, y0, z0] = gridToWorld(p.gx, p.gy, p.gz);
            const [x1, y1, z1] = gridToWorld(b.gx, b.gy, b.gz);
            const c = integrityColor(b.hops);
            fx.beam(x0, y0, z0 + 0.54, x1, y1, z1 + 0.54, 0.065, [c[0], c[1], c[2], 0.55], 0);
          }

          // Impact burst ring on smash
          if (smashFlash) {
            const a = clamp(smashFlash.life / smashFlash.maxLife, 0, 1);
            fx.ringXZ(smashFlash.x, Math.max(0.1, smashFlash.y), smashFlash.z, 0.4 + (1 - a) * 2.1, [1.0, 0.66, 0.18, a * 0.95]);
          }

          // Dust & rubble sparks
          for (const s of sparks) {
            const a = clamp(s.life / s.maxLife, 0, 1);
            fx.billboard(s.x, s.y, s.z, s.size * (0.45 + 0.55 * a), basis.right, basis.up, [s.r, s.g, s.b, a], 2);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const intactBlocks = blocks.filter((b) => b.alive).length;
      return {
        gravityGraphOn,
        intactBlocks,
        totalBlocks: blocks.length,
        collapsedCount,
        floatingCount,
        groundedCount,
        maxActiveHops,
        fallingCount: fallingBlocks.length,
      };
    },
  };
}
