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
    id: "step-up-slopes",
    accent: "#ec4899",
    category: "feel",
    thumb: "thumbs/step-up-slopes.jpg",
    module: "./entries/step-up-slopes/index.js",
    title: {
      en: "Character Controller: Step-Up & Slopes",
      pl: "Kontroler Postaci: Krawężniki i Zbocza",
    },
    kicker: {
      en: "PHYSICS FEEL · PLAYABLE MINI-GAME #30",
      pl: "FIZYKA RUCHU · GRYWALNA MINI-GRA #30",
    },
    question: {
      en: "Why heroes glide effortlessly over 28cm curbs yet slide cleanly off 58° cliffs instead of mountain-goating up walls.",
      pl: "Czemu bohater płynnie wchodzi na krawężnik 28 cm, ale zsuwa się z klifu 58° zamiast wbiegać po pionowej ścianie.",
    },
    note: {
      en: "Run across the 3-zone physics gauntlet with A/D (or press [V] for the 58° Cliff Test)! With Smart Controller ON [T], dual knee/shin rays auto-step up the 28cm curb, climb the 26° ramp smoothly, and slide cleanly off the 58° hazard cliff (>45° cap). Turn it OFF [T] to snag dead-stop on a tiny curb and horse-glitch straight up cliffs.",
      pl: "Przebiegnij 3-strefowy tor testowy (A/D lub [V] Test Klifu 58°)! Ze Smart Kontrolerem [T] postać sama pokonuje próg 28 cm, płynnie idzie pod górę 26° i blokuje się na klifie 58° (>45°). Wyłącz [T], żeby zobaczyć zablokowanie na krawężniku i glitch wspinania po pionowym murze.",
    },
    hint: {
      en: "A/D = Run Course · V = 58° Cliff Test · T = Smart Controller / Naive Capsule · R = Reset",
      pl: "A/D = Biegnij · V = Test Klifu 58° · T = Smart Kontroler / Naiwna Kapsuła · R = Reset",
    },
  },
  {
    id: "steering-avoidance",
    accent: "#f97316",
    category: "crowds",
    thumb: "thumbs/steering-avoidance.jpg",
    module: "./entries/steering-avoidance/index.js",
    title: {
      en: "Steering & Obstacle Avoidance",
      pl: "Steering i Omijanie Przeszkód",
    },
    kicker: {
      en: "AGENT STEERING · PLAYABLE MINI-GAME #29",
      pl: "STEROWANIE AI · GRYWALNA MINI-GRA #29",
    },
    question: {
      en: "How AI hovercraft carve effortlessly through tight canyon pillars using 3 raycast whisker feelers instead of crashing head-first.",
      pl: "Jak pojazdy AI płynnie slalomują między skalnymi filarami dzięki 3 wąsom raycastu zamiast rozbijać się o każdą przeszkodę.",
    },
    note: {
      en: "Click anywhere in the canyon (or press [V] Flip Beacon) to send 6 hover-skiffs racing across the sandstone pillars! Watch their 3 cyan raycast whiskers flash amber on contact and push them laterally around rocks — toggle [T] to Blind Seek-Only to watch the whole squadron slam head-first into pillars.",
      pl: "Kliknij kanion (albo wciśnij [V] Przerzuć Cel), żeby puścić 6 ścigaczy przez slalom z filarów! Patrz, jak 3 cyjanowe wąsy raycastu błyskają na pomarańczowo i płynnie odbijają tor lotu — przełącz [T] na ślepy Seek, żeby zobaczyć karambole.",
    },
    hint: {
      en: "Click = Move Beacon · V = Flip Across Canyon · T = Whiskers / Blind Seek · X = Toggle Rays",
      pl: "Klik = Przenieś Cel · V = Przerzuć Cel · T = Wąsy / Ślepy Seek · X = Promienie",
    },
  },
  {
    id: "fog-of-war",
    accent: "#06b6d4",
    category: "crowds",
    thumb: "thumbs/fog-of-war.jpg",
    module: "./entries/fog-of-war/index.js",
    title: {
      en: "Fog of War & RTS Vision",
      pl: "Mgła Wojny (Fog of War w RTS)",
    },
    kicker: {
      en: "RTS VISIBILITY · PLAYABLE MINI-GAME #28",
      pl: "WIDOCZNOŚĆ RTS · GRYWALNA MINI-GRA #28",
    },
    question: {
      en: "How strategy games separate Unexplored Fog, Explored Shroud memory & raycasted Live Vision behind solid stone ridges.",
      pl: "Jak gry strategiczne rozdzielają Nieodkrytą Mgłę, Szarą Pamięć (Shroud) i Aktywny Wzrok z cieniami za murami.",
    },
    note: {
      en: "Move your Hover-Scout with WASD or Click anywhere to clear the pitch-black Fog of War around stone mountain ridges! Explored tiles drop into cool-slate Shroud (remembering outposts while hiding live enemy raiders). Press [V] for an Orbital Radar Ping, or [T] for Map-Hack to expose all 5 hidden ambushers.",
      pl: "Steruj zwiadowcą (WASD lub Klik), żeby odkrywać czarną mgłę wokół skalnych grzbietów! Odkryte pola przechodzą w szary Shroud (pamiętasz budynki, ale żywi wrogowie znikają). Wciśnij [V] po Skan Radaru albo [T] (Map-Hack), żeby odsłonić wszystkie 5 zasadzek.",
    },
    hint: {
      en: "WASD / Click = Move Scout · V = Radar Scan Ping · T = Fog of War / Map-Hack · R = Reset",
      pl: "WASD / Klik = Zwiad · V = Skan Radaru · T = Mgła Wojny / Map-Hack · R = Reset",
    },
  },
  {
    id: "object-pooling",
    accent: "#f59e0b",
    category: "systems",
    thumb: "thumbs/object-pooling.jpg",
    module: "./entries/object-pooling/index.js",
    title: {
      en: "Object Pooling vs GC Freeze Spikes",
      pl: "Object Pooling kontra Zacięcia GC",
    },
    kicker: {
      en: "MEMORY PERF · PLAYABLE MINI-GAME #27",
      pl: "WYDAJNOŚĆ PAMIĘCI · GRYWALNA MINI-GRA #27",
    },
    question: {
      en: "Why bullet-hell games recycle a pre-allocated Object Pool instead of new/delete so Garbage Collection never freezes your frame rate.",
      pl: "Czemu gry bullet-hell recyklingują gotową pulę obiektów zamiast new/delete, żeby Garbage Collector nigdy nie zamrażał FPS-ów.",
    },
    note: {
      en: "Watch the turret fire 140 plasma orbs while recycled shots zip back into the golden Pool Rack on the right (0 heap allocations, flat 8.3ms oscilloscope)! Toggle [T] to new/delete mode (or hit [V] Bullet Storm) and watch heap garbage climb to 100% — triggering real 195ms Stop-The-World crimson GC freezes!",
      pl: "Patrz, jak wieżyczka strzela 140 kulami, a zużyte pociski wracają do złotej Puli po prawej (0 alokacji, płaski wykres 8.3 ms)! Przełącz [T] na new/delete (albo [V] Burzę Pocisków) i zobacz, jak pełna sterta wywołuje realne 195 ms zacinki Garbage Collectora.",
    },
    hint: {
      en: "T = Object Pool / new-delete GC · V = Bullet Storm 2.5× · R = Reset",
      pl: "T = Object Pool / new-delete GC · V = Burza Pocisków 2.5× · R = Reset",
    },
  },
  {
    id: "behavior-trees",
    accent: "#10b981",
    category: "ai",
    thumb: "thumbs/behavior-trees.jpg",
    module: "./entries/behavior-trees/index.js",
    title: {
      en: "Behavior Trees vs Spaghetti FSM",
      pl: "Drzewa Zachowań (Behavior Trees)",
    },
    kicker: {
      en: "HIERARCHICAL AI · PLAYABLE MINI-GAME #26",
      pl: "HIERARCHIA AI · GRYWALNA MINI-GRA #26",
    },
    question: {
      en: "Why modern game AI uses clean priority Selector trees that interrupt & recover gracefully instead of fragile state-machine spaghetti.",
      pl: "Czemu nowoczesne AI w grach używa czystych drzew decyzyjnych z priorytetami zamiast kruchej plątaniny stanów FSM.",
    },
    note: {
      en: "Watch the live Behavior Tree graph in the top-right HUD light up in sync with the 3D Vault Guard (Root Selector → 1. Heal → 2. Chase → 3. Patrol)! Click to move the Intruder or press [V] to drop the Guard to 22% HP — Branch #1 cleanly preempts Chase, heals up, and resumes. Switch [T] to Broken FSM to trigger a missing-edge deadlock!",
      pl: "Obserwuj żywy graf Drzewa Zachowań w prawym górnym rogu sprzężony ze Strażnikiem 3D (Selector → 1. Leczenie → 2. Pościg → 3. Patrol)! Kliknij, by przestawić Intruza lub wciśnij [V] (22% HP) — gałąź #1 czysto przerywa pościg i wraca po uleczeniu. Włącz [T] zepsuty FSM, by wywołać deadlock!",
    },
    hint: {
      en: "Click = Move Intruder · V = Damage Guard (22% HP) · T = Behavior Tree / Broken FSM · R = Reset",
      pl: "Klik = Przenieś Intruza · V = Zrań Strażnika (22% HP) · T = Behavior Tree / Zepsuty FSM · R = Reset",
    },
  },
  {
    id: "lod-billboards",
    accent: "#a855f7",
    category: "systems",
    thumb: "thumbs/lod-billboards.jpg",
    module: "./entries/lod-billboards/index.js",
    title: {
      en: "Level of Detail (LOD) & Impostors",
      pl: "Level of Detail (LOD) i Billboardy",
    },
    kicker: {
      en: "MESH OPTIMIZATION · PLAYABLE MINI-GAME #25",
      pl: "OPTYMALIZACJA SIATEK · GRYWALNA MINI-GRA #25",
    },
    question: {
      en: "How open worlds draw vast valleys at 144 FPS: swapping distant 964-tri castles down to 148 tris, 24 tris, and 2-tri billboards.",
      pl: "Jak otwarte światy trzymają 144 FPS: zamieniając dalekie zamki z 964 trójkątów na 148, 24 i w końcu płaski 2-trójkątowy billboard.",
    },
    note: {
      en: "Drive the 3D camera down the Alpine Valley with W/S (or click [V] to frame all 4 tiers at once) and watch the real Blender LOD meshes swap live across concentric distance rings — cutting ~75% of all GPU triangles! Toggle [T] LOD OFF to draw every distant keep at full LOD0 detail.",
      pl: "Jedź kamerą 3D przez dolinę (W/S albo kliknij [V], by zobaczyć wszystkie 4 poziomy naraz) i patrz na żywą podmianę modeli z Blendera (LOD0 → LOD1 → LOD2 → Billboard), tnącą ~75% trójkątów GPU! Wyłącz LOD [T], żeby narysować wszystko w pełnym detalu.",
    },
    hint: {
      en: "W/S / Click = Drive Camera · V = Show All 4 Tiers · T = LOD ON/OFF · X = Color-Code Tiers",
      pl: "W/S / Klik = Jedź Kamerą · V = Pokaż 4 Poziomy · T = LOD WŁ/WYŁ · X = Kolory Poziomów",
    },
  },
  {
    id: "client-prediction",
    accent: "#38bdf8",
    category: "systems",
    thumb: "thumbs/client-prediction.jpg",
    module: "./entries/client-prediction/index.js",
    title: {
      en: "Client-Side Prediction & Reconciliation",
      pl: "Predykcja Klienta i Rekoncyliacja",
    },
    kicker: {
      en: "MULTIPLAYER NETCODE · PLAYABLE MINI-GAME #24",
      pl: "NETCODE SIECIOWY · GRYWALNA MINI-GRA #24",
    },
    question: {
      en: "Why online movement feels 0ms instant at 200ms ping — and how servers replay buffered inputs after a rubber-band desync.",
      pl: "Czemu sterowanie w sieci reaguje w 0 ms mimo pingu 200 ms — i jak klient odtwarza bufor klawiszy po desyncu serwera.",
    },
    note: {
      en: "Steer the hover-skiff with WASD (or watch auto-slalom) while the cyan Server Ghost trails -200ms behind along your buffered input trail! Press [V] Inject Desync to watch Reconciliation snap and replay every unacked input. Switch [T] to Server-Wait OFF to feel unbearable 200ms input lag.",
      pl: "Steruj ścigaczem (WASD albo auto-slalom), podczas gdy cyjanowy duch Serwera goni -200 ms za buforem pakietów! Wciśnij [V] Test Desync, by zobaczyć snap i odtworzenie bufora. Wyłącz Predykcję [T], żeby poczuć 200 ms opóźnienia na każdym klawiszu.",
    },
    hint: {
      en: "WASD = Steer · V = Inject Desync (Reconcile!) · T = Prediction / Server-Wait · X = Cycle Ping ms",
      pl: "WASD = Steruj · V = Test Desync (Snap+Replay) · T = Predykcja / Czekaj na Serwer · X = Ping ms",
    },
  },
  {
    id: "ik-foot-placement",
    accent: "#2dd4bf",
    category: "feel",
    thumb: "thumbs/ik-foot-placement.jpg",
    module: "./entries/ik-foot-placement/index.js",
    title: {
      en: "Inverse Kinematics (IK) Foot Placement",
      pl: "Kinematyka Odwrotna (IK) na Schodach",
    },
    kicker: {
      en: "CHARACTER ANIMATION · PLAYABLE MINI-GAME #23",
      pl: "ANIMACJA POSTACI · GRYWALNA MINI-GRA #23",
    },
    question: {
      en: "How 2-Bone analytical IK raycasts down to every stone stair tread, drops the pelvis, and bends knees so boots never clip or float.",
      pl: "Jak analityczne IK 2 kości strzela raycastem w każdy stopień, obniża biodra i zgina kolana, żeby buty nigdy nie lewitowały ani nie wbijały się w schody.",
    },
    note: {
      en: "Climb the temple stairs with A/D or hit [V] Freeze on Steps and flip [T] back and forth! With Foot IK ON, Law-of-Cosines joint angles lock both boots flush onto two different stair heights while dropping the pelvis. Turn IK OFF to see rigid canned animation clip deep into stone and float in mid-air.",
      pl: "Wchodź po schodach (A/D lub [V] Pauza na Stopniach) i przełączaj [T] tam i z powrotem! Z Foot IK stopy idealnie siadają na dwóch różnych stopniach przy obniżonych biodrach. Wyłącz IK [T], a sztywna animacja wbije but w kamień i zawiesi drugą stopę w powietrzu.",
    },
    hint: {
      en: "A/D / Click = Climb Stairs · V = Freeze Straddling Steps · T = Foot IK ON/OFF · X = Raycasts",
      pl: "A/D / Klik = Chodź po Schodach · V = Pauza na Stopniach · T = Foot IK WŁ/WYŁ · X = Raycasty",
    },
  },
  {
    id: "camera-spring-arm",
    accent: "#eab308",
    category: "feel",
    thumb: "thumbs/camera-spring-arm.jpg",
    module: "./entries/camera-spring-arm/index.js",
    title: {
      en: "Camera Spring Arm & Wall Occlusion",
      pl: "Ramię Kamery (Spring Arm) i Ściany",
    },
    kicker: {
      en: "CAMERA ENGINEERING · PLAYABLE MINI-GAME #22",
      pl: "KAMERA 3D · GRYWALNA MINI-GRA #22",
    },
    question: {
      en: "Why 3rd-person cameras never clip behind dungeon walls or hide your hero behind marble pillars.",
      pl: "Czemu kamera z trzeciej osoby nie wypada za ściany lochu i nie chowa bohatera za filarami.",
    },
    note: {
      en: "Walk the explorer through the cutaway temple hall with WASD (or watch auto-patrol) and watch the floating 3D camera rig + live mini-screen! With Spring Arm ON [T], raycasts smoothly retract the camera inside the walls and fade blocking pillars — switch to Rigid [T] or hit Wall-Hug [V] to see it clip straight outside the stone wall.",
      pl: "Chodź odkrywcą po świątyni (WASD lub auto-patrol) i patrz na kamerę 3D oraz podgląd ekranu gracza! Ze Spring Arm [T] raycast skraca ramię przed ścianą i rozjaśnia zasłaniające filary — przełącz na Sztywną [T] lub kliknij Test Przy Ścianie [V], żeby zobaczyć kamerę wbitą w mur.",
    },
    hint: {
      en: "WASD / Click = Walk · V = Wall-Hug Test · T = Spring Arm / Rigid · R = Reset",
      pl: "WASD / Klik = Chodź · V = Test Przy Ścianie · T = Spring Arm / Sztywna · R = Reset",
    },
  },
  {
    id: "animation-cancel",
    accent: "#ec4899",
    category: "feel",
    thumb: "thumbs/animation-cancel.jpg",
    module: "./entries/animation-cancel/index.js",
    title: {
      en: "Frame Data & Animation Cancel",
      pl: "Frame Data i Anulowanie Animacji",
    },
    kicker: {
      en: "COMBAT RESPONSIVENESS · PLAYABLE MINI-GAME #21",
      pl: "RESPONSYWNOŚĆ WALKI · GRYWALNA MINI-GRA #21",
    },
    question: {
      en: "Why great action games feel snappy: Startup → Active → Recovery frames, and slicing off 400ms of Recovery with a Dodge-Cancel.",
      pl: "Czemu dobre gry akcji są tak responsywne: klatki Startup → Active → Recovery i ucinanie 400 ms Recovery unikiem.",
    },
    note: {
      en: "Press Space (or Click) to swing a Heavy Katana Slash against the Counter Automaton and watch the live 60 FPS Frame Strip (Amber Startup → Red Active → Blue Recovery). With Dodge-Cancel ON [T], hit Shift right on impact to slice off the vulnerable Blue Recovery and dodge the counter-club — turn it OFF [T] to get locked and punished!",
      pl: "Wciśnij Spację (lub Kliknij), żeby zadać ciężkie cięcie manekinowi i patrz na pasek klatek 60 FPS (Żółty Startup → Czerwony Active → Niebieski Recovery). Z Dodge-Cancel [T] wciśnij Shift po trafieniu, żeby uciąć podatne Recovery i uniknąć kontry — wyłącz [T], a dostaniesz karę!",
    },
    hint: {
      en: "Space / Click = Heavy Slash · Shift = Dodge-Cancel · V = Slow-Mo 0.32× · T = Cancel ON/OFF",
      pl: "Spacja / Klik = Cięcie · Shift = Anuluj (Dash) · V = Slow-Mo 0.32× · T = Cancel WŁ/WYŁ",
    },
  },
  {
    id: "utility-ai",
    accent: "#f59e0b",
    category: "ai",
    thumb: "thumbs/utility-ai.jpg",
    module: "./entries/utility-ai/index.js",
    title: {
      en: "Utility AI (Sims / NPC Needs)",
      pl: "Utility AI (Potrzeby NPC jak w Simsach)",
    },
    kicker: {
      en: "DECISION AI · PLAYABLE MINI-GAME #20",
      pl: "AI DECYZJI · GRYWALNA MINI-GRA #20",
    },
    question: {
      en: "How NPCs balance Hunger, Sleep & Wolf Danger smoothly using Utility Curves + Hysteresis instead of thrashing in if/else loops.",
      pl: "Jak NPC płynnie godzi Głód, Sen i ucieczkę przed Wilkiem krzywymi Utility + Histerezą zamiast miotać się w pętli if/else.",
    },
    note: {
      en: "Watch the woodland camper weigh live 0–1 utility bars for Food, Sleep & Flee, committing cleanly until each need is satisfied — Click anywhere or press [V] to unleash the Timber Wolf! Toggle [T] to Naive if/else (zero hysteresis) to watch the camper hilariously thrash back-and-forth mid-camp when Hunger and Fatigue tie.",
      pl: "Obserwuj obozowicza ważącego na żywo paski Utility (Głód, Sen, Ucieczka) z histerezą — kliknij obóz lub wciśnij [V], żeby nasłać Wilka! Przełącz [T] na naiwne if/else bez histerezy i zobacz, jak NPC wpada w pętlę i biega tam i z powrotem przy remisie potrzeb.",
    },
    hint: {
      en: "Click / V = Send Wolf Raid · T = Utility AI / Naive if-else · X = Spike Needs · R = Reset",
      pl: "Klik / V = Atak Wilka · T = Utility AI / Naiwne if-else · X = Podkręć Potrzeby · R = Reset",
    },
  },
  {
    id: "quadtree-collisions",
    accent: "#06b6d4",
    category: "crowds",
    thumb: "thumbs/quadtree-collisions.jpg",
    module: "./entries/quadtree-collisions/index.js",
    title: {
      en: "Quadtree & Spatial Hashing",
      pl: "Quadtree i Podział Przestrzeni",
    },
    kicker: {
      en: "PHYSICS BROADPHASE · PLAYABLE MINI-GAME #19",
      pl: "DETEKCJA KOLIZJI · GRYWALNA MINI-GRA #19",
    },
    question: {
      en: "How games handle 100+ live collisions at 120 FPS: recursively splitting crowded quadrants instead of O(n²) every-pair checks.",
      pl: "Jak gry liczą 100+ kolizji w 120 FPS: dzieląc tłoczne obszary w drzewie Quadtree zamiast O(n²) każdy z każdym.",
    },
    note: {
      en: "Click anywhere (or press [V] for a Crowd Vortex) to pull 96 plasma drones into a dense cluster and watch the cyan Quadtree cells subdivide deeper on the fly while empty corners cost 0 checks! Toggle [T] to Brute-Force O(n²) to unleash the shocking crimson all-pairs web (4,560 checks every single frame!).",
      pl: "Kliknij arenę (albo wciśnij [V] — Wir Tłumu), żeby zebrać 96 dronów w gęstą chmarę i zobacz, jak cyjanowe komórki Quadtree dzielą się głębiej na żywo, a puste kąty kosztują 0 testów! Przełącz [T] na Brute-Force O(n²), żeby zobaczyć czerwoną pajęczynę 4560 porównań na klatkę.",
    },
    hint: {
      en: "Click / Hold = Crowd Vortex · T = Quadtree / O(n²) · V = Vortex Pulse · X = Toggle Grid",
      pl: "Klik / Przytrzymaj = Wir Tłumu · T = Quadtree / O(n²) · V = Impuls Wiru · X = Siatka",
    },
  },
  {
    id: "frustum-culling",
    accent: "#a855f7",
    category: "systems",
    thumb: "thumbs/frustum-culling.jpg",
    module: "./entries/frustum-culling/index.js",
    title: {
      en: "Frustum & Occlusion Culling",
      pl: "Frustum i Occlusion Culling",
    },
    kicker: {
      en: "RENDERING OPT · PLAYABLE MINI-GAME #18",
      pl: "OPTYMALIZACJA 3D · GRYWALNA MINI-GRA #18",
    },
    question: {
      en: "The #1 trick behind 60+ FPS open worlds: your GPU deletes everything outside the 62° camera cone and behind solid walls.",
      pl: "Główny sekret płynnych światów 3D: karta graficzna pomija wszystko poza stożkiem kamery 62° i za pełnymi murami.",
    },
    note: {
      en: "Pan the 3D Harbor Camera with A/D or Mouse (or click [V] Wall Occlusion Test) across 35 buildings & trees! Everything outside the cyan 62° frustum OR tucked behind the Stone Castle Wall gets skipped (~75% less GPU work). Switch Culling OFF [T] to watch the GPU waste draw calls on the entire unseen town.",
      pl: "Obracaj kamerę nad portem (A/D lub Mysz, albo kliknij [V] Test Ściany) wśród 35 budynków i drzew! Wszystko poza stożkiem 62° ORAZ schowane za murem zamku znika z kolejki GPU (~75% mniej pracy). Wyłącz Culling [T], żeby zobaczyć marnowanie mocy na niewidoczne miasto.",
    },
    hint: {
      en: "A/D or Mouse = Pan Camera · V = Wall Occlusion Test · T = Culling ON/OFF · X = Culled Ghosts",
      pl: "A/D lub Mysz = Obróć Kamerę · V = Test Ściany · T = Culling WŁ/WYŁ · X = Duchy Wyciętych",
    },
  },
  {
    id: "hitboxes-iframes",
    accent: "#f43f5e",
    category: "feel",
    thumb: "thumbs/hitboxes-iframes.jpg",
    module: "./entries/hitboxes-iframes/index.js",
    title: {
      en: "Hitboxes, Hurtboxes & I-Frames",
      pl: "Hitboxy, Hurtboxy i I-Frames",
    },
    kicker: {
      en: "SOULS-LIKE FEEL · PLAYABLE MINI-GAME #17",
      pl: "FEEL WALKI · GRYWALNA MINI-GRA #17",
    },
    question: {
      en: "Why rolling straight through a giant boss halberd feels fair: fitted hitboxes & 280ms of golden Invincibility Frames vs bloated jank boxes.",
      pl: "Czemu przewrót prosto przez gigantyczną halabardę bossa działa uczciwie: dopasowany hitbox i 280 ms złotych I-Frames kontra rozdmuchany jank.",
    },
    note: {
      en: "Move with WASD and press Space (or Click) to Dodge Roll straight through the Boss's sweeping crimson halberd (press [V] for 0.28× Slow-Mo Frame Study!). In Fair Mode [T], rolling turns your green hurtbox radiant GOLD (280ms I-Frames = 0 DMG!). Switch to Jank Mode [T] to watch an oversized hitbox phantom-hit you through empty air.",
      pl: "Chodź WASD i rób przewrót Spacją (lub LPM) prosto przez zamach halabardy bossa (wciśnij [V] dla 0.28× Slow-Mo!). W trybie Fair [T] przewrót zamienia zielony hurtbox w ZŁOTY (280 ms I-Frames = 0 obrażeń!). Przełącz na Jank [T], żeby zobaczyć widmowe trafienia z powietrza.",
    },
    hint: {
      en: "WASD = Move · Space / Click = Dodge Roll · V = Slow-Mo 0.28× · T = Fair / Jank · X = X-Ray Boxes",
      pl: "WASD = Ruch · Spacja / Klik = Unik · V = Slow-Mo 0.28× · T = Fair / Jank · X = Pudła X-Ray",
    },
  },
  {
    id: "wfc-island",
    accent: "#10b981",
    category: "systems",
    thumb: "thumbs/wfc-island.jpg",
    module: "./entries/wfc-island/index.js",
    title: {
      en: "Wave Function Collapse (WFC)",
      pl: "Wave Function Collapse (WFC)",
    },
    kicker: {
      en: "PROCEDURAL GEN · PLAYABLE MINI-GAME #16",
      pl: "GENERACJA ŚWIATA · GRYWALNA MINI-GRA #16",
    },
    question: {
      en: "How games like Townscaper & Bad North build seamless islands tile-by-tile using lowest-entropy constraint propagation.",
      pl: "Jak gry takie jak Townscaper czy Bad North układają spójne wyspy kafelek po kafelku propagacją ograniczeń i najniższą entropią.",
    },
    note: {
      en: "Watch the 8×8 archipelago collapse step-by-step from lowest entropy outward with zero broken coastlines — click ANY tile to pin a Town Village or Ocean block and watch neighbors re-solve live! Toggle [T] to Pure Random placement to see broken cliff-into-ocean edges light up in crimson.",
      pl: "Zobacz, jak archipelag 8×8 zapada się krok po kroku od najniższej entropii bez żadnego złamanego brzegu — kliknij DOWOLNY kafelek, żeby przypiąć Wioskę lub Ocean i przepropagować sąsiadów! Przełącz [T] na Czysty Los, a zobaczysz czerwone błędy sąsiedztwa.",
    },
    hint: {
      en: "Click Tile = Pin Town/Ocean · Space = New Island · V = Step 1 · T = WFC / Random · X = Entropy",
      pl: "Klik Kafelka = Przypnij Wioskę/Ocean · Spacja = Nowa Wyspa · V = Krok · T = WFC / Los · X = Entropia",
    },
  },
  {
    id: "lag-compensation",
    accent: "#38bdf8",
    category: "systems",
    thumb: "thumbs/lag-compensation.jpg",
    module: "./entries/lag-compensation/index.js",
    title: {
      en: "Lag Compensation & Server Rewind",
      pl: "Kompensacja Laga (Server Rewind)",
    },
    kicker: {
      en: "MULTIPLAYER NETCODE · PLAYABLE MINI-GAME #15",
      pl: "NETCODE SIECIOWY · GRYWALNA MINI-GRA #15",
    },
    question: {
      en: "Why sniper shots land at 180ms ping AND why you sometimes die 'behind a wall': the server rewinds hitboxes back in time.",
      pl: "Czemu snajper trafia przy pingu 180 ms ORAZ czemu czasem giniesz 'za ścianą': serwer cofa hitboxy w czasie.",
    },
    note: {
      en: "Aim with Mouse / A-D and fire with Click / Space at the sprinting Solid Runner (what YOUR screen sees) while the translucent cyan ghost shows where the Server knows he ALREADY is +180ms ahead! Hit Behind-Wall Test [V] to see why Lag Comp ON [T] rewinds time for a fair hit — and why OFF [T] misses dead-center shots.",
      pl: "Celuj Myszą / A-D i strzelaj (LPM / Spacja) w pełnego biegacza (to widzi TWÓJ ekran), podczas gdy cyjanowy duch pokazuje jego PRAWDZIWĄ pozycję na serwerze +180 ms dalej! Kliknij Test 'Za Ścianą' [V], żeby zobaczyć cofanie czasu [T] kontra pudła bez Rewindu.",
    },
    hint: {
      en: "Mouse / A-D = Aim · Click / Space = Fire · V = Behind-Wall Test · T = Rewind ON/OFF · X = Ping ms",
      pl: "Mysz / A-D = Celuj · Klik / Spacja = Strzał · V = Test Za Ścianą · T = Rewind WŁ/WYŁ · X = Ping ms",
    },
  },
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
