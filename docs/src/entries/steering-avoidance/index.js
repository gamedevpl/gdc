// Entry #29: Steering Behaviors & Obstacle Avoidance — Playable 3D Canyon Slalom Squadron!
// Shows Craig Reynolds' classic Raycast Whisker Feelers (-26°, 0°, +26°): 6 hover-skiffs feel sandstone
// pillars ahead and carve smoothly around them — vs Naive Seek-Only that slams head-first into every rock!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getSkiffMeshes } from "../../skiff-mesh.js";

const ARENA_X = 7.4;
const ARENA_Z = 4.8;
const WHISKER_LEN = 2.65;

// 9 Tall Terracotta Canyon Pillars creating a genuine slalom gauntlet!
const PILLARS = [
  { x: -3.2, z: -2.0, r: 0.78 },
  { x: -3.0, z:  1.8, r: 0.78 },
  { x: -0.2, z: -2.6, r: 0.82 },
  { x:  0.0, z:  0.0, r: 0.90 },
  { x:  0.2, z:  2.7, r: 0.80 },
  { x:  3.0, z: -1.8, r: 0.78 },
  { x:  3.2, z:  1.9, r: 0.78 },
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.12, 0.14, 0.24],
    skyMid: [0.32, 0.24, 0.26],
    skyBot: [0.54, 0.34, 0.24],
    lightDir: [0.42, 0.84, 0.34],
    ambLow: [0.22, 0.16, 0.14],
    ambHigh: [0.54, 0.44, 0.38],
    orthoHalf: 11.8,
  });
  const m = getSkiffMeshes();
  const skiffGpu = studio.uploadMesh(m.skiff);

  // Build Sunlit Red-Rock Desert Canyon Floor + 7 Sandstone Slalom Pillars!
  const wBuf = [];
  pushBox(wBuf, -ARENA_X - 0.4, ARENA_X + 0.4, -0.45, 0.0, -ARENA_Z - 0.4, ARENA_Z + 0.4, [0.76, 0.58, 0.38], 4);
  // Canyon rim walls
  pushBox(wBuf, -ARENA_X - 0.4, ARENA_X + 0.4, 0.0, 0.55, -ARENA_Z - 0.4, -ARENA_Z, [0.58, 0.34, 0.22], 1);
  pushBox(wBuf, -ARENA_X - 0.4, ARENA_X + 0.4, 0.0, 0.55, ARENA_Z, ARENA_Z + 0.4, [0.58, 0.34, 0.22], 1);
  for (const p of PILLARS) {
    const hs = p.r * 0.76;
    pushBox(wBuf, p.x - hs, p.x + hs, 0.0, 2.35, p.z - hs, p.z + hs, [0.74, 0.38, 0.24], 1);
    pushBox(wBuf, p.x - hs * 1.12, p.x + hs * 1.12, 2.35, 2.60, p.z - hs * 1.12, p.z + hs * 1.12, [0.84, 0.52, 0.32], 1);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.86, dist: 17.6, targetX: 0.0, targetY: 0.4, targetZ: 0.1, fovDeg: 40 };

  let time = 0;
  let avoidOn = true;   // ON: 3-Whisker Raycast Avoidance | OFF: Naive Seek-Only (slams into pillars!)
  let showRays = true;
  let userInteracted = false;

  const beacon = { x: 5.6, z: 0.0, side: 1, hopT: 0 };
  let racers = [];
  let sparks = [];
  let crashes = 0;
  let arrivals = 0;

  let bannerText = "";
  let bannerColor = "#f97316";
  let bannerTimer = 0;
  function setBanner(t, c = "#f97316", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function spawnSparks(x, y, z, r, g, b, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.4;
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.0 + Math.random() * 2.0, vz: Math.sin(a) * sp, r, g, b, size: 0.15, life: 0.40, maxLife: 0.40 });
    }
  }

  // Exact ray-circle intersection distance against all Sandstone Pillars!
  function castWhisker(ox, oz, dx, dz, maxLen) {
    let bestT = maxLen;
    let hitPillar = null;
    for (const p of PILLARS) {
      const fx = ox - p.x, fz = oz - p.z;
      const rad = p.r + 0.32;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - rad * rad;
      const disc = b * b - 4 * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) * 0.5;
        if (t > 0.05 && t < bestT) { bestT = t; hitPillar = p; }
      }
    }
    return { dist: bestT, hit: hitPillar };
  }

  function reset() {
    time = 0; crashes = 0; arrivals = 0; sparks = [];
    beacon.x = 5.6; beacon.z = 0.0; beacon.side = 1; beacon.hopT = 0;
    racers = [];
    for (let i = 0; i < 6; i++) {
      const z = -2.6 + i * 1.04;
      racers.push({
        x: -5.6 + (i % 2) * 0.7, z,
        vx: 3.6, vz: 0.0, yaw: Math.PI * 0.5,
        crashFlash: 0, crashCd: 0,
        whiskers: [],
      });
    }
    bannerTimer = 0;
  }
  reset();

  function flipBeacon({ silent = false } = {}) {
    beacon.side *= -1;
    beacon.x = beacon.side * 5.6;
    beacon.z = (beacon.side > 0 ? 0.5 : -0.5);
    beacon.hopT = 0;
    if (!silent) audio?.ruleSwitch?.(true);
    if (!silent) setBanner("BEACON FLIPPED ACROSS CANYON — WATCH WHISKERS CARVE PAST PILLARS!", "#fb923c", 1.8);
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    beacon.hopT += dt;
    if (beacon.hopT > 5.4) flipBeacon({ silent: true });

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.2 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }

    for (let i = 0; i < racers.length; i++) {
      const r = racers[i];
      if (r.crashFlash > 0) r.crashFlash = Math.max(0, r.crashFlash - dt * 2.4);
      if (r.crashCd > 0) r.crashCd = Math.max(0, r.crashCd - dt);

      // 1. Seek vector toward Golden Beacon
      const toX = beacon.x - r.x, toZ = beacon.z - r.z;
      const toD = Math.hypot(toX, toZ) || 1;
      if (toD < 1.15) {
        arrivals++;
        // Flip beacon once the pack arrives cleanly!
        if (beacon.hopT > 1.8) flipBeacon({ silent: true });
      }
      let ax = (toX / toD) * 7.8;
      let az = (toZ / toD) * 7.8;

      // Mild separation between squadron racers
      for (let j = 0; j < racers.length; j++) {
        if (i === j) continue;
        const dx = r.x - racers[j].x, dz = r.z - racers[j].z;
        const d = Math.hypot(dx, dz);
        if (d < 1.15 && d > 0.01) {
          ax += (dx / d) * (1.15 - d) * 6.5;
          az += (dz / d) * (1.15 - d) * 6.5;
        }
      }

      // 2. Cast 3 Raycast Whiskers (-26°, 0°, +26°)
      r.whiskers = [];
      const baseYaw = Math.atan2(r.vx, r.vz);
      const angles = [-0.46, 0.0, 0.46];
      for (let k = 0; k < 3; k++) {
        const wa = baseYaw + angles[k];
        const wdx = Math.sin(wa), wdz = Math.cos(wa);
        const wLen = k === 1 ? WHISKER_LEN : WHISKER_LEN * 0.85;
        const res = castWhisker(r.x, r.z, wdx, wdz, wLen);
        r.whiskers.push({ ex: r.x + wdx * res.dist, ez: r.z + wdz * res.dist, hit: !!res.hit });

        if (avoidOn && res.hit) {
          // Strong smooth lateral avoidance force pushing away from the touched Sandstone Pillar!
          const urgency = 1.0 - res.dist / wLen;
          const awayX = (r.x + wdx * res.dist) - res.hit.x;
          const awayZ = (r.z + wdz * res.dist) - res.hit.z;
          const al = Math.hypot(awayX, awayZ) || 1;
          const push = (14.5 + urgency * 22.0);
          ax += (awayX / al) * push;
          az += (awayZ / al) * push;
          // Also add slight tangential slide so center whisker never deadlocks head-on!
          const sideSign = (r.z >= res.hit.z) ? 1 : -1;
          ax += -wdz * sideSign * push * 0.45;
          az +=  wdx * sideSign * push * 0.45;
        }
      }

      // 3. Integrate velocity & resolve rock collisions
      r.vx += ax * dt;
      r.vz += az * dt;
      const sp = Math.hypot(r.vx, r.vz);
      const maxSp = 4.6;
      if (sp > maxSp) { r.vx = (r.vx / sp) * maxSp; r.vz = (r.vz / sp) * maxSp; }

      r.x = clamp(r.x + r.vx * dt, -ARENA_X + 0.55, ARENA_X - 0.55);
      r.z = clamp(r.z + r.vz * dt, -ARENA_Z + 0.55, ARENA_Z - 0.55);

      for (const p of PILLARS) {
        const dx = r.x - p.x, dz = r.z - p.z;
        const d = Math.hypot(dx, dz);
        const minD = p.r + 0.36;
        if (d < minD && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          r.x = p.x + nx * minD;
          r.z = p.z + nz * minD;
          // In Seek-Only OFF mode, crashing kills momentum & leaves racers visibly grinding stuck!
          r.vx *= 0.25; r.vz *= 0.25;
          if (r.crashCd <= 0) {
            r.crashCd = 0.65;
            r.crashFlash = 1.0;
            crashes++;
            spawnSparks(r.x, 0.5, r.z, 1.0, 0.36, 0.16, 10);
            if (userInteracted) audio?.carBump?.();
          }
        }
      }
      if (Math.hypot(r.vx, r.vz) > 0.2) r.yaw = Math.atan2(r.vx, r.vz);
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Golden Beacon pill
      const bp = projectToScreen(viewProj, beacon.x, 1.55, beacon.z, cssW, cssH);
      if (bp) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && bp.y < 235) ? Math.min(bp.x, cssW - 390) : bp.x;
        drawWorldPill(ctx, safeX, bp.y, isPl ? "CEL (KLIK = PRZESTAW)" : "GOAL BEACON (CLICK TO MOVE)", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Hero Racer #0 status pill!
      const lead = racers[2] || racers[0];
      const rp = projectToScreen(viewProj, lead.x, 1.45, lead.z, cssW, cssH);
      if (rp) {
        const txt = avoidOn
          ? (isPl ? "WĄSY RAYCAST: PŁYNNY SLALOM ✓" : "RAYCAST WHISKERS: SMOOTH AVOID ✓")
          : (isPl ? "TYLKO SEEK: ZDERZA SIĘ Z FILARAMI! ✗" : "SEEK-ONLY: SLAMMING INTO ROCKS! ✗");
        drawWorldPill(ctx, rp.x, rp.y, txt, avoidOn ? "#4ade80" : "#f87171", cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${avoidOn ? "WHISKERS: ON" : "SEEK ONLY (BLIND)"} · Crashes: ${crashes}`,
          avoidOn ? "#f97316" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 154, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(14, 12, 22, 0.90)";
        ctx.strokeStyle = avoidOn ? "rgba(249, 115, 22, 0.84)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = avoidOn ? "#fb923c" : "#f87171";
        ctx.fillText(avoidOn ? "STEERING · 3-WHISKER AVOIDANCE" : "NAIVE SEEK ONLY · BLIND TO ROCKS!", px + 12, py + 21, bw);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = crashes === 0 ? "#4ade80" : "#fca5a5";
        ctx.fillText(isPl ? `Zderzenia z filarami: ${crashes} · Przeloty: ${arrivals}` : `Pillar Crashes: ${crashes} · Beacon Runs: ${arrivals}`, px + 12, py + 50, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Cyjan = Czysto · Pomarańcz = Unik boczny!" : "Cyan = Clear Ray · Amber = Avoid Steer!", px + 12, py + 76, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "Klik = Przenieś Cel · V = Przerzuć Cel" : "Click = Move Beacon · V = Flip Across Canyon", px + 12, py + 104, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "T = Wąsy Uniku / Ślepy Seek · X = Promienie" : "T = Whiskers / Blind Seek · X = Rays", px + 12, py + 130, bw);
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
        { id: "toggle-avoid", label: avoidOn ? (pl ? "Wąsy Uniku: WŁ [T]" : "Whisker Avoid: ON [T]") : (pl ? "Ślepy Seek (Bum!) [T]" : "Blind Seek (Crashes!) [T]"), pressed: avoidOn },
        { id: "flip", label: pl ? "Przerzuć Cel [V]" : "Flip Beacon [V]", pressed: false },
        { id: "rays", label: showRays ? (pl ? "Wąsy: WŁ [X]" : "Whiskers: ON [X]") : (pl ? "Wąsy: WYŁ [X]" : "Whiskers: OFF [X]"), pressed: showRays },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-avoid") {
        avoidOn = !avoidOn;
        crashes = 0;
        audio?.ruleSwitch?.(avoidOn);
        setBanner(
          avoidOn
            ? "WHISKER AVOIDANCE ON: 3 RAYCAST FEELERS CARVE CLEANLY AROUND ROCKS!"
            : "SEEK-ONLY OFF: NO FEELERS → RACERS SLAM STRAIGHT INTO PILLARS!",
          avoidOn ? "#fb923c" : "#f87171",
          2.0
        );
      } else if (id === "flip") {
        flipBeacon({ silent: false });
      } else if (id === "rays") {
        showRays = !showRays;
        audio?.ruleSwitch?.(showRays);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-avoid");
      else if (code === "KeyV") this.onAction("flip");
      else if (code === "KeyX") this.onAction("rays");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        beacon.x = clamp(world[0], -ARENA_X + 1.0, ARENA_X - 1.0);
        beacon.z = clamp(world[2], -ARENA_Z + 1.0, ARENA_Z - 1.0);
        beacon.hopT = 0;
        audio?.coinPickup?.();
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = racers.map((r) => ({
        gpu: skiffGpu, x: r.x, y: 0.14, z: r.z, yaw: r.yaw, scale: 0.92, animMode: 0,
        tint: r.crashFlash > 0.05 ? [1.0, 0.22, 0.28, r.crashFlash * 0.90] : [1, 1, 1, 0],
      }));

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Golden Goal Beacon ring + glowing orb
          fx.ringXZ(beacon.x, 0.08, beacon.z, 0.95 + 0.12 * Math.sin(time * 5), [1.0, 0.84, 0.18, 0.88]);
          fx.billboard(beacon.x, 0.95, beacon.z, 0.42, basis.right, basis.up, [1.0, 0.84, 0.18, 0.90], 2);

          // Live 3D Raycast Whisker Feelers!
          if (showRays && avoidOn) {
            for (const r of racers) {
              for (const wRay of r.whiskers) {
                const col = wRay.hit ? [1.0, 0.42, 0.14, 0.94] : [0.16, 0.94, 1.0, 0.56];
                fx.beam(r.x, 0.44, r.z, wRay.ex, 0.44, wRay.ez, wRay.hit ? 0.10 : 0.055, col, 0);
              }
            }
          }
          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, sp.size * (0.4 + 0.6 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { avoidOn, crashes, arrivals, showRays };
    },
  };
}
