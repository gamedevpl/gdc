// Interactive Entry #3: Rubber Banding (3D Miniature GP Racetrack + Literal Glowing Elastic Band)
// Toggle Rubber Banding ON/OFF, trigger Crash or Turbo Boost on the Player car, and watch AI speed cheat live!
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

export function createEntry(gl) {
  const renderer = createTrackRenderer(gl);
  const sim = createRubberBandSim();
  let lastState = sim.step(0.016);

  function update(dt) {
    lastState = sim.step(dt);
  }

  function render(w, h, cam, ovCtx, ow = w, oh = h) {
    const { viewProj } = renderer.render({
      w, h, cam,
      time: lastState.time,
      cars: lastState.cars,
      rubberBands: lastState.rubberBands,
      particles: lastState.particles,
    });

    if (ovCtx) {
      ovCtx.clearRect(0, 0, ow, oh);
      const p = lastState.cars[0];
      const pp = projectPoint([p.x, 1.35, p.z], viewProj, ow, oh);
      if (pp) {
        if (p.crashTimer > 0.1) drawBadge(ovCtx, pp.x, pp.y, "CRASH!", "#ef4444", "#ffffff", ow);
        else if (p.boostTimer > 0.1) drawBadge(ovCtx, pp.x, pp.y, "YOU · TURBO!", "#10e8a8", "#062119", ow);
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
      return [
        { id: "toggle", label: pl ? (on ? "Gumka: WŁ" : "Gumka: WYŁ") : (on ? "Rubber Band: ON" : "Rubber Band: OFF"), pressed: on },
        { id: "crash", label: pl ? "Rozbij gracza!" : "Crash Player!", pressed: false },
        { id: "boost", label: pl ? "Turbo gracza!" : "Boost Player!", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "toggle") sim.setRubberBandOn(!sim.getRubberBandOn());
      if (id === "crash") sim.triggerCrash();
      if (id === "boost") sim.triggerBoost();
    },
    reset() { sim.reset(); },
    update,
    render,
  };
}
