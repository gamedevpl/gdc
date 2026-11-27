// Dedicated 3D Amethyst Crystal Crypt WebGL2 Renderer for "Procedural Dungeon (BSP + MST)" (#13).
// Linear PBR + ACES filmic + live carved 3D dungeon rooms & corridors, glowing amber BSP partition lines,
// neon cyan MST graph edges, flood-fill verified emerald path, Blender-sculpted Explorer & Boss Exit Crystal!
import {
  clamp,
  makeLookAt,
  makePerspective,
  mulMat4,
  cameraBasisFromOrbit,
  FULL_VS,
  linkPrograms,
} from "../../gl-utils.js";
import { getDungeonMeshes } from "../../dungeon-mesh.js";

export const D_COLS = 24;
export const D_ROWS = 18;
export const D_TILE = 0.72;

export function dTileToWorld(c, r) {
  return [(c - (D_COLS - 1) * 0.5) * D_TILE, (r - (D_ROWS - 1) * 0.5) * D_TILE];
}

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 top = vec3(0.028, 0.018, 0.068);
  vec3 mid = vec3(0.068, 0.036, 0.135);
  vec3 bot = vec3(0.115, 0.052, 0.165);
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
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 albedo = base;
  float rough = 0.55;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Carved amethyst crypt floor tile
    vec2 f = fract(vPos.xz / 0.72 + 0.5);
    float g = 1.0 - smoothstep(0.03, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base, base * 0.45, g * 0.65);
    emissive = base * 0.14;
  } else if (vMat < 1.5) {
    // Carved stone dungeon wall
    float seam = smoothstep(0.04, 0.09, abs(fract(vPos.y * 2.0) - 0.5));
    albedo = base * mix(0.76, 1.05, seam);
    rough = 0.65;
  } else {
    // Glowing verified path / portal accent
    float p = 0.80 + 0.20 * sin(uTime * 5.0 + vPos.x);
    emissive = base * 0.95 * p;
    rough = 0.20;
  }

  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.30));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 56.0, 1.0 - rough)) * (1.0 - rough) * 0.45;
  vec3 amb = mix(vec3(0.09, 0.06, 0.16), vec3(0.28, 0.22, 0.42), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(0.96, 0.92, 1.15) * (0.28 + 0.72 * ndl)) + vec3(0.85, 0.80, 1.10) * spec + emissive;
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
uniform vec4 uPose; // x: yaw, y: spin1, z: bob1, w: scale
out vec3 vPos; out vec3 vNorm; out vec3 vCol; out float vRough;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
void main() {
  vec3 p = aPos, n = aNorm;
  if (int(aPart + 0.5) == 1) { p = rotY(p, uPose.y); n = rotY(n, uPose.y); p.y += uPose.z; }
  p *= uPose.w;
  vec3 wp = rotY(p, uPose.x) + uOrigin;
  vPos = wp; vNorm = normalize(rotY(n, uPose.x)); vCol = aCol; vRough = aRough;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const UNIT_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in vec3 vCol; in float vRough;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm); vec3 V = normalize(uCamPos - vPos);
  vec3 base = pow(max(vCol, vec3(0.001)), vec3(2.2));
  vec3 sunDir = normalize(vec3(0.32, 0.90, 0.30));
  float ndl = max(dot(N, sunDir), 0.0);
  vec3 amb = mix(vec3(0.12, 0.09, 0.22), vec3(0.36, 0.32, 0.54), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.12, 1.10, 1.24) * (0.28 + 0.72 * ndl));
  if (vRough < 0.08) lit += pow(max(vCol, vec3(0.01)), vec3(1.6)) * 2.0;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
uniform mat4 uViewProj;
out vec2 vUv; out vec4 vCol;
void main() { vUv = aUv; vCol = aCol; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 fragColor;
void main() {
  float edge = 1.0 - smoothstep(0.25, 0.50, abs(vUv.x - 0.5));
  float a = vCol.a * edge;
  if (a < 0.01) discard;
  fragColor = vec4(mix(vCol.rgb, vec3(1.0), edge * 0.38), clamp(a, 0.0, 0.95));
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

export function createDungeonRenderer(gl) {
  const [skyProg, worldProg, unitProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [WORLD_VS, WORLD_FS],
    [UNIT_VS, UNIT_FS],
    [FX_VS, FX_FS],
  ]);

  const emptyVao = gl.createVertexArray();
  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 24000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

  const meshes = getDungeonMeshes();
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
  const delverGpu = upload(meshes.delver);
  const crystalGpu = upload(meshes.crystal);

  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 9 * 3000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
  gl.bindVertexArray(null);

  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uUVP = gl.getUniformLocation(unitProg, "uViewProj");
  const uUOrig = gl.getUniformLocation(unitProg, "uOrigin");
  const uUPose = gl.getUniformLocation(unitProg, "uPose");
  const uUCam = gl.getUniformLocation(unitProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

  let worldVertCount = 0;
  let lastVersion = -1;

  function rebuildWorld(state) {
    const buf = [];
    const halfX = D_COLS * D_TILE * 0.5;
    const halfZ = D_ROWS * D_TILE * 0.5;
    const h = D_TILE * 0.5;
    // Crypt bedrock base slab
    pushBox(buf, -halfX - 0.3, halfX + 0.3, -0.5, 0.0, -halfZ - 0.3, halfZ + 0.3, [0.10, 0.08, 0.16], 1);

    const wallCol = [0.22, 0.18, 0.32];
    const roomCol = [0.34, 0.28, 0.52];
    const corrCol = [0.26, 0.44, 0.56];
    const isoCol  = [0.68, 0.18, 0.26]; // isolated unreachable island room in Pure Random mode!
    const pathCol = [0.16, 0.90, 0.64];
    const overCol = [0.92, 0.38, 0.22]; // overlapping ugly blob highlight in Pure Random!

    for (let r = 0; r < D_ROWS; r++) {
      for (let c = 0; c < D_COLS; c++) {
        const idx = r * D_COLS + c;
        const cell = state.grid[idx]; // 0=wall, 1=room, 2=corridor, 3=overlap
        const [wx, wz] = dTileToWorld(c, r);
        if (cell === 0) {
          // Only draw wall blocks bordering a carved floor tile (or outer rim) for crisp dungeon silhouette!
          let adj = (r === 0 || r === D_ROWS - 1 || c === 0 || c === D_COLS - 1);
          if (!adj) {
            for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
              if (state.grid[(r + dr) * D_COLS + (c + dc)] > 0) { adj = true; break; }
            }
          }
          if (adj) pushBox(buf, wx - h + 0.01, wx + h - 0.01, 0.0, 0.72, wz - h + 0.01, wz + h - 0.01, wallCol, 1);
        } else {
          const isPath = state.pathSet.has(idx);
          const isReach = state.reachableSet.has(idx);
          const col = isPath ? pathCol
            : !isReach ? isoCol
            : cell === 3 ? overCol
            : cell === 2 ? corrCol : roomCol;
          const mat = isPath ? 2 : 0;
          buf.push(
            wx - h, 0.02, wz + h, 0, 1, 0, col[0], col[1], col[2], mat,
            wx + h, 0.02, wz + h, 0, 1, 0, col[0], col[1], col[2], mat,
            wx + h, 0.02, wz - h, 0, 1, 0, col[0], col[1], col[2], mat,
            wx - h, 0.02, wz + h, 0, 1, 0, col[0], col[1], col[2], mat,
            wx + h, 0.02, wz - h, 0, 1, 0, col[0], col[1], col[2], mat,
            wx - h, 0.02, wz - h, 0, 1, 0, col[0], col[1], col[2], mat
          );
        }
      }
    }
    const arr = new Float32Array(buf);
    worldVertCount = arr.length / 10;
    gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    lastVersion = state.version;
  }

  const fxBuf = [];
  function pushLine(x0, y, z0, x1, z1, width, col) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * width * 0.5, pz = (dx / l) * width * 0.5;
    const [r, g, b, a] = col;
    fxBuf.push(
      x0 - px, y, z0 - pz, 0, 0, r, g, b, a,
      x0 + px, y, z0 + pz, 1, 0, r, g, b, a,
      x1 + px, y, z1 + pz, 1, 1, r, g, b, a,
      x0 - px, y, z0 - pz, 0, 0, r, g, b, a,
      x1 + px, y, z1 + pz, 1, 1, r, g, b, a,
      x1 - px, y, z1 - pz, 0, 1, r, g, b, a
    );
  }

  return {
    render(w, h, cam, state) {
      if (state.version !== lastVersion) rebuildWorld(state);
      const aspect = w / Math.max(1, h);
      const basis = cameraBasisFromOrbit(cam.yaw, cam.pitch, cam.dist, cam.targetX, cam.targetY, cam.targetZ);
      const proj = makePerspective((cam.fovDeg * Math.PI) / 180, aspect, 0.2, 120.0);
      const view = makeLookAt(basis.pos, basis.target, [0, 1, 0]);
      const viewProj = mulMat4(proj, view);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(skyProg); gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

      gl.useProgram(worldProg);
      gl.uniformMatrix4fv(uWVP, false, viewProj);
      gl.uniform3fv(uWCam, basis.pos);
      gl.uniform1f(uWTime, state.time);
      gl.bindVertexArray(worldVao);
      gl.drawArrays(gl.TRIANGLES, 0, worldVertCount);

      // Explorer Delver & Boss Exit Crystal
      gl.useProgram(unitProg);
      gl.uniformMatrix4fv(uUVP, false, viewProj);
      gl.uniform3fv(uUCam, basis.pos);

      gl.bindVertexArray(delverGpu.vao);
      gl.uniform3f(uUOrig, state.delver.x, 0.02, state.delver.z);
      gl.uniform4f(uUPose, state.delver.yaw, 0.0, 0.0, 0.85);
      gl.drawElements(gl.TRIANGLES, delverGpu.count, gl.UNSIGNED_SHORT, 0);

      const [ex, ez] = dTileToWorld(state.exit.c, state.exit.r);
      gl.bindVertexArray(crystalGpu.vao);
      gl.uniform3f(uUOrig, ex, 0.02, ez);
      gl.uniform4f(uUPose, 0.0, state.time * 2.2, Math.sin(state.time * 3.0) * 0.12, 1.0);
      gl.drawElements(gl.TRIANGLES, crystalGpu.count, gl.UNSIGNED_SHORT, 0);

      // Translucent FX: Glowing Amber BSP Split Planes & Neon Cyan MST Corridor Graph!
      fxBuf.length = 0;
      if (state.showGraph) {
        for (const sp of state.bspLines) {
          const [x0, z0] = dTileToWorld(sp.c0, sp.r0);
          const [x1, z1] = dTileToWorld(sp.c1, sp.r1);
          pushLine(x0, 0.78, z0, x1, z1, 0.12, [1.0, 0.78, 0.22, 0.86]);
        }
        for (const ed of state.mstEdges) {
          const [x0, z0] = dTileToWorld(ed.c0, ed.r0);
          const [x1, z1] = dTileToWorld(ed.c1, ed.r1);
          pushLine(x0, 0.28, z0, x1, z1, 0.11, [0.18, 0.92, 1.0, 0.88]);
        }
      }

      if (fxBuf.length > 0) {
        gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.useProgram(fxProg); gl.uniformMatrix4fv(uFVP, false, viewProj);
        gl.bindVertexArray(fxVao); gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(fxBuf));
        gl.drawArrays(gl.TRIANGLES, 0, fxBuf.length / 9);
        gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
      }

      gl.bindVertexArray(null);
      return { viewProj, basis };
    },
  };
}
