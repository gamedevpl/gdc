// Entry #20: Utility AI (Sims / NPC Needs & Hysteresis) — Playable 3D Woodland Camp!
// Shows why smart NPCs (The Sims, RimWorld, Halo) score smooth 0..1 Utility Curves + Hysteresis commitment
// instead of brittle if/else trees that thrash wildly back-and-forth when Hunger & Fatigue tie!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getUtilityMeshes } from "../../utility-mesh.js";
import { getWfcMeshes } from "../../wfc-mesh.js";

const FOOD_POS = { x: -4.25, z: -1.35 };
const SLEEP_POS = { x: 4.25, z: -1.35 };
const FIRE_POS = { x: 0.0, z: 2.15 };

const FOREST_TREES = [
  [-6.4, -4.2, 1.35], [-4.2, -4.6, 1.25], [-1.8, -4.8, 1.30], [1.8, -4.8, 1.28], [4.4, -4.5, 1.32], [6.5, -4.0, 1.36],
  [-6.8, -1.6, 1.25], [-6.6, 1.4, 1.22], [-6.2, 3.8, 1.18], [6.8, -1.5, 1.25], [6.6, 1.5, 1.22], [6.2, 3.8, 1.18],
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.06, 0.14, 0.24],
    skyMid: [0.16, 0.30, 0.38],
    skyBot: [0.34, 0.38, 0.32],
    lightDir: [0.42, 0.84, 0.34],
    ambLow: [0.18, 0.20, 0.22],
    ambHigh: [0.48, 0.50, 0.54],
    orthoHalf: 11.5,
  });
  const um = getUtilityMeshes();
  const wm = getWfcMeshes();
  const camperGpu = studio.uploadMesh(um.camper);
  const wolfGpu = studio.uploadMesh(um.wolf);
  const treeGpu = studio.uploadMesh(wm.tree);

  // Build Cozy Woodland Camp: Clearing Grass, Stone Hearth, Feast Table & Canvas Tent!
  const wBuf = [];
  // Forest clearing ground + dirt camp circle
  pushBox(wBuf, -7.8, 7.8, -0.45, 0.0, -5.6, 5.4, [0.26, 0.52, 0.28], 4);
  pushBox(wBuf, -5.4, 5.4, 0.0, 0.04, -2.8, 3.4, [0.48, 0.40, 0.30], 4);

  // Station 1: FEAST TABLE (Left: x=-4.25, z=-1.35)
  pushBox(wBuf, FOOD_POS.x - 1.05, FOOD_POS.x + 1.05, 0.62, 0.76, FOOD_POS.z - 0.58, FOOD_POS.z + 0.58, [0.54, 0.36, 0.20], 4);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.42, 0.42]) {
    pushBox(wBuf, FOOD_POS.x + sx - 0.08, FOOD_POS.x + sx + 0.08, 0.0, 0.62, FOOD_POS.z + sz - 0.08, FOOD_POS.z + sz + 0.08, [0.38, 0.24, 0.14], 4);
  }
  // Golden feast platter & glowing berry basket on top!
  pushBox(wBuf, FOOD_POS.x - 0.55, FOOD_POS.x + 0.05, 0.76, 0.94, FOOD_POS.z - 0.26, FOOD_POS.z + 0.26, [0.96, 0.72, 0.22], 2);
  pushBox(wBuf, FOOD_POS.x + 0.24, FOOD_POS.x + 0.68, 0.76, 0.96, FOOD_POS.z - 0.20, FOOD_POS.z + 0.20, [0.88, 0.28, 0.26], 4);

  // Station 2: SLEEP TENT & COT (Right: x=+4.25, z=-1.35)
  pushBox(wBuf, SLEEP_POS.x - 1.15, SLEEP_POS.x + 1.15, 0.0, 0.18, SLEEP_POS.z - 0.95, SLEEP_POS.z + 0.95, [0.42, 0.32, 0.22], 4);
  // Pitched canvas walls & blue sleeping cot
  pushBox(wBuf, SLEEP_POS.x - 1.05, SLEEP_POS.x - 0.88, 0.18, 1.48, SLEEP_POS.z - 0.86, SLEEP_POS.z + 0.86, [0.86, 0.78, 0.62], 4);
  pushBox(wBuf, SLEEP_POS.x + 0.88, SLEEP_POS.x + 1.05, 0.18, 1.48, SLEEP_POS.z - 0.86, SLEEP_POS.z + 0.86, [0.86, 0.78, 0.62], 4);
  pushBox(wBuf, SLEEP_POS.x - 1.08, SLEEP_POS.x + 1.08, 1.44, 1.66, SLEEP_POS.z - 0.90, SLEEP_POS.z + 0.90, [0.24, 0.48, 0.74], 4);
  pushBox(wBuf, SLEEP_POS.x - 0.55, SLEEP_POS.x + 0.55, 0.18, 0.42, SLEEP_POS.z - 0.55, SLEEP_POS.z + 0.62, [0.28, 0.58, 0.92], 2);

  // Station 3: WARM CAMPFIRE HEARTH (Center-Front: x=0, z=2.15)
  pushBox(wBuf, FIRE_POS.x - 0.78, FIRE_POS.x + 0.78, 0.0, 0.22, FIRE_POS.z - 0.78, FIRE_POS.z + 0.78, [0.46, 0.46, 0.50], 1);
  pushBox(wBuf, FIRE_POS.x - 0.36, FIRE_POS.x + 0.36, 0.22, 0.44, FIRE_POS.z - 0.36, FIRE_POS.z + 0.36, [1.0, 0.46, 0.12], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.68, dist: 16.5, targetX: 0.0, targetY: 0.65, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let utilityOn = true; // ON: Smooth Utility Curves + Hysteresis | OFF: Brittle if/else thrashing!
  let userInteracted = false;

  // Camper NPC needs & state
  const npc = {
    x: -0.6, z: 0.35, yaw: -1.0, walkPhase: 0, speedNorm: 0,
    hunger: 68,   // 0..100
    fatigue: 52,  // 0..100
    danger: 0,    // 0..100
    action: "EAT", // EAT | SLEEP | FLEE | CAMPFIRE
    uEat: 0.5, uSleep: 0.3, uFlee: 0, uWarm: 0.18,
    switchCount: 0,
    thrashTimer: 0,
    recentSwitches: [],
  };

  // Prowling Timber Wolf
  const wolf = {
    x: -5.2, z: -4.1, yaw: 1.5, runPhase: 0,
    charging: false, chargeT: 0,
    targetX: 0, targetZ: 0,
    autoProwlCd: 7.5,
  };

  let bannerText = "";
  let bannerColor = "#f59e0b";
  let bannerTimer = 0;
  function setBanner(t, c = "#f59e0b", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0;
    npc.x = -0.5; npc.z = 0.2; npc.yaw = -1.2; npc.walkPhase = 0; npc.speedNorm = 0;
    npc.hunger = 68; npc.fatigue = 52; npc.danger = 0;
    npc.action = "EAT";
    npc.switchCount = 0; npc.thrashTimer = 0; npc.recentSwitches = [];
    wolf.x = -5.4; wolf.z = -4.1; wolf.yaw = 1.5; wolf.runPhase = 0;
    wolf.charging = false; wolf.chargeT = 0; wolf.autoProwlCd = 7.0;
    bannerTimer = 0;
  }
  reset();

  function sendWolfRaid(tx = null, tz = null, { silent = false } = {}) {
    wolf.charging = true;
    wolf.chargeT = 0;
    wolf.targetX = tx != null ? clamp(tx, -4.8, 4.8) : npc.x;
    wolf.targetZ = tz != null ? clamp(tz, -2.5, 2.5) : npc.z;
    if (!silent) audio?.alertBuzzer?.();
    if (!silent) setBanner("WOLF RAID! WATCH FLEE UTILITY SPIKE TO 1.0 AND OVERRIDE HUNGER!", "#f87171", 2.0);
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // 1. Timber Wolf Patrol / Raid behavior
    if (wolf.charging) {
      wolf.chargeT += dt;
      const gx = wolf.chargeT < 3.0 ? lerp(wolf.targetX, npc.x, 0.4) : (wolf.x < 0 ? -5.8 : 5.8);
      const gz = wolf.chargeT < 3.0 ? lerp(wolf.targetZ, npc.z, 0.4) : -4.2;
      const dx = gx - wolf.x, dz = gz - wolf.z;
      const dist = Math.hypot(dx, dz) || 1;
      const sp = wolf.chargeT < 3.0 ? 3.5 : 3.9;
      if (dist > 0.35) {
        wolf.x += (dx / dist) * sp * dt;
        wolf.z += (dz / dist) * sp * dt;
        wolf.yaw = Math.atan2(dx, dz);
        wolf.runPhase += dt * 13.0;
      }
      if (wolf.chargeT >= 5.0) { wolf.charging = false; wolf.autoProwlCd = 8.5; }
    } else {
      // Patrol along north treeline, occasionally dipping into camp!
      const px = Math.sin(time * 0.48) * 5.2;
      const pz = -4.05 + Math.sin(time * 0.96) * 0.45;
      const dx = px - wolf.x, dz = pz - wolf.z;
      wolf.x += dx * clamp(dt * 3.0, 0, 1);
      wolf.z += dz * clamp(dt * 3.0, 0, 1);
      if (Math.hypot(dx, dz) > 0.02) { wolf.yaw = Math.atan2(dx, dz); wolf.runPhase += dt * 8.0; }
      wolf.autoProwlCd -= dt;
      if (wolf.autoProwlCd <= 0) sendWolfRaid(null, null, { silent: !userInteracted });
    }

    // 2. Update NPC Needs (Hunger, Fatigue, Wolf Proximity Danger)
    const wolfDist = Math.hypot(wolf.x - npc.x, wolf.z - npc.z);
    npc.danger = clamp((1.0 - (wolfDist - 1.2) / 4.2) * 100, 0, 100);
    npc.hunger = clamp(npc.hunger + 4.8 * dt, 0, 100);
    npc.fatigue = clamp(npc.fatigue + 3.9 * dt, 0, 100);

    // 3. Decision Brain: Utility AI + Hysteresis vs Brittle if/else!
    const prevAct = npc.action;
    npc.uEat = Math.pow(npc.hunger / 100, 1.65);
    npc.uSleep = Math.pow(npc.fatigue / 100, 1.65);
    npc.uFlee = npc.danger > 16 ? clamp(Math.pow(npc.danger / 100, 1.15) * 1.45, 0, 1.25) : 0;
    npc.uWarm = 0.22;

    if (utilityOn) {
      // Smooth Utility Scoring + Commitment Hysteresis (+0.18 stickiness until need is fulfilled!)
      const hEat = (npc.action === "EAT" && npc.hunger > 14) ? 0.18 : 0;
      const hSleep = (npc.action === "SLEEP" && npc.fatigue > 14) ? 0.18 : 0;
      const hFlee = (npc.action === "FLEE" && npc.danger > 8) ? 0.14 : 0;
      const scores = [
        ["FLEE", npc.uFlee + hFlee],
        ["EAT", npc.uEat + hEat],
        ["SLEEP", npc.uSleep + hSleep],
        ["CAMPFIRE", npc.uWarm],
      ];
      scores.sort((a, b) => b[1] - a[1]);
      npc.action = scores[0][0];
    } else {
      // Naive Rigid if/else WITHOUT hysteresis: when hunger & fatigue both hover near threshold,
      // tiny micro-changes flip priority every 0.35s -> classic NPC thrashing loop!
      if (npc.danger > 55) {
        npc.action = "FLEE";
      } else {
        npc.thrashTimer += dt;
        // Keep hunger & fatigue tightly neck-and-neck if neither reached station yet so thrashing is unmistakable!
        if (Math.abs(npc.hunger - npc.fatigue) < 20 && npc.hunger > 42 && npc.fatigue > 42) {
          if (npc.thrashTimer >= 0.42) {
            npc.thrashTimer = 0;
            npc.action = npc.action === "EAT" ? "SLEEP" : "EAT";
          }
        } else {
          npc.action = npc.hunger >= npc.fatigue ? "EAT" : "SLEEP";
        }
      }
    }

    if (npc.action !== prevAct) {
      npc.switchCount++;
      npc.recentSwitches.push(time);
      if (userInteracted && utilityOn) audio?.ruleSwitch?.(true);
    }
    while (npc.recentSwitches.length && time - npc.recentSwitches[0] > 6.0) npc.recentSwitches.shift();

    // 4. Steer Camper toward chosen station & fulfill need when arriving!
    let gx = FIRE_POS.x, gz = FIRE_POS.z - 0.9;
    let moveSp = 2.95;
    if (npc.action === "EAT") { gx = FOOD_POS.x + 0.95; gz = FOOD_POS.z + 0.55; }
    else if (npc.action === "SLEEP") { gx = SLEEP_POS.x - 0.95; gz = SLEEP_POS.z + 0.55; }
    else if (npc.action === "FLEE") {
      // Run straight away from Wolf toward the safe southern Campfire edge!
      const fx = npc.x - wolf.x, fz = npc.z - wolf.z;
      const fl = Math.hypot(fx, fz) || 1;
      gx = clamp(npc.x + (fx / fl) * 3.5, -5.2, 5.2);
      gz = clamp(Math.max(1.2, npc.z + (fz / fl) * 3.2), -2.4, 3.6);
      moveSp = 4.15;
    }

    const dx = gx - npc.x, dz = gz - npc.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      npc.x = clamp(npc.x + (dx / dist) * moveSp * dt, -5.4, 5.4);
      npc.z = clamp(npc.z + (dz / dist) * moveSp * dt, -2.8, 3.8);
      npc.yaw = Math.atan2(dx, dz);
      npc.walkPhase += dt * (moveSp * 3.6);
      npc.speedNorm = 1.0;
    } else {
      npc.speedNorm = 0.0;
      if (npc.action === "EAT") {
        npc.hunger = Math.max(0, npc.hunger - 34 * dt);
        if (npc.hunger <= 5 && userInteracted) audio?.coinPickup?.();
      } else if (npc.action === "SLEEP") {
        npc.fatigue = Math.max(0, npc.fatigue - 32 * dt);
        if (npc.fatigue <= 5 && userInteracted) audio?.coinPickup?.();
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const isThrashing = !utilityOn && npc.recentSwitches.length >= 3;

    if (viewProj) {
      // Station Pills placed cleanly below front edge so Camper's pill floating overhead never collides!
      const fp = projectToScreen(viewProj, FOOD_POS.x, 0.25, FOOD_POS.z + 1.05, cssW, cssH);
      if (fp) drawWorldPill(ctx, fp.x, fp.y, isPl ? "STÓŁ (GŁÓD)" : "FEAST TABLE (FOOD)", "#f59e0b", cssW, cssH, isCompact ? 9 : 9.5);
      const sp = projectToScreen(viewProj, SLEEP_POS.x, 0.25, SLEEP_POS.z + 1.25, cssW, cssH);
      if (sp) drawWorldPill(ctx, sp.x, sp.y, isPl ? "NAMIOT (SEN)" : "SLEEP TENT (REST)", "#38bdf8", cssW, cssH, isCompact ? 9 : 9.5);
      const wp = projectToScreen(viewProj, wolf.x, 1.45, wolf.z, cssW, cssH);
      if (wp) {
        const safeWx = (!isCompact && !document.body.classList.contains("no-hud") && wp.y < 230)
          ? Math.min(wp.x, cssW - 390) : wp.x;
        drawWorldPill(ctx, safeWx, wp.y, wolf.charging ? (isPl ? "WILK ATAKUJE!" : "WOLF RAID!") : (isPl ? "WILK (ZAGROŻENIE)" : "PROWLING WOLF"), "#f87171", cssW, cssH, isCompact ? 9 : 9.5);
      }

      // Live Camper Decision Pill floating cleanly overhead!
      const cp = projectToScreen(viewProj, npc.x, 2.38, npc.z, cssW, cssH);
      if (cp) {
        let txt, col;
        if (isThrashing) {
          txt = isPl ? "PĘTLA IF/ELSE! (MIOTA SIĘ!) ✗" : "IF/ELSE THRASHING! (STUCK!) ✗";
          col = "#f87171";
        } else if (npc.action === "FLEE") {
          txt = isPl ? `UTILITY: UCIEKAJ (${Math.min(1, npc.uFlee).toFixed(2)})!` : `UTILITY: FLEE (${Math.min(1, npc.uFlee).toFixed(2)})!`;
          col = "#fb7185";
        } else if (npc.action === "EAT") {
          txt = isPl ? `UTILITY: JEDZ (${npc.uEat.toFixed(2)}) ✓` : `UTILITY: EAT (${npc.uEat.toFixed(2)}) ✓`;
          col = "#facc15";
        } else if (npc.action === "SLEEP") {
          txt = isPl ? `UTILITY: ŚPIJ (${npc.uSleep.toFixed(2)}) ✓` : `UTILITY: SLEEP (${npc.uSleep.toFixed(2)}) ✓`;
          col = "#38bdf8";
        } else {
          txt = isPl ? "UTILITY: OGNISKO (RELAKS) ✓" : "UTILITY: CAMPFIRE (REST) ✓";
          col = "#4ade80";
        }
        drawWorldPill(ctx, cp.x, cp.y, txt, col, cssW, cssH, isCompact ? 9.5 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${utilityOn ? `UTILITY: ${npc.action}` : `IF/ELSE (${npc.recentSwitches.length} flips)`} · H:${Math.round(npc.hunger)}% S:${Math.round(npc.fatigue)}%`,
          utilityOn ? "#f59e0b" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 164, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(12, 16, 24, 0.88)";
        ctx.strokeStyle = utilityOn ? "rgba(245, 158, 11, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = utilityOn ? "#fbbf24" : "#f87171";
        ctx.fillText(utilityOn ? "UTILITY AI + HYSTERESIS (+0.18)" : `NAIVE IF/ELSE · ${npc.recentSwitches.length} FLIPS / 6s!`, px + 12, py + 21, panelW - 24);

        const bars = [
          { lbl: isPl ? "GŁÓD (EAT)" : "EAT SCORE", val: clamp(npc.uEat, 0, 1), col: "#f59e0b", active: npc.action === "EAT" },
          { lbl: isPl ? "SEN (SLEEP)" : "SLEEP SCORE", val: clamp(npc.uSleep, 0, 1), col: "#38bdf8", active: npc.action === "SLEEP" },
          { lbl: isPl ? "STRACH (FLEE)" : "FLEE SCORE", val: clamp(npc.uFlee, 0, 1), col: "#f43f5e", active: npc.action === "FLEE" },
        ];
        const bx = px + 12, bw = panelW - 24;
        bars.forEach((b, idx) => {
          const by = py + 34 + idx * 23;
          ctx.fillStyle = "rgba(30, 41, 59, 0.90)";
          ctx.beginPath(); ctx.roundRect(bx, by, bw, 17, 4); ctx.fill();
          ctx.fillStyle = b.col;
          ctx.beginPath(); ctx.roundRect(bx, by, Math.max(5, bw * b.val), 17, 4); ctx.fill();
          ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`${b.active ? "▶ " : "  "}${b.lbl}: ${b.val.toFixed(2)}`, bx + 6, by + 12, bw - 12);
        });

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Głód: ${Math.round(npc.hunger)}% · Zmęczenie: ${Math.round(npc.fatigue)}%` : `Hunger: ${Math.round(npc.hunger)}% · Fatigue: ${Math.round(npc.fatigue)}%`, px + 12, py + 124, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Klik / V = Atak Wilka · T = Utility/if-else" : "Click / V = Wolf Raid · T = Utility/if-else", px + 12, py + 146, bw);
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
        { id: "toggle-util", label: utilityOn ? (pl ? "Utility AI + Histereza [T]" : "Utility AI + Hysteresis [T]") : (pl ? "Naiwne if/else (Pętla) [T]" : "Naive if/else (Thrash) [T]"), pressed: utilityOn },
        { id: "wolf-raid", label: pl ? "Atak Wilka! [V]" : "Send Wolf Raid! [V]", pressed: wolf.charging },
        { id: "boost-needs", label: pl ? "Podkręć Głód+Sen [X]" : "Spike Hunger+Sleep [X]", pressed: false },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-util") {
        utilityOn = !utilityOn;
        audio?.ruleSwitch?.(utilityOn);
        if (!utilityOn) {
          // Put Hunger & Fatigue right near tie so if/else thrashing begins IMMEDIATELY!
          npc.hunger = 58; npc.fatigue = 58; npc.thrashTimer = 0.30;
          setBanner("NAIVE IF/ELSE: NO HYSTERESIS → CAMPER THRASHES BETWEEN FOOD & BED!", "#f87171", 2.1);
        } else {
          setBanner("UTILITY AI ON: SMOOTH CURVES + HYSTERESIS COMMITMENT!", "#fbbf24", 1.9);
        }
      } else if (id === "wolf-raid") {
        sendWolfRaid(null, null, { silent: false });
      } else if (id === "boost-needs") {
        npc.hunger = 84; npc.fatigue = 82;
        audio?.ruleSwitch?.(true);
        setBanner("BOTH HUNGER & FATIGUE SPIKED TO 83% — WATCH WHO WINS!", "#fbbf24", 1.8);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-util");
      else if (code === "KeyV") this.onAction("wolf-raid");
      else if (code === "KeyX") this.onAction("boost-needs");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        sendWolfRaid(world[0], world[2], { silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        { gpu: camperGpu, x: npc.x, y: 0.04, z: npc.z, yaw: npc.yaw, animA: npc.walkPhase, animB: npc.speedNorm, scale: 1.08, animMode: 2 },
        {
          gpu: wolfGpu, x: wolf.x, y: 0.04, z: wolf.z, yaw: wolf.yaw, animA: wolf.runPhase, animB: 1.0, scale: 1.12, animMode: 2,
          tint: wolf.charging ? [1.0, 0.25, 0.25, 0.35] : [1, 1, 1, 0],
        },
      ];
      for (const [tx, tz, sc] of FOREST_TREES) {
        meshes.push({ gpu: treeGpu, x: tx, y: 0.0, z: tz, yaw: tx * 1.1, scale: sc, animMode: 0 });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Campfire flickering warm flame orb
          const fl = 0.44 + 0.08 * Math.sin(time * 8.5);
          fx.billboard(FIRE_POS.x, 0.72, FIRE_POS.z, fl, basis.right, basis.up, [1.0, 0.56, 0.14, 0.85], 2);
          // Station rings
          fx.ringXZ(FOOD_POS.x, 0.08, FOOD_POS.z, 1.35, [0.96, 0.68, 0.14, npc.action === "EAT" ? 0.85 : 0.32]);
          fx.ringXZ(SLEEP_POS.x, 0.08, SLEEP_POS.z, 1.45, [0.22, 0.78, 1.0, npc.action === "SLEEP" ? 0.85 : 0.32]);
          // Wolf danger threat radius ring!
          fx.ringXZ(wolf.x, 0.08, wolf.z, wolf.charging ? 3.2 : 1.6, [1.0, 0.24, 0.30, wolf.charging ? 0.62 : 0.35]);
          // Active intent dashed tether from Camper to Goal!
          if (npc.action === "EAT") fx.beam(npc.x, 0.75, npc.z, FOOD_POS.x, 0.85, FOOD_POS.z, 0.10, [1.0, 0.76, 0.16, 0.78], 4);
          else if (npc.action === "SLEEP") fx.beam(npc.x, 0.75, npc.z, SLEEP_POS.x, 0.85, SLEEP_POS.z, 0.10, [0.22, 0.82, 1.0, 0.78], 4);
          else if (npc.action === "FLEE") fx.beam(wolf.x, 0.65, wolf.z, npc.x, 0.75, npc.z, 0.12, [1.0, 0.24, 0.30, 0.86], 0);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { utilityOn, action: npc.action, hunger: Math.round(npc.hunger), fatigue: Math.round(npc.fatigue), danger: Math.round(npc.danger), recentSwitches: npc.recentSwitches.length, switchCount: npc.switchCount };
    },
  };
}
