// Dedicated 3D Stormy Neon Rooftop Helipad WebGL2 Renderer for "AI Director (Left 4 Dead Pacing)" (#12).
// Linear PBR + ACES filmic + wet rain-slick rooftop helipad with golden "H" ring, flashing phase beacon lights,
// Blender-sculpted Survivor, Infected Runners & glowing Emerald Medkit Crates, plus 3D rain streaks & muzzle flashes!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getDirectorMeshes } from "../../director-mesh.js";

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uPeak;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.020, 0.028, 0.048);
  vec3 mid = vec3(0.045, 0.062, 0.095);
  vec3 bot = mix(vec3(0.065, 0.088, 0.115), vec3(0.24, 0.05, 0.07), uPeak * 0.65);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.48, vUv.y));
  col = mix(col, top, smoothstep(0.45, 1.0, vUv.y));
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
  vPos = aPos; vNorm = aNorm; vCol = aCol; vMat = aMat;
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
uniform vec3 uPhaseCol;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base;
  float rough = 0.36;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Rain-slick wet rooftop asphalt with painted golden helipad circle & "H"!
    float r = length(vPos.xz);
    float ring = smoothstep(0.14, 0.04, abs(r - 3.6));
    float hLeft = step(abs(vPos.x + 1.1), 0.24) * step(abs(vPos.z), 1.65);
    float hRight = step(abs(vPos.x - 1.1), 0.24) * step(abs(vPos.z), 1.65);
    float hMid = step(abs(vPos.z), 0.24) * step(abs(vPos.x), 1.1);
    float paint = clamp(max(ring, max(hLeft, max(hRight, hMid))), 0.0, 1.0);
    // Wet rain puddle sheen
    float puddle = smoothstep(0.35, 0.72, sin(vPos.x * 0.9 + 1.0) * cos(vPos.z * 0.85));
    albedo = mix(base, vec3(0.86, 0.64, 0.14), paint * 0.85);
    rough = mix(0.46, 0.14, puddle);
    emissive += vec3(0.12, 0.08, 0.02) * paint;
  } else if (vMat < 1.5) {
    // Concrete rooftop parapet & HVAC vents
    rough = 0.68;
  } else {
    // Corner Phase Beacon Lights (glows Teal=RELAX, Amber=BUILD-UP, Crimson=PEAK!)
    float flash = 0.65 + 0.35 * sin(uTime * 7.0 + vPos.x);
    emissive = uPhaseCol * 1.65 * flash;
    rough = 0.12;
  }

  vec3 moonDir = normalize(vec3(0.30, 0.90, 0.32));
  float ndl = max(dot(N, moonDir), 0.0);
  vec3 H = normalize(moonDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.62;
  vec3 amb = mix(vec3(0.06, 0.08, 0.12), vec3(0.20, 0.26, 0.36), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.82, 0.90, 1.10) * (0.28 + 0.72 * ndl))
           + vec3(0.80, 0.90, 1.08) * spec + emissive;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const CHAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aRough;
layout(location=4) in float aPart;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform vec4 uPose;  // x: yaw, y: walkPhase, z: walkAmp, w: scale
uniform vec4 uFlash;

out vec3 vPos;
out vec3 vNorm;
out vec3 vCol;
out float vRough;

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }

void main() {
  vec3 p = aPos, n = aNorm;
  int part = int(aPart + 0.5);
  float sw = sin(uPose.y) * 0.58 * uPose.z;
  if (part == 1) { vec3 pv = vec3(0.12, 0.58, 0.0); p = rotX(p - pv, sw) + pv; n = rotX(n, sw); }
  else if (part == 2) { vec3 pv = vec3(-0.12, 0.58, 0.0); p = rotX(p - pv, -sw) + pv; n = rotX(n, -sw); }
  p.y += abs(sin(uPose.y)) * 0.05 * uPose.z;
  p *= uPose.w;
  vec3 wp = rotY(p, uPose.x) + uOrigin;
  vPos = wp;
  vNorm = normalize(rotY(n, uPose.x));
  vCol = mix(aCol, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const CHAR_FS = `#version 300 es
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
  vec3 moonDir = normalize(vec3(0.30, 0.90, 0.32));
  float ndl = max(dot(N, moonDir), 0.0);
  vec3 H = normalize(moonDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 64.0, 1.0 - rough)) * (1.0 - rough) * 0.58;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4) * 0.42;
  vec3 amb = mix(vec3(0.09, 0.11, 0.17), vec3(0.30, 0.34, 0.46), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.10, 1.12, 1.24) * (0.28 + 0.72 * ndl)) + vec3(0.88, 0.94, 1.08) * spec + vec3(0.45, 0.65, 0.95) * rim;
  if (vRough < 0.08 && vCol.r > 0.88 && vCol.g < 0.30) lit += vec3(2.4, 0.15, 0.20);
  if (vRough < 0.08 && vCol.g > 0.88 && vCol.r < 0.40) lit += vec3(0.18, 2.2, 0.95);
  if (vRough < 0.08 && vCol.r > 0.90 && vCol.g > 0.85) lit += vec3(2.1, 1.85, 0.65);
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=beam/rain, 1=ring, 2=orb/spark
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out float vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
in float vKind;
out vec4 fragColor;
void main() {
  vec4 c = vCol;
  if (vKind < 0.5) {
    float edge = 1.0 - smoothstep(0.25, 0.50, abs(vUv.x - 0.5));
    float a = c.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.4), clamp(a, 0.0, 0.92));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.86, r) * smoothstep(0.68, 0.82, r);
    float a = (ring + smoothstep(0.80, 0.0, r) * 0.14) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.35), clamp(a, 0.0, 0.90));
  } else {
    vec2 p = vUv * 2.0 - 1.0;
    float s = smoothstep(1.0, 0.12, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.72), s * c.a);
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

function buildRooftopWorld() {
  const buf = [];
  const asphalt = [0.15, 0.17, 0.22];
  const concrete = [0.28, 0.31, 0.37];
  const vent = [0.34, 0.38, 0.44];
  pushBox(buf, -7.8, 7.8, -0.5, 0.0, -6.4, 6.4, asphalt, 0);
  // Low concrete parapets
  pushBox(buf, -7.8, 7.8, 0.0, 0.75, -6.4, -5.9, concrete, 1);
  pushBox(buf, -7.8, -7.3, 0.0, 0.75, -5.9, 6.4, concrete, 1);
  pushBox(buf,  7.3,  7.8, 0.0, 0.75, -5.9, 6.4, concrete, 1);
  pushBox(buf, -7.8, 7.8, 0.0, 0.25,  5.9, 6.4, concrete, 1);
  // 4 Corner Phase Beacon Lights & stairwell spawn markers
  for (const [bx, bz] of [[-6.8, -5.4], [6.8, -5.4], [-6.8, 5.4], [6.8, 5.4]]) {
    pushBox(buf, bx - 0.32, bx + 0.32, 0.0, 0.95, bz - 0.32, bz + 0.32, vent, 1);
    pushBox(buf, bx - 0.24, bx + 0.24, 0.95, 1.32, bz - 0.24, bz + 0.24, [1, 1, 1], 2);
  }
  return new Float32Array(buf);
}

export function createRooftopRenderer(gl) {
  const [skyProg, worldProg, charProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [CHAR_VS, CHAR_FS],
    [FX_VS, FX_FS],
  ]);

  const emptyVao = gl.createVertexArray();
  const worldData = buildRooftopWorld();
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

  const meshes = getDirectorMeshes();
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
  const survGpu = upload(meshes.survivor);
  const zombGpu = upload(meshes.zombie);
  const medGpu = upload(meshes.medkit);

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

  const uSkyPeak = gl.getUniformLocation(skyProg, "uPeak");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uWPhase = gl.getUniformLocation(worldProg, "uPhaseCol");

  const uCVP = gl.getUniformLocation(charProg, "uViewProj");
  const uCOrig = gl.getUniformLocation(charProg, "uOrigin");
  const uCPose = gl.getUniformLocation(charProg, "uPose");
  const uCFlash = gl.getUniformLocation(charProg, "uFlash");
  const uCCam = gl.getUniformLocation(charProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

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
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z0, 1, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1,
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1, x0, y, z1, 0, 1, r, g, b, a, 1
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
      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.uniform1f(uSkyPeak, state.phase === "PEAK" ? 1.0 : (state.phase === "BUILD" ? 0.35 : 0.0));
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      const pCol = state.phase === "PEAK" ? [1.0, 0.16, 0.22]
                 : state.phase === "RELAX" ? [0.14, 0.92, 0.72]
                 : state.phase === "FADE" ? [0.42, 0.72, 1.0]
                 : [1.0, 0.70, 0.16];

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.uniform3fv(uWPhase, pCol);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      gl.useProgram(charProg);
      gl.uniformMatrix4fv(uCVP, false, viewProj);
      gl.uniform3fv(uCCam, basis.pos);

      // Survivor
      const sv = state.survivor;
      gl.bindVertexArray(survGpu.vao);
      gl.uniform3f(uCOrig, sv.x, 0.0, sv.z);
      gl.uniform4f(uCPose, sv.yaw, sv.walkPhase, sv.walkAmp, 0.96);
      gl.uniform4f(uCFlash, 1.0, 0.22, 0.26, sv.hurtFlash);
      gl.drawElements(gl.TRIANGLES, survGpu.count, gl.UNSIGNED_SHORT, 0);

      // Infected Runners
      gl.bindVertexArray(zombGpu.vao);
      for (const z of state.zombies) {
        gl.uniform3f(uCOrig, z.x, 0.0, z.z);
        gl.uniform4f(uCPose, z.yaw, z.walkPhase, 1.0, 0.92);
        gl.uniform4f(uCFlash, 1.0, 0.90, 0.65, z.flash);
        gl.drawElements(gl.TRIANGLES, zombGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Dynamic Director Medkit Crates
      gl.bindVertexArray(medGpu.vao);
      for (const mk of state.medkits) {
        gl.uniform3f(uCOrig, mk.x, 0.08 + Math.sin(state.time * 3.5) * 0.08, mk.z);
        gl.uniform4f(uCPose, state.time * 1.4, 0.0, 0.0, 1.0);
        gl.uniform4f(uCFlash, 0.16, 1.0, 0.64, 0.15);
        gl.drawElements(gl.TRIANGLES, medGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // FX: Shotgun Tracer Pellets, Medkit Glow Rings, Sparks & Subtle Storm Rain!
      fxBuf.length = 0;
      for (const mk of state.medkits) {
        pushRingXZ(mk.x, 0.06, mk.z, 0.85 + 0.12 * Math.sin(state.time * 5.0), [0.16, 1.0, 0.64, 0.80]);
      }
      for (const tr of state.tracers) {
        const a = clamp(tr.life / tr.maxLife, 0, 1);
        pushBeam(tr.x0, 0.92, tr.z0, tr.x1, 0.92, tr.z1, 0.10, [1.0, 0.86, 0.35, a * 0.95]);
      }
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
