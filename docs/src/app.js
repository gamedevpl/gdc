// Game Design Codex (GDC) shared application shell — sibling to FX Lab.
// Fullscreen WebGL2 + 2D HUD, procedural Web Audio SFX/Music toggles, live keyboard/mouse gameplay, Follow-Cam & Shake!
import { CODEX_CATEGORIES, CODEX_ENTRIES, getEntryMeta } from "./catalog.js?v=18";
import { clamp, cameraBasisFromOrbit, screenRayToPlaneY } from "./gl-utils.js";
import { createAudioEngine } from "./audio.js?v=18";
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

const STORAGE_VISITED = "gdc_visited_v1";
const visitedIds = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_VISITED) || "[]");
  if (Array.isArray(saved)) saved.forEach((id) => visitedIds.add(id));
} catch {}
function markVisited(id) {
  if (!id || visitedIds.has(id)) return;
  visitedIds.add(id);
  try { localStorage.setItem(STORAGE_VISITED, JSON.stringify([...visitedIds])); } catch {}
}

let introDismissed = false;
try { introDismissed = sessionStorage.getItem("gdc_intro_dismissed") === "1"; } catch {}

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
  // Tighter portrait zoom eliminates excess empty sky above dioramas on phones while keeping side margins safe!
  const portraitBoost = isPortrait ? clamp(0.88 / Math.max(0.42, aspect), 1.28, 1.66) : 1.0;
  defaultCam = { ...base, dist: base.dist * portraitBoost };
  Object.assign(cam, defaultCam);
  Object.assign(renderCam, cam);
}

const SVG_CODE_ICON = `<svg viewBox="0 0 16 12" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 2 1.5 6 5 10"/><line x1="9.5" y1="1.5" x2="6.5" y2="10.5"/><polyline points="11 2 14.5 6 11 10"/></svg>`;
const SVG_LINK_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 9.2a3.4 3.4 0 0 0 4.8 0l1.8-1.8a3.4 3.4 0 0 0-4.8-4.8L7.5 3.7"/><path d="M9.2 6.8a3.4 3.4 0 0 0-4.8 0L2.6 8.6a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1"/></svg>`;

function stepEntry(delta) {
  if (!activeMeta) return;
  const i = CODEX_ENTRIES.findIndex((e) => e.id === activeMeta.id);
  const nextIdx = (i + delta + CODEX_ENTRIES.length) % CODEX_ENTRIES.length;
  audio.unlock();
  loadEntry(CODEX_ENTRIES[nextIdx].id, true);
}

function randomEntry() {
  const unvisited = CODEX_ENTRIES.filter((e) => e.id !== activeMeta?.id && !visitedIds.has(e.id));
  const pool = unvisited.length ? unvisited : CODEX_ENTRIES.filter((e) => e.id !== activeMeta?.id);
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  audio.unlock();
  loadEntry(pick.id, true);
}

function syncLangUrl() {
  if (!location.protocol.startsWith("http")) return;
  const u = new URL(location.href);
  if (lang === "pl") u.searchParams.set("lang", "pl");
  else u.searchParams.delete("lang");
  try { history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`); } catch {}
}

let copyTimer = null;
function copyCurrentLink() {
  const url = location.href;
  const done = () => {
    const btn = $("copyLinkBtn");
    const lbl = $("copyLinkLabel");
    if (!btn || !lbl) return;
    btn.classList.add("is-copied");
    lbl.textContent = lang === "pl" ? "Skopiowano ✓" : "Copied ✓";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      lbl.textContent = lang === "pl" ? "Link" : "Copy link";
    }, 1600);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => {
      try {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
        done();
      } catch {}
    });
  } else {
    try {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      done();
    } catch {}
  }
}

let cardCollapsed = window.matchMedia("(max-width: 780px)").matches;
function ensureCardCollapseUi() {
  const card = document.querySelector(".card");
  if (!card || $("cardToggle")) return;

  // Compact 1-line intro banner for first-time visitors (HN / X cold landings)
  if (!$("cardIntro")) {
    const intro = document.createElement("div");
    intro.id = "cardIntro";
    intro.className = "card-intro";
    intro.innerHTML = `
      <span class="card-intro-text" id="cardIntroText"></span>
      <button type="button" class="card-intro-browse" id="cardIntroBrowse"></button>
      <button type="button" class="card-intro-close" id="cardIntroClose" aria-label="Dismiss">×</button>
    `;
    card.insertBefore(intro, card.firstChild);
    $("cardIntroBrowse").addEventListener("click", () => { audio.unlock(); openCatalog(); });
    $("cardIntroClose").addEventListener("click", () => {
      introDismissed = true;
      try { sessionStorage.setItem("gdc_intro_dismissed", "1"); } catch {}
      intro.hidden = true;
    });
    if (introDismissed) intro.hidden = true;
  }

  const kicker = $("kicker");
  const title = $("entryTitle");
  const head = document.createElement("div");
  head.className = "card-head-row";
  const actions = document.createElement("div");
  actions.className = "card-head-actions";

  // Mobile compact Prev/Next steppers right inside card header
  const mPrev = document.createElement("button");
  mPrev.id = "mobPrevBtn"; mPrev.type = "button"; mPrev.className = "card-mob-step";
  mPrev.textContent = "◀"; mPrev.setAttribute("aria-label", "Previous");
  mPrev.addEventListener("click", () => stepEntry(-1));

  const mNext = document.createElement("button");
  mNext.id = "mobNextBtn"; mNext.type = "button"; mNext.className = "card-mob-step";
  mNext.textContent = "▶"; mNext.setAttribute("aria-label", "Next");
  mNext.addEventListener("click", () => stepEntry(1));

  // Copy Link button
  const copyBtn = document.createElement("button");
  copyBtn.id = "copyLinkBtn"; copyBtn.type = "button"; copyBtn.className = "card-copy";
  copyBtn.innerHTML = `${SVG_LINK_ICON}<span id="copyLinkLabel">Copy link</span>`;
  copyBtn.addEventListener("click", () => { audio.unlock(); copyCurrentLink(); });

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
  actions.append(mPrev, mNext, copyBtn, srcLink, btn);
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

function ensureStepButtons() {
  const nav = document.querySelector("header nav");
  if (!nav || $("prevEntryBtn")) return;
  const grp = document.createElement("div");
  grp.className = "gdc-step-grp";
  grp.innerHTML = `
    <button id="prevEntryBtn" class="gdc-step-btn" type="button" title="Previous ([)" aria-label="Previous diorama">◀</button>
    <button id="nextEntryBtn" class="gdc-step-btn" type="button" title="Next (])" aria-label="Next diorama">▶</button>
    <button id="randEntryBtn" class="gdc-step-btn" type="button" title="Random unvisited diorama" aria-label="Random diorama">↻</button>
  `;
  nav.insertBefore(grp, $("catalogBtn"));
  $("prevEntryBtn").addEventListener("click", () => stepEntry(-1));
  $("nextEntryBtn").addEventListener("click", () => stepEntry(1));
  $("randEntryBtn").addEventListener("click", () => randomEntry());
}
ensureStepButtons();

function renderRibbon() {
  const ribbon = $("codexRibbon");
  ribbon.innerHTML = "";
  let activeBtn = null;
  for (const item of CODEX_ENTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gdc-pill";
    const isAct = item.id === activeMeta?.id;
    const isSeen = visitedIds.has(item.id);
    btn.setAttribute("aria-current", isAct ? "true" : "false");
    btn.innerHTML = `<span class="gdc-dot" style="background:${item.accent}"></span><span>${item.title[lang]}</span>${isSeen && !isAct ? `<span class="gdc-pill-seen" aria-hidden="true">✓</span>` : ""}`;
    btn.addEventListener("click", () => { audio.unlock(); loadEntry(item.id, true); });
    ribbon.appendChild(btn);
    if (isAct) activeBtn = btn;
  }
  if (activeBtn) {
    try { activeBtn.scrollIntoView({ inline: "nearest", block: "nearest" }); } catch {}
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
    const isCur = item.id === activeMeta?.id;
    const isSeen = visitedIds.has(item.id);
    const badge = isCur
      ? `<span class="gdc-card-active">${lang === "pl" ? "AKTYWNE" : "LIVE"}</span>`
      : (isSeen ? `<span class="gdc-card-seen">✓</span>` : "");
    card.innerHTML = `
      <div class="gdc-card-thumb">
        <img src="${thumbUrl}" alt="${item.title[lang]}" loading="lazy">
      </div>
      <div class="gdc-card-body">
        <div class="gdc-card-top">
          <span class="gdc-card-meta">${item.kicker[lang]}</span>
          ${badge}
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
    ? `${CODEX_ENTRIES.length} grywalnych dioram 3D w ${CODEX_CATEGORIES.length - 1} kategoriach · Odkryto ${visitedIds.size}/${CODEX_ENTRIES.length}`
    : `${CODEX_ENTRIES.length} playable 3D dioramas across ${CODEX_CATEGORIES.length - 1} categories · Explored ${visitedIds.size}/${CODEX_ENTRIES.length}`;

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

function syncPickerLabel() {
  if (!activeMeta) return;
  const isMob = window.matchMedia("(max-width: 780px)").matches;
  // Desktop shows concise "Catalog" (avoids duplicating the active title highlighted in the ribbon);
  // Mobile shows the active title (truncated cleanly) alongside the 1/30 counter!
  $("pickerName").textContent = isMob
    ? activeMeta.title[lang]
    : (lang === "pl" ? "Katalog" : "Catalog");
}
window.addEventListener("resize", syncPickerLabel);

function renderHud() {
  if (!activeMeta || !activeEntry) return;
  document.documentElement.lang = lang;
  $("lang").textContent = lang === "pl" ? "EN" : "PL";
  syncPickerLabel();
  const idx = CODEX_ENTRIES.findIndex(e => e.id === activeMeta.id) + 1;
  $("pickerCount").textContent = `${idx}/${CODEX_ENTRIES.length}`;
  $("pickerDot").style.background = activeMeta.accent;

  const introEl = $("cardIntro");
  if (introEl && !introDismissed) {
    $("cardIntroText").textContent = lang === "pl"
      ? `${CODEX_ENTRIES.length} grywalnych sztuczek z gier 3D — kliknij [T], żeby każdą popsuć.`
      : `${CODEX_ENTRIES.length} playable 3D game-dev tricks — press [T] to break each one.`;
    $("cardIntroBrowse").textContent = lang === "pl" ? `Wszystkie ${CODEX_ENTRIES.length} ▾` : `Browse ${CODEX_ENTRIES.length} ▾`;
  }

  const copyLbl = $("copyLinkLabel");
  if (copyLbl && !$("copyLinkBtn")?.classList.contains("is-copied")) {
    copyLbl.textContent = lang === "pl" ? "Link" : "Copy link";
  }
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

let loadSeq = 0;
let activeLoads = 0;
let loaderEl = null;

function ensureSceneLoader() {
  if (loaderEl) return loaderEl;
  const el = document.createElement("div");
  el.id = "sceneLoader";
  el.className = "scene-loader";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="scene-loader-card">
      <div class="scene-loader-row">
        <div class="scene-loader-spin" aria-hidden="true"></div>
        <div class="scene-loader-text">
          <div class="scene-loader-kicker" id="loaderKicker"></div>
          <div class="scene-loader-title" id="loaderTitle"></div>
        </div>
      </div>
      <div class="scene-loader-bar" aria-hidden="true"></div>
      <div class="scene-loader-status" id="loaderStatus"></div>
    </div>
  `;
  document.body.appendChild(el);
  loaderEl = el;
  return el;
}

function showSceneLoader(meta, quick) {
  if (document.body.classList.contains("no-hud")) return;
  const el = ensureSceneLoader();
  el.style.setProperty("--loader-accent", meta.accent || "#f59e0b");
  el.classList.toggle("is-quick", Boolean(quick));
  $("loaderKicker").textContent = meta.kicker[lang];
  $("loaderTitle").textContent = meta.title[lang];
  $("loaderStatus").textContent = lang === "pl" ? "Kompilacja sceny 3D…" : "Loading 3D diorama…";
  el.setAttribute("aria-hidden", "false");
  el.classList.add("is-visible");
}

function hideSceneLoader() {
  if (!loaderEl) return;
  loaderEl.classList.remove("is-visible");
  loaderEl.setAttribute("aria-hidden", "true");
}

function waitPaint(minMs = 0) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rem = minMs - (performance.now() - t0);
        if (rem > 4) setTimeout(resolve, rem);
        else resolve();
      });
    });
  });
}

async function loadEntry(id, pushHistory = false) {
  const meta = getEntryMeta(id);
  if (activeEntry && activeMeta?.id === meta.id) return;

  const seq = ++loadSeq;
  activeLoads++;
  const isCached = entryCache.has(meta.id);
  const useVeil = !document.body.classList.contains("no-hud");

  try {
    if (useVeil) {
      showSceneLoader(meta, isCached);
      // Yield 2 animation frames so the browser actually paints the veil & spinner BEFORE synchronous WebGL shader compilation!
      await waitPaint(isCached ? 55 : 90);
      if (seq !== loadSeq) return;
    }

    activeMeta = meta;
    markVisited(meta.id);
    keys.clear();
    audio.setTheme(meta.id);
    let inst = entryCache.get(meta.id);
    if (!inst) {
      const mod = await import(`${meta.module}?v=18`);
      if (seq !== loadSeq) return;
      inst = mod.createEntry(gl, { requestHudRefresh: renderHud, audio });
      entryCache.set(meta.id, inst);
    }
    if (seq !== loadSeq) return;

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

    // Render the very first GPU frame of the new scene behind the veil so fade-out reveals live 3D!
    const c = resolveFrameCamera();
    ovCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    activeEntry.render(canvas.width, canvas.height, c, ovCtx, cssW, cssH, lang);

    if (useVeil) {
      await waitPaint(isCached ? 20 : 60);
    }
  } finally {
    activeLoads = Math.max(0, activeLoads - 1);
    if (seq === loadSeq) hideSceneLoader();
  }
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
  syncLangUrl();
  if (activeMeta) document.title = `${activeMeta.title[lang]} — Game Design Codex | gamedev.pl`;
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
  if (e.code === "BracketLeft") { stepEntry(-1); return; }
  if (e.code === "BracketRight") { stepEntry(1); return; }
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
  isLoading() { return activeLoads > 0; },
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
