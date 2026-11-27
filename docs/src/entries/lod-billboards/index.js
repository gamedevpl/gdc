// Entry #25: Level of Detail (LOD) & Impostors — Playable 3D Alpine Valley Mesh Swapper!
// Real 3-tier Blender meshes (LOD0=964 tris -> LOD1=148 tris -> LOD2=24 tris -> LOD3=2-tri Billboard):
// As the game camera drives down the valley, distant keeps seamlessly drop 97% of their triangles!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLodMeshes } from "../../lod-mesh.js";
import { getCullMeshes } from "../../cull-mesh.js";

// 18 Alpine Keeps lining both sides of the valley highway (from z=+2.8 deep into z=-11.2!)
const KEEPS = [
  { x: -2.9, z:  2.6, yaw:  0.3 }, { x:  2.9, z:  2.6, yaw: -0.3 },
  { x: -5.4, z:  1.4, yaw:  0.5 }, { x:  5.4, z:  1.4, yaw: -0.5 },
  { x: -2.9, z: -0.4, yaw:  0.2 }, { x:  2.9, z: -0.4, yaw: -0.2 },
  { x: -5.6, z: -1.8, yaw:  0.4 }, { x:  5.6, z: -1.8, yaw: -0.4 },
  { x: -2.9, z: -3.4, yaw:  0.1 }, { x:  2.9, z: -3.4, yaw: -0.1 },
  { x: -5.6, z: -4.8, yaw:  0.3 }, { x:  5.6, z: -4.8, yaw: -0.3 },
  { x: -2.9, z: -6.4, yaw:  0.2 }, { x:  2.9, z: -6.4, yaw: -0.2 },
  { x: -5.6, z: -7.8, yaw:  0.4 }, { x:  5.6, z: -7.8, yaw: -0.4 },
  { x: -2.9, z: -9.4, yaw:  0.1 }, { x:  2.9, z: -9.4, yaw: -0.1 },
];

const LOD0_DIST = 5.0;
const LOD1_DIST = 8.4;
const LOD2_DIST = 11.8;

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.06, 0.12, 0.26],
    skyMid: [0.16, 0.28, 0.44],
    skyBot: [0.30, 0.42, 0.56],
    lightDir: [0.40, 0.85, 0.34],
    ambLow: [0.16, 0.20, 0.28],
    ambHigh: [0.46, 0.52, 0.62],
    orthoHalf: 14.5,
    lightTarget: [0, 0, -2.5],
  });
  const lm = getLodMeshes();
  const cm = getCullMeshes();
  const lodGpus = [studio.uploadMesh(lm.lod0), studio.uploadMesh(lm.lod1), studio.uploadMesh(lm.lod2)];
  const lodTris = [lm.lod0.triCount, lm.lod1.triCount, lm.lod2.triCount, 2]; // [964, 148, 24, 2]
  const camGpu = studio.uploadMesh(cm.camera);

  // Sunlit Alpine Valley Meadow + Stone Highway stretching into the horizon!
  const wBuf = [];
  pushBox(wBuf, -8.5, 8.5, -0.5, 0.0, -12.0, 6.8, [0.32, 0.58, 0.34], 4);
  pushBox(wBuf, -1.5, 1.5, 0.0, 0.05, -11.8, 6.6, [0.56, 0.54, 0.50], 0);
  // Road center lane markers
  for (let z = -10.5; z <= 5.5; z += 2.2) {
    pushBox(wBuf, -0.10, 0.10, 0.05, 0.08, z - 0.45, z + 0.45, [0.92, 0.84, 0.44], 4);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.72, dist: 21.5, targetX: 0.0, targetY: 0.6, targetZ: -2.4, fovDeg: 40 };

  let time = 0;
  let lodOn = true;
  let colorCode = true;
  let autoDrive = true;
  let userInteracted = false;

  let rigZ = 4.6;
  let targetRigZ = 4.6;
  let activeTris = 0;
  const maxTris = KEEPS.length * lodTris[0];
  let tierCounts = [0, 0, 0, 0];

  let bannerText = "";
  let bannerColor = "#a855f7";
  let bannerTimer = 0;
  function setBanner(t, c = "#a855f7", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function getTier(k) {
    if (!lodOn) return 0;
    const d = Math.hypot(k.x, k.z - rigZ);
    if (d < LOD0_DIST) return 0;
    if (d < LOD1_DIST) return 1;
    if (d < LOD2_DIST) return 2;
    return 3; // 2-triangle Billboard Impostor!
  }

  function recomputeStats() {
    tierCounts = [0, 0, 0, 0];
    let tris = 0;
    for (const k of KEEPS) {
      const t = getTier(k);
      tierCounts[t]++;
      tris += lodTris[t];
    }
    activeTris = tris;
  }

  function reset() {
    time = 0;
    autoDrive = true;
    rigZ = 4.6;
    targetRigZ = 4.6;
    bannerTimer = 0;
    recomputeStats();
  }
  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    const fwd = keys?.has("KeyW") || keys?.has("ArrowUp");
    const back = keys?.has("KeyS") || keys?.has("ArrowDown");
    if (fwd || back) {
      autoDrive = false; userInteracted = true;
      targetRigZ = clamp(targetRigZ + ((back ? 1 : 0) - (fwd ? 1 : 0)) * 4.5 * dt, -5.5, 5.8);
    } else if (autoDrive) {
      // Smooth back-and-forth glide showcasing all 4 LOD rings sweeping cleanly down the valley!
      targetRigZ = 2.6 + Math.cos(time * 0.45) * 3.1;
    }
    rigZ = lerp(rigZ, targetRigZ, clamp(dt * 7.5, 0, 1));
    recomputeStats();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Label Camera Rig
      const cp = projectToScreen(viewProj, 0, 1.4, rigZ + 0.4, cssW, cssH);
      if (cp) drawWorldPill(ctx, cp.x, cp.y, isPl ? "KAMERA (W/S = JEDŹ)" : "CAMERA (W/S = DRIVE)", "#38bdf8", cssW, cssH, isCompact ? 9 : 9.5);

      // Show ONE clean representative pill per LOD tier currently on screen!
      const tierMeta = [
        { name: `LOD0 HIGH (${lodTris[0]}t)`, col: "#4ade80" },
        { name: `LOD1 MED (${lodTris[1]}t)`, col: "#38bdf8" },
        { name: `LOD2 LOW (${lodTris[2]}t)`, col: "#fbbf24" },
        { name: `LOD3 IMPOSTOR (2t)`, col: "#f472b6" },
      ];
      const shown = [false, false, false, false];
      for (const k of KEEPS) {
        if (k.x < 0) continue; // Put tier labels cleanly along the right lane so they never collide with bottom-left card!
        const t = getTier(k);
        if (shown[t]) continue;
        shown[t] = true;
        const p = projectToScreen(viewProj, k.x, 3.15, k.z, cssW, cssH);
        if (p) drawWorldPill(ctx, p.x, p.y, tierMeta[t].name, tierMeta[t].col, cssW, cssH, isCompact ? 8.5 : 9.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const savedPct = Math.round(((maxTris - activeTris) / maxTris) * 100);
      const estFps = Math.min(144, Math.round(144 - (activeTris / maxTris) * 112));
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${lodOn ? `LOD -${savedPct}% TRIS` : "NO LOD (100%)"} · ${activeTris.toLocaleString()}t · ~${estFps} FPS`,
          lodOn ? "#a855f7" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 160, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 28, 0.88)";
        ctx.strokeStyle = lodOn ? "rgba(168, 85, 247, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = lodOn ? "#c084fc" : "#f87171";
        ctx.fillText(lodOn ? `DYNAMIC LOD · -${savedPct}% TRIANGLES SAVED` : "NO LOD · ALL 18 KEEPS AT FULL LOD0!", px + 12, py + 21, bw);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = lodOn ? "#22c55e" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, Math.max(10, bw * (activeTris / maxTris)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`GPU TRIS: ${activeTris.toLocaleString()} / ${maxTris.toLocaleString()} (~${estFps} FPS)`, px + 18, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#4ade80";
        ctx.fillText(`LOD0:${tierCounts[0]} (${lodTris[0]}t) · LOD1:${tierCounts[1]} (${lodTris[1]}t)`, px + 12, py + 76, bw);
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(`LOD2:${tierCounts[2]} (${lodTris[2]}t) · Impostor:${tierCounts[3]} (2t)`, px + 12, py + 98, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "W/S = Jedź kamerą · V = Pokaż 4 poziomy" : "W/S = Drive Cam · V = Show All 4 Tiers", px + 12, py + 122, bw);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "T = LOD WŁ/WYŁ · X = Kolory poziomów" : "T = LOD ON/OFF · X = Color-Code Tiers", px + 12, py + 144, bw);
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
        { id: "toggle-lod", label: lodOn ? (pl ? "LOD: WŁ (-75% tris) [T]" : "LOD: ON (-75% tris) [T]") : (pl ? "LOD: WYŁ (Full Poly) [T]" : "LOD: OFF (Full Poly) [T]"), pressed: lodOn },
        { id: "showcase", label: pl ? "Pokaż 4 Poziomy [V]" : "Show All 4 Tiers [V]", pressed: !autoDrive && Math.abs(rigZ - 5.2) < 0.4 },
        { id: "tint", label: colorCode ? (pl ? "Kolory LOD: WŁ [X]" : "LOD Colors: ON [X]") : (pl ? "Kolory LOD: WYŁ [X]" : "LOD Colors: OFF [X]"), pressed: colorCode },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-lod") {
        lodOn = !lodOn;
        audio?.ruleSwitch?.(lodOn);
        recomputeStats();
        setBanner(
          lodOn
            ? `LOD ON: SWAPPING DISTANT KEEPS TO LOW-POLY & BILLBOARDS!`
            : `LOD OFF: DRAWING ALL ${maxTris.toLocaleString()} TRIANGLES EVEN ON HORIZON!`,
          lodOn ? "#c084fc" : "#f87171",
          1.9
        );
      } else if (id === "showcase") {
        autoDrive = false;
        targetRigZ = 5.4;
        audio?.ruleSwitch?.(true);
        setBanner("CAMERA PARKED AT VALLEY ENTRANCE: ALL 4 LOD TIERS VISIBLE!", "#38bdf8", 1.9);
      } else if (id === "tint") {
        colorCode = !colorCode;
        audio?.ruleSwitch?.(colorCode);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-lod");
      else if (code === "KeyV") this.onAction("showcase");
      else if (code === "KeyX") this.onAction("tint");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoDrive = false;
        targetRigZ = clamp(world[2], -5.5, 5.8);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const tierTints = [
        [0.20, 0.96, 0.52, 0.34], // LOD0 Emerald
        [0.18, 0.84, 1.0,  0.40], // LOD1 Cyan
        [1.0,  0.76, 0.16, 0.48], // LOD2 Amber
      ];
      const meshes = [
        { gpu: camGpu, x: 0, y: 0.14, z: rigZ, yaw: Math.PI, scale: 1.4, animMode: 0 },
      ];
      const billboards = [];
      for (const k of KEEPS) {
        const t = getTier(k);
        if (t < 3) {
          meshes.push({
            gpu: lodGpus[t], x: k.x, y: 0.0, z: k.z, yaw: k.yaw, scale: 1.0, animMode: 0,
            tint: colorCode ? tierTints[t] : [1, 1, 1, 0],
          });
        } else {
          billboards.push(k);
        }
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Concentric LOD Distance Threshold Rings around the Camera!
          if (lodOn) {
            fx.ringXZ(0, 0.08, rigZ, LOD0_DIST, [0.22, 0.96, 0.56, 0.55]);
            fx.ringXZ(0, 0.08, rigZ, LOD1_DIST, [0.20, 0.84, 1.0,  0.48]);
            fx.ringXZ(0, 0.08, rigZ, LOD2_DIST, [1.0,  0.76, 0.16, 0.42]);
          }
          // LOD3 Flat 2-Triangle Billboard Impostors on far horizon!
          for (const b of billboards) {
            fx.billboard(b.x, 1.45, b.z, 1.15, basis.right, basis.up, colorCode ? [0.94, 0.28, 0.68, 0.82] : [0.58, 0.64, 0.78, 0.82], 5);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { lodOn, activeTris, maxTris, tierCounts };
    },
  };
}
