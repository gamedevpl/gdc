// Entry #17: Hitboxes, Hurtboxes & I-Frames — Playable 3D Souls-Style Boss Colosseum!
// Shows why great action games shrink enemy hitboxes slightly smaller than the blade AND grant 280ms of
// radiant golden Invincibility Frames (I-Frames) during a dodge roll — vs Jank oversized hitboxes that hit empty air!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getHitboxMeshes } from "../../hitbox-mesh.js";

const BOSS_X = 0.0;
const BOSS_Z = -1.75;
const BOSS_SCALE = 1.15;

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.055, 0.025, 0.055],
    skyMid: [0.135, 0.058, 0.088],
    skyBot: [0.220, 0.110, 0.105],
    lightDir: [0.36, 0.86, 0.34],
    ambLow: [0.16, 0.11, 0.15],
    ambHigh: [0.40, 0.32, 0.36],
  });
  const m = getHitboxMeshes();
  const knightGpu = studio.uploadMesh(m.knight);
  const bossGpu = studio.uploadMesh(m.boss);

  // Build Sunlit Colosseum Stone Arena with Perimeter Pillars & Fire Braziers
  const wBuf = [];
  // Main stone floor & raised colosseum rim
  pushBox(wBuf, -7.8, 7.8, -0.5, 0.0, -5.8, 5.4, [0.38, 0.34, 0.32], 0);
  pushBox(wBuf, -5.8, 5.8, 0.0, 0.05, -4.4, 4.2, [0.46, 0.41, 0.37], 0);
  // North colosseum stone wall & colonnade pillars
  pushBox(wBuf, -7.8, 7.8, 0.0, 1.4, -6.2, -5.6, [0.48, 0.43, 0.38], 1);
  for (let px = -6.4; px <= 6.41; px += 3.2) {
    pushBox(wBuf, px - 0.38, px + 0.38, 0.0, 3.1, -5.8, -5.0, [0.56, 0.50, 0.44], 1);
    pushBox(wBuf, px - 0.48, px + 0.48, 3.0, 3.28, -5.9, -4.9, [0.64, 0.58, 0.50], 1);
  }
  // 4 Corner Bronze Braziers
  for (const [bx, bz] of [[-5.6, -3.8], [5.6, -3.8], [-5.6, 3.6], [5.6, 3.6]]) {
    pushBox(wBuf, bx - 0.34, bx + 0.34, 0.0, 0.85, bz - 0.34, bz + 0.34, [0.34, 0.26, 0.20], 1);
    pushBox(wBuf, bx - 0.22, bx + 0.22, 0.85, 1.08, bz - 0.22, bz + 0.22, [1.0, 0.42, 0.14], 2);
  }
  // Boss pedestal disc
  pushBox(wBuf, -1.15, 1.15, 0.0, 0.10, BOSS_Z - 1.15, BOSS_Z + 1.15, [0.30, 0.24, 0.26], 1);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.18, pitch: 0.58, dist: 14.8, targetX: 0.0, targetY: 0.95, targetZ: 0.35, fovDeg: 40 };

  let time = 0;
  let fairMode = true;   // ON: Fitted blade hitbox + 280ms I-Frames | OFF: Bloated Jank hitbox + 0ms I-Frames!
  let xrayOn = true;
  let slowMo = false;
  let autoDemo = true;
  let userInteracted = false;

  let iframeSaves = 0;
  let hitsTaken = 0;
  let phantomHits = 0;

  // Boss sweep state machine
  const boss = {
    phase: "WINDUP", // WINDUP -> ACTIVE -> RECOVERY
    t: 0.25,
    angle: -1.35,
    hitResolvedThisSwing: false,
    swingCount: 0,
  };

  // Knight player state
  const knight = {
    x: 0.0,
    z: 1.48,
    yaw: Math.PI, // Facing North toward Boss!
    rolling: false,
    rollT: 0,
    rollDur: 0.44,
    rollDirX: 0,
    rollDirZ: -1,
    iframeTimer: 0,
    hurtFlash: 0,
    saveFlash: 0,
    cooldown: 0,
  };

  let sparks = [];
  let bannerText = "";
  let bannerColor = "#f43f5e";
  let bannerTimer = 0;
  let lastOutcome = null; // { kind: "IFRAME" | "PHANTOM" | "HIT", life }

  function setBanner(t, c = "#f43f5e", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function spawnSparks(x, y, z, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 2.8;
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 2.5, vz: Math.sin(a) * sp, r, g, b, size: 0.17, life: 0.50, maxLife: 0.50 });
    }
  }

  function reset() {
    time = 0;
    autoDemo = true;
    slowMo = false;
    iframeSaves = 0; hitsTaken = 0; phantomHits = 0;
    boss.phase = "WINDUP"; boss.t = 0.28; boss.angle = -1.35; boss.hitResolvedThisSwing = false; boss.swingCount = 0;
    knight.x = 0.0; knight.z = fairMode ? 1.45 : 2.38; knight.yaw = Math.PI;
    knight.rolling = false; knight.rollT = 0; knight.iframeTimer = 0;
    knight.hurtFlash = 0; knight.saveFlash = 0; knight.cooldown = 0;
    sparks = [];
    lastOutcome = null;
    bannerTimer = 0;
  }
  reset();

  function triggerRoll(dirX = 0, dirZ = -1, { silent = false } = {}) {
    if (knight.rolling || knight.cooldown > 0) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    knight.rolling = true;
    knight.rollT = 0;
    knight.rollDirX = dirX / len;
    knight.rollDirZ = dirZ / len;
    knight.yaw = Math.atan2(knight.rollDirX, knight.rollDirZ);
    // Fair Mode grants 280ms golden Invincibility Frames; Jank Mode grants 0ms!
    knight.iframeTimer = fairMode ? 0.28 : 0.0;
    if (!silent) audio?.dodge?.();
  }

  // Compute physical blade tip & hitbox extents along Boss's sweeping halberd!
  function getBladeGeometry() {
    const a = boss.angle;
    const sinA = Math.sin(a), cosA = Math.cos(a);
    // Physical crimson blade extends r = 2.25..3.48m from Boss center
    const physRMin = 2.25, physRMax = 3.48, physHalfW = 0.36;
    // Fitted Fair Hitbox is slightly forgiving (smaller than art); Jank Hitbox bloats +0.92m into empty air!
    const rMin = fairMode ? 2.35 : 1.75;
    const rMax = fairMode ? 3.38 : 4.38;
    const halfW = fairMode ? 0.34 : 0.78;
    const y0 = fairMode ? 0.85 : 0.18;
    const y1 = fairMode ? 1.62 : 2.05;
    const midR = (rMin + rMax) * 0.5;
    return {
      sinA, cosA, rMin, rMax, halfW, y0, y1, physRMin, physRMax, physHalfW,
      cx: BOSS_X + sinA * midR,
      cz: BOSS_Z + cosA * midR,
      tipX: BOSS_X + sinA * rMax,
      tipZ: BOSS_Z + cosA * rMax,
    };
  }

  function pointInOrientedBlade(px, pz, sinA, cosA, rMin, rMax, halfW) {
    const rx = px - BOSS_X, rz = pz - BOSS_Z;
    const along = rx * sinA + rz * cosA;
    const perp = Math.abs(rx * cosA - rz * sinA);
    return along >= rMin && along <= rMax && perp <= halfW;
  }

  function update(rawDt, keys) {
    const dt = rawDt * (slowMo ? 0.28 : 1.0);
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - rawDt);
    if (knight.hurtFlash > 0) knight.hurtFlash = Math.max(0, knight.hurtFlash - rawDt * 2.2);
    if (knight.saveFlash > 0) knight.saveFlash = Math.max(0, knight.saveFlash - rawDt * 1.6);
    if (knight.cooldown > 0) knight.cooldown = Math.max(0, knight.cooldown - dt);
    if (lastOutcome) { lastOutcome.life -= rawDt; if (lastOutcome.life <= 0) lastOutcome = null; }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.2 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }

    // 1. Boss Halberd Attack Cycle
    boss.t += dt;
    if (boss.phase === "WINDUP") {
      const p = clamp(boss.t / 0.78, 0, 1);
      boss.angle = lerp(-1.25, -1.58, p * p);
      if (boss.t >= 0.78) {
        boss.phase = "ACTIVE";
        boss.t = 0;
        boss.hitResolvedThisSwing = false;
        boss.swingCount++;
        if (userInteracted) audio?.hammerSwing?.(true);
      }
    } else if (boss.phase === "ACTIVE") {
      const p = clamp(boss.t / 0.36, 0, 1);
      boss.angle = lerp(-1.58, 1.38, p);
      if (boss.t >= 0.36) {
        boss.phase = "RECOVERY";
        boss.t = 0;
      }
    } else {
      const p = clamp(boss.t / 0.86, 0, 1);
      boss.angle = lerp(1.38, -1.25, p * p * (3 - 2 * p));
      if (boss.t >= 0.86) {
        boss.phase = "WINDUP";
        boss.t = 0;
      }
    }

    // 2. Knight Movement & Roll
    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;
    if (mx !== 0 || mz !== 0) { autoDemo = false; userInteracted = true; }

    if (knight.rolling) {
      knight.rollT += dt;
      if (knight.iframeTimer > 0) knight.iframeTimer = Math.max(0, knight.iframeTimer - dt);
      const speed = 3.8 * (1.0 - 0.35 * (knight.rollT / knight.rollDur));
      knight.x = clamp(knight.x + knight.rollDirX * speed * dt, -4.6, 4.6);
      knight.z = clamp(knight.z + knight.rollDirZ * speed * dt, -0.2, 3.6);
      if (knight.rollT >= knight.rollDur) {
        knight.rolling = false;
        knight.iframeTimer = 0;
        knight.cooldown = 0.16;
      }
    } else if (autoDemo) {
      // Auto-Demo showcases the exact contrast!
      // Fair Mode: stands at z=1.42 in the blade arc and times a Golden I-Frame Roll straight THROUGH the halberd!
      // Jank Mode: stands visibly OUTSIDE the physical blade (z=2.36 — clear of the steel!) and STILL gets phantom-hit by the bloated red Jank box!
      const goalZ = fairMode ? 1.48 : 2.34;
      knight.x = lerp(knight.x, 0.0, clamp(dt * 4.5, 0, 1));
      knight.z = lerp(knight.z, goalZ, clamp(dt * 4.5, 0, 1));
      knight.yaw = Math.PI;
      if (fairMode && boss.phase === "ACTIVE" && boss.t >= 0.05 && boss.t <= 0.14 && !knight.rolling) {
        triggerRoll(0.25, -0.96, { silent: !userInteracted });
      }
    } else if (mx !== 0 || mz !== 0) {
      const l = Math.hypot(mx, mz);
      knight.x = clamp(knight.x + (mx / l) * 4.5 * dt, -4.8, 4.8);
      knight.z = clamp(knight.z + (mz / l) * 4.5 * dt, -0.2, 3.8);
      knight.yaw = Math.atan2(mx, mz);
    }

    // 3. Exact Hitbox vs Hurtbox Intersection Check during ACTIVE frames!
    if (boss.phase === "ACTIVE" && !boss.hitResolvedThisSwing) {
      const bg = getBladeGeometry();
      const hurtRad = fairMode ? 0.32 : 0.44;
      const inHitbox = pointInOrientedBlade(knight.x, knight.z, bg.sinA, bg.cosA, bg.rMin - hurtRad, bg.rMax + hurtRad, bg.halfW + hurtRad);
      const inPhysicalSteel = pointInOrientedBlade(knight.x, knight.z, bg.sinA, bg.cosA, bg.physRMin - 0.25, bg.physRMax + 0.25, bg.physHalfW + 0.25);

      if (inHitbox) {
        boss.hitResolvedThisSwing = true;
        if (knight.iframeTimer > 0) {
          iframeSaves++;
          knight.saveFlash = 1.0;
          lastOutcome = { kind: "IFRAME", life: 1.55 };
          spawnSparks(knight.x, 1.05, knight.z, 1.0, 0.86, 0.22, 22);
          if (userInteracted) audio?.parry?.();
          if (userInteracted) setBanner("I-FRAME SAVE! BLADE PASSED THROUGH INVINCIBLE HURTBOX (0 DMG) ✓", "#facc15", 1.9);
        } else {
          hitsTaken++;
          const isPhantom = !inPhysicalSteel;
          if (isPhantom) phantomHits++;
          knight.hurtFlash = 1.0;
          lastOutcome = { kind: isPhantom ? "PHANTOM" : "HIT", life: 1.55 };
          spawnSparks(knight.x, 1.05, knight.z, 1.0, 0.22, 0.30, 22);
          if (userInteracted) audio?.playerHurt?.();
          if (userInteracted) {
            setBanner(
              isPhantom
                ? "PHANTOM HIT! JANK HITBOX EXTENDED 0.9m PAST THE BLADE INTO EMPTY AIR! ✗"
                : "HIT TAKEN! NO I-FRAMES ACTIVE DURING SWEEP! ✗",
              "#f87171",
              2.0
            );
          }
        }
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Label 1: Knight Hurtbox / I-Frame Status
      const kp = projectToScreen(viewProj, knight.x, 2.15, knight.z, cssW, cssH);
      if (kp) {
        let txt, col;
        if (knight.iframeTimer > 0 || knight.saveFlash > 0.25) {
          txt = isPl ? "I-FRAMES (NIETYKALNY · 0 DMG) ✓" : "I-FRAMES ACTIVE (0 DMG!) ✓";
          col = "#facc15";
        } else if (lastOutcome && lastOutcome.kind === "PHANTOM") {
          txt = isPl ? "WIDMOWE TRAFIENIE! (POWIETRZE!) ✗" : "PHANTOM HIT! AIR HIT YOU! ✗";
          col = "#f87171";
        } else if (knight.hurtFlash > 0.15) {
          txt = isPl ? "TRAFIONY! (0ms I-FRAMES) ✗" : "HIT! (0ms I-FRAMES) ✗";
          col = "#f87171";
        } else {
          txt = isPl ? "HURTBOX GRACZA (ZIELONY)" : "PLAYER HURTBOX (GREEN)";
          col = "#4ade80";
        }
        drawWorldPill(ctx, kp.x, kp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }

      // Label 2: Halberd Hitbox Status (keep cleanly separated above Knight's pill!)
      const bg = getBladeGeometry();
      const bp = projectToScreen(viewProj, bg.cx, 1.95, bg.cz, cssW, cssH);
      if (bp) {
        const overlap = kp && Math.abs(bp.x - kp.x) < 190 && Math.abs(bp.y - kp.y) < 34;
        const dy = overlap ? -32 : 0;
        let txt, col;
        if (boss.phase === "ACTIVE") {
          txt = fairMode
            ? (isPl ? "HITBOX OSTRZA (DOPASOWANY)" : "FITTED BLADE HITBOX (ACTIVE)")
            : (isPl ? "ROZDMUCHANY HITBOX JANK (+0.9m!)" : "JANK OVERSIZED HITBOX (+0.9m AIR!)");
          col = "#fb7185";
        } else if (boss.phase === "WINDUP") {
          txt = isPl ? "ZAMACH (BRAK HITBOXA) · UNIK!" : "WINDUP (SAFE) · PREPARE ROLL!";
          col = "#fbbf24";
        } else {
          txt = isPl ? "ODZYSK (BEZPIECZNIE)" : "RECOVERY (SAFE)";
          col = "#94a3b8";
        }
        drawWorldPill(ctx, bp.x, bp.y + dy, txt, col, cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${fairMode ? "FAIR 280ms" : "JANK 0ms"} · ${slowMo ? "0.28×" : "1×"} · Saves ${iframeSaves}`,
          fairMode ? "#facc15" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 158, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(12, 10, 24, 0.88)";
        ctx.strokeStyle = fairMode ? "rgba(250, 204, 21, 0.78)" : "rgba(244, 63, 94, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = fairMode ? "#facc15" : "#fb7185";
        ctx.fillText(fairMode ? "FAIR BOXES · 280ms I-FRAMES" : "JANK HITBOX (+0.9m) · 0ms I-FRAMES", px + 12, py + 21, panelW - 24);

        // Live Phase / Roll Timeline Bar
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 34, 52, 0.92)";
        ctx.beginPath(); ctx.roundRect(bx, py + 34, bw, 16, 4); ctx.fill();
        const phaseCol = boss.phase === "ACTIVE" ? "#f43f5e" : (boss.phase === "WINDUP" ? "#f59e0b" : "#64748b");
        const phasePct = boss.phase === "WINDUP" ? boss.t / 0.78 : (boss.phase === "ACTIVE" ? boss.t / 0.36 : boss.t / 0.86);
        ctx.fillStyle = phaseCol;
        ctx.beginPath(); ctx.roundRect(bx, py + 34, Math.max(6, bw * clamp(phasePct, 0, 1)), 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`BOSS: ${boss.phase}${slowMo ? "  [0.28× SLOW-MO]" : ""}`, bx + 7, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Uratowane I-Frames: ${iframeSaves}` : `I-Frame Roll Saves: ${iframeSaves}`, px + 12, py + 76, bw);
        ctx.fillStyle = "#fda4af";
        ctx.fillText(isPl ? `Trafienia: ${hitsTaken} (Widmowe: ${phantomHits})` : `Hits Taken: ${hitsTaken} (Phantom Air: ${phantomHits})`, px + 12, py + 98, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Zielony=Hurtbox · Złoty=I-Frames · Czerw.=Hitbox" : "Green=Hurtbox · Gold=I-Frames · Red=Hitbox", px + 12, py + 120, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Spacja = Unik · V = Slow-Mo · T = Fair/Jank" : "Space = Roll · V = Slow-Mo · T = Fair/Jank", px + 12, py + 142, bw);
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
        { id: "toggle-fair", label: fairMode ? (pl ? "Fair + 280ms I-Frames [T]" : "Fair + 280ms I-Frames [T]") : (pl ? "Jank Hitbox + 0ms [T]" : "Jank Hitbox + 0ms [T]"), pressed: fairMode },
        { id: "roll", label: pl ? "Unik / Roll [Spacja]" : "Dodge Roll [Space]", pressed: knight.rolling },
        { id: "slowmo", label: slowMo ? (pl ? "Slow-Mo 0.28× [V]" : "Slow-Mo 0.28× [V]") : (pl ? "Prędkość 1× [V]" : "Speed 1× [V]"), pressed: slowMo },
        { id: "xray", label: xrayOn ? (pl ? "Pudła X-Ray: WŁ [X]" : "X-Ray Boxes: ON [X]") : (pl ? "Pudła X-Ray: WYŁ [X]" : "X-Ray Boxes: OFF [X]"), pressed: xrayOn },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-fair") {
        fairMode = !fairMode;
        audio?.ruleSwitch?.(fairMode);
        if (autoDemo) knight.z = fairMode ? 1.48 : 2.34;
        setBanner(
          fairMode
            ? "FAIR MODE: FITTED BLADE HITBOX + 280ms GOLDEN I-FRAMES!"
            : "JANK MODE: BLOATED HITBOX HITS EMPTY AIR + 0ms I-FRAMES!",
          fairMode ? "#facc15" : "#fb7185",
          2.0
        );
      } else if (id === "roll") {
        autoDemo = false;
        triggerRoll(0, -1, { silent: false });
      } else if (id === "slowmo") {
        slowMo = !slowMo;
        audio?.ruleSwitch?.(slowMo);
      } else if (id === "xray") {
        xrayOn = !xrayOn;
        audio?.ruleSwitch?.(xrayOn);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-fair");
      else if (code === "Space") this.onAction("roll");
      else if (code === "KeyV") this.onAction("slowmo");
      else if (code === "KeyX") this.onAction("xray");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true; autoDemo = false;
        triggerRoll(world[0] - knight.x, world[2] - knight.z, { silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const rollAngle = knight.rolling ? (knight.rollT / knight.rollDur) * Math.PI * 2 : 0;
      const inIframe = knight.iframeTimer > 0;
      const knightTint = inIframe || knight.saveFlash > 0.25
        ? [1.0, 0.84, 0.16, 0.78]
        : (knight.hurtFlash > 0.1 ? [1.0, 0.18, 0.24, knight.hurtFlash * 0.85] : [1, 1, 1, 0]);

      const meshes = [
        {
          gpu: bossGpu, x: BOSS_X, y: 0.10, z: BOSS_Z, yaw: 0,
          animA: boss.angle, scale: BOSS_SCALE, pivot: [0, 1.18, 0], animMode: 3,
          tint: boss.phase === "ACTIVE" ? [1.0, 0.26, 0.30, 0.22] : [1, 1, 1, 0],
        },
        {
          gpu: knightGpu, x: knight.x, y: 0.05, z: knight.z, yaw: knight.yaw,
          animA: rollAngle, scale: 1.06, animMode: knight.rolling ? 4 : 0,
          tint: knightTint,
          alpha: inIframe ? 0.76 : 1.0,
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Brazier warm flame orbs
          for (const [bx, bz] of [[-5.6, -3.8], [5.6, -3.8], [-5.6, 3.6], [5.6, 3.6]]) {
            const p = 0.36 + 0.08 * Math.sin(time * 7 + bx);
            fx.billboard(bx, 1.25, bz, p, basis.right, basis.up, [1.0, 0.54, 0.14, 0.78], 2);
          }

          // Boss sweep danger floor ring
          if (boss.phase === "WINDUP") {
            fx.ringXZ(BOSS_X, 0.08, BOSS_Z, fairMode ? 3.38 : 4.38, [1.0, 0.70, 0.18, 0.55]);
          } else if (boss.phase === "ACTIVE") {
            fx.ringXZ(BOSS_X, 0.08, BOSS_Z, fairMode ? 3.38 : 4.38, [1.0, 0.22, 0.34, 0.72]);
          }

          // X-RAY HITBOX & HURTBOX VISUALIZER!
          if (xrayOn) {
            // 1. Knight's Hurtbox (Green = Vulnerable, Radiant Gold = Invincible I-Frames, Red = Hit!)
            const hr = fairMode ? 0.38 : 0.46;
            const hCol = (inIframe || knight.saveFlash > 0.25)
              ? [1.0, 0.86, 0.18, 0.92]
              : (knight.hurtFlash > 0.1 ? [1.0, 0.22, 0.28, 0.92] : [0.22, 0.95, 0.54, 0.85]);
            fx.xrayBox(knight.x - hr, knight.x + hr, 0.08, knight.rolling ? 1.15 : 1.72, knight.z - hr, knight.z + hr, hCol);
            fx.ringXZ(knight.x, 0.07, knight.z, inIframe ? 0.92 : 0.62, hCol);

            // 2. Boss Halberd Sweeping Hitbox (oriented box approximated cleanly by 2-3 aligned bounding boxes along blade!)
            const bg = getBladeGeometry();
            const isAct = boss.phase === "ACTIVE";
            const bCol = isAct ? [1.0, 0.18, 0.30, 0.92] : [1.0, 0.64, 0.18, 0.36];
            // Draw oriented hitbox volume along the blade center + outer overhang
            const segs = fairMode ? 2 : 3;
            for (let i = 0; i < segs; i++) {
              const frac = (i + 0.5) / segs;
              const rr = lerp(bg.rMin, bg.rMax, frac);
              const px = BOSS_X + bg.sinA * rr;
              const pz = BOSS_Z + bg.cosA * rr;
              const hs = bg.halfW;
              fx.xrayBox(px - hs, px + hs, bg.y0, bg.y1, pz - hs, pz + hs, bCol);
            }
            // In Jank Mode, highlight the empty-air overhang beam sticking past the steel tip!
            if (!fairMode) {
              const pTipX = BOSS_X + bg.sinA * bg.physRMax, pTipZ = BOSS_Z + bg.cosA * bg.physRMax;
              fx.beam(pTipX, 1.25, pTipZ, bg.tipX, 1.25, bg.tipZ, 0.22, [1.0, 0.18, 0.30, isAct ? 0.92 : 0.45], 4);
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
      return { fairMode, xrayOn, slowMo, iframeSaves, hitsTaken, phantomHits, bossPhase: boss.phase, autoDemo };
    },
  };
}
