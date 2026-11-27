// Entry #35: Recoil Patterns & Dynamic Spread — Playable 3D Tactical Firing Range!
// Contrasts learnable deterministic "7-shaped" spray patterns (where skilled counter-pulling clusters
// 90%+ shots straight into the bullseye) against unpredictable pure RNG cone bloom!
import { clamp, lerp } from "../../gl-utils.js";
import {
  createStudioRenderer,
  pushBox,
  projectToScreen,
  drawWorldPill,
  drawBanner,
  drawMobilePill,
} from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const WALL_Z = -3.72;
const BULL_X = 0.0;
const BULL_Y = 2.2;
const BULL_RAD = 0.48;
const TURRET_X = 0.0;
const TURRET_Y = 0.16;
const TURRET_Z = 3.6;
const BURST_ROUNDS = 14;
const FIRE_INTERVAL = 0.082;

// Classic learnable 14-round "7-shaped" spray pattern offsets (meters from bullseye):
// Rises vertically (shots 0-5), kicks sharply right (6-8), then sweeps back left (9-13).
const SPRAY_CURVE = [
  { x:  0.00, y: 0.00 },
  { x:  0.02, y: 0.20 },
  { x: -0.02, y: 0.44 },
  { x:  0.06, y: 0.72 },
  { x:  0.15, y: 1.02 },
  { x:  0.28, y: 1.30 },
  { x:  0.58, y: 1.44 },
  { x:  0.94, y: 1.48 },
  { x:  1.16, y: 1.44 },
  { x:  0.80, y: 1.40 },
  { x:  0.34, y: 1.42 },
  { x: -0.22, y: 1.38 },
  { x: -0.78, y: 1.32 },
  { x: -1.24, y: 1.24 },
];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.04, 0.04, 0.08],
    skyMid: [0.10, 0.09, 0.16],
    skyBot: [0.18, 0.12, 0.14],
    lightDir: [0.32, 0.85, 0.42],
    ambLow: [0.14, 0.12, 0.18],
    ambHigh: [0.40, 0.36, 0.44],
  });

  const m = getLagMeshes();
  const sniperGpu = studio.uploadMesh(m.sniper);

  // Build Tactical Firing Range: floor, acoustic side walls, firing bay, illuminated 3D target wall
  const wBuf = [];
  // Range floor
  pushBox(wBuf, -6.2, 6.2, -0.45, 0.0, -4.6, 5.4, [0.24, 0.25, 0.32], 0);
  // Rear concrete backstop wall behind target board
  pushBox(wBuf, -6.2, 6.2, 0.0, 4.6, -4.6, -4.05, [0.20, 0.22, 0.29], 1);
  // Side acoustic baffle walls
  pushBox(wBuf, -6.2, -5.75, 0.0, 2.7, -4.1, 5.4, [0.26, 0.28, 0.36], 1);
  pushBox(wBuf,  5.75,  6.2, 0.0, 2.7, -4.1, 5.4, [0.26, 0.28, 0.36], 1);
  // Warm tactical amber wall accent rails
  pushBox(wBuf, -5.75, -5.66, 1.55, 1.72, -3.9, 4.8, [1.0, 0.66, 0.16], 2);
  pushBox(wBuf,  5.66,  5.75, 1.55, 1.72, -3.9, 4.8, [1.0, 0.66, 0.16], 2);
  // Range distance floor markers & safety chevron firing line
  pushBox(wBuf, -5.4, 5.4, 0.0, 0.04,  2.42,  2.72, [1.0, 0.72, 0.12], 5);
  pushBox(wBuf, -4.8, 4.8, 0.0, 0.03,  0.30,  0.42, [0.42, 0.46, 0.56], 1);
  pushBox(wBuf, -4.8, 4.8, 0.0, 0.03, -1.75, -1.63, [0.42, 0.46, 0.56], 1);
  // Overhead range framing pillars on left & right flanks (unobstructed center view)
  for (const zP of [-1.8, 1.4]) {
    pushBox(wBuf, -5.75, -5.25, 0.0, 3.6, zP - 0.22, zP + 0.22, [0.22, 0.24, 0.32], 1);
    pushBox(wBuf,  5.25,  5.75, 0.0, 3.6, zP - 0.22, zP + 0.22, [0.22, 0.24, 0.32], 1);
    pushBox(wBuf, -5.25, -4.95, 3.25, 3.45, zP - 0.14, zP + 0.14, [1.0, 0.78, 0.36], 2);
    pushBox(wBuf,  4.95,  5.25, 3.25, 3.45, zP - 0.14, zP + 0.14, [1.0, 0.78, 0.36], 2);
  }

  // Foreground Firing Bay platform + flanking tactical benches & brass ammo crates
  pushBox(wBuf, -1.55, 1.55, 0.0, TURRET_Y, 2.82, 4.55, [0.30, 0.32, 0.40], 1);
  pushBox(wBuf, -1.60, 1.60, 0.0, 0.08, 2.74, 2.86, [1.0, 0.72, 0.14], 5);
  // Left & right shooting benches
  pushBox(wBuf, -3.7, -2.0, 0.0, 0.76, 2.95, 3.75, [0.34, 0.28, 0.24], 4);
  pushBox(wBuf,  2.0,  3.7, 0.0, 0.76, 2.95, 3.75, [0.34, 0.28, 0.24], 4);
  // Ammo boxes on benches
  pushBox(wBuf, -3.35, -2.65, 0.76, 1.12, 3.12, 3.56, [0.68, 0.54, 0.20], 4);
  pushBox(wBuf,  2.55,  3.25, 0.76, 1.12, 3.12, 3.56, [0.24, 0.38, 0.28], 4);

  // Tall Illuminated 3D Target Wall at z = -3.8 (x = -2.8..2.8, y = 0.2..4.2)
  // Steel outer target frame & base stand
  pushBox(wBuf, -2.96, 2.96, 0.0,  0.22, -4.02, -3.72, [0.18, 0.20, 0.26], 1);
  pushBox(wBuf, -2.96, 2.96, 4.18, 4.36, -4.02, -3.72, [0.18, 0.20, 0.26], 1);
  pushBox(wBuf, -2.96, -2.78, 0.20, 4.20, -4.02, -3.72, [0.18, 0.20, 0.26], 1);
  pushBox(wBuf,  2.78,  2.96, 0.20, 4.20, -4.02, -3.72, [0.18, 0.20, 0.26], 1);
  // Overhead illuminated light bar washing the target board
  pushBox(wBuf, -2.55, 2.55, 4.36, 4.48, -3.74, -3.48, [1.0, 0.86, 0.52], 2);
  // Matte target backing board
  pushBox(wBuf, -2.78, 2.78, 0.22, 4.18, -3.98, -3.785, [0.84, 0.81, 0.74], 4);
  // Concentric stepped target silhouette zones centered at (0, 2.2, -3.72)
  pushBox(wBuf, -1.85, 1.85, 0.65, 3.75, -3.785, -3.768, [0.17, 0.20, 0.28], 4);
  pushBox(wBuf, -1.26, 1.26, 1.08, 3.32, -3.768, -3.754, [0.76, 0.20, 0.22], 4);
  pushBox(wBuf, -0.74, 0.74, 1.50, 2.90, -3.754, -3.742, [0.88, 0.85, 0.78], 4);
  pushBox(wBuf, -0.42, 0.42, 1.78, 2.62, -3.742, -3.732, [0.88, 0.20, 0.20], 4);
  // Glowing gold bullseye core!
  pushBox(wBuf, -0.18, 0.18, 2.02, 2.38, -3.732, -3.718, [1.0, 0.82, 0.16], 2);
  studio.setWorldData(wBuf);

  const defaultCam = {
    yaw: 0.24,
    pitch: 0.26,
    dist: 14.2,
    targetX: 0.0,
    targetY: 1.55,
    targetZ: -0.6,
    fovDeg: 38,
  };

  let time = 0;
  let patternOn = true;     // [T] Learned Spray Pattern vs Pure RNG Bloom
  let compensateOn = true;  // [X] Counter-Pull ON/OFF
  let userInteracted = false;

  let burstActive = false;
  let burstRound = 0;
  let fireCd = 0;
  let autoPauseT = 0.08;

  let bloom = 0.08;         // Dynamic crosshair bloom radius (meters on target wall)
  let aimX = BULL_X;
  let aimY = BULL_Y;
  let turretYaw = Math.PI;
  let turretRecoil = 0;
  let muzzleFlash = 0;

  let shots = 0;
  let bullseyeHits = 0;
  let burstShots = 0;
  let burstHits = 0;
  let holes = [];   // { x, y, hit, round, age, burstId }
  let tracers = []; // { sx, sy, sz, ex, ey, ez, hit, life, maxLife }
  let sparks = [];  // { x, y, z, vx, vy, vz, r, g, b, life, maxLife }
  let burstId = 0;

  let bannerText = "";
  let bannerColor = "#f59e0b";
  let bannerTimer = 0;

  function setBanner(t, c = "#f59e0b", dur = 2.0) {
    bannerText = t;
    bannerColor = c;
    bannerTimer = dur;
  }

  function startBurst({ silent = false } = {}) {
    burstId++;
    burstActive = true;
    burstRound = 0;
    fireCd = 0;
    burstShots = 0;
    burstHits = 0;
    holes = [];
    if (!silent) {
      setBanner(
        patternOn
          ? (compensateOn
              ? "SPRAY PATTERN + COUNTER-PULL: PULLING INVERSE '7' INTO BULLSEYE ✓"
              : "LEARNABLE '7' SPRAY PATTERN (COUNTER-PULL OFF — WATCH THE CURVE!)")
          : "PURE RNG CONE BLOOM: UNPREDICTABLE SCATTER — CANNOT BE LEARNED ✗",
        patternOn ? (compensateOn ? "#4ade80" : "#fbbf24") : "#f87171",
        2.1
      );
    }
  }

  function reset() {
    time = 0;
    shots = 0;
    bullseyeHits = 0;
    burstShots = 0;
    burstHits = 0;
    bloom = 0.08;
    aimX = BULL_X;
    aimY = BULL_Y;
    turretYaw = Math.PI;
    turretRecoil = 0;
    muzzleFlash = 0;
    holes = [];
    tracers = [];
    sparks = [];
    bannerTimer = 0;
    autoPauseT = 1.35;
    // Start firing right away so frame 0.8s already shows a crisp burst & glowing bullet holes!
    startBurst({ silent: true });
  }
  reset();

  function spawnSparks(x, y, z, hit) {
    const col = hit ? [1.0, 0.84, 0.20] : [1.0, 0.44, 0.22];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.9 + Math.random() * 1.9;
      sparks.push({
        x, y, z: z + 0.05,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 0.7,
        vz: 0.8 + Math.random() * 1.4,
        r: col[0], g: col[1], b: col[2],
        life: 0.34, maxLife: 0.34,
      });
    }
  }

  function fireSingleRound(silent) {
    const idx = Math.min(burstRound, SPRAY_CURVE.length - 1);
    const curve = SPRAY_CURVE[idx];
    let hx = BULL_X;
    let hy = BULL_Y;

    if (patternOn) {
      // Deterministic learnable "7-shaped" recoil pattern + tiny natural micro-jitter
      const jx = (Math.random() - 0.5) * 0.11;
      const jy = (Math.random() - 0.5) * 0.11;
      if (compensateOn) {
        // Skilled player pulls the inverse curve vector to lock rounds onto the bullseye!
        hx = BULL_X + curve.x * 0.08 + jx;
        hy = BULL_Y + curve.y * 0.08 + jy;
      } else {
        hx = BULL_X + curve.x + jx;
        hy = BULL_Y + curve.y + jy;
      }
    } else {
      // Pure Random RNG Cone Bloom — expands rapidly each shot; counter-pull cannot predict RNG!
      const coneRad = 0.22 + idx * 0.155;
      const r = coneRad * Math.sqrt(0.18 + Math.random() * 0.82);
      const ang = Math.random() * Math.PI * 2;
      const pullBiasY = compensateOn ? -0.14 : 0.28;
      hx = BULL_X + Math.cos(ang) * r;
      hy = BULL_Y + Math.sin(ang) * r + pullBiasY;
    }

    hx = clamp(hx, -2.55, 2.55);
    hy = clamp(hy, 0.38, 4.02);

    const distToBull = Math.hypot(hx - BULL_X, hy - BULL_Y);
    const hit = distToBull <= BULL_RAD;

    shots++;
    burstShots++;
    if (hit) {
      bullseyeHits++;
      burstHits++;
    }

    bloom = clamp(bloom + (patternOn ? 0.095 : 0.135), 0.08, 1.35);
    aimX = hx;
    aimY = hy;
    turretRecoil = 0.30;
    muzzleFlash = 0.085;
    turretYaw = Math.atan2(hx - TURRET_X, WALL_Z - TURRET_Z);

    holes.push({ x: hx, y: hy, hit, round: idx, age: 0, burstId });
    if (holes.length > 28) holes.shift();

    const mzX = TURRET_X + Math.sin(turretYaw) * 1.45;
    const mzZ = TURRET_Z + Math.cos(turretYaw) * 1.45;
    tracers.push({
      sx: mzX, sy: 1.18, sz: mzZ,
      ex: hx, ey: hy, ez: WALL_Z + 0.03,
      hit,
      life: 0.16,
      maxLife: 0.16,
    });
    spawnSparks(hx, hy, WALL_Z, hit);

    if (!silent) {
      audio?.laserShot?.(patternOn);
      if (hit && idx === BURST_ROUNDS - 1) audio?.coinPickup?.();
      else if (!patternOn && idx === BURST_ROUNDS - 1) audio?.inputIgnored?.();
    }

    burstRound++;
    if (burstRound >= BURST_ROUNDS) {
      burstActive = false;
      autoPauseT = 1.45;
      if (!silent) {
        const pct = Math.round((burstHits / Math.max(1, burstShots)) * 100);
        setBanner(
          patternOn
            ? (compensateOn
                ? `14-ROUND BURST COMPLETE: ${pct}% BULLSEYE CLUSTER! ✓`
                : `14-ROUND '7' PATTERN TRACED (${pct}% BULLSEYE — PRESS [X] TO COUNTER-PULL)`)
            : `RNG MISSES! ONLY ${pct}% BULLSEYE — UNCONTROLLABLE SPREAD ✗`,
          hit && patternOn && compensateOn ? "#4ade80" : (patternOn ? "#fbbf24" : "#f87171"),
          1.9
        );
      }
    }
  }

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    turretRecoil = Math.max(0, turretRecoil - dt * 3.4);
    muzzleFlash = Math.max(0, muzzleFlash - dt);

    for (const h of holes) h.age += dt;
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.2 * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0.06, s.y + s.vy * dt);
      s.z += s.vz * dt;
    }

    if (burstActive) {
      fireCd -= dt;
      if (fireCd <= 0) {
        fireSingleRound(!userInteracted);
        fireCd = FIRE_INTERVAL;
      }
    } else {
      // Smooth dynamic crosshair bloom & aim recovery during fire pause!
      bloom = Math.max(0.08, bloom - dt * 1.15);
      aimX = lerp(aimX, BULL_X, clamp(dt * 6.5, 0, 1));
      aimY = lerp(aimY, BULL_Y, clamp(dt * 6.5, 0, 1));
      turretYaw = lerp(turretYaw, Math.PI, clamp(dt * 6.5, 0, 1));

      autoPauseT -= dt;
      if (autoPauseT <= 0) {
        startBurst({ silent: true });
      }
    }
  }

  function drawScatterPlot(ctx, px, py, sizeW, sizeH, isPl) {
    // Mini tactical target scatter plot inside top-right HUD
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.40)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(px, py, sizeW, sizeH, 6);
    ctx.fill();
    ctx.stroke();

    const cx = px + sizeW * 0.5;
    const cy = py + sizeH * 0.62;
    const scale = 28; // px per meter on target wall

    // Concentric bullseye rings
    const rings = [
      { r: 1.55, col: "rgba(148, 163, 184, 0.24)" },
      { r: 1.00, col: "rgba(248, 113, 113, 0.34)" },
      { r: BULL_RAD, col: "rgba(250, 204, 21, 0.72)" },
    ];
    for (const rg of rings) {
      ctx.strokeStyle = rg.col;
      ctx.lineWidth = rg.r === BULL_RAD ? 1.5 : 1.0;
      ctx.beginPath();
      ctx.arc(cx, cy, rg.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Crosshair axes
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 6, cy); ctx.lineTo(px + sizeW - 6, cy);
    ctx.moveTo(cx, py + 6); ctx.lineTo(cx, py + sizeH - 6);
    ctx.stroke();

    // Reference "7" spray curve silhouette (faint dashed amber) when Pattern Mode is ON
    if (patternOn) {
      ctx.strokeStyle = compensateOn ? "rgba(251, 191, 36, 0.36)" : "rgba(251, 191, 36, 0.70)";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      for (let i = 0; i < SPRAY_CURVE.length; i++) {
        const sx = cx + SPRAY_CURVE[i].x * scale;
        const sy = cy - SPRAY_CURVE[i].y * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Expanding red RNG cone circle
      ctx.strokeStyle = "rgba(248, 113, 113, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(sizeW * 0.44, (0.28 + bloom * 1.1) * scale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Live shot dots
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      const dx = clamp(cx + (h.x - BULL_X) * scale, px + 5, px + sizeW - 5);
      const dy = clamp(cy - (h.y - BULL_Y) * scale, py + 5, py + sizeH - 5);
      ctx.fillStyle = h.hit ? "#4ade80" : "#f87171";
      ctx.beginPath();
      ctx.arc(dx, dy, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dynamic crosshair bloom ring around current aim point
    const ax = clamp(cx + (aimX - BULL_X) * scale, px + 8, px + sizeW - 8);
    const ay = clamp(cy - (aimY - BULL_Y) * scale, py + 8, py + sizeH - 8);
    ctx.strokeStyle = patternOn ? "#38bdf8" : "#fb7185";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(ax, ay, clamp(bloom * 12, 4, 24), 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(isPl ? "ROZRZUT (14 STRZ.)" : "SPRAY PLOT (14 RDS)", px + 6, py + 12);
    ctx.restore();
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const hitRatePct = burstShots > 0 ? Math.round((burstHits / burstShots) * 100) : 100;

    if (viewProj) {
      // Dynamic projected crosshair bloom reticle directly on the 3D target wall!
      const ap = projectToScreen(viewProj, aimX, aimY, WALL_Z + 0.05, cssW, cssH);
      if (ap) {
        const radPx = clamp(bloom * (isCompact ? 22 : 34), 8, isCompact ? 42 : 66);
        ctx.save();
        ctx.strokeStyle = patternOn
          ? (compensateOn ? "rgba(74, 222, 128, 0.88)" : "rgba(251, 191, 36, 0.88)")
          : "rgba(248, 113, 113, 0.88)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, radPx, 0, Math.PI * 2);
        ctx.stroke();
        // 4 crisp reticle ticks
        const gap = radPx * 0.55;
        const tick = 7;
        ctx.beginPath();
        ctx.moveTo(ap.x - gap - tick, ap.y); ctx.lineTo(ap.x - gap, ap.y);
        ctx.moveTo(ap.x + gap, ap.y); ctx.lineTo(ap.x + gap + tick, ap.y);
        ctx.moveTo(ap.x, ap.y - gap - tick); ctx.lineTo(ap.x, ap.y - gap);
        ctx.moveTo(ap.x, ap.y + gap); ctx.lineTo(ap.x, ap.y + gap + tick);
        ctx.stroke();
        ctx.restore();
      }

      // Target board status callout
      const tp = projectToScreen(viewProj, 0.0, 4.55, WALL_Z, cssW, cssH);
      if (tp) {
        const label = patternOn
          ? (compensateOn
              ? (isPl ? `WZÓR '7' + KONTRA · ${hitRatePct}% W ŚRODEK ✓` : `LEARNED '7' + COUNTER-PULL · ${hitRatePct}% BULLSEYE ✓`)
              : (isPl ? `STAŁY WZÓR '7' (BEZ KONTRY) · ${hitRatePct}%` : `FIXED '7' PATTERN (NO PULL) · ${hitRatePct}%`))
          : (isPl ? `CZYSTY RNG BLOOM · ROZRZUT! (${hitRatePct}%) ✗` : `PURE RNG BLOOM · RNG MISSES! (${hitRatePct}%) ✗`);
        const col = patternOn ? (compensateOn ? "#4ade80" : "#fbbf24") : "#f87171";
        drawWorldPill(ctx, tp.x, tp.y, label, col, cssW, cssH, isCompact ? 9 : 10.5);
      }

      // Turret status pill
      const sp = projectToScreen(viewProj, TURRET_X, 1.95, TURRET_Z, cssW, cssH);
      if (sp) {
        const txt = burstActive
          ? (isPl ? `SERIA ${burstRound}/${BURST_ROUNDS}` : `BURST ${burstRound}/${BURST_ROUNDS}`)
          : (isPl ? "ODZYSKIWANIE CELNOŚCI…" : "BLOOM RECOVERY…");
        drawWorldPill(ctx, sp.x, sp.y, txt, burstActive ? "#fbbf24" : "#38bdf8", cssW, cssH, isCompact ? 8.5 : 9.5);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${patternOn ? "PATTERN" : "PURE RNG"} · ${compensateOn ? "PULL ON" : "NO PULL"} · ${hitRatePct}%`,
          patternOn ? (compensateOn ? "#4ade80" : "#fbbf24") : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14;
        const panelW = 342;
        const panelH = 208;
        const px = cssW - panelW - pad;

        ctx.save();
        ctx.fillStyle = "rgba(12, 13, 24, 0.90)";
        ctx.strokeStyle = patternOn
          ? (compensateOn ? "rgba(74, 222, 128, 0.80)" : "rgba(251, 191, 36, 0.80)")
          : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = patternOn ? (compensateOn ? "#4ade80" : "#fbbf24") : "#f87171";
        ctx.fillText(
          patternOn
            ? (isPl ? "WZÓR ODRZUTU · DETERMINISTYCZNY '7'" : "RECOIL PATTERN · LEARNABLE '7' SPRAY")
            : (isPl ? "CZYSTY RNG BLOOM · LOSOWY STOŻEK ✗" : "PURE RANDOM RNG BLOOM · NO MASTERY ✗"),
          px + 12,
          py + 21,
          panelW - 24
        );

        // Mini scatter plot on left
        drawScatterPlot(ctx, px + 12, py + 32, 130, 116, isPl);

        // Telemetry column on right
        const rx = px + 154;
        const rw = panelW - 166;

        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "TRAFIENIA W ŚRODEK" : "BULLSEYE HIT RATE", rx, py + 44);

        // Hit rate progress bar
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath();
        ctx.roundRect(rx, py + 50, rw, 16, 4);
        ctx.fill();
        const barCol = hitRatePct >= 75 ? "#4ade80" : (hitRatePct >= 45 ? "#fbbf24" : "#f87171");
        if (hitRatePct > 0) {
          ctx.fillStyle = barCol;
          ctx.beginPath();
          ctx.roundRect(rx, py + 50, Math.max(6, rw * (hitRatePct / 100)), 16, 4);
          ctx.fill();
        }
        ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#081018";
        ctx.fillText(`${hitRatePct}% (${burstHits}/${Math.max(1, burstShots)})`, rx + 6, py + 61.5);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = compensateOn ? "#4ade80" : "#fde047";
        ctx.fillText(
          isPl
            ? `Kontra [X]: ${compensateOn ? "WŁĄCZONA" : "WYŁĄCZONA"}`
            : `Counter-Pull [X]: ${compensateOn ? "ON" : "OFF"}`,
          rx,
          py + 88,
          rw
        );

        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl ? `Seria: ${burstRound}/${BURST_ROUNDS} strz.` : `Burst: ${burstRound}/${BURST_ROUNDS} rds`,
          rx,
          py + 108,
          rw
        );

        // Bloom bar
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? `Bloom: ${(bloom * 100).toFixed(0)}%` : `Spread Bloom: ${(bloom * 100).toFixed(0)}%`, rx, py + 128, rw);
        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath();
        ctx.roundRect(rx, py + 134, rw, 8, 3);
        ctx.fill();
        ctx.fillStyle = bloom > 0.7 ? "#f87171" : "#38bdf8";
        ctx.beginPath();
        ctx.roundRect(rx, py + 134, rw * clamp(bloom / 1.35, 0.04, 1), 8, 3);
        ctx.fill();

        // Bottom control hints
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl ? "Spacja / Klik / V = Nowa seria 14 strzałów" : "Space / Click / V = Fire 14-Round Burst",
          px + 12,
          py + 174,
          panelW - 24
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl ? "X = Kontra WŁ/WYŁ · T = Wzór vs Losowy RNG" : "X = Counter-Pull ON/OFF · T = Pattern vs RNG",
          px + 12,
          py + 193,
          panelW - 24
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
          id: "toggle-pattern",
          label: patternOn
            ? (pl ? "Wzór Odrzutu: WŁ [T]" : "Spray Pattern: ON [T]")
            : (pl ? "Czysty RNG Bloom [T]" : "Pure RNG Bloom [T]"),
          pressed: patternOn,
        },
        {
          id: "toggle-comp",
          label: compensateOn
            ? (pl ? "Kontra Odrzutu: WŁ [X]" : "Counter-Pull: ON [X]")
            : (pl ? "Kontra Odrzutu: WYŁ [X]" : "Counter-Pull: OFF [X]"),
          pressed: compensateOn,
        },
        {
          id: "fire-burst",
          label: pl ? "Oddaj Serię (14) [V]" : "Fire Burst Now [V]",
          pressed: burstActive,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-pattern") {
        patternOn = !patternOn;
        audio?.ruleSwitch?.(patternOn);
        startBurst({ silent: false });
      } else if (id === "toggle-comp") {
        compensateOn = !compensateOn;
        audio?.ruleSwitch?.(compensateOn);
        startBurst({ silent: false });
      } else if (id === "fire-burst") {
        startBurst({ silent: false });
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-pattern");
      else if (code === "KeyX") this.onAction("toggle-comp");
      else if (code === "KeyV" || code === "Space") this.onAction("fire-burst");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        userInteracted = true;
        startBurst({ silent: false });
        requestHudRefresh?.();
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        {
          gpu: sniperGpu,
          x: TURRET_X,
          y: TURRET_Y,
          z: TURRET_Z,
          yaw: turretYaw,
          animA: turretRecoil,
          scale: 1.24,
          animMode: 1,
          tint: patternOn ? [1.0, 0.78, 0.24, 0.14] : [1.0, 0.30, 0.30, 0.22],
        },
      ];

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Glowing bullseye target aura & outer sight ring on target wall
          fx.billboard(BULL_X, BULL_Y, WALL_Z + 0.04, 0.56, basis.right, basis.up, [1.0, 0.84, 0.20, 0.62], 1);
          fx.billboard(BULL_X, BULL_Y, WALL_Z + 0.04, 1.32, basis.right, basis.up, [0.95, 0.34, 0.34, 0.32], 1);

          // Faint ghost reference beads of the learnable "7-shaped" curve on the 3D wall when Pattern ON!
          if (patternOn) {
            for (let i = 0; i < SPRAY_CURVE.length; i++) {
              const p = SPRAY_CURVE[i];
              fx.billboard(
                BULL_X + p.x,
                BULL_Y + p.y,
                WALL_Z + 0.04,
                0.085,
                basis.right,
                basis.up,
                [1.0, 0.78, 0.22, compensateOn ? 0.30 : 0.48],
                2
              );
            }
          }

          // Glowing 3D bullet holes on the target wall
          for (const h of holes) {
            const fresh = clamp(1.0 - h.age * 0.45, 0.48, 1.0);
            const col = h.hit ? [0.22, 1.0, 0.62, fresh] : [1.0, 0.36, 0.22, fresh];
            fx.billboard(h.x, h.y, WALL_Z + 0.06, h.age < 0.15 ? 0.17 : 0.115, basis.right, basis.up, col, 2);
          }

          // Muzzle flash glow
          if (muzzleFlash > 0) {
            const a = clamp(muzzleFlash / 0.085, 0, 1);
            const mx = TURRET_X + Math.sin(turretYaw) * 1.48;
            const mz = TURRET_Z + Math.cos(turretYaw) * 1.48;
            fx.billboard(mx, 1.18, mz, 0.42 * a, basis.right, basis.up, [1.0, 0.78, 0.26, a * 0.92], 2);
          }

          // Crisp amber tracer beams from weapon turret to target wall
          for (const tr of tracers) {
            const a = clamp(tr.life / tr.maxLife, 0, 1);
            const col = tr.hit ? [1.0, 0.84, 0.28, a * 0.92] : [1.0, 0.46, 0.22, a * 0.86];
            fx.beam(tr.sx, tr.sy, tr.sz, tr.ex, tr.ey, tr.ez, 0.11, col, 0);
          }

          // Firing bay floor guide laser line
          fx.beam(TURRET_X, 0.08, TURRET_Z - 1.0, BULL_X, 0.08, WALL_Z + 0.4, 0.05, [1.0, 0.74, 0.20, 0.28], 4);

          // Impact sparks
          for (const sp of sparks) {
            const a = clamp(sp.life / sp.maxLife, 0, 1);
            fx.billboard(sp.x, sp.y, sp.z, 0.12 * a + 0.04, basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
          }
        },
      });

      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      const hitRatePct = burstShots > 0 ? Math.round((burstHits / burstShots) * 100) : 100;
      return {
        patternOn,
        compensateOn,
        burstActive,
        burstRound,
        shots,
        bullseyeHits,
        hitRatePct,
        bloom: +bloom.toFixed(2),
        holesCount: holes.length,
      };
    },
  };
}
