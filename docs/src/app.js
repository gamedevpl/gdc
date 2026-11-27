// Game Design Codex (GDC) shared application shell — sibling to FX Lab.
// Fullscreen WebGL2 + 2D HUD, procedural Web Audio SFX/Music toggles, live keyboard/mouse gameplay, Follow-Cam & Shake!
import { CODEX_CATEGORIES, CODEX_ENTRIES, getEntryMeta } from "./catalog.js?v=14";
import { clamp, cameraBasisFromOrbit, screenRayToPlaneY } from "./gl-utils.js";
import { createAudioEngine } from "./audio.js?v=14";
import { initSiteMenu } from "./site-menu.js";

const $ = (id) => document.getElementById(id);

const canvas = $("c");
const overlay = $("ov");
const ovCtx = overlay.getContext("2d");
const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });

// Always resolve assets relative to /gdc/ root regardless of pushState/replaceState subroutes!
const SITE_ROOT = new URL("../", import.meta.url).href;

const params = new URLSearchParams(location.search);
if (params.get("hud") === "0") document.body.classList.add("no-hud");

let lang = params.get("lang") === "pl" ? "pl" : "en";
let paused = false;
let activeMeta = null;
let activeEntry = null;
let catalogCategory = "all";
let catalogQuery = "";
const entryCache = new Map();
const audio = createAudioEngine();

const cam = { yaw: 0.16, pitch: 0.80, dist: 24.5, targetX: 0, targetY: 0, targetZ: 0.2, fovDeg: 42 };
let defaultCam = { ...cam };
let renderCam = { ...cam }; // effective camera after Follow-Cam / micro screen-shake!

const keys = new Set();
const pointer = { x: 0, y: 0, world: null, down: false, button: 0 };

if (!gl) {
  $("nogl").hidden = false;
  $("noglBody").textContent = lang === "pl"
    ? "Ta strona wymaga przeglądarki ze wsparciem WebGL2."
    : "This interactive 3D codex requires a browser with WebGL2 support.";
  throw new Error("WebGL2 unavailable");
}

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
  if (overlay.width !== pw || overlay.height !== ph) {
    overlay.width = pw;
    overlay.height = ph;
  }
}
window.addEventListener("resize", resize);
resize();

function applyEntryCam(base) {
  const isPortrait = cssH > cssW;
  const aspect = cssW / Math.max(1, cssH);
  const portraitBoost = isPortrait ? clamp(1.16 / Math.max(0.42, aspect), 1.52, 2.28) : 1.0;
  defaultCam = { ...base, dist: base.dist * portraitBoost };
  Object.assign(cam, defaultCam);
  Object.assign(renderCam, cam);
}

const SVG_CODE_ICON = `<svg viewBox="0 0 16 12" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 2 1.5 6 5 10"/><line x1="9.5" y1="1.5" x2="6.5" y2="10.5"/><polyline points="11 2 14.5 6 11 10"/></svg>`;

let cardCollapsed = window.matchMedia("(max-width: 780px)").matches;
function ensureCardCollapseUi() {
  const card = document.querySelector(".card");
  if (!card || $("cardToggle")) return;
  const kicker = $("kicker");
  const title = $("entryTitle");
  const head = document.createElement("div");
  head.className = "card-head-row";
  const actions = document.createElement("div");
  actions.className = "card-head-actions";

  let srcLink = $("sourceLink");
  if (!srcLink) {
    srcLink = document.createElement("a");
    srcLink.id = "sourceLink";
    srcLink.target = "_blank";
    srcLink.rel = "noopener";
  }
  srcLink.className = "card-source";
  srcLink.innerHTML = `${SVG_CODE_ICON}<span id="sourceLabel">Source</span>`;

  const btn = document.createElement("button");
  btn.id = "cardToggle";
  btn.type = "button";
  btn.className = "card-toggle";
  btn.addEventListener("click", () => {
    cardCollapsed = !cardCollapsed;
    syncCardCollapse();
  });
  title.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 780px)").matches) {
      cardCollapsed = !cardCollapsed;
      syncCardCollapse();
    }
  });
  card.insertBefore(head, kicker);
  actions.append(srcLink, btn);
  head.append(kicker, actions, title);
  syncCardCollapse();
}

function syncCardCollapse() {
  const card = document.querySelector(".card");
  const btn = $("cardToggle");
  if (!card || !btn) return;
  card.classList.toggle("is-collapsed", cardCollapsed);
  btn.setAttribute("aria-expanded", String(!cardCollapsed));
  btn.textContent = cardCollapsed
    ? (lang === "pl" ? "Opis ▴" : "Info ▴")
    : (lang === "pl" ? "Ukryj ▾" : "Hide ▾");
}
ensureCardCollapseUi();

function projectClientToWorldY0(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  const basis = cameraBasisFromOrbit(renderCam.yaw, renderCam.pitch, renderCam.dist, renderCam.targetX, renderCam.targetY, renderCam.targetZ);
  return screenRayToPlaneY(ndcX, ndcY, basis, (renderCam.fovDeg * Math.PI) / 180, rect.width / Math.max(1, rect.height), 0);
}

const siteMenu = initSiteMenu({
  currentSite: "gdc",
  getLang: () => lang,
  getGithubUrl: () => activeMeta
    ? `https://github.com/gamedevpl/gdc/tree/main/docs/src/entries/${activeMeta.id}`
    : "https://github.com/gamedevpl/gdc",
  githubSub: "gdc",
  onBeforeOpen: () => { if (!$("catalogModal").hidden) closeCatalog(); },
  onToggle: () => audio.unlock(),
});

function renderSiteMenu() {
  siteMenu?.render();
}

function setMenuOpen(open, restoreFocus = false) {
  siteMenu?.setOpen(open, restoreFocus);
}

// Inject crisp SFX + Music toggle buttons into header nav cleanly across all 4 HTML routes!
function ensureAudioButtons() {
  const nav = document.querySelector("header nav");
  if (!nav || $("sfxBtn")) return;
  const grp = document.createElement("div");
  grp.className = "gdc-audio-grp";
  grp.innerHTML = `
    <button id="sfxBtn" class="gdc-audio-btn" type="button" aria-pressed="true" title="Toggle SFX (M)">SFX</button>
    <button id="musicBtn" class="gdc-audio-btn" type="button" aria-pressed="true" title="Toggle Music (B)">♪</button>
  `;
  nav.insertBefore(grp, $("lang"));
  $("sfxBtn").addEventListener("click", () => {
    audio.unlock();
    audio.setSfxOn(!audio.getSfxOn());
    updateAudioButtons();
  });
  $("musicBtn").addEventListener("click", () => {
    audio.unlock();
    audio.setMusicOn(!audio.getMusicOn());
    updateAudioButtons();
  });
}

function updateAudioButtons() {
  const s = $("sfxBtn"), m = $("musicBtn");
  if (s) s.setAttribute("aria-pressed", audio.getSfxOn() ? "true" : "false");
  if (m) m.setAttribute("aria-pressed", audio.getMusicOn() ? "true" : "false");
}
ensureAudioButtons();

function renderRibbon() {
  const ribbon = $("codexRibbon");
  ribbon.innerHTML = "";
  for (const item of CODEX_ENTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gdc-pill";
    btn.setAttribute("aria-current", item.id === activeMeta?.id ? "true" : "false");
    btn.innerHTML = `<span class="gdc-dot" style="background:${item.accent}"></span><span>${item.title[lang]}</span>`;
    btn.addEventListener("click", () => { audio.unlock(); loadEntry(item.id, true); });
    ribbon.appendChild(btn);
  }
}

function ensureCatalogFilters() {
  const box = document.querySelector("#catalogModal .catalog-box");
  if (!box || $("catalogFilters")) return;
  const head = box.querySelector(".catalog-head");
  const bar = document.createElement("div");
  bar.id = "catalogFilters";
  bar.className = "catalog-filters";
  bar.innerHTML = `
    <input id="catalogSearch" type="search" autocomplete="off" spellcheck="false" aria-label="Filter mechanics">
    <div id="catalogCats" class="catalog-cats" role="group" aria-label="Categories"></div>
  `;
  head.insertAdjacentElement("afterend", bar);
  $("catalogSearch").addEventListener("input", (e) => {
    catalogQuery = e.target.value.trim().toLowerCase();
    renderCatalogGrid();
  });
}

function renderCatalogGrid() {
  const grid = $("catalogGrid");
  const q = catalogQuery;
  const filtered = CODEX_ENTRIES.filter((item) => {
    if (catalogCategory !== "all" && item.category !== catalogCategory) return false;
    if (!q) return true;
    const hay = `${item.title.en} ${item.title.pl} ${item.question.en} ${item.question.pl} ${item.kicker.en} ${item.kicker.pl} ${item.id}`.toLowerCase();
    return hay.includes(q);
  });
  grid.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "catalog-empty";
    empty.textContent = lang === "pl" ? "Brak pasujących mechanik." : "No matching mechanics.";
    grid.appendChild(empty);
    return;
  }
  for (const item of filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gdc-card";
    card.style.setProperty("--gdc-accent", item.accent);
    if (item.id === activeMeta?.id) card.setAttribute("aria-current", "true");
    const thumbUrl = new URL(item.thumb, SITE_ROOT).href;
    card.innerHTML = `
      <div class="gdc-card-thumb">
        <img src="${thumbUrl}" alt="${item.title[lang]}" loading="lazy">
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
      audio.unlock();
      closeCatalog();
      loadEntry(item.id, true);
    });
    grid.appendChild(card);
  }
}

function renderCatalogModal() {
  ensureCatalogFilters();
  $("catalogTitle").textContent = lang === "pl" ? "Kodeks Projektowania Gier" : "Game Design Codex";
  $("catalogSub").textContent = lang === "pl"
    ? `${CODEX_ENTRIES.length} grywalne dioramy 3D w ${CODEX_CATEGORIES.length - 1} kategoriach — kliknij i zagraj`
    : `${CODEX_ENTRIES.length} playable 3D dioramas across ${CODEX_CATEGORIES.length - 1} categories — click to play live`;

  const searchEl = $("catalogSearch");
  if (searchEl) {
    searchEl.placeholder = lang === "pl" ? "Szukaj mechaniki lub techniki…" : "Filter mechanics or techniques…";
  }

  const catsEl = $("catalogCats");
  if (catsEl) {
    catsEl.innerHTML = "";
    for (const cat of CODEX_CATEGORIES) {
      const count = cat.id === "all"
        ? CODEX_ENTRIES.length
        : CODEX_ENTRIES.filter((e) => e.category === cat.id).length;
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.cat = cat.id;
      b.textContent = `${cat[lang]} (${count})`;
      b.setAttribute("aria-pressed", catalogCategory === cat.id ? "true" : "false");
      b.addEventListener("click", () => {
        catalogCategory = cat.id;
        renderCatalogModal();
      });
      catsEl.appendChild(b);
    }
  }
  renderCatalogGrid();
}

function renderHud() {
  if (!activeMeta || !activeEntry) return;
  document.documentElement.lang = lang;
  $("lang").textContent = lang === "pl" ? "EN" : "PL";
  $("pickerName").textContent = activeMeta.title[lang];
  const idx = CODEX_ENTRIES.findIndex(e => e.id === activeMeta.id) + 1;
  $("pickerCount").textContent = `${idx}/${CODEX_ENTRIES.length}`;
  $("pickerDot").style.background = activeMeta.accent;
  const srcLink = $("sourceLink");
  if (srcLink) {
    srcLink.href = `https://github.com/gamedevpl/gdc/tree/main/docs/src/entries/${activeMeta.id}`;
    const srcLabel = $("sourceLabel");
    if (srcLabel) srcLabel.textContent = lang === "pl" ? "Kod" : "Source";
    const srcTip = lang === "pl" ? `Kod źródłowy: ${activeMeta.title[lang]} (GitHub)` : `Source code: ${activeMeta.title[lang]} (GitHub)`;
    srcLink.title = srcTip;
    srcLink.setAttribute("aria-label", srcTip);
  }

  $("kicker").textContent = activeMeta.kicker[lang];
  $("entryTitle").textContent = activeMeta.title[lang];
  $("entryNote").textContent = activeMeta.note[lang];
  $("hintLine").textContent = activeMeta.hint[lang];
  $("pauseBtn").textContent = paused
    ? (lang === "pl" ? "Wznów (P)" : "Resume (P)")
    : (lang === "pl" ? "Pauza (P)" : "Pause (P)");
  $("resetBtn").textContent = lang === "pl" ? "Reset (R)" : "Reset (R)";

  const actionsWrap = $("entryActions");
  actionsWrap.innerHTML = "";
  for (const act of activeEntry.getActions(lang)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = act.label;
    if (act.pressed) b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => {
      audio.unlock();
      activeEntry.onAction(act.id);
      renderHud();
    });
    actionsWrap.appendChild(b);
  }

  updateAudioButtons();
  syncCardCollapse();
  renderSiteMenu();
  renderRibbon();
  if (!$("catalogModal").hidden) renderCatalogModal();
}

async function loadEntry(id, pushHistory = false) {
  const meta = getEntryMeta(id);
  activeMeta = meta;
  keys.clear();
  audio.setTheme(meta.id);
  let inst = entryCache.get(meta.id);
  if (!inst) {
    const mod = await import(`${meta.module}?v=14`);
    inst = mod.createEntry(gl, { requestHudRefresh: renderHud, audio });
    entryCache.set(meta.id, inst);
  }
  activeEntry = inst;
  applyEntryCam(inst.defaultCam);
  paused = false;

  if (pushHistory && location.protocol.startsWith("http")) {
    const rootPath = new URL(SITE_ROOT).pathname;
    const targetUrl = `${rootPath}${meta.id}/${location.search}`;
    try { history.replaceState(null, "", targetUrl); } catch {}
  }

  document.title = `${meta.title[lang]} — Game Design Codex | gamedev.pl`;
  renderHud();
}

function openCatalog() {
  if (siteMenu?.isOpen()) setMenuOpen(false);
  renderCatalogModal();
  $("catalogModal").hidden = false;
  $("catalogBtn").setAttribute("aria-expanded", "true");
}
function closeCatalog() {
  $("catalogModal").hidden = true;
  $("catalogBtn").setAttribute("aria-expanded", "false");
}
$("catalogBtn").addEventListener("click", () => { audio.unlock(); $("catalogModal").hidden ? openCatalog() : closeCatalog(); });
$("catalogClose").addEventListener("click", closeCatalog);
$("catalogModal").addEventListener("click", (e) => { if (e.target === $("catalogModal")) closeCatalog(); });

$("lang").addEventListener("click", () => {
  lang = lang === "en" ? "pl" : "en";
  renderHud();
});
$("pauseBtn").addEventListener("click", () => {
  paused = !paused;
  if (paused) audio.setEngine(0, false);
  renderHud();
});
$("resetBtn").addEventListener("click", () => {
  audio.unlock();
  if (activeEntry) {
    activeEntry.reset();
    applyEntryCam(activeEntry.defaultCam);
    renderHud();
  }
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let dragActive = false;
let dragMoved = false;
let entryClaimedDrag = false;
let downX = 0, downY = 0, lastX = 0, lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  const world = projectClientToWorldY0(e.clientX, e.clientY);
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.world = world;
  pointer.down = true;
  pointer.button = e.button;

  // Let entry claim pointer-drag (e.g. A* drag-to-paint walls, Attack Tokens right-click shield block!)
  if (activeEntry?.onPointerDown && activeEntry.onPointerDown({ world, button: e.button, shiftKey: e.shiftKey })) {
    entryClaimedDrag = true;
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  entryClaimedDrag = false;
  dragActive = true;
  dragMoved = false;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.world = projectClientToWorldY0(e.clientX, e.clientY);
  if (activeEntry?.onPointerMove) {
    activeEntry.onPointerMove({ world: pointer.world, down: pointer.down, button: pointer.button, claimed: entryClaimedDrag });
  }

  if (!dragActive) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) dragMoved = true;
  if (dragMoved) {
    cam.yaw -= dx * 0.0065;
    cam.pitch = clamp(cam.pitch + dy * 0.0055, 0.30, 1.38);
  }
});

canvas.addEventListener("pointerup", (e) => {
  pointer.down = false;
  if (entryClaimedDrag) {
    entryClaimedDrag = false;
    if (activeEntry?.onPointerUp) activeEntry.onPointerUp({ button: e.button });
    return;
  }
  if (activeEntry?.onPointerUp) activeEntry.onPointerUp({ button: e.button });

  if (!dragActive) return;
  dragActive = false;
  canvas.classList.remove("dragging");
  if (!dragMoved && activeEntry) {
    const world = projectClientToWorldY0(e.clientX, e.clientY);
    if (world && typeof activeEntry.onClickWorld === "function") {
      activeEntry.onClickWorld(world, { shiftKey: e.shiftKey, altKey: e.altKey, button: e.button });
      renderHud();
    }
  }
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 10.0, 52.0);
}, { passive: false });

const GAME_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD",
  "Space", "ShiftLeft", "ShiftRight",
  "KeyE", "KeyF", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyT", "KeyV", "KeyX", "KeyC", "Enter",
]);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("catalogModal").hidden) { closeCatalog(); return; }
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

  audio.unlock();

  if (GAME_KEYS.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (activeEntry?.onKeyDown) {
      activeEntry.onKeyDown(e.code, e.repeat);
      renderHud();
    }
    return;
  }

  if (e.code === "KeyM") { audio.setSfxOn(!audio.getSfxOn()); updateAudioButtons(); }
  if (e.code === "KeyB") { audio.setMusicOn(!audio.getMusicOn()); updateAudioButtons(); }
  if (e.code === "KeyP") { paused = !paused; if (paused) audio.setEngine(0, false); renderHud(); }
  if (e.code === "KeyR") {
    if (activeEntry) { activeEntry.reset(); applyEntryCam(activeEntry.defaultCam); renderHud(); }
  }
  if (e.key >= "1" && e.key <= "9") {
    const idx = parseInt(e.key, 10) - 1;
    if (idx < CODEX_ENTRIES.length) loadEntry(CODEX_ENTRIES[idx].id, true);
  }
});

window.addEventListener("keyup", (e) => {
  if (keys.has(e.code)) {
    keys.delete(e.code);
    if (activeEntry?.onKeyUp) activeEntry.onKeyUp(e.code);
  }
});

window.addEventListener("blur", () => {
  keys.clear();
  pointer.down = false;
  entryClaimedDrag = false;
  audio.setEngine(0, false);
});

function resolveFrameCamera() {
  const eff = activeEntry?.getCameraOverride ? activeEntry.getCameraOverride(cam) : null;
  renderCam = eff ? { ...cam, ...eff } : { ...cam };
  return renderCam;
}

window.__GDC__ = {
  loadEntry,
  setPaused(v) { paused = !!v; },
  step(dt) { if (activeEntry) activeEntry.update(dt, keys, pointer); },
  action(id) { if (activeEntry) { activeEntry.onAction(id); renderHud(); } },
  pressKey(code) { keys.add(code); activeEntry?.onKeyDown?.(code, false); renderHud(); },
  releaseKey(code) { keys.delete(code); activeEntry?.onKeyUp?.(code); },
  getState() { return activeEntry?.getDebugState?.() || null; },
  getAudioState() {
    return {
      sfxOn: audio.getSfxOn(),
      musicOn: audio.getMusicOn(),
      samples: audio.getSampleStats?.() || null,
    };
  },
  renderNow() {
    if (activeEntry) {
      const c = resolveFrameCamera();
      ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeEntry.render(canvas.width, canvas.height, c, ovCtx, cssW, cssH, lang);
    }
  },
};

const initialId = params.get("entry") || document.documentElement.dataset.entry || "rubber-banding";
loadEntry(initialId, false).then(() => {
  let prev = performance.now();
  function cleanFrame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
    prev = now;
    if (activeEntry) {
      if (!paused) activeEntry.update(dt, keys, pointer);
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
      }
      const c = resolveFrameCamera();
      ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeEntry.render(canvas.width, canvas.height, c, ovCtx, cssW, cssH, lang);
    }
    requestAnimationFrame(cleanFrame);
  }
  requestAnimationFrame(cleanFrame);
});
