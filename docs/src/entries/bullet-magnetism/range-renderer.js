// Dedicated 3D Orbital Space Station Firing Range WebGL2 Renderer for "Bullet Magnetism & Aim Assist" (#11).
// Studio Overhaul: 1024x1024 PCF dynamic shadows + brushed titanium firing deck with 5m/10m/15m lanes +
// architectural side bulkheads, corner holo-pillars & overhead spotlight pools + Blender Subsurf Turret & Target Bots,
// translucent 3D Magnetism Bubble Halos, glowing curved plasma arcs vs dashed straight raw-miss rays!
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
import { getMagnetMeshes } from "../../magnet-mesh.js";

const SHADOW_RES = 1024;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.025, 0.036, 0.082);
  vec3 mid = vec3(0.058, 0.068, 0.145);
  vec3 bot = vec3(0.105, 0.064, 0.140);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, top, smoothstep(0.46, 1.0, vUv.y));
  // Subtle orbital nebula band + crisp star twinkle
  float band = exp(-pow((vUv.y - 0.62 + 0.08 * sin(vUv.x * 4.5)) * 7.5, 2.0));
  col += vec3(0.06, 0.11, 0.22) * band;
  vec2 g = floor(vUv * vec2(140.0, 78.0));
  float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
  if (h > 0.992 && vUv.y > 0.30) {
    float tw = 0.55 + 0.45 * sin(uTime * 2.6 + h * 90.0);
    col += vec3(0.82, 0.92, 1.0) * tw * 0.60;
  }
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }
`;

const SHADOW_UNIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=4) in float aPart;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: recoilZ, z: hitTilt, w: scale
uniform float uIsTurret;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos;
  int part = int(aPart + 0.5);
  if (uIsTurret > 0.5) {
    if (part == 1) { p.z -= uPose.y; p = rotY(p, uPose.x); }
  } else {
    if (uPose.z != 0.0) {
      vec3 pv = vec3(0.0, 0.22, 0.0);
      p = rotX(p - pv, uPose.z) + pv;
    }
    p = rotY(p, uPose.x);
  }
  gl_Position = uLightVP * vec4(p * uPose.w + uOrigin, 1.0);
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
out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0020 * (1.0 - ndl), 0.0008);
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
  float rough = 0.42;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Sleek brushed titanium range deck with subtle panel seams, soft warm spotlight pools & hazard borders!
    vec2 cell = floor(vPos.xz * 0.5);
    float chk = mod(cell.x + cell.y, 2.0);
    vec2 f = fract(vPos.xz * 0.5);
    float seam = 1.0 - smoothstep(0.012, 0.032, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base * 0.88, base * 1.12, chk);
    albedo = mix(albedo, vec3(0.08, 0.12, 0.20), seam * 0.55);
    // Warm overhead bay spotlights over the 3 range lanes
    float spot1 = exp(-pow(vPos.z + 4.2, 2.0) * 0.25) * exp(-vPos.x * vPos.x * 0.025);
    float spot2 = exp(-pow(vPos.z + 1.6, 2.0) * 0.25) * exp(-vPos.x * vPos.x * 0.035);
    float spot3 = exp(-pow(vPos.z - 0.9, 2.0) * 0.25) * exp(-vPos.x * vPos.x * 0.025);
    float padSpot = exp(-dot(vPos.xz - vec2(0.0, 4.9), vPos.xz - vec2(0.0, 4.9)) * 0.16);
    emissive += vec3(0.06, 0.12, 0.20) * (spot1 + spot2 * 1.35 + spot3) + vec3(0.05, 0.16, 0.22) * padSpot;
    // Crisp cyan grid pulse along center lane
    float centerGuide = 1.0 - smoothstep(0.02, 0.06, abs(vPos.x));
    emissive += vec3(0.06, 0.36, 0.52) * centerGuide * 0.35;
    rough = mix(0.32, 0.56, seam);
  } else if (vMat < 1.5) {
    // Architectural armored range walls with horizontal ribbed paneling
    float rib = smoothstep(0.05, 0.12, abs(fract(vPos.y * 2.2) - 0.5));
    float colJoint = smoothstep(0.03, 0.07, abs(fract(vPos.x * 0.35) - 0.5));
    albedo = base * mix(0.76, 1.06, rib) * mix(0.84, 1.0, colJoint);
    rough = 0.44;
  } else if (vMat < 2.5) {
    // Emissive range track & holo accent strip
    float pulse = 0.88 + 0.12 * sin(uTime * 3.8 + vPos.x * 0.9);
    emissive = base * 1.45 * pulse;
    rough = 0.14;
  } else {
    // Industrial amber-black safety chevron trim!
    float diag = fract((vPos.x + vPos.z) * 1.15);
    float stripe = step(0.5, diag);
    albedo = mix(vec3(0.05, 0.06, 0.09), vec3(0.92, 0.58, 0.08), stripe);
    emissive = vec3(0.18, 0.10, 0.01) * stripe;
    rough = 0.38;
  }

  vec3 keyDir = normalize(vec3(0.32, 0.88, 0.36));
  float ndl = max(dot(N, keyDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(keyDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.58;

  vec3 amb = mix(vec3(0.09, 0.10, 0.17), vec3(0.28, 0.33, 0.48), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.12, 1.08, 1.16) * ndl * (0.28 + 0.72 * sh))
           + vec3(0.96, 0.98, 1.12) * spec * sh
           + emissive;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const UNIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: recoilZ, z: hitTilt, w: scale
uniform vec4 uFlash;  // rgb + strength
uniform float uIsTurret;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out vec4 vShadow;

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }

void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  int part = int(aPart + 0.5);

  if (uIsTurret > 0.5) {
    if (part == 1) {
      p.z -= uPose.y;
      p = rotY(p, uPose.x);
      n = rotY(n, uPose.x);
    }
  } else {
    if (uPose.z != 0.0) {
      vec3 pv = vec3(0.0, 0.22, 0.0);
      p = rotX(p - pv, uPose.z) + pv;
      n = rotX(n, uPose.z);
    }
    p = rotY(p, uPose.x);
    n = rotY(n, uPose.x);
  }

  vec3 wp = p * uPose.w + uOrigin;
  vPos = wp;
  vNorm = normalize(n);
  vCol = mix(aCol, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  vRough = aRough;
  vShadow = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const UNIT_FS = `#version 300 es
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
  vec3 keyDir = normalize(vec3(0.32, 0.88, 0.36));
  float ndl = max(dot(N, keyDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(keyDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 76.0, 1.0 - rough)) * (1.0 - rough) * 0.72;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2) * 0.50;
  vec3 amb = mix(vec3(0.14, 0.15, 0.24), vec3(0.42, 0.46, 0.62), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.22, 1.18, 1.24) * ndl * (0.36 + 0.64 * sh))
           + vec3(0.98, 1.00, 1.12) * spec * (0.4 + 0.6 * sh)
           + vec3(0.42, 0.72, 1.00) * rim;
  if (vRough < 0.08 && vCol.r > 0.85 && vCol.g < 0.45) lit += vec3(2.3, 0.25, 0.48);
  if (vRough < 0.08 && vCol.b > 0.85 && vCol.g > 0.80) lit += vec3(0.18, 1.95, 2.4);
  if (vRough < 0.08 && vCol.r > 0.90 && vCol.g > 0.75) lit += vec3(2.2, 1.65, 0.24);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=solid beam, 1=halo ring, 2=orb/spark, 3=magnetism cone, 4=dashed beam
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
    float edge = 1.0 - smoothstep(0.24, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.56), clamp(a, 0.0, 0.98));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.86, r) * smoothstep(0.72, 0.85, r);
    float fill = smoothstep(0.84, 0.0, r) * (0.13 + 0.05 * sin(r * 18.0 - uTime * 7.0));
    float a = (ring + fill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.36), clamp(a, 0.0, 0.94));
  } else if (vKind < 2.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.12, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.72), s * c.a);
  } else if (vKind < 3.5) {
    float distFade = 1.0 - smoothstep(0.18, 1.0, vUv.y);
    float border = 1.0 - smoothstep(0.012, 0.075, min(vUv.x, 1.0 - vUv.x));
    float a = c.a * distFade * (0.16 + 0.68 * border);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), border * 0.42), clamp(a, 0.0, 0.86));
  } else {
    // Crisp dashed raw-aim miss ray!
    float edge = 1.0 - smoothstep(0.24, 0.50, abs(vUv.x - 0.5));
    float dash = smoothstep(0.32, 0.44, fract(vUv.y * 12.0));
    float a = c.a * edge * dash;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.32), clamp(a, 0.0, 0.92));
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
    for (const v of [a, b, c, a, c, d]) {
      buf.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], matId);
    }
  }
}

function buildRangeWorld() {
  const buf = [];
  const deck = [0.22, 0.26, 0.36];
  const wall = [0.28, 0.32, 0.44];
  const trim = [0.16, 0.19, 0.27];
  const rose = [0.96, 0.24, 0.46];
  const cyan = [0.16, 0.88, 1.0];

  // Brushed titanium firing deck
  pushBox(buf, -8.4, 8.4, -0.5, 0.0, -6.8, 6.6, deck, 0);
  // Safety chevron firing line + rear hazard sill
  pushBox(buf, -7.6, 7.6, 0.0, 0.05, 3.10, 3.42, [1, 0.7, 0.1], 3);
  pushBox(buf, -7.6, 7.6, 0.0, 0.05, -6.45, -6.15, [1, 0.7, 0.1], 3);

  // Armored rear backstop wall with buttress pillars & top light bar
  pushBox(buf, -8.4, 8.4, 0.0, 2.35, -7.35, -6.55, wall, 1);
  for (const px of [-7.6, -3.8, 0.0, 3.8, 7.6]) {
    pushBox(buf, px - 0.36, px + 0.36, 0.0, 2.65, -6.62, -6.18, trim, 1);
    pushBox(buf, px - 0.12, px + 0.12, 0.30, 2.35, -6.20, -6.12, cyan, 2);
  }
  pushBox(buf, -7.9, 7.9, 2.20, 2.36, -6.62, -6.46, rose, 2);

  // Side armored range walls + spaced holo pylons
  pushBox(buf, -8.4, -7.75, 0.0, 1.35, -6.55, 6.6, wall, 1);
  pushBox(buf,  7.75,  8.4, 0.0, 1.35, -6.55, 6.6, wall, 1);
  for (const sz of [-4.2, -1.6, 0.9, 3.5]) {
    for (const sx of [-7.72, 7.72]) {
      pushBox(buf, sx - 0.24, sx + 0.24, 0.0, 1.75, sz - 0.24, sz + 0.24, trim, 1);
      pushBox(buf, sx - 0.10, sx + 0.10, 1.50, 1.72, sz - 0.10, sz + 0.10, cyan, 2);
    }
  }

  // Glowing laser rail tracks for the 3 target distance lanes (15m / 10m / 5m)
  for (const tz of [-4.2, -1.6, 0.9]) {
    pushBox(buf, -6.9, 6.9, 0.0, 0.06, tz - 0.18, tz + 0.18, trim, 1);
    pushBox(buf, -6.8, 6.8, 0.04, 0.09, tz - 0.07, tz + 0.07, cyan, 2);
  }

  // Elevated hexagonal-feel Turret Firing Pad at (0, 4.9)
  pushBox(buf, -1.55, 1.55, 0.0, 0.11, 3.75, 6.05, [0.28, 0.32, 0.44], 1);
  pushBox(buf, -1.60, 1.60, 0.07, 0.13, 3.70, 3.84, cyan, 2);
  return new Float32Array(buf);
}

export function createRangeRenderer(gl) {
  const [skyProg, shWorldProg, shUnitProg, worldProg, unitProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_WORLD_VS, SHADOW_FS],
    [SHADOW_UNIT_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [UNIT_VS, UNIT_FS],
    [FX_VS, FX_FS],
  ]);

  // 1024x1024 PCF Shadow Map FBO
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
    makeOrtho(-11.0, 11.0, -9.8, 9.8, 1.0, 34.0),
    makeLookAt([6.2, 16.5, 6.6], [0, 0, -0.4], [0, 1, 0])
  );

  const emptyVao = gl.createVertexArray();
  const worldData = buildRangeWorld();
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

  const meshes = getMagnetMeshes();
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
  const turretGpu = upload(meshes.turret);
  const targetGpu = upload(meshes.target);

  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 6500, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyTime = gl.getUniformLocation(skyProg, "uTime");
  const uShWVP = gl.getUniformLocation(shWorldProg, "uLightVP");
  const uShUVP = gl.getUniformLocation(shUnitProg, "uLightVP");
  const uShUOrig = gl.getUniformLocation(shUnitProg, "uOrigin");
  const uShUPose = gl.getUniformLocation(shUnitProg, "uPose");
  const uShUTurret = gl.getUniformLocation(shUnitProg, "uIsTurret");

  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWLightVP = gl.getUniformLocation(worldProg, "uLightVP");
  const uWShadow = gl.getUniformLocation(worldProg, "uShadowMap");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");

  const uUVP = gl.getUniformLocation(unitProg, "uViewProj");
  const uULightVP = gl.getUniformLocation(unitProg, "uLightVP");
  const uUShadow = gl.getUniformLocation(unitProg, "uShadowMap");
  const uUOrig = gl.getUniformLocation(unitProg, "uOrigin");
  const uUPose = gl.getUniformLocation(unitProg, "uPose");
  const uUFlash = gl.getUniformLocation(unitProg, "uFlash");
  const uUTurret = gl.getUniformLocation(unitProg, "uIsTurret");
  const uUCam = gl.getUniformLocation(unitProg, "uCamPos");

  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");
  const uFTime = gl.getUniformLocation(fxProg, "uTime");

  const fxBuf = [];
  function pushBeam(x0, y0, z0, x1, y1, z1, width, col, kind = 0) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * width * 0.5, pz = (dx / l) * width * 0.5;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, kind,
      x0 + px, y0, z0 + pz, 1, 0, r, g, b, a, kind,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, kind,
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, kind,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, kind,
      x1 - px, y1, z1 - pz, 0, 1, r, g, b, a, kind
    );
  }
  function pushRingXZ(cx, y, cz, rad, col) {
    const [r, g, b, a] = col;
    const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
    fxBuf.push(
      x0, y, z0, 0, 0, r, g, b, a, 1,
      x1, y, z0, 1, 0, r, g, b, a, 1,
      x1, y, z1, 1, 1, r, g, b, a, 1,
      x0, y, z0, 0, 0, r, g, b, a, 1,
      x1, y, z1, 1, 1, r, g, b, a, 1,
      x0, y, z1, 0, 1, r, g, b, a, 1
    );
  }
  function pushBillboard(cx, cy, cz, rad, right, up, col, kind = 2) {
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
  function pushCone(ox, y, oz, aimYaw, halfRad, len, col) {
    const [r, g, b, a] = col;
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs;
      const a0 = aimYaw - halfRad + u0 * halfRad * 2;
      const a1 = aimYaw - halfRad + u1 * halfRad * 2;
      const x0 = ox + Math.sin(a0) * len, z0 = oz + Math.cos(a0) * len;
      const x1 = ox + Math.sin(a1) * len, z1 = oz + Math.cos(a1) * len;
      fxBuf.push(
        ox, y, oz, 0.5 * (u0 + u1), 0, r, g, b, a, 3,
        x0, y, z0, u0, 1, r, g, b, a, 3,
        x1, y, z1, u1, 1, r, g, b, a, 3
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

      // 1. Dynamic 1024x1024 PCF Shadow Pass (World + Turret + All 4 Strafing Target Bots!)
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

      gl.useProgram(shUnitProg);
      gl.uniformMatrix4fv(uShUVP, false, lightVP);
      gl.bindVertexArray(turretGpu.vao);
      gl.uniform1f(uShUTurret, 1.0);
      gl.uniform3f(uShUOrig, state.turret.x, 0.11, state.turret.z);
      gl.uniform4f(uShUPose, state.turret.yaw, state.turret.recoil, 0.0, 1.24);
      gl.drawElements(gl.TRIANGLES, turretGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(targetGpu.vao);
      gl.uniform1f(uShUTurret, 0.0);
      for (const tg of state.targets) {
        const hoverY = 0.12 + Math.sin(state.time * 3.0 + tg.id) * 0.06;
        gl.uniform3f(uShUOrig, tg.x, hoverY, tg.z);
        gl.uniform4f(uShUPose, Math.PI, 0.0, tg.hitTilt, 1.08);
        gl.drawElements(gl.TRIANGLES, targetGpu.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 2. Sky Backdrop
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyTime, state.time);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3. Shadow-Mapped Range World
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniformMatrix4fv(uWLightVP, false, lightVP);
      gl.uniform1i(uWShadow, 0);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // 4. Orbital Railgun Turret & Strafing Combat Target Bots (facing +Z toward turret!)
      gl.useProgram(unitProg);
      gl.uniformMatrix4fv(uUVP, false, viewProj);
      gl.uniformMatrix4fv(uULightVP, false, lightVP);
      gl.uniform1i(uUShadow, 0);
      gl.uniform3fv(uUCam, basis.pos);

      gl.bindVertexArray(turretGpu.vao);
      gl.uniform1f(uUTurret, 1.0);
      gl.uniform3f(uUOrig, state.turret.x, 0.11, state.turret.z);
      gl.uniform4f(uUPose, state.turret.yaw, state.turret.recoil, 0.0, 1.24);
      gl.uniform4f(uUFlash, 0.16, 0.94, 1.0, state.turret.recoil * 0.45);
      gl.drawElements(gl.TRIANGLES, turretGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(targetGpu.vao);
      gl.uniform1f(uUTurret, 0.0);
      for (const tg of state.targets) {
        const hoverY = 0.12 + Math.sin(state.time * 3.0 + tg.id) * 0.06;
        gl.uniform3f(uUOrig, tg.x, hoverY, tg.z);
        gl.uniform4f(uUPose, Math.PI, 0.0, tg.hitTilt, 1.08);
        gl.uniform4f(uUFlash, 1.0, 0.96, 0.72, tg.flash);
        gl.drawElements(gl.TRIANGLES, targetGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // 5. Dynamic FX: Hover Glows, Magnetism Cone, Target Halos, Dashed Raw-Miss Rays vs Curved Plasma Arcs!
      fxBuf.length = 0;
      const tur = state.turret;
      for (const tg of state.targets) {
        pushRingXZ(tg.x, 0.04, tg.z, 0.56, [0.16, 0.88, 1.0, 0.42]);
      }

      if (state.showOverlay) {
        const lx = tur.x + Math.sin(tur.yaw) * 11.4;
        const lz = tur.z + Math.cos(tur.yaw) * 11.4;
        pushBeam(
          tur.x + Math.sin(tur.yaw) * 1.1, 1.15, tur.z + Math.cos(tur.yaw) * 1.1,
          lx, 1.15, lz,
          0.075,
          state.assistOn ? [0.98, 0.36, 0.46, 0.72] : [0.98, 0.32, 0.38, 0.82],
          4
        );
        if (state.assistOn) {
          pushCone(tur.x, 0.16, tur.z, tur.yaw, state.magnetRad, 11.4, [0.96, 0.28, 0.60, 0.52]);
          for (const tg of state.targets) {
            pushBillboard(tg.x, 1.32, tg.z, state.magnetBubbleR, basis.right, basis.up, [0.98, 0.30, 0.62, 0.68], 1);
          }
        } else {
          for (const tg of state.targets) {
            pushBillboard(tg.x, 1.32, tg.z, 0.48, basis.right, basis.up, [0.72, 0.82, 0.94, 0.54], 1);
          }
        }
      }

      // Muzzle flash glow at barrel tip when firing
      if (tur.recoil > 0.08) {
        const mx = tur.x + Math.sin(tur.yaw) * 1.55;
        const mz = tur.z + Math.cos(tur.yaw) * 1.55;
        pushBillboard(mx, 1.14, mz, 0.48 * (tur.recoil / 0.34), basis.right, basis.up, [0.22, 0.96, 1.0, 0.92], 2);
      }

      // Persistent Shot Trajectory Ribbons: Dashed Crimson "YOUR AIM" vs Thick Electric Cyan "MAGNET CURVE"!
      for (const tr of state.trails) {
        const a = clamp(tr.life / tr.maxLife, 0, 1);
        if (state.showOverlay) {
          pushBeam(tr.sx, 1.14, tr.sz, tr.rawEx, 1.14, tr.rawEz, 0.085, [1.0, 0.34, 0.42, a * 0.82], 4);
          if (tr.magnetized || !tr.hit) {
            pushBillboard(tr.rawEx, 1.14, tr.rawEz, 0.34, basis.right, basis.up, [1.0, 0.30, 0.38, a * 0.78], 1);
          }
        }
        const pts = tr.points;
        const col = tr.magnetized
          ? [0.16, 0.96, 1.0, a * 0.98]
          : (tr.hit ? [0.24, 1.0, 0.64, a * 0.92] : [1.0, 0.34, 0.40, a * 0.86]);
        const bw = tr.magnetized ? 0.19 : 0.11;
        for (let i = 0; i < pts.length - 1; i++) {
          pushBeam(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], bw, col, 0);
        }
      }

      for (const b of state.bolts) {
        pushBillboard(b.x, b.y, b.z, 0.34, basis.right, basis.up, b.magnetized ? [0.22, 0.98, 1.0, 0.98] : [1.0, 0.42, 0.52, 0.96], 2);
      }

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
