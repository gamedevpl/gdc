<div align="center">

# Game Design Codex (GDC)

**22 playable 3D WebGL2 mini-games that expose the hidden tricks behind video games — zero dependencies, zero build step.**

[**Play Live Codex ↗**](https://gamedevpl.github.io/gdc/) · [gamedev.pl](https://www.gamedev.pl) · [FX Lab](https://github.com/gamedevpl/fx-lab) · [YouTube](https://www.youtube.com/@gamedev_pl)

![Stars](https://img.shields.io/github/stars/gamedevpl/gdc?style=flat-square)
![License](https://img.shields.io/github/license/gamedevpl/gdc?style=flat-square)
![Entries](https://img.shields.io/badge/playable%20mini--games-22-00e4ac?style=flat-square)
![Stack](https://img.shields.io/badge/WebGL2-vanilla_JS-f59e0b?style=flat-square)

<br>

<a href="https://gamedevpl.github.io/gdc/">
  <img src="./media/hero.gif" alt="Game Design Codex live 3D demos: Hitstop & Game Juice, Rubber Banding, Boids & Flocking, and Flow Field" width="800">
</a>

*Flip any mechanic ON vs OFF while you play: feel 115 ms Coyote Time, 60 ms Hitstop, 1-Token combat AI, Server Rewind, and live Flow Fields firsthand.*

</div>

---

## Play & toggle the trick live

Every entry lets you disable the "invisible" game-design trick on the fly (`T`) so you can immediately feel why raw honest math often plays worse than carefully crafted illusions.

<p align="center">
  <a href="https://gamedevpl.github.io/gdc/attack-tokens/">
    <img src="./media/mechanics-live.gif" alt="Live gameplay of Attack Tokens combat AI and A* Pathfinding in a 3D maze" width="800">
  </a>
</p>

---

## All 22 playable entries

Click any card to play it in your browser.

### Game Feel & Camera

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/coyote-time/"><img src="./docs/thumbs/coyote-time.jpg" width="260" alt="Coyote Time & Buffering"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/coyote-time/">Coyote Time &amp; Buffering</a></b><br>
      <sub>Feel why 115 ms invisible ledges &amp; jump buffers make platforming fair.</sub><br>
      <sub><a href="./docs/src/entries/coyote-time/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/hitstop/"><img src="./docs/thumbs/hitstop.jpg" width="260" alt="Hitstop & Game Juice"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/hitstop/">Hitstop &amp; Game Juice</a></b><br>
      <sub>Smash golems and feel why a 60 ms freeze makes hits 10× heavier.</sub><br>
      <sub><a href="./docs/src/entries/hitstop/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/fake-1hp/"><img src="./docs/thumbs/fake-1hp.jpg" width="260" alt="Fake 1 HP & Death's Door"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/fake-1hp/">Fake 1 HP &amp; Death's Door</a></b><br>
      <sub>Hidden bottom-of-bar HP, lethal 1 HP clamps &amp; mercy enemy aim scatter.</sub><br>
      <sub><a href="./docs/src/entries/fake-1hp/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/camera-deadzone/"><img src="./docs/thumbs/camera-deadzone.jpg" width="260" alt="Camera Deadzone & Look-Ahead"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/camera-deadzone/">Camera Deadzone &amp; Look-Ahead</a></b><br>
      <sub>Compare a smart deadzone + look-ahead box against a jittery locked camera.</sub><br>
      <sub><a href="./docs/src/entries/camera-deadzone/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/camera-spring-arm/"><img src="./docs/thumbs/camera-spring-arm.jpg" width="260" alt="Camera Spring Arm & Wall Occlusion"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/camera-spring-arm/">Camera Spring Arm</a></b><br>
      <sub>Why 3rd-person cameras pull in smoothly instead of clipping behind walls.</sub><br>
      <sub><a href="./docs/src/entries/camera-spring-arm/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/bullet-magnetism/"><img src="./docs/thumbs/bullet-magnetism.jpg" width="260" alt="Bullet Magnetism & Aim Assist"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/bullet-magnetism/">Bullet Magnetism</a></b><br>
      <sub>Why Halo &amp; Destiny shots land when you miss: ±7.5° mid-air curving vs Raw 0°.</sub><br>
      <sub><a href="./docs/src/entries/bullet-magnetism/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/hitboxes-iframes/"><img src="./docs/thumbs/hitboxes-iframes.jpg" width="260" alt="Hitboxes, Hurtboxes & I-Frames"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/hitboxes-iframes/">Hitboxes &amp; I-Frames</a></b><br>
      <sub>Roll straight through a boss halberd with 280 ms golden Invincibility Frames.</sub><br>
      <sub><a href="./docs/src/entries/hitboxes-iframes/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/animation-cancel/"><img src="./docs/thumbs/animation-cancel.jpg" width="260" alt="Frame Data & Animation Cancel"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/animation-cancel/">Frame Data &amp; Animation Cancel</a></b><br>
      <sub>Startup → Active → Recovery frames, and slicing 400 ms off with Dodge-Cancel.</sub><br>
      <sub><a href="./docs/src/entries/animation-cancel/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="middle">
      <sub><b>Tip:</b> Press <code>T</code> inside any mini-game to switch between the real trick and the "honest" version.</sub>
    </td>
  </tr>
</table>

### Enemy & Race AI

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/attack-tokens/"><img src="./docs/thumbs/attack-tokens.jpg" width="260" alt="Attack Tokens"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/attack-tokens/">Attack Tokens</a></b><br>
      <sub>Fight 5 skeletons: polite turns with 1 Token vs instant dogpile with Tokens OFF.</sub><br>
      <sub><a href="./docs/src/entries/attack-tokens/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/rubber-banding/"><img src="./docs/thumbs/rubber-banding.jpg" width="260" alt="Rubber Banding"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/rubber-banding/">Rubber Banding</a></b><br>
      <sub>Drive the Figure-8 overpass GP track and feel rival speed stretch like a tether.</sub><br>
      <sub><a href="./docs/src/entries/rubber-banding/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/stealth-cones/"><img src="./docs/thumbs/stealth-cones.jpg" width="260" alt="Stealth Vision Cones"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/stealth-cones/">Stealth Vision Cones (? → !)</a></b><br>
      <sub>65° raycasted cones, fill bars &amp; distraction coins vs realistic 140° instant spot.</sub><br>
      <sub><a href="./docs/src/entries/stealth-cones/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/ai-director/"><img src="./docs/thumbs/ai-director.jpg" width="260" alt="AI Director (L4D Pacing)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/ai-director/">AI Director (L4D Pacing)</a></b><br>
      <sub>Build-Up → Peak → Relax intensity curves &amp; mercy medkits vs constant spawns.</sub><br>
      <sub><a href="./docs/src/entries/ai-director/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/utility-ai/"><img src="./docs/thumbs/utility-ai.jpg" width="260" alt="Utility AI (Sims / NPC Needs)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/utility-ai/">Utility AI (NPC Needs)</a></b><br>
      <sub>How NPCs balance Hunger, Sleep &amp; Danger with Utility Curves + Hysteresis.</sub><br>
      <sub><a href="./docs/src/entries/utility-ai/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="middle">
      <sub>Toggle X-Ray overlays with <code>X</code> to expose AI vision cones, intensity curves &amp; scores live.</sub>
    </td>
  </tr>
</table>

### Pathfinding & Crowds

<table>
  <tr>
    <td align="center" width="50%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/astar/"><img src="./docs/thumbs/astar.jpg" width="360" alt="A* Pathfinding"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/astar/">A* Pathfinding</a></b><br>
      <sub>Drag to paint 3D maze walls live while distance numbers recalculate instantly.</sub><br>
      <sub><a href="./docs/src/entries/astar/">Code</a></sub>
    </td>
    <td align="center" width="50%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/boids-flocking/"><img src="./docs/thumbs/boids-flocking.jpg" width="360" alt="Boids & Flocking"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/boids-flocking/">Boids &amp; Flocking</a></b><br>
      <sub>72 reef fish with zero leader — toggle Separation, Alignment &amp; Cohesion live.</sub><br>
      <sub><a href="./docs/src/entries/boids-flocking/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/flow-field/"><img src="./docs/thumbs/flow-field.jpg" width="360" alt="Flow Field & Dynamic NavMesh"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/flow-field/">Flow Field &amp; NavMesh</a></b><br>
      <sub>Steer 96 hover-bots around walls you paint live using one O(grid) vector field.</sub><br>
      <sub><a href="./docs/src/entries/flow-field/">Code</a></sub>
    </td>
    <td align="center" width="50%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/quadtree-collisions/"><img src="./docs/thumbs/quadtree-collisions.jpg" width="360" alt="Quadtree & Spatial Hashing"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/quadtree-collisions/">Quadtree &amp; Spatial Hashing</a></b><br>
      <sub>Handle 100+ live collisions by recursively splitting quadrants instead of O(n²) pairs.</sub><br>
      <sub><a href="./docs/src/entries/quadtree-collisions/">Code</a></sub>
    </td>
  </tr>
</table>

### World & Systems

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/bsp-dungeon/"><img src="./docs/thumbs/bsp-dungeon.jpg" width="260" alt="Procedural Dungeon (BSP + MST)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/bsp-dungeon/">Procedural Dungeon (BSP + MST)</a></b><br>
      <sub>Roll 3D roguelike dungeons that never trap the player vs broken random placement.</sub><br>
      <sub><a href="./docs/src/entries/bsp-dungeon/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/wfc-island/"><img src="./docs/thumbs/wfc-island.jpg" width="260" alt="Wave Function Collapse (WFC)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/wfc-island/">Wave Function Collapse</a></b><br>
      <sub>Build seamless 3D islands tile-by-tile with lowest-entropy constraint propagation.</sub><br>
      <sub><a href="./docs/src/entries/wfc-island/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/pity-timer/"><img src="./docs/thumbs/pity-timer.jpg" width="260" alt="Pity Timer & Pseudo-Random Drops"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/pity-timer/">Pity Timer &amp; PRD Drops</a></b><br>
      <sub>Race True 10% RNG against Hidden Pity + PRD side by side off the same seed.</sub><br>
      <sub><a href="./docs/src/entries/pity-timer/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/frustum-culling/"><img src="./docs/thumbs/frustum-culling.jpg" width="260" alt="Frustum & Occlusion Culling"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/frustum-culling/">Frustum &amp; Occlusion Culling</a></b><br>
      <sub>See how your GPU drops everything outside the 62° camera cone &amp; behind walls.</sub><br>
      <sub><a href="./docs/src/entries/frustum-culling/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/lag-compensation/"><img src="./docs/thumbs/lag-compensation.jpg" width="260" alt="Lag Compensation & Server Rewind"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/lag-compensation/">Lag Compensation &amp; Rewind</a></b><br>
      <sub>Why sniper shots land at 180 ms ping — and why you sometimes die "behind a wall".</sub><br>
      <sub><a href="./docs/src/entries/lag-compensation/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="middle">
      <sub>Every diorama runs raw WebGL2 + Web Audio SFX in <a href="./docs/src/entries/"><code>docs/src/entries/</code></a>.</sub>
    </td>
  </tr>
</table>

---

## Controls

| Input | Action |
| --- | --- |
| **`WASD` / Arrows** | Move, drive, run, or steer |
| **`Space` / Left-Click** | Primary action (jump, attack, fire, nitro, paint walls, roll seed) |
| **`T`** | Toggle the mechanic ON vs OFF (strict vs fair, raw vs assisted) |
| **`X`** / **`V`** | X-Ray debug overlay / instant edge-case test |
| **Right-Drag / Scroll** | Orbit 3D diorama / zoom |
| **`P`** · **`R`** · **`M`/`B`** | Pause · reset · SFX / background music |

---

## Running locally

Plain ES modules and raw WebGL2 inside `docs/` — no build step required:

```sh
python3 -m http.server 8092 --directory docs
```

Then open <http://localhost:8092/>.

---

## More interactive labs from [gamedev.pl](https://www.gamedev.pl)

- **[FX Lab](https://github.com/gamedevpl/fx-lab)** — 32 interactive WebGL2 & WebGPU graphics-effect sandboxes
- **[Lumen Lab](https://github.com/gamedevpl/silnik3d-od-zera/tree/main/docs/lumen-lab)** — 40 years of light and shadow in one single WebGL2 scene
- **[Neon Canal (Demko)](https://github.com/gamedevpl/silnik3d-od-zera/tree/main/demko)** — 3D C++ / WebAssembly / Metal neon racer
- **[Silnik 3D w C++ od zera](https://github.com/gamedevpl/silnik3d-od-zera)** — building a 3D C++ & OpenGL engine from an empty folder

## License

MIT — see [LICENSE](./LICENSE).
