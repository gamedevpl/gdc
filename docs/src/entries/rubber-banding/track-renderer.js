// 3D Figure-8 Overpass Bridge GP Racetrack WebGL2 Renderer for Game Design Codex (/gdc/rubber-banding/).
// Sculpted Blender GT cars with real 3D ramp pitch, solid concrete overpass bridge + piers + safety rails,
// 1024x1024 PCF shadows (bridge casts shadow onto lower underpass!), 8 HDR lights, glowing 3D elastic rubber bands.
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
export const TRACK_HW = 1.92;
export const BRIDGE_HEIGHT = 2.85;

// Smooth Wide-Lobed 3D Figure-8 Overpass Circuit!
// a = 0 (u=0): HIGH OVERPASS BRIDGE (y = 2.88) crossing cleanly OVER the ground underpass at a = PI (y = 0.03)!
const RAW_SAMPLES = 640;
const RAMP_A = 0.24 * Math.PI;

function rawPoint3D(u) {
  const a = u * Math.PI * 2;
  const x = 17.4 * Math.sin(a);
  const z = 9.2 * Math.sin(2 * a);
  let da = a;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const ad = Math.abs(da);
  const y = ad < RAMP_A
    ? 0.03 + BRIDGE_HEIGHT * 0.5 * (1.0 + Math.cos((ad / RAMP_A) * Math.PI))
    : 0.03;
  return [x, y, z];
}

// Arc-length reparameterization LUT in full 3D!
const lutX = new Float32Array(RAW_SAMPLES + 1);
const lutY = new Float32Array(RAW_SAMPLES + 1);
const lutZ = new Float32Array(RAW_SAMPLES + 1);
const lutS = new Float32Array(RAW_SAMPLES + 1);
{
  let acc = 0;
  let [px, py, pz] = rawPoint3D(0);
  lutX[0] = px; lutY[0] = py; lutZ[0] = pz; lutS[0] = 0;
  for (let i = 1; i <= RAW_SAMPLES; i++) {
    const [nx, ny, nz] = rawPoint3D(i / RAW_SAMPLES);
    acc += Math.hypot(nx - px, ny - py, nz - pz);
    lutX[i] = nx; lutY[i] = ny; lutZ[i] = nz; lutS[i] = acc;
    px = nx; py = ny; pz = nz;
  }
}
export const TRACK_LENGTH = lutS[RAW_SAMPLES];

function samplePosOnly(s) {
  let lo = 0, hi = RAW_SAMPLES;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lutS[mid] <= s) lo = mid; else hi = mid;
  }
  const span = Math.max(1e-6, lutS[hi] - lutS[lo]);
  const f = (s - lutS[lo]) / span;
  return [
    lutX[lo] + (lutX[hi] - lutX[lo]) * f,
    lutY[lo] + (lutY[hi] - lutY[lo]) * f,
    lutZ[lo] + (lutZ[hi] - lutZ[lo]) * f,
  ];
}

// Sample 3D track position, forward tangent (tx, ty, tz), flat horizontal right (rx, rz), heading yaw & ramp pitch!
export function sampleTrack(sRaw) {
  let s = sRaw % TRACK_LENGTH;
  if (s < 0) s += TRACK_LENGTH;
  const [x, y, z] = samplePosOnly(s);

  const ds = 0.40;
  let s0 = s - ds; if (s0 < 0) s0 += TRACK_LENGTH;
  let s1 = s + ds; if (s1 >= TRACK_LENGTH) s1 -= TRACK_LENGTH;
  const p0 = samplePosOnly(s0);
  const p1 = samplePosOnly(s1);
  let tx = p1[0] - p0[0];
  let ty = p1[1] - p0[1];
  let tz = p1[2] - p0[2];
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;

  const hLen = Math.hypot(tx, tz) || 1;
  const hx = tx / hLen, hz = tz / hLen;
  // Right vector in XZ plane: cross((hx,0,hz), (0,1,0)) = (-hz, 0, hx)
  const rx = -hz;
  const rz = hx;
  const yaw = Math.atan2(hx, hz);
  const pitch = Math.atan2(ty, hLen);
  return { x, y, z, tx, ty, tz, rx, rz, yaw, pitch, s };
}

// Start/Finish Checkered Gantry on the crisp flat approach straight aiming right up the Overpass Bridge ramp!
export const START_S = TRACK_LENGTH * 0.855;

// 6 Tall Stadium Floodlight Towers framing the wide Figure-8 stadium
export const FLOODLIGHTS = [
  [-18.8, 7.2, -11.4],
  [  0.0, 7.8, -12.6],
  [ 18.8, 7.2, -11.4],
  [-18.8, 7.2,  11.4],
  [  0.0, 7.8,  12.6],
  [ 18.8, 7.2,  11.4],
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
  float bias = max(0.0026 * (1.0 - ndl), 0.0010);
  vec2 texel = vec2(1.0 / float(${SHADOW_RES}));
  float acc = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
      acc += (p.z - bias <= d) ? 1.0 : 0.0;
    }
  }
  return mix(0.28, 1.0, acc / 9.0);
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 base = vec3(0.2);
  float rough = 0.85;
  vec3 emissive = vec3(0.0);

  int m = int(vMat + 0.5);
  if (m == 0) {
    // Lush mowed stadium turf
    float stripe = step(0.5, fract((vWorldPos.x * 0.34 + vWorldPos.z * 0.16)));
    float grain = hash21(floor(vWorldPos.xz * 8.0)) * 0.04;
    vec3 gA = vec3(0.062, 0.240, 0.102);
    vec3 gB = vec3(0.085, 0.300, 0.125);
    base = mix(gA, gB, stripe) + vec3(grain * 0.4, grain, grain * 0.3);
    float edge = max(abs(vWorldPos.x) / 21.8, abs(vWorldPos.z) / 14.4);
    base *= mix(1.0, 0.72, smoothstep(0.84, 1.0, edge));
    rough = 0.92;
  } else if (m == 1) {
    // Crisp dark GP asphalt (vUv.x = s, vUv.y = lateral [-1, 1])
    float lat = vUv.y;
    float s = vUv.x;
    float grit = (hash21(floor(vWorldPos.xz * 20.0)) - 0.5) * 0.024;
    base = vec3(0.088, 0.096, 0.118) + grit;
    // Slight lighter deck tint on elevated bridge so overpass pops against underpass!
    if (vWorldPos.y > 0.4) base += vec3(0.014, 0.018, 0.026) * clamp(vWorldPos.y / 2.8, 0.0, 1.0);
    float groove = exp(-pow((abs(lat) - 0.36) * 5.0, 2.0));
    base *= (1.0 - groove * 0.22);
    if (abs(lat) > 0.87 && abs(lat) < 0.95) {
      base = vec3(0.76, 0.79, 0.84);
      rough = 0.65;
    }
    if (abs(lat) < 0.045 && fract(s * 0.40) < 0.46) {
      base = vec3(0.56, 0.60, 0.68);
    }
    // Checkered Start / Finish strip at START_S!
    float ds = abs(s - ${START_S.toFixed(4)});
    if (ds < 0.68 && abs(lat) < 0.90) {
      float cx = floor((s - ${START_S.toFixed(4)} + 0.68) / 0.34);
      float cy = floor((lat + 0.90) * 5.0);
      float chk = mod(cx + cy, 2.0);
      base = mix(vec3(0.04, 0.045, 0.06), vec3(0.92, 0.94, 0.97), chk);
      rough = 0.55;
    } else {
      rough = 0.76;
    }
  } else if (m == 2) {
    // Red & white apex curbs
    float blk = mod(floor(vUv.x * 1.05), 2.0);
    base = mix(vec3(0.76, 0.08, 0.10), vec3(0.86, 0.87, 0.90), blk);
    rough = 0.58;
  } else if (m == 3) {
    // Diorama slate-stone pedestal, gantry steel, bridge concrete deck & piers
    base = vec3(0.14, 0.16, 0.22);
    rough = 0.52;
  } else if (m == 4) {
    // Pine tree foliage
    float shade = 0.78 + 0.28 * vExtra;
    base = vec3(0.032, 0.165, 0.085) * shade;
    rough = 0.88;
  } else if (m == 5) {
    // Tree trunks
    base = vec3(0.18, 0.10, 0.055);
    rough = 0.86;
  } else if (m == 6) {
    // Red/white tire barrier blocks
    base = mix(vec3(0.76, 0.10, 0.12), vec3(0.84, 0.86, 0.90), step(0.5, vExtra));
    rough = 0.65;
  } else if (m == 7) {
    // Gantry top checkered banner
    float chk = mod(floor(vUv.x * 8.0) + floor(vUv.y * 2.0), 2.0);
    base = mix(vec3(0.06, 0.08, 0.14), vec3(0.90, 0.92, 0.96), chk * step(0.25, vUv.y) * step(vUv.y, 0.75));
    rough = 0.42;
  } else if (m == 8) {
    // Emissive stadium floodlamps / green gantry lights / bridge amber safety chevrons!
    base = vec3(0.95, 0.96, 1.0);
    if (vExtra > 1.5) {
      emissive = vec3(2.2, 1.25, 0.18); // warm amber bridge edge guide strip!
    } else if (vExtra > 0.5) {
      emissive = vec3(0.25, 2.2, 1.4);  // green race gantry lights
    } else {
      emissive = vec3(2.4, 2.2, 1.85);  // stadium floodlamps
    }
    rough = 0.2;
  } else if (m == 9) {
    // Crisp concrete/white bridge guardrails with racing red/white warning stripes
    float blk = mod(floor(vUv.x * 0.8), 2.0);
    base = mix(vec3(0.68, 0.72, 0.78), vec3(0.82, 0.85, 0.90), blk);
    rough = 0.48;
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
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.65) / (0.85 + d2 * 0.06);
      float lnd = max(dot(N, L), 0.0);
      lit += base * lnd * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  lit += emissive;
  fragColor = vec4(lit, 1.0);
}
`;

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
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.65) / (0.80 + d2 * 0.07);
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

// Build static 3D Figure-8 Overpass Stadium Geometry!
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

  function quadNormal(p0, p1, p2) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
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

  // 1) Wide Figure-8 Stadium Diorama Base (grass at y=0, slate pedestal strictly below y=-0.04)
  const BW = 43.2, BD = 28.4;
  pushBox(0, -0.56, 0, BW + 0.8, 1.04, BD + 0.8, 3);
  pushQuad([-BW * 0.5, 0, BD * 0.5], [BW * 0.5, 0, BD * 0.5], [BW * 0.5, 0, -BD * 0.5], [-BW * 0.5, 0, -BD * 0.5], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0);

  const wallH = 0.52, wallT = 0.40;
  pushBox(0, wallH * 0.5, -BD * 0.5, BW + wallT, wallH, wallT, 3);
  pushBox(0, wallH * 0.5,  BD * 0.5, BW + wallT, wallH, wallT, 3);
  pushBox(-BW * 0.5, wallH * 0.5, 0, wallT, wallH, BD + wallT, 3);
  pushBox( BW * 0.5, wallH * 0.5, 0, wallT, wallH, BD + wallT, 3);

  // 2) Full 3D Figure-8 Road Ribbon + Red/White Curbs + Elevated Overpass Bridge Slab & Safety Guardrails!
  const SEGS = 240;
  const curbW = 0.34;
  const slabThick = 0.38;
  const railH = 0.44;
  const railW = 0.16;

  for (let i = 0; i < SEGS; i++) {
    const s0 = (i / SEGS) * TRACK_LENGTH;
    const s1 = ((i + 1) / SEGS) * TRACK_LENGTH;
    const t0 = sampleTrack(s0);
    const t1 = sampleTrack(s1);

    // Asphalt surface (tilted smoothly along ramp!)
    const l0 = [t0.x - t0.rx * TRACK_HW, t0.y, t0.z - t0.rz * TRACK_HW];
    const r0 = [t0.x + t0.rx * TRACK_HW, t0.y, t0.z + t0.rz * TRACK_HW];
    const r1 = [t1.x + t1.rx * TRACK_HW, t1.y, t1.z + t1.rz * TRACK_HW];
    const l1 = [t1.x - t1.rx * TRACK_HW, t1.y, t1.z - t1.rz * TRACK_HW];
    const nRoad = quadNormal(l0, r0, r1);
    const nUp = nRoad[1] >= 0 ? nRoad : [-nRoad[0], -nRoad[1], -nRoad[2]];
    pushQuad(l0, r0, r1, l1, nUp, [s0, -1], [s0, 1], [s1, 1], [s1, -1], 1);

    const elevated = t0.y > 0.10 || t1.y > 0.10;

    // Red/white curbs on both edges
    for (const side of [-1, 1]) {
      const wIn = TRACK_HW;
      const wOut = TRACK_HW + curbW;
      const cy0 = t0.y + 0.04;
      const cy1 = t1.y + 0.04;
      const c0i = [t0.x + t0.rx * wIn * side, cy0, t0.z + t0.rz * wIn * side];
      const c0o = [t0.x + t0.rx * wOut * side, cy0, t0.z + t0.rz * wOut * side];
      const c1o = [t1.x + t1.rx * wOut * side, cy1, t1.z + t1.rz * wOut * side];
      const c1i = [t1.x + t1.rx * wIn * side, cy1, t1.z + t1.rz * wIn * side];
      if (side > 0) pushQuad(c0i, c0o, c1o, c1i, nUp, [s0, 0], [s0, 1], [s1, 1], [s1, 0], 2);
      else pushQuad(c0o, c0i, c1i, c1o, nUp, [s0, 0], [s0, 1], [s1, 1], [s1, 0], 2);
    }

    // Solid 3D Overpass Bridge Structure wherever deck rises above ground!
    if (elevated) {
      const wB = TRACK_HW + curbW;
      const yBot0 = Math.max(0.0, t0.y - slabThick);
      const yBot1 = Math.max(0.0, t1.y - slabThick);
      const bl0 = [t0.x - t0.rx * wB, yBot0, t0.z - t0.rz * wB];
      const br0 = [t0.x + t0.rx * wB, yBot0, t0.z + t0.rz * wB];
      const br1 = [t1.x + t1.rx * wB, yBot1, t1.z + t1.rz * wB];
      const bl1 = [t1.x - t1.rx * wB, yBot1, t1.z - t1.rz * wB];
      // Bridge underside (casts crisp shadow on lower underpass!)
      pushQuad(bl0, bl1, br1, br0, [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 3);
      // Left & right structural side skirts
      const tl0 = [t0.x - t0.rx * wB, t0.y + 0.04, t0.z - t0.rz * wB];
      const tr0 = [t0.x + t0.rx * wB, t0.y + 0.04, t0.z + t0.rz * wB];
      const tr1 = [t1.x + t1.rx * wB, t1.y + 0.04, t1.z + t1.rz * wB];
      const tl1 = [t1.x - t1.rx * wB, t1.y + 0.04, t1.z - t1.rz * wB];
      pushQuad(tr0, br0, br1, tr1, [t0.rx, 0, t0.rz], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 3);
      pushQuad(tl1, bl1, bl0, tl0, [-t0.rx, 0, -t0.rz], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 3);

      // Raised concrete safety guardrails + glowing amber bridge edge guides!
      for (const side of [-1, 1]) {
        const wi = wB;
        const wo = wB + railW;
        const p0iB = [t0.x + t0.rx * wi * side, t0.y, t0.z + t0.rz * wi * side];
        const p1iB = [t1.x + t1.rx * wi * side, t1.y, t1.z + t1.rz * wi * side];
        const p0iT = [t0.x + t0.rx * wi * side, t0.y + railH, t0.z + t0.rz * wi * side];
        const p1iT = [t1.x + t1.rx * wi * side, t1.y + railH, t1.z + t1.rz * wi * side];
        const p0oT = [t0.x + t0.rx * wo * side, t0.y + railH, t0.z + t0.rz * wo * side];
        const p1oT = [t1.x + t1.rx * wo * side, t1.y + railH, t1.z + t1.rz * wo * side];
        const p0oB = [t0.x + t0.rx * wo * side, yBot0, t0.z + t0.rz * wo * side];
        const p1oB = [t1.x + t1.rx * wo * side, yBot1, t1.z + t1.rz * wo * side];
        // Top cap + inner wall + outer wall
        pushQuad(p0iT, p0oT, p1oT, p1iT, nUp, [s0, 0], [s0, 1], [s1, 1], [s1, 0], 9);
        pushQuad(p0iB, p0iT, p1iT, p1iB, [-t0.rx * side, 0, -t0.rz * side], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 9);
        pushQuad(p0oT, p0oB, p1oB, p1oT, [t0.rx * side, 0, t0.rz * side], [s0, 0], [s0, 1], [s1, 1], [s1, 0], 9);
        // Thin glowing amber LED guide rail along bridge peak!
        if (t0.y > 0.7 && t1.y > 0.7 && i % 2 === 0) {
          const g0 = [t0.x + t0.rx * (wi - 0.02) * side, t0.y + railH - 0.12, t0.z + t0.rz * (wi - 0.02) * side];
          const g1 = [t1.x + t1.rx * (wi - 0.02) * side, t1.y + railH - 0.12, t1.z + t1.rz * (wi - 0.02) * side];
          const g0u = [g0[0], g0[1] + 0.08, g0[2]];
          const g1u = [g1[0], g1[1] + 0.08, g1[2]];
          pushQuad(g0, g0u, g1u, g1, [-t0.rx * side, 0, -t0.rz * side], [0, 0], [0, 1], [1, 1], [1, 0], 8, 2.0);
        }
      }
    }
  }

  // 3) 4 Chunky Concrete Bridge Support Pillars flanking the Underpass Tunnel cleanly outside the lower tarmac!
  for (const sOff of [-3.9, 3.9, -9.2, 9.2]) {
    const bt = sampleTrack(sOff < 0 ? TRACK_LENGTH + sOff : sOff);
    const pierH = Math.max(0.2, bt.y - slabThick + 0.08);
    if (pierH < 0.35) continue;
    for (const side of [-1, 1]) {
      const px = bt.x + bt.rx * (TRACK_HW + 0.08) * side;
      const pz = bt.z + bt.rz * (TRACK_HW + 0.08) * side;
      pushBox(px, pierH * 0.5, pz, 0.56, pierH, 0.56, 3);
    }
  }

  // 4) Checkered Start/Finish Gantry Arch on the flat approach straight aiming right at the Overpass Bridge!
  {
    const st = sampleTrack(START_S);
    const spanHalf = TRACK_HW + 0.62;
    const archH = 2.45;
    const addGantryPart = (lx, ly, lz, sx, sy, sz, mat, extra = 0) => {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const toW = (dx, dy, dz) => [
        st.x + st.rx * (lx + dx) + st.tx * (lz + dz),
        st.y + ly + dy,
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
    addGantryPart(-spanHalf, archH * 0.5, 0, 0.34, archH, 0.40, 3);
    addGantryPart( spanHalf, archH * 0.5, 0, 0.34, archH, 0.40, 3);
    addGantryPart(0, archH + 0.24, 0, spanHalf * 2 + 0.55, 0.48, 0.44, 7);
    for (let k = -2; k <= 2; k++) {
      addGantryPart(k * 0.58, archH - 0.08, 0.20, 0.22, 0.16, 0.16, 8, 1.0);
    }
  }

  // 5) Tire Barrier Stacks at both wide East & West Figure-8 hairpins!
  for (const frac of [0.21, 0.23, 0.25, 0.27, 0.29, 0.71, 0.73, 0.75, 0.77, 0.79]) {
    const t = sampleTrack(TRACK_LENGTH * frac);
    const side = (t.rx * t.x + t.rz * t.z) >= 0 ? 1 : -1;
    const dist = TRACK_HW + 0.78;
    pushBox(t.x + t.rx * dist * side, 0.30, t.z + t.rz * dist * side, 0.60, 0.60, 0.60, 6, Math.round(frac * 100) % 2);
  }

  // 6) Lush Pine Groves inside the two Figure-8 lobes + stadium corners (checked safely far from asphalt!)
  const trees = [
    // East lobe infield
    [ 10.6,  0.0, 1.55], [ 12.2,  2.2, 1.25], [ 12.2, -2.2, 1.28], [ 8.8,  1.8, 1.15], [ 8.8, -1.8, 1.20],
    // West lobe infield
    [-10.6,  0.0, 1.50], [-12.2,  2.2, 1.22], [-12.2, -2.2, 1.30], [-8.8,  1.8, 1.18], [-8.8, -1.8, 1.15],
    // North & South central meadows (clear of crossing!)
    [  0.0, -9.8, 1.48], [ -2.8, -11.4, 1.22], [  2.8, -11.4, 1.25],
    [  0.0,  9.8, 1.45], [ -2.8,  11.4, 1.20], [  2.8,  11.4, 1.28],
    // Stadium outer corners
    [-19.2, -11.8, 1.55], [ 19.2, -11.8, 1.50], [-19.2, 11.8, 1.48], [ 19.2, 11.8, 1.52],
    [-19.8,  -5.5, 1.25], [ 19.8,  -5.5, 1.22], [-19.8,  5.5, 1.28], [ 19.8,  5.5, 1.25],
  ];
  for (const [tx, tz, sc] of trees) {
    pushBox(tx, 0.24 * sc, tz, 0.22 * sc, 0.48 * sc, 0.22 * sc, 5);
    pushCone(tx, 0.40 * sc, tz, 0.72 * sc, 1.04 * sc, 8, 4, 0.0);
    pushCone(tx, 0.90 * sc, tz, 0.55 * sc, 0.92 * sc, 8, 4, 0.5);
    pushCone(tx, 1.36 * sc, tz, 0.36 * sc, 0.80 * sc, 8, 4, 1.0);
  }

  // 7) 6 Tall Stadium Floodlight Towers
  for (const fl of FLOODLIGHTS) {
    pushBox(fl[0], fl[1] * 0.5, fl[2], 0.24, fl[1], 0.24, 3);
    pushBox(fl[0], fl[1] + 0.18, fl[2], 0.95, 0.36, 0.42, 3);
    pushBox(fl[0], fl[1] + 0.06, fl[2], 0.84, 0.22, 0.48, 8, 0.0);
  }

  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) };
}

// Transform Blender GT Car with yaw AND real 3D ramp pitch (nose tilts UP climbing the bridge, DOWN diving off!)
function appendCarMesh(outVerts, outIdx, carMesh, opts) {
  const {
    x, y = 0, z, yaw, pitch = 0, scale = 0.74,
    livery = [0.1, 0.85, 0.6],
    wheelAngle = 0,
    brakeGlow = 0,
    hitFlash = 0,
  } = opts;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
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

    // Apply 3D ramp pitch around local X (positive pitch lifts nose +Z toward +Y!)
    if (Math.abs(pitch) > 1e-4) {
      const ply = ly * cp + lz * sp;
      const plz = -ly * sp + lz * cp;
      ly = ply; lz = plz;
      const pny = ny * cp + nz * sp;
      const pnz = -ny * sp + nz * cp;
      ny = pny; nz = pnz;
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
      r *= livery[0]; g *= livery[1]; b *= livery[2];
    } else if (p === 4) {
      r = 2.1; g = 2.05; b = 1.75;
    } else if (p === 5) {
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

  for (let i = 0; i < idx.length; i++) outIdx.push(base + idx[i]);
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

  const vboC = gl.createBuffer(), iboC = gl.createBuffer();
  const vaoC = gl.createVertexArray();
  gl.bindVertexArray(vaoC);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboC); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboC);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const vboGlow = gl.createBuffer();
  const vaoGlow = gl.createVertexArray();
  gl.bindVertexArray(vaoGlow);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
  gl.bindVertexArray(null);

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

  const lightView = makeLookAt([16.0, 32.0, 14.0], [0, 0, 0], [0, 1, 0]);
  const lightProj = makeOrtho(-26.0, 26.0, -22.0, 22.0, 2.0, 78.0);
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
    const proj = makePerspective(fovRad, aspect, 0.5, 130.0);
    const viewProj = mulMat4(proj, view);

    const cVerts = [];
    const cIdx = [];
    for (const c of cars) {
      appendCarMesh(cVerts, cIdx, carMesh, {
        x: c.x,
        y: c.y ?? 0.03,
        z: c.z,
        yaw: c.yaw + (c.spinOffset ?? 0),
        pitch: c.pitch ?? 0,
        scale: c.scale ?? 0.74,
        livery: c.livery,
        wheelAngle: c.wheelAngle ?? 0,
        brakeGlow: c.brakeGlow ?? 0,
        hitFlash: c.hitFlash ?? 0,
      });
    }
    const cVArr = new Float32Array(cVerts);
    const cIArr = new Uint32Array(cIdx);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboC); gl.bufferData(gl.ARRAY_BUFFER, cVArr, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboC); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cIArr, gl.DYNAMIC_DRAW);

    for (let i = 0; i < 6; i++) {
      const fl = FLOODLIGHTS[i];
      lightsPos[i * 4 + 0] = fl[0]; lightsPos[i * 4 + 1] = fl[1]; lightsPos[i * 4 + 2] = fl[2]; lightsPos[i * 4 + 3] = 30.0;
      lightsCol[i * 4 + 0] = 1.35; lightsCol[i * 4 + 1] = 1.24; lightsCol[i * 4 + 2] = 1.05; lightsCol[i * 4 + 3] = 1.55;
    }
    const pCar = cars[0];
    if (pCar) {
      lightsPos[24] = pCar.x; lightsPos[25] = (pCar.y ?? 0) + 1.4; lightsPos[26] = pCar.z; lightsPos[27] = 6.5;
      lightsCol[24] = 0.20; lightsCol[25] = 1.45; lightsCol[26] = 1.15; lightsCol[27] = 1.20;
    }
    let topBand = null;
    for (const rb of rubberBands) {
      if (!topBand || Math.abs(rb.tension) > Math.abs(topBand.tension)) topBand = rb;
    }
    if (topBand && topBand.alpha > 0.05) {
      lightsPos[28] = (topBand.x0 + topBand.x1) * 0.5;
      lightsPos[29] = ((topBand.y0 ?? 0) + (topBand.y1 ?? 0)) * 0.5 + 1.8;
      lightsPos[30] = (topBand.z0 + topBand.z1) * 0.5;
      lightsPos[31] = 8.5;
      if (topBand.mode === "boost") {
        lightsCol[28] = 2.1; lightsCol[29] = 1.15; lightsCol[30] = 0.20; lightsCol[31] = 1.65 * topBand.alpha;
      } else {
        lightsCol[28] = 0.25; lightsCol[29] = 1.55; lightsCol[30] = 2.25; lightsCol[31] = 1.65 * topBand.alpha;
      }
    } else {
      lightsPos[31] = 0; lightsCol[31] = 0;
    }

    // 1) Shadow pass
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

    gl.useProgram(progCar);
    gl.uniformMatrix4fv(uCar.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uCar.uLightVP, false, lightVP);
    gl.uniform1i(uCar.uShadowMap, 0);
    gl.uniform3fv(uCar.uCamPos, basis.pos);
    gl.uniform4fv(uCar.uLightsPos, lightsPos);
    gl.uniform4fv(uCar.uLightsCol, lightsCol);
    gl.bindVertexArray(vaoC);
    gl.drawElements(gl.TRIANGLES, cIArr.length, gl.UNSIGNED_INT, 0);

    // 3) Additive HDR Glow Pass (3D Rubber Bands with real Y elevation, Nitro plumes, sparks & motes)
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

    for (const c of cars) {
      const cy = c.y ?? 0.03;
      if (c.isPlayer) {
        pushRing(c.x, cy + 0.04, c.z, 0.88, 1.02, 0.16, 1.45, 1.05, 0.65, 32);
      }
      if ((c.boostGlow ?? 0) > 0.05) {
        const bg = c.boostGlow;
        const yaw = c.yaw + (c.spinOffset ?? 0);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = -fz, rz = fx;
        const flLen = (0.80 + 0.60 * bg + 0.20 * Math.sin(time * 42 + c.id * 3)) * (c.scale ?? 0.74);
        for (const side of [-0.18, 0.18]) {
          const sx = c.x - fx * 0.82 * (c.scale ?? 0.74) + rx * side;
          const sz = c.z - fz * 0.82 * (c.scale ?? 0.74) + rz * side;
          const ex = sx - fx * flLen;
          const ez = sz - fz * flLen;
          const w0 = 0.13 * bg;
          pushGlowQuad(
            [sx - rx * w0, cy + 0.22, sz - rz * w0],
            [sx + rx * w0, cy + 0.22, sz + rz * w0],
            [ex + rx * 0.02, cy + 0.20, ez + rz * 0.02],
            [ex - rx * 0.02, cy + 0.20, ez - rz * 0.02],
            2.6 * bg, 1.35 * bg, 0.22 * bg, 0.90
          );
          pushBillboard(sx - fx * flLen * 0.35, cy + 0.23, sz - fz * flLen * 0.35, 0.24 * bg, 2.5, 1.65, 0.40, 0.65 * bg);
        }
      }
      if ((c.brakeGlow ?? 0) > 0.15) {
        const bk = c.brakeGlow;
        const yaw = c.yaw + (c.spinOffset ?? 0);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        pushBillboard(c.x - fx * 0.82 * (c.scale ?? 0.74), cy + 0.30, c.z - fz * 0.82 * (c.scale ?? 0.74), 0.42 * bk, 2.4, 0.22, 0.18, 0.55 * bk);
      }
    }

    // 3D Glowing Elastic Rubber Bands connecting cars cleanly across elevations!
    for (const rb of rubberBands) {
      if (rb.alpha <= 0.02) continue;
      const tension = Math.abs(rb.tension);
      const isBoost = rb.mode === "boost";
      const colCore = isBoost ? [2.65, 1.48 - tension * 0.55, 0.18] : [0.18, 1.75, 2.65];
      const colHalo = isBoost ? [1.85, 0.68, 0.08] : [0.10, 0.95, 1.95];

      const y0 = (rb.y0 ?? 0.03) + 0.42;
      const y1 = (rb.y1 ?? 0.03) + 0.42;
      const dx = rb.x1 - rb.x0;
      const dz = rb.z1 - rb.z0;
      const dist = Math.hypot(dx, dz) || 0.001;
      const perpX = -dz / dist;
      const perpZ = dx / dist;

      const segs = 28;
      const vibAmp = (0.03 + 0.09 * tension) * rb.alpha;
      const vibFreq = 26 + tension * 28;
      const archH = 0.62 + 0.35 * (1.0 - tension) + Math.min(0.85, dist * 0.05);

      for (const strand of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const env = Math.sin(u * Math.PI);
          const sep = strand * (0.06 + 0.12 * (1.0 - tension * 0.7)) * env;
          const vib = Math.sin(time * vibFreq + u * Math.PI * 3 + strand * 1.4) * vibAmp * env;
          const px = rb.x0 + dx * u + perpX * (sep + vib);
          const pz = rb.z0 + dz * u + perpZ * (sep + vib);
          const py = y0 + (y1 - y0) * u + archH * env + Math.cos(time * vibFreq * 0.7 + u * 6.0) * vibAmp * 0.4 * env;
          pts.push([px, py, pz]);
        }

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

      for (let b = 0; b < 3; b++) {
        const u = ((b / 3) - time * (1.05 + tension) + 100) % 1;
        const env = Math.sin(u * Math.PI);
        const bx = rb.x0 + dx * u;
        const bz = rb.z0 + dz * u;
        const by = y0 + (y1 - y0) * u + archH * env;
        pushBillboard(bx, by, bz, 0.16 + 0.06 * tension, colCore[0] * 1.15, colCore[1] * 1.15, colCore[2] * 1.15, rb.alpha * 0.85 * env);
      }

      pushBillboard(rb.x0, y0, rb.z0, 0.15, colCore[0], colCore[1], colCore[2], rb.alpha * 0.42);
      pushBillboard(rb.x1, y1, rb.z1, 0.15, colCore[0], colCore[1], colCore[2], rb.alpha * 0.55);
    }

    for (const pt of particles) {
      pushBillboard(pt.x, pt.y, pt.z, pt.size, pt.r, pt.g, pt.b, pt.a);
    }

    for (let i = 0; i < 28; i++) {
      const seed = i * 19.37;
      const frac = (time * (0.14 + (i % 4) * 0.035) + seed * 0.13) % 1.0;
      const ex = Math.sin(seed * 2.1 + time * 0.45) * 16.0;
      const ez = Math.cos(seed * 1.7 + time * 0.35) * 10.5;
      const ey = 0.6 + frac * 6.5;
      const alpha = Math.sin(frac * Math.PI) * 0.45;
      pushBillboard(ex, ey, ez, 0.095, 1.55, 1.35, 0.85, alpha);
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

    // 4) Separable Bloom
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
