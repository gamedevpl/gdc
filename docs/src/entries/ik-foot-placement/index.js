// Entry #23: Inverse Kinematics (IK) Foot Placement — Playable 3D Staircase & Ruins!
// Real analytical 2-Bone Law-of-Cosines IK: raycasts down from each foot to the exact stair tread height,
// lowers the pelvis, and bends hip & knee joints so boots lock flush on steps instead of clipping & floating!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getIkMeshes } from "../../ik-mesh.js";

const L1 = 0.52; // Thigh length (matches Blender build_ik_limb)
const L2 = 0.52; // Shin length

// Stepped Ancient Stone Temple Staircase profile along X (-6.4 .. +6.4)
const STEPS = [
  { x0: -6.6, x1: -4.2, h: 0.00 },
  { x0: -4.2, x1: -3.2, h: 0.34 },
  { x0: -3.2, x1: -2.2, h: 0.68 },
  { x0: -2.2, x1: -1.2, h: 1.02 },
  { x0: -1.2, x1:  1.2, h: 1.36 }, // Top temple landing
  { x0:  1.2, x1:  2.2, h: 1.02 },
  { x0:  2.2, x1:  3.2, h: 0.68 },
  { x0:  3.2, x1:  4.2, h: 0.34 },
  { x0:  4.2, x1:  6.6, h: 0.00 },
];

function groundHeightAt(x) {
  for (const s of STEPS) {
    if (x >= s.x0 && x <= s.x1) return s.h;
  }
  return 0.0;
}

// Analytical 2-Bone IK in (fwd, up) local plane: returns exact hipPitch, shinPitch & knee offset!
function solveTwoBoneIK(tx, ty) {
  const dist = clamp(Math.hypot(tx, ty), 0.16, L1 + L2 - 0.015);
  const base = Math.atan2(tx, -ty);
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const alpha = Math.acos(cosA);
  // Knees bend FORWARD (+fwd)
  const theta1 = base + alpha;
  const kneeFwd = L1 * Math.sin(theta1);
  const kneeUp = -L1 * Math.cos(theta1);
  const sf = tx - kneeFwd;
  const sd = kneeUp - ty;
  return {
    hipPitch: -theta1,
    shinPitch: Math.atan2(-sf, sd),
    kneeFwd,
    kneeUp,
  };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.04, 0.09, 0.18],
    skyMid: [0.10, 0.22, 0.34],
    skyBot: [0.20, 0.34, 0.42],
    lightDir: [0.35, 0.86, 0.42],
    ambLow: [0.16, 0.20, 0.26],
    ambHigh: [0.46, 0.52, 0.60],
    orthoHalf: 9.5,
  });
  const m = getIkMeshes();
  const torsoGpu = studio.uploadMesh(m.torso);
  const limbGpu = studio.uploadMesh(m.limb);
  const footGpu = studio.uploadMesh(m.foot);

  // Build Sunlit Ancient Stepped Stone Staircase + Back Temple Columns
  const wBuf = [];
  pushBox(wBuf, -7.2, 7.2, -0.5, 0.0, -3.6, 3.6, [0.34, 0.38, 0.44], 0);
  for (const s of STEPS) {
    if (s.h > 0.01) {
      pushBox(wBuf, s.x0, s.x1, 0.0, s.h, -1.65, 1.65, [0.70, 0.66, 0.58], 1);
      // Crisp bright tread cap so every stair edge reads unmistakably!
      pushBox(wBuf, s.x0 - 0.02, s.x1 + 0.02, s.h - 0.07, s.h + 0.01, -1.70, 1.70, [0.80, 0.76, 0.68], 0);
    }
  }
  // Background stone colonnade pillars framing the staircase
  for (const px of [-5.2, -2.6, 0.0, 2.6, 5.2]) {
    pushBox(wBuf, px - 0.32, px + 0.32, 0.0, 3.4, -3.1, -2.4, [0.56, 0.54, 0.50], 1);
    pushBox(wBuf, px - 0.42, px + 0.42, 3.3, 3.55, -3.2, -2.3, [0.68, 0.64, 0.58], 1);
  }
  studio.setWorldData(wBuf);

  // Crisp side-profile hero angle framing the center & right stairs clearly away from the bottom-left card!
  const defaultCam = { yaw: 0.0, pitch: 0.25, dist: 10.6, targetX: 0.55, targetY: 1.45, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let ikOn = true;       // ON: Analytical 2-Bone Foot IK + Pelvis Drop | OFF: Rigid canned animation!
  let showRays = true;
  let freezePose = false;
  let autoWalk = true;
  let userInteracted = false;

  const walker = {
    x: 2.22,     // Starts right on the steep right-hand steps cleanly in the open stage!
    dir: -1,     // -1 = West (-X, climbing UP onto the top landing!)
    phase: 0.9,
    pelvisY: 1.4,
    pelvisDrop: 0,
    leftErr: 0,
    rightErr: 0,
  };

  let bannerText = "";
  let bannerColor = "#2dd4bf";
  let bannerTimer = 0;
  function setBanner(t, c = "#2dd4bf", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0;
    freezePose = false;
    autoWalk = true;
    walker.x = 2.22;
    walker.dir = -1;
    walker.phase = Math.PI * 0.5;
    walker.pelvisY = groundHeightAt(walker.x) + 0.96;
    bannerTimer = 0;
  }
  reset();

  // Compute Left & Right leg geometry cleanly (shared by update, render & HUD!)
  function computeLegs() {
    const yaw = walker.dir >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    const fwdX = walker.dir >= 0 ? 1 : -1;
    const stride = 0.46;
    // Left & Right foot forward offsets along staircase X
    const lfFwd = Math.sin(walker.phase) * stride;
    const rfFwd = Math.sin(walker.phase + Math.PI) * stride;
    const lfLift = Math.max(0, Math.cos(walker.phase)) * 0.24;
    const rfLift = Math.max(0, Math.cos(walker.phase + Math.PI)) * 0.24;

    const lFootX = walker.x + fwdX * lfFwd;
    const rFootX = walker.x + fwdX * rfFwd;
    const lGround = groundHeightAt(lFootX);
    const rGround = groundHeightAt(rFootX);
    const centerGround = groundHeightAt(walker.x);

    // IK Mode: drops pelvis to reach the LOWER planted foot cleanly, plants each boot flush on its exact step!
    // Rigid Mode: ignores stair heights completely (pelvis fixed to center step, feet clip inside stone or float in air!)
    const targetPelvisY = ikOn
      ? Math.min(lGround, rGround) + 0.94
      : centerGround + 0.98;
    const pelvisY = lerp(walker.pelvisY, targetPelvisY, 0.35);

    const legs = [
      { side: -1, zOff: -0.18 * fwdX, fwd: lfFwd, lift: lfLift, footX: lFootX, groundY: lGround },
      { side:  1, zOff:  0.18 * fwdX, fwd: rfFwd, lift: rfLift, footX: rFootX, groundY: rGround },
    ];

    const solved = [];
    for (const lg of legs) {
      const hipX = walker.x;
      const hipY = pelvisY;
      const hipZ = lg.zOff;
      if (ikOn) {
        const footY = lg.groundY + lg.lift;
        const tx = lg.fwd;
        const ty = footY - hipY + 0.04; // ankle sits 4cm above boot sole
        const ik = solveTwoBoneIK(tx, ty);
        const kneeX = hipX + fwdX * ik.kneeFwd;
        const kneeY = hipY + ik.kneeUp;
        solved.push({
          ...lg, yaw, hipX, hipY, hipZ,
          kneeX, kneeY, kneeZ: hipZ,
          footY, hipPitch: ik.hipPitch, shinPitch: ik.shinPitch,
          err: 0,
        });
      } else {
        // Rigid canned walk angles relative to centerGround — NO stair awareness!
        const footY = centerGround + lg.lift;
        const ik = solveTwoBoneIK(lg.fwd, footY - hipY + 0.04);
        const kneeX = hipX + fwdX * ik.kneeFwd;
        const kneeY = hipY + ik.kneeUp;
        solved.push({
          ...lg, yaw, hipX, hipY, hipZ,
          kneeX, kneeY, kneeZ: hipZ,
          footY, hipPitch: ik.hipPitch, shinPitch: ik.shinPitch,
          err: footY - lg.groundY, // negative = CLIPPING INSIDE STONE, positive = FLOATING IN AIR!
        });
      }
    }
    return { yaw, pelvisY, centerGround, drop: Math.max(0, centerGround + 0.98 - pelvisY), legs: solved };
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoWalk = false; freezePose = false; userInteracted = true;
      const mv = (right ? 1 : 0) - (left ? 1 : 0);
      walker.dir = mv >= 0 ? 1 : -1;
      walker.x = clamp(walker.x + mv * 1.95 * dt, -5.6, 5.6);
      walker.phase += dt * 4.4;
    } else if (!freezePose && autoWalk) {
      walker.x += walker.dir * 1.45 * dt;
      walker.phase += dt * 3.6;
      if (walker.x > 4.4) { walker.x = 4.4; walker.dir = -1; }
      if (walker.x < -4.4) { walker.x = -4.4; walker.dir = 1; }
    }

    const pose = computeLegs();
    walker.pelvisY = pose.pelvisY;
    walker.pelvisDrop = pose.drop;
    walker.leftErr = pose.legs[0].err;
    walker.rightErr = pose.legs[1].err;
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const pose = computeLegs();

    if (viewProj) {
      // Label 1: Overhead Walker IK Status
      const tp = projectToScreen(viewProj, walker.x, pose.pelvisY + 1.38, 0.0, cssW, cssH);
      if (tp) {
        const maxClip = Math.max(Math.abs(walker.leftErr), Math.abs(walker.rightErr));
        const txt = ikOn
          ? (isPl ? `IK 2-KOŚCI: STOPY NA SCHODACH ✓ (BIODRA -${Math.round(pose.drop * 100)}cm)` : `2-BONE FOOT IK LOCKED ✓ (PELVIS -${Math.round(pose.drop * 100)}cm)`)
          : (maxClip > 0.10
              ? (isPl ? "BRAK IK: BUTY W BETONIE I W POWIETRZU! ✗" : "NO IK: CLIPPING IN STONE & FLOATING! ✗")
              : (isPl ? "SZTYWNA ANIMACJA (BRAK IK) ✗" : "RIGID CANNED WALK (NO IK) ✗"));
        drawWorldPill(ctx, tp.x, tp.y, txt, ikOn ? "#2dd4bf" : "#f87171", cssW, cssH, isCompact ? 9 : 10.5);
      }

      // Label 2: Specific Foot Error / Lock Callouts when straddling stairs!
      for (const lg of pose.legs) {
        if (!ikOn && Math.abs(lg.err) > 0.14) {
          const fp = projectToScreen(viewProj, lg.footX, Math.max(lg.footY, lg.groundY) + 0.25, lg.hipZ, cssW, cssH);
          if (fp) {
            const txt = lg.err < 0
              ? (isPl ? "BUT WBIŁ SIĘ W SCHODEK! ✗" : "FOOT CLIPPED INTO STEP! ✗")
              : (isPl ? "STOPA LEWITUJE W POWIETRZU! ✗" : "FOOT FLOATING IN AIR! ✗");
            drawWorldPill(ctx, fp.x, fp.y + 18, txt, "#f87171", cssW, cssH, isCompact ? 8.5 : 9.5);
          }
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const maxErrCm = Math.round(Math.max(Math.abs(walker.leftErr), Math.abs(walker.rightErr)) * 100);
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${ikOn ? "2-BONE IK: ON" : "NO IK (RIGID)"} · Err ${maxErrCm}cm · Drop ${Math.round(pose.drop * 100)}cm`,
          ikOn ? "#2dd4bf" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 158, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 16, 26, 0.88)";
        ctx.strokeStyle = ikOn ? "rgba(45, 212, 191, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = ikOn ? "#2dd4bf" : "#f87171";
        ctx.fillText(ikOn ? "2-BONE ANALYTICAL IK · LAW OF COSINES" : "RIGID KEYFRAME WALK · IGNORES TERRAIN!", px + 12, py + 21, bw);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = ikOn ? "#14b8a6" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, ikOn ? bw : Math.max(18, bw * clamp(1 - maxErrCm / 50, 0.12, 1)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(ikOn ? "FOOT GROUND CONTACT: 100% FLUSH ✓" : `GROUND CLIP/FLOAT ERROR: ${maxErrCm} cm ✗`, px + 18, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#5eead4";
        ctx.fillText(isPl ? `Obniżenie bioder (Pelvis Drop): -${Math.round(pose.drop * 100)} cm` : `Dynamic Pelvis Drop: -${Math.round(pose.drop * 100)} cm`, px + 12, py + 76, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Błąd stóp (L/P): ${Math.round(walker.leftErr * 100)}cm / ${Math.round(walker.rightErr * 100)}cm` : `Foot Offset Error (L/R): ${Math.round(walker.leftErr * 100)}cm / ${Math.round(walker.rightErr * 100)}cm`, px + 12, py + 98, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "V = Zatrzymaj na stopniach (porównaj [T]!)" : "V = Freeze on Stairs (flip [T] to compare!)", px + 12, py + 122, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "A/D = Idź po schodach · T = IK · X = Raycasty" : "A/D = Climb Stairs · T = IK · X = Raycasts", px + 12, py + 144, bw);
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
        { id: "toggle-ik", label: ikOn ? (pl ? "Foot IK: WŁ [T]" : "Foot IK: ON [T]") : (pl ? "Sztywna Animacja [T]" : "Rigid No-IK [T]"), pressed: ikOn },
        { id: "freeze", label: freezePose ? (pl ? "Wznów Chód [V]" : "Resume Walk [V]") : (pl ? "Pauza na Stopniach [V]" : "Freeze on Steps [V]"), pressed: freezePose },
        { id: "rays", label: showRays ? (pl ? "Raycasty: WŁ [X]" : "Raycasts: ON [X]") : (pl ? "Raycasty: WYŁ [X]" : "Raycasts: OFF [X]"), pressed: showRays },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-ik") {
        ikOn = !ikOn;
        audio?.ruleSwitch?.(ikOn);
        setBanner(
          ikOn
            ? "2-BONE IK ON: PELVIS DROPS & KNEES BEND TO LOCK FEET ON STAIRS!"
            : "IK OFF: CANNED WALK CLIPS INTO STONE & FLOATS IN MID-AIR!",
          ikOn ? "#2dd4bf" : "#f87171",
          2.0
        );
      } else if (id === "freeze") {
        freezePose = !freezePose;
        if (freezePose) {
          // Park straddling right-hand steps x=+1.2..+3.2 cleanly in open stage away from bottom-left card!
          walker.x = 2.22;
          walker.dir = -1;
          walker.phase = Math.PI * 0.5;
          setBanner("FROZEN ON 2 STEPS — PRESS [T] FOR IK ON vs OFF!", "#fde047", 2.0);
        }
        audio?.ruleSwitch?.(freezePose);
      } else if (id === "rays") {
        showRays = !showRays;
        audio?.ruleSwitch?.(showRays);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-ik");
      else if (code === "KeyV") this.onAction("freeze");
      else if (code === "KeyX") this.onAction("rays");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoWalk = false; freezePose = true;
        walker.x = clamp(world[0], -5.0, 5.0);
        walker.phase = Math.PI * 0.5;
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const pose = computeLegs();
      const meshes = [
        { gpu: torsoGpu, x: walker.x, y: pose.pelvisY, z: 0.0, yaw: pose.yaw, scale: 1.0, animMode: 0 },
      ];
      for (const lg of pose.legs) {
        const badFoot = !ikOn && Math.abs(lg.err) > 0.10;
        const fTint = badFoot ? [1.0, 0.22, 0.30, 0.80] : [1, 1, 1, 0];
        // Thigh (Hip -> Knee) using exact pitch animMode 5!
        meshes.push({ gpu: limbGpu, x: lg.hipX, y: lg.hipY, z: lg.hipZ, yaw: lg.yaw, animA: lg.hipPitch, scale: 1.0, pivot: [0, 0, 0], animMode: 5 });
        // Shin (Knee -> Ankle) using exact pitch animMode 5!
        meshes.push({ gpu: limbGpu, x: lg.kneeX, y: lg.kneeY, z: lg.kneeZ, yaw: lg.yaw, animA: lg.shinPitch, scale: 1.0, pivot: [0, 0, 0], animMode: 5 });
        // Boot Foot planted at footY!
        meshes.push({ gpu: footGpu, x: lg.footX, y: lg.footY, z: lg.hipZ, yaw: lg.yaw, scale: 1.0, animMode: 0, tint: fTint });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          if (showRays) {
            for (const lg of pose.legs) {
              const bad = !ikOn && Math.abs(lg.err) > 0.10;
              const col = bad ? [1.0, 0.22, 0.30, 0.90] : [0.16, 0.96, 0.86, 0.85];
              // Vertical Foot Raycast beam from Hip height straight down to the exact stone tread!
              fx.beam(lg.footX, pose.pelvisY, lg.hipZ, lg.footX, lg.groundY + 0.03, lg.hipZ, 0.06, col, 4);
              fx.ringXZ(lg.footX, lg.groundY + 0.03, lg.hipZ, 0.34, col);
              if (bad) {
                // Draw bright error vector connecting where foot IS vs where ground ACTUALLY is!
                fx.beam(lg.footX, lg.footY, lg.hipZ, lg.footX, lg.groundY, lg.hipZ, 0.14, [1.0, 0.20, 0.28, 0.95], 0);
              }
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        ikOn, freezePose,
        pelvisDropCm: Math.round(walker.pelvisDrop * 100),
        maxFootErrCm: Math.round(Math.max(Math.abs(walker.leftErr), Math.abs(walker.rightErr)) * 100),
      };
    },
  };
}
