// Entry #14: Pity Timer & Pseudo-Random Drops — Twin Side-by-Side 3D Chest Vault A/B Comparison!
// Studio Overhaul: Left Chest = TRUE 10% RNG (flat 10% every roll -> towering crimson 26-miss frustration stack!)
// vs Right Chest = HIDDEN PITY + PRD (same ~10-12% average -> 3D Radial Pity Charge Arc, guaranteed <= Cap 12!)
// Both chests roll simultaneously off the exact same uniform random draw so the fairness difference pops in 2 seconds!
import { clamp, lerp } from "../../gl-utils.js";
import { createVaultRenderer, LEFT_X, RIGHT_X } from "./vault-renderer.js";

const ADVERTISED_RATE = 0.10;
const PITY_CAPS = [12, 8, 16];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  ctx.fillStyle = "rgba(16, 12, 24, 0.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
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
  const renderer = createVaultRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.56, dist: 15.6, targetX: 0.0, targetY: 0.55, targetZ: 1.05, fovDeg: 40 };

  let time = 0;
  let capIdx = 0;
  let pityCap = PITY_CAPS[capIdx];
  let rng = mulberry32(7);
  let pulls = 0;
  let autoDemo = true;
  let autoCd = 1.05;
  let userInteracted = false;

  let burstLeft = 0;
  let burstCd = 0;
  let sparks = [];
  let bannerText = "";
  let bannerColor = "#facc15";
  let bannerTimer = 0;

  function makeSide() {
    return {
      legendaries: 0,
      dry: 0,
      maxDry: 0,
      realChance: ADVERTISED_RATE,
      lastRarity: "COMMON",
      hitPity: false,
      lidOpen: 0,
      bounce: 0,
      dropPop: 0,
      goldFlash: 0,
    };
  }
  let left = makeSide();  // TRUE 10% RNG
  let right = makeSide(); // HIDDEN PITY + PRD

  function setBanner(text, color = "#facc15", dur = 2.0) {
    bannerText = text; bannerColor = color; bannerTimer = dur;
  }

  function spawnSparks(cx, r, g, b, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 3.4;
      sparks.push({
        x: cx, y: 1.3, z: 0.65,
        vx: Math.cos(a) * sp,
        vy: 2.2 + Math.random() * 3.4,
        vz: Math.sin(a) * sp,
        r, g, b,
        size: 0.14 + Math.random() * 0.11,
        life: 0.52 + Math.random() * 0.42,
        maxLife: 0.94,
      });
    }
  }

  function calcPityChance(dry) {
    const attempt = dry + 1;
    if (attempt >= pityCap) return 1.0;
    const base = 0.018;
    const step = (0.28 / Math.max(4, pityCap - 2));
    const soft = dry >= pityCap - 3 ? (dry - (pityCap - 4)) * 0.24 : 0;
    return clamp(base + dry * step + soft, base, 1.0);
  }

  function rollBothOnce({ quiet = false } = {}) {
    pulls++;
    const u = rng(); // Exact same uniform random number evaluated by BOTH systems!

    // LEFT: Honest Flat 10% RNG (ZERO safety net!)
    left.realChance = ADVERTISED_RATE;
    left.hitPity = false;
    if (u < ADVERTISED_RATE) {
      left.lastRarity = "LEGENDARY";
      left.legendaries++;
      left.dry = 0;
      left.goldFlash = 1.0;
      spawnSparks(LEFT_X, 1.0, 0.86, 0.22, quiet ? 8 : 24);
    } else {
      left.dry++;
      if (left.dry > left.maxDry) left.maxDry = left.dry;
      left.lastRarity = u < 0.34 ? "RARE" : "COMMON";
      spawnSparks(LEFT_X, 0.92, 0.36, 0.42, quiet ? 3 : 8);
    }
    left.lidOpen = 1.0;
    left.bounce = 1.0;
    left.dropPop = 0.08;

    // RIGHT: Hidden PRD + Hard Pity (same ~10-12% average, NEVER exceeds pityCap!)
    const rChance = calcPityChance(right.dry);
    const hitPity = (right.dry + 1 >= pityCap);
    right.hitPity = hitPity;
    if (u < rChance) {
      right.lastRarity = "LEGENDARY";
      right.legendaries++;
      right.dry = 0;
      right.goldFlash = 1.0;
      spawnSparks(RIGHT_X, 1.0, 0.86, 0.22, quiet ? 10 : 30);
    } else {
      right.dry++;
      if (right.dry > right.maxDry) right.maxDry = right.dry;
      right.lastRarity = u < rChance + 0.26 ? "RARE" : "COMMON";
      spawnSparks(RIGHT_X, 0.22, 0.90, 0.68, quiet ? 3 : 8);
    }
    right.realChance = calcPityChance(right.dry);
    right.lidOpen = 1.0;
    right.bounce = 1.0;
    right.dropPop = 0.08;

    if (!quiet) {
      if (right.lastRarity === "LEGENDARY" || left.lastRarity === "LEGENDARY") {
        audio?.chestLegendary ? audio.chestLegendary() : audio?.goalWin?.();
      } else {
        audio?.coinPickup?.();
      }
      if (right.hitPity && right.lastRarity === "LEGENDARY") {
        setBanner(`RIGHT HIT HARD PITY (#${pityCap} = 100%)! · LEFT DRY: ${left.dry} ✗`, "#facc15", 2.0);
      } else if (left.dry >= 16 && left.lastRarity !== "LEGENDARY") {
        setBanner(`LEFT TRUE 10% RNG: BRUTAL ${left.dry}-MISS DRY STREAK!`, "#f87171", 1.8);
      }
    }
  }

  function startBurst50() {
    userInteracted = true;
    autoDemo = false;
    burstLeft = 50;
    burstCd = 0;
    setBanner("SIMULATING 50 SIDE-BY-SIDE PULLS (SAME RNG SEED)...", "#facc15", 1.8);
  }

  function reset() {
    time = 0;
    rng = mulberry32(7);
    pulls = 0;
    left = makeSide();
    right = makeSide();
    burstLeft = 0;
    sparks = [];
    bannerTimer = 0;
    autoDemo = true;
    autoCd = 1.15;

    // Pre-roll authentic seed #7 draws until Right lands a fresh Legendary while Left is deep in a dry streak!
    for (let i = 0; i < 32; i++) {
      rollBothOnce({ quiet: true });
      if (pulls >= 16 && right.lastRarity === "LEGENDARY" && left.dry >= 14) break;
    }
    left.goldFlash = 0;
    right.goldFlash = 0.92;
  }

  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    for (const s of [left, right]) {
      s.bounce = Math.max(0, s.bounce - dt * 5.0);
      s.goldFlash = Math.max(0, s.goldFlash - dt * 0.95);
      s.lidOpen = lerp(s.lidOpen, s.dropPop > 0.02 ? 0.90 : 0.14, clamp(dt * 7.5, 0, 1));
      if (s.dropPop > 0) s.dropPop = lerp(s.dropPop, 1.0, clamp(dt * 8.5, 0, 1));
    }

    if (burstLeft > 0) {
      burstCd -= dt;
      if (burstCd <= 0) {
        const batch = Math.min(burstLeft, 3);
        for (let i = 0; i < batch; i++) rollBothOnce({ quiet: true });
        burstLeft -= batch;
        burstCd = 0.042;
        if (burstLeft === 0) {
          audio?.chestLegendary ? audio.chestLegendary() : audio?.goalWin?.();
          setBanner(
            `AFTER ${pulls} PULLS · TRUE 10% MAX DRY: ${left.maxDry} ✗  vs  PITY MAX DRY: ${right.maxDry} ✓`,
            "#4ade80",
            2.8
          );
          requestHudRefresh?.();
        }
      }
    } else if (autoDemo) {
      autoCd -= dt;
      if (autoCd <= 0) {
        rollBothOnce({ quiet: !userInteracted });
        autoCd = 1.25;
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 7.8 * dt; s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const realPct = Math.round(right.realChance * 100);

    // 1. World-Space 3D Callout Pills directly over BOTH Chests & Dry-Streak Towers!
    if (viewProj) {
      const lp = projectToScreen(viewProj, LEFT_X, 2.75, 0.65, cssW, cssH);
      const rp = projectToScreen(viewProj, RIGHT_X, 2.75, 0.65, cssW, cssH);
      if (lp) {
        const lTxt = left.lastRarity === "LEGENDARY"
          ? (isPl ? `CZYSTE 10% · ★ LEGENDA!` : `TRUE 10% RNG · ★ LEGENDARY!`)
          : (isPl ? `CZYSTE 10% · SERIA PUDEŁ: ${left.dry} ✗` : `TRUE 10% RNG · DRY: ${left.dry} ✗`);
        drawWorldPill(ctx, lp.x, lp.y, lTxt, left.lastRarity === "LEGENDARY" ? "#facc15" : "#f87171", cssW, cssH, isCompact ? 9 : 11);
      }
      if (rp) {
        const rTxt = right.lastRarity === "LEGENDARY"
          ? (right.hitPity
              ? (isPl ? `PITY #${pityCap} (100%) · ★ LEGENDA!` : `★ HARD PITY #${pityCap} LEGENDARY!`)
              : (isPl ? `PITY + PRD · ★ LEGENDA!` : `PITY + PRD · ★ LEGENDARY!`))
          : (isPl ? `PITY + PRD · UKRYTA: ${realPct}% · MAX ${right.maxDry} ✓` : `PITY + PRD · REAL: ${realPct}% · MAX ${right.maxDry} ✓`);
        drawWorldPill(ctx, rp.x, rp.y, rTxt, right.lastRarity === "LEGENDARY" ? "#facc15" : "#34d399", cssW, cssH, isCompact ? 9 : 11);
      }

      // Tower height labels right behind the chests!
      if (!isCompact && pulls >= 8) {
        const ltH = 0.55 + Math.ceil(Math.min(left.maxDry, 36) / 2) * 0.24;
        const rtH = 0.55 + Math.ceil(Math.min(right.maxDry, 36) / 2) * 0.24;
        const ltp = projectToScreen(viewProj, LEFT_X, ltH + 0.55, -2.50, cssW, cssH);
        const rtp = projectToScreen(viewProj, RIGHT_X, rtH + 0.55, -2.50, cssW, cssH);
        if (ltp) {
          drawWorldPill(ctx, ltp.x, ltp.y, isPl ? `NAJGORSZA SERIA: ${left.maxDry} PUDEŁ!` : `WORST DRY STREAK: ${left.maxDry} ✗`, "#f87171", cssW, cssH, 10);
        }
        if (rtp) {
          drawWorldPill(ctx, rtp.x, rtp.y, isPl ? `LIMIT PITY: MAX ${right.maxDry} ✓` : `PITY CAPPED: MAX ${right.maxDry} ✓`, "#34d399", cssW, cssH, 10);
        }
      }
    }

    // 2. Corner Comparison Telemetry HUD (hidden in ?hud=0)
    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (isCompact) {
        const pill = isPl
          ? `10% Max Pudła: ${left.maxDry} ✗  vs  Pity: ${right.maxDry} ✓ (${pulls} prób)`
          : `True 10% Max Dry: ${left.maxDry} ✗  vs  Pity: ${right.maxDry} ✓ (${pulls})`;
        ctx.save();
        ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 18, ctx.measureText(pill).width + 18);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(16, 12, 24, 0.88)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fde047";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(320, cssW - 28), panelH = 158;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(16, 12, 24, 0.88)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `PORÓWNANIE A/B · ${pulls} PRÓB (CAP ${pityCap})` : `A/B VAULT TEST · ${pulls} PULLS (CAP ${pityCap})`, px + 12, py + 21);

        // Bar 1: Left True 10% RNG
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 22, 42, 0.92)";
        ctx.beginPath(); ctx.roundRect(bx, py + 33, bw, 15, 4); ctx.fill();
        ctx.fillStyle = "#ef4444";
        ctx.beginPath(); ctx.roundRect(bx, py + 33, Math.max(8, bw * 0.10), 15, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fecaca";
        ctx.fillText(isPl ? `LEWA (Czyste 10%): stałe 10% · Max seria ${left.maxDry}` : `LEFT (True 10%): flat 10% · Max Dry ${left.maxDry}`, bx + 6, py + 43.5);

        // Bar 2: Right Hidden Pity + PRD Real Chance
        ctx.fillStyle = "rgba(30, 22, 42, 0.92)";
        ctx.beginPath(); ctx.roundRect(bx, py + 53, bw, 15, 4); ctx.fill();
        ctx.fillStyle = realPct >= 99 ? "#facc15" : "#34d399";
        ctx.beginPath(); ctx.roundRect(bx, py + 53, Math.max(8, bw * (realPct / 100)), 15, 4); ctx.fill();
        ctx.fillStyle = realPct >= 62 ? "#090d16" : "#ecfdf5";
        ctx.fillText(isPl ? `PRAWA (Pity+PRD): ukryte ${realPct}% · Max ${right.maxDry}` : `RIGHT (Pity+PRD): real ${realPct}% · Max ${right.maxDry}`, bx + 6, py + 63.5);

        const lAvg = pulls > 0 ? ((left.legendaries / pulls) * 100).toFixed(1) : "0.0";
        const rAvg = pulls > 0 ? ((right.legendaries / pulls) * 100).toFixed(1) : "0.0";
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fca5a5";
        ctx.fillText(isPl ? `Lewa Legendy: ${left.legendaries} (${lAvg}%) · Pudła: ${left.dry}` : `Left Legendaries: ${left.legendaries} (${lAvg}%) · Dry: ${left.dry}`, px + 12, py + 92);
        ctx.fillStyle = "#6ee7b7";
        ctx.fillText(isPl ? `Prawa Legendy: ${right.legendaries} (${rAvg}%) · Pudła: ${right.dry}` : `Right Legendaries: ${right.legendaries} (${rAvg}%) · Dry: ${right.dry}`, px + 12, py + 114);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? "Spacja / Klik = Otwórz Obie · V = Wyścig 50×" : "Space / Click = Open Both · V = 50× Race", px + 12, py + 138);
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
      ctx.fillStyle = "rgba(16, 12, 24, 0.92)";
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
        { id: "open-both", label: pl ? "Otwórz Obie [Spacja]" : "Open Both [Space]", pressed: false },
        { id: "burst-50", label: pl ? "Wyścig 50× [V]" : "Race 50× [V]", pressed: burstLeft > 0 },
        { id: "cycle-cap", label: pl ? `Limit Pity: ${pityCap} [T]` : `Pity Cap: ${pityCap} [T]`, pressed: true },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "open-both") {
        autoDemo = false;
        rollBothOnce({ quiet: false });
      } else if (id === "burst-50") {
        startBurst50();
      } else if (id === "cycle-cap") {
        capIdx = (capIdx + 1) % PITY_CAPS.length;
        pityCap = PITY_CAPS[capIdx];
        audio?.ruleSwitch?.(true);
        reset();
        setBanner(`HARD PITY CAP SET TO #${pityCap} (100% GUARANTEED!)`, "#facc15", 2.0);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space") this.onAction("open-both");
      else if (code === "KeyV") this.onAction("burst-50");
      else if (code === "KeyT") this.onAction("cycle-cap");
    },
    onClickWorld() { this.onAction("open-both"); },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time,
        pityCap,
        left: { ...left, maxDryShow: Math.max(left.dry, left.maxDry) },
        right: { ...right, maxDryShow: Math.max(right.dry, right.maxDry) },
        sparks,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        pityCap,
        pulls,
        leftLegendaries: left.legendaries,
        leftDry: left.dry,
        leftMaxDry: left.maxDry,
        rightLegendaries: right.legendaries,
        rightDry: right.dry,
        rightMaxDry: right.maxDry,
        rightRealChancePct: Math.round(right.realChance * 100),
        burstLeft,
      };
    },
  };
}
