// Entry #38: First-Shot Miss & Off-Screen AI Courtesy — Playable 3D Noir Ambush Plaza!
// Shows two invisible fairness rules used by BioShock, Half-Life 2, and Doom Eternal:
// (1) Gunners outside the player's 72-deg camera FOV cone hold fire instead of shooting you in the back,
// (2) First visible shot deliberately misses 0.65m wide as a dramatic warning tracer!
import { clamp } from "../../gl-utils.js";
import {
  createStudioRenderer,
  pushBox,
  projectToScreen,
  drawWorldPill,
  drawBanner,
  drawMobilePill,
} from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const FOV_HALF_RAD = (36 * Math.PI) / 180; // 72 deg total Camera FOV Cone
const FOV_LEN = 7.4;
const WARN_MISS_OFFSET = 0.65;

const GUNNER_SLOTS = [
  { id: "N", x:  0.0, z: -4.6, isSniper: true },
  { id: "E", x:  4.8, z:  0.0, isSniper: false },
  { id: "S", x:  0.0, z:  4.6, isSniper: true },
  { id: "W", x: -4.8, z:  0.0, isSniper: false },
];

const AUTO_YAWS = [Math.PI, Math.PI * 0.5, 0.0, -Math.PI * 0.5];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.05, 0.04, 0.07],
    skyMid: [0.12, 0.09, 0.13],
    skyBot: [0.20, 0.13, 0.14],
    lightDir: [0.35, 0.86, 0.36],
    ambLow: [0.16, 0.12, 0.15],
    ambHigh: [0.42, 0.34, 0.36],
  });

  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);
  const sniperGpu = studio.uploadMesh(m.sniper);

  // Build Circular Noir Stone Plaza with warm perimeter lantern bollards & 4 gunner alcoves
  const wBuf = [];
  // Main stone courtyard base
  pushBox(wBuf, -7.2, 7.2, -0.45, 0.0, -6.6, 6.6, [0.27, 0.24, 0.26], 0);
  // Layered octagonal-feel circular plaza terrace
  pushBox(wBuf, -5.8, 5.8, 0.0, 0.07, -4.6, 4.6, [0.33, 0.30, 0.32], 0);
  pushBox(wBuf, -4.6, 4.6, 0.0, 0.07, -5.8, 5.8, [0.33, 0.30, 0.32], 0);
  // Central Hero stone medallion
  pushBox(wBuf, -1.25, 1.25, 0.07, 0.14, -1.25, 1.25, [0.42, 0.38, 0.38], 1);
  // 8 Warm Noir Perimeter Lantern Bollards around the plaza ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = Math.sin(a) * 6.05;
    const bz = Math.cos(a) * 6.05;
    pushBox(wBuf, bx - 0.30, bx + 0.30, 0.0, 1.35, bz - 0.30, bz + 0.30, [0.34, 0.30, 0.34], 1);
    pushBox(wBuf, bx - 0.22, bx + 0.22, 1.35, 1.72, bz - 0.22, bz + 0.22, [1.0, 0.70, 0.26], 2);
  }
  // Low stone cover backs behind each N, E, S, W gunner station
  pushBox(wBuf, -1.15, 1.15, 0.07, 0.78, -5.65, -5.22, [0.40, 0.36, 0.38], 1);
  pushBox(wBuf, -1.15, 1.15, 0.07, 0.78,  5.22,  5.65, [0.40, 0.36, 0.38], 1);
  pushBox(wBuf,  5.45, 5.88, 0.07, 0.78, -1.15,  1.15, [0.40, 0.36, 0.38], 1);
  pushBox(wBuf, -5.88,-5.45, 0.07, 0.78, -1.15,  1.15, [0.40, 0.36, 0.38], 1);
  studio.setWorldData(wBuf);

  const defaultCam = {
    yaw: 0.0,
    pitch: 0.74,
    dist: 16.5,
    targetX: 0.0,
    targetY: 0.35,
    targetZ: 0.2,
    fovDeg: 40,
  };

  let time = 0;
  let courtesyOn = true; // [T] Fair Courtesy ON vs Realistic Brutal AI
  let autoDemo = true;
  let autoIdx = 0;
  let autoHoldT = 2.9;
  let userInteracted = false;

  const hero = {
    x: 0.0,
    z: 0.0,
    yaw: Math.PI, // Facing North initially!
    targetYaw: Math.PI,
    hp: 100,
    hitFlash: 0,
    deadT: 0,
  };

  let gunners = [];
  let tracers = [];
  let sparks = [];
  let warningMisses = 0;
  let offscreenHeld = 0;
  let backstabHits = 0;

  let bannerText = "";
  let bannerColor = "#4ade80";
  let bannerTimer = 0;

  function setBanner(t, c = "#4ade80", dur = 2.1) {
    bannerText = t;
    bannerColor = c;
    bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 2.4;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.4 + Math.random() * 2.2,
        vz: Math.sin(a) * sp,
        r, g, b,
        life: 0.45, maxLife: 0.45,
      });
    }
  }

  function initGunners() {
    gunners = GUNNER_SLOTS.map((s, idx) => ({
      ...s,
      yaw: Math.atan2(-s.x, -s.z),
      inFov: false,
      firstShotUsed: false,
      cd: idx === 0 ? 0.32 : 0.45 + idx * 0.14,
      recoil: 0,
      status: "WAIT", // OFF_WAIT | WARN_MISS | FOLLOWUP | LETHAL_HIT
      statusT: 0,
      holdPulse: 0,
    }));
  }

  function reset() {
    time = 0;
    autoDemo = true;
    autoIdx = 0;
    autoHoldT = 2.9;
    hero.yaw = Math.PI;
    hero.targetYaw = Math.PI;
    hero.hp = 100;
    hero.hitFlash = 0;
    hero.deadT = 0;
    tracers = [];
    sparks = [];
    warningMisses = 0;
    offscreenHeld = 0;
    backstabHits = 0;
    bannerTimer = 0;
    initGunners();
  }
  reset();

  function triggerAmbushVolley({ silent = false } = {}) {
    hero.hp = 100;
    hero.deadT = 0;
    hero.hitFlash = 0;
    for (let i = 0; i < gunners.length; i++) {
      const g = gunners[i];
      g.firstShotUsed = false;
      g.cd = 0.08 + i * 0.06;
      g.statusT = 0;
    }
    if (!silent) {
      setBanner(
        courtesyOn
          ? "AMBUSH VOLLEY: OFF-SCREEN GUNNERS HOLD FIRE + 1ST SHOT WARNING MISS! ✓"
          : "BRUTAL AMBUSH: ALL 4 GUNNERS SHOOT IN THE BACK WITH LETHAL AIM! ✗",
        courtesyOn ? "#4ade80" : "#f87171",
        2.3
      );
    }
  }

  function fireGunnerShot(g, isInFov) {
    const dirX = -g.x;
    const dirZ = -g.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len, nz = dirZ / len;
    const perpX = -nz, perpZ = nx;
    const sx = g.x + nx * 1.05;
    const sz = g.z + nz * 1.05;

    g.recoil = 0.30;

    if (courtesyOn) {
      // First shot ALWAYS misses deliberately 0.65m wide as a dramatic warning tracer!
      if (!g.firstShotUsed) {
        g.firstShotUsed = true;
        g.status = "WARN_MISS";
        g.statusT = 1.65;
        g.cd = 1.85;
        warningMisses++;

        const side = (warningMisses % 2 === 0) ? 1 : -1;
        const ex = perpX * WARN_MISS_OFFSET * side + nx * 2.2;
        const ez = perpZ * WARN_MISS_OFFSET * side + nz * 2.2;
        tracers.push({ sx, sz, ex, ez, kind: "warn", life: 0.72, maxLife: 0.72 });
        spawnSparks(perpX * WARN_MISS_OFFSET * side, 0.95, perpZ * WARN_MISS_OFFSET * side, 1.0, 0.84, 0.18, 12);
        if (userInteracted) audio?.mercyShield?.();
      } else {
        // Delayed follow-up shot (player had full reaction window!)
        g.status = "FOLLOWUP";
        g.statusT = 1.0;
        g.cd = 1.65;
        hero.hp = Math.max(20, hero.hp - 14);
        hero.hitFlash = 0.65;
        tracers.push({ sx, sz, ex: hero.x, ez: hero.z, kind: "hit", life: 0.42, maxLife: 0.42 });
        spawnSparks(hero.x, 1.05, hero.z, 1.0, 0.56, 0.20, 10);
        if (userInteracted) audio?.laserShot?.(false);
      }
    } else {
      // Realistic Brutal AI: lethal pinpoint aim from every direction, including behind your camera!
      g.status = isInFov ? "LETHAL_FRONT" : "BACKSTAB";
      g.statusT = 1.2;
      g.cd = 0.36;
      hero.hp = Math.max(0, hero.hp - 34);
      hero.hitFlash = 1.0;
      if (!isInFov) backstabHits++;

      tracers.push({ sx, sz, ex: hero.x, ez: hero.z, kind: "brutal", life: 0.48, maxLife: 0.48 });
      spawnSparks(hero.x, 1.05, hero.z, 1.0, 0.22, 0.26, 14);
      if (userInteracted) audio?.laserShot?.(false);

      if (hero.hp <= 0 && hero.deadT <= 0) {
        hero.deadT = 1.55;
        if (userInteracted) audio?.alertBuzzer?.();
        setBanner("SHOT IN THE BACK! 0% HP IN <1s WITHOUT OFF-SCREEN COURTESY ✗", "#f87171", 2.2);
      }
    }
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (hero.hitFlash > 0) hero.hitFlash = Math.max(0, hero.hitFlash - dt * 2.4);

    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.5 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.08, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    // Respawn Hero cleanly after getting melted in Brutal mode
    if (hero.deadT > 0) {
      hero.deadT -= dt;
      if (hero.deadT <= 0) {
        hero.hp = 100;
        for (const g of gunners) { g.cd = 0.22 + Math.random() * 0.14; g.firstShotUsed = false; }
      }
      return;
    }

    // Smoothly regen HP in Courtesy mode during calm beats
    if (courtesyOn && hero.hp < 100) {
      hero.hp = Math.min(100, hero.hp + 12 * dt);
    }

    // Hero Camera FOV Cone rotation: A/D or Arrow keys, or periodic auto-demo turn
    const left = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const right = keys?.has("KeyD") || keys?.has("ArrowRight");
    if (left || right) {
      autoDemo = false;
      userInteracted = true;
      hero.targetYaw = wrapAngle(hero.targetYaw + ((left ? 1 : 0) - (right ? 1 : 0)) * 2.4 * dt);
    } else if (autoDemo) {
      autoHoldT -= dt;
      if (autoHoldT <= 0) {
        autoIdx = (autoIdx + 1) % AUTO_YAWS.length;
        hero.targetYaw = AUTO_YAWS[autoIdx];
        autoHoldT = 3.1;
      }
    }
    hero.yaw = wrapAngle(hero.yaw + wrapAngle(hero.targetYaw - hero.yaw) * clamp(dt * 9.5, 0, 1));

    // Evaluate all 4 gunners against Hero's live 72-deg Camera FOV Cone!
    for (const g of gunners) {
      g.recoil = Math.max(0, g.recoil - dt * 2.6);
      if (g.statusT > 0) g.statusT = Math.max(0, g.statusT - dt);

      const angToGunner = Math.atan2(g.x - hero.x, g.z - hero.z);
      const angDiff = Math.abs(wrapAngle(angToGunner - hero.yaw));
      const wasInFov = g.inFov;
      g.inFov = angDiff <= FOV_HALF_RAD;

      // Reset first-shot grace whenever a gunner leaves your camera view and re-enters later!
      if (!g.inFov && wasInFov) {
        g.firstShotUsed = false;
        g.cd = 0.34;
      }

      if (courtesyOn && !g.inFov) {
        // OFF-SCREEN COURTESY: Hold fire & display pulsing directional warning!
        g.status = "OFF_WAIT";
        g.holdPulse += dt * 4.5;
        g.cd -= dt;
        if (g.cd <= 0) {
          offscreenHeld++;
          g.cd = 1.25;
        }
        continue;
      }

      g.cd -= dt;
      if (g.cd <= 0) {
        fireGunnerShot(g, g.inFov);
      }
    }
  }

  function drawRadarDiagram(ctx, cx, cy, rad) {
    ctx.save();
    ctx.fillStyle = "rgba(14, 12, 22, 0.94)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Note screen 2D radar mapping: +X right, +Z down, so world yaw=0 (+Z) is +PI/2 in canvas atan2(y,x)
    const canvasYaw = Math.PI * 0.5 - hero.yaw;
    ctx.fillStyle = "rgba(34, 211, 238, 0.24)";
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad - 2, canvasYaw - FOV_HALF_RAD, canvasYaw + FOV_HALF_RAD);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4 Gunner pips
    for (const g of gunners) {
      const gx = cx + (g.x / 5.8) * (rad - 6);
      const gy = cy + (g.z / 5.8) * (rad - 6);
      ctx.fillStyle = !courtesyOn
        ? "#f87171"
        : (g.inFov ? (g.status === "WARN_MISS" ? "#facc15" : "#4ade80") : "#fb923c");
      ctx.beginPath();
      ctx.arc(gx, gy, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center hero pip
    ctx.fillStyle = hero.hp <= 0 ? "#f87171" : "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 4.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Hero center status pill
      const hp = projectToScreen(viewProj, hero.x, 2.25, hero.z, cssW, cssH);
      if (hp) {
        const txt = hero.hp <= 0
          ? (isPl ? "STRZAŁ W PLECY! 0% HP ✗" : "SHOT IN THE BACK! 0% HP ✗")
          : (isPl ? `GRACZ · FOV 72° · ${Math.round(hero.hp)}% HP` : `HERO · 72° FOV · ${Math.round(hero.hp)}% HP`);
        drawWorldPill(ctx, hp.x, hp.y, txt, hero.hp <= 35 ? "#f87171" : "#22d3ee", cssW, cssH, isCompact ? 9 : 10);
      }

      // Gunner world callouts
      for (const g of gunners) {
        const gp = projectToScreen(viewProj, g.x, 2.05, g.z, cssW, cssH);
        if (!gp) continue;
        // Keep top-right area clear on desktop
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && gp.y < 230 && gp.x > cssW - 390)
          ? Math.min(gp.x, cssW - 390)
          : gp.x;

        let txt = "";
        let col = "#fbbf24";
        if (!courtesyOn) {
          txt = g.inFov
            ? (isPl ? `${g.id}: CELNY OGIEŃ ✗` : `${g.id}: LETHAL AIM ✗`)
            : (isPl ? `${g.id}: STRZAŁ W PLECY! ✗` : `${g.id}: BACKSTAB FIRE! ✗`);
          col = "#f87171";
        } else if (!g.inFov) {
          txt = isPl ? `${g.id}: POZA EKRANEM · CZEKA` : `${g.id}: OFF-SCREEN WAIT`;
          col = "#fb923c";
        } else if (g.status === "WARN_MISS" && g.statusT > 0) {
          txt = isPl ? "1. STRZAŁ OSTRZEGAWCZY (PUDŁO) ✓" : "1ST SHOT WARNING MISS ✓";
          col = "#4ade80";
        } else {
          txt = isPl ? `${g.id}: W POLU WIDZENIA` : `${g.id}: IN CAMERA FOV`;
          col = "#facc15";
        }
        drawWorldPill(ctx, safeX, gp.y, txt, col, cssW, cssH, isCompact ? 8.5 : 9.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${courtesyOn ? "COURTESY ON" : "BRUTAL AI"} · HP ${Math.round(hero.hp)}% · WARN ${warningMisses}`,
          courtesyOn ? "#4ade80" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14;
        const panelW = 342;
        const panelH = 204;
        const px = cssW - panelW - pad;
        const bw = panelW - 24;

        ctx.save();
        ctx.fillStyle = "rgba(16, 12, 20, 0.90)";
        ctx.strokeStyle = courtesyOn ? "rgba(74, 222, 128, 0.80)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = courtesyOn ? "#4ade80" : "#f87171";
        ctx.fillText(
          courtesyOn
            ? (isPl ? "KURTUAZJA AI · 1. PUDŁO + CZEKANIE POZA FOV" : "FAIR COURTESY AI · 1ST MISS + OFF-SCREEN HOLD")
            : (isPl ? "REALISTYCZNE BRUTALNE AI · STRZAŁY W PLECY ✗" : "REALISTIC BRUTAL AI · SHOT IN THE BACK ✗"),
          px + 12,
          py + 21,
          bw
        );

        // 360-deg Radar Mini-Diagram on left
        drawRadarDiagram(ctx, px + 66, py + 84, 48);

        // Right column HP bar + fairness telemetry
        const rx = px + 130;
        const rw = panelW - 142;

        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "ZDROWIE GRACZA (HP)" : "HERO HEALTH (HP)", rx, py + 44);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath();
        ctx.roundRect(rx, py + 50, rw, 16, 4);
        ctx.fill();
        const hpPct = clamp(hero.hp / 100, 0, 1);
        if (hpPct > 0) {
          ctx.fillStyle = hero.hp > 50 ? "#4ade80" : (hero.hp > 25 ? "#fbbf24" : "#f87171");
          ctx.beginPath();
          ctx.roundRect(rx, py + 50, Math.max(6, rw * hpPct), 16, 4);
          ctx.fill();
        }
        ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#081018";
        ctx.fillText(`${Math.round(hero.hp)}%`, rx + 6, py + 61.5);

        ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#facc15";
        ctx.fillText(
          isPl ? `1. Pudła ostrzegawcze: ${warningMisses}` : `1st-Shot Warning Misses: ${warningMisses}`,
          rx,
          py + 86,
          rw
        );
        ctx.fillStyle = "#fb923c";
        ctx.fillText(
          isPl ? `Wstrzymane (poza FOV): ${offscreenHeld}` : `Off-Screen Holds: ${offscreenHeld}`,
          rx,
          py + 105,
          rw
        );
        ctx.fillStyle = "#fca5a5";
        ctx.fillText(
          isPl ? `Trafienia w plecy: ${backstabHits}` : `Backstab Hits Taken: ${backstabHits}`,
          rx,
          py + 124,
          rw
        );

        // Bottom controls
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "A·D / Klik = Obróć stożek kamery · V = Test Zasadzki" : "A·D / Click = Aim Camera FOV · V = Ambush Volley",
          px + 12,
          py + 164,
          bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "T = Kurtuazja AI WŁ vs Brutalny Realizm" : "T = Fair Courtesy ON vs Realistic Brutal Aim",
          px + 12,
          py + 185,
          bw
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
      return [
        {
          id: "toggle-courtesy",
          label: courtesyOn
            ? (pl ? "Kurtuazja AI: WŁ [T]" : "Fair Courtesy: ON [T]")
            : (pl ? "Brutalne AI (Realizm) [T]" : "Realistic Brutal AI [T]"),
          pressed: courtesyOn,
        },
        {
          id: "ambush",
          label: pl ? "Test Zasadzki (4 wrogów) [V]" : "Ambush Volley Test [V]",
          pressed: false,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-courtesy") {
        courtesyOn = !courtesyOn;
        audio?.ruleSwitch?.(courtesyOn);
        triggerAmbushVolley({ silent: false });
      } else if (id === "ambush") {
        triggerAmbushVolley({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-courtesy");
      else if (code === "KeyV") this.onAction("ambush");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        autoDemo = false;
        hero.targetYaw = Math.atan2(world[0] - hero.x, world[2] - hero.z);
        audio?.wallClick?.(true);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const heroTint = hero.hp <= 0
        ? [1.0, 0.16, 0.22, 0.85]
        : (hero.hitFlash > 0.1 ? [1.0, 0.26, 0.26, hero.hitFlash * 0.72] : [0.22, 0.88, 1.0, 0.22]);

      const meshes = [
        {
          gpu: runnerGpu,
          x: hero.x,
          y: 0.14,
          z: hero.z,
          yaw: hero.yaw,
          animA: 0,
          animB: 0,
          scale: 1.16,
          animMode: 2,
          tint: heroTint,
        },
      ];

      for (const g of gunners) {
        const gTint = !courtesyOn
          ? [1.0, 0.20, 0.24, 0.56]
          : (g.inFov
              ? (g.status === "WARN_MISS" ? [1.0, 0.84, 0.18, 0.55] : [0.24, 0.96, 0.58, 0.35])
              : [1.0, 0.56, 0.16, 0.44]);
        meshes.push({
          gpu: g.isSniper ? sniperGpu : runnerGpu,
          x: g.x,
          y: 0.07,
          z: g.z,
          yaw: g.yaw,
          animA: g.isSniper ? g.recoil : 0,
          animB: 0,
          scale: g.isSniper ? 1.12 : 1.08,
          animMode: g.isSniper ? 1 : 2,
          tint: gTint,
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Crisp glowing 72-deg Camera FOV Cone showing what the player's screen sees!
          fx.coneXZ(hero.x, 0.16, hero.z, hero.yaw, FOV_HALF_RAD, FOV_LEN, [0.16, 0.88, 1.0, 0.82]);
          fx.ringXZ(hero.x, 0.17, hero.z, 1.15, hero.hp <= 30 ? [1.0, 0.22, 0.26, 0.85] : [0.20, 0.88, 1.0, 0.65]);

          // Gunner status rings & off-screen directional warning tethers
          for (const g of gunners) {
            if (courtesyOn && !g.inFov) {
              const pulse = 0.55 + 0.38 * Math.sin(time * 6.5 + g.x);
              fx.ringXZ(g.x, 0.11, g.z, 0.98 + 0.16 * pulse, [1.0, 0.62, 0.16, pulse]);
              // Subtle amber directional warning indicator near Hero's ring perimeter
              const dx = g.x - hero.x, dz = g.z - hero.z;
              const dl = Math.hypot(dx, dz) || 1;
              fx.beam(
                hero.x + (dx / dl) * 1.25, 0.22, hero.z + (dz / dl) * 1.25,
                hero.x + (dx / dl) * 2.15, 0.22, hero.z + (dz / dl) * 2.15,
                0.14,
                [1.0, 0.66, 0.16, pulse * 0.9],
                0
              );
            } else if (!courtesyOn) {
              fx.ringXZ(g.x, 0.11, g.z, 1.05, [1.0, 0.22, 0.26, 0.80]);
            } else {
              fx.ringXZ(g.x, 0.11, g.z, 1.02, [0.22, 0.96, 0.58, 0.72]);
            }
          }

          // Dramatic tracer beams (gold = deliberate 1st-shot warning miss, crimson = lethal hit!)
          for (const tr of tracers) {
            const a = clamp(tr.life / tr.maxLife, 0, 1);
            const col = tr.kind === "warn"
              ? [1.0, 0.84, 0.18, a * 0.95]
              : (tr.kind === "brutal" ? [1.0, 0.20, 0.26, a * 0.96] : [1.0, 0.54, 0.20, a * 0.9]);
            fx.beam(tr.sx, 1.05, tr.sz, tr.ex, 1.05, tr.ez, tr.kind === "warn" ? 0.18 : 0.15, col, 0);
          }

          // Sparks
          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, 0.15 * a + 0.04, basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });

      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const visibleGunners = gunners.filter((g) => g.inFov).length;
      return {
        courtesyOn,
        heroHp: Math.round(hero.hp),
        heroYawDeg: Math.round(((hero.yaw * 180) / Math.PI + 360) % 360),
        visibleGunners,
        offscreenHeld,
        warningMisses,
        backstabHits,
      };
    },
  };
}
