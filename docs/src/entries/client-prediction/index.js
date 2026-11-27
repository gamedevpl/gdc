// Entry #24: Client-Side Prediction & Reconciliation — Playable 3D Multiplayer Netcode Track!
// Shows why online movement feels instant (0ms) even at 200ms ping: Client predicts locally while buffering
// inputs — then reconciles & replays if the Authoritative Server rejects a move (rubber-band snap)!
import { clamp, lerp } from "../../gl-utils.js";
import { createStudioRenderer, pushBox, projectToScreen, drawWorldPill, drawBanner, drawMobilePill } from "../../studio-gl.js";
import { getSkiffMeshes } from "../../skiff-mesh.js";

const TRACK_X = 6.8;
const TRACK_Z = 4.4;
const PING_OPTIONS = [200, 320, 100];

export function createEntry(gl, { requestHudRefresh, audio } = {}) {
  const studio = createStudioRenderer(gl, {
    skyTop: [0.015, 0.032, 0.075],
    skyMid: [0.038, 0.072, 0.145],
    skyBot: [0.068, 0.105, 0.185],
    lightDir: [0.34, 0.88, 0.34],
  });
  const m = getSkiffMeshes();
  const skiffGpu = studio.uploadMesh(m.skiff);

  // Build Cyber Hover-Slalom Track with Neon Gate Checkpoints
  const wBuf = [];
  pushBox(wBuf, -TRACK_X - 0.4, TRACK_X + 0.4, -0.45, 0.0, -TRACK_Z - 0.4, TRACK_Z + 0.4, [0.16, 0.20, 0.30], 0);
  // Perimeter walls
  pushBox(wBuf, -TRACK_X - 0.4, TRACK_X + 0.4, 0.0, 0.45, -TRACK_Z - 0.4, -TRACK_Z, [0.22, 0.28, 0.40], 1);
  pushBox(wBuf, -TRACK_X - 0.4, TRACK_X + 0.4, 0.0, 0.45, TRACK_Z, TRACK_Z + 0.4, [0.22, 0.28, 0.40], 1);
  pushBox(wBuf, -TRACK_X - 0.4, -TRACK_X, 0.0, 0.45, -TRACK_Z, TRACK_Z, [0.22, 0.28, 0.40], 1);
  pushBox(wBuf, TRACK_X, TRACK_X + 0.4, 0.0, 0.45, -TRACK_Z, TRACK_Z, [0.22, 0.28, 0.40], 1);
  // Two neon slalom pylons along the center lane
  for (const px of [-2.8, 2.8]) {
    pushBox(wBuf, px - 0.35, px + 0.35, 0.0, 1.45, -0.35, 0.35, [0.26, 0.32, 0.44], 1);
    pushBox(wBuf, px - 0.40, px + 0.40, 1.45, 1.62, -0.40, 0.40, [0.14, 0.90, 1.0], 2);
  }
  // Start / Track racing strips
  pushBox(wBuf, -TRACK_X + 0.2, TRACK_X - 0.2, 0.0, 0.03, -2.25, -2.10, [0.16, 0.86, 1.0], 2);
  pushBox(wBuf, -TRACK_X + 0.2, TRACK_X - 0.2, 0.0, 0.03,  2.10,  2.25, [0.16, 0.86, 1.0], 2);
  studio.setWorldData(wBuf);

  const defaultCam = { yaw: 0.0, pitch: 0.84, dist: 16.5, targetX: 0.0, targetY: 0.35, targetZ: 0.1, fovDeg: 40 };

  let time = 0;
  let predictOn = true; // ON: Instant 0ms Local Prediction + Input Buffer | OFF: Wait 200ms for Server!
  let pingIdx = 0;
  let pingMs = PING_OPTIONS[pingIdx];
  let autoPilot = true;
  let userInteracted = false;

  // Authoritative Server state & Client display state
  const server = { x: -3.2, z: 2.0, yaw: Math.PI * 0.5 };
  const client = { x: -3.2, z: 2.0, yaw: Math.PI * 0.5 };
  const intended = { x: -3.2, z: 2.0, yaw: Math.PI * 0.5 }; // Where player's raw keys want to be RIGHT NOW!

  // Ring buffer of in-flight input packets { seq, sendT, deliverT, dx, dz, predX, predZ }
  let seq = 0;
  let packetQueue = [];
  let reconCount = 0;
  let snapFlash = 0;
  let snapFrom = null;

  let bannerText = "";
  let bannerColor = "#38bdf8";
  let bannerTimer = 0;
  function setBanner(t, c = "#38bdf8", dur = 2.0) { bannerText = t; bannerColor = c; bannerTimer = dur; }

  function stepEntity(ent, dx, dz) {
    const nx = clamp(ent.x + dx, -TRACK_X + 0.7, TRACK_X - 0.7);
    const nz = clamp(ent.z + dz, -TRACK_Z + 0.7, TRACK_Z - 0.7);
    // Avoid slalom pylons smoothly
    let fx = nx, fz = nz;
    for (const px of [-2.8, 2.8]) {
      const rx = fx - px, rz = fz;
      const d = Math.hypot(rx, rz);
      if (d < 0.95 && d > 0.001) {
        fx = px + (rx / d) * 0.95;
        fz = (rz / d) * 0.95;
      }
    }
    ent.x = fx; ent.z = fz;
    if (Math.hypot(dx, dz) > 0.002) ent.yaw = Math.atan2(dx, dz);
  }

  function reset() {
    time = 0; seq = 0; reconCount = 0; snapFlash = 0; snapFrom = null;
    autoPilot = true;
    server.x = -3.8; server.z = 1.8; server.yaw = Math.PI * 0.5;
    client.x = -3.8; client.z = 1.8; client.yaw = Math.PI * 0.5;
    intended.x = -3.8; intended.z = 1.8; intended.yaw = Math.PI * 0.5;
    packetQueue = [];
    bannerTimer = 0;
  }
  reset();

  function triggerDesyncBump({ silent = false } = {}) {
    // Authoritative Server unexpectedly knocks the skiff sideways (e.g. explosion/bump the client didn't know yet!)
    // Client detects mismatch, snaps to server state, then REPLAYS all unacked buffered inputs!
    snapFrom = { x: client.x, z: client.z };
    server.x = clamp(server.x - Math.sin(server.yaw) * 1.9, -TRACK_X + 1.0, TRACK_X - 1.0);
    server.z = clamp(server.z - Math.cos(server.yaw) * 1.4, -TRACK_Z + 1.0, TRACK_Z - 1.0);

    // Reconciliation: reset Client to new Authoritative Server position and REPLAY every unacknowledged packet!
    const tmp = { x: server.x, z: server.z, yaw: server.yaw };
    for (const pkt of packetQueue) {
      stepEntity(tmp, pkt.dx, pkt.dz);
      pkt.predX = tmp.x; pkt.predZ = tmp.z;
    }
    client.x = tmp.x; client.z = tmp.z; client.yaw = tmp.yaw;
    intended.x = client.x; intended.z = client.z;
    reconCount++;
    snapFlash = 1.0;
    if (!silent) audio?.coyoteSave?.();
    if (!silent) setBanner(`DESYNC! SERVER RECONCILED + REPLAYED ${packetQueue.length} BUFFERED INPUTS ✓`, "#facc15", 2.1);
  }

  function update(dt, keys) {
    time += dt;
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (snapFlash > 0) snapFlash = Math.max(0, snapFlash - dt * 1.1);

    let mx = 0, mz = 0;
    if (keys?.has("KeyA") || keys?.has("ArrowLeft")) mx -= 1;
    if (keys?.has("KeyD") || keys?.has("ArrowRight")) mx += 1;
    if (keys?.has("KeyW") || keys?.has("ArrowUp")) mz -= 1;
    if (keys?.has("KeyS") || keys?.has("ArrowDown")) mz += 1;

    const speed = 5.4;
    if (mx !== 0 || mz !== 0) {
      autoPilot = false; userInteracted = true;
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
    } else if (autoPilot) {
      // Smooth Figure-8 Slalom around the 2 Neon Pylons so drift & lag stay visually dramatic every second!
      const t = time * 0.92;
      const gx = Math.sin(t) * 5.2;
      const gz = Math.sin(t * 2.0) * 2.55;
      const dx = gx - intended.x, dz = gz - intended.z;
      const l = Math.hypot(dx, dz) || 1;
      mx = dx / l; mz = dz / l;
    }

    const stepX = mx * speed * dt;
    const stepZ = mz * speed * dt;
    stepEntity(intended, stepX, stepZ);

    // Enqueue input packet delayed by RTT/ping
    const delaySec = pingMs / 1000;
    seq++;
    if (predictOn) {
      // CLIENT-SIDE PREDICTION ON: apply input IMMEDIATELY on Frame 0!
      stepEntity(client, stepX, stepZ);
    }
    packetQueue.push({
      seq, sendT: time, deliverT: time + delaySec,
      dx: stepX, dz: stepZ,
      predX: intended.x, predZ: intended.z,
    });

    // Deliver matured packets to Authoritative Server!
    while (packetQueue.length > 0 && packetQueue[0].deliverT <= time) {
      const pkt = packetQueue.shift();
      stepEntity(server, pkt.dx, pkt.dz);
      if (!predictOn) {
        // NAIVE SERVER-WAIT OFF: Client only moves AFTER waiting the full 200ms round-trip!
        client.x = server.x;
        client.z = server.z;
        client.yaw = server.yaw;
      }
    }
  }

  function drawOverlay(ctx, cssW, cssH, viewProj, lang) {
    ctx.clearRect(0, 0, cssW, cssH);
    const isPl = lang === "pl";
    const isCompact = cssW < 640;

    if (viewProj) {
      // Label 1: Client Skiff
      const cp = projectToScreen(viewProj, client.x, 1.55, client.z, cssW, cssH);
      if (cp) {
        const safeCx = (!isCompact && !document.body.classList.contains("no-hud") && cp.y < 230) ? Math.min(cp.x, cssW - 410) : cp.x;
        const txt = predictOn
          ? (isPl ? "KLIENT: PREDYKCJA 0ms ✓" : "CLIENT: 0ms PREDICTION ✓")
          : (isPl ? `KLIENT OPÓŹNIONY -${pingMs}ms! ✗` : `CLIENT LAGGING -${pingMs}ms! ✗`);
        drawWorldPill(ctx, safeCx, cp.y, txt, predictOn ? "#4ade80" : "#f87171", cssW, cssH, isCompact ? 9 : 10);
      }

      // Label 2: Server Ghost (when Prediction ON) OR Raw Unapplied Input Ghost (when Prediction OFF!)
      if (predictOn) {
        const sp = projectToScreen(viewProj, server.x, 1.55, server.z, cssW, cssH);
        if (sp) {
          const dy = cp && Math.abs(sp.x - cp.x) < 150 && Math.abs(sp.y - cp.y) < 30 ? 28 : 0;
          drawWorldPill(ctx, sp.x, sp.y + dy, isPl ? `SERWER (-${pingMs}ms · GONI)` : `SERVER (-${pingMs}ms · CATCHING UP)`, "#38bdf8", cssW, cssH, isCompact ? 9 : 9.5);
        }
      } else {
        const ip = projectToScreen(viewProj, intended.x, 1.55, intended.z, cssW, cssH);
        if (ip) {
          const dy = cp && Math.abs(ip.x - cp.x) < 150 && Math.abs(ip.y - cp.y) < 30 ? -28 : 0;
          drawWorldPill(ctx, ip.x, ip.y + dy, isPl ? "TWÓJ KLAWISZ (CZEKA NA SERWER!)" : "YOUR INPUT (WAITING ON SERVER!)", "#fbbf24", cssW, cssH, isCompact ? 9 : 9.5);
        }
      }

      if (snapFlash > 0.15 && snapFrom) {
        const rp = projectToScreen(viewProj, (snapFrom.x + client.x) * 0.5, 1.2, (snapFrom.z + client.z) * 0.5, cssW, cssH);
        if (rp) drawWorldPill(ctx, rp.x, rp.y - 26, isPl ? "REKONCYLIAJCA + REPLAY BUFORA ✓" : "RECONCILED + INPUT REPLAY ✓", "#facc15", cssW, cssH, isCompact ? 9 : 10);
      }
    }

    if (!document.body.classList.contains("no-hud")) {
      const feelLag = predictOn ? 0 : pingMs;
      const driftM = Math.hypot(client.x - server.x, client.z - server.z);
      if (isCompact) {
        drawMobilePill(
          ctx,
          `${predictOn ? "PREDICT: 0ms FEEL" : `NO PREDICT: ${pingMs}ms LAG`} · Q:${packetQueue.length}`,
          predictOn ? "#38bdf8" : "#f87171",
          cssW
        );
      } else {
        const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
        const py = Math.max(54, Math.round(hdrBottom) + 6);
        const pad = 14, panelW = 326, panelH = 158, px = cssW - panelW - pad;
        const bw = panelW - 24;
        ctx.save();
        ctx.fillStyle = "rgba(10, 14, 28, 0.88)";
        ctx.strokeStyle = predictOn ? "rgba(56, 189, 248, 0.82)" : "rgba(248, 113, 113, 0.84)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();

        ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = predictOn ? "#38bdf8" : "#f87171";
        ctx.fillText(predictOn ? `CLIENT PREDICTION · 0ms INPUT FEEL` : `NO PREDICTION · ${pingMs}ms INPUT FREEZE!`, px + 12, py + 21, bw);

        ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, bw, 16, 4); ctx.fill();
        ctx.fillStyle = predictOn ? "#22c55e" : "#ef4444";
        ctx.beginPath(); ctx.roundRect(px + 12, py + 34, predictOn ? 18 : bw, 16, 4); ctx.fill();
        ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`PERCEIVED INPUT LAG: ${feelLag} ms  (PING: ${pingMs} ms)`, px + 18, py + 45.5, bw - 12);

        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#fde047";
        ctx.fillText(isPl ? `Bufor pakietów w locie: ${packetQueue.length} · Reconcile: ${reconCount}` : `Unacked Input Buffer: ${packetQueue.length} · Reconciles: ${reconCount}`, px + 12, py + 76, bw);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(isPl ? `Dystans Klient ↔ Serwer: ${driftM.toFixed(2)} m` : `Client ↔ Server Drift: ${driftM.toFixed(2)} m`, px + 12, py + 98, bw);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText(isPl ? "V = Wstrzyknij Desync (Snap+Replay!)" : "V = Inject Desync Bump (Snap+Replay!)", px + 12, py + 122, bw);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(isPl ? "WASD = Steruj · T = Predykcja · X = Ping" : "WASD = Steer · T = Predict · X = Ping ms", px + 12, py + 144, bw);
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
        { id: "toggle-pred", label: predictOn ? (pl ? "Predykcja 0ms: WŁ [T]" : "Prediction 0ms: ON [T]") : (pl ? "Czekaj na Serwer [T]" : "Server-Wait Lag [T]"), pressed: predictOn },
        { id: "desync", label: pl ? "Test Desync [V]" : "Inject Desync [V]", pressed: snapFlash > 0.2 },
        { id: "ping", label: `Ping: ${pingMs}ms [X]`, pressed: pingMs >= 200 },
      ];
    },
    onAction(id) {
      userInteracted = true;
      if (id === "toggle-pred") {
        predictOn = !predictOn;
        audio?.ruleSwitch?.(predictOn);
        setBanner(
          predictOn
            ? "PREDICTION ON: INSTANT 0ms RESPONSE WHILE SERVER CATCHES UP!"
            : `PREDICTION OFF: SHIP FREEZES ${pingMs}ms WAITING FOR SERVER ACK!`,
          predictOn ? "#38bdf8" : "#f87171",
          2.0
        );
      } else if (id === "desync") {
        triggerDesyncBump({ silent: false });
      } else if (id === "ping") {
        pingIdx = (pingIdx + 1) % PING_OPTIONS.length;
        pingMs = PING_OPTIONS[pingIdx];
        audio?.ruleSwitch?.(true);
      }
      requestHudRefresh?.();
    },
    onKeyDown(code, repeat) {
      if (repeat) return;
      if (code === "KeyT") this.onAction("toggle-pred");
      else if (code === "KeyV") this.onAction("desync");
      else if (code === "KeyX") this.onAction("ping");
    },
    update,
    render(w, h, cam, ovCtx, cssW, cssH, lang) {
      const meshes = [
        // Solid Client Skiff (what the Player controls on screen!)
        {
          gpu: skiffGpu, x: client.x, y: 0.14, z: client.z, yaw: client.yaw, scale: 1.15, animMode: 0,
          tint: snapFlash > 0.15 ? [1.0, 0.84, 0.16, snapFlash * 0.7] : (predictOn ? [1, 1, 1, 0] : [1.0, 0.28, 0.34, 0.45]),
        },
      ];
      if (predictOn) {
        // Translucent Cyan Ghost = Authoritative Server trailing behind!
        meshes.push({
          gpu: skiffGpu, x: server.x, y: 0.14, z: server.z, yaw: server.yaw, scale: 1.15, animMode: 0,
          alpha: 0.44, tint: [0.14, 0.90, 1.0, 0.88],
        });
      } else {
        // Translucent Amber Ghost = Where your raw inputs WANTED to go 200ms ago!
        meshes.push({
          gpu: skiffGpu, x: intended.x, y: 0.14, z: intended.z, yaw: intended.yaw, scale: 1.15, animMode: 0,
          alpha: 0.42, tint: [1.0, 0.76, 0.16, 0.88],
        });
      }

      const { viewProj } = studio.drawFrame(w, h, cam, {
        time,
        meshes,
        buildFx(fx, basis) {
          // Breadcrumb trail of buffered unacknowledged packets in flight!
          const step = Math.max(1, Math.floor(packetQueue.length / 8));
          for (let i = 0; i < packetQueue.length; i += step) {
            const p = packetQueue[i];
            fx.billboard(p.predX, 0.42, p.predZ, 0.14, basis.right, basis.up, predictOn ? [0.22, 0.96, 1.0, 0.75] : [1.0, 0.74, 0.16, 0.75], 2);
          }
          // Link line between Client & Server (or Intended!)
          if (predictOn) {
            fx.beam(server.x, 0.45, server.z, client.x, 0.45, client.z, 0.10, [0.20, 0.92, 1.0, 0.82], 4);
            fx.ringXZ(client.x, 0.06, client.z, 0.78, [0.22, 0.96, 0.56, 0.80]);
            fx.ringXZ(server.x, 0.06, server.z, 0.78, [0.18, 0.88, 1.0, 0.76]);
          } else {
            fx.beam(client.x, 0.45, client.z, intended.x, 0.45, intended.z, 0.12, [1.0, 0.26, 0.34, 0.88], 4);
            fx.ringXZ(client.x, 0.06, client.z, 0.82, [1.0, 0.24, 0.32, 0.86]);
            fx.ringXZ(intended.x, 0.06, intended.z, 0.82, [1.0, 0.78, 0.16, 0.80]);
          }
          if (snapFlash > 0.05 && snapFrom) {
            fx.beam(snapFrom.x, 0.65, snapFrom.z, client.x, 0.65, client.z, 0.18, [1.0, 0.86, 0.18, snapFlash], 0);
          }
        },
      });
      drawOverlay(ovCtx, cssW, cssH, viewProj, lang);
    },
    getDebugState() {
      return {
        predictOn, pingMs,
        perceivedLagMs: predictOn ? 0 : pingMs,
        bufferedPackets: packetQueue.length,
        reconCount,
      };
    },
  };
}
