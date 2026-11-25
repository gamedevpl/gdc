// Shared math, 3D ray picking, and WebGL2 helpers for Game Design Lab.

export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function mulMat4(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function makeLookAt(eye, target, up) {
  const f = norm3(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
  const s = norm3(...cross3(f, up));
  const u = cross3(s, f);
  return new Float32Array([
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]),
    -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]),
     (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]),
    1,
  ]);
}

export function makePerspective(fovRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0,
  ]);
}

export function makeOrtho(l, r, b, t, n, f) {
  const rl = 1 / (r - l), tb = 1 / (t - b), fn = 1 / (f - n);
  return new Float32Array([
    2 * rl, 0, 0, 0,
    0, 2 * tb, 0, 0,
    0, 0, -2 * fn, 0,
    -(r + l) * rl, -(t + b) * tb, -(f + n) * fn, 1,
  ]);
}

export function cameraBasisFromOrbit(yaw, pitch, dist, targetX = 0, targetY = 0, targetZ = 0) {
  const cp = Math.cos(pitch);
  const pos = [
    targetX + Math.sin(yaw) * cp * dist,
    targetY + Math.sin(pitch) * dist,
    targetZ + Math.cos(yaw) * cp * dist,
  ];
  const target = [targetX, targetY, targetZ];
  const fwd = norm3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]);
  const right = norm3(...cross3(fwd, [0, 1, 0]));
  const up = cross3(right, fwd);
  return { pos, target, fwd, right, up };
}

export function screenRayToPlaneY(ndcX, ndcY, basis, fovRad, aspect, planeY = 0) {
  const tanHalf = Math.tan(fovRad * 0.5);
  const dir = norm3(
    basis.fwd[0] + basis.right[0] * ndcX * aspect * tanHalf + basis.up[0] * ndcY * tanHalf,
    basis.fwd[1] + basis.right[1] * ndcX * aspect * tanHalf + basis.up[1] * ndcY * tanHalf,
    basis.fwd[2] + basis.right[2] * ndcX * aspect * tanHalf + basis.up[2] * ndcY * tanHalf,
  );
  if (Math.abs(dir[1]) < 1e-5) return null;
  const t = (planeY - basis.pos[1]) / dir[1];
  if (t <= 0) return null;
  return [
    basis.pos[0] + dir[0] * t,
    planeY,
    basis.pos[2] + dir[2] * t,
  ];
}

export const FULL_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID & 1) * 2 - 1, ((gl_VertexID >> 1) & 1) * 2 - 1);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export function linkPrograms(gl, pairs) {
  const entries = pairs.map(([vsSrc, fsSrc]) => {
    const p = gl.createProgram();
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(vs);
    gl.compileShader(fs);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return { p, vs, fs };
  });
  for (const { p, vs, fs } of entries) {
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const vsLog = gl.getShaderInfoLog(vs) || "";
      const fsLog = gl.getShaderInfoLog(fs) || "";
      const pLog = gl.getProgramInfoLog(p) || "";
      throw new Error(`Program link failed:\n${pLog}\nVS: ${vsLog}\nFS: ${fsLog}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
  return entries.map(e => e.p);
}

export function hdrFormat(gl) {
  const ok = !!gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  return ok
    ? { internalFmt: gl.RGBA16F, fmt: gl.RGBA, type: gl.HALF_FLOAT, isFloat: true }
    : { internalFmt: gl.RGBA8, fmt: gl.RGBA, type: gl.UNSIGNED_BYTE, isFloat: false };
}

export function makeRenderTex(gl, w, h, internalFmt, fmt, type, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
