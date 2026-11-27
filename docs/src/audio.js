// Procedural Web Audio API SFX & Adaptive Music Engine for Game Design Codex (/gdc/).
// Zero external audio assets — unlocks cleanly on first click or keypress, with independent SFX & Music toggles.

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let sfxOn = true;
  let musicOn = true;
  let unlocked = false;
  let currentTheme = "rubber-banding";
  let stepIndex = 0;
  let timerId = null;

  // Continuous engine synthesizer nodes for Rubber Banding!
  let engOsc1 = null;
  let engOsc2 = null;
  let engGain = null;
  let engFilter = null;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? 0.85 : 0.0;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.24 : 0.0;
    musicBus.connect(master);

    // Setup continuous low-latency car engine hum (starts silent until Rubber Banding drives)
    engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 280;
    engGain = ctx.createGain();
    engGain.gain.value = 0.0;
    engOsc1 = ctx.createOscillator();
    engOsc1.type = "sawtooth";
    engOsc1.frequency.value = 62;
    engOsc2 = ctx.createOscillator();
    engOsc2.type = "triangle";
    engOsc2.frequency.value = 124;
    engOsc1.connect(engFilter);
    engOsc2.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(sfxBus);
    engOsc1.start();
    engOsc2.start();

    unlocked = true;
    startSequencer();
    return true;
  }

  function unlock() {
    ensureContext();
  }

  function setSfxOn(v) {
    sfxOn = !!v;
    if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(sfxOn ? 0.85 : 0.0, ctx.currentTime, 0.03);
  }

  function setMusicOn(v) {
    musicOn = !!v;
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.24 : 0.0, ctx.currentTime, 0.06);
  }

  function setTheme(themeId) {
    currentTheme = themeId;
    // Silence car engine when leaving racing entry
    if (themeId !== "rubber-banding") setEngine(0, false);
  }

  // Soft adaptive musical loops tailored to each Codex entry!
  const THEMES = {
    "rubber-banding": {
      tempoMs: 145,
      bass: [130.81, 130.81, 146.83, 164.81, 110.0, 110.0, 130.81, 146.83, 87.31, 87.31, 110.0, 130.81, 98.0, 98.0, 123.47, 146.83],
      lead: [523.25, 0, 659.25, 587.33, 523.25, 0, 392.0, 440.0, 523.25, 0, 659.25, 783.99, 659.25, 587.33, 523.25, 0],
      wave: "triangle",
    },
    "attack-tokens": {
      tempoMs: 185,
      bass: [146.83, 0, 146.83, 130.81, 116.54, 0, 116.54, 130.81, 98.0, 0, 98.0, 116.54, 110.0, 0, 130.81, 110.0],
      lead: [293.66, 349.23, 440.0, 0, 349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23, 329.63, 293.66, 0, 220.0, 0],
      wave: "sine",
    },
    "astar": {
      tempoMs: 170,
      bass: [130.81, 0, 196.0, 0, 110.0, 0, 164.81, 0, 146.83, 0, 220.0, 0, 196.0, 0, 146.83, 0],
      lead: [523.25, 587.33, 659.25, 0, 783.99, 659.25, 587.33, 0, 440.0, 523.25, 659.25, 0, 587.33, 493.88, 392.0, 0],
      wave: "sine",
    },
    "coyote-time": {
      tempoMs: 140,
      bass: [164.81, 0, 246.94, 0, 196.0, 0, 293.66, 0, 146.83, 0, 220.0, 0, 196.0, 220.0, 246.94, 0],
      lead: [659.25, 0, 783.99, 880.0, 987.77, 0, 783.99, 659.25, 587.33, 0, 659.25, 783.99, 659.25, 587.33, 493.88, 0],
      wave: "triangle",
    },
    "hitstop": {
      tempoMs: 165,
      bass: [110.0, 0, 110.0, 0, 130.81, 0, 98.0, 0, 110.0, 0, 146.83, 0, 130.81, 0, 98.0, 82.41],
      lead: [220.0, 0, 261.63, 293.66, 329.63, 0, 293.66, 0, 220.0, 0, 329.63, 392.0, 329.63, 293.66, 261.63, 0],
      wave: "sawtooth",
    },
    "fake-1hp": {
      tempoMs: 135,
      bass: [110.0, 110.0, 0, 110.0, 130.81, 130.81, 0, 130.81, 146.83, 146.83, 0, 146.83, 98.0, 98.0, 110.0, 0],
      lead: [440.0, 0, 523.25, 659.25, 587.33, 0, 523.25, 440.0, 659.25, 0, 783.99, 659.25, 587.33, 523.25, 440.0, 0],
      wave: "square",
    },
    "camera-deadzone": {
      tempoMs: 145,
      bass: [146.83, 0, 146.83, 155.56, 146.83, 0, 130.81, 0, 146.83, 0, 185.0, 196.0, 185.0, 155.56, 146.83, 0],
      lead: [587.33, 622.25, 739.99, 783.99, 739.99, 622.25, 587.33, 0, 880.0, 783.99, 739.99, 622.25, 587.33, 0, 440.0, 0],
      wave: "triangle",
    },
    "stealth-cones": {
      tempoMs: 190,
      bass: [110.0, 0, 130.81, 0, 123.47, 0, 98.0, 0, 110.0, 0, 146.83, 0, 138.59, 0, 110.0, 0],
      lead: [440.0, 0, 0, 523.25, 493.88, 0, 440.0, 0, 392.0, 0, 440.0, 523.25, 587.33, 0, 493.88, 0],
      wave: "sine",
    },
    "boids-flocking": {
      tempoMs: 175,
      bass: [130.81, 0, 196.0, 0, 146.83, 0, 220.0, 0, 164.81, 0, 246.94, 0, 146.83, 0, 196.0, 0],
      lead: [523.25, 659.25, 783.99, 0, 880.0, 783.99, 659.25, 0, 587.33, 659.25, 783.99, 987.77, 783.99, 659.25, 523.25, 0],
      wave: "sine",
    },
    "flow-field": {
      tempoMs: 155,
      bass: [110.0, 0, 164.81, 146.83, 110.0, 0, 130.81, 146.83, 98.0, 0, 146.83, 130.81, 110.0, 0, 164.81, 0],
      lead: [440.0, 0, 523.25, 659.25, 587.33, 0, 523.25, 440.0, 392.0, 0, 493.88, 587.33, 659.25, 0, 523.25, 0],
      wave: "triangle",
    },
    "bullet-magnetism": {
      tempoMs: 138,
      bass: [123.47, 123.47, 0, 146.83, 164.81, 0, 146.83, 123.47, 98.0, 98.0, 0, 110.0, 123.47, 0, 146.83, 0],
      lead: [493.88, 0, 587.33, 659.25, 739.99, 0, 659.25, 587.33, 493.88, 0, 659.25, 739.99, 987.77, 0, 739.99, 0],
      wave: "square",
    },
    "ai-director": {
      tempoMs: 160,
      bass: [98.0, 0, 98.0, 103.83, 98.0, 0, 87.31, 0, 98.0, 0, 116.54, 110.0, 98.0, 0, 82.41, 0],
      lead: [293.66, 0, 311.13, 0, 293.66, 261.63, 233.08, 0, 293.66, 0, 349.23, 311.13, 293.66, 0, 220.0, 0],
      wave: "sawtooth",
    },
    "bsp-dungeon": {
      tempoMs: 180,
      bass: [130.81, 0, 155.56, 0, 196.0, 0, 155.56, 0, 116.54, 0, 146.83, 0, 174.61, 0, 155.56, 0],
      lead: [523.25, 0, 622.25, 587.33, 523.25, 0, 392.0, 0, 466.16, 0, 587.33, 622.25, 783.99, 0, 622.25, 0],
      wave: "sine",
    },
    "pity-timer": {
      tempoMs: 150,
      bass: [146.83, 0, 220.0, 0, 164.81, 0, 246.94, 0, 196.0, 0, 293.66, 0, 220.0, 196.0, 164.81, 0],
      lead: [587.33, 659.25, 739.99, 880.0, 739.99, 0, 659.25, 587.33, 783.99, 880.0, 987.77, 1174.66, 880.0, 0, 739.99, 0],
      wave: "triangle",
    },
  };

  function playMusicTone(freq, dur, vol, type = "triangle", detune = 0) {
    if (!ctx || !musicBus || !musicOn || freq <= 0) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (detune) osc.detune.setValueAtTime(detune, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(musicBus);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function startSequencer() {
    if (timerId) return;
    const tick = () => {
      const th = THEMES[currentTheme] || THEMES["rubber-banding"];
      if (ctx && ctx.state === "running" && musicOn) {
        const i = stepIndex % th.bass.length;
        const b = th.bass[i];
        const l = th.lead[i];
        if (b > 0) playMusicTone(b, th.tempoMs * 0.0018, 0.24, "triangle");
        if (l > 0) playMusicTone(l, th.tempoMs * 0.0014, 0.16, th.wave, 4);
      }
      stepIndex++;
      timerId = setTimeout(tick, (THEMES[currentTheme] || THEMES["rubber-banding"]).tempoMs);
    };
    tick();
  }

  // Helper: white noise burst for crashes, sword whooshes, stone clicks
  function playNoise(dur, filterFreq, q, vol, filterType = "bandpass") {
    if (!ctx || !sfxBus || !sfxOn) return;
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, now);
    filt.Q.setValueAtTime(q, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxBus);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function playTone(f0, f1, dur, vol, type = "sine") {
    if (!ctx || !sfxBus || !sfxOn) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // --- Game-Specific SFX API ---
  function setEngine(speedNorm, nitroOn) {
    if (!ctx || !engGain || !engOsc1 || !engOsc2 || !engFilter) return;
    const now = ctx.currentTime;
    if (!sfxOn || speedNorm <= 0.02) {
      engGain.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }
    const baseFreq = 54 + speedNorm * 88 + (nitroOn ? 38 : 0);
    engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
    engOsc2.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.05);
    engFilter.frequency.setTargetAtTime(220 + speedNorm * 460 + (nitroOn ? 420 : 0), now, 0.06);
    engGain.gain.setTargetAtTime(0.042 + speedNorm * 0.035 + (nitroOn ? 0.025 : 0), now, 0.06);
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

    // Racing SFX
    crash() {
      if (!ensureContext()) return;
      playTone(135, 38, 0.24, 0.28, "triangle");
      playNoise(0.28, 420, 1.4, 0.20, "lowpass");
    },
    carBump() {
      if (!ensureContext()) return;
      playTone(175, 72, 0.12, 0.22, "sawtooth");
      playNoise(0.09, 850, 1.6, 0.14, "bandpass");
    },
    wallScrape() {
      if (!ensureContext()) return;
      playNoise(0.08, 1250, 2.2, 0.09, "bandpass");
      playTone(120, 82, 0.09, 0.10, "triangle");
    },
    nitro() {
      if (!ensureContext()) return;
      playNoise(0.22, 1600, 1.8, 0.11, "bandpass");
      playTone(260, 580, 0.22, 0.11, "triangle");
    },
    elasticTwang(boost = true) {
      if (!ensureContext()) return;
      playTone(boost ? 240 : 480, boost ? 540 : 260, 0.28, 0.12, "sine");
    },
    lapChime() {
      if (!ensureContext()) return;
      playTone(523.25, 523.25, 0.18, 0.14, "triangle");
      setTimeout(() => playTone(659.25, 659.25, 0.18, 0.14, "triangle"), 75);
      setTimeout(() => playTone(783.99, 783.99, 0.30, 0.16, "triangle"), 150);
    },

    // Combat SFX
    slash(combo = 0) {
      if (!ensureContext()) return;
      const pitch = combo === 2 ? 1250 : combo === 1 ? 1850 : 1600;
      playNoise(0.14, pitch, 2.2, 0.16, "bandpass");
      playTone(combo === 2 ? 260 : 340, 140, 0.13, 0.10, "triangle");
    },
    hitEnemy(heavy = false) {
      if (!ensureContext()) return;
      playTone(heavy ? 180 : 220, 62, 0.15, heavy ? 0.26 : 0.20, "sawtooth");
      playNoise(0.10, 950, 1.4, 0.14, "bandpass");
    },
    enemyKo() {
      if (!ensureContext()) return;
      playTone(440, 660, 0.16, 0.14, "triangle");
      setTimeout(() => playTone(660, 880, 0.24, 0.16, "triangle"), 70);
    },
    block() {
      if (!ensureContext()) return;
      playTone(620, 410, 0.14, 0.18, "square");
      playNoise(0.08, 2400, 3.0, 0.12, "bandpass");
    },
    parry() {
      if (!ensureContext()) return;
      playTone(880, 1320, 0.26, 0.22, "triangle");
      setTimeout(() => playTone(1320, 1760, 0.32, 0.20, "sine"), 55);
      playNoise(0.10, 3400, 4.0, 0.12, "bandpass");
    },
    dodge() {
      if (!ensureContext()) return;
      playNoise(0.12, 900, 1.2, 0.11, "bandpass");
    },
    tokenPass() {
      if (!ensureContext()) return;
      playTone(587.33, 880, 0.18, 0.10, "sine");
    },
    playerHurt() {
      if (!ensureContext()) return;
      playTone(150, 52, 0.22, 0.24, "sawtooth");
    },

    // A* Maze SFX
    wallClick(placed = true) {
      if (!ensureContext()) return;
      playTone(placed ? 210 : 320, placed ? 120 : 440, 0.08, 0.16, "triangle");
      playNoise(0.05, placed ? 650 : 1200, 1.5, 0.08, "bandpass");
    },
    stepTone(distToGoal) {
      if (!ensureContext()) return;
      // Ascending pentatonic pitch as distance gets closer to 0!
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
      const idx = Math.max(0, Math.min(scale.length - 1, Math.round((1 - Math.min(20, distToGoal) / 20) * (scale.length - 1))));
      playTone(scale[idx], scale[idx] * 1.02, 0.12, 0.11, "sine");
    },
    goalWin() {
      if (!ensureContext()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => playTone(f, f, 0.34, 0.14, "triangle"), i * 75);
      });
    },

    // Platformer / Coyote Time SFX
    jump() {
      if (!ensureContext()) return;
      playTone(280, 560, 0.14, 0.16, "triangle");
    },
    coyoteSave() {
      if (!ensureContext()) return;
      playTone(392.0, 783.99, 0.16, 0.19, "triangle");
      setTimeout(() => playTone(783.99, 1046.5, 0.18, 0.14, "sine"), 45);
    },
    bufferLaunch() {
      if (!ensureContext()) return;
      playTone(440.0, 880.0, 0.15, 0.19, "triangle");
      setTimeout(() => playTone(880.0, 1174.66, 0.18, 0.14, "sine"), 40);
    },
    inputIgnored() {
      if (!ensureContext()) return;
      playTone(170, 95, 0.14, 0.20, "sawtooth");
    },
    land() {
      if (!ensureContext()) return;
      playNoise(0.06, 520, 1.3, 0.10, "lowpass");
      playTone(145, 82, 0.07, 0.09, "triangle");
    },
    coinPickup() {
      if (!ensureContext()) return;
      playTone(987.77, 987.77, 0.09, 0.14, "sine");
      setTimeout(() => playTone(1318.51, 1318.51, 0.20, 0.14, "sine"), 65);
    },
    fallVoid() {
      if (!ensureContext()) return;
      playTone(320, 95, 0.34, 0.16, "triangle");
    },

    // Hitstop & Game Juice Forge Warhammer SFX (Raw dry tap vs Visceral Sub-Bass Anvil Crunch!)
    hammerSwing(juicy = true) {
      if (!ensureContext()) return;
      if (!juicy) {
        playNoise(0.08, 700, 1.0, 0.05, "bandpass");
        return;
      }
      playNoise(0.18, 520, 1.5, 0.16, "bandpass");
      playTone(210, 88, 0.16, 0.11, "triangle");
    },
    hammerImpact(juicy = true, heavy = false) {
      if (!ensureContext()) return;
      if (!juicy) {
        // Deliberately flat wet-cardboard tap when Juice is OFF!
        playTone(190, 130, 0.055, 0.07, "sine");
        return;
      }
      // Visceral sub-bass slam + metallic anvil harmonic ring + stone crunch!
      playTone(heavy ? 125 : 155, 34, heavy ? 0.32 : 0.22, heavy ? 0.34 : 0.26, "triangle");
      playTone(heavy ? 880 : 1040, heavy ? 620 : 780, 0.19, heavy ? 0.15 : 0.10, "sine");
      playNoise(heavy ? 0.22 : 0.14, 980, 1.3, heavy ? 0.24 : 0.18, "bandpass");
    },
    golemShatter(juicy = true) {
      if (!ensureContext()) return;
      if (!juicy) {
        playTone(160, 90, 0.09, 0.08, "sine");
        return;
      }
      playNoise(0.35, 620, 0.9, 0.24, "lowpass");
      playTone(160, 38, 0.36, 0.26, "sawtooth");
      setTimeout(() => playTone(660, 990, 0.28, 0.14, "sine"), 55);
    },

    // Cyber Fake 1 HP SFX
    laserShot(friendly = true) {
      if (!ensureContext()) return;
      if (friendly) {
        playTone(920, 340, 0.11, 0.14, "triangle");
      } else {
        playTone(540, 210, 0.12, 0.09, "sawtooth");
      }
    },
    laserHit() {
      if (!ensureContext()) return;
      playTone(190, 68, 0.16, 0.22, "sawtooth");
      playNoise(0.10, 1100, 1.5, 0.12, "bandpass");
    },
    mercyShield() {
      if (!ensureContext()) return;
      playTone(440, 880, 0.22, 0.20, "triangle");
      setTimeout(() => playTone(880, 1320, 0.26, 0.18, "sine"), 50);
    },

    // Desert Canyon Dash SFX
    sandDash() {
      if (!ensureContext()) return;
      playNoise(0.18, 1400, 1.4, 0.14, "bandpass");
      playTone(320, 640, 0.14, 0.12, "triangle");
    },

    // Stealth Museum SFX (Brass coin clink, ? suspicion rising tick, ! alert siren sting)
    coinClink() {
      if (!ensureContext()) return;
      playTone(2180, 1840, 0.09, 0.14, "sine");
      setTimeout(() => playTone(2640, 2320, 0.14, 0.11, "triangle"), 55);
    },
    suspicionTick(level = 0.5) {
      if (!ensureContext()) return;
      const f = 360 + level * 420;
      playTone(f, f * 1.15, 0.09, 0.11, "triangle");
    },
    alertBuzzer() {
      if (!ensureContext()) return;
      // Classic sharp stealth "!" metal sting!
      playTone(880, 1180, 0.12, 0.24, "sawtooth");
      setTimeout(() => playTone(660, 440, 0.24, 0.22, "sawtooth"), 90);
      playNoise(0.12, 1800, 2.5, 0.14, "bandpass");
    },

    // Reef Lagoon / Boids SFX
    waterRipple() {
      if (!ensureContext()) return;
      playTone(460, 740, 0.14, 0.11, "sine");
      playNoise(0.11, 900, 1.8, 0.06, "bandpass");
    },
    ruleSwitch(on = true) {
      if (!ensureContext()) return;
      playTone(on ? 420 : 520, on ? 680 : 300, 0.10, 0.12, "triangle");
    },
  };
}
