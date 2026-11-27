// Dedicated 3D Twin-Altar Royal Treasure Vault WebGL2 Renderer for "Pity Timer & Pseudo-Random Drops" (#14).
// Studio Overhaul: 1024x1024 PCF dynamic shadows + Marble & Gold Sanctuary with Crimson vs Emerald-Gold Runners +
// TWIN SIDE-BY-SIDE ARTICULATED CHESTS (Left: TRUE 10% RNG with towering 3D Crimson Miss-Stone Stack vs
// Right: HIDDEN PITY + PRD with 3D Radial Pity Charge Arc, tiny capped stack & Golden Sun-Crown Sky Pillars)!
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
import { getPityMeshes } from "../../pity-mesh.js";

const SHADOW_RES = 1024;
export const LEFT_X = -2.55;
export const RIGHT_X = 2.55;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uGoldFlash;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.038, 0.028, 0.062);
  vec3 mid = vec3(0.098, 0.066, 0.105);
  vec3 bot = mix(vec3(0.165, 0.108, 0.080), vec3(0.42, 0.30, 0.10), uGoldFlash * 0.55);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.50, vUv.y));
  col = mix(col, top, smoothstep(0.46, 1.0, vUv.y));
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }
`;

const SHADOW_PROP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=4) in float aPart;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose; // x: yaw, y: lidOpenRad, z: bounceScaleY, w: scale
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos;
  if (int(aPart + 0.5) == 1 && uPose.y != 0.0) {
    vec3 pv = vec3(0.0, 0.82, -0.52);
    p = rotX(p - pv, -uPose.y) + pv;
  }
  p.y *= uPose.z;
  gl_Position = uLightVP * vec4(rotY(p * uPose.w, uPose.x) + uOrigin, 1.0);
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
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vMat; out vec4 vShadow;
void main() {
  vPos = aPos; vNorm = aNorm; vCol = aCol; vMat = aMat;
  vShadow = uLightVP * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vMat; in vec4 vShadow;
uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uGoldFlash;
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
  vec3 N = normalize(vNorm); vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base; float rough = 0.42; vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Polished Royal Vault Marble Checkerboard with subtle gold inlay!
    vec2 cell = floor(vPos.xz * 0.75);
    float chk = mod(cell.x + cell.y, 2.0);
    vec2 f = fract(vPos.xz * 0.75);
    float grout = 1.0 - smoothstep(0.014, 0.038, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base * 0.78, base * 1.18, chk);
    albedo = mix(albedo, vec3(0.24, 0.18, 0.10), grout * 0.55);
    rough = mix(0.24, 0.52, grout);
  } else if (vMat < 1.5) {
    // Burnished Antique Temple Bronze/Gold Trim (subtle sheen, never washes out chests!)
    rough = 0.28;
    emissive = base * (0.04 + uGoldFlash * 0.16);
  } else if (vMat < 2.5) {
    // Flickering Brazier Fire
    float p = 0.86 + 0.14 * sin(uTime * 7.0 + vPos.x * 2.1);
    emissive = vec3(2.1, 1.25, 0.28) * p;
    rough = 0.10;
  } else if (vMat < 3.5) {
    // Velvet Runner Carpets (Crimson left / Emerald right with gold trim!)
    rough = 0.80;
    emissive = base * 0.06;
  } else if (vMat < 4.5) {
    // Carved Marble Columns & Back Sanctuary Wall
    float flute = 0.92 + 0.08 * sin((vPos.x + vPos.z) * 16.0);
    albedo = base * flute;
    rough = 0.44;
  } else {
    // Glowing 3D Miss-Stone Blocks in the Dry-Streak Towers!
    emissive = base * 0.58;
    rough = 0.24;
  }

  vec3 keyDir = normalize(vec3(0.30, 0.88, 0.38));
  float ndl = max(dot(N, keyDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(keyDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.62;
  vec3 amb = mix(vec3(0.12, 0.09, 0.14), vec3(0.36, 0.29, 0.32), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.16, 1.04, 0.90) * ndl * (0.28 + 0.72 * sh))
           + vec3(1.0, 0.92, 0.76) * spec * (0.35 + 0.65 * sh)
           + emissive;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const PROP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose; // x: yaw, y: lidOpenRad, z: bounceScaleY, w: scale
uniform vec4 uTint;
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vRough; out float vGlowMask; out vec4 vShadow;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos, n = aNorm;
  if (int(aPart + 0.5) == 1 && uPose.y != 0.0) {
    vec3 pv = vec3(0.0, 0.82, -0.52);
    p = rotX(p - pv, -uPose.y) + pv;
    n = rotX(n, -uPose.y);
  }
  p.y *= uPose.z;
  vec3 wp = rotY(p * uPose.w, uPose.x) + uOrigin;
  vPos = wp; vNorm = normalize(rotY(n, uPose.x));
  vCol = mix(aCol, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  vRough = aRough;
  vGlowMask = 1.0 - smoothstep(0.45, 0.85, uTint.a);
  vShadow = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const PROP_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vRough; in float vGlowMask; in vec4 vShadow;
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
  vec3 N = normalize(vNorm); vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 keyDir = normalize(vec3(0.30, 0.88, 0.38));
  float ndl = max(dot(N, keyDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(keyDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.76;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2) * 0.42;
  vec3 amb = mix(vec3(0.15, 0.12, 0.16), vec3(0.42, 0.35, 0.36), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.22, 1.12, 0.98) * ndl * (0.36 + 0.64 * sh))
           + vec3(1.0, 0.95, 0.82) * spec * (0.4 + 0.6 * sh)
           + vec3(1.0, 0.82, 0.40) * rim * (0.35 + 0.65 * vGlowMask);
  if (vRough < 0.08) lit += pow(max(vCol, vec3(0.01)), vec3(1.6)) * (0.18 + 1.45 * vGlowMask);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=beam pillar, 1=ring, 2=spark, 3=radial pity arc (vUv.x=angle u, aCol.a=fill)
uniform mat4 uViewProj;
out vec2 vUv; out vec4 vCol; out float vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in float vKind;
out vec4 fragColor;
void main() {
  vec4 c = vCol;
  if (vKind < 0.5) {
    float edge = 1.0 - smoothstep(0.10, 0.50, abs(vUv.x - 0.5));
    float fadeY = 1.0 - smoothstep(0.20, 1.0, vUv.y);
    float a = c.a * edge * fadeY;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.45), clamp(a, 0.0, 0.92));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float ring = smoothstep(0.99, 0.84, r) * smoothstep(0.65, 0.80, r);
    float a = (ring + smoothstep(0.75, 0.0, r) * 0.12) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.4), clamp(a, 0.0, 0.94));
  } else if (vKind < 2.5) {
    vec2 p = vUv * 2.0 - 1.0; float s = smoothstep(1.0, 0.10, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.72), s * c.a);
  } else {
    // 3D Radial Pity Charge Arc around the Right Altar!
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float band = smoothstep(0.99, 0.90, r) * smoothstep(0.70, 0.78, r);
    float ang = fract((atan(p.x, p.y) / 6.2831853) + 0.5);
    float fill = step(ang, c.a);
    vec3 col = mix(vec3(0.18, 0.24, 0.30), mix(c.rgb, vec3(1.0, 0.94, 0.55), c.a * 0.55), fill);
    float a = band * mix(0.28, 0.92, fill);
    if (a < 0.02) discard;
    fragColor = vec4(col, a);
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

function buildStaticVault() {
  const buf = [];
  const floor = [0.24, 0.21, 0.30];
  const stone = [0.30, 0.27, 0.38];
  const gold = [0.94, 0.74, 0.22];
  const crimson = [0.68, 0.14, 0.20];
  const emerald = [0.12, 0.58, 0.44];

  // Marble Vault Floor
  pushBox(buf, -7.8, 7.8, -0.5, 0.0, -5.8, 5.4, floor, 0);
  // Subtle Sanctuary Back Wall + Antique Bronze Crown Molding
  pushBox(buf, -7.8, 7.8, 0.0, 2.35, -6.2, -5.55, stone, 4);
  pushBox(buf, -7.8, 7.8, 2.35, 2.52, -6.28, -5.48, [0.56, 0.42, 0.16], 1);

  // Center Divider Ribbon separating True RNG (Left) vs Hidden Pity (Right)
  pushBox(buf, -0.09, 0.09, 0.0, 0.06, -5.4, 5.2, gold, 1);

  // Crimson Velvet Carpet Runner (Left: True 10% RNG) & Emerald-Gold Carpet Runner (Right: Hidden Pity)
  pushBox(buf, LEFT_X - 1.15, LEFT_X + 1.15, 0.0, 0.03, -4.4, 5.1, crimson, 3);
  pushBox(buf, RIGHT_X - 1.15, RIGHT_X + 1.15, 0.0, 0.03, -4.4, 5.1, emerald, 3);

  // Twin Stepped Marble & Gold Pedestal Altars for the Twin Chests (z = 0.65)
  for (const cx of [LEFT_X, RIGHT_X]) {
    pushBox(buf, cx - 1.55, cx + 1.55, 0.0, 0.24, -0.85, 2.05, stone, 4);
    pushBox(buf, cx - 1.25, cx + 1.25, 0.24, 0.38, -0.55, 1.75, gold, 1);
    // Rear Miss-Tower Plinths at z = -2.45 (where 3D Dry-Streak Miss-Stone Towers stack skyward!)
    pushBox(buf, cx - 0.95, cx + 0.95, 0.0, 0.20, -3.25, -1.75, stone, 4);
    pushBox(buf, cx - 0.85, cx + 0.85, 0.20, 0.28, -3.15, -1.85, gold, 1);
  }

  // 4 Temple Fluted Columns + Flickering Flame Braziers
  for (const [bx, bz] of [[-6.2, -4.2], [6.2, -4.2], [-6.2, 3.6], [6.2, 3.6]]) {
    pushBox(buf, bx - 0.44, bx + 0.44, 0.0, 1.85, bz - 0.44, bz + 0.44, stone, 4);
    pushBox(buf, bx - 0.52, bx + 0.52, 1.85, 2.00, bz - 0.52, bz + 0.52, gold, 1);
    pushBox(buf, bx - 0.28, bx + 0.28, 2.00, 2.38, bz - 0.28, bz + 0.28, [1.0, 0.82, 0.26], 2);
  }
  return new Float32Array(buf);
}

export function createVaultRenderer(gl) {
  const [skyProg, shWorldProg, shPropProg, worldProg, propProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_WORLD_VS, SHADOW_FS],
    [SHADOW_PROP_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [PROP_VS, PROP_FS],
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
    makeOrtho(-10.5, 10.5, -8.5, 8.5, 1.0, 34.0),
    makeLookAt([6.2, 16.5, 6.8], [0, 0.6, -0.5], [0, 1, 0])
  );

  const emptyVao = gl.createVertexArray();
  const staticVault = buildStaticVault();
  const staticVertCount = staticVault.length / 10;

  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, staticVault, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  // Dynamic Miss-Stone Tower VAO (3D glowing frustration stones behind each chest!)
  const towerVao = gl.createVertexArray();
  const towerVbo = gl.createBuffer();
  gl.bindVertexArray(towerVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, towerVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 3600, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  const meshes = getPityMeshes();
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
  const chestGpu = upload(meshes.chest);
  const relicGpu = upload(meshes.relic);

  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 5000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyGold = gl.getUniformLocation(skyProg, "uGoldFlash");
  const uShWVP = gl.getUniformLocation(shWorldProg, "uLightVP");
  const uShPVP = gl.getUniformLocation(shPropProg, "uLightVP");
  const uShPOrig = gl.getUniformLocation(shPropProg, "uOrigin");
  const uShPPose = gl.getUniformLocation(shPropProg, "uPose");

  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWLightVP = gl.getUniformLocation(worldProg, "uLightVP");
  const uWShadow = gl.getUniformLocation(worldProg, "uShadowMap");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uWGold = gl.getUniformLocation(worldProg, "uGoldFlash");

  const uPVP = gl.getUniformLocation(propProg, "uViewProj");
  const uPLightVP = gl.getUniformLocation(propProg, "uLightVP");
  const uPShadow = gl.getUniformLocation(propProg, "uShadowMap");
  const uPOrig = gl.getUniformLocation(propProg, "uOrigin");
  const uPPose = gl.getUniformLocation(propProg, "uPose");
  const uPTint = gl.getUniformLocation(propProg, "uTint");
  const uPCam = gl.getUniformLocation(propProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

  let towerVertCount = 0;
  let lastTowerKey = "";

  function rebuildMissTowers(leftCount, rightCount, pityCap) {
    const buf = [];
    function stackTower(cx, count, isLeft) {
      const n = Math.min(count, 36);
      for (let i = 0; i < n; i++) {
        const colIdx = i % 2;
        const row = Math.floor(i / 2);
        const bx = cx + (colIdx === 0 ? -0.34 : 0.34);
        const bz = -2.50 + ((row % 2) * 0.04 - 0.02);
        const y0 = 0.28 + row * 0.24;
        const y1 = y0 + 0.20;
        const col = isLeft
          ? (i >= 11 ? [0.96, 0.20, 0.28] : [0.82, 0.36, 0.36])
          : (i >= pityCap - 3 ? [0.98, 0.78, 0.20] : [0.20, 0.80, 0.62]);
        pushBox(buf, bx - 0.28, bx + 0.28, y0, y1, bz - 0.28, bz + 0.28, col, 5);
      }
    }
    stackTower(LEFT_X, leftCount, true);
    stackTower(RIGHT_X, rightCount, false);
    const arr = new Float32Array(buf);
    towerVertCount = arr.length / 10;
    if (towerVertCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, towerVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    }
    lastTowerKey = `${leftCount}:${rightCount}:${pityCap}`;
  }

  const fxBuf = [];
  function pushRingXZ(cx, y, cz, rad, col, kind = 1) {
    const [r, g, b, a] = col;
    const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
    fxBuf.push(
      x0, y, z0, 0, 0, r, g, b, a, kind, x1, y, z0, 1, 0, r, g, b, a, kind, x1, y, z1, 1, 1, r, g, b, a, kind,
      x0, y, z0, 0, 0, r, g, b, a, kind, x1, y, z1, 1, 1, r, g, b, a, kind, x0, y, z1, 0, 1, r, g, b, a, kind
    );
  }
  function pushPillar(cx, cz, width, height, right, col) {
    const [r, g, b, a] = col;
    const rx = right[0] * width * 0.5, rz = right[2] * width * 0.5;
    fxBuf.push(
      cx - rx, 0.7, cz - rz, 0, 0, r, g, b, a, 0,
      cx + rx, 0.7, cz + rz, 1, 0, r, g, b, a, 0,
      cx + rx, 0.7 + height, cz + rz, 1, 1, r, g, b, a, 0,
      cx - rx, 0.7, cz - rz, 0, 0, r, g, b, a, 0,
      cx + rx, 0.7 + height, cz + rz, 1, 1, r, g, b, a, 0,
      cx - rx, 0.7 + height, cz - rz, 0, 1, r, g, b, a, 0
    );
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
      const L = state.left;
      const R = state.right;
      const tKey = `${L.maxDryShow}:${R.maxDryShow}:${state.pityCap}`;
      if (tKey !== lastTowerKey) rebuildMissTowers(L.maxDryShow, R.maxDryShow, state.pityCap);

      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);
      const peakGold = Math.max(L.goldFlash, R.goldFlash);

      // 1. Dynamic 1024x1024 PCF Shadow Pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

      gl.useProgram(shWorldProg);
      gl.uniformMatrix4fv(uShWVP, false, lightVP);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, staticVertCount);
      if (towerVertCount > 0) {
        gl.bindVertexArray(towerVao);
        gl.drawArrays(gl.TRIANGLES, 0, towerVertCount);
      }

      gl.useProgram(shPropProg);
      gl.uniformMatrix4fv(uShPVP, false, lightVP);
      gl.bindVertexArray(chestGpu.vao);
      gl.uniform3f(uShPOrig, LEFT_X, 0.38, 0.65);
      gl.uniform4f(uShPPose, 0.14, L.lidOpen * 1.45, 1.0 + L.bounce * 0.16, 1.12);
      gl.drawElements(gl.TRIANGLES, chestGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.uniform3f(uShPOrig, RIGHT_X, 0.38, 0.65);
      gl.uniform4f(uShPPose, -0.14, R.lidOpen * 1.45, 1.0 + R.bounce * 0.16, 1.12);
      gl.drawElements(gl.TRIANGLES, chestGpu.count, gl.UNSIGNED_SHORT, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 2. Sky
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(skyProg); gl.uniform1f(uSkyGold, peakGold);
      gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3. Shadow-Mapped Sanctuary Vault & 3D Dry-Streak Miss-Stone Towers!
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniformMatrix4fv(uWLightVP, false, lightVP);
      gl.uniform1i(uWShadow, 0);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.uniform1f(uWGold, peakGold);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, staticVertCount);
      if (towerVertCount > 0) {
        gl.bindVertexArray(towerVao);
        gl.drawArrays(gl.TRIANGLES, 0, towerVertCount);
      }

      // 4. Twin Articulated Royal Treasure Chests & Floating Drop Relics!
      gl.useProgram(propProg);
      gl.uniformMatrix4fv(uPVP, false, viewProj);
      gl.uniformMatrix4fv(uPLightVP, false, lightVP);
      gl.uniform1i(uPShadow, 0);
      gl.uniform3fv(uPCam, basis.pos);

      const sides = [
        { s: L, x: LEFT_X, yaw: 0.14, tint: [0.95, 0.25, 0.30, 0.10] },
        { s: R, x: RIGHT_X, yaw: -0.14, tint: [1.0, 0.84, 0.24, R.goldFlash * 0.38] },
      ];
      for (const { s, x, yaw, tint } of sides) {
        gl.bindVertexArray(chestGpu.vao);
        gl.uniform3f(uPOrig, x, 0.38, 0.65);
        gl.uniform4f(uPPose, yaw, s.lidOpen * 1.45, 1.0 + s.bounce * 0.16, 1.12);
        gl.uniform4f(uPTint, tint[0], tint[1], tint[2], Math.max(tint[3], s.goldFlash * 0.35));
        gl.drawElements(gl.TRIANGLES, chestGpu.count, gl.UNSIGNED_SHORT, 0);

        if (s.dropPop > 0.01) {
          gl.bindVertexArray(relicGpu.vao);
          const isLeg = s.lastRarity === "LEGENDARY";
          const dropCol = isLeg ? [1.0, 0.84, 0.18, 0.0]
            : s.lastRarity === "RARE" ? [0.18, 0.64, 1.0, 0.92]
            : [0.42, 0.46, 0.56, 0.94];
          const sc = isLeg ? 1.52 : 0.72;
          gl.uniform3f(uPOrig, x, 1.25 + s.dropPop * 1.15 + Math.sin(state.time * 4.0) * 0.07, 0.65);
          gl.uniform4f(uPPose, state.time * 2.6, 0.0, 1.0, sc * clamp(s.dropPop * 1.4, 0, 1));
          gl.uniform4f(uPTint, dropCol[0], dropCol[1], dropCol[2], dropCol[3]);
          gl.drawElements(gl.TRIANGLES, relicGpu.count, gl.UNSIGNED_SHORT, 0);
        }
      }

      // 5. FX: Right Altar 3D Radial Pity Charge Ring + Legendary Sky Light Pillars + Sparks!
      fxBuf.length = 0;
      // Left static 10% ring (tiny crimson slice showing flat 10% NEVER climbs!)
      pushRingXZ(LEFT_X, 0.41, 0.65, 1.65, [0.98, 0.28, 0.36, 0.10], 3);
      // Right live Pity Charge ring (climbs visibly from 2% -> 100% GOLD on every miss!)
      const pityFill = clamp(R.realChance, 0.06, 1.0);
      const pityRingCol = pityFill > 0.85 ? [1.0, 0.86, 0.22, pityFill] : [0.20, 0.94, 0.68, pityFill];
      pushRingXZ(RIGHT_X, 0.41, 0.65, 1.65, pityRingCol, 3);

      // Legendary Golden Light Pillars & Shockwave Rings
      for (const { s, x } of sides) {
        if (s.goldFlash > 0.03) {
          pushPillar(x, 0.65, 2.2, 6.8, basis.right, [1.0, 0.86, 0.24, s.goldFlash * 0.82]);
          pushRingXZ(x, 0.43, 0.65, 1.1 + (1 - s.goldFlash) * 3.4, [1.0, 0.88, 0.30, s.goldFlash * 0.94], 1);
        }
      }

      for (const sp of state.sparks) {
        const a = clamp(sp.life / sp.maxLife, 0, 1);
        pushBillboard(sp.x, sp.y, sp.z, sp.size * (0.4 + 0.6 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a]);
      }

      if (fxBuf.length > 0) {
        gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.useProgram(fxProg); gl.uniformMatrix4fv(uFVP, false, viewProj);
        gl.bindVertexArray(fxVao); gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(fxBuf));
        gl.drawArrays(gl.TRIANGLES, 0, fxBuf.length / 10);
        gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
      }
      gl.bindVertexArray(null);
      return { viewProj, basis };
    },
  };
}
