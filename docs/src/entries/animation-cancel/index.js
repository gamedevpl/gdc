// Entry #21: Frame Data & Animation Cancel — Playable 3D Martial Dojo Sparring Arena!
// Shows why fighting & action games (Street Fighter, Hades, Devil May Cry) feel ultra-responsive:
// Attacks have Startup (Amber) -> Active (Crimson) -> Recovery (Blue). Dodge-Cancel slices off vulnerable
// Blue Recovery frames right on hit-confirm so you dodge the enemy's Counter-Strike!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getCancelMeshes } from "../../cancel-mesh.js";

const RONIN_HOME_X = -1.25;
const DUMMY_X = 1.35;

// Frame Data durations (60 FPS equivalent: 9f Startup, 7f Active, 29f Recovery!)
const DUR_STARTUP = 0.16;  // ~10f Amber
const DUR_ACTIVE = 0.12;   // ~7f Crimson
const DUR_RECOVERY = 0.50; // ~30f Cobalt Blue (vulnerable unless Dodge-Cancelled!)
const DUR_CANCEL_DASH = 0.28;

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.09, 0.05, 0.12],
    skyMid: [0.22, 0.11, 0.18],
    skyBot: [0.38, 0.20, 0.22],
    lightDir: [0.38, 0.85, 0.36],
    ambLow: [0.20, 0.14, 0.18],
    ambHigh: [0.48, 0.40, 0.42],
  });
  const m = getCancelMeshes();
  const roninGpu = studio.uploadMesh(m.ronin);
  const dummyGpu = studio.uploadMesh(m.automaton);

  // Build Warm Sunlit Japanese Dojo Courtyard with Shoji Back Wall & Sparring Mat
  const wBuf = [];
  // Polished cedar dojo floorboards
  pushBox(wBuf, -7.2, 7.2, -0.45, 0.0, -5.0, 4.8, [0.58, 0.40, 0.24], 4);
  // Dark lacquered perimeter step
  pushBox(wBuf, -7.2, 7.2, 0.0, 0.16, -5.0, -4.6, [0.20, 0.14, 0.12], 1);
  // Central Crimson & Gold Tatami Sparring Mat
  pushBox(wBuf, -4.6, 4.6, 0.0, 0.05, -2.5, 2.5, [0.68, 0.22, 0.28], 0);
  pushBox(wBuf, -4.2, 4.2, 0.05, 0.07, -2.1, 2.1, [0.76, 0.66, 0.48], 0);
  // Shoji Back Wall with Timber Columns & Warm Glowing Paper Panels
  pushBox(wBuf, -7.2, 7.2, 0.16, 2.85, -5.2, -4.75, [0.90, 0.84, 0.72], 4);
  for (let px = -6.6; px <= 6.61; px += 2.2) {
    pushBox(wBuf, px - 0.14, px + 0.14, 0.0, 3.05, -4.85, -4.55, [0.24, 0.15, 0.10], 4);
  }
  pushBox(wBuf, -7.2, 7.2, 2.80, 3.12, -5.25, -4.50, [0.22, 0.14, 0.10], 4);
  // Two Dojo Lantern Pedestals flanking the sparring mat
  for (const lx of [-5.2, 5.2]) {
    pushBox(wBuf, lx - 0.30, lx + 0.30, 0.0, 1.15, -3.4, -2.8, [0.26, 0.18, 0.14], 4);
    pushBox(wBuf, lx - 0.22, lx + 0.22, 1.15, 1.62, -3.32, -2.88, [1.0, 0.68, 0.28], 2);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.04, pitch: 0.44, dist: 12.2, targetX: 0.0, targetY: 1.05, targetZ: 0.25, fovDeg: 40 };

  let time = 0;
  let cancelOn = true;   // ON: Dodge-Cancel cuts Blue Recovery right on hit! | OFF: Locked in Blue Recovery!
  let slowMo = false;
  let autoDemo = true;
  let autoCd = 0.45;
  let userInteracted = false;

  let cancelsCount = 0;
  let punishedCount = 0;
  let msSavedTotal = 0;

  // Ronin State Machine: IDLE -> STARTUP -> ACTIVE -> RECOVERY | CANCEL_DASH
  const ronin = {
    x: RONIN_HOME_X,
    state: "IDLE",
    t: 0,
    bladeAngle: 0.15,
    hitLanded: false,
    hurtFlash: 0,
    ghostX: RONIN_HOME_X,
    ghostLife: 0,
    cancelledAtFrac: null, // fraction of recovery where cancel sliced!
  };

  // Training Automaton Counter-Club State Machine: IDLE -> WINDUP -> COUNTER -> COOL
  const dummy = {
    x: DUMMY_X,
    state: "IDLE",
    t: 0,
    clubAngle: -0.25,
    hitFlash: 0,
    counterResolved: false,
  };

  let sparks = [];
  let bannerText = "";
  let bannerColor = "#ec4899";
  let bannerTimer = 0;
  let lastResult = null; // { kind: "CANCEL" | "PUNISHED", life }

  function setBanner(t, c = "#ec4899", dur = 1.9) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function spawnSparks(x, y, z, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 2.8;
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 2.5, vz: Math.sin(a) * sp, r, g, b, size: 0.17, life: 0.46, maxLife: 0.46 });
    }
  }

  function reset() {
    time = 0;
    autoDemo = true; autoCd = 0.40; slowMo = false;
    cancelsCount = 0; punishedCount = 0; msSavedTotal = 0;
    ronin.x = RONIN_HOME_X; ronin.state = "IDLE"; ronin.t = 0; ronin.bladeAngle = 0.15;
    ronin.hitLanded = false; ronin.hurtFlash = 0; ronin.ghostLife = 0; ronin.cancelledAtFrac = null;
    dummy.x = DUMMY_X; dummy.state = "IDLE"; dummy.t = 0; dummy.clubAngle = -0.25;
    dummy.hitFlash = 0; dummy.counterResolved = false;
    sparks = []; lastResult = null; bannerTimer = 0;
  }
  reset();

  function startHeavySlash({ silent = false } = {}) {
    if (ronin.state !== "IDLE") return;
    ronin.state = "STARTUP";
    ronin.t = 0;
    ronin.hitLanded = false;
    ronin.cancelledAtFrac = null;
    if (!silent) audio?.slash?.(2);
  }

  function triggerDodgeCancel({ silent = false } = {}) {
    if (!cancelOn) {
      if (!silent) {
        audio?.inputIgnored?.();
        setBanner("CANCEL DISABLED! LOCKED IN 500ms BLUE RECOVERY!", "#60a5fa", 1.7);
      }
      return false;
    }
    if (ronin.state === "RECOVERY" || (ronin.state === "ACTIVE" && ronin.hitLanded)) {
      const remMs = ronin.state === "RECOVERY" ? Math.round(Math.max(0, DUR_RECOVERY - ronin.t) * 1000) : Math.round(DUR_RECOVERY * 1000);
      ronin.cancelledAtFrac = ronin.state === "RECOVERY" ? clamp(ronin.t / DUR_RECOVERY, 0, 1) : 0.04;
      ronin.ghostX = ronin.x;
      ronin.ghostLife = 0.85;
      ronin.state = "CANCEL_DASH";
      ronin.t = 0;
      cancelsCount++;
      msSavedTotal += remMs;
      lastResult = { kind: "CANCEL", ms: remMs, life: 1.6 };
      spawnSparks(ronin.ghostX, 1.0, 0.0, 0.96, 0.28, 0.68, 20);
      if (!silent) audio?.sandDash?.();
      if (!silent) setBanner(`RECOVERY CANCELLED! (-${remMs}ms SAVED) → DODGED COUNTER ✓`, "#f472b6", 1.9);
      return true;
    }
    return false;
  }

  function update(rawDt) {
    const dt = rawDt * (slowMo ? 0.32 : 1.0);
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - rawDt);
    if (ronin.hurtFlash > 0) ronin.hurtFlash = Math.max(0, ronin.hurtFlash - rawDt * 2.2);
    if (ronin.ghostLife > 0) ronin.ghostLife = Math.max(0, ronin.ghostLife - dt);
    if (dummy.hitFlash > 0) dummy.hitFlash = Math.max(0, dummy.hitFlash - rawDt * 3.0);
    if (lastResult) { lastResult.life -= rawDt; if (lastResult.life <= 0) lastResult = null; }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.0 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }

    // Auto-Demo cycles clean Heavy Slashes showing Cancel-Dodge vs Locked-Punish!
    if (autoDemo && ronin.state === "IDLE" && dummy.state === "IDLE") {
      autoCd -= dt;
      if (autoCd <= 0) {
        startHeavySlash({ silent: !userInteracted });
        autoCd = 1.05;
      }
    }

    // 1. Ronin Frame Data State Machine
    ronin.t += dt;
    if (ronin.state === "IDLE") {
      ronin.x = lerp(ronin.x, RONIN_HOME_X, clamp(dt * 6.0, 0, 1));
      ronin.bladeAngle = lerp(ronin.bladeAngle, 0.15, clamp(dt * 8.0, 0, 1));
    } else if (ronin.state === "STARTUP") {
      const p = clamp(ronin.t / DUR_STARTUP, 0, 1);
      ronin.x = lerp(RONIN_HOME_X, RONIN_HOME_X + 0.25, p);
      ronin.bladeAngle = lerp(0.15, -1.55, p);
      if (ronin.t >= DUR_STARTUP) {
        ronin.state = "ACTIVE";
        ronin.t = 0;
      }
    } else if (ronin.state === "ACTIVE") {
      const p = clamp(ronin.t / DUR_ACTIVE, 0, 1);
      ronin.x = lerp(RONIN_HOME_X + 0.25, RONIN_HOME_X + 0.72, p);
      ronin.bladeAngle = lerp(-1.55, 1.42, p);
      if (!ronin.hitLanded && p >= 0.45) {
        ronin.hitLanded = true;
        dummy.hitFlash = 1.0;
        spawnSparks(DUMMY_X - 0.35, 1.05, 0.0, 1.0, 0.36, 0.34, 18);
        if (userInteracted) audio?.hitEnemy?.(true);
        // Automaton immediately queues its fast Counter-Club strike!
        if (dummy.state === "IDLE") {
          dummy.state = "WINDUP";
          dummy.t = 0;
          dummy.counterResolved = false;
        }
      }
      if (ronin.t >= DUR_ACTIVE) {
        ronin.state = "RECOVERY";
        ronin.t = 0;
      }
    } else if (ronin.state === "RECOVERY") {
      const p = clamp(ronin.t / DUR_RECOVERY, 0, 1);
      ronin.bladeAngle = lerp(1.42, 0.15, p * p);
      // In Auto-Demo with Cancel ON: slices Blue Recovery cleanly at ~75ms right as Automaton winds up!
      if (autoDemo && cancelOn && ronin.t >= 0.08) {
        triggerDodgeCancel({ silent: !userInteracted });
      } else if (ronin.t >= DUR_RECOVERY) {
        ronin.state = "IDLE";
        ronin.t = 0;
      }
    } else if (ronin.state === "CANCEL_DASH") {
      const p = clamp(ronin.t / DUR_CANCEL_DASH, 0, 1);
      ronin.x = lerp(ronin.ghostX, RONIN_HOME_X - 2.15, 1 - Math.pow(1 - p, 3));
      ronin.bladeAngle = lerp(ronin.bladeAngle, -0.35, clamp(dt * 12, 0, 1));
      if (ronin.t >= DUR_CANCEL_DASH) {
        ronin.state = "IDLE";
        ronin.t = 0;
      }
    }

    // 2. Automaton Counter-Club State Machine
    if (dummy.state !== "IDLE") {
      dummy.t += dt;
      if (dummy.state === "WINDUP") {
        const p = clamp(dummy.t / 0.22, 0, 1);
        dummy.clubAngle = lerp(-0.25, -1.45, p);
        if (dummy.t >= 0.22) { dummy.state = "COUNTER"; dummy.t = 0; }
      } else if (dummy.state === "COUNTER") {
        const p = clamp(dummy.t / 0.18, 0, 1);
        dummy.clubAngle = lerp(-1.45, 1.35, p);
        if (!dummy.counterResolved && p >= 0.45) {
          dummy.counterResolved = true;
          // Did Ronin dash clear out of club reach (x < -1.55) or is he STILL stuck in Blue Recovery?
          if (ronin.x > -1.55) {
            punishedCount++;
            ronin.hurtFlash = 1.0;
            lastResult = { kind: "PUNISHED", life: 1.65 };
            spawnSparks(ronin.x, 1.05, 0.0, 1.0, 0.20, 0.26, 22);
            if (userInteracted) audio?.playerHurt?.();
            if (userInteracted) setBanner("PUNISHED IN BLUE RECOVERY! LOCKED ANIMATION ATE THE COUNTER! ✗", "#f87171", 2.0);
          }
        }
        if (dummy.t >= 0.18) { dummy.state = "COOL"; dummy.t = 0; }
      } else if (dummy.state === "COOL") {
        const p = clamp(dummy.t / 0.36, 0, 1);
        dummy.clubAngle = lerp(1.35, -0.25, p);
        if (dummy.t >= 0.36) { dummy.state = "IDLE"; dummy.t = 0; }
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Label 1: Ronin Live Phase / Cancel Callout
      const rp = projectToScreen(viewProj, ronin.x, 2.20, 0.0, cssW, cssH);
      if (rp) {
        let txt, col;
        if (ronin.state === "STARTUP") { txt = isPl ? "STARTUP (10f · ROZRUCH)" : "STARTUP (10f · WINDUP)"; col = "#fbbf24"; }
        else if (ronin.state === "ACTIVE") { txt = isPl ? "ACTIVE (7f · TRAFIENIE!)" : "ACTIVE (7f · HITBOX LIVE!)"; col = "#fb7185"; }
        else if (ronin.state === "RECOVERY") { txt = isPl ? "RECOVERY (30f · ZABLOKOWANY!)" : "RECOVERY (30f · VULNERABLE!)"; col = "#60a5fa"; }
        else if (ronin.state === "CANCEL_DASH" || (lastResult && lastResult.kind === "CANCEL")) {
          txt = isPl ? `CANCEL! (-${lastResult?.ms || 420}ms · UNIK ✓)` : `CANCELLED RECOVERY! (-${lastResult?.ms || 420}ms ✓)`;
          col = "#f472b6";
        } else if (lastResult && lastResult.kind === "PUNISHED") {
          txt = isPl ? "UKARANY W RECOVERY! ✗" : "PUNISHED IN RECOVERY! ✗";
          col = "#f87171";
        } else {
          txt = isPl ? "RONIN (GOTOWY · SPACJA = CIOS)" : "RONIN (READY · SPACE = SLASH)";
          col = "#f8fafc";
        }
        drawWorldPill(ctx, rp.x, rp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }

      // Label 2: Automaton Counter Strike
      const dp = projectToScreen(viewProj, dummy.x, 2.20, 0.0, cssW, cssH);
      if (dp) {
        const dy = rp && Math.abs(dp.x - rp.x) < 140 ? -26 : 0;
        const txt = dummy.state === "WINDUP" || dummy.state === "COUNTER"
          ? (isPl ? "KONTRATAK AUTOMATU!" : "COUNTER-STRIKE SWING!")
          : (isPl ? "MANEKIN KONTRATAKU" : "COUNTER AUTOMATON");
        drawWorldPill(ctx, dp.x, dp.y + dy, txt, dummy.state === "IDLE" ? "#cbd5e1" : "#fb923c", cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${cancelOn ? "CANCEL ON" : "LOCKED RECOVERY"} · ${ronin.state} · Saved ${cancelsCount}`,
          cancelOn ? "#ec4899" : "#60a5fa",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 324, panelH = 166, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(14, 10, 26, 0.90)";
        ctx.strokeStyle = cancelOn ? "rgba(236, 72, 153, 0.84)" : "rgba(96, 165, 250, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = cancelOn ? "#f472b6" : "#60a5fa";
        ctx.fillText(cancelOn ? "ANIMATION CANCEL · CUTS BLUE RECOVERY!" : "NO CANCEL · FULL 30f RECOVERY LOCK!", px + 12, py + 21);

        // Live 60 FPS Fighting-Game Frame Timeline Bar (10f Amber | 7f Crimson | 30f Blue)
        const bx = px + 12, bw = panelW - 24, by = py + 34, bh = 22;
        const totalDur = DUR_STARTUP + DUR_ACTIVE + DUR_RECOVERY;
        const w1 = bw * (DUR_STARTUP / totalDur);
        const w2 = bw * (DUR_ACTIVE / totalDur);
        const w3 = bw - w1 - w2;
        ctx.fillStyle = "#d97706"; ctx.fillRect(bx, by, w1 - 1, bh);
        ctx.fillStyle = "#e11d48"; ctx.fillRect(bx + w1, by, w2 - 1, bh);
        ctx.fillStyle = cancelOn ? "rgba(59, 130, 246, 0.35)" : "#2563eb";
        ctx.fillRect(bx + w1 + w2, by, w3, bh);
        ctx.font = "800 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("10f", bx + 14, by + 14.5);
        ctx.fillText("7f", bx + w1 + 10, by + 14.5);
        ctx.fillText(cancelOn ? "✂ CANCELLED 30f RECOVERY!" : "30f LOCKED RECOVERY", bx + w1 + w2 + 8, by + 14.5);

        // Live Playhead Cursor across the frame strip!
        let curDur = -1;
        if (ronin.state === "STARTUP") curDur = ronin.t;
        else if (ronin.state === "ACTIVE") curDur = DUR_STARTUP + ronin.t;
        else if (ronin.state === "RECOVERY") curDur = DUR_STARTUP + DUR_ACTIVE + ronin.t;
        else if (ronin.state === "CANCEL_DASH") curDur = DUR_STARTUP + DUR_ACTIVE + (ronin.cancelledAtFrac || 0.1) * DUR_RECOVERY;
        if (curDur >= 0) {
          const cx = bx + clamp(curDur / totalDur, 0, 1) * bw;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(cx - 1.5, by - 3, 3, bh + 6);
        }

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#f472b6";
        ctx.fillText(isPl ? `Anulowane: ${cancelsCount} (Zaoszczędzono ${msSavedTotal}ms)` : `Cancels Executed: ${cancelsCount} (${msSavedTotal}ms saved)`, px + 12, py + 82, bw);
        ctx.fillStyle = "#fca5a5";
        ctx.fillText(isPl ? `Ukarania w Blue Recovery: ${punishedCount}` : `Punished in Recovery: ${punishedCount}`, px + 12, py + 104, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Żółty=Startup · Czerw.=Active · Nieb.=Recovery" : "Amber=Startup · Red=Active · Blue=Recovery", px + 12, py + 126, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Spacja=Cięcie · Shift=Cancel · V=Slow-Mo · T" : "Space=Slash · Shift=Cancel · V=Slow-Mo · T", px + 12, py + 148, bw);
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
        { id: "toggle-cancel", label: cancelOn ? (pl ? "Dodge-Cancel: WŁ [T]" : "Dodge-Cancel: ON [T]") : (pl ? "Cancel: WYŁ (Blokada) [T]" : "Cancel: OFF (Locked) [T]"), pressed: cancelOn },
        { id: "slash", label: pl ? "Cięcie [Spacja]" : "Heavy Slash [Space]", pressed: ronin.state === "ACTIVE" },
        { id: "cancel-dash", label: pl ? "Anuluj / Dash [Shift]" : "Cancel Dash [Shift]", pressed: ronin.state === "CANCEL_DASH" },
        { id: "slowmo", label: slowMo ? (pl ? "Slow-Mo 0.32× [V]" : "Slow-Mo 0.32× [V]") : (pl ? "Prędkość 1× [V]" : "Speed 1× [V]"), pressed: slowMo },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-cancel") {
        cancelOn = !cancelOn;
        audio?.ruleSwitch?.(cancelOn);
        if (autoDemo) autoCd = 0.15;
        setBanner(
          cancelOn
            ? "DODGE-CANCEL ON: SLICE OFF 420ms BLUE RECOVERY & DODGE COUNTER!"
            : "CANCEL OFF: TRAPPED IN FULL 500ms BLUE RECOVERY — GETS PUNISHED!",
          cancelOn ? "#f472b6" : "#60a5fa",
          2.0
        );
      } else if (id === "slash") {
        autoDemo = false;
        startHeavySlash({ silent: false });
      } else if (id === "cancel-dash") {
        autoDemo = false;
        triggerDodgeCancel({ silent: false });
      } else if (id === "slowmo") {
        slowMo = !slowMo;
        audio?.ruleSwitch?.(slowMo);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-cancel");
      else if (code === "Space") this.onAction("slash");
      else if (code === "ShiftLeft" || code === "ShiftRight") this.onAction("cancel-dash");
      else if (code === "KeyV") this.onAction("slowmo");
    },
    onClickWorld(_world, { button } = {}) {
      if (button === 0) {
        userInteracted = true; autoDemo = false;
        if (ronin.state === "RECOVERY" || (ronin.state === "ACTIVE" && ronin.hitLanded)) triggerDodgeCancel({ silent: false });
        else startHeavySlash({ silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      let roninTint = [1, 1, 1, 0];
      if (ronin.hurtFlash > 0.1) roninTint = [1.0, 0.20, 0.26, ronin.hurtFlash * 0.85];
      else if (ronin.state === "STARTUP") roninTint = [1.0, 0.72, 0.16, 0.45];
      else if (ronin.state === "ACTIVE") roninTint = [1.0, 0.20, 0.34, 0.55];
      else if (ronin.state === "RECOVERY") roninTint = [0.26, 0.58, 1.0, 0.52];
      else if (ronin.state === "CANCEL_DASH") roninTint = [0.96, 0.28, 0.68, 0.62];

      const meshes = [
        {
          gpu: roninGpu, x: ronin.x, y: 0.07, z: 0.0, yaw: Math.PI * 0.5,
          animA: ronin.bladeAngle, scale: 1.18, pivot: [0, 0.92, 0], animMode: 3, tint: roninTint,
        },
        {
          gpu: dummyGpu, x: dummy.x, y: 0.07, z: 0.0, yaw: -Math.PI * 0.5,
          animA: dummy.clubAngle, scale: 1.18, pivot: [0, 1.00, 0], animMode: 3,
          tint: dummy.hitFlash > 0.05 ? [1.0, 0.92, 0.86, dummy.hitFlash * 0.8] : (dummy.state === "COUNTER" ? [1.0, 0.44, 0.14, 0.4] : [1, 1, 1, 0]),
        },
      ];
      // Translucent Magenta Afterimage Ghost showing where Ronin cancelled out of Blue Recovery!
      if (ronin.ghostLife > 0.02) {
        meshes.push({
          gpu: roninGpu, x: ronin.ghostX, y: 0.07, z: 0.0, yaw: Math.PI * 0.5,
          animA: 1.35, scale: 1.18, pivot: [0, 0.92, 0], animMode: 3,
          alpha: clamp(ronin.ghostLife / 0.85, 0, 1) * 0.55,
          tint: [0.96, 0.28, 0.68, 0.92],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Warm glowing Dojo Lantern orbs
          for (const lx of [-5.2, 5.2]) {
            fx.billboard(lx, 1.45, -3.1, 0.42, basis.right, basis.up, [1.0, 0.72, 0.28, 0.72], 2);
          }
          // Phase floor aura under Ronin
          const auraCol = ronin.state === "STARTUP" ? [1.0, 0.72, 0.16, 0.82]
            : ronin.state === "ACTIVE" ? [1.0, 0.20, 0.34, 0.90]
            : ronin.state === "RECOVERY" ? [0.26, 0.58, 1.0, 0.85]
            : ronin.state === "CANCEL_DASH" ? [0.96, 0.28, 0.68, 0.90]
            : [0.92, 0.95, 1.0, 0.30];
          fx.ringXZ(ronin.x, 0.09, 0.0, 0.95, auraCol);

          // Blazing Katana Slash Arc Beam during ACTIVE
          if (ronin.state === "ACTIVE") {
            fx.coneXZ(ronin.x, 1.02, 0.0, Math.PI * 0.5, 0.72, 2.55, [1.0, 0.22, 0.36, 0.88]);
          }
          // Automaton Counter-Club Danger Cone!
          if (dummy.state === "WINDUP" || dummy.state === "COUNTER") {
            fx.coneXZ(dummy.x, 1.05, 0.0, -Math.PI * 0.5, 0.58, 2.75, dummy.state === "COUNTER" ? [1.0, 0.36, 0.14, 0.82] : [1.0, 0.68, 0.18, 0.42]);
          }
          // Dash Cancel trail line between Ghost and Ronin!
          if (ronin.ghostLife > 0.05) {
            fx.beam(ronin.ghostX, 0.95, 0.0, ronin.x, 0.95, 0.0, 0.20, [0.96, 0.28, 0.68, clamp(ronin.ghostLife, 0, 1) * 0.85], 0);
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
      return { cancelOn, slowMo, roninState: ronin.state, cancelsCount, punishedCount, msSavedTotal, autoDemo };
    },
  };
}
