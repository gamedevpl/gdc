// 3D Miniature Stadium Racetrack WebGL2 Renderer for Game Design Codex (/gdc/rubber-banding/)
// & Film #3 ("Why racing games secretly cheat" — Rubber Banding Explained).
// Sculpted Blender GT cars (sRGB->linear PBR), 1024x1024 PCF shadows, 8 HDR floodlights,
// literal glowing 3D elastic rubber bands, tire smoke / nitro sparks, HDR bloom & ACES tone mapping.
import {
  clamp,
  makeLookAt,
  makePerspective,
  makeOrtho,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
  hdrFormat,
  makeRenderTex,
} from "../../gl-utils.js";
import { getCarMesh } from "../../car-mesh.js";

const SHADOW_RES = 1024;
export const TRACK_HW = 1.52;

// Smooth closed portrait-friendly GP circuit with gentle sweeping hairpins (zero curb self-overlap!).
const RAW_SAMPLES = 512;
function rawPoint(u) {
  const a = u * Math.PI * 2;
  const x = 4.65 * Math.sin(a) + 0.48 * Math.sin(2 * a);
  const z = 7.05 * Math.cos(a) + 0.35 * Math.cos(2 * a);
  return [x, z];
}

// Build arc-length table for uniform speed along track
const lutX = new Float32Array(RAW_SAMPLES + 1);
const lutZ = new Float32Array(RAW_SAMPLES + 1);
const lutS = new Float32Array(RAW_SAMPLES + 1);
{
  let acc = 0;
  let [px, pz] = rawPoint(0);
  lutX[0] = px; lutZ[0] = pz; lutS[0] = 0;
  for (let i = 1; i <= RAW_SAMPLES; i++) {
    const [nx, nz] = rawPoint(i / RAW_SAMPLES);
    acc += Math.hypot(nx - px, nz - pz);
    lutX[i] = nx; lutZ[i] = nz; lutS[i] = acc;
    px = nx; pz = nz;
  }
}
export const TRACK_LENGTH = lutS[RAW_SAMPLES];

// Sample track point, forward unit tangent (tx, tz), right unit normal (rx, rz), and heading yaw (atan2(tx, tz))
export function sampleTrack(sRaw) {
  let s = sRaw % TRACK_LENGTH;
  if (s < 0) s += TRACK_LENGTH;
  // Binary search in lutS
  let lo = 0, hi = RAW_SAMPLES;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lutS[mid] <= s) lo = mid; else hi = mid;
  }
  const span = Math.max(1e-6, lutS[hi] - lutS[lo]);
  const f = (s - lutS[lo]) / span;
  const x = lutX[lo] + (lutX[hi] - lutX[lo]) * f;
  const z = lutZ[lo] + (lutZ[hi] - lutZ[lo]) * f;

  // Finite-difference tangent over ~0.35 units for silky smooth heading
  const ds = 0.30;
  let s0 = s - ds; if (s0 < 0) s0 += TRACK_LENGTH;
  let s1 = s + ds; if (s1 >= TRACK_LENGTH) s1 -= TRACK_LENGTH;
  const p0 = samplePosOnly(s0);
  const p1 = samplePosOnly(s1);
  let tx = p1[0] - p0[0];
  let tz = p1[1] - p0[1];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl; tz /= tl;
  // Right vector in XZ plane (with +Y up): cross(forward, up) = (-tz, 0, tx)? Check: (tx,0,tz)x(0,1,0) = (-tz, 0, tx)
  const rx = -tz;
  const rz = tx;
  const yaw = Math.atan2(tx, tz);
  return { x, z, tx, tz, rx, rz, yaw, s };
}

function samplePosOnly(s) {
  let lo = 0, hi = RAW_SAMPLES;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lutS[mid] <= s) lo = mid; else hi = mid;
  }
  const span = Math.max(1e-6, lutS[hi] - lutS[lo]);
  const f = (s - lutS[lo]) / span;
  return [lutX[lo] + (lutX[hi] - lutX[lo]) * f, lutZ[lo] + (lutZ[hi] - lutZ[lo]) * f];
}

// Start/finish line sits cleanly on the long west straight (s ≈ 0.74 * TRACK_LENGTH)
export const START_S = TRACK_LENGTH * 0.74;

// Stadium floodlight poles (6 warm-white stadium towers framing the circuit)
export const FLOODLIGHTS = [
  [-7.2, 4.6, -5.8],
  [ 7.4, 4.6, -5.8],
  [-7.4, 4.6,  0.4],
  [ 7.6, 4.6,  0.6],
  [-7.2, 4.6,  6.4],
  [ 7.4, 4.6,  6.4],
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 bot = vec3(0.032, 0.052, 0.105);
  vec3 mid = vec3(0.072, 0.108, 0.195);
  vec3 top = vec3(0.024, 0.036, 0.082);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.45, vUv.y));
  col = mix(col, top, smoothstep(0.45, 1.0, vUv.y));
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

// Static world geometry: pos(3), norm(3), uv(2), mat(1), extra(1) = 10 floats
const WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
layout(location=3) in float aMat;
layout(location=4) in float aExtra;

uniform mat4 uViewProj;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vNorm;
out vec2 vUv;
out float vMat;
out float vExtra;
out vec4 vShadowPos;

void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  vUv = aUv;
  vMat = aMat;
  vExtra = aExtra;
  vShadowPos = uLightVP * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in vec2 vUv;
in float vMat;
in float vExtra;
in vec4 vShadowPos;

uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform vec4 uLightsPos[8];
uniform vec4 uLightsCol[8];
uniform float uTime;

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
  vec2 texel = vec2(1.0 / float(${SHADOW_RES}));
  float acc = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
      acc += (p.z - bias <= d) ? 1.0 : 0.0;
    }
  }
  return mix(0.32, 1.0, acc / 9.0);
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 base = vec3(0.2);
  float rough = 0.85;
  vec3 emissive = vec3(0.0);

  int m = int(vMat + 0.5);
  if (m == 0) {
    // Lush mowed stadium turf with subtle diagonal stripes & micro grain
    float stripe = step(0.5, fract((vWorldPos.x * 0.42 + vWorldPos.z * 0.18)));
    float grain = hash21(floor(vWorldPos.xz * 10.0)) * 0.04;
    vec3 gA = vec3(0.065, 0.245, 0.105);
    vec3 gB = vec3(0.088, 0.305, 0.128);
    base = mix(gA, gB, stripe) + vec3(grain * 0.4, grain, grain * 0.3);
    // Subtle dark diorama border fade near table rim
    float edge = max(abs(vWorldPos.x) / 8.2, abs(vWorldPos.z) / 10.8);
    base *= mix(1.0, 0.72, smoothstep(0.82, 1.0, edge));
    rough = 0.92;
  } else if (m == 1) {
    // Crisp dark race tarmac: vUv.x = arc-length s, vUv.y = lateral [-1, 1]
    float lat = vUv.y;
    float s = vUv.x;
    float grit = (hash21(floor(vWorldPos.xz * 22.0)) - 0.5) * 0.025;
    base = vec3(0.088, 0.096, 0.118) + grit;
    // Dual dark tire rubber racing grooves
    float groove = exp(-pow((abs(lat) - 0.36) * 5.0, 2.0));
    base *= (1.0 - groove * 0.22);
    // Crisp solid white edge lines
    if (abs(lat) > 0.87 && abs(lat) < 0.95) {
      base = vec3(0.76, 0.79, 0.84);
      rough = 0.65;
    }
    // Subtle dashed center racing line
    if (abs(lat) < 0.045 && fract(s * 0.45) < 0.46) {
      base = vec3(0.54, 0.58, 0.66);
    }
    // Checkered Start / Finish strip at START_S!
    float ds = abs(s - ${START_S.toFixed(4)});
    if (ds < 0.58 && abs(lat) < 0.90) {
      float cx = floor((s - ${START_S.toFixed(4)} + 0.58) / 0.29);
      float cy = floor((lat + 0.90) * 5.0);
      float chk = mod(cx + cy, 2.0);
      base = mix(vec3(0.04, 0.045, 0.06), vec3(0.92, 0.94, 0.97), chk);
      rough = 0.55;
    } else {
      rough = 0.76;
    }
  } else if (m == 2) {
    // Red & white painted apex curbs (vUv.x = arc-length s)
    float blk = mod(floor(vUv.x * 1.15), 2.0);
    base = mix(vec3(0.76, 0.08, 0.10), vec3(0.86, 0.87, 0.90), blk);
    rough = 0.58;
  } else if (m == 3) {
    // Diorama slate-stone table rim & gantry steel structure
    base = vec3(0.11, 0.13, 0.18);
    rough = 0.45;
  } else if (m == 4) {
    // Pine tree foliage (rich layered miniature evergreen)
    float shade = 0.78 + 0.28 * vExtra;
    base = vec3(0.032, 0.165, 0.085) * shade;
    rough = 0.88;
  } else if (m == 5) {
    // Tree trunks / warm wooden rail trim
    base = vec3(0.18, 0.10, 0.055);
    rough = 0.86;
  } else if (m == 6) {
    // Red/white tire barrier blocks (vExtra = 0 red, 1 white)
    base = mix(vec3(0.76, 0.10, 0.12), vec3(0.84, 0.86, 0.90), step(0.5, vExtra));
    rough = 0.65;
  } else if (m == 7) {
    // Gantry top banner (dark navy + gold accent)
    float chk = mod(floor(vUv.x * 8.0) + floor(vUv.y * 2.0), 2.0);
    base = mix(vec3(0.06, 0.08, 0.14), vec3(0.90, 0.92, 0.96), chk * step(0.25, vUv.y) * step(vUv.y, 0.75));
    rough = 0.42;
  } else if (m == 8) {
    // Glowing stadium floodlamp heads / gantry emerald lights
    base = vec3(0.95, 0.96, 1.0);
    if (vExtra > 0.5) {
      emissive = vec3(0.25, 2.2, 1.4); // green race gantry lights
    } else {
      emissive = vec3(2.4, 2.2, 1.85); // warm stadium floodlamps
    }
    rough = 0.2;
  }

  vec3 sunDir = normalize(vec3(0.42, 0.84, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadowPos, ndl);
  vec3 amb = mix(vec3(0.09, 0.13, 0.23), vec3(0.26, 0.34, 0.52), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(0.70, 0.78, 0.96) * ndl * (0.28 + 0.72 * sh));

  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(56.0, 10.0, rough)) * (1.0 - rough) * 0.42;
  lit += vec3(0.82, 0.88, 1.0) * spec * sh;

  for (int i = 0; i < 8; i++) {
    vec3 lp = uLightsPos[i].xyz;
    float lr = uLightsPos[i].w;
    if (lr <= 0.01) continue;
    vec3 L = lp - vWorldPos;
    float d2 = dot(L, L);
    float d = sqrt(d2);
    if (d < lr) {
      L /= max(d, 0.001);
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.65) / (0.85 + d2 * 0.075);
      float lnd = max(dot(N, L), 0.0);
      lit += base * lnd * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  lit += emissive;
  fragColor = vec4(lit, 1.0);
}
`;

// Sculpted Blender GT Race Cars (sRGB->linear PBR + metallic clearcoat + emissive headlights/brakelights)
const CAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;

uniform mat4 uViewProj;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out vec4 vShadowPos;

void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  vCol = aCol;
  vRough = aRough;
  vShadowPos = uLightVP * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const CAR_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
in vec4 vShadowPos;

uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform vec4 uLightsPos[8];
uniform vec4 uLightsCol[8];

out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0028 * (1.0 - ndl), 0.0011);
  float d = texture(uShadowMap, p.xy).r;
  return (p.z - bias <= d) ? 1.0 : 0.42;
}

void main() {
  if (vRough < 0.0) {
    fragColor = vec4(vCol, 1.0);
    return;
  }

  vec3 albedo = pow(max(vCol, vec3(0.0)), vec3(2.2));
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 sunDir = normalize(vec3(0.45, 0.82, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadowPos, ndl);
  float rough = clamp(vRough, 0.12, 0.94);
  float metallic = smoothstep(0.36, 0.18, rough);

  vec3 H = normalize(sunDir + V);
  float specPow = mix(110.0, 14.0, rough);
  float specStr = mix(0.95, 0.08, rough) * (0.72 + 0.75 * metallic);
  float spec = pow(max(dot(N, H), 0.0), specPow) * specStr;
  vec3 specTint = mix(vec3(1.0), albedo * 1.15 + vec3(0.35), metallic * 0.55);

  // Glossy clearcoat rim highlight so miniature race cars gleam like lacquer die-cast toys!
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * (0.28 + 0.38 * clamp(N.y + 0.35, 0.0, 1.0));
  vec3 amb = mix(vec3(0.09, 0.12, 0.22), vec3(0.28, 0.35, 0.52), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (1.0 - metallic * 0.22) * (amb + vec3(0.66, 0.74, 0.92) * ndl * (0.28 + 0.72 * sh))
           + specTint * vec3(0.92, 0.96, 1.0) * spec * sh
           + specTint * vec3(0.34, 0.52, 0.85) * rim;

  for (int i = 0; i < 8; i++) {
    vec3 lp = uLightsPos[i].xyz;
    float lr = uLightsPos[i].w;
    if (lr <= 0.01) continue;
    vec3 L = lp - vWorldPos;
    float d2 = dot(L, L);
    float d = sqrt(d2);
    if (d < lr) {
      L /= max(d, 0.001);
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.65) / (0.80 + d2 * 0.09);
      float lnd = max(dot(N, L), 0.0);
      vec3 lH = normalize(L + V);
      float lSpec = pow(max(dot(N, lH), 0.0), specPow * 0.75) * specStr * 0.7;
      lit += (albedo * lnd + specTint * lSpec) * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  fragColor = vec4(lit, 1.0);
}
`;

const GLOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec2 aUv;
uniform mat4 uViewProj;
out vec4 vCol;
out vec2 vUv;
void main() { vCol = aCol; vUv = aUv; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec4 vCol;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // Soft radial falloff for billboards/sparks/smoke (vUv in [-1,1]); ribbons pass (0,0) for crisp glow!
  float r = length(vUv);
  float mask = smoothstep(1.0, 0.18, r);
  fragColor = vec4(vCol.rgb, vCol.a * mask);
}
`;

const BLOOM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform int uExtract;
out vec4 fragColor;
void main() {
  if (uExtract == 1) {
    vec3 c = texture(uSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    fragColor = vec4(c * smoothstep(1.28, 2.10, l), 1.0);
    return;
  }
  float w[5] = float[](0.227027, 0.194595, 0.121622, 0.054054, 0.016216);
  vec3 acc = texture(uSrc, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDir * float(i);
    acc += texture(uSrc, vUv + off).rgb * w[i];
    acc += texture(uSrc, vUv - off).rgb * w[i];
  }
  fragColor = vec4(acc, 1.0);
}
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uBloom;
out vec4 fragColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uHdr, vUv).rgb + texture(uBloom, vUv).rgb * 0.55;
  col *= 1.12;
  col = aces(col);
  vec2 d = vUv - 0.5;
  col *= 1.0 - dot(d, d) * 0.24;
  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
`;

// Geometry builders for static stadium diorama
function buildStadiumGeometry() {
  const verts = [];
  const indices = [];
  let vc = 0;

  function pushQuad(p0, p1, p2, p3, n, uv0, uv1, uv2, uv3, mat, extra = 0) {
    const b = vc;
    const pts = [p0, p1, p2, p3];
    const uvs = [uv0, uv1, uv2, uv3];
    for (let i = 0; i < 4; i++) {
      verts.push(pts[i][0], pts[i][1], pts[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1], mat, extra);
    }
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    vc += 4;
  }

  function pushBox(cx, cy, cz, sx, sy, sz, mat, extra = 0) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const u0 = [0, 0], u1 = [1, 0], u2 = [1, 1], u3 = [0, 1];
    pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], u0, u1, u2, u3, mat, extra);
    pushQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], u0, u1, u2, u3, mat, extra);
    pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], u0, u1, u2, u3, mat, extra);
    pushQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], u0, u1, u2, u3, mat, extra);
    pushQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], u0, u1, u2, u3, mat, extra);
    pushQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], u0, u1, u2, u3, mat, extra);
  }

  function pushCone(cx, baseY, cz, radius, height, segs, mat, extra = 0) {
    const tip = [cx, baseY + height, cz];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * radius, baseY, cz + Math.sin(a0) * radius];
      const p1 = [cx + Math.cos(a1) * radius, baseY, cz + Math.sin(a1) * radius];
      const midA = (a0 + a1) * 0.5;
      const ny = radius / Math.hypot(radius, height);
      const nr = height / Math.hypot(radius, height);
      const n = [Math.cos(midA) * nr, ny, Math.sin(midA) * nr];
      const b = vc;
      verts.push(p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, 0, mat, extra);
      verts.push(p1[0], p1[1], p1[2], n[0], n[1], n[2], 1, 0, mat, extra);
      verts.push(tip[0], tip[1], tip[2], n[0], n[1], n[2], 0.5, 1, mat, extra);
      indices.push(b, b + 2, b + 1);
      vc += 3;
    }
  }

  // 1) Diorama base island (grass top at y=0, dark slate pedestal skirt strictly below y=-0.04 -> zero Z-fighting!)
  const BW = 16.4, BD = 21.6;
  pushBox(0, -0.46, 0, BW + 0.5, 0.84, BD + 0.5, 3);
  pushQuad([-BW * 0.5, 0, BD * 0.5], [BW * 0.5, 0, BD * 0.5], [BW * 0.5, 0, -BD * 0.5], [-BW * 0.5, 0, -BD * 0.5], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0);

  // Subtle low diorama perimeter guard-wall
  const wallH = 0.34, wallT = 0.28;
  pushBox(0, wallH * 0.5, -BD * 0.5, BW + wallT, wallH, wallT, 3);
  pushBox(0, wallH * 0.5,  BD * 0.5, BW + wallT, wallH, wallT, 3);
  pushBox(-BW * 0.5, wallH * 0.5, 0, wallT, wallH, BD + wallT, 3);
  pushBox( BW * 0.5, wallH * 0.5, 0, wallT, wallH, BD + wallT, 3);

  // 2) Smooth closed asphalt ribbon + raised red/white apex curbs on both sides!
  const SEGS = 144;
  const roadY = 0.028;
  const curbW = 0.28;
  const curbY = 0.068;
  for (let i = 0; i < SEGS; i++) {
    const s0 = (i / SEGS) * TRACK_LENGTH;
    const s1 = ((i + 1) / SEGS) * TRACK_LENGTH;
    const t0 = sampleTrack(s0);
    const t1 = sampleTrack(s1);

    // Asphalt strip
    const l0 = [t0.x - t0.rx * TRACK_HW, roadY, t0.z - t0.rz * TRACK_HW];
    const r0 = [t0.x + t0.rx * TRACK_HW, roadY, t0.z + t0.rz * TRACK_HW];
    const r1 = [t1.x + t1.rx * TRACK_HW, roadY, t1.z + t1.rz * TRACK_HW];
    const l1 = [t1.x - t1.rx * TRACK_HW, roadY, t1.z - t1.rz * TRACK_HW];
    pushQuad(l0, r0, r1, l1, [0, 1, 0], [s0, -1], [s0, 1], [s1, 1], [s1, -1], 1);

    // Left & Right raised red/white curbs
    for (const side of [-1, 1]) {
      const wIn = TRACK_HW;
      const wOut = TRACK_HW + curbW;
      const c0i = [t0.x + t0.rx * wIn * side, curbY, t0.z + t0.rz * wIn * side];
      const c0o = [t0.x + t0.rx * wOut * side, curbY, t0.z + t0.rz * wOut * side];
      const c1o = [t1.x + t1.rx * wOut * side, curbY, t1.z + t1.rz * wOut * side];
      const c1i = [t1.x + t1.rx * wIn * side, curbY, t1.z + t1.rz * wIn * side];
      if (side > 0) {
        pushQuad(c0i, c0o, c1o, c1i, [0, 1, 0], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 2);
      } else {
        pushQuad(c0o, c0i, c1i, c1o, [0, 1, 0], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 2);
      }
    }
  }

  // 3) Checkered Start/Finish Gantry Arch spanning the West Straight at START_S!
  {
    const st = sampleTrack(START_S);
    const spanHalf = TRACK_HW + 0.56;
    const archH = 2.05;
    // Rotate helper around gantry center (st.x, st.z) aligned to (rx, rz) & (tx, tz)
    const addGantryPart = (lx, ly, lz, sx, sy, sz, mat, extra = 0) => {
      // Build oriented box in gantry local frame (lx along right, ly up, lz along forward)
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const toW = (dx, dy, dz) => [
        st.x + st.rx * (lx + dx) + st.tx * (lz + dz),
        ly + dy,
        st.z + st.rz * (lx + dx) + st.tz * (lz + dz),
      ];
      const nR = [st.rx, 0, st.rz], nL = [-st.rx, 0, -st.rz];
      const nF = [st.tx, 0, st.tz], nB = [-st.tx, 0, -st.tz];
      const u0 = [0, 0], u1 = [1, 0], u2 = [1, 1], u3 = [0, 1];
      pushQuad(toW(-hx, hy, hz), toW(hx, hy, hz), toW(hx, hy, -hz), toW(-hx, hy, -hz), [0, 1, 0], u0, u1, u2, u3, mat, extra);
      pushQuad(toW(-hx, -hy, hz), toW(hx, -hy, hz), toW(hx, hy, hz), toW(-hx, hy, hz), nF, u0, u1, u2, u3, mat, extra);
      pushQuad(toW(hx, -hy, -hz), toW(-hx, -hy, -hz), toW(-hx, hy, -hz), toW(hx, hy, -hz), nB, u0, u1, u2, u3, mat, extra);
      pushQuad(toW(hx, -hy, hz), toW(hx, -hy, -hz), toW(hx, hy, -hz), toW(hx, hy, hz), nR, u0, u1, u2, u3, mat, extra);
      pushQuad(toW(-hx, -hy, -hz), toW(-hx, -hy, hz), toW(-hx, hy, hz), toW(-hx, hy, -hz), nL, u0, u1, u2, u3, mat, extra);
    };
    addGantryPart(-spanHalf, archH * 0.5, 0, 0.28, archH, 0.34, 3);
    addGantryPart( spanHalf, archH * 0.5, 0, 0.28, archH, 0.34, 3);
    addGantryPart(0, archH + 0.22, 0, spanHalf * 2 + 0.45, 0.44, 0.38, 7);
    // 5 glowing green start-light pods along gantry
    for (let k = -2; k <= 2; k++) {
      addGantryPart(k * 0.48, archH - 0.08, 0.16, 0.18, 0.14, 0.14, 8, 1.0);
    }
  }

  // 4) Outer corner Tire Barrier stacks (iconic red/white GP corner walls)
  const barrierS = [
    TRACK_LENGTH * 0.03, TRACK_LENGTH * 0.06, TRACK_LENGTH * 0.09,
    TRACK_LENGTH * 0.46, TRACK_LENGTH * 0.50, TRACK_LENGTH * 0.54,
    TRACK_LENGTH * 0.94, TRACK_LENGTH * 0.97,
  ];
  barrierS.forEach((s, idx) => {
    const t = sampleTrack(s);
    // Place on outer side (sign depends on turn; use outward vector from origin!)
    const dotOut = t.rx * t.x + t.rz * t.z;
    const side = dotOut >= 0 ? 1 : -1;
    const dist = TRACK_HW + 0.62;
    const bx = t.x + t.rx * dist * side;
    const bz = t.z + t.rz * dist * side;
    pushBox(bx, 0.24, bz, 0.48, 0.48, 0.48, 6, idx % 2);
  });

  // 5) Sculpted Miniature Pine Trees (infield cluster + corners, never blocking track visibility!)
  const trees = [
    [-0.8, -2.8, 1.05], [ 1.1, -3.5, 0.90], [-0.4,  2.4, 1.12],
    [ 1.3,  1.6, 0.85], [-1.2,  0.1, 0.95], [ 0.7, -0.4, 0.82],
    [-6.6, -8.6, 1.15], [ 6.6, -8.4, 1.05], [-6.5,  8.6, 1.10],
    [ 6.8,  8.3, 0.98], [ 6.8, -2.5, 0.88], [-6.7,  3.6, 0.92],
  ];
  for (const [tx, tz, sc] of trees) {
    pushBox(tx, 0.22 * sc, tz, 0.18 * sc, 0.44 * sc, 0.18 * sc, 5);
    pushCone(tx, 0.36 * sc, tz, 0.62 * sc, 0.92 * sc, 8, 4, 0.0);
    pushCone(tx, 0.82 * sc, tz, 0.48 * sc, 0.84 * sc, 8, 4, 0.5);
    pushCone(tx, 1.24 * sc, tz, 0.32 * sc, 0.72 * sc, 8, 4, 1.0);
  }

  // 6) 6 Stadium Floodlight Towers with glowing heads
  for (const fl of FLOODLIGHTS) {
    pushBox(fl[0], fl[1] * 0.5, fl[2], 0.16, fl[1], 0.16, 3);
    pushBox(fl[0], fl[1] + 0.15, fl[2], 0.65, 0.28, 0.32, 3);
    pushBox(fl[0], fl[1] + 0.05, fl[2], 0.56, 0.16, 0.36, 8, 0.0);
  }

  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) };
}

// Transform Blender car mesh vertices into world space with per-car livery tint, wheel rotation & brake/boost flares!
function appendCarMesh(outVerts, outIdx, carMesh, opts) {
  const {
    x, y = 0, z, yaw, scale = 0.70,
    livery = [0.1, 0.85, 0.6],
    wheelAngle = 0,
    brakeGlow = 0,
    boostGlow = 0,
    hitFlash = 0,
  } = opts;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cw = Math.cos(wheelAngle), sw = Math.sin(wheelAngle);

  const base = outVerts.length / 10;
  const { count, pos, norm, col, part, rough, idx } = carMesh;

  for (let i = 0; i < count; i++) {
    const p = part[i];
    let lx = pos[i * 3 + 0];
    let ly = pos[i * 3 + 1];
    let lz = pos[i * 3 + 2];
    let nx = norm[i * 3 + 0];
    let ny = norm[i * 3 + 1];
    let nz = norm[i * 3 + 2];

    // Spin front (part 2: Z=+0.62, Y=0.23) & rear (part 3: Z=-0.60, Y=0.25) wheels!
    if (p === 2 || p === 3) {
      const py = p === 2 ? 0.23 : 0.25;
      const pz = p === 2 ? 0.62 : -0.60;
      const dy = ly - py, dz = lz - pz;
      ly = py + dy * cw - dz * sw;
      lz = pz + dy * sw + dz * cw;
      const rny = ny * cw - nz * sw;
      const rnz = ny * sw + nz * cw;
      ny = rny; nz = rnz;
    }

    // Rotate around Y by yaw (+Z forward)
    const wx = x + (lx * cy + lz * sy) * scale;
    const wy = y + ly * scale;
    const wz = z + (-lx * sy + lz * cy) * scale;
    const wnx = nx * cy + nz * sy;
    const wny = ny;
    const wnz = -nx * sy + nz * cy;

    let r = col[i * 3 + 0];
    let g = col[i * 3 + 1];
    let b = col[i * 3 + 2];
    let rg = rough[i];

    if (p === 0) {
      // Paintable GT chassis takes per-car vibrant racing livery!
      r *= livery[0];
      g *= livery[1];
      b *= livery[2];
    } else if (p === 4) {
      // Glowing LED headlights
      r = 2.1; g = 2.05; b = 1.75;
    } else if (p === 5) {
      // Glowing rear taillights — flare blazing crimson when braking / slowed by rubber band!
      const boost = 1.15 + brakeGlow * 2.6;
      r = 1.45 * boost; g = 0.14 * boost; b = 0.10 * boost;
    }

    if (rg >= 0 && hitFlash > 0.01) {
      r = r * (1 - hitFlash * 0.45) + 0.95 * hitFlash * 0.45;
      g = g * (1 - hitFlash * 0.45) + 0.22 * hitFlash * 0.45;
      b = b * (1 - hitFlash * 0.45) + 0.15 * hitFlash * 0.45;
    }

    outVerts.push(wx, wy, wz, wnx, wny, wnz, r, g, b, rg);
  }

  for (let i = 0; i < idx.length; i++) {
    outIdx.push(base + idx[i]);
  }
}

export function createTrackRenderer(gl) {
  const hdr = hdrFormat(gl);
  const carMesh = getCarMesh();

  const [progSky, progSh, progWorld, progCar, progGlow, progBloom, progComp] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [CAR_VS, CAR_FS],
    [GLOW_VS, GLOW_FS],
    [FULL_VS, BLOOM_FS],
    [FULL_VS, COMPOSITE_FS],
  ]);

  const uLoc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const uSh = uLoc(progSh, ["uLightVP"]);
  const uWld = uLoc(progWorld, ["uViewProj", "uLightVP", "uShadowMap", "uCamPos", "uLightsPos", "uLightsCol", "uTime"]);
  const uCar = uLoc(progCar, ["uViewProj", "uLightVP", "uShadowMap", "uCamPos", "uLightsPos", "uLightsCol"]);
  const uGlw = uLoc(progGlow, ["uViewProj"]);
  const uBlm = uLoc(progBloom, ["uSrc", "uDir", "uExtract"]);
  const uCmp = uLoc(progComp, ["uHdr", "uBloom"]);

  const vaoFull = gl.createVertexArray();

  // Static stadium geometry VAO
  const geo = buildStadiumGeometry();
  const vboW = gl.createBuffer(), iboW = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboW); gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboW); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
  const vaoW = gl.createVertexArray();
  gl.bindVertexArray(vaoW);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 32);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  // Dynamic Blender cars VAO
  const vboC = gl.createBuffer(), iboC = gl.createBuffer();
  const vaoC = gl.createVertexArray();
  gl.bindVertexArray(vaoC);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboC); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboC);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  // Additive HDR glow ribbons (rubber bands, nitro flames, sparks, tire smoke — 9 floats/vert: pos3, col4, uv2)
  const vboGlow = gl.createBuffer();
  const vaoGlow = gl.createVertexArray();
  gl.bindVertexArray(vaoGlow);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
  gl.bindVertexArray(null);

  // Shadow map
  const texShadow = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texShadow);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fboShadow = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texShadow, 0);
  gl.drawBuffers([gl.NONE]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const lightView = makeLookAt([9.0, 19.0, 7.5], [0, 0, 0], [0, 1, 0]);
  const lightProj = makeOrtho(-12.5, 12.5, -14.0, 14.0, 2.0, 44.0);
  const lightVP = mulMat4(lightProj, lightView);

  let curW = 0, curH = 0, halfW = 0, halfH = 0;
  let fboScene = null, texHdr = null, rboDepth = null;
  let fboBloomA = null, texBloomA = null, fboBloomB = null, texBloomB = null;

  function ensureTargets(w, h) {
    if (w === curW && h === curH && fboScene) return;
    curW = w; curH = h; halfW = Math.max(8, Math.ceil(w / 2)); halfH = Math.max(8, Math.ceil(h / 2));
    texHdr = makeRenderTex(gl, w, h, hdr.internalFmt, hdr.fmt, hdr.type, gl.LINEAR);
    rboDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rboDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    fboScene = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texHdr, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rboDepth);

    texBloomA = makeRenderTex(gl, halfW, halfH, hdr.internalFmt, hdr.fmt, hdr.type, gl.LINEAR);
    fboBloomA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texBloomA, 0);

    texBloomB = makeRenderTex(gl, halfW, halfH, hdr.internalFmt, hdr.fmt, hdr.type, gl.LINEAR);
    fboBloomB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texBloomB, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const lightsPos = new Float32Array(8 * 4);
  const lightsCol = new Float32Array(8 * 4);

  function render({ w, h, cam, time, cars, rubberBands = [], particles = [] }) {
    ensureTargets(w, h);
    const aspect = w / Math.max(1, h);
    const fovRad = (cam.fovDeg * Math.PI) / 180;
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective(fovRad, aspect, 0.5, 110.0);
    const viewProj = mulMat4(proj, view);

    // Build all dynamic Blender GT cars
    const cVerts = [];
    const cIdx = [];
    for (const c of cars) {
      appendCarMesh(cVerts, cIdx, carMesh, {
        x: c.x,
        y: c.y ?? 0.03,
        z: c.z,
        yaw: c.yaw + (c.spinOffset ?? 0),
        scale: c.scale ?? 0.72,
        livery: c.livery,
        wheelAngle: c.wheelAngle ?? 0,
        brakeGlow: c.brakeGlow ?? 0,
        boostGlow: c.boostGlow ?? 0,
        hitFlash: c.hitFlash ?? 0,
      });
    }
    const cVArr = new Float32Array(cVerts);
    const cIArr = new Uint32Array(cIdx);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboC); gl.bufferData(gl.ARRAY_BUFFER, cVArr, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboC); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cIArr, gl.DYNAMIC_DRAW);

    // Update 8 HDR lights (6 stadium floodlights + player emerald aura + band tension highlight)
    for (let i = 0; i < 6; i++) {
      const fl = FLOODLIGHTS[i];
      lightsPos[i * 4 + 0] = fl[0]; lightsPos[i * 4 + 1] = fl[1]; lightsPos[i * 4 + 2] = fl[2]; lightsPos[i * 4 + 3] = 15.0;
      lightsCol[i * 4 + 0] = 1.35; lightsCol[i * 4 + 1] = 1.24; lightsCol[i * 4 + 2] = 1.05; lightsCol[i * 4 + 3] = 1.45;
    }
    const pCar = cars[0];
    if (pCar) {
      lightsPos[24] = pCar.x; lightsPos[25] = 1.4; lightsPos[26] = pCar.z; lightsPos[27] = 5.5;
      lightsCol[24] = 0.20; lightsCol[25] = 1.45; lightsCol[26] = 1.15; lightsCol[27] = 1.15;
    }
    // 8th light follows strongest active rubber band midpoint!
    let topBand = null;
    for (const rb of rubberBands) {
      if (!topBand || Math.abs(rb.tension) > Math.abs(topBand.tension)) topBand = rb;
    }
    if (topBand && topBand.alpha > 0.05) {
      const mx = (topBand.x0 + topBand.x1) * 0.5;
      const mz = (topBand.z0 + topBand.z1) * 0.5;
      lightsPos[28] = mx; lightsPos[29] = 1.8; lightsPos[30] = mz; lightsPos[31] = 7.5;
      if (topBand.mode === "boost") {
        lightsCol[28] = 2.1; lightsCol[29] = 1.15; lightsCol[30] = 0.20; lightsCol[31] = 1.65 * topBand.alpha;
      } else {
        lightsCol[28] = 0.25; lightsCol[29] = 1.55; lightsCol[30] = 2.25; lightsCol[31] = 1.65 * topBand.alpha;
      }
    } else {
      lightsPos[31] = 0; lightsCol[31] = 0;
    }

    // 1) Shadow Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    gl.useProgram(progSh);
    gl.uniformMatrix4fv(uSh.uLightVP, false, lightVP);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(vaoC);
    gl.drawElements(gl.TRIANGLES, cIArr.length, gl.UNSIGNED_INT, 0);

    // 2) HDR Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progSky);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texShadow);

    // Static stadium
    gl.useProgram(progWorld);
    gl.uniformMatrix4fv(uWld.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uWld.uLightVP, false, lightVP);
    gl.uniform1i(uWld.uShadowMap, 0);
    gl.uniform3fv(uWld.uCamPos, basis.pos);
    gl.uniform4fv(uWld.uLightsPos, lightsPos);
    gl.uniform4fv(uWld.uLightsCol, lightsCol);
    gl.uniform1f(uWld.uTime, time);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);

    // Blender cars
    gl.useProgram(progCar);
    gl.uniformMatrix4fv(uCar.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uCar.uLightVP, false, lightVP);
    gl.uniform1i(uCar.uShadowMap, 0);
    gl.uniform3fv(uCar.uCamPos, basis.pos);
    gl.uniform4fv(uCar.uLightsPos, lightsPos);
    gl.uniform4fv(uCar.uLightsCol, lightsCol);
    gl.bindVertexArray(vaoC);
    gl.drawElements(gl.TRIANGLES, cIArr.length, gl.UNSIGNED_INT, 0);

    // 3) Additive HDR Glow Pass: Literal 3D Elastic Rubber Bands, Nitro Flames, Car Under-Rings, Sparks & Stadium Motes!
    const gVerts = [];
    const pushGlowQuad = (p0, p1, p2, p3, r, g, b, a, u0 = [0, 0], u1 = [0, 0], u2 = [0, 0], u3 = [0, 0]) => {
      gVerts.push(
        p0[0], p0[1], p0[2], r, g, b, a, u0[0], u0[1],
        p1[0], p1[1], p1[2], r, g, b, a, u1[0], u1[1],
        p2[0], p2[1], p2[2], r, g, b, a, u2[0], u2[1],
        p0[0], p0[1], p0[2], r, g, b, a, u0[0], u0[1],
        p2[0], p2[1], p2[2], r, g, b, a, u2[0], u2[1],
        p3[0], p3[1], p3[2], r, g, b, a, u3[0], u3[1]
      );
    };
    const pushRing = (cx, cy, cz, rIn, rOut, r, g, b, a, segs = 28) => {
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        pushGlowQuad(
          [cx + c0 * rIn, cy, cz + s0 * rIn],
          [cx + c0 * rOut, cy, cz + s0 * rOut],
          [cx + c1 * rOut, cy, cz + s1 * rOut],
          [cx + c1 * rIn, cy, cz + s1 * rIn],
          r, g, b, a
        );
      }
    };
    const pushBillboard = (x, y, z, sz, r, g, b, a) => {
      const rx = basis.right[0] * sz, ry = basis.right[1] * sz, rz = basis.right[2] * sz;
      const ux = basis.up[0] * sz, uy = basis.up[1] * sz, uz = basis.up[2] * sz;
      pushGlowQuad(
        [x - rx - ux, y - ry - uy, z - rz - uz],
        [x + rx - ux, y + ry - uy, z + rz - uz],
        [x + rx + ux, y + ry + uy, z + rz + uz],
        [x - rx + ux, y - ry + uy, z - rz + uz],
        r, g, b, a,
        [-1, -1], [1, -1], [1, 1], [-1, 1]
      );
    };

    // Subtle crisp under-glow ring on Player + Nitro Flames on boosted AI cars!
    for (const c of cars) {
      if (c.isPlayer) {
        pushRing(c.x, 0.055, c.z, 0.88, 1.02, 0.16, 1.45, 1.05, 0.72, 32);
      }
      if ((c.boostGlow ?? 0) > 0.05) {
        const bg = c.boostGlow;
        const yaw = c.yaw + (c.spinOffset ?? 0);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = -fz, rz = fx;
        const flLen = (0.75 + 0.55 * bg + 0.20 * Math.sin(time * 42 + c.id * 3)) * (c.scale ?? 0.72);
        // Twin nitro jet plumes from rear exhaust pipes!
        for (const side of [-0.18, 0.18]) {
          const sx = c.x - fx * 0.82 * (c.scale ?? 0.72) + rx * side;
          const sz = c.z - fz * 0.82 * (c.scale ?? 0.72) + rz * side;
          const ex = sx - fx * flLen;
          const ez = sz - fz * flLen;
          const w0 = 0.13 * bg;
          pushGlowQuad(
            [sx - rx * w0, 0.22, sz - rz * w0],
            [sx + rx * w0, 0.22, sz + rz * w0],
            [ex + rx * 0.02, 0.20, ez + rz * 0.02],
            [ex - rx * 0.02, 0.20, ez - rz * 0.02],
            2.6 * bg, 1.35 * bg, 0.22 * bg, 0.90
          );
          pushBillboard(sx - fx * flLen * 0.35, 0.23, sz - fz * flLen * 0.35, 0.24 * bg, 2.5, 1.65, 0.40, 0.65 * bg);
        }
      }
      if ((c.brakeGlow ?? 0) > 0.15) {
        const bk = c.brakeGlow;
        const yaw = c.yaw + (c.spinOffset ?? 0);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const bx = c.x - fx * 0.82 * (c.scale ?? 0.72);
        const bz = c.z - fz * 0.82 * (c.scale ?? 0.72);
        pushBillboard(bx, 0.30, bz, 0.42 * bk, 2.4, 0.22, 0.18, 0.55 * bk);
      }
    }

    // LITERAL 3D GLOWING ELASTIC RUBBER BANDS!
    for (const rb of rubberBands) {
      if (rb.alpha <= 0.02) continue;
      const tension = Math.abs(rb.tension); // 0..1
      const isBoost = rb.mode === "boost"; // pulling AI faster (amber/orange) vs holding AI back (cyan/blue)
      const colCore = isBoost
        ? [2.65, 1.48 - tension * 0.55, 0.18]   // blazing golden-amber -> fiery orange under high tension
        : [0.18, 1.75, 2.65];                   // vivid electric cyan brake-tether
      const colHalo = isBoost
        ? [1.85, 0.68, 0.08]
        : [0.10, 0.95, 1.95];

      const dx = rb.x1 - rb.x0;
      const dz = rb.z1 - rb.z0;
      const dist = Math.hypot(dx, dz) || 0.001;
      const perpX = -dz / dist;
      const perpZ = dx / dist;

      // Two parallel elastic strands (like an actual doubled rubber band looped between the two cars!)
      const segs = 28;
      const vibAmp = (0.03 + 0.09 * tension) * rb.alpha;
      const vibFreq = 26 + tension * 28;
      const archH = 0.58 + 0.35 * (1.0 - tension) + Math.min(0.65, dist * 0.06);

      for (const strand of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const env = Math.sin(u * Math.PI);
          // Slight rubber-band separation between the two loops + taut guitar-string vibration!
          const sep = strand * (0.06 + 0.12 * (1.0 - tension * 0.7)) * env;
          const vib = Math.sin(time * vibFreq + u * Math.PI * 3 + strand * 1.4) * vibAmp * env;
          const px = rb.x0 + dx * u + perpX * (sep + vib);
          const pz = rb.z0 + dz * u + perpZ * (sep + vib);
          const py = 0.42 + archH * env + Math.cos(time * vibFreq * 0.7 + u * 6.0) * vibAmp * 0.4 * env;
          pts.push([px, py, pz]);
        }

        // Draw crisp glowing core ribbon + soft wide outer bloom halo (clean contrast without washing out car paint!)
        for (const [halfW, col, alphaMul] of [
          [0.038 + 0.024 * tension, colCore, 0.88],
          [0.095 + 0.042 * tension, colHalo, 0.24],
        ]) {
          for (let i = 0; i < segs; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const ox = perpX * halfW, oz = perpZ * halfW;
            const a = rb.alpha * alphaMul;
            pushGlowQuad(
              [p0[0] - ox, p0[1], p0[2] - oz],
              [p0[0] + ox, p0[1], p0[2] + oz],
              [p1[0] + ox, p1[1], p1[2] + oz],
              [p1[0] - ox, p1[1], p1[2] - oz],
              col[0], col[1], col[2], a
            );
          }
        }
      }

      // Animated energy pulse beads zipping along the band in the direction of force!
      for (let b = 0; b < 3; b++) {
        const u = ((b / 3) + (isBoost ? -time * (1.1 + tension) : -time * (0.9 + tension)) + 100) % 1;
        const env = Math.sin(u * Math.PI);
        const bx = rb.x0 + dx * u;
        const bz = rb.z0 + dz * u;
        const by = 0.42 + archH * env;
        pushBillboard(bx, by, bz, 0.16 + 0.06 * tension, colCore[0] * 1.15, colCore[1] * 1.15, colCore[2] * 1.15, rb.alpha * 0.85 * env);
      }

      // Crisp anchor glow knots at car attachment points
      pushBillboard(rb.x0, 0.36, rb.z0, 0.15, colCore[0], colCore[1], colCore[2], rb.alpha * 0.42);
      pushBillboard(rb.x1, 0.36, rb.z1, 0.15, colCore[0], colCore[1], colCore[2], rb.alpha * 0.55);
    }

    // Dynamic particles (crash sparks, tire smoke, speed sparks)
    for (const pt of particles) {
      pushBillboard(pt.x, pt.y, pt.z, pt.size, pt.r, pt.g, pt.b, pt.a);
    }

    // 28 subtle rising stadium light motes (guarantees rich atmospheric life & 0.00% duplicate frames!)
    for (let i = 0; i < 28; i++) {
      const seed = i * 19.37;
      const frac = (time * (0.14 + (i % 4) * 0.035) + seed * 0.13) % 1.0;
      const ex = Math.sin(seed * 2.1 + time * 0.45) * 6.8;
      const ez = Math.cos(seed * 1.7 + time * 0.35) * 9.0;
      const ey = 0.4 + frac * 5.2;
      const alpha = Math.sin(frac * Math.PI) * 0.48;
      pushBillboard(ex, ey, ez, 0.085, 1.55, 1.35, 0.85, alpha);
    }

    if (gVerts.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(progGlow);
      gl.uniformMatrix4fv(uGlw.uViewProj, false, viewProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gVerts), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(vaoGlow);
      gl.drawArrays(gl.TRIANGLES, 0, gVerts.length / 9);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // 4) Separable Bloom Pass
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progBloom);
    gl.bindVertexArray(vaoFull);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomA);
    gl.viewport(0, 0, halfW, halfH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHdr);
    gl.uniform1i(uBlm.uSrc, 0);
    gl.uniform1i(uBlm.uExtract, 1);
    gl.uniform2f(uBlm.uDir, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomB);
    gl.bindTexture(gl.TEXTURE_2D, texBloomA);
    gl.uniform1i(uBlm.uExtract, 0);
    gl.uniform2f(uBlm.uDir, 1.4 / halfW, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomA);
    gl.bindTexture(gl.TEXTURE_2D, texBloomB);
    gl.uniform2f(uBlm.uDir, 0, 1.4 / halfH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 5) Composite + ACES
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(progComp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHdr);
    gl.uniform1i(uCmp.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texBloomA);
    gl.uniform1i(uCmp.uBloom, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return { viewProj, basis };
  }

  return { render };
}

export function projectPoint(worldPos, viewProj, w, h) {
  const x = worldPos[0], y = worldPos[1], z = worldPos[2];
  const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
  const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
  const cz = viewProj[2] * x + viewProj[6] * y + viewProj[10] * z + viewProj[14];
  const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
  if (cw <= 0.001) return null;
  const ndcX = cx / cw, ndcY = cy / cw, ndcZ = cz / cw;
  return { x: (ndcX * 0.5 + 0.5) * w, y: (1 - (ndcY * 0.5 + 0.5)) * h, z: ndcZ };
}
