<div align="center">

# Game Design Codex (GDC)

**46 playable 3D WebGL2 mini-games that expose the hidden tricks behind video games — zero dependencies, zero build step.**

[**Play Live Codex ↗**](https://gamedevpl.github.io/gdc/) · [gamedev.pl](https://www.gamedev.pl) · [FX Lab](https://github.com/gamedevpl/fx-lab) · [YouTube](https://www.youtube.com/@gamedev_pl)

![Stars](https://img.shields.io/github/stars/gamedevpl/gdc?style=flat-square)
![License](https://img.shields.io/github/license/gamedevpl/gdc?style=flat-square)
![Entries](https://img.shields.io/badge/playable%20mini--games-46-00e4ac?style=flat-square)
![Stack](https://img.shields.io/badge/WebGL2-vanilla_JS-f59e0b?style=flat-square)

<br>

<a href="https://gamedevpl.github.io/gdc/">
  <img src="./docs/thumbs/og.jpg" alt="Game Design Codex — 46 playable 3D game mechanics in WebGL2" width="820">
</a>

*Flip any mechanic ON vs OFF while you play (`T`): feel 115 ms Coyote Time, Corner Correction, GGPO Rollback Netcode, GOAP Planning, Influence Maps, NavMesh Funnel String-Pulling, Structural Collapse, and Chunk Streaming firsthand.*

</div>

---

## Play & toggle the trick live

Every entry lets you disable the "invisible" game-design trick on the fly (`T`) so you can immediately feel why raw honest math often plays worse than carefully crafted illusions.

<p align="center">
  <a href="https://gamedevpl.github.io/gdc/">
    <img src="./media/hero.gif" alt="Game Design Codex live 3D demos: Hitstop & Game Juice, Rubber Banding, Boids & Flocking, and Flow Field" width="800">
  </a>
</p>

---

## All 46 playable entries

Click any card to play it in your browser — no login, no install.

### Game Feel & Camera (15)

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/recoil-patterns/"><img src="./docs/thumbs/recoil-patterns.jpg" width="260" alt="Recoil Patterns & Dynamic Spread"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/recoil-patterns/">Recoil Patterns &amp; Spread</a></b><br>
      <sub>Learnable 7-shaped spray curve with counter-pull vs pure random RNG bloom.</sub><br>
      <sub><a href="./docs/src/entries/recoil-patterns/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/ledge-mantle/"><img src="./docs/thumbs/ledge-mantle.jpg" width="260" alt="Ledge Grab & Auto-Mantle"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/ledge-mantle/">Ledge Grab &amp; Auto-Mantle</a></b><br>
      <sub>Chest-vs-head probes vault 30 cm short jumps onto rooftops vs falling short.</sub><br>
      <sub><a href="./docs/src/entries/ledge-mantle/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/fixed-timestep/"><img src="./docs/thumbs/fixed-timestep.jpg" width="260" alt="Fixed Timestep vs Frame-Rate dt Bugs"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/fixed-timestep/">Fixed Timestep vs dt Bugs</a></b><br>
      <sub>1/60 s accumulator across 15–144 FPS vs raw frame-dt wall tunneling.</sub><br>
      <sub><a href="./docs/src/entries/fixed-timestep/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/variable-jump/"><img src="./docs/thumbs/variable-jump.jpg" width="260" alt="Variable Jump & Apex Hang-Time"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/variable-jump/">Variable Jump &amp; Apex Hang</a></b><br>
      <sub>Tap-to-cut jump height, 0.45× apex hang-time &amp; 1.9× heavy fall vs floaty parabola.</sub><br>
      <sub><a href="./docs/src/entries/variable-jump/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/corner-correction/"><img src="./docs/thumbs/corner-correction.jpg" width="260" alt="Corner Correction & Ceiling Nudge"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/corner-correction/">Corner Correction (Nudge)</a></b><br>
      <sub>Secretly slide past a 2-pixel ceiling lip like Celeste &amp; Mario vs hard head-bonk.</sub><br>
      <sub><a href="./docs/src/entries/corner-correction/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/step-up-slopes/"><img src="./docs/thumbs/step-up-slopes.jpg" width="260" alt="Character Controller: Step-Up & Slopes"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/step-up-slopes/">Step-Up &amp; Slope Limits</a></b><br>
      <sub>Auto-climb 28 cm curbs, walk 26° ramps, and slide off 58° cliffs (&gt;45° cap).</sub><br>
      <sub><a href="./docs/src/entries/step-up-slopes/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/ik-foot-placement/"><img src="./docs/thumbs/ik-foot-placement.jpg" width="260" alt="Inverse Kinematics (IK) Foot Placement"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/ik-foot-placement/">2-Bone Foot IK on Stairs</a></b><br>
      <sub>Analytical Law-of-Cosines IK locks boots flush on steps vs rigid clipping &amp; floating.</sub><br>
      <sub><a href="./docs/src/entries/ik-foot-placement/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/camera-spring-arm/"><img src="./docs/thumbs/camera-spring-arm.jpg" width="260" alt="Camera Spring Arm & Wall Occlusion"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/camera-spring-arm/">Camera Spring Arm</a></b><br>
      <sub>Why 3rd-person cameras pull in smoothly &amp; fade pillars instead of clipping walls.</sub><br>
      <sub><a href="./docs/src/entries/camera-spring-arm/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/animation-cancel/"><img src="./docs/thumbs/animation-cancel.jpg" width="260" alt="Frame Data & Animation Cancel"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/animation-cancel/">Frame Data &amp; Cancel</a></b><br>
      <sub>Startup → Active → Recovery frames, and slicing 420 ms off with Dodge-Cancel.</sub><br>
      <sub><a href="./docs/src/entries/animation-cancel/">Code</a></sub>
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
      <a href="https://gamedevpl.github.io/gdc/bullet-magnetism/"><img src="./docs/thumbs/bullet-magnetism.jpg" width="260" alt="Bullet Magnetism & Aim Assist"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/bullet-magnetism/">Bullet Magnetism</a></b><br>
      <sub>Why Halo &amp; Destiny shots land when you miss: ±7.5° mid-air curving vs Raw 0°.</sub><br>
      <sub><a href="./docs/src/entries/bullet-magnetism/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/camera-deadzone/"><img src="./docs/thumbs/camera-deadzone.jpg" width="260" alt="Camera Deadzone & Look-Ahead"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/camera-deadzone/">Camera Deadzone</a></b><br>
      <sub>Compare a smart deadzone + look-ahead box against a jittery locked camera.</sub><br>
      <sub><a href="./docs/src/entries/camera-deadzone/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/fake-1hp/"><img src="./docs/thumbs/fake-1hp.jpg" width="260" alt="Fake 1 HP & Death's Door"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/fake-1hp/">Fake 1 HP &amp; Death's Door</a></b><br>
      <sub>Hidden bottom-of-bar HP, lethal 1 HP clamps &amp; mercy enemy aim scatter.</sub><br>
      <sub><a href="./docs/src/entries/fake-1hp/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/hitstop/"><img src="./docs/thumbs/hitstop.jpg" width="260" alt="Hitstop & Game Juice"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/hitstop/">Hitstop &amp; Game Juice</a></b><br>
      <sub>Smash golems and feel why a 60 ms freeze makes hits 10× heavier.</sub><br>
      <sub><a href="./docs/src/entries/hitstop/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/coyote-time/"><img src="./docs/thumbs/coyote-time.jpg" width="260" alt="Coyote Time & Buffering"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/coyote-time/">Coyote Time &amp; Buffering</a></b><br>
      <sub>Feel why 115 ms invisible ledges &amp; jump buffers make platforming fair.</sub><br>
      <sub><a href="./docs/src/entries/coyote-time/">Code</a></sub>
    </td>
  </tr>
</table>

### World & Systems (12)

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/chunk-streaming/"><img src="./docs/thumbs/chunk-streaming.jpg" width="260" alt="Chunk Streaming & Hysteresis"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/chunk-streaming/">Chunk Streaming &amp; Hysteresis</a></b><br>
      <sub>Inner load + outer unload buffer rings prevent border thrashing &amp; 48 ms hitches.</sub><br>
      <sub><a href="./docs/src/entries/chunk-streaming/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/structural-collapse/"><img src="./docs/thumbs/structural-collapse.jpg" width="260" alt="Structural Support & Collapse Graph"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/structural-collapse/">Structural Collapse Graph</a></b><br>
      <sub>BFS integrity hops from grounded foundations collapse unsupported tower wings.</sub><br>
      <sub><a href="./docs/src/entries/structural-collapse/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/snapshot-interpolation/"><img src="./docs/thumbs/snapshot-interpolation.jpg" width="260" alt="Snapshot Interpolation & Jitter Buffer"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/snapshot-interpolation/">Snapshot Interpolation</a></b><br>
      <sub>Turn jittery 20 Hz server snapshots into silky 60 FPS motion with a 100 ms buffer.</sub><br>
      <sub><a href="./docs/src/entries/snapshot-interpolation/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/rollback-netcode/"><img src="./docs/thumbs/rollback-netcode.jpg" width="260" alt="Rollback Netcode (GGPO) vs Delay"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/rollback-netcode/">Rollback Netcode (GGPO)</a></b><br>
      <sub>0 ms input lag at 120 ms ping + visible 4-frame rewind ghosts vs delay netcode.</sub><br>
      <sub><a href="./docs/src/entries/rollback-netcode/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/object-pooling/"><img src="./docs/thumbs/object-pooling.jpg" width="260" alt="Object Pooling vs GC Freeze Spikes"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/object-pooling/">Object Pooling vs GC</a></b><br>
      <sub>Recycle a pre-allocated bullet pool (flat 8.3 ms) vs 195 ms GC freeze spikes.</sub><br>
      <sub><a href="./docs/src/entries/object-pooling/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/lod-billboards/"><img src="./docs/thumbs/lod-billboards.jpg" width="260" alt="Level of Detail (LOD) & Impostors"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/lod-billboards/">Level of Detail (LOD)</a></b><br>
      <sub>Swap distant castles across 4 real tiers (964 → 148 → 24 → 2-tri billboards).</sub><br>
      <sub><a href="./docs/src/entries/lod-billboards/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/client-prediction/"><img src="./docs/thumbs/client-prediction.jpg" width="260" alt="Client-Side Prediction & Reconciliation"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/client-prediction/">Client Prediction &amp; Replay</a></b><br>
      <sub>0 ms local movement at 200 ms ping + input buffer replay after a server desync.</sub><br>
      <sub><a href="./docs/src/entries/client-prediction/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/frustum-culling/"><img src="./docs/thumbs/frustum-culling.jpg" width="260" alt="Frustum & Occlusion Culling"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/frustum-culling/">Frustum &amp; Occlusion Culling</a></b><br>
      <sub>See how your GPU drops everything outside the 62° camera cone &amp; behind walls.</sub><br>
      <sub><a href="./docs/src/entries/frustum-culling/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/wfc-island/"><img src="./docs/thumbs/wfc-island.jpg" width="260" alt="Wave Function Collapse (WFC)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/wfc-island/">Wave Function Collapse</a></b><br>
      <sub>Build seamless 3D islands tile-by-tile with lowest-entropy constraint propagation.</sub><br>
      <sub><a href="./docs/src/entries/wfc-island/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/lag-compensation/"><img src="./docs/thumbs/lag-compensation.jpg" width="260" alt="Lag Compensation & Server Rewind"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/lag-compensation/">Lag Compensation &amp; Rewind</a></b><br>
      <sub>Why sniper shots land at 180 ms ping — and why you sometimes die "behind a wall".</sub><br>
      <sub><a href="./docs/src/entries/lag-compensation/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/pity-timer/"><img src="./docs/thumbs/pity-timer.jpg" width="260" alt="Pity Timer & Pseudo-Random Drops"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/pity-timer/">Pity Timer &amp; PRD Drops</a></b><br>
      <sub>Race True 10% RNG against Hidden Pity + PRD side by side off the same seed.</sub><br>
      <sub><a href="./docs/src/entries/pity-timer/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/bsp-dungeon/"><img src="./docs/thumbs/bsp-dungeon.jpg" width="260" alt="Procedural Dungeon (BSP + MST)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/bsp-dungeon/">Procedural Dungeon (BSP)</a></b><br>
      <sub>Roll 3D roguelike dungeons that never trap the player vs broken random placement.</sub><br>
      <sub><a href="./docs/src/entries/bsp-dungeon/">Code</a></sub>
    </td>
  </tr>
</table>

### Enemy & Race AI (10)

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/sound-propagation/"><img src="./docs/thumbs/sound-propagation.jpg" width="260" alt="Sound Propagation & Acoustics"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/sound-propagation/">Sound Propagation Acoustics</a></b><br>
      <sub>BFS sound waves bend through doorways &amp; fade on carpet vs wall-piercing circles.</sub><br>
      <sub><a href="./docs/src/entries/sound-propagation/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/offscreen-courtesy/"><img src="./docs/thumbs/offscreen-courtesy.jpg" width="260" alt="First-Shot Miss & Off-Screen AI"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/offscreen-courtesy/">Off-Screen AI &amp; 1st-Shot Miss</a></b><br>
      <sub>BioShock &amp; Doom warning misses + off-screen courtesy vs instant backstabs.</sub><br>
      <sub><a href="./docs/src/entries/offscreen-courtesy/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/influence-maps/"><img src="./docs/thumbs/influence-maps.jpg" width="260" alt="Influence Maps & Tactical Flanking"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/influence-maps/">Influence Maps &amp; Flanking</a></b><br>
      <sub>3D threat/cover/flank heatmap guides raiders behind walls instead of into fire.</sub><br>
      <sub><a href="./docs/src/entries/influence-maps/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/goap-planner/"><img src="./docs/thumbs/goap-planner.jpg" width="260" alt="GOAP — Goal-Oriented Action Planning"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/goap-planner/">GOAP Action Planning</a></b><br>
      <sub>Blow up the ammo crate and watch F.E.A.R.-style AI invent a grenade backup plan.</sub><br>
      <sub><a href="./docs/src/entries/goap-planner/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/behavior-trees/"><img src="./docs/thumbs/behavior-trees.jpg" width="260" alt="Behavior Trees vs Spaghetti FSM"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/behavior-trees/">Behavior Trees vs FSM</a></b><br>
      <sub>Live priority Selector tree graph preempting Chase to Heal vs fragile FSM deadlock.</sub><br>
      <sub><a href="./docs/src/entries/behavior-trees/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/utility-ai/"><img src="./docs/thumbs/utility-ai.jpg" width="260" alt="Utility AI (Sims / NPC Needs)"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/utility-ai/">Utility AI (NPC Needs)</a></b><br>
      <sub>How NPCs balance Hunger, Sleep &amp; Wolf Danger with Utility Curves + Hysteresis.</sub><br>
      <sub><a href="./docs/src/entries/utility-ai/">Code</a></sub>
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
      <a href="https://gamedevpl.github.io/gdc/stealth-cones/"><img src="./docs/thumbs/stealth-cones.jpg" width="260" alt="Stealth Vision Cones"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/stealth-cones/">Stealth Vision Cones (? → !)</a></b><br>
      <sub>65° raycasted cones, fill bars &amp; distraction coins vs realistic 140° instant spot.</sub><br>
      <sub><a href="./docs/src/entries/stealth-cones/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/rubber-banding/"><img src="./docs/thumbs/rubber-banding.jpg" width="260" alt="Rubber Banding"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/rubber-banding/">Rubber Banding</a></b><br>
      <sub>Drive the Figure-8 overpass GP track and feel rival speed stretch like a tether.</sub><br>
      <sub><a href="./docs/src/entries/rubber-banding/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/attack-tokens/"><img src="./docs/thumbs/attack-tokens.jpg" width="260" alt="Attack Tokens"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/attack-tokens/">Attack Tokens</a></b><br>
      <sub>Fight 5 skeletons: polite turns with 1 Token vs instant dogpile with Tokens OFF.</sub><br>
      <sub><a href="./docs/src/entries/attack-tokens/">Code</a></sub>
    </td>
    <td colspan="2" align="center" valign="middle">
      <sub><b>Tip:</b> Press <code>T</code> inside any mini-game to switch between the real game-dev trick and the "honest" naive version — or hit <code>[</code> / <code>]</code> to step through all 46.</sub>
    </td>
  </tr>
</table>

### Pathfinding & Crowds (9)

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/jump-point-search/"><img src="./docs/thumbs/jump-point-search.jpg" width="260" alt="Jump Point Search (JPS) vs A*"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/jump-point-search/">Jump Point Search (JPS)</a></b><br>
      <sub>Leap straight across open rooms in 10× fewer expanded nodes than classic A*.</sub><br>
      <sub><a href="./docs/src/entries/jump-point-search/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/formation-slots/"><img src="./docs/thumbs/formation-slots.jpg" width="260" alt="Formation Movement & Squad Slots"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/formation-slots/">Formation Slots (RTS)</a></b><br>
      <sub>Wedge/Phalanx slots squeeze through narrow castle gates without blob jamming.</sub><br>
      <sub><a href="./docs/src/entries/formation-slots/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/navmesh-funnel/"><img src="./docs/thumbs/navmesh-funnel.jpg" width="260" alt="NavMesh & Funnel String-Pulling"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/navmesh-funnel/">NavMesh &amp; Funnel Pulling</a></b><br>
      <sub>Pull a taut path tight around pillar corners instead of zig-zagging centroids.</sub><br>
      <sub><a href="./docs/src/entries/navmesh-funnel/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/steering-avoidance/"><img src="./docs/thumbs/steering-avoidance.jpg" width="260" alt="Steering & Obstacle Avoidance"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/steering-avoidance/">Steering &amp; Whisker Avoid</a></b><br>
      <sub>6 hover-skiffs carve through sandstone pillars using 3 raycast feelers vs blind Seek.</sub><br>
      <sub><a href="./docs/src/entries/steering-avoidance/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/fog-of-war/"><img src="./docs/thumbs/fog-of-war.jpg" width="260" alt="Fog of War & RTS Vision"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/fog-of-war/">Fog of War &amp; RTS Vision</a></b><br>
      <sub>3-state visibility: Pitch Fog → Shroud memory → raycasted Live Vision behind ridges.</sub><br>
      <sub><a href="./docs/src/entries/fog-of-war/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/quadtree-collisions/"><img src="./docs/thumbs/quadtree-collisions.jpg" width="260" alt="Quadtree & Spatial Hashing"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/quadtree-collisions/">Quadtree &amp; Spatial Hashing</a></b><br>
      <sub>Handle 96+ live collisions by recursively splitting quadrants instead of O(n²) pairs.</sub><br>
      <sub><a href="./docs/src/entries/quadtree-collisions/">Code</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/flow-field/"><img src="./docs/thumbs/flow-field.jpg" width="260" alt="Flow Field & Dynamic NavMesh"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/flow-field/">Flow Field &amp; NavMesh</a></b><br>
      <sub>Steer 96 hover-bots around walls you paint live using one O(grid) vector field.</sub><br>
      <sub><a href="./docs/src/entries/flow-field/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/boids-flocking/"><img src="./docs/thumbs/boids-flocking.jpg" width="260" alt="Boids & Flocking"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/boids-flocking/">Boids &amp; Flocking</a></b><br>
      <sub>72 reef fish with zero leader — toggle Separation, Alignment &amp; Cohesion live.</sub><br>
      <sub><a href="./docs/src/entries/boids-flocking/">Code</a></sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://gamedevpl.github.io/gdc/astar/"><img src="./docs/thumbs/astar.jpg" width="260" alt="A* Pathfinding"></a><br>
      <b><a href="https://gamedevpl.github.io/gdc/astar/">A* Pathfinding</a></b><br>
      <sub>Drag to paint 3D maze walls live while distance numbers recalculate instantly.</sub><br>
      <sub><a href="./docs/src/entries/astar/">Code</a></sub>
    </td>
  </tr>
</table>

---

## Controls

| Input | Action |
| --- | --- |
| **`WASD` / Arrows** | Move, drive, run, or steer |
| **`Space` / Left-Click** | Primary action (jump, attack, fire, nitro, paint walls, smash blocks) |
| **`T`** | Toggle the mechanic ON vs OFF (strict vs fair, raw vs assisted) |
| **`X`** / **`V`** | X-Ray debug overlay / instant edge-case test |
| **`[` / `]`** | Previous / next diorama across all 46 |
| **Right-Drag / Scroll** | Orbit 3D diorama / zoom |
| **`P`** · **`R`** · **`M`/`B`** | Pause · reset · SFX / ambient audio |

---

## Running locally

Plain ES modules and raw WebGL2 inside `docs/` — no build step required:

```sh
python3 -m http.server 8092 --directory docs
```

Then open <http://localhost:8092/>. Append `?hud=0` for clean recording capture or `?lang=pl` for Polish.

---

## More interactive labs from [gamedev.pl](https://www.gamedev.pl)

- **[FX Lab](https://github.com/gamedevpl/fx-lab)** — 32 interactive WebGL2 & WebGPU graphics-effect sandboxes
- **[Lumen Lab](https://github.com/gamedevpl/silnik3d-od-zera/tree/main/docs/lumen-lab)** — 40 years of light and shadow in one single WebGL2 scene
- **[Neon Canal (Demko)](https://github.com/gamedevpl/silnik3d-od-zera/tree/main/demko)** — 3D C++ / WebAssembly / Metal neon racer
- **[Silnik 3D w C++ od zera](https://github.com/gamedevpl/silnik3d-od-zera)** — building a 3D C++ & OpenGL engine from an empty folder

## License

MIT — see [LICENSE](./LICENSE).
