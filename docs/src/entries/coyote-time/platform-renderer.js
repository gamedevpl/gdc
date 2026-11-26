// Dedicated 3D Floating Sky-Islands Platformer WebGL2 Renderer for "Coyote Time & Jump Buffering".
// Renders sunlit mossy stone islands, background parallax sky islets & drifting clouds,
// Blender-sculpted 7-part articulated Sky-Runner with fluttering crimson scarf,
// 1024x1024 PCF shadow map, glowing Emerald Coyote Ledge extensions, Cyan Jump Buffer Halo,
// spinning golden coins, Summit Shrine Archway, jump arc breadcrumbs & spark bursts!
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
import { getRunnerMesh, RUNNER_PIVOTS } from "../../runner-mesh.js";

const SHADOW_RES = 1024;

// Course geometry: 6 sunlit floating sky-islands escalating from warm-up to Coyote long jump to rapid Buffer double-hop to Summit Shrine!
export const ISLANDS = [
  { id: 0, x0: -4.2, x1: 3.4,  y: 0.0,  zHalf: 1.95, depth: 3.6, label: "START" },
  { id: 1, x0: 7.5,  x1: 13.6, y: 0.35, zHalf: 1.85, depth: 3.4, label: "COYOTE GAP" },
  { id: 2, x0: 17.5, x1: 20.6, y: 0.70, zHalf: 1.75, depth: 3.1, label: "BUFFER STEP" },
  { id: 3, x0: 24.4, x1: 27.6, y: 1.15, zHalf: 1.75, depth: 3.1, label: "DOUBLE HOP" },
  { id: 4, x0: 31.8, x1: 37.0, y: 1.50, zHalf: 1.85, depth: 3.5, label: "FINAL LEAP" },
  { id: 5, x0: 41.2, x1: 48.2, y: 1.85, zHalf: 2.15, depth: 4.0, label: "SUMMIT", isGoal: true },
];

export const COINS_DEF = [
  { x: 5.45,  y: 1.85, z: 0.0 },
  { x: 15.55, y: 2.25, z: 0.0 },
  { x: 22.50, y: 2.65, z: 0.0 },
  { x: 29.70, y: 3.10, z: 0.0 },
  { x: 39.10, y: 3.55, z: 0.0 },
];

export const GOAL_X = 45.2;
export const GOAL_Y = 1.85;

// --- Shaders ---
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uAlertFlash;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
    mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x),
    f.y
  );
}

void main() {
  // Vibrant golden-hour sky-island gradient: deep twilight indigo top -> rich sky azure -> warm peach horizon -> misty canyon violet below
  vec3 topCol = vec3(0.08, 0.14, 0.32);
  vec3 midCol = vec3(0.18, 0.36, 0.62);
  vec3 horCol = vec3(0.74, 0.48, 0.44);
  vec3 botCol = vec3(0.11, 0.09, 0.22);

  vec3 col = mix(botCol, horCol, smoothstep(0.02, 0.34, vUv.y));
  col = mix(col, midCol, smoothstep(0.32, 0.62, vUv.y));
  col = mix(col, topCol, smoothstep(0.62, 0.98, vUv.y));

  // Warm sun glow in upper-right sky
  vec2 sunUv = vec2(0.76, 0.72);
  float sd = length((vUv - sunUv) * vec2(1.4, 1.0));
  col += vec3(1.0, 0.76, 0.46) * exp(-sd * 4.2) * 0.42;

  // Soft stylized drifting sunset cloud bands
  vec2 cuv = vec2(vUv.x * 3.8 + uTime * 0.015, vUv.y * 5.2);
  float c1 = noise(cuv) * 0.65 + noise(cuv * 2.1 + 3.1) * 0.35;
  float cloudMask = smoothstep(0.56, 0.76, c1) * smoothstep(0.18, 0.36, vUv.y) * smoothstep(0.84, 0.48, vUv.y);
  vec3 cloudCol = mix(vec3(0.95, 0.72, 0.60), vec3(1.0, 0.93, 0.84), smoothstep(0.30, 0.60, vUv.y));
  col = mix(col, cloudCol, cloudMask * 0.34);

  // Abyss mist vignette at very bottom
  float abyss = smoothstep(0.20, 0.0, vUv.y);
  col = mix(col, vec3(0.06, 0.05, 0.14), abyss * 0.65);

  // Subtle red pulse when Strict mode rejects an input
  col = mix(col, vec3(0.45, 0.08, 0.12), uAlertFlash * 0.32);
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
uniform vec3 uRunnerPos;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0024 * (1.0 - ndl), 0.0010);
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
  // Decode sRGB vertex colors into linear space before PBR lighting (rich, punchy Nintendo-style colors!)
  vec3 baseCol = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = baseCol;
  float rough = 0.78;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Lush stylized emerald island grass top with subtle sunlit mowing stripes
    vec2 gcell = floor(vPos.xz * 2.4);
    float patchN = (hash21(gcell) - 0.5) * 0.045;
    float stripe = sin(vPos.x * 1.9 + vPos.z * 0.6) * 0.025;
    albedo = max(vec3(0.01), baseCol * (1.0 + patchN + stripe));
    rough = 0.82;
  } else if (vMat < 1.5) {
    // Warm carved sandstone temple brickwork on cliff face
    float row = floor(vPos.y * 2.4);
    float bx = fract(vPos.x * 0.95 + vPos.z * 0.95 + mod(row, 2.0) * 0.5);
    float by = fract(vPos.y * 2.4);
    float mortar = smoothstep(0.032, 0.082, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
    float shade = 0.84 + 0.24 * hash21(vec2(row, floor(vPos.x * 0.95 + vPos.z * 0.95)));
    albedo = mix(baseCol * 0.42, baseCol * shade, mortar);
    rough = 0.86;
  } else if (vMat < 2.5) {
    // Smooth sculpted floating cliff strata (zero blocky checker tiles!)
    float strata = sin(vPos.y * 5.8 + sin(vPos.x * 1.4 + vPos.z) * 0.55) * 0.14;
    float depthDark = clamp(0.75 + vPos.y * 0.06, 0.48, 1.05);
    albedo = max(vec3(0.01), baseCol * (1.0 + strata) * depthDark);
    rough = 0.90;
  } else if (vMat < 3.5) {
    // Golden shrine / edge markers / spinning coins
    rough = 0.24;
    emissive = baseCol * 0.28;
  } else {
    // Glowing golden summit crystal beacon!
    float pulse = 0.82 + 0.18 * sin(uTime * 4.2);
    emissive = vec3(1.15, 0.62, 0.08) * 1.35 * pulse;
    rough = 0.14;
  }

  // Contact drop-shadow blob right beneath runner onto island top surfaces!
  float blobShadow = 1.0;
  if (N.y > 0.6 && vPos.y <= uRunnerPos.y + 0.15 && uRunnerPos.y - vPos.y < 4.5) {
    float h = max(0.0, uRunnerPos.y - vPos.y);
    float r = 0.50 + h * 0.12;
    float d = length(vPos.xz - uRunnerPos.xz);
    float k = smoothstep(r, r * 0.20, d) * clamp(1.0 - h / 4.5, 0.0, 1.0);
    blobShadow = 1.0 - k * 0.58;
  }

  vec3 sunDir = normalize(vec3(0.45, 0.82, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadow, ndl) * blobShadow;
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 56.0, 1.0 - rough)) * (1.0 - rough) * 0.42;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.14;

  vec3 skyAmb = mix(vec3(0.09, 0.08, 0.18), vec3(0.28, 0.36, 0.56), N.y * 0.5 + 0.5);
  vec3 sunCol = vec3(1.38, 1.18, 0.90);
  vec3 lit = albedo * (skyAmb + sunCol * ndl * (0.24 + 0.76 * sh))
           + sunCol * spec * sh
           + vec3(0.85, 0.52, 0.38) * rim
           + emissive;

  // Soft distance atmospheric aerial haze for background islets
  float dist = length(uCamPos - vPos);
  float fog = smoothstep(22.0, 62.0, dist);
  vec3 fogCol = vec3(0.26, 0.22, 0.36);
  lit = mix(lit, fogCol, fog * 0.62);

  // Filmic ACES curve & sRGB output
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Articulated 7-part Sculpted Runner Shader (both color & shadow pass share identical vertex kinematics!)
const RUNNER_SKIN_GLSL = `
vec3 rotX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}
vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
vec3 rotZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

void skinRunner(
  vec3 inPos, vec3 inNorm, float partId,
  float runPhase, float runAmp, float airBlend, float velY, float squash,
  float yaw, float tilt, float time, vec3 worldPos,
  out vec3 outPos, out vec3 outNorm
) {
  vec3 p = inPos;
  vec3 n = inNorm;
  int pid = int(partId + 0.5);

  float stride = sin(runPhase) * runAmp;
  float oppStride = -stride;

  // Part 2 = Left Leg (+0.13, 0.72, 0), Part 3 = Right Leg (-0.13, 0.72, 0)
  if (pid == 2 || pid == 3) {
    vec3 piv = (pid == 2) ? vec3(0.13, 0.72, 0.0) : vec3(-0.13, 0.72, 0.0);
    float gAng = (pid == 2) ? (stride * 0.88) : (oppStride * 0.88);
    float airUp = (pid == 2) ? -0.68 : 0.58;
    float airDn = (pid == 2) ? (0.28 + sin(time * 14.0) * 0.22) : (-0.28 - sin(time * 14.0) * 0.22);
    float aAng = mix(airDn, airUp, smoothstep(-3.0, 3.5, velY));
    float ang = mix(gAng, aAng, airBlend);
    p = rotX(p - piv, ang) + piv;
    n = rotX(n, ang);
  }
  // Part 4 = Left Arm (+0.31, 1.24, 0), Part 5 = Right Arm (-0.31, 1.24, 0)
  else if (pid == 4 || pid == 5) {
    vec3 piv = (pid == 4) ? vec3(0.31, 1.24, 0.0) : vec3(-0.31, 1.24, 0.0);
    float side = (pid == 4) ? 1.0 : -1.0;
    float gAng = (pid == 4) ? (oppStride * 0.78) : (stride * 0.78);
    float aAng = mix(-1.25, -0.95, smoothstep(-3.0, 4.0, velY));
    float ang = mix(gAng, aAng, airBlend);
    float spread = mix(0.08, 0.42, airBlend) * side;
    p = rotZ(rotX(p - piv, ang), spread) + piv;
    n = rotZ(rotX(n, ang), spread);
  }
  // Part 1 = Head: subtle athletic pitch toward jump arc
  else if (pid == 1) {
    vec3 piv = vec3(0.0, 1.38, 0.0);
    float hPitch = clamp(-velY * 0.045, -0.22, 0.25) * airBlend;
    p = rotX(p - piv, hPitch) + piv;
    n = rotX(n, hPitch);
  }
  // Part 6 = Crimson Scarf Tail: streams back & ripples dynamically with velocity & gravity!
  else if (pid == 6) {
    vec3 piv = vec3(0.0, 1.32, -0.14);
    vec3 rel = p - piv;
    float dist = max(0.0, -rel.z);
    float waveY = sin(time * 14.0 - dist * 7.5) * 0.075 * dist * (0.45 + 0.55 * max(runAmp, airBlend));
    float waveX = cos(time * 11.0 - dist * 5.8) * 0.055 * dist;
    float lift = clamp(-velY * 0.095, -0.32, 0.68) * airBlend + runAmp * 0.16;
    rel = rotX(rel, -lift);
    rel.y += waveY;
    rel.x += waveX;
    p = rel + piv;
  }

  // Whole-body running bob + squash & stretch around boots (y=0)
  float bob = abs(cos(runPhase)) * 0.075 * runAmp * (1.0 - airBlend);
  p.y += bob;
  p.x *= (1.0 - squash * 0.22);
  p.z *= (1.0 - squash * 0.22);
  p.y *= (1.0 + squash * 0.26);

  // Forward sprint lean & world yaw
  vec3 leanPiv = vec3(0.0, 0.65, 0.0);
  p = rotX(p - leanPiv, tilt) + leanPiv;
  n = rotX(n, tilt);

  p = rotY(p, yaw) + worldPos;
  n = normalize(rotY(n, yaw));
  outPos = p;
  outNorm = n;
}
`;

const RUNNER_VS = `#version 300 es
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
uniform float uTilt;
uniform float uRunPhase;
uniform float uRunAmp;
uniform float uAirBlend;
uniform float uVelY;
uniform float uSquash;
uniform float uTime;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out vec4 vShadow;
${RUNNER_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinRunner(aPos, aNorm, aPart, uRunPhase, uRunAmp, uAirBlend, uVelY, uSquash, uYaw, uTilt, uTime, uPos, wp, wn);
  vPos = wp;
  vNorm = wn;
  vCol = aCol;
  vRough = aRough;
  vShadow = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const RUNNER_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=3) in float aPart;

uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uYaw;
uniform float uTilt;
uniform float uRunPhase;
uniform float uRunAmp;
uniform float uAirBlend;
uniform float uVelY;
uniform float uSquash;
uniform float uTime;
${RUNNER_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinRunner(aPos, aNorm, aPart, uRunPhase, uRunAmp, uAirBlend, uVelY, uSquash, uYaw, uTilt, uTime, uPos, wp, wn);
  gl_Position = uLightVP * vec4(wp, 1.0);
}
`;

const RUNNER_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
in vec4 vShadow;

uniform vec3 uCamPos;
uniform vec4 uTintFlash; // rgb = flash color, a = flash strength
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 baseCol = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.45, 0.82, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.08, 0.92);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.50;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8) * 0.28;

  // Crisp studio character lighting in linear space so crimson scarf, teal tunic & goggles POP!
  vec3 amb = mix(vec3(0.14, 0.13, 0.24), vec3(0.38, 0.44, 0.58), N.y * 0.5 + 0.5);
  vec3 lit = baseCol * (amb + vec3(1.42, 1.24, 0.98) * (0.24 + 0.76 * ndl))
           + vec3(1.10, 1.02, 0.90) * spec
           + vec3(0.65, 0.88, 1.0) * rim;

  // Bright cyan aviator goggle lens sheen
  if (vCol.b > 0.85 && vCol.g > 0.75 && vCol.r < 0.5) {
    lit += vec3(0.18, 0.85, 1.25);
  }

  lit = mix(lit, pow(max(uTintFlash.rgb, vec3(0.01)), vec3(2.0)) * 1.15, uTintFlash.a * 0.34);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Glowing Hologram / Coyote Ledge / Buffer Ring / FX Ribbon Shader (alpha-blended)
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = Coyote Ledge hologram, 1 = solid/ring glow, 2 = billboard/dot
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
    // Glowing translucent Coyote Ledge hologram with crisp bright rim & animated energy chevrons!
    float edgeX = min(vUv.x, 1.0 - vUv.x);
    float edgeY = min(vUv.y, 1.0 - vUv.y);
    float border = 1.0 - smoothstep(0.05, 0.14, min(edgeX, edgeY));
    float chev = smoothstep(0.35, 0.75, sin((vUv.x * 16.0 - uTime * 7.5) + abs(vUv.y - 0.5) * 6.0));
    float alpha = c.a * (0.34 + 0.24 * chev + 0.58 * border);
    vec3 col = mix(c.rgb, vec3(0.82, 1.0, 0.94), border * 0.65 + chev * 0.18);
    fragColor = vec4(col, clamp(alpha, 0.0, 0.94));
  } else if (vKind < 1.5) {
    // Crisp glowing circular shockwave / buffer ring
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.98, 0.84, r) * smoothstep(0.54, 0.72, r);
    float inner = smoothstep(0.70, 0.0, r) * 0.20;
    float a = (ring + inner) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.35), clamp(a, 0.0, 0.96));
  } else {
    // Soft glowing spark / breadcrumb orb
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float soft = smoothstep(1.0, 0.15, r);
    if (soft < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.55), soft * c.a);
  }
}
`;

// Helper to push a colored box into a static world mesh builder
function pushBox(buf, x0, x1, y0, y1, z0, z1, col, matId) {
  const faces = [
    // +Y top
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    // -Y bot
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    // +Z front
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    // -Z back
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    // +X right
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    // -X left
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of faces) {
    for (const p of [a, b, c, a, c, d]) {
      buf.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], matId);
    }
  }
}

// Tapered floating rock underside below an island
function pushTaperedRock(buf, x0, x1, yTop, yBot, z0, z1, col, matId) {
  const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
  const hw = (x1 - x0) * 0.5, hd = (z1 - z0) * 0.5;
  const bx0 = cx - hw * 0.42, bx1 = cx + hw * 0.42;
  const bz0 = cz - hd * 0.42, bz1 = cz + hd * 0.42;

  const pushTri = (p0, p1, p2) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const p of [p0, p1, p2]) buf.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], matId);
  };
  const pushQuad = (a, b, c, d) => { pushTri(a, b, c); pushTri(a, c, d); };

  const tFL = [x0, yTop, z1], tFR = [x1, yTop, z1], tBR = [x1, yTop, z0], tBL = [x0, yTop, z0];
  const bFL = [bx0, yBot, bz1], bFR = [bx1, yBot, bz1], bBR = [bx1, yBot, bz0], bBL = [bx0, yBot, bz0];
  pushQuad(bFL, bFR, tFR, tFL);
  pushQuad(bFR, bBR, tBR, tFR);
  pushQuad(bBR, bBL, tBL, tBR);
  pushQuad(bBL, bFL, tFL, tBL);
  // Pointed rock spire tip at very bottom
  const tip = [cx, yBot - 1.35, cz];
  pushTri(bFR, bFL, tip);
  pushTri(bBR, bFR, tip);
  pushTri(bBL, bBR, tip);
  pushTri(bFL, bBL, tip);
}

function buildStaticWorld() {
  const buf = [];
  const C_GRASS = [0.22, 0.66, 0.34];
  const C_GRASS_DARK = [0.16, 0.52, 0.28];
  const C_STONE = [0.56, 0.48, 0.40];
  const C_ROCK = [0.29, 0.25, 0.33];
  const C_GOLD = [0.94, 0.72, 0.20];
  const C_PILLAR = [0.64, 0.58, 0.50];

  for (const isl of ISLANDS) {
    // Grass cap overhanging slightly for tactile chunky silhouette!
    pushBox(buf, isl.x0 - 0.08, isl.x1 + 0.08, isl.y - 0.34, isl.y, -isl.zHalf - 0.08, isl.zHalf + 0.08, C_GRASS, 0.0);
    // Warm sandstone masonry band
    pushBox(buf, isl.x0, isl.x1, isl.y - 1.55, isl.y - 0.34, -isl.zHalf, isl.zHalf, C_STONE, 1.0);
    // Tapered floating rock underside
    pushTaperedRock(buf, isl.x0 + 0.08, isl.x1 - 0.08, isl.y - 1.55, isl.y - isl.depth, -isl.zHalf + 0.08, isl.zHalf - 0.08, C_ROCK, 2.0);

    // Crisp carved stone curb marker right at the take-off right edge (so cliff edge reads RAZOR sharp!)
    if (!isl.isGoal) {
      pushBox(buf, isl.x1 - 0.22, isl.x1 + 0.06, isl.y - 0.06, isl.y + 0.05, -isl.zHalf * 0.85, isl.zHalf * 0.85, C_GOLD, 3.0);
    }

    // Back-edge decorative stone pillars / moss tufts for depth & parallax
    const midX = (isl.x0 + isl.x1) * 0.5;
    if (!isl.isGoal) {
      pushBox(buf, isl.x0 + 0.45, isl.x0 + 0.95, isl.y, isl.y + 0.85, -isl.zHalf + 0.15, -isl.zHalf + 0.65, C_PILLAR, 1.0);
      pushBox(buf, midX - 0.45, midX + 0.35, isl.y, isl.y + 0.28, -isl.zHalf + 0.2, -isl.zHalf + 0.75, C_GRASS_DARK, 0.0);
    } else {
      // Summit Temple Archway on final island!
      const gx = GOAL_X;
      pushBox(buf, gx - 1.35, gx + 1.35, isl.y, isl.y + 0.22, -1.55, 1.55, C_PILLAR, 1.0);
      pushBox(buf, gx - 0.35, gx + 0.35, isl.y + 0.22, isl.y + 3.15, -1.45, -0.95, C_PILLAR, 1.0);
      pushBox(buf, gx - 0.35, gx + 0.35, isl.y + 0.22, isl.y + 3.15, 0.95, 1.45, C_PILLAR, 1.0);
      pushBox(buf, gx - 0.52, gx + 0.52, isl.y + 3.15, isl.y + 3.62, -1.72, 1.72, C_GOLD, 3.0);
    }
  }

  // Background parallax floating sky-islets far behind (z = -9..-16) for scenic depth!
  const bgIslets = [
    { x0: -6, x1: 1, y: 2.2, z: -11.5, w: 2.2, d: 3.4 },
    { x0: 9, x1: 17, y: 3.6, z: -14.0, w: 2.8, d: 4.5 },
    { x0: 23, x1: 29, y: 1.8, z: -10.5, w: 2.0, d: 3.2 },
    { x0: 36, x1: 45, y: 4.4, z: -15.5, w: 3.0, d: 5.0 },
    { x0: 50, x1: 57, y: 2.6, z: -12.0, w: 2.4, d: 3.8 },
  ];
  for (const bg of bgIslets) {
    pushBox(buf, bg.x0, bg.x1, bg.y - 0.32, bg.y, bg.z - bg.w, bg.z + bg.w, [0.22, 0.56, 0.36], 0.0);
    pushBox(buf, bg.x0 + 0.1, bg.x1 - 0.1, bg.y - 1.35, bg.y - 0.32, bg.z - bg.w + 0.1, bg.z + bg.w - 0.1, [0.50, 0.44, 0.44], 1.0);
    pushTaperedRock(buf, bg.x0 + 0.2, bg.x1 - 0.2, bg.y - 1.35, bg.y - bg.d, bg.z - bg.w + 0.2, bg.z + bg.w - 0.2, [0.28, 0.24, 0.36], 2.0);
  }

  return new Float32Array(buf);
}

// Helper: diamond crystal / coin geometry for dynamic animated coins & summit beacon
function pushOctahedron(buf, cx, cy, cz, rx, ry, rz, rotY, col, matId) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const tr = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const top = tr(0, ry, 0), bot = tr(0, -ry, 0);
  const ring = [tr(rx, 0, 0), tr(0, 0, rz), tr(-rx, 0, 0), tr(0, 0, -rz)];
  const pushTri = (p0, p1, p2) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const p of [p0, p1, p2]) buf.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], matId);
  };
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    pushTri(a, b, top);
    pushTri(b, a, bot);
  }
}

export function projectPoint(world, vp, w, h) {
  const [x, y, z] = world;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
}

export function createPlatformRenderer(gl) {
  const [skyProg, shadowProg, worldProg, runnerProg, runnerShadowProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [RUNNER_VS, RUNNER_FS],
    [RUNNER_SHADOW_VS, SHADOW_FS],
    [FX_VS, FX_FS],
  ]);

  // Shadow map framebuffer
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

  // Static islands VAO
  const worldData = buildStaticWorld();
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

  // Dynamic solid props VAO (spinning golden coins + summit crystal beacon)
  const dynVao = gl.createVertexArray();
  const dynVbo = gl.createBuffer();
  gl.bindVertexArray(dynVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  // Sculpted Blender Sky-Runner VAO
  const rm = getRunnerMesh();
  const rInter = new Float32Array(rm.count * 11);
  for (let i = 0; i < rm.count; i++) {
    const k = i * 11;
    rInter[k + 0] = rm.pos[i * 3 + 0];
    rInter[k + 1] = rm.pos[i * 3 + 1];
    rInter[k + 2] = rm.pos[i * 3 + 2];
    rInter[k + 3] = rm.norm[i * 3 + 0];
    rInter[k + 4] = rm.norm[i * 3 + 1];
    rInter[k + 5] = rm.norm[i * 3 + 2];
    rInter[k + 6] = rm.col[i * 3 + 0];
    rInter[k + 7] = rm.col[i * 3 + 1];
    rInter[k + 8] = rm.col[i * 3 + 2];
    rInter[k + 9] = rm.part[i];
    rInter[k + 10] = rm.rough[i];
  }
  const runnerVao = gl.createVertexArray();
  const runnerVbo = gl.createBuffer();
  const runnerIbo = gl.createBuffer();
  gl.bindVertexArray(runnerVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, runnerVbo);
  gl.bufferData(gl.ARRAY_BUFFER, rInter, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runnerIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, rm.idx, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 44, 36);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);

  // Translucent FX VAO (Coyote Ledges, Buffer Halo, Shockwaves, Trail Dots, Sparks)
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
    const verts = [
      [p0, 0, 0], [p1, 1, 0], [p2, 1, 1],
      [p0, 0, 0], [p2, 1, 1], [p3, 0, 1],
    ];
    for (const [p, u, v] of verts) {
      arr.push(p[0], p[1], p[2], u, v, r, g, b, a, kind);
    }
  };

  const pushBillboard = (arr, cx, cy, cz, radius, basis, r, g, b, a, kind) => {
    const rx = basis.right[0] * radius, ry = basis.right[1] * radius, rz = basis.right[2] * radius;
    const ux = basis.up[0] * radius, uy = basis.up[1] * radius, uz = basis.up[2] * radius;
    pushFxQuad(
      arr,
      [cx - rx - ux, cy - ry - uy, cz - rz - uz],
      [cx + rx - ux, cy + ry - uy, cz + rz - uz],
      [cx + rx + ux, cy + ry + uy, cz + rz + uz],
      [cx - rx + ux, cy - ry + uy, cz - rz + uz],
      r, g, b, a, kind,
    );
  };

  function setRunnerUniforms(prog, lightVP, runner, time) {
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uLightVP"), false, lightVP);
    gl.uniform3f(gl.getUniformLocation(prog, "uPos"), runner.x, runner.y, runner.z);
    gl.uniform1f(gl.getUniformLocation(prog, "uYaw"), runner.yaw);
    gl.uniform1f(gl.getUniformLocation(prog, "uTilt"), runner.tilt || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uRunPhase"), runner.runPhase || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uRunAmp"), runner.runAmp || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uAirBlend"), runner.airBlend || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uVelY"), runner.vy || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uSquash"), runner.squash || 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uTime"), time);
  }

  function render({
    w, h, cam, time, runner,
    coyoteEnabled = true,
    coyoteFrac = 0,          // 0..1 remaining coyote grace window when off ledge
    activeCoyoteIsland = -1, // island id whose ledge is currently holding runner up
    coyoteReach = 1.25,      // world-unit length of visible Coyote hologram ledge
    bufferFrac = 0,          // 0..1 remaining jump buffer window
    coins = [],
    trails = [],             // [{ x, y, z, r, g, b, a, size }]
    rings = [],              // [{ x, y, z, rad, r, g, b, a }]
    sparks = [],             // [{ x, y, z, r, g, b, life, size }]
    alertFlash = 0,
  }) {
    const aspect = w / Math.max(1, h);
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.25, 160);
    const viewProj = mulMat4(proj, view);

    // Shadow frustum centered cleanly around runner!
    const shCenterX = runner.x + 2.0;
    const sunEye = [shCenterX + 12.0, 22.0, 10.0];
    const lightView = makeLookAt(sunEye, [shCenterX, 0.5, 0.0], [0, 1, 0]);
    const lightProj = makeOrtho(-16, 16, -12, 12, 2.0, 56.0);
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

    gl.useProgram(runnerShadowProg);
    setRunnerUniforms(runnerShadowProg, lightVP, runner, time);
    gl.bindVertexArray(runnerVao);
    gl.drawElements(gl.TRIANGLES, rm.idx.length, gl.UNSIGNED_SHORT, 0);

    // 2) Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.08, 0.12, 0.24, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky backdrop
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(skyProg);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uAlertFlash"), alertFlash);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Static Floating Sky Islands
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
    gl.uniform3f(gl.getUniformLocation(worldProg, "uRunnerPos"), runner.x, runner.y, runner.z);
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

    // Spinning golden coins + Summit crystal beacon
    const dynBuf = [];
    for (let i = 0; i < coins.length; i++) {
      const cn = coins[i];
      if (cn.collected) continue;
      const bob = Math.sin(time * 3.4 + i * 1.1) * 0.14;
      pushOctahedron(dynBuf, cn.x, cn.y + bob, cn.z, 0.28, 0.36, 0.14, time * 2.6 + i, [1.0, 0.84, 0.22], 3.0);
    }
    // Summit hovering crystal inside archway
    const beaconBob = Math.sin(time * 2.8) * 0.18;
    pushOctahedron(dynBuf, GOAL_X, GOAL_Y + 1.85 + beaconBob, 0.0, 0.44, 0.72, 0.44, time * 1.8, [1.0, 0.85, 0.28], 4.0);

    if (dynBuf.length > 0) {
      gl.bindVertexArray(dynVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dynBuf), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, dynBuf.length / 10);
    }

    // Sculpted Blender 3D Sky-Runner!
    gl.useProgram(runnerProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(runnerProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(runnerProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    const fl = runner.flash || [1, 1, 1, 0];
    gl.uniform4f(gl.getUniformLocation(runnerProg, "uTintFlash"), fl[0], fl[1], fl[2], fl[3]);
    setRunnerUniforms(runnerProg, lightVP, runner, time);
    gl.bindVertexArray(runnerVao);
    gl.drawElements(gl.TRIANGLES, rm.idx.length, gl.UNSIGNED_SHORT, 0);

    // 3) Translucent Hologram & FX Pass (Coyote Ledges, Buffer Halo, Shockwaves, Jump Trails, Sparks!)
    const fx = [];

    // Glowing Emerald Coyote Ledge extensions past cliff edges!
    if (coyoteEnabled) {
      for (const isl of ISLANDS) {
        if (isl.isGoal) continue;
        const isActive = activeCoyoteIsland === isl.id && coyoteFrac > 0.01;
        const len = isActive ? coyoteReach * (0.28 + 0.72 * coyoteFrac) : coyoteReach;
        const glow = isActive ? 0.98 : 0.62;
        const r = isActive ? 0.22 : 0.08;
        const g = 0.96;
        const b = isActive ? 0.72 : 0.58;
        const zh = isl.zHalf * 0.78;
        const xA = isl.x1 + 0.02;
        const xB = isl.x1 + len;
        const yT = isl.y + 0.025;
        const yB = isl.y - 0.16;
        // Top glowing holographic floor slab
        pushFxQuad(fx, [xA, yT, zh], [xB, yT, zh], [xB, yT, -zh], [xA, yT, -zh], r, g, b, glow, 0.0);
        // Front side edge bar so thickness reads clearly from 3/4 view!
        pushFxQuad(fx, [xA, yB, zh], [xB, yB, zh], [xB, yT, zh], [xA, yT, zh], r, g, b, glow * 0.85, 0.0);
        // Far edge vertical energy strip
        pushFxQuad(fx, [xB, yB, zh], [xB, yB, -zh], [xB, yT, -zh], [xB, yT, zh], 0.45, 1.0, 0.82, glow, 0.0);
      }
    }

    // Glowing Cyan Jump Buffer Halo around runner's boots when early jump is queued!
    if (bufferFrac > 0.01) {
      const br = 0.78 + (1 - bufferFrac) * 0.42;
      const by = runner.y + 0.10;
      pushFxQuad(
        fx,
        [runner.x - br, by, runner.z + br],
        [runner.x + br, by, runner.z + br],
        [runner.x + br, by, runner.z - br],
        [runner.x - br, by, runner.z - br],
        0.22, 0.84, 1.0, 0.95 * (0.45 + 0.55 * bufferFrac), 1.0,
      );
      // Secondary slightly higher halo ring for 3D volume
      const br2 = br * 0.72;
      const by2 = runner.y + 0.34;
      pushFxQuad(
        fx,
        [runner.x - br2, by2, runner.z + br2],
        [runner.x + br2, by2, runner.z + br2],
        [runner.x + br2, by2, runner.z - br2],
        [runner.x - br2, by2, runner.z - br2],
        0.48, 0.94, 1.0, 0.65 * bufferFrac, 1.0,
      );
    }

    // Expanding 3D horizontal shockwave rings (Coyote Save, Buffer Launch, Landing!)
    for (const rg of rings) {
      const s = rg.rad;
      pushFxQuad(
        fx,
        [rg.x - s, rg.y, rg.z + s],
        [rg.x + s, rg.y, rg.z + s],
        [rg.x + s, rg.y, rg.z - s],
        [rg.x - s, rg.y, rg.z - s],
        rg.r, rg.g, rg.b, rg.a, 1.0,
      );
    }

    // Jump arc breadcrumb trail dots
    for (const tr of trails) {
      pushBillboard(fx, tr.x, tr.y, tr.z, tr.size || 0.14, basis, tr.r, tr.g, tr.b, tr.a, 2.0);
    }

    // Sparks & landing dust puffs
    for (const sp of sparks) {
      pushBillboard(fx, sp.x, sp.y, sp.z, (sp.size || 0.14) * clamp(sp.life, 0.15, 1.0), basis, sp.r, sp.g, sp.b, clamp(sp.life, 0, 1), 2.0);
    }

    if (fx.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(fxProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(fxProg, "uViewProj"), false, viewProj);
      gl.uniform1f(gl.getUniformLocation(fxProg, "uTime"), time);
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
    rendererName: "WebGL2 Floating Sky-Islands + Blender Sky-Runner",
    ISLANDS,
    COINS_DEF,
    RUNNER_PIVOTS,
  };
}
