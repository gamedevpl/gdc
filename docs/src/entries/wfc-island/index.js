// Entry #16: Wave Function Collapse (WFC) — Live 3D Coastal Archipelago Constraint Solver!
// Watch lowest-entropy tiles collapse one-by-one and ripple compatibility rules across neighbors to build
// a 100%-consistent 3D island (Ocean -> Beach -> Meadow -> Roads -> Red-Roof Cottages) vs Random Broken Edges!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getWfcMeshes } from "../../wfc-mesh.js";

const N = 8;
const TILE = 1.48;

// 6 Tile Types: 0=Ocean, 1=Sand Coast, 2=Grass Meadow, 3=Stone Road, 4=Granite Cliff, 5=Cottage Town
const COMPAT = [
  [0, 1],             // 0: Ocean touches only Ocean or Sand Coast
  [0, 1, 2],          // 1: Sand Coast touches Ocean, Coast, or Grass
  [1, 2, 3, 4, 5],    // 2: Grass Meadow connects Coast, Roads, Cliffs & Cottages
  [2, 3, 5],          // 3: Paved Road stays on dry land (Grass / Road / Town — NEVER plunges into Ocean!)
  [2, 4],             // 4: Granite Cliff rises cleanly out of Grass
  [2, 3, 5],          // 5: Red-Roof Cottage sits cleanly beside Grass, Roads or Cottages
];
const WEIGHTS = [1.6, 1.5, 2.2, 1.4, 0.9, 1.5];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileToWorld(c, r) {
  return [(c - (N - 1) * 0.5) * TILE, (r - (N - 1) * 0.5) * TILE];
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.055, 0.24, 0.42],
    skyMid: [0.14, 0.44, 0.62],
    skyBot: [0.34, 0.62, 0.72],
    ambLow: [0.14, 0.24, 0.30],
    ambHigh: [0.44, 0.56, 0.62],
  });
  const m = getWfcMeshes();
  const cottageGpu = studio.uploadMesh(m.cottage);
  const treeGpu = studio.uploadMesh(m.tree);

  const defaultCam = { yaw: 0.36, pitch: 0.76, dist: 19.6, targetX: 0.0, targetY: 0.3, targetZ: 0.2, fovDeg: 40 };

  let time = 0;
  let wfcMode = true;
  let seed = 42;
  let pinned = new Map(); // idx -> tileType

  // Solver state: each cell holds Set/bitmask of allowed types (bits 0..5)
  let domains = new Uint8Array(N * N);
  let collapsed = new Int8Array(N * N); // -1 = uncollapsed, 0..5 = final tile
  let collapseOrder = [];
  let animCursor = 0;
  let stepCd = 0;
  let brokenEdges = [];
  let lastRipple = null; // { c, r, age }
  let worldDirty = true;

  let bannerText = "";
  let bannerColor = "#10b981";
  let bannerTimer = 0;
  function setBanner(t, c = "#10b981", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function popcount(mask) {
    let n = 0;
    for (let i = 0; i < 6; i++) if (mask & (1 << i)) n++;
    return n;
  }

  function solveFullWfc(runSeed) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const rng = mulberry32(runSeed + attempt * 131);
      const dom = new Uint8Array(N * N).fill(0b111111);
      const col = new Int8Array(N * N).fill(-1);
      const order = [];

      const propagate = (startQueue) => {
        const q = [...startQueue];
        while (q.length > 0) {
          const cur = q.shift();
          const cr = Math.floor(cur / N), cc = cur % N;
          let allowedNeigh = 0;
          for (let t = 0; t < 6; t++) {
            if (dom[cur] & (1 << t)) {
              for (const nb of COMPAT[t]) allowedNeigh |= (1 << nb);
            }
          }
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = cc + dc, nr = cr + dr;
            if (nc < 0 || nc >= N || nr < 0 || nr >= N) continue;
            const ni = nr * N + nc;
            const nextMask = dom[ni] & allowedNeigh;
            if (nextMask === 0) return false;
            if (nextMask !== dom[ni]) {
              dom[ni] = nextMask;
              q.push(ni);
            }
          }
        }
        return true;
      };

      // Seed outer corners with Ocean so a natural sunlit archipelago island emerges!
      let ok = true;
      const borderSeeds = [0, N - 1, (N - 1) * N, N * N - 1, 3, N * (N - 1) + 4];
      for (const bi of borderSeeds) {
        if (!pinned.has(bi)) {
          dom[bi] = 1 << 0;
          col[bi] = 0;
          order.push({ idx: bi, tile: 0 });
          if (!propagate([bi])) { ok = false; break; }
        }
      }
      // Apply user-pinned tiles
      for (const [pi, pt] of pinned.entries()) {
        if (!(dom[pi] & (1 << pt))) { ok = false; break; }
        dom[pi] = 1 << pt;
        col[pi] = pt;
        order.push({ idx: pi, tile: pt });
        if (!propagate([pi])) { ok = false; break; }
      }
      // Seed center town heart if nothing pinned in middle
      const midIdx = 3 * N + 3;
      if (ok && col[midIdx] === -1 && (dom[midIdx] & (1 << 5))) {
        dom[midIdx] = 1 << 5;
        col[midIdx] = 5;
        order.push({ idx: midIdx, tile: 5 });
        ok = propagate([midIdx]);
      }

      while (ok) {
        // Pick uncollapsed cell with LOWEST ENTROPY (> 0 possibilities)!
        let bestEntropy = 99;
        let candidates = [];
        for (let i = 0; i < N * N; i++) {
          if (col[i] !== -1) continue;
          const e = popcount(dom[i]);
          if (e < bestEntropy) { bestEntropy = e; candidates = [i]; }
          else if (e === bestEntropy) candidates.push(i);
        }
        if (candidates.length === 0) break;
        const pick = candidates[Math.floor(rng() * candidates.length)];
        // Weighted random collapse from valid domain
        const opts = [];
        let wSum = 0;
        for (let t = 0; t < 6; t++) {
          if (dom[pick] & (1 << t)) { opts.push(t); wSum += WEIGHTS[t]; }
        }
        let rVal = rng() * wSum;
        let chosen = opts[0];
        for (const t of opts) {
          rVal -= WEIGHTS[t];
          if (rVal <= 0) { chosen = t; break; }
        }
        dom[pick] = 1 << chosen;
        col[pick] = chosen;
        order.push({ idx: pick, tile: chosen });
        ok = propagate([pick]);
      }

      if (ok) return { col, order };
    }
    return null;
  }

  function computeBrokenEdges() {
    brokenEdges = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = collapsed[r * N + c];
        if (a < 0) continue;
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc >= N || nr >= N) continue;
          const b = collapsed[nr * N + nc];
          if (b < 0) continue;
          if (!COMPAT[a].includes(b)) {
            brokenEdges.push({ c0: c, r0: r, c1: nc, r1: nr });
          }
        }
      }
    }
  }

  function generate({ animate = true } = {}) {
    collapsed.fill(-1);
    domains.fill(0b111111);
    collapseOrder = [];
    brokenEdges = [];

    if (wfcMode) {
      const solved = solveFullWfc(seed);
      if (solved) {
        collapseOrder = solved.order;
      }
    } else {
      // Pure Random Tiles (ZERO WFC rules -> cottages in ocean, roads plunging off cliffs!)
      const rng = mulberry32(seed);
      for (let i = 0; i < N * N; i++) {
        const t = pinned.has(i) ? pinned.get(i) : Math.floor(rng() * 6);
        collapseOrder.push({ idx: i, tile: t });
      }
    }

    if (animate) {
      animCursor = 0;
      stepCd = 0.02;
    } else {
      for (const st of collapseOrder) collapsed[st.idx] = st.tile;
      animCursor = collapseOrder.length;
    }
    computeBrokenEdges();
    worldDirty = true;
  }

  function rebuildWorld() {
    const buf = [];
    const half = (N * TILE) * 0.5;
    // Ocean bedrock plinth
    pushBox(buf, -half - 0.35, half + 0.35, -0.55, 0.0, -half - 0.35, half + 0.35, [0.06, 0.18, 0.30], 1);

    const h = TILE * 0.49;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const t = collapsed[idx];
        const [wx, wz] = tileToWorld(c, r);
        if (t === -1) {
          // Uncollapsed superposition slate pedestal
          pushBox(buf, wx - h * 0.92, wx + h * 0.92, 0.0, 0.18, wz - h * 0.92, wz + h * 0.92, [0.18, 0.24, 0.36], 0);
        } else if (t === 0) {
          pushBox(buf, wx - h, wx + h, 0.0, 0.16, wz - h, wz + h, [0.08, 0.42, 0.68], 3);
        } else if (t === 1) {
          pushBox(buf, wx - h, wx + h, 0.0, 0.28, wz - h, wz + h, [0.88, 0.78, 0.48], 4);
        } else if (t === 2) {
          pushBox(buf, wx - h, wx + h, 0.0, 0.46, wz - h, wz + h, [0.26, 0.66, 0.34], 4);
        } else if (t === 3) {
          // Stone Cobble Road
          pushBox(buf, wx - h, wx + h, 0.0, 0.46, wz - h, wz + h, [0.28, 0.60, 0.34], 4);
          pushBox(buf, wx - h * 0.52, wx + h * 0.52, 0.46, 0.52, wz - h, wz + h, [0.58, 0.56, 0.52], 0);
          pushBox(buf, wx - h, wx + h, 0.46, 0.52, wz - h * 0.52, wz + h * 0.52, [0.58, 0.56, 0.52], 0);
        } else if (t === 4) {
          // Elevated Granite Cliff Ridge
          pushBox(buf, wx - h, wx + h, 0.0, 0.98, wz - h, wz + h, [0.46, 0.48, 0.54], 1);
          pushBox(buf, wx - h * 0.78, wx + h * 0.78, 0.98, 1.18, wz - h * 0.78, wz + h * 0.78, [0.34, 0.66, 0.38], 4);
        } else if (t === 5) {
          // Cozy Village Meadow Base (Cottage Blender prop sits right on top!)
          pushBox(buf, wx - h, wx + h, 0.0, 0.48, wz - h, wz + h, [0.32, 0.68, 0.38], 4);
        }
      }
    }
    studio.setWorldData(buf);
    worldDirty = false;
  }

  function reset() {
    seed = 42;
    wfcMode = true;
    pinned.clear();
    generate({ animate: true });
    bannerTimer = 0;
  }
  reset();

  function update(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (lastRipple) { lastRipple.age += dt; if (lastRipple.age > 0.55) lastRipple = null; }

    if (animCursor < collapseOrder.length) {
      stepCd -= dt;
      if (stepCd <= 0) {
        const batch = 2;
        for (let k = 0; k < batch && animCursor < collapseOrder.length; k++) {
          const st = collapseOrder[animCursor++];
          collapsed[st.idx] = st.tile;
          lastRipple = { c: st.idx % N, r: Math.floor(st.idx / N), age: 0 };
        }
        stepCd = 0.045;
        computeBrokenEdges();
        worldDirty = true;
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const solving = animCursor < collapseOrder.length;

    if (viewProj) {
      if (solving) {
        const cp = projectToScreen(viewProj, 0, 2.2, 0, cssW, cssH);
        if (cp) {
          drawWorldPill(
            ctx, cp.x, cp.y,
            wfcMode
              ? (isPl ? `ZAPADANIE ENTROPII WFC (${animCursor}/${N * N})…` : `WFC COLLAPSING LOWEST ENTROPY (${animCursor}/${N * N})…`)
              : (isPl ? `LOSOWE KAFELKI (${animCursor}/${N * N})…` : `PURE RANDOM TILES (${animCursor}/${N * N})…`),
            wfcMode ? "#34d399" : "#f87171",
            cssW, cssH, isCompact ? 9.5 : 11
          );
        }
      } else if (wfcMode) {
        const cp = projectToScreen(viewProj, 0, 2.1, -1.0, cssW, cssH);
        if (cp) {
          drawWorldPill(ctx, cp.x, cp.y, isPl ? "WFC: 0 BŁĘDNYCH POŁĄCZEŃ ✓" : "WFC SOLVED: 0 BROKEN EDGES ✓", "#34d399", cssW, cssH, isCompact ? 9.5 : 11);
        }
      } else if (brokenEdges.length > 0) {
        // Highlight two vivid broken edges directly in 3D!
        const picks = [brokenEdges[0], brokenEdges[Math.floor(brokenEdges.length * 0.6)]];
        for (const be of picks) {
          if (!be) continue;
          const [x0, z0] = tileToWorld(be.c0, be.r0);
          const [x1, z1] = tileToWorld(be.c1, be.r1);
          const bp = projectToScreen(viewProj, (x0 + x1) * 0.5, 1.35, (z0 + z1) * 0.5, cssW, cssH);
          if (bp) drawWorldPill(ctx, bp.x, bp.y, isPl ? "URWANA KRAWĘDŹ ✗" : "BROKEN EDGE ✗", "#f87171", cssW, cssH, isCompact ? 9 : 10);
        }
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          wfcMode ? `WFC · 0 Broken Edges ✓ (${animCursor}/${N * N})` : `RANDOM · ${brokenEdges.length} Broken Edges ✗`,
          wfcMode ? "#34d399" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 300, panelH = 140, px = cssW - panelW - pad;
        ctx.save();
        ctx.fillStyle = "rgba(8, 18, 28, 0.88)";
        ctx.strokeStyle = wfcMode ? "rgba(16, 185, 129, 0.78)" : "rgba(248, 113, 113, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = wfcMode ? "#34d399" : "#f87171";
        ctx.fillText(wfcMode ? `WAVE FUNCTION COLLAPSE · #${seed}` : `PURE RANDOM TILES · #${seed}`, px + 12, py + 21);
        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = brokenEdges.length === 0 ? "#4ade80" : "#f87171";
        ctx.fillText(
          brokenEdges.length === 0
            ? (isPl ? "✓ 0 KONFLIKTÓW SĄSIEDZTWA" : "✓ 0 BROKEN ADJACENCY EDGES")
            : (isPl ? `✗ ${brokenEdges.length} ZERWANYCH KRAWĘDZI!` : `✗ ${brokenEdges.length} BROKEN EDGES!`),
          px + 12, py + 48
        );
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(isPl ? `Zapadnięte pola: ${animCursor} / ${N * N} · Przypięte: ${pinned.size}` : `Collapsed: ${animCursor} / ${N * N} · Pinned: ${pinned.size}`, px + 12, py + 76);
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? "Kliknij kafelek = wymuś Wioskę / Wodę!" : "Click any tile = Pin Town / Water!", px + 12, py + 100);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "Spacja = Nowa Wyspa · T = WFC / Losowe" : "Space = New Island · T = WFC / Random", px + 12, py + 122);
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
        { id: "new-seed", label: pl ? "Nowa Wyspa [Spacja]" : "New Island [Space]", pressed: false },
        { id: "toggle-wfc", label: wfcMode ? (pl ? "Algorytm: WFC [T]" : "Algo: WFC [T]") : (pl ? "Algorytm: Losowe [T]" : "Algo: Random [T]"), pressed: wfcMode },
        { id: "replay", label: pl ? "Powtórz Zapadanie [V]" : "Replay Collapse [V]", pressed: animCursor < collapseOrder.length },
      ];
    },
    onAction(id) {
      if (id === "new-seed") {
        seed = (seed * 73 + 29) % 997 + 1;
        pinned.clear();
        generate({ animate: true });
        audio?.wallClick?.(true);
      } else if (id === "toggle-wfc") {
        wfcMode = !wfcMode;
        generate({ animate: true });
        audio?.ruleSwitch?.(wfcMode);
        setBanner(wfcMode ? "WFC ON: CONSTRAINT PROPAGATION (0 BROKEN EDGES!)" : "RANDOM TILES: NO RULES — BROKEN ROADS & FLOATING HOUSES!", wfcMode ? "#34d399" : "#f87171", 2.1);
      } else if (id === "replay") {
        generate({ animate: true });
        audio?.wallClick?.(true);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "Space") this.onAction("new-seed");
      else if (code === "KeyT") this.onAction("toggle-wfc");
      else if (code === "KeyV") this.onAction("replay");
    },
    onClickWorld(world, { button } = {}) {
      if (button === 0 && world) {
        const c = Math.floor(world[0] / TILE + N * 0.5);
        const r = Math.floor(world[2] / TILE + N * 0.5);
        if (c >= 0 && c < N && r >= 0 && r < N) {
          const idx = r * N + c;
          const next = collapsed[idx] === 5 ? 0 : 5;
          pinned.set(idx, next);
          generate({ animate: true });
          audio?.wallClick?.(next === 5);
          setBanner(next === 5 ? "PINNED COTTAGE TOWN — RE-PROPAGATING WFC!" : "PINNED OCEAN — RE-PROPAGATING COASTLINE!", "#34d399", 1.6);
          requestHudRefresh?.();
        }
      }
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      if (worldDirty) rebuildWorld();
      const meshes = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = collapsed[r * N + c];
          const [wx, wz] = tileToWorld(c, r);
          if (t === 5) {
            meshes.push({ gpu: cottageGpu, x: wx, y: 0.48, z: wz, yaw: ((c * 3 + r) % 4) * Math.PI * 0.5, scale: 1.02 });
          } else if (t === 2 && ((c * 7 + r * 13) % 3 !== 0)) {
            meshes.push({ gpu: treeGpu, x: wx - 0.22, y: 0.46, z: wz + 0.16, scale: 0.78 });
            if ((c + r) % 2 === 0) meshes.push({ gpu: treeGpu, x: wx + 0.26, y: 0.46, z: wz - 0.18, scale: 0.62 });
          }
        }
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx) {
          // Floating glowing entropy prisms on uncollapsed cells
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              if (collapsed[r * N + c] === -1) {
                const [wx, wz] = tileToWorld(c, r);
                const pulse = 0.35 + 0.15 * Math.sin(time * 5.0 + c + r);
                fx.xrayBox(wx - 0.42, wx + 0.42, 0.24, 0.78 + pulse * 0.25, wz - 0.42, wz + 0.42, [0.22, 0.94, 0.76, 0.62]);
              }
            }
          }
          // Golden propagation ripple on latest collapsed tile
          if (lastRipple) {
            const [rx, rz] = tileToWorld(lastRipple.c, lastRipple.r);
            const u = lastRipple.age / 0.55;
            fx.ringXZ(rx, 0.56, rz, 0.5 + u * 1.9, [1.0, 0.84, 0.22, clamp(1 - u, 0, 1) * 0.90]);
          }
          // Glowing crimson conflict bars on Broken Edges in Pure Random mode!
          for (const be of brokenEdges) {
            const [x0, z0] = tileToWorld(be.c0, be.r0);
            const [x1, z1] = tileToWorld(be.c1, be.r1);
            const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
            if (be.c0 !== be.c1) fx.beam(mx, 0.58, mz - 0.55, mx, 0.58, mz + 0.55, 0.16, [1.0, 0.22, 0.28, 0.95], 0);
            else fx.beam(mx - 0.55, 0.58, mz, mx + 0.55, 0.58, mz, 0.16, [1.0, 0.22, 0.28, 0.95], 0);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return { wfcMode, seed, collapsedCount: animCursor, total: N * N, brokenEdges: brokenEdges.length };
    },
  };
}
