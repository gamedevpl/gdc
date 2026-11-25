// Playable Entry #3: Rubber Banding (Drive your green 3D GT car with WASD/Arrows + Space Nitro!)
import { createTrackRenderer, projectPoint } from "./track-renderer.js";
import { createRubberBandSim } from "./track-sim.js";

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

function drawTopRaceHud(ctx, ow, state, lang) {
  const pl = lang === "pl";
  const boxW = Math.min(ow - 24, 410);
  const boxH = 38;
  const x = ow - boxW - 18;
  const y = 78;
  if (ow < 520) return; // keep compact on narrow phones

  ctx.save();
  ctx.fillStyle = "rgba(21,20,35,0.84)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.playerControl ? "#00e4ac" : "#eea75e";
  ctx.stroke();

  const modeLbl = state.playerControl
    ? (pl ? "GRACZ (WASD)" : "YOU DRIVE")
    : (pl ? "AUTO-DEMO · WCIŚNIJ WASD" : "AUTO-DEMO · PRESS WASD");
  ctx.font = "700 12px 'Courier New', monospace";
  ctx.fillStyle = state.playerControl ? "#76ddaf" : "#ffe1a2";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`P${state.rank}/4 · LAP ${state.lap} · ${modeLbl}`, x + 12, y + boxH / 2 + 0.5);

  // Nitro bar on right side of pill
  const nw = 64, nh = 10;
  const nx = x + boxW - nw - 12;
  const ny = y + (boxH - nh) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(nx, ny, nw, nh);
  ctx.fillStyle = state.nitro > 0.25 ? "#00e4ac" : "#f59e0b";
  ctx.fillRect(nx, ny, nw * state.nitro, nh);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh } = {}) {
  const renderer = createTrackRenderer(gl);
  const sim = createRubberBandSim();
  let lastState = sim.step(0.016, new Set());
  let prevDrive = false;

  function update(dt, keys) {
    lastState = sim.step(dt, keys || new Set());
    if (lastState.playerControl !== prevDrive) {
      prevDrive = lastState.playerControl;
      requestHudRefresh?.();
    }
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
      drawTopRaceHud(ovCtx, ow, lastState, lang);

      const p = lastState.cars[0];
      const pp = projectPoint([p.x, 1.35, p.z], viewProj, ow, oh);
      if (pp) {
        if (p.crashTimer > 0.1) drawBadge(ovCtx, pp.x, pp.y, "CRASH!", "#ef4444", "#ffffff", ow);
        else if (p.boostGlow > 0.3) drawBadge(ovCtx, pp.x, pp.y, "YOU · NITRO!", "#10e8a8", "#062119", ow);
        else drawBadge(ovCtx, pp.x, pp.y, "YOU", "#10e8a8", "#062119", ow);
      }

      for (let i = 1; i < lastState.cars.length; i++) {
        const c = lastState.cars[i];
        const pc = projectPoint([c.x, 1.28, c.z], viewProj, ow, oh);
        if (!pc) continue;
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
    defaultCam: { yaw: 0.16, pitch: 0.80, dist: 24.5, targetX: 0, targetY: 0, targetZ: 0.2, fovDeg: 42 },
    getActions(lang) {
      const pl = lang === "pl";
      const on = sim.getRubberBandOn();
      const drv = sim.getPlayerControl();
      return [
        { id: "drive", label: pl ? (drv ? "Sterujesz (WASD)" : "Przejmij auto") : (drv ? "Driving (WASD)" : "Drive Car"), pressed: drv },
        { id: "toggle", label: pl ? (on ? "Gumka: WŁ" : "Gumka: WYŁ") : (on ? "Rubber Band: ON" : "Rubber Band: OFF"), pressed: on },
        { id: "crash", label: pl ? "Poślizg (X)" : "Spinout (X)", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "drive") sim.setPlayerControl(!sim.getPlayerControl());
      if (id === "toggle") sim.setRubberBandOn(!sim.getRubberBandOn());
      if (id === "crash") sim.triggerCrash();
      if (id === "boost") sim.triggerBoost();
    },
    onKeyDown(code, repeat) {
      if (code === "KeyX" && !repeat) sim.triggerCrash();
    },
    onClickWorld(worldPt) {
      // Click anywhere on the track to steer your green car there!
      sim.setSteerTarget(worldPt);
    },
    getDebugState() {
      const p = lastState.cars[0];
      return { playerControl: lastState.playerControl, x: +p.x.toFixed(2), z: +p.z.toFixed(2), speed: +p.speed.toFixed(2), rank: lastState.rank };
    },
    reset() { sim.reset(); },
    update,
    render,
  };
}
