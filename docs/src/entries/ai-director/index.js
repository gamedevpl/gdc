// Entry #12: AI Director (Left 4 Dead Pacing Curve) — Playable 3D Stormy Rooftop Survival!
// Studio Overhaul: Dramatic Build-Up -> Peak -> Peak Fade -> Relax emotional pacing with real Control Tower,
// locking Stairwell Spawn Gates, Emerald Medkit Rescue Drops, and crisp 3D World-Space Callout Pills!
import { clamp, lerp } from "../../gl-utils.js";
import { createRooftopRenderer } from "./rooftop-renderer.js";

const SPAWN_PTS = [[-6.2, -4.8], [6.2, -4.8], [-6.2, 4.7], [6.2, 4.7]];

function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

function drawWorldPill(ctx, x, y, text, color, cssW, cssH, fontPx = 10.5) {
  ctx.save();
  ctx.font = `800 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 14;
  const ph = fontPx + 10;
  const px = clamp(x - pw * 0.5, 8, cssW - pw - 8);
  const py = clamp(y - ph * 0.5, 56, cssH - ph - 8);
  ctx.fillStyle = "rgba(9, 13, 24, 0.90)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, px + pw * 0.5, py + ph * 0.5 + 0.5);
  ctx.restore();
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createRooftopRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.80, dist: 19.2, targetX: 0.0, targetY: 0.45, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let directorOn = true;
  let phase = "BUILD"; // BUILD | PEAK | FADE | RELAX
  let phaseTimer = 0;
  let intensity = 26;
  let history = new Array(56).fill(26);
  let histTick = 0;
  let userInteracted = false;

  let spawnCd = 0.5;
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
      sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 2.2, vz: Math.sin(a) * sp, r, g, b, size: 0.15, life: 0.44, maxLife: 0.44 });
    }
  }

  function spawnZombie() {
    const pt = SPAWN_PTS[Math.floor(Math.random() * SPAWN_PTS.length)];
    zombies.push({
      x: pt[0] + (Math.random() - 0.5) * 0.7,
      z: pt[1] + (Math.random() - 0.5) * 0.7,
      yaw: 0,
      walkPhase: Math.random() * 6,
      hp: 2,
      flash: 0,
      atkCd: 0.35,
      spd: 2.35 + Math.random() * 0.65,
    });
  }

  function dropMedkit() {
    medkits.push({
      x: (Math.random() - 0.5) * 4.2,
      y: 5.2, // drops visibly from the sky with emerald rescue beam!
      z: (Math.random() - 0.5) * 3.0,
    });
    medkitsDropped++;
    if (userInteracted) audio?.mercyShield?.();
  }

  function reset() {
    time = 0;
    phase = "BUILD";
    phaseTimer = 0;
    intensity = 26;
    history = new Array(56).fill(26);
    histTick = 0;
    spawnCd = 0.45;
    kills = 0; relaxCount = 0; medkitsDropped = 0; overwhelms = 0;
    survivor.x = 0; survivor.z = 0.4; survivor.hp = 100; survivor.hurtFlash = 0;
    zombies = []; medkits = []; tracers = []; sparks = [];
    for (let i = 0; i < 4; i++) spawnZombie();
    bannerTimer = 0;
  }

  reset();

  function fireShotgun(targetX = null, targetZ = null, { silent = false } = {}) {
    if (shootCd > 0) return;
    shootCd = 0.30;
    let aimYaw = survivor.yaw;
    if (targetX != null && targetZ != null) {
      aimYaw = Math.atan2(targetX - survivor.x, targetZ - survivor.z);
    } else if (zombies.length > 0) {
      let best = zombies[0], bestD = Infinity;
      for (const z of zombies) {
        const d = Math.hypot(z.x - survivor.x, z.z - survivor.z);
        if (d < bestD) { bestD = d; best = z; }
      }
      aimYaw = Math.atan2(best.x - survivor.x, best.z - survivor.z);
    }
    survivor.yaw = aimYaw;
    if (!silent) (audio?.shotgun ? audio.shotgun() : audio?.hammerImpact?.(true, false));

    for (const off of [-0.14, 0, 0.14]) {
      const a = aimYaw + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      let hitZ = null, hitDist = 7.2;
      for (const z of zombies) {
        const rx = z.x - survivor.x, rz = z.z - survivor.z;
        const proj = rx * dx + rz * dz;
        if (proj > 0.2 && proj < hitDist) {
          const perp = Math.abs(rx * dz - rz * dx);
          if (perp < 0.62) { hitDist = proj; hitZ = z; }
        }
      }
      tracers.push({ x0: survivor.x + dx * 0.65, z0: survivor.z + dz * 0.65, x1: survivor.x + dx * hitDist, z1: survivor.z + dz * hitDist, life: 0.14, maxLife: 0.14 });
      if (hitZ) {
        hitZ.hp -= 1;
        hitZ.flash = 1.0;
        hitZ.x += dx * 0.42;
        hitZ.z += dz * 0.42;
        spawnSparks(hitZ.x, 1.0, hitZ.z, 1.0, 0.38, 0.24, 7);
      }
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
      if (zombies[i].hp <= 0) {
        spawnSparks(zombies[i].x, 0.9, zombies[i].z, 1.0, 0.72, 0.24, 12);
        zombies.splice(i, 1);
        kills++;
        intensity = clamp(intensity + 5.0, 0, 100);
      }
    }
  }

  function triggerPeakWave() {
    userInteracted = true;
    phase = "PEAK";
    phaseTimer = 0;
    intensity = Math.max(intensity, 88);
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

    // Drop-in descent animation for Medkits
    for (const mk of medkits) {
      if (mk.y > 0.14) mk.y = Math.max(0.14, mk.y - dt * 8.2);
    }

    const kw = keys?.has("KeyW") || keys?.has("ArrowUp");
    const ks = keys?.has("KeyS") || keys?.has("ArrowDown");
    const ka = keys?.has("KeyA") || keys?.has("ArrowLeft");
    const kd = keys?.has("KeyD") || keys?.has("ArrowRight");
    let mx = (kd ? 1 : 0) - (ka ? 1 : 0);
    let mz = (ks ? 1 : 0) - (kw ? 1 : 0);
    if (mx !== 0 || mz !== 0) userInteracted = true;

    if (mx === 0 && mz === 0) {
      if (medkits.length > 0 && medkits[0].y < 0.5 && survivor.hp < 92) {
        const mk = medkits[0];
        mx = mk.x - survivor.x; mz = mk.z - survivor.z;
      } else if (zombies.length > 0) {
        let repX = 0, repZ = 0;
        for (const z of zombies) {
          const dx = survivor.x - z.x, dz = survivor.z - z.z;
          const d = Math.hypot(dx, dz) || 0.1;
          if (d < 4.5) { repX += (dx / d) / d; repZ += (dz / d) / d; }
        }
        mx = repX - survivor.x * 0.24;
        mz = repZ - survivor.z * 0.24;
      }
      if (zombies.length > 0 && shootCd <= 0) {
        const nearest = Math.min(...zombies.map((z) => Math.hypot(z.x - survivor.x, z.z - survivor.z)));
        if (nearest < 5.3) fireShotgun(null, null, { silent: !userInteracted });
      }
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.15) {
      const sp = 3.7;
      survivor.x = clamp(survivor.x + (mx / ml) * sp * dt, -6.2, 6.2);
      survivor.z = clamp(survivor.z + (mz / ml) * sp * dt, -4.8, 4.9);
      survivor.walkPhase += dt * 10.5;
      survivor.walkAmp = lerp(survivor.walkAmp, 1, clamp(dt * 10, 0, 1));
      if (shootCd <= 0.12) survivor.yaw = Math.atan2(mx, mz);
    } else {
      survivor.walkAmp = lerp(survivor.walkAmp, 0, clamp(dt * 10, 0, 1));
    }

    for (let i = medkits.length - 1; i >= 0; i--) {
      if (medkits[i].y < 0.6 && Math.hypot(survivor.x - medkits[i].x, survivor.z - medkits[i].z) < 1.05) {
        survivor.hp = Math.min(100, survivor.hp + 40);
        if (userInteracted) audio?.coinPickup?.();
        spawnSparks(medkits[i].x, 0.7, medkits[i].z, 0.16, 1.0, 0.64, 16);
        medkits.splice(i, 1);
        setBanner("DIRECTOR MEDKIT PICKED UP (+40 HP!)", "#34d399", 1.5);
      }
    }

    let nearbyCount = 0;
    for (const z of zombies) {
      z.flash = Math.max(0, z.flash - dt * 4.0);
      z.atkCd = Math.max(0, z.atkCd - dt);
      const dx = survivor.x - z.x, dz = survivor.z - z.z;
      const d = Math.hypot(dx, dz) || 0.01;
      z.yaw = Math.atan2(dx, dz);
      if (d < 4.8) nearbyCount++;
      if (d > 0.86) {
        z.x = clamp(z.x + (dx / d) * z.spd * dt, -6.6, 6.6);
        z.z = clamp(z.z + (dz / d) * z.spd * dt, -5.2, 5.2);
        z.walkPhase += dt * 9.5;
      } else if (z.atkCd <= 0) {
        z.atkCd = 0.72;
        survivor.hp = Math.max(0, survivor.hp - 12);
        survivor.hurtFlash = 1.0;
        intensity = clamp(intensity + 18, 0, 100);
        if (userInteracted) audio?.playerHurt?.();
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

    const targetStress = clamp(nearbyCount * 15 + (100 - survivor.hp) * 0.55, 0, 100);
    if (targetStress > intensity) {
      intensity = clamp(intensity + (targetStress - intensity) * dt * 1.45 + nearbyCount * dt * 3.6, 0, 100);
    } else {
      intensity = clamp(intensity - dt * (zombies.length === 0 ? 19 : 8.2), 0, 100);
    }

    // === L4D AI DIRECTOR 4-PHASE STATE MACHINE vs CONSTANT RANDOM SPAWN ===
    phaseTimer += dt;
    spawnCd -= dt;

    if (directorOn) {
      if (phase === "BUILD") {
        if (spawnCd <= 0 && zombies.length < 10) {
          spawnZombie();
          spawnCd = 0.76;
        }
        if (intensity >= 76 || phaseTimer > 4.2) {
          phase = "PEAK";
          phaseTimer = 0;
          setBanner("DIRECTOR PHASE: PEAK HORDE!", "#ef4444", 1.5);
        }
      } else if (phase === "PEAK") {
        if (spawnCd <= 0 && zombies.length < 14) {
          spawnZombie();
          spawnCd = 0.48;
        }
        if (phaseTimer > 3.1 || survivor.hp <= 42) {
          phase = "FADE";
          phaseTimer = 0;
          setBanner("DIRECTOR: CUTTING SPAWNS (PEAK FADE)...", "#38bdf8", 1.5);
        }
      } else if (phase === "FADE") {
        if (intensity < 44 || phaseTimer > 2.4) {
          phase = "RELAX";
          phaseTimer = 0;
          relaxCount++;
          if (medkits.length === 0 && (survivor.hp < 94 || relaxCount === 1)) {
            dropMedkit();
            setBanner("DIRECTOR: RELAX BREATHER + MEDKIT DROPPED!", "#34d399", 2.0);
          } else {
            setBanner("DIRECTOR: RELAX BREATHER (0 SPAWNS)", "#34d399", 1.7);
          }
        }
      } else {
        if (phaseTimer > 3.6) {
          phase = "BUILD";
          phaseTimer = 0;
        }
      }
    } else {
      phase = "PEAK";
      if (spawnCd <= 0 && zombies.length < 24) {
        spawnZombie();
        spawnCd = 0.24;
      }
    }

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
    const isCompact = cssW < 640;

    const phaseLabel = !directorOn
      ? (isPl ? "STAŁY SPAWN (CHAOS)" : "CONSTANT SPAWN")
      : phase === "PEAK" ? (isPl ? "SZCZYT FALI (PEAK)" : "PEAK HORDE")
      : phase === "FADE" ? (isPl ? "WYCISZANIE (FADE)" : "PEAK FADE (0 SPAWN)")
      : phase === "RELAX" ? (isPl ? "ODDECH (RELAX)" : "RELAX BREATHER")
      : (isPl ? "NAPIĘCIE (BUILD-UP)" : "BUILD-UP");
    const phaseCol = !directorOn || phase === "PEAK" ? "#f87171" : phase === "RELAX" ? "#34d399" : phase === "FADE" ? "#38bdf8" : "#fbbf24";

    // 1. World-Space 3D Storytelling Callouts!
    if (viewProj) {
      // Control Tower Director Decision Pill (sits cleanly over the panoramic tower glass, below any top banner!)
      const tp = projectToScreen(viewProj, 0.0, 2.55, -5.85, cssW, cssH);
      if (tp) {
        const towerTxt = !directorOn
          ? (isPl ? "BRAK DIRECTORA · CIĄGŁY CHAOS!" : "NO DIRECTOR · NON-STOP SPAWNS!")
          : phase === "PEAK"
            ? (isPl ? `AI DIRECTOR · STRES ${Math.round(intensity)}% → SZCZYT!` : `AI DIRECTOR · STRESS ${Math.round(intensity)}% → PEAK!`)
          : phase === "FADE"
            ? (isPl ? `AI DIRECTOR · STRES ${Math.round(intensity)}% → STOP SPAWN!` : `AI DIRECTOR · CUTTING SPAWNS (0/s)`)
          : phase === "RELAX"
            ? (isPl ? "AI DIRECTOR · RELAX + APTECZKA ✓" : "AI DIRECTOR · RELAX BREATHER ✓")
            : (isPl ? `AI DIRECTOR · NAPIĘCIE ${Math.round(intensity)}%` : `AI DIRECTOR · BUILD-UP (${Math.round(intensity)}%)`);
        drawWorldPill(ctx, tp.x, tp.y, towerTxt, phaseCol, cssW, cssH, isCompact ? 9.5 : 10.5);
      }

      // Survivor HP Pill
      const sp = projectToScreen(viewProj, survivor.x, 2.25, survivor.z, cssW, cssH);
      if (sp) {
        const hpCol = survivor.hp > 65 ? "#4ade80" : survivor.hp > 35 ? "#fbbf24" : "#f87171";
        drawWorldPill(ctx, sp.x, sp.y + 8, `${isPl ? "GRACZ" : "SURVIVOR"} · ${Math.round(survivor.hp)} HP`, hpCol, cssW, cssH, isCompact ? 9 : 10);
      }

      // North-West Stairwell Gate Lock/Horde indicator (desktop only so phone stays ultra clean)
      if (!isCompact) {
        const gp = projectToScreen(viewProj, -6.75, 2.35, -5.25, cssW, cssH);
        if (gp) {
          const gTxt = !directorOn || phase === "PEAK"
            ? (isPl ? "BRAMY: FALA HORDY!" : "SPAWN GATES: HORDE!")
            : phase === "RELAX"
              ? (isPl ? "BRAMY ZABLOKOWANE (0/s)" : "GATES LOCKED (RELAX)")
            : phase === "FADE"
              ? (isPl ? "BRAMY WYCISZONE (0/s)" : "SPAWNS PAUSED (FADE)")
              : (isPl ? "BRAMY: NARASTANIE" : "SPAWN GATES: RAMPING");
          drawWorldPill(ctx, gp.x, gp.y, gTxt, phaseCol, cssW, cssH, 9.5);
        }
      }

      // Dropped Medkit Supply Pill (offset cleanly above Survivor pill if close!)
      for (const mk of medkits) {
        const mp = projectToScreen(viewProj, mk.x, mk.y + 1.85, mk.z, cssW, cssH);
        if (mp) {
          const nearSurv = sp && Math.hypot(mp.x - sp.x, mp.y - sp.y) < 42;
          drawWorldPill(ctx, mp.x, nearSurv ? mp.y - 26 : mp.y, isPl ? "APTECZKA DIRECTORA (+40 HP!)" : "DIRECTOR MEDKIT (+40 HP!)", "#34d399", cssW, cssH, isCompact ? 9.5 : 10.5);
        }
      }
    }

    // 2. Corner Telemetry & Emotional Rollercoaster Graph (hidden in ?hud=0)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (isCompact) {
        const pill = `${phaseLabel} · ${Math.round(intensity)}% · HP ${Math.round(survivor.hp)}`;
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(9, 13, 24, 0.88)";
        ctx.strokeStyle = phaseCol; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = phaseCol; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(308, cssW - 28), panelH = 158;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(9, 13, 24, 0.88)";
        ctx.strokeStyle = phaseCol; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = phaseCol;
        ctx.fillText(`${directorOn ? "AI DIRECTOR" : "NO DIRECTOR"} · ${phaseLabel}`, px + 12, py + 21);

        const gx = px + 12, gy = py + 32, gw = panelW - 24, gh = 56;
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 5); ctx.fill();
        ctx.strokeStyle = "rgba(248, 113, 113, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(gx, gy + gh * 0.22); ctx.lineTo(gx + gw, gy + gh * 0.22); ctx.stroke();
        ctx.setLineDash([]);
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
      const bx = (cssW - bw) * 0.5, by = isCompact ? 86 : 76;
      ctx.fillStyle = "rgba(9, 13, 24, 0.92)";
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
      userInteracted = true;
      if (id === "toggle-director") {
        directorOn = !directorOn;
        audio?.ruleSwitch?.(directorOn);
        setBanner(directorOn ? "AI DIRECTOR ON · BUILD -> PEAK -> RELAX CURVE" : "DIRECTOR OFF · RELENTLESS CONSTANT SPAWNS!", directorOn ? "#34d399" : "#ef4444", 1.9);
      } else if (id === "peak-wave") {
        triggerPeakWave();
      } else if (id === "shoot") {
        fireShotgun(null, null, { silent: false });
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
      if (button === 0 && world) {
        userInteracted = true;
        fireShotgun(world[0], world[2], { silent: false });
      }
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
