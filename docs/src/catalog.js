// Game Design Codex (GDC) catalog — playable 3D game-design mini-games from gamedev.pl.

export const CODEX_CATEGORIES = [
  { id: "all", en: "All", pl: "Wszystkie" },
  { id: "feel", en: "Game Feel & Camera", pl: "Game Feel i Kamera" },
  { id: "ai", en: "Enemy & Race AI", pl: "AI Przeciwników" },
  { id: "crowds", en: "Pathfinding & Crowds", pl: "Nawigacja i Roje" },
  { id: "systems", en: "World & Systems", pl: "Świat i Systemy" },
];

export const CODEX_ENTRIES = [
  {
    id: "pity-timer",
    accent: "#f59e0b",
    category: "systems",
    thumb: "thumbs/pity-timer.jpg",
    module: "./entries/pity-timer/index.js",
    title: {
      en: "Pity Timer & Pseudo-Random Drops",
      pl: "Pity Timer i Oszukany RNG",
    },
    kicker: {
      en: "LOOT SYSTEMS · PLAYABLE MINI-GAME #14",
      pl: "SYSTEMY LOOTU · GRYWALNA MINI-GRA #14",
    },
    question: {
      en: "Why '10% drop rate' in RPGs & Dota secretly climbs on every miss so you never suffer a 30-pull dry streak.",
      pl: "Czemu '10% dropu' w RPG i Docie po cichu rośnie po każdym pudle, żebyś nigdy nie miał serii 30 porażek.",
    },
    note: {
      en: "Watch BOTH royal chests roll side-by-side off the exact same RNG stream! Left (True 10% RNG) stacks a towering crimson dry-streak tower (20+ misses), while Right (Hidden Pity + PRD) fills its golden charge ring and guarantees a Legendary by pull #12. Click / Space to Open Both, or [V] for a 50× Race!",
      pl: "Obserwuj OBIE skrzynie losujące obok siebie z tej samej kości RNG! Lewa (Czyste 10%) piętrzy czerwoną wieżę 20+ pudeł, a Prawa (Ukryty Pity + PRD) ładuje złoty pierścień i gwarantuje Legendę najpóźniej przy 12. próbie. Klik / Spacja otwiera obie, a [V] robi wyścig 50×!",
    },
    hint: {
      en: "Space / Click = Open Both · V = Race 50× · T = Cycle Pity Cap (12 / 8 / 16) · R = Reset",
      pl: "Spacja / Klik = Otwórz Obie · V = Wyścig 50× · T = Zmień Limit Pity (12 / 8 / 16) · R = Reset",
    },
  },
  {
    id: "bsp-dungeon",
    accent: "#a855f7",
    category: "systems",
    thumb: "thumbs/bsp-dungeon.jpg",
    module: "./entries/bsp-dungeon/index.js",
    title: {
      en: "Procedural Dungeon (BSP + MST)",
      pl: "Proceduralny Loch (BSP + MST)",
    },
    kicker: {
      en: "WORLD GEN · PLAYABLE MINI-GAME #13",
      pl: "GENERACJA ŚWIATA · GRYWALNA MINI-GRA #13",
    },
    question: {
      en: "How roguelikes generate thousands of 3D dungeons and NEVER trap the player away from the exit.",
      pl: "Jak roguelike generuje tysiące lochów 3D i NIGDY nie odcina gracza od wyjścia.",
    },
    note: {
      en: "Press Space or Click to roll new seeds, and walk with WASD (or watch the Delver auto-walk the verified path). Toggle [T] between BSP + Spanning Tree (0 overlapping rooms, 100% Flood-Fill solvable) vs Pure Random (ugly overlaps & unreachable red exit islands!).",
      pl: "Wciśnij Spację lub Kliknij po nowy seed i chodź WASD (albo obserwuj auto-marsz rycerza). Przełączaj [T] między BSP + Drzewem (0 kolizji, 100% przejścia) a Czystym Losowaniem (nachodzące pokoje i odcięte czerwone wyspy!).",
    },
    hint: {
      en: "Space / Click = New Seed · WASD = Explore · T = BSP+MST / Random · X = BSP Splits & Graph",
      pl: "Spacja / Klik = Nowy Seed · WASD = Zwiedzaj · T = BSP+MST / Losowy · X = Drzewo BSP",
    },
  },
  {
    id: "ai-director",
    accent: "#ef4444",
    category: "ai",
    thumb: "thumbs/ai-director.jpg",
    module: "./entries/ai-director/index.js",
    title: {
      en: "AI Director (L4D Pacing)",
      pl: "AI Director (Tempo Fali L4D)",
    },
    kicker: {
      en: "PACING AI · PLAYABLE MINI-GAME #12",
      pl: "AI TEMPA · GRYWALNA MINI-GRA #12",
    },
    question: {
      en: "Why you always barely survive zombie waves: Build-Up → Peak → Relax intensity curves & mercy medkits.",
      pl: "Czemu w Left 4 Dead zawsze cudem przeżywasz falę: wykres napięcia Build-Up → Peak → Relax i apteczki.",
    },
    note: {
      en: "Kite across the stormy helipad with WASD and fire your shotgun with Space / Click (or watch auto-survival!). Watch the live L4D Intensity Curve: when stress peaks, the AI Director cuts spawns to 0 (Relax) and drops Medkits — turn it OFF [T] for relentless unfair spawns.",
      pl: "Biegaj po dachu (WASD) i strzelaj Spacją / LPM (albo oglądaj auto-obronę!). Patrz na wykres stresu: gdy napięcie sięga szczytu, AI Director odcina spawn do zera (Relax) i zrzuca apteczki — wyłącz go [T], żeby zobaczyć nieuczciwy zalew.",
    },
    hint: {
      en: "WASD = Kite · Space / Click = Shotgun · T = AI Director / Constant Spawn · V = Trigger Peak Wave",
      pl: "WASD = Ruch · Spacja / LPM = Strzelba · T = AI Director / Stały Spawn · V = Wywołaj Falę",
    },
  },
  {
    id: "bullet-magnetism",
    accent: "#f43f5e",
    category: "feel",
    thumb: "thumbs/bullet-magnetism.jpg",
    module: "./entries/bullet-magnetism/index.js",
    title: {
      en: "Bullet Magnetism & Aim Assist",
      pl: "Magnetyzm Pocisków (Aim Assist)",
    },
    kicker: {
      en: "SHOOTING FEEL · PLAYABLE MINI-GAME #11",
      pl: "FEEL STRZELANIA · GRYWALNA MINI-GRA #11",
    },
    question: {
      en: "Why shots in Halo & Destiny hit when you miss: ±7.5° mid-air bullet curving & reticle friction.",
      pl: "Czemu w Halo i Destiny trafiasz w głowę, choć celownik był obok: zakrzywianie pocisków ±7.5° i tarcie.",
    },
    note: {
      en: "Watch the auto-demo fire deliberate +5.2° off-target shots (or aim with Mouse / A-D and fire with Click / Space)! With Magnetism ON [T] the plasma arc visibly curves into a headshot — toggle Raw 0° [T] or press Near-Miss Test [V] to watch identical shots whiz past.",
      pl: "Obserwuj auto-demo oddające celowe strzały +5.2° obok celu (albo celuj myszką / A-D i strzelaj LPM / Spacją)! Z Magnetyzmem [T] łuk plazmy zakrzywia się w głowę — przełącz Raw 0° [T] lub wciśnij Test Pudła [V], żeby zobaczyć pudła.",
    },
    hint: {
      en: "Mouse / A-D = Aim · Click / Space = Fire · V = Near-Miss (+5.2°) Test · T = Magnetism / Raw 0° · X = Cones",
      pl: "Mysz / A-D = Celuj · Klik / Spacja = Strzał · V = Test +5.2° · T = Magnetyzm / Raw 0° · X = Stożki",
    },
  },
  {
    id: "flow-field",
    accent: "#22c55e",
    category: "crowds",
    thumb: "thumbs/flow-field.jpg",
    module: "./entries/flow-field/index.js",
    title: {
      en: "Flow Field & Dynamic NavMesh",
      pl: "Flow Field i Dynamiczny NavMesh",
    },
    kicker: {
      en: "CROWD PATHING · PLAYABLE MINI-GAME #10",
      pl: "NAWIGACJA TŁUMU · GRYWALNA MINI-GRA #10",
    },
    question: {
      en: "How RTS games move 96+ units around walls you paint LIVE using ONE O(grid) vector field instead of 96 A* runs.",
      pl: "Jak gry RTS prowadzą 96+ jednostek wokół ścian rysowanych NA ŻYWO jednym polem wektorów zamiast 96 osobnych A*.",
    },
    note: {
      en: "Click & drag across tiles to paint or erase 3D Obsidian Walls LIVE, and Shift+Click (or press Space) to move the Golden Goal Spire! Watch 96 Hover-Bots reroute like liquid along the 1× BFS Flow Arrows — then press [T] for Naive mode to see them jam dead-stuck.",
      pl: "Przeciągnij LPM po kafelkach, żeby malować lub usuwać ściany 3D NA ŻYWO, a Shift+Klik (lub Spacja) przenosi Złoty Cel! Zobacz, jak 96 botów opływa ściany po jednym polu strzałek — a potem wciśnij [T] (tryb Naiwny), żeby zobaczyć zator.",
    },
    hint: {
      en: "Drag LPM = Paint/Erase Walls · Right-Drag = Orbit · Shift+Click / Space = Move Goal · T = Flow/Naive · V = Maze · X = Arrows",
      pl: "Przeciągnij LPM = Rysuj/Usuń ściany · PPM = Kamera · Shift+Klik / Spacja = Cel · T = Flow/Naiwny · V = Labirynt · X = Strzałki",
    },
  },
  {
    id: "boids-flocking",
    accent: "#06b6d4",
    category: "crowds",
    thumb: "thumbs/boids-flocking.jpg",
    module: "./entries/boids-flocking/index.js",
    title: {
      en: "Boids & Flocking (3 Rules)",
      pl: "Boids i Rój (3 Reguły)",
    },
    kicker: {
      en: "CROWD AI · PLAYABLE MINI-GAME #09",
      pl: "AI ROJU · GRYWALNA MINI-GRA #09",
    },
    question: {
      en: "How 72 fish swim as one synchronized school with zero leader — just Separation, Alignment & Cohesion.",
      pl: "Jak 72 ryby płyną jak jedna zgrana ławica bez żadnego lidera — tylko Separacja, Zgodność i Spójność.",
    },
    note: {
      en: "Click the reef or drive with WASD to steer the Predator Shark through 72 live 3D boids! Toggle Separation [T], Alignment [L], and Cohesion [K] individually and watch the Gold Inspector Boid's live force vectors — turn Separation OFF to see the school collapse into a clump.",
      pl: "Kliknij rafę lub steruj WASD Rekinem wśród 72 boidów 3D! Wyłączaj osobno Separację [T], Zgodność [L] i Spójność [K] i obserwuj wektory sił na Złotej Rybie — wyłącz Separację, a ławica zbije się w jeden kłąb.",
    },
    hint: {
      en: "WASD / Click = Steer Shark · T = Separation · L = Alignment · K = Cohesion · F = Shark Auto · V = Preset · X = Vectors",
      pl: "WASD / Klik = Steruj Rekinem · T = Separacja · L = Zgodność · K = Spójność · F = Rekin Auto · V = Preset · X = Wektory",
    },
  },
  {
    id: "stealth-cones",
    accent: "#8b5cf6",
    category: "ai",
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
    category: "feel",
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
    category: "feel",
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
    category: "feel",
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
    category: "feel",
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
    category: "ai",
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
    category: "ai",
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
    category: "crowds",
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
