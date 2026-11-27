// Dedicated 3D Torchlit Stone Crypt WebGL2 Renderer for "Procedural Dungeon (BSP + MST)" (#13).
// Studio Overhaul: 1024x1024 PCF shadows + textured sandstone-slate dungeon brick walls + mossy flagstone floors +
// flickering warm orange wall-torch braziers in every room + Start Portal & Boss Shrine rings +
// Live 4-Stage Animated BSP Slice -> Room Carve -> MST Corridor -> Flood-Fill Verification visuals!
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
import { getDungeonMeshes } from "../../dungeon-mesh.js";

const SHADOW_RES = 1024;
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
  vec3 top = vec3(0.024, 0.020, 0.056);
  vec3 mid = vec3(0.064, 0.044, 0.118);
  vec3 bot = vec3(0.118, 0.068, 0.132);
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
  vPos = aPos; vNorm = aNorm; vCol = aCol; vMat = aMat;
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
  float rough = 0.52;
  vec3 emissive = vec3(0.0);

  if (vMat < 0.5) {
    // Carved ancient flagstone floor with warm mortar seams & subtle stone variation
    vec2 cell = floor(vPos.xz / 0.72 + 0.5);
    float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    vec2 f = fract(vPos.xz / 0.72 + 0.5);
    float grout = 1.0 - smoothstep(0.025, 0.075, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = base * (0.86 + 0.24 * h);
    albedo = mix(albedo, vec3(0.06, 0.05, 0.09), grout * 0.65);
    emissive = base * 0.10;
    rough = mix(0.46, 0.72, grout);
  } else if (vMat < 1.5) {
    // Textured dungeon stone masonry walls (running brick bond on sides, carved stone cap on top!)
    if (N.y > 0.7) {
      vec2 f = fract(vPos.xz / 0.72 + 0.5);
      float bevel = smoothstep(0.04, 0.14, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
      albedo = base * mix(0.72, 1.12, bevel);
      rough = 0.54;
    } else {
      float row = floor(vPos.y * 4.2);
      float bx = fract((vPos.x + vPos.z) * 1.45 + mod(row, 2.0) * 0.5);
      float by = fract(vPos.y * 4.2);
      float mortar = 1.0 - smoothstep(0.03, 0.08, min(min(bx, 1.0 - bx), min(by, 1.0 - by)));
      albedo = mix(base * 1.05, vec3(0.05, 0.04, 0.08), mortar * 0.68);
      rough = 0.64;
    }
  } else if (vMat < 2.5) {
    // Flood-fill verified emerald path tile!
    float p = 0.84 + 0.16 * sin(uTime * 4.5 + vPos.x * 0.8 + vPos.z * 0.8);
    vec2 f = fract(vPos.xz / 0.72 + 0.5);
    float edge = 1.0 - smoothstep(0.04, 0.12, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    albedo = mix(base, base * 0.6, edge * 0.5);
    emissive = base * (0.65 + 0.35 * (1.0 - edge)) * p;
    rough = 0.22;
  } else {
    // Flickering warm orange wall-torch brazier ember!
    float flick = 0.85 + 0.15 * sin(uTime * 11.0 + vPos.x * 3.1 + vPos.z * 2.3);
    albedo = vec3(1.0, 0.55, 0.12);
    emissive = vec3(2.4, 1.15, 0.22) * flick;
    rough = 0.08;
  }

  vec3 keyDir = normalize(vec3(0.34, 0.88, 0.32));
  float ndl = max(dot(N, keyDir), 0.0);
  float sh = calcShadow(vShadow, ndl);
  vec3 H = normalize(keyDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 56.0, 1.0 - rough)) * (1.0 - rough) * 0.48;
  vec3 amb = mix(vec3(0.12, 0.09, 0.18), vec3(0.36, 0.30, 0.46), N.y * 0.5 + 0.5);
  vec3 lit = albedo * (amb + vec3(1.16, 1.04, 0.96) * ndl * (0.28 + 0.72 * sh))
           + vec3(1.0, 0.90, 0.78) * spec * (0.35 + 0.65 * sh)
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
  vec3 keyDir = normalize(vec3(0.34, 0.88, 0.32));
  float ndl = max(dot(N, keyDir), 0.0);
  vec3 H = normalize(keyDir + V);
  float rough = clamp(vRough, 0.04, 0.90);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 64.0, 1.0 - rough)) * (1.0 - rough) * 0.65;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.3) * 0.45;
  vec3 amb = mix(vec3(0.16, 0.12, 0.24), vec3(0.42, 0.38, 0.56), N.y * 0.5 + 0.5);
  vec3 lit = base * (amb + vec3(1.18, 1.12, 1.24) * (0.30 + 0.70 * ndl)) + vec3(1.0, 0.94, 0.84) * spec + vec3(0.65, 0.45, 1.0) * rim;
  if (vRough < 0.08) lit += pow(max(vCol, vec3(0.01)), vec3(1.5)) * 2.2;
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

const FX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aKind; // 0=line/beam, 1=ring, 2=glow orb
uniform mat4 uViewProj;
out vec2 vUv; out vec4 vCol; out float vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

const FX_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in float vKind;
out vec4 fragColor;
void main() {
  if (vKind < 0.5) {
    float edge = 1.0 - smoothstep(0.22, 0.50, abs(vUv.x - 0.5));
    float a = vCol.a * edge;
    if (a < 0.01) discard;
    fragColor = vec4(mix(vCol.rgb, vec3(1.0), edge * 0.42), clamp(a, 0.0, 0.96));
  } else if (vKind < 1.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.99, 0.84, r) * smoothstep(0.66, 0.82, r);
    float a = (ring + smoothstep(0.75, 0.0, r) * 0.14) * vCol.a;
    if (a < 0.01) discard;
    fragColor = vec4(mix(vCol.rgb, vec3(1.0), ring * 0.4), clamp(a, 0.0, 0.94));
  } else {
    vec2 p = vUv * 2.0 - 1.0;
    float s = smoothstep(1.0, 0.08, length(p));
    if (s < 0.01) discard;
    fragColor = vec4(mix(vCol.rgb, vec3(1.0), smoothstep(0.45, 0.0, length(p)) * 0.65), s * vCol.a);
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

export function createDungeonRenderer(gl) {
  const [skyProg, shWorldProg, worldProg, unitProg, fxProg] = linkPrograms(gl, [
    [FULL_VS, SKY_FS],
    [SHADOW_WORLD_VS, SHADOW_FS],
    [WORLD_VS, WORLD_FS],
    [UNIT_VS, UNIT_FS],
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
    makeOrtho(-11.2, 11.2, -9.2, 9.2, 1.0, 34.0),
    makeLookAt([6.8, 17.5, 6.4], [0, 0, 0], [0, 1, 0])
  );

  const emptyVao = gl.createVertexArray();
  const worldVao = gl.createVertexArray();
  const worldVbo = gl.createBuffer();
  gl.bindVertexArray(worldVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 32000, gl.DYNAMIC_DRAW);
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
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 10 * 5000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const uShWVP = gl.getUniformLocation(shWorldProg, "uLightVP");
  const uWVP = gl.getUniformLocation(worldProg, "uViewProj");
  const uWLightVP = gl.getUniformLocation(worldProg, "uLightVP");
  const uWShadow = gl.getUniformLocation(worldProg, "uShadowMap");
  const uWCam = gl.getUniformLocation(worldProg, "uCamPos");
  const uWTime = gl.getUniformLocation(worldProg, "uTime");
  const uUVP = gl.getUniformLocation(unitProg, "uViewProj");
  const uUOrig = gl.getUniformLocation(unitProg, "uOrigin");
  const uUPose = gl.getUniformLocation(unitProg, "uPose");
  const uUCam = gl.getUniformLocation(unitProg, "uCamPos");
  const uFVP = gl.getUniformLocation(fxProg, "uViewProj");

  let worldVertCount = 0;
  let lastBuildKey = "";

  function bakeShadow() {
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function rebuildWorld(state) {
    const buf = [];
    const halfX = D_COLS * D_TILE * 0.5;
    const halfZ = D_ROWS * D_TILE * 0.5;
    const h = D_TILE * 0.5;
    const stg = state.genStage; // 1=BSP Slices, 2=Rooms Carved, 3=Corridors Linked, 4=Flood-Fill Verified

    // Carved crypt bedrock plinth
    pushBox(buf, -halfX - 0.35, halfX + 0.35, -0.55, 0.0, -halfZ - 0.35, halfZ + 0.35, [0.14, 0.12, 0.20], 1);

    const wallCol = [0.30, 0.27, 0.40];
    const roomCol = [0.46, 0.42, 0.58];
    const corrCol = [0.32, 0.52, 0.64];
    const isoCol  = [0.76, 0.20, 0.28];
    const pathCol = [0.16, 0.92, 0.64];
    const overCol = [0.95, 0.44, 0.18];

    // Effective visible grid at the current live generation stage!
    function visibleCell(idx) {
      const c = state.grid[idx];
      if (stg <= 1) return 0; // Stage 1: uncut solid stone block with golden BSP cut planes!
      if (stg === 2 && c === 2) return 0; // Stage 2: rooms carved, corridors not punched yet!
      return c;
    }

    for (let r = 0; r < D_ROWS; r++) {
      for (let c = 0; c < D_COLS; c++) {
        const idx = r * D_COLS + c;
        const cell = visibleCell(idx);
        const [wx, wz] = dTileToWorld(c, r);

        if (cell === 0) {
          if (stg <= 1) {
            // Stage 1: Clean solid perimeter rim + subtle recessed stone slab so golden BSP planes stand out!
            if (r === 0 || r === D_ROWS - 1 || c === 0 || c === D_COLS - 1) {
              pushBox(buf, wx - h + 0.01, wx + h - 0.01, 0.0, 0.78, wz - h + 0.01, wz + h - 0.01, wallCol, 1);
            } else {
              pushBox(buf, wx - h + 0.01, wx + h - 0.01, 0.0, 0.42, wz - h + 0.01, wz + h - 0.01, [0.24, 0.21, 0.33], 1);
            }
          } else {
            let adj = (r === 0 || r === D_ROWS - 1 || c === 0 || c === D_COLS - 1);
            if (!adj) {
              for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                if (visibleCell((r + dr) * D_COLS + (c + dc)) > 0) { adj = true; break; }
              }
            }
            if (adj) pushBox(buf, wx - h + 0.01, wx + h - 0.01, 0.0, 0.80, wz - h + 0.01, wz + h - 0.01, wallCol, 1);
          }
        } else {
          const isPath = stg >= 4 && state.pathSet.has(idx);
          const isReach = stg < 4 ? true : state.reachableSet.has(idx);
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

    // Warm flickering Wall-Torch Braziers in the corner of every carved room (Stage 2+)!
    if (stg >= 2 && state.torches) {
      for (const tc of state.torches) {
        const [tx, tz] = dTileToWorld(tc.c, tc.r);
        pushBox(buf, tx - 0.12, tx + 0.12, 0.02, 0.44, tz - 0.12, tz + 0.12, [0.22, 0.18, 0.16], 1);
        pushBox(buf, tx - 0.11, tx + 0.11, 0.44, 0.62, tz - 0.11, tz + 0.11, [1.0, 0.62, 0.16], 3);
      }
    }

    const arr = new Float32Array(buf);
    worldVertCount = arr.length / 10;
    gl.bindBuffer(gl.ARRAY_BUFFER, worldVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    bakeShadow();
    lastBuildKey = `${state.version}:${stg}`;
  }

  const fxBuf = [];
  function pushLine(x0, y, z0, x1, z1, width, col) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * width * 0.5, pz = (dx / l) * width * 0.5;
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
      const buildKey = `${state.version}:${state.genStage}`;
      if (buildKey !== lastBuildKey) rebuildWorld(state);
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

      // Explorer Delver & Boss Exit Crystal Shrine (appear once rooms carve at Stage 2+)
      if (state.genStage >= 2) {
        gl.useProgram(unitProg);
        gl.uniformMatrix4fv(uUVP, false, viewProj);
        gl.uniform3fv(uUCam, basis.pos);

        gl.bindVertexArray(delverGpu.vao);
        gl.uniform3f(uUOrig, state.delver.x, 0.02, state.delver.z);
        gl.uniform4f(uUPose, state.delver.yaw, 0.0, 0.0, 0.96);
        gl.drawElements(gl.TRIANGLES, delverGpu.count, gl.UNSIGNED_SHORT, 0);

        const [ex, ez] = dTileToWorld(state.exit.c, state.exit.r);
        gl.bindVertexArray(crystalGpu.vao);
        gl.uniform3f(uUOrig, ex, 0.02, ez);
        gl.uniform4f(uUPose, 0.0, state.time * 2.2, Math.sin(state.time * 3.0) * 0.12, 1.12);
        gl.drawElements(gl.TRIANGLES, crystalGpu.count, gl.UNSIGNED_SHORT, 0);
      }

      // Translucent FX: Glowing Amber BSP Split Planes, Neon Cyan MST Edges, Start/Exit Portal Rings & Torch Halos!
      fxBuf.length = 0;
      if (state.showGraph) {
        for (const sp of state.bspLines) {
          const [x0, z0] = dTileToWorld(sp.c0, sp.r0);
          const [x1, z1] = dTileToWorld(sp.c1, sp.r1);
          pushLine(x0, 0.86, z0, x1, z1, state.genStage === 1 ? 0.20 : 0.13, [1.0, 0.80, 0.24, state.genStage === 1 ? 0.96 : 0.84]);
        }
        if (state.genStage >= 3) {
          for (const ed of state.mstEdges) {
            const [x0, z0] = dTileToWorld(ed.c0, ed.r0);
            const [x1, z1] = dTileToWorld(ed.c1, ed.r1);
            pushLine(x0, 0.34, z0, x1, z1, 0.12, [0.18, 0.94, 1.0, 0.90]);
          }
        }
      }

      if (state.genStage >= 2) {
        const [sx, sz] = dTileToWorld(state.start.c, state.start.r);
        const [ex, ez] = dTileToWorld(state.exit.c, state.exit.r);
        pushRingXZ(sx, 0.06, sz, 0.68 + 0.08 * Math.sin(state.time * 4.0), [0.22, 0.82, 1.0, 0.88]);
        const exitCol = state.exitReachable || state.genStage < 4 ? [1.0, 0.84, 0.22, 0.92] : [1.0, 0.22, 0.30, 0.96];
        pushRingXZ(ex, 0.06, ez, 0.78 + 0.10 * Math.sin(state.time * 5.0), exitCol);

        // Warm glowing fire halos over room torches
        if (state.torches) {
          for (const tc of state.torches) {
            const [tx, tz] = dTileToWorld(tc.c, tc.r);
            const r = 0.42 + 0.08 * Math.sin(state.time * 9.0 + tx);
            pushBillboard(tx, 0.62, tz, r, basis.right, basis.up, [1.0, 0.60, 0.16, 0.52]);
          }
        }
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
