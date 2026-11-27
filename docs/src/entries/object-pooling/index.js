// Entry #27: Object Pooling vs GC Freeze Spikes — Playable 3D Bullet-Hell Memory Visualizer!
// Shows why action & bullet-hell games pre-allocate a fixed Object Pool (0 heap allocations, silky flat 8.3ms
// frame-time graph) instead of calling new/delete every shot (heap fills -> 195ms Stop-The-World GC freeze)!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";
import { getQuadMeshes } from "../../quad-mesh.js";

const POOL_SIZE = 140;
const ARENA_RAD = 4.65;
const RACK_X0 = 5.45;
const RACK_Z0 = -3.35;

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.025, 0.028, 0.068],
    skyMid: [0.055, 0.052, 0.115],
    skyBot: [0.095, 0.072, 0.135],
    lightDir: [0.34, 0.88, 0.34],
  });
  const lm = getLagMeshes();
  const qm = getQuadMeshes();
  const turretGpu = studio.uploadMesh(lm.sniper);
  const orbGpu = studio.uploadMesh(qm.drone);

  // Build Circular Bullet-Hell Firing Floor + Right-Side Pre-Allocated Pool Magazine Rack!
  const wBuf = [];
  // Main Arena Deck
  pushBox(wBuf, -5.2, 4.9, -0.45, 0.0, -5.0, 5.0, [0.16, 0.19, 0.28], 0);
  // Center Turret Pedestal
  pushBox(wBuf, -1.0, 1.0, 0.0, 0.12, -1.0, 1.0, [0.26, 0.30, 0.42], 1);
  // Right-Side Pre-Allocated Object Pool Magazine Rack (clearly separated memory tray!)
  pushBox(wBuf, 5.15, 7.65, -0.35, 0.14, -4.1, 4.1, [0.20, 0.24, 0.34], 1);
  pushBox(wBuf, 5.15, 7.65, 0.14, 0.20, -4.1, -3.95, [0.96, 0.70, 0.14], 2);
  pushBox(wBuf, 5.15, 7.65, 0.14, 0.20,  3.95,  4.1, [0.96, 0.70, 0.14], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.86, dist: 17.5, targetX: 0.95, targetY: 0.3, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let poolOn = true;   // ON: Pre-Allocated Object Pool (0 GC pauses) | OFF: new/delete -> Heap fills -> GC Freeze!
  let stormOn = false; // [V] Bullet Storm (2.5x fire rate!)
  let userInteracted = false;

  let turretYaw = 0;
  let fireAcc = 0;
  let heapFill = 0;      // 0..100% (only climbs when poolOn=false!)
  let gcFreezeT = 0;     // > 0 freezes simulation visually to let player FEEL the Stop-The-World GC spike!
  let gcCount = 0;
  let allocsTotal = 0;
  let recycledTotal = 0;

  // Live 60-sample Frame-Time Oscilloscope (ms per frame: 8.3ms flat vs 195ms crimson GC spike!)
  const frameHistory = new Float32Array(64).fill(8.3);
  let histIdx = 0;
  let histTimer = 0;

  // Fixed pre-allocated bullet slots
  const bullets = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    bullets.push({
      active: false,
      x: 0, z: 0, vx: 0, vz: 0,
      rackX: RACK_X0 + col * 0.56,
      rackZ: RACK_Z0 + (row % 16) * 0.44,
      recycleFlash: 0,
    });
  }
  let activeCount = 0;
  let recycleBeams = []; // Brief golden beams zipping recycled bullets back into the Pool Rack!

  let bannerText = "";
  let bannerColor = "#f59e0b";
  let bannerTimer = 0;
  function setBanner(t, c = "#f59e0b", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0; turretYaw = 0; fireAcc = 0;
    heapFill = 0; gcFreezeT = 0; gcCount = 0; allocsTotal = 0; recycledTotal = 0;
    frameHistory.fill(8.3); histIdx = 0;
    for (const b of bullets) { b.active = false; b.recycleFlash = 0; }
    recycleBeams = [];
    activeCount = 0;
    bannerTimer = 0;
    // Pre-warm a half-second spiral so Frame 1 is immediately vibrant & kinetic!
    for (let i = 0; i < 22; i++) stepSim(0.03);
  }

  function spawnBullet(ang) {
    // Borrow an inactive slot from the ring buffer
    let slot = null;
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!bullets[i].active) { slot = bullets[i]; break; }
    }
    if (!slot) return;
    slot.active = true;
    slot.x = Math.sin(ang) * 1.05;
    slot.z = Math.cos(ang) * 1.05;
    const sp = stormOn ? 4.4 : 3.4;
    slot.vx = Math.sin(ang) * sp;
    slot.vz = Math.cos(ang) * sp;
    slot.recycleFlash = 0;

    if (!poolOn) {
      allocsTotal++;
      heapFill = Math.min(100, heapFill + (stormOn ? 1.85 : 1.35));
      if (heapFill >= 100) {
        // Trigger REAL visible Stop-The-World Garbage Collector freeze!
        gcFreezeT = 0.24;
        gcCount++;
        heapFill = 12;
        frameHistory[histIdx] = 195.0;
        histIdx = (histIdx + 1) % frameHistory.length;
        if (userInteracted) audio?.inputIgnored?.();
      }
    }
  }

  function stepSim(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Record oscilloscope frame time
    histTimer += dt;
    if (histTimer >= 0.035) {
      histTimer = 0;
      frameHistory[histIdx] = gcFreezeT > 0 ? 195.0 : (poolOn ? 8.3 + Math.sin(time * 7) * 0.4 : 11.5 + (heapFill / 100) * 6.0);
      histIdx = (histIdx + 1) % frameHistory.length;
    }

    // If Stop-The-World GC Pause is active: FREEZE all 3D bullets in mid-air!
    if (gcFreezeT > 0) {
      gcFreezeT = Math.max(0, gcFreezeT - dt);
      return;
    }

    turretYaw += dt * (stormOn ? 3.2 : 1.9);
    const rate = stormOn ? 62 : 28;
    fireAcc += dt * rate;
    while (fireAcc >= 1.0) {
      fireAcc -= 1.0;
      spawnBullet(turretYaw);
      spawnBullet(turretYaw + Math.PI);
    }

    activeCount = 0;
    for (const b of bullets) {
      if (b.recycleFlash > 0) b.recycleFlash = Math.max(0, b.recycleFlash - dt * 2.8);
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (Math.hypot(b.x, b.z) > ARENA_RAD) {
        b.active = false;
        if (poolOn) {
          recycledTotal++;
          b.recycleFlash = 1.0;
          if (recycleBeams.length < 10) {
            recycleBeams.push({ sx: b.x, sz: b.z, ex: b.rackX, ez: b.rackZ, life: 0.22, maxLife: 0.22 });
          }
        }
      } else {
        activeCount++;
      }
    }
    for (let i = recycleBeams.length - 1; i >= 0; i--) {
      recycleBeams[i].life -= dt;
      if (recycleBeams[i].life <= 0) recycleBeams.splice(i, 1);
    }
  }

  reset();

  function drawOscilloscope(ctx, px, py, bw, bh) {
    ctx.fillStyle = "rgba(8, 12, 22, 0.92)";
    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, py, bw, bh, 5); ctx.fill(); ctx.stroke();

    // 16.6ms (60 FPS) dashed budget line
    const y60 = py + bh - (16.6 / 200) * bh - 4;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.beginPath(); ctx.moveTo(px + 2, y60); ctx.lineTo(px + bw - 2, y60); ctx.stroke();

    // Plot live frame-time samples!
    const stepW = (bw - 8) / frameHistory.length;
    for (let i = 0; i < frameHistory.length; i++) {
      const idx = (histIdx + i) % frameHistory.length;
      const ms = frameHistory[idx];
      const h = clamp((ms / 200) * (bh - 6), 2, bh - 6);
      ctx.fillStyle = ms > 40 ? "#ef4444" : (poolOn ? "#22c55e" : "#f59e0b");
      ctx.fillRect(px + 4 + i * stepW, py + bh - 3 - h, Math.max(2, stepW - 0.8), h);
    }
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(poolOn ? "FRAME TIME: FLAT 8.3ms (120 FPS)" : "FRAME TIME: GC SPIKES (195ms FREEZE!)", px + 6, py + 12, bw - 10);
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Label 1: Pool Magazine Rack (anchored cleanly at front edge below the top-right HUD box!)
      const rp = projectToScreen(viewProj, 6.35, 0.65, 4.15, cssW, cssH);
      if (rp) {
        const txt = poolOn
          ? (isPl ? `PULA OBIEKTÓW (${POOL_SIZE - activeCount} GOTOWYCH ✓)` : `OBJECT POOL RACK (${POOL_SIZE - activeCount} READY ✓)`)
          : (isPl ? "PULA WYŁĄCZONA (ROŚNIE STERTA HEAP!)" : "POOL OFF (HEAP GARBAGE PILING UP!)");
        drawWorldPill(ctx, rp.x, rp.y, txt, poolOn ? "#facc15" : "#f87171", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Label 2: Center Arena Freeze / Smooth status!
      const cp = projectToScreen(viewProj, -0.2, 1.85, 0.0, cssW, cssH);
      if (cp) {
        if (gcFreezeT > 0) {
          drawWorldPill(ctx, cp.x, cp.y, isPl ? "GC STOP-THE-WORLD FREEZE! (195ms LAG!) ✗" : "GC STOP-THE-WORLD FREEZE! (195ms!) ✗", "#f87171", cssW, cssH, isCompact ? 9.5 : 11);
        } else {
          const txt = poolOn
            ? (isPl ? "0 ALOKACJI · PŁYNNE 120 FPS ✓" : "0 HEAP ALLOCS · SILKY 120 FPS ✓")
            : (isPl ? `NEW/DELETE · STERTA HEAP: ${Math.round(heapFill)}%` : `NEW/DELETE · HEAP FILL: ${Math.round(heapFill)}%`);
          drawWorldPill(ctx, cp.x, cp.y, txt, poolOn ? "#4ade80" : "#fb923c", cssW, cssH, isCompact ? 9 : 10);
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${poolOn ? `POOL: 0 GC · Recycled ${recycledTotal}` : `NO POOL: ${gcCount} GC FREEZES! · Heap ${Math.round(heapFill)}%`}`,
          poolOn ? "#f59e0b" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 196, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 26, 0.90)";
        ctx.strokeStyle = gcFreezeT > 0 ? "#ef4444" : (poolOn ? "rgba(245, 158, 11, 0.84)" : "rgba(248, 113, 113, 0.84)");
        ctx.lineWidth = gcFreezeT > 0 ? 2.4 : 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = poolOn ? "#fbbf24" : "#f87171";
        ctx.fillText(poolOn ? `OBJECT POOL (${POOL_SIZE} SLOTS) · 0 GC PAUSES` : `NEW/DELETE MODE · ${gcCount} GC FREEZES!`, px + 12, py + 20, bw);

        // Live Frame-Time Oscilloscope!
        drawOscilloscope(ctx, px + 12, py + 30, bw, 56);

        // Heap Garbage Bar
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 95, bw, 15, 4); ctx.fill();
        ctx.fillStyle = poolOn ? "#22c55e" : (heapFill > 75 ? "#ef4444" : "#f59e0b");
        ctx.beginPath(); ctx.roundRect(px + 12, py + 95, poolOn ? 14 : Math.max(8, bw * (heapFill / 100)), 15, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(poolOn ? "HEAP GARBAGE: 0% (REUSED)" : `HEAP GARBAGE: ${Math.round(heapFill)}% (GC AT 100%)`, px + 18, py + 106, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Odzyskane z puli: ${recycledTotal} · Alokacje: ${allocsTotal}` : `Recycled: ${recycledTotal} · Heap Allocs: ${allocsTotal}`, px + 12, py + 132, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Aktywne pociski: ${activeCount}/${POOL_SIZE} · Zacięcia GC: ${gcCount}` : `Live Orbs: ${activeCount}/${POOL_SIZE} · GC Spikes: ${gcCount}`, px + 12, py + 152, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "T = Pula / new-delete · V = Burza Pocisków" : "T = Pool / new-delete · V = Bullet Storm 2.5×", px + 12, py + 176, bw);
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
        { id: "toggle-pool", label: poolOn ? (pl ? "Object Pool: WŁ (0 GC) [T]" : "Object Pool: ON (0 GC) [T]") : (pl ? "new/delete (Zacięcia GC!) [T]" : "new/delete (GC Freezes!) [T]"), pressed: poolOn },
        { id: "storm", label: stormOn ? (pl ? "Burza 2.5×: WŁ [V]" : "Bullet Storm: ON [V]") : (pl ? "Burza Pocisków [V]" : "Bullet Storm [V]"), pressed: stormOn },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-pool") {
        poolOn = !poolOn;
        audio?.ruleSwitch?.(poolOn);
        if (!poolOn) heapFill = 68; // Jump near GC threshold so first spike hits quickly!
        setBanner(
          poolOn
            ? "OBJECT POOL ON: RECYCLING FIXED SLOTS → 0 GC PAUSES & FLAT 120 FPS!"
            : "NO POOL (new/delete): WATCH HEAP FILL → 195ms GC FREEZE SPIKES!",
          poolOn ? "#fbbf24" : "#f87171",
          2.0
        );
      } else if (id === "storm") {
        stormOn = !stormOn;
        audio?.ruleSwitch?.(stormOn);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-pool");
      else if (code === "KeyV") this.onAction("storm");
    },
    update: stepSim,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        { gpu: turretGpu, x: 0, y: 0.12, z: 0, yaw: turretYaw, scale: 1.15, animMode: 1, animA: 0.08 * Math.sin(time * 24) },
      ];
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (b.active) {
          meshes.push({
            gpu: orbGpu, x: b.x, y: 0.42, z: b.z, yaw: 0, scale: 0.56, animMode: 0,
            tint: gcFreezeT > 0 ? [1.0, 0.18, 0.26, 0.90] : (poolOn ? [0.16, 0.94, 1.0, 0.55] : [1.0, 0.54, 0.18, 0.60]),
          });
        } else if (poolOn && i < 64) {
          // Dormant recycled orbs resting cleanly inside the golden Pool Magazine Rack!
          meshes.push({
            gpu: orbGpu, x: b.rackX, y: 0.22, z: b.rackZ, yaw: 0, scale: 0.44, animMode: 0,
            tint: b.recycleFlash > 0.05 ? [1.0, 0.92, 0.26, 0.92] : [0.94, 0.68, 0.18, 0.72],
          });
        }
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          fx.ringXZ(0, 0.07, 0, ARENA_RAD, gcFreezeT > 0 ? [1.0, 0.20, 0.28, 0.95] : (poolOn ? [0.18, 0.92, 1.0, 0.65] : [1.0, 0.54, 0.18, 0.65]));
          for (const rb of recycleBeams) {
            const a = clamp(rb.life / rb.maxLife, 0, 1);
            fx.beam(rb.sx, 0.45, rb.sz, rb.ex, 0.35, rb.ez, 0.09, [1.0, 0.84, 0.18, a * 0.85], 0);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { poolOn, stormOn, activeCount, recycledTotal, allocsTotal, gcCount, heapFill: Math.round(heapFill) };
    },
  };
}
