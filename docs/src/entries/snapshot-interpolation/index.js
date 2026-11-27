// Entry #44: Snapshot Interpolation & Jitter Buffer — Playable 3D Netcode Smoothing Visualizer!
// Shows how multiplayer clients turn discrete, jittery 20Hz server packets into silky 60 FPS motion:
// holding a 100ms interpolation buffer glides smoothly between buffered snapshots A -> B even during
// jitter storms, whereas snapping raw packets freezes and teleports violently!
import { clamp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getLagMeshes } from "../../lag-mesh.js";

const TRACK_RX = 5.15;
const TRACK_RZ = 2.95;
const SERVER_TICK_DT = 0.05;   // 20 Hz discrete server snapshots (every 50ms)
const INTERP_BUFFER_SEC = 0.10; // 100ms interpolation buffer
const ANGULAR_SPEED = 1.05;     // rad/s around oval speed-ring

function trackPose(phase) {
  const x = Math.cos(phase) * TRACK_RX;
  const z = Math.sin(phase) * TRACK_RZ;
  const dx = -Math.sin(phase) * TRACK_RX;
  const dz = Math.cos(phase) * TRACK_RZ;
  const yaw = Math.atan2(dx, dz);
  return { x, z, yaw };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.02, 0.05, 0.12],
    skyMid: [0.05, 0.12, 0.22],
    skyBot: [0.10, 0.18, 0.28],
    lightDir: [0.34, 0.88, 0.34],
    ambLow: [0.09, 0.14, 0.22],
    ambHigh: [0.30, 0.44, 0.58],
  });
  const m = getLagMeshes();
  const runnerGpu = studio.uploadMesh(m.runner);

  // Build Oval Glowing Cyber Speed-Ring Track + Central Telemetry Hub
  const wBuf = [];
  // Main ocean-cyber arena deck
  pushBox(wBuf, -7.2, 7.2, -0.50, 0.0, -4.8, 4.8, [0.11, 0.17, 0.27], 0);
  // Perimeter curbs
  pushBox(wBuf, -7.2, 7.2, 0.0, 0.36, -4.8, -4.48, [0.17, 0.24, 0.36], 1);
  pushBox(wBuf, -7.2, 7.2, 0.0, 0.36,  4.48, 4.8, [0.17, 0.24, 0.36], 1);
  pushBox(wBuf, -7.2, -6.88, 0.0, 0.36, -4.48, 4.48, [0.17, 0.24, 0.36], 1);
  pushBox(wBuf,  6.88, 7.2, 0.0, 0.36, -4.48, 4.48, [0.17, 0.24, 0.36], 1);

  // Oval Track Segments (outer & inner neon curb rails + track surface pads)
  const SEGS = 32;
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // Inner glowing ring markers
    const ix = ca * (TRACK_RX - 0.72), iz = sa * (TRACK_RZ - 0.62);
    pushBox(wBuf, ix - 0.22, ix + 0.22, 0.0, 0.07, iz - 0.22, iz + 0.22, [0.14, 0.78, 1.0], 2);
    // Outer glowing ring markers
    const ox = ca * (TRACK_RX + 0.72), oz = sa * (TRACK_RZ + 0.62);
    pushBox(wBuf, ox - 0.24, ox + 0.24, 0.0, 0.09, oz - 0.24, oz + 0.24, [0.16, 0.88, 1.0], 2);
    // Subtle dark speed-pad blocks along the oval
    const tx = ca * TRACK_RX, tz = sa * TRACK_RZ;
    pushBox(wBuf, tx - 0.36, tx + 0.36, 0.0, 0.03, tz - 0.32, tz + 0.32, [0.16, 0.25, 0.38], 0);
  }

  // Central Server Telemetry Hub & Signal Spire
  pushBox(wBuf, -2.1, 2.1, 0.0, 0.42, -1.05, 1.05, [0.18, 0.25, 0.38], 1);
  pushBox(wBuf, -2.14, 2.14, 0.42, 0.49, -1.08, -0.96, [0.18, 0.90, 1.0], 2);
  pushBox(wBuf, -2.14, 2.14, 0.42, 0.49,  0.96,  1.08, [0.18, 0.90, 1.0], 2);
  pushBox(wBuf, -0.42, 0.42, 0.42, 1.65, -0.42, 0.42, [0.22, 0.30, 0.45], 1);
  pushBox(wBuf, -0.48, 0.48, 1.65, 1.84, -0.48, 0.48, [1.0, 0.80, 0.22], 2);

  // Cardinal Cyber Gate Pylons
  for (const [gx, gz] of [[-TRACK_RX - 1.15, 0], [TRACK_RX + 1.15, 0], [0, -TRACK_RZ - 1.05], [0, TRACK_RZ + 1.05]]) {
    pushBox(wBuf, gx - 0.26, gx + 0.26, 0.0, 1.25, gz - 0.26, gz + 0.26, [0.20, 0.27, 0.40], 1);
    pushBox(wBuf, gx - 0.30, gx + 0.30, 1.25, 1.40, gz - 0.30, gz + 0.30, [0.18, 0.90, 1.0], 2);
  }
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.08, pitch: 0.56, dist: 16.0, targetX: 0.0, targetY: 0.45, targetZ: 0.2, fovDeg: 38 };

  let time = 0;
  let interpOn = true;    // ON: 100ms Interp Buffer (60 FPS silky) | OFF: Raw Packet Snap (Teleport Stutter!)
  let showVisuals = true; // [X] Packet Orbs & Server True Ghost
  let stormTimer = 0;     // [V] 5.0s Jitter Storm (±65ms + 20% packet loss!)
  let userInteracted = false;

  // Server true state & deterministic pseudo-random jitter generator
  let rngState = 1337;
  function nextRand() {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 4294967296;
  }

  let serverPhase = 0.2;
  let serverTickAcc = 0;
  let seq = 0;
  let wireQueue = [];      // { seq, serverT, arriveT, x, z, yaw, phase, dropped }
  let snapshotBuffer = []; // arrived snapshots sorted by serverT
  let packetOrbs = [];     // recent arrived snapshots for 3D orb rendering
  let droppedOrbs = [];    // visual crimson markers for dropped packets!

  // Client display state
  const client = { x: TRACK_RX, z: 0, yaw: 0, walkPhase: 0, frozen: false };
  let activePair = null;   // { a, b, u } when interpolating cleanly
  let snapTrail = null;    // { sx, sz, ex, ez, life } red teleport streak when interpOn=false
  let snapFlash = 0;

  // Telemetry & live timeline events
  let packetsReceived = 0;
  let packetsDropped = 0;
  let teleportSnaps = 0;
  let lastJumpDist = 0;
  let packetArrivalEvents = []; // { t, dropped, jitterMs }
  let renderTickEvents = [];    // { t, type: 'smooth'|'frozen'|'snap' }
  let renderLogAcc = 0;

  let bannerText = "";
  let bannerColor = "#38bdf8";
  let bannerTimer = 0;
  function setBanner(t, c = "#38bdf8", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function emitServerSnapshot(simT) {
    seq++;
    const p = trackPose(serverPhase);
    const storm = stormTimer > 0;
    const dropped = storm && nextRand() < 0.20;
    const jitterAmp = storm ? 0.065 : 0.022;
    // Triangular jitter centered around 0
    const jitter = ((nextRand() + nextRand()) - 1.0) * jitterAmp;
    const baseDelay = storm ? 0.055 : 0.026;
    const arriveT = simT + Math.max(0.004, baseDelay + jitter);

    wireQueue.push({
      seq,
      serverT: simT,
      arriveT,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      phase: serverPhase,
      dropped,
      jitterMs: Math.round(jitter * 1000),
    });
  }

  function stepSim(dt) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (stormTimer > 0) stormTimer = Math.max(0, stormTimer - dt);
    if (snapFlash > 0) snapFlash = Math.max(0, snapFlash - dt * 3.8);
    if (snapTrail) {
      snapTrail.life -= dt;
      if (snapTrail.life <= 0) snapTrail = null;
    }

    // Advance Server True Target smoothly along the oval speed-ring
    serverPhase += dt * ANGULAR_SPEED;
    serverTickAcc += dt;
    while (serverTickAcc >= SERVER_TICK_DT) {
      serverTickAcc -= SERVER_TICK_DT;
      emitServerSnapshot(time - serverTickAcc);
    }

    // Deliver matured packets over the jittery wire
    let arrivedThisFrame = false;
    let newestArrived = null;
    for (let i = wireQueue.length - 1; i >= 0; i--) {
      const pkt = wireQueue[i];
      if (pkt.arriveT <= time) {
        wireQueue.splice(i, 1);
        if (pkt.dropped) {
          packetsDropped++;
          droppedOrbs.push({ x: pkt.x, z: pkt.z, life: 1.4, maxLife: 1.4 });
          packetArrivalEvents.push({ t: time, dropped: true, jitterMs: pkt.jitterMs });
          continue;
        }
        packetsReceived++;
        arrivedThisFrame = true;
        if (!newestArrived || pkt.serverT > newestArrived.serverT) newestArrived = pkt;
        snapshotBuffer.push(pkt);
        snapshotBuffer.sort((a, b) => a.serverT - b.serverT);
        if (snapshotBuffer.length > 28) snapshotBuffer.shift();

        packetOrbs.push({ x: pkt.x, z: pkt.z, serverT: pkt.serverT, seq: pkt.seq, age: 0 });
        if (packetOrbs.length > 14) packetOrbs.shift();

        packetArrivalEvents.push({ t: time, dropped: false, jitterMs: pkt.jitterMs });
      }
    }

    // Age orbs & prune old timeline entries (keep 1.5s window)
    for (const o of packetOrbs) o.age += dt;
    for (let i = droppedOrbs.length - 1; i >= 0; i--) {
      droppedOrbs[i].life -= dt;
      if (droppedOrbs[i].life <= 0) droppedOrbs.splice(i, 1);
    }
    const cutoff = time - 1.65;
    while (packetArrivalEvents.length > 0 && packetArrivalEvents[0].t < cutoff) packetArrivalEvents.shift();
    while (renderTickEvents.length > 0 && renderTickEvents[0].t < cutoff) renderTickEvents.shift();

    // Update Client Rendered Target
    const prevX = client.x, prevZ = client.z;
    activePair = null;

    if (interpOn) {
      // === 100ms INTERPOLATION BUFFER ON ===
      const renderT = time - INTERP_BUFFER_SEC;
      let a = null, b = null;
      for (let i = 0; i < snapshotBuffer.length - 1; i++) {
        if (snapshotBuffer[i].serverT <= renderT && snapshotBuffer[i + 1].serverT >= renderT) {
          a = snapshotBuffer[i];
          b = snapshotBuffer[i + 1];
          break;
        }
      }
      if (a && b) {
        const span = Math.max(0.0001, b.serverT - a.serverT);
        const u = clamp((renderT - a.serverT) / span, 0, 1);
        client.x = a.x + (b.x - a.x) * u;
        client.z = a.z + (b.z - a.z) * u;
        client.yaw = lerpAngle(a.yaw, b.yaw, u);
        client.walkPhase += dt * 13.5;
        client.frozen = false;
        activePair = { a, b, u };
      } else if (snapshotBuffer.length > 0) {
        const latest = snapshotBuffer[snapshotBuffer.length - 1];
        client.x += (latest.x - client.x) * clamp(dt * 12, 0, 1);
        client.z += (latest.z - client.z) * clamp(dt * 12, 0, 1);
        client.yaw = lerpAngle(client.yaw, latest.yaw, clamp(dt * 12, 0, 1));
        client.walkPhase += dt * 11.0;
        client.frozen = false;
      }
      lastJumpDist = Math.hypot(client.x - prevX, client.z - prevZ);
    } else {
      // === RAW PACKET SNAP OFF (Teleport Stutter!) ===
      if (arrivedThisFrame && newestArrived) {
        const jump = Math.hypot(newestArrived.x - prevX, newestArrived.z - prevZ);
        if (jump > 0.14) {
          teleportSnaps++;
          lastJumpDist = jump;
          snapFlash = 1.0;
          snapTrail = { sx: prevX, sz: prevZ, ex: newestArrived.x, ez: newestArrived.z, life: 0.34, maxLife: 0.34 };
          if (userInteracted && jump > 0.35) audio?.inputIgnored?.();
        }
        client.x = newestArrived.x;
        client.z = newestArrived.z;
        client.yaw = newestArrived.yaw;
        client.walkPhase += 0.9;
        client.frozen = false;
      } else {
        // Visually frozen between arriving packets!
        client.frozen = true;
        lastJumpDist = 0;
      }
    }

    // Record evenly sampled client render tick telemetry for the Packet Arrival Timeline
    renderLogAcc += dt;
    if (renderLogAcc >= 0.018) {
      renderLogAcc = 0;
      let type = "smooth";
      if (!interpOn) type = arrivedThisFrame ? "snap" : "frozen";
      renderTickEvents.push({ t: time, type });
    }
  }

  function reset() {
    time = 0;
    stormTimer = 0;
    rngState = 1337;
    serverPhase = 0.25;
    serverTickAcc = 0;
    seq = 0;
    wireQueue = [];
    snapshotBuffer = [];
    packetOrbs = [];
    droppedOrbs = [];
    packetArrivalEvents = [];
    renderTickEvents = [];
    packetsReceived = 0;
    packetsDropped = 0;
    teleportSnaps = 0;
    lastJumpDist = 0;
    activePair = null;
    snapTrail = null;
    snapFlash = 0;
    bannerTimer = 0;

    const p0 = trackPose(serverPhase);
    client.x = p0.x; client.z = p0.z; client.yaw = p0.yaw; client.walkPhase = 0; client.frozen = false;

    // Pre-warm 0.65s so Frame 1 already shows a vibrant trail of 20Hz packet orbs + smooth A->B glide + timeline!
    for (let i = 0; i < 40; i++) stepSim(0.016);
    teleportSnaps = 0;
    packetsDropped = 0;
    snapFlash = 0;
    snapTrail = null;
  }
  reset();

  function drawTimeline(ctx, px, py, bw, bh, isPl) {
    ctx.fillStyle = "rgba(7, 13, 28, 0.94)";
    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, py, bw, bh, 5); ctx.fill(); ctx.stroke();

    const windowSec = 1.45;
    const x0 = px + 6;
    const w = bw - 12;

    // Top Lane: Irregular 20Hz Arriving Packets
    const topY = py + 15;
    const laneH = 18;
    ctx.fillStyle = "rgba(30, 41, 59, 0.55)";
    ctx.fillRect(x0, topY, w, laneH);

    for (const ev of packetArrivalEvents) {
      const u = 1 - (time - ev.t) / windowSec;
      if (u < 0 || u > 1) continue;
      const ex = x0 + u * w;
      if (ev.dropped) {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(ex - 1.5, topY + 2, 3, laneH - 4);
      } else {
        ctx.fillStyle = stormTimer > 0 ? "#fb923c" : "#facc15";
        ctx.fillRect(ex - 1.2, topY + 2, 2.5, laneH - 4);
      }
    }

    // Bottom Lane: Client Render Ticks (60Hz green vs red stutter snaps!)
    const botY = py + 43;
    ctx.fillStyle = "rgba(30, 41, 59, 0.55)";
    ctx.fillRect(x0, botY, w, laneH);

    for (const ev of renderTickEvents) {
      const u = 1 - (time - ev.t) / windowSec;
      if (u < 0 || u > 1) continue;
      const ex = x0 + u * w;
      if (ev.type === "smooth") {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(ex - 1, botY + 3, 2, laneH - 6);
      } else if (ev.type === "snap") {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(ex - 1.8, botY + 1, 3.6, laneH - 2);
      } else {
        ctx.fillStyle = "rgba(248, 113, 113, 0.22)";
        ctx.fillRect(ex - 1, botY + laneH - 4, 2, 3);
      }
    }

    ctx.font = "700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = stormTimer > 0 ? "#fb923c" : "#fde047";
    ctx.fillText(
      isPl
        ? `PAKIETY 20Hz (${stormTimer > 0 ? "BURZA ±65ms + 20% STRAT!" : "JITTER ±22ms"})`
        : `20Hz PACKET ARRIVALS (${stormTimer > 0 ? "STORM ±65ms + 20% LOSS!" : "JITTER ±22ms"})`,
      x0, py + 11, w
    );
    ctx.fillStyle = interpOn ? "#4ade80" : "#f87171";
    ctx.fillText(
      interpOn
        ? (isPl ? "KLIENT 60 FPS (RÓWNA INTERPOLACJA A→B ✓)" : "CLIENT 60 FPS TICKS (EVEN INTERP A→B ✓)")
        : (isPl ? "KLIENT RAW SNAP (ZACIĘCIA + TELEPORTY! ✗)" : "CLIENT RAW SNAP (FREEZE + TELEPORT STUTTER! ✗)"),
      x0, py + 40, w
    );
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;
    const noHud = document.body.classList.contains("no-hud");
    const srv = trackPose(serverPhase);

    if (viewProj) {
      // Client Rendered Target pill
      const cp = projectToScreen(viewProj, client.x, 2.05, client.z, cssW, cssH);
      if (cp) {
        const safeX = (!isCompact && !noHud && cp.y < 260) ? Math.min(cp.x, cssW - 415) : cp.x;
        const txt = interpOn
          ? (isPl ? "PŁYNNE 60 FPS · BUFOR 100ms ✓" : "SILKY 60 FPS · 100ms BUFFER ✓")
          : (isPl ? "TELEPORT STUTTER! (RAW SNAP) ✗" : "TELEPORT STUTTER! ✗");
        drawWorldPill(ctx, safeX, cp.y, txt, interpOn ? "#4ade80" : "#f87171", cssW, cssH, isCompact ? 8.5 : 10);
      }

      // Server True Ghost pill
      if (showVisuals) {
        const sp = projectToScreen(viewProj, srv.x, 2.05, srv.z, cssW, cssH);
        if (sp) {
          const dy = cp && Math.abs(sp.x - cp.x) < 165 && Math.abs(sp.y - cp.y) < 34 ? -28 : 0;
          const safeX = (!isCompact && !noHud && sp.y + dy < 260) ? Math.min(sp.x, cssW - 415) : sp.x;
          drawWorldPill(ctx, safeX, sp.y + dy, isPl ? "SERWER (PRAWDA · +100ms)" : "SERVER TRUE (+100ms AHEAD)", "#facc15", cssW, cssH, isCompact ? 8.5 : 9.5);
        }
      }

      // Center Hub Storm callout
      if (stormTimer > 0.1) {
        const hp = projectToScreen(viewProj, 0, 2.25, 0, cssW, cssH);
        if (hp) {
          drawWorldPill(
            ctx, hp.x, hp.y,
            isPl ? `BURZA JITTERA! ±65ms · 20% STRAT (${stormTimer.toFixed(1)}s)` : `JITTER STORM! ±65ms · 20% LOSS (${stormTimer.toFixed(1)}s)`,
            "#fb923c", cssW, cssH, isCompact ? 9 : 10
          );
        }
      }
    }

    if (!noHud) {
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${interpOn ? "INTERP: 100ms · 60 FPS ✓" : `RAW SNAP: ${teleportSnaps} TELEPORTS! ✗`}${stormTimer > 0 ? " · STORM!" : ""}`,
          interpOn ? "#38bdf8" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 336, panelH = 208, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(8, 15, 30, 0.90)";
        ctx.strokeStyle = stormTimer > 0 ? "rgba(251, 146, 60, 0.88)" : (interpOn ? "rgba(56, 189, 248, 0.82)" : "rgba(248, 113, 113, 0.85)");
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = interpOn ? "#38bdf8" : "#f87171";
        ctx.fillText(
          interpOn
            ? (isPl ? "INTERPOLACJA SNAPSHOTÓW · BUFOR 100ms" : "SNAPSHOT INTERPOLATION · 100ms BUFFER")
            : (isPl ? "SUROWY SNAP PAKIETÓW · 0ms BUFORA!" : "RAW PACKET SNAP · 0ms BUFFER!"),
          px + 12, py + 20, bw
        );

        // Live Packet Arrival vs Client Tick Timeline!
        drawTimeline(ctx, px + 12, py + 30, bw, 66, isPl);

        // Buffer / Jitter Status Bar
        ctx.fillStyle = "rgba(24, 36, 58, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 104, bw, 16, 4); ctx.fill();
        ctx.fillStyle = stormTimer > 0 ? "#f97316" : (interpOn ? "#22c55e" : "#ef4444");
        const fillW = stormTimer > 0 ? Math.max(16, (stormTimer / 5.0) * bw) : (interpOn ? bw * 0.68 : 16);
        ctx.beginPath(); ctx.roundRect(px + 12, py + 104, fillW, 16, 4); ctx.fill();
        ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          stormTimer > 0
            ? (isPl ? `BURZA JITTERA: ±65ms + 20% STRAT (${stormTimer.toFixed(1)}s)` : `JITTER STORM ACTIVE: ±65ms + 20% LOSS (${stormTimer.toFixed(1)}s)`)
            : (interpOn ? `BUFFER DELAY: 100ms (2 × 50ms TICKS) · SMOOTH ✓` : `BUFFER DELAY: 0ms (SNAP ON ARRIVAL) · STUTTER ✗`),
          px + 18, py + 115.5, bw - 12
        );

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(
          isPl
            ? `Pakiety 20Hz: ${packetsReceived} · Utracone: ${packetsDropped}`
            : `20Hz Packets: ${packetsReceived} · Dropped: ${packetsDropped}`,
          px + 12, py + 141, bw
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(
          isPl
            ? `Skoki teleportu: ${teleportSnaps} · Bufor: ${snapshotBuffer.length} snap.`
            : `Teleport Snaps: ${teleportSnaps} · Buffered: ${snapshotBuffer.length} snaps`,
          px + 12, py + 162, bw
        );
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(
          isPl
            ? "T = Bufor 100ms · V = Burza Jittera · X = Kule/Duch"
            : "T = 100ms Buffer · V = Jitter Storm · X = Orbs/Ghost",
          px + 12, py + 187, bw
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
          id: "toggle-interp",
          label: interpOn
            ? (pl ? "Bufor 100ms: WŁ [T]" : "100ms Buffer: ON [T]")
            : (pl ? "Surowy Snap: WYŁ [T]" : "Raw Snap (Stutter!) [T]"),
          pressed: interpOn,
        },
        {
          id: "jitter-storm",
          label: stormTimer > 0
            ? (pl ? `Burza Jittera (${stormTimer.toFixed(1)}s) [V]` : `Jitter Storm (${stormTimer.toFixed(1)}s) [V]`)
            : (pl ? "Burza Jittera (5s) [V]" : "Jitter Storm (5s) [V]"),
          pressed: stormTimer > 0,
        },
        {
          id: "toggle-visuals",
          label: showVisuals
            ? (pl ? "Pakiety i Duch: WŁ [X]" : "Orbs & Ghost: ON [X]")
            : (pl ? "Pakiety i Duch: WYŁ [X]" : "Orbs & Ghost: OFF [X]"),
          pressed: showVisuals,
        },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-interp") {
        interpOn = !interpOn;
        audio?.ruleSwitch?.(interpOn);
        setBanner(
          interpOn
            ? "100ms INTERP BUFFER ON: GLIDING SMOOTHLY AT 60 FPS BETWEEN SNAPSHOTS A → B!"
            : "RAW PACKET SNAP: CLIENT FREEZES BETWEEN 20Hz PACKETS & TELEPORTS!",
          interpOn ? "#4ade80" : "#f87171",
          2.1
        );
      } else if (id === "jitter-storm") {
        stormTimer = 5.0;
        audio?.sandDash?.();
        setBanner(
          interpOn
            ? "JITTER STORM (±65ms + 20% LOSS): 100ms BUFFER ABSORBS IT SMOOTHLY ✓"
            : "JITTER STORM (±65ms + 20% LOSS): WATCH RAW SNAP TELEPORT CHAOS! ✗",
          "#fb923c",
          2.2
        );
      } else if (id === "toggle-visuals") {
        showVisuals = !showVisuals;
        audio?.wallClick?.(showVisuals);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-interp");
      else if (code === "KeyV") this.onAction("jitter-storm");
      else if (code === "KeyX") this.onAction("toggle-visuals");
    },
    onClickWorld(wPos, { button } = {}) {
      if (button === 0 && wPos) {
        this.onAction("jitter-storm");
      }
    },
    update: stepSim,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const srv = trackPose(serverPhase);
      const clientTint = !interpOn && snapFlash > 0.12
        ? [1.0, 0.28, 0.34, 0.72]
        : (interpOn ? [0.16, 0.94, 1.0, 0.52] : [0.98, 0.44, 0.30, 0.52]);

      const meshes = [
        // Solid bright cyan Client Rendered Target
        {
          gpu: runnerGpu, x: client.x, y: 0.03, z: client.z,
          yaw: client.yaw, animMode: 2, animA: client.walkPhase, animB: client.frozen ? 0.0 : 1.05,
          scale: 1.12, tint: clientTint,
        },
      ];

      // Subtle translucent gold Server True Target (alpha: 0.32)
      if (showVisuals) {
        meshes.push({
          gpu: runnerGpu, x: srv.x, y: 0.03, z: srv.z,
          yaw: srv.yaw, animMode: 2, animA: time * 13.5, animB: 1.05,
          scale: 1.12, alpha: 0.32, tint: [1.0, 0.82, 0.18, 0.90],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Ground ring under Client & Server
          fx.ringXZ(client.x, 0.08, client.z, 0.72, interpOn ? [0.20, 0.96, 0.62, 0.88] : [1.0, 0.30, 0.36, 0.90]);

          if (showVisuals) {
            fx.ringXZ(srv.x, 0.08, srv.z, 0.74, [1.0, 0.82, 0.18, 0.78]);
            // Dashed link from Server True to Client Rendered showing the 100ms playback buffer offset
            fx.beam(srv.x, 0.92, srv.z, client.x, 0.92, client.z, 0.09, [1.0, 0.82, 0.18, 0.58], 4);

            // Floating glowing 20Hz Snapshot Packet Orbs!
            for (let i = 0; i < packetOrbs.length; i++) {
              const o = packetOrbs[i];
              const fade = clamp(1 - o.age / 1.35, 0.15, 1.0);
              const isEndpoint = activePair && (o.seq === activePair.a.seq || o.seq === activePair.b.seq);
              const col = isEndpoint
                ? [0.22, 1.0, 0.62, 0.95]
                : (stormTimer > 0 ? [1.0, 0.60, 0.22, fade * 0.85] : [0.24, 0.90, 1.0, fade * 0.82]);
              fx.ringXZ(o.x, 0.07, o.z, isEndpoint ? 0.44 : 0.28, col);
              fx.billboard(o.x, 0.68, o.z, isEndpoint ? 0.24 : 0.16, basis.right, basis.up, col, 2);
              if (i > 0) {
                const prev = packetOrbs[i - 1];
                fx.beam(prev.x, 0.68, prev.z, o.x, 0.68, o.z, 0.06, [0.24, 0.86, 1.0, fade * 0.40], 4);
              }
            }

            // Active A -> B interpolation chord in bright emerald!
            if (interpOn && activePair) {
              fx.beam(activePair.a.x, 0.72, activePair.a.z, activePair.b.x, 0.72, activePair.b.z, 0.16, [0.22, 1.0, 0.58, 0.92], 0);
            }

            // Dropped packet crimson bursts during Jitter Storm!
            for (const d of droppedOrbs) {
              const a = clamp(d.life / d.maxLife, 0, 1);
              fx.ringXZ(d.x, 0.10, d.z, 0.35 + (1 - a) * 0.55, [1.0, 0.22, 0.28, a * 0.90]);
              fx.billboard(d.x, 0.85, d.z, 0.24 * a, basis.right, basis.up, [1.0, 0.22, 0.28, a * 0.95], 2);
            }
          }

          // Crimson teleport snap streak in Raw Snap OFF mode!
          if (!interpOn && snapTrail) {
            const a = clamp(snapTrail.life / snapTrail.maxLife, 0, 1);
            fx.beam(snapTrail.sx, 0.78, snapTrail.sz, snapTrail.ex, 0.78, snapTrail.ez, 0.20, [1.0, 0.24, 0.30, a * 0.95], 0);
          }

          // Server hub radar pulse ring
          const pulse = (time * 1.4) % 1;
          fx.ringXZ(0, 1.86, 0, 0.4 + pulse * 2.4, [stormTimer > 0 ? 1.0 : 0.22, stormTimer > 0 ? 0.50 : 0.90, stormTimer > 0 ? 0.18 : 1.0, (1 - pulse) * 0.55]);
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        interpOn,
        stormActive: stormTimer > 0,
        stormTimer: +stormTimer.toFixed(2),
        showVisuals,
        bufferMs: interpOn ? 100 : 0,
        bufferedSnapshots: snapshotBuffer.length,
        packetsReceived,
        packetsDropped,
        teleportSnaps,
        lastJumpDist: +lastJumpDist.toFixed(2),
      };
    },
  };
}
