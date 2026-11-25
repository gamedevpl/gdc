// Game Design Codex (GDC) catalog — playable 3D game-design mini-games from gamedev.pl.

export const CODEX_ENTRIES = [
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
      en: "Drive the green car yourself and feel AI speed stretch like a rubber band.",
      pl: "Poprowadź zielone auto sam i poczuj, jak gumka rozciąga tempo AI.",
    },
    note: {
      en: "Drive with WASD / Arrows and Space for Nitro. Pull far ahead and rivals boost onto your bumper; crash into a wall and leaders quietly brake — toggle Rubber Band OFF to feel the gap explode.",
      pl: "Jedź WASD / Strzałkami, Spacja = Nitro. Gdy uciekniesz, rywale dostają dopalacz; gdy wjedziesz w bandę, liderzy hamują — wyłącz Gumkę, żeby poczuć różnicę.",
    },
    hint: {
      en: "WASD / Arrows = Drive · Space = Nitro · X = Spinout · Click track to steer · Drag to orbit",
      pl: "WASD / Strzałki = Jazda · Spacja = Nitro · X = Poślizg · Kliknij tor = skręt · Przeciągnij = kamera",
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
      en: "Fight 5 skeletons yourself: winnable with 1 token, brutal chaos with tokens OFF.",
      pl: "Walcz sam z 5 szkieletami: uczciwy pojedynek z 1 tokenem vs masakra bez tokenów.",
    },
    note: {
      en: "Move your Knight with WASD, Left-Click (or J) to slash, hold Space (or Right-Click) to block & parry. Survive easily with 1 Token, then switch Tokens OFF to feel 5 enemies dogpile at once.",
      pl: "Chodź Rycerzem (WASD / Strzałki), LPM lub J = cięcie mieczem, Spacja lub PPM = blok tarczą i parowanie. Z 1 tokenem dasz radę — wyłącz tokeny i zobacz, jak rzucają się naraz.",
    },
    hint: {
      en: "WASD / Arrows = Move · Left-Click / J = Slash · Space / Right-Click = Block & Parry · Drag = Orbit",
      pl: "WASD / Strzałki = Ruch · LPM / J = Cięcie · Spacja / PPM = Blok i parowanie · Przeciągnij = kamera",
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
      en: "Walk the maze yourself, paint walls live, or race the distance numbers to 0.",
      pl: "Przejdź labirynt sam, rysuj ściany na żywo albo ścigaj się z liczbami do 0.",
    },
    note: {
      en: "Use WASD / Arrows to walk the hero yourself while numbers count steps to Goal (0) live, click any tile to add/remove stone walls, Shift+Click to move Goal, or hit Auto-Solve.",
      pl: "Chodź bohaterem (WASD / Strzałki) — liczby na żywo liczą kroki do Mety (0). Kliknij kafelek, żeby postawić lub usunąć ścianę, Shift+Klik przenosi Metę, albo włącz Auto-Solve.",
    },
    hint: {
      en: "WASD / Arrows = Walk · Click tile = Wall · Shift+Click = Move Goal · Space = Auto-Solve · Drag = Orbit",
      pl: "WASD / Strzałki = Chodzenie · Klik = Ściana · Shift+Klik = Meta · Spacja = Auto-Solve · Przeciągnij = kamera",
    },
  },
];

export function getEntryMeta(id) {
  return CODEX_ENTRIES.find(e => e.id === id) || CODEX_ENTRIES[0];
}
