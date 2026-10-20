// Relief Action model decoding (port of the parser at &24D2) and face reconstruction.
(function (root) {
'use strict';

// decode the model at ptr using read(a) for memory and state(n) for the &E7D0 block
function decodeModel(read, ptr, state) {
  let p = ptr, i = 0, guard = 0;
  const verts = [], lines = [];
  let pending = null;
  while (guard++ < 4000) {
    const x = read(p), y = read(p + 1), z = read(p + 2);
    p += 3;
    verts[i] = [x, y, z];
    let mode = pending, c;
    while (true) {
      if (mode === null) {
        c = read(p);
        if ((c & 0x3F) === 0x3F) { mode = c & 0xC0; p++; }
        else {
          mode = c & 0xC0; const k = c & 0x3F; p++;
          lines.push([i, i - k]);
          if (mode === 0x00) { mode = null; continue; }
          pending = mode;
        }
      }
      if (mode === 0x00) { mode = null; continue; }
      break;
    }
    pending = null;
    if (mode === 0x40) { i++; continue; }
    if (mode === 0xC0) break;
    // conditional block
    c = read(p);
    let hl = p, skip;
    if (c & 0x80) skip = true;
    else {
      const val = state(c);
      skip = false; let nxt = null;
      while (true) {
        hl++; const v = read(hl); hl++;
        if (v === val) { skip = true; break; }
        if (read(hl) & 0x80) continue;
        if (read(hl) & 0x40) { hl++; nxt = 'next'; } else { hl++; nxt = 'links'; }
        break;
      }
      if (!skip) {
        p = hl;
        if (nxt === 'next') { i++; continue; }
        let md;
        while (true) {
          const c2 = read(p); md = c2 & 0xC0;
          if ((c2 & 0x3F) !== 0x3F) lines.push([i, i - (c2 & 0x3F)]);
          p++;
          if (md === 0x00) continue;
          break;
        }
        if (md === 0x40) { i++; continue; }
        if (md === 0xC0) break;
        break; // nested conditional: stop safely
      }
    }
    let cnt = read(hl) & 0x3F;
    while (true) {
      const bit6 = read(hl) & 0x40; hl++;
      if (!bit6) continue;
      if (cnt === 0) break;
      cnt--; hl += 3; i++; verts[i] = null;
    }
    p = hl; i++;
  }
  return { verts, lines };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function newell(P) {
  const n = [0, 0, 0];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(n[0], n[1], n[2]);
  return l ? [n[0] / l, n[1] / l, n[2] / l] : null;
}

function merge(verts, lines) {
  const key = new Map(), idx = new Map(), pts = [];
  verts.forEach((p, i) => {
    if (!p) return;
    const k = p.join(',');
    if (!key.has(k)) { key.set(k, pts.length); pts.push(p); }
    idx.set(i, key.get(k));
  });
  const E = new Set();
  for (const [a, b] of lines) {
    if (!idx.has(a) || !idx.has(b)) continue;
    const u = idx.get(a), v = idx.get(b);
    if (u !== v) E.add(u < v ? u * 4096 + v : v * 4096 + u);
  }
  return { pts, E };
}

function splitT(pts, E, tol = 0.35) {
  const out = new Set();
  for (const e of E) {
    const a = Math.floor(e / 4096), b = e % 4096;
    const A = pts[a], B = pts[b], d = sub(B, A), L2 = dot(d, d);
    const mids = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === a || i === b) continue;
      const P = pts[i];
      // quick bbox reject
      if (P[0] < Math.min(A[0], B[0]) - 1 || P[0] > Math.max(A[0], B[0]) + 1 || P[1] < Math.min(A[1], B[1]) - 1 || P[1] > Math.max(A[1], B[1]) + 1 || P[2] < Math.min(A[2], B[2]) - 1 || P[2] > Math.max(A[2], B[2]) + 1) continue;
      const t = dot(sub(P, A), d) / L2;
      if (t > 0 && t < 1) {
        const Q = [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t];
        if (Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]) <= tol) mids.push([t, i]);
      }
    }
    mids.sort((x, y) => x[0] - y[0]);
    const chain = [a, ...mids.map(m => m[1]), b];
    for (let k = 0; k < chain.length - 1; k++) {
      const u = chain[k], v = chain[k + 1];
      out.add(u < v ? u * 4096 + v : v * 4096 + u);
    }
  }
  return out;
}

function findFaces(pts, E, maxlen = 10, tol = 0.6, startEdges) {
  const adj = pts.map(() => []);
  const has = (u, v) => E.has(u < v ? u * 4096 + v : v * 4096 + u);
  for (const e of E) { const a = Math.floor(e / 4096), b = e % 4096; adj[a].push(b); adj[b].push(a); }
  const found = new Set(), out = [];
  let budget = 0;
  for (const e of (startEdges || E)) {
    const a = Math.floor(e / 4096), b = e % 4096;
    const stack = [[b, [a, b]]];
    budget = 6000;
    while (stack.length && budget-- > 0) {
      const [cur, path] = stack.pop();
      if (path.length > maxlen) continue;
      for (const nx of adj[cur]) {
        if (nx === a && path.length >= 3) {
          const k = path.slice().sort((x, y) => x - y).join(',');
          if (found.has(k)) continue;
          const P = path.map(i => pts[i]);
          const n = newell(P);
          if (!n) continue;
          const d0 = dot(n, P[0]);
          if (P.some(p => Math.abs(dot(n, p) - d0) > tol)) continue;
          const L = path.length;
          let chord = false;
          for (let i = 0; i < L && !chord; i++) for (let j = i + 2; j < L; j++) {
            if (i === 0 && j === L - 1) continue;
            if (has(path[i], path[j])) { chord = true; break; }
          }
          if (chord) continue;
          found.add(k); out.push({ cyc: path.slice(), n });
        } else if (!path.includes(nx)) {
          if (path.length >= 3) {
            const P = path.map(i => pts[i]); P.push(pts[nx]);
            const n = newell(P.slice(0, 3));
            if (n) { const d0 = dot(n, P[0]); if (P.some(p => Math.abs(dot(n, p) - d0) > tol)) continue; }
          }
          stack.push([nx, path.concat([nx])]);
        }
      }
    }
  }
  return out;
}

// Faces by planar half-edge traversal, plane by plane (handles large polygons and polygons with islands).
// Candidate planes: the three axis planes through every vertex, plus the plane of every pair of
// adjacent edges.
function planarFaces(pts, E, extraPlanes) {
  const out = [];
  const edges = [...E].map(e => [Math.floor(e / 4096), e % 4096]);
  const adj = pts.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const planes = new Map();
  const addPlane = (n, d) => {
    // canonical orientation
    let k = Math.abs(n[0]) > 1e-6 ? 0 : Math.abs(n[1]) > 1e-6 ? 1 : 2;
    if (n[k] < 0) { n = [-n[0], -n[1], -n[2]]; d = -d; }
    const key = n.map(x => Math.round(x * 200)).join(',') + '|' + Math.round(d * 4);
    if (!planes.has(key)) planes.set(key, { n, d });
  };
  for (let i = 0; i < pts.length; i++) {
    for (let ax = 0; ax < 3; ax++) { const n = [0, 0, 0]; n[ax] = 1; addPlane(n, pts[i][ax]); }
    const nb = adj[i];
    for (let x = 0; x < nb.length; x++) for (let y = x + 1; y < nb.length; y++) {
      const u = sub(pts[nb[x]], pts[i]), v = sub(pts[nb[y]], pts[i]);
      const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(c[0], c[1], c[2]);
      const lu = Math.hypot(...u), lv = Math.hypot(...v);
      if (l < 1e-6 || l / (lu * lv) < 0.05) continue;       // nearly collinear edges
      const n = [c[0] / l, c[1] / l, c[2] / l];
      addPlane(n, dot(n, pts[i]));
    }
  }
  for (const p of (extraPlanes || [])) addPlane(p.n, p.d);
  const seen = new Set();
  for (const { n, d } of planes.values()) {
    const on = i => Math.abs(dot(n, pts[i]) - d) <= 0.35;
    let list = edges.filter(([a, b]) => on(a) && on(b));
    if (list.length < 3) continue;
    let nb = new Map();
    for (const [a, b] of list) { (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [a, l] of nb) if (l.length < 2) { for (const b of l) { const lb = nb.get(b); lb.splice(lb.indexOf(a), 1); } nb.delete(a); changed = true; }
    }
    list = list.filter(([a, b]) => nb.has(a) && nb.has(b) && nb.get(a).includes(b));
    if (list.length < 3) continue;
    // 2D basis of the plane
    const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e1 = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const l1 = Math.hypot(...e1); e1 = e1.map(x => x / l1);
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const P2 = new Map();
    for (const a of nb.keys()) P2.set(a, [dot(pts[a], e1), dot(pts[a], e2)]);
    const ang = (a, b) => { const p = P2.get(a), q = P2.get(b); return Math.atan2(q[1] - p[1], q[0] - p[0]); };
    for (const [a, l] of nb) l.sort((p, q) => ang(a, p) - ang(a, q));
    const used = new Set();
    for (const [a0, b0] of list) for (const [s, t] of [[a0, b0], [b0, a0]]) {
      if (used.has(s * 4096 + t)) continue;
      const cyc = []; let a = s, b = t, guard = 0;
      while (guard++ < 200) {
        used.add(a * 4096 + b); cyc.push(a);
        const l = nb.get(b); const i = l.indexOf(a);
        const c = l[(i - 1 + l.length) % l.length];
        a = b; b = c;
        if (a === s && b === t) break;
      }
      if (guard >= 200 || cyc.length < 3 || cyc.length > 60) continue;
      if (new Set(cyc).size !== cyc.length) continue;
      let area = 0;
      for (let i = 0; i < cyc.length; i++) { const p = P2.get(cyc[i]), q = P2.get(cyc[(i + 1) % cyc.length]); area += p[0] * q[1] - q[0] * p[1]; }
      if (area <= 1e-3) continue;
      const key = cyc.slice().sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cyc, n: n.slice() });
    }
  }
  return out;
}

function hull2d(P) {
  const S = [...new Map(P.map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (S.length < 3) return S;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of S) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = S.length - 1; i >= 0; i--) { const p = S[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// Full build: merged points, edges, faces oriented toward the inside (room) and synthesized floor/ceiling
function buildGeometry(verts, lines, opts = {}) {
  const { pts, E: E0 } = merge(verts, lines);
  if (pts.length < 2) return { pts, edges: [], faces: [] };
  const E = splitT(pts, E0);
  let F = findFaces(pts, E, opts.maxlen || 10);
  if (opts.planar !== false) {
    const axisPlane = f => { const P = f.cyc.map(i => pts[i]); return [0, 1, 2].some(ax => P.every(p => p[ax] === P[0][ax])); };
    const keyOf = c => c.slice().sort((x, y) => x - y).join(',');
    const have = new Set();
    const P = planarFaces(pts, E);
    // keep chordless faces only when no planar face already covers the same vertices
    const planarKeys = new Set(P.map(f => keyOf(f.cyc)));
    F = F.filter(f => !axisPlane(f) && !planarKeys.has(keyOf(f.cyc)));
    F.forEach(f => have.add(keyOf(f.cyc)));
    for (const f of P) { const k = keyOf(f.cyc); if (!have.has(k)) { have.add(k); F.push(f); } }
    // second pass: slightly curved strips (pods, rounded walls) around edges no face uses yet
    const cnt = new Map();
    for (const f of F) for (let i = 0; i < f.cyc.length; i++) { const a = f.cyc[i], b = f.cyc[(i + 1) % f.cyc.length]; const k = a < b ? a * 4096 + b : b * 4096 + a; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const loose = [...E].filter(e => !cnt.get(e));
    if (loose.length) for (const f of findFaces(pts, E, 8, 2.6, loose)) { const k = keyOf(f.cyc); if (!have.has(k)) { have.add(k); F.push(f); } }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), zs = pts.map(p => p[2]);
  const mn = a => Math.min(...a), mx = a => Math.max(...a);
  const C = [(mn(xs) + mx(xs)) / 2, (mn(ys) + mx(ys)) / 2, (mn(zs) + mx(zs)) / 2];
  const faces = [];
  let hasFloor = false, hasCeil = false;
  for (let { cyc, n } of F) {
    const cen = [0, 1, 2].map(k => cyc.reduce((s, i) => s + pts[i][k], 0) / cyc.length);
    if (opts.inward !== false && dot(n, sub(C, cen)) < 0) n = [-n[0], -n[1], -n[2]];
    const nn = newell(cyc.map(i => pts[i]));
    if (nn && dot(nn, n) < 0) cyc = cyc.slice().reverse();
    if (Math.abs(n[1]) > 0.99 && cyc.every(i => pts[i][1] === mn(ys))) hasFloor = true;
    if (Math.abs(n[1]) > 0.99 && cyc.every(i => pts[i][1] === mx(ys))) hasCeil = true;
    faces.push(cyc);
  }
  const synth = [];
  if (opts.synth !== false) {
    for (const [level, want, up] of [[mn(ys), !hasFloor, true], [mx(ys), !hasCeil, false]]) {
      if (!want) continue;
      const ring = pts.filter(p => p[1] === level);
      const h = hull2d(ring.map(p => [p[0], p[2]]));
      if (h.length < 3) continue;
      let idx = h.map(([x, z]) => {
        let k = pts.findIndex(p => p[0] === x && p[1] === level && p[2] === z);
        if (k < 0) { k = pts.length; pts.push([x, level, z]); }
        return k;
      });
      const nn = newell(idx.map(i => pts[i]));
      if (nn && dot(nn, [0, up ? 1 : -1, 0]) < 0) idx = idx.reverse();
      synth.push(idx);
    }
  }
  const edges = [...E].map(e => [Math.floor(e / 4096), e % 4096]);
  return { pts, edges, faces, synth };
}

root.ReliefGeom = { decodeModel, buildGeometry, merge, splitT, findFaces, newell };
if (typeof module !== 'undefined') module.exports = root.ReliefGeom;
})(typeof globalThis !== 'undefined' ? globalThis : this);
