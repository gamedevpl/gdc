// Studio-Grade Procedural Web Audio API Engine for Game Design Codex (/gdc/).
// Zero external assets — warm master compressor, low-passed stereo ping-pong ambience delay,
// pink/brown noise foley, rate-limited non-fatiguing SFX, and optional chill Maj7/m9 ambient soundscapes!

const STORAGE_SFX = "gdc_sfx";
const STORAGE_MUSIC = "gdc_music";

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

// Chill studio Maj7/m9 ambient music palettes (slow 110–125 BPM, warm low-pass filtered, zero harsh square/sawtooth!)
const AMBIENT_PALETTES = {
  feel: {
    stepMs: 480,
    cutoff: 1250,
    chords: [
      [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj7
      [146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
      [130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
      [196.00, 246.94, 293.66, 329.63, 392.00], // G6
    ],
    arp: [0, 2, 4, 3, 1, 3, 2, 4],
  },
  ai: {
    stepMs: 520,
    cutoff: 1120,
    chords: [
      [110.00, 164.81, 196.00, 246.94, 329.63], // Am9
      [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj7
      [146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
      [164.81, 196.00, 246.94, 293.66, 329.63], // Em7
    ],
    arp: [0, 3, 2, 4, 2, 1, 3, 2],
  },
  crowds: {
    stepMs: 500,
    cutoff: 1380,
    chords: [
      [130.81, 164.81, 196.00, 246.94, 293.66], // Cmaj9
      [196.00, 246.94, 293.66, 329.63, 440.00], // G6/9
      [146.83, 196.00, 220.00, 293.66, 369.99], // D6/9
      [164.81, 196.00, 246.94, 293.66, 369.99], // Em9
    ],
    arp: [0, 2, 3, 4, 3, 2, 4, 1],
  },
  systems: {
    stepMs: 540,
    cutoff: 1200,
    chords: [
      [146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
      [116.54, 174.61, 220.00, 293.66, 349.23], // Bbmaj7
      [130.81, 196.00, 261.63, 329.63, 392.00], // Csus2
      [110.00, 164.81, 220.00, 246.94, 329.63], // Am9
    ],
    arp: [0, 2, 4, 2, 1, 3, 4, 2],
  },
};

const ENTRY_TO_PALETTE = {
  "coyote-time": "feel",
  "hitstop": "feel",
  "fake-1hp": "feel",
  "camera-deadzone": "feel",
  "bullet-magnetism": "feel",
  "attack-tokens": "ai",
  "rubber-banding": "ai",
  "stealth-cones": "ai",
  "ai-director": "ai",
  "astar": "crowds",
  "boids-flocking": "crowds",
  "flow-field": "crowds",
  "bsp-dungeon": "systems",
  "pity-timer": "systems",
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
  let stepIndex = 0;
  let timerId = null;

  // Per-event cooldown map to prevent auto-demos or rapid bursts from spamming audio!
  const lastFired = new Map();
  function throttle(key, minMs) {
    const now = performance.now();
    const prev = lastFired.get(key) || 0;
    if (now - prev < minMs) return false;
    lastFired.set(key, now);
    return true;
  }

  // Smooth warm car engine hum for Rubber Banding (filtered triangle + sub sine, zero harsh sawtooth buzz!)
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

  function applyGains() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const active = !tabHidden;
    master.gain.setTargetAtTime(active ? 0.72 : 0.0001, now, 0.05);
    sfxBus.gain.setTargetAtTime(sfxOn && active ? 0.56 : 0.0001, now, 0.04);
    musicBus.gain.setTargetAtTime(musicOn && active ? 0.22 : 0.0001, now, 0.14);
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

    // Master studio glue compressor + gentle 6.2 kHz warmth roll-off
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 5.0;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;

    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 6200;
    warmth.Q.value = 0.5;

    master = ctx.createGain();
    master.gain.value = 0.72;
    comp.connect(warmth);
    warmth.connect(master);
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? 0.56 : 0.0001;
    sfxBus.connect(comp);

    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.22 : 0.0001;
    musicBus.connect(comp);

    // Warm stereo ping-pong ambience delay send (like FX Lab!)
    delaySend = ctx.createGain();
    delaySend.gain.value = 0.26;
    const dL = ctx.createDelay(1.0); dL.delayTime.value = 0.24;
    const dR = ctx.createDelay(1.0); dR.delayTime.value = 0.34;
    const fbL = ctx.createGain(); fbL.gain.value = 0.32;
    const fbR = ctx.createGain(); fbR.gain.value = 0.30;
    const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1750;
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
    startAmbientLoop();
    return true;
  }

  function unlock() { ensureContext(); }
  function setSfxOn(v) { sfxOn = !!v; writePref(STORAGE_SFX, sfxOn); applyGains(); }
  function setMusicOn(v) { musicOn = !!v; writePref(STORAGE_MUSIC, musicOn); applyGains(); }
  function setTheme(themeId) {
    currentTheme = themeId;
    if (themeId !== "rubber-banding") setEngine(0, false);
  }

  // Warm filtered synth note with soft attack/release and optional stereo delay send
  function playSoftTone(f0, f1, dur, vol, { type = "sine", cutoff = 2400, bus = null, delay = 0, wet = 0.18, attack = 0.010 } = {}) {
    if (!ctx || !unlocked || tabHidden || f0 <= 0) return;
    const targetBus = bus || sfxBus;
    if (targetBus === sfxBus && !sfxOn) return;
    if (targetBus === musicBus && !musicOn) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), now + dur);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(cutoff, now);
    flt.Q.value = 0.7;

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(targetBus);
    if (wet > 0 && delaySend) {
      const wg = ctx.createGain();
      wg.gain.value = wet;
      g.connect(wg);
      wg.connect(delaySend);
    }
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  function playFoleyNoise(dur, { buf = "pink", filterType = "bandpass", freq = 900, freqEnd = null, q = 1.4, vol = 0.12, attack = 0.005, delay = 0 } = {}) {
    if (!ctx || !unlocked || !sfxOn || tabHidden || !pinkBuf) return;
    const now = ctx.currentTime + delay;
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
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(flt); flt.connect(g); g.connect(sfxBus);
    src.start(now, Math.random() * 1.2);
    src.stop(now + dur + 0.03);
  }

  // Slow, lush ambient Maj7/m9 pad + sparse kalimba pulse (ZERO chiptune buzz!)
  function startAmbientLoop() {
    if (timerId) return;
    const tick = () => {
      const pal = AMBIENT_PALETTES[ENTRY_TO_PALETTE[currentTheme] || "feel"];
      if (ctx && ctx.state === "running" && musicOn && !tabHidden) {
        const chordIdx = Math.floor(stepIndex / 8) % pal.chords.length;
        const chord = pal.chords[chordIdx];
        const beat = stepIndex % 8;

        // Warm swelling chord pad on beat 0
        if (beat === 0) {
          playSoftTone(chord[0] * 0.5, chord[0] * 0.5, pal.stepMs * 0.0076, 0.15, { type: "sine", cutoff: 620, bus: musicBus, wet: 0.25, attack: 0.35 });
          playSoftTone(chord[1], chord[1], pal.stepMs * 0.0072, 0.075, { type: "triangle", cutoff: pal.cutoff * 0.65, bus: musicBus, wet: 0.35, attack: 0.45 });
          playSoftTone(chord[3], chord[3], pal.stepMs * 0.0072, 0.065, { type: "sine", cutoff: pal.cutoff * 0.75, bus: musicBus, wet: 0.40, attack: 0.50 });
        }
        // Gentle Rhodes/kalimba pluck on sparse beats
        if (beat === 0 || beat === 2 || beat === 3 || beat === 5 || beat === 6) {
          const note = chord[pal.arp[beat] % chord.length] * (beat === 5 ? 2.0 : 1.0);
          playSoftTone(note, note, pal.stepMs * 0.0028, 0.09, { type: "sine", cutoff: pal.cutoff, bus: musicBus, wet: 0.48, attack: 0.016 });
        }
      }
      stepIndex++;
      timerId = setTimeout(tick, (AMBIENT_PALETTES[ENTRY_TO_PALETTE[currentTheme] || "feel"]).stepMs);
    };
    tick();
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
    engGain.gain.setTargetAtTime(0.028 + speedNorm * 0.024 + (nitroOn ? 0.015 : 0), now, 0.07);
  }

  return {
    unlock,
    isUnlocked: () => unlocked,
    getSfxOn: () => sfxOn,
    getMusicOn: () => musicOn,
    setSfxOn,
    setMusicOn,
    setTheme,
    setEngine,

    // --- Warm, Non-Fatiguing, Rate-Limited Foley & Musical SFX ---
    crash() {
      if (!ensureContext() || !throttle("crash", 160)) return;
      playSoftTone(115, 36, 0.24, 0.22, { type: "triangle", cutoff: 520, wet: 0.12 });
      playFoleyNoise(0.24, { buf: "brown", filterType: "lowpass", freq: 420, freqEnd: 120, vol: 0.18 });
    },
    carBump() {
      if (!ensureContext() || !throttle("bump", 120)) return;
      playSoftTone(140, 58, 0.12, 0.16, { type: "triangle", cutoff: 680 });
      playFoleyNoise(0.09, { buf: "brown", freq: 520, vol: 0.11 });
    },
    wallScrape() {
      if (!ensureContext() || !throttle("scrape", 110)) return;
      playFoleyNoise(0.08, { buf: "pink", freq: 920, q: 1.8, vol: 0.07 });
    },
    nitro() {
      if (!ensureContext() || !throttle("nitro", 220)) return;
      playFoleyNoise(0.22, { buf: "pink", freq: 720, freqEnd: 1650, q: 1.4, vol: 0.10 });
      playSoftTone(240, 480, 0.20, 0.09, { type: "sine", cutoff: 1400, wet: 0.25 });
    },
    elasticTwang(boost = true) {
      if (!ensureContext() || !throttle("twang", 240)) return;
      playSoftTone(boost ? 260 : 440, boost ? 440 : 260, 0.22, 0.09, { type: "sine", cutoff: 1200, wet: 0.30 });
    },
    lapChime() {
      if (!ensureContext() || !throttle("lap", 350)) return;
      [523.25, 659.25, 783.99].forEach((f, i) => playSoftTone(f, f, 0.24, 0.11, { type: "sine", delay: i * 0.07, wet: 0.42 }));
    },

    // Combat & Warhammer
    slash(combo = 0) {
      if (!ensureContext() || !throttle("slash", 95)) return;
      playFoleyNoise(0.14, { buf: "pink", freq: combo === 2 ? 920 : 1350, freqEnd: 460, q: 1.8, vol: 0.12 });
      playSoftTone(combo === 2 ? 220 : 300, 130, 0.12, 0.08, { type: "triangle", cutoff: 950 });
    },
    hitEnemy(heavy = false) {
      if (!ensureContext() || !throttle("hit", 85)) return;
      playSoftTone(heavy ? 145 : 185, 52, 0.16, heavy ? 0.22 : 0.15, { type: "triangle", cutoff: 760 });
      playFoleyNoise(0.10, { buf: "brown", freq: 620, vol: 0.12 });
    },
    enemyKo() {
      if (!ensureContext() || !throttle("ko", 140)) return;
      playSoftTone(440, 659.25, 0.18, 0.11, { type: "sine", wet: 0.36 });
      playSoftTone(659.25, 880, 0.26, 0.10, { type: "sine", delay: 0.07, wet: 0.42 });
    },
    block() {
      if (!ensureContext() || !throttle("block", 100)) return;
      playSoftTone(540, 380, 0.13, 0.13, { type: "triangle", cutoff: 1400, wet: 0.22 });
      playFoleyNoise(0.07, { buf: "pink", freq: 1800, q: 2.5, vol: 0.08 });
    },
    parry() {
      if (!ensureContext() || !throttle("parry", 150)) return;
      playSoftTone(783.99, 1174.66, 0.24, 0.15, { type: "sine", wet: 0.46 });
      playSoftTone(1174.66, 1567.98, 0.30, 0.12, { type: "sine", delay: 0.055, wet: 0.50 });
    },
    dodge() {
      if (!ensureContext() || !throttle("dodge", 110)) return;
      playFoleyNoise(0.13, { buf: "pink", freq: 740, freqEnd: 380, q: 1.2, vol: 0.09 });
    },
    tokenPass() {
      if (!ensureContext() || !throttle("token", 140)) return;
      playSoftTone(523.25, 783.99, 0.18, 0.09, { type: "sine", wet: 0.38 });
    },
    playerHurt() {
      if (!ensureContext() || !throttle("hurt", 180)) return;
      playSoftTone(135, 58, 0.20, 0.18, { type: "triangle", cutoff: 580 });
      playFoleyNoise(0.12, { buf: "brown", filterType: "lowpass", freq: 380, vol: 0.12 });
    },

    // Maze & Flow Field
    wallClick(placed = true) {
      if (!ensureContext() || !throttle("wall", 65)) return;
      playSoftTone(placed ? 220 : 340, placed ? 150 : 440, 0.07, 0.11, { type: "triangle", cutoff: 1100, wet: 0.15 });
      playFoleyNoise(0.045, { buf: "brown", freq: placed ? 520 : 900, vol: 0.07 });
    },
    stepTone(distToGoal) {
      if (!ensureContext() || !throttle("step", 140)) return;
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
      const idx = Math.max(0, Math.min(scale.length - 1, Math.round((1 - Math.min(20, distToGoal) / 20) * (scale.length - 1))));
      playSoftTone(scale[idx], scale[idx], 0.14, 0.075, { type: "sine", cutoff: 1800, wet: 0.35 });
    },
    goalWin() {
      if (!ensureContext() || !throttle("win", 320)) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        playSoftTone(f, f, 0.36, 0.11, { type: "sine", delay: i * 0.075, wet: 0.48 })
      );
    },

    // Platformer / Coyote Time
    jump() {
      if (!ensureContext() || !throttle("jump", 90)) return;
      playSoftTone(260, 490, 0.14, 0.11, { type: "sine", cutoff: 1600, wet: 0.22 });
    },
    coyoteSave() {
      if (!ensureContext() || !throttle("coyote", 120)) return;
      playSoftTone(392.0, 783.99, 0.18, 0.13, { type: "sine", wet: 0.38 });
      playSoftTone(783.99, 1046.5, 0.22, 0.10, { type: "sine", delay: 0.05, wet: 0.44 });
    },
    bufferLaunch() {
      if (!ensureContext() || !throttle("buf", 120)) return;
      playSoftTone(440.0, 880.0, 0.17, 0.13, { type: "sine", wet: 0.38 });
      playSoftTone(880.0, 1174.66, 0.20, 0.10, { type: "sine", delay: 0.045, wet: 0.44 });
    },
    inputIgnored() {
      if (!ensureContext() || !throttle("ign", 150)) return;
      // Soft wooden muted thud instead of harsh sawtooth buzzer!
      playSoftTone(175, 115, 0.12, 0.12, { type: "triangle", cutoff: 620 });
    },
    land() {
      if (!ensureContext() || !throttle("land", 90)) return;
      playFoleyNoise(0.06, { buf: "brown", filterType: "lowpass", freq: 420, vol: 0.09 });
      playSoftTone(125, 72, 0.07, 0.08, { type: "sine", cutoff: 450 });
    },
    coinPickup() {
      if (!ensureContext() || !throttle("coin", 90)) return;
      playSoftTone(880, 880, 0.11, 0.09, { type: "sine", wet: 0.38 });
      playSoftTone(1174.66, 1174.66, 0.22, 0.09, { type: "sine", delay: 0.06, wet: 0.46 });
    },
    fallVoid() {
      if (!ensureContext() || !throttle("fall", 280)) return;
      playSoftTone(290, 105, 0.32, 0.12, { type: "sine", cutoff: 900, wet: 0.30 });
    },

    // Hitstop Warhammer (deep warm sub-bass anvil punch vs soft dry tap)
    hammerSwing(juicy = true) {
      if (!ensureContext() || !throttle("hsw", 110)) return;
      playFoleyNoise(juicy ? 0.18 : 0.08, { buf: "pink", freq: juicy ? 560 : 780, freqEnd: 260, vol: juicy ? 0.13 : 0.05 });
    },
    hammerImpact(juicy = true, heavy = false) {
      if (!ensureContext() || !throttle("himp", 130)) return;
      if (!juicy) {
        playSoftTone(170, 120, 0.06, 0.06, { type: "sine", cutoff: 520 });
        return;
      }
      playSoftTone(heavy ? 115 : 145, 36, heavy ? 0.28 : 0.20, heavy ? 0.26 : 0.20, { type: "triangle", cutoff: 620, wet: 0.16 });
      playSoftTone(heavy ? 784 : 988, heavy ? 587 : 740, 0.18, 0.08, { type: "sine", wet: 0.34 });
      playFoleyNoise(heavy ? 0.20 : 0.13, { buf: "brown", freq: 680, vol: heavy ? 0.18 : 0.13 });
    },
    golemShatter(juicy = true) {
      if (!ensureContext() || !throttle("shat", 220)) return;
      playFoleyNoise(0.32, { buf: "brown", filterType: "lowpass", freq: 580, freqEnd: 140, vol: juicy ? 0.18 : 0.07 });
      if (juicy) {
        playSoftTone(140, 42, 0.32, 0.20, { type: "triangle", cutoff: 520 });
        playSoftTone(587.33, 880, 0.28, 0.10, { type: "sine", delay: 0.06, wet: 0.42 });
      }
    },

    // Cyber / Railgun Plasma Shot (warm filtered sci-fi pluck, NEVER ear-piercing sawtooth!)
    laserShot(friendly = true) {
      if (!ensureContext() || !throttle("laser", 95)) return;
      if (friendly) {
        playSoftTone(680, 260, 0.12, 0.11, { type: "triangle", cutoff: 1850, wet: 0.26 });
      } else {
        playSoftTone(420, 190, 0.11, 0.07, { type: "sine", cutoff: 1100, wet: 0.18 });
      }
    },
    laserHit() {
      if (!ensureContext() || !throttle("lhit", 110)) return;
      playSoftTone(165, 68, 0.14, 0.15, { type: "triangle", cutoff: 680 });
      playFoleyNoise(0.09, { buf: "pink", freq: 920, vol: 0.09 });
    },
    mercyShield() {
      if (!ensureContext() || !throttle("msh", 220)) return;
      playSoftTone(392.0, 783.99, 0.24, 0.13, { type: "sine", wet: 0.42 });
      playSoftTone(783.99, 1174.66, 0.28, 0.11, { type: "sine", delay: 0.06, wet: 0.48 });
    },
    sandDash() {
      if (!ensureContext() || !throttle("dash", 120)) return;
      playFoleyNoise(0.16, { buf: "pink", freq: 1100, freqEnd: 520, vol: 0.11 });
      playSoftTone(300, 560, 0.13, 0.08, { type: "sine", wet: 0.25 });
    },

    // Stealth Museum & Reef & UI Switches
    coinClink() {
      if (!ensureContext() || !throttle("clink", 130)) return;
      playSoftTone(1568, 1396, 0.10, 0.09, { type: "sine", cutoff: 3200, wet: 0.40 });
      playSoftTone(2093, 1975, 0.14, 0.07, { type: "sine", delay: 0.055, cutoff: 3400, wet: 0.45 });
    },
    suspicionTick(level = 0.5) {
      if (!ensureContext() || !throttle("susp", 180)) return;
      const f = 330 + level * 320;
      playSoftTone(f, f * 1.12, 0.09, 0.08, { type: "sine", cutoff: 1600, wet: 0.28 });
    },
    alertBuzzer() {
      if (!ensureContext() || !throttle("alert", 320)) return;
      // Crisp cinematic low-brass + chime sting (dramatic, NOT ear-shredding sawtooth!)
      playSoftTone(587.33, 659.25, 0.14, 0.14, { type: "triangle", cutoff: 1700, wet: 0.34 });
      playSoftTone(440.0, 293.66, 0.24, 0.13, { type: "triangle", delay: 0.08, cutoff: 1200, wet: 0.34 });
    },
    waterRipple() {
      if (!ensureContext() || !throttle("water", 150)) return;
      playSoftTone(380, 620, 0.16, 0.08, { type: "sine", cutoff: 1400, wet: 0.42 });
      playFoleyNoise(0.12, { buf: "pink", freq: 720, q: 1.6, vol: 0.05 });
    },
    ruleSwitch(on = true) {
      if (!ensureContext() || !throttle("sw", 90)) return;
      playSoftTone(on ? 440 : 523.25, on ? 659.25 : 349.23, 0.11, 0.09, { type: "sine", cutoff: 1800, wet: 0.28 });
    },
  };
}
