// Entry #15: Lag Compensation & Server Rewind — Playable 3D Tactical Netcode Visualizer!
// Shows why online shooters (CS2, Overwatch, Valorant) let shots land at 180ms ping AND why you sometimes
// get "shot behind a wall": Server rewinds enemy hitboxes back -180ms to match what the shooter actually saw!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const PING_OPTIONS = [180, 280, 80];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.020, 0.036, 0.075],
    skyMid: [0.048, 0.082, 0.145],
    skyBot: [0.075, 0.100, 0.165],
  });
  const m = getLagMeshes();
  const sniperGpu = studio.uploadMesh(m.sniper);
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Tactical Sniper Corridor with Left & Right Brick Cover Walls (enables "Shot Behind Wall!" demo!)
  const wBuf = [];
  pushBox(wBuf, -8.2, 8.2, -0.5, 0.0, -5.8, 5.8, [0.22, 0.26, 0.34], 0);
  // Rear range backstop & side walls
  pushBox(wBuf, -8.2, 8.2, 0.0, 2.2, -6.3, -5.7, [0.26, 0.30, 0.40], 1);
  pushBox(wBuf, -8.2, -7.7, 0.0, 1.1, -5.7, 5.8, [0.24, 0.28, 0.38], 1);
  pushBox(wBuf,  7.7,  8.2, 0.0, 1.1, -5.7, 5.8, [0.24, 0.28, 0.38], 1);
  // Left & Right Brick Cover Walls at z = -0.85 (runner sprints behind them at z = -2.3!)
  pushBox(wBuf, -7.5, -3.5, 0.0, 1.85, -1.35, -0.75, [0.64, 0.30, 0.24], 1);
  pushBox(wBuf,  3.5,  7.5, 0.0, 1.85, -1.35, -0.75, [0.64, 0.30, 0.24], 1);
  pushBox(wBuf, -7.5, -3.5, 1.85, 1.98, -1.40, -0.70, [0.36, 0.38, 0.44], 1);
  pushBox(wBuf,  3.5,  7.5, 1.85, 1.98, -1.40, -0.70, [0.36, 0.38, 0.44], 1);
  // Sprint track neon rail & sniper pad
  pushBox(wBuf, -7.2, 7.2, 0.0, 0.05, -2.42, -2.18, [0.16, 0.86, 1.0], 2);
  pushBox(wBuf, -1.4, 1.4, 0.0, 0.10, 3.2, 5.2, [0.26, 0.30, 0.42], 1);
  pushBox(wBuf, -7.6, 7.6, 0.0, 0.04, 2.55, 2.82, [1, 0.7, 0.1], 5);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.74, dist: 18.0, targetX: 0.0, targetY: 0.55, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let lagCompOn = true;
  let pingIdx = 0;
  let pingMs = PING_OPTIONS[pingIdx];
  let autoDemo = true;
  let autoCd = 0.45;
  let userInteracted = false;

  let shots = 0;
  let hits = 0;
  let misses = 0;
  let wallHits = 0;

  const sniper = { x: 0.0, z: 4.3, yaw: Math.PI, targetYaw: Math.PI, recoil: 0 };
  // Runner's TRUE LIVE SERVER position & history ring buffer!
  const runner = { x: -1.5, z: -2.3, vx: 5.8, yaw: Math.PI * 0.5, walkPhase: 0 };
  let history = []; // { t, x, yaw, walkPhase }
  let lastShot = null; // { sx, sz, ex, ez, hit, rewound, behindWall, clientX, serverX, life, maxLife }
  let sparks = [];
  let wallPeekQueued = false;

  let bannerText = "";
  let bannerColor = "#38bdf8";
  let bannerTimer = 0;

  function setBanner(t, c = "#38bdf8", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function sampleClientPos(delaySec) {
    const targetT = time - delaySec;
    if (history.length === 0) return { x: runner.x, yaw: runner.yaw, walkPhase: runner.walkPhase };
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].t <= targetT) return history[i];
    }
    return history[0];
  }

  function spawnSparks(x, y, z, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.0;
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 2.4, vz: Math.sin(a) * sp, r, g, b, size: 0.16, life: 0.48, maxLife: 0.48 });
    }
  }

  function reset() {
    time = 0;
    shots = 0; hits = 0; misses = 0; wallHits = 0;
    autoDemo = true;
    autoCd = 0.42;
    wallPeekQueued = false;
    sniper.yaw = Math.PI; sniper.targetYaw = Math.PI; sniper.recoil = 0;
    runner.x = -2.2; runner.vx = 6.2; runner.yaw = Math.PI * 0.5; runner.walkPhase = 0;
    history = [];
    // Pre-populate 0.4s of smooth history so Frame 1 immediately shows the 180ms Client vs Server gap!
    for (let k = 24; k >= 0; k--) {
      const dtBack = k * 0.016;
      history.push({ t: -dtBack, x: runner.x - runner.vx * dtBack, yaw: runner.yaw, walkPhase: -dtBack * 12 });
    }
    lastShot = null;
    sparks = [];
    bannerTimer = 0;
  }
  reset();

  function fireShot(overrideYaw = null, { silent = false } = {}) {
    const yaw = overrideYaw != null ? overrideYaw : sniper.yaw;
    sniper.yaw = yaw;
    sniper.recoil = 0.34;
    shots++;
    if (!silent) audio?.laserShot?.(true);

    const delaySec = pingMs / 1000;
    const clientSnap = sampleClientPos(delaySec);
    const sx = sniper.x + Math.sin(yaw) * 1.45;
    const sz = sniper.z + Math.cos(yaw) * 1.45;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);

    // Intersect ray with runner lane z = runner.z
    const tPlane = (runner.z - sniper.z) / (Math.abs(dz) > 0.05 ? dz : -1);
    const aimX = sniper.x + dx * tPlane;

    // Check against Rewound Client Position (Lag Comp ON) vs Live Server Position (Lag Comp OFF)!
    const targetX = lagCompOn ? clientSnap.x : runner.x;
    const distErr = Math.abs(aimX - targetX);
    const hit = tPlane > 0 && distErr <= 0.68;
    const behindWall = hit && Math.abs(runner.x) > 3.65;

    const ex = hit ? targetX : sniper.x + dx * 10.6;
    const ez = hit ? runner.z : sniper.z + dz * 10.6;

    lastShot = {
      sx, sz, ex, ez, aimX,
      hit, rewound: lagCompOn && hit, behindWall,
      clientX: clientSnap.x, serverX: runner.x,
      pingAtShot: pingMs,
      life: 2.3, maxLife: 2.3,
    };

    if (hit) {
      hits++;
      if (behindWall) wallHits++;
      spawnSparks(targetX, 1.15, runner.z, behindWall ? 1.0 : 0.22, behindWall ? 0.78 : 0.96, behindWall ? 0.18 : 1.0, 18);
      if (!silent) (behindWall ? audio?.coyoteSave?.() : audio?.hitEnemy?.(false));
      if (!silent) {
        setBanner(
          behindWall
            ? `SHOT BEHIND WALL! REWOUND -${pingMs} ms TO WHEN HE WAS EXPOSED!`
            : `LAG COMP REWIND (-${pingMs} ms) → HIT CONFIRMED!`,
          behindWall ? "#facc15" : "#22d3ee",
          2.0
        );
      }
    } else {
      misses++;
      if (!silent) audio?.inputIgnored?.();
      if (!silent) {
        setBanner(
          lagCompOn ? "MISSED SHOT!" : `MISS! SERVER POSITION WAS ALREADY ${Math.abs(runner.x - clientSnap.x).toFixed(1)}m AHEAD!`,
          "#f87171",
          1.8
        );
      }
    }
  }

  function triggerCornerPeekDemo() {
    userInteracted = true;
    autoDemo = false;
    // Place runner sprinting right toward the right brick cover wall so client sees him exposed while server is ALREADY behind wall!
    runner.x = 2.6;
    runner.vx = 6.2;
    runner.yaw = Math.PI * 0.5;
    history = [];
    for (let k = 28; k >= 0; k--) {
      const dtBack = k * 0.016;
      history.push({ t: time - dtBack, x: runner.x - runner.vx * dtBack, yaw: runner.yaw, walkPhase: runner.walkPhase - dtBack * 12 });
    }
    wallPeekQueued = true;
    setBanner("WATCH CORNER PEEK: RUNNER DUCKS BEHIND BRICK WALL...", "#facc15", 1.5);
  }

  function update(dt, keys, pointer) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    sniper.recoil = Math.max(0, sniper.recoil - dt * 2.4);
    if (lastShot) { lastShot.life -= dt; if (lastShot.life <= 0) lastShot = null; }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.5 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }

    // Move Runner briskly back & forth across the doorway & behind brick cover walls
    runner.x += runner.vx * dt;
    if (runner.x > 5.4) { runner.x = 5.4; runner.vx = -6.2; runner.yaw = -Math.PI * 0.5; }
    if (runner.x < -5.4) { runner.x = -5.4; runner.vx = 6.2; runner.yaw = Math.PI * 0.5; }
    runner.walkPhase += dt * 12.5;
    history.push({ t: time, x: runner.x, yaw: runner.yaw, walkPhase: runner.walkPhase });
    if (history.length > 60) history.shift();

    const clientSnap = sampleClientPos(pingMs / 1000);

    // Corner-Peek Demo fires the EXACT millisecond Server Live passes behind the brick wall (x >= 4.0) while Client View is still exposed (x < 3.4)!
    if (wallPeekQueued && runner.x >= 4.05 && clientSnap.x <= 3.35) {
      wallPeekQueued = false;
      const aim = Math.atan2(clientSnap.x - sniper.x, runner.z - sniper.z);
      sniper.targetYaw = aim;
      fireShot(aim, { silent: false });
    }

    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoDemo = false; userInteracted = true;
      sniper.targetYaw = clamp(sniper.targetYaw + ((left ? 1 : 0) - (right ? 1 : 0)) * 1.5 * dt, Math.PI - 0.95, Math.PI + 0.95);
    } else if (!autoDemo && pointer?.world && pointer.world[2] < sniper.z - 0.8) {
      const des = Math.atan2(pointer.world[0] - sniper.x, pointer.world[2] - sniper.z);
      let diff = des - Math.PI;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      sniper.targetYaw = Math.PI + clamp(diff, -0.95, 0.95);
    } else if (autoDemo) {
      // Auto-Demo aims squarely at what YOU SEE (Client View) in the open doorway and fires cleanly!
      const aim = Math.atan2(clientSnap.x - sniper.x, runner.z - sniper.z);
      sniper.targetYaw = aim;
      autoCd -= dt;
      if (autoCd <= 0 && Math.abs(clientSnap.x) < 3.2) {
        fireShot(aim, { silent: !userInteracted });
        autoCd = 1.85;
      }
    }
    sniper.yaw = lerp(sniper.yaw, sniper.targetYaw, clamp(dt * 14, 0, 1));
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const clientSnap = sampleClientPos(pingMs / 1000);

    if (viewProj) {
      // Label 1: Client View (Solid Runner — what YOUR screen sees!)
      const cp = projectToScreen(viewProj, clientSnap.x, 2.25, runner.z, cssW, cssH);
      if (cp) {
        drawWorldPill(ctx, cp.x, cp.y, isPl ? "TWÓJ EKRAN (KLIENT)" : "WHAT YOU SEE (CLIENT)", "#f8fafc", cssW, cssH, isCompact ? 9 : 10);
      }
      // Label 2: Live Server Ghost (+ping ms ahead!)
      const sp = projectToScreen(viewProj, runner.x, 1.95, runner.z, cssW, cssH);
      if (sp) {
        const dy = cp && Math.abs(sp.x - cp.x) < 155 ? -26 : 0;
        const srvBehind = Math.abs(runner.x) > 3.65;
        // Keep clear of the top-right telemetry box on desktop when runner sprints to far-right wall
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && sp.y + dy < 225)
          ? Math.min(sp.x, cssW - 430)
          : sp.x;
        drawWorldPill(
          ctx, safeX, sp.y + dy,
          srvBehind
            ? (isPl ? `SERWER (+${pingMs}ms · ZA ŚCIANĄ!)` : `SERVER LIVE (+${pingMs}ms · BEHIND WALL!)`)
            : (isPl ? `SERWER TERAZ (+${pingMs}ms)` : `SERVER LIVE (+${pingMs}ms)`),
          srvBehind ? "#facc15" : "#38bdf8",
          cssW, cssH, isCompact ? 9 : 10
        );
      }
      // Label 3: Active Rewind / Miss callout!
      if (lastShot && lastShot.life > 0.2) {
        const mp = projectToScreen(viewProj, (lastShot.clientX + lastShot.serverX) * 0.5, 1.35, runner.z + 1.0, cssW, cssH);
        if (mp) {
          const txt = lastShot.hit
            ? (lastShot.behindWall
                ? (isPl ? `COFNIĘTO -${lastShot.pingAtShot}ms → TRAFIONY ZA ŚCIANĄ!` : `REWIND -${lastShot.pingAtShot}ms → SHOT BEHIND WALL!`)
                : (isPl ? `SERWER COFA -${lastShot.pingAtShot}ms → TRAFIONY ✓` : `SERVER REWIND -${lastShot.pingAtShot}ms → HIT ✓`))
            : (isPl ? "PUDŁO! SERWER WIDZIAŁ GO DALEJ ✗" : "MISS! SERVER HITBOX ALREADY MOVED ✗");
          drawWorldPill(ctx, mp.x, mp.y, txt, lastShot.hit ? (lastShot.behindWall ? "#facc15" : "#4ade80") : "#f87171", cssW, cssH, isCompact ? 9.5 : 11);
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${lagCompOn ? "REWIND ON" : "NO REWIND"} · ${pingMs}ms · ${hits}/${shots}`,
          lagCompOn ? "#38bdf8" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 304, panelH = 146, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 28, 0.88)";
        ctx.strokeStyle = lagCompOn ? "rgba(56, 189, 248, 0.78)" : "rgba(248, 113, 113, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = lagCompOn ? "#38bdf8" : "#f87171";
        ctx.fillText(lagCompOn ? `LAG COMPENSATION · REWIND -${pingMs}ms` : `NO LAG COMP · PING ${pingMs}ms (RAW)`, px + 12, py + 21);
        const acc = shots > 0 ? Math.round((hits / shots) * 100) : 0;
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, bw, 15, 4); ctx.fill();
        if (acc > 0) {
          ctx.fillStyle = lagCompOn ? "#38bdf8" : "#f87171";
          ctx.beginPath(); ctx.roundRect(bx, py + 34, Math.max(6, bw * (acc / 100)), 15, 4); ctx.fill();
        }
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(isPl ? `ZALICZONE TRAFIENIA: ${acc}% (${hits}/${shots})` : `CONFIRMED HITS: ${acc}% (${hits}/${shots})`, bx + 6, py + 45);
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Trafienia "za ścianą": ${wallHits} · Pudła: ${misses}` : `"Behind Wall" Hits: ${wallHits} · Misses: ${misses}`, px + 12, py + 76);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Luka Klient ↔ Serwer: ${(Math.abs(runner.x - clientSnap.x)).toFixed(2)} m` : `Client ↔ Server Drift: ${(Math.abs(runner.x - clientSnap.x)).toFixed(2)} m`, px + 12, py + 98);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "V = Test 'Za Ścianą!' · T = Rewind WŁ/WYŁ" : "V = 'Shot Behind Wall' · T = Rewind ON/OFF", px + 12, py + 124);
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
        { id: "toggle-comp", label: lagCompOn ? (pl ? "Rewind: WŁ [T]" : "Lag Comp: ON [T]") : (pl ? "Rewind: WYŁ [T]" : "Lag Comp: OFF [T]"), pressed: lagCompOn },
        { id: "corner-peek", label: pl ? "Test 'Za Ścianą' [V]" : "Behind-Wall Test [V]", pressed: wallPeekQueued },
        { id: "cycle-ping", label: `Ping: ${pingMs}ms [X]`, pressed: pingMs >= 180 },
        { id: "fire", label: pl ? "Strzał [Spacja]" : "Fire [Space]", pressed: false },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-comp") {
        lagCompOn = !lagCompOn;
        audio?.ruleSwitch?.(lagCompOn);
        if (autoDemo) autoCd = 0.08;
        setBanner(lagCompOn ? `LAG COMP ON: SERVER REWINDS -${pingMs}ms!` : `LAG COMP OFF: SHOOTING AT ${pingMs}ms OLD GHOST!`, lagCompOn ? "#38bdf8" : "#f87171", 1.9);
      } else if (id === "corner-peek") {
        triggerCornerPeekDemo();
      } else if (id === "cycle-ping") {
        pingIdx = (pingIdx + 1) % PING_OPTIONS.length;
        pingMs = PING_OPTIONS[pingIdx];
        audio?.ruleSwitch?.(true);
      } else if (id === "fire") {
        autoDemo = false;
        fireShot(null, { silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-comp");
      else if (code === "KeyV") this.onAction("corner-peek");
      else if (code === "KeyX") this.onAction("cycle-ping");
      else if (code === "Space") this.onAction("fire");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoDemo = false;
        const aim = Math.atan2(world[0] - sniper.x, world[2] - sniper.z);
        sniper.targetYaw = aim;
        fireShot(aim, { silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const clientSnap = sampleClientPos(pingMs / 1000);
      const meshes = [
        { gpu: sniperGpu, x: sniper.x, y: 0.10, z: sniper.z, yaw: sniper.yaw, animA: sniper.recoil, scale: 1.24, animMode: 1 },
        // Solid Runner = WHAT YOU SEE (Client View, -ping ms!)
        { gpu: runnerGpu, x: clientSnap.x, y: 0.0, z: runner.z, yaw: clientSnap.yaw, animA: clientSnap.walkPhase, animB: 1.0, scale: 1.08, animMode: 2 },
        // Translucent Cyan Ghost = WHERE HE ACTUALLY IS ON SERVER RIGHT NOW!
        { gpu: runnerGpu, x: runner.x, y: 0.0, z: runner.z, yaw: runner.yaw, animA: runner.walkPhase, animB: 1.0, scale: 1.08, animMode: 2, alpha: 0.44, tint: [0.16, 0.90, 1.0, 0.85] },
      ];
      if (lastShot && lastShot.rewound) {
        meshes.push({
          gpu: runnerGpu, x: lastShot.clientX, y: 0.0, z: runner.z, yaw: clientSnap.yaw, animA: clientSnap.walkPhase, animB: 0.2,
          scale: 1.12, animMode: 2, alpha: clamp(lastShot.life / lastShot.maxLife, 0, 1) * 0.65, tint: [1.0, 0.82, 0.18, 0.92],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Dashed timeline link showing the live Ping Drift between Client View & Server Live!
          fx.beam(clientSnap.x, 0.95, runner.z, runner.x, 0.95, runner.z, 0.10, [0.22, 0.92, 1.0, 0.85], 4);
          fx.ringXZ(clientSnap.x, 0.05, runner.z, 0.62, [0.95, 0.98, 1.0, 0.72]);
          fx.ringXZ(runner.x, 0.05, runner.z, 0.68, [0.18, 0.90, 1.0, 0.78]);
          // Aim laser sight
          fx.beam(sniper.x + Math.sin(sniper.yaw) * 1.4, 1.10, sniper.z + Math.cos(sniper.yaw) * 1.4, sniper.x + Math.sin(sniper.yaw) * 9.5, 1.10, sniper.z + Math.cos(sniper.yaw) * 9.5, 0.05, [0.98, 0.34, 0.44, 0.50], 4);

          if (lastShot) {
            const a = clamp(lastShot.life / lastShot.maxLife, 0, 1);
            // Bullet beam
            fx.beam(lastShot.sx, 1.10, lastShot.sz, lastShot.ex, 1.10, lastShot.ez, 0.16, lastShot.hit ? [0.20, 1.0, 0.76, a] : [1.0, 0.32, 0.38, a], 0);
            if (lastShot.rewound) {
              // Golden Server Rewind Arrow pulling Server Ghost back to Client Hitbox!
              fx.beam(lastShot.serverX, 1.65, runner.z, lastShot.clientX, 1.65, runner.z, 0.18, [1.0, 0.84, 0.18, a * 0.95], 0);
              fx.ringXZ(lastShot.clientX, 0.07, runner.z, 0.92, [1.0, 0.84, 0.18, a * 0.92]);
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
      return { lagCompOn, pingMs, shots, hits, misses, wallHits, autoDemo };
    },
  };
}
