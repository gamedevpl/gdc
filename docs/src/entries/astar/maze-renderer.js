// Dedicated 11x15 3D Medieval Stone Maze WebGL2 Renderer for A* Explained Short.
// Reuses Game Design Lab PBR stone, flickering torches, PCF shadows & HDR bloom,
// plus per-tile dynamic glow texture and exact world->screen projection for crisp 3D floor numbers!
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

export const MAZE_W = 11;
export const MAZE_H = 15;
const HALF_W = MAZE_W * 0.5;
const HALF_H = MAZE_H * 0.5;
const SHADOW_RES = 1024;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.032, 0.048, 0.095);
  vec3 midCol = vec3(0.068, 0.095, 0.165);
  vec3 botCol = vec3(0.030, 0.040, 0.075);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, topCol, smoothstep(0.48, 1.0, vUv.y));
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() {
  gl_Position = uLightVP * vec4(aPos, 1.0);
}
`;

const SHADOW_PAWN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform vec4 uPawnPosYaw;
uniform float uPawnScale;
void main() {
  float c = cos(uPawnPosYaw.w), s = sin(uPawnPosYaw.w);
  vec3 lp = aPos * uPawnScale;
  vec3 wp = vec3(lp.x * c - lp.z * s, lp.y, lp.x * s + lp.z * c) + uPawnPosYaw.xyz;
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
layout(location=2) in vec2 aTileUv;
layout(location=3) in float aMat;
layout(location=4) in float aSeed;

uniform mat4 uViewProj;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vNorm;
out vec2 vTileUv;
out float vMat;
out float vSeed;
out vec4 vShadowPos;

void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  vTileUv = aTileUv;
  vMat = aMat;
  vSeed = aSeed;
  vShadowPos = uLightVP * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in vec2 vTileUv;
in float vMat;
in float vSeed;
in vec4 vShadowPos;

uniform sampler2D uShadowMap;
uniform sampler2D uTileState;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec4 uLightsPos[8];
uniform vec4 uLightsCol[8];

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0022 * (1.0 - ndl), 0.0009);
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
      s += (p.z - bias <= d) ? 1.0 : 0.0;
    }
  }
  return s / 9.0;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec2 fuv = fract(vTileUv);
  float matId = vMat;

  vec3 albedo = vec3(0.24, 0.27, 0.34);
  vec3 emit = vec3(0.0);
  float rough = 0.72;

  if (matId < 0.5) {
    // Walkable Stone Maze Floor Tile — rich moody castle slate so glowing A* tiles pop!
    float grain = hash21(floor(vTileUv * 10.0) + vSeed) * 0.045;
    float mortar = smoothstep(0.035, 0.075, min(min(fuv.x, 1.0 - fuv.x), min(fuv.y, 1.0 - fuv.y)));
    albedo = mix(vec3(0.055, 0.072, 0.115), vec3(0.145, 0.175, 0.240) + grain, mortar);

    // Sample dynamic per-tile glow state (RGB = tile glow color, A = intensity 0..1)
    vec2 cell = floor(vTileUv);
    vec2 stUv = (cell + 0.5) / vec2(${MAZE_W}.0, ${MAZE_H}.0);
    vec4 st = texture(uTileState, stUv);
    float edgeDist = min(min(fuv.x, 1.0 - fuv.x), min(fuv.y, 1.0 - fuv.y));
    float innerRim = (1.0 - smoothstep(0.04, 0.14, edgeDist)) * smoothstep(0.01, 0.04, edgeDist);
    float fillMask = smoothstep(0.04, 0.09, edgeDist);

    if (st.a > 0.01) {
      albedo = mix(albedo, st.rgb * 0.78, st.a * 0.80 * fillMask);
      emit += st.rgb * (0.34 * fillMask + 0.95 * innerRim) * st.a;
    }
  } else if (matId < 1.5) {
    // Raised Stone Maze Wall — rich dark castle masonry with warm torch rims
    if (N.y > 0.5) {
      float bevel = smoothstep(0.05, 0.16, min(min(fuv.x, 1.0 - fuv.x), min(fuv.y, 1.0 - fuv.y)));
      float g = hash21(floor(vTileUv * 8.0) + vSeed) * 0.035;
      albedo = mix(vec3(0.11, 0.14, 0.21), vec3(0.21, 0.25, 0.34) + g, bevel);
    } else {
      float row = floor(vWorldPos.y * 4.2);
      float bx = fract((vWorldPos.x + vWorldPos.z) * 1.45 + mod(row, 2.0) * 0.5);
      float by = fract(vWorldPos.y * 4.2);
      float brick = smoothstep(0.04, 0.10, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
      float shade = 0.82 + 0.28 * hash21(vec2(row, floor((vWorldPos.x + vWorldPos.z) * 1.45)));
      albedo = mix(vec3(0.05, 0.065, 0.10), vec3(0.19, 0.23, 0.30) * shade, brick);
    }
    rough = 0.84;
  } else if (matId < 2.5) {
    // Tabletop wooden-stone plinth
    albedo = vec3(0.055, 0.068, 0.105);
    rough = 0.90;
  } else {
    // Brass plinth trim
    albedo = vec3(0.45, 0.34, 0.18);
    rough = 0.42;
  }

  // Moody twilight key + rich warm flickering dungeon torches!
  vec3 sunDir = normalize(vec3(0.38, 0.86, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadowPos, ndl);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 44.0, 1.0 - rough)) * (1.0 - rough) * 0.26;

  vec3 amb = mix(vec3(0.10, 0.13, 0.22), vec3(0.20, 0.25, 0.36), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.48, 0.55, 0.72) * ndl * (0.28 + 0.72 * sh)) + vec3(0.65, 0.75, 0.95) * spec * sh;

  for (int i = 0; i < 8; i++) {
    vec3 lp = uLightsPos[i].xyz;
    float lr = uLightsPos[i].w;
    if (lr <= 0.01) continue;
    vec3 L = lp - vWorldPos;
    float d = length(L);
    if (d < lr) {
      L /= max(d, 0.001);
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.85);
      float lnd = max(dot(N, L), 0.16);
      vec3 lH = normalize(L + V);
      float lSpec = pow(max(dot(N, lH), 0.0), 20.0) * (1.0 - rough) * 0.28;
      lit += (albedo * lnd + lSpec) * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  fragColor = vec4(lit + emit, 1.0);
}
`;

const PAWN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in float aPart;

uniform mat4 uViewProj;
uniform vec4 uPawnPosYaw;
uniform float uPawnScale;

out vec3 vWorldPos;
out vec3 vNorm;
out float vPart;

void main() {
  float c = cos(uPawnPosYaw.w), s = sin(uPawnPosYaw.w);
  vec3 lp = aPos * uPawnScale;
  vec3 wp = vec3(lp.x * c - lp.z * s, lp.y, lp.x * s + lp.z * c) + uPawnPosYaw.xyz;
  vec3 wn = vec3(aNorm.x * c - aNorm.z * s, aNorm.y, aNorm.x * s + aNorm.z * c);
  vWorldPos = wp;
  vNorm = normalize(wn);
  vPart = aPart;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const PAWN_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in float vPart;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 sunDir = normalize(vec3(0.4, 0.85, 0.35));
  int part = int(vPart + 0.5);
  vec3 baseCol = vec3(0.06, 0.78, 0.68);
  vec3 glowCol = vec3(0.18, 1.35, 1.05);
  vec3 col = baseCol;
  vec3 emit = vec3(0.0);
  if (part == 0) col = vec3(0.08, 0.10, 0.16);
  else if (part == 1) { col = baseCol; emit = glowCol * 0.16; }
  else if (part == 2) col = vec3(0.86, 0.90, 0.96);
  else { col = glowCol; emit = glowCol * 0.95; }
  float ndl = max(dot(N, sunDir), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  vec3 lit = col * (vec3(0.28, 0.32, 0.44) + vec3(0.88, 0.85, 0.80) * ndl) + glowCol * rim * 0.38 + emit;
  fragColor = vec4(lit, 1.0);
}
`;

const GLOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uViewProj;
out vec4 vCol;
void main() {
  vCol = aCol;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 fragColor;
void main() { fragColor = vCol; }
`;

const BLOOM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uExtract;
out vec4 fragColor;
void main() {
  if (uExtract > 0.5) {
    vec3 c = texture(uSrc, vUv).rgb;
    float br = max(c.r, max(c.g, c.b));
    float soft = smoothstep(0.95, 1.85, br);
    fragColor = vec4(c * soft * 0.68, 1.0);
    return;
  }
  vec2 texel = uDir / vec2(textureSize(uSrc, 0));
  vec3 sum = texture(uSrc, vUv).rgb * 0.227027;
  const float w[4] = float[4](0.1945946, 0.1216216, 0.054054, 0.016216);
  for (int i = 1; i <= 4; i++) {
    vec2 off = texel * float(i) * 1.45;
    sum += texture(uSrc, vUv + off).rgb * w[i - 1];
    sum += texture(uSrc, vUv - off).rgb * w[i - 1];
  }
  fragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uBloom;
out vec4 fragColor;
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec3 col = texture(uHdr, vUv).rgb + texture(uBloom, vUv).rgb * 0.48;
  vec2 q = vUv - 0.5;
  col *= clamp(1.0 - dot(q, q) * 0.36, 0.72, 1.0);
  col = acesFilm(col * 1.06);
  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
`;

function pushBox(verts, indices, x0, y0, z0, x1, y1, z1, gx0, gz0, gx1, gz1, mat, seed) {
  const faces = [
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [gx0, gz1], [gx1, gz1], [gx1, gz0], [gx0, gz0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [gx0, gz0], [gx1, gz0], [gx1, gz1], [gx0, gz1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [gx0, gz1], [gx1, gz1], [gx1, gz1], [gx0, gz1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [gx1, gz0], [gx0, gz0], [gx0, gz0], [gx1, gz0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [gx1, gz1], [gx1, gz0], [gx1, gz0], [gx1, gz1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [gx0, gz0], [gx0, gz1], [gx0, gz1], [gx0, gz0]],
  ];
  for (const f of faces) {
    const base = verts.length / 10;
    const n = f[4];
    for (let k = 0; k < 4; k++) {
      const p = f[k], uv = f[5 + k];
      verts.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], mat, seed);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function buildMazeGeometry(mazeRows) {
  const verts = [];
  const indices = [];
  // Tabletop plinth + brass trim
  pushBox(verts, indices, -HALF_W - 0.55, -0.95, -HALF_H - 0.55, HALF_W + 0.55, -0.16, HALF_H + 0.55, 0, 0, MAZE_W, MAZE_H, 2, 0);
  pushBox(verts, indices, -HALF_W - 0.22, -0.20, -HALF_H - 0.22, HALF_W + 0.22, -0.05, HALF_H + 0.22, 0, 0, MAZE_W, MAZE_H, 3, 0);

  for (let z = 0; z < MAZE_H; z++) {
    for (let x = 0; x < MAZE_W; x++) {
      const ch = mazeRows[z][x];
      const wx = x - HALF_W, wz = z - HALF_H;
      const seed = (x * 23 + z * 17) % 73;
      // Floor tile
      pushBox(verts, indices, wx, -0.14, wz, wx + 1, 0.0, wz + 1, x, z, x + 1, z + 1, 0, seed);
      if (ch === "#") {
        const isOuter = (x === 0 || x === MAZE_W - 1 || z === 0 || z === MAZE_H - 1);
        const h = isOuter ? 0.54 : 0.48; // Low crisp castle walls so floor numbers NEVER get clipped!
        pushBox(verts, indices, wx + 0.02, 0.0, wz + 0.02, wx + 0.98, h, wz + 0.98, x, z, x + 1, z + 1, 1, seed);
        pushBox(verts, indices, wx - 0.01, h, wz - 0.01, wx + 1.01, h + 0.07, wz + 1.01, x, z, x + 1, z + 1, 1, seed);
      }
    }
  }
  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) };
}

function buildPawnMesh() {
  const verts = [], indices = [];
  function addCyl(r0, r1, y0, y1, segs, part) {
    const base = verts.length / 7;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      verts.push(ca * r0, y0, sa * r0, ca, 0.15, sa, part);
      verts.push(ca * r1, y1, sa * r1, ca, 0.15, sa, part);
    }
    for (let i = 0; i < segs; i++) {
      const b = base + i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const c = verts.length / 7;
    verts.push(0, y1, 0, 0, 1, 0, part);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      verts.push(Math.cos(a) * r1, y1, Math.sin(a) * r1, 0, 1, 0, part);
    }
    for (let i = 0; i < segs; i++) indices.push(c, c + 1 + i, c + 2 + i);
  }
  function addBox(x0, y0, z0, x1, y1, z1, part) {
    const fs = [
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    ];
    for (const f of fs) {
      const b = verts.length / 7, n = f[4];
      for (let k = 0; k < 4; k++) verts.push(f[k][0], f[k][1], f[k][2], n[0], n[1], n[2], part);
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  addCyl(0.32, 0.28, 0.0, 0.08, 14, 0);
  addCyl(0.26, 0.17, 0.08, 0.62, 14, 1);
  addCyl(0.17, 0.14, 0.62, 0.88, 14, 2);
  addCyl(0.13, 0.02, 0.88, 0.98, 10, 1);
  addBox(0.12, 0.67, -0.10, 0.23, 0.79, 0.10, 3);
  return { verts: new Float32Array(verts), indices: new Uint16Array(indices) };
}

function pushQuad(out, p0, p1, p2, p3, r, g, b, a) {
  out.push(
    p0[0], p0[1], p0[2], r, g, b, a,
    p1[0], p1[1], p1[2], r, g, b, a,
    p2[0], p2[1], p2[2], r, g, b, a,
    p0[0], p0[1], p0[2], r, g, b, a,
    p2[0], p2[1], p2[2], r, g, b, a,
    p3[0], p3[1], p3[2], r, g, b, a,
  );
}

function pushSeg(out, ax, az, bx, bz, y, halfW, r, g, b, a) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const nx = (-dz / len) * halfW, nz = (dx / len) * halfW;
  pushQuad(out, [ax - nx, y, az - nz], [ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], r, g, b, a);
}

function pushRing(out, cx, y, cz, rIn, rOut, segs, r, g, b, a) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    pushQuad(out,
      [cx + c0 * rIn, y, cz + s0 * rIn], [cx + c0 * rOut, y, cz + s0 * rOut],
      [cx + c1 * rOut, y, cz + s1 * rOut], [cx + c1 * rIn, y, cz + s1 * rIn],
      r, g, b, a);
  }
}

function pushOcta(out, cx, cy, cz, rx, ry, rot, r, g, b, a) {
  const top = [cx, cy + ry, cz], bot = [cx, cy - ry, cz];
  const ring = [0, 1, 2, 3].map(i => {
    const ang = rot + i * Math.PI * 0.5;
    return [cx + Math.cos(ang) * rx, cy, cz + Math.sin(ang) * rx];
  });
  for (let i = 0; i < 4; i++) {
    const pA = ring[i], pB = ring[(i + 1) % 4];
    const sh = i % 2 === 0 ? 1.15 : 0.78;
    out.push(
      top[0], top[1], top[2], r * sh, g * sh, b * sh, a,
      pA[0], pA[1], pA[2], r * sh, g * sh, b * sh, a,
      pB[0], pB[1], pB[2], r * sh, g * sh, b * sh, a,
      bot[0], bot[1], bot[2], r * 0.65, g * 0.65, b * 0.65, a,
      pB[0], pB[1], pB[2], r * 0.65, g * 0.65, b * 0.65, a,
      pA[0], pA[1], pA[2], r * 0.65, g * 0.65, b * 0.65, a,
    );
  }
}

const MAZE_TORCHES = [
  [0.5 - HALF_W, 1.15, 0.5 - HALF_H],
  [10.5 - HALF_W, 1.15, 0.5 - HALF_H],
  [0.5 - HALF_W, 1.15, 14.5 - HALF_H],
  [10.5 - HALF_W, 1.15, 14.5 - HALF_H],
  [4.5 - HALF_W, 1.15, 6.5 - HALF_H],
  [8.5 - HALF_W, 1.15, 10.5 - HALF_H],
];

export function projectPoint(viewProj, wx, wy, wz, w, h) {
  const m = viewProj;
  const cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
  const cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
  const cw = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
  if (cw <= 0.001) return null;
  const nx = cx / cw, ny = cy / cw;
  return { x: (nx * 0.5 + 0.5) * w, y: (0.5 - ny * 0.5) * h };
}

export function createMazeRenderer(gl, mazeRows) {
  const hdr = hdrFormat(gl);

  const [progSky, progShW, progShP, progWorld, progPawn, progGlow, progBloom, progComp] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [SHADOW_PAWN_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [PAWN_VS, PAWN_FS],
    [GLOW_VS, GLOW_FS],
    [FULL_VS, BLOOM_FS],
    [FULL_VS, COMPOSITE_FS],
  ]);

  const uLoc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const uShW = uLoc(progShW, ["uLightVP"]);
  const uShP = uLoc(progShP, ["uLightVP", "uPawnPosYaw", "uPawnScale"]);
  const uWld = uLoc(progWorld, ["uViewProj", "uLightVP", "uShadowMap", "uTileState", "uCamPos", "uTime", "uLightsPos", "uLightsCol"]);
  const uPwn = uLoc(progPawn, ["uViewProj", "uCamPos", "uPawnPosYaw", "uPawnScale"]);
  const uGlw = uLoc(progGlow, ["uViewProj"]);
  const uBlm = uLoc(progBloom, ["uSrc", "uDir", "uExtract"]);
  const uCmp = uLoc(progComp, ["uHdr", "uBloom"]);

  const vaoFull = gl.createVertexArray();

  // Static/editable maze geometry
  let geo = buildMazeGeometry(mazeRows);
  const vboW = gl.createBuffer(), iboW = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboW); gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboW); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.DYNAMIC_DRAW);
  function rebuildMaze(nextRows) {
    geo = buildMazeGeometry(nextRows);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboW); gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboW); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.DYNAMIC_DRAW);
  }
  const vaoW = gl.createVertexArray();
  gl.bindVertexArray(vaoW);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 32);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  // Sculpted Hero Pawn
  const pawn = buildPawnMesh();
  const vboP = gl.createBuffer(), iboP = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboP); gl.bufferData(gl.ARRAY_BUFFER, pawn.verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboP); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pawn.indices, gl.STATIC_DRAW);
  const vaoP = gl.createVertexArray();
  gl.bindVertexArray(vaoP);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboP); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboP);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
  gl.bindVertexArray(null);

  // Dynamic glow overlay VAO
  const vboGlow = gl.createBuffer();
  const vaoGlow = gl.createVertexArray();
  gl.bindVertexArray(vaoGlow);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  // Per-tile state texture (11x15 RGBA8)
  const texTile = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texTile);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAZE_W, MAZE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(MAZE_W * MAZE_H * 4));

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

  const lightView = makeLookAt([7.5, 18.0, 6.5], [0, 0, 0], [0, 1, 0]);
  const lightProj = makeOrtho(-11.0, 11.0, -12.0, 12.0, 2.0, 38.0);
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

  function render({ w, h, cam, time, tileRgba, hero, goal, compassAlpha, trailPts, sparks, nextHint }) {
    ensureTargets(w, h);
    const aspect = w / Math.max(1, h);
    const fovRad = (cam.fovDeg * Math.PI) / 180;
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective(fovRad, aspect, 0.5, 90.0);
    const viewProj = mulMat4(proj, view);

    // Upload per-tile RGBA state
    gl.bindTexture(gl.TEXTURE_2D, texTile);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAZE_W, MAZE_H, gl.RGBA, gl.UNSIGNED_BYTE, tileRgba);

    // Update 8 HDR lights (6 warm torches + emerald hero + golden goal relic)
    for (let i = 0; i < 6; i++) {
      const t = MAZE_TORCHES[i];
      const flick = 0.90 + 0.14 * Math.sin(time * 7.2 + i * 2.1);
      lightsPos[i * 4 + 0] = t[0]; lightsPos[i * 4 + 1] = t[1]; lightsPos[i * 4 + 2] = t[2]; lightsPos[i * 4 + 3] = 6.8;
      lightsCol[i * 4 + 0] = 2.0; lightsCol[i * 4 + 1] = 0.92; lightsCol[i * 4 + 2] = 0.30; lightsCol[i * 4 + 3] = 1.45 * flick;
    }
    const hx = hero.x + 0.5 - HALF_W, hy = hero.y, hz = hero.z + 0.5 - HALF_H;
    lightsPos[24] = hx; lightsPos[25] = 0.95 + hy; lightsPos[26] = hz; lightsPos[27] = 4.2;
    lightsCol[24] = 0.14; lightsCol[25] = 1.35; lightsCol[26] = 1.05; lightsCol[27] = 1.35;

    const gx = goal.x + 0.5 - HALF_W, gz = goal.z + 0.5 - HALF_H;
    const gp = 1.0 + 0.18 * Math.sin(time * 4.5);
    lightsPos[28] = gx; lightsPos[29] = 1.10; lightsPos[30] = gz; lightsPos[31] = 5.2;
    lightsCol[28] = 2.25; lightsCol[29] = 1.55; lightsCol[30] = 0.32; lightsCol[31] = 1.85 * gp;

    // 1) Shadow pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    gl.useProgram(progShW);
    gl.uniformMatrix4fv(uShW.uLightVP, false, lightVP);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);

    gl.useProgram(progShP);
    gl.uniformMatrix4fv(uShP.uLightVP, false, lightVP);
    gl.uniform4f(uShP.uPawnPosYaw, hx, 0.02 + hy, hz, -hero.yaw);
    gl.uniform1f(uShP.uPawnScale, 0.96);
    gl.bindVertexArray(vaoP);
    gl.drawElements(gl.TRIANGLES, pawn.indices.length, gl.UNSIGNED_SHORT, 0);

    // 2) HDR scene pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.viewport(0, 0, curW, curH);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(progSky);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(progWorld);
    gl.uniformMatrix4fv(uWld.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uWld.uLightVP, false, lightVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texShadow); gl.uniform1i(uWld.uShadowMap, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texTile); gl.uniform1i(uWld.uTileState, 1);
    gl.uniform3fv(uWld.uCamPos, basis.pos);
    gl.uniform1f(uWld.uTime, time);
    gl.uniform4fv(uWld.uLightsPos, lightsPos);
    gl.uniform4fv(uWld.uLightsCol, lightsCol);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);

    // Hero pawn
    gl.useProgram(progPawn);
    gl.uniformMatrix4fv(uPwn.uViewProj, false, viewProj);
    gl.uniform3fv(uPwn.uCamPos, basis.pos);
    gl.uniform4f(uPwn.uPawnPosYaw, hx, 0.02 + hy, hz, -hero.yaw);
    gl.uniform1f(uPwn.uPawnScale, 0.96);
    gl.bindVertexArray(vaoP);
    gl.drawElements(gl.TRIANGLES, pawn.indices.length, gl.UNSIGNED_SHORT, 0);

    // 3) 3D Glows: Torches, Drifting Warm Embers, Goal Relic, Hero Ring, Compass Beam, Golden Trail, Sparks!
    const out = [];
    for (let i = 0; i < MAZE_TORCHES.length; i++) {
      const t = MAZE_TORCHES[i];
      const sc = 0.14 + 0.035 * Math.sin(time * 13 + i * 2.3);
      pushOcta(out, t[0], t[1], t[2], sc, sc * 1.9, time * 3 + i, 2.8, 1.35, 0.30, 0.98);
      // 4 continuously rising subtle warm embers per torch -> lively diorama & crisp 60fps motion!
      for (let e = 0; e < 4; e++) {
        const u = ((time * (0.42 + e * 0.09) + i * 0.37 + e * 0.25) % 1.0);
        const ex = t[0] + Math.sin(time * 2.2 + i * 3 + e * 2.1) * (0.28 + u * 0.35);
        const ez = t[2] + Math.cos(time * 1.9 + i * 2 + e * 1.7) * (0.28 + u * 0.35);
        const ey = t[1] + 0.15 + u * 1.85;
        const ea = Math.sin(u * Math.PI) * 0.85;
        const es = 0.045 * (1.0 - u * 0.45);
        pushOcta(out, ex, ey, ez, es, es * 1.3, time * 5 + e, 2.6, 1.45, 0.35, ea);
      }
    }
    // Spinning Golden Goal Treasure Crystal (lifted cleanly above tile so '0' reads underneath!)
    if (!hero.reachedGoal) {
      pushOcta(out, gx, 0.72 + Math.sin(time * 3.5) * 0.08, gz, 0.22, 0.36, time * 2.2, 2.5, 1.75, 0.34, 0.98);
    }
    pushRing(out, gx, 0.04, gz, 0.38, 0.48, 24, 2.2, 1.55, 0.28, 0.88);
    pushRing(out, hx, 0.04, hz, 0.34, 0.44, 22, 0.18, 1.45, 1.15, 0.88);

    // Dotted glowing A* compass beam pointing from Goal -> Hero!
    if (compassAlpha > 0.01) {
      const segs = 14;
      for (let i = 0; i < segs; i++) {
        const u0 = (i + ((time * 1.4) % 1) * 0.8) / segs;
        const u1 = Math.min(1, u0 + 0.038);
        if (u0 >= 1) continue;
        const ax = gx + (hx - gx) * u0, az = gz + (hz - gz) * u0;
        const bx = gx + (hx - gx) * u1, bz = gz + (hz - gz) * u1;
        pushSeg(out, ax, az, bx, bz, 0.95, 0.07, 2.4, 1.85, 0.38, compassAlpha * 0.92);
      }
      // Compass ring halo around Hero
      const pr = 0.54 + 0.08 * Math.sin(time * 8);
      pushRing(out, hx, 0.06, hz, pr, pr + 0.12, 24, 2.4, 1.85, 0.38, compassAlpha * 0.9);
    }

    // Highlight next-step arrow hint (e.g. 15 -> 14 before walking!)
    if (nextHint) {
      const ax = nextHint.fromX + 0.5 - HALF_W, az = nextHint.fromZ + 0.5 - HALF_H;
      const bx = nextHint.toX + 0.5 - HALF_W, bz = nextHint.toZ + 0.5 - HALF_H;
      const pulse = 0.65 + 0.35 * Math.sin(time * 9.0);
      pushSeg(out, ax, az, bx, bz, 0.12, 0.09, 2.5, 1.9, 0.36, pulse);
      pushRing(out, bx, 0.06, bz, 0.36, 0.49, 22, 2.5, 1.9, 0.36, pulse);
    }

    // Glowing golden footprint ribbon behind Hero!
    if (trailPts && trailPts.length >= 2) {
      for (let i = 0; i < trailPts.length - 1; i++) {
        const a = trailPts[i], b = trailPts[i + 1];
        pushSeg(out, a.x + 0.5 - HALF_W, a.z + 0.5 - HALF_H, b.x + 0.5 - HALF_W, b.z + 0.5 - HALF_H,
          0.08, 0.11, 2.4, 1.72, 0.32, 0.90);
      }
    }

    // Celebration gold sparks on reaching 0!
    for (const sp of sparks) {
      const a = clamp(sp.life, 0, 1);
      const sz = 0.09 * a + 0.03;
      pushOcta(out, sp.x - HALF_W, sp.y, sp.z - HALF_H, sz, sz * 1.2, time * 7, sp.r * 2.2, sp.g * 2.2, sp.b * 2.2, a);
    }

    if (out.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(progGlow);
      gl.uniformMatrix4fv(uGlw.uViewProj, false, viewProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(vaoGlow);
      gl.drawArrays(gl.TRIANGLES, 0, out.length / 7);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // 4) Separable HDR Bloom
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progBloom);
    gl.bindVertexArray(vaoFull);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomA);
    gl.viewport(0, 0, halfW, halfH);
    gl.bindTexture(gl.TEXTURE_2D, texHdr);
    gl.uniform1i(uBlm.uSrc, 0); gl.uniform1f(uBlm.uExtract, 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomB);
    gl.bindTexture(gl.TEXTURE_2D, texBloomA);
    gl.uniform1f(uBlm.uExtract, 0.0); gl.uniform2f(uBlm.uDir, 1.0, 0.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboBloomA);
    gl.bindTexture(gl.TEXTURE_2D, texBloomB);
    gl.uniform2f(uBlm.uDir, 0.0, 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 5) ACES Composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(progComp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texHdr); gl.uniform1i(uCmp.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texBloomA); gl.uniform1i(uCmp.uBloom, 1);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return { viewProj, HALF_W, HALF_H };
  }

  return { render, rebuildMaze };
}
