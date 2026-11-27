// Entry #41: Formation Movement & Squad Slots — Playable 3D Fortress Gate March!
// 10 Knights follow a Virtual Commander Anchor carrying 10 dynamic Formation Slots (Wedge / Phalanx / Line)
// that compress smoothly into a disciplined 2-wide column through a narrow Fortress Gate — vs Naive Single-Point
// Seek where all 10 units fight for the exact same coordinate and gridlock at the gate!
import { clamp, smoothstep } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const HALF_X = 7.4;
const HALF_Z = 4.6;
const WALL_HALF_X = 0.52;
const GATE_HALF_Z = 1.15; // Narrow central fortress gate (z = -1.15 .. +1.15)
const UNIT_COUNT = 10;
const UNIT_RAD = 0.34;

const SHAPES = ["Wedge", "Phalanx", "Line"];

// Compute local formation offset (right, back) relative to Commander Anchor facing +forward
function getFormationOffset(shape, i) {
  if (shape === "Wedge") {
    // 10-knight V-arrowhead: rows of 1, 2, 3, 4
    const rows = [
      [0, 0.9],
      [-0.85, 0.1], [0.85, 0.1],
      [-1.70, -0.75], [0.0, -0.75], [1.70, -0.75],
      [-2.55, -1.60], [-0.85, -1.60], [0.85, -1.60], [2.55, -1.60],
    ];
    return { r: rows[i][0], b: rows[i][1] };
  }
  if (shape === "Phalanx") {
    // Disciplined 5-wide x 2-deep shield wall
    const col = i % 5;
    const row = Math.floor(i / 5);
    return { r: (col - 2) * 0.96, b: (0.5 - row) * 1.02 };
  }
  // Broad 10-wide skirmish Line (dramatically compresses through the 2.3m gate!)
  return { r: (i - 4.5) * 0.80, b: 0.0 };
}

// Clean 2-wide column offsets used while threading the narrow Fortress Gate!
function getColumnOffset(i) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return { r: col === 0 ? -0.44 : 0.44, b: 1.55 - row * 0.86 };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.03, 0.05, 0.14],
    skyMid: [0.08, 0.12, 0.26],
    skyBot: [0.16, 0.18, 0.32],
    lightDir: [0.36, 0.86, 0.34],
    ambLow: [0.12, 0.15, 0.26],
    ambHigh: [0.38, 0.44, 0.62],
    orthoHalf: 12.2,
    maxWorldVerts: 28000,
    maxFxVerts: 18000,
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Wide Stone Fortress Courtyard split vertically at x=0 by Fortified Gate Wall!
  const wBuf = [];
  // West & East stone plazas
  pushBox(wBuf, -HALF_X - 0.5, HALF_X + 0.5, -0.52, 0.0, -HALF_Z - 0.5, HALF_Z + 0.5, [0.26, 0.30, 0.42], 0);
  // Subtle courtyard trim curb
  pushBox(wBuf, -HALF_X - 0.5, HALF_X + 0.5, 0.0, 0.42, -HALF_Z - 0.5, -HALF_Z, [0.36, 0.40, 0.52], 1);
  pushBox(wBuf, -HALF_X - 0.5, HALF_X + 0.5, 0.0, 0.42, HALF_Z, HALF_Z + 0.5, [0.36, 0.40, 0.52], 1);
  pushBox(wBuf, -HALF_X - 0.5, -HALF_X, 0.0, 0.42, -HALF_Z, HALF_Z, [0.36, 0.40, 0.52], 1);
  pushBox(wBuf, HALF_X, HALF_X + 0.5, 0.0, 0.42, -HALF_Z, HALF_Z, [0.36, 0.40, 0.52], 1);

  // Fortified Central Fortress Wall (North & South wings leaving narrow Gate at z = -1.15..+1.15!)
  const wallH = 2.15;
  // North wing
  pushBox(wBuf, -WALL_HALF_X, WALL_HALF_X, 0.0, wallH, -HALF_Z, -GATE_HALF_Z, [0.50, 0.54, 0.64], 1);
  // South wing
  pushBox(wBuf, -WALL_HALF_X, WALL_HALF_X, 0.0, wallH, GATE_HALF_Z, HALF_Z, [0.50, 0.54, 0.64], 1);

  // Twin Gatehouse Bastion Towers flanking the narrow opening!
  for (const sgn of [-1, 1]) {
    const z0 = sgn < 0 ? -GATE_HALF_Z - 0.72 : GATE_HALF_Z;
    const z1 = sgn < 0 ? -GATE_HALF_Z : GATE_HALF_Z + 0.72;
    pushBox(wBuf, -0.76, 0.76, 0.0, 2.75, z0, z1, [0.58, 0.62, 0.74], 1);
    pushBox(wBuf, -0.84, 0.84, 2.75, 2.96, z0 - 0.06, z1 + 0.06, [0.42, 0.48, 0.64], 1);
    // Glowing cobalt-cyan royal beacon braziers atop gate towers
    pushBox(wBuf, -0.22, 0.22, 2.96, 3.22, (z0 + z1) * 0.5 - 0.22, (z0 + z1) * 0.5 + 0.22, [0.24, 0.86, 1.0], 2);
  }
  // Crenellations along wall tops
  for (let z = -4.2; z <= -2.1; z += 0.95) {
    pushBox(wBuf, -0.56, 0.56, wallH, wallH + 0.34, z, z + 0.44, [0.42, 0.46, 0.58], 1);
    pushBox(wBuf, -0.56, 0.56, wallH, wallH + 0.34, -z - 0.44, -z, [0.42, 0.46, 0.58], 1);
  }
  // Safety chevron floor strip inside the narrow gate chokepoint
  pushBox(wBuf, -WALL_HALF_X - 0.06, WALL_HALF_X + 0.06, 0.0, 0.025, -GATE_HALF_Z + 0.04, GATE_HALF_Z - 0.04, [0.95, 0.7, 0.14], 5);

  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.04, pitch: 0.78, dist: 18.8, targetX: 0.0, targetY: 0.3, targetZ: 0.2, fovDeg: 40 };

  let time = 0;
  let formationOn = true;  // ON: Commander Anchor + Dynamic Gate-Compressing Slots | OFF: Single-Point Jammed Blob!
  let shapeIdx = 0;
  let autoDemo = true;
  let userInteracted = false;

  const anchor = { x: -3.2, z: 0.0, yaw: Math.PI * 0.5, waypoints: [], compress: 0 };
  const goal = { x: 4.6, z: 0.0 };
  let units = [];
  let autoHoldT = 0;
  let jammedUnits = 0;
  let totalJams = 0;
  let gateCrossings = 0;
  let lastAnchorSide = -1;

  let bannerText = "";
  let bannerColor = "#38bdf8";
  let bannerTimer = 0;
  function setBanner(t, c = "#38bdf8", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  // Plan clean gate-aligned waypoints when crossing from West Plaza to East Plaza (or vice versa)
  function commandSquad(tx, tz) {
    goal.x = clamp(tx, -HALF_X + 1.1, HALF_X - 1.1);
    goal.z = clamp(tz, -HALF_Z + 0.9, HALF_Z - 0.9);
    // Avoid placing goal literally inside the fortress wall
    if (Math.abs(goal.x) < WALL_HALF_X + 0.7 && Math.abs(goal.z) > GATE_HALF_Z - 0.4) {
      goal.z = clamp(goal.z, -GATE_HALF_Z + 0.45, GATE_HALF_Z - 0.45);
    }

    const crossing = (anchor.x < -0.2 && goal.x > 0.2) || (anchor.x > 0.2 && goal.x < -0.2);
    if (crossing) {
      const sgn = Math.sign(goal.x - anchor.x);
      anchor.waypoints = [
        { x: -sgn * 2.1, z: 0.0 },
        { x:  sgn * 2.1, z: 0.0 },
        { x: goal.x, z: goal.z },
      ];
    } else {
      anchor.waypoints = [{ x: goal.x, z: goal.z }];
    }
  }

  function computeSlotWorld(i) {
    const shape = SHAPES[shapeIdx];
    const full = getFormationOffset(shape, i);
    const col = getColumnOffset(i);

    // Smooth dynamic gate compression: full formation -> 2-wide column whenever anchor is near the gate (|x| < 1.8..2.6)!
    const k = anchor.compress;
    const localR = full.r + (col.r - full.r) * k;
    const localB = full.b + (col.b - full.b) * k;

    const fwdX = Math.sin(anchor.yaw), fwdZ = Math.cos(anchor.yaw);
    const rightX = Math.cos(anchor.yaw), rightZ = -Math.sin(anchor.yaw);
    let sx = anchor.x + rightX * localR + fwdX * localB;
    let sz = anchor.z + rightZ * localR + fwdZ * localB;

    sx = clamp(sx, -HALF_X + 0.55, HALF_X - 0.55);
    sz = clamp(sz, -HALF_Z + 0.55, HALF_Z - 0.55);
    // Keep individual slot cleanly inside gate corridor if slot itself is within wall thickness
    if (Math.abs(sx) < WALL_HALF_X + 0.48 && Math.abs(sz) > GATE_HALF_Z - 0.36) {
      sz = clamp(sz, -GATE_HALF_Z + 0.36, GATE_HALF_Z - 0.36);
    }
    return { x: sx, z: sz };
  }

  function resolveWallCollision(u) {
    let hitWall = false;
    u.x = clamp(u.x, -HALF_X + UNIT_RAD, HALF_X - UNIT_RAD);
    u.z = clamp(u.z, -HALF_Z + UNIT_RAD, HALF_Z - UNIT_RAD);

    // Test against North & South fortress walls (x in [-WALL_HALF_X, WALL_HALF_X], |z| >= GATE_HALF_Z)
    const wxMin = -WALL_HALF_X - UNIT_RAD;
    const wxMax =  WALL_HALF_X + UNIT_RAD;
    if (u.x > wxMin && u.x < wxMax && Math.abs(u.z) > GATE_HALF_Z - UNIT_RAD) {
      hitWall = true;
      const penX = Math.min(u.x - wxMin, wxMax - u.x);
      const penZ = Math.abs(u.z) - (GATE_HALF_Z - UNIT_RAD);
      if (penX < penZ) {
        u.x = u.x < 0 ? wxMin : wxMax;
        u.vx *= 0.15;
      } else {
        u.z = Math.sign(u.z) * (GATE_HALF_Z - UNIT_RAD);
        u.vz *= 0.15;
      }
    }
    return hitWall;
  }

  function reset() {
    time = 0;
    formationOn = true;
    shapeIdx = 0;
    autoDemo = true;
    autoHoldT = 0;
    jammedUnits = 0;
    totalJams = 0;
    gateCrossings = 0;
    bannerTimer = 0;

    anchor.x = -3.4; anchor.z = 0.0; anchor.yaw = Math.PI * 0.5; anchor.compress = 0;
    lastAnchorSide = -1;
    commandSquad(4.5, 0.0);

    units = [];
    for (let i = 0; i < UNIT_COUNT; i++) {
      const slot = computeSlotWorld(i);
      units.push({
        x: slot.x, z: slot.z,
        vx: 1.8, vz: 0.0,
        yaw: Math.PI * 0.5,
        walkPhase: i * 0.7,
        speedNorm: 0.8,
        jammed: false,
        jamFlash: 0,
        jamCd: 0,
        slotX: slot.x, slotZ: slot.z,
      });
    }
  }
  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // 1. Advance Virtual Commander Anchor along gate-aligned waypoints
    if (anchor.waypoints.length > 0) {
      const wp = anchor.waypoints[0];
      const dx = wp.x - anchor.x, dz = wp.z - anchor.z;
      const d = Math.hypot(dx, dz);
      const aSpeed = 2.95;
      if (d < 0.25) {
        anchor.waypoints.shift();
      } else {
        anchor.x += (dx / d) * aSpeed * dt;
        anchor.z += (dz / d) * aSpeed * dt;
        // Smooth angular turn toward heading
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - anchor.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        anchor.yaw += clamp(diff, -5.2 * dt, 5.2 * dt);
      }
    }

    // Detect crossing fortress gate centerline
    const curSide = anchor.x >= 0 ? 1 : -1;
    if (curSide !== lastAnchorSide) {
      lastAnchorSide = curSide;
      gateCrossings++;
    }

    // Smooth dynamic gate compression as commander enters |x| < 2.55 (peaks to 1.0 inside |x| < 1.35)
    const targetCompress = smoothstep(2.75, 1.35, Math.abs(anchor.x));
    anchor.compress += (targetCompress - anchor.compress) * clamp(dt * 6.5, 0, 1);

    // Auto-demo: march smoothly back & forth through the fortress gate!
    if (autoDemo) {
      if (anchor.waypoints.length === 0) {
        autoHoldT += dt;
        if (autoHoldT > 2.2) {
          autoHoldT = 0;
          const nextX = goal.x > 0 ? -4.5 : 4.5;
          commandSquad(nextX, 0.0);
        }
      }
    }

    // 2. Update all 10 Knights!
    let curJammed = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.jamFlash > 0) u.jamFlash = Math.max(0, u.jamFlash - dt * 2.5);
      if (u.jamCd > 0) u.jamCd = Math.max(0, u.jamCd - dt);

      let tx, tz;
      if (formationOn) {
        const sl = computeSlotWorld(i);
        u.slotX = sl.x; u.slotZ = sl.z;
        tx = sl.x; tz = sl.z;
      } else {
        // Single-Target Blob OFF: ALL 10 knights blindly charge the EXACT same (goal.x, goal.z)!
        // If on opposite side of wall from goal, pull toward gate entrance (0, 0) in one chaotic herd!
        const sameSide = (u.x < 0 && goal.x < 0) || (u.x > 0 && goal.x > 0);
        if (!sameSide && Math.abs(u.x) > 0.4) {
          tx = Math.sign(goal.x) * 0.4;
          tz = 0.0;
        } else {
          tx = goal.x;
          tz = goal.z;
        }
      }

      const dx = tx - u.x, dz = tz - u.z;
      const dist = Math.hypot(dx, dz);
      let ax = 0, az = 0;

      if (formationOn) {
        // Crisp damped PD tracking to assigned personal Formation Slot (zero fighting at destination!)
        const desiredSp = Math.min(4.6, dist * 4.4);
        const dvx = dist > 0.03 ? (dx / dist) * desiredSp : 0;
        const dvz = dist > 0.03 ? (dz / dist) * desiredSp : 0;
        ax += (dvx - u.vx) * 7.5;
        az += (dvz - u.vz) * 7.5;
      } else {
        // Naive full-throttle seek toward the shared single point!
        if (dist > 0.04) {
          ax += (dx / dist) * 14.5;
          az += (dz / dist) * 14.5;
        }
        ax -= u.vx * 2.2;
        az -= u.vz * 2.2;
      }

      // Unit-to-unit separation (gentle courtesy in Formation mode; chaotic shoving pileup in Single-Point mode!)
      let closePeers = 0;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const px = u.x - units[j].x, pz = u.z - units[j].z;
        const pd = Math.hypot(px, pz);
        const sepRad = formationOn ? 0.66 : 0.86;
        if (pd < sepRad && pd > 0.001) {
          if (pd < 0.72) closePeers++;
          const push = ((sepRad - pd) / sepRad) * (formationOn ? 9.5 : 26.0);
          ax += (px / pd) * push;
          az += (pz / pd) * push;
        }
      }

      u.vx += ax * dt;
      u.vz += az * dt;
      const sp = Math.hypot(u.vx, u.vz);
      const maxSp = formationOn ? 4.8 : 4.2;
      if (sp > maxSp) { u.vx = (u.vx / sp) * maxSp; u.vz = (u.vz / sp) * maxSp; }

      u.x += u.vx * dt;
      u.z += u.vz * dt;
      const hitWall = resolveWallCollision(u);

      // Detect gridlock / pileup jamming!
      const isJam = !formationOn && ((hitWall && closePeers >= 1) || (closePeers >= 2 && dist > 0.25));
      u.jammed = isJam;
      if (isJam) {
        curJammed++;
        u.jamFlash = Math.max(u.jamFlash, 0.85);
        if (u.jamCd <= 0) {
          u.jamCd = 0.85;
          totalJams++;
          if (userInteracted) audio?.inputIgnored?.();
        }
      }

      const finalSp = Math.hypot(u.vx, u.vz);
      if (finalSp > 0.22) {
        u.yaw = Math.atan2(u.vx, u.vz);
        u.walkPhase += dt * (4.5 + finalSp * 2.4);
        u.speedNorm = clamp(finalSp / 3.8, 0, 1);
      } else {
        if (formationOn) {
          // Face commander heading smartly when holding formation!
          let diff = anchor.yaw - u.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          u.yaw += clamp(diff, -5.0 * dt, 5.0 * dt);
        }
        u.speedNorm = Math.max(0, u.speedNorm - dt * 5);
      }
    }
    jammedUnits = curJammed;
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const shape = SHAPES[shapeIdx];

    if (viewProj) {
      // Narrow Gate callout
      const gp = projectToScreen(viewProj, 0.0, 3.35, -1.5, cssW, cssH);
      if (gp) {
        const gTxt = formationOn && anchor.compress > 0.35
          ? (isPl ? "BRAMA 2.3m · KOMPRESJA DO KOLUMNY ✓" : "2.3m GATE · AUTO-COMPRESSING TO COLUMN ✓")
          : (isPl ? "WĄSKA BRAMA TWIERDZY (2.3m)" : "NARROW FORTRESS GATE (2.3m)");
        drawWorldPill(ctx, gp.x, gp.y, gTxt, formationOn ? "#38bdf8" : "#f87171", cssW, cssH, isCompact ? 8.2 : 9.2);
      }

      // Squad Anchor / Blob status pill
      const avgX = formationOn ? anchor.x : units.reduce((s, u) => s + u.x, 0) / units.length;
      const avgZ = formationOn ? anchor.z : units.reduce((s, u) => s + u.z, 0) / units.length;
      const sp = projectToScreen(viewProj, avgX, 1.65, avgZ, cssW, cssH);
      if (sp) {
        const txt = formationOn
          ? (isPl ? `SZYK ${shape.toUpperCase()} · 0 ZATORÓW ✓` : `${shape.toUpperCase()} SLOTS · 0 JAMS ✓`)
          : (isPl ? `JEDEN PUNKT CELU: ZATOR W BRAMIE! ✗` : `SINGLE TARGET POINT: JAMMED BLOB! ✗`);
        drawWorldPill(ctx, sp.x, sp.y, txt, formationOn ? "#4ade80" : "#f87171", cssW, cssH, isCompact ? 8.8 : 9.8);
      }

      // Goal target marker pill
      const tp = projectToScreen(viewProj, goal.x, 1.15, goal.z, cssW, cssH);
      if (tp) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && tp.y < 235) ? Math.min(tp.x, cssW - 375) : tp.x;
        drawWorldPill(ctx, safeX, tp.y, isPl ? "CEL MARSZU (KLIK)" : "MARCH TARGET (CLICK)", "#facc15", cssW, cssH, isCompact ? 8.2 : 9.0);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${formationOn ? `${shape.toUpperCase()} SLOTS · 0 Jams` : `BLOB JAM · ${jammedUnits}/10 Stuck`}`,
          formationOn ? "#38bdf8" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 328, panelH = 162, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 30, 0.90)";
        ctx.strokeStyle = formationOn ? "rgba(56, 189, 248, 0.86)" : "rgba(248, 113, 113, 0.86)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = formationOn ? "#38bdf8" : "#f87171";
        ctx.fillText(
          formationOn
            ? (isPl ? `SLOTY FORMACJI · ${shape.toUpperCase()} (10 RYCERZY)` : `FORMATION SLOTS · ${shape.toUpperCase()} (10 KNIGHTS)`)
            : (isPl ? "JEDEN PUNKT CELU · CHAOTYCZNY KOREK! ✗" : "SINGLE TARGET POINT · GATE GRIDLOCK! ✗"),
          px + 12, py + 21, bw
        );

        const compPct = Math.round(anchor.compress * 100);
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = formationOn ? "#0284c7" : "#ef4444";
        const barFrac = formationOn ? Math.max(0.12, anchor.compress) : clamp(jammedUnits / 8, 0.15, 1.0);
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw * barFrac, 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          formationOn
            ? (isPl ? `KOMPRESJA BRAMOWA: ${compPct}% (2-SZEREG)` : `GATE COLUMN COMPRESS: ${compPct}% (2-WIDE)`)
            : (isPl ? `ZABLOKOWANE JEDNOSTKI: ${jammedUnits} / ${UNIT_COUNT}` : `GRIDLOCKED KNIGHTS: ${jammedUnits} / ${UNIT_COUNT}`),
          px + 18, py + 45.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = totalJams === 0 || formationOn ? "#86efac" : "#fca5a5";
        ctx.fillText(
          isPl
            ? `Zatory: ${formationOn ? 0 : totalJams} · Przejścia bramy: ${gateCrossings}`
            : `Gate Jams: ${formationOn ? 0 : totalJams} · Gate Crossings: ${gateCrossings}`,
          px + 12, py + 76, bw
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl ? "Cyjan = Kotwica Dowódcy + 10 Slotów" : "Cyan = Commander Anchor + 10 Assigned Slots",
          px + 12, py + 98, bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "Klik = Marsz Oddziału · V = Wedge/Phalanx/Line" : "Click = March Squad · V = Wedge/Phalanx/Line",
          px + 12, py + 124, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "T = Sloty Formacji / Jeden Punkt (Korek!)" : "T = Formation Slots / Single-Point Blob",
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
      const shape = SHAPES[shapeIdx];
      return [
        {
          id: "toggle-formation",
          label: formationOn
            ? (pl ? "Sloty Formacji: WŁ [T]" : "Formation Slots: ON [T]")
            : (pl ? "Jeden Punkt (Korek) [T]" : "Single-Point Blob [T]"),
          pressed: formationOn,
        },
        {
          id: "cycle-shape",
          label: pl ? `Szyk: ${shape} [V]` : `Shape: ${shape} [V]`,
          pressed: false,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-formation") {
        formationOn = !formationOn;
        if (formationOn) totalJams = 0;
        // Command a fresh cross-gate march so the user sees the gate behavior immediately!
        const nextX = anchor.x > 0 ? -4.5 : 4.5;
        commandSquad(nextX, 0.0);
        audio?.ruleSwitch?.(formationOn);
        setBanner(
          formationOn
            ? `FORMATION SLOTS ON (${SHAPES[shapeIdx].toUpperCase()}): CLEAN 2-WIDE GATE COMPRESSION!`
            : "SINGLE TARGET POINT OFF: ALL 10 KNIGHTS FIGHT FOR ONE PIXEL → GATE GRIDLOCK!",
          formationOn ? "#38bdf8" : "#f87171",
          2.2
        );
      } else if (id === "cycle-shape") {
        shapeIdx = (shapeIdx + 1) % SHAPES.length;
        if (!formationOn) formationOn = true;
        audio?.coinPickup?.();
        setBanner(`SQUAD FORMATION SWITCHED TO ${SHAPES[shapeIdx].toUpperCase()}!`, "#38bdf8", 1.8);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-formation");
      else if (code === "KeyV") this.onAction("cycle-shape");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        autoDemo = false;
        commandSquad(world[0], world[2]);
        audio?.coinPickup?.();
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = units.map((u, idx) => ({
        gpu: runnerGpu, x: u.x, y: 0.02, z: u.z, yaw: u.yaw,
        animA: u.walkPhase, animB: u.speedNorm, scale: 0.78, animMode: 2,
        tint: u.jamFlash > 0.08
          ? [1.0, 0.22, 0.28, 0.85 * u.jamFlash]
          : (idx === 0 && formationOn ? [0.98, 0.84, 0.22, 0.45] : [0.34, 0.72, 1.0, 0.36]),
      }));

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // March goal beacon
          fx.ringXZ(goal.x, 0.06, goal.z, 0.72 + 0.10 * Math.sin(time * 5), [1.0, 0.82, 0.20, 0.90]);
          fx.billboard(goal.x, 0.82, goal.z, 0.26, basis.right, basis.up, [1.0, 0.84, 0.24, 0.88], 2);

          if (formationOn) {
            // Virtual Commander Anchor + Heading Vector!
            fx.ringXZ(anchor.x, 0.09, anchor.z, 0.56, [0.16, 0.96, 1.0, 0.92]);
            fx.beam(
              anchor.x, 0.14, anchor.z,
              anchor.x + Math.sin(anchor.yaw) * 1.45, 0.14, anchor.z + Math.cos(anchor.yaw) * 1.45,
              0.12, [0.20, 0.96, 1.0, 0.88], 0
            );
            // Commander planned path across gate
            let px = anchor.x, pz = anchor.z;
            for (const wp of anchor.waypoints) {
              fx.beam(px, 0.08, pz, wp.x, 0.08, wp.z, 0.07, [0.22, 0.86, 1.0, 0.44], 4);
              px = wp.x; pz = wp.z;
            }
            // All 10 glowing cyan Formation Slots + tether lines!
            for (const u of units) {
              fx.ringXZ(u.slotX, 0.07, u.slotZ, 0.38, [0.18, 0.92, 1.0, 0.86]);
              if (Math.hypot(u.slotX - u.x, u.slotZ - u.z) > 0.22) {
                fx.beam(u.x, 0.10, u.z, u.slotX, 0.10, u.slotZ, 0.055, [0.22, 0.94, 1.0, 0.52], 0);
              }
            }
          } else {
            // Chaotic Single-Target mode: crimson seek lines from all 10 knights fighting for one spot!
            for (const u of units) {
              fx.beam(u.x, 0.14, u.z, goal.x, 0.14, goal.z, 0.05, [1.0, 0.24, 0.34, 0.34], 4);
              if (u.jamFlash > 0.1) {
                fx.ringXZ(u.x, 0.08, u.z, 0.44, [1.0, 0.20, 0.28, 0.90 * u.jamFlash]);
              }
            }
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        formationOn,
        shape: SHAPES[shapeIdx],
        jammedUnits,
        totalJams: formationOn ? 0 : totalJams,
        gateCrossings,
        anchorX: Number(anchor.x.toFixed(2)),
        anchorZ: Number(anchor.z.toFixed(2)),
        compress: Number(anchor.compress.toFixed(2)),
      };
    },
  };
}
