// Game Design Codex (GDC) catalog — interactive 3D game-design mechanics from gamedev.pl.
// Every entry pairs a live WebGL2 miniature diorama with its short explainer video.

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
      en: "RACING AI · CODEX #03",
      pl: "AI WYŚCIGOWE · KODEKS #03",
    },
    question: {
      en: "Why racing games secretly adjust AI speed to keep races close.",
      pl: "Dlaczego gry wyścigowe po cichu zmieniają tempo AI, żeby wyścig był ciasny.",
    },
    note: {
      en: "An invisible elastic tether links rivals to your car. Pull far ahead and the band slingshots AI faster; spin out and it slows leaders down so you still get a photo finish.",
      pl: "Niewidzialna gumka łączy rywali z Twoim autem. Gdy uciekniesz — przyspiesza AI; gdy się rozbijesz — hamuje liderów, żebyś wrócił do walki na ostatnim okrążeniu.",
    },
    hint: {
      en: "Try Crash Player! or Boost Player! with Rubber Band ON vs OFF · Drag to orbit · Scroll to zoom",
      pl: "Kliknij Rozbij gracza! lub Turbo z Gumką WŁ vs WYŁ · Przeciągnij, aby obrócić · Scroll = zoom",
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
      en: "COMBAT AI · CODEX #02",
      pl: "AI WALKI · KODEKS #02",
    },
    question: {
      en: "Why five enemies surround you, yet politely attack one at a time.",
      pl: "Dlaczego pięciu wrogów otacza Cię w kółku, ale atakuje po kolei.",
    },
    note: {
      en: "Without attack tokens, every guard swings at once and you lose in one second. With one golden ticket, only the holder strikes while the rest circle and wait their turn.",
      pl: "Bez tokenów ataku wszyscy strażnicy uderzają naraz i giniesz w sekundę. Z jednym złotym biletem atakuje tylko jego posiadacz, a reszta krąży i czeka na swoją kolej.",
    },
    hint: {
      en: "Switch between Tokens OFF (dogpile), 1 Token (fair) and 2 Tokens (hard) · Drag to orbit",
      pl: "Przełączaj Bez tokenów (chaos), 1 Token (fair) i 2 Tokeny (hard) · Przeciągnij, aby obrócić",
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
      en: "PATHFINDING · CODEX #01",
      pl: "PATHFINDING · KODEKS #01",
    },
    question: {
      en: "How a game character finds the shortest way out of any maze.",
      pl: "Jak postać w grze znajduje najkrótszą drogę przez każdy labirynt.",
    },
    note: {
      en: "Count outward from the goal (0, 1, 2, 3...) until the wave reaches your hero. Then simply walk to a smaller number on every step — guaranteed shortest path.",
      pl: "Policz kroki od mety na zewnątrz (0, 1, 2, 3...), aż fala dotrze do bohatera. Potem idź zawsze na mniejszą liczbę — gwarantowana najkrótsza droga.",
    },
    hint: {
      en: "Click any maze tile to toggle walls · Shift+Click to move Goal · Drag to orbit",
      pl: "Kliknij kafelek, aby postawić/usunąć ścianę · Shift+Klik przenosi Metę · Przeciągnij, aby obrócić",
    },
  },
];

export function getEntryMeta(id) {
  return CODEX_ENTRIES.find(e => e.id === id) || CODEX_ENTRIES[0];
}
