// WebGL renderer for the Relief Action scene (raw WebGL 1, no dependency).
(function (root) {
'use strict';
const G = root.ReliefGeom;

const VS_FACE = `
attribute vec3 aPos; attribute vec3 aNrm; attribute float aTone;
uniform mat4 uMVP;
varying vec3 vPos; varying vec3 vNrm; varying float vTone;
void main(){ vPos = aPos; vNrm = aNrm; vTone = aTone; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const FS_FACE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vPos; varying vec3 vNrm; varying float vTone;
uniform vec3 uEye; uniform vec3 uBase; uniform vec3 uLamp; uniform float uFog; uniform vec3 uFogCol; uniform float uAmb; uniform vec4 uPlane; uniform float uClip;
void main(){
  vec3 n = normalize(vNrm);
  // objects are drawn from the player's plane on, as in the game; the room itself also between the eye and the player,
  // so a wall you brush against does not leave a black band at the edge of the view
  if (uClip > 0.5 && dot(uPlane.xyz, vPos) < uPlane.w) discard;
  vec3 L = uEye - vPos; float d = length(L); L /= d;
  float diff = abs(dot(n, L));
  float att = 1.0 / (1.0 + d * d * 0.00045);
  float key = 0.55 + 0.45 * abs(dot(n, normalize(vec3(0.35, 0.85, 0.4))));
  vec3 col = uBase * vTone * (uAmb * key + uLamp * (0.25 + 0.75 * diff) * att);
  col = pow(col, vec3(0.92));
  float f = clamp(exp(-d * uFog), 0.0, 1.0);
  gl_FragColor = vec4(mix(uFogCol, col, f), 1.0);
}`;
const VS_LINE = `
attribute vec3 aPos; attribute float aTone; uniform mat4 uMVP; uniform vec3 uEye; uniform float uPull; varying float vD; varying float vTone; varying vec3 vW;
void main(){ vec3 d = uEye - aPos; float l = length(d); vD = l; vTone = aTone; vW = aPos;
  // pull lines slightly towards the eye so details lying just behind a reconstructed face stay visible
  vec3 p = aPos + d / max(l, 0.001) * min(uPull * (1.0 + 0.03 * l), l * 0.5);
  gl_Position = uMVP * vec4(p, 1.0); }`;
const FS_LINE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uCol; uniform float uFog; uniform vec3 uFogCol; uniform float uDots; uniform vec4 uPlane; uniform float uClip; varying float vD; varying float vTone; varying vec3 vW;
void main(){
  if (uClip > 0.5 && dot(uPlane.xyz, vW) < uPlane.w) discard;
  if (uDots > 0.0) { vec2 c = floor(gl_FragCoord.xy / 2.0); if (fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) > uDots) discard; }
  float f = clamp(exp(-vD * uFog), 0.0, 1.0); gl_FragColor = vec4(mix(uFogCol, uCol * vTone, f), 1.0); }`;

const VS_STAR = `
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uMVP; uniform vec3 uEye; uniform float uPx; uniform float uTime; uniform float uTw;
varying vec4 vCol; varying float vSize;
void main(){
  gl_Position = uMVP * vec4(uEye + aPos * 1500.0, 1.0);
  float ph = fract(sin(dot(aPos, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2832;
  float tw = 1.0 - uTw * (0.5 + 0.5 * sin(uTime * (1.3 + ph * 0.35) + ph));
  vCol = vec4(aCol.rgb, aCol.a * tw); vSize = aSize * uPx; gl_PointSize = max(vSize, 1.0); }`;
const FS_STAR = `
precision mediump float; varying vec4 vCol; varying float vSize; uniform float uShape;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
  float a;
  if (uShape < 0.5) a = 1.0;                                            // square pixel (retro, original)
  else if (uShape < 1.5) a = smoothstep(1.0, 0.35, r2);                 // round dot
  else a = min(1.0, 1.6 * exp(-r2 * 10.0) + 0.22 * exp(-r2 * 2.5));      // bright core with a soft halo
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb * vCol.a * a, 1.0); }`;
function compile(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
  return { p, loc };
}

function mat4mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
  }
  return o;
}

function Renderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false, stencil: true });
  if (!gl) throw new Error('WebGL indisponible');
  this.gl = gl;
  const pf = compile(gl, VS_FACE, FS_FACE), pl = compile(gl, VS_LINE, FS_LINE), ps = compile(gl, VS_STAR, FS_STAR);
  // distant stars, seen through windows and open hatches (solid mode only)
  // star field styles: 0 original (grey pixels), 1 sharp (colour, round, high-DPI aware), 2 Milky Way, 3 retro CPC (chunky pixels)
  const starBuf = gl.createBuffer(); let starN = 0, starStyle = -1, starShape = 0, starTw = 0;
  const CPC_STAR = [[1, 1, 1], [0.5, 1, 1], [1, 1, 0.5], [0.5, 0.5, 1]];
  function tempCol(t) {      // t 0 (hot, blue-white) .. 1 (cool, orange)
    const c = [[0.70, 0.80, 1.00], [0.95, 0.97, 1.00], [1.00, 0.96, 0.86], [1.00, 0.84, 0.62], [1.00, 0.70, 0.50]];
    const x = Math.min(3.999, t * 4), i = Math.floor(x), f = x - i; return c[i].map((v, k) => v + (c[i + 1][k] - v) * f);
  }
  function buildStars(style) {
    const v = []; let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const dir = () => { const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(t), z, r * Math.sin(t)]; };
    const push = (p, col, a, size) => v.push(p[0], p[1], p[2], col[0], col[1], col[2], a, size);
    if (style === 0) {
      for (let i = 0; i < 1800; i++) { const p = dir(), t = Math.pow(rnd(), 3); const g = 0.55 + 0.45 * t; push(p, [g, g, g], 1, t > 0.8 ? 2 : 1); }
      starShape = 0; starTw = 0;
    } else if (style === 3) {
      for (let i = 0; i < 1100; i++) { const p = dir(), m = rnd(); push(p, CPC_STAR[Math.floor(rnd() * 4)], 1, m > 0.85 ? 3 : 2); }
      starShape = 0; starTw = 0.35;
    } else {
      // magnitudes: many faint stars, few bright ones; brightness and size grow together
      for (let i = 0; i < 2600; i++) {
        const p = dir(), m = Math.pow(rnd(), 3.2);
        push(p, tempCol(rnd()), 0.55 + 0.45 * Math.min(1, m * 1.5), 2.2 + m * 9.0);
      }
      if (style === 2) {
        // galactic plane: a tilted great circle, dense faint stars + a soft glow made of wide translucent sprites
        const n = [0.22, 0.95, 0.18], L = Math.hypot(...n); const N = n.map(x => x / L);
        const a = [N[1], -N[0], 0], La = Math.hypot(...a); const U = a.map(x => x / La);
        const V = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
        const band = (th, w) => { const c = Math.cos(th), s2 = Math.sin(th), h = w; const p = [0, 1, 2].map(k => U[k] * c + V[k] * s2 + N[k] * h); const l = Math.hypot(...p); return p.map(x => x / l); };
        const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
        for (let i = 0; i < 9000; i++) { const th = rnd() * Math.PI * 2, core = Math.exp(-Math.pow((th - 1.2) % (Math.PI * 2), 2) * 0.6);
          push(band(th, gauss() * (0.10 + 0.08 * core)), tempCol(0.2 + rnd() * 0.5), 0.25 + rnd() * 0.3, 1.4 + rnd() * 1.2); }
        for (let i = 0; i < 520; i++) { const th = rnd() * Math.PI * 2, core = 0.5 + 1.2 * Math.exp(-Math.pow(th - 1.2, 2) * 0.8);
          const tint = rnd() < 0.15 ? [0.75, 0.55, 0.85] : rnd() < 0.3 ? [0.55, 0.65, 0.95] : [0.85, 0.82, 0.78];
          push(band(th, gauss() * 0.09), tint, 0.07 * core, 50 + rnd() * 80); }
      }
      starShape = 2; starTw = 0.12;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); starN = v.length / 8;
  }
  this.starStyle = 2;
  const drawStars = (vp) => {
    if (this.starStyle !== starStyle) { starStyle = this.starStyle; buildStars(starStyle); }
    gl.useProgram(ps.p);
    gl.uniformMatrix4fv(ps.loc.uMVP, false, vp.mvp); gl.uniform3fv(ps.loc.uEye, vp.eye);
    gl.uniform1f(ps.loc.uPx, starStyle === 0 ? 1 : starStyle === 3 ? Math.max(1, Math.round(canvas.height / 200)) / 2 : Math.max(1, canvas.height / 720));
    gl.uniform1f(ps.loc.uTime, performance.now() / 1000); gl.uniform1f(ps.loc.uTw, starTw); gl.uniform1f(ps.loc.uShape, starShape);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.enableVertexAttribArray(ps.loc.aPos); gl.vertexAttribPointer(ps.loc.aPos, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(ps.loc.aCol); gl.vertexAttribPointer(ps.loc.aCol, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(ps.loc.aSize); gl.vertexAttribPointer(ps.loc.aSize, 1, gl.FLOAT, false, 32, 28);
    gl.drawArrays(gl.POINTS, 0, starN);
    gl.disableVertexAttribArray(ps.loc.aCol); gl.disableVertexAttribArray(ps.loc.aSize); gl.disable(gl.BLEND);
  };
  this.stars = true;
  let extraWin = null, extraWinN = 0, extraStars = false, extraHole = false;
  // small emissive panels (lift floor indicator...): list of {pts, col}
  let lightBuf = null, lights = [];
  this.setLights = function (list) {
    lights = list || [];
    if (lightBuf) { gl.deleteBuffer(lightBuf); lightBuf = null; }
    const v = []; for (const L of lights) { const V = L.pts; for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) v.push(q[0], q[1], q[2], 1); }
    if (v.length) { lightBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lightBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); }
  };
  let fillBuf = null, fillN = 0;
  this.setWindows = function (list) {
    if (fillBuf) { gl.deleteBuffer(fillBuf); fillBuf = null; fillN = 0; }
    { const v = []; for (const w of (list || []).filter(w => w.fill)) { const V = w.pts; for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) v.push(q[0], q[1], q[2], 1); }
      if (v.length) { fillBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); fillN = v.length / 4; } }
    list = (list || []).filter(w => !w.fill);
    if (extraWin) { gl.deleteBuffer(extraWin); extraWin = null; extraWinN = 0; }
    const v = []; extraStars = false; extraHole = (list || []).some(w => w.hole);
    extraView = false;
    for (const w of list || []) { const V = w.pts; for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) v.push(q[0], q[1], q[2], w.stars ? 1 : 0); if (w.stars) extraStars = true; if (w.view) extraView = true; }
    if (v.length) { extraWin = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, extraWin); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); extraWinN = v.length / 4; }
  };
  // another room seen through a window (hangar from its control room): {verts, lines, fills, sky} in this room's frame
  let view = null, extraView = false;
  const mkBuf = a => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b; };
  const polyTris = list => { const v = []; for (const V of list || []) for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) v.push(q[0], q[1], q[2], 1); return new Float32Array(v); };
  this.setView = function (v) {
    if (view) for (const b of [view.fb, view.lb, view.xb, view.sb]) if (b) gl.deleteBuffer(b);
    view = null; if (!v) return;
    const m = buildModel({ verts: v.verts, lines: v.lines }, true);
    const xs = polyTris(v.fills), sk = polyTris(v.sky);
    view = { fb: m.faces.length ? mkBuf(m.faces) : null, nf: m.faces.length / 7, lb: m.lines.length ? mkBuf(m.lines) : null, nl: m.lines.length / 4,
             xb: xs.length ? mkBuf(xs) : null, nx: xs.length / 4, sb: sk.length ? mkBuf(sk) : null, ns: sk.length / 4 };
  };
  const cache = new Map();     // geometry cache by model signature
  this.mode = 'solid';         // 'solid' | 'wire'
  this.theme = { face: [0.40, 0.43, 0.50], line: [0.85, 0.92, 1.0], wire: [0.92, 0.96, 1.0], door: [0.62, 0.42, 0.22], fog: [0.02, 0.026, 0.04], clear: [0.0, 0.0, 0.0] };
  let buffers = [];            // [{faceBuf, faceCount, lineBuf, lineCount, kind}]
  let portalBuf = null, portalN = 0;   // open doorways, drawn as dark openings
  let roomTris = null;                 // room faces (x y z nx ny nz tone per vertex), for the eye clamp
  let recessBuf = null, recessN = 0; const RECESS = 18;   // depth of the doorway recess
  this.portalStyle = 'recess';         // 'recess' or 'black' (flat dark opening, as before)
  const roomBBox = scene => { const r = scene.models.find(m => m.kind === 'room'); return r ? bbox(r.verts.filter(Boolean)) : null; };
  this.cam = { x: 0, y: 28, z: 0, yaw: 0, pitch: 0, focal: 150 };
  this.anaglyph = false;

  function sig(m) { return m.lines.length + ':' + m.verts.map(v => v ? v.join('.') : '_').join(',') + '|' + m.lines.map(l => l.join('.')).join(','); }

  let holes = [];   // window polygons whose coplanar faces are removed (see-through walls)
  this.setHoles = function (list) { holes = (list || []).map(w => { const P = w.pts; const b = [0, 1, 2].map(a => [Math.min(...P.map(p => p[a])) - 0.6, Math.max(...P.map(p => p[a])) + 0.6]); return b; }); };
  function inHole(V) { return holes.some(b => V.every(v => v[0] >= b[0][0] && v[0] <= b[0][1] && v[1] >= b[1][0] && v[1] <= b[1][1] && v[2] >= b[2][0] && v[2] <= b[2][1])); }
  function buildModel(m, isRoom) {
    const key = sig(m) + (isRoom ? JSON.stringify(holes) : '');
    if (cache.has(key)) return cache.get(key);
    const geo = G.buildGeometry(m.verts, m.lines, { maxlen: isRoom ? 10 : 8, synth: isRoom, inward: isRoom });
    const P = geo.pts;
    // faces -> triangles with flat normals
    const fv = [], wv = [];
    const polys = geo.faces.concat(geo.synth || []);
    for (const poly of polys) {
      const V = poly.map(i => P[i]);
      const n = G.newell(V); if (!n) continue;
      if (isRoom && holes.length && inHole(V)) continue;
      if (isRoom && poly.length === 8 && Math.abs(n[1]) < 0.2) {
        // porthole glass (corridor features 6 and 8): a small upright octagon, shown as a window on space
        const ext = [0, 1, 2].map(a => Math.max(...V.map(v => v[a])) - Math.min(...V.map(v => v[a])));
        const w = Math.max(ext[0], ext[2]), h = ext[1];
        if (w >= 10 && w <= 24 && h >= 10 && h <= 24 && Math.abs(w - h) <= 4) {
          for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) wv.push(q[0], q[1], q[2], 1);
          continue;
        }
      }
      // tone: slight variation by orientation (floors darker, ceilings lighter)
      const tone = Math.abs(n[1]) > 0.9 ? (n[1] > 0 ? 0.62 : 0.9) : (0.86 + 0.14 * Math.abs(n[0]));
      const dbgTone = (typeof window !== 'undefined' && window.__debugFaces) ? 0.3 + Math.random() * 0.9 : null;
      const tris = triangulate(V, n);
      for (const [a, b, c] of tris) for (const k of [a, b, c]) fv.push(V[k][0], V[k][1], V[k][2], n[0], n[1], n[2], dbgTone || tone);
    }
    const lv = [];
    for (const [a, b] of geo.edges) lv.push(P[a][0], P[a][1], P[a][2], 1, P[b][0], P[b][1], P[b][2], 1);
    const res = { faces: new Float32Array(fv), lines: new Float32Array(lv), wins: new Float32Array(wv), npts: P.length, bbox: bbox(P) };
    cache.set(key, res);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return res;
  }
  // door outlines come as an unordered point set: order them as the convex hull in the door plane
  function portalHull(pts) {
    const b = bbox(pts), ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const ax = ext[0] < ext[2] ? 0 : 2;                    // the thin axis is the door's normal
    const u = ax === 0 ? 2 : 0;
    const P = pts.map(p => ({ p, x: p[u], y: p[1] })).sort((a, c) => a.x - c.x || a.y - c.y);
    const cr = (o, a, c) => (a.x - o.x) * (c.y - o.y) - (a.y - o.y) * (c.x - o.x);
    const lo = [], hi = [];
    for (const q of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
    for (const q of P.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-9) hi.pop(); hi.push(q); }
    const mid = (b[ax] + b[ax + 3]) / 2;
    return lo.slice(0, -1).concat(hi.slice(0, -1)).map(q => { const v = q.p.slice(); v[ax] = mid; return v; });
  }
  function bbox(P) {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of P) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[k]); b[k + 3] = Math.max(b[k + 3], p[k]); }
    return b;
  }
  function triangulate(V, n) {
    // ear clipping in the face plane
    const ax = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const P2 = V.map(p => [p[u], p[v]]);
    let area = 0; for (let i = 0; i < P2.length; i++) { const a = P2[i], b = P2[(i + 1) % P2.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const idx = P2.map((_, i) => i); if (area < 0) idx.reverse();
    const out = []; let guard = 0;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    while (idx.length > 3 && guard++ < 200) {
      let ok = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = P2[ia], b = P2[ib], c = P2[ic];
        if (cross(a, b, c) <= 1e-9) continue;
        let inside = false;
        for (const j of idx) { if (j === ia || j === ib || j === ic) continue; const p = P2[j]; if (cross(a, b, p) > 0 && cross(b, c, p) > 0 && cross(c, a, p) > 0) { inside = true; break; } }
        if (inside) continue;
        out.push([ia, ib, ic]); idx.splice(i, 1); ok = true; break;
      }
      if (!ok) break;
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) for (let k = 1; k < idx.length - 1; k++) out.push([idx[0], idx[k], idx[k + 1]]);
    return out;
  }

  this.setScene = function (scene) {
    for (const b of buffers) { gl.deleteBuffer(b.fb); gl.deleteBuffer(b.lb); if (b.wb) gl.deleteBuffer(b.wb); }
    buffers = []; roomTris = null;
    if (portalBuf) { gl.deleteBuffer(portalBuf); portalBuf = null; portalN = 0; }
    if (!scene) return;
    const pv = [];
    for (const p of (scene.portals || [])) {
      if (p.open !== 1 && p.open !== 3) continue;          // open or forced (not moving, not closed)
      const V = portalHull(p.pts); if (V.length < 3) continue;
      for (let k = 1; k < V.length - 1; k++) for (const q of [V[0], V[k], V[k + 1]]) pv.push(q[0], q[1], q[2], 1);
    }
    if (pv.length) { portalBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, portalBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pv), gl.STATIC_DRAW); portalN = pv.length / 4; }
    // open doorways read as doorways, not as holes: a short recess behind each opening (its jambs, lintel and threshold,
    // lit near the room and fading into darkness), nothing of the next room
    if (recessBuf) { gl.deleteBuffer(recessBuf); recessBuf = null; recessN = 0; }
    const rbox = roomBBox(scene), rv = [];
    if (rbox) for (const p of (scene.portals || [])) {
      if (p.open !== 1 && p.open !== 3) continue;
      const V = portalHull(p.pts); if (V.length < 3) continue;
      const b = bbox(p.pts), ax = (b[3] - b[0]) < (b[5] - b[2]) ? 0 : 2;
      const mid = (b[ax] + b[ax + 3]) / 2, cen = (rbox[ax] + rbox[ax + 3]) / 2, out = mid >= cen ? 1 : -1;
      const back = V.map(v => { const q = v.slice(); q[ax] += out * RECESS; return q; });
      const c = V.reduce((a, v) => [a[0] + v[0] / V.length, a[1] + v[1] / V.length, a[2] + v[2] / V.length], [0, 0, 0]);
      for (let i = 0; i < V.length; i++) {
        const a = V[i], b2 = V[(i + 1) % V.length], A = back[i], B = back[(i + 1) % V.length];
        let n = G.newell([a, b2, B, A]); if (!n) continue;
        const m = [(a[0] + b2[0]) / 2 - c[0], (a[1] + b2[1]) / 2 - c[1], (a[2] + b2[2]) / 2 - c[2]];   // normal towards the opening's axis
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0) n = n.map(x => -x);
        const t0 = Math.abs(n[1]) > 0.7 ? (n[1] > 0 ? 0.62 : 0.8) : 0.82, t1 = 0.0;
        for (const [q, t] of [[a, t0], [b2, t0], [B, t1], [a, t0], [B, t1], [A, t1]]) rv.push(q[0], q[1], q[2], n[0], n[1], n[2], t);
      }
      const nb = [0, 0, 0]; nb[ax] = -out;
      for (let k = 1; k < back.length - 1; k++) for (const q of [back[0], back[k], back[k + 1]]) rv.push(q[0], q[1], q[2], nb[0], nb[1], nb[2], 0);
    }
    if (rv.length) { recessBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, recessBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rv), gl.STATIC_DRAW); recessN = rv.length / 7; }
    scene.models.forEach((m, i) => {
      const isRoom = m.kind ? m.kind === 'room' : i === 0;
      const g = buildModel(m, isRoom);
      const fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.bufferData(gl.ARRAY_BUFFER, g.faces, gl.STATIC_DRAW);
      const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, g.lines, gl.STATIC_DRAW);
      let wb = null; if (g.wins.length) { wb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wb); gl.bufferData(gl.ARRAY_BUFFER, g.wins, gl.STATIC_DRAW); }
      if (isRoom) roomTris = g.faces;
      buffers.push({ fb, nf: g.faces.length / 7, lb, nl: g.lines.length / 4, wb, nw: g.wins.length / 4, room: isRoom, frame: m.kind === 'frame', bbox: g.bbox });
    });
    const rb = buffers.find(b => b.room); this.roomBox = rb ? rb.bbox : null;
  };
  // interactive spots of the room (table &6DDC), drawn as small glowing diamonds
  let markers = [];
  this.setMarkers = function (list) { markers = list || []; };
  function drawMarkers(vp) {
    if (!markers.length) return;
    const v = [];
    const t = performance.now() / 1000;
    for (const m of markers) {
      const s = 1.2 + (m.on ? 0.5 * Math.sin(t * 5) : 0);
      const c = m.on ? 1.4 : 0.7;
      v.push(m.x - s, m.y, m.z, c, m.x + s, m.y, m.z, c, m.x, m.y - s, m.z, c, m.x, m.y + s, m.z, c, m.x, m.y, m.z - s, c, m.x, m.y, m.z + s, c);
    }
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STREAM_DRAW);
    gl.useProgram(pl.p);
    gl.uniform3fv(pl.loc.uCol, [1.0, 0.75, 0.25]);
    gl.uniform1f(pl.loc.uFog, 0);
    gl.uniform1f(pl.loc.uPull, 0); gl.uniform1f(pl.loc.uDots, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.LINES, 0, v.length / 4);
    gl.disableVertexAttribArray(pl.loc.aTone);
    gl.enable(gl.DEPTH_TEST);
    gl.deleteBuffer(b);
  }
  this.prepare = function (scene) { scene.models.forEach((m, i) => buildModel(m, m.kind === 'room')); };

  // distance from (x, y, z) along d to the nearest room face (Moller-Trumbore), Infinity if none
  function rayBack(x, y, z, dx, dy, dz) {
    const T = roomTris; if (!T) return Infinity;
    let best = Infinity;
    for (let i = 0; i + 20 < T.length; i += 21) {
      const ax = T[i], ay = T[i + 1], az = T[i + 2];
      const e1x = T[i + 7] - ax, e1y = T[i + 8] - ay, e1z = T[i + 9] - az, e2x = T[i + 14] - ax, e2y = T[i + 15] - ay, e2z = T[i + 16] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = x - ax, ty = y - ay, tz = z - az;
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > 0.01 && t < best) best = t;
    }
    return best;
  }
  function viewProj(cam, aspect, eyeShift) {
    const th = cam.yaw, ph = cam.pitch;
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    // game frame: right = (cos t, 0, sin t), forward = (-sin t, 0, cos t), up = y; pitch > 0 looks up
    const r = [ct, 0, st];
    const f0 = [-st, 0, ct];
    const f = [f0[0] * cp, sp, f0[2] * cp];
    const u = [-f0[0] * sp, cp, -f0[2] * sp];
    // the game projects with x' = x*F/(depth+F) (depth in 1/16 units, F = &C7DB): the true centre of projection sits
    // F/16 behind the player and everything in front of the player's plane is drawn; the visor (F=70) gives a
    // strong fish-eye, the glasses (F=200) a flatter, zoomed view.
    const F = cam.focal || 150;
    // the centre of projection sits F/16 behind the player; keep it inside the room (in front of the wall behind you),
    // otherwise the strip of view between that wall and the player shows nothing
    const back = Math.max(0.4, Math.min(F / 16, rayBack(cam.x, cam.y, cam.z, -f[0], -f[1], -f[2]) - 0.8));
    const ex = cam.x + r[0] * eyeShift - f[0] * back, ey = cam.y - f[1] * back, ez = cam.z + r[2] * eyeShift - f[2] * back;
    const V = new Float32Array([
      r[0], u[0], -f[0], 0,
      r[1], u[1], -f[1], 0,
      r[2], u[2], -f[2], 0,
      -(r[0] * ex + r[1] * ey + r[2] * ez), -(u[0] * ex + u[1] * ey + u[2] * ez), (f[0] * ex + f[1] * ey + f[2] * ez), 1]);
    const tanH = 157.6 / F, k = tanH / 1.0503;   // 157.6/150 = tan(1.62/2): the field of view tuned on the CPC screen
    const ty = Math.max(Math.tan(0.375) * k, Math.min(Math.tan(0.875) * k, tanH / aspect));
    const near = 0.3, far = 2000;                 // clipping at the player's plane is done per fragment (uPlane)
    const t = 1 / ty;
    const P = new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    const pc = cam.x * f[0] + cam.y * f[1] + cam.z * f[2] + 0.6;
    return { mvp: mat4mul(P, V), eye: [ex, ey, ez], plane: new Float32Array([f[0], f[1], f[2], pc]) };
  }

  this.render = function () {
    const w = canvas.clientWidth * (window.devicePixelRatio || 1), h = canvas.clientHeight * (window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h)) { canvas.width = Math.round(w); canvas.height = Math.round(h); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    const th = this.theme;
    const cc = this.dark ? [0, 0, 0] : this.mode === 'solid' ? th.clear : th.fog; gl.clearColor(cc[0], cc[1], cc[2], 1);
    gl.colorMask(true, true, true, true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = canvas.width / Math.max(1, canvas.height);
    if (this.anaglyph) {
      this._mask = [true, false, false]; gl.colorMask(true, false, false, true); this.pass(viewProj(this.cam, aspect, -1.6));
      gl.clear(gl.DEPTH_BUFFER_BIT);
      this._mask = [false, true, true]; gl.colorMask(false, true, true, true); this.pass(viewProj(this.cam, aspect, 1.6));
      gl.colorMask(true, true, true, true);
    } else { this._mask = [true, true, true]; this.pass(viewProj(this.cam, aspect, 0)); }
  };

  this.pass = function (vp) {
    const th = this.theme, solid = this.mode === 'solid' && !this.dark;
    if (solid && this.stars && this.starsBg) {
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      drawStars(vp);
      gl.depthMask(true);
    }
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    if (solid) {
      gl.useProgram(pf.p);
      gl.uniformMatrix4fv(pf.loc.uMVP, false, vp.mvp); gl.uniform4fv(pf.loc.uPlane, vp.plane); gl.uniform1f(pf.loc.uClip, 0);
      gl.uniform3fv(pf.loc.uEye, vp.eye);
      gl.uniform3fv(pf.loc.uLamp, [1.05, 1.0, 0.92]);
      gl.uniform1f(pf.loc.uAmb, 0.30);
      gl.uniform1f(pf.loc.uFog, 0.006);
      gl.uniform3fv(pf.loc.uFogCol, th.fog);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2);
      for (const b of buffers) {
        if (!b.nf) continue;
        if (b.room) gl.polygonOffset(1.5, 2); else gl.polygonOffset(-1, -4);
        gl.uniform1f(pf.loc.uClip, b.room && !this.clipRoom ? 0 : 1);
        gl.uniform3fv(pf.loc.uBase, b.room || b.frame ? th.face : th.door);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.fb);
        gl.enableVertexAttribArray(pf.loc.aPos); gl.vertexAttribPointer(pf.loc.aPos, 3, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(pf.loc.aNrm); gl.vertexAttribPointer(pf.loc.aNrm, 3, gl.FLOAT, false, 28, 12);
        gl.enableVertexAttribArray(pf.loc.aTone); gl.vertexAttribPointer(pf.loc.aTone, 1, gl.FLOAT, false, 28, 24);
        gl.drawArrays(gl.TRIANGLES, 0, b.nf);
      }
      gl.disableVertexAttribArray(pf.loc.aNrm); gl.disableVertexAttribArray(pf.loc.aTone);
      if (portalN && this.portalStyle === 'recess' && recessN) {
        // mark the visible part of each opening, reset the depth there, then draw the recess inside the mark only
        gl.useProgram(pl.p);
        gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye); gl.uniform1f(pl.loc.uPull, 0);
        gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false); gl.depthMask(false); gl.polygonOffset(-2, -10);
        gl.bindBuffer(gl.ARRAY_BUFFER, portalBuf);
        gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
        gl.drawArrays(gl.TRIANGLES, 0, portalN);
        gl.stencilFunc(gl.EQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.depthMask(true); gl.depthFunc(gl.ALWAYS); gl.depthRange(1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, portalN); gl.disableVertexAttribArray(pl.loc.aTone);
        gl.depthRange(0, 1); gl.depthFunc(gl.LESS); gl.colorMask(this._mask[0], this._mask[1], this._mask[2], true);
        gl.useProgram(pf.p); gl.polygonOffset(0, 0);
        gl.uniformMatrix4fv(pf.loc.uMVP, false, vp.mvp); gl.uniform4fv(pf.loc.uPlane, vp.plane); gl.uniform1f(pf.loc.uClip, 0); gl.uniform3fv(pf.loc.uEye, vp.eye); gl.uniform3fv(pf.loc.uBase, th.face);
        gl.bindBuffer(gl.ARRAY_BUFFER, recessBuf);
        gl.enableVertexAttribArray(pf.loc.aPos); gl.vertexAttribPointer(pf.loc.aPos, 3, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(pf.loc.aNrm); gl.vertexAttribPointer(pf.loc.aNrm, 3, gl.FLOAT, false, 28, 12);
        gl.enableVertexAttribArray(pf.loc.aTone); gl.vertexAttribPointer(pf.loc.aTone, 1, gl.FLOAT, false, 28, 24);
        gl.drawArrays(gl.TRIANGLES, 0, recessN);
        gl.disableVertexAttribArray(pf.loc.aNrm); gl.disableVertexAttribArray(pf.loc.aTone);
        gl.disable(gl.STENCIL_TEST);
      } else if (portalN) {
        gl.useProgram(pl.p);
        gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0);
        gl.uniform3fv(pl.loc.uEye, vp.eye);
        gl.uniform1f(pl.loc.uFog, 0);
        gl.uniform1f(pl.loc.uPull, 0);
        gl.uniform3fv(pl.loc.uFogCol, th.fog);
        gl.uniform3fv(pl.loc.uCol, [0, 0, 0]);
        gl.polygonOffset(-2, -10);                         // in front of the door frame and leaf faces
        gl.bindBuffer(gl.ARRAY_BUFFER, portalBuf);
        gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
        gl.drawArrays(gl.TRIANGLES, 0, portalN);
        gl.disableVertexAttribArray(pl.loc.aTone);
      }
      const wins = buffers.filter(b => b.nw).map(b => ({ wb: b.wb, nw: b.nw }));
      if (extraWin) wins.push({ wb: extraWin, nw: extraWinN, extra: true });
      if (wins.length) {
        gl.useProgram(pl.p);
        gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye);
        gl.uniform1f(pl.loc.uFog, 0); gl.uniform1f(pl.loc.uPull, 0); gl.uniform3fv(pl.loc.uCol, [0, 0, 0]);
        gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.ALWAYS, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.polygonOffset(-2, -10);
        for (const b of wins) {
          if (b.extra && !extraStars && !extraView) gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); else gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
          gl.depthMask(!b.extra);      // see-through windows leave the depth of what lies beyond
          if (b.extra && extraHole) gl.colorMask(false, false, false, false); else gl.colorMask(this._mask[0], this._mask[1], this._mask[2], true);
          gl.bindBuffer(gl.ARRAY_BUFFER, b.wb);
          gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
          gl.drawArrays(gl.TRIANGLES, 0, b.nw);
        }
        gl.disableVertexAttribArray(pl.loc.aTone); gl.depthMask(true);
        gl.colorMask(this._mask[0], this._mask[1], this._mask[2], true);
        if (this.stars && (extraStars || wins.some(b => !b.extra))) {
          gl.stencilFunc(gl.EQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          if (extraHole) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
          drawStars(vp);
          gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        }
        if (view && extraView) {
          gl.stencilFunc(gl.EQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
          // reset the depth to the far plane where the window is visible, so the room beyond can be drawn through the wall
          gl.useProgram(pl.p); gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye); gl.uniform1f(pl.loc.uPull, 0);
          gl.colorMask(false, false, false, false); gl.depthFunc(gl.ALWAYS); gl.depthRange(1, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, extraWin);
          gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
          gl.drawArrays(gl.TRIANGLES, 0, extraWinN); gl.disableVertexAttribArray(pl.loc.aTone);
          gl.depthRange(0, 1); gl.depthFunc(gl.LESS); gl.colorMask(this._mask[0], this._mask[1], this._mask[2], true);
          if (view.fb) {
            gl.useProgram(pf.p);
            gl.uniformMatrix4fv(pf.loc.uMVP, false, vp.mvp); gl.uniform4fv(pf.loc.uPlane, vp.plane); gl.uniform1f(pf.loc.uClip, 0); gl.uniform3fv(pf.loc.uEye, vp.eye);
            gl.uniform3fv(pf.loc.uLamp, [0.85, 0.85, 0.8]); gl.uniform1f(pf.loc.uAmb, 0.22); gl.uniform1f(pf.loc.uFog, 0.006); gl.uniform3fv(pf.loc.uFogCol, th.fog);
            gl.uniform3fv(pf.loc.uBase, th.face); gl.polygonOffset(1.5, 2);
            gl.bindBuffer(gl.ARRAY_BUFFER, view.fb);
            gl.enableVertexAttribArray(pf.loc.aPos); gl.vertexAttribPointer(pf.loc.aPos, 3, gl.FLOAT, false, 28, 0);
            gl.enableVertexAttribArray(pf.loc.aNrm); gl.vertexAttribPointer(pf.loc.aNrm, 3, gl.FLOAT, false, 28, 12);
            gl.enableVertexAttribArray(pf.loc.aTone); gl.vertexAttribPointer(pf.loc.aTone, 1, gl.FLOAT, false, 28, 24);
            gl.drawArrays(gl.TRIANGLES, 0, view.nf);
            gl.disableVertexAttribArray(pf.loc.aNrm); gl.disableVertexAttribArray(pf.loc.aTone);
          }
          gl.useProgram(pl.p);
          gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye);
          gl.uniform1f(pl.loc.uFog, 0); if (pl.loc.uDots) gl.uniform1f(pl.loc.uDots, 0); gl.uniform3fv(pl.loc.uFogCol, th.fog);
          const drawPl = (buf, n, mode) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
            gl.drawArrays(mode, 0, n); gl.disableVertexAttribArray(pl.loc.aTone); };
          if (view.xb) { gl.uniform1f(pl.loc.uPull, 0); gl.uniform3fv(pl.loc.uCol, th.face.map(c => c * 0.55)); gl.polygonOffset(-1, -4); drawPl(view.xb, view.nx, gl.TRIANGLES); }
          if (view.lb) { gl.uniform1f(pl.loc.uPull, 0.9); gl.uniform3fv(pl.loc.uCol, th.line.map(c => c * 0.75)); drawPl(view.lb, view.nl, gl.LINES); }
          if (view.sb && this.stars) {                 // the open outer door: stars inside its outline only
            gl.stencilFunc(gl.EQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
            gl.colorMask(false, false, false, false); gl.depthMask(false); gl.polygonOffset(-2, -10);
            gl.uniform1f(pl.loc.uPull, 0); drawPl(view.sb, view.ns, gl.TRIANGLES);
            gl.colorMask(this._mask[0], this._mask[1], this._mask[2], true);
            gl.stencilFunc(gl.EQUAL, 2, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); gl.disable(gl.DEPTH_TEST);
            drawStars(vp);
            gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
          }
        }
        gl.disable(gl.STENCIL_TEST);
      }
      if (fillBuf) {                                    // openings the reconstruction leaves that are really walls: plain panels
        gl.useProgram(pl.p);
        gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye);
        gl.uniform1f(pl.loc.uFog, 0); gl.uniform1f(pl.loc.uPull, 0); if (pl.loc.uDots) gl.uniform1f(pl.loc.uDots, 0); gl.uniform3fv(pl.loc.uCol, th.face.map(c => c * 0.55));
        gl.polygonOffset(-4, -20);
        gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
        gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
        gl.drawArrays(gl.TRIANGLES, 0, fillN);
        gl.disableVertexAttribArray(pl.loc.aTone);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.useProgram(pl.p);
    gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0);
    gl.uniform3fv(pl.loc.uEye, vp.eye);
    gl.uniform1f(pl.loc.uFog, 0.0);
    gl.uniform1f(pl.loc.uPull, solid ? 0.9 : 0.0);
    gl.uniform1f(pl.loc.uDots, this.dark ? (this.dotDensity || 0.22) : 0.0);
    gl.uniform3fv(pl.loc.uFogCol, th.fog);
    for (const b of buffers) {
      if (!b.nl) continue;
      gl.uniform1f(pl.loc.uClip, b.room && !this.clipRoom ? 0 : 1);
      const c = solid ? (b.room || b.frame ? th.line : [1, 0.85, 0.6]) : (b.room || b.frame ? th.wire : [1, 0.85, 0.55]);
      gl.uniform3fv(pl.loc.uCol, this.dark ? c.map(x => x * 0.55) : solid ? c.map(x => Math.min(1, x * 1.05)) : c);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.lb);
      gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.LINES, 0, b.nl);
    }
    gl.uniform1f(pl.loc.uClip, 0);
    gl.disableVertexAttribArray(pl.loc.aTone);
    if (lightBuf) {
      gl.useProgram(pl.p); gl.uniformMatrix4fv(pl.loc.uMVP, false, vp.mvp); gl.uniform4fv(pl.loc.uPlane, vp.plane); gl.uniform1f(pl.loc.uClip, 0); gl.uniform3fv(pl.loc.uEye, vp.eye);
      gl.uniform1f(pl.loc.uFog, 0); gl.uniform1f(pl.loc.uPull, 0.6); gl.uniform1f(pl.loc.uDots, 0);
      gl.uniform3fv(pl.loc.uCol, lights[0].col || [1, 0.75, 0.3]);
      gl.bindBuffer(gl.ARRAY_BUFFER, lightBuf);
      gl.enableVertexAttribArray(pl.loc.aPos); gl.vertexAttribPointer(pl.loc.aPos, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(pl.loc.aTone); gl.vertexAttribPointer(pl.loc.aTone, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.TRIANGLES, 0, lights.reduce((n, L) => n + (L.pts.length - 2) * 3, 0));
      gl.disableVertexAttribArray(pl.loc.aTone);
    }
    drawMarkers(vp);
  };
}
root.ReliefRenderer = Renderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
