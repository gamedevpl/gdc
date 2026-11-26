// Dedicated 3D Tactical Siege Highlands WebGL2 Renderer for "Flow Field & Dynamic NavMesh" (#10).
// Linear PBR + ACES filmic + live Integration Distance Heatmap Floor + dynamic 3D Obsidian Bastion Walls,
// 96 Blender-sculpted Clockwork Hover-Bots flowing smoothly along 3D glowing chevron Flow Arrows toward
// the spinning Golden Goal Beacon Spire!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getFlowMeshes } from "../../flow-mesh.js";

export const COLS = 16;
export const ROWS = 12;
export const TILE = 1.0;

export function tileToWorld(c, r) {
  return [c - (COLS - 1) * 0.5, r - (ROWS - 1) * 0.5];
}
export function worldToTile(x, z) {
  const c = Math.floor(x + COLS * 0.5);
  const r = Math.floor(z + ROWS * 0.5);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r, idx: r * COLS + c };
}

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 topCol = vec3(0.020, 0.045, 0.055);
  vec3 midCol = vec3(0.038, 0.095, 0.112);
  vec3 botCol = vec3(0.065, 0.125, 0.105);
  vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.5, vUv.y));
  col = mix(col, topCol, smoothstep(0.46, 1.0, vUv.y));
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

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base;
  float rough = 0.52;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Tactical tile floor with subtle bevel grid lines & soft heat glow
    vec2 f = fract(vPos.xz);
    float g = 1.0 - smoothstep(0.025, 0.065, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base, base * 0.42, g * 0.65);
    emissive = base * 0.16;
    rough = mix(0.44, 0.68, g);
  } else if (vMat < 1.5) {
    // 3D Obsidian Bastion Wall with crisp horizontal stone seams & glowing emerald top trim
    float seam = smoothstep(0.04, 0.09, abs(fract(vPos.y * 1.6) - 0.5));
    float topTrim = smoothstep(1.18, 1.24, vPos.y);
    albedo = base * mix(0.75, 1.05, seam);
    emissive = vec3(0.08, 0.58, 0.42) * topTrim * 0.35;
    rough = 0.42;
  } else if (vMat < 2.5) {
    // Glowing Portal / Goal Tile accent
    float pulse = 0.78 + 0.22 * sin(uTime * 4.5);
    emissive = base * 0.95 * pulse;
    rough = 0.18;
  } else {
    // Canyon rim slate
    rough = 0.62;
  }

  vec3 sunDir = normalize(vec3(0.38, 0.88, 0.30));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 56.0, 1.0 - rough)) * (1.0 - rough) * 0.48;

  vec3 amb = mix(vec3(0.07, 0.10, 0.13), vec3(0.24, 0.34, 0.38), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.0, 1.04, 1.08) * (0.28 + 0.72 * ndl))
           + vec3(0.86, 0.98, 0.96) * spec
           + emissive;

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Sculpted Unit & Spire Shader
const UNIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: spinPart1, z: bob, w: scale
uniform vec4 uTint;   // rgb + strength (red tint when stuck in Naive mode!)

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;
out float vStuck;

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  int part = int(aPart + 0.5);

  if (part == 1) {
    p = rotY(p, uPose.y);
    n = rotY(n, uPose.y);
    p.y += uPose.z;
  }

  p *= uPose.w;
  vec3 wp = rotY(p, uPose.x) + uOrigin;
  vec3 wn = normalize(rotY(n, uPose.x));

  vPos = wp;
  vNorm = wn;
  vCol = mix(aCol, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  vRough = aRough;
  vStuck = uTint.a;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const UNIT_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
in float vStuck;

uniform vec3 uCamPos;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.38, 0.88, 0.30));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.65;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.3) * 0.45;

  vec3 amb = mix(vec3(0.09, 0.14, 0.18), vec3(0.30, 0.42, 0.46), N.y * 0.5 + 0.5);
  vec3 rimCol = vStuck > 0.35 ? vec3(1.1, 0.22, 0.26) : vec3(0.24, 0.95, 0.68);
  vec3 lit = base * (amb + vec3(1.12, 1.15, 1.18) * (0.28 + 0.72 * ndl))
           + vec3(0.95, 1.0, 1.05) * spec
           + rimCol * rim;

  // Emissive Hover-Bot Emerald Visor (turns crimson when stuck!)
  if (vRough < 0.08 && vCol.g > 0.85 && vCol.r < 0.75) {
    lit += vStuck > 0.35 ? vec3(2.1, 0.18, 0.22) : vec3(0.18, 2.05, 1.25);
  }
  // Emissive Goal Spire Golden Crystal
  if (vRough < 0.08 && vCol.r > 0.88 && vCol.g > 0.72) {
    lit += vec3(2.15, 1.55, 0.24);
  }

  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// Translucent FX Shader: Directional Flow Chevron Arrows on Every Tile, Rings & Arrival Sparks!
const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0 = directional chevron arrow, 1 = ring, 2 = spark orb
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
    // Crisp glowing directional Flow Arrow pointing toward +vUv.y (top of quad)!
    vec2 p = vUv * 2.0 - 1.0; // x in [-1,1], y in [-1,1], points +y!
    // Animated wave pulse traveling along the arrow direction!
    float pulse = 0.78 + 0.22 * sin(vUv.y * 6.0 - uTime * 7.5);
    // Shaft: |x| < 0.14, y in [-0.68, 0.22]
    float shaft = smoothstep(0.18, 0.09, abs(p.x)) * smoothstep(-0.72, -0.58, p.y) * smoothstep(0.28, 0.12, p.y);
    // Arrowhead triangle: tip at (0, 0.76), base at y = 0.08, half-width = 0.58
    float dy = 0.76 - p.y;
    float head = smoothstep(0.0, 0.08, dy) * smoothstep(0.72, 0.62, dy) * smoothstep(dy * 0.85 + 0.06, dy * 0.85 - 0.05, abs(p.x));
    float shape = clamp(max(shaft, head), 0.0, 1.0);
    float a = shape * c.a * pulse;
    if (a < 0.02) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), shape * 0.35), clamp(a, 0.0, 0.94));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.86, r) * smoothstep(0.68, 0.82, r);
    float fill = smoothstep(0.80, 0.0, r) * 0.12;
    float a = (ring + fill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.38), clamp(a, 0.0, 0.92));
  } else {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.10, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.72), s * c.a);
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

function heatColor(dist, maxDist, showHeatmap) {
  if (!showHeatmap) return [0.18, 0.25, 0.28];
  if (!Number.isFinite(dist)) return [0.16, 0.13, 0.18]; // unreachable dark plum
  const t = clamp(dist / Math.max(8, maxDist), 0, 1);
  // 0 (Goal): radiant gold-emerald -> 0.45 emerald-cyan -> 1.0 deep sapphire-teal
  if (t < 0.35) {
    const u = t / 0.35;
    return [0.78 * (1 - u) + 0.14 * u, 0.68 * (1 - u) + 0.62 * u, 0.18 * (1 - u) + 0.44 * u];
  }
  const u = (t - 0.35) / 0.65;
  return [0.14 * (1 - u) + 0.12 * u, 0.62 * (1 - u) + 0.22 * u, 0.44 * (1 - u) + 0.36 * u];
}

export function createFlowRenderer(gl) {
  const [skyProg, worldProg, unitProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [UNIT_VS, UNIT_FS],
    [FX_VS, FX_FS],
  ]);

  const emptyVao = gl.createVertexArray();

  // Dynamic Grid + Walls VAO (rebuilt only when walls/goal/overlay change!)
  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 9000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  // Sculpted Bot & Spire Meshes
  const meshes = getFlowMeshes();
  function uploadUnit(m) {
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
  const botGpu = uploadUnit(meshes.bot);
  const spireGpu = uploadUnit(meshes.spire);

  // Dynamic FX VAO (Flow Chevron Arrows + Rings + Sparks)
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

  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");

  const uUVP = gl.getUniformLocation(unitProg, "uViewProj");
  const uUOrig = gl.getUniformLocation(unitProg, "uOrigin");
  const uUPose = gl.getUniformLocation(unitProg, "uPose");
  const uUTint = gl.getUniformLocation(unitProg, "uTint");
  const uUCam = gl.getUniformLocation(unitProg, "uCamPos");

  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");
  const uFTime = gl.getUniformLocation(fxProg, "uTime");

  let worldVertCount = 0;
  let lastGridVersion = -1;

  function rebuildWorld(state) {
    const buf = [];
    const hx = COLS * 0.5;
    const hz = ROWS * 0.5;
    const rimCol = [0.11, 0.16, 0.19];
    const wallCol = [0.24, 0.30, 0.36];

    // Outer tactical canyon plinth rim
    pushBox(buf, -hx - 0.45, hx + 0.45, -0.55, 0.0, -hz - 0.45, hz + 0.45, rimCol, 3);
    pushBox(buf, -hx - 0.45, hx + 0.45, 0.0, 0.24, -hz - 0.45, -hz, rimCol, 3);
    pushBox(buf, -hx - 0.45, -hx, 0.0, 0.24, -hz, hz + 0.45, rimCol, 3);
    pushBox(buf, hx, hx + 0.45, 0.0, 0.24, -hz, hz + 0.45, rimCol, 3);
    pushBox(buf, -hx - 0.45, hx + 0.45, 0.0, 0.16, hz, hz + 0.45, rimCol, 3);

    // Per-tile heatmap floor + 3D Obsidian Bastion Walls!
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const [wx, wz] = tileToWorld(c, r);
        const x0 = wx - 0.5, x1 = wx + 0.5, z0 = wz - 0.5, z1 = wz + 0.5;
        if (state.walls[idx]) {
          pushBox(buf, x0 + 0.03, x1 - 0.03, 0.0, 1.24, z0 + 0.03, z1 - 0.03, wallCol, 1);
        } else {
          const isGoal = c === state.goal.c && r === state.goal.r;
          const isSpawn = c === state.spawn.c && Math.abs(r - state.spawn.r) <= 1;
          const col = isGoal
            ? [0.98, 0.80, 0.22]
            : isSpawn
              ? [0.16, 0.72, 0.96]
              : heatColor(state.dist[idx], state.maxDist, state.showField && state.flowMode);
          const mat = (isGoal || isSpawn) ? 2 : 0;
          // Top face of tile
          buf.push(
            x0, 0.01, z1, 0, 1, 0, col[0], col[1], col[2], mat,
            x1, 0.01, z1, 0, 1, 0, col[0], col[1], col[2], mat,
            x1, 0.01, z0, 0, 1, 0, col[0], col[1], col[2], mat,
            x0, 0.01, z1, 0, 1, 0, col[0], col[1], col[2], mat,
            x1, 0.01, z0, 0, 1, 0, col[0], col[1], col[2], mat,
            x0, 0.01, z0, 0, 1, 0, col[0], col[1], col[2], mat
          );
        }
      }
    }

    const arr = new Float32Array(buf);
    worldVertCount = arr.length / 10;
    gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    lastGridVersion = state.gridVersion;
  }

  const fxBuf = [];
  function pushArrowXZ(cx, y, cz, dirX, dirZ, halfSize, col) {
    // Rotate quad on XZ plane so +V (0, +1) points along (dirX, dirZ)!
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.05) return;
    const fx = dirX / len, fz = dirZ / len;
    const rx = -fz, rz = fx; // right perpendicular
    const s = halfSize;
    const [r, g, b, a] = col;
    const p0 = [cx - rx * s - fx * s, y, cz - rz * s - fz * s]; // uv (0,0)
    const p1 = [cx + rx * s - fx * s, y, cz + rz * s - fz * s]; // uv (1,0)
    const p2 = [cx + rx * s + fx * s, y, cz + rz * s + fz * s]; // uv (1,1)
    const p3 = [cx - rx * s + fx * s, y, cz - rz * s + fz * s]; // uv (0,1)
    fxBuf.push(
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 0,
      p1[0], p1[1], p1[2], 1, 0, r, g, b, a, 0,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 0,
      p0[0], p0[1], p0[2], 0, 0, r, g, b, a, 0,
      p2[0], p2[1], p2[2], 1, 1, r, g, b, a, 0,
      p3[0], p3[1], p3[2], 0, 1, r, g, b, a, 0
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
      if (state.gridVersion !== lastGridVersion) {
        rebuildWorld(state);
      }

      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // Tactical Grid + Heatmap + 3D Obsidian Bastion Walls
      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // 96 Sculpted Siege Hover-Bots + Spinning Golden Goal Beacon Spire
      gl.useProgram(unitProg);
      gl.uniformMatrix4fv(uUVP, false, viewProj);
      gl.uniform3fv(uUCam, basis.pos);

      gl.bindVertexArray(botGpu.vao);
      for (const u of state.units) {
        gl.uniform3f(uUOrig, u.x, 0.04 + Math.sin(state.time * 5.2 + u.phase) * 0.03, u.z);
        gl.uniform4f(uUPose, u.yaw, state.time * 4.5 + u.phase, 0.0, 0.72);
        if (u.stuck > 0.45) {
          gl.uniform4f(uUTint, 1.0, 0.22, 0.28, 0.65);
        } else {
          gl.uniform4f(uUTint, 0.0, 0.0, 0.0, 0.0);
        }
        gl.drawElements(gl.TRIANGLES, botGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Radiant Goal Beacon Spire
      const [gx, gz] = tileToWorld(state.goal.c, state.goal.r);
      gl.bindVertexArray(spireGpu.vao);
      gl.uniform3f(uUOrig, gx, 0.01, gz);
      gl.uniform4f(uUPose, 0.0, state.time * 2.1, Math.sin(state.time * 3.0) * 0.12, 1.0);
      gl.uniform4f(uUTint, 0.0, 0.0, 0.0, 0.0);
      gl.drawElements(gl.TRIANGLES, spireGpu.count, gl.UNSIGNED_SHORT, 0);

      // Translucent FX: Live Directional Flow Arrows on EVERY walkable tile + Goal Ring + Spawn Ring + Sparks!
      fxBuf.length = 0;
      if (state.showField) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const idx = r * COLS + c;
            if (state.walls[idx]) continue;
            if (c === state.goal.c && r === state.goal.r) continue;
            const [wx, wz] = tileToWorld(c, r);
            if (state.flowMode) {
              const fx = state.flowX[idx];
              const fz = state.flowZ[idx];
              if (fx !== 0 || fz !== 0) {
                const t = clamp(state.dist[idx] / Math.max(8, state.maxDist), 0, 1);
                const col = [0.95 * (1 - t) + 0.16 * t, 0.92 * (1 - t) + 0.96 * t, 0.35 * (1 - t) + 0.72 * t, 0.72];
                pushArrowXZ(wx, 0.045, wz, fx, fz, 0.36, col);
              }
            } else {
              // In Naive Mode show straight-line red vectors pointing blindly through walls!
              const dx = gx - wx, dz = gz - wz;
              pushArrowXZ(wx, 0.045, wz, dx, dz, 0.34, [1.0, 0.30, 0.36, 0.56]);
            }
          }
        }
      }

      // Goal Spire & Spawn Portal glowing rings
      const pulse = 0.85 + 0.15 * Math.sin(state.time * 4.5);
      pushRingXZ(gx, 0.06, gz, 0.85 * pulse, [1.0, 0.84, 0.24, 0.88]);
      const [sx, sz] = tileToWorld(state.spawn.c, state.spawn.r);
      pushRingXZ(sx, 0.06, sz, 1.15, [0.18, 0.82, 1.0, 0.72]);

      // Sparks on Goal Arrival or Wall Paint
      for (const sp of state.sparks) {
        const a = clamp(sp.life / sp.maxLife, 0, 1);
        pushBillboard(sp.x, sp.y, sp.z, sp.size * (0.4 + 0.6 * a), basis.right, basis.up, [sp.r, sp.g, sp.b, a]);
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
