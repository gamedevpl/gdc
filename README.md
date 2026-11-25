# Game Design Codex (GDC)

Interactive 3D WebGL2 dioramas explaining the hidden rules behind video games, from [gamedev.pl](https://gamedev.pl) — sibling to [FX Lab](https://gamedevpl.github.io/fx-lab/).

**Live site:** <https://gamedevpl.github.io/gdc/>

## Entries

1. **[A* Pathfinding](https://gamedevpl.github.io/gdc/astar/)** — Click any tile in the 3D stone maze to reshape walls, watch distance numbers flood out from `0`, and follow the hero walking downhill along the shortest path.
2. **[Attack Tokens](https://gamedevpl.github.io/gdc/attack-tokens/)** — Why five guards surround you, yet politely attack one at a time. Switch live between **Tokens OFF** (instant dogpile), **1 Token** (fair turns), and **2 Tokens** (hard mode).
3. **[Rubber Banding](https://gamedevpl.github.io/gdc/rubber-banding/)** — Why racing games keep races close to the finish line. Trigger **Crash Player!** or **Boost Player!** with Rubber Banding **ON vs OFF** and watch the elastic tether speed rivals up or pull them back.

## Controls

- **WASD / Arrow Keys** — Drive your car (Rubber Banding), move your Knight (Attack Tokens), or walk the Hero through the stone maze (A\*)
- **Left-Click / `J`** — Rune sword slash (Attack Tokens), steer toward point (Rubber Banding), or toggle maze walls (A\*, `Shift+Click` moves Goal)
- **`Space` / Right-Click** — Nitro boost (Rubber Banding), shield block & timed parry (Attack Tokens), or Auto-Solve (A\*)
- **Drag** — Orbit and tilt the 3D diorama · **Scroll / Pinch** — Zoom
- **`P`** — Pause/resume · **`R`** — Reset · **`1`–`3`** — Switch entry

## Running locally

No build step and no external dependencies — plain ES modules and raw WebGL2 inside `docs/`.

```sh
python3 -m http.server 8092 --directory docs
```

Then open <http://localhost:8092/>.

## License

MIT — see [LICENSE](./LICENSE).
