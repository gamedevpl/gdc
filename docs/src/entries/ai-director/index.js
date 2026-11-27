// Entry #12: AI Director (Left 4 Dead Pacing Curve) — Playable 3D Stormy Rooftop Survival!
// Demonstrates Valve's iconic Build-Up -> Peak -> Peak Fade -> Relax emotional rollercoaster:
// the AI Director tracks Player Intensity (0..100%) in real time, throttling horde spawns to 0 and dropping
// Medkits during Relax breathers — vs relentless Constant Random Spawns that overwhelm unfairly!
import { clamp, lerp } from "../../gl-utils.js";
import { createRooftopRenderer } from "./rooftop-renderer.js";

const SPAWN_PTS = [[-6.5, -5.0], [6.5, -5.0], [-6.5, 5.0], [6.5, 5.0]];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createRooftopRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.84, dist: 19.6, targetX: 0.0, targetY: 0.3, targetZ: 0.25, fovDeg: 40 };

  let time = 0;
  let directorOn = true; // true = L4D AI Director (Build -> Peak -> Fade -> Relax), false = Constant Relentless Spawn!
  let phase = "BUILD";   // BUILD | PEAK | FADE | RELAX
  let phaseTimer = 0;
  let intensity = 22;    // 0..100 emotional stress meter
  let history = new Array(56).fill(22);
  let histTick = 0;

  let spawnCd = 0.6;
  let kills = 0;
  let relaxCount = 0;
  let medkitsDropped = 0;
  let overwhelms = 0;
  let shootCd = 0;

  let bannerText = "";
  let bannerColor = "#fbbf24";
  let bannerTimer = 0;

  const survivor = { x: 0, z: 0.4, yaw: 0, walkPhase: 0, walkAmp: 0, hp: 100, hurtFlash: 0 };
  let zombies = [];
  let medkits = [];
  let tracers = [];
  let sparks = [];

  function setBanner(text, color = "#fbbf24", dur = 2.0) {
    bannerText = text; bannerColor = color; bannerTimer = dur;
  }

  function spawnSparks(x, y, z, r, g, b, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.5;
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 2.2, vz: Math.sin(a) * sp, r, g, b, size: 0.14, life: 0.42, maxLife: 0.42 });
    }
  }

  function spawnZombie() {
    const pt = SPAWN_PTS[Math.floor(Math.random() * SPAWN_PTS.length)];
    zombies.push({
      x: pt[0] + (Math.random() - 0.5) * 0.8,
      z: pt[1] + (Math.random() - 0.5) * 0.8,
      yaw: 0,
      walkPhase: Math.random() * 6,
      hp: 2,
      flash: 0,
      atkCd: 0.4,
      spd: 2.25 + Math.random() * 0.65,
    });
  }

  function reset() {
    time = 0;
    phase = "BUILD";
    phaseTimer = 0;
    intensity = 22;
    history = new Array(56).fill(22);
    histTick = 0;
    spawnCd = 0.5;
    kills = 0; relaxCount = 0; medkitsDropped = 0; overwhelms = 0;
    survivor.x = 0; survivor.z = 0.4; survivor.hp = 100; survivor.hurtFlash = 0;
    zombies = []; medkits = []; tracers = []; sparks = [];
    for (let i = 0; i < 3; i++) spawnZombie();
    bannerTimer = 0;
  }

  reset();

  function fireShotgun(targetX = null, targetZ = null) {
    if (shootCd > 0) return;
    shootCd = 0.28;
    let aimYaw = survivor.yaw;
    if (targetX != null && targetZ != null) {
      aimYaw = Math.atan2(targetX - survivor.x, targetZ - survivor.z);
    } else if (zombies.length > 0) {
      // Auto-target nearest zombie if firing via Space or auto-defense!
      let best = zombies[0], bestD = Infinity;
      for (const z of zombies) {
        const d = Math.hypot(z.x - survivor.x, z.z - survivor.z);
        if (d < bestD) { bestD = d; best = z; }
      }
      aimYaw = Math.atan2(best.x - survivor.x, best.z - survivor.z);
    }
    survivor.yaw = aimYaw;
    audio?.hammerImpact?.(true, false);

    // 3-pellet shotgun spread!
    for (const off of [-0.14, 0, 0.14]) {
      const a = aimYaw + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      let hitZ = null, hitDist = 7.4;
      for (const z of zombies) {
        const rx = z.x - survivor.x, rz = z.z - survivor.z;
        const proj = rx * dx + rz * dz;
        if (proj > 0.2 && proj < hitDist) {
          const perp = Math.abs(rx * dz - rz * dx);
          if (perp < 0.62) { hitDist = proj; hitZ = z; }
        }
      }
      tracers.push({ x0: survivor.x + dx * 0.6, z0: survivor.z + dz * 0.6, x1: survivor.x + dx * hitDist, z1: survivor.z + dz * hitDist, life: 0.12, maxLife: 0.12 });
      if (hitZ) {
        hitZ.hp -= 1;
        hitZ.flash = 1.0;
        hitZ.x += dx * 0.45;
        hitZ.z += dz * 0.45;
        spawnSparks(hitZ.x, 1.0, hitZ.z, 1.0, 0.35, 0.25, 7);
      }
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
      if (zombies[i].hp <= 0) {
        spawnSparks(zombies[i].x, 0.9, zombies[i].z, 1.0, 0.68, 0.22, 12);
        zombies.splice(i, 1);
        kills++;
        intensity = clamp(intensity + 4.5, 0, 100);
      }
    }
  }

  function triggerPeakWave() {
    phase = "PEAK";
    phaseTimer = 0;
    intensity = Math.max(intensity, 86);
    for (let i = 0; i < 6; i++) spawnZombie();
    audio?.alertBuzzer?.();
    setBanner(
      directorOn ? "PEAK HORDE! DIRECTOR MONITORING STRESS..." : "HORDE SURGE! CONSTANT SPAWN NEVER STOPS!",
      "#ef4444",
      2.1
    );
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (shootCd > 0) shootCd = Math.max(0, shootCd - dt);
    if (survivor.hurtFlash > 0) survivor.hurtFlash = Math.max(0, survivor.hurtFlash - dt * 3.0);

    for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) tracers.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.5 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }

    // Survivor Movement (WASD / Arrows manual kite, OR smart auto-kiting + auto-shotgun if idle!)
    const kw = keys?.has("KeyW") || keys?.has("ArrowUp");
    const ks = keys?.has("KeyS") || keys?.has("ArrowDown");
    const ka = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const kd = keys?.has("KeyD") || keys?.has("ArrowRight");
    let mx = (kd ? 1 : 0) - (ka ? 1 : 0);
    let mz = (ks ? 1 : 0) - (kw ? 1 : 0);

    if (mx === 0 && mz === 0) {
      // Gentle auto-kite away from closest zombie (or toward Medkit!) so simulation plays cleanly hands-free too!
      if (medkits.length > 0 && survivor.hp < 85) {
        const mk = medkits[0];
        mx = mk.x - survivor.x; mz = mk.z - survivor.z;
      } else if (zombies.length > 0) {
        let repX = 0, repZ = 0;
        for (const z of zombies) {
          const dx = survivor.x - z.x, dz = survivor.z - z.z;
          const d = Math.hypot(dx, dz) || 0.1;
          if (d < 4.5) { repX += (dx / d) / d; repZ += (dz / d) / d; }
        }
        // Pull softly toward center helipad so survivor circles cleanly
        mx = repX - survivor.x * 0.22;
        mz = repZ - survivor.z * 0.22;
      }
      // Auto-defend with shotgun when zombies close in
      if (zombies.length > 0 && shootCd <= 0) {
        const nearest = Math.min(...zombies.map((z) => Math.hypot(z.x - survivor.x, z.z - survivor.z)));
        if (nearest < 5.6) fireShotgun();
      }
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.15) {
      const sp = 3.8;
      survivor.x = clamp(survivor.x + (mx / ml) * sp * dt, -6.5, 6.5);
      survivor.z = clamp(survivor.z + (mz / ml) * sp * dt, -5.2, 5.2);
      survivor.walkPhase += dt * 10.5;
      survivor.walkAmp = lerp(survivor.walkAmp, 1, clamp(dt * 10, 0, 1));
      if (shootCd <= 0.12) survivor.yaw = Math.atan2(mx, mz);
    } else {
      survivor.walkAmp = lerp(survivor.walkAmp, 0, clamp(dt * 10, 0, 1));
    }

    // Collect Medkit Crates
    for (let i = medkits.length - 1; i >= 0; i--) {
      if (Math.hypot(survivor.x - medkits[i].x, survivor.z - medkits[i].z) < 1.05) {
        survivor.hp = Math.min(100, survivor.hp + 40);
        audio?.coinPickup?.();
        spawnSparks(medkits[i].x, 0.7, medkits[i].z, 0.16, 1.0, 0.64, 16);
        medkits.splice(i, 1);
        setBanner("DIRECTOR MEDKIT PICKED UP (+40 HP!)", "#34d399", 1.5);
      }
    }

    // Update Infected Runners + compute real-time Player Stress / Intensity (0..100%)
    let nearbyCount = 0;
    for (const z of zombies) {
      z.flash = Math.max(0, z.flash - dt * 4.0);
      z.atkCd = Math.max(0, z.atkCd - dt);
      const dx = survivor.x - z.x, dz = survivor.z - z.z;
      const d = Math.hypot(dx, dz) || 0.01;
      z.yaw = Math.atan2(dx, dz);
      if (d < 4.5) nearbyCount++;
      if (d > 0.85) {
        z.x = clamp(z.x + (dx / d) * z.spd * dt, -6.9, 6.9);
        z.z = clamp(z.z + (dz / d) * z.spd * dt, -5.6, 5.6);
        z.walkPhase += dt * 9.5;
      } else if (z.atkCd <= 0) {
        z.atkCd = 0.75;
        survivor.hp = Math.max(0, survivor.hp - 12);
        survivor.hurtFlash = 1.0;
        intensity = clamp(intensity + 18, 0, 100);
        audio?.playerHurt?.();
        if (survivor.hp <= 0) {
          overwhelms++;
          survivor.hp = 100;
          zombies = zombies.slice(0, 3);
          intensity = 35;
          setBanner("OVERWHELMED! RESPAWNED ON HELIPAD", "#ef4444", 1.8);
          break;
        }
      }
    }

    // Continuous Player Intensity Model (rises with nearby horde, decays when safe!)
    const targetStress = clamp(nearbyCount * 14 + (100 - survivor.hp) * 0.55, 0, 100);
    if (targetStress > intensity) {
      intensity = clamp(intensity + (targetStress - intensity) * dt * 1.35 + nearbyCount * dt * 3.2, 0, 100);
    } else {
      intensity = clamp(intensity - dt * (zombies.length === 0 ? 18 : 7.5), 0, 100);
    }

    // === L4D AI DIRECTOR 4-PHASE STATE MACHINE vs CONSTANT RANDOM SPAWN ===
    phaseTimer += dt;
    spawnCd -= dt;

    if (directorOn) {
      if (phase === "BUILD") {
        if (spawnCd <= 0 && zombies.length < 10) {
          spawnZombie();
          spawnCd = 0.85;
        }
        if (intensity >= 78 || phaseTimer > 5.5) {
          phase = "PEAK";
          phaseTimer = 0;
          setBanner("DIRECTOR PHASE: PEAK HORDE!", "#ef4444", 1.5);
        }
      } else if (phase === "PEAK") {
        if (spawnCd <= 0 && zombies.length < 14) {
          spawnZombie();
          spawnCd = 0.52;
        }
        if (phaseTimer > 3.2 || survivor.hp <= 36) {
          phase = "FADE";
          phaseTimer = 0;
          setBanner("DIRECTOR: CUTTING SPAWNS (PEAK FADE)...", "#38bdf8", 1.5);
        }
      } else if (phase === "FADE") {
        // ZERO spawns during Peak Fade until intensity drops below 42% (or 3.2s elapsed)!
        if (intensity < 44 || phaseTimer > 3.2) {
          phase = "RELAX";
          phaseTimer = 0;
          relaxCount++;
          // Drop a dynamic Medkit if Survivor took damage!
          if (medkits.length === 0 && survivor.hp < 88) {
            medkits.push({ x: (Math.random() - 0.5) * 4.5, z: (Math.random() - 0.5) * 3.5 });
            medkitsDropped++;
            audio?.mercyShield?.();
            setBanner("DIRECTOR: RELAX BREATHER + MEDKIT DROPPED!", "#34d399", 2.0);
          } else {
            setBanner("DIRECTOR: RELAX BREATHER (0 SPAWNS)", "#34d399", 1.7);
          }
        }
      } else {
        // RELAX: zero spawns for 3.6s so player catches their breath!
        if (phaseTimer > 3.6) {
          phase = "BUILD";
          phaseTimer = 0;
        }
      }
    } else {
      // CONSTANT RANDOM SPAWN (Director OFF — relentless flat rate, ZERO breathers, ZERO medkits!)
      phase = "PEAK";
      if (spawnCd <= 0 && zombies.length < 24) {
        spawnZombie();
        spawnCd = 0.24;
      }
    }

    // Record scrolling intensity waveform every 0.16s
    histTick += dt;
    if (histTick >= 0.16) {
      histTick = 0;
      history.push(intensity);
      if (history.length > 56) history.shift();
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const phaseLabel = !directorOn
      ? (isPl ? "STAŁY SPAWN (CHAOS)" : "CONSTANT SPAWN")
      : phase === "PEAK" ? (isPl ? "SZCZYT FALI (PEAK)" : "PEAK HORDE")
      : phase === "FADE" ? (isPl ? "WYCISZANIE (FADE)" : "PEAK FADE (0 SPAWN)")
      : phase === "RELAX" ? (isPl ? "ODDECH (RELAX)" : "RELAX BREATHER")
      : (isPl ? "NAPIĘCIE (BUILD-UP)" : "BUILD-UP");
    const phaseCol = !directorOn || phase === "PEAK" ? "#f87171" : phase === "RELAX" ? "#34d399" : phase === "FADE" ? "#38bdf8" : "#fbbf24";

    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const pill = `${phaseLabel} · ${Math.round(intensity)}% · HP ${Math.round(survivor.hp)}`;
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(10, 14, 24, 0.86)";
        ctx.strokeStyle = phaseCol; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = phaseCol; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(308, cssW - 28), panelH = 158;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 24, 0.86)";
        ctx.strokeStyle = phaseCol; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = phaseCol;
        ctx.fillText(`${directorOn ? "AI DIRECTOR" : "NO DIRECTOR"} · ${phaseLabel}`, px + 12, py + 21);

        // Live Scrolling Emotional Intensity Curve (Left 4 Dead Rollercoaster!)
        const gx = px + 12, gy = py + 32, gw = panelW - 24, gh = 56;
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 5); ctx.fill();
        // Peak threshold dashed line (80%)
        ctx.strokeStyle = "rgba(248, 113, 113, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(gx, gy + gh * 0.20); ctx.lineTo(gx + gw, gy + gh * 0.20); ctx.stroke();
        ctx.setLineDash([]);
        // Waveform polyline
        ctx.strokeStyle = phaseCol;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
          const x = gx + (i / (history.length - 1)) * gw;
          const y = gy + gh - (history[i] / 100) * (gh - 6) - 3;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(isPl ? `STRES GRACZA: ${Math.round(intensity)}%  ·  HP: ${Math.round(survivor.hp)}` : `PLAYER STRESS: ${Math.round(intensity)}%  ·  HP: ${Math.round(survivor.hp)}`, px + 12, py + 106);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Zombie: ${zombies.length}  ·  Zabici: ${kills}` : `Active Horde: ${zombies.length}  ·  Kills: ${kills}`, px + 12, py + 125);
        ctx.fillStyle = "#34d399";
        ctx.fillText(isPl ? `Przerwy Relax: ${relaxCount}  ·  Apteczki: ${medkitsDropped}` : `Relax Breathers: ${relaxCount}  ·  Medkits: ${medkitsDropped}`, px + 12, py + 144);
        ctx.restore();
      }
    }

    if (!document.body.classList.contains("no-hud") && bannerTimer > 0 && bannerText) {
      const a = clamp(bannerTimer / 0.35, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = "800 13.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(bannerText).width;
      const bw = Math.min(cssW - 24, tw + 26);
      const bx = (cssW - bw) * 0.5, by = cssW < 640 ? 86 : 76;
      ctx.fillStyle = "rgba(10, 14, 24, 0.92)";
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, 30, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = bannerColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(bannerText, cssW * 0.5, by + 15.5);
      ctx.restore();
    }
  }

  return {
    defaultCam,
    reset,
    getActions(lang) {
      const pl = lang === "pl";
      return [
        { id: "toggle-director", label: directorOn ? (pl ? "AI Director: WŁ [T]" : "AI Director: ON [T]") : (pl ? "Stały Spawn (WYŁ) [T]" : "Constant Spawn (OFF) [T]"), pressed: directorOn },
        { id: "peak-wave", label: pl ? "Wywołaj Falę [V]" : "Trigger Peak [V]", pressed: phase === "PEAK" },
        { id: "shoot", label: pl ? "Strzelba [Spacja]" : "Shotgun [Space]", pressed: false },
      ];
    },
    onAction(id) {
      if (id === "toggle-director") {
        directorOn = !directorOn;
        audio?.ruleSwitch?.(directorOn);
        setBanner(directorOn ? "AI DIRECTOR ON · BUILD -> PEAK -> RELAX CURVE" : "DIRECTOR OFF · RELENTLESS CONSTANT SPAWNS!", directorOn ? "#34d399" : "#ef4444", 1.9);
      } else if (id === "peak-wave") {
        triggerPeakWave();
      } else if (id === "shoot") {
        fireShotgun();
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-director");
      else if (code === "KeyV") this.onAction("peak-wave");
      else if (code === "Space") this.onAction("shoot");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) fireShotgun(world[0], world[2]);
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time, phase, survivor, zombies, medkits, tracers, sparks,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        directorOn, phase, intensity: Math.round(intensity),
        survivorHp: Math.round(survivor.hp), zombies: zombies.length,
        kills, relaxCount, medkitsDropped, overwhelms,
      };
    },
  };
}
