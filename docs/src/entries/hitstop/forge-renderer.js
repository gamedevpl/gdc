// Dedicated 3D Torchlit Volcanic Forge Courtyard WebGL2 Renderer for "Hitstop & Game Juice" (#05).
// Linear PBR shading + ACES filmic tone map + 1024x1024 PCF shadow map + 4 warm corner forge braziers.
// Renders Blender-sculpted Forge Brawler (with giant glowing runed Warhammer) & Runic Stone Golems,
// Hitstop tension vibration, 1-frame pure incandescent white hit-flash, hammer arc smear, shockwave rings & stone shards!
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
import { getHitstopMeshes } from "../../hitstop-mesh.js";

const SHADOW_RES = 1024;
const BRAZIER_PTS = [
  [-5.6, 1.45, -5.6],
  [5.6, 1.45, -5.6],
  [-5.6, 1.45, 5.6],
  [5.6, 1.45, 5.6],
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uFreezeGlow;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.035, 0.032, 0.068);
  vec3 midCol = vec3(0.11, 0.075, 0.12);
  vec3 botCol = vec3(0.22, 0.09, 0.065);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.45, vUv.y));
  col = mix(col, topCol, smoothstep(0.42, 1.0, vUv.y));
  // Subtle dramatic golden vignette surge right during a Hitstop freeze frame!
  float vig = smoothstep(0.32, 0.92, length(vUv - 0.5) * 1.45);
  col = mix(col, col * (1.0 - 0.35 * vig) + vec3(0.18, 0.10, 0.02) * (1.0 - vig), uFreezeGlow * 0.65);
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
uniform vec3 uImpactLightPos;
uniform float uImpactLightStr;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0024 * (1.0 - ndl), 0.0009);
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
  float rough = 0.78;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Basalt stone courtyard slabs + inlaid brass sparring rings!
    vec2 tile = fract(vPos.xz * 0.65);
    float mortar = smoothstep(0.03, 0.075, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)));
    float shade = 0.85 + 0.25 * hash21(floor(vPos.xz * 0.65));
    albedo = mix(base * 0.35, base * shade, mortar);
    float rad = length(vPos.xz);
    float ring1 = smoothstep(0.11, 0.03, abs(rad - 2.65));
    float ring2 = smoothstep(0.11, 0.03, abs(rad - 5.10));
    float brassRing = max(ring1, ring2);
    albedo = mix(albedo, pow(vec3(0.86, 0.62, 0.22), vec3(2.2)), brassRing * 0.85);
    rough = mix(0.80, 0.28, brassRing);
    emissive += vec3(0.32, 0.14, 0.02) * brassRing * 0.45;
  } else if (vMat < 1.5) {
    // Beveled stone walls & pedestals
    float row = floor(vPos.y * 2.5);
    float bx = fract((vPos.x + vPos.z) * 0.9 + mod(row, 2.0) * 0.5);
    float by = fract(vPos.y * 2.5);
    float m = smoothstep(0.03, 0.08, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
    albedo = mix(base * 0.40, base * (0.88 + 0.18 * hash21(vec2(row, floor(vPos.x + vPos.z)))), m);
    rough = 0.84;
  } else if (vMat < 2.5) {
    // Dark cast iron anvil / brazier bowls
    rough = 0.34;
  } else {
    // Molten glowing forge coals inside corner braziers!
    float flick = 0.85 + 0.15 * sin(uTime * 11.0 + vPos.x * 2.0 + vPos.z);
    emissive = vec3(1.65, 0.48, 0.05) * flick;
    rough = 0.25;
  }

  vec3 sunDir = normalize(vec3(0.38, 0.86, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 52.0, 1.0 - rough)) * (1.0 - rough) * 0.38;

  vec3 amb = mix(vec3(0.07, 0.06, 0.11), vec3(0.20, 0.22, 0.34), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.85, 0.86, 1.02) * ndl * (0.26 + 0.74 * sh))
           + vec3(0.95, 0.92, 0.88) * spec * sh
           + emissive;

  // 4 warm corner forge brazier point lights
  vec3 bPos[4];
  bPos[0] = vec3(-5.6, 1.65, -5.6);
  bPos[1] = vec3( 5.6, 1.65, -5.6);
  bPos[2] = vec3(-5.6, 1.65,  5.6);
  bPos[3] = vec3( 5.6, 1.65,  5.6);
  for (int i = 0; i < 4; i++) {
    vec3 L = bPos[i] - vPos;
    float d = length(L);
    if (d < 8.5) {
      L /= max(d, 0.001);
      float att = pow(1.0 - d / 8.5, 2.0);
      float flick = 0.92 + 0.08 * sin(uTime * 9.5 + float(i) * 1.9);
      float nd = max(dot(N, L), 0.15);
      lit += albedo * vec3(1.55, 0.62, 0.16) * nd * att * 0.95 * flick;
    }
  }

  // Dynamic incandescent impact flash point light right where the warhammer hits stone!
  if (uImpactLightStr > 0.01) {
    vec3 L = uImpactLightPos - vPos;
    float d = length(L);
    if (d < 6.5) {
      L /= max(d, 0.001);
      float att = pow(1.0 - d / 6.5, 1.8);
      lit += albedo * vec3(2.2, 1.4, 0.55) * max(dot(N, L), 0.25) * att * uImpactLightStr;
    }
  }

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Shared articulated Hero skinning GLSL
const HERO_SKIN_GLSL = `
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }

void skinHero(
  vec3 inPos, vec3 inNorm, float partId,
  vec3 worldPos, float yaw, float torsoYaw, float hammerPitch, float hammerYaw,
  float walkPhase, float walkAmp, float squash,
  out vec3 outPos, out vec3 outNorm
) {
  vec3 p = inPos;
  vec3 n = inNorm;
  int pid = int(partId + 0.5);
  float stride = sin(walkPhase) * walkAmp;

  // Legs (parts 2, 3)
  if (pid == 2 || pid == 3) {
    vec3 piv = (pid == 2) ? vec3(0.17, 0.72, 0.0) : vec3(-0.17, 0.72, 0.0);
    float ang = (pid == 2) ? (stride * 0.62) : (-stride * 0.62);
    p = rotX(p - piv, ang) + piv;
    n = rotX(n, ang);
  }
  // Left Arm (part 4) counter-balances swing
  else if (pid == 4) {
    vec3 piv = vec3(0.38, 1.28, 0.0);
    float ang = -stride * 0.48 - hammerPitch * 0.25;
    p = rotX(p - piv, ang) + piv;
    n = rotX(n, ang);
  }
  // Right Arm + MASSIVE WARHAMMER (part 5)
  else if (pid == 5) {
    vec3 piv = vec3(-0.38, 1.28, 0.0);
    vec3 rel = p - piv;
    rel = rotY(rotX(rel, hammerPitch), hammerYaw);
    p = rel + piv;
    n = rotY(rotX(n, hammerPitch), hammerYaw);
  }

  // Torso twist for upper body (torso, head, arms)
  if (pid != 2 && pid != 3) {
    vec3 tpiv = vec3(0.0, 0.85, 0.0);
    p = rotY(p - tpiv, torsoYaw) + tpiv;
    n = rotY(n, torsoYaw);
  }

  // Anticipation crouch / follow-through stretch
  p.y += abs(cos(walkPhase)) * 0.045 * walkAmp;
  p.x *= (1.0 - squash * 0.18);
  p.z *= (1.0 - squash * 0.18);
  p.y *= (1.0 + squash * 0.20);

  outPos = rotY(p, yaw) + worldPos;
  outNorm = normalize(rotY(n, yaw));
}
`;

const HERO_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;

uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uYaw;
uniform float uTorsoYaw;
uniform float uHammerPitch;
uniform float uHammerYaw;
uniform float uWalkPhase;
uniform float uWalkAmp;
uniform float uSquash;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
${HERO_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinHero(aPos, aNorm, aPart, uPos, uYaw, uTorsoYaw, uHammerPitch, uHammerYaw, uWalkPhase, uWalkAmp, uSquash, wp, wn);
  vPos = wp;
  vNorm = wn;
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const HERO_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=3) in float aPart;

uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uYaw;
uniform float uTorsoYaw;
uniform float uHammerPitch;
uniform float uHammerYaw;
uniform float uWalkPhase;
uniform float uWalkAmp;
uniform float uSquash;
${HERO_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinHero(aPos, aNorm, aPart, uPos, uYaw, uTorsoYaw, uHammerPitch, uHammerYaw, uWalkPhase, uWalkAmp, uSquash, wp, wn);
  gl_Position = uLightVP * vec4(wp, 1.0);
}
`;

// Golem skinning (hitstop micro-tremor, heavy recoil tilt, impact squash & stretch, shatter scale!)
const GOLEM_SKIN_GLSL = `
vec3 gRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 gRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

void skinGolem(
  vec3 inPos, vec3 inNorm, float partId,
  vec3 worldPos, vec3 vibOff, float yaw, float recoil, float squash, float scale, float armLift,
  out vec3 outPos, out vec3 outNorm
) {
  vec3 p = inPos;
  vec3 n = inNorm;
  int pid = int(partId + 0.5);

  if (pid == 4) {
    vec3 piv = vec3(0.0, 1.48, 0.0);
    p = gRotX(p - piv, armLift) + piv;
    n = gRotX(n, armLift);
  }

  // Impact squash & rebound stretch
  p.x *= (1.0 - squash * 0.24) * scale;
  p.z *= (1.0 - squash * 0.24) * scale;
  p.y *= (1.0 + squash * 0.26) * scale;

  // Backward rock recoil around ankles
  p = gRotX(p, -recoil);
  n = gRotX(n, -recoil);

  outPos = gRotY(p, yaw) + worldPos + vibOff;
  outNorm = normalize(gRotY(n, yaw));
}
`;

const GOLEM_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;

uniform mat4 uViewProj;
uniform vec3 uPos;
uniform vec3 uVib;
uniform float uYaw;
uniform float uRecoil;
uniform float uSquash;
uniform float uScale;
uniform float uArmLift;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
${GOLEM_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinGolem(aPos, aNorm, aPart, uPos, uVib, uYaw, uRecoil, uSquash, uScale, uArmLift, wp, wn);
  vPos = wp;
  vNorm = wn;
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const GOLEM_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=3) in float aPart;

uniform mat4 uLightVP;
uniform vec3 uPos;
uniform vec3 uVib;
uniform float uYaw;
uniform float uRecoil;
uniform float uSquash;
uniform float uScale;
uniform float uArmLift;
${GOLEM_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinGolem(aPos, aNorm, aPart, uPos, uVib, uYaw, uRecoil, uSquash, uScale, uArmLift, wp, wn);
  gl_Position = uLightVP * vec4(wp, 1.0);
}
`;

const FIGHTER_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;

uniform vec3 uCamPos;
uniform float uWhiteFlash; // 1.0 = incandescent 1-frame impact white flash!
uniform float uChargeGlow; // ember boost on hammer runes during wind-up!
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.38, 0.86, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.06, 0.92);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.55;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.32;

  vec3 amb = mix(vec3(0.14, 0.11, 0.18), vec3(0.34, 0.36, 0.48), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.18, 1.06, 0.96) * (0.24 + 0.76 * ndl))
           + vec3(1.1, 0.98, 0.84) * spec
           + vec3(1.0, 0.62, 0.28) * rim;

  // Emissive molten runes on hammer & visor (bright warm orange)
  if (vRough < 0.10 && vCol.r > 0.85 && vCol.b < 0.30) {
    lit += vec3(1.85, 0.62, 0.06) * (1.0 + uChargeGlow * 1.4);
  }
  // Emissive glowing cyan rune crystal core & eyes on Golems!
  if (vRough < 0.10 && vCol.b > 0.85 && vCol.g > 0.80) {
    lit += vec3(0.14, 1.45, 1.95);
  }

  // Pure incandescent 1-frame hit-flash (the classic arcade/Capcom juice trick!)
  lit = mix(lit, vec3(3.6, 3.3, 2.9), clamp(uWhiteFlash, 0.0, 1.0));

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent FX Shader (Hammer Smear Ribbon, Impact Shockwaves, Flying Stone Shards, Sparks)
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = smear/solid quad, 1 = shockwave ring, 2 = spark orb
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
out vec4 fragColor;
void main() {
  vec4 c = vCol;
  if (vKind < 0.5) {
    // Fiery molten hammer swing arc smear!
    float fade = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.15, abs(vUv.y - 0.5) * 2.0);
    fragColor = vec4(mix(c.rgb, vec3(1.0, 0.95, 0.72), fade * 0.45), fade * c.a);
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.98, 0.80, r) * smoothstep(0.45, 0.70, r);
    float a = ring * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.45), clamp(a, 0.0, 0.96));
  } else {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.15, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.6), s * c.a);
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
    for (const p of [a, b, c, a, c, d]) {
      buf.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], matId);
    }
  }
}

function buildForgeCourtyard() {
  const buf = [];
  const C_FLOOR = [0.28, 0.27, 0.31];
  const C_WALL = [0.34, 0.32, 0.36];
  const C_IRON = [0.18, 0.18, 0.21];
  const C_COAL = [1.0, 0.52, 0.10];

  // Solid courtyard basalt floor slab
  pushBox(buf, -7.2, 7.2, -1.2, 0.0, -7.2, 7.2, C_FLOOR, 0.0);

  // Perimeter low crenellated forge walls (open on front +Z for unobstructed camera view!)
  pushBox(buf, -7.2, 7.2, 0.0, 1.05, -7.2, -6.35, C_WALL, 1.0);
  pushBox(buf, -7.2, -6.35, 0.0, 0.95, -6.35, 6.35, C_WALL, 1.0);
  pushBox(buf, 6.35, 7.2, 0.0, 0.95, -6.35, 6.35, C_WALL, 1.0);
  // Subtle front curb rim
  pushBox(buf, -7.2, 7.2, -0.2, 0.16, 6.65, 7.2, C_WALL, 1.0);

  // Back blacksmith forged anvil prop on raised hearth stone
  pushBox(buf, -1.5, 1.5, 0.0, 0.30, -6.2, -4.7, C_WALL, 1.0);
  pushBox(buf, -0.55, 0.55, 0.30, 0.62, -5.75, -5.15, C_IRON, 2.0);
  pushBox(buf, -0.35, 0.35, 0.62, 0.95, -5.62, -5.28, C_IRON, 2.0);
  pushBox(buf, -0.82, 0.82, 0.95, 1.24, -5.75, -5.15, C_IRON, 2.0);

  // 4 Corner Forge Braziers with glowing molten coals!
  for (const [bx, , bz] of BRAZIER_PTS) {
    pushBox(buf, bx - 0.62, bx + 0.62, 0.0, 0.92, bz - 0.62, bz + 0.62, C_WALL, 1.0);
    pushBox(buf, bx - 0.72, bx + 0.72, 0.92, 1.28, bz - 0.72, bz + 0.72, C_IRON, 2.0);
    pushBox(buf, bx - 0.52, bx + 0.52, 1.22, 1.48, bz - 0.52, bz + 0.52, C_COAL, 3.0);
  }

  return new Float32Array(buf);
}

export function projectPoint(world, vp, w, h) {
  const [x, y, z] = world;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
}

function makePartVao(gl, pack) {
  const inter = new Float32Array(pack.count * 11);
  for (let i = 0; i < pack.count; i++) {
    const k = i * 11;
    inter[k + 0] = pack.pos[i * 3 + 0];
    inter[k + 1] = pack.pos[i * 3 + 1];
    inter[k + 2] = pack.pos[i * 3 + 2];
    inter[k + 3] = pack.norm[i * 3 + 0];
    inter[k + 4] = pack.norm[i * 3 + 1];
    inter[k + 5] = pack.norm[i * 3 + 2];
    inter[k + 6] = pack.col[i * 3 + 0];
    inter[k + 7] = pack.col[i * 3 + 1];
    inter[k + 8] = pack.col[i * 3 + 2];
    inter[k + 9] = pack.part[i];
    inter[k + 10] = pack.rough[i];
  }
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pack.idx, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 44, 36);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
  return { vao, idxCount: pack.idx.length };
}

export function createForgeRenderer(gl) {
  const [skyProg, shadowProg, worldProg, heroProg, heroShadowProg, golemProg, golemShadowProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [HERO_VS, FIGHTER_FS],
    [HERO_SHADOW_VS, SHADOW_FS],
    [GOLEM_VS, FIGHTER_FS],
    [GOLEM_SHADOW_VS, SHADOW_FS],
    [FX_VS, FX_FS],
  ]);

  // Shadow map
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

  // Courtyard VAO
  const worldData = buildForgeCourtyard();
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

  // Dynamic stone debris cubes VAO
  const debVao = gl.createVertexArray();
  const debVbo = gl.createBuffer();
  gl.bindVertexArray(debVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, debVbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  // Blender meshes
  const meshes = getHitstopMeshes();
  const heroGeo = makePartVao(gl, meshes.hero);
  const golemGeo = makePartVao(gl, meshes.golem);

  // FX VAO
  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  const emptyVao = gl.createVertexArray();
  gl.bindVertexArray(null);

  const pushFxQuad = (arr, p0, p1, p2, p3, r, g, b, a, kind) => {
    const vs = [[p0, 0, 0], [p1, 1, 0], [p2, 1, 1], [p0, 0, 0], [p2, 1, 1], [p3, 0, 1]];
    for (const [p, u, v] of vs) arr.push(p[0], p[1], p[2], u, v, r, g, b, a, kind);
  };
  const pushBillboard = (arr, cx, cy, cz, rad, basis, r, g, b, a, kind) => {
    const rx = basis.right[0] * rad, ry = basis.right[1] * rad, rz = basis.right[2] * rad;
    const ux = basis.up[0] * rad, uy = basis.up[1] * rad, uz = basis.up[2] * rad;
    pushFxQuad(
      arr,
      [cx - rx - ux, cy - ry - uy, cz - rz - uz],
      [cx + rx - ux, cy + ry - uy, cz + rz - uz],
      [cx + rx + ux, cy + ry + uy, cz + rz + uz],
      [cx - rx + ux, cy - ry + uy, cz - rz + uz],
      r, g, b, a, kind,
    );
  };

  function bindHeroUniforms(prog, hero) {
    gl.uniform3f(gl.getUniformLocation(prog, "uPos"), hero.x, hero.y, hero.z);
    gl.uniform1f(gl.getUniformLocation(prog, "uYaw"), hero.yaw);
    gl.uniform1f(gl.getUniformLocation(prog, "uTorsoYaw"), hero.torsoYaw || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uHammerPitch"), hero.hammerPitch || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uHammerYaw"), hero.hammerYaw || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uWalkPhase"), hero.walkPhase || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uWalkAmp"), hero.walkAmp || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uSquash"), hero.squash || 0);
  }

  function bindGolemUniforms(prog, g) {
    gl.uniform3f(gl.getUniformLocation(prog, "uPos"), g.x, g.y, g.z);
    gl.uniform3f(gl.getUniformLocation(prog, "uVib"), g.vibX || 0, g.vibY || 0, g.vibZ || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uYaw"), g.yaw);
    gl.uniform1f(gl.getUniformLocation(prog, "uRecoil"), g.recoil || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uSquash"), g.squash || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uScale"), g.scale ?? 1.0);
    gl.uniform1f(gl.getUniformLocation(prog, "uArmLift"), g.armLift || 0);
  }

  function render({
    w, h, cam, time, hero, golems,
    smearPoints = [],   // [{ inner:[x,y,z], outer:[x,y,z], a }]
    rings = [],         // [{ x, y, z, rad, r, g, b, a, vertical }]
    sparks = [],        // [{ x, y, z, r, g, b, life, size }]
    debris = [],        // [{ x, y, z, s, col }]
    impactLight = null, // { x, y, z, str }
    freezeGlow = 0,
  }) {
    const aspect = w / Math.max(1, h);
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.25, 120);
    const viewProj = mulMat4(proj, view);

    const lightView = makeLookAt([7.5, 16.5, 6.5], [0, 0.4, 0], [0, 1, 0]);
    const lightProj = makeOrtho(-10.5, 10.5, -10.5, 10.5, 2.0, 38.0);
    const lightVP = mulMat4(lightProj, lightView);

    // 1) Shadow Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, "uLightVP"), false, lightVP);
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

    gl.useProgram(heroShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(heroShadowProg, "uLightVP"), false, lightVP);
    bindHeroUniforms(heroShadowProg, hero);
    gl.bindVertexArray(heroGeo.vao);
    gl.drawElements(gl.TRIANGLES, heroGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(golemShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(golemShadowProg, "uLightVP"), false, lightVP);
    gl.bindVertexArray(golemGeo.vao);
    for (const g of golems) {
      if ((g.scale ?? 1) < 0.05) continue;
      bindGolemUniforms(golemShadowProg, g);
      gl.drawElements(gl.TRIANGLES, golemGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 2) Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.04, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(skyProg);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uFreezeGlow"), freezeGlow);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Courtyard
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);

    gl.useProgram(worldProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(worldProg, "uViewProj"), false, viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(worldProg, "uLightVP"), false, lightVP);
    gl.uniform1i(gl.getUniformLocation(worldProg, "uShadowMap"), 0);
    gl.uniform3f(gl.getUniformLocation(worldProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform1f(gl.getUniformLocation(worldProg, "uTime"), time);
    if (impactLight && impactLight.str > 0.01) {
      gl.uniform3f(gl.getUniformLocation(worldProg, "uImpactLightPos"), impactLight.x, impactLight.y, impactLight.z);
      gl.uniform1f(gl.getUniformLocation(worldProg, "uImpactLightStr"), impactLight.str);
    } else {
      gl.uniform3f(gl.getUniformLocation(worldProg, "uImpactLightPos"), 0, 2, 0);
      gl.uniform1f(gl.getUniformLocation(worldProg, "uImpactLightStr"), 0.0);
    }
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

    // Flying 3D Stone Chunks / Debris from shattered Golems!
    if (debris.length > 0) {
      const db = [];
      for (const d of debris) {
        const s = d.s;
        pushBox(db, d.x - s, d.x + s, d.y - s, d.y + s, d.z - s, d.z + s, d.col, 1.0);
      }
      gl.bindVertexArray(debVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, debVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(db), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, db.length / 10);
    }

    // Hero (Forge Brawler + Giant Warhammer)
    gl.useProgram(heroProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(heroProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(heroProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform1f(gl.getUniformLocation(heroProg, "uWhiteFlash"), hero.whiteFlash || 0);
    gl.uniform1f(gl.getUniformLocation(heroProg, "uChargeGlow"), hero.chargeGlow || 0);
    bindHeroUniforms(heroProg, hero);
    gl.bindVertexArray(heroGeo.vao);
    gl.drawElements(gl.TRIANGLES, heroGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    // Runic Stone Golems
    gl.useProgram(golemProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(golemProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(golemProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform1f(gl.getUniformLocation(golemProg, "uChargeGlow"), 0.0);
    gl.bindVertexArray(golemGeo.vao);
    for (const g of golems) {
      if ((g.scale ?? 1) < 0.05) continue;
      gl.uniform1f(gl.getUniformLocation(golemProg, "uWhiteFlash"), g.whiteFlash || 0);
      bindGolemUniforms(golemProg, g);
      gl.drawElements(gl.TRIANGLES, golemGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 3) Translucent FX Pass (Warhammer Molten Smear, Shockwave Rings, Sparks & Brazier Embers!)
    const fx = [];
    // Molten swing smear ribbon
    for (let i = 0; i < smearPoints.length - 1; i++) {
      const a = smearPoints[i], b = smearPoints[i + 1];
      const alpha = Math.min(a.a, b.a);
      if (alpha > 0.02) {
        pushFxQuad(fx, a.inner, b.inner, b.outer, a.outer, 1.0, 0.62, 0.14, alpha * 0.82, 0.0);
      }
    }

    // Impact Shockwaves
    for (const rg of rings) {
      const s = rg.rad;
      if (rg.vertical) {
        pushBillboard(fx, rg.x, rg.y, rg.z, s, basis, rg.r, rg.g, rg.b, rg.a, 1.0);
      } else {
        pushFxQuad(
          fx,
          [rg.x - s, rg.y, rg.z + s], [rg.x + s, rg.y, rg.z + s],
          [rg.x + s, rg.y, rg.z - s], [rg.x - s, rg.y, rg.z - s],
          rg.r, rg.g, rg.b, rg.a, 1.0,
        );
      }
    }

    // Sparks + ambient rising forge embers from the 4 corner braziers!
    for (let b = 0; b < BRAZIER_PTS.length; b++) {
      const [bx, by, bz] = BRAZIER_PTS[b];
      for (let k = 0; k < 3; k++) {
        const cyc = (time * 0.55 + b * 0.27 + k * 0.33) % 1.0;
        const ex = bx + Math.sin(time * 3.1 + k * 2.4 + b) * 0.26;
        const ey = by + 0.15 + cyc * 1.95;
        const ez = bz + Math.cos(time * 2.7 + k * 1.9 + b) * 0.26;
        pushBillboard(fx, ex, ey, ez, 0.10 * (1 - cyc * 0.6), basis, 1.0, 0.62, 0.15, (1 - cyc) * 0.85, 2.0);
      }
    }
    for (const sp of sparks) {
      pushBillboard(fx, sp.x, sp.y, sp.z, (sp.size || 0.16) * clamp(sp.life, 0.15, 1.0), basis, sp.r, sp.g, sp.b, clamp(sp.life, 0, 1), 2.0);
    }

    if (fx.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(fxProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(fxProg, "uViewProj"), false, viewProj);
      gl.bindVertexArray(fxVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fx), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, fx.length / 10);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    gl.bindVertexArray(null);
    return { viewProj, basis };
  }

  return {
    render,
    rendererName: "WebGL2 Volcanic Forge Dojo + Blender Hero & Stone Golem",
  };
}
