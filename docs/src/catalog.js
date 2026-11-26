// Game Design Codex (GDC) catalog — playable 3D game-design mini-games from gamedev.pl.

export const CODEX_ENTRIES = [
  {
    id: "stealth-cones",
    accent: "#8b5cf6",
    category: "Stealth AI",
    thumb: "thumbs/stealth-cones.jpg",
    module: "./entries/stealth-cones/index.js",
    title: {
      en: "Stealth Vision Cones (? → !)",
      pl: "Stożki Wzroku i Skradanie (? → !)",
    },
    kicker: {
      en: "STEALTH AI · PLAYABLE MINI-GAME #08",
      pl: "AI SKRADANIA · GRYWALNA MINI-GRA #08",
    },
    question: {
      en: "Why stealth guards are blind on purpose: 65° raycasted cones, ? → ! meters & distraction coins.",
      pl: "Czemu strażnicy są celowo ślepi: stożki 65° z raycastem za filarami, pasek ? → ! i moneta-wabik.",
    },
    note: {
      en: "Sneak around marble pillars with WASD + Shift (Crouch = silent & 2.2× slower spotting), steal all 3 Emerald Relics, and toss Brass Coins (E / Space / Click) to lure guards. Compare Game Stealth (65° + ? → !) vs Realistic Human Vision (140° · 0 ms instant spot — press Peek Test V!).",
      pl: "Skradaj się za marmurowymi filarami (WASD + Shift kucanie = cisza i 2.2× wolniejsze wykrywanie), ukradnij 3 szmaragdowe relikty i rzucaj monety-wabiki (E / Spacja / Klik). Porównaj Skradanie Gry (65° + ? → !) z Realistycznym Wzrokiem (140° · 0 ms — kliknij Test Wychylenia V!).",
    },
    hint: {
      en: "WASD = Move · Shift = Crouch (Silent) · E / Space / Click = Toss Coin · T = 65°/140° · V = Peek Test · X = X-Ray",
      pl: "WASD = Ruch · Shift = Kucanie (Cisza) · E / Spacja / Klik = Moneta · T = 65°/140° · V = Test Wychylenia · X = X-Ray",
    },
  },
  {
    id: "camera-deadzone",
    accent: "#eab308",
    category: "Camera Feel",
    thumb: "thumbs/camera-deadzone.jpg",
    module: "./entries/camera-deadzone/index.js",
    title: {
      en: "Camera Deadzone & Look-Ahead",
      pl: "Deadzone i Look-Ahead Kamery",
    },
    kicker: {
      en: "CAMERA FEEL · PLAYABLE MINI-GAME #07",
      pl: "PRACA KAMERY · GRYWALNA MINI-GRA #07",
    },
    question: {
      en: "Sprint past spinning temple traps and feel why game cameras use Deadzone boxes & Look-Ahead.",
      pl: "Przebiegnij tor z wirującymi piłami i poczuj, czemu kamery używają strefy Deadzone i Look-Ahead.",
    },
    note: {
      en: "Run with A/D, Jump with Space, and Dash with Shift across the canyon temple gauntlet. Compare Smart Cam (Deadzone box + Look-Ahead tether) vs Rigid Locked (0 deadzone — press Wiggle Test V to feel the jitter!).",
      pl: "Biegnij (A/D), skacz (Spacja) i rób Dash (Shift) przez pustynną świątynię. Porównaj Smart Cam (pudełko Deadzone + wyprzedzanie Look-Ahead) ze Sztywną Kamerą (kliknij Test Wiggle V, żeby poczuć drgania!).",
    },
    hint: {
      en: "A/D = Run · Space / Click = Jump · Shift = Sand Dash · T = Smart/Rigid · L = Look-Ahead · X = Overlay · V = Wiggle",
      pl: "A/D = Bieg · Spacja / LPM = Skok · Shift = Dash · T = Smart/Sztywna · L = Look-Ahead · X = Siatka · V = Wiggle",
    },
  },
  {
    id: "fake-1hp",
    accent: "#ec4899",
    category: "Player Survival",
    thumb: "thumbs/fake-1hp.jpg",
    module: "./entries/fake-1hp/index.js",
    title: {
      en: "Fake 1 HP & Death's Door",
      pl: "Oszukane 1 HP (Death's Door)",
    },
    kicker: {
      en: "SURVIVAL MATH · PLAYABLE MINI-GAME #06",
      pl: "MATEMATYKA PRZETRWANIA · GRYWALNA MINI-GRA #06",
    },
    question: {
      en: "Why you always survive on 1 pixel of red health: hidden HP, 1 HP clamps & mercy aim scatter.",
      pl: "Czemu tak często przeżywasz na 1 pikselu HP: ukryty pasek życia, tarcza 1 HP i rozrzut laserów AI.",
    },
    note: {
      en: "Weave through drone lasers with WASD + Shift Dash and shoot back with Space / Click. Watch the X-Ray HUD: the bottom 20% of your red bar secretly holds 50% of your REAL HP, lethal hits clamp to 1 HP, and enemy cones flare to ±27°!",
      pl: "Omijaj lasery dronów (WASD + Shift Dash) i strzelaj Spacją / LPM. Zobacz pasek X-Ray: dolne 20% czerwonego paska kryje aż 50% prawdziwego HP, śmiertelny strzał zatrzymuje się na 1 HP, a stożki celowania dronów rozszerzają się do ±27°!",
    },
    hint: {
      en: "WASD = Move · Space / Click = Shoot · Shift = Dash · T = Fake 1 HP / Honest · X = X-Ray · H = Big Hit",
      pl: "WASD = Ruch · Spacja / LPM = Strzał · Shift = Dash · T = Triki 1 HP / Uczciwe · X = X-Ray · H = Mocny cios",
    },
  },
  {
    id: "hitstop",
    accent: "#f97316",
    category: "Combat Feel",
    thumb: "thumbs/hitstop.jpg",
    module: "./entries/hitstop/index.js",
    title: {
      en: "Hitstop & Game Juice",
      pl: "Hitstop i Game Juice",
    },
    kicker: {
      en: "COMBAT FEEL · PLAYABLE MINI-GAME #05",
      pl: "FEEL WALKI · GRYWALNA MINI-GRA #05",
    },
    question: {
      en: "Smash stone golems with a giant warhammer and feel why a 60 ms freeze makes hits 10× heavier.",
      pl: "Rozbijaj kamienne golemy wielkim młotem i poczuj, czemu 60 ms zamrożenia daje 10× cięższe ciosy.",
    },
    note: {
      en: "Stride around the forge with WASD and swing your Runed Warhammer with Space or Click (3rd hit = Overhead Anvil Crush!). Toggle Full Juice vs Raw (0 ms), cycle Hitstop (0 / 60 / 115 ms), and watch the live 60 FPS Frame Strip freeze in gold.",
      pl: "Chodź po kuźni (WASD) i uderzaj wielkim młotem Spacją lub LPM (3. cios = ciężkie uderzenie znad głowy!). Przełączaj Full Juice vs Raw (0 ms), zmieniaj Hitstop (0 / 60 / 115 ms) i patrz na pasek klatek 60 FPS.",
    },
    hint: {
      en: "WASD = Move · Space / Click = 3-Hit Hammer Combo · Shift = Dash Slam · T = Juice · H = Hitstop ms · K = Flash/Kick",
      pl: "WASD = Ruch · Spacja / LPM = 3-ciosowe Combo · Shift = Doskok · T = Juice · H = Hitstop ms · K = Błysk/Odrzut",
    },
  },
  {
    id: "coyote-time",
    accent: "#2dd4bf",
    category: "Platformer Feel",
    thumb: "thumbs/coyote-time.jpg",
    module: "./entries/coyote-time/index.js",
    title: {
      en: "Coyote Time & Buffering",
      pl: "Coyote Time i Bufor Skoku",
    },
    kicker: {
      en: "PLATFORMER FEEL · PLAYABLE MINI-GAME #04",
      pl: "FEEL PLATFORMÓWEK · GRYWALNA MINI-GRA #04",
    },
    question: {
      en: "Leap floating sky-islands and feel how 115ms invisible ledges & jump buffers make jumps feel fair.",
      pl: "Skacz po latających wyspach 3D i poczuj, jak 115 ms niewidzialnej półki i bufor skoku ratują kontrolę.",
    },
    note: {
      en: "Run across 6 floating islands with A/D (or Arrows) and jump with Space (hold for higher jumps). Switch between Forgiving (115 ms Coyote Ledge + 125 ms Jump Buffer) and Strict (0 ms) while watching the live millisecond timing bar.",
      pl: "Biegnij po 6 latających wyspach (A/D lub Strzałki) i skacz Spacją (przytrzymaj dla wyższego skoku). Przełączaj tryb Fair (115 ms Coyote + 125 ms Bufor) vs Strict (0 ms) i patrz na licznik milisekund.",
    },
    hint: {
      en: "A/D or Arrows = Run · Space / W / Click = Jump · T = Strict/Fair · C = Cam · M/B = Audio",
      pl: "A/D lub Strzałki = Bieg · Spacja / W / LPM = Skok · T = Strict/Fair · C = Kamera · M/B = Dźwięk",
    },
  },
  {
    id: "rubber-banding",
    accent: "#f59e0b",
    category: "Racing AI",
    thumb: "thumbs/rubber-banding.jpg",
    module: "./entries/rubber-banding/index.js",
    title: {
      en: "Rubber Banding",
      pl: "Rubber Banding (Gumka)",
    },
    kicker: {
      en: "RACING AI · PLAYABLE MINI-GAME #03",
      pl: "AI WYŚCIGOWE · GRYWALNA MINI-GRA #03",
    },
    question: {
      en: "Drive the GP circuit in Follow-Cam and feel AI speed stretch like a rubber band.",
      pl: "Przejedź tor GP z kamerą Follow-Cam i poczuj, jak gumka rozciąga tempo AI.",
    },
    note: {
      en: "Drive the 3D Figure-8 overpass circuit with WASD / Arrows and Space for Nitro (C toggles Follow vs Overview). Stay on the dark tarmac — grinding barriers slows you down, and cars collide cleanly on the same bridge level.",
      pl: "Jedź po 3D ósemce z wiaduktem (WASD / Strzałki, Spacja = Nitro, C = kamera Follow/Ósemka). Trzymaj się asfaltu — ocieranie o bandy wyraźnie hamuje, a na tym samym poziomie zderzasz się z rywalami.",
    },
    hint: {
      en: "WASD / Arrows = Drive · Space = Nitro · C = Follow/Figure-8 Cam · X = Spinout · M/B = Audio",
      pl: "WASD / Strzałki = Jazda · Spacja = Nitro · C = Kamera Follow/Ósemka · X = Poślizg · M/B = Dźwięk",
    },
  },
  {
    id: "attack-tokens",
    accent: "#10b981",
    category: "Combat AI",
    thumb: "thumbs/attack-tokens.jpg",
    module: "./entries/attack-tokens/index.js",
    title: {
      en: "Attack Tokens",
      pl: "Tokeny Ataku (Attack Tokens)",
    },
    kicker: {
      en: "COMBAT AI · PLAYABLE MINI-GAME #02",
      pl: "AI WALKI · GRYWALNA MINI-GRA #02",
    },
    question: {
      en: "Fight 5 skeletons with 3-hit combos, parries & dodge rolls: fair with 1 token, chaos with OFF.",
      pl: "Walcz z 5 szkieletami (3-ciosowe combo, parowanie, unik): fair z 1 tokenem, chaos bez tokenów.",
    },
    note: {
      en: "Move with WASD, press Space or Left-Click for a 3-hit combo, hold Right-Click / E when you see '! PARRY NOW !' for a Perfect Parry, and Shift to Dodge Roll. Try 1 Token vs Tokens OFF.",
      pl: "Chodź WASD, Spacja lub LPM robi 3-ciosowe combo, PPM / E przy błysku '! PARRY NOW !' daje Perfect Parry, a Shift robi unik. Porównaj 1 Token vs Bez tokenów.",
    },
    hint: {
      en: "WASD = Move · Space / Click = 3-Hit Combo · Right-Click / E = Block & Parry · Shift = Dodge · M/B = Audio",
      pl: "WASD = Ruch · Spacja / LPM = 3-ciosowe Combo · PPM / E = Blok/Parowanie · Shift = Unik · M/B = Dźwięk",
    },
  },
  {
    id: "astar",
    accent: "#38bdf8",
    category: "Pathfinding",
    thumb: "thumbs/astar.jpg",
    module: "./entries/astar/index.js",
    title: {
      en: "A* Pathfinding",
      pl: "A* — Szukanie drogi",
    },
    kicker: {
      en: "PATHFINDING · PLAYABLE MINI-GAME #01",
      pl: "PATHFINDING · GRYWALNA MINI-GRA #01",
    },
    question: {
      en: "Paint & erase 3D maze walls by dragging, move the Goal, or walk the numbers to 0.",
      pl: "Rysuj i usuwaj ściany 3D przeciągnięciem myszki, przestawiaj Metę albo przejdź labirynt sam.",
    },
    note: {
      en: "Click & drag directly across tiles to paint or erase stone walls live while distance numbers recalculate instantly. Use Clear to design from scratch, Shift+Click to move Goal (0), or walk with WASD.",
      pl: "Kliknij i przeciągnij myszką po kafelkach, żeby malować albo gumkować ściany 3D na żywo. Użyj Wyczyść, żeby narysować własny labirynt od zera, Shift+Klik przenosi Metę, a WASD chodzi bohaterem.",
    },
    hint: {
      en: "Click & Drag = Paint/Erase Walls · Right-Drag = Orbit · Shift+Click = Move Goal · WASD = Walk · Space = Auto-Solve",
      pl: "Przeciągnij LPM = Rysuj/Usuń ściany · PPM = Kamera · Shift+Klik = Meta · WASD = Chodzenie · Spacja = Auto-Solve",
    },
  },
];

export function getEntryMeta(id) {
  return CODEX_ENTRIES.find(e => e.id === id) || CODEX_ENTRIES[0];
}
