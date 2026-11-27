// Dedicated 3D Orbital Space Station Firing Range WebGL2 Renderer for "Bullet Magnetism & Aim Assist" (#11).
// Linear PBR + ACES filmic + glowing titanium range lanes + Blender-sculpted Orbital Railgun Turret & Strafing Target Bots,
// translucent 3D Magnetism Bubble Halos, glowing curved magnetized plasma trajectories vs dashed raw-miss aim lines!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getMagnetMeshes } from "../../magnet-mesh.js";

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.018, 0.022, 0.055);
  vec3 mid = vec3(0.042, 0.032, 0.095);
  vec3 bot = vec3(0.085, 0.028, 0.088);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.5, vUv.y));
  col = mix(col, top, smoothstep(0.46, 1.0, vUv.y));
  // Subtle orbital star twinkle
  vec2 g = floor(vUv * vec2(120.0, 68.0));
  float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
  if (h > 0.992 && vUv.y > 0.35) {
    float tw = 0.55 + 0.45 * sin(uTime * 3.0 + h * 90.0);
    col += vec3(0.75, 0.88, 1.0) * tw * 0.55;
  }
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
  float rough = 0.44;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Firing range deck with crisp distance lane lines & glowing range ticks!
    vec2 f = fract(vPos.xz * 0.5);
    float g = 1.0 - smoothstep(0.015, 0.038, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float lane = 1.0 - smoothstep(0.03, 0.07, abs(fract((vPos.z + 4.5) * 0.333) - 0.5));
    emissive += vec3(0.10, 0.55, 0.85) * g * 0.24 + vec3(0.92, 0.18, 0.42) * lane * 0.22;
    rough = mix(0.40, 0.18, max(g, lane));
  } else if (vMat < 1.5) {
    // Armored bulkheads
    float stripe = smoothstep(0.04, 0.08, abs(fract(vPos.y * 1.8) - 0.5));
    albedo = base * mix(0.75, 1.04, stripe);
    rough = 0.46;
  } else {
    // Neon rose / cyan lane strip
    float pulse = 0.85 + 0.15 * sin(uTime * 4.0 + vPos.x);
    emissive = base * 1.35 * pulse;
    rough = 0.14;
  }

  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.35));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 64.0, 1.0 - rough)) * (1.0 - rough) * 0.52;
  vec3 amb = mix(vec3(0.06, 0.06, 0.12), vec3(0.20, 0.24, 0.36), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.95, 0.96, 1.10) * (0.28 + 0.72 * ndl))
           + vec3(0.92, 0.96, 1.08) * spec + emissive;
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
uniform vec3 uOrigin;
uniform vec4 uPose;   // x: yaw, y: part1RecoilZ, z: hitTilt, w: scale
uniform vec4 uFlash;  // rgb + strength

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}
vec3 rotX(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

void main() {
  vec3 p = aPos;
  vec3 n = aNorm;
  int part = int(aPart + 0.5);

  if (part == 1) {
    p.z -= uPose.y; // turret cannon recoil along -Z (local forward is +Z)
    p = rotY(p, uPose.x);
    n = rotY(n, uPose.x);
  } else if (uPose.z != 0.0) {
    p = rotX(p, uPose.z);
    n = rotX(n, uPose.z);
  }
  if (part == 0 && uPose.z == 0.0 && uPose.y == 0.0) {
    // Non-turret target full yaw
    p = rotY(p, uPose.x);
    n = rotY(n, uPose.x);
  }

  p *= uPose.w;
  vec3 wp = p + uOrigin;
  vPos = wp;
  vNorm = normalize(n);
  vCol = mix(aCol, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const UNIT_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vCol;
in float vRough;
uniform vec3 uCamPos;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.35));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.65;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.3) * 0.45;
  vec3 amb = mix(vec3(0.10, 0.10, 0.18), vec3(0.32, 0.36, 0.50), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.16, 1.14, 1.22) * (0.28 + 0.72 * ndl))
           + vec3(0.95, 0.98, 1.08) * spec + vec3(0.95, 0.30, 0.55) * rim;
  if (vRough < 0.08 && vCol.r > 0.85 && vCol.g < 0.45) lit += vec3(2.1, 0.22, 0.48);
  if (vRough < 0.08 && vCol.b > 0.85 && vCol.g > 0.80) lit += vec3(0.16, 1.75, 2.2);
  if (vRough < 0.08 && vCol.r > 0.90 && vCol.g > 0.75) lit += vec3(2.0, 1.45, 0.22);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=beam ribbon, 1=halo ring, 2=orb/spark, 3=magnetism cone
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
    float edge = 1.0 - smoothstep(0.28, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.52), clamp(a, 0.0, 0.96));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.87, r) * smoothstep(0.72, 0.84, r);
    float fill = smoothstep(0.84, 0.0, r) * (0.14 + 0.06 * sin(r * 20.0 - uTime * 8.0));
    float a = (ring + fill) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.35), clamp(a, 0.0, 0.92));
  } else if (vKind < 2.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float s = smoothstep(1.0, 0.12, r);
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.72), s * c.a);
  } else {
    // Translucent aim-assist cone from turret
    float distFade = 1.0 - smoothstep(0.15, 1.0, vUv.y);
    float border = 1.0 - smoothstep(0.015, 0.08, min(vUv.x, 1.0 - vUv.x));
    float a = c.a * distFade * (0.18 + 0.65 * border);
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), border * 0.4), clamp(a, 0.0, 0.85));
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
  const deck = [0.16, 0.19, 0.28];
  const wall = [0.22, 0.25, 0.36];
  const rose = [0.96, 0.22, 0.44];
  const cyan = [0.14, 0.86, 0.98];

  pushBox(buf, -8.2, 8.2, -0.5, 0.0, -6.6, 6.4, deck, 0);
  // Rear backstop armor wall + side rails
  pushBox(buf, -8.2, 8.2, 0.0, 2.2, -7.1, -6.5, wall, 1);
  pushBox(buf, -8.2, -7.7, 0.0, 1.2, -6.5, 6.4, wall, 1);
  pushBox(buf,  7.7,  8.2, 0.0, 1.2, -6.5, 6.4, wall, 1);
  // Glowing laser rail tracks for the strafing bots at z = -4.2, -1.6, +0.9
  for (const tz of [-4.2, -1.6, 0.9]) {
    pushBox(buf, -6.8, 6.8, 0.0, 0.08, tz - 0.12, tz + 0.12, cyan, 2);
  }
  // Neon trim on rear wall
  pushBox(buf, -7.7, 7.7, 2.02, 2.16, -6.55, -6.42, rose, 2);
  // Turret firing pad at (0, 4.9)
  pushBox(buf, -1.4, 1.4, 0.0, 0.09, 3.8, 6.0, [0.24, 0.26, 0.38], 1);
  pushBox(buf, -1.45, 1.45, 0.06, 0.11, 3.75, 3.88, cyan, 2);
  return new Float32Array(buf);
}

export function createRangeRenderer(gl) {
  const [skyProg, worldProg, unitProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [UNIT_VS, UNIT_FS],
    [FX_VS, FX_FS],
  ]);

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
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 5000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyTime = gl.getUniformLocation(skyProg, "uTime");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");

  const uUVP = gl.getUniformLocation(unitProg, "uViewProj");
  const uUOrig = gl.getUniformLocation(unitProg, "uOrigin");
  const uUPose = gl.getUniformLocation(unitProg, "uPose");
  const uUFlash = gl.getUniformLocation(unitProg, "uFlash");
  const uUCam = gl.getUniformLocation(unitProg, "uCamPos");

  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");
  const uFTime = gl.getUniformLocation(fxProg, "uTime");

  const fxBuf = [];
  function pushBeam(x0, y0, z0, x1, y1, z1, width, col) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * width * 0.5, pz = (dx / l) * width * 0.5;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, 0,
      x0 + px, y0, z0 + pz, 1, 0, r, g, b, a, 0,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, 0,
      x0 - px, y0, z0 - pz, 0, 0, r, g, b, a, 0,
      x1 + px, y1, z1 + pz, 1, 1, r, g, b, a, 0,
      x1 - px, y1, z1 - pz, 0, 1, r, g, b, a, 0
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
    const segs = 14;
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

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyTime, state.time);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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

      // Orbital Railgun Turret
      gl.useProgram(unitProg);
      gl.uniformMatrix4fv(uUVP, false, viewProj);
      gl.uniform3fv(uUCam, basis.pos);
      gl.bindVertexArray(turretGpu.vao);
      gl.uniform3f(uUOrig, state.turret.x, 0.08, state.turret.z);
      gl.uniform4f(uUPose, state.turret.yaw, state.turret.recoil, 0.0, 1.15);
      gl.uniform4f(uUFlash, 0.14, 0.92, 1.0, state.turret.recoil * 0.4);
      gl.drawElements(gl.TRIANGLES, turretGpu.count, gl.UNSIGNED_SHORT, 0);

      // Strafing Cyber Target Bots
      gl.bindVertexArray(targetGpu.vao);
      for (const tg of state.targets) {
        gl.uniform3f(uUOrig, tg.x, 0.08 + Math.sin(state.time * 3.0 + tg.id) * 0.06, tg.z);
        gl.uniform4f(uUPose, 0.0, 0.0, tg.hitTilt, 1.0);
        gl.uniform4f(uUFlash, 1.0, 0.95, 0.72, tg.flash);
        gl.drawElements(gl.TRIANGLES, targetGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Dynamic FX: Magnetism Aim Cone, Target Magnetism Bubbles, Curved Shot Ribbons, Live Bolts & Sparks!
      fxBuf.length = 0;
      const tur = state.turret;
      if (state.showOverlay) {
        // Aim laser sightline (center)
        const lx = tur.x + Math.sin(tur.yaw) * 12.2;
        const lz = tur.z + Math.cos(tur.yaw) * 12.2;
        pushBeam(tur.x, 1.02, tur.z, lx, 1.02, lz, 0.06, state.assistOn ? [0.16, 0.94, 1.0, 0.75] : [0.98, 0.35, 0.42, 0.75]);
        // Magnetism Cone (±7.5° when Assist ON)
        if (state.assistOn) {
          pushCone(tur.x, 0.14, tur.z, tur.yaw, state.magnetRad, 11.8, [0.96, 0.25, 0.58, 0.56]);
          for (const tg of state.targets) {
            pushBillboard(tg.x, 1.25, tg.z, state.magnetBubbleR, basis.right, basis.up, [0.96, 0.26, 0.58, 0.62], 1);
          }
        } else {
          // Strict tiny hitbox ring in Raw mode
          for (const tg of state.targets) {
            pushBillboard(tg.x, 1.25, tg.z, 0.46, basis.right, basis.up, [0.65, 0.75, 0.88, 0.48], 1);
          }
        }
      }

      // Persistent Shot Trajectory Ribbons (Straight dashed red raw aim vs Curved glowing cyan-magenta magnetized arc!)
      for (const tr of state.trails) {
        const a = clamp(tr.life / tr.maxLife, 0, 1);
        // Raw intended straight line (faint rose/gray)
        if (state.showOverlay) {
          pushBeam(tr.sx, 1.02, tr.sz, tr.rawEx, 1.02, tr.rawEz, 0.055, [1.0, 0.36, 0.42, a * 0.45]);
        }
        // Actual bullet trajectory curve (curved bright cyan-magenta when Magnetized!)
        const pts = tr.points;
        const col = tr.magnetized ? [0.16, 0.96, 1.0, a * 0.95] : (tr.hit ? [0.24, 1.0, 0.62, a * 0.9] : [0.98, 0.32, 0.38, a * 0.75]);
        const bw = tr.magnetized ? 0.14 : 0.09;
        for (let i = 0; i < pts.length - 1; i++) {
          pushBeam(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], bw, col);
        }
      }

      // Active flying plasma bolts
      for (const b of state.bolts) {
        pushBillboard(b.x, b.y, b.z, 0.28, basis.right, basis.up, b.magnetized ? [0.22, 0.98, 1.0, 0.98] : [1.0, 0.42, 0.52, 0.95], 2);
      }

      // Impact sparks
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
