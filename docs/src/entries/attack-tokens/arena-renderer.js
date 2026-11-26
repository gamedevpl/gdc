// Dedicated 13x15 3D Medieval Castle Arena WebGL2 Renderer for "Attack Tokens Explained" Short.
// Upgraded with full Blender-sculpted Articulated Medieval Knight (Hero) & 5 Undead Skeleton Warriors (Guards)
// from FX Lab fighters-mesh.js — real broadsword windups, slashes, shield parries, glowing eyes, & dramatic 40° camera!
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
import { getFightersMeshes } from "../../fighters-mesh.js";

export const ARENA_W = 13;
export const ARENA_H = 15;
const HALF_W = ARENA_W * 0.5;
const HALF_H = ARENA_H * 0.5;
const SHADOW_RES = 1024;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.028, 0.042, 0.088);
  vec3 midCol = vec3(0.062, 0.088, 0.158);
  vec3 botCol = vec3(0.024, 0.032, 0.065);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, topCol, smoothstep(0.48, 1.0, vUv.y));
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
uniform vec3 uCamPos;
uniform vec4 uLightsPos[8];
uniform vec4 uLightsCol[8];
uniform float uDangerFlash;

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

  vec3 albedo = vec3(0.16, 0.19, 0.26);
  float rough = 0.72;

  if (matId < 0.5) {
    // Moody medieval castle flagstone courtyard
    float grain = hash21(floor(vTileUv * 10.0) + vSeed) * 0.04;
    float mortar = smoothstep(0.032, 0.072, min(min(fuv.x, 1.0 - fuv.x), min(fuv.y, 1.0 - fuv.y)));
    albedo = mix(vec3(0.055, 0.070, 0.112), vec3(0.155, 0.185, 0.250) + grain, mortar);
  } else if (matId < 1.5) {
    // Continuous royal crimson velvet carpet with embroidered gold outer border
    float borderX = smoothstep(1.22, 1.38, abs(vWorldPos.x));
    float borderZ = smoothstep(5.18, 5.36, abs(vWorldPos.z));
    float goldBorder = max(borderX, borderZ);
    float weave = (hash21(floor(vWorldPos.xz * 18.0)) - 0.5) * 0.03;
    albedo = mix(vec3(0.28, 0.042, 0.072) + weave, vec3(0.64, 0.45, 0.15), goldBorder);
    rough = 0.86;
  } else if (matId < 2.5) {
    // Castle masonry walls & corner torch pillars
    if (N.y > 0.5) {
      float bevel = smoothstep(0.05, 0.16, min(min(fuv.x, 1.0 - fuv.x), min(fuv.y, 1.0 - fuv.y)));
      albedo = mix(vec3(0.10, 0.13, 0.20), vec3(0.21, 0.25, 0.33), bevel);
    } else {
      float row = floor(vWorldPos.y * 3.8);
      float bx = fract((vWorldPos.x + vWorldPos.z) * 1.4 + mod(row, 2.0) * 0.5);
      float by = fract(vWorldPos.y * 3.8);
      float brick = smoothstep(0.04, 0.10, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
      float shade = 0.84 + 0.26 * hash21(vec2(row, floor((vWorldPos.x + vWorldPos.z) * 1.4)));
      albedo = mix(vec3(0.045, 0.06, 0.095), vec3(0.19, 0.23, 0.30) * shade, brick);
    }
    rough = 0.86;
  } else if (matId < 3.5) {
    albedo = vec3(0.05, 0.065, 0.10);
    rough = 0.90;
  } else {
    albedo = vec3(0.46, 0.35, 0.18);
    rough = 0.40;
  }

  vec3 sunDir = normalize(vec3(0.42, 0.84, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadowPos, ndl);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 44.0, 1.0 - rough)) * (1.0 - rough) * 0.26;

  vec3 amb = mix(vec3(0.11, 0.14, 0.23), vec3(0.22, 0.27, 0.39), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.52, 0.58, 0.74) * ndl * (0.28 + 0.72 * sh)) + vec3(0.68, 0.76, 0.96) * spec * sh;

  for (int i = 0; i < 8; i++) {
    vec3 lp = uLightsPos[i].xyz;
    float lr = uLightsPos[i].w;
    if (lr <= 0.01) continue;
    vec3 L = lp - vWorldPos;
    float d = length(L);
    if (d < lr) {
      L /= max(d, 0.001);
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.85);
      float lnd = max(dot(N, L), 0.18);
      vec3 lH = normalize(L + V);
      float lSpec = pow(max(dot(N, lH), 0.0), 20.0) * (1.0 - rough) * 0.30;
      lit += (albedo * lnd + lSpec) * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  if (uDangerFlash > 0.01 && matId < 1.5) {
    float rDist = length(vWorldPos.xz);
    float ring = smoothstep(5.0, 0.6, rDist);
    lit += vec3(0.45, 0.04, 0.05) * uDangerFlash * ring;
  }

  fragColor = vec4(lit, 1.0);
}
`;

// Sculpted Blender Fighter PBR Shader (per-vertex color, roughness, emissive, moonlight rim + 8 HDR torch lights!)
const FIGHTER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough; // < 0 => HDR emissive!

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

const FIGHTER_FS = `#version 300 es
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
  float bias = max(0.0028 * (1.0 - ndl), 0.0012);
  float d = texture(uShadowMap, p.xy).r;
  return (p.z - bias <= d) ? 1.0 : 0.35;
}

void main() {
  // Emissive rune sword / glowing skeleton eyes (already linear HDR)
  if (vRough < 0.0) {
    fragColor = vec4(vCol, 1.0);
    return;
  }

  // Decode sRGB Blender vertex colors to linear space + derive metallic mask from roughness
  vec3 albedo = pow(max(vCol, vec3(0.0)), vec3(2.2));
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 sunDir = normalize(vec3(0.45, 0.82, 0.38));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadowPos, ndl);
  float rough = clamp(vRough, 0.14, 0.94);
  float metallic = smoothstep(0.38, 0.22, rough);

  vec3 H = normalize(sunDir + V);
  float specPow = mix(92.0, 12.0, rough);
  float specStr = mix(0.75, 0.08, rough) * (0.70 + 0.80 * metallic);
  float spec = pow(max(dot(N, H), 0.0), specPow) * specStr;
  vec3 specTint = mix(vec3(1.0), albedo * 1.45 + vec3(0.18), metallic);

  // Rich tabletop miniature lighting: cool moonlight rim + deep moody shadows
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6) * (0.24 + 0.36 * clamp(N.y + 0.35, 0.0, 1.0));
  vec3 amb = mix(vec3(0.06, 0.09, 0.18), vec3(0.19, 0.25, 0.40), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (1.0 - metallic * 0.32) * (amb + vec3(0.58, 0.68, 0.88) * ndl * (0.24 + 0.76 * sh))
           + specTint * vec3(0.78, 0.86, 1.0) * spec * sh
           + specTint * vec3(0.28, 0.44, 0.76) * rim * (0.45 + 0.45 * metallic);

  for (int i = 0; i < 8; i++) {
    vec3 lp = uLightsPos[i].xyz;
    float lr = uLightsPos[i].w;
    if (lr <= 0.01) continue;
    vec3 L = lp - vWorldPos;
    float d2 = dot(L, L);
    float d = sqrt(d2);
    if (d < lr) {
      L /= max(d, 0.001);
      float att = pow(clamp(1.0 - d / lr, 0.0, 1.0), 1.75) / (0.65 + d2 * 0.16);
      float lnd = max(dot(N, L), 0.0);
      float wrap = max(dot(N, L) * 0.65 + 0.35, 0.0) * 0.12;
      vec3 lH = normalize(L + V);
      float lSpec = pow(max(dot(N, lH), 0.0), specPow * 0.75) * specStr * 0.65;
      lit += (albedo * (1.0 - metallic * 0.28) * (lnd + wrap) + specTint * lSpec) * uLightsCol[i].rgb * uLightsCol[i].w * att;
    }
  }

  fragColor = vec4(lit, 1.0);
}
`;

const GLOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uViewProj;
out vec4 vCol;
void main() { vCol = aCol; gl_Position = uViewProj * vec4(aPos, 1.0); }
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
    float soft = smoothstep(1.12, 2.20, br);
    fragColor = vec4(c * soft * 0.52, 1.0);
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
  col *= clamp(1.0 - dot(q, q) * 0.34, 0.74, 1.0);
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

function buildArenaGeometry() {
  const verts = [], indices = [];
  pushBox(verts, indices, -HALF_W - 0.55, -1.0, -HALF_H - 0.55, HALF_W + 0.55, -0.16, HALF_H + 0.55, 0, 0, ARENA_W, ARENA_H, 3, 0);
  pushBox(verts, indices, -HALF_W - 0.22, -0.20, -HALF_H - 0.22, HALF_W + 0.22, -0.05, HALF_H + 0.22, 0, 0, ARENA_W, ARENA_H, 4, 0);

  for (let z = 0; z < ARENA_H; z++) {
    for (let x = 0; x < ARENA_W; x++) {
      const wx = x - HALF_W, wz = z - HALF_H;
      const seed = (x * 29 + z * 19) % 83;
      const isOuter = (x === 0 || x === ARENA_W - 1 || z === 0 || z === ARENA_H - 1);
      const isCornerPillar = (x === 2 || x === ARENA_W - 3) && (z === 2 || z === ARENA_H - 3);
      const isCarpet = !isOuter && (Math.abs(x - 6) <= 1 && z >= 2 && z <= 12);
      const floorMat = isCarpet ? 1 : 0;
      pushBox(verts, indices, wx, -0.14, wz, wx + 1, isCarpet ? 0.02 : 0.0, wz + 1, x, z, x + 1, z + 1, floorMat, seed);

      if (isOuter) {
        const isCorner = (x <= 1 || x >= ARENA_W - 2) && (z <= 1 || z >= ARENA_H - 2);
        const h = isCorner ? 1.15 : 0.62;
        pushBox(verts, indices, wx, 0.0, wz, wx + 1, h, wz + 1, x, z, x + 1, z + 1, 2, seed);
        pushBox(verts, indices, wx - 0.02, h, wz - 0.02, wx + 1.02, h + 0.09, wz + 1.02, x, z, x + 1, z + 1, 2, seed);
      } else if (isCornerPillar) {
        pushBox(verts, indices, wx + 0.06, 0.0, wz + 0.06, wx + 0.94, 1.32, wz + 0.94, x, z, x + 1, z + 1, 2, seed);
        pushBox(verts, indices, wx - 0.02, 1.32, wz - 0.02, wx + 1.02, 1.44, wz + 1.02, x, z, x + 1, z + 1, 2, seed);
        pushBox(verts, indices, wx - 0.01, 0.0, wz - 0.01, wx + 1.01, 0.16, wz + 1.01, x, z, x + 1, z + 1, 4, seed);
      }
    }
  }
  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) };
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

// Push a dramatic glowing 3D sword slash ribbon arc in front of an attacking warrior!
function pushSlashArc(out, gx, gy, gz, facingYaw, slashProg, r, g, b) {
  if (slashProg <= 0.02 || slashProg >= 0.98) return;
  const alpha = Math.sin(slashProg * Math.PI) * 0.88;
  const cy = Math.cos(facingYaw), sy = Math.sin(facingYaw);
  const segs = 12;
  const aStart = -0.95 + slashProg * 0.35;
  const aEnd = aStart + 1.55;
  const radIn = 0.72, radOut = 1.48;
  const toWorld = (ang, rad) => {
    const lx = Math.sin(ang) * rad;
    const lz = Math.cos(ang) * rad + 0.15;
    const ly = gy + 1.08 + Math.sin(ang * 0.7) * 0.32;
    return [gx + lx * cy + lz * sy, ly, gz - lx * sy + lz * cy];
  };
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs, u1 = (i + 1) / segs;
    const a0 = aStart + (aEnd - aStart) * u0;
    const a1 = aStart + (aEnd - aStart) * u1;
    const fade = Math.sin(u0 * Math.PI);
    pushQuad(out, toWorld(a0, radIn), toWorld(a0, radOut), toWorld(a1, radOut), toWorld(a1, radIn), r, g, b, alpha * fade);
  }
}

// Append one articulated Blender fighter (10 floats/vert: pos3, norm3, col3, rough1)
function appendArticulatedFighter(verts, indices, pack, opts) {
  const {
    x, y, z, yaw, scale, breath, torsoYaw, headYaw, shieldPitch, swordPitch, tilt,
    walkPhase = 0, walkAmp = 0, emColor, tintCol, tintMix,
  } = opts;
  const baseV = verts.length / 10;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const walkBob = Math.abs(Math.sin(walkPhase)) * 0.075 * walkAmp;
  const legAngL = Math.sin(walkPhase) * 0.68 * walkAmp;
  const legAngR = -legAngL;
  const { count, pos, norm, col, part, rough, idx } = pack;

  for (let i = 0; i < count; i++) {
    let lx = pos[i * 3 + 0];
    let ly = pos[i * 3 + 1];
    let lz = pos[i * 3 + 2];
    let nx = norm[i * 3 + 0];
    let ny = norm[i * 3 + 1];
    let nz = norm[i * 3 + 2];
    const p = part[i];

    if (p === 0 && walkAmp > 0.01) {
      // Articulated left/right leg stride swinging cleanly around the hip pivot!
      const py = 0.62;
      const ang = lx < 0 ? legAngL : legAngR;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ry = ly - py, rz = lz;
      ly = py + ry * ca - rz * sa + walkBob * 0.45;
      lz = ry * sa + rz * ca;
      const rny = ny * ca - nz * sa, rnz = ny * sa + nz * ca;
      ny = rny; nz = rnz;
    } else if (p === 1) {
      ly += breath + walkBob;
      const effTorsoYaw = torsoYaw + Math.sin(walkPhase) * 0.14 * walkAmp;
      const ca = Math.cos(effTorsoYaw), sa = Math.sin(effTorsoYaw);
      const tx = lx * ca + lz * sa, tz = -lx * sa + lz * ca;
      const tnx = nx * ca + nz * sa, tnz = -nx * sa + nz * ca;
      lx = tx; lz = tz; nx = tnx; nz = tnz;
    } else if (p === 2) {
      ly += breath * 1.1 + walkBob;
      const ca = Math.cos(headYaw), sa = Math.sin(headYaw);
      const tx = lx * ca + lz * sa, tz = -lx * sa + lz * ca;
      const tnx = nx * ca + nz * sa, tnz = -nx * sa + nz * ca;
      lx = tx; lz = tz; nx = tnx; nz = tnz;
    } else if (p === 3) {
      // Shield arm pivot (subtle counter-swing while walking!)
      const px = 0.24, py = 1.00, pz = 0.0;
      const rx = lx - px, ry = ly - py, rz = lz - pz;
      const effP = shieldPitch - Math.sin(walkPhase) * 0.24 * walkAmp;
      const ca = Math.cos(effP), sa = Math.sin(effP);
      ly = py + ry * ca - rz * sa + breath + walkBob;
      lz = pz + ry * sa + rz * ca;
      lx = px + rx;
      const rny = ny * ca - nz * sa, rnz = ny * sa + nz * ca;
      ny = rny; nz = rnz;
    } else if (p === 4) {
      // Weapon sword arm pivot (subtle counter-swing while walking!)
      const px = -0.24, py = 1.00, pz = 0.0;
      const rx = lx - px, ry = ly - py, rz = lz - pz;
      const effP = swordPitch + Math.sin(walkPhase) * 0.28 * walkAmp;
      const ca = Math.cos(effP), sa = Math.sin(effP);
      ly = py + ry * ca - rz * sa + breath + walkBob;
      lz = pz + ry * sa + rz * ca;
      lx = px + rx;
      const rny = ny * ca - nz * sa, rnz = ny * sa + nz * ca;
      ny = rny; nz = rnz;
    }

    // Optional defeat/hitback tilt around local X (falls backward when KO'd!)
    if (Math.abs(tilt) > 1e-4) {
      const ty = ly * ct - lz * st, tz = ly * st + lz * ct;
      const tny = ny * ct - nz * st, tnz = ny * st + nz * ct;
      ly = ty; lz = tz; ny = tny; nz = tnz;
    }

    const wx = x + (lx * cy + lz * sy) * scale;
    const wy = y + ly * scale;
    const wz = z + (-lx * sy + lz * cy) * scale;
    const wnx = nx * cy + nz * sy;
    const wny = ny;
    const wnz = -nx * sy + nz * cy;

    const r = rough[i];
    let cr = col[i * 3 + 0], cg = col[i * 3 + 1], cb = col[i * 3 + 2];
    if (r < 0 && emColor) {
      cr = emColor[0]; cg = emColor[1]; cb = emColor[2];
    } else if (r >= 0 && tintMix > 0.001 && tintCol) {
      cr = cr * (1 - tintMix) + tintCol[0] * tintMix;
      cg = cg * (1 - tintMix) + tintCol[1] * tintMix;
      cb = cb * (1 - tintMix) + tintCol[2] * tintMix;
    }

    verts.push(wx, wy, wz, wnx, wny, wnz, cr, cg, cb, r);
  }
  for (let k = 0; k < idx.length; k++) {
    indices.push(baseV + idx[k]);
  }
}

const ARENA_TORCHES = [
  [2.5 - HALF_W, 1.65, 2.5 - HALF_H],
  [10.5 - HALF_W, 1.65, 2.5 - HALF_H],
  [2.5 - HALF_W, 1.65, 12.5 - HALF_H],
  [10.5 - HALF_W, 1.65, 12.5 - HALF_H],
  [0.5 - HALF_W, 1.35, 7.5 - HALF_H],
  [12.5 - HALF_W, 1.35, 7.5 - HALF_H],
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

export function createArenaRenderer(gl) {
  const hdr = hdrFormat(gl);
  const meshes = getFightersMeshes();

  const [progSky, progSh, progWorld, progFighter, progGlow, progBloom, progComp] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [FIGHTER_VS, FIGHTER_FS],
    [GLOW_VS, GLOW_FS],
    [FULL_VS, BLOOM_FS],
    [FULL_VS, COMPOSITE_FS],
  ]);

  const uLoc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const uSh = uLoc(progSh, ["uLightVP"]);
  const uWld = uLoc(progWorld, ["uViewProj", "uLightVP", "uShadowMap", "uCamPos", "uLightsPos", "uLightsCol", "uDangerFlash"]);
  const uFgt = uLoc(progFighter, ["uViewProj", "uLightVP", "uShadowMap", "uCamPos", "uLightsPos", "uLightsCol"]);
  const uGlw = uLoc(progGlow, ["uViewProj"]);
  const uBlm = uLoc(progBloom, ["uSrc", "uDir", "uExtract"]);
  const uCmp = uLoc(progComp, ["uHdr", "uBloom"]);

  const vaoFull = gl.createVertexArray();

  // Static castle arena geometry
  const geo = buildArenaGeometry();
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

  // Dynamic sculpted Blender fighters VAO (10 floats/vert = 40 bytes)
  const vboF = gl.createBuffer(), iboF = gl.createBuffer();
  const vaoF = gl.createVertexArray();
  gl.bindVertexArray(vaoF);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboF); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboF);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  // Glow overlay VAO
  const vboGlow = gl.createBuffer();
  const vaoGlow = gl.createVertexArray();
  gl.bindVertexArray(vaoGlow);
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGlow);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
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

  const lightView = makeLookAt([7.5, 16.5, 6.5], [0, 0, 0], [0, 1, 0]);
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

  function render({ w, h, cam, time, hero, guards, waitingRingAlpha, tokenOrb, dangerFlash, sparks }) {
    ensureTargets(w, h);
    const aspect = w / Math.max(1, h);
    const fovRad = (cam.fovDeg * Math.PI) / 180;
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective(fovRad, aspect, 0.5, 90.0);
    const viewProj = mulMat4(proj, view);

    // Build dynamic articulated Blender Knight + 5 Skeleton Warriors mesh!
    const fVerts = [];
    const fIdx = [];

    appendArticulatedFighter(fVerts, fIdx, meshes.knight, {
      x: hero.x, y: hero.y, z: hero.z,
      yaw: hero.yaw,
      scale: 1.38,
      breath: Math.sin(time * 3.4) * 0.022,
      torsoYaw: hero.torsoYaw ?? 0,
      headYaw: hero.headYaw ?? 0,
      shieldPitch: hero.shieldPitch ?? 0.15,
      swordPitch: hero.swordPitch ?? 0.0,
      tilt: hero.tilt ?? 0,
      walkPhase: hero.walkPhase ?? 0,
      walkAmp: hero.walkAmp ?? 0,
      emColor: hero.hitFlash > 0.2 ? [2.1, 0.32, 0.25] : [0.28, 1.85, 1.50], // Enchanted emerald-cyan rune blade!
      tintCol: [0.80, 0.10, 0.10],
      tintMix: hero.hitFlash * 0.34,
    });

    for (const g of guards) {
      let emColor = [0.30, 1.65, 2.05]; // Waiting skeleton: cool cyan glowing eyes
      let tintCol = null, tintMix = 0;
      if (g.hasToken) {
        emColor = [2.7, 1.85, 0.24]; // Active Attack Token holder: blazing golden eyes!
        tintCol = [0.95, 0.65, 0.14];
        tintMix = 0.16;
      } else if (g.danger > 0.15) {
        emColor = [2.6, 0.20, 0.18]; // Dogpile chaos: blazing crimson eyes!
        tintCol = [0.75, 0.08, 0.08];
        tintMix = g.danger * 0.18;
      }
      appendArticulatedFighter(fVerts, fIdx, meshes.skeleton, {
        x: g.x, y: g.y, z: g.z,
        yaw: g.yaw,
        scale: g.hasToken ? 1.36 : 1.28,
        breath: Math.sin(time * 3.0 + g.id * 1.4) * 0.02,
        torsoYaw: g.torsoYaw ?? 0,
        headYaw: Math.sin(time * 2.1 + g.id) * 0.08,
        shieldPitch: g.shieldPitch ?? 0.05,
        swordPitch: g.swordPitch ?? 0.0,
        tilt: g.tilt ?? 0,
        walkPhase: g.walkPhase ?? 0,
        walkAmp: g.walkAmp ?? 0,
        emColor,
        tintCol,
        tintMix,
      });
    }

    const fVArr = new Float32Array(fVerts);
    const fIArr = new Uint32Array(fIdx);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboF); gl.bufferData(gl.ARRAY_BUFFER, fVArr, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboF); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fIArr, gl.DYNAMIC_DRAW);

    // Update 8 HDR lights
    for (let i = 0; i < 6; i++) {
      const t = ARENA_TORCHES[i];
      const flick = 0.90 + 0.14 * Math.sin(time * 7.4 + i * 2.1);
      lightsPos[i * 4 + 0] = t[0]; lightsPos[i * 4 + 1] = t[1]; lightsPos[i * 4 + 2] = t[2]; lightsPos[i * 4 + 3] = 7.8;
      lightsCol[i * 4 + 0] = 2.05; lightsCol[i * 4 + 1] = 0.92; lightsCol[i * 4 + 2] = 0.30; lightsCol[i * 4 + 3] = 1.75 * flick;
    }
    lightsPos[24] = hero.x; lightsPos[25] = 1.2 + hero.y; lightsPos[26] = hero.z; lightsPos[27] = 5.0;
    lightsCol[24] = 0.20; lightsCol[25] = 1.25; lightsCol[26] = 1.05; lightsCol[27] = 1.15;

    let tokLx = 0, tokLy = -10, tokLz = 0, tokPow = 0;
    if (tokenOrb) {
      tokLx = tokenOrb.x; tokLy = tokenOrb.y; tokLz = tokenOrb.z; tokPow = 2.6;
    } else {
      const tg = guards.find(g => g.hasToken);
      if (tg) { tokLx = tg.x; tokLy = 2.3 + tg.y; tokLz = tg.z; tokPow = 2.2; }
    }
    lightsPos[28] = tokLx; lightsPos[29] = tokLy; lightsPos[30] = tokLz; lightsPos[31] = 6.2;
    lightsCol[28] = 2.3; lightsCol[29] = 1.60; lightsCol[30] = 0.30; lightsCol[31] = tokPow;

    // 1) Shadow pass (walls + sculpted Knight & 5 Skeletons — cull off for thin capes/shields!)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    gl.useProgram(progSh);
    gl.uniformMatrix4fv(uSh.uLightVP, false, lightVP);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(vaoF);
    gl.drawElements(gl.TRIANGLES, fIArr.length, gl.UNSIGNED_INT, 0);

    // 2) HDR scene pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.viewport(0, 0, curW, curH);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(progSky);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(progWorld);
    gl.uniformMatrix4fv(uWld.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uWld.uLightVP, false, lightVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texShadow); gl.uniform1i(uWld.uShadowMap, 0);
    gl.uniform3fv(uWld.uCamPos, basis.pos);
    gl.uniform4fv(uWld.uLightsPos, lightsPos);
    gl.uniform4fv(uWld.uLightsCol, lightsCol);
    gl.uniform1f(uWld.uDangerFlash, dangerFlash);
    gl.bindVertexArray(vaoW);
    gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);

    // Sculpted Blender Fighters (cull off so capes & ragged hoods are double-sided!)
    gl.disable(gl.CULL_FACE);
    gl.useProgram(progFighter);
    gl.uniformMatrix4fv(uFgt.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(uFgt.uLightVP, false, lightVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texShadow); gl.uniform1i(uFgt.uShadowMap, 0);
    gl.uniform3fv(uFgt.uCamPos, basis.pos);
    gl.uniform4fv(uFgt.uLightsPos, lightsPos);
    gl.uniform4fv(uFgt.uLightsCol, lightsCol);
    gl.bindVertexArray(vaoF);
    gl.drawElements(gl.TRIANGLES, fIArr.length, gl.UNSIGNED_INT, 0);

    // 3) Glowing Overlays: Torches + Rising Embers, Subtle Tactical Rings, Sword Slash Arcs, Golden Token Crown & Flying Orb, Sparks!
    const out = [];
    for (let i = 0; i < ARENA_TORCHES.length; i++) {
      const t = ARENA_TORCHES[i];
      const sc = 0.16 + 0.035 * Math.sin(time * 13.5 + i * 2.1);
      pushOcta(out, t[0], t[1], t[2], sc, sc * 2.0, time * 3.1 + i, 2.7, 1.32, 0.28, 0.98);
      for (let e = 0; e < 4; e++) {
        const u = ((time * (0.40 + e * 0.09) + i * 0.31 + e * 0.25) % 1.0);
        const ex = t[0] + Math.sin(time * 2.1 + i * 3 + e * 2.2) * (0.28 + u * 0.36);
        const ez = t[2] + Math.cos(time * 1.8 + i * 2 + e * 1.9) * (0.28 + u * 0.36);
        const ey = t[1] + 0.14 + u * 1.95;
        const ea = Math.sin(u * Math.PI) * 0.85;
        const es = 0.046 * (1.0 - u * 0.45);
        pushOcta(out, ex, ey, ez, es, es * 1.3, time * 5 + e, 2.5, 1.40, 0.34, ea);
      }
    }

    // Subtle crisp Hero ground ring (thin so the sculpted Knight stands out!)
    pushRing(out, hero.x, 0.05, hero.z, 0.62, 0.72, 28,
      0.14 + hero.hitFlash * 1.4, 1.08 - hero.hitFlash * 0.88, 0.90 - hero.hitFlash * 0.74, 0.72);
    if ((hero.slashProg ?? 0) > 0.02) {
      pushSlashArc(out, hero.x, hero.y, hero.z, hero.yaw, hero.slashProg, 0.28, 1.95, 1.65);
    }

    // Glowing Cyan Waiting Perimeter Ring around Hero!
    if (waitingRingAlpha > 0.01) {
      pushRing(out, hero.x, 0.04, hero.z, 3.24, 3.35, 56, 0.16, 0.92, 1.25, 0.52 * waitingRingAlpha);
      pushRing(out, hero.x, 0.04, hero.z, 3.12, 3.16, 56, 0.16, 0.92, 1.25, 0.22 * waitingRingAlpha);
    }

    for (const g of guards) {
      if (g.hasToken) {
        const dropY = g.tokenDropY ?? 0;
        // Crisp molten gold ground ring + floating spinning golden crown/halo ABOVE the skeleton's hood!
        pushRing(out, g.x, 0.06, g.z, 0.64, 0.80, 28, 1.65, 1.08, 0.14, 0.88);
        pushRing(out, g.x, 2.22 + g.y + dropY, g.z, 0.38, 0.52, 24, 1.90, 1.28, 0.18, 0.96);
        pushOcta(out, g.x, 2.66 + g.y + dropY + Math.sin(time * 7.5) * 0.08, g.z, 0.22, 0.36, time * 4.8, 2.15, 1.42, 0.22, 0.98);
        if (g.strikeBeam > 0.01) {
          pushSeg(out, g.x, g.z, hero.x, hero.z, 0.12, 0.06, 1.75, 1.15, 0.16, g.strikeBeam * 0.78);
        }
        if (g.slashProg > 0.02) {
          pushSlashArc(out, g.x, g.y, g.z, g.yaw, g.slashProg, 2.1, 1.45, 0.24);
        }
      } else if (g.danger > 0.15) {
        pushRing(out, g.x, 0.06, g.z, 0.56, 0.70, 22, 1.55, 0.12, 0.14, 0.78 * g.danger);
        if (g.strikeBeam > 0.01) {
          pushSeg(out, g.x, g.z, hero.x, hero.z, 0.14, 0.055, 1.65, 0.12, 0.14, g.strikeBeam * 0.72);
        }
        if (g.slashProg > 0.02) {
          pushSlashArc(out, g.x, g.y, g.z, g.yaw, g.slashProg, 1.95, 0.16, 0.18);
        }
      } else {
        pushRing(out, g.x, 0.05, g.z, 0.54, 0.64, 22, 0.18, 0.86, 1.22, 0.62);
      }
    }

    // Flying Golden Attack Token Orb + bright comet trail!
    if (tokenOrb) {
      pushOcta(out, tokenOrb.x, tokenOrb.y, tokenOrb.z, 0.28, 0.38, time * 11, 2.2, 1.45, 0.24, 1.0);
      pushRing(out, tokenOrb.x, tokenOrb.y, tokenOrb.z, 0.36, 0.50, 20, 1.9, 1.24, 0.20, 0.92);
      if (tokenOrb.trail) {
        for (let i = 0; i < tokenOrb.trail.length; i++) {
          const tp = tokenOrb.trail[i];
          const a = (1 - i / tokenOrb.trail.length) * 0.72;
          const sz = 0.14 * (1 - i / tokenOrb.trail.length) + 0.04;
          pushOcta(out, tp.x, tp.y, tp.z, sz, sz, time * 8, 1.9, 1.22, 0.20, a);
        }
      }
    }

    for (const sp of sparks) {
      const a = clamp(sp.life, 0, 1);
      const sz = 0.10 * a + 0.03;
      pushOcta(out, sp.x, sp.y, sp.z, sz, sz * 1.2, time * 8, sp.r * 2.3, sp.g * 2.3, sp.b * 2.3, a);
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

    // 4) HDR Bloom
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

    // 5) ACES Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(progComp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texHdr); gl.uniform1i(uCmp.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texBloomA); gl.uniform1i(uCmp.uBloom, 1);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return { viewProj };
  }

  return { render };
}
