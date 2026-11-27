// Studio ElevenLabs Hybrid Web Audio Engine for Game Design Codex (/gdc/).
// Plays real ElevenLabs Sound Effects (.mp3, loudness-normalized & silence-trimmed) with AAA pitch-jitter,
// lazy theme-aware AudioBuffer preloading, smooth crossfading 4-category seamless ambient loops (opt-in OFF by default),
// master studio compressor, and seamless warm procedural fallback if a sample is still decoding on first click.

const STORAGE_SFX = "gdc_sfx";
const STORAGE_MUSIC = "gdc_music";
const SFX_BASE = new URL("../assets/sfx/", import.meta.url).href;

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {}
  return fallback;
}
function writePref(key, val) {
  try { localStorage.setItem(key, val ? "1" : "0"); } catch {}
}

const ENTRY_TO_PALETTE = {
  "coyote-time": "feel",
  "hitstop": "feel",
  "fake-1hp": "feel",
  "camera-deadzone": "feel",
  "bullet-magnetism": "feel",
  "hitboxes-iframes": "feel",
  "animation-cancel": "feel",
  "camera-spring-arm": "feel",
  "ik-foot-placement": "feel",
  "step-up-slopes": "feel",
  "corner-correction": "feel",
  "variable-jump": "feel",
  "fixed-timestep": "feel",
  "ledge-mantle": "feel",
  "recoil-patterns": "feel",
  "attack-tokens": "ai",
  "rubber-banding": "ai",
  "stealth-cones": "ai",
  "ai-director": "ai",
  "utility-ai": "ai",
  "behavior-trees": "ai",
  "goap-planner": "ai",
  "influence-maps": "ai",
  "offscreen-courtesy": "ai",
  "sound-propagation": "ai",
  "astar": "crowds",
  "boids-flocking": "crowds",
  "flow-field": "crowds",
  "quadtree-collisions": "crowds",
  "fog-of-war": "crowds",
  "steering-avoidance": "crowds",
  "navmesh-funnel": "crowds",
  "formation-slots": "crowds",
  "jump-point-search": "crowds",
  "bsp-dungeon": "systems",
  "pity-timer": "systems",
  "lag-compensation": "systems",
  "wfc-island": "systems",
  "frustum-culling": "systems",
  "client-prediction": "systems",
  "lod-billboards": "systems",
  "object-pooling": "systems",
  "rollback-netcode": "systems",
  "snapshot-interpolation": "systems",
  "structural-collapse": "systems",
  "chunk-streaming": "systems",
};

// Theme-specific preload manifests (keeps initial network cost tiny ~40-70 KB per diorama!)
const THEME_PRELOADS = {
  "astar": ["wall_place", "wall_erase", "goal_win", "ui_switch_on"],
  "attack-tokens": ["sword_slash", "hit_enemy", "enemy_ko", "shield_block", "perfect_parry", "dodge_roll", "player_hurt"],
  "rubber-banding": ["car_crash", "nitro_boost", "goal_win", "ui_switch_on"],
  "coyote-time": ["jump", "land", "coyote_save", "coin_pickup", "ui_blocked", "fall_void", "goal_win"],
  "hitstop": ["hammer_swing", "hammer_impact", "golem_shatter", "ui_switch_on", "ui_switch_off"],
  "fake-1hp": ["railgun_shot", "hit_enemy", "mercy_shield", "dodge_roll", "player_hurt", "ui_switch_on"],
  "camera-deadzone": ["jump", "land", "sand_dash", "coin_pickup", "goal_win", "ui_switch_on"],
  "stealth-cones": ["coin_clink", "coin_pickup", "alert_sting", "goal_win", "ui_switch_on"],
  "boids-flocking": ["water_ripple", "ui_switch_on", "ui_switch_off"],
  "flow-field": ["wall_place", "wall_erase", "ui_switch_on", "ui_switch_off", "goal_win"],
  "bullet-magnetism": ["railgun_shot", "hit_enemy", "coyote_save", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "ai-director": ["shotgun_blast", "player_hurt", "mercy_shield", "coin_pickup", "alert_sting", "ui_switch_on"],
  "bsp-dungeon": ["wall_place", "ui_switch_on", "ui_switch_off", "goal_win"],
  "pity-timer": ["chest_legendary", "coin_pickup", "ui_switch_on", "ui_switch_off"],
  "lag-compensation": ["railgun_shot", "hit_enemy", "coyote_save", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "wfc-island": ["wall_place", "goal_win", "ui_switch_on", "ui_switch_off"],
  "hitboxes-iframes": ["hammer_swing", "dodge_roll", "perfect_parry", "player_hurt", "ui_switch_on", "ui_switch_off"],
  "frustum-culling": ["ui_switch_on", "ui_switch_off"],
  "quadtree-collisions": ["water_ripple", "ui_switch_on", "ui_switch_off"],
  "utility-ai": ["alert_sting", "coin_pickup", "ui_switch_on", "ui_switch_off"],
  "animation-cancel": ["sword_slash", "hit_enemy", "sand_dash", "player_hurt", "ui_blocked", "ui_switch_on"],
  "camera-spring-arm": ["ui_switch_on", "ui_switch_off"],
  "ik-foot-placement": ["ui_switch_on", "ui_switch_off"],
  "client-prediction": ["coyote_save", "ui_switch_on", "ui_switch_off"],
  "lod-billboards": ["ui_switch_on", "ui_switch_off"],
  "behavior-trees": ["player_hurt", "coin_pickup", "ui_switch_on", "ui_switch_off"],
  "object-pooling": ["ui_blocked", "ui_switch_on", "ui_switch_off"],
  "fog-of-war": ["water_ripple", "ui_switch_on", "ui_switch_off"],
  "steering-avoidance": ["car_crash", "coin_pickup", "ui_switch_on", "ui_switch_off"],
  "step-up-slopes": ["jump", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "corner-correction": ["jump", "coyote_save", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "variable-jump": ["jump", "land", "coin_pickup", "ui_switch_on", "ui_switch_off"],
  "fixed-timestep": ["jump", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "ledge-mantle": ["jump", "coyote_save", "fall_void", "ui_switch_on", "ui_switch_off"],
  "recoil-patterns": ["railgun_shot", "hit_enemy", "ui_switch_on", "ui_switch_off"],
  "goap-planner": ["shotgun_blast", "alert_sting", "wall_erase", "ui_switch_on", "ui_switch_off"],
  "influence-maps": ["railgun_shot", "hit_enemy", "ui_switch_on", "ui_switch_off"],
  "offscreen-courtesy": ["railgun_shot", "mercy_shield", "alert_sting", "ui_switch_on", "ui_switch_off"],
  "sound-propagation": ["water_ripple", "coin_clink", "alert_sting", "wall_place", "ui_switch_on", "ui_switch_off"],
  "navmesh-funnel": ["coin_pickup", "ui_switch_on", "ui_switch_off"],
  "formation-slots": ["wall_place", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "jump-point-search": ["coin_pickup", "goal_win", "ui_switch_on", "ui_switch_off"],
  "rollback-netcode": ["hammer_impact", "sand_dash", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "snapshot-interpolation": ["coyote_save", "ui_blocked", "ui_switch_on", "ui_switch_off"],
  "structural-collapse": ["golem_shatter", "wall_erase", "wall_place", "ui_switch_on", "ui_switch_off"],
  "chunk-streaming": ["wall_place", "ui_blocked", "ui_switch_on", "ui_switch_off"],
};

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let delaySend = null;
  let pinkBuf = null;
  let brownBuf = null;

  // Tactile SFX ON by default; ambient music opt-in (OFF by default so opening a diorama never ambushes your ears!)
  let sfxOn = readPref(STORAGE_SFX, true);
  let musicOn = readPref(STORAGE_MUSIC, false);
  let unlocked = false;
  let tabHidden = false;
  let currentTheme = "pity-timer";

  // Decoded ElevenLabs AudioBuffer cache & in-flight fetches
  const bufferCache = new Map();
  const pendingLoads = new Map();
  const failedLoads = new Set();

  // Active seamless ambient loop state
  let activeAmbKey = null;
  let activeAmbSrc = null;
  let activeAmbGain = null;

  // Per-event cooldown map to prevent rapid bursts from spamming audio
  const lastFired = new Map();
  function throttle(key, minMs) {
    const now = performance.now();
    const prev = lastFired.get(key) || 0;
    if (now - prev < minMs) return false;
    lastFired.set(key, now);
    return true;
  }

  // Smooth warm car engine hum for Rubber Banding (real-time speed-tracked)
  let engOsc1 = null, engOsc2 = null, engGain = null, engFilter = null;

  function buildNoiseBuffers(ac) {
    const len = ac.sampleRate * 2;
    const mk = (fn) => {
      const b = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) fn(b.getChannelData(ch));
      return b;
    };
    pinkBuf = mk((d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    });
    brownBuf = mk((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.0;
      }
    });
  }

  function loadSample(name) {
    if (!ctx || failedLoads.has(name)) return Promise.resolve(null);
    if (bufferCache.has(name)) return Promise.resolve(bufferCache.get(name));
    if (pendingLoads.has(name)) return pendingLoads.get(name);

    const p = fetch(`${SFX_BASE}${name}.mp3?v=14`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((arr) => ctx.decodeAudioData(arr))
      .then((decoded) => {
        bufferCache.set(name, decoded);
        pendingLoads.delete(name);
        return decoded;
      })
      .catch(() => {
        failedLoads.add(name);
        pendingLoads.delete(name);
        return null;
      });
    pendingLoads.set(name, p);
    return p;
  }

  function preloadTheme(themeId) {
    if (!ctx) return;
    const list = THEME_PRELOADS[themeId] || ["ui_switch_on", "ui_switch_off"];
    for (const name of list) loadSample(name);
    if (musicOn) {
      const pal = ENTRY_TO_PALETTE[themeId] || "feel";
      loadSample(`amb_${pal}`).then(() => syncAmbientTrack());
    }
  }

  function stopActiveAmbient(fadeSec = 0.35) {
    if (!ctx || !activeAmbSrc || !activeAmbGain) return;
    const oldSrc = activeAmbSrc;
    const oldGain = activeAmbGain;
    activeAmbSrc = null;
    activeAmbGain = null;
    activeAmbKey = null;
    const now = ctx.currentTime;
    try {
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), now);
      oldGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
      oldSrc.stop(now + fadeSec + 0.05);
    } catch {}
  }

  function syncAmbientTrack() {
    if (!ctx || !unlocked) return;
    if (!musicOn || tabHidden) {
      stopActiveAmbient(0.28);
      return;
    }
    const pal = ENTRY_TO_PALETTE[currentTheme] || "feel";
    const ambKey = `amb_${pal}`;
    if (activeAmbKey === ambKey && activeAmbSrc) return;

    const buf = bufferCache.get(ambKey);
    if (!buf) {
      loadSample(ambKey).then((loaded) => {
        if (loaded && musicOn && !tabHidden) syncAmbientTrack();
      });
      return;
    }

    stopActiveAmbient(0.65);
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.55, now + 0.90);
    src.connect(g);
    g.connect(musicBus);
    src.start(now);

    activeAmbKey = ambKey;
    activeAmbSrc = src;
    activeAmbGain = g;
  }

  function applyGains() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const active = !tabHidden;
    master.gain.setTargetAtTime(active ? 0.80 : 0.0001, now, 0.04);
    sfxBus.gain.setTargetAtTime(sfxOn && active ? 0.72 : 0.0001, now, 0.03);
    musicBus.gain.setTargetAtTime(musicOn && active ? 0.34 : 0.0001, now, 0.14);
    syncAmbientTrack();
  }

  function ensureContext() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    buildNoiseBuffers(ctx);

    // Master studio glue compressor + gentle 10.5 kHz silky top-end polish
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4.0;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 10500;
    warmth.Q.value = 0.5;

    master = ctx.createGain();
    master.gain.value = 0.80;
    comp.connect(warmth);
    warmth.connect(master);
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? 0.72 : 0.0001;
    sfxBus.connect(comp);

    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.34 : 0.0001;
    musicBus.connect(comp);

    // Subtle stereo ping-pong ambience send for shimmering chimes & parries
    delaySend = ctx.createGain();
    delaySend.gain.value = 0.22;
    const dL = ctx.createDelay(1.0); dL.delayTime.value = 0.22;
    const dR = ctx.createDelay(1.0); dR.delayTime.value = 0.31;
    const fbL = ctx.createGain(); fbL.gain.value = 0.24;
    const fbR = ctx.createGain(); fbR.gain.value = 0.22;
    const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2100;
    const merger = ctx.createChannelMerger(2);
    delaySend.connect(damp);
    damp.connect(dL); damp.connect(dR);
    dL.connect(fbL); fbL.connect(dR);
    dR.connect(fbR); fbR.connect(dL);
    dL.connect(merger, 0, 0);
    dR.connect(merger, 0, 1);
    merger.connect(comp);

    // Warm low-passed car engine synth (silent until Rubber Banding drives)
    engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 190;
    engGain = ctx.createGain();
    engGain.gain.value = 0.0;
    engOsc1 = ctx.createOscillator(); engOsc1.type = "triangle"; engOsc1.frequency.value = 54;
    engOsc2 = ctx.createOscillator(); engOsc2.type = "sine"; engOsc2.frequency.value = 108;
    engOsc1.connect(engFilter); engOsc2.connect(engFilter);
    engFilter.connect(engGain); engGain.connect(sfxBus);
    engOsc1.start(); engOsc2.start();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        tabHidden = document.hidden;
        applyGains();
      });
    }

    unlocked = true;
    applyGains();
    preloadTheme(currentTheme);
    return true;
  }

  function unlock() { ensureContext(); }
  function setSfxOn(v) { sfxOn = !!v; writePref(STORAGE_SFX, sfxOn); applyGains(); }
  function setMusicOn(v) {
    musicOn = !!v;
    writePref(STORAGE_MUSIC, musicOn);
    if (musicOn) ensureContext();
    applyGains();
  }
  function setTheme(themeId) {
    currentTheme = themeId;
    if (themeId !== "rubber-banding") setEngine(0, false);
    if (ctx && unlocked) {
      preloadTheme(themeId);
      syncAmbientTrack();
    }
  }

  // Play decoded ElevenLabs sample with AAA subtle pitch jitter & optional stereo delay send!
  function playSample(name, { gain = 0.72, rate = 1.0, jitter = 0.055, wet = 0.0, fallback = null } = {}) {
    if (!ctx || !unlocked || !sfxOn || tabHidden) return false;
    const buf = bufferCache.get(name);
    if (!buf) {
      loadSample(name);
      if (fallback) fallback();
      return false;
    }
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const r = rate * (1 + (Math.random() * 2 - 1) * jitter);
    src.playbackRate.setValueAtTime(Math.max(0.5, Math.min(2.0, r)), now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    src.connect(g);
    g.connect(sfxBus);

    if (wet > 0 && delaySend) {
      const wg = ctx.createGain();
      wg.gain.value = wet;
      g.connect(wg);
      wg.connect(delaySend);
    }
    src.start(now);
    return true;
  }

  // Warm lightweight synth helpers (used only as instant 0ms fallback before a sample finishes decoding, + melodic stepTone!)
  function playSoftTone(f0, f1, dur, vol, { type = "sine", cutoff = 2200, delay = 0, wet = 0.16, attack = 0.010 } = {}) {
    if (!ctx || !unlocked || !sfxOn || tabHidden || f0 <= 0) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), now + dur);
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(cutoff, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(flt); flt.connect(g); g.connect(sfxBus);
    if (wet > 0 && delaySend) {
      const wg = ctx.createGain(); wg.gain.value = wet; g.connect(wg); wg.connect(delaySend);
    }
    osc.start(now); osc.stop(now + dur + 0.03);
  }

  function playFoleyNoise(dur, { buf = "pink", filterType = "bandpass", freq = 900, freqEnd = null, q = 1.4, vol = 0.10 } = {}) {
    if (!ctx || !unlocked || !sfxOn || tabHidden || !pinkBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf === "brown" ? brownBuf : pinkBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + dur);
    flt.Q.setValueAtTime(q, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt); flt.connect(g); g.connect(sfxBus);
    src.start(now, Math.random() * 1.2);
    src.stop(now + dur + 0.03);
  }

  function setEngine(speedNorm, nitroOn) {
    if (!ctx || !engGain || !engOsc1 || !engOsc2 || !engFilter) return;
    const now = ctx.currentTime;
    if (!sfxOn || tabHidden || speedNorm <= 0.02) {
      engGain.gain.setTargetAtTime(0.0001, now, 0.09);
      return;
    }
    const baseFreq = 48 + speedNorm * 68 + (nitroOn ? 28 : 0);
    engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    engOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.06);
    engFilter.frequency.setTargetAtTime(160 + speedNorm * 280 + (nitroOn ? 220 : 0), now, 0.07);
    engGain.gain.setTargetAtTime(0.024 + speedNorm * 0.020 + (nitroOn ? 0.014 : 0), now, 0.07);
  }

  return {
    unlock,
    isUnlocked: () => unlocked,
    getSfxOn: () => sfxOn,
    getMusicOn: () => musicOn,
    getSampleStats: () => ({
      loaded: bufferCache.size,
      pending: pendingLoads.size,
      failed: failedLoads.size,
      ambient: activeAmbKey,
    }),
    setSfxOn,
    setMusicOn,
    setTheme,
    setEngine,

    // --- Racing (#03) ---
    crash() {
      if (!ensureContext() || !throttle("crash", 160)) return;
      playSample("car_crash", { gain: 0.78, jitter: 0.07, fallback: () => playSoftTone(115, 36, 0.24, 0.18, { type: "triangle", cutoff: 520 }) });
    },
    carBump() {
      if (!ensureContext() || !throttle("bump", 120)) return;
      playSample("car_crash", { gain: 0.44, rate: 1.25, jitter: 0.08, fallback: () => playSoftTone(140, 58, 0.12, 0.13, { type: "triangle", cutoff: 680 }) });
    },
    wallScrape() {
      if (!ensureContext() || !throttle("scrape", 110)) return;
      playFoleyNoise(0.08, { buf: "pink", freq: 920, q: 1.8, vol: 0.06 });
    },
    nitro() {
      if (!ensureContext() || !throttle("nitro", 220)) return;
      playSample("nitro_boost", { gain: 0.68, jitter: 0.05, wet: 0.12, fallback: () => playSoftTone(240, 480, 0.20, 0.09) });
    },
    elasticTwang(boost = true) {
      if (!ensureContext() || !throttle("twang", 240)) return;
      playSample(boost ? "coyote_save" : "ui_switch_off", { gain: 0.45, rate: boost ? 1.0 : 0.92, jitter: 0.04, fallback: () => playSoftTone(boost ? 260 : 440, boost ? 440 : 260, 0.22, 0.08) });
    },
    lapChime() {
      if (!ensureContext() || !throttle("lap", 350)) return;
      playSample("goal_win", { gain: 0.62, rate: 1.08, jitter: 0.02, wet: 0.18, fallback: () => playSoftTone(523.25, 783.99, 0.24, 0.10) });
    },

    // --- Melee Combat (#02) & Warhammer (#05) ---
    slash(combo = 0) {
      if (!ensureContext() || !throttle("slash", 95)) return;
      playSample("sword_slash", { gain: combo === 2 ? 0.78 : 0.62, rate: combo === 2 ? 0.88 : 1.0 + combo * 0.08, jitter: 0.06, fallback: () => playFoleyNoise(0.14, { freq: 1200, freqEnd: 460 }) });
    },
    hitEnemy(heavy = false) {
      if (!ensureContext() || !throttle("hit", 85)) return;
      playSample("hit_enemy", { gain: heavy ? 0.82 : 0.64, rate: heavy ? 0.86 : 1.04, jitter: 0.07, fallback: () => playSoftTone(170, 54, 0.15, 0.16, { type: "triangle" }) });
    },
    enemyKo() {
      if (!ensureContext() || !throttle("ko", 140)) return;
      playSample("enemy_ko", { gain: 0.72, jitter: 0.05, wet: 0.14, fallback: () => playSoftTone(440, 659.25, 0.20, 0.10) });
    },
    block() {
      if (!ensureContext() || !throttle("block", 100)) return;
      playSample("shield_block", { gain: 0.70, jitter: 0.06, fallback: () => playSoftTone(540, 380, 0.13, 0.12, { type: "triangle" }) });
    },
    parry() {
      if (!ensureContext() || !throttle("parry", 150)) return;
      playSample("perfect_parry", { gain: 0.84, jitter: 0.03, wet: 0.24, fallback: () => playSoftTone(880, 1320, 0.24, 0.13) });
    },
    dodge() {
      if (!ensureContext() || !throttle("dodge", 110)) return;
      playSample("dodge_roll", { gain: 0.58, jitter: 0.07, fallback: () => playFoleyNoise(0.12, { freq: 720, freqEnd: 380 }) });
    },
    tokenPass() {
      if (!ensureContext() || !throttle("token", 140)) return;
      playSample("ui_switch_on", { gain: 0.44, rate: 1.15, jitter: 0.04, wet: 0.15, fallback: () => playSoftTone(523.25, 783.99, 0.16, 0.08) });
    },
    playerHurt() {
      if (!ensureContext() || !throttle("hurt", 180)) return;
      playSample("player_hurt", { gain: 0.72, jitter: 0.06, fallback: () => playSoftTone(135, 58, 0.18, 0.16, { type: "triangle" }) });
    },

    // --- Maze (#01), Flow Field (#10) & BSP Dungeon (#13) ---
    wallClick(placed = true) {
      if (!ensureContext() || !throttle("wall", 65)) return;
      playSample(placed ? "wall_place" : "wall_erase", { gain: 0.62, jitter: 0.07, fallback: () => playSoftTone(placed ? 220 : 340, placed ? 150 : 440, 0.07, 0.09, { type: "triangle" }) });
    },
    stepTone(distToGoal) {
      if (!ensureContext() || !throttle("step", 140)) return;
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
      const idx = Math.max(0, Math.min(scale.length - 1, Math.round((1 - Math.min(20, distToGoal) / 20) * (scale.length - 1))));
      playSoftTone(scale[idx], scale[idx], 0.14, 0.065, { type: "sine", cutoff: 1800, wet: 0.34 });
    },
    goalWin() {
      if (!ensureContext() || !throttle("win", 320)) return;
      playSample("goal_win", { gain: 0.76, jitter: 0.02, wet: 0.22, fallback: () => playSoftTone(523.25, 1046.5, 0.30, 0.10) });
    },

    // --- Platformer (#04, #07) ---
    jump() {
      if (!ensureContext() || !throttle("jump", 90)) return;
      playSample("jump", { gain: 0.62, jitter: 0.06, fallback: () => playSoftTone(260, 490, 0.14, 0.10) });
    },
    coyoteSave() {
      if (!ensureContext() || !throttle("coyote", 120)) return;
      playSample("coyote_save", { gain: 0.74, jitter: 0.04, wet: 0.22, fallback: () => playSoftTone(392.0, 783.99, 0.18, 0.11) });
    },
    bufferLaunch() {
      if (!ensureContext() || !throttle("buf", 120)) return;
      playSample("coyote_save", { gain: 0.72, rate: 1.12, jitter: 0.04, wet: 0.22, fallback: () => playSoftTone(440.0, 880.0, 0.17, 0.11) });
    },
    inputIgnored() {
      if (!ensureContext() || !throttle("ign", 150)) return;
      playSample("ui_blocked", { gain: 0.60, jitter: 0.05, fallback: () => playSoftTone(175, 115, 0.12, 0.10, { type: "triangle" }) });
    },
    land() {
      if (!ensureContext() || !throttle("land", 90)) return;
      playSample("land", { gain: 0.48, jitter: 0.08, fallback: () => playFoleyNoise(0.06, { buf: "brown", filterType: "lowpass", freq: 420 }) });
    },
    coinPickup() {
      if (!ensureContext() || !throttle("coin", 90)) return;
      playSample("coin_pickup", { gain: 0.64, jitter: 0.06, wet: 0.16, fallback: () => playSoftTone(880, 1174.66, 0.18, 0.08) });
    },
    fallVoid() {
      if (!ensureContext() || !throttle("fall", 280)) return;
      playSample("fall_void", { gain: 0.62, jitter: 0.04, wet: 0.16, fallback: () => playSoftTone(290, 105, 0.30, 0.10) });
    },

    // --- Hitstop Warhammer (#05) ---
    hammerSwing(juicy = true) {
      if (!ensureContext() || !throttle("hsw", 110)) return;
      playSample("hammer_swing", { gain: juicy ? 0.68 : 0.34, rate: juicy ? 1.0 : 1.24, jitter: 0.06, fallback: () => playFoleyNoise(0.16, { freq: 560, freqEnd: 260 }) });
    },
    hammerImpact(juicy = true, heavy = false) {
      if (!ensureContext() || !throttle("himp", 130)) return;
      if (!juicy) {
        playSample("ui_blocked", { gain: 0.38, rate: 1.25, jitter: 0.05, fallback: () => playSoftTone(170, 120, 0.06, 0.06) });
        return;
      }
      playSample("hammer_impact", { gain: heavy ? 0.92 : 0.74, rate: heavy ? 0.88 : 1.02, jitter: 0.05, wet: 0.16, fallback: () => playSoftTone(130, 38, 0.24, 0.20, { type: "triangle" }) });
    },
    golemShatter(juicy = true) {
      if (!ensureContext() || !throttle("shat", 220)) return;
      playSample("golem_shatter", { gain: juicy ? 0.84 : 0.40, jitter: 0.05, wet: juicy ? 0.16 : 0.0, fallback: () => playFoleyNoise(0.30, { buf: "brown", filterType: "lowpass", freq: 520 }) });
    },

    // --- Sci-Fi Railgun (#06, #11), Tactical Shotgun (#12), Mercy Shield & Dash ---
    laserShot(friendly = true) {
      if (!ensureContext() || !throttle("laser", 95)) return;
      playSample("railgun_shot", { gain: friendly ? 0.66 : 0.42, rate: friendly ? 1.04 : 0.82, jitter: 0.06, wet: 0.10, fallback: () => playSoftTone(friendly ? 680 : 420, 220, 0.12, 0.09, { type: "triangle" }) });
    },
    shotgun() {
      if (!ensureContext() || !throttle("shotgun", 140)) return;
      playSample("shotgun_blast", { gain: 0.72, jitter: 0.07, wet: 0.08, fallback: () => playSoftTone(140, 44, 0.18, 0.18, { type: "triangle" }) });
    },
    laserHit() {
      if (!ensureContext() || !throttle("lhit", 110)) return;
      playSample("hit_enemy", { gain: 0.58, rate: 1.15, jitter: 0.07, fallback: () => playSoftTone(165, 68, 0.14, 0.13, { type: "triangle" }) });
    },
    mercyShield() {
      if (!ensureContext() || !throttle("msh", 220)) return;
      playSample("mercy_shield", { gain: 0.74, jitter: 0.03, wet: 0.20, fallback: () => playSoftTone(392.0, 783.99, 0.24, 0.11) });
    },
    sandDash() {
      if (!ensureContext() || !throttle("dash", 120)) return;
      playSample("sand_dash", { gain: 0.62, jitter: 0.06, fallback: () => playFoleyNoise(0.16, { freq: 1050, freqEnd: 520 }) });
    },

    // --- Stealth Museum (#08), Reef (#09), Vault Loot (#14) & UI Switches ---
    chestLegendary() {
      if (!ensureContext() || !throttle("chestLeg", 280)) return;
      playSample("chest_legendary", { gain: 0.84, jitter: 0.02, wet: 0.24, fallback: () => playSoftTone(523.25, 1046.5, 0.34, 0.11) });
    },
    coinClink() {
      if (!ensureContext() || !throttle("clink", 130)) return;
      playSample("coin_clink", { gain: 0.72, jitter: 0.06, wet: 0.20, fallback: () => playSoftTone(1568, 1396, 0.10, 0.08) });
    },
    suspicionTick(level = 0.5) {
      if (!ensureContext() || !throttle("susp", 180)) return;
      playSample("ui_switch_on", { gain: 0.36 + level * 0.22, rate: 0.90 + level * 0.40, jitter: 0.03, fallback: () => playSoftTone(330 + level * 320, 400 + level * 340, 0.09, 0.07) });
    },
    alertBuzzer() {
      if (!ensureContext() || !throttle("alert", 320)) return;
      playSample("alert_sting", { gain: 0.76, jitter: 0.03, wet: 0.18, fallback: () => playSoftTone(587.33, 293.66, 0.22, 0.12, { type: "triangle" }) });
    },
    waterRipple() {
      if (!ensureContext() || !throttle("water", 150)) return;
      playSample("water_ripple", { gain: 0.64, jitter: 0.08, wet: 0.20, fallback: () => playSoftTone(380, 620, 0.16, 0.07) });
    },
    ruleSwitch(on = true) {
      if (!ensureContext() || !throttle("sw", 90)) return;
      playSample(on ? "ui_switch_on" : "ui_switch_off", { gain: 0.58, jitter: 0.04, fallback: () => playSoftTone(on ? 440 : 523.25, on ? 659.25 : 349.23, 0.11, 0.08) });
    },
  };
}
