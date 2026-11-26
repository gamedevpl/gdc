// Dedicated 3D Sunlit Desert Canyon & Ancient Temple Gauntlet WebGL2 Renderer for "Camera Deadzone & Look-Ahead" (#07).
// Linear PBR + ACES filmic + 1024x1024 PCF shadows + terracotta canyon mesas, sandstone temple track, turquoise oasis trim,
// Blender-sculpted Desert Nomad Sprinter & 6 spinning Brass Sawblade Traps,
// 3D translucent Cyan Camera Deadzone Frame & glowing Amber Look-Ahead Tether!
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
import { getDesertMeshes } from "../../desert-mesh.js";

const SHADOW_RES = 1024;

export const COURSE_MIN_X = -4.5;
export const COURSE_MAX_X = 60.0;
export const GOAL_X = 54.5;

// 6 spinning brass sawblade traps spaced along the canyon temple gauntlet!
export const SAWS_DEF = [
  { id: 0, baseX: 10.5, amp: 0.0,  spd: 0.0, phase: 0.0 },
  { id: 1, baseX: 18.2, amp: 1.5,  spd: 1.9, phase: 0.4 },
  { id: 2, baseX: 26.5, amp: 0.0,  spd: 0.0, phase: 1.2 },
  { id: 3, baseX: 34.4, amp: 1.9,  spd: 2.3, phase: 2.1 },
  { id: 4, baseX: 42.2, amp: 1.6,  spd: 2.1, phase: 0.8 },
  { id: 5, baseX: 48.8, amp: 0.0,  spd: 0.0, phase: 1.6 },
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uJitterAlert;
out vec4 fragColor;

void main() {
  // Bright sunlit desert sky: deep cerulean top -> warm desert turquoise mid -> sunlit apricot sand horizon!
  vec3 topCol = vec3(0.08, 0.28, 0.58);
  vec3 midCol = vec3(0.24, 0.58, 0.78);
  vec3 horCol = vec3(0.95, 0.72, 0.46);
  vec3 botCol = vec3(0.56, 0.30, 0.22);

  vec3 col = mix(botCol, horCol, smoothstep(0.04, 0.34, vUv.y));
  col = mix(col, midCol, smoothstep(0.32, 0.62, vUv.y));
  col = mix(col, topCol, smoothstep(0.62, 0.98, vUv.y));

  // Bright desert sun disk + warm corona
  vec2 sunUv = vec2(0.78, 0.76);
  float sd = length((vUv - sunUv) * vec2(1.45, 1.0));
  col += vec3(1.0, 0.88, 0.62) * exp(-sd * 5.0) * 0.45;
  col += vec3(1.0, 0.96, 0.84) * smoothstep(0.085, 0.055, sd) * 0.65;

  // Subtle crimson border flash when rigid locked camera suffers heavy nausea jitter or trap hit
  float vig = smoothstep(0.40, 0.95, length(vUv - 0.5) * 1.4);
  col = mix(col, vec3(0.62, 0.10, 0.12), vig * uJitterAlert * 0.42);
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
uniform vec3 uHeroPos;
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
    // Sunlit carved sandstone temple pavers + distance stripes every 4m so camera motion/stability reads INSTANTLY!
    vec2 g = fract(vPos.xz * 0.5);
    float mortar = smoothstep(0.025, 0.065, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
    float shade = 0.88 + 0.20 * hash21(floor(vPos.xz * 0.5));
    albedo = mix(base * 0.55, base * shade, mortar);
    // Crisp inlaid turquoise runner track lines along z = ±1.15
    float rail = smoothstep(0.11, 0.03, abs(abs(vPos.z) - 1.15));
    albedo = mix(albedo, pow(vec3(0.08, 0.72, 0.78), vec3(2.2)), rail * 0.85);
    // Bright ochre-gold distance cross-markers every 4 units!
    float tick = smoothstep(0.10, 0.03, abs(fract(vPos.x * 0.25) - 0.5)) * step(abs(vPos.z), 1.15);
    albedo = mix(albedo, pow(vec3(0.95, 0.74, 0.24), vec3(2.2)), tick * 0.55);
    rough = 0.80;
  } else if (vMat < 1.5) {
    // Terracotta desert mesas & sandstone temple obelisks with horizontal canyon rock strata!
    float strata = sin(vPos.y * 3.8 + sin(vPos.x * 0.45) * 0.5) * 0.14;
    albedo = max(vec3(0.01), base * (1.0 + strata));
    rough = 0.86;
  } else if (vMat < 2.5) {
    // Shimmering turquoise oasis canal water!
    float wave = sin(vPos.x * 2.2 + uTime * 3.2) * cos(vPos.z * 2.6 - uTime * 2.1) * 0.12;
    albedo = max(vec3(0.01), base * (1.0 + wave));
    emissive = vec3(0.04, 0.28, 0.34);
    rough = 0.14;
  } else {
    // Polished golden temple arch & obelisk capstones
    rough = 0.24;
    emissive = base * 0.22;
  }

  // Soft drop-shadow blob right beneath Desert Nomad on the sandstone floor
  float blob = 1.0;
  if (N.y > 0.6 && vPos.y <= uHeroPos.y + 0.15 && uHeroPos.y - vPos.y < 4.5) {
    float h = max(0.0, uHeroPos.y - vPos.y);
    float r = 0.48 + h * 0.12;
    float d = length(vPos.xz - uHeroPos.xz);
    blob = 1.0 - smoothstep(r, r * 0.20, d) * clamp(1.0 - h / 4.5, 0.0, 1.0) * 0.55;
  }

  vec3 sunDir = normalize(vec3(0.48, 0.82, 0.32));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadow, ndl) * blob;
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 56.0, 1.0 - rough)) * (1.0 - rough) * 0.42;

  vec3 amb = mix(vec3(0.16, 0.11, 0.12), vec3(0.36, 0.46, 0.62), N.y * 0.5 + 0.5);
  vec3 sunCol = vec3(1.42, 1.24, 0.94);
  vec3 lit = albedo * (amb + sunCol * ndl * (0.26 + 0.74 * sh))
           + sunCol * spec * sh
           + emissive;

  // Warm desert sunlit atmospheric perspective on distant canyon mesas
  float dist = length(uCamPos - vPos);
  float fog = smoothstep(26.0, 76.0, dist);
  lit = mix(lit, vec3(0.68, 0.50, 0.38), fog * 0.55);

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const NOMAD_SKIN_GLSL = `
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }

void skinNomad(
  vec3 inPos, vec3 inNorm, float partId,
  vec3 worldPos, float yaw, float tilt, float runPhase, float runAmp, float airBlend, float velY, float squash,
  out vec3 outPos, out vec3 outNorm
) {
  vec3 p = inPos;
  vec3 n = inNorm;
  int pid = int(partId + 0.5);
  float stride = sin(runPhase) * runAmp;

  if (pid == 2 || pid == 3) {
    vec3 piv = (pid == 2) ? vec3(0.13, 0.72, 0.0) : vec3(-0.13, 0.72, 0.0);
    float gAng = (pid == 2) ? (stride * 0.90) : (-stride * 0.90);
    float aAng = (pid == 2) ? -0.62 : 0.54;
    float ang = mix(gAng, aAng, airBlend);
    p = rotX(p - piv, ang) + piv;
    n = rotX(n, ang);
  } else if (pid == 4 || pid == 5) {
    vec3 piv = (pid == 4) ? vec3(0.30, 1.24, 0.0) : vec3(-0.30, 1.24, 0.0);
    float side = (pid == 4) ? 1.0 : -1.0;
    float gAng = (pid == 4) ? (-stride * 0.80) : (stride * 0.80);
    float ang = mix(gAng, -0.95, airBlend);
    float spread = mix(0.08, 0.38, airBlend) * side;
    p = rotZ(rotX(p - piv, ang), spread) + piv;
    n = rotZ(rotX(n, ang), spread);
  }

  p.y += abs(cos(runPhase)) * 0.07 * runAmp * (1.0 - airBlend);
  p.x *= (1.0 - squash * 0.22);
  p.z *= (1.0 - squash * 0.22);
  p.y *= (1.0 + squash * 0.25);

  vec3 lpiv = vec3(0.0, 0.65, 0.0);
  p = rotX(p - lpiv, tilt) + lpiv;
  n = rotX(n, tilt);

  outPos = rotY(p, yaw) + worldPos;
  outNorm = normalize(rotY(n, yaw));
}
`;

const NOMAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;
uniform mat4 uViewProj;
uniform vec3 uPos;
uniform float uYaw;
uniform float uTilt;
uniform float uRunPhase;
uniform float uRunAmp;
uniform float uAirBlend;
uniform float uVelY;
uniform float uSquash;
out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
${NOMAD_SKIN_GLSL}
void main() {
  vec3 wp, wn;
  skinNomad(aPos, aNorm, aPart, uPos, uYaw, uTilt, uRunPhase, uRunAmp, uAirBlend, uVelY, uSquash, wp, wn);
  vPos = wp; vNorm = wn; vCol = aCol; vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const NOMAD_SHADOW_VS = `#version 300 es
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
${NOMAD_SKIN_GLSL}
void main() {
  vec3 wp, wn;
  skinNomad(aPos, aNorm, aPart, uPos, uYaw, uTilt, uRunPhase, uRunAmp, uAirBlend, uVelY, uSquash, wp, wn);
  gl_Position = uLightVP * vec4(wp, 1.0);
}
`;

const SAW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;
uniform mat4 uViewProj;
uniform vec3 uPos;
uniform float uSpin;
out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  if (aPart > 0.5) {
    vec3 piv = vec3(0.0, 0.82, 0.0);
    vec3 rel = p - piv;
    float c = cos(uSpin), s = sin(uSpin);
    p = vec3(rel.x * c - rel.y * s, rel.x * s + rel.y * c, rel.z) + piv;
    n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
  }
  vPos = p + uPos;
  vNorm = normalize(n);
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(vPos, 1.0);
}
`;

const SAW_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=3) in float aPart;
uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uSpin;
void main() {
  vec3 p = aPos;
  if (aPart > 0.5) {
    vec3 piv = vec3(0.0, 0.82, 0.0);
    vec3 rel = p - piv;
    float c = cos(uSpin), s = sin(uSpin);
    p = vec3(rel.x * c - rel.y * s, rel.x * s + rel.y * c, rel.z) + piv;
  }
  gl_Position = uLightVP * vec4(p + uPos, 1.0);
}
`;

const PROP_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
uniform vec3 uCamPos;
uniform vec4 uFlash;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.48, 0.82, 0.32));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.06, 0.92);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.52;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6) * 0.28;

  vec3 amb = mix(vec3(0.18, 0.13, 0.16), vec3(0.42, 0.50, 0.66), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.42, 1.25, 0.96) * (0.24 + 0.76 * ndl))
           + vec3(1.1, 1.0, 0.85) * spec
           + vec3(1.0, 0.82, 0.52) * rim;

  // Glowing ruby trap gem & golden turban gem
  if (vRough < 0.09 && vCol.r > 0.85) {
    lit += base * 1.45;
  }
  lit = mix(lit, pow(max(uFlash.rgb, vec3(0.01)), vec3(1.8)) * 2.2, clamp(uFlash.a, 0.0, 1.0));
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent 3D Camera Deadzone Glass Box + Look-Ahead Tether + Sparks FX Shader!
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = deadzone glass pane, 1 = tether beam, 2 = orb/spark
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out float vKind;
void main() {
  vUv = aUv; vCol = aCol; vKind = aKind;
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
    // Crisp glowing translucent 3D Deadzone frame with dashed tech border!
    float ex = min(vUv.x, 1.0 - vUv.x);
    float ey = min(vUv.y, 1.0 - vUv.y);
    float b = 1.0 - smoothstep(0.018, 0.048, min(ex, ey));
    float grid = (1.0 - smoothstep(0.015, 0.04, abs(fract(vUv.x * 4.0) - 0.5))) * 0.12;
    float a = c.a * (0.14 + grid + 0.78 * b);
    fragColor = vec4(mix(c.rgb, vec3(1.0), b * 0.45), clamp(a, 0.0, 0.92));
  } else if (vKind < 1.5) {
    // Glowing amber Look-Ahead directional tether beam with flowing energy pulse!
    float core = 1.0 - smoothstep(0.0, 0.5, abs(vUv.y - 0.5));
    float flow = 0.72 + 0.28 * sin(vUv.x * 22.0 - uTime * 14.0);
    fragColor = vec4(mix(c.rgb, vec3(1.0, 0.96, 0.78), core * 0.5), core * flow * c.a);
  } else {
    vec2 p = vUv * 2.0 - 1.0;
    float s = smoothstep(1.0, 0.15, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.55), s * c.a);
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

function buildDesertGauntlet() {
  const buf = [];
  const C_SAND = [0.84, 0.64, 0.42];
  const C_TERRACOTTA = [0.76, 0.40, 0.25];
  const C_MESA = [0.68, 0.34, 0.22];
  const C_OASIS = [0.10, 0.72, 0.76];
  const C_GOLD = [0.95, 0.72, 0.20];

  // Long sunlit sandstone temple causeway!
  pushBox(buf, -8.0, 64.0, -1.6, 0.0, -2.4, 2.4, C_SAND, 0.0);
  // Decorative side sandstone curbs
  pushBox(buf, -8.0, 64.0, -1.6, 0.28, -2.85, -2.35, C_TERRACOTTA, 1.0);
  pushBox(buf, -8.0, 64.0, -1.6, 0.22, 2.35, 2.75, C_TERRACOTTA, 1.0);
  // Shimmering turquoise oasis canal running parallel behind the causeway!
  pushBox(buf, -10.0, 66.0, -1.8, -0.55, -7.2, -2.85, C_OASIS, 2.0);

  // Rhythmic ancient sandstone temple columns & obelisks every 7m along back ridge (makes camera motion/jitter crystal clear!)
  for (let x = -4; x <= 58; x += 7) {
    pushBox(buf, x - 0.45, x + 0.45, 0.0, 3.2, -3.5, -2.6, C_TERRACOTTA, 1.0);
    pushBox(buf, x - 0.56, x + 0.56, 3.2, 3.55, -3.6, -2.5, C_GOLD, 3.0);
    // Low desert stone cairns in foreground edge every 14m for rich parallax!
    if ((x + 4) % 14 === 0) {
      pushBox(buf, x - 0.32, x + 0.32, 0.0, 0.65, 2.45, 2.95, C_TERRACOTTA, 1.0);
    }
  }

  // Grand Golden Temple Finish Archway at GOAL_X!
  pushBox(buf, GOAL_X - 0.55, GOAL_X + 0.55, 0.0, 4.4, -2.2, -1.5, C_TERRACOTTA, 1.0);
  pushBox(buf, GOAL_X - 0.55, GOAL_X + 0.55, 0.0, 4.4, 1.5, 2.2, C_TERRACOTTA, 1.0);
  pushBox(buf, GOAL_X - 0.72, GOAL_X + 0.72, 4.4, 5.05, -2.5, 2.5, C_GOLD, 3.0);

  // Monumental terracotta desert canyon mesas in far background (framed below the bright desert sky!)
  const mesas = [
    [-8, 6, 4.2, -20], [10, 22, 5.4, -24], [25, 39, 3.8, -19],
    [42, 56, 5.8, -25], [58, 72, 4.4, -20],
  ];
  for (const [x0, x1, h, z] of mesas) {
    pushBox(buf, x0, x1, -3.0, h, z - 4.0, z + 3.0, C_MESA, 1.0);
    pushBox(buf, x0 + 1.8, x1 - 1.8, h, h + 1.1, z - 3.0, z + 2.0, C_TERRACOTTA, 1.0);
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

export function createCanyonRenderer(gl) {
  const [skyProg, shadowProg, worldProg, nomadProg, nomadShadowProg, sawProg, sawShadowProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [NOMAD_VS, PROP_FS],
    [NOMAD_SHADOW_VS, SHADOW_FS],
    [SAW_VS, PROP_FS],
    [SAW_SHADOW_VS, SHADOW_FS],
    [FX_VS, FX_FS],
  ]);

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

  const worldData = buildDesertGauntlet();
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

  const meshes = getDesertMeshes();
  const nomadGeo = makePartVao(gl, meshes.nomad);
  const sawGeo = makePartVao(gl, meshes.saw);

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

  function render({
    w, h, cam, time, hero, saws,
    overlayOn = true,
    smartCam = true,
    deadBox = null,   // { x0, x1, y0, y1, pushingEdge }
    camTarget = null, // { x, y }
    jitterAlert = 0,
    sparks = [],
  }) {
    const aspect = w / Math.max(1, h);
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.25, 160);
    const viewProj = mulMat4(proj, view);

    const shCx = cam.targetX;
    const lightView = makeLookAt([shCx + 12, 22, 10], [shCx, 0.5, 0], [0, 1, 0]);
    const lightProj = makeOrtho(-16, 16, -12, 12, 2, 56);
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

    gl.useProgram(nomadShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(nomadShadowProg, "uLightVP"), false, lightVP);
    gl.uniform3f(gl.getUniformLocation(nomadShadowProg, "uPos"), hero.x, hero.y, hero.z);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uYaw"), hero.yaw);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uTilt"), hero.tilt);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uRunPhase"), hero.runPhase);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uRunAmp"), hero.runAmp);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uAirBlend"), hero.airBlend);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uVelY"), hero.vy);
    gl.uniform1f(gl.getUniformLocation(nomadShadowProg, "uSquash"), hero.squash);
    gl.bindVertexArray(nomadGeo.vao);
    gl.drawElements(gl.TRIANGLES, nomadGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(sawShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(sawShadowProg, "uLightVP"), false, lightVP);
    gl.bindVertexArray(sawGeo.vao);
    for (const s of saws) {
      gl.uniform3f(gl.getUniformLocation(sawShadowProg, "uPos"), s.x, 0, 0);
      gl.uniform1f(gl.getUniformLocation(sawShadowProg, "uSpin"), time * 8.5 + s.id);
      gl.drawElements(gl.TRIANGLES, sawGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 2) Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.10, 0.25, 0.52, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(skyProg);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uJitterAlert"), jitterAlert);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
    gl.uniform3f(gl.getUniformLocation(worldProg, "uHeroPos"), hero.x, hero.y, hero.z);
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

    // Desert Nomad Hero
    gl.useProgram(nomadProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(nomadProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(nomadProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform4f(gl.getUniformLocation(nomadProg, "uFlash"), hero.flash[0], hero.flash[1], hero.flash[2], hero.flash[3]);
    gl.uniform3f(gl.getUniformLocation(nomadProg, "uPos"), hero.x, hero.y, hero.z);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uYaw"), hero.yaw);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uTilt"), hero.tilt);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uRunPhase"), hero.runPhase);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uRunAmp"), hero.runAmp);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uAirBlend"), hero.airBlend);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uVelY"), hero.vy);
    gl.uniform1f(gl.getUniformLocation(nomadProg, "uSquash"), hero.squash);
    gl.bindVertexArray(nomadGeo.vao);
    gl.drawElements(gl.TRIANGLES, nomadGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    // Spinning Brass Sawblade Traps
    gl.useProgram(sawProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(sawProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(sawProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform4f(gl.getUniformLocation(sawProg, "uFlash"), 1, 1, 1, 0);
    gl.bindVertexArray(sawGeo.vao);
    for (const s of saws) {
      gl.uniform3f(gl.getUniformLocation(sawProg, "uPos"), s.x, 0, 0);
      gl.uniform1f(gl.getUniformLocation(sawProg, "uSpin"), time * 8.5 + s.id);
      gl.drawElements(gl.TRIANGLES, sawGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 3) Translucent 3D Deadzone Glass Frame + Look-Ahead Tether + Sand Sparks!
    const fx = [];
    if (overlayOn && smartCam && deadBox) {
      const col = deadBox.pushingEdge ? [0.98, 0.72, 0.18] : [0.16, 0.92, 1.0];
      // Front glass frame of the 3D Deadzone Window right along z = +0.85!
      pushFxQuad(
        fx,
        [deadBox.x0, deadBox.y0, 0.85], [deadBox.x1, deadBox.y0, 0.85],
        [deadBox.x1, deadBox.y1, 0.85], [deadBox.x0, deadBox.y1, 0.85],
        col[0], col[1], col[2], 0.85, 0.0,
      );
      // Floor footprint of the horizontal Deadzone on sandstone deck!
      pushFxQuad(
        fx,
        [deadBox.x0, 0.04, 0.85], [deadBox.x1, 0.04, 0.85],
        [deadBox.x1, 0.04, -0.85], [deadBox.x0, 0.04, -0.85],
        col[0], col[1], col[2], 0.62, 0.0,
      );
    }

    // Glowing Amber Look-Ahead Tether Beam connecting Nomad -> Camera Target Reticle!
    if (overlayOn && camTarget) {
      const dx = camTarget.x - hero.x;
      const hy = hero.y + 1.05;
      const ty = camTarget.y + 0.35;
      if (Math.abs(dx) > 0.35) {
        pushFxQuad(
          fx,
          [hero.x, hy - 0.10, 0.35], [camTarget.x, ty - 0.10, 0.35],
          [camTarget.x, ty + 0.10, 0.35], [hero.x, hy + 0.10, 0.35],
          1.0, 0.74, 0.18, 0.92, 1.0,
        );
      }
      // Camera Target glowing reticle orb
      const rc = smartCam ? [1.0, 0.78, 0.22] : [1.0, 0.24, 0.30];
      pushBillboard(fx, camTarget.x, ty, 0.40, 0.32, basis, rc[0], rc[1], rc[2], 0.95, 2.0);
    }

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
    rendererName: "WebGL2 Desert Canyon Gauntlet + Blender Nomad & Brass Sawblades",
  };
}
