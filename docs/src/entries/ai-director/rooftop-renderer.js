// Dedicated 3D Stormy Neon Rooftop Helipad WebGL2 Renderer for "AI Director (Left 4 Dead Pacing)" (#12).
// Studio Overhaul: 1024x1024 PCF dynamic shadows + Heliport Control Tower with warm panoramic glass & radar mast +
// 4 illuminated Stairwell Spawn Gates (pulsing crimson during horde vs locked teal in Relax) + tactical roof crates +
// volumetric Survivor Flashlight Cone + animated 3D storm rain streaks + Emerald Medkit Rescue Light Pillar!
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
import { getDirectorMeshes } from "../../director-mesh.js";

const SHADOW_RES = 1024;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uPeak;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.022, 0.032, 0.058);
  vec3 mid = vec3(0.052, 0.072, 0.112);
  vec3 bot = mix(vec3(0.080, 0.105, 0.145), vec3(0.28, 0.06, 0.08), uPeak * 0.65);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, top, smoothstep(0.45, 1.0, vUv.y));
  // Subtle storm cloud texture & distant city skyline glow
  float cloud = sin(vUv.x * 9.0 + uTime * 0.15) * cos(vUv.y * 6.0 - 0.5) * 0.5 + 0.5;
  col += vec3(0.03, 0.04, 0.07) * cloud * smoothstep(0.2, 0.8, vUv.y);
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }
`;

const SHADOW_CHAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=4) in float aPart;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos;
  int part = int(aPart + 0.5);
  float sw = sin(uPose.y) * 0.56 * uPose.z;
  if (part == 1) { vec3 pv = vec3(0.12, 0.58, 0.0); p = rotX(p - pv, sw) + pv; }
  else if (part == 2) { vec3 pv = vec3(-0.12, 0.58, 0.0); p = rotX(p - pv, -sw) + pv; }
  p.y += abs(sin(uPose.y)) * 0.05 * uPose.z;
  vec3 wp = rotY(p * uPose.w, uPose.x) + uOrigin;
  gl_Position = uLightVP * vec4(wp, 1.0);
}
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
  vPos = aPos; vNorm = aNorm; vCol = aCol; vMat = aMat;
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
uniform vec3 uPhaseCol;
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
  float rough = 0.40;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Rain-slick rooftop tarmac with golden Helipad circle, "H" emblem, perimeter stripes & specular puddles!
    float r = length(vPos.xz - vec2(0.0, 0.25));
    float ring = smoothstep(0.16, 0.04, abs(r - 3.65));
    float innerRing = smoothstep(0.09, 0.03, abs(r - 3.18));
    vec2 hp = vPos.xz - vec2(0.0, 0.25);
    float hLeft = step(abs(hp.x + 1.05), 0.25) * step(abs(hp.y), 1.62);
    float hRight = step(abs(hp.x - 1.05), 0.25) * step(abs(hp.y), 1.62);
    float hMid = step(abs(hp.y), 0.25) * step(abs(hp.x), 1.05);
    float paint = clamp(max(max(ring, innerRing * 0.45), max(hLeft, max(hRight, hMid))), 0.0, 1.0);

    // Subtle expansion joints & rain puddles
    vec2 f = fract(vPos.xz * 0.35);
    float seam = 1.0 - smoothstep(0.008, 0.022, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float puddle = smoothstep(0.28, 0.70, sin(vPos.x * 0.85 + 1.2) * cos(vPos.z * 0.78 - 0.5));
    float ripple = 0.5 + 0.5 * sin(length(fract(vPos.xz * 0.5) - 0.5) * 28.0 - uTime * 9.0);
    albedo = mix(base * 0.92, base * 0.74, seam * 0.6);
    albedo = mix(albedo, vec3(0.92, 0.68, 0.14), paint * 0.88);
    rough = mix(0.46, 0.12, puddle * (0.75 + 0.25 * ripple));
    emissive += vec3(0.16, 0.11, 0.02) * paint;
    // Soft warm glow cast onto deck by the Control Tower window!
    float towerGlow = exp(-dot(vPos.xz - vec2(0.0, -5.0), vPos.xz - vec2(0.0, -5.0)) * 0.14);
    emissive += vec3(0.20, 0.14, 0.06) * towerGlow;
  } else if (vMat < 1.5) {
    // Weathered concrete parapet, control tower walls & vents
    float seam = smoothstep(0.04, 0.09, abs(fract(vPos.y * 1.6) - 0.5));
    albedo = base * mix(0.84, 1.04, seam);
    rough = 0.62;
  } else if (vMat < 2.5) {
    // Phase Beacon Lights & Stairwell Spawn Gate Light Bars (rich saturated glow without ACES whiteout!)
    float flash = 0.72 + 0.28 * sin(uTime * 7.5 + vPos.x * 0.7);
    albedo = uPhaseCol * 0.35;
    emissive = uPhaseCol * 1.15 * flash;
    rough = 0.16;
  } else if (vMat < 3.5) {
    // Warm amber Control Tower panoramic windows!
    float scan = 0.92 + 0.08 * sin(vPos.x * 4.5 + uTime * 2.2);
    albedo = vec3(0.24, 0.20, 0.12);
    emissive = vec3(1.15, 0.78, 0.30) * scan;
    rough = 0.10;
  } else {
    // Industrial hazard yellow/black stripes on parapet sills & gate trims
    float stripe = step(0.5, fract((vPos.x + vPos.z) * 1.4));
    albedo = mix(vec3(0.05, 0.06, 0.08), vec3(0.90, 0.62, 0.10), stripe);
    rough = 0.42;
  }

  vec3 moonDir = normalize(vec3(0.32, 0.88, 0.34));
  float ndl = max(dot(N, moonDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(moonDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.72;
  vec3 amb = mix(vec3(0.09, 0.12, 0.18), vec3(0.28, 0.35, 0.48), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.94, 1.02, 1.22) * ndl * (0.28 + 0.72 * sh))
           + vec3(0.88, 0.96, 1.15) * spec * (0.35 + 0.65 * sh)
           + emissive;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const CHAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;
uniform vec4 uFlash;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out vec4 vShadow;

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }

void main() {
  vec3 p = aPos, n = aNorm;
  int part = int(aPart + 0.5);
  float sw = sin(uPose.y) * 0.58 * uPose.z;
  if (part == 1) { vec3 pv = vec3(0.12, 0.58, 0.0); p = rotX(p - pv, sw) + pv; n = rotX(n, sw); }
  else if (part == 2) { vec3 pv = vec3(-0.12, 0.58, 0.0); p = rotX(p - pv, -sw) + pv; n = rotX(n, -sw); }
  p.y += abs(sin(uPose.y)) * 0.05 * uPose.z;
  vec3 wp = rotY(p * uPose.w, uPose.x) + uOrigin;
  vPos = wp;
  vNorm = normalize(rotY(n, uPose.x));
  vCol = mix(aCol, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  vRough = aRough;
  vShadow = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const CHAR_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
in vec4 vShadow;
uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0024 * (1.0 - ndl), 0.0010);
  return (p.z - bias <= texture(uShadowMap, p.xy).r) ? 1.0 : 0.0;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 moonDir = normalize(vec3(0.32, 0.88, 0.34));
  float ndl = max(dot(N, moonDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(moonDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 64.0, 1.0 - rough)) * (1.0 - rough) * 0.62;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.3) * 0.48;
  vec3 amb = mix(vec3(0.14, 0.17, 0.24), vec3(0.38, 0.44, 0.58), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.16, 1.18, 1.30) * ndl * (0.36 + 0.64 * sh))
           + vec3(0.92, 0.96, 1.10) * spec * (0.4 + 0.6 * sh)
           + vec3(0.50, 0.72, 1.0) * rim;
  if (vRough < 0.08 && vCol.r > 0.88 && vCol.g < 0.30) lit += vec3(2.6, 0.16, 0.22);
  if (vRough < 0.08 && vCol.g > 0.88 && vCol.r < 0.40) lit += vec3(0.18, 2.3, 1.05);
  if (vRough < 0.08 && vCol.r > 0.90 && vCol.g > 0.85) lit += vec3(2.2, 1.95, 0.72);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=beam/rain, 1=ring, 2=orb/spark, 3=flashlight cone, 4=vertical pillar
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out float vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }
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
    float edge = 1.0 - smoothstep(0.24, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.42), clamp(a, 0.0, 0.94));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.86, r) * smoothstep(0.68, 0.82, r);
    float a = (ring + smoothstep(0.80, 0.0, r) * 0.15) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.35), clamp(a, 0.0, 0.92));
  } else if (vKind < 2.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float s = smoothstep(1.0, 0.12, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.72), s * c.a);
  } else if (vKind < 3.5) {
    // Volumetric Survivor Flashlight Cone!
    float distFade = (1.0 - smoothstep(0.08, 1.0, vUv.y));
    float sideFade = 1.0 - smoothstep(0.18, 0.50, abs(vUv.x - 0.5));
    float a = c.a * distFade * sideFade;
    if (a < 0.01) discard;
    fragColor = vec4(c.rgb, clamp(a, 0.0, 0.52));
  } else {
    // Tall Emerald Medkit Supply Drop Pillar!
    float hFade = 1.0 - smoothstep(0.15, 1.0, vUv.y);
    float side = 1.0 - smoothstep(0.15, 0.50, abs(vUv.x - 0.5));
    float a = c.a * hFade * side;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), side * 0.35), clamp(a, 0.0, 0.72));
  }
}
`;

function pushBox(buf, x0, x1, y0, y1, z0, z1, col, matId) {
  const faces = [
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of faces) {
    for (const v of [a, b, c, a, c, d]) buf.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], matId);
  }
}

function buildRooftopWorld() {
  const buf = [];
  const asphalt = [0.20, 0.23, 0.29];
  const concrete = [0.34, 0.38, 0.45];
  const steel = [0.24, 0.28, 0.35];
  const darkGate = [0.09, 0.11, 0.15];
  const crateCol = [0.36, 0.32, 0.24];

  // Wet rooftop tarmac slab
  pushBox(buf, -8.0, 8.0, -0.5, 0.0, -6.6, 6.4, asphalt, 0);
  // Perimeter parapets + safety trim
  pushBox(buf, -8.0, 8.0, 0.0, 0.78, -6.6, -6.05, concrete, 1);
  pushBox(buf, -8.0, -7.45, 0.0, 0.78, -6.05, 6.4, concrete, 1);
  pushBox(buf,  7.45,  8.0, 0.0, 0.78, -6.05, 6.4, concrete, 1);
  pushBox(buf, -8.0, 8.0, 0.0, 0.24,  5.95, 6.4, concrete, 1);
  pushBox(buf, -7.4, 7.4, 0.0, 0.05, -6.05, -5.82, [1, 0.7, 0.1], 4);

  // North Heliport Control Tower (visual landmark & Director headquarters!)
  pushBox(buf, -2.5, 2.5, 0.0, 2.45, -7.25, -5.75, concrete, 1);
  pushBox(buf, -2.75, 2.75, 2.45, 2.70, -7.42, -5.58, steel, 1);
  // Warm glowing panoramic Control Room windows!
  pushBox(buf, -2.15, 2.15, 1.38, 2.18, -5.78, -5.66, [1.0, 0.78, 0.32], 3);
  // Radar dish mast & Director Phase Beacon on tower roof
  pushBox(buf, -0.14, 0.14, 2.70, 3.55, -6.58, -6.30, steel, 1);
  pushBox(buf, -0.26, 0.26, 3.55, 3.92, -6.70, -6.18, [1, 1, 1], 2);

  // 4 Architectural Stairwell Spawn Gates (dark door + steel frame + pulsing Phase Light Bar!)
  const gates = [
    { x: -6.75, z: -5.25 },
    { x:  6.75, z: -5.25 },
    { x: -6.75, z:  5.05 },
    { x:  6.75, z:  5.05 },
  ];
  for (const g of gates) {
    pushBox(buf, g.x - 0.68, g.x + 0.68, 0.0, 1.55, g.z - 0.56, g.z + 0.56, steel, 1);
    pushBox(buf, g.x - 0.44, g.x + 0.44, 0.0, 1.18, g.z - 0.60, g.z + 0.60, darkGate, 1);
    pushBox(buf, g.x - 0.58, g.x + 0.58, 1.55, 1.84, g.z - 0.44, g.z + 0.44, [1, 1, 1], 2);
  }

  // Peripheral Rooftop HVAC vents & supply crates (visual storytelling without blocking combat!)
  pushBox(buf, -5.3, -4.1, 0.0, 0.72, -5.95, -5.15, steel, 1);
  pushBox(buf,  4.1,  5.3, 0.0, 0.72, -5.95, -5.15, steel, 1);
  pushBox(buf, -7.35, -6.65, 0.0, 0.62, -1.2, 0.4, crateCol, 1);
  pushBox(buf,  6.65,  7.35, 0.0, 0.62, -0.6, 1.0, crateCol, 1);

  return new Float32Array(buf);
}

export function createRooftopRenderer(gl) {
  const [skyProg, shWorldProg, shCharProg, worldProg, charProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_WORLD_VS, SHADOW_FS],
    [SHADOW_CHAR_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [CHAR_VS, CHAR_FS],
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

  const lightVP = mulMat4(
    makeOrtho(-11.2, 11.2, -9.8, 9.8, 1.0, 34.0),
    makeLookAt([6.4, 16.8, 6.8], [0, 0, -0.3], [0, 1, 0])
  );

  const emptyVao = gl.createVertexArray();
  const worldData = buildRooftopWorld();
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

  const meshes = getDirectorMeshes();
  function upload(m) {
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
  const survGpu = upload(meshes.survivor);
  const zombGpu = upload(meshes.zombie);
  const medGpu = upload(meshes.medkit);

  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 7500, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyPeak = gl.getUniformLocation(skyProg, "uPeak");
  const uSkyTime = gl.getUniformLocation(skyProg, "uTime");
  const uShWVP = gl.getUniformLocation(shWorldProg, "uLightVP");
  const uShCVP = gl.getUniformLocation(shCharProg, "uLightVP");
  const uShCOrig = gl.getUniformLocation(shCharProg, "uOrigin");
  const uShCPose = gl.getUniformLocation(shCharProg, "uPose");

  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWLightVP = gl.getUniformLocation(worldProg, "uLightVP");
  const uWShadow = gl.getUniformLocation(worldProg, "uShadowMap");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uWPhase = gl.getUniformLocation(worldProg, "uPhaseCol");

  const uCVP = gl.getUniformLocation(charProg, "uViewProj");
  const uCLightVP = gl.getUniformLocation(charProg, "uLightVP");
  const uCShadow = gl.getUniformLocation(charProg, "uShadowMap");
  const uCOrig = gl.getUniformLocation(charProg, "uOrigin");
  const uCPose = gl.getUniformLocation(charProg, "uPose");
  const uCFlash = gl.getUniformLocation(charProg, "uFlash");
  const uCCam = gl.getUniformLocation(charProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

  // Deterministic 56 storm rain streaks
  const rainSeeds = Array.from({ length: 56 }, (_, i) => ({
    x: ((i * 73.13) % 15.2) - 7.6,
    z: ((i * 41.77) % 12.2) - 6.1,
    ph: (i * 0.37) % 1.0,
    spd: 0.95 + ((i * 19) % 10) * 0.05,
  }));

  const fxBuf = [];
  function pushBeam(x0, y0, z0, x1, y1, z1, width, col) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * width * 0.5, pz = (dx / l) * width * 0.5;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, 0,
      x0 + px, y0, z0 + pz, 1, 0, r, g, b, a, 0,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, 0,
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, 0,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, 0,
      x1 - px, y1, z1 - pz, 0, 1, r, g, b, a, 0
    );
  }
  function pushVerticalRibbon(x0, y0, z0, x1, y1, z1, halfW, right, col, kind = 0) {
    const rx = right[0] * halfW, ry = right[1] * halfW, rz = right[2] * halfW;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - rx, y0 - ry, z0 - rz, 0, 0, r, g, b, a, kind,
      x0 + rx, y0 + ry, z0 + rz, 1, 0, r, g, b, a, kind,
      x1 + rx, y1 + ry, z1 + rz, 1, 1, r, g, b, a, kind,
      x0 - rx, y0 - ry, z0 - rz, 0, 0, r, g, b, a, kind,
      x1 + rx, y1 + ry, z1 + rz, 1, 1, r, g, b, a, kind,
      x1 - rx, y1 - ry, z1 - rz, 0, 1, r, g, b, a, kind
    );
  }
  function pushRingXZ(cx, y, cz, rad, col) {
    const [r, g, b, a] = col;
    const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
    fxBuf.push(
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z0, 1, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1,
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1, x0, y, z1, 0, 1, r, g, b, a, 1
    );
  }
  function pushFlashlightCone(ox, y, oz, yaw, halfRad, len, col) {
    const [r, g, b, a] = col;
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs;
      const a0 = yaw - halfRad + u0 * halfRad * 2;
      const a1 = yaw - halfRad + u1 * halfRad * 2;
      const x0 = ox + Math.sin(a0) * len, z0 = oz + Math.cos(a0) * len;
      const x1 = ox + Math.sin(a1) * len, z1 = oz + Math.cos(a1) * len;
      fxBuf.push(
        ox, y, oz, 0.5, 0, r, g, b, a, 3,
        x0, 0.08, z0, u0, 1, r, g, b, a, 3,
        x1, 0.08, z1, u1, 1, r, g, b, a, 3
      );
    }
  }
  function pushBillboard(cx, cy, cz, rad, right, up, col) {
    const [r, g, b, a] = col;
    const rx = right[0] * rad, ry = right[1] * rad, rz = right[2] * rad;
    const ux = up[0] * rad, uy = up[1] * rad, uz = up[2] * rad;
    const p0 = [cx - rx - ux, cy - ry - uy, cz - rz - uz];
    const p1 = [cx + rx - ux, cy + ry - uy, cz + rz - uz];
    const p2 = [cx + rx + ux, cy + ry + uy, cz + rz + uz];
    const p3 = [cx - rx + ux, cy - ry + uy, cz - rz + uz];
    fxBuf.push(
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 2, p1[0], p1[1], p1[2], 1, 0, r, g, b, a, 2, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 2,
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 2, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 2, p3[0], p3[1], p3[2], 0, 1, r, g, b, a, 2
    );
  }

  return {
    render(w, h, cam, state) {
      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);
      const sv = state.survivor;

      // 1. Dynamic 1024x1024 PCF Shadow Pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.useProgram(shWorldProg);
      gl.uniformMatrix4fv(uShWVP, false, lightVP);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      gl.useProgram(shCharProg);
      gl.uniformMatrix4fv(uShCVP, false, lightVP);
      gl.bindVertexArray(survGpu.vao);
      gl.uniform3f(uShCOrig, sv.x, 0.0, sv.z);
      gl.uniform4f(uShCPose, sv.yaw, sv.walkPhase, sv.walkAmp, 1.12);
      gl.drawElements(gl.TRIANGLES, survGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(zombGpu.vao);
      for (const z of state.zombies) {
        gl.uniform3f(uShCOrig, z.x, 0.0, z.z);
        gl.uniform4f(uShCPose, z.yaw, z.walkPhase, 1.0, 1.04);
        gl.drawElements(gl.TRIANGLES, zombGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      gl.bindVertexArray(medGpu.vao);
      for (const mk of state.medkits) {
        gl.uniform3f(uShCOrig, mk.x, mk.y, mk.z);
        gl.uniform4f(uShCPose, state.time * 1.4, 0.0, 0.0, 1.15);
        gl.drawElements(gl.TRIANGLES, medGpu.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 2. Stormy Sky
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyPeak, state.phase === "PEAK" ? 1.0 : (state.phase === "BUILD" ? 0.35 : 0.0));
      gl.uniform1f(uSkyTime, state.time);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3. Rooftop World
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      const pCol = state.phase === "PEAK" ? [1.0, 0.05, 0.08]
                 : state.phase === "RELAX" ? [0.04, 0.92, 0.56]
                 : state.phase === "FADE" ? [0.12, 0.64, 1.0]
                 : [1.0, 0.58, 0.04];

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniformMatrix4fv(uWLightVP, false, lightVP);
      gl.uniform1i(uWShadow, 0);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.uniform3fv(uWPhase, pCol);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // 4. Characters & Medkits
      gl.useProgram(charProg);
      gl.uniformMatrix4fv(uCVP, false, viewProj);
      gl.uniformMatrix4fv(uCLightVP, false, lightVP);
      gl.uniform1i(uCShadow, 0);
      gl.uniform3fv(uCCam, basis.pos);

      gl.bindVertexArray(survGpu.vao);
      gl.uniform3f(uCOrig, sv.x, 0.0, sv.z);
      gl.uniform4f(uCPose, sv.yaw, sv.walkPhase, sv.walkAmp, 1.12);
      gl.uniform4f(uCFlash, 1.0, 0.22, 0.26, sv.hurtFlash);
      gl.drawElements(gl.TRIANGLES, survGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(zombGpu.vao);
      for (const z of state.zombies) {
        gl.uniform3f(uCOrig, z.x, 0.0, z.z);
        gl.uniform4f(uCPose, z.yaw, z.walkPhase, 1.0, 1.04);
        gl.uniform4f(uCFlash, 1.0, 0.90, 0.65, z.flash);
        gl.drawElements(gl.TRIANGLES, zombGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      gl.bindVertexArray(medGpu.vao);
      for (const mk of state.medkits) {
        const hover = mk.y + Math.sin(state.time * 3.8) * 0.07;
        gl.uniform3f(uCOrig, mk.x, hover, mk.z);
        gl.uniform4f(uCPose, state.time * 1.4, 0.0, 0.0, 1.15);
        gl.uniform4f(uCFlash, 0.16, 1.0, 0.64, 0.18);
        gl.drawElements(gl.TRIANGLES, medGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // 5. Atmospheric FX: Survivor Flashlight Cone, Medkit Rescue Light Pillar, Shotgun Tracers & Slanted Rain!
      fxBuf.length = 0;
      // Survivor volumetric flashlight beam
      pushFlashlightCone(
        sv.x + Math.sin(sv.yaw) * 0.65, 0.96, sv.z + Math.cos(sv.yaw) * 0.65,
        sv.yaw, 0.36, 5.4, [1.0, 0.95, 0.72, 0.44]
      );
      // Survivor subtle hero locator ring
      pushRingXZ(sv.x, 0.05, sv.z, 0.68, [0.30, 0.86, 1.0, 0.55]);

      // Director Medkit Rescue Ring + Vertical Emerald Sky Beam!
      for (const mk of state.medkits) {
        pushRingXZ(mk.x, 0.06, mk.z, 0.95 + 0.14 * Math.sin(state.time * 5.0), [0.16, 1.0, 0.64, 0.88]);
        pushVerticalRibbon(mk.x, 0.05, mk.z, mk.x, 5.6, mk.z, 0.52, basis.right, [0.16, 1.0, 0.68, 0.48], 4);
      }

      for (const tr of state.tracers) {
        const a = clamp(tr.life / tr.maxLife, 0, 1);
        pushBeam(tr.x0, 1.02, tr.z0, tr.x1, 1.02, tr.z1, 0.12, [1.0, 0.88, 0.40, a * 0.95]);
      }

      for (const sp of state.sparks) {
        const a = clamp(sp.life / sp.maxLife, 0, 1);
        pushBillboard(sp.x, sp.y, sp.z, sp.size * (0.4 + 0.6 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a]);
      }

      // Slanted nocturnal storm rain streaks
      for (const rs of rainSeeds) {
        const fall = (rs.ph + state.time * rs.spd * 1.45) % 1.0;
        const yTop = 8.2 * (1.0 - fall) + 0.4;
        const yBot = yTop - 0.88;
        if (yBot > 0.05) {
          pushVerticalRibbon(
            rs.x, yTop, rs.z,
            rs.x - 0.16, yBot, rs.z + 0.08,
            0.018, basis.right, [0.68, 0.84, 1.0, 0.24], 0
          );
        }
      }

      if (fxBuf.length > 0) {
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.useProgram(fxProg);
        gl.uniformMatrix4fv(uFVP, false, viewProj);
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
