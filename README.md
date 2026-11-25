# Game Design Codex (GDC)

Interactive 3D WebGL2 dioramas explaining the hidden rules behind video games, from [gamedev.pl](https://gamedev.pl) — sibling to [FX Lab](https://gamedevpl.github.io/fx-lab/).

**Live site:** <https://gamedevpl.github.io/gdc/>

## Entries

1. **[A* Pathfinding](https://gamedevpl.github.io/gdc/astar/)** — Click any tile in the 3D stone maze to reshape walls, watch distance numbers flood out from `0`, and follow the hero walking downhill along the shortest path.
2. **[Attack Tokens](https://gamedevpl.github.io/gdc/attack-tokens/)** — Why five guards surround you, yet politely attack one at a time. Switch live between **Tokens OFF** (instant dogpile), **1 Token** (fair turns), and **2 Tokens** (hard mode).
3. **[Rubber Banding](https://gamedevpl.github.io/gdc/rubber-banding/)** — Why racing games keep races close to the finish line. Trigger **Crash Player!** or **Boost Player!** with Rubber Banding **ON vs OFF** and watch the elastic tether speed rivals up or pull them back.

## Controls

- **Drag** — Orbit and tilt the 3D diorama
- **Scroll / Pinch** — Zoom in and out
- **`Space`** — Pause or resume simulation
- **`R`** — Reset diorama and camera
- **`1`–`3`** — Jump directly to an entry
- **Click tile (A\* Maze)** — Toggle wall / floor (`Shift+Click` moves Goal)

## Running locally

No build step and no external dependencies — plain ES modules and raw WebGL2 inside `docs/`.

```sh
python3 -m http.server 8092 --directory docs
```

Then open <http://localhost:8092/>.

## License

MIT — see [LICENSE](./LICENSE).
