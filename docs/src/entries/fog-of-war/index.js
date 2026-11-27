// Entry #28: Fog of War & RTS Vision Shadowcasting — Playable 3D Tactical Valley!
// True 3-State RTS Fog of War (Unexplored Obsidian -> Explored Shroud Memory -> Live Raycasted Vision)
// blocked by solid mountain walls — hiding live enemy ambushers until your Scout gains direct line-of-sight!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getSkiffMeshes } from "../../skiff-mesh.js";
import { getQuadMeshes } from "../../quad-mesh.js";
import { getCullMeshes } from "../../cull-mesh.js";

const COLS = 16;
const ROWS = 12;
const CELL = 0.92;
const HALF_W = (COLS * CELL) * 0.5;
const HALF_H = (ROWS * CELL) * 0.5;
const VISION_RAD = 4.25;

// Solid Stone Ridge Wall cells blocking RTS Line-of-Sight!
const WALL_SET = new Set([
  "5,3","5,4","5,5","5,6",
  "10,5","10,6","10,7","10,8",
  "7,8","8,8","9,8",
]);

function cellToWorld(c, r) {
  return { x: -HALF_W + (c + 0.5) * CELL, z: -HALF_H + (r + 0.5) * CELL };
}
function worldToCell(x, z) {
  return {
    c: clamp(Math.floor((x + HALF_W) / CELL), 0, COLS - 1),
    r: clamp(Math.floor((z + HALF_H) / CELL), 0, ROWS - 1),
  };
}
function isWallCell(c, r) { return WALL_SET.has(`${c},${r}`); }

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.02, 0.04, 0.08],
    skyMid: [0.05, 0.09, 0.16],
    skyBot: [0.09, 0.14, 0.22],
    lightDir: [0.36, 0.86, 0.34],
    orthoHalf: 12.0,
    maxWorldVerts: 36000,
  });
  const sm = getSkiffMeshes();
  const qm = getQuadMeshes();
  const cm = getCullMeshes();
  const scoutGpu = studio.uploadMesh(sm.skiff);
  const enemyGpu = studio.uploadMesh(qm.drone);
  const towerGpu = studio.uploadMesh(cm.tower);

  const defaultCam = { yaw: 0.0, pitch: 0.90, dist: 18.2, targetX: 0.0, targetY: 0.25, targetZ: 0.1, fovDeg: 40 };

  // 0 = Unexplored Pitch Fog, 1 = Explored Shroud (Memory), 2 = Active Live Vision!
  const visState = new Uint8Array(COLS * ROWS);
  let worldDirty = true;

  let time = 0;
  let fogOn = true;     // ON: True 3-State RTS Fog of War | OFF: Map-Hack (all hidden ambushers exposed!)
  let radarTimer = 0;   // [V] Temporary Orbital Radar Ping!
  let autoExplore = true;
  let userInteracted = false;

  const scout = { x: -4.2, z: 2.4, yaw: 0.7, goalX: null, goalZ: null };
  // 5 Enemy Raiders patrolling behind stone ridges (INVISIBLE in Shroud/Fog unless revealed!)
  const enemies = [
    { x:  1.4, z: -2.4, vx:  1.1, vz:  0.6, minX: -0.5, maxX:  3.6, minZ: -4.2, maxZ: -1.0 },
    { x:  4.6, z: -2.0, vx: -0.9, vz:  0.9, minX:  3.0, maxX:  6.2, minZ: -4.4, maxZ:  0.4 },
    { x:  4.2, z:  2.8, vx:  0.8, vz: -0.9, minX:  2.8, maxX:  6.2, minZ:  0.8, maxZ:  4.2 },
    { x: -1.4, z: -2.8, vx:  0.9, vz:  0.7, minX: -4.8, maxX: -0.8, minZ: -4.4, maxZ: -1.6 },
    { x: -0.4, z:  3.4, vx:  1.1, vz: -0.4, minX: -2.0, maxX:  2.4, minZ:  2.8, maxZ:  4.4 },
  ];
  const outposts = [
    { x:  4.8, z: -3.2 },
    { x: -4.6, z: -3.4 },
  ];

  let exploredCount = 0;
  let visibleCount = 0;
  let spottedEnemies = 0;

  let bannerText = "";
  let bannerColor = "#06b6d4";
  let bannerTimer = 0;
  function setBanner(t, c = "#06b6d4", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  // 2D Grid DDA Line-of-Sight check blocked by Stone Ridge Walls!
  function hasLineOfSight(ax, az, bx, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(4, Math.ceil(dist / 0.24));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = ax + (bx - ax) * t;
      const sz = az + (bz - az) * t;
      const cell = worldToCell(sx, sz);
      if (isWallCell(cell.c, cell.r)) return false;
    }
    return true;
  }

  function updateVisibility() {
    let changed = false;
    let exp = 0, vis = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const prev = visState[idx];
        const w = cellToWorld(c, r);
        const d = Math.hypot(w.x - scout.x, w.z - scout.z);
        const inRadar = radarTimer > 0;
        const inVis = !fogOn || inRadar || (d <= VISION_RAD && hasLineOfSight(scout.x, scout.z, w.x, w.z));
        let next = prev;
        if (inVis) next = 2;
        else if (prev === 2) next = 1; // Demote to Explored Shroud Memory!
        if (next !== prev) { visState[idx] = next; changed = true; }
        if (next >= 1) exp++;
        if (next === 2) vis++;
      }
    }
    exploredCount = exp;
    visibleCount = vis;
    if (changed) worldDirty = true;
  }

  function rebuildWorldMesh() {
    const wBuf = [];
    // Dark tactical frame base
    pushBox(wBuf, -HALF_W - 0.35, HALF_W + 0.35, -0.55, -0.10, -HALF_H - 0.35, HALF_H + 0.35, [0.08, 0.10, 0.16], 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const st = fogOn ? visState[r * COLS + c] : 2;
        const wall = isWallCell(c, r);
        const x0 = -HALF_W + c * CELL, x1 = x0 + CELL - 0.02;
        const z0 = -HALF_H + r * CELL, z1 = z0 + CELL - 0.02;
        if (st === 0) {
          // State 0: UNEXPLORED PITCH FOG SLAB!
          pushBox(wBuf, x0, x1, -0.10, 0.42, z0, z1, [0.05, 0.06, 0.10], 4);
        } else if (st === 1) {
          // State 1: EXPLORED SHROUD (Dim cool-indigo memory — terrain known, live enemies hidden!)
          pushBox(wBuf, x0, x1, -0.10, 0.0, z0, z1, [0.16, 0.22, 0.30], 0);
          if (wall) pushBox(wBuf, x0 + 0.04, x1 - 0.04, 0.0, 1.35, z0 + 0.04, z1 - 0.04, [0.24, 0.28, 0.36], 1);
        } else {
          // State 2: ACTIVE LIVE VISION (Bright sunlit emerald terrain!)
          pushBox(wBuf, x0, x1, -0.10, 0.02, z0, z1, [0.28, 0.62, 0.38], 4);
          if (wall) pushBox(wBuf, x0 + 0.04, x1 - 0.04, 0.02, 1.48, z0 + 0.04, z1 - 0.04, [0.62, 0.60, 0.56], 1);
        }
      }
    }
    studio.setWorldData(wBuf);
    worldDirty = false;
  }

  function reset() {
    time = 0; radarTimer = 0; autoExplore = true;
    visState.fill(0);
    scout.x = -3.4; scout.z = 1.4; scout.yaw = 0.6; scout.goalX = null; scout.goalZ = null;
    bannerTimer = 0;
    // Seed a clean open-meadow scouting arc so Frame 1 immediately displays ALL 3 Fog States (Unexplored + Shroud + Live Vision) + Wall Shadows!
    const seedPts = [[-5.6, 3.6], [-4.8, 3.0], [-4.0, 2.2], [-3.4, 1.4]];
    for (const [sx, sz] of seedPts) { scout.x = sx; scout.z = sz; updateVisibility(); }
    rebuildWorldMesh();
  }
  reset();

  function isPassable(x, z) {
    const pad = 0.36;
    for (const ox of [-pad, 0, pad]) {
      for (const oz of [-pad, 0, pad]) {
        const cell = worldToCell(x + ox, z + oz);
        if (isWallCell(cell.c, cell.r)) return false;
      }
    }
    return true;
  }

  function moveScoutTo(nx, nz) {
    const cx = clamp(nx, -HALF_W + 0.6, HALF_W - 0.6);
    const cz = clamp(nz, -HALF_H + 0.6, HALF_H - 0.6);
    if (isPassable(cx, cz)) {
      scout.x = cx; scout.z = cz;
    } else if (isPassable(cx, scout.z)) {
      scout.x = cx;
    } else if (isPassable(scout.x, cz)) {
      scout.z = cz;
    }
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (radarTimer > 0) {
      radarTimer = Math.max(0, radarTimer - dt);
      if (radarTimer === 0) worldDirty = true;
    }

    // 1. Move Scout (WASD / Click Target / Auto-Explore)
    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;

    if (mx !== 0 || mz !== 0) {
      autoExplore = false; userInteracted = true; scout.goalX = null;
      const l = Math.hypot(mx, mz);
      moveScoutTo(scout.x + (mx / l) * 3.8 * dt, scout.z + (mz / l) * 3.8 * dt);
      scout.yaw = Math.atan2(mx, mz);
    } else if (scout.goalX != null) {
      const dx = scout.goalX - scout.x, dz = scout.goalZ - scout.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.2) {
        moveScoutTo(scout.x + (dx / d) * 3.8 * dt, scout.z + (dz / d) * 3.8 * dt);
        scout.yaw = Math.atan2(dx, dz);
      } else {
        scout.goalX = null;
      }
    } else if (autoExplore) {
      // Smooth tactical recon sweep weaving around the left & center stone ridges!
      const t = time * 0.44;
      const gx = -1.2 + Math.cos(t) * 3.8;
      const gz = Math.sin(t * 1.4) * 3.4;
      const dx = gx - scout.x, dz = gz - scout.z;
      const d = Math.hypot(dx, dz) || 1;
      moveScoutTo(scout.x + (dx / d) * Math.min(d, 2.4 * dt), scout.z + (dz / d) * Math.min(d, 2.4 * dt));
      if (d > 0.1) scout.yaw = Math.atan2(dx, dz);
    }

    // 2. Move Hidden Enemy Raiders along their patrol zones
    for (const e of enemies) {
      e.x += e.vx * dt; e.z += e.vz * dt;
      if (e.x < e.minX || e.x > e.maxX) e.vx *= -1;
      if (e.z < e.minZ || e.z > e.maxZ) e.vz *= -1;
    }

    updateVisibility();
    if (worldDirty) rebuildWorldMesh();

    spottedEnemies = 0;
    for (const e of enemies) {
      const ec = worldToCell(e.x, e.z);
      if (!fogOn || visState[ec.r * COLS + ec.c] === 2) spottedEnemies++;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Scout live vision pill
      const sp = projectToScreen(viewProj, scout.x, 1.55, scout.z, cssW, cssH);
      if (sp) drawWorldPill(ctx, sp.x, sp.y, isPl ? "ZWIADOWCA (AKTYWNY WZROK)" : "SCOUT (LIVE VISION ✓)", "#22d3ee", cssW, cssH, isCompact ? 9 : 10);

      if (fogOn && radarTimer <= 0) {
        // Point out Unexplored Fog on far-right!
        const fp = projectToScreen(viewProj, 5.1, 1.0, 2.5, cssW, cssH);
        if (fp) drawWorldPill(ctx, fp.x, fp.y, isPl ? "NIEODKRYTA MGŁA (0 INFO)" : "UNEXPLORED FOG", "#94a3b8", cssW, cssH, isCompact ? 8.5 : 9.5);
        // Point out Shroud behind wall!
        const sh = projectToScreen(viewProj, -4.6, 0.9, 3.2, cssW, cssH);
        if (sh) drawWorldPill(ctx, sh.x, sh.y, isPl ? "SZARA PAMIĘĆ (UKRYWA WROGÓW)" : "SHROUD (HIDES LIVE ENEMIES)", "#818cf8", cssW, cssH, isCompact ? 8.5 : 9.5);
      } else {
        const mh = projectToScreen(viewProj, 3.8, 1.5, -1.8, cssW, cssH);
        if (mh) drawWorldPill(ctx, mh.x, mh.y, isPl ? "WSZYSCY WROGOWIE ODSŁONIĘCI!" : "ALL HIDDEN AMBUSHERS REVEALED!", "#f87171", cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const expPct = Math.round((exploredCount / (COLS * ROWS)) * 100);
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${fogOn ? `FOG ON · ${expPct}% Map` : "MAP-HACK (NO FOG)"} · Spotted ${spottedEnemies}/${enemies.length}`,
          fogOn ? "#06b6d4" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 158, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 26, 0.90)";
        ctx.strokeStyle = fogOn ? "rgba(6, 182, 212, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = fogOn ? "#22d3ee" : "#f87171";
        ctx.fillText(fogOn ? "3-STATE FOG OF WAR · RAYCAST LOS" : "FOG OFF (MAP-HACK) · FULL VISIBILITY!", px + 12, py + 21, bw);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = fogOn ? "#06b6d4" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, Math.max(10, bw * (expPct / 100)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`MAP EXPLORED: ${expPct}% · LIVE CELLS: ${visibleCount}`, px + 18, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Wykryci wrogowie: ${spottedEnemies} / ${enemies.length} (reszta w cieniu!)` : `Spotted Enemies: ${spottedEnemies} / ${enemies.length} (rest hidden!)`, px + 12, py + 76, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Czarny=Mgła · Szary=Pamięć · Zielony=Wzrok" : "Black=Fog · Slate=Shroud · Green=Live LOS", px + 12, py + 98, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "WASD / Klik = Zwiad · V = Skan Radaru" : "WASD / Click = Move Scout · V = Radar Scan", px + 12, py + 122, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "T = Mgła Wojny / Map-Hack (odsłoń wrogów!)" : "T = Fog of War / Map-Hack (reveal ambush!)", px + 12, py + 144, bw);
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
        { id: "toggle-fog", label: fogOn ? (pl ? "Mgła Wojny: WŁ [T]" : "Fog of War: ON [T]") : (pl ? "Map-Hack (Bez Mgły) [T]" : "Map-Hack (No Fog) [T]"), pressed: fogOn },
        { id: "radar", label: pl ? "Skan Radaru [V]" : "Radar Ping [V]", pressed: radarTimer > 0 },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-fog") {
        fogOn = !fogOn;
        worldDirty = true;
        audio?.ruleSwitch?.(fogOn);
        setBanner(
          fogOn
            ? "FOG OF WAR ON: ENEMIES HIDDEN BEHIND STONE RIDGES & SHROUD!"
            : "FOG OFF (MAP-HACK): ALL 5 HIDDEN ENEMY AMBUSHERS EXPOSED!",
          fogOn ? "#22d3ee" : "#f87171",
          2.0
        );
      } else if (id === "radar") {
        radarTimer = 2.4;
        worldDirty = true;
        audio?.waterRipple?.();
        setBanner("ORBITAL RADAR PING! ALL HIDDEN UNITS REVEALED FOR 2.4s!", "#22d3ee", 1.9);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-fog");
      else if (code === "KeyV") this.onAction("radar");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoExplore = false;
        scout.goalX = clamp(world[0], -HALF_W + 0.6, HALF_W - 0.6);
        scout.goalZ = clamp(world[2], -HALF_H + 0.6, HALF_H - 0.6);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        { gpu: scoutGpu, x: scout.x, y: 0.14, z: scout.z, yaw: scout.yaw, scale: 1.05, animMode: 0 },
      ];
      // Static Outposts remain remembered in Shroud (state >= 1) as ghost/dim structures!
      for (const op of outposts) {
        const oc = worldToCell(op.x, op.z);
        const st = fogOn ? visState[oc.r * COLS + oc.c] : 2;
        if (st >= 1) {
          meshes.push({
            gpu: towerGpu, x: op.x, y: 0.0, z: op.z, yaw: 0, scale: 0.92, animMode: 0,
            alpha: st === 1 ? 0.45 : 1.0,
            tint: st === 1 ? [0.40, 0.48, 0.72, 0.75] : [0.96, 0.28, 0.34, 0.35],
          });
        }
      }
      // Live Moving Enemy Units ONLY render inside State 2 Active Live Vision!
      for (const e of enemies) {
        const ec = worldToCell(e.x, e.z);
        const st = fogOn ? visState[ec.r * COLS + ec.c] : 2;
        if (st === 2) {
          meshes.push({
            gpu: enemyGpu, x: e.x, y: 0.18 + 0.06 * Math.sin(time * 5 + e.x), z: e.z,
            yaw: Math.atan2(e.vx, e.vz), scale: 1.22, animMode: 0, tint: [1.0, 0.22, 0.28, 0.75],
          });
        }
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          fx.ringXZ(scout.x, 0.08, scout.z, VISION_RAD, [0.18, 0.94, 1.0, 0.62]);
          if (radarTimer > 0) {
            const rad = (1 - (radarTimer / 2.4)) * 9.5 + 1.5;
            fx.ringXZ(scout.x, 0.12, scout.z, rad, [0.20, 0.96, 1.0, clamp(radarTimer / 2.4, 0, 1) * 0.85]);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { fogOn, exploredCount, visibleCount, spottedEnemies, totalEnemies: enemies.length };
    },
  };
}
