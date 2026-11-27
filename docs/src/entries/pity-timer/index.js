// Entry #14: Pity Timer & Pseudo-Random Drops — Playable 3D Treasure Vault RNG Explainer!
// Exposes why "10% Legendary Drop Rate" in Dota 2, Diablo & RPGs secretly lies to feel FAIR:
// True 10% RNG causes brutal 25–40 miss dry streaks, while Pseudo-Random Distribution (PRD) + Hard Pity
// ramps your hidden chance upward on every miss and guarantees a Legendary by pull #12!
import { clamp, lerp } from "../../gl-utils.js";
import { createVaultRenderer } from "./vault-renderer.js";

const HARD_PITY = 12;
const ADVERTISED_RATE = 0.10;

// Deterministic PRNG helper so 1-Click 100-Pull comparison showcases real dry streaks reproducibly!
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const renderer = createVaultRenderer(gl);

  const defaultCam = { yaw: 0.0, pitch: 0.56, dist: 12.6, targetX: 0.0, targetY: 1.15, targetZ: 0.0, fovDeg: 40 };

  let time = 0;
  let pityOn = true; // true = Hidden PRD + Hard Pity (12), false = True Flat 10% RNG (brutal dry streaks!)
  let rng = mulberry32(77);

  let pulls = 0;
  let legendaries = 0;
  let dryStreak = 0;
  let maxDryStreak = 0;
  let lastRarity = "COMMON";
  let recentDrops = [];
  let streakHistory = []; // lengths of completed streaks to plot histogram!

  let lidOpen = 0;
  let chestBounce = 0;
  let dropPop = 0;
  let goldFlash = 0;
  let burstLeft = 0;
  let burstCd = 0;
  let sparks = [];

  let bannerText = "";
  let bannerColor = "#facc15";
  let bannerTimer = 0;

  function setBanner(text, color = "#facc15", dur = 2.0) {
    bannerText = text; bannerColor = color; bannerTimer = dur;
  }

  function spawnSparks(r, g, b, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 3.8;
      sparks.push({
        x: 0, y: 1.3, z: 0,
        vx: Math.cos(a) * sp,
        vy: 2.2 + Math.random() * 3.8,
        vz: Math.sin(a) * sp,
        r, g, b,
        size: 0.14 + Math.random() * 0.12,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1.0,
      });
    }
  }

  // Secret Real Drop Chance (PRD ramp + Hard Pity at pull #12 -> true average ~11-12%, NEVER exceeds 12 pulls!)
  function currentRealChance() {
    if (!pityOn) return ADVERTISED_RATE;
    const attempt = dryStreak + 1; // 1..12
    if (attempt >= HARD_PITY) return 1.0;
    // Smooth Dota-style PRD ramp: starts at 1.8% and climbs smoothly per miss (+ soft pity near 11)!
    return clamp(0.018 + dryStreak * 0.022 + (dryStreak >= 10 ? (dryStreak - 9) * 0.25 : 0), 0.018, 1.0);
  }

  function openChestOnce(quiet = false) {
    pulls++;
    const chance = currentRealChance();
    const roll = rng();
    let rarity = "COMMON";
    const hitPity = pityOn && (dryStreak + 1 >= HARD_PITY);

    if (roll < chance) {
      rarity = "LEGENDARY";
      legendaries++;
      streakHistory.push(dryStreak + 1);
      if (streakHistory.length > 24) streakHistory.shift();
      dryStreak = 0;
      goldFlash = 1.0;
      spawnSparks(1.0, 0.86, 0.22, quiet ? 10 : 32);
      if (!quiet) {
        audio?.goalWin?.();
        setBanner(
          hitPity ? `HARD PITY TRIGGERED (PULL #12 = 100%)!` : `★ LEGENDARY DROP! (REAL CHANCE ${Math.round(chance * 100)}%)`,
          "#facc15",
          2.0
        );
      }
    } else {
      dryStreak++;
      if (dryStreak > maxDryStreak) maxDryStreak = dryStreak;
      rarity = roll < chance + 0.28 ? "RARE" : "COMMON";
      spawnSparks(rarity === "RARE" ? 0.24 : 0.65, rarity === "RARE" ? 0.72 : 0.70, rarity === "RARE" ? 1.0 : 0.78, quiet ? 4 : 10);
      if (!quiet) {
        audio?.coinPickup?.();
        if (!pityOn && dryStreak >= 18) {
          setBanner(`BRUTAL DRY STREAK: ${dryStreak} MISSES IN A ROW! (TRUE 10% RNG)`, "#ef4444", 1.8);
        }
      }
    }

    lastRarity = rarity;
    recentDrops.push(rarity);
    if (recentDrops.length > 20) recentDrops.shift();
    lidOpen = 1.0;
    chestBounce = 1.0;
    dropPop = 0.08;
  }

  function startBurst100() {
    // Runs a rapid 100-pull simulation so max dry streak difference pops out unmistakably!
    pulls = 0; legendaries = 0; dryStreak = 0; maxDryStreak = 0;
    recentDrops = []; streakHistory = [];
    // Seed chosen so True 10% RNG genuinely demonstrates a realistic 25+ miss dry streak (expected max in 100 pulls ~26!)
    rng = mulberry32(pityOn ? 77 : 7);
    burstLeft = 100;
    burstCd = 0;
    setBanner(pityOn ? "SIMULATING 100 PULLS (PITY + PRD)..." : "SIMULATING 100 PULLS (TRUE 10% RNG)...", pityOn ? "#facc15" : "#f87171", 1.8);
  }

  function reset() {
    time = 0;
    pityOn = true;
    rng = mulberry32(77);
    pulls = 0; legendaries = 0; dryStreak = 0; maxDryStreak = 0;
    lastRarity = "COMMON";
    recentDrops = []; streakHistory = [];
    lidOpen = 0; chestBounce = 0; dropPop = 0; goldFlash = 0;
    burstLeft = 0; sparks = []; bannerTimer = 0;
    // Open 1 welcoming pull on start so the vault looks alive!
    openChestOnce(true);
  }

  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    chestBounce = Math.max(0, chestBounce - dt * 5.0);
    goldFlash = Math.max(0, goldFlash - dt * 1.15);
    lidOpen = lerp(lidOpen, dropPop > 0.02 ? 0.92 : 0.12, clamp(dt * 7.5, 0, 1));
    if (dropPop > 0) dropPop = lerp(dropPop, 1.0, clamp(dt * 8.5, 0, 1));

    // Rapid animated 100-pull burst!
    if (burstLeft > 0) {
      burstCd -= dt;
      if (burstCd <= 0) {
        const batch = Math.min(burstLeft, 4);
        for (let i = 0; i < batch; i++) openChestOnce(true);
        burstLeft -= batch;
        burstCd = 0.032;
        if (burstLeft === 0) {
          audio?.goalWin?.();
          setBanner(
            pityOn
              ? `100 PULLS (PITY ON): MAX DRY STREAK ONLY ${maxDryStreak}!`
              : `100 PULLS (TRUE 10% RNG): BRUTAL ${maxDryStreak}-MISS DRY STREAK!`,
            pityOn ? "#4ade80" : "#ef4444",
            2.6
          );
          requestHudRefresh?.();
        }
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
    const realPct = Math.round(currentRealChance() * 100);
    const avgPct = pulls > 0 ? ((legendaries / pulls) * 100).toFixed(1) : "0.0";

    if (!document.body.classList.contains("no-hud")) {
      const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
      const py = Math.max(54, Math.round(hdrBottom) + 6);
      if (cssW < 640) {
        const pill = pityOn
          ? (isPl ? `PITY WŁ · Ukryte ${realPct}% · Seria ${dryStreak}/${HARD_PITY} (Max ${maxDryStreak})` : `PITY ON · Real ${realPct}% · Dry ${dryStreak}/${HARD_PITY} (Max ${maxDryStreak})`)
          : (isPl ? `CZYSTE 10% RNG · Seria ${dryStreak} (Max ${maxDryStreak}!)` : `TRUE 10% RNG · Dry ${dryStreak} (Max ${maxDryStreak}!)`);
        ctx.save();
        ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = Math.min(cssW - 20, ctx.measureText(pill).width + 20);
        const px = (cssW - tw) * 0.5;
        ctx.fillStyle = "rgba(18, 12, 24, 0.88)";
        ctx.strokeStyle = pityOn ? "rgba(245, 158, 11, 0.78)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(px, py, tw, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pityOn ? "#fde047" : "#fca5a5";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pill, cssW * 0.5, py + 12.5);
        ctx.restore();
      } else {
        const pad = 14, panelW = Math.min(312, cssW - 28), panelH = 166;
        const px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(18, 12, 24, 0.88)";
        ctx.strokeStyle = pityOn ? "rgba(245, 158, 11, 0.78)" : "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = pityOn ? "#fde047" : "#fca5a5";
        ctx.fillText(
          pityOn
            ? (isPl ? `UKRYTY PITY TIMER + PRD (MAX ${HARD_PITY})` : `HIDDEN PITY TIMER + PRD (CAP ${HARD_PITY})`)
            : (isPl ? "PRAWDZIWE 10% RNG (BEZ PITY!)" : "TRUE FLAT 10% RNG (NO PITY!)"),
          px + 12, py + 21
        );

        // Dual Probability Bar: SHOWN (10%) vs SECRET REAL CHANCE (3% -> 100%)
        const bx = px + 12, bw = panelW - 24;
        ctx.fillStyle = "rgba(30, 26, 44, 0.9)";
        ctx.beginPath(); ctx.roundRect(bx, py + 32, bw, 13, 4); ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath(); ctx.roundRect(bx, py + 32, bw * 0.10, 13, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(isPl ? "POKAZANA SZANSA: 10% (stała)" : "ADVERTISED RATE: 10% (fixed)", bx + 6, py + 41.5);

        ctx.fillStyle = "rgba(30, 26, 44, 0.9)";
        ctx.beginPath(); ctx.roundRect(bx, py + 50, bw, 14, 4); ctx.fill();
        ctx.fillStyle = realPct >= 99 ? "#facc15" : (pityOn ? "#34d399" : "#ef4444");
        ctx.beginPath(); ctx.roundRect(bx, py + 50, Math.max(8, bw * (realPct / 100)), 14, 4); ctx.fill();
        ctx.fillStyle = realPct >= 70 ? "#090d16" : "#f8fafc";
        ctx.fillText(isPl ? `UKRYTA SZANSA TERAZ: ${realPct}%` : `SECRET REAL CHANCE NOW: ${realPct}%`, bx + 6, py + 60);

        // Live Stats & Max Dry Streak comparison
        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = maxDryStreak >= 18 ? "#f87171" : "#4ade80";
        ctx.fillText(
          isPl
            ? `Seria bez Legendy: ${dryStreak}  ·  NAJGORSZA: ${maxDryStreak}`
            : `Dry Streak: ${dryStreak}  ·  MAX DRY STREAK: ${maxDryStreak}`,
          px + 12, py + 88
        );

        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(
          isPl
            ? `Otwarcia: ${pulls}  ·  Legendy: ${legendaries} (śr. ${avgPct}%)`
            : `Pulls: ${pulls}  ·  Legendaries: ${legendaries} (avg ${avgPct}%)`,
          px + 12, py + 110
        );

        // Mini bar chart of recent pull streak lengths!
        const hx = px + 12, hy = py + 122, hw = panelW - 24, hh = 32;
        ctx.fillStyle = "rgba(12, 10, 20, 0.78)";
        ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 4); ctx.fill();
        const bars = streakHistory.slice(-16);
        const stepW = hw / Math.max(16, bars.length);
        for (let i = 0; i < bars.length; i++) {
          const val = bars[i];
          const bh = Math.max(3, (clamp(val, 1, 30) / 30) * (hh - 6));
          ctx.fillStyle = val > HARD_PITY ? "#ef4444" : (val === HARD_PITY ? "#facc15" : "#34d399");
          ctx.fillRect(hx + i * stepW + 2, hy + hh - bh - 3, Math.max(3, stepW - 4), bh);
        }
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
      ctx.fillStyle = "rgba(18, 12, 24, 0.92)";
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
        { id: "open-one", label: pl ? "Otwórz Skrzynię [Spacja]" : "Open Chest [Space]", pressed: false },
        { id: "burst-100", label: pl ? "Symuluj 100× [V]" : "Simulate 100× [V]", pressed: burstLeft > 0 },
        { id: "toggle-pity", label: pityOn ? (pl ? "System: Pity + PRD [T]" : "Math: Pity + PRD [T]") : (pl ? "System: Czyste 10% [T]" : "Math: True 10% RNG [T]"), pressed: pityOn },
      ];
    },
    onAction(id) {
      if (id === "open-one") {
        openChestOnce(false);
      } else if (id === "burst-100") {
        startBurst100();
      } else if (id === "toggle-pity") {
        pityOn = !pityOn;
        pulls = 0; legendaries = 0; dryStreak = 0; maxDryStreak = 0;
        recentDrops = []; streakHistory = [];
        rng = mulberry32(pityOn ? 77 : 7);
        audio?.ruleSwitch?.(pityOn);
        setBanner(pityOn ? "PITY + PRD ON: GUARANTEED BY PULL #12!" : "TRUE 10% RNG: NO SAFETY NET — WATCH DRY STREAKS!", pityOn ? "#facc15" : "#ef4444", 2.0);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space") this.onAction("open-one");
      else if (code === "KeyV") this.onAction("burst-100");
      else if (code === "KeyT") this.onAction("toggle-pity");
    },
    onClickWorld() { this.onAction("open-one"); },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const { viewProj } = renderer.render(w, h, cam, {
        time, lidOpen, chestBounce, dropPop, goldFlash, lastRarity, recentDrops, sparks,
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { pityOn, pulls, legendaries, dryStreak, maxDryStreak, realChancePct: Math.round(currentRealChance() * 100), burstLeft };
    },
  };
}
