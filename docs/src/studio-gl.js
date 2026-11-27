// Shared Studio WebGL2 PCF-Shadow & FX Engine for Game Design Codex dioramas (#15+).
// Provides 1024x1024 3x3 PCF shadow maps, Linear PBR + ACES filmic shading, Blender mesh rendering
// (with articulated limbs + translucent ghost/wire overlay support), dynamic 3D FX (beams, dashed lines,
// rings, X-Ray boxes, cones, sparks), and crisp world-space 3D callout pills + mobile-safe HUD shell!
import {
  clamp,
  makeLookAt,
  makePerspective,
  makeOrtho,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "./gl-utils.js";

const SHADOW_RES = 1024;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uBot;
out vec4 fragColor;
void main() {
  vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.50, vUv.y));
  col = mix(col, uTop, smoothstep(0.46, 1.0, vUv.y));
  fragColor = vec4(col, 1.0);
}
`;

const SHADOW_WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }
`;

const SHADOW_MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=4) in float aPart;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: partAnimA, z: partAnimB, w: scale
uniform vec4 uPivot;  // xyz: part1 pivot, w: animMode (0=none, 1=turretRecoil, 2=walkLegs, 3=swingY, 4=rollX)
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos;
  int part = int(aPart + 0.5);
  int mode = int(uPivot.w + 0.5);
  if (mode == 1 && part == 1) { p.z -= uPose.y; p = rotY(p, uPose.x); }
  else {
    if (mode == 2) {
      float sw = sin(uPose.y) * 0.58 * uPose.z;
      if (part == 1) { vec3 pv = vec3(0.12, 0.54, 0.0); p = rotX(p - pv, sw) + pv; }
      else if (part == 2) { vec3 pv = vec3(-0.12, 0.54, 0.0); p = rotX(p - pv, -sw) + pv; }
      p.y += abs(sin(uPose.y)) * 0.05 * uPose.z;
    } else if (mode == 3 && part == 1) {
      p = rotY(p - uPivot.xyz, uPose.y) + uPivot.xyz;
    } else if (mode == 4) {
      vec3 pv = vec3(0.0, 0.72, 0.0);
      p = rotX(p - pv, uPose.y) + pv;
    } else if (mode == 5) {
      p = rotX(p - uPivot.xyz, uPose.y) + uPivot.xyz;
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
uniform vec3 uLightDir;
uniform vec3 uAmbLow;
uniform vec3 uAmbHigh;
out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0022 * (1.0 - ndl), 0.0008);
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
  float rough = 0.48;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // 0: Clean tiled floor with crisp panel grout
    vec2 cell = floor(vPos.xz * 0.8);
    float chk = mod(cell.x + cell.y, 2.0);
    vec2 f = fract(vPos.xz * 0.8);
    float grout = 1.0 - smoothstep(0.014, 0.036, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base * 0.90, base * 1.10, chk);
    albedo = mix(albedo, base * 0.42, grout * 0.55);
    rough = mix(0.36, 0.62, grout);
  } else if (vMat < 1.5) {
    // 1: Brick / stone masonry wall
    if (N.y > 0.7) {
      albedo = base * 1.06;
      rough = 0.54;
    } else {
      float row = floor(vPos.y * 3.8);
      float bx = fract((vPos.x + vPos.z) * 1.2 + mod(row, 2.0) * 0.5);
      float by = fract(vPos.y * 3.8);
      float m = 1.0 - smoothstep(0.03, 0.075, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
      albedo = mix(base * 1.05, base * 0.36, m * 0.62);
      rough = 0.62;
    }
  } else if (vMat < 2.5) {
    // 2: Emissive neon / torch / goal accent
    float p = 0.86 + 0.14 * sin(uTime * 5.0 + vPos.x * 1.2);
    emissive = base * 1.25 * p;
    rough = 0.14;
  } else if (vMat < 3.5) {
    // 3: Shimmering sunlit ocean water
    float w = sin(vPos.x * 2.2 + uTime * 2.4) * cos(vPos.z * 2.0 - uTime * 1.9);
    albedo = base * (0.90 + 0.14 * w);
    emissive = vec3(0.04, 0.24, 0.32) * smoothstep(0.35, 0.95, w);
    rough = 0.16;
  } else if (vMat < 4.5) {
    // 4: Organic grass / wood / matte matte terrain
    float g = 0.92 + 0.08 * sin(vPos.x * 4.5 + vPos.z * 3.7);
    albedo = base * g;
    rough = 0.76;
  } else {
    // 5: Safety chevron trim
    float stripe = step(0.5, fract((vPos.x + vPos.z) * 1.25));
    albedo = mix(vec3(0.05, 0.06, 0.09), vec3(0.92, 0.62, 0.08), stripe);
    rough = 0.42;
  }

  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.56;
  vec3 amb = mix(uAmbLow, uAmbHigh, N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.14, 1.10, 1.06) * ndl * (0.28 + 0.72 * sh))
           + vec3(1.0, 0.98, 0.94) * spec * (0.35 + 0.65 * sh)
           + emissive;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: partAnimA, z: partAnimB, w: scale
uniform vec4 uPivot;  // xyz: part1 pivot, w: animMode
uniform vec4 uTint;   // rgb + mix strength
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vRough; out vec4 vShadow;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos, n = aNorm;
  int part = int(aPart + 0.5);
  int mode = int(uPivot.w + 0.5);
  if (mode == 1 && part == 1) {
    p.z -= uPose.y; p = rotY(p, uPose.x); n = rotY(n, uPose.x);
  } else {
    if (mode == 2) {
      float sw = sin(uPose.y) * 0.58 * uPose.z;
      if (part == 1) { vec3 pv = vec3(0.12, 0.54, 0.0); p = rotX(p - pv, sw) + pv; n = rotX(n, sw); }
      else if (part == 2) { vec3 pv = vec3(-0.12, 0.54, 0.0); p = rotX(p - pv, -sw) + pv; n = rotX(n, -sw); }
      p.y += abs(sin(uPose.y)) * 0.05 * uPose.z;
    } else if (mode == 3 && part == 1) {
      p = rotY(p - uPivot.xyz, uPose.y) + uPivot.xyz;
      n = rotY(n, uPose.y);
    } else if (mode == 4) {
      vec3 pv = vec3(0.0, 0.72, 0.0);
      p = rotX(p - pv, uPose.y) + pv;
      n = rotX(n, uPose.y);
    } else if (mode == 5) {
      p = rotX(p - uPivot.xyz, uPose.y) + uPivot.xyz;
      n = rotX(n, uPose.y);
    }
    p = rotY(p, uPose.x);
    n = rotY(n, uPose.x);
  }
  vec3 wp = p * uPose.w + uOrigin;
  vPos = wp;
  vNorm = normalize(n);
  vCol = mix(aCol, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  vRough = aRough;
  vShadow = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vRough; in vec4 vShadow;
uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform vec3 uLightDir;
uniform vec3 uAmbLow;
uniform vec3 uAmbHigh;
uniform float uAlpha;
out vec4 fragColor;

float calcShadow(vec4 sp, float ndl) {
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0024 * (1.0 - ndl), 0.0009);
  return (p.z - bias <= texture(uShadowMap, p.xy).r) ? 1.0 : 0.0;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(L + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.68;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2) * 0.48;
  vec3 amb = mix(uAmbLow, uAmbHigh, N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.18, 1.14, 1.12) * ndl * (0.35 + 0.65 * sh))
           + vec3(1.0, 0.98, 0.95) * spec * (0.4 + 0.6 * sh)
           + mix(vec3(0.42, 0.72, 1.0), base * 1.4, 1.0 - uAlpha) * rim;
  if (vRough < 0.08 && uAlpha > 0.85) lit += pow(max(vCol, vec3(0.01)), vec3(1.5)) * 1.75;
  if (uAlpha < 0.95) lit += base * 0.75;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), uAlpha);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=solid beam, 1=ring, 2=orb/spark, 3=cone, 4=dashed beam, 5=xray box face
uniform mat4 uViewProj;
out vec2 vUv; out vec4 vCol; out float vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in float vKind;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec4 c = vCol;
  if (vKind < 0.5) {
    float edge = 1.0 - smoothstep(0.24, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.45), clamp(a, 0.0, 0.96));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.85, r) * smoothstep(0.68, 0.82, r);
    float fill = smoothstep(0.80, 0.0, r) * 0.12;
    float a = (ring + fill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.38), clamp(a, 0.0, 0.94));
  } else if (vKind < 2.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float s = smoothstep(1.0, 0.10, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.72), s * c.a);
  } else if (vKind < 3.5) {
    float distFade = 1.0 - smoothstep(0.15, 1.0, vUv.y);
    float border = 1.0 - smoothstep(0.015, 0.075, min(vUv.x, 1.0 - vUv.x));
    float a = c.a * distFade * (0.20 + 0.70 * border);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), border * 0.42), clamp(a, 0.0, 0.88));
  } else if (vKind < 4.5) {
    float edge = 1.0 - smoothstep(0.24, 0.50, abs(vUv.x - 0.5));
    float dash = smoothstep(0.30, 0.44, fract(vUv.y * 12.0));
    float a = c.a * edge * dash;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.30), clamp(a, 0.0, 0.92));
  } else {
    // 5: Crisp translucent 3D X-Ray Box Face (bright glowing wireframe border + subtle tinted interior!)
    float border = 1.0 - smoothstep(0.035, 0.095, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float a = c.a * (0.18 + 0.82 * border);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), border * 0.45), clamp(a, 0.0, 0.95));
  }
}
`;

export function pushBox(buf, x0, x1, y0, y1, z0, z1, col, matId) {
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

export function projectToScreen(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
}

export function drawWorldPill(ctx, x, y, text, color, cssW, cssH, fontPx = 10.5) {
  ctx.save();
  ctx.font = `800 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 14;
  const ph = fontPx + 10;
  const px = clamp(x - pw * 0.5, 8, cssW - pw - 8);
  const py = clamp(y - ph * 0.5, 56, cssH - ph - 8);
  ctx.fillStyle = "rgba(10, 13, 26, 0.90)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, px + pw * 0.5, py + ph * 0.5 + 0.5);
  ctx.restore();
}

export function drawBanner(ctx, text, color, timer, cssW) {
  if (document.body.classList.contains("no-hud") || timer <= 0 || !text) return;
  const a = clamp(timer / 0.35, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  const tw = ctx.measureText(text).width;
  const bw = Math.min(cssW - 24, tw + 26);
  const bx = (cssW - bw) * 0.5;
  const by = cssW < 640 ? 86 : 74;
  ctx.fillStyle = "rgba(10, 13, 26, 0.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 30, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cssW * 0.5, by + 15.5, bw - 16);
  ctx.restore();
}

export function drawMobilePill(ctx, text, color, cssW) {
  const hdrBottom = document.querySelector("header")?.getBoundingClientRect().bottom || 52;
  const py = Math.max(54, Math.round(hdrBottom) + 6);
  ctx.save();
  ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  const tw = Math.min(cssW - 18, ctx.measureText(text).width + 18);
  const px = (cssW - tw) * 0.5;
  ctx.fillStyle = "rgba(10, 13, 26, 0.88)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(px, py, tw, 24, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cssW * 0.5, py + 12.5, tw - 12);
  ctx.restore();
}

export function createStudioRenderer(gl, {
  skyTop = [0.025, 0.036, 0.075],
  skyMid = [0.058, 0.072, 0.135],
  skyBot = [0.100, 0.075, 0.135],
  lightDir = [0.34, 0.88, 0.34],
  ambLow = [0.11, 0.12, 0.19],
  ambHigh = [0.34, 0.38, 0.52],
  orthoHalf = 11.5,
  lightPos = [6.6, 17.0, 6.6],
  lightTarget = [0, 0, 0],
  maxWorldVerts = 28000,
  maxFxVerts = 14000,
} = {}) {
  const [skyProg, shWorldProg, shMeshProg, worldProg, meshProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_WORLD_VS, SHADOW_FS],
    [SHADOW_MESH_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [MESH_VS, MESH_FS],
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
    makeOrtho(-orthoHalf, orthoHalf, -orthoHalf * 0.86, orthoHalf * 0.86, 1.0, 38.0),
    makeLookAt(lightPos, lightTarget, [0, 1, 0])
  );

  const emptyVao = gl.createVertexArray();
  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * maxWorldVerts, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * maxFxVerts, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const U = {
    skyTop: gl.getUniformLocation(skyProg, "uTop"),
    skyMid: gl.getUniformLocation(skyProg, "uMid"),
    skyBot: gl.getUniformLocation(skyProg, "uBot"),
    shWVP: gl.getUniformLocation(shWorldProg, "uLightVP"),
    shMVP: gl.getUniformLocation(shMeshProg, "uLightVP"),
    shMOrig: gl.getUniformLocation(shMeshProg, "uOrigin"),
    shMPose: gl.getUniformLocation(shMeshProg, "uPose"),
    shMPiv: gl.getUniformLocation(shMeshProg, "uPivot"),
    wVP: gl.getUniformLocation(worldProg, "uViewProj"),
    wLVP: gl.getUniformLocation(worldProg, "uLightVP"),
    wSh: gl.getUniformLocation(worldProg, "uShadowMap"),
    wCam: gl.getUniformLocation(worldProg, "uCamPos"),
    wTime: gl.getUniformLocation(worldProg, "uTime"),
    wLDir: gl.getUniformLocation(worldProg, "uLightDir"),
    wALow: gl.getUniformLocation(worldProg, "uAmbLow"),
    wAHigh: gl.getUniformLocation(worldProg, "uAmbHigh"),
    mVP: gl.getUniformLocation(meshProg, "uViewProj"),
    mLVP: gl.getUniformLocation(meshProg, "uLightVP"),
    mSh: gl.getUniformLocation(meshProg, "uShadowMap"),
    mOrig: gl.getUniformLocation(meshProg, "uOrigin"),
    mPose: gl.getUniformLocation(meshProg, "uPose"),
    mPiv: gl.getUniformLocation(meshProg, "uPivot"),
    mTint: gl.getUniformLocation(meshProg, "uTint"),
    mAlpha: gl.getUniformLocation(meshProg, "uAlpha"),
    mCam: gl.getUniformLocation(meshProg, "uCamPos"),
    mLDir: gl.getUniformLocation(meshProg, "uLightDir"),
    mALow: gl.getUniformLocation(meshProg, "uAmbLow"),
    mAHigh: gl.getUniformLocation(meshProg, "uAmbHigh"),
    fVP: gl.getUniformLocation(fxProg, "uViewProj"),
    fTime: gl.getUniformLocation(fxProg, "uTime"),
  };

  let worldVertCount = 0;
  const fxBuf = [];

  function uploadMesh(m) {
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
    gl.bindVertexArray(null);
    return { vao, count: m.indices.length };
  }

  function setWorldData(arr) {
    const f = arr instanceof Float32Array ? arr : new Float32Array(arr);
    worldVertCount = Math.min(maxWorldVerts, Math.floor(f.length / 10));
    gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.subarray(0, worldVertCount * 10));
  }

  const fx = {
    clear() { fxBuf.length = 0; },
    beam(x0, y0, z0, x1, y1, z1, width, col, kind = 0) {
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
    },
    ringXZ(cx, y, cz, rad, col) {
      const [r, g, b, a] = col;
      const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
      fxBuf.push(
        x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z0, 1, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1,
        x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1, x0, y, z1, 0, 1, r, g, b, a, 1
      );
    },
    billboard(cx, cy, cz, rad, right, up, col, kind = 2) {
      const [r, g, b, a] = col;
      const rx = right[0] * rad, ry = right[1] * rad, rz = right[2] * rad;
      const ux = up[0] * rad, uy = up[1] * rad, uz = up[2] * rad;
      const p0 = [cx - rx - ux, cy - ry - uy, cz - rz - uz];
      const p1 = [cx + rx - ux, cy + ry - uy, cz + rz - uz];
      const p2 = [cx + rx + ux, cy + ry + uy, cz + rz + uz];
      const p3 = [cx - rx + ux, cy - ry + uy, cz - rz + uz];
      fxBuf.push(
        p0[0], p0[1], p0[2], 0, 0, r, g, b, a, kind, p1[0], p1[1], p1[2], 1, 0, r, g, b, a, kind, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, kind,
        p0[0], p0[1], p0[2], 0, 0, r, g, b, a, kind, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, kind, p3[0], p3[1], p3[2], 0, 1, r, g, b, a, kind
      );
    },
    coneXZ(ox, y, oz, yaw, halfRad, len, col) {
      const [r, g, b, a] = col;
      const segs = 16;
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs, u1 = (i + 1) / segs;
        const a0 = yaw - halfRad + u0 * halfRad * 2;
        const a1 = yaw - halfRad + u1 * halfRad * 2;
        fxBuf.push(
          ox, y, oz, 0.5 * (u0 + u1), 0, r, g, b, a, 3,
          ox + Math.sin(a0) * len, y, oz + Math.cos(a0) * len, u0, 1, r, g, b, a, 3,
          ox + Math.sin(a1) * len, y, oz + Math.cos(a1) * len, u1, 1, r, g, b, a, 3
        );
      }
    },
    xrayBox(x0, x1, y0, y1, z0, z1, col) {
      const [r, g, b, a] = col;
      const faces = [
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      ];
      for (const [p0, p1, p2, p3] of faces) {
        fxBuf.push(
          p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 5, p1[0], p1[1], p1[2], 1, 0, r, g, b, a, 5, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 5,
          p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 5, p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 5, p3[0], p3[1], p3[2], 0, 1, r, g, b, a, 5
        );
      }
    },
    quadXZ(x0, x1, y, z0, z1, col) {
      const [r, g, b, a] = col;
      fxBuf.push(
        x0, y, z1, 0, 0, r, g, b, a, 5, x1, y, z1, 1, 0, r, g, b, a, 5, x1, y, z0, 1, 1, r, g, b, a, 5,
        x0, y, z1, 0, 0, r, g, b, a, 5, x1, y, z0, 1, 1, r, g, b, a, 5, x0, y, z0, 0, 1, r, g, b, a, 5
      );
    },
  };

  function drawFrame(w, h, cam, { time = 0, meshes = [], buildFx = null } = {}) {
    const aspect = w / Math.max(1, h);
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 130.0);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const viewProj = mulMat4(proj, view);

    // 1. Dynamic 1024x1024 PCF Shadow Map Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    if (worldVertCount > 0) {
      gl.useProgram(shWorldProg);
      gl.uniformMatrix4fv(U.shWVP, false, lightVP);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);
    }

    gl.useProgram(shMeshProg);
    gl.uniformMatrix4fv(U.shMVP, false, lightVP);
    for (const item of meshes) {
      if (item.castShadow === false || (item.alpha != null && item.alpha < 0.85)) continue;
      gl.bindVertexArray(item.gpu.vao);
      gl.uniform3f(U.shMOrig, item.x, item.y, item.z);
      gl.uniform4f(U.shMPose, item.yaw || 0, item.animA || 0, item.animB || 0, item.scale || 1);
      const pv = item.pivot || [0, 0, 0];
      gl.uniform4f(U.shMPiv, pv[0], pv[1], pv[2], item.animMode || 0);
      gl.drawElements(gl.TRIANGLES, item.gpu.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2. Sky Backdrop
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(skyProg);
    gl.uniform3fv(U.skyTop, skyTop);
    gl.uniform3fv(U.skyMid, skyMid);
    gl.uniform3fv(U.skyBot, skyBot);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3. Shadow-Mapped World
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);

    if (worldVertCount > 0) {
      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(U.wVP, false, viewProj);
      gl.uniformMatrix4fv(U.wLVP, false, lightVP);
      gl.uniform1i(U.wSh, 0);
      gl.uniform3fv(U.wCam, basis.pos);
      gl.uniform1f(U.wTime, time);
      gl.uniform3fv(U.wLDir, lightDir);
      gl.uniform3fv(U.wALow, ambLow);
      gl.uniform3fv(U.wAHigh, ambHigh);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);
    }

    // 4. Opaque Blender Meshes, then Translucent Ghost Meshes!
    gl.useProgram(meshProg);
    gl.uniformMatrix4fv(U.mVP, false, viewProj);
    gl.uniformMatrix4fv(U.mLVP, false, lightVP);
    gl.uniform1i(U.mSh, 0);
    gl.uniform3fv(U.mCam, basis.pos);
    gl.uniform3fv(U.mLDir, lightDir);
    gl.uniform3fv(U.mALow, ambLow);
    gl.uniform3fv(U.mAHigh, ambHigh);

    const drawMeshList = (translucent) => {
      if (translucent) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      for (const item of meshes) {
        const a = item.alpha == null ? 1.0 : item.alpha;
        if (translucent ? a >= 0.99 : a < 0.99) continue;
        gl.bindVertexArray(item.gpu.vao);
        gl.uniform3f(U.mOrig, item.x, item.y, item.z);
        gl.uniform4f(U.mPose, item.yaw || 0, item.animA || 0, item.animB || 0, item.scale || 1);
        const pv = item.pivot || [0, 0, 0];
        gl.uniform4f(U.mPiv, pv[0], pv[1], pv[2], item.animMode || 0);
        const tn = item.tint || [1, 1, 1, 0];
        gl.uniform4f(U.mTint, tn[0], tn[1], tn[2], tn[3]);
        gl.uniform1f(U.mAlpha, a);
        gl.drawElements(gl.TRIANGLES, item.gpu.count, gl.UNSIGNED_SHORT, 0);
      }
      if (translucent) {
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    };
    drawMeshList(false);
    drawMeshList(true);

    // 5. Dynamic 3D Translucent FX
    fx.clear();
    if (buildFx) buildFx(fx, basis);
    if (fxBuf.length > 0) {
      const verts = Math.min(maxFxVerts, Math.floor(fxBuf.length / 10));
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(fxProg);
      gl.uniformMatrix4fv(U.fVP, false, viewProj);
      gl.uniform1f(U.fTime, time);
      gl.bindVertexArray(fxVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(fxBuf.slice(0, verts * 10)));
      gl.drawArrays(gl.TRIANGLES, 0, verts);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }

    gl.bindVertexArray(null);
    return { viewProj, basis };
  }

  return { uploadMesh, setWorldData, drawFrame };
}
