// Entry #26: Behavior Trees vs Spaghetti FSM — Playable 3D Castle Vault Guard AI!
// Live visual Behavior Tree node graph in top-right HUD synchronized with the 3D Guard Knight:
// Root Selector (?) cleanly prioritizes [1] Low HP -> Flee & Heal, [2] Intruder -> Chase, [3] Patrol
// vs a brittle FSM that gets deadlocked on missing recovery transitions!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getHitboxMeshes } from "../../hitbox-mesh.js";
import { getUtilityMeshes } from "../../utility-mesh.js";

const SHRINE_POS = { x: -4.8, z: -2.2 };
const TREASURE_POS = { x: 0.0, z: 0.0 };
const WAYPOINTS = [
  { x: -2.4, z: -2.2 },
  { x:  2.8, z: -2.2 },
  { x:  2.8, z:  2.2 },
  { x: -2.4, z:  2.2 },
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.03, 0.06, 0.12],
    skyMid: [0.08, 0.13, 0.22],
    skyBot: [0.14, 0.19, 0.28],
    lightDir: [0.36, 0.86, 0.36],
  });
  const hm = getHitboxMeshes();
  const um = getUtilityMeshes();
  const guardGpu = studio.uploadMesh(hm.knight);
  const rogueGpu = studio.uploadMesh(um.camper);

  // Build Sunlit Castle Treasury Courtyard: Healing Shrine (West), Golden Treasure Pedestal (Center)
  const wBuf = [];
  pushBox(wBuf, -7.2, 7.2, -0.45, 0.0, -5.0, 4.8, [0.32, 0.35, 0.42], 0);
  // Castle stone perimeter wall
  pushBox(wBuf, -7.2, 7.2, 0.0, 1.5, -5.3, -4.8, [0.46, 0.48, 0.54], 1);
  pushBox(wBuf, -7.2, -6.8, 0.0, 0.9, -4.8, 4.8, [0.44, 0.46, 0.52], 1);
  pushBox(wBuf,  6.8,  7.2, 0.0, 0.9, -4.8, 4.8, [0.44, 0.46, 0.52], 1);
  // Center Royal Treasure Pedestal & Golden Crown Cube
  pushBox(wBuf, -0.9, 0.9, 0.0, 0.55, -0.9, 0.9, [0.44, 0.40, 0.38], 1);
  pushBox(wBuf, -0.42, 0.42, 0.55, 1.15, -0.42, 0.42, [1.0, 0.80, 0.18], 2);
  // West Emerald Healing Shrine
  pushBox(wBuf, SHRINE_POS.x - 0.85, SHRINE_POS.x + 0.85, 0.0, 0.32, SHRINE_POS.z - 0.85, SHRINE_POS.z + 0.85, [0.36, 0.44, 0.42], 1);
  pushBox(wBuf, SHRINE_POS.x - 0.38, SHRINE_POS.x + 0.38, 0.32, 1.38, SHRINE_POS.z - 0.38, SHRINE_POS.z + 0.38, [0.12, 0.94, 0.58], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.74, dist: 16.5, targetX: 0.0, targetY: 0.5, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let btOn = true; // ON: Clean Priority Behavior Tree | OFF: Broken Spaghetti FSM!
  let userInteracted = false;

  const guard = {
    x: -2.2, z: 1.8, yaw: 0, hp: 100,
    activeBranch: "PATROL", // HEAL | CHASE | PATROL | FSM_STUCK
    wpIdx: 0,
    fsmDeadlocked: false,
    healFlash: 0,
  };

  const rogue = {
    x: 4.8, z: -2.6, yaw: -1.5, walkPhase: 0,
    active: true, autoRaidT: 2.5,
  };

  let bannerText = "";
  let bannerColor = "#10b981";
  let bannerTimer = 0;
  function setBanner(t, c = "#10b981", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function reset() {
    time = 0;
    guard.x = -2.2; guard.z = 1.6; guard.yaw = 0.4; guard.hp = 100;
    guard.activeBranch = "PATROL"; guard.wpIdx = 0; guard.fsmDeadlocked = false; guard.healFlash = 0;
    rogue.x = 4.6; rogue.z = -2.4; rogue.yaw = -1.6; rogue.walkPhase = 0; rogue.autoRaidT = 1.6;
    bannerTimer = 0;
  }
  reset();

  function damageGuard({ silent = false } = {}) {
    guard.hp = 22;
    if (!btOn) guard.fsmDeadlocked = true;
    if (!silent) audio?.playerHurt?.();
    if (!silent) {
      setBanner(
        btOn
          ? "GUARD AT 22% HP! BRANCH #1 [FLEE & HEAL] PREEMPTS CHASE CLEANLY ✓"
          : "FSM BUG! INTERRUPTED MID-CHASE → MISSING TRANSITION EDGE (DEADLOCKED ✗)",
        btOn ? "#4ade80" : "#f87171",
        2.2
      );
    }
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (guard.healFlash > 0) guard.healFlash = Math.max(0, guard.healFlash - dt * 1.8);

    // 1. Sneaking Rogue weaves in toward the Treasure and retreats if Guard gets close!
    const distRG = Math.hypot(rogue.x - guard.x, rogue.z - guard.z);
    let rgx = Math.cos(time * 0.55) * 4.4 + 1.4;
    let rgz = Math.sin(time * 0.72) * 2.6;
    if (distRG < 2.2 && !guard.fsmDeadlocked && guard.activeBranch === "CHASE") {
      // Rogue darts away from chasing guard
      const ax = rogue.x - guard.x, az = rogue.z - guard.z;
      const al = Math.hypot(ax, az) || 1;
      rgx = clamp(rogue.x + (ax / al) * 2.6, -5.5, 5.8);
      rgz = clamp(rogue.z + (az / al) * 2.6, -3.6, 3.6);
    }
    const rdx = rgx - rogue.x, rdz = rgz - rogue.z;
    const rl = Math.hypot(rdx, rdz);
    if (rl > 0.15) {
      rogue.x = clamp(rogue.x + (rdx / rl) * 2.4 * dt, -5.8, 6.0);
      rogue.z = clamp(rogue.z + (rdz / rl) * 2.4 * dt, -3.8, 3.8);
      rogue.yaw = Math.atan2(rdx, rdz);
      rogue.walkPhase += dt * 9.0;
    }

    // 2. Guard AI Evaluation: Clean Behavior Tree Selector vs Broken Spaghetti FSM!
    const seesRogue = Math.hypot(rogue.x - guard.x, rogue.z - guard.z) < 5.6;

    if (btOn) {
      guard.fsmDeadlocked = false;
      // Top-down Priority Selector (?):
      // Branch 1: Sequence [HP < 40% (or currently healing < 98%)] -> Go To Shrine & Heal
      // Branch 2: Sequence [See Rogue] -> Chase Rogue
      // Branch 3: Fallback -> Patrol Vault Waypoints
      if (guard.hp < 40 || (guard.activeBranch === "HEAL" && guard.hp < 98)) {
        guard.activeBranch = "HEAL";
      } else if (seesRogue) {
        guard.activeBranch = "CHASE";
      } else {
        guard.activeBranch = "PATROL";
      }
    } else {
      // Broken FSM: taking damage mid-chase triggers an unhandled transition -> stuck in FSM_STUCK!
      if (guard.hp < 40) guard.fsmDeadlocked = true;
      if (guard.fsmDeadlocked) {
        guard.activeBranch = "FSM_STUCK";
      } else if (seesRogue) {
        guard.activeBranch = "CHASE";
      } else {
        guard.activeBranch = "PATROL";
      }
    }

    // 3. Execute Leaf Action
    if (guard.activeBranch === "HEAL") {
      const dx = SHRINE_POS.x + 1.0 - guard.x, dz = SHRINE_POS.z + 0.8 - guard.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        guard.x += (dx / d) * 3.8 * dt;
        guard.z += (dz / d) * 3.8 * dt;
        guard.yaw = Math.atan2(dx, dz);
      } else {
        guard.hp = Math.min(100, guard.hp + 48 * dt);
        guard.healFlash = 0.8;
        if (guard.hp >= 98 && userInteracted) audio?.coinPickup?.();
      }
    } else if (guard.activeBranch === "CHASE") {
      const dx = rogue.x - guard.x, dz = rogue.z - guard.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.2) {
        guard.x = clamp(guard.x + (dx / d) * 3.1 * dt, -5.8, 5.8);
        guard.z = clamp(guard.z + (dz / d) * 3.1 * dt, -3.8, 3.8);
        guard.yaw = Math.atan2(dx, dz);
      }
    } else if (guard.activeBranch === "PATROL") {
      const wp = WAYPOINTS[guard.wpIdx];
      const dx = wp.x - guard.x, dz = wp.z - guard.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        guard.wpIdx = (guard.wpIdx + 1) % WAYPOINTS.length;
      } else {
        guard.x += (dx / d) * 2.5 * dt;
        guard.z += (dz / d) * 2.5 * dt;
        guard.yaw = Math.atan2(dx, dz);
      }
    } else {
      // FSM_STUCK: Guard spins helplessly in place due to missing transition edge!
      guard.yaw += dt * 4.5;
    }
  }

  function drawTreeDiagram(ctx, px, py, bw) {
    // Crisp Live Behavior Tree Node Graph inside the top-right HUD!
    const rootX = px + bw * 0.5, rootY = py + 42;
    const branches = [
      { id: "HEAL",   lbl: "1. HEAL",   sub: "HP<40%", x: px + bw * 0.17, col: "#4ade80" },
      { id: "CHASE",  lbl: "2. CHASE",  sub: "SAW?",   x: px + bw * 0.50, col: "#fbbf24" },
      { id: "PATROL", lbl: "3. PATROL", sub: "LOOP",   x: px + bw * 0.83, col: "#38bdf8" },
    ];
    const childY = py + 86;

    // Edges from Root Selector (?) to 3 Sequence/Leaf branches
    for (const b of branches) {
      const active = btOn && guard.activeBranch === b.id;
      ctx.strokeStyle = active ? b.col : "rgba(100, 116, 139, 0.45)";
      ctx.lineWidth = active ? 2.4 : 1.2;
      ctx.beginPath(); ctx.moveTo(rootX, rootY + 11); ctx.lineTo(b.x, childY - 14); ctx.stroke();
    }

    // Root Selector Node (?)
    ctx.fillStyle = btOn ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)";
    ctx.strokeStyle = btOn ? "#10b981" : "#f87171";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(rootX - 52, rootY - 11, 104, 22, 5); ctx.fill(); ctx.stroke();
    ctx.font = "800 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.fillText(btOn ? "SELECTOR (?)" : "BROKEN FSM ✗", rootX, rootY + 3.5);

    // 3 Child Branch Nodes
    for (const b of branches) {
      const active = btOn && guard.activeBranch === b.id;
      ctx.fillStyle = active ? b.col : "rgba(30, 41, 59, 0.92)";
      ctx.strokeStyle = active ? "#ffffff" : "rgba(100, 116, 139, 0.55)";
      ctx.lineWidth = active ? 1.8 : 1.0;
      ctx.beginPath(); ctx.roundRect(b.x - 44, childY - 14, 88, 28, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? "#061018" : "#cbd5e1";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(b.lbl, b.x, childY - 1.5);
      ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(active ? "RUNNING" : b.sub, b.x, childY + 9.5);
    }
    ctx.textAlign = "left";
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Shrine label
      const sp = projectToScreen(viewProj, SHRINE_POS.x, 1.9, SHRINE_POS.z, cssW, cssH);
      if (sp) drawWorldPill(ctx, sp.x, sp.y, isPl ? "KAPLICZKA LECZENIA" : "HEAL SHRINE", "#4ade80", cssW, cssH, isCompact ? 8.5 : 9.5);

      // Rogue label
      const rp = projectToScreen(viewProj, rogue.x, 2.05, rogue.z, cssW, cssH);
      if (rp) drawWorldPill(ctx, rp.x, rp.y, isPl ? "INTRUZ (KLIK = PRZESTAW)" : "INTRUDER ROGUE", "#fb923c", cssW, cssH, isCompact ? 8.5 : 9.5);

      // Guard Live Node Pill!
      const gp = projectToScreen(viewProj, guard.x, 2.25, guard.z, cssW, cssH);
      if (gp) {
        const map = {
          HEAL:      { t: isPl ? `BT #1: LECZENIE (${Math.round(guard.hp)}% HP) ✓` : `BT #1: FLEE & HEAL (${Math.round(guard.hp)}% HP) ✓`, c: "#4ade80" },
          CHASE:     { t: isPl ? "BT #2: POŚCIG ZA INTRUZEM" : "BT #2: CHASE INTRUDER", c: "#fbbf24" },
          PATROL:    { t: isPl ? "BT #3: PATROL SKARBCA" : "BT #3: VAULT PATROL", c: "#38bdf8" },
          FSM_STUCK: { t: isPl ? "FSM DEADLOCK! (BRAK PRZEJŚCIA!) ✗" : "FSM DEADLOCK! (MISSING EDGE!) ✗", c: "#f87171" },
        };
        const m = map[guard.activeBranch] || map.PATROL;
        drawWorldPill(ctx, gp.x, gp.y, m.t, m.c, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${btOn ? `BT: ${guard.activeBranch}` : `FSM: ${guard.activeBranch}`} · HP ${Math.round(guard.hp)}%`,
          guard.fsmDeadlocked ? "#f87171" : "#10b981",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 186, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 16, 26, 0.90)";
        ctx.strokeStyle = guard.fsmDeadlocked ? "rgba(248, 113, 113, 0.85)" : "rgba(16, 185, 129, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = guard.fsmDeadlocked ? "#f87171" : "#34d399";
        ctx.fillText(btOn ? "BEHAVIOR TREE · PRIORITY SELECTOR" : "SPAGHETTI FSM · FRAGILE TRANSITIONS!", px + 12, py + 20, bw);

        drawTreeDiagram(ctx, px + 12, py + 6, bw);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = guard.hp < 40 ? "#fca5a5" : "#4ade80";
        ctx.fillText(isPl ? `HP Strażnika: ${Math.round(guard.hp)}% · Stan: ${guard.activeBranch}` : `Guard HP: ${Math.round(guard.hp)}% · Node: ${guard.activeBranch}`, px + 12, py + 132, bw);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "V = Zrań do 22% HP (przerwanie gałęzią #1!)" : "V = Damage to 22% HP (Branch #1 preempts!)", px + 12, py + 152, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Klik = Przenieś Intruza · T = BT / FSM" : "Click = Move Rogue · T = Behavior Tree / FSM", px + 12, py + 172, bw);
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
        { id: "toggle-bt", label: btOn ? (pl ? "Behavior Tree: WŁ [T]" : "Behavior Tree: ON [T]") : (pl ? "Zeputy FSM (Deadlock) [T]" : "Broken FSM (Deadlock) [T]"), pressed: btOn },
        { id: "hurt", label: pl ? "Zrań Strażnika (22% HP) [V]" : "Damage Guard (22% HP) [V]", pressed: guard.hp < 40 },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-bt") {
        btOn = !btOn;
        audio?.ruleSwitch?.(btOn);
        if (!btOn) damageGuard({ silent: true });
        setBanner(
          btOn
            ? "BEHAVIOR TREE ON: CLEAN PRIORITY PREEMPTION & AUTO-RECOVERY!"
            : "SPAGHETTI FSM OFF: INTERRUPT CAUSES MISSING TRANSITION DEADLOCK!",
          btOn ? "#4ade80" : "#f87171",
          2.0
        );
      } else if (id === "hurt") {
        damageGuard({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-bt");
      else if (code === "KeyV") this.onAction("hurt");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        rogue.x = clamp(world[0], -5.8, 5.8);
        rogue.z = clamp(world[2], -3.8, 3.8);
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const gTint = guard.fsmDeadlocked
        ? [1.0, 0.22, 0.28, 0.72]
        : (guard.healFlash > 0.05 ? [0.16, 0.98, 0.56, guard.healFlash * 0.65] : [1, 1, 1, 0]);
      const meshes = [
        { gpu: guardGpu, x: guard.x, y: 0.0, z: guard.z, yaw: guard.yaw, scale: 1.12, animMode: 0, tint: gTint },
        { gpu: rogueGpu, x: rogue.x, y: 0.0, z: rogue.z, yaw: rogue.yaw, animA: rogue.walkPhase, animB: 1.0, scale: 1.02, animMode: 2, tint: [0.96, 0.36, 0.22, 0.32] },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          // Healing Shrine aura
          fx.ringXZ(SHRINE_POS.x, 0.08, SHRINE_POS.z, 1.35, [0.16, 0.96, 0.58, 0.72]);
          // Guard vision / aggro circle
          fx.ringXZ(guard.x, 0.06, guard.z, 2.2, guard.fsmDeadlocked ? [1.0, 0.22, 0.28, 0.78] : [0.22, 0.88, 1.0, 0.35]);
          // Patrol square dashed lines
          for (let i = 0; i < WAYPOINTS.length; i++) {
            const a = WAYPOINTS[i], b = WAYPOINTS[(i + 1) % WAYPOINTS.length];
            fx.beam(a.x, 0.08, a.z, b.x, 0.08, b.z, 0.06, [0.24, 0.74, 1.0, 0.34], 4);
          }
          // Active intent tether
          if (guard.activeBranch === "HEAL") fx.beam(guard.x, 0.9, guard.z, SHRINE_POS.x, 0.9, SHRINE_POS.z, 0.12, [0.16, 0.98, 0.58, 0.86], 4);
          else if (guard.activeBranch === "CHASE") fx.beam(guard.x, 0.9, guard.z, rogue.x, 0.9, rogue.z, 0.12, [1.0, 0.76, 0.16, 0.86], 4);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { btOn, activeBranch: guard.activeBranch, hp: Math.round(guard.hp), fsmDeadlocked: guard.fsmDeadlocked };
    },
  };
}
