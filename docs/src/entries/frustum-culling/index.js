// Entry #18: Frustum & Occlusion Culling — Playable 3D Miniature Harbor Town Renderer!
// Shows the #1 GPU secret behind 60+ FPS 3D open worlds: the engine ONLY renders objects inside the camera's
// 60° FOV frustum AND not hidden behind solid walls — skipping 70%+ of the world every single frame!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getCullMeshes } from "../../cull-mesh.js";
import { getWfcMeshes } from "../../wfc-mesh.js";

const CAM_X = 0.0;
const CAM_Z = 4.35;
const FOV_HALF = (31 * Math.PI) / 180; // 62° total FOV cone
const FRUSTUM_RANGE = 11.4;
// Tall Castle Curtain Wall blocking line-of-sight into the North Courtyard!
const WALL_X0 = -2.15;
const WALL_X1 = 2.15;
const WALL_Z = -0.95;

// 34 Hand-Curated Medieval Harbor Town Props (East, West, Center Courtyard, Behind Castle Wall)
const TOWN_PROPS = [
  // Behind Castle Wall (Occluded even when Camera looks straight North!)
  { kind: "tower", x: 0.0, z: -3.25, yaw: 0, s: 1.08, behindWall: true },
  { kind: "cottage", x: -1.15, z: -2.45, yaw: 0.2, s: 1.05, behindWall: true },
  { kind: "cottage", x: 1.15, z: -2.45, yaw: -0.25, s: 1.05, behindWall: true },
  { kind: "cottage", x: -1.35, z: -3.95, yaw: 0.5, s: 1.0, behindWall: true },
  { kind: "cottage", x: 1.35, z: -3.95, yaw: -0.4, s: 1.0, behindWall: true },
  { kind: "tree", x: 0.0, z: -4.45, yaw: 0.8, s: 1.15, behindWall: true },
  { kind: "tree", x: -0.55, z: -1.95, yaw: 1.2, s: 1.0, behindWall: true },
  { kind: "tree", x: 0.55, z: -1.95, yaw: 2.1, s: 1.0, behindWall: true },
  // Foreground Center Plaza (in front of Castle Wall)
  { kind: "cottage", x: -1.45, z: 0.95, yaw: 0.3, s: 1.02 },
  { kind: "cottage", x: 1.45, z: 0.95, yaw: -0.35, s: 1.02 },
  { kind: "tree", x: -0.15, z: 0.40, yaw: 0.4, s: 1.08 },
  // West Harbor Quarter
  { kind: "tower", x: -4.65, z: -1.85, yaw: 0.2, s: 1.10 },
  { kind: "cottage", x: -3.65, z: -0.25, yaw: 0.65, s: 1.04 },
  { kind: "cottage", x: -5.45, z: 0.35, yaw: 0.15, s: 1.02 },
  { kind: "cottage", x: -4.25, z: 1.85, yaw: 0.85, s: 1.00 },
  { kind: "cottage", x: -6.05, z: -2.65, yaw: 0.4, s: 0.98 },
  { kind: "cottage", x: -3.55, z: -3.55, yaw: -0.2, s: 1.02 },
  { kind: "tree", x: -3.05, z: 1.25, yaw: 1.0, s: 1.12 },
  { kind: "tree", x: -5.25, z: -0.85, yaw: 2.3, s: 1.08 },
  { kind: "tree", x: -6.35, z: 1.65, yaw: 0.5, s: 1.15 },
  { kind: "tree", x: -4.85, z: -3.85, yaw: 1.7, s: 1.10 },
  { kind: "tree", x: -5.85, z: 2.95, yaw: 2.8, s: 1.05 },
  // East Harbor Quarter
  { kind: "tower", x: 4.65, z: -1.85, yaw: -0.2, s: 1.10 },
  { kind: "cottage", x: 3.65, z: -0.25, yaw: -0.65, s: 1.04 },
  { kind: "cottage", x: 5.45, z: 0.35, yaw: -0.15, s: 1.02 },
  { kind: "cottage", x: 4.25, z: 1.85, yaw: -0.85, s: 1.00 },
  { kind: "cottage", x: 6.05, z: -2.65, yaw: -0.4, s: 0.98 },
  { kind: "cottage", x: 3.55, z: -3.55, yaw: 0.2, s: 1.02 },
  { kind: "tree", x: 3.05, z: 1.25, yaw: 0.7, s: 1.12 },
  { kind: "tree", x: 5.25, z: -0.85, yaw: 1.9, s: 1.08 },
  { kind: "tree", x: 6.35, z: 1.65, yaw: 2.4, s: 1.15 },
  { kind: "tree", x: 4.85, z: -3.85, yaw: 1.1, s: 1.10 },
  { kind: "tree", x: 5.85, z: 2.95, yaw: 0.3, s: 1.05 },
  // Far Flanks (Always outside narrow front cone until panned hard!)
  { kind: "cottage", x: -3.55, z: 3.45, yaw: 1.2, s: 0.96 },
  { kind: "cottage", x: 3.55, z: 3.45, yaw: -1.2, s: 0.96 },
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.06, 0.12, 0.24],
    skyMid: [0.14, 0.26, 0.42],
    skyBot: [0.22, 0.36, 0.50],
    lightDir: [0.42, 0.84, 0.34],
    ambLow: [0.16, 0.20, 0.28],
    ambHigh: [0.46, 0.52, 0.62],
    orthoHalf: 12.0,
  });
  const cm = getCullMeshes();
  const wm = getWfcMeshes();
  const towerGpu = studio.uploadMesh(cm.tower);
  const cameraGpu = studio.uploadMesh(cm.camera);
  const cottageGpu = studio.uploadMesh(wm.cottage);
  const treeGpu = studio.uploadMesh(wm.tree);

  // Build Sunlit Coastal Town Island + Tall Stone Castle Occluder Wall!
  const wBuf = [];
  // Shimmering ocean surround
  pushBox(wBuf, -13.0, 13.0, -0.8, -0.18, -9.5, 9.5, [0.12, 0.46, 0.72], 3);
  // Grassy Harbor Island
  pushBox(wBuf, -7.4, 7.4, -0.25, 0.0, -5.2, 5.1, [0.34, 0.62, 0.34], 4);
  // Stone Harbor Road & Camera Pier
  pushBox(wBuf, -1.6, 1.6, 0.0, 0.05, 1.6, 5.1, [0.58, 0.56, 0.52], 0);
  pushBox(wBuf, -5.8, 5.8, 0.0, 0.04, 0.4, 1.6, [0.56, 0.54, 0.50], 0);
  // Tall Stone Castle Curtain Wall (The Occluder!)
  pushBox(wBuf, WALL_X0, WALL_X1, 0.0, 2.35, WALL_Z - 0.32, WALL_Z + 0.32, [0.64, 0.62, 0.60], 1);
  // Crenellations & turrets on Castle Wall
  for (let bx = WALL_X0 + 0.25; bx <= WALL_X1 - 0.2; bx += 0.76) {
    pushBox(wBuf, bx - 0.20, bx + 0.20, 2.35, 2.70, WALL_Z - 0.34, WALL_Z + 0.34, [0.72, 0.70, 0.66], 1);
  }
  // Neon purple occluder rim line so the wall reads unmistakably as an Occluder!
  pushBox(wBuf, WALL_X0 - 0.04, WALL_X1 + 0.04, 0.05, 0.14, WALL_Z + 0.33, WALL_Z + 0.42, [0.68, 0.38, 1.0], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.86, dist: 19.2, targetX: 0.0, targetY: 0.4, targetZ: 0.1, fovDeg: 40 };

  let time = 0;
  let cullOn = true;
  let xrayGhosts = true;
  let autoPan = true;
  let userInteracted = false;

  // Camera rig yaw: Math.PI = straight North (-Z) toward the Castle Wall & Harbor Town!
  let rigYaw = Math.PI + 0.42;
  let targetRigYaw = rigYaw;
  let wallLockTimer = 0;

  let drawnCount = 0;
  let frustumCulled = 0;
  let occludedCulled = 0;

  let bannerText = "";
  let bannerColor = "#a855f7";
  let bannerTimer = 0;
  function setBanner(t, c = "#a855f7", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  // 2D segment intersection test: does ray from Camera -> Prop cross the Castle Wall?
  function isOccludedByWall(px, pz) {
    if (pz >= WALL_Z - 0.15) return false;
    const t = (WALL_Z - CAM_Z) / (pz - CAM_Z);
    if (t <= 0 || t >= 1) return false;
    const ix = CAM_X + (px - CAM_X) * t;
    return ix >= WALL_X0 + 0.08 && ix <= WALL_X1 - 0.08;
  }

  function classifyProp(prop) {
    const dx = prop.x - CAM_X;
    const dz = prop.z - CAM_Z;
    const dist = Math.hypot(dx, dz);
    if (dist > FRUSTUM_RANGE) return "OUTSIDE";
    const ang = Math.atan2(dx, dz);
    let diff = ang - rigYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > FOV_HALF) return "OUTSIDE";
    if (isOccludedByWall(prop.x, prop.z)) return "OCCLUDED";
    return "VISIBLE";
  }

  function recomputeCounts() {
    let vis = 0, out = 0, occ = 0;
    for (const p of TOWN_PROPS) {
      const st = classifyProp(p);
      if (st === "VISIBLE") vis++;
      else if (st === "OCCLUDED") occ++;
      else out++;
    }
    drawnCount = cullOn ? vis : TOWN_PROPS.length;
    frustumCulled = cullOn ? out : 0;
    occludedCulled = cullOn ? occ : 0;
  }

  function reset() {
    time = 0;
    autoPan = true;
    wallLockTimer = 0;
    rigYaw = Math.PI + 0.42;
    targetRigYaw = rigYaw;
    bannerTimer = 0;
    recomputeCounts();
  }
  reset();

  function update(dt, keys, pointer) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (wallLockTimer > 0) wallLockTimer = Math.max(0, wallLockTimer - dt);

    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoPan = false; userInteracted = true; wallLockTimer = 0;
      targetRigYaw = clamp(targetRigYaw + ((left ? 1 : 0) - (right ? 1 : 0)) * 1.45 * dt, Math.PI - 1.15, Math.PI + 1.15);
    } else if (wallLockTimer > 0) {
      targetRigYaw = Math.PI;
    } else if (!autoPan && pointer?.world && pointer.world[2] < CAM_Z - 0.5) {
      const des = Math.atan2(pointer.world[0] - CAM_X, pointer.world[2] - CAM_Z);
      let d = des - Math.PI;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      targetRigYaw = Math.PI + clamp(d, -1.15, 1.15);
    } else if (autoPan) {
      // Smooth sweeping pan showing both West/East Frustum culling AND center Castle Wall Occlusion!
      targetRigYaw = Math.PI + Math.sin(time * 0.52) * 0.88;
    }

    rigYaw = lerp(rigYaw, targetRigYaw, clamp(dt * 8.0, 0, 1));
    recomputeCounts();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // 1. Camera Rig label
      const cp = projectToScreen(viewProj, CAM_X, 1.55, CAM_Z + 0.45, cssW, cssH);
      if (cp) {
        drawWorldPill(ctx, cp.x, cp.y, isPl ? "KAMERA GRY (FOV 62°)" : "PLAYER CAMERA (62° FOV)", "#38bdf8", cssW, cssH, isCompact ? 9 : 10);
      }

      // 2. Occlusion Zone label behind the Castle Wall
      const op = projectToScreen(viewProj, 0.0, 2.35, -3.25, cssW, cssH);
      if (op) {
        const anyOcc = occludedCulled > 0;
        const txt = cullOn
          ? (anyOcc
              ? (isPl ? `ZA ŚCIANĄ: ZASŁONIĘTE (${occludedCulled} WYCIĘTE!)` : `OCCLUDED BEHIND WALL (${occludedCulled} CULLED!)`)
              : (isPl ? "STREFA ZA ŚCIANĄ ZAMKU" : "BEHIND CASTLE WALL"))
          : (isPl ? "CULLING WYŁ: RENDERUJE ZA ŚCIANĄ! ✗" : "CULLING OFF: DRAWING HIDDEN ROOM! ✗");
        drawWorldPill(ctx, op.x, op.y, txt, cullOn ? "#c084fc" : "#f87171", cssW, cssH, isCompact ? 9 : 10);
      }

      // 3. Outside-Frustum Flank label (pick whichever side the camera is NOT looking at!)
      const flankX = Math.sin(rigYaw) > 0 ? -5.0 : 5.0;
      const fp = projectToScreen(viewProj, flankX, 2.1, -0.4, cssW, cssH);
      if (fp) {
        const txt = cullOn
          ? (isPl ? "POZA STOŻKIEM: POMINIĘTE ✓" : "OUTSIDE FOV: NOT RENDERED ✓")
          : (isPl ? "POZA EKRANEM: MARNOWANE GPU! ✗" : "OFF-SCREEN: WASTING GPU! ✗");
        drawWorldPill(ctx, fp.x, fp.y, txt, cullOn ? "#a855f7" : "#f87171", cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const total = TOWN_PROPS.length;
      const savedPct = Math.round(((total - drawnCount) / total) * 100);
      const estFps = cullOn ? Math.min(144, Math.round(144 - drawnCount * 2.2)) : 26;

      if (isCompact) {
        drawMobilePill(
          ctx,
          `${cullOn ? `CULLED ${savedPct}%` : "NO CULLING"} · ${drawnCount}/${total} · ~${estFps} FPS`,
          cullOn ? "#a855f7" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 312, panelH = 154, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(10, 13, 28, 0.88)";
        ctx.strokeStyle = cullOn ? "rgba(168, 85, 247, 0.80)" : "rgba(248, 113, 113, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = cullOn ? "#c084fc" : "#f87171";
        ctx.fillText(cullOn ? `FRUSTUM + OCCLUSION · -${savedPct}% WORK` : "NO CULLING · DRAWING 100% WORLD!", px + 12, py + 21);

        // GPU Workload Bar
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = cullOn ? "#22c55e" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, Math.max(8, bw * (drawnCount / total)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`GPU DRAWN: ${drawnCount} / ${total} MESHES  (~${estFps} FPS)`, bx + 7, py + 45.5);

        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#4ade80";
        ctx.fillText(isPl ? `Widoczne w stożku: ${drawnCount}` : `Rendered (In Frustum): ${drawnCount}`, px + 12, py + 76);
        ctx.fillStyle = "#c084fc";
        ctx.fillText(isPl ? `Wycięte: Poza FOV ${frustumCulled} · Za ścianą ${occludedCulled}` : `Skipped: Outside FOV ${frustumCulled} · Occluded ${occludedCulled}`, px + 12, py + 98);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "A/D lub Mysz = Obróć kamerę · V = Test Ściany" : "A/D or Mouse = Pan Cam · V = Wall Occlusion", px + 12, py + 124);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "T = Culling WŁ/WYŁ · X = Duchy wyciętych" : "T = Culling ON/OFF · X = Ghost Culled Props", px + 12, py + 142);
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
        { id: "toggle-cull", label: cullOn ? (pl ? "Culling: WŁ [T]" : "Culling: ON [T]") : (pl ? "Culling: WYŁ (100%) [T]" : "Culling: OFF (100%) [T]"), pressed: cullOn },
        { id: "wall-test", label: pl ? "Test Ściany [V]" : "Wall Occlusion [V]", pressed: wallLockTimer > 0 },
        { id: "toggle-ghost", label: xrayGhosts ? (pl ? "Duchy: WŁ [X]" : "Culled Ghosts: ON [X]") : (pl ? "Duchy: WYŁ [X]" : "Culled Ghosts: OFF [X]"), pressed: xrayGhosts },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-cull") {
        cullOn = !cullOn;
        audio?.ruleSwitch?.(cullOn);
        recomputeCounts();
        setBanner(
          cullOn
            ? `CULLING ON: SKIPPING ${frustumCulled + occludedCulled}/${TOWN_PROPS.length} HIDDEN MESHES!`
            : `CULLING OFF: GPU WASTES TIME DRAWING ALL ${TOWN_PROPS.length} MESHES!`,
          cullOn ? "#c084fc" : "#f87171",
          1.9
        );
      } else if (id === "wall-test") {
        wallLockTimer = 3.2;
        targetRigYaw = Math.PI;
        audio?.ruleSwitch?.(true);
        setBanner("CAMERA AIMED AT CASTLE WALL: 8 COURTYARD PROPS OCCLUDED & CULLED!", "#c084fc", 2.0);
      } else if (id === "toggle-ghost") {
        xrayGhosts = !xrayGhosts;
        audio?.ruleSwitch?.(xrayGhosts);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-cull");
      else if (code === "KeyV") this.onAction("wall-test");
      else if (code === "KeyX") this.onAction("toggle-ghost");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoPan = false; wallLockTimer = 0;
        const des = Math.atan2(world[0] - CAM_X, world[2] - CAM_Z);
        let d = des - Math.PI;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        targetRigYaw = Math.PI + clamp(d, -1.15, 1.15);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        { gpu: cameraGpu, x: CAM_X, y: 0.14, z: CAM_Z, yaw: rigYaw, scale: 1.45, animMode: 0 },
      ];
      const wastedOffscreen = [];
      for (const p of TOWN_PROPS) {
        const gpu = p.kind === "tower" ? towerGpu : (p.kind === "tree" ? treeGpu : cottageGpu);
        const st = classifyProp(p);
        const isVis = st === "VISIBLE";
        if (!cullOn) {
          // Culling OFF: render EVERY mesh solid, tint off-screen / occluded ones crimson to show GPU waste!
          meshes.push({
            gpu, x: p.x, y: 0.0, z: p.z, yaw: p.yaw, scale: p.s, animMode: 0,
            tint: isVis ? [1, 1, 1, 0] : [1.0, 0.24, 0.32, 0.45],
          });
          if (!isVis) wastedOffscreen.push(p);
        } else if (isVis) {
          meshes.push({ gpu, x: p.x, y: 0.0, z: p.z, yaw: p.yaw, scale: p.s, animMode: 0 });
        } else if (xrayGhosts) {
          meshes.push({
            gpu, x: p.x, y: 0.0, z: p.z, yaw: p.yaw, scale: p.s, animMode: 0,
            alpha: st === "OCCLUDED" ? 0.22 : 0.14,
            tint: st === "OCCLUDED" ? [0.76, 0.36, 1.0, 0.90] : [0.36, 0.46, 0.72, 0.85],
          });
        }
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          // Glowing 62° 3D Camera Frustum Cone + Bright Left/Right Frustum Edge Beams!
          fx.coneXZ(CAM_X, 0.10, CAM_Z, rigYaw, FOV_HALF, FRUSTUM_RANGE, [0.20, 0.92, 0.72, 0.65]);
          for (const sgn of [-1, 1]) {
            const a = rigYaw + sgn * FOV_HALF;
            fx.beam(CAM_X, 0.68, CAM_Z, CAM_X + Math.sin(a) * FRUSTUM_RANGE, 0.12, CAM_Z + Math.cos(a) * FRUSTUM_RANGE, 0.11, [0.22, 0.96, 1.0, 0.85], 0);
          }

          // Occlusion Shadow Wedge cast behind the Castle Wall from the Camera!
          const aL = Math.atan2(WALL_X0 - CAM_X, WALL_Z - CAM_Z);
          const aR = Math.atan2(WALL_X1 - CAM_X, WALL_Z - CAM_Z);
          const farL = [WALL_X0 + Math.sin(aL) * 4.5, WALL_Z + Math.cos(aL) * 4.5];
          const farR = [WALL_X1 + Math.sin(aR) * 4.5, WALL_Z + Math.cos(aR) * 4.5];
          fx.beam(WALL_X0, 0.14, WALL_Z, farL[0], 0.14, farL[1], 0.12, [0.72, 0.32, 1.0, 0.85], 4);
          fx.beam(WALL_X1, 0.14, WALL_Z, farR[0], 0.14, farR[1], 0.12, [0.72, 0.32, 1.0, 0.85], 4);
          fx.quadXZ(WALL_X0, WALL_X1, 0.08, -4.9, WALL_Z - 0.35, cullOn ? [0.68, 0.30, 1.0, 0.42] : [1.0, 0.24, 0.32, 0.38]);

          // When Culling OFF, highlight wasted off-screen draw calls with crimson floor boxes!
          if (!cullOn) {
            for (const p of wastedOffscreen) {
              fx.ringXZ(p.x, 0.09, p.z, 0.68, [1.0, 0.24, 0.32, 0.78]);
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { cullOn, xrayGhosts, total: TOWN_PROPS.length, drawnCount, frustumCulled, occludedCulled };
    },
  };
}
