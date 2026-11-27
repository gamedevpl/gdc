// Entry #36: GOAP (Goal-Oriented Action Planning) — Playable 3D Tactical Warehouse AI!
// Runs a real backward-chaining symbolic planner over { hasAmmo, inCover, hasGrenade, crateIntact, targetDown }:
// Blow up the Ammo Crate mid-run and watch GOAP re-plan in 1 tick (Grab Grenade -> Rush Flank -> Detonate!)
// vs a Rigid Script that walks straight to missing rubble and gets stuck!
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

const AMMO_POS = { x: -3.8, z: -2.2 };
const COVER_POS = { x: 0.2, z: -0.4 };
const GRENADE_POS = { x: 3.8, z: -2.4 };
const TARGET_POS = { x: 0.0, z: 3.4 };
const SPAWN_POS = { x: -0.8, z: -3.5 };

const ACTIONS = [
  {
    id: "get_ammo",
    labelEn: "GET AMMO",
    labelPl: "WEŹ AMMO",
    pre: { crateIntact: true },
    eff: { hasAmmo: true },
    cost: 2,
    pos: { x: -3.05, z: -1.85 },
    workDur: 0.55,
  },
  {
    id: "take_cover",
    labelEn: "TAKE COVER",
    labelPl: "ZA OSŁONĘ",
    pre: { hasAmmo: true },
    eff: { inCover: true },
    cost: 2,
    pos: { x: 0.2, z: -1.35 },
    workDur: 0.50,
  },
  {
    id: "flank_fire",
    labelEn: "FLANK FIRE",
    labelPl: "FLANKA+OGIEŃ",
    pre: { hasAmmo: true, inCover: true },
    eff: { targetDown: true },
    cost: 2,
    pos: { x: -2.05, z: 1.05 },
    workDur: 0.72,
  },
  {
    id: "grab_grenade",
    labelEn: "GRAB GRENADE",
    labelPl: "WEŹ GRANAT",
    pre: {},
    eff: { hasGrenade: true },
    cost: 3,
    pos: { x: 3.05, z: -1.95 },
    workDur: 0.55,
  },
  {
    id: "rush_flank",
    labelEn: "RUSH FLANK",
    labelPl: "SZARŻA FLANKĄ",
    pre: { hasGrenade: true },
    eff: { inCover: true },
    cost: 2,
    pos: { x: 2.35, z: 1.15 },
    workDur: 0.45,
  },
  {
    id: "detonate",
    labelEn: "DETONATE!",
    labelPl: "DETONUJ!",
    pre: { hasGrenade: true, inCover: true },
    eff: { targetDown: true },
    cost: 3,
    pos: { x: 1.55, z: 1.75 },
    workDur: 0.78,
  },
];

const RIGID_SCRIPT_IDS = ["get_ammo", "take_cover", "flank_fire"];

// Real miniature GOAP Backward-Chaining (Regression) A* / Best-First Planner
function planGoap(worldState, goalState) {
  function isSatisfied(req) {
    for (const [k, v] of Object.entries(req)) {
      if (worldState[k] !== v) return false;
    }
    return true;
  }
  function reqKey(req) {
    return Object.keys(req).sort().map((k) => `${k}:${req[k]}`).join("|");
  }

  const open = [{ req: { ...goalState }, chain: [], cost: 0 }];
  const bestCost = new Map();
  bestCost.set(reqKey(goalState), 0);

  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (isSatisfied(cur.req)) {
      return { actions: cur.chain, totalCost: cur.cost };
    }
    if (cur.chain.length >= 6) continue;

    for (const act of ACTIONS) {
      // Does this action satisfy at least one currently unsatisfied requirement?
      let satisfiesAny = false;
      let conflicts = false;
      for (const [k, v] of Object.entries(act.eff)) {
        if (k in cur.req) {
          if (cur.req[k] === v && worldState[k] !== v) satisfiesAny = true;
          else if (cur.req[k] !== v) conflicts = true;
        }
      }
      if (!satisfiesAny || conflicts) continue;

      // Regress requirements: remove effects provided by act, add act's preconditions
      const nextReq = { ...cur.req };
      for (const k of Object.keys(act.eff)) {
        if (nextReq[k] === act.eff[k]) delete nextReq[k];
      }
      let preConflict = false;
      for (const [pk, pv] of Object.entries(act.pre)) {
        if (pk in nextReq && nextReq[pk] !== pv) { preConflict = true; break; }
        // Only add if it differs or is a static world guard like crateIntact
        nextReq[pk] = pv;
      }
      if (preConflict) continue;

      // Prune unachievable static precondition (no action sets crateIntact)
      if ("crateIntact" in nextReq && worldState.crateIntact !== nextReq.crateIntact) continue;

      const nextCost = cur.cost + act.cost;
      const key = reqKey(nextReq);
      if (bestCost.has(key) && bestCost.get(key) <= nextCost) continue;
      bestCost.set(key, nextCost);
      open.push({ req: nextReq, chain: [act, ...cur.chain], cost: nextCost });
    }
  }
  return { actions: [], totalCost: Infinity };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.06, 0.03, 0.12],
    skyMid: [0.13, 0.07, 0.22],
    skyBot: [0.20, 0.11, 0.26],
    lightDir: [0.34, 0.88, 0.36],
    ambLow: [0.15, 0.10, 0.20],
    ambHigh: [0.38, 0.30, 0.46],
  });

  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);
  const sniperGpu = studio.uploadMesh(m.sniper);

  let crateIntact = true;

  function rebuildWorld() {
    const wBuf = [];
    // Tactical warehouse floor
    pushBox(wBuf, -7.2, 7.2, -0.45, 0.0, -4.8, 5.0, [0.28, 0.27, 0.35], 0);
    // Warehouse stone/concrete perimeter walls
    pushBox(wBuf, -7.2, 7.2, 0.0, 2.05, -5.25, -4.75, [0.34, 0.30, 0.42], 1);
    pushBox(wBuf, -7.2, -6.78, 0.0, 1.05, -4.75, 5.0, [0.32, 0.28, 0.40], 1);
    pushBox(wBuf,  6.78,  7.2, 0.0, 1.05, -4.75, 5.0, [0.32, 0.28, 0.40], 1);
    // Decorative corner shipping containers/pallets
    pushBox(wBuf, -6.5, -5.3, 0.0, 1.15, -4.55, -3.55, [0.38, 0.26, 0.34], 4);
    pushBox(wBuf,  5.3,  6.5, 0.0, 1.15, -4.55, -3.55, [0.28, 0.32, 0.42], 4);

    // 1. AMMO CRATE STATION at (-3.8, 0, -2.2)
    pushBox(wBuf, AMMO_POS.x - 0.82, AMMO_POS.x + 0.82, 0.0, 0.08, AMMO_POS.z - 0.82, AMMO_POS.z + 0.82, [1.0, 0.72, 0.14], 5);
    if (crateIntact) {
      // Intact glowing gold ammo crate!
      pushBox(wBuf, AMMO_POS.x - 0.54, AMMO_POS.x + 0.54, 0.08, 0.84, AMMO_POS.z - 0.54, AMMO_POS.z + 0.54, [0.84, 0.62, 0.16], 4);
      pushBox(wBuf, AMMO_POS.x - 0.44, AMMO_POS.x + 0.44, 0.84, 1.04, AMMO_POS.z - 0.44, AMMO_POS.z + 0.44, [1.0, 0.84, 0.18], 2);
    } else {
      // Charred rubble slabs when blown up!
      pushBox(wBuf, AMMO_POS.x - 0.48, AMMO_POS.x - 0.08, 0.08, 0.24, AMMO_POS.z - 0.36, AMMO_POS.z + 0.10, [0.16, 0.14, 0.18], 1);
      pushBox(wBuf, AMMO_POS.x + 0.05, AMMO_POS.x + 0.50, 0.08, 0.20, AMMO_POS.z - 0.10, AMMO_POS.z + 0.42, [0.20, 0.16, 0.19], 1);
      pushBox(wBuf, AMMO_POS.x - 0.22, AMMO_POS.x + 0.26, 0.08, 0.17, AMMO_POS.z - 0.52, AMMO_POS.z - 0.18, [0.26, 0.18, 0.16], 1);
    }

    // 2. COVER BARRICADE at (0.2, 0, -0.4)
    pushBox(wBuf, COVER_POS.x - 1.35, COVER_POS.x + 1.35, 0.0, 1.12, COVER_POS.z - 0.36, COVER_POS.z + 0.36, [0.46, 0.44, 0.54], 1);
    pushBox(wBuf, COVER_POS.x - 1.38, COVER_POS.x + 1.38, 1.12, 1.24, COVER_POS.z - 0.40, COVER_POS.z + 0.40, [1.0, 0.72, 0.12], 5);
    pushBox(wBuf, COVER_POS.x - 1.15, COVER_POS.x + 1.15, 0.0, 0.05, COVER_POS.z - 0.95, COVER_POS.z - 0.55, [0.18, 0.86, 1.0], 2);

    // 3. GRENADE RACK at (3.8, 0, -2.4)
    pushBox(wBuf, GRENADE_POS.x - 0.78, GRENADE_POS.x + 0.78, 0.0, 0.22, GRENADE_POS.z - 0.72, GRENADE_POS.z + 0.72, [0.30, 0.32, 0.42], 1);
    pushBox(wBuf, GRENADE_POS.x - 0.58, GRENADE_POS.x + 0.58, 0.22, 0.64, GRENADE_POS.z - 0.46, GRENADE_POS.z + 0.46, [0.22, 0.42, 0.32], 4);
    // Glowing tactical grenade canisters on rack
    pushBox(wBuf, GRENADE_POS.x - 0.42, GRENADE_POS.x - 0.10, 0.64, 1.06, GRENADE_POS.z - 0.18, GRENADE_POS.z + 0.18, [0.16, 0.96, 0.58], 2);
    pushBox(wBuf, GRENADE_POS.x + 0.10, GRENADE_POS.x + 0.42, 0.64, 1.06, GRENADE_POS.z - 0.18, GRENADE_POS.z + 0.18, [1.0, 0.50, 0.16], 2);

    // 4. TARGET PAD at (0.0, 0, 3.4)
    pushBox(wBuf, TARGET_POS.x - 1.15, TARGET_POS.x + 1.15, 0.0, 0.14, TARGET_POS.z - 0.95, TARGET_POS.z + 0.95, [0.34, 0.24, 0.32], 1);
    pushBox(wBuf, TARGET_POS.x - 1.20, TARGET_POS.x + 1.20, 0.0, 0.06, TARGET_POS.z - 1.08, TARGET_POS.z - 0.94, [0.96, 0.28, 0.32], 2);

    studio.setWorldData(wBuf);
  }

  const defaultCam = {
    yaw: 0.08,
    pitch: 0.62,
    dist: 16.2,
    targetX: 0.0,
    targetY: 0.5,
    targetZ: 0.2,
    fovDeg: 38,
  };

  let time = 0;
  let goapOn = true; // [T] GOAP Planner vs Rigid Script
  let userInteracted = false;

  const worldState = {
    hasAmmo: false,
    inCover: false,
    hasGrenade: false,
    crateIntact: true,
    targetDown: false,
  };

  const soldier = {
    x: SPAWN_POS.x,
    z: SPAWN_POS.z,
    yaw: -0.9,
    walkPhase: 0,
    moving: false,
    workT: 0,
    stuck: false,
    celebrateT: 0,
  };

  let currentPlan = [];
  let planCost = 0;
  let stepIdx = 0;
  let replans = 0;
  let completedRuns = 0;
  let lastBlast = null;  // { x, z, life, maxLife, kind }
  let grenadeArc = null; // { sx, sz, ex, ez, t, dur }
  let laserBeam = null;  // { sx, sz, ex, ez, life, maxLife }
  let sparks = [];

  let bannerText = "";
  let bannerColor = "#4ade80";
  let bannerTimer = 0;

  function setBanner(t, c = "#4ade80", dur = 2.1) {
    bannerText = t;
    bannerColor = c;
    bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 3.2;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.8 + Math.random() * 2.8,
        vz: Math.sin(a) * sp,
        r, g, b,
        life: 0.55,
        maxLife: 0.55,
      });
    }
  }

  function recomputePlan({ announce = false } = {}) {
    worldState.crateIntact = crateIntact;
    soldier.stuck = false;
    soldier.workT = 0;

    if (goapOn) {
      const res = planGoap(worldState, { targetDown: true });
      currentPlan = res.actions;
      planCost = res.totalCost;
      stepIdx = 0;
      if (announce) {
        replans++;
        const names = currentPlan.map((a) => a.labelEn).join(" → ");
        setBanner(
          crateIntact
            ? `GOAP PLAN (COST ${planCost}): ${names} ✓`
            : `CRATE GONE! GOAP RE-PLANNED LIVE (COST ${planCost}): ${names} ✓`,
          crateIntact ? "#38bdf8" : "#4ade80",
          2.4
        );
      }
    } else {
      // Rigid script always executes the hardcoded 3-step Ammo chain!
      currentPlan = RIGID_SCRIPT_IDS.map((id) => ACTIONS.find((a) => a.id === id));
      planCost = 6;
      stepIdx = 0;
      if (announce && !crateIntact) {
        setBanner("RIGID SCRIPT: NO RE-PLANNER — MARCHING TO MISSING AMMO CRATE! ✗", "#f87171", 2.3);
      }
    }
  }

  function startFreshCycle() {
    worldState.hasAmmo = false;
    worldState.inCover = false;
    worldState.hasGrenade = false;
    worldState.crateIntact = crateIntact;
    worldState.targetDown = false;
    soldier.x = SPAWN_POS.x;
    soldier.z = SPAWN_POS.z;
    soldier.yaw = 0;
    soldier.workT = 0;
    soldier.celebrateT = 0;
    soldier.stuck = false;
    recomputePlan({ announce: false });
  }

  function reset() {
    time = 0;
    crateIntact = true;
    replans = 0;
    completedRuns = 0;
    lastBlast = null;
    grenadeArc = null;
    laserBeam = null;
    sparks = [];
    bannerTimer = 0;
    rebuildWorld();
    startFreshCycle();
  }
  reset();

  function toggleCrate({ silent = false } = {}) {
    crateIntact = !crateIntact;
    worldState.crateIntact = crateIntact;
    rebuildWorld();

    if (!crateIntact) {
      lastBlast = { x: AMMO_POS.x, z: AMMO_POS.z, life: 0.72, maxLife: 0.72, kind: "crate" };
      spawnSparks(AMMO_POS.x, 0.7, AMMO_POS.z, 1.0, 0.56, 0.16, 22);
      if (!silent) audio?.shotgun?.();
    } else {
      spawnSparks(AMMO_POS.x, 0.7, AMMO_POS.z, 1.0, 0.86, 0.22, 12);
      if (!silent) audio?.wallClick?.(true);
    }

    // Immediately invalidate & re-plan live so blowing up or restoring the crate always reacts in 1 tick!
    if (!crateIntact) {
      worldState.hasAmmo = false;
      worldState.inCover = false;
      worldState.hasGrenade = false;
      worldState.targetDown = false;
      soldier.celebrateT = 0;
    } else if (!worldState.hasGrenade) {
      worldState.hasAmmo = false;
      worldState.inCover = false;
      worldState.targetDown = false;
      soldier.celebrateT = 0;
    }
    recomputePlan({ announce: !silent });
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (lastBlast) { lastBlast.life -= dt; if (lastBlast.life <= 0) lastBlast = null; }
    if (laserBeam) { laserBeam.life -= dt; if (laserBeam.life <= 0) laserBeam = null; }
    if (grenadeArc) {
      grenadeArc.t += dt;
      if (grenadeArc.t >= grenadeArc.dur) {
        lastBlast = { x: grenadeArc.ex, z: grenadeArc.ez, life: 0.85, maxLife: 0.85, kind: "detonate" };
        spawnSparks(grenadeArc.ex, 0.9, grenadeArc.ez, 1.0, 0.58, 0.14, 24);
        if (userInteracted) audio?.shotgun?.();
        grenadeArc = null;
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 8.0 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.06, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    // Celebratory pause after completing goal before running next tactical cycle
    if (worldState.targetDown) {
      soldier.moving = false;
      soldier.celebrateT -= dt;
      if (soldier.celebrateT <= 0) {
        startFreshCycle();
      }
      return;
    }

    const act = currentPlan[stepIdx];
    if (!act) {
      soldier.moving = false;
      return;
    }

    // Move smoothly toward current step's world position (routing cleanly around the Cover Barricade)
    const tx = act.pos.x;
    const tz = act.pos.z;
    const dx = tx - soldier.x;
    const dz = tz - soldier.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.24) {
      soldier.moving = true;
      soldier.stuck = false;
      const spd = 3.85;
      let nx = soldier.x + (dx / dist) * spd * dt;
      let nz = soldier.z + (dz / dist) * spd * dt;
      // Gentle avoidance around the center cover barricade so soldier doesn't clip through concrete
      if (nx > COVER_POS.x - 1.55 && nx < COVER_POS.x + 1.55 && nz > COVER_POS.z - 0.65 && nz < COVER_POS.z + 0.65) {
        nx += (soldier.x >= COVER_POS.x ? 1 : -1) * spd * dt;
      }
      soldier.x = clamp(nx, -6.0, 6.0);
      soldier.z = clamp(nz, -4.1, 4.1);
      soldier.yaw = Math.atan2(dx, dz);
      soldier.walkPhase += dt * 11.5;
      return;
    }

    // Arrived at action waypoint!
    soldier.moving = false;

    // Rigid Script Failure Case: trying to loot missing Ammo Crate!
    if (!goapOn && act.id === "get_ammo" && !crateIntact) {
      if (!soldier.stuck) {
        soldier.stuck = true;
        if (userInteracted) audio?.alertBuzzer?.();
        setBanner("SCRIPT STUCK · NO AMMO CRATE! PRESS [T] TO ENABLE GOAP PLANNER ✗", "#f87171", 2.4);
      }
      soldier.yaw += dt * 4.2;
      return;
    }

    // Face tactical target while executing combat actions
    if (act.id === "flank_fire" || act.id === "detonate") {
      soldier.yaw = Math.atan2(TARGET_POS.x - soldier.x, TARGET_POS.z - soldier.z);
    }

    soldier.workT += dt;
    if (soldier.workT >= act.workDur) {
      soldier.workT = 0;
      Object.assign(worldState, act.eff);

      if (act.id === "get_ammo" || act.id === "grab_grenade") {
        spawnSparks(soldier.x, 1.0, soldier.z, 0.22, 0.98, 0.60, 10);
        if (userInteracted) audio?.coinPickup?.();
      } else if (act.id === "flank_fire") {
        laserBeam = { sx: soldier.x, sz: soldier.z, ex: TARGET_POS.x, ez: TARGET_POS.z, life: 0.45, maxLife: 0.45 };
        spawnSparks(TARGET_POS.x, 1.0, TARGET_POS.z, 0.24, 0.94, 1.0, 18);
        if (userInteracted) audio?.laserShot?.(false);
      } else if (act.id === "detonate") {
        grenadeArc = { sx: soldier.x, sz: soldier.z, ex: TARGET_POS.x, ez: TARGET_POS.z, t: 0, dur: 0.36 };
        if (userInteracted) audio?.goalWin?.();
      }

      stepIdx++;
      if (worldState.targetDown) {
        completedRuns++;
        soldier.celebrateT = 1.35;
      }
    }
  }

  function drawActionChainDiagram(ctx, px, py, bw, isPl) {
    // Renders [STEP 1] -> [STEP 2] -> [STEP 3] boxes with live highlight & cost badge
    const steps = currentPlan.length > 0 ? currentPlan : [];
    const n = Math.max(1, steps.length);
    const arrowW = 14;
    const boxW = Math.floor((bw - arrowW * (n - 1)) / n);
    const boxH = 38;

    for (let i = 0; i < steps.length; i++) {
      const a = steps[i];
      const bx = px + i * (boxW + arrowW);
      const isDone = i < stepIdx || worldState.targetDown;
      const isCur = i === stepIdx && !worldState.targetDown;
      const isErr = isCur && soldier.stuck;

      ctx.fillStyle = isErr
        ? "rgba(239, 68, 68, 0.32)"
        : (isDone
            ? "rgba(16, 185, 129, 0.26)"
            : (isCur ? "rgba(56, 189, 248, 0.30)" : "rgba(30, 41, 59, 0.88)"));
      ctx.strokeStyle = isErr
        ? "#f87171"
        : (isDone ? "#4ade80" : (isCur ? "#38bdf8" : "rgba(100, 116, 139, 0.55)"));
      ctx.lineWidth = isCur || isErr ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.roundRect(bx, py, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.font = "800 8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = isErr ? "#fca5a5" : (isDone ? "#4ade80" : (isCur ? "#ffffff" : "#cbd5e1"));
      ctx.fillText(`${i + 1}. ${isPl ? a.labelPl : a.labelEn}`, bx + boxW * 0.5, py + 15, boxW - 6);

      ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = isErr ? "#f87171" : (isDone ? "#86efac" : (isCur ? "#fde047" : "#94a3b8"));
      const sub = isErr
        ? (isPl ? "UTKNĄŁ ✗" : "STUCK ✗")
        : (isDone ? "DONE ✓" : (isCur ? `COST ${a.cost} ●` : `COST ${a.cost}`));
      ctx.fillText(sub, bx + boxW * 0.5, py + 29, boxW - 6);

      // Connecting arrow
      if (i < steps.length - 1) {
        ctx.fillStyle = isDone ? "#4ade80" : "#64748b";
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText("→", bx + boxW + arrowW * 0.5, py + 23);
      }
    }
    ctx.textAlign = "left";
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Ammo Crate pill
      const ap = projectToScreen(viewProj, AMMO_POS.x, 1.55, AMMO_POS.z, cssW, cssH);
      if (ap) {
        drawWorldPill(
          ctx,
          ap.x,
          ap.y,
          crateIntact
            ? (isPl ? "SKRZYNIA AMMO (KLIK = ZNISZCZ)" : "AMMO CRATE (CLICK = BLOW UP)")
            : (isPl ? "ZNISZCZONA SKRZYNIA ✗" : "AMMO CRATE DESTROYED ✗"),
          crateIntact ? "#facc15" : "#f87171",
          cssW,
          cssH,
          isCompact ? 8.5 : 9.5
        );
      }

      // Grenade Rack pill
      const gp = projectToScreen(viewProj, GRENADE_POS.x, 1.55, GRENADE_POS.z, cssW, cssH);
      if (gp) {
        const safeX = (!isCompact && !document.body.classList.contains("no-hud") && gp.y < 235)
          ? Math.min(gp.x, cssW - 390)
          : gp.x;
        drawWorldPill(
          ctx,
          safeX,
          gp.y,
          isPl ? "STOJAK GRANATÓW (PLAN B)" : "GRENADE RACK (ALT PLAN)",
          !crateIntact && goapOn ? "#4ade80" : "#fb923c",
          cssW,
          cssH,
          isCompact ? 8.5 : 9.5
        );
      }

      // Cover Barricade pill
      const cp = projectToScreen(viewProj, COVER_POS.x, 1.65, COVER_POS.z, cssW, cssH);
      if (cp) {
        drawWorldPill(ctx, cp.x, cp.y, isPl ? "OSŁONA" : "COVER", "#38bdf8", cssW, cssH, isCompact ? 8 : 9);
      }

      // Soldier active step pill!
      const sp = projectToScreen(viewProj, soldier.x, 2.25, soldier.z, cssW, cssH);
      if (sp) {
        const curAct = currentPlan[stepIdx];
        let txt = "";
        let col = "#4ade80";
        if (soldier.stuck) {
          txt = isPl ? "SKRYPT UTKNĄŁ · BRAK AMMO! ✗" : "SCRIPT STUCK · NO AMMO CRATE! ✗";
          col = "#f87171";
        } else if (worldState.targetDown) {
          txt = !crateIntact
            ? (isPl ? "CEL ZNISZCZONY GRANATEM! ✓" : "RE-PLANNED LIVE · TARGET DOWN! ✓")
            : (isPl ? "CEL WYELIMINOWANY! ✓" : "GOAL ACHIEVED · TARGET DOWN! ✓");
          col = "#4ade80";
        } else if (curAct) {
          const prefix = !crateIntact && goapOn ? "RE-PLAN: " : "GOAP: ";
          txt = `${goapOn ? prefix : "SCRIPT: "}${isPl ? curAct.labelPl : curAct.labelEn}`;
          col = !crateIntact && goapOn ? "#4ade80" : "#38bdf8";
        }
        drawWorldPill(ctx, sp.x, sp.y, txt, col, cssW, cssH, isCompact ? 9 : 10.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${goapOn ? "GOAP" : "SCRIPT"} · ${crateIntact ? "CRATE OK" : (soldier.stuck ? "STUCK ✗" : "RE-PLANNED ✓")} · COST ${planCost}`,
          soldier.stuck ? "#f87171" : (!crateIntact && goapOn ? "#4ade80" : "#38bdf8"),
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14;
        const panelW = 352;
        const panelH = 196;
        const px = cssW - panelW - pad;
        const bw = panelW - 24;

        ctx.save();
        ctx.fillStyle = "rgba(14, 10, 26, 0.90)";
        ctx.strokeStyle = soldier.stuck
          ? "rgba(248, 113, 113, 0.85)"
          : (!crateIntact && goapOn ? "rgba(74, 222, 128, 0.85)" : "rgba(168, 85, 247, 0.78)");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = soldier.stuck ? "#f87171" : (!crateIntact && goapOn ? "#4ade80" : "#c084fc");
        ctx.fillText(
          goapOn
            ? (isPl ? `PLANER GOAP · CEL: TARGET DOWN (KOSZT ${planCost})` : `GOAP PLANNER · GOAL: TARGET DOWN (COST ${planCost})`)
            : (isPl ? "SZTYWNY SKRYPT · BRAK RE-PLANOWANIA!" : "RIGID SCRIPT · HARDCODED STEPS ONLY!"),
          px + 12,
          py + 21,
          bw
        );

        // Live Action Chain boxes!
        drawActionChainDiagram(ctx, px + 12, py + 32, bw, isPl);

        // Symbolic World State chips
        const flags = [
          { k: "crateIntact", lbl: "CRATE", v: worldState.crateIntact },
          { k: "hasAmmo",     lbl: "AMMO",  v: worldState.hasAmmo },
          { k: "hasGrenade",  lbl: "GREN",  v: worldState.hasGrenade },
          { k: "inCover",     lbl: "COVER", v: worldState.inCover },
        ];
        const chipW = Math.floor((bw - 18) / 4);
        for (let i = 0; i < flags.length; i++) {
          const f = flags[i];
          const cx = px + 12 + i * (chipW + 6);
          const cy = py + 84;
          ctx.fillStyle = f.v ? "rgba(16, 185, 129, 0.22)" : "rgba(30, 41, 59, 0.86)";
          ctx.strokeStyle = f.v ? "#4ade80" : (f.k === "crateIntact" ? "#f87171" : "rgba(100, 116, 139, 0.45)");
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.roundRect(cx, cy, chipW, 22, 4);
          ctx.fill();
          ctx.stroke();
          ctx.font = "800 8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = f.v ? "#4ade80" : (f.k === "crateIntact" ? "#fca5a5" : "#94a3b8");
          ctx.fillText(`${f.lbl}:${f.v ? "T" : "F"}`, cx + chipW * 0.5, cy + 14);
        }
        ctx.textAlign = "left";

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = soldier.stuck ? "#fca5a5" : "#e2e8f0";
        ctx.fillText(
          isPl
            ? `Re-plany: ${replans} · Ukończone akcje: ${completedRuns}`
            : `Live Re-Plans: ${replans} · Goals Completed: ${completedRuns}`,
          px + 12,
          py + 130,
          bw
        );
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "V lub Klik = Zniszcz / Odbuduj Skrzynię Ammo" : "V or Click = Blow Up / Restore Ammo Crate",
          px + 12,
          py + 155,
          bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "T = Planer GOAP vs Sztywny Skrypt" : "T = GOAP Planner vs Rigid Script",
          px + 12,
          py + 176,
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
          id: "toggle-goap",
          label: goapOn
            ? (pl ? "Planer GOAP: WŁ [T]" : "GOAP Planner: ON [T]")
            : (pl ? "Sztywny Skrypt [T]" : "Rigid Script [T]"),
          pressed: goapOn,
        },
        {
          id: "toggle-crate",
          label: crateIntact
            ? (pl ? "Zniszcz Skrzynię Ammo [V]" : "Destroy Ammo Crate [V]")
            : (pl ? "Odbuduj Skrzynię Ammo [V]" : "Restore Ammo Crate [V]"),
          pressed: !crateIntact,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-goap") {
        goapOn = !goapOn;
        audio?.ruleSwitch?.(goapOn);
        recomputePlan({ announce: true });
      } else if (id === "toggle-crate") {
        toggleCrate({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-goap");
      else if (code === "KeyV") this.onAction("toggle-crate");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        toggleCrate({ silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const sTint = soldier.stuck
        ? [1.0, 0.22, 0.28, 0.72]
        : (worldState.hasGrenade
            ? [0.18, 0.96, 0.56, 0.42]
            : (worldState.hasAmmo ? [1.0, 0.80, 0.18, 0.36] : [0.30, 0.72, 1.0, 0.22]));

      const targetTint = worldState.targetDown ? [1.0, 0.28, 0.24, 0.65] : [0.96, 0.32, 0.34, 0.18];

      const meshes = [
        {
          gpu: runnerGpu,
          x: soldier.x,
          y: 0.0,
          z: soldier.z,
          yaw: soldier.yaw,
          animA: soldier.walkPhase,
          animB: soldier.moving ? 1.0 : 0.0,
          scale: 1.12,
          animMode: 2,
          tint: sTint,
        },
        {
          gpu: sniperGpu,
          x: TARGET_POS.x,
          y: 0.14,
          z: TARGET_POS.z,
          yaw: Math.PI,
          animA: worldState.targetDown ? 0.28 : 0.0,
          scale: 1.16,
          animMode: 1,
          tint: targetTint,
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Ammo Crate halo or red missing X-Ray silhouette
          if (crateIntact) {
            fx.ringXZ(AMMO_POS.x, 0.10, AMMO_POS.z, 1.12, [1.0, 0.84, 0.18, 0.72]);
          } else {
            const pulse = 0.52 + 0.32 * Math.sin(time * 7.0);
            fx.xrayBox(
              AMMO_POS.x - 0.56, AMMO_POS.x + 0.56,
              0.08, 1.04,
              AMMO_POS.z - 0.56, AMMO_POS.z + 0.56,
              [1.0, 0.26, 0.28, pulse]
            );
            fx.ringXZ(AMMO_POS.x, 0.10, AMMO_POS.z, 1.18, [1.0, 0.26, 0.28, 0.75]);
          }

          // Grenade Rack ring (brightens when selected by GOAP re-plan!)
          const grenActive = !crateIntact && goapOn;
          fx.ringXZ(
            GRENADE_POS.x,
            0.09,
            GRENADE_POS.z,
            grenActive ? 1.25 : 1.02,
            grenActive ? [0.18, 0.98, 0.56, 0.88] : [1.0, 0.52, 0.18, 0.45]
          );

          // Target ring
          fx.ringXZ(
            TARGET_POS.x,
            0.16,
            TARGET_POS.z,
            1.30,
            worldState.targetDown ? [0.22, 1.0, 0.62, 0.82] : [1.0, 0.30, 0.34, 0.52]
          );

          // Dashed 3D plan trajectory connecting soldier through remaining plan waypoints -> Target!
          const planCol = soldier.stuck
            ? [1.0, 0.26, 0.28, 0.82]
            : (!crateIntact && goapOn ? [0.18, 0.98, 0.58, 0.84] : [0.26, 0.84, 1.0, 0.78]);
          let px = soldier.x, pz = soldier.z;
          for (let i = stepIdx; i < currentPlan.length; i++) {
            const wp = currentPlan[i].pos;
            fx.beam(px, 0.18, pz, wp.x, 0.18, wp.z, 0.10, planCol, 4);
            fx.ringXZ(wp.x, 0.08, wp.z, 0.52, planCol);
            px = wp.x; pz = wp.z;
          }
          if (!worldState.targetDown && currentPlan.length > 0 && !soldier.stuck) {
            fx.beam(px, 0.18, pz, TARGET_POS.x, 0.18, TARGET_POS.z, 0.08, [1.0, 0.46, 0.36, 0.55], 4);
          }

          // Active combat laser beam (Flank Fire)
          if (laserBeam) {
            const a = clamp(laserBeam.life / laserBeam.maxLife, 0, 1);
            fx.beam(laserBeam.sx, 1.05, laserBeam.sz, laserBeam.ex, 1.05, laserBeam.ez, 0.18, [0.24, 0.96, 1.0, a], 0);
          }

          // Parabolic thrown grenade orb (Detonate!)
          if (grenadeArc) {
            const u = clamp(grenadeArc.t / grenadeArc.dur, 0, 1);
            const gx = grenadeArc.sx + (grenadeArc.ex - grenadeArc.sx) * u;
            const gz = grenadeArc.sz + (grenadeArc.ez - grenadeArc.sz) * u;
            const gy = 1.0 + Math.sin(u * Math.PI) * 2.4;
            fx.billboard(gx, gy, gz, 0.28, basis.right, basis.up, [1.0, 0.56, 0.14, 0.96], 2);
            fx.beam(grenadeArc.sx, 1.0, grenadeArc.sz, gx, gy, gz, 0.08, [1.0, 0.64, 0.22, 0.65], 4);
          }

          // Explosion shockwave ring
          if (lastBlast) {
            const u = 1.0 - clamp(lastBlast.life / lastBlast.maxLife, 0, 1);
            const rad = 0.6 + u * 2.6;
            const a = (1.0 - u) * 0.92;
            fx.ringXZ(lastBlast.x, 0.20, lastBlast.z, rad, [1.0, 0.52, 0.14, a]);
            fx.billboard(lastBlast.x, 0.9, lastBlast.z, (1.0 - u) * 1.15, basis.right, basis.up, [1.0, 0.72, 0.22, a * 0.85], 2);
          }

          // Sparks
          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, 0.16 * a + 0.04, basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });

      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        goapOn,
        crateIntact,
        planIds: currentPlan.map((a) => a.id),
        planCost,
        stepIdx,
        stuck: soldier.stuck,
        worldState: { ...worldState },
        replans,
        completedRuns,
      };
    },
  };
}
