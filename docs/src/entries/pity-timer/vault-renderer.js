// Dedicated 3D Gilded Treasure Vault WebGL2 Renderer for "Pity Timer & Pseudo-Random Drops" (#14).
// Linear PBR + ACES filmic + warm obsidian & gold temple vault + Blender-sculpted Articulated Treasure Chest
// (hinged lid springs open!) + rising Legendary Golden Sun-Crown Relic + golden jackpot light pillar & sparks!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getPityMeshes } from "../../pity-mesh.js";

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uGoldFlash;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.032, 0.022, 0.048);
  vec3 mid = vec3(0.088, 0.056, 0.085);
  vec3 bot = mix(vec3(0.145, 0.095, 0.065), vec3(0.45, 0.32, 0.08), uGoldFlash * 0.65);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.5, vUv.y));
  col = mix(col, top, smoothstep(0.46, 1.0, vUv.y));
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
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vMat;
void main() { vPos = aPos; vNorm = aNorm; vCol = aCol; vMat = aMat; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vMat;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uGoldFlash;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm); vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base; float rough = 0.42; vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Vault obsidian marble floor with concentric golden alchemy rings!
    float r = length(vPos.xz);
    float ring = smoothstep(0.10, 0.03, abs(r - 2.6)) + smoothstep(0.08, 0.02, abs(r - 4.4));
    vec2 f = fract(vPos.xz * 0.5);
    float g = 1.0 - smoothstep(0.015, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    emissive = vec3(0.95, 0.70, 0.16) * (ring * (0.45 + uGoldFlash * 0.9) + g * 0.08);
    rough = mix(0.28, 0.50, g);
  } else if (vMat < 1.5) {
    rough = 0.22;
    emissive = base * (0.14 + uGoldFlash * 0.45);
  } else {
    float p = 0.85 + 0.15 * sin(uTime * 5.0 + vPos.x);
    emissive = vec3(1.5, 1.05, 0.30) * p;
    rough = 0.12;
  }

  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 68.0, 1.0 - rough)) * (1.0 - rough) * 0.58;
  vec3 amb = mix(vec3(0.08, 0.06, 0.09), vec3(0.26, 0.20, 0.22), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.08, 0.96, 0.84) * (0.28 + 0.72 * ndl)) + vec3(1.0, 0.92, 0.76) * spec + emissive;
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
uniform vec3 uOrigin;
uniform vec4 uPose; // x: yaw, y: lidOpenRad, z: bounceScaleY, w: scale
uniform vec4 uTint;
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vRough;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
void main() {
  vec3 p = aPos, n = aNorm;
  if (int(aPart + 0.5) == 1 && uPose.y != 0.0) {
    // Hinge lid cleanly around back edge (y=0.82, z=-0.52 in WebGL)!
    vec3 pv = vec3(0.0, 0.82, -0.52);
    p = rotX(p - pv, -uPose.y) + pv;
    n = rotX(n, -uPose.y);
  }
  p.y *= uPose.z;
  p *= uPose.w;
  vec3 wp = rotY(p, uPose.x) + uOrigin;
  vPos = wp; vNorm = normalize(rotY(n, uPose.x));
  vCol = mix(aCol, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const PROP_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vRough;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm); vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.36));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 72.0, 1.0 - rough)) * (1.0 - rough) * 0.70;
  vec3 amb = mix(vec3(0.10, 0.08, 0.12), vec3(0.34, 0.28, 0.30), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.18, 1.08, 0.96) * (0.28 + 0.72 * ndl)) + vec3(1.0, 0.95, 0.82) * spec;
  if (vRough < 0.08) lit += pow(max(vCol, vec3(0.01)), vec3(1.5)) * 2.1;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=beam pillar, 1=ring, 2=spark
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
    float fadeY = 1.0 - smoothstep(0.25, 1.0, vUv.y);
    float a = c.a * edge * fadeY;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), edge * 0.45), clamp(a, 0.0, 0.90));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float ring = smoothstep(0.99, 0.84, r) * smoothstep(0.65, 0.80, r);
    float a = (ring + smoothstep(0.75, 0.0, r) * 0.14) * c.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(c.rgb, vec3(1.0), ring * 0.4), clamp(a, 0.0, 0.92));
  } else {
    vec2 p = vUv * 2.0 - 1.0; float s = smoothstep(1.0, 0.10, length(p));
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

function buildVaultWorld() {
  const buf = [];
  const floor = [0.16, 0.14, 0.22];
  const gold = [0.92, 0.72, 0.22];
  const dark = [0.22, 0.19, 0.30];
  pushBox(buf, -7.0, 7.0, -0.5, 0.0, -5.6, 5.6, floor, 0);
  // Central stepped altar pedestal for the Treasure Chest!
  pushBox(buf, -1.9, 1.9, 0.0, 0.28, -1.6, 1.6, dark, 0);
  pushBox(buf, -1.55, 1.55, 0.28, 0.44, -1.25, 1.25, gold, 1);
  // 4 Corner Temple Braziers
  for (const [bx, bz] of [[-5.2, -3.8], [5.2, -3.8], [-5.2, 3.8], [5.2, 3.8]]) {
    pushBox(buf, bx - 0.45, bx + 0.45, 0.0, 1.4, bz - 0.45, bz + 0.45, dark, 0);
    pushBox(buf, bx - 0.50, bx + 0.50, 1.4, 1.54, bz - 0.50, bz + 0.50, gold, 1);
    pushBox(buf, bx - 0.28, bx + 0.28, 1.54, 1.88, bz - 0.28, bz + 0.28, [1, 0.85, 0.3], 2);
  }
  return new Float32Array(buf);
}

export function createVaultRenderer(gl) {
  const [skyProg, worldProg, propProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [PROP_VS, PROP_FS],
    [FX_VS, FX_FS],
  ]);

  const emptyVao = gl.createVertexArray();
  const worldData = buildVaultWorld();
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
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 3000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uSkyGold = gl.getUniformLocation(skyProg, "uGoldFlash");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uWGold = gl.getUniformLocation(worldProg, "uGoldFlash");
  const uPVP = gl.getUniformLocation(propProg, "uViewProj");
  const uPOrig = gl.getUniformLocation(propProg, "uOrigin");
  const uPPose = gl.getUniformLocation(propProg, "uPose");
  const uPTint = gl.getUniformLocation(propProg, "uTint");
  const uPCam = gl.getUniformLocation(propProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

  const fxBuf = [];
  function pushRingXZ(cx, y, cz, rad, col) {
    const [r, g, b, a] = col;
    const x0 = cx - rad, x1 = cx + rad, z0 = cz - rad, z1 = cz + rad;
    fxBuf.push(
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z0, 1, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1,
      x0, y, z0, 0, 0, r, g, b, a, 1, x1, y, z1, 1, 1, r, g, b, a, 1, x0, y, z1, 0, 1, r, g, b, a, 1
    );
  }
  function pushPillar(cx, cz, width, height, right, col) {
    const [r, g, b, a] = col;
    const rx = right[0] * width * 0.5, rz = right[2] * width * 0.5;
    fxBuf.push(
      cx - rx, 0.8, cz - rz, 0, 0, r, g, b, a, 0,
      cx + rx, 0.8, cz + rz, 1, 0, r, g, b, a, 0,
      cx + rx, 0.8 + height, cz + rz, 1, 1, r, g, b, a, 0,
      cx - rx, 0.8, cz - rz, 0, 0, r, g, b, a, 0,
      cx + rx, 0.8 + height, cz + rz, 1, 1, r, g, b, a, 0,
      cx - rx, 0.8 + height, cz - rz, 0, 1, r, g, b, a, 0
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
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(skyProg); gl.uniform1f(uSkyGold, state.goldFlash);
      gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.uniform1f(uWGold, state.goldFlash);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // Articulated Gilded Treasure Chest on Center Pedestal!
      gl.useProgram(propProg);
      gl.uniformMatrix4fv(uPVP, false, viewProj);
      gl.uniform3fv(uPCam, basis.pos);
      gl.bindVertexArray(chestGpu.vao);
      gl.uniform3f(uPOrig, 0.0, 0.44, 0.0);
      gl.uniform4f(uPPose, 0.0, state.lidOpen * 1.48, 1.0 + state.chestBounce * 0.18, 1.28);
      gl.uniform4f(uPTint, 1.0, 0.84, 0.24, state.goldFlash * 0.35);
      gl.drawElements(gl.TRIANGLES, chestGpu.count, gl.UNSIGNED_SHORT, 0);

      // Floating Drop Relic rising out of chest!
      if (state.dropPop > 0.01) {
        gl.bindVertexArray(relicGpu.vao);
        const dropCol = state.lastRarity === "LEGENDARY" ? [1.0, 0.84, 0.18, 0.0]
          : state.lastRarity === "RARE" ? [0.22, 0.72, 1.0, 0.90]
          : [0.64, 0.70, 0.78, 0.92];
        const sc = state.lastRarity === "LEGENDARY" ? 1.55 : 0.92;
        gl.uniform3f(uPOrig, 0.0, 1.15 + state.dropPop * 1.35 + Math.sin(state.time * 4.0) * 0.08, 0.0);
        gl.uniform4f(uPPose, state.time * 2.8, 0.0, 1.0, sc * clamp(state.dropPop * 1.4, 0, 1));
        gl.uniform4f(uPTint, dropCol[0], dropCol[1], dropCol[2], dropCol[3]);
        gl.drawElements(gl.TRIANGLES, relicGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Recent Loot History Gems orbiting the altar (last 20 pulls as physical glowing stones!)
      gl.bindVertexArray(relicGpu.vao);
      const recent = state.recentDrops;
      for (let i = 0; i < recent.length; i++) {
        const d = recent[i];
        const a = (i / 20) * Math.PI * 2 + state.time * 0.25;
        const rad = 3.5;
        const gx = Math.cos(a) * rad, gz = Math.sin(a) * rad;
        const isLeg = d === "LEGENDARY";
        gl.uniform3f(uPOrig, gx, isLeg ? 0.85 : 0.42, gz);
        gl.uniform4f(uPPose, a + state.time, 0.0, 1.0, isLeg ? 0.78 : 0.38);
        if (isLeg) gl.uniform4f(uPTint, 1.0, 0.84, 0.18, 0.0);
        else if (d === "RARE") gl.uniform4f(uPTint, 0.22, 0.72, 1.0, 0.90);
        else gl.uniform4f(uPTint, 0.56, 0.62, 0.72, 0.92);
        gl.drawElements(gl.TRIANGLES, relicGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // FX: Legendary Golden Light Pillar + Expanding Shockwave Ring + Confetti Sparks!
      fxBuf.length = 0;
      if (state.goldFlash > 0.03) {
        pushPillar(0, 0, 2.4, 7.5, basis.right, [1.0, 0.84, 0.24, state.goldFlash * 0.78]);
        pushRingXZ(0, 0.48, 0, 1.2 + (1 - state.goldFlash) * 4.2, [1.0, 0.86, 0.28, state.goldFlash * 0.92]);
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
