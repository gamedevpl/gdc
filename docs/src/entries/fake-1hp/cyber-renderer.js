// Dedicated 3D Cyber-Lab Training Deck WebGL2 Renderer for "Fake 1 HP & Death's Door" (#06).
// Linear PBR + ACES filmic + 1024x1024 PCF shadows + hexagonal glowing titanium deck + corner holo-pylons.
// Renders Blender-sculpted Cyber Ranger (with dynamic green->red HP spine bar) & Hover Laser Sentinel Drones,
// volumetric X-Ray enemy laser aiming cones (tight 3° vs wide 27° Stormtrooper scatter!),
// 3D shimmering 1 HP Death's Door Mercy Shield dome, glowing plasma bolts & neon sparks!
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
import { getCyberMeshes } from "../../cyber-mesh.js";

const SHADOW_RES = 1024;
const PYLON_PTS = [
  [-5.7, 1.5, -5.7],
  [5.7, 1.5, -5.7],
  [-5.7, 1.5, 5.7],
  [5.7, 1.5, 5.7],
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uRedPulse;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.025, 0.032, 0.075);
  vec3 midCol = vec3(0.055, 0.072, 0.145);
  vec3 botCol = vec3(0.095, 0.045, 0.135);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, topCol, smoothstep(0.45, 1.0, vUv.y));
  // Subtle red critical-HP heartbeat vignette around outer edges when HUD HP is in the red!
  float edge = smoothstep(0.36, 0.95, length(vUv - 0.5) * 1.45);
  col = mix(col, vec3(0.55, 0.04, 0.10), edge * uRedPulse * 0.45);
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
uniform float uRedPulse;
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
  float rough = 0.55;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Sleek dark titanium cyber-deck floor with crisp cyan/magenta sci-fi grid & central ring!
    vec2 g = fract(vPos.xz * 0.625);
    float gx = min(g.x, 1.0 - g.x);
    float gz = min(g.y, 1.0 - g.y);
    float line = 1.0 - smoothstep(0.014, 0.036, min(gx, gz));
    float rad = length(vPos.xz);
    float ring = smoothstep(0.09, 0.025, abs(rad - 3.6)) + smoothstep(0.07, 0.02, abs(rad - 5.4));
    vec3 gridCol = mix(vec3(0.06, 0.55, 0.85), vec3(0.95, 0.12, 0.30), uRedPulse * 0.7);
    emissive += gridCol * (line * 0.22 + ring * 0.65);
    rough = mix(0.46, 0.22, max(line, ring));
  } else if (vMat < 1.5) {
    // Brushed titanium walls & cover panels
    float stripe = smoothstep(0.03, 0.07, abs(fract(vPos.y * 2.2) - 0.5));
    albedo = mix(base * 0.65, base, stripe);
    rough = 0.42;
  } else if (vMat < 2.5) {
    // Cyan holo-pylon light strip
    float pulse = 0.85 + 0.15 * sin(uTime * 4.5 + vPos.x);
    vec3 stripCol = mix(vec3(0.10, 0.95, 1.35), vec3(1.45, 0.15, 0.32), uRedPulse * 0.75);
    emissive = stripCol * pulse;
    rough = 0.12;
  } else {
    // Magenta accent trim
    emissive = vec3(1.15, 0.14, 0.68) * 0.75;
    rough = 0.18;
  }

  vec3 sunDir = normalize(vec3(0.36, 0.88, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 64.0, 1.0 - rough)) * (1.0 - rough) * 0.50;

  vec3 amb = mix(vec3(0.06, 0.07, 0.13), vec3(0.18, 0.24, 0.38), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.86, 0.92, 1.08) * ndl * (0.28 + 0.72 * sh))
           + vec3(0.85, 0.95, 1.08) * spec * sh
           + emissive;

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Articulated Cyber Ranger Shader
const RANGER_SKIN_GLSL = `
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

void skinRanger(
  vec3 inPos, vec3 inNorm, float partId,
  vec3 worldPos, float yaw, float walkPhase, float walkAmp, float recoil, float tilt,
  out vec3 outPos, out vec3 outNorm
) {
  vec3 p = inPos;
  vec3 n = inNorm;
  int pid = int(partId + 0.5);
  float stride = sin(walkPhase) * walkAmp;

  if (pid == 2 || pid == 3) {
    vec3 piv = (pid == 2) ? vec3(0.14, 0.74, 0.0) : vec3(-0.14, 0.74, 0.0);
    float ang = (pid == 2) ? (stride * 0.72) : (-stride * 0.72);
    p = rotX(p - piv, ang) + piv;
    n = rotX(n, ang);
  } else if (pid == 4) {
    vec3 piv = vec3(0.32, 1.26, 0.0);
    p = rotX(p - piv, -stride * 0.55) + piv;
    n = rotX(n, -stride * 0.55);
  } else if (pid == 5) {
    vec3 piv = vec3(-0.32, 1.26, 0.0);
    p = rotX(p - piv, -recoil * 0.35) + piv;
    p.z -= recoil * 0.08;
    n = rotX(n, -recoil * 0.35);
  }

  p.y += abs(cos(walkPhase)) * 0.05 * walkAmp;
  vec3 tpiv = vec3(0.0, 0.55, 0.0);
  p = rotX(p - tpiv, tilt) + tpiv;
  n = rotX(n, tilt);

  outPos = rotY(p, yaw) + worldPos;
  outNorm = normalize(rotY(n, yaw));
}
`;

const RANGER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;

uniform mat4 uViewProj;
uniform vec3 uPos;
uniform float uYaw;
uniform float uWalkPhase;
uniform float uWalkAmp;
uniform float uRecoil;
uniform float uTilt;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
${RANGER_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinRanger(aPos, aNorm, aPart, uPos, uYaw, uWalkPhase, uWalkAmp, uRecoil, uTilt, wp, wn);
  vPos = wp;
  vNorm = wn;
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const RANGER_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=3) in float aPart;

uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uYaw;
uniform float uWalkPhase;
uniform float uWalkAmp;
uniform float uRecoil;
uniform float uTilt;
${RANGER_SKIN_GLSL}

void main() {
  vec3 wp, wn;
  skinRanger(aPos, aNorm, aPart, uPos, uYaw, uWalkPhase, uWalkAmp, uRecoil, uTilt, wp, wn);
  gl_Position = uLightVP * vec4(wp, 1.0);
}
`;

const DRONE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aPart;
layout(location=4) in float aRough;

uniform mat4 uViewProj;
uniform vec3 uPos;
uniform float uYaw;
uniform float uHoverY;
uniform float uRecoil;
uniform float uScale;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }

void main() {
  vec3 p = aPos * uScale;
  vec3 n = aNorm;
  vec3 piv = vec3(0.0, 1.35 * uScale, 0.0);
  p = rotX(p - piv, -uRecoil) + piv;
  n = rotX(n, -uRecoil);
  p = rotY(p, uYaw) + uPos + vec3(0.0, uHoverY, 0.0);
  vPos = p;
  vNorm = normalize(rotY(n, uYaw));
  vCol = aCol;
  vRough = aRough;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;

const DRONE_SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform vec3 uPos;
uniform float uYaw;
uniform float uHoverY;
uniform float uScale;
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
void main() {
  vec3 p = rotY(aPos * uScale, uYaw) + uPos + vec3(0.0, uHoverY, 0.0);
  gl_Position = uLightVP * vec4(p, 1.0);
}
`;

const CHAR_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;

uniform vec3 uCamPos;
uniform vec4 uFlash;     // rgb + strength
uniform float uHpRatio;  // 0..1 HUD HP for hero's glowing spine strip!
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.36, 0.88, 0.34));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.05, 0.92);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.62;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.38;

  vec3 amb = mix(vec3(0.10, 0.12, 0.22), vec3(0.34, 0.40, 0.56), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.18, 1.16, 1.24) * (0.24 + 0.76 * ndl))
           + vec3(0.95, 0.98, 1.1) * spec
           + vec3(0.28, 0.78, 1.0) * rim;

  // Glowing cyan visor & plasma carbine coil
  if (vRough < 0.08 && vCol.b > 0.85 && vCol.g > 0.80) {
    lit += vec3(0.12, 1.55, 2.05);
  }
  // Glowing HP spine bar on Cyber Ranger back (turns from emerald -> amber -> pulsing red!)
  if (vRough < 0.08 && vCol.g > 0.90 && vCol.r < 0.30 && vCol.b < 0.75) {
    vec3 spine = mix(vec3(2.1, 0.12, 0.16), vec3(0.12, 1.95, 0.88), smoothstep(0.18, 0.55, uHpRatio));
    lit = spine;
  }
  // Glowing crimson drone cyclops eye & laser muzzles
  if (vRough < 0.08 && vCol.r > 0.85 && vCol.g < 0.30) {
    lit += vec3(2.2, 0.15, 0.32);
  }

  lit = mix(lit, pow(max(uFlash.rgb, vec3(0.01)), vec3(1.8)) * 2.4, clamp(uFlash.a, 0.0, 1.0));
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent Hologram FX Shader: Aiming Cones, 1 HP Mercy Shield Dome, Plasma Bolts, Rings & Sparks!
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = aim cone, 1 = ring/shield, 2 = spark/bolt orb
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
    // Volumetric X-Ray laser aiming cone projected on deck (vUv.y = 0 at drone -> 1 at far end, vUv.x = 0..1 across width)
    float distFade = (1.0 - smoothstep(0.15, 1.0, vUv.y));
    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float border = 1.0 - smoothstep(0.02, 0.10, edgeDist);
    float scan = 0.78 + 0.22 * sin(vUv.y * 28.0 - uTime * 11.0);
    float a = c.a * distFade * (0.22 * scan + 0.68 * border);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), border * 0.45), clamp(a, 0.0, 0.88));
  } else if (vKind < 1.5) {
    // Crisp glowing shield / ring
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.98, 0.82, r) * smoothstep(0.56, 0.74, r);
    float hexFill = smoothstep(0.82, 0.0, r) * (0.18 + 0.12 * sin(r * 24.0 - uTime * 12.0));
    float a = (ring + hexFill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.42), clamp(a, 0.0, 0.94));
  } else {
    // Plasma bolt / glowing orb
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.12, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.48, 0.0, r) * 0.72), s * c.a);
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

function buildCyberDeck() {
  const buf = [];
  const C_DECK = [0.16, 0.20, 0.28];
  const C_WALL = [0.22, 0.26, 0.36];
  const C_CYAN = [0.14, 0.90, 1.00];
  const C_MAG = [0.95, 0.16, 0.56];

  // Main deck floor
  pushBox(buf, -7.2, 7.2, -1.0, 0.0, -7.2, 7.2, C_DECK, 0.0);

  // Sleek angled low sci-fi bumper walls (back & sides, open front!)
  pushBox(buf, -7.2, 7.2, 0.0, 0.85, -7.2, -6.5, C_WALL, 1.0);
  pushBox(buf, -7.2, -6.5, 0.0, 0.80, -6.5, 6.5, C_WALL, 1.0);
  pushBox(buf, 6.5, 7.2, 0.0, 0.80, -6.5, 6.5, C_WALL, 1.0);
  pushBox(buf, -7.2, 7.2, -0.1, 0.15, 6.7, 7.2, C_WALL, 1.0);
  // Glowing magenta back wall trim line
  pushBox(buf, -6.4, 6.4, 0.65, 0.78, -6.52, -6.46, C_MAG, 3.0);

  // 4 Corner Cyber Holo-Pylons with vertical glowing cyan light cores!
  for (const [px, , pz] of PYLON_PTS) {
    pushBox(buf, px - 0.55, px + 0.55, 0.0, 0.50, pz - 0.55, pz + 0.55, C_WALL, 1.0);
    pushBox(buf, px - 0.36, px + 0.36, 0.50, 2.05, pz - 0.36, pz + 0.36, C_WALL, 1.0);
    pushBox(buf, px - 0.40, px + 0.40, 0.75, 1.85, pz - 0.14, pz + 0.14, C_CYAN, 2.0);
    pushBox(buf, px - 0.14, px + 0.14, 0.75, 1.85, pz - 0.40, pz + 0.40, C_CYAN, 2.0);
    pushBox(buf, px - 0.45, px + 0.45, 2.05, 2.22, pz - 0.45, pz + 0.45, C_WALL, 1.0);
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

export function createCyberRenderer(gl) {
  const [skyProg, shadowProg, worldProg, rangerProg, rangerShadowProg, droneProg, droneShadowProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [RANGER_VS, CHAR_FS],
    [RANGER_SHADOW_VS, SHADOW_FS],
    [DRONE_VS, CHAR_FS],
    [DRONE_SHADOW_VS, SHADOW_FS],
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

  const worldData = buildCyberDeck();
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

  const meshes = getCyberMeshes();
  const rangerGeo = makePartVao(gl, meshes.ranger);
  const droneGeo = makePartVao(gl, meshes.drone);

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
    w, h, cam, time, hero, drones,
    hudHpRatio = 1.0,
    redPulse = 0,
    xrayOn = true,
    aimHalfAngle = 0.06,     // radians: 0.055 tight lethal vs 0.47 wide Mercy scatter!
    mercyScatterActive = false,
    mercyShieldFrac = 0,     // 0..1 glowing hexagonal 1 HP shield dome!
    bolts = [],              // [{ x, y, z, vx, vz, friendly, r, g, b }]
    rings = [],
    sparks = [],
  }) {
    const aspect = w / Math.max(1, h);
    const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
    const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
    const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.25, 120);
    const viewProj = mulMat4(proj, view);

    const lightView = makeLookAt([7.5, 16.5, 6.5], [0, 0.4, 0], [0, 1, 0]);
    const lightProj = makeOrtho(-10.5, 10.5, -10.5, 10.5, 2.0, 38.0);
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

    gl.useProgram(rangerShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(rangerShadowProg, "uLightVP"), false, lightVP);
    gl.uniform3f(gl.getUniformLocation(rangerShadowProg, "uPos"), hero.x, hero.y, hero.z);
    gl.uniform1f(gl.getUniformLocation(rangerShadowProg, "uYaw"), hero.yaw);
    gl.uniform1f(gl.getUniformLocation(rangerShadowProg, "uWalkPhase"), hero.walkPhase);
    gl.uniform1f(gl.getUniformLocation(rangerShadowProg, "uWalkAmp"), hero.walkAmp);
    gl.uniform1f(gl.getUniformLocation(rangerShadowProg, "uRecoil"), hero.recoil);
    gl.uniform1f(gl.getUniformLocation(rangerShadowProg, "uTilt"), hero.tilt);
    gl.bindVertexArray(rangerGeo.vao);
    gl.drawElements(gl.TRIANGLES, rangerGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(droneShadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(droneShadowProg, "uLightVP"), false, lightVP);
    gl.bindVertexArray(droneGeo.vao);
    for (const d of drones) {
      if ((d.scale ?? 1) < 0.05) continue;
      gl.uniform3f(gl.getUniformLocation(droneShadowProg, "uPos"), d.x, 0, d.z);
      gl.uniform1f(gl.getUniformLocation(droneShadowProg, "uYaw"), d.yaw);
      gl.uniform1f(gl.getUniformLocation(droneShadowProg, "uHoverY"), d.hoverY);
      gl.uniform1f(gl.getUniformLocation(droneShadowProg, "uScale"), d.scale ?? 1);
      gl.drawElements(gl.TRIANGLES, droneGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 2) Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.03, 0.04, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(skyProg);
    gl.uniform1f(gl.getUniformLocation(skyProg, "uRedPulse"), redPulse);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Titanium Cyber-Deck
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
    gl.uniform1f(gl.getUniformLocation(worldProg, "uRedPulse"), redPulse);
    gl.bindVertexArray(worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

    // Cyber Ranger Hero
    gl.useProgram(rangerProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(rangerProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(rangerProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform4f(gl.getUniformLocation(rangerProg, "uFlash"), hero.flash[0], hero.flash[1], hero.flash[2], hero.flash[3]);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uHpRatio"), hudHpRatio);
    gl.uniform3f(gl.getUniformLocation(rangerProg, "uPos"), hero.x, hero.y, hero.z);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uYaw"), hero.yaw);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uWalkPhase"), hero.walkPhase);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uWalkAmp"), hero.walkAmp);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uRecoil"), hero.recoil);
    gl.uniform1f(gl.getUniformLocation(rangerProg, "uTilt"), hero.tilt);
    gl.bindVertexArray(rangerGeo.vao);
    gl.drawElements(gl.TRIANGLES, rangerGeo.idxCount, gl.UNSIGNED_SHORT, 0);

    // Hover Laser Sentinel Drones
    gl.useProgram(droneProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(droneProg, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(droneProg, "uCamPos"), basis.pos[0], basis.pos[1], basis.pos[2]);
    gl.uniform1f(gl.getUniformLocation(droneProg, "uHpRatio"), 1.0);
    gl.bindVertexArray(droneGeo.vao);
    for (const d of drones) {
      if ((d.scale ?? 1) < 0.05) continue;
      gl.uniform4f(gl.getUniformLocation(droneProg, "uFlash"), 1.0, 1.0, 1.0, d.flash || 0);
      gl.uniform3f(gl.getUniformLocation(droneProg, "uPos"), d.x, 0, d.z);
      gl.uniform1f(gl.getUniformLocation(droneProg, "uYaw"), d.yaw);
      gl.uniform1f(gl.getUniformLocation(droneProg, "uHoverY"), d.hoverY);
      gl.uniform1f(gl.getUniformLocation(droneProg, "uRecoil"), d.recoil || 0);
      gl.uniform1f(gl.getUniformLocation(droneProg, "uScale"), d.scale ?? 1);
      gl.drawElements(gl.TRIANGLES, droneGeo.idxCount, gl.UNSIGNED_SHORT, 0);
    }

    // 3) Translucent Volumetric FX Pass
    const fx = [];

    // X-Ray Enemy Laser Aiming Cones projecting directly from each drone's cannons toward the Cyber Ranger!
    if (xrayOn) {
      const coneLen = 7.6;
      const coneCol = mercyScatterActive ? [1.0, 0.68, 0.16] : [1.0, 0.18, 0.28];
      const coneAlpha = mercyScatterActive ? 0.88 : 0.80;
      for (const d of drones) {
        if ((d.scale ?? 1) < 0.5) continue;
        const fx0 = Math.sin(d.yaw), fz0 = Math.cos(d.yaw);
        const sx = d.x + fx0 * 0.50, sy = 1.12 + (d.hoverY || 0), sz = d.z + fz0 * 0.50;
        const aL = d.yaw - aimHalfAngle;
        const aR = d.yaw + aimHalfAngle;
        const exL = sx + Math.sin(aL) * coneLen, ezL = sz + Math.cos(aL) * coneLen;
        const exR = sx + Math.sin(aR) * coneLen, ezR = sz + Math.cos(aR) * coneLen;
        const rx0 = fz0 * 0.16, rz0 = -fx0 * 0.16;
        pushFxQuad(
          fx,
          [sx - rx0, sy, sz - rz0],
          [sx + rx0, sy, sz + rz0],
          [exR, 0.55, ezR],
          [exL, 0.55, ezL],
          coneCol[0], coneCol[1], coneCol[2], coneAlpha, 0.0,
        );
      }
    }

    // Hero glowing ground status ring (emerald when healthy, pulsing crimson when in red, bright gold-cyan during 1 HP Mercy Shield!)
    const hr = mercyShieldFrac > 0.02 ? 1.48 : 0.92;
    const hCol = mercyShieldFrac > 0.02
      ? [0.22, 1.0, 0.88]
      : (hudHpRatio <= 0.25 ? [1.0, 0.20, 0.28] : [0.16, 0.94, 0.66]);
    pushFxQuad(
      fx,
      [hero.x - hr, 0.05, hero.z + hr], [hero.x + hr, 0.05, hero.z + hr],
      [hero.x + hr, 0.05, hero.z - hr], [hero.x - hr, 0.05, hero.z - hr],
      hCol[0], hCol[1], hCol[2], 0.88, 1.0,
    );

    // 3D Shimmering 1 HP Death's Door Mercy Shield Dome (billboard energy bubble around Cyber Ranger!)
    if (mercyShieldFrac > 0.02) {
      const shR = 1.38 + Math.sin(time * 24.0) * 0.05;
      pushBillboard(fx, hero.x, 1.02, hero.z, shR, basis, 0.22, 1.0, 0.88, 0.92 * Math.min(1, mercyShieldFrac * 2.2), 1.0);
    }

    // Expanding shockwave rings
    for (const rg of rings) {
      const s = rg.rad;
      pushFxQuad(
        fx,
        [rg.x - s, rg.y, rg.z + s], [rg.x + s, rg.y, rg.z + s],
        [rg.x + s, rg.y, rg.z - s], [rg.x - s, rg.y, rg.z - s],
        rg.r, rg.g, rg.b, rg.a, 1.0,
      );
    }

    // Glowing Plasma Bolts (stretched neon laser streaks!)
    for (const b of bolts) {
      const spd = Math.hypot(b.vx, b.vz) || 1;
      const dx = b.vx / spd, dz = b.vz / spd;
      const px = -dz * 0.14, pz = dx * 0.14;
      const tail = 0.65;
      pushFxQuad(
        fx,
        [b.x - dx * tail - px, b.y, b.z - dz * tail - pz],
        [b.x - dx * tail + px, b.y, b.z - dz * tail + pz],
        [b.x + dx * 0.22 + px, b.y, b.z + dz * 0.22 + pz],
        [b.x + dx * 0.22 - px, b.y, b.z + dz * 0.22 - pz],
        b.r, b.g, b.b, 0.96, 2.0,
      );
      pushBillboard(fx, b.x, b.y, b.z, 0.24, basis, b.r, b.g, b.b, 0.95, 2.0);
    }

    // Sparks
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
    rendererName: "WebGL2 Cyber-Lab Deck + Blender Ranger & Laser Drones",
  };
}
