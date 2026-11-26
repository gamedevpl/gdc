// Playable Entry #3: Rubber Banding — 3D Figure-8 Overpass Bridge + Elevation-Aware Follow-Cam + Minimap!
import { createTrackRenderer, projectPoint, sampleTrack, TRACK_LENGTH, START_S } from "./track-renderer.js";
import { createRubberBandSim } from "./track-sim.js";

// Precompute 128 Figure-8 track points (with Y height!) for crisp overpass-highlighted minimap!
const MINI_PTS = Array.from({ length: 128 }, (_, i) => {
  const s = (i / 128) * TRACK_LENGTH;
  const t = sampleTrack(s);
  return [t.x, t.y, t.z];
});
const MINI_START = sampleTrack(START_S);

function angleLerp(cur, target, t) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * t;
}

function drawBadge(ctx, x, y, text, bg, fg = "#ffffff", maxW = 1200) {
  ctx.save();
  ctx.font = "800 12.5px 'Proxima', -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  const pw = tw + 14, ph = 22;
  const cx = Math.max(pw / 2 + 8, Math.min(maxW - pw / 2 - 8, x));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - pw / 2, y - ph / 2, pw, ph, 6);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(15,14,24,0.92)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + 0.5);
  ctx.restore();
}

function drawTopRaceHud(ctx, ow, state, followCam, lang) {
  if (ow < 520) return;
  const pl = lang === "pl";
  const boxW = Math.min(ow - 24, 435);
  const boxH = 38;
  const x = ow - boxW - 18;
  const y = 78;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.86)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.playerControl ? "#00e4ac" : "#eea75e";
  ctx.stroke();

  const camTag = followCam ? "FOLLOW" : "FIGURE-8";
  const modeLbl = state.playerControl
    ? (pl ? `JEDZIESZ · ${camTag}` : `DRIVING · ${camTag}`)
    : (pl ? `DEMO · WCIŚNIJ WASD` : `DEMO · PRESS WASD`);
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.playerControl ? "#76ddaf" : "#ffe1a2";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`P${state.rank}/4 · LAP ${state.lap} · ${modeLbl}`, x + 12, y + boxH / 2 + 0.5);

  const nw = 64, nh = 10;
  const nx = x + boxW - nw - 12;
  const ny = y + (boxH - nh) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(nx, ny, nw, nh);
  ctx.fillStyle = state.nitro > 0.25 ? "#00e4ac" : "#f59e0b";
  ctx.fillRect(nx, ny, nw * state.nitro, nh);
  ctx.restore();
}

function drawMinimap(ctx, ow, oh, state) {
  if (ow < 580 || oh < 420) return;
  const mw = 178, mh = 122;
  const mx = ow - mw - 18;
  const my = oh - mh - 18;
  const cx = mx + mw * 0.5;
  const cy = my + mh * 0.5;
  const sc = 4.15;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.84)";
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(238,167,94,0.55)";
  ctx.stroke();

  // Pass 1: Lower ground sections of Figure-8
  ctx.lineCap = "round";
  for (let i = 0; i < MINI_PTS.length; i++) {
    const a = MINI_PTS[i], b = MINI_PTS[(i + 1) % MINI_PTS.length];
    if (a[1] > 0.6) continue;
    ctx.beginPath();
    ctx.moveTo(cx + a[0] * sc, cy + a[2] * sc);
    ctx.lineTo(cx + b[0] * sc, cy + b[2] * sc);
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = "rgba(148,163,184,0.34)";
    ctx.stroke();
  }
  // Pass 2: Elevated Overpass Bridge drawn cleanly ON TOP with dark border & golden highlight!
  for (let i = 0; i < MINI_PTS.length; i++) {
    const a = MINI_PTS[i], b = MINI_PTS[(i + 1) % MINI_PTS.length];
    if (a[1] <= 0.6) continue;
    ctx.beginPath();
    ctx.moveTo(cx + a[0] * sc, cy + a[2] * sc);
    ctx.lineTo(cx + b[0] * sc, cy + b[2] * sc);
    ctx.lineWidth = 9.5;
    ctx.strokeStyle = "#151423";
    ctx.stroke();
    ctx.lineWidth = 6.0;
    ctx.strokeStyle = "rgba(238,167,94,0.80)";
    ctx.stroke();
  }

  // Start/finish mark
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx + MINI_START.x * sc - 3, cy + MINI_START.z * sc - 3, 6, 6);

  // Rubber band tethers on minimap
  for (const rb of state.rubberBands) {
    if (rb.alpha < 0.08) continue;
    ctx.beginPath();
    ctx.moveTo(cx + rb.x0 * sc, cy + rb.z0 * sc);
    ctx.lineTo(cx + rb.x1 * sc, cy + rb.z1 * sc);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rb.mode === "boost" ? "rgba(245,158,11,0.88)" : "rgba(6,182,212,0.88)";
    ctx.stroke();
  }

  // Car dots (sorted by elevation so overpass cars draw cleanly on top!)
  const cols = ["#10e8a8", "#f43f5e", "#f59e0b", "#60a5fa"];
  const order = [...state.cars].sort((a, b) => a.y - b.y);
  for (const c of order) {
    ctx.beginPath();
    ctx.arc(cx + c.x * sc, cy + c.z * sc, c.isPlayer ? 5.2 : 4.0, 0, Math.PI * 2);
    ctx.fillStyle = cols[c.id];
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#151423";
    ctx.stroke();
  }
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createTrackRenderer(gl);
  const sim = createRubberBandSim(audio);
  let lastState = sim.step(0.016, new Set());
  let prevDrive = false;

  let followCam = false;
  const p0 = lastState.cars[0];
  let chaseYaw = p0.yaw + Math.PI;
  let chaseX = p0.x;
  let chaseY = p0.y;
  let chaseZ = p0.z;
  let chaseDist = 11.4;
  let chaseFov = 50;

  function update(dt, keys) {
    lastState = sim.step(dt, keys || new Set());
    if (lastState.playerControl !== prevDrive) {
      prevDrive = lastState.playerControl;
      if (prevDrive) {
        followCam = true;
        const p = lastState.cars[0];
        chaseYaw = p.yaw + Math.PI;
        chaseX = p.x;
        chaseY = p.y;
        chaseZ = p.z;
      }
      requestHudRefresh?.();
    }

    // Smooth elevation-aware Follow-Cam riding up & over the 3D bridge ramp with your car!
    const p = lastState.cars[0];
    const h = Math.min(0.05, dt);
    const desiredYaw = p.yaw + Math.PI;
    chaseYaw = angleLerp(chaseYaw, desiredYaw, Math.min(1, h * 5.2));
    const lookAhead = 2.8 + (p.boostGlow || 0) * 1.1;
    const tx = p.x + Math.sin(p.yaw) * lookAhead;
    const tz = p.z + Math.cos(p.yaw) * lookAhead;
    chaseX += (tx - chaseX) * Math.min(1, h * 8.5);
    chaseY += (p.y - chaseY) * Math.min(1, h * 7.5);
    chaseZ += (tz - chaseZ) * Math.min(1, h * 8.5);
    const tDist = 11.4 + (p.boostGlow || 0) * 1.6;
    const tFov = 50 + (p.boostGlow || 0) * 7.5;
    chaseDist += (tDist - chaseDist) * Math.min(1, h * 5.0);
    chaseFov += (tFov - chaseFov) * Math.min(1, h * 5.0);
  }

  function getCameraOverride() {
    if (!followCam) return null;
    return {
      yaw: chaseYaw,
      pitch: 0.44,
      dist: chaseDist,
      targetX: chaseX,
      targetY: chaseY + 0.65,
      targetZ: chaseZ,
      fovDeg: chaseFov,
    };
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h, lang = "en") {
    const { viewProj } = renderer.render({
      w, h, cam,
      time: lastState.time,
      cars: lastState.cars,
      rubberBands: lastState.rubberBands,
      particles: lastState.particles,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      if (!document.body.classList.contains("no-hud")) {
        drawTopRaceHud(ovCtx, ow, lastState, followCam, lang);
        drawMinimap(ovCtx, ow, oh, lastState);
      }

      const p = lastState.cars[0];
      const pp = projectPoint([p.x, p.y + 1.40, p.z], viewProj, ow, oh);
      if (pp && pp.z < 1) {
        if (p.crashTimer > 0.1) drawBadge(ovCtx, pp.x, pp.y, "CRASH!", "#ef4444", "#ffffff", ow);
        else if (p.boostGlow > 0.3) drawBadge(ovCtx, pp.x, pp.y, "YOU · NITRO!", "#10e8a8", "#062119", ow);
        else if (!followCam) drawBadge(ovCtx, pp.x, pp.y, "YOU", "#10e8a8", "#062119", ow);
      }

      for (let i = 1; i < lastState.cars.length; i++) {
        const c = lastState.cars[i];
        const pc = projectPoint([c.x, c.y + 1.38, c.z], viewProj, ow, oh);
        if (!pc || pc.z >= 1 || pc.x < -20 || pc.x > ow + 20 || pc.y < 40 || pc.y > oh - 40) continue;
        const pct = Math.round((c.speedMult - 1.0) * 100);
        if (lastState.rubberBandOn && pct >= 8) {
          drawBadge(ovCtx, pc.x, pc.y, `AI +${pct}%`, "#f59e0b", "#1c1204", ow);
        } else if (lastState.rubberBandOn && pct <= -8) {
          drawBadge(ovCtx, pc.x, pc.y, `AI ${pct}%`, "#06b6d4", "#041c24", ow);
        }
      }
    }
  }

  return {
    id: "rubber-banding",
    defaultCam: { yaw: 0.14, pitch: 0.72, dist: 41.5, targetX: 0, targetY: 0.5, targetZ: 0.2, fovDeg: 42 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      const on = sim.getRubberBandOn();
      const drv = sim.getPlayerControl();
      return [
        { id: "drive", label: pl ? (drv ? "Jedziesz (WASD)" : "Jedź (WASD)") : (drv ? "Driving (WASD)" : "Drive (WASD)"), pressed: drv },
        { id: "cam", label: pl ? (followCam ? "Kamera: Follow (C)" : "Kamera: Ósemka (C)") : (followCam ? "Cam: Follow (C)" : "Cam: Figure-8 (C)"), pressed: followCam },
        { id: "toggle", label: pl ? (on ? "Gumka: WŁ" : "Gumka: WYŁ") : (on ? "Rubber Band: ON" : "Rubber Band: OFF"), pressed: on },
        { id: "crash", label: pl ? "Poślizg (X)" : "Spinout (X)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "drive") {
        const next = !sim.getPlayerControl();
        sim.setPlayerControl(next);
        if (next) followCam = true;
      }
      if (id === "cam") followCam = !followCam;
      if (id === "toggle") sim.setRubberBandOn(!sim.getRubberBandOn());
      if (id === "crash") sim.triggerCrash();
      if (id === "boost") sim.triggerBoost();
    },
    onKeyDown(code, repeat) {
      if (code === "KeyX" && !repeat) sim.triggerCrash();
      if (code === "KeyC" && !repeat) followCam = !followCam;
    },
    onClickWorld(worldPt) {
      sim.setSteerTarget(worldPt);
      followCam = true;
    },
    getDebugState() {
      const p = lastState.cars[0];
      return {
        playerControl: lastState.playerControl,
        followCam,
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        z: +p.z.toFixed(2),
        pitch: +p.pitch.toFixed(3),
        speed: +p.speed.toFixed(2),
        wallGrind: p.wallGrind,
        collisionCount: lastState.collisionCount,
        rank: lastState.rank,
      };
    },
    reset() { sim.reset(); followCam = sim.getPlayerControl(); },
    update,
    render,
  };
}
