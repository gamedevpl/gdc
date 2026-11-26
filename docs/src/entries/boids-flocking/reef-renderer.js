// Dedicated 3D Sunlit Turquoise Coral Reef Lagoon WebGL2 Renderer for "Boids & Flocking (3 Rules)" (#09).
// Linear PBR + ACES filmic + animated underwater sunlight caustics on sandy reef floor + 4 sculpted coral rock outcrops,
// Blender-sculpted 72 Articulated Reef Boid Fish (with tail-wagging + Gold Inspector highlight) & Predator Reef Shark,
// plus glowing 3D Perception/Separation radius rings & live color-coded force vector arrows!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getBoidsMeshes } from "../../boids-mesh.js";

export const REEF_BOUNDS = { halfX: 8.6, halfZ: 6.4 };

// 4 Sculpted Coral Reef Outcrops that boids & shark smoothly steer around!
export const CORAL_ROCKS = [
  { x: -4.2, z: -2.2, r: 1.18, h: 2.1, col: [0.92, 0.44, 0.38] },
  { x:  4.2, z: -2.0, r: 1.12, h: 1.9, col: [0.94, 0.62, 0.24] },
  { x: -3.8, z:  2.4, r: 1.05, h: 1.75, col: [0.68, 0.36, 0.88] },
  { x:  4.0, z:  2.3, r: 1.22, h: 2.2, col: [0.18, 0.78, 0.66] },
];

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec3 deepCol = vec3(0.015, 0.085, 0.165);
  vec3 midCol  = vec3(0.032, 0.215, 0.335);
  vec3 topCol  = vec3(0.075, 0.435, 0.565);
  vec3 col = mix(deepCol, midCol, smoothstep(0.0, 0.55, vUv.y));
  col = mix(col, topCol, smoothstep(0.48, 1.0, vUv.y));
  // Soft sunlit underwater shafts descending from surface
  float rays = 0.5 + 0.5 * sin(vUv.x * 18.0 + uTime * 0.55 + vUv.y * 2.4);
  col += vec3(0.04, 0.16, 0.20) * pow(rays, 4.0) * smoothstep(0.15, 1.0, vUv.y);
  fragColor = vec4(col, 1.0);
}
`;

const WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;
uniform mat4 uViewProj;
out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vMat;
void main() {
  vPos = aPos;
  vNorm = aNorm;
  vCol = aCol;
  vMat = aMat;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vMat;

uniform vec3 uCamPos;
uniform float uTime;
out vec4 fragColor;

float caustic(vec2 p, float t) {
  // Sharp shimmering underwater caustic filament network
  vec2 q = p * 0.92;
  float w1 = sin(q.x * 2.1 + t * 1.4 + sin(q.y * 1.8 - t * 1.1));
  float w2 = sin(q.y * 2.3 - t * 1.2 + cos(q.x * 1.9 + t * 1.3));
  float ridge = 1.0 - abs(w1 + w2) * 0.5;
  return pow(clamp(ridge, 0.0, 1.0), 4.8);
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base;
  float rough = 0.62;
  vec3 emissive = vec3(0.0);

  float caust = caustic(vPos.xz, uTime) * max(N.y, 0.0);

  if (vMat < 0.5) {
    // Rich turquoise sunlit ocean seabed with fine rippled sand & crisp caustic web filaments!
    float ripple = 0.90 + 0.10 * sin(vPos.x * 3.4 + sin(vPos.z * 1.6));
    float vig = 1.0 - 0.25 * smoothstep(4.5, 9.5, length(vPos.xz * vec2(0.85, 1.1)));
    albedo = base * ripple * vig;
    emissive = vec3(0.14, 0.56, 0.68) * caust * 0.72;
    // Soft lagoon boundary glow line
    float bx = smoothstep(8.25, 8.65, abs(vPos.x));
    float bz = smoothstep(6.05, 6.45, abs(vPos.z));
    emissive += vec3(0.08, 0.62, 0.80) * max(bx, bz) * 0.42;
  } else if (vMat < 1.5) {
    // Volcanic reef rock with caustic shimmer on upward ledges
    float grain = 0.86 + 0.14 * sin(vPos.x * 5.0 + vPos.y * 7.0 + vPos.z * 5.0);
    albedo = base * grain;
    emissive = vec3(0.10, 0.40, 0.50) * caust * 0.45;
    rough = 0.74;
  } else {
    // Vibrant glowing coral polyps atop outcrops
    float pulse = 0.88 + 0.12 * sin(uTime * 2.6 + vPos.x);
    emissive = base * 0.42 * pulse + vec3(0.08, 0.32, 0.40) * caust * 0.25;
    rough = 0.40;
  }

  vec3 sunDir = normalize(vec3(0.28, 0.92, 0.25));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 48.0, 1.0 - rough)) * (1.0 - rough) * 0.45;

  vec3 amb = mix(vec3(0.05, 0.16, 0.26), vec3(0.24, 0.52, 0.64), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.88, 1.05, 1.12) * (0.28 + 0.72 * ndl))
           + vec3(0.75, 0.96, 1.05) * spec
           + emissive;

  // Subtle turquoise depth fog toward outer corners
  float distFog = clamp((length(vPos - uCamPos) - 16.0) / 38.0, 0.0, 0.42);
  lit = mix(lit, vec3(0.03, 0.19, 0.30), distFog);

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Articulated Swimming Shader (smooth tail wagging + banking roll + Gold Inspector Boid highlight!)
const SWIM_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: bankRoll, z: wagPhase, w: scale
uniform vec4 uTint;   // rgb + strength (gold highlight for Hero Boid, subtle hue variety for school!)

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out float vGold;

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}
vec3 rotZ(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  int part = int(aPart + 0.5);
  float yaw = uPose.x;
  float bank = uPose.y;
  float wag = sin(uPose.z);
  float sc = uPose.w;

  // Progressive sinusoidal body/tail undulation (fish faces +Z in WebGL!)
  if (part == 1) {
    float a = wag * 0.28;
    p = rotY(p - vec3(0.0, 0.0, -0.14), a) + vec3(0.0, 0.0, -0.14);
    n = rotY(n, a);
  } else if (part == 2) {
    float a = wag * 0.55;
    p = rotY(p - vec3(0.0, 0.0, -0.26), a) + vec3(0.0, 0.0, -0.26);
    n = rotY(n, a);
  } else if (part == 3) {
    // Gentle pectoral fin flutter
    p.y += sin(uPose.z * 0.5) * 0.025;
  }

  p = rotZ(p, bank) * sc;
  n = rotZ(n, bank);
  vec3 wp = rotY(p, yaw) + uOrigin;
  vec3 wn = normalize(rotY(n, yaw));

  vPos = wp;
  vNorm = wn;
  vCol = mix(aCol, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  vRough = aRough;
  vGold = uTint.a > 0.7 ? 1.0 : 0.0;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const SWIM_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
in float vGold;

uniform vec3 uCamPos;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.28, 0.92, 0.25));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 76.0, 1.0 - rough)) * (1.0 - rough) * 0.72;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2) * 0.52;

  vec3 amb = mix(vec3(0.08, 0.22, 0.34), vec3(0.32, 0.62, 0.74), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.12, 1.18, 1.22) * (0.28 + 0.72 * ndl))
           + vec3(0.88, 1.0, 1.08) * spec
           + (vGold > 0.5 ? vec3(1.4, 1.05, 0.20) : vec3(0.25, 0.85, 1.0)) * rim;

  // Emissive Predator Shark amber eyes
  if (vRough < 0.08 && vCol.r > 0.85 && vCol.g > 0.45) {
    lit += vec3(2.1, 1.15, 0.12);
  }
  // Extra radiant glow on the Hero Inspector Gold Boid!
  if (vGold > 0.5) {
    lit += vec3(0.45, 0.32, 0.04);
  }

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent FX Shader: Perception & Separation Rings, Vector Beams, Predator Fear Ring, Rising Bubbles!
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = ribbon/vector arrow, 1 = radius ring, 2 = bubble/orb
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
    // Crisp glowing force vector beam
    float edge = 1.0 - smoothstep(0.32, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.38), clamp(a, 0.0, 0.95));
  } else if (vKind < 1.5) {
    // Crisp perception / separation / shark danger circle on reef plane
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.89, r) * smoothstep(0.76, 0.86, r);
    float fill = smoothstep(0.84, 0.0, r) * 0.09;
    float a = (ring + fill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.32), clamp(a, 0.0, 0.92));
  } else {
    // Rising reef bubble / glowing orb
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.14, r);
    if (s < 0.01) discard;
    float rim = smoothstep(0.45, 0.85, r) * 0.55;
    fragColor = vec4(mix(c.rgb, vec3(1.0), rim), s * c.a);
  }
}
`;

function pushOctaPillar(buf, cx, cz, r, h, rockCol, coralCol) {
  const segs = 10;
  // Tapered volcanic reef rock base
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const rb0 = r * (0.94 + 0.08 * Math.sin(i * 2.1));
    const rb1 = r * (0.94 + 0.08 * Math.sin((i + 1) * 2.1));
    const rt0 = rb0 * 0.62;
    const rt1 = rb1 * 0.62;
    const p00 = [cx + Math.cos(a0) * rb0, 0.0, cz + Math.sin(a0) * rb0];
    const p10 = [cx + Math.cos(a1) * rb1, 0.0, cz + Math.sin(a1) * rb1];
    const p11 = [cx + Math.cos(a1) * rt1, h * 0.72, cz + Math.sin(a1) * rt1];
    const p01 = [cx + Math.cos(a0) * rt0, h * 0.72, cz + Math.sin(a0) * rt0];
    const am = 0.5 * (a0 + a1);
    const n = [Math.cos(am) * 0.92, 0.38, Math.sin(am) * 0.92];
    // Outward CCW winding in WebGL (+X right, +Y up, +Z toward viewer): p00 -> p11 -> p10!
    for (const v of [p00, p11, p10, p00, p01, p11]) {
      buf.push(v[0], v[1], v[2], n[0], n[1], n[2], rockCol[0], rockCol[1], rockCol[2], 1);
    }
    // Vibrant sculpted coral crown cap (outward CCW!)
    const top = [cx, h, cz];
    const nt = [Math.cos(am) * 0.5, 0.86, Math.sin(am) * 0.5];
    for (const v of [p01, top, p11]) {
      buf.push(v[0], v[1], v[2], nt[0], nt[1], nt[2], coralCol[0], coralCol[1], coralCol[2], 2);
    }
  }
}

function buildReefWorld() {
  const buf = [];
  const sand = [0.16, 0.35, 0.42];
  const rim = [0.10, 0.22, 0.32];
  const rock = [0.22, 0.28, 0.38];

  // Sandy Reef Lagoon Floor Slab
  const hx = 9.4, hz = 7.2;
  const pushFloorBox = (x0, x1, y0, y1, z0, z1, col, mat) => {
    const faces = [
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    ];
    for (const [a, b, c, d, n] of faces) {
      for (const v of [a, b, c, a, c, d]) {
        buf.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], mat);
      }
    }
  };
  pushFloorBox(-hx, hx, -0.5, 0.0, -hz, hz, sand, 0);
  // Subtle reef rock ledges around outer edge
  pushFloorBox(-hx, hx, 0.0, 0.22, -hz, -hz + 0.35, rim, 1);
  pushFloorBox(-hx, -hx + 0.35, 0.0, 0.22, -hz, hz, rim, 1);
  pushFloorBox(hx - 0.35, hx, 0.0, 0.22, -hz, hz, rim, 1);

  for (const cr of CORAL_ROCKS) {
    pushOctaPillar(buf, cr.x, cr.z, cr.r, cr.h, rock, cr.col);
  }
  return new Float32Array(buf);
}

export function createReefRenderer(gl) {
  const [skyProg, worldProg, swimProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [SWIM_VS, SWIM_FS],
    [FX_VS, FX_FS],
  ]);

  const emptyVao = gl.createVertexArray();

  // Static Reef World
  const worldData = buildReefWorld();
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

  // Blender Sculpted Reef Fish & Shark Meshes
  const meshes = getBoidsMeshes();
  function uploadSwim(m) {
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
  const boidGpu = uploadSwim(meshes.boid);
  const sharkGpu = uploadSwim(meshes.shark);

  // Dynamic FX Buffer
  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 4000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyTime = gl.getUniformLocation(skyProg, "uTime");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");

  const uSVP = gl.getUniformLocation(swimProg, "uViewProj");
  const uSOrig = gl.getUniformLocation(swimProg, "uOrigin");
  const uSPose = gl.getUniformLocation(swimProg, "uPose");
  const uSTint = gl.getUniformLocation(swimProg, "uTint");
  const uSCam = gl.getUniformLocation(swimProg, "uCamPos");

  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");
  const uFTime = gl.getUniformLocation(fxProg, "uTime");

  const fxBuf = [];
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

  function pushVectorBeam(x0, y, z0, dx, dz, width, col) {
    const len = Math.hypot(dx, dz);
    if (len < 0.08) return;
    const ux = dx / len, uz = dz / len;
    const px = -uz * width * 0.5, pz = ux * width * 0.5;
    const x1 = x0 + dx, z1 = z0 + dz;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - px, y, z0 - pz, 0, 0, r, g, b, a, 0,
      x0 + px, y, z0 + pz, 1, 0, r, g, b, a, 0,
      x1 + px, y, z1 + pz, 1, 1, r, g, b, a, 0,
      x0 - px, y, z0 - pz, 0, 0, r, g, b, a, 0,
      x1 + px, y, z1 + pz, 1, 1, r, g, b, a, 0,
      x1 - px, y, z1 - pz, 0, 1, r, g, b, a, 0
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
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 2,
      p1[0], p1[1], p1[2], 1, 0, r, g, b, a, 2,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 2,
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 2,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 2,
      p3[0], p3[1], p3[2], 0, 1, r, g, b, a, 2
    );
  }

  return {
    render(w, h, cam, state) {
      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyTime, state.time);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Reef Lagoon Floor & Sculpted Coral Outcrops
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // 72 Articulated Reef Boid Fish
      gl.useProgram(swimProg);
      gl.uniformMatrix4fv(uSVP, false, viewProj);
      gl.uniform3fv(uSCam, basis.pos);
      gl.bindVertexArray(boidGpu.vao);

      for (let i = 0; i < state.boids.length; i++) {
        const b = state.boids[i];
        gl.uniform3f(uSOrig, b.x, b.y, b.z);
        gl.uniform4f(uSPose, b.yaw, b.bank, b.wagPhase, b.isHero ? 1.48 : b.scale);
        if (b.isHero) {
          gl.uniform4f(uSTint, 1.0, 0.80, 0.14, 0.88);
        } else {
          gl.uniform4f(uSTint, b.tint[0], b.tint[1], b.tint[2], 0.28);
        }
        gl.drawElements(gl.TRIANGLES, boidGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Predator Reef Shark
      if (state.shark.active) {
        const sh = state.shark;
        gl.bindVertexArray(sharkGpu.vao);
        gl.uniform3f(uSOrig, sh.x, sh.y, sh.z);
        gl.uniform4f(uSPose, sh.yaw, sh.bank, sh.wagPhase, 1.02);
        gl.uniform4f(uSTint, 0.0, 0.0, 0.0, 0.0);
        gl.drawElements(gl.TRIANGLES, sharkGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Dynamic FX: Hero Gold Boid Perception & Separation Rings + 3D Force Vector Beams + Shark Fear Ring + Bubbles
      fxBuf.length = 0;
      const hero = state.boids[0];
      if (state.showVectors && hero) {
        // Outer perception radius (Cyan) & inner separation radius (Coral Red)
        pushRingXZ(hero.x, hero.y - 0.12, hero.z, state.perceptionR, [0.18, 0.85, 1.0, 0.65]);
        if (state.rules.separation) {
          pushRingXZ(hero.x, hero.y - 0.08, hero.z, state.separationR, [0.98, 0.30, 0.36, 0.78]);
        }
        // Live 3D Force Vector Beams radiating from Hero Gold Boid!
        if (state.rules.separation) {
          pushVectorBeam(hero.x, hero.y + 0.06, hero.z, hero.fSepX * 0.55, hero.fSepZ * 0.55, 0.15, [1.0, 0.28, 0.34, 0.94]);
        }
        if (state.rules.alignment) {
          pushVectorBeam(hero.x, hero.y + 0.08, hero.z, hero.fAliX * 0.55, hero.fAliZ * 0.55, 0.15, [0.16, 0.88, 1.0, 0.94]);
        }
        if (state.rules.cohesion) {
          pushVectorBeam(hero.x, hero.y + 0.10, hero.z, hero.fCohX * 0.55, hero.fCohZ * 0.55, 0.15, [0.22, 0.96, 0.58, 0.94]);
        }
      }

      if (state.shark.active && state.showVectors) {
        pushRingXZ(state.shark.x, 0.25, state.shark.z, state.sharkFearR, [1.0, 0.28, 0.34, 0.55]);
      }

      // Click target water ripple
      for (const rp of state.ripples) {
        const u = rp.age / rp.life;
        pushRingXZ(rp.x, 0.14, rp.z, rp.maxR * (0.15 + 0.85 * u), [0.25, 0.94, 1.0, clamp(1 - u, 0, 1) * 0.82]);
      }

      // Rising Coral Reef Bubbles
      for (const bb of state.bubbles) {
        pushBillboard(bb.x, bb.y, bb.z, bb.size, basis.right, basis.up, [0.72, 0.96, 1.0, 0.58]);
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
