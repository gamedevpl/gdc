// Game Design Codex (GDC) shared application shell — sibling to FX Lab.
// Fullscreen WebGL2 + crisp 2D badge overlay, orbit/zoom, click raypicking, catalog modal, EN/PL i18n.
import { CODEX_ENTRIES, getEntryMeta } from "./catalog.js";
import { clamp, cameraBasisFromOrbit, screenRayToPlaneY } from "./gl-utils.js";

const $ = (id) => document.getElementById(id);

const canvas = $("c");
const overlay = $("ov");
const ovCtx = overlay.getContext("2d");
const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });

const params = new URLSearchParams(location.search);
if (params.get("hud") === "0") document.body.classList.add("no-hud");

let lang = params.get("lang") === "pl" ? "pl" : "en";
let paused = false;
let activeMeta = null;
let activeEntry = null;
const entryCache = new Map();

// Detect root base path so clean routes (/gdc/, /gdc/astar/, /astar/) all resolve thumbnails & links properly
const isSubroute = document.documentElement.dataset.subroute === "1";
const ROOT_PREFIX = isSubroute ? "../" : "./";

const cam = { yaw: 0.16, pitch: 0.80, dist: 24.5, targetX: 0, targetY: 0, targetZ: 0.2, fovDeg: 42 };
let defaultCam = { ...cam };

function showNoGl() {
  $("nogl").hidden = false;
  $("noglBody").textContent = lang === "pl"
    ? "Ta strona wymaga przeglądarki ze wsparciem WebGL2."
    : "This interactive 3D codex requires a browser with WebGL2 support.";
}

if (!gl) {
  showNoGl();
  throw new Error("WebGL2 unavailable");
}

// Responsive sizing
let cssW = window.innerWidth;
let cssH = window.innerHeight;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  if (overlay.width !== cssW || overlay.height !== cssH) {
    overlay.width = cssW;
    overlay.height = cssH;
  }
}
window.addEventListener("resize", resize);
resize();

// Adjust camera distance slightly on narrow portrait screens so the whole diorama fits comfortably
function applyEntryCam(base) {
  const portraitBoost = cssH > cssW ? 1.36 : 1.0;
  defaultCam = { ...base, dist: base.dist * portraitBoost };
  Object.assign(cam, defaultCam);
}

// Build top quick-switcher pills
function renderRibbon() {
  const ribbon = $("codexRibbon");
  ribbon.innerHTML = "";
  for (const item of CODEX_ENTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gdc-pill";
    btn.setAttribute("aria-current", item.id === activeMeta?.id ? "true" : "false");
    btn.innerHTML = `<span class="gdc-dot" style="background:${item.accent}"></span><span>${item.title[lang]}</span>`;
    btn.addEventListener("click", () => loadEntry(item.id, true));
    ribbon.appendChild(btn);
  }
}

function renderCatalogModal() {
  const grid = $("catalogGrid");
  $("catalogTitle").textContent = lang === "pl" ? "Kodeks Projektowania Gier" : "Game Design Codex";
  $("catalogSub").textContent = lang === "pl"
    ? `${CODEX_ENTRIES.length} interaktywne dioramy 3D — kliknij, żeby przetestować mechanikę`
    : `${CODEX_ENTRIES.length} interactive 3D dioramas — click any concept to try it live`;
  grid.innerHTML = "";
  for (const item of CODEX_ENTRIES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gdc-card";
    card.style.setProperty("--gdc-accent", item.accent);
    if (item.id === activeMeta?.id) card.setAttribute("aria-current", "true");
    card.innerHTML = `
      <div class="gdc-card-thumb">
        <img src="${ROOT_PREFIX}${item.thumb}" alt="${item.title[lang]}" loading="lazy">
      </div>
      <div class="gdc-card-body">
        <div class="gdc-card-top">
          <span class="gdc-card-meta">${item.kicker[lang]}</span>
          ${item.id === activeMeta?.id ? `<span class="gdc-card-active">${lang === "pl" ? "AKTYWNE" : "LIVE"}</span>` : ""}
        </div>
        <h3>${item.title[lang]}</h3>
        <p>${item.question[lang]}</p>
      </div>
    `;
    card.addEventListener("click", () => {
      closeCatalog();
      loadEntry(item.id, true);
    });
    grid.appendChild(card);
  }
}

function renderHud() {
  if (!activeMeta || !activeEntry) return;
  document.documentElement.lang = lang;
  $("lang").textContent = lang === "pl" ? "EN" : "PL";
  $("pickerName").textContent = activeMeta.title[lang];
  const idx = CODEX_ENTRIES.findIndex(e => e.id === activeMeta.id) + 1;
  $("pickerCount").textContent = `${idx}/${CODEX_ENTRIES.length}`;
  $("pickerDot").style.background = activeMeta.accent;
  $("sourceLink").href = `https://github.com/gamedevpl/gdc/tree/main/docs/src/entries/${activeMeta.id}`;

  $("kicker").textContent = activeMeta.kicker[lang];
  $("entryTitle").textContent = activeMeta.title[lang];
  $("entryNote").textContent = activeMeta.note[lang];
  $("hintLine").textContent = activeMeta.hint[lang];
  $("pauseBtn").textContent = paused
    ? (lang === "pl" ? "Wznów" : "Resume")
    : (lang === "pl" ? "Pauza" : "Pause");
  $("resetBtn").textContent = lang === "pl" ? "Reset" : "Reset";

  const actionsWrap = $("entryActions");
  actionsWrap.innerHTML = "";
  for (const act of activeEntry.getActions(lang)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = act.label;
    if (act.pressed) b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => {
      activeEntry.onAction(act.id);
      renderHud();
    });
    actionsWrap.appendChild(b);
  }

  renderRibbon();
  if (!$("catalogModal").hidden) renderCatalogModal();
}

async function loadEntry(id, pushHistory = false) {
  const meta = getEntryMeta(id);
  activeMeta = meta;
  let inst = entryCache.get(meta.id);
  if (!inst) {
    const mod = await import(meta.module);
    inst = mod.createEntry(gl);
    entryCache.set(meta.id, inst);
  }
  activeEntry = inst;
  applyEntryCam(inst.defaultCam);
  paused = false;

  if (pushHistory && location.protocol.startsWith("http")) {
    const base = location.pathname.replace(/\/(astar|attack-tokens|rubber-banding)\/?$/, "/").replace(/\/index\.html$/, "/");
    const targetUrl = `${base}${meta.id}/${location.search}`;
    try { history.replaceState(null, "", targetUrl); } catch {}
  }

  document.title = `${meta.title[lang]} — Game Design Codex | gamedev.pl`;
  renderHud();
}

// Modal controls
function openCatalog() {
  renderCatalogModal();
  $("catalogModal").hidden = false;
  $("catalogBtn").setAttribute("aria-expanded", "true");
}
function closeCatalog() {
  $("catalogModal").hidden = true;
  $("catalogBtn").setAttribute("aria-expanded", "false");
}
$("catalogBtn").addEventListener("click", () => ($("catalogModal").hidden ? openCatalog() : closeCatalog()));
$("catalogClose").addEventListener("click", closeCatalog);
$("catalogModal").addEventListener("click", (e) => { if (e.target === $("catalogModal")) closeCatalog(); });

$("lang").addEventListener("click", () => {
  lang = lang === "en" ? "pl" : "en";
  renderHud();
});
$("pauseBtn").addEventListener("click", () => {
  paused = !paused;
  renderHud();
});
$("resetBtn").addEventListener("click", () => {
  if (activeEntry) {
    activeEntry.reset();
    applyEntryCam(activeEntry.defaultCam);
    renderHud();
  }
});

// Pointer orbit, scroll zoom, and click-to-edit-tile raypicking!
let dragActive = false;
let dragMoved = false;
let downX = 0, downY = 0, lastX = 0, lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragActive = true;
  dragMoved = false;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragActive) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) dragMoved = true;
  if (dragMoved) {
    cam.yaw -= dx * 0.0065;
    cam.pitch = clamp(cam.pitch + dy * 0.0055, 0.36, 1.38);
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragActive) return;
  dragActive = false;
  canvas.classList.remove("dragging");
  if (!dragMoved && activeEntry && typeof activeEntry.onClickTile === "function") {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const pt = screenRayToPlaneY(ndcX, ndcY, basis, (cam.fovDeg * Math.PI) / 180, rect.width / Math.max(1, rect.height), 0);
    if (pt) activeEntry.onClickTile(pt, e.shiftKey);
  }
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 11.0, 38.0);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("catalogModal").hidden) { closeCatalog(); return; }
  if (e.key === " ") { e.preventDefault(); paused = !paused; renderHud(); }
  if (e.key === "r" || e.key === "R") {
    if (activeEntry) { activeEntry.reset(); applyEntryCam(activeEntry.defaultCam); renderHud(); }
  }
  if (e.key === "1") loadEntry(CODEX_ENTRIES[0].id, true);
  if (e.key === "2") loadEntry(CODEX_ENTRIES[1].id, true);
  if (e.key === "3") loadEntry(CODEX_ENTRIES[2].id, true);
});

// Expose tiny debug/thumb capture hook for automated QA & OG card generation
window.__GDC__ = {
  loadEntry,
  setPaused(v) { paused = !!v; },
  step(dt) { if (activeEntry) activeEntry.update(dt); },
  action(id) { if (activeEntry) { activeEntry.onAction(id); renderHud(); } },
  renderNow() {
    if (activeEntry) {
      ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeEntry.render(canvas.width, canvas.height, cam, ovCtx, cssW, cssH);
    }
  },
};

// Initial entry selection: URL param ?entry= -> <html data-entry=""> -> default rubber-banding
const initialId = params.get("entry") || document.documentElement.dataset.entry || "rubber-banding";
loadEntry(initialId, false).then(() => {
  let prev = performance.now();
  function cleanFrame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
    prev = now;
    if (activeEntry) {
      if (!paused) activeEntry.update(dt);
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
      }
      ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeEntry.render(canvas.width, canvas.height, cam, ovCtx, cssW, cssH);
    }
    requestAnimationFrame(cleanFrame);
  }
  requestAnimationFrame(cleanFrame);
});
