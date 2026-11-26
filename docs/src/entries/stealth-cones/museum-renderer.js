// Dedicated 3D Moonlit Royal Museum Vault WebGL2 Renderer for "Stealth Vision Cones (? -> !)" (#08).
// Linear PBR + ACES filmic + 1024x1024 PCF shadows + polished indigo/slate checkered marble hall,
// 6 ornate marble cover pillars, velvet carpet runner, brass pedestals, floating Emerald Vault Relics,
// Blender-sculpted Shadow Thief & Museum Lantern Guards, and real-time raycast-clipped 3D Vision Cones!
import {
  clamp,
  makeLookAt,
  makePerspective,
  makeOrtho,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getStealthMeshes } from "../../stealth-mesh.js";

const SHADOW_RES = 1024;

export const HALL_BOUNDS = { minX: -7.2, maxX: 7.2, minZ: -6.0, maxZ: 6.0 };

// 6 symmetric marble pillars / museum display plinths that occlude BOTH shadows & guard raycasted vision cones!
export const PILLARS = [
  { id: "P0", x: -3.6, z: -2.1, hx: 0.66, hz: 0.66, h: 1.95, kind: "pillar" },
  { id: "P1", x:  0.0, z: -2.4, hx: 0.78, hz: 0.54, h: 1.75, kind: "plinth" },
  { id: "P2", x:  3.6, z: -2.1, hx: 0.66, hz: 0.66, h: 1.95, kind: "pillar" },
  { id: "P3", x: -3.6, z:  2.1, hx: 0.66, hz: 0.66, h: 1.95, kind: "pillar" },
  { id: "P4", x:  0.0, z:  2.4, hx: 0.78, hz: 0.54, h: 1.75, kind: "plinth" },
  { id: "P5", x:  3.6, z:  2.1, hx: 0.66, hz: 0.66, h: 1.95, kind: "pillar" },
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uAlert;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.022, 0.024, 0.068);
  vec3 midCol = vec3(0.055, 0.052, 0.135);
  vec3 botCol = vec3(0.088, 0.062, 0.165);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, topCol, smoothstep(0.45, 1.0, vUv.y));
  // Subtle crimson alarm edge tint when a guard hits ! SPOTTED !
  float edge = smoothstep(0.35, 0.96, length(vUv - 0.5) * 1.48);
  col = mix(col, vec3(0.58, 0.05, 0.12), edge * uAlert * 0.55);
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }
`;

const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}
`;

const WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vMat;
out vec4 vShadow;
void main() {
  vPos = aPos;
  vNorm = aNorm;
  vCol = aCol;
  vMat = aMat;
  vShadow = uLightVP * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vMat;
in vec4 vShadow;

uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uAlert;
uniform float uExitReady;
out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0022 * (1.0 - ndl), 0.0009);
  vec2 tex = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      s += (p.z - bias <= texture(uShadowMap, p.xy + vec2(x, y) * tex).r) ? 1.0 : 0.0;
    }
  }
  return s / 9.0;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base;
  float rough = 0.45;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Polished museum marble checkerboard with subtle gold inlay lines & soft moonlight skylight pool!
    vec2 cell = floor(vPos.xz * 0.85);
    float chk = mod(cell.x + cell.y, 2.0);
    vec2 f = fract(vPos.xz * 0.85);
    float grout = 1.0 - smoothstep(0.015, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base * 0.72, base * 1.15, chk);
    albedo = mix(albedo, vec3(0.18, 0.15, 0.10), grout * 0.55);
    // Subtle moonlit skylight illumination around center of gallery
    float moonPool = exp(-dot(vPos.xz, vPos.xz) * 0.032);
    emissive += vec3(0.05, 0.06, 0.14) * moonPool;
    rough = mix(0.24, 0.52, grout);
  } else if (vMat < 1.5) {
    // Ornate carved sandstone/marble pillars & gallery walls with subtle fluting
    float flute = 0.92 + 0.08 * sin((vPos.x + vPos.z) * 18.0);
    float band = smoothstep(0.06, 0.12, abs(fract(vPos.y * 0.65) - 0.5));
    albedo = base * mix(0.84, 1.04, band) * flute;
    rough = 0.46;
  } else if (vMat < 2.5) {
    // Velvet crimson museum runner carpet with woven brass borders
    float edge = smoothstep(0.88, 1.02, abs(vPos.x));
    albedo = mix(base, vec3(0.75, 0.52, 0.14), edge * 0.85);
    rough = 0.82;
  } else if (vMat < 3.5) {
    // Polished museum brass trim / stanchions / sconces
    rough = 0.18;
    emissive = base * 0.08;
  } else if (vMat < 4.5) {
    // Warm museum wall sconce glow
    float flicker = 0.90 + 0.10 * sin(uTime * 6.5 + vPos.x * 2.0);
    emissive = vec3(1.55, 1.02, 0.42) * flicker;
    rough = 0.10;
  } else {
    // Skylight Escape Pad (dark indigo center + luminous violet/emerald glowing border!)
    float pulse = 0.78 + 0.22 * sin(uTime * 5.0);
    vec2 lp = abs(vPos.xz - vec2(0.0, 4.9));
    float border = smoothstep(0.92, 1.10, lp.x) + smoothstep(0.48, 0.64, lp.y);
    border = clamp(border, 0.0, 1.0);
    vec3 idleCol = vec3(0.38, 0.22, 0.82);
    vec3 goCol = vec3(0.10, 1.45, 0.92);
    albedo = mix(vec3(0.06, 0.05, 0.14), vec3(0.10, 0.22, 0.24), uExitReady);
    emissive = mix(idleCol, goCol, uExitReady) * (0.14 + 0.95 * border) * pulse;
    rough = 0.16;
  }

  vec3 moonDir = normalize(vec3(0.34, 0.88, 0.34));
  float ndl = max(dot(N, moonDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(moonDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.58;

  vec3 amb = mix(vec3(0.08, 0.08, 0.16), vec3(0.24, 0.28, 0.46), N.y * 0.5 + 0.5);
  vec3 moonCol = mix(vec3(0.84, 0.88, 1.15), vec3(1.25, 0.55, 0.58), uAlert * 0.35);
  vec3 lit = albedo * (amb + moonCol * ndl * (0.28 + 0.72 * sh))
           + vec3(0.88, 0.92, 1.15) * spec * sh
           + emissive;

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Articulated Character Shader (supports both Shadow Thief crouch/tip-toe/toss & Guard march/look/alert!)
const CHAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform float uYaw;
uniform float uScale;
uniform vec4 uAnim;   // x: walkPhase, y: walkAmp, z: crouch (0..1) or alert (0..1), w: action/toss (0..1)
uniform float uIsGuard;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;

vec3 rotX(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}
vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  int part = int(aPart + 0.5);

  float ph = uAnim.x;
  float amp = uAnim.y;
  float stateVal = uAnim.z;
  float act = uAnim.w;

  if (uIsGuard < 0.5) {
    // SHADOW THIEF articulation: crouch hunch + stealth tip-toe stride + coin toss flick!
    float crouch = stateVal;
    float hipY = 0.62;
    float shY = 1.08;
    float legSwing = sin(ph) * 0.58 * amp;
    float armSwing = -sin(ph) * 0.45 * amp;

    if (part == 2) {
      vec3 pv = vec3(0.12, hipY, 0.0);
      p = rotX(p - pv, legSwing + crouch * 0.25) + pv;
      n = rotX(n, legSwing + crouch * 0.25);
    } else if (part == 3) {
      vec3 pv = vec3(-0.12, hipY, 0.0);
      p = rotX(p - pv, -legSwing + crouch * 0.25) + pv;
      n = rotX(n, -legSwing + crouch * 0.25);
    } else if (part == 4) {
      vec3 pv = vec3(0.29, shY, 0.0);
      p = rotX(p - pv, armSwing + crouch * 0.35) + pv;
      n = rotX(n, armSwing + crouch * 0.35);
    } else if (part == 5) {
      vec3 pv = vec3(-0.29, shY, 0.0);
      float tossAngle = -act * 1.35;
      p = rotX(p - pv, -armSwing + crouch * 0.35 + tossAngle) + pv;
      n = rotX(n, -armSwing + crouch * 0.35 + tossAngle);
    } else if (part == 1) {
      // Head counter-tilts upward slightly when hunched in crouch so goggles scan forward!
      vec3 pv = vec3(0.0, 1.22, 0.0);
      p = rotX(p - pv, -crouch * 0.18) + pv;
      n = rotX(n, -crouch * 0.18);
    }
    // Global crouch hunch + vertical squash + bob
    float lean = crouch * 0.42 + amp * 0.12;
    vec3 hunchPv = vec3(0.0, 0.55, 0.0);
    if (part != 2 && part != 3) {
      p = rotX(p - hunchPv, lean) + hunchPv;
      n = rotX(n, lean);
    }
    p.y *= (1.0 - crouch * 0.24);
    p.y += abs(sin(ph)) * 0.055 * amp;
  } else {
    // MUSEUM LANTERN GUARD articulation: heavy march + head scan + alert halberd raise!
    float alert = stateVal;
    float headScan = act; // subtle head sweep when pausing / suspicious
    float hipY = 0.72;
    float shY = 1.24;
    float legSwing = sin(ph) * 0.42 * amp;

    if (part == 2) {
      vec3 pv = vec3(0.15, hipY, 0.0);
      p = rotX(p - pv, legSwing) + pv;
      n = rotX(n, legSwing);
    } else if (part == 3) {
      vec3 pv = vec3(-0.15, hipY, 0.0);
      p = rotX(p - pv, -legSwing) + pv;
      n = rotX(n, -legSwing);
    } else if (part == 4) {
      // Lantern arm lifts forward slightly on alert/suspicion
      vec3 pv = vec3(0.37, shY, 0.0);
      float lift = -0.18 * alert + sin(ph) * 0.10 * amp;
      p = rotX(p - pv, lift) + pv;
      n = rotX(n, lift);
    } else if (part == 5) {
      // Halberd arm thrusts/raises dramatically when alert!
      vec3 pv = vec3(-0.37, shY, 0.0);
      float raise = -0.58 * alert - sin(ph) * 0.14 * amp;
      p = rotX(p - pv, raise) + pv;
      n = rotX(n, raise);
    } else if (part == 1) {
      vec3 pv = vec3(0.0, 1.42, 0.0);
      p = rotY(p - pv, headScan) + pv;
      n = rotY(n, headScan);
    }
    p.y += abs(sin(ph)) * 0.04 * amp;
  }

  p *= uScale;
  vec3 wp = rotY(p, uYaw) + uOrigin;
  vec3 wn = normalize(rotY(n, uYaw));
  vPos = wp;
  vNorm = wn;
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const CHAR_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;

uniform vec3 uCamPos;
uniform vec4 uTint;     // rgb + strength (lantern tint / crouch stealth sheen / alert flash)
uniform float uIsGuard;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 moonDir = normalize(vec3(0.34, 0.88, 0.34));
  float ndl = max(dot(N, moonDir), 0.0);
  vec3 H = normalize(moonDir + V);
  float rough = clamp(vRough, 0.04, 0.92);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.65;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4) * 0.44;

  vec3 amb = mix(vec3(0.11, 0.11, 0.22), vec3(0.34, 0.38, 0.56), N.y * 0.5 + 0.5);
  vec3 rimCol = uIsGuard > 0.5 ? vec3(0.95, 0.72, 0.38) : vec3(0.45, 0.78, 1.0);
  vec3 lit = base * (amb + vec3(1.15, 1.14, 1.28) * (0.28 + 0.72 * ndl))
           + vec3(0.95, 0.98, 1.12) * spec
           + rimCol * rim;

  // Emissive Thief Night-Vision Goggles (cyan-emerald)
  if (vRough < 0.08 && vCol.g > 0.85 && vCol.b > 0.68) {
    lit += vec3(0.18, 1.95, 1.55);
  }
  // Emissive Guard Lantern Core (shifts cyan -> amber -> crimson via uTint!)
  if (vRough < 0.08 && vCol.r > 0.90 && vCol.g > 0.75) {
    vec3 lCol = mix(vec3(1.95, 1.45, 0.35), pow(max(uTint.rgb, vec3(0.05)), vec3(1.6)) * 2.1, 0.65);
    lit = lCol;
  }
  // Emissive Guard Visor Eyes (crimson)
  if (vRough < 0.08 && vCol.r > 0.88 && vCol.g < 0.30) {
    lit += vec3(2.2, 0.16, 0.24);
  }

  lit = mix(lit, pow(max(uTint.rgb, vec3(0.02)), vec3(1.8)) * 2.1, clamp(uTint.a, 0.0, 0.85));
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent Stealth FX Shader: Raycast-Clipped Vision Cones, Acoustic Ripple Rings, Floating Gems & Coins!
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = raycast vision cone, 1 = acoustic/stealth ring, 2 = glowing relic/coin orb
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out float vKind;
void main() {
  vUv = aUv;
  vCol = aCol;
  vKind = aKind;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
in float vKind;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec4 c = vCol;
  if (vKind < 0.5) {
    // Raycast-clipped Vision Cone on marble floor:
    // vUv.y = 0 at guard lantern -> 1 at max range; vUv.x = 0..1 angular position across FOV
    float distFade = 1.0 - smoothstep(0.18, 1.0, vUv.y);
    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float edgeGlow = 1.0 - smoothstep(0.012, 0.07, edgeDist);
    float rimTip = smoothstep(0.86, 0.99, vUv.y) * 0.45;
    float scan = 0.82 + 0.18 * sin(vUv.y * 22.0 - uTime * 6.5);
    float a = c.a * (distFade * (0.34 * scan + 0.52 * edgeGlow) + rimTip * 0.55);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edgeGlow * 0.42), clamp(a, 0.0, 0.88));
  } else if (vKind < 1.5) {
    // Crisp expanding Acoustic Sound Wave Ring / Escape Ring
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.86, r) * smoothstep(0.68, 0.82, r);
    float inner = smoothstep(0.75, 0.0, r) * 0.08;
    float a = (ring + inner) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.35), clamp(a, 0.0, 0.92));
  } else {
    // Glowing Relic Crystal Halo / Brass Coin Spark / Ray Line Bead
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.10, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.72), s * c.a);
  }
}
`;

function pushBox(buf, x0, x1, y0, y1, z0, z1, col, matId) {
  const faces = [
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of faces) {
    for (const v of [a, b, c, a, c, d]) {
      buf.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], matId);
    }
  }
}

function buildMuseumWorld() {
  const buf = [];
  const floorCol = [0.22, 0.24, 0.36];
  const wallCol = [0.28, 0.29, 0.42];
  const pillarCol = [0.58, 0.56, 0.66];
  const plinthCol = [0.36, 0.32, 0.48];
  const brass = [0.88, 0.70, 0.28];
  const velvet = [0.68, 0.14, 0.24];
  const darkTrim = [0.16, 0.17, 0.26];

  // Main Marble Hall Floor Slab
  pushBox(buf, -7.8, 7.8, -0.45, 0.0, -6.6, 6.6, floorCol, 0);

  // Velvet Crimson Museum Carpet Runner down the center (X = -1.05..1.05, Z = -5.6..5.6)
  pushBox(buf, -1.05, 1.05, 0.0, 0.025, -5.6, 5.6, velvet, 2);

  // Skylight Escape Extraction Pad near South entrance (0.0, 4.9)
  pushBox(buf, -1.25, 1.25, 0.01, 0.055, 4.15, 5.65, [0.45, 0.30, 0.90], 5);
  pushBox(buf, -1.36, 1.36, 0.0, 0.04, 4.04, 5.76, brass, 3);

  // Outer Gallery Walls: North (-Z), West (-X), East (+X) tall; South (+Z) low curb for clean camera view!
  const bronze = [0.56, 0.44, 0.22];
  pushBox(buf, -7.8, 7.8, 0.0, 2.05, -6.6, -6.0, wallCol, 1);
  pushBox(buf, -7.8, -7.2, 0.0, 2.05, -6.0, 6.6, wallCol, 1);
  pushBox(buf,  7.2, 7.8, 0.0, 2.05, -6.0, 6.6, wallCol, 1);
  pushBox(buf, -7.8, 7.8, 0.0, 0.30,  6.0, 6.6, darkTrim, 1);

  // Sleek antique bronze wall coping & warm museum sconces along North, West, East gallery walls
  pushBox(buf, -7.8, 7.8, 2.05, 2.15, -6.62, -5.98, bronze, 3);
  pushBox(buf, -7.82, -7.18, 2.05, 2.15, -6.0, 6.6, bronze, 3);
  pushBox(buf,  7.18, 7.82, 2.05, 2.15, -6.0, 6.6, bronze, 3);
  for (const sx of [-4.6, 0.0, 4.6]) {
    pushBox(buf, sx - 0.14, sx + 0.14, 1.25, 1.62, -6.0, -5.85, [1.0, 0.8, 0.4], 4);
    pushBox(buf, sx - 0.18, sx + 0.18, 1.18, 1.26, -6.02, -5.82, brass, 3);
  }
  for (const sz of [-2.8, 2.2]) {
    pushBox(buf, -7.2, -7.05, 1.25, 1.62, sz - 0.14, sz + 0.14, [1.0, 0.8, 0.4], 4);
    pushBox(buf,  7.05, 7.2, 1.25, 1.62, sz - 0.14, sz + 0.14, [1.0, 0.8, 0.4], 4);
  }

  // 6 Ornate Marble Cover Pillars & Central Display Plinths (matching PILLARS exactly!)
  for (const p of PILLARS) {
    // Base pedestal step
    pushBox(buf, p.x - p.hx - 0.08, p.x + p.hx + 0.08, 0.0, 0.24, p.z - p.hz - 0.08, p.z + p.hz + 0.08, darkTrim, 1);
    pushBox(buf, p.x - p.hx - 0.04, p.x + p.hx + 0.04, 0.24, 0.32, p.z - p.hz - 0.04, p.z + p.hz + 0.04, brass, 3);
    // Main marble column shaft
    pushBox(buf, p.x - p.hx, p.x + p.hx, 0.32, p.h - 0.24, p.z - p.hz, p.z + p.hz, p.kind === "plinth" ? plinthCol : pillarCol, 1);
    // Brass crown capital
    pushBox(buf, p.x - p.hx - 0.06, p.x + p.hx + 0.06, p.h - 0.24, p.h - 0.14, p.z - p.hz - 0.06, p.z + p.hz + 0.06, brass, 3);
    pushBox(buf, p.x - p.hx - 0.10, p.x + p.hx + 0.10, p.h - 0.14, p.h, p.z - p.hz - 0.10, p.z + p.hz + 0.10, pillarCol, 1);
  }

  // Relic Pedestal Stands at the 3 standard vault positions
  for (const [rx, rz] of [[-5.4, -4.1], [0.0, 0.0], [5.4, -4.1]]) {
    pushBox(buf, rx - 0.42, rx + 0.42, 0.0, 0.56, rz - 0.42, rz + 0.42, darkTrim, 1);
    pushBox(buf, rx - 0.46, rx + 0.46, 0.56, 0.64, rz - 0.46, rz + 0.46, brass, 3);
    pushBox(buf, rx - 0.36, rx + 0.36, 0.64, 0.70, rz - 0.36, rz + 0.36, velvet, 2);
  }

  return new Float32Array(buf);
}

export function createMuseumRenderer(gl) {
  const [skyProg, shProg, worldProg, charProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [CHAR_VS, CHAR_FS],
    [FX_VS, FX_FS],
  ]);

  // Shadow Map FBO
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const emptyVao = gl.createVertexArray();

  // Static World Mesh
  const worldData = buildMuseumWorld();
  const worldVertCount = worldData.length / 10;
  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, worldData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  // Blender Sculpted Thief & Guard Meshes
  const meshes = getStealthMeshes();
  function uploadChar(m) {
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 44, 36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
    return { vao, count: m.indices.length };
  }
  const thiefGpu = uploadChar(meshes.thief);
  const guardGpu = uploadChar(meshes.guard);

  // Dynamic Translucent FX VAO (Vision Cones + Acoustic Rings + Floating Gems/Coins/Sparks)
  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 9000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyAlert = gl.getUniformLocation(skyProg, "uAlert");
  const uShLightVP = gl.getUniformLocation(shProg, "uLightVP");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWLightVP = gl.getUniformLocation(worldProg, "uLightVP");
  const uWShadow = gl.getUniformLocation(worldProg, "uShadowMap");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uWAlert = gl.getUniformLocation(worldProg, "uAlert");
  const uWExit = gl.getUniformLocation(worldProg, "uExitReady");

  const uCVP = gl.getUniformLocation(charProg, "uViewProj");
  const uCOrig = gl.getUniformLocation(charProg, "uOrigin");
  const uCYaw = gl.getUniformLocation(charProg, "uYaw");
  const uCScale = gl.getUniformLocation(charProg, "uScale");
  const uCAnim = gl.getUniformLocation(charProg, "uAnim");
  const uCGuard = gl.getUniformLocation(charProg, "uIsGuard");
  const uCCam = gl.getUniformLocation(charProg, "uCamPos");
  const uCTint = gl.getUniformLocation(charProg, "uTint");

  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");
  const uFTime = gl.getUniformLocation(fxProg, "uTime");

  // Precompute static light shadow matrix (covers the entire 15x13 museum hall cleanly!)
  const lightVP = mulMat4(
    makeOrtho(-10.5, 10.5, -9.5, 9.5, 1.0, 34.0),
    makeLookAt([6.8, 17.5, 6.8], [0, 0, 0], [0, 1, 0])
  );

  // Render shadow map once at init (museum walls & pillars are static!)
  function bakeStaticShadow() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shProg);
    gl.uniformMatrix4fv(uShLightVP, false, lightVP);
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bakeStaticShadow();

  const fxBuf = [];
  function pushQuadXZ(cx, y, cz, rad, col, kind) {
    const [r, g, b, a] = col;
    const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
    fxBuf.push(
      x0, y, z0, 0, 0, r, g, b, a, kind,
      x1, y, z0, 1, 0, r, g, b, a, kind,
      x1, y, z1, 1, 1, r, g, b, a, kind,
      x0, y, z0, 0, 0, r, g, b, a, kind,
      x1, y, z1, 1, 1, r, g, b, a, kind,
      x0, y, z1, 0, 1, r, g, b, a, kind
    );
  }

  function pushBillboard(cx, cy, cz, rad, right, up, col, kind) {
    const [r, g, b, a] = col;
    const rx = right[0] * rad, ry = right[1] * rad, rz = right[2] * rad;
    const ux = up[0] * rad, uy = up[1] * rad, uz = up[2] * rad;
    const p0 = [cx - rx - ux, cy - ry - uy, cz - rz - uz];
    const p1 = [cx + rx - ux, cy + ry - uy, cz + rz - uz];
    const p2 = [cx + rx + ux, cy + ry + uy, cz + rz + uz];
    const p3 = [cx - rx + ux, cy - ry + uy, cz - rz + uz];
    fxBuf.push(
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, kind,
      p1[0], p1[1], p1[2], 1, 0, r, g, b, a, kind,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, kind,
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, kind,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, kind,
      p3[0], p3[1], p3[2], 0, 1, r, g, b, a, kind
    );
  }

  function pushConeFan(guard, y, col, maxRange) {
    const pts = guard.conePoints;
    if (!pts || pts.length < 2) return;
    const [r, g, b, a] = col;
    const ox = guard.x;
    const oz = guard.z;
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const v0 = clamp(p0.dist / Math.max(0.01, maxRange), 0, 1);
      const v1 = clamp(p1.dist / Math.max(0.01, maxRange), 0, 1);
      const um = 0.5 * (u0 + u1);
      fxBuf.push(
        ox, y, oz, um, 0.0, r, g, b, a, 0,
        p0.x, y, p0.z, u0, v0, r, g, b, a, 0,
        p1.x, y, p1.z, u1, v1, r, g, b, a, 0
      );
    }
  }

  return {
    render(w, h, cam, state) {
      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyAlert, state.alertPulse || 0);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // World geometry
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniformMatrix4fv(uWLightVP, false, lightVP);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(uWShadow, 0);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.uniform1f(uWAlert, state.alertPulse || 0);
      gl.uniform1f(uWExit, state.exitReady ? 1.0 : 0.0);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // Articulated Sculpted Characters
      gl.useProgram(charProg);
      gl.uniformMatrix4fv(uCVP, false, viewProj);
      gl.uniform3fv(uCCam, basis.pos);

      // 1) Shadow Thief
      const th = state.thief;
      gl.bindVertexArray(thiefGpu.vao);
      gl.uniform3f(uCOrig, th.x, th.y, th.z);
      gl.uniform1f(uCYaw, th.yaw);
      gl.uniform1f(uCScale, 0.92);
      gl.uniform4f(uCAnim, th.walkPhase, th.walkAmp, th.crouchBlend, th.tossAnim);
      gl.uniform1f(uCGuard, 0.0);
      if (state.alertPulse > 0.15) {
        gl.uniform4f(uCTint, 1.0, 0.18, 0.24, state.alertPulse * 0.42);
      } else if (th.crouchBlend > 0.4) {
        gl.uniform4f(uCTint, 0.25, 0.85, 0.95, 0.14);
      } else {
        gl.uniform4f(uCTint, 0.0, 0.0, 0.0, 0.0);
      }
      gl.drawElements(gl.TRIANGLES, thiefGpu.count, gl.UNSIGNED_SHORT, 0);

      // 2) Museum Lantern Guards
      gl.bindVertexArray(guardGpu.vao);
      gl.uniform1f(uCGuard, 1.0);
      for (const g of state.guards) {
        gl.uniform3f(uCOrig, g.x, 0.0, g.z);
        gl.uniform1f(uCYaw, g.yaw);
        gl.uniform1f(uCScale, 0.92);
        gl.uniform4f(uCAnim, g.walkPhase, g.walkAmp, clamp(g.suspicion, 0, 1), g.headScan || 0);
        if (g.suspicion >= 0.99) {
          gl.uniform4f(uCTint, 1.0, 0.14, 0.22, 0.30);
        } else if (g.suspicion > 0.04 || g.investigating) {
          gl.uniform4f(uCTint, 1.0, 0.78, 0.14, 0.18);
        } else {
          gl.uniform4f(uCTint, 0.22, 0.78, 1.0, 0.06);
        }
        gl.drawElements(gl.TRIANGLES, guardGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // 3) Dynamic Translucent FX: Raycasted Vision Cones, Acoustic Ripples, Relics, Coins & Sparks!
      fxBuf.length = 0;

      // Guard Raycasted Vision Cones on the marble floor (+ faint upper volumetric sheet!)
      for (const g of state.guards) {
        let coneCol;
        if (g.suspicion >= 0.99) {
          const flash = 0.72 + 0.28 * Math.sin(state.time * 18.0);
          coneCol = [1.0, 0.14, 0.22, 0.88 * flash];
        } else if (g.suspicion > 0.03) {
          const t = clamp(g.suspicion, 0, 1);
          coneCol = [0.98, 0.78 - t * 0.42, 0.14, 0.72 + t * 0.16];
        } else if (g.investigating) {
          coneCol = [1.0, 0.76, 0.18, 0.68];
        } else {
          coneCol = state.realisticMode
            ? [0.98, 0.30, 0.40, 0.78]
            : [0.22, 0.82, 1.0, 0.78];
        }
        pushConeFan(g, 0.055, coneCol, g.range);
        pushConeFan(g, 0.24, [coneCol[0], coneCol[1], coneCol[2], coneCol[3] * 0.26], g.range);
      }

      // Acoustic Sound Ripples (Footsteps & Tossed Distraction Coins)
      for (const rp of state.ripples) {
        const alpha = clamp(1.0 - rp.age / rp.life, 0, 1) * 0.88;
        const rad = rp.maxR * (0.14 + 0.86 * (rp.age / rp.life));
        pushQuadXZ(rp.x, 0.075, rp.z, rad, [rp.col[0], rp.col[1], rp.col[2], alpha], 1);
      }

      // Live Footstep Noise Halo under Thief when running & X-Ray ON
      if (state.showOverlay && th.noiseRadius > 0.2) {
        pushQuadXZ(th.x, 0.068, th.z, th.noiseRadius, [0.58, 0.42, 1.0, 0.35], 1);
      }

      // Floating Glowing Emerald Vault Relics
      for (const rel of state.relics) {
        if (rel.collected) continue;
        const bob = 1.12 + 0.14 * Math.sin(state.time * 3.2 + rel.x);
        pushQuadXZ(rel.x, 0.74, rel.z, 0.56, [0.14, 0.96, 0.66, 0.48], 1);
        pushBillboard(rel.x, bob, rel.z, 0.54, basis.right, basis.up, [0.16, 1.0, 0.68, 0.92], 2);
        pushBillboard(rel.x, bob, rel.z, 0.26, basis.right, basis.up, [0.85, 1.0, 0.96, 0.98], 2);
      }

      // Active Tossed Brass Coins in Flight or Clinking on Marble
      for (const c of state.coins) {
        pushBillboard(c.x, c.y + 0.12, c.z, 0.26, basis.right, basis.up, [1.0, 0.84, 0.24, 0.96], 2);
      }

      // Escape Pad Glow Ring when ready
      if (state.exitReady) {
        const pulseR = 1.35 + 0.18 * Math.sin(state.time * 5.0);
        pushQuadXZ(0.0, 0.08, 4.9, pulseR, [0.16, 1.0, 0.76, 0.85], 1);
      }

      // Spark Particles (relic grab, coin clink, caught flash)
      for (const sp of state.sparks) {
        const a = clamp(sp.life / sp.maxLife, 0, 1);
        pushBillboard(sp.x, sp.y, sp.z, sp.size * (0.4 + 0.6 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a], 2);
      }

      if (fxBuf.length > 0) {
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.useProgram(fxProg);
        gl.uniformMatrix4fv(uFVP, false, viewProj);
        gl.uniform1f(uFTime, state.time);
        gl.bindVertexArray(fxVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(fxBuf));
        gl.drawArrays(gl.TRIANGLES, 0, fxBuf.length / 10);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
      }

      gl.bindVertexArray(null);
      return { viewProj, basis };
    },
  };
}
