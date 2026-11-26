// Playable Entry #3: Rubber Banding — Larger GP Circuit + Dynamic Chase/Follow Camera + Track Minimap!
import { createTrackRenderer, projectPoint, sampleTrack, TRACK_LENGTH, START_S } from "./track-renderer.js";
import { createRubberBandSim } from "./track-sim.js";

// Precompute 96 track outline points once for the crisp bottom-right GP Minimap!
const MINI_PTS = Array.from({ length: 96 }, (_, i) => {
  const s = (i / 96) * TRACK_LENGTH;
  const t = sampleTrack(s);
  return [t.x, t.z];
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
  const boxW = Math.min(ow - 24, 430);
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

  const camTag = followCam ? "FOLLOW" : "OVERVIEW";
  const modeLbl = state.playerControl
    ? (pl ? `JEDZIESZ · ${camTag}` : `DRIVING · ${camTag}`)
    : (pl ? `DEMO · WCIŚNIJ WASD` : `DEMO · PRESS WASD`);
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.playerControl ? "#76ddaf" : "#ffe1a2";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`P${state.rank}/4 · LAP ${state.lap} · ${modeLbl}`, x + 12, y + boxH / 2 + 0.5);

  // Rechargeable Nitro meter
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
  const mw = 136, mh = 156;
  const mx = ow - mw - 18;
  const my = oh - mh - 18;
  const cx = mx + mw * 0.5;
  const cy = my + mh * 0.5;
  const sc = 4.25;

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.82)";
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(238,167,94,0.55)";
  ctx.stroke();

  // Circuit outline
  ctx.beginPath();
  MINI_PTS.forEach(([x, z], i) => {
    const px = cx + x * sc, py = cy + z * sc;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(148,163,184,0.28)";
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,225,162,0.55)";
  ctx.stroke();

  // Start/finish tick
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx + MINI_START.x * sc - 4, cy + MINI_START.z * sc - 2, 8, 4);

  // Rubber band lines on minimap!
  const p = state.cars[0];
  for (const rb of state.rubberBands) {
    if (rb.alpha < 0.08) continue;
    ctx.beginPath();
    ctx.moveTo(cx + rb.x0 * sc, cy + rb.z0 * sc);
    ctx.lineTo(cx + rb.x1 * sc, cy + rb.z1 * sc);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rb.mode === "boost" ? "rgba(245,158,11,0.85)" : "rgba(6,182,212,0.85)";
    ctx.stroke();
  }

  // Car dots
  const cols = ["#10e8a8", "#f43f5e", "#f59e0b", "#60a5fa"];
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const c = state.cars[i];
    ctx.beginPath();
    ctx.arc(cx + c.x * sc, cy + c.z * sc, i === 0 ? 5.2 : 4.0, 0, Math.PI * 2);
    ctx.fillStyle = cols[i];
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

  // Follow-Cam starts active automatically the moment you take control (or toggle anytime with C!)
  let followCam = false;
  const p0 = lastState.cars[0];
  let chaseYaw = p0.yaw + Math.PI;
  let chaseX = p0.x;
  let chaseZ = p0.z;
  let chaseDist = 11.4;
  let chaseFov = 50;

  function update(dt, keys) {
    lastState = sim.step(dt, keys || new Set());
    if (lastState.playerControl !== prevDrive) {
      prevDrive = lastState.playerControl;
      if (prevDrive) {
        followCam = true;
        // Snap chase cam smoothly behind car when entering Follow mode
        const p = lastState.cars[0];
        chaseYaw = p.yaw + Math.PI;
        chaseX = p.x;
        chaseZ = p.z;
      }
      requestHudRefresh?.();
    }

    // Smooth spring-damped Chase Camera behind player's green GT car!
    const p = lastState.cars[0];
    const h = Math.min(0.05, dt);
    const desiredYaw = p.yaw + Math.PI;
    chaseYaw = angleLerp(chaseYaw, desiredYaw, Math.min(1, h * 5.2));
    const lookAhead = 2.6 + (p.boostGlow || 0) * 1.1;
    const tx = p.x + Math.sin(p.yaw) * lookAhead;
    const tz = p.z + Math.cos(p.yaw) * lookAhead;
    chaseX += (tx - chaseX) * Math.min(1, h * 8.5);
    chaseZ += (tz - chaseZ) * Math.min(1, h * 8.5);
    const tDist = 11.2 + (p.boostGlow || 0) * 1.6;
    const tFov = 50 + (p.boostGlow || 0) * 7.5;
    chaseDist += (tDist - chaseDist) * Math.min(1, h * 5.0);
    chaseFov += (tFov - chaseFov) * Math.min(1, h * 5.0);
  }

  function getCameraOverride() {
    if (!followCam) return null;
    return {
      yaw: chaseYaw,
      pitch: 0.48,
      dist: chaseDist,
      targetX: chaseX,
      targetY: 0.45,
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
      const pp = projectPoint([p.x, 1.38, p.z], viewProj, ow, oh);
      if (pp && pp.z < 1) {
        if (p.crashTimer > 0.1) drawBadge(ovCtx, pp.x, pp.y, "CRASH!", "#ef4444", "#ffffff", ow);
        else if (p.boostGlow > 0.3) drawBadge(ovCtx, pp.x, pp.y, "YOU · NITRO!", "#10e8a8", "#062119", ow);
        else if (!followCam) drawBadge(ovCtx, pp.x, pp.y, "YOU", "#10e8a8", "#062119", ow);
      }

      for (let i = 1; i < lastState.cars.length; i++) {
        const c = lastState.cars[i];
        const pc = projectPoint([c.x, 1.35, c.z], viewProj, ow, oh);
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
    defaultCam: { yaw: 0.16, pitch: 0.82, dist: 41.0, targetX: 0, targetY: 0, targetZ: 0.4, fovDeg: 42 },
    getCameraOverride,
    getActions(lang) {
      const pl = lang === "pl";
      const on = sim.getRubberBandOn();
      const drv = sim.getPlayerControl();
      return [
        { id: "drive", label: pl ? (drv ? "Jedziesz (WASD)" : "Jedź (WASD)") : (drv ? "Driving (WASD)" : "Drive (WASD)"), pressed: drv },
        { id: "cam", label: pl ? (followCam ? "Kamera: Follow (C)" : "Kamera: Tor (C)") : (followCam ? "Cam: Follow (C)" : "Cam: Track (C)"), pressed: followCam },
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
      return { playerControl: lastState.playerControl, followCam, x: +p.x.toFixed(2), z: +p.z.toFixed(2), speed: +p.speed.toFixed(2), rank: lastState.rank };
    },
    reset() { sim.reset(); followCam = sim.getPlayerControl(); },
    update,
    render,
  };
}
