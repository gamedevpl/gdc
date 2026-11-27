// Entry #22: Camera Spring Arm & Wall Occlusion — Playable 3D Cutaway Temple Hall!
// Shows why 3rd-person cameras (Zelda, Dark Souls, Fortnite) never clip through dungeon walls or lose sight
// behind columns: a Spring Arm raycast retracts the camera inside the room & occluding pillars fade translucent!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getUtilityMeshes } from "../../utility-mesh.js";
import { getCullMeshes } from "../../cull-mesh.js";

// Cutaway Temple Interior bounds
const ROOM_MIN_X = -5.2;
const ROOM_MAX_X = 4.95; // Solid East Stone Wall sits at x = 5.25!
const ROOM_MIN_Z = -3.15; // Solid North Stone Wall sits at z = -3.45!
const ROOM_MAX_Z = 3.85;

// Ideal Spring Arm Boom vector from Explorer -> Camera (trailing North-East so hugging North/East walls hits walls!)
const BOOM_MAX = 4.55;
const BOOM_DIR_X = 0.28;
const BOOM_DIR_Z = -0.96; // normalized: hypot(0.28, -0.96) = 1.00!

// Two Tall Interior Stone Pillars that can obstruct sightline between Camera Rig & Explorer!
const PILLARS = [
  { x: -1.45, z: 0.45, rad: 0.68, fade: 0 },
  { x: 1.95, z: -0.25, rad: 0.68, fade: 0 },
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.05, 0.06, 0.11],
    skyMid: [0.11, 0.12, 0.20],
    skyBot: [0.18, 0.16, 0.24],
    lightDir: [0.36, 0.86, 0.36],
    ambLow: [0.16, 0.16, 0.22],
    ambHigh: [0.46, 0.46, 0.54],
    orthoHalf: 11.8,
  });
  const um = getUtilityMeshes();
  const cm = getCullMeshes();
  const explorerGpu = studio.uploadMesh(um.camper);
  const cameraGpu = studio.uploadMesh(cm.camera);
  const pillarGpu = studio.uploadMesh(cm.tower);

  // Build Cutaway 3D Ancient Temple Hall: Interior Floor, Thick North & East Walls, Outside Void Deck!
  const wBuf = [];
  // Dark outer void floor (so when Rigid Camera clips OUTSIDE the wall, it visibly hangs in the red-flagged void!)
  pushBox(wBuf, -9.5, 9.5, -0.65, -0.25, -8.5, 6.2, [0.10, 0.11, 0.16], 0);
  // Warm sunlit Temple Hall interior floor
  pushBox(wBuf, -5.6, 5.3, -0.25, 0.0, -3.5, 4.4, [0.68, 0.60, 0.48], 0);
  // Decorative gold carpet runner inside hall
  pushBox(wBuf, -1.2, 1.2, 0.0, 0.03, -3.0, 3.8, [0.74, 0.26, 0.24], 4);
  // THICK NORTH STONE TEMPLE WALL (z = -3.45 .. -4.15)
  pushBox(wBuf, -5.8, 5.95, 0.0, 2.75, -4.15, -3.45, [0.64, 0.58, 0.50], 1);
  pushBox(wBuf, -5.9, 6.05, 2.75, 3.00, -4.22, -3.38, [0.76, 0.70, 0.60], 1);
  // THICK EAST STONE TEMPLE WALL (x = 5.25 .. 5.95)
  pushBox(wBuf, 5.25, 5.95, 0.0, 2.75, -3.45, 4.45, [0.64, 0.58, 0.50], 1);
  pushBox(wBuf, 5.18, 6.02, 2.75, 3.00, -3.45, 4.52, [0.76, 0.70, 0.60], 1);
  // Safety chevron warning line right outside the North wall ("OUTSIDE ROOM / CLIP ZONE")
  pushBox(wBuf, -5.6, 5.8, -0.25, -0.21, -5.0, -4.45, [1, 0.7, 0.1], 5);
  studio.setWorldData(wBuf);

  // Director 3/4 Side-View angled to see BOTH inside the temple hall AND behind the thick North/East walls!
  const defaultCam = { yaw: -0.46, pitch: 0.60, dist: 17.5, targetX: 0.2, targetY: 0.8, targetZ: -0.7, fovDeg: 40 };

  let time = 0;
  let springOn = true; // ON: Spring Arm Raycast + Pillar Occlusion Fade | OFF: Rigid Camera clips behind wall!
  let autoDemo = true;
  let wallHugTimer = 0;
  let userInteracted = false;

  const explorer = { x: -0.4, z: -1.1, yaw: 0.0, walkPhase: 0, speedNorm: 0 };
  const rig = {
    x: 0.0, y: 1.9, z: -3.0,
    idealX: 0.0, idealZ: -5.4,
    armLen: BOOM_MAX,
    clippedWall: false,
    retracted: false,
    occludedPillar: false,
    wallHitDist: BOOM_MAX,
  };

  let bannerText = "";
  let bannerColor = "#eab308";
  let bannerTimer = 0;
  function setBanner(t, c = "#eab308", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  // Exact raycast along Spring Arm from Explorer -> Ideal Camera against North Wall (z=-3.45) & East Wall (x=5.25)
  function raycastBoom(ex, ez) {
    let tHit = BOOM_MAX;
    const pad = 0.44;
    if (BOOM_DIR_Z < -0.001) {
      const tz = (-3.45 + pad - ez) / BOOM_DIR_Z;
      if (tz > 0 && tz < tHit) tHit = tz;
    }
    if (BOOM_DIR_X > 0.001) {
      const tx = (5.25 - pad - ex) / BOOM_DIR_X;
      if (tx > 0 && tx < tHit) tHit = tx;
    }
    return clamp(tHit, 1.05, BOOM_MAX);
  }

  // Distance from point (px, pz) to segment (ax, az)-(bx, bz)
  function segPointDist(ax, az, bx, bz, px, pz) {
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz || 1;
    const t = clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
    return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
  }

  function updateRig(dt, snap = false) {
    rig.idealX = explorer.x + BOOM_DIR_X * BOOM_MAX;
    rig.idealZ = explorer.z + BOOM_DIR_Z * BOOM_MAX;
    rig.wallHitDist = raycastBoom(explorer.x, explorer.z);
    const wantsRetract = rig.wallHitDist < BOOM_MAX - 0.08;

    const targetLen = springOn ? rig.wallHitDist : BOOM_MAX;
    rig.armLen = snap ? targetLen : lerp(rig.armLen, targetLen, clamp(dt * (targetLen < rig.armLen ? 18 : 6.5), 0, 1));
    rig.x = explorer.x + BOOM_DIR_X * rig.armLen;
    rig.z = explorer.z + BOOM_DIR_Z * rig.armLen;
    rig.y = lerp(1.55, 2.15, (rig.armLen - 1.0) / (BOOM_MAX - 1.0));

    rig.retracted = springOn && wantsRetract;
    rig.clippedWall = !springOn && (rig.z < -3.45 || rig.x > 5.25);

    rig.occludedPillar = false;
    for (const p of PILLARS) {
      const d = segPointDist(explorer.x, explorer.z, rig.x, rig.z, p.x, p.z);
      const blocking = d < p.rad + 0.22;
      if (blocking) rig.occludedPillar = true;
      const targetFade = (springOn && blocking) ? 1.0 : 0.0;
      p.fade = snap ? targetFade : lerp(p.fade, targetFade, clamp(dt * 10, 0, 1));
    }
  }

  function reset() {
    time = 0;
    autoDemo = true;
    wallHugTimer = 0;
    explorer.x = -0.35; explorer.z = -1.15; explorer.yaw = 0.0; explorer.walkPhase = 0; explorer.speedNorm = 0;
    bannerTimer = 0;
    updateRig(0.016, true);
  }
  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (wallHugTimer > 0) wallHugTimer = Math.max(0, wallHugTimer - dt);

    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;

    if (mx !== 0 || mz !== 0) {
      autoDemo = false; userInteracted = true; wallHugTimer = 0;
      const l = Math.hypot(mx, mz);
      const nx = clamp(explorer.x + (mx / l) * 4.0 * dt, ROOM_MIN_X, ROOM_MAX_X);
      const nz = clamp(explorer.z + (mz / l) * 4.0 * dt, ROOM_MIN_Z, ROOM_MAX_Z);
      // Simple circular collision around interior pillars
      let ok = true;
      for (const p of PILLARS) if (Math.hypot(nx - p.x, nz - p.z) < p.rad + 0.35) ok = false;
      if (ok) { explorer.x = nx; explorer.z = nz; }
      explorer.yaw = Math.atan2(mx, mz);
      explorer.walkPhase += dt * 11.5;
      explorer.speedNorm = 1.0;
    } else if (wallHugTimer > 0) {
      // Wall-Hug Stress Test: walk flush against the North Stone Wall where ideal camera is 2.2m OUTSIDE the wall!
      const gx = 0.25, gz = -2.35;
      const dx = gx - explorer.x, dz = gz - explorer.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.12) {
        explorer.x += (dx / d) * 4.2 * dt;
        explorer.z += (dz / d) * 4.2 * dt;
        explorer.yaw = Math.atan2(dx, dz);
        explorer.walkPhase += dt * 11.5;
        explorer.speedNorm = 1.0;
      } else {
        explorer.speedNorm = 0.0;
      }
    } else if (autoDemo) {
      // Smooth patrol weaving close to the North/East stone walls AND directly in front of the interior pillars!
      const t = time * 0.58;
      const gx = Math.sin(t) * 3.1;
      const gz = -0.35 + Math.cos(t * 1.35) * 2.15;
      const dx = gx - explorer.x, dz = gz - explorer.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, 3.2 * dt);
        const nx = clamp(explorer.x + (dx / d) * step, ROOM_MIN_X, ROOM_MAX_X);
        const nz = clamp(explorer.z + (dz / d) * step, ROOM_MIN_Z, ROOM_MAX_Z);
        let ok = true;
        for (const p of PILLARS) if (Math.hypot(nx - p.x, nz - p.z) < p.rad + 0.32) ok = false;
        if (ok) { explorer.x = nx; explorer.z = nz; }
        explorer.yaw = Math.atan2(dx, dz);
        explorer.walkPhase += dt * 10.0;
        explorer.speedNorm = 1.0;
      }
    } else {
      explorer.speedNorm = 0.0;
    }

    updateRig(dt, false);
  }

  function drawPipMonitor(ctx, px, py, pw, ph, isPl) {
    // Picture-in-Picture "PLAYER CAM VIEW" mini-screen showing what the player ACTUALLY sees!
    ctx.save();
    ctx.fillStyle = "#0b0f1c";
    ctx.strokeStyle = rig.clippedWall || (!springOn && rig.occludedPillar) ? "#f87171" : "#eab308";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 7); ctx.fill(); ctx.stroke();

    ctx.beginPath(); ctx.roundRect(px + 2, py + 2, pw - 4, ph - 4, 5); ctx.clip();
    if (rig.clippedWall) {
      // Solid brick wall completely blocking the Player's screen!
      ctx.fillStyle = "#473f38";
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = "#2b2520"; ctx.lineWidth = 1.5;
      for (let r = 0; r < 5; r++) {
        const y = py + r * 15;
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
        for (let c = 0; c < 6; c++) {
          const x = px + c * 32 + (r % 2) * 16;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 15); ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(18, 8, 12, 0.78)";
      ctx.fillRect(px + 8, py + ph * 0.5 - 12, pw - 16, 24);
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#fca5a5"; ctx.textAlign = "center";
      ctx.fillText(isPl ? "ZASŁONIĘTE ŚCIANĄ! ✗" : "BLOCKED BY STONE WALL! ✗", px + pw * 0.5, py + ph * 0.5 + 3.5);
    } else {
      // Sunlit temple floor & Explorer visible cleanly in center!
      ctx.fillStyle = "#262336"; ctx.fillRect(px, py, pw, ph * 0.44);
      ctx.fillStyle = "#8a7a62"; ctx.fillRect(px, py + ph * 0.44, pw, ph * 0.56);
      // Explorer silhouette centered cleanly in Player View
      const cx = px + pw * 0.5, cy = py + ph * 0.62;
      const sc = clamp(BOOM_MAX / Math.max(1.2, rig.armLen), 0.9, 1.55);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath(); ctx.roundRect(cx - 8 * sc, cy - 12 * sc, 16 * sc, 18 * sc, 4); ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(cx, cy - 17 * sc, 6.5 * sc, 0, Math.PI * 2); ctx.fill();

      // If a Pillar stands between Camera and Explorer: draw solid blocker when OFF vs translucent ghost when ON!
      if (rig.occludedPillar) {
        ctx.fillStyle = springOn ? "rgba(250, 204, 21, 0.18)" : "#78716c";
        ctx.fillRect(cx - 22, py + 4, 44, ph - 8);
        if (!springOn) {
          ctx.font = "800 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = "#fca5a5"; ctx.textAlign = "center";
          ctx.fillText(isPl ? "FILAR ZASŁANIA! ✗" : "BLOCKED BY PILLAR! ✗", cx, py + ph - 10);
        }
      }
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#fde047"; ctx.textAlign = "left";
      ctx.fillText(isPl ? "PODGLĄD KAMERY GRACZA ✓" : "PLAYER CAM VIEW: CLEAR ✓", px + 8, py + 13);
    }
    ctx.restore();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // 1. 3D Camera Rig Status Pill
      const cp = projectToScreen(viewProj, rig.x, rig.y + 1.05, rig.z, cssW, cssH);
      if (cp) {
        let txt, col;
        if (rig.clippedWall) {
          txt = isPl ? "KAMERA ZA ŚCIANĄ! (CLIP!) ✗" : "CAMERA CLIPPED BEHIND WALL! ✗";
          col = "#f87171";
        } else if (rig.retracted) {
          txt = isPl ? `SPRING ARM SKRÓCONY (${rig.armLen.toFixed(1)}m) ✓` : `SPRING ARM RETRACTED (${rig.armLen.toFixed(1)}m) ✓`;
          col = "#facc15";
        } else {
          txt = isPl ? `KAMERA GRY (${rig.armLen.toFixed(1)}m)` : `GAME CAMERA (${rig.armLen.toFixed(1)}m)`;
          col = "#38bdf8";
        }
        drawWorldPill(ctx, cp.x, cp.y, txt, col, cssW, cssH, isCompact ? 9 : 10);
      }

      // 2. Occluding Pillar Fade Pill
      for (const p of PILLARS) {
        if (p.fade > 0.25) {
          const pp = projectToScreen(viewProj, p.x, 2.55, p.z, cssW, cssH);
          if (pp) {
            drawWorldPill(ctx, pp.x, pp.y, isPl ? "FILAR PRZEŹROCZYSTY (FADE) ✓" : "PILLAR OCCLUSION FADE ✓", "#4ade80", cssW, cssH, isCompact ? 9 : 10);
          }
        }
      }

      // 3. Explorer Label
      const ep = projectToScreen(viewProj, explorer.x, 2.1, explorer.z, cssW, cssH);
      if (ep) {
        const dy = cp && Math.abs(ep.x - cp.x) < 130 && Math.abs(ep.y - cp.y) < 30 ? 24 : 0;
        drawWorldPill(ctx, ep.x, ep.y + dy, isPl ? "GRACZ (WASD)" : "PLAYER (WASD)", "#f8fafc", cssW, cssH, isCompact ? 9 : 9.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${springOn ? `SPRING ${rig.armLen.toFixed(1)}m` : (rig.clippedWall ? "CLIPPED WALL ✗" : "RIGID 4.6m")} · ${rig.occludedPillar ? (springOn ? "FADE ✓" : "BLOCKED ✗") : "CLEAR"}`,
          rig.clippedWall ? "#f87171" : "#eab308",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 204, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(12, 13, 24, 0.90)";
        ctx.strokeStyle = rig.clippedWall ? "rgba(248, 113, 113, 0.84)" : "rgba(234, 179, 8, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = rig.clippedWall ? "#f87171" : "#facc15";
        ctx.fillText(springOn ? `SPRING ARM RAYCAST · ${rig.armLen.toFixed(2)}m / ${BOOM_MAX.toFixed(1)}m` : "RIGID BOOM · IGNORES WALLS & PILLARS!", px + 12, py + 21, panelW - 24);

        // Live Player Camera Mini-Monitor!
        drawPipMonitor(ctx, px + 12, py + 32, panelW - 24, 72, isPl);

        const bw = panelW - 24;
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = rig.clippedWall ? "#fca5a5" : "#4ade80";
        ctx.fillText(
          rig.clippedWall
            ? (isPl ? "Status: KAMERA WYPADŁA ZA ŚCIANĘ! ✗" : "Status: CAMERA CLIPPED OUTSIDE WALL! ✗")
            : (rig.retracted
                ? (isPl ? "Status: Ramię skrócone przed ścianą ✓" : "Status: Boom retracted inside room ✓")
                : (isPl ? "Status: Pełna długość ramienia ✓" : "Status: Full arm clearance ✓")),
          px + 12, py + 126, bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Przezroczystość filarów: ${springOn ? "AKTYWNA ✓" : "BRAK ✗"}` : `Pillar Occlusion Fade: ${springOn ? "ACTIVE ✓" : "OFF ✗"}`, px + 12, py + 148, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "WASD=Chodź · V=Test Ściany · T=Spring/Sztywna" : "WASD=Walk · V=Wall-Hug · T=Spring/Rigid", px + 12, py + 174, bw);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "Zielona = Spring Arm · Przerywana = Idealna" : "Green/Gold = Active · Dashed = Ideal Boom", px + 12, py + 192, bw);
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
        { id: "toggle-spring", label: springOn ? (pl ? "Spring Arm + Fade: WŁ [T]" : "Spring Arm + Fade: ON [T]") : (pl ? "Sztywna Kamera (Clip!) [T]" : "Rigid Camera (Clips!) [T]"), pressed: springOn },
        { id: "wall-hug", label: pl ? "Test Przy Ścianie [V]" : "Wall-Hug Test [V]", pressed: wallHugTimer > 0 },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-spring") {
        springOn = !springOn;
        audio?.ruleSwitch?.(springOn);
        setBanner(
          springOn
            ? "SPRING ARM ON: RAYCAST RETRACTS CAMERA & FADES BLOCKING PILLARS!"
            : "RIGID CAMERA OFF: CAMERA CLIPS STRAIGHT OUTSIDE STONE WALLS!",
          springOn ? "#facc15" : "#f87171",
          2.0
        );
      } else if (id === "wall-hug") {
        wallHugTimer = 3.5;
        audio?.ruleSwitch?.(true);
        setBanner("WALL-HUG TEST: WALKING FLUSH AGAINST NORTH TEMPLE WALL!", "#facc15", 1.9);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-spring");
      else if (code === "KeyV") this.onAction("wall-hug");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoDemo = false; wallHugTimer = 0;
        const nx = clamp(world[0], ROOM_MIN_X, ROOM_MAX_X);
        const nz = clamp(world[2], ROOM_MIN_Z, ROOM_MAX_Z);
        let ok = true;
        for (const p of PILLARS) if (Math.hypot(nx - p.x, nz - p.z) < p.rad + 0.35) ok = false;
        if (ok) { explorer.x = nx; explorer.z = nz; }
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const rigLookYaw = Math.atan2(explorer.x - rig.x, explorer.z - rig.z);
      const meshes = [
        { gpu: explorerGpu, x: explorer.x, y: 0.03, z: explorer.z, yaw: explorer.yaw, animA: explorer.walkPhase, animB: explorer.speedNorm, scale: 1.06, animMode: 2 },
        {
          gpu: cameraGpu, x: rig.x, y: rig.y - 0.56, z: rig.z, yaw: rigLookYaw, scale: 1.25, animMode: 0,
          tint: rig.clippedWall ? [1.0, 0.20, 0.28, 0.72] : (rig.retracted ? [1.0, 0.84, 0.16, 0.42] : [1, 1, 1, 0]),
        },
      ];
      for (const p of PILLARS) {
        const a = lerp(1.0, 0.24, p.fade);
        meshes.push({
          gpu: pillarGpu, x: p.x, y: 0.0, z: p.z, yaw: 0, scale: 1.18, animMode: 0,
          alpha: a,
          tint: p.fade > 0.1 ? [0.22, 0.96, 0.62, p.fade * 0.75] : [1, 1, 1, 0],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          // Dashed Ideal Boom showing full uncompressed camera arm length!
          fx.beam(explorer.x, 1.15, explorer.z, rig.idealX, 2.15, rig.idealZ, 0.08, [0.95, 0.96, 1.0, 0.42], 4);
          // Active Spring Arm Beam from Explorer -> Actual 3D Camera Rig!
          const armCol = rig.clippedWall ? [1.0, 0.22, 0.30, 0.92] : (rig.retracted ? [1.0, 0.84, 0.16, 0.94] : [0.22, 0.96, 0.68, 0.88]);
          fx.beam(explorer.x, 1.15, explorer.z, rig.x, rig.y, rig.z, 0.15, armCol, 0);
          // Subtle FOV sightline cone from Camera Rig looking back toward Explorer!
          fx.coneXZ(rig.x, 0.12, rig.z, rigLookYaw, 0.38, Math.max(1.4, rig.armLen + 0.8), rig.clippedWall ? [1.0, 0.22, 0.30, 0.48] : [0.20, 0.92, 0.98, 0.42]);
          // Wall impact collision sphere ring when Spring Arm retracts!
          if (rig.retracted || rig.clippedWall) {
            const hx = explorer.x + BOOM_DIR_X * rig.wallHitDist;
            const hz = explorer.z + BOOM_DIR_Z * rig.wallHitDist;
            fx.ringXZ(hx, 0.12, hz, 0.68, rig.clippedWall ? [1.0, 0.22, 0.30, 0.88] : [1.0, 0.84, 0.16, 0.88]);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { springOn, armLen: Number(rig.armLen.toFixed(2)), boomMax: BOOM_MAX, retracted: rig.retracted, clippedWall: rig.clippedWall, occludedPillar: rig.occludedPillar };
    },
  };
}
