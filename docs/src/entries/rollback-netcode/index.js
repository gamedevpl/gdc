// Entry #43: Rollback Netcode (GGPO) vs Delay-Based — Playable 3D Fighting-Game Netcode Visualizer!
// Shows why modern fighting games (Street Fighter 6, Guilty Gear Strive) feel crisp (0ms local input lag)
// at 120ms ping: local inputs execute on Frame 0 while the remote fighter is predicted forward — when a
// delayed packet arrives 4 frames later, the engine flashes the old ghost, rewinds, and resimulates cleanly!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const FIXED_DT = 1 / 60;
const STAGE_HALF_X = 5.4;
const PING_OPTIONS = [120, 200, 60];
const HISTORY_LEN = 128;
const TAPE_LEN = 42;

function delayFramesForPing(pingMs) {
  return Math.max(2, Math.round(pingMs / 30)); // 60ms -> 2f, 120ms -> 4f, 200ms -> 7f
}

function cloneFighter(f) {
  return {
    x: f.x, vx: f.vx, state: f.state, timer: f.timer,
    walkPhase: f.walkPhase, hitFlash: f.hitFlash, blockFlash: f.blockFlash,
    hitsLanded: f.hitsLanded, dashDir: f.dashDir,
  };
}

function cloneWorld(s) {
  return {
    frame: s.frame,
    p1: cloneFighter(s.p1),
    p2: cloneFighter(s.p2),
    clashCooldown: s.clashCooldown,
  };
}

function inputsDiffer(a, b) {
  if (!a || !b) return true;
  return a.move !== b.move || a.strike !== b.strike || a.dash !== b.dash || a.block !== b.block;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.07, 0.02, 0.09],
    skyMid: [0.16, 0.05, 0.16],
    skyBot: [0.26, 0.09, 0.18],
    lightDir: [0.28, 0.88, 0.40],
    ambLow: [0.16, 0.10, 0.19],
    ambHigh: [0.42, 0.34, 0.48],
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build 3D Esports Fighting-Game Tournament Dojo Stage
  const wBuf = [];
  // Lower plinth & raised tournament mat
  pushBox(wBuf, -7.2, 7.2, -1.05, -0.45, -4.0, 4.0, [0.11, 0.09, 0.16], 1);
  pushBox(wBuf, -6.5, 6.5, -0.45, 0.0, -3.3, 3.3, [0.16, 0.14, 0.22], 0);
  // Center fighting lane inlay
  pushBox(wBuf, -5.8, 5.8, 0.0, 0.02, -1.25, 1.25, [0.20, 0.17, 0.27], 0);
  // P1 Left Cyan Glowing Mat Borders
  pushBox(wBuf, -6.2, -0.14, 0.0, 0.06, -3.12, -2.92, [0.12, 0.88, 1.0], 2);
  pushBox(wBuf, -6.2, -0.14, 0.0, 0.06,  2.92,  3.12, [0.12, 0.88, 1.0], 2);
  pushBox(wBuf, -6.2, -6.00, 0.0, 0.06, -3.12,  3.12, [0.12, 0.88, 1.0], 2);
  // P2 Right Coral-Red Glowing Mat Borders
  pushBox(wBuf,  0.14,  6.2, 0.0, 0.06, -3.12, -2.92, [1.0, 0.28, 0.36], 2);
  pushBox(wBuf,  0.14,  6.2, 0.0, 0.06,  2.92,  3.12, [1.0, 0.28, 0.36], 2);
  pushBox(wBuf,  6.00,  6.2, 0.0, 0.06, -3.12,  3.12, [1.0, 0.28, 0.36], 2);
  // Center Neutral Clash Line
  pushBox(wBuf, -0.06, 0.06, 0.0, 0.05, -2.9, 2.9, [0.96, 0.82, 0.32], 2);
  // Backstage Dojo Torii / Esports Stage Pillars & Top Lintel Beam
  for (const px of [-5.8, -2.6, 2.6, 5.8]) {
    const isLeft = px < 0;
    pushBox(wBuf, px - 0.34, px + 0.34, 0.0, 3.25, -3.75, -3.15, [0.18, 0.15, 0.25], 1);
    pushBox(wBuf, px - 0.40, px + 0.40, 3.25, 3.44, -3.82, -3.08, isLeft ? [0.14, 0.86, 1.0] : [1.0, 0.30, 0.38], 2);
    pushBox(wBuf, px - 0.44, px + 0.44, 0.0, 0.28, -3.84, -3.06, [0.24, 0.20, 0.32], 1);
  }
  // Overhead stage truss lintel & backlit crest
  pushBox(wBuf, -6.35, 6.35, 3.44, 3.82, -3.72, -3.22, [0.15, 0.12, 0.22], 1);
  pushBox(wBuf, -1.6, 1.6, 3.05, 3.55, -3.65, -3.25, [0.24, 0.16, 0.30], 1);
  pushBox(wBuf, -1.3, 1.3, 3.16, 3.30, -3.25, -3.18, [0.98, 0.78, 0.22], 2);
  // Front corner stage bollards
  for (const bx of [-6.3, 6.3]) {
    pushBox(wBuf, bx - 0.22, bx + 0.22, 0.0, 0.52, 2.96, 3.34, [0.22, 0.19, 0.30], 1);
    pushBox(wBuf, bx - 0.24, bx + 0.24, 0.52, 0.62, 2.94, 3.36, bx < 0 ? [0.12, 0.88, 1.0] : [1.0, 0.30, 0.38], 2);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.28, dist: 14.2, targetX: 0.0, targetY: 1.2, targetZ: 0.0, fovDeg: 38 };

  let time = 0;
  let simAcc = 0;
  let rollbackOn = true; // ON: GGPO Rollback (0ms input lag) | OFF: Delay-Based (pingMs freeze!)
  let pingIdx = 0;
  let pingMs = PING_OPTIONS[pingIdx];
  let autoDemo = true;
  let userInteracted = false;

  // Authoritative / local 60Hz world state
  let world = null;
  let stateHistory = new Array(HISTORY_LEN);
  let p1Inputs = new Array(HISTORY_LEN);
  let p2PredInputs = new Array(HISTORY_LEN);
  let p2Confirmed = new Array(HISTORY_LEN);
  let p2WireQueue = [];     // { frame, deliverFrame, input }
  let p1DelayQueue = [];    // used in Delay-Based mode: { deliverFrame, input, strikeQueued }
  let lastConfirmedP2 = { move: 0, strike: false, dash: 0, block: false };
  let p2ReactionCd = 0;
  let manualStrikeQueued = false;
  let autoStrikeCd = 0;

  // Visual telemetry & FX
  let rollbackCount = 0;
  let lastRollbackFrames = 0;
  let strikeCount = 0;
  let rollbackGhost = null; // { x, oldState, oldTimer, walkPhase, newX, frames, life, maxLife }
  let delayWaitFX = null;   // { startT, dur, x }
  let sparks = [];
  let tape = [];            // ring of last TAPE_LEN frames: { frame, kind, rollbackSpan }
  let rollbackBrackets = []; // { startFrame, endFrame, frames, age }

  let bannerText = "";
  let bannerColor = "#22d3ee";
  let bannerTimer = 0;
  function setBanner(t, c = "#22d3ee", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function spawnSparks(x, y, z, r, g, b, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 3.4;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: 1.4 + Math.random() * 2.8,
        vz: Math.sin(a) * sp * 0.65,
        r, g, b, size: 0.16 + Math.random() * 0.08,
        life: 0.42, maxLife: 0.42,
      });
    }
  }

  function stepFighter(f, other, inp, facing, emitFx) {
    f.hitFlash = Math.max(0, f.hitFlash - FIXED_DT * 3.2);
    f.blockFlash = Math.max(0, f.blockFlash - FIXED_DT * 3.0);

    if (f.state === "idle") {
      if (inp.strike) {
        f.state = "strike";
        f.timer = 16; // 16f active lunge strike
        f.vx = facing * 8.6;
        if (emitFx) {
          strikeCount++;
          if (userInteracted) audio?.sandDash?.();
        }
      } else if (inp.dash !== 0) {
        f.state = "dash";
        f.timer = 11;
        f.dashDir = inp.dash;
        f.vx = inp.dash * 9.8;
      } else if (inp.block) {
        f.state = "block";
        f.timer = 18;
        f.vx = -facing * 2.4;
        f.blockFlash = 1.0;
      } else {
        const targetVx = inp.move * 4.4;
        f.vx += (targetVx - f.vx) * 0.34;
        if (Math.abs(f.vx) > 0.25) f.walkPhase += Math.abs(f.vx) * FIXED_DT * 2.7;
      }
    } else if (f.state === "strike") {
      f.timer--;
      f.vx *= 0.86;
      if (f.timer <= 0) {
        f.state = "recover";
        f.timer = 10;
      }
    } else if (f.state === "dash") {
      f.timer--;
      f.vx *= 0.84;
      f.walkPhase += Math.abs(f.vx) * FIXED_DT * 3.2;
      if (f.timer <= 0) f.state = "idle";
    } else if (f.state === "block") {
      f.timer--;
      f.vx *= 0.82;
      if (f.timer <= 0) f.state = "idle";
    } else if (f.state === "hitstun") {
      f.timer--;
      f.vx *= 0.85;
      if (f.timer <= 0) f.state = "idle";
    } else if (f.state === "recover") {
      f.timer--;
      f.vx *= 0.82;
      if (f.timer <= 0) f.state = "idle";
    }

    f.x = clamp(f.x + f.vx * FIXED_DT, -STAGE_HALF_X, STAGE_HALF_X);
    // Keep P1 left of P2 with clean fighter spacing
    const gap = other.x - f.x;
    if (facing > 0 && gap < 1.15) {
      f.x = Math.min(f.x, other.x - 1.15);
    } else if (facing < 0 && -gap < 1.15) {
      f.x = Math.max(f.x, other.x + 1.15);
    }
  }

  function stepDeterministic(s, in1, in2, emitFx) {
    s.frame++;
    if (s.clashCooldown > 0) s.clashCooldown--;
    stepFighter(s.p1, s.p2, in1, +1, emitFx);
    stepFighter(s.p2, s.p1, in2, -1, false);

    // Resolve melee hit/block clash cleanly
    const dist = Math.abs(s.p2.x - s.p1.x);
    if (s.clashCooldown === 0 && dist < 2.25) {
      if (s.p1.state === "strike" && s.p1.timer >= 6 && s.p1.timer <= 13) {
        s.clashCooldown = 14;
        if (s.p2.state === "block" || s.p2.state === "dash") {
          s.p2.blockFlash = 1.0;
          s.p2.vx = 5.2;
          s.p1.vx = -3.8;
          if (emitFx) {
            spawnSparks((s.p1.x + s.p2.x) * 0.5, 1.18, 0, 0.25, 0.92, 1.0, 14);
            if (userInteracted) audio?.hammerImpact?.(false, false);
          }
        } else {
          s.p2.state = "hitstun";
          s.p2.timer = 14;
          s.p2.vx = 6.8;
          s.p2.hitFlash = 1.0;
          s.p1.hitsLanded++;
          if (emitFx) {
            spawnSparks(s.p2.x - 0.35, 1.18, 0, 1.0, 0.78, 0.18, 16);
            if (userInteracted) audio?.hammerImpact?.(true, true);
          }
        }
      } else if (s.p2.state === "strike" && s.p2.timer >= 6 && s.p2.timer <= 13) {
        s.clashCooldown = 14;
        s.p1.state = "hitstun";
        s.p1.timer = 12;
        s.p1.vx = -5.8;
        s.p1.hitFlash = 1.0;
        s.p2.hitsLanded++;
        if (emitFx) {
          spawnSparks(s.p1.x + 0.35, 1.18, 0, 1.0, 0.32, 0.42, 14);
          if (userInteracted) audio?.hammerImpact?.(true, false);
        }
      }
    }
  }

  function generateRemoteP2Input(fNum, curWorld, p1JustStruck) {
    const dist = curWorld.p2.x - curWorld.p1.x;
    const midX = (curWorld.p1.x + curWorld.p2.x) * 0.5;
    if (p2ReactionCd > 0) p2ReactionCd--;

    // Reactive counter-dash, block, or counter-strike whenever P1 attacks (dramatic GGPO rollbacks!)
    if (curWorld.p2.state === "idle" && p2ReactionCd === 0) {
      if (p1JustStruck && dist < 3.8) {
        p2ReactionCd = 36;
        const pattern = Math.floor(fNum / 19) % 3;
        if (pattern === 0 && curWorld.p2.x < 3.6) return { move: 0, strike: false, dash: +1, block: false };
        if (pattern === 1) return { move: 0, strike: false, dash: 0, block: true };
        return { move: 0, strike: true, dash: 0, block: false };
      }
      if (dist > 3.7 && (fNum % 64 === 0)) {
        p2ReactionCd = 30;
        return { move: 0, strike: false, dash: -1, block: false };
      }
      if (midX > 1.1 && dist < 2.6 && (fNum % 48 === 0)) {
        p2ReactionCd = 34;
        return { move: 0, strike: true, dash: 0, block: false };
      }
    }

    // Crisp quantized footsies (holds stance ~24f at a time so rollbacks are distinct & readable!)
    const phase = Math.floor(fNum / 24);
    const idealDist = 2.35 + (phase % 2 === 0 ? -0.35 : 0.55);
    let move = 0;
    if (midX > 1.15 && dist > 1.75) move = -1;
    else if (dist > idealDist + 0.35) move = -1;
    else if (dist < idealDist - 0.35 && curWorld.p2.x < 3.8) move = +1;
    return { move, strike: false, dash: 0, block: false };
  }

  function generateAutoP1Input(fNum, curWorld) {
    const dist = curWorld.p2.x - curWorld.p1.x;
    const midX = (curWorld.p1.x + curWorld.p2.x) * 0.5;
    let strike = false;
    autoStrikeCd--;
    if (autoStrikeCd <= 0 && curWorld.p1.state === "idle" && dist < 3.45) {
      strike = true;
      autoStrikeCd = 76; // brisk duel rhythm every ~1.25s
    }
    let move = 0;
    if (midX > 1.25) move = -1;
    else if (midX < -1.25) move = +1;
    else if (dist > 2.65) move = +1;
    else if (dist < 1.85) move = -1;
    return { move, strike, dash: 0, block: false };
  }

  function pushTape(frame, kind) {
    tape.push({ frame, kind });
    if (tape.length > TAPE_LEN) tape.shift();
  }

  function reset() {
    time = 0;
    simAcc = 0;
    autoDemo = true;
    rollbackCount = 0;
    lastRollbackFrames = 0;
    strikeCount = 0;
    rollbackGhost = null;
    delayWaitFX = null;
    sparks = [];
    tape = [];
    rollbackBrackets = [];
    p2WireQueue = [];
    p1DelayQueue = [];
    manualStrikeQueued = false;
    p2ReactionCd = 0;
    autoStrikeCd = 16; // First strike fires within ~0.28s, first 4f rollback lands by ~0.45s!
    lastConfirmedP2 = { move: 0, strike: false, dash: 0, block: false };

    world = {
      frame: 0,
      p1: { x: -1.65, vx: 0, state: "idle", timer: 0, walkPhase: 0, hitFlash: 0, blockFlash: 0, hitsLanded: 0, dashDir: 0 },
      p2: { x:  1.65, vx: 0, state: "idle", timer: 0, walkPhase: 0, hitFlash: 0, blockFlash: 0, hitsLanded: 0, dashDir: 0 },
      clashCooldown: 0,
    };
    stateHistory.fill(null);
    p1Inputs.fill(null);
    p2PredInputs.fill(null);
    p2Confirmed.fill(null);
    bannerTimer = 0;

    // Pre-warm 14 frames so Frame 1 already has a lively frame-tape & fighters in stance!
    for (let i = 0; i < 14; i++) stepTick(null);
  }

  function triggerStrike({ manual = true } = {}) {
    if (manual) {
      userInteracted = true;
      autoDemo = false;
    }
    manualStrikeQueued = true;
    if (!rollbackOn) {
      const waitSec = pingMs / 1000;
      delayWaitFX = { startT: time, dur: waitSec, x: world.p1.x };
      if (userInteracted) audio?.inputIgnored?.();
      setBanner(`DELAY-BASED: STRIKE QUEUED — WAITING ${pingMs}ms! ✗`, "#f87171", 1.7);
    } else if (manual) {
      setBanner(`GGPO ROLLBACK: FRAME-0 STRIKE (0ms INPUT LAG ✓)`, "#22d3ee", 1.6);
    }
  }

  function stepTick(keys) {
    const f = world.frame;
    const dFrames = delayFramesForPing(pingMs);

    // 1. Sample raw P1 intent
    let rawMove = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) rawMove -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) rawMove += 1;
    let rawP1;
    if (rawMove !== 0) {
      autoDemo = false;
      userInteracted = true;
      rawP1 = { move: rawMove, strike: manualStrikeQueued, dash: 0, block: false };
    } else if (autoDemo) {
      rawP1 = generateAutoP1Input(f, world);
      if (manualStrikeQueued) rawP1.strike = true;
    } else {
      rawP1 = { move: 0, strike: manualStrikeQueued, dash: 0, block: false };
    }
    manualStrikeQueued = false;

    // 2. Generate remote P2's true input at frame f and send it over the delayed wire!
    const trueP2 = generateRemoteP2Input(f, world, rawP1.strike);
    p2WireQueue.push({ frame: f, deliverFrame: f + dFrames, input: trueP2 });

    if (rollbackOn) {
      // === GGPO ROLLBACK NETCODE ===
      // Save pre-step snapshot at slot f
      const slot = f % HISTORY_LEN;
      stateHistory[slot] = cloneWorld(world);
      p1Inputs[slot] = { ...rawP1 };
      p2PredInputs[slot] = { ...lastConfirmedP2 };
      p2Confirmed[slot] = false;

      // Execute P1 immediately on Frame 0 + predicted P2!
      stepDeterministic(world, rawP1, lastConfirmedP2, true);
      pushTape(world.frame, rawP1.strike ? "p1-strike" : "clean");

      // Check for newly arrived remote P2 packets!
      let earliestMismatch = Infinity;
      while (p2WireQueue.length > 0 && p2WireQueue[0].deliverFrame <= world.frame) {
        const pkt = p2WireQueue.shift();
        const age = world.frame - pkt.frame;
        if (age >= HISTORY_LEN - 2) continue;
        const pSlot = pkt.frame % HISTORY_LEN;
        lastConfirmedP2 = { ...pkt.input };
        p2Confirmed[pSlot] = true;
        if (inputsDiffer(p2PredInputs[pSlot], pkt.input)) {
          p2PredInputs[pSlot] = { ...pkt.input };
          if (pkt.frame < earliestMismatch) earliestMismatch = pkt.frame;
        }
      }

      // If remote P2 deviated from prediction -> REWIND & RESIMULATE!
      if (earliestMismatch < world.frame && stateHistory[earliestMismatch % HISTORY_LEN]) {
        const oldP2 = cloneFighter(world.p2);
        const span = world.frame - earliestMismatch;
        const targetFrame = world.frame;

        // Rewind world back to earliestMismatch snapshot
        world = cloneWorld(stateHistory[earliestMismatch % HISTORY_LEN]);

        // Replay forward from earliestMismatch to targetFrame cleanly!
        let curP2Input = p2PredInputs[earliestMismatch % HISTORY_LEN];
        for (let rf = earliestMismatch; rf < targetFrame; rf++) {
          const rs = rf % HISTORY_LEN;
          stateHistory[rs] = cloneWorld(world);
          if (p2Confirmed[rs]) curP2Input = p2PredInputs[rs];
          else p2PredInputs[rs] = { ...curP2Input };
          stepDeterministic(world, p1Inputs[rs], curP2Input, rf === targetFrame - 1);
        }

        // Only surface dramatic ghost visual when P2 actually diverged visibly
        const posDiff = Math.abs(world.p2.x - oldP2.x);
        const stateDiff = world.p2.state !== oldP2.state;
        if (posDiff > 0.08 || stateDiff) {
          rollbackCount++;
          lastRollbackFrames = span;
          rollbackGhost = {
            x: oldP2.x,
            state: oldP2.state,
            timer: oldP2.timer,
            walkPhase: oldP2.walkPhase,
            newX: world.p2.x,
            frames: span,
            life: 1.15,
            maxLife: 1.15,
          };
          rollbackBrackets.push({ startFrame: earliestMismatch, endFrame: targetFrame, frames: span, age: 0 });
          if (rollbackBrackets.length > 6) rollbackBrackets.shift();
          spawnSparks(oldP2.x, 1.05, 0, 1.0, 0.82, 0.18, 10);
          if (userInteracted) audio?.coyoteSave?.();
        }
      }
    } else {
      // === DELAY-BASED NETCODE (Lockstep Input Delay!) ===
      const delayTicks = Math.max(4, Math.round((pingMs / 1000) / FIXED_DT));
      if (rawP1.strike) {
        delayWaitFX = { startT: time, dur: pingMs / 1000, x: world.p1.x };
      }
      p1DelayQueue.push({ deliverFrame: f + delayTicks, input: { ...rawP1 } });

      // P1 CANNOT move or strike until the buffered input matures after pingMs!
      let appliedP1 = { move: 0, strike: false, dash: 0, block: false };
      let waitingOnInput = false;
      while (p1DelayQueue.length > 0 && p1DelayQueue[0].deliverFrame <= f) {
        appliedP1 = p1DelayQueue.shift().input;
      }
      // Check if any strike or move is currently stuck in the delay queue
      for (const q of p1DelayQueue) {
        if (q.input.strike || q.input.move !== 0) { waitingOnInput = true; break; }
      }

      // Deliver P2 packets in lockstep
      let appliedP2 = lastConfirmedP2;
      while (p2WireQueue.length > 0 && p2WireQueue[0].deliverFrame <= f) {
        appliedP2 = p2WireQueue.shift().input;
        lastConfirmedP2 = appliedP2;
      }

      stepDeterministic(world, appliedP1, appliedP2, true);
      pushTape(world.frame, waitingOnInput ? "delay-wait" : (appliedP1.strike ? "p1-strike" : "clean"));
    }
  }

  reset();

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (rollbackGhost) {
      rollbackGhost.life -= dt;
      if (rollbackGhost.life <= 0) rollbackGhost = null;
    }
    if (delayWaitFX && time - delayWaitFX.startT > delayWaitFX.dur) {
      delayWaitFX = null;
    }
    for (let i = rollbackBrackets.length - 1; i >= 0; i--) {
      rollbackBrackets[i].age += dt;
      if (rollbackBrackets[i].age > 3.2) rollbackBrackets.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 8.5 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.06, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    simAcc += dt;
    let steps = 0;
    while (simAcc >= FIXED_DT && steps < 4) {
      simAcc -= FIXED_DT;
      stepTick(keys);
      steps++;
    }
  }

  function fighterPose(f, facing) {
    if (f.state === "strike") {
      // Dramatic forward punch lunge!
      const prog = 1 - f.timer / 16;
      const tilt = Math.sin(clamp(prog * Math.PI, 0, Math.PI)) * 0.42;
      return { animMode: 4, animA: tilt, animB: 0, yOff: 0.05 * Math.sin(prog * Math.PI) };
    }
    if (f.state === "hitstun") {
      return { animMode: 4, animA: -0.34 * (f.timer / 14), animB: 0, yOff: 0.04 };
    }
    if (f.state === "block") {
      return { animMode: 4, animA: -0.16, animB: 0, yOff: 0 };
    }
    const spd = clamp(Math.abs(f.vx) / 4.5, 0, 1.35);
    return { animMode: 2, animA: f.walkPhase, animB: spd, yOff: 0 };
  }

  function drawFrameTape(ctx, px, py, bw, bh, isPl) {
    ctx.fillStyle = "rgba(12, 8, 22, 0.94)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, py, bw, bh, 5); ctx.fill(); ctx.stroke();

    const cellW = (bw - 10) / TAPE_LEN;
    const baseY = py + bh - 8;
    const barH = bh - 26;
    const minFrame = tape.length > 0 ? tape[0].frame : 0;

    for (let i = 0; i < tape.length; i++) {
      const t = tape[i];
      const cx = px + 5 + i * cellW;
      let col = "rgba(74, 222, 128, 0.72)";
      let h = barH * 0.56;
      if (t.kind === "p1-strike") { col = "#22d3ee"; h = barH * 0.92; }
      else if (t.kind === "delay-wait") { col = "#f87171"; h = barH * 0.88; }
      ctx.fillStyle = col;
      ctx.fillRect(cx, baseY - h, Math.max(2, cellW - 1.4), h);
    }

    // Draw gold Rollback Rewind Brackets spanning [startFrame..endFrame] directly on the 60 FPS tape!
    if (rollbackOn) {
      for (const br of rollbackBrackets) {
        const i0 = br.startFrame - minFrame;
        const i1 = br.endFrame - minFrame;
        if (i1 < 0 || i0 >= TAPE_LEN) continue;
        const x0 = px + 5 + clamp(i0, 0, TAPE_LEN - 1) * cellW;
        const x1 = px + 5 + clamp(i1 + 1, 0, TAPE_LEN) * cellW;
        const a = clamp(1 - br.age / 3.2, 0.25, 1);
        ctx.save();
        ctx.strokeStyle = `rgba(250, 204, 21, ${a})`;
        ctx.fillStyle = `rgba(250, 204, 21, ${a * 0.22})`;
        ctx.lineWidth = 1.8;
        ctx.fillRect(x0, py + 17, Math.max(4, x1 - x0), barH + 2);
        ctx.beginPath();
        ctx.moveTo(x0, py + 23);
        ctx.lineTo(x0, py + 16);
        ctx.lineTo(x1, py + 16);
        ctx.lineTo(x1, py + 23);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = rollbackOn ? "#fde047" : "#fca5a5";
    ctx.textAlign = "left";
    const hdr = rollbackOn
      ? (isPl ? `TAŚMA 60 FPS · ZŁOTE KLAMRY = COFNIĘCIE ${lastRollbackFrames || delayFramesForPing(pingMs)}f` : `60 FPS FRAME TAPE · GOLD BRACKET = ROLLBACK ${lastRollbackFrames || delayFramesForPing(pingMs)}f`)
      : (isPl ? `TAŚMA 60 FPS · CZERWONE = BUFOR OPÓŹNIENIA ${pingMs}ms!` : `60 FPS FRAME TAPE · RED = ${pingMs}ms INPUT STALL!`);
    ctx.fillText(hdr, px + 6, py + 11.5, bw - 12);
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const noHud = document.body.classList.contains("no-hud");
    const dFrames = delayFramesForPing(pingMs);

    if (viewProj) {
      // P1 Local Fighter pill
      const p1p = projectToScreen(viewProj, world.p1.x, 2.25, 0, cssW, cssH);
      if (p1p) {
        let txt, col;
        if (!rollbackOn && delayWaitFX) {
          const remMs = Math.max(0, Math.round((delayWaitFX.dur - (time - delayWaitFX.startT)) * 1000));
          txt = isPl ? `P1: CZEKA ${remMs}ms… (LAG!) ✗` : `P1: WAITING ${remMs}ms… ✗`;
          col = "#f87171";
        } else if (rollbackOn) {
          txt = isCompact
            ? (world.p1.state === "strike" ? "P1 · 0ms STRIKE ✓" : "P1 · 0ms LAG ✓")
            : world.p1.state === "strike"
              ? (isPl ? "P1: CIOS KLATKA 0 (0ms LAGU ✓)" : "P1: FRAME-0 STRIKE (0ms LAG ✓)")
              : (isPl ? "P1 LOKALNY · 0ms OPÓŹNIENIA ✓" : "P1 LOCAL · 0ms INPUT LAG ✓");
          col = "#22d3ee";
        } else {
          txt = isCompact
            ? `P1 · ${pingMs}ms LAG ✗`
            : (isPl ? `P1: OPÓŹNIENIE ${pingMs}ms! ✗` : `P1: SLUDGY ${pingMs}ms LAG! ✗`);
          col = "#f87171";
        }
        drawWorldPill(ctx, p1p.x, p1p.y, txt, col, cssW, cssH, isCompact ? 8.5 : 10);
      }

      // P2 Remote Fighter pill
      const p2p = projectToScreen(viewProj, world.p2.x, 2.25, 0, cssW, cssH);
      if (p2p) {
        const safeX = (!isCompact && !noHud && p2p.y < 255) ? Math.min(p2p.x, cssW - 415) : p2p.x;
        const txt = isCompact
          ? `P2 · -${dFrames}f (${pingMs}ms)`
          : (isPl ? `P2 ZDALNY (-${dFrames}kl / ${pingMs}ms)` : `P2 REMOTE (-${dFrames}f · ${pingMs}ms RTT)`);
        drawWorldPill(ctx, safeX, p2p.y, txt, "#fb7185", cssW, cssH, isCompact ? 8.5 : 9.5);
      }

      // Rollback Ghost & Rewind callout!
      if (rollbackOn && rollbackGhost && rollbackGhost.life > 0.12) {
        const gp = projectToScreen(viewProj, (rollbackGhost.x + rollbackGhost.newX) * 0.5, 2.95, 0, cssW, cssH);
        if (gp) {
          const safeX = (!isCompact && !noHud && gp.y < 255) ? Math.min(gp.x, cssW - 415) : gp.x;
          const txt = isPl
            ? `ROLLBACK ${rollbackGhost.frames}f · 0ms INPUT LAG ✓`
            : `ROLLBACK ${rollbackGhost.frames}f · 0ms INPUT LAG ✓`;
          drawWorldPill(ctx, safeX, gp.y, txt, "#facc15", cssW, cssH, isCompact ? 9 : 10.5);
        }
      } else if (!rollbackOn && delayWaitFX) {
        const dp = projectToScreen(viewProj, world.p1.x, 1.35, 0.85, cssW, cssH);
        if (dp) {
          drawWorldPill(ctx, dp.x, dp.y, isPl ? "CIĘŻKI LAG WEJŚCIA! ✗" : "SLUDGY INPUT LAG! ✗", "#fbbf24", cssW, cssH, isCompact ? 8.5 : 10);
        }
      }
    }

    if (!noHud) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          rollbackOn
            ? `GGPO: 0ms LAG · RB ${lastRollbackFrames || dFrames}f · ${pingMs}ms`
            : `DELAY-BASED: ${pingMs}ms LAG! · ${dFrames}f WAIT`,
          rollbackOn ? "#22d3ee" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 336, panelH = 204, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(15, 8, 24, 0.90)";
        ctx.strokeStyle = rollbackOn ? "rgba(34, 211, 238, 0.82)" : "rgba(248, 113, 113, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = rollbackOn ? "#22d3ee" : "#f87171";
        ctx.fillText(
          rollbackOn
            ? (isPl ? `GGPO ROLLBACK · 0ms LAGU (${pingMs}ms RTT)` : `GGPO ROLLBACK · 0ms INPUT LAG (${pingMs}ms RTT)`)
            : (isPl ? `DELAY-BASED · ${pingMs}ms ZAMROŻENIA WEJŚCIA!` : `DELAY-BASED · ${pingMs}ms SLUDGY INPUT LAG!`),
          px + 12, py + 20, bw
        );

        // Live 60 FPS Frame-Tape with gold Rollback Brackets!
        drawFrameTape(ctx, px + 12, py + 30, bw, 58, isPl);

        // Input Lag Bar
        ctx.fillStyle = "rgba(30, 22, 46, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 97, bw, 16, 4); ctx.fill();
        ctx.fillStyle = rollbackOn ? "#22c55e" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 97, rollbackOn ? 16 : clamp((pingMs / 220) * bw, 24, bw), 16, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          rollbackOn
            ? (isPl ? `ODCZUWANY LAG: 0 ms (Klatka 0!) · 1-strona: ${dFrames}f` : `LOCAL INPUT LAG: 0 ms (Frame 0!) · 1-Way: ${dFrames}f`)
            : (isPl ? `ODCZUWANY LAG: ${pingMs} ms (Czeka na pakiet!)` : `LOCAL INPUT LAG: ${pingMs} ms (Lockstep Wait!)`),
          px + 18, py + 108.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl
            ? `Cofnięcia (Rollbacks): ${rollbackCount} · Ostatnie: ${lastRollbackFrames}f`
            : `Rollbacks Resimulated: ${rollbackCount} · Last: ${lastRollbackFrames}f`,
          px + 12, py + 135, bw
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl
            ? `Klatka symulacji: #${world.frame} · Ciosy: ${strikeCount}`
            : `Sim Frame: #${world.frame} · Strikes: ${strikeCount}`,
          px + 12, py + 156, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl
            ? "A/D = Krok · Spacja/Klik = Cios · V = Ping · T = Tryb"
            : "A/D = Footwork · Space/Click = Strike · V = Ping · T = Mode",
          px + 12, py + 182, bw
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
          id: "toggle-rollback",
          label: rollbackOn
            ? (pl ? "GGPO Rollback: WŁ [T]" : "GGPO Rollback: ON [T]")
            : (pl ? "Delay-Based (Lag!) [T]" : "Delay-Based (Lag!) [T]"),
          pressed: rollbackOn,
        },
        {
          id: "strike",
          label: pl ? "Cios! [Spacja]" : "Strike! [Space]",
          pressed: world.p1.state === "strike",
        },
        {
          id: "cycle-ping",
          label: `Ping: ${pingMs}ms [V]`,
          pressed: pingMs >= 120,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-rollback") {
        rollbackOn = !rollbackOn;
        p1DelayQueue = [];
        delayWaitFX = null;
        rollbackGhost = null;
        audio?.ruleSwitch?.(rollbackOn);
        setBanner(
          rollbackOn
            ? `GGPO ROLLBACK ON: FRAME-0 STRIKES + ${delayFramesForPing(pingMs)}f REWIND!`
            : `DELAY-BASED NETCODE: ${pingMs}ms FREEZE BEFORE EVERY PUNCH!`,
          rollbackOn ? "#22d3ee" : "#f87171",
          2.1
        );
      } else if (id === "strike") {
        triggerStrike({ manual: true });
      } else if (id === "cycle-ping") {
        pingIdx = (pingIdx + 1) % PING_OPTIONS.length;
        pingMs = PING_OPTIONS[pingIdx];
        audio?.ruleSwitch?.(true);
        setBanner(`RTT PING: ${pingMs}ms (~${delayFramesForPing(pingMs)} FRAMES ONE-WAY)`, "#facc15", 1.7);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-rollback");
      else if (code === "KeyV") this.onAction("cycle-ping");
      else if (code === "Space") this.onAction("strike");
    },
    onClickWorld(wPos, { button } = {}) {
      if (button === 0 && wPos) {
        triggerStrike({ manual: true });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const p1Pose = fighterPose(world.p1, +1);
      const p2Pose = fighterPose(world.p2, -1);

      const p1Tint = world.p1.hitFlash > 0.1
        ? [1.0, 0.92, 0.35, 0.78]
        : (!rollbackOn && delayWaitFX
            ? [1.0, 0.56, 0.18, 0.55]
            : [0.12, 0.90, 1.0, 0.52]);

      const p2Tint = world.p2.hitFlash > 0.1
        ? [1.0, 0.94, 0.36, 0.85]
        : (world.p2.blockFlash > 0.1
            ? [0.40, 0.86, 1.0, 0.68]
            : [1.0, 0.32, 0.40, 0.56]);

      const meshes = [
        // P1 Local Fighter (Cyan, Left)
        {
          gpu: runnerGpu, x: world.p1.x, y: p1Pose.yOff, z: 0.0,
          yaw: Math.PI * 0.5, animMode: p1Pose.animMode, animA: p1Pose.animA, animB: p1Pose.animB,
          scale: 1.24, tint: p1Tint,
        },
        // P2 Remote Fighter (Coral, Right)
        {
          gpu: runnerGpu, x: world.p2.x, y: p2Pose.yOff, z: 0.0,
          yaw: -Math.PI * 0.5, animMode: p2Pose.animMode, animA: p2Pose.animA, animB: p2Pose.animB,
          scale: 1.24, tint: p2Tint,
        },
      ];

      // Translucent Ghost Silhouette (alpha: 0.35) at P2's old predicted position during rollback!
      if (rollbackOn && rollbackGhost) {
        const gA = clamp(rollbackGhost.life / rollbackGhost.maxLife, 0, 1);
        meshes.push({
          gpu: runnerGpu, x: rollbackGhost.x, y: 0.02, z: 0.0,
          yaw: -Math.PI * 0.5, animMode: 2, animA: rollbackGhost.walkPhase, animB: 0.3,
          scale: 1.26, alpha: 0.35 * (0.45 + 0.55 * gA),
          tint: [1.0, 0.80, 0.18, 0.92],
        });
      }

      // In Delay-Based mode, show ghost intent ahead of P1 while waiting!
      if (!rollbackOn && delayWaitFX) {
        meshes.push({
          gpu: runnerGpu, x: clamp(world.p1.x + 0.95, -STAGE_HALF_X, world.p2.x - 1.0), y: 0.04, z: 0.0,
          yaw: Math.PI * 0.5, animMode: 4, animA: 0.36, animB: 0,
          scale: 1.22, alpha: 0.30, tint: [1.0, 0.72, 0.18, 0.92],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Ground fighter rings
          fx.ringXZ(world.p1.x, 0.06, 0.0, 0.78, [0.14, 0.90, 1.0, 0.80]);
          fx.ringXZ(world.p2.x, 0.06, 0.0, 0.78, [1.0, 0.32, 0.42, 0.80]);

          // Strike energy slash arc
          if (world.p1.state === "strike" && world.p1.timer > 3) {
            const a = clamp(world.p1.timer / 16, 0, 1);
            fx.beam(world.p1.x + 0.35, 1.15, 0, world.p1.x + 1.85, 1.15, 0, 0.28, [0.18, 0.96, 1.0, a * 0.92], 0);
            fx.billboard(world.p1.x + 1.45, 1.18, 0, 0.44 * a, basis.right, basis.up, [0.45, 0.98, 1.0, a * 0.88], 2);
          }
          if (world.p2.state === "strike" && world.p2.timer > 3) {
            const a = clamp(world.p2.timer / 16, 0, 1);
            fx.beam(world.p2.x - 0.35, 1.15, 0, world.p2.x - 1.85, 1.15, 0, 0.28, [1.0, 0.32, 0.44, a * 0.92], 0);
          }
          if (world.p2.state === "block") {
            fx.xrayBox(world.p2.x - 0.85, world.p2.x - 0.55, 0.35, 1.85, -0.55, 0.55, [0.28, 0.90, 1.0, 0.78]);
          }

          // Rollback Rewind Beam & Ghost Ring connecting Old Predicted P2 -> Resimulated P2!
          if (rollbackOn && rollbackGhost) {
            const a = clamp(rollbackGhost.life / rollbackGhost.maxLife, 0, 1);
            fx.ringXZ(rollbackGhost.x, 0.08, 0.0, 0.95, [1.0, 0.82, 0.18, a * 0.92]);
            fx.beam(rollbackGhost.x, 1.15, 0, world.p2.x, 1.15, 0, 0.20, [1.0, 0.82, 0.18, a * 0.95], 4);
            fx.billboard(rollbackGhost.x, 1.95, 0, 0.26 * a, basis.right, basis.up, [1.0, 0.86, 0.24, a * 0.9], 2);
          }

          // Delay-Based Hourglass / Waiting Ring pulsing around frozen P1!
          if (!rollbackOn && delayWaitFX) {
            const u = clamp((time - delayWaitFX.startT) / Math.max(0.01, delayWaitFX.dur), 0, 1);
            const rad = 1.45 - u * 0.75;
            fx.ringXZ(world.p1.x, 0.09, 0.0, rad, [1.0, 0.28, 0.30, 0.95]);
            fx.ringXZ(world.p1.x, 0.09, 0.0, 1.48, [1.0, 0.72, 0.18, 0.65]);
            fx.billboard(world.p1.x, 2.05, 0, 0.28 + Math.sin(time * 24) * 0.06, basis.right, basis.up, [1.0, 0.64, 0.16, 0.92], 2);
          }

          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, sp.size * (0.45 + 0.55 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        rollbackOn,
        pingMs,
        delayFrames: delayFramesForPing(pingMs),
        perceivedInputLagMs: rollbackOn ? 0 : pingMs,
        simFrame: world.frame,
        rollbackCount,
        lastRollbackFrames,
        strikeCount,
        waitingDelay: Boolean(!rollbackOn && delayWaitFX),
        p1X: +world.p1.x.toFixed(2),
        p2X: +world.p2.x.toFixed(2),
      };
    },
  };
}
