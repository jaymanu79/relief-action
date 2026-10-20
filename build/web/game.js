// Relief Action game layer: runs the original code on the CPC emulator and exposes its state.
(function (root) {
'use strict';
const CPC = root.CPC || require('./cpc.js');
const G = root.ReliefGeom || require('./geom.js');

// poll contexts, by the return address of the joystick reader &2D1D
const CTX = { 0x3155: 'move', 0x7E3F: 'menu', 0x6F00: 'box', 0x64EE: 'code', 0x6519: 'code', 0x6C97: 'mini', 0x6DCC: 'wait', 0x7A9F: 'over' };
const J_UP = 1, J_DOWN = 2, J_LEFT = 4, J_RIGHT = 8, J_FIRE = 16;
const MONSTER_PATCH = [[0x695B, [0xC9]], [0x67A0, [0x00, 0x00, 0x00]]];   // no movement, no kill

function Relief(memImage, opts) {
  opts = opts || {};
  const cpc = new CPC();
  this.cpc = cpc;
  const ram = cpc.ram;
  const rd = a => cpc.read(a & 0xFFFF), w16 = a => rd(a) | (rd(a + 1) << 8);
  this.read = rd; this.w16 = w16;
  const self = this;
  this.listeners = {};
  this.on = (ev, fn) => { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
  const emit = (ev, ...a) => (this.listeners[ev] || []).forEach(f => f(...a));

  this.reset = function () {
    ram.fill(0); ram.set(memImage, 0);
    ram[0x5707] = 0x93;            // typo fix in the word list: EMIT -> EMIS (same poke as the user's loader)
    cpc.cpu.reset(); cpc.cpu.pc = 0x04D0; cpc.cpu.sp = 0xBFF0; cpc.cpu.im = 1;
    cpc.keys.fill(0xFF);
    cpc.ppi.portC = 0x20;          // cassette write bit high, as left by the loader (the game waits on it)
    this.queue = []; this.ctx = null; this.polls = 0; this.release = 0;
    this.epilogue = false; this.modern = true; this.ctx = null;
    if (this.monsterOff) this.setMonster(false);
    if (this.infTime) this.setInfiniteTime(true);
    this.scene = null; this.lastScene = null; this.frameAcc = 0;
  };
  this.monsterOff = !!opts.monsterOff;
  this.origMonster = MONSTER_PATCH.map(([a, b]) => b.map((_, i) => memImage[a + i]));
  // self-destruct timer: the init (&7FF6) schedules &7A87 ("le vaisseau NMI vient d'exploser") 10000 ticks later;
  // infinite time turns that handler into a RET
  this.origTimer = memImage[0x7A87];
  this.setInfiniteTime = function (on) { this.infTime = !!on; cpc.write(0x7A87, on ? 0xC9 : this.origTimer); };
  this.setMonster = function (on) {
    this.monsterOff = !on;
    MONSTER_PATCH.forEach(([a, b], k) => b.forEach((v, i) => cpc.write(a + i, on ? this.origMonster[k][i] : v)));
  };

  let rendering = false, realCam = null;
  const s16 = v => (v & 0x8000 ? v - 0x10000 : v), s8 = v => (v & 0x80 ? v - 0x100 : v);
  // ---------- state ----------
  this.state = function () {
    const inv = []; for (let s = 1; s <= 9; s++) { const o = rd(0xE7EC + s); inv.push(o === 0xFF ? null : o); }
    const room = rd(0xD7D5);
    const here = []; for (let n = 0; n < 60; n++) if (rd(0x06C6 + n) === room) here.push(n);
    return {
      room, monster: rd(0xD7E1), verb: rd(0xD7D6), slot: rd(0xD7D9), box: rd(0xCFF1),
      // while the game draws a door it moves the camera into the door's frame: use the camera saved at the start of the render
      x: (rendering && realCam ? realCam.x : s16(w16(0xC7D0))) / 16, y: w16(0xC7D2) / 16, z: (rendering && realCam ? realCam.z : s16(w16(0xC7D4))) / 16,
      heading: rd(0xC7D7), pitch: (rd(0xC7D9) << 24) >> 24,
      inv, here: here.slice(0, 4), hereAll: here, relief: rd(0xD7DC), ctx: this.ctx,
      lightsOff: w16(0x2840) !== 0x2D56,   // the game plots lines as sparse dots (&2E71) when the lights are out
      lift: rd(0x41EA),
      focal: rd(0xC7DB) || 150,   // projection distance: 150, 70 with the spacesuit (fish-eye), 200 with the glasses (zoom)
    };
  };
  this.objType = n => rd(0x0702 + n);
  this.objLoc = n => rd(0x06C6 + n);
  this.roomFlags = r => rd(0xB660 + (r + 1) * 8);   // row 0 of font glyph room+1 (visited, smells)

  // ---------- input ----------
  this.intent = { fwd: 0, back: 0, sl: 0, sr: 0, tl: 0, tr: 0, up: 0, down: 0 };
  this.queue = [];
  this.push = function (cmd) { this.queue.push(cmd); };
  this.clearQueue = function () { this.queue = []; };
  this.wantExitMove = false;
  let toggle = 0;

  function moveJoy(it) {
    const tr = (it.fwd ? J_UP : 0) | (it.back ? J_DOWN : 0) | (it.sl ? J_LEFT : 0) | (it.sr ? J_RIGHT : 0);
    const ro = (it.tl ? J_LEFT : 0) | (it.tr ? J_RIGHT : 0) | (it.up ? J_UP : 0) | (it.down ? J_DOWN : 0);
    if (tr && ro) { toggle ^= 1; return toggle ? tr : ro | J_FIRE; }
    if (ro) return ro | J_FIRE;
    return tr;
  }
  const anyMove = it => it.fwd || it.back || it.sl || it.sr || it.tl || it.tr || it.up || it.down;

  function pollJoy(ctx) {
    // returns pressed bits (active high)
    if (self.release > 0) { self.release--; return 0; }
    const q = self.queue;
    while (q.length) {
      const m = q[0];
      if (m.type === 'exitMove') {
        if (ctx === 'move') { self.wantExitMove = true; return 0; }
        q.shift(); continue;
      }
      if (m.type === 'verb') {
        if (ctx === 'move') { self.wantExitMove = true; return 0; }
        if (ctx !== 'menu') { if (++m.tries > 400) q.shift(); return 0; }
        const cur = rd(0xD7D6);
        if (cur !== m.v) {
          const upSteps = (m.v - cur + 11) % 11;
          self.release = 1;
          return upSteps <= 5 ? J_UP : J_DOWN;   // J_UP increments the verb index
        }
        q.shift(); self.release = 3; m.done && m.done(); return J_FIRE;
      }
      if (m.type === 'slot') {
        if (ctx === 'move') { self.wantExitMove = true; return 0; }
        if (ctx !== 'menu') { if (++m.tries > 400) q.shift(); return 0; }
        const cur = rd(0xD7D9);
        if (cur !== m.s) {
          const right = (m.s - cur + 9) % 9;
          self.release = 1;
          return right <= 4 ? J_RIGHT : J_LEFT;
        }
        q.shift(); continue;
      }
      if (m.type === 'box') {
        if (ctx !== 'box') { if (++m.tries > 400) q.shift(); return 0; }
        const cur = rd(0xCFF1) & 3;
        if (cur !== m.b) {
          let j = 0;
          if ((cur & 1) !== (m.b & 1)) j |= (m.b & 1) ? J_RIGHT : J_LEFT;
          if ((cur & 2) !== (m.b & 2)) j |= (m.b & 2) ? J_DOWN : J_UP;
          self.release = 1;
          return j;
        }
        q.shift(); self.release = 3; return J_FIRE;
      }
      if (m.type === 'joy') {           // raw joystick for a number of polls
        if (m.ctx && m.ctx !== ctx) { if (++m.tries > 400) q.shift(); return 0; }
        if (m.n-- <= 0) { q.shift(); continue; }
        return m.bits;
      }
      if (m.type === 'enterMove') {
        if (ctx === 'move') { q.shift(); continue; }
        if (ctx !== 'menu') { if (++m.tries > 400) q.shift(); return 0; }
        q.splice(0, 1, { type: 'verb', v: 3, tries: 0 });
        continue;
      }
      q.shift();
    }
    if (ctx === 'move') return moveJoy(self.intent);
    if (ctx === 'menu' && anyMove(self.intent) && self.autoMove) { self.push({ type: 'enterMove', tries: 0 }); return 0; }
    if (ctx === 'box' && self.boxCancel) { self.boxCancel = false; self.release = 2; return J_FIRE; }
    return self.rawJoy || 0;
  }
  this.autoMove = true;
  this.rawJoy = 0;

  const gameHook = (pc, fn) => cpc.addHook(pc, () => (self.epilogue ? undefined : fn()));
  // joystick reader result: B holds the joystick byte (active low) before it is stored in &C7E5
  gameHook(0x2D51, () => {
    const ret = w16(cpc.cpu.sp);
    const ctx = CTX[ret] || ('?' + ret.toString(16));
    if (ctx !== self.ctx) { self.ctx = ctx; emit('ctx', ctx); }
    self.polls++;
    if (self.modern) {
      const bits = pollJoy(ctx);
      cpc.cpu.b = (cpc.cpu.b & 0xE0) | ((~bits) & 0x1F);
    }
  });
  // leave movement mode on request: the movement loop returns 0 (as if fire was held long enough)
  gameHook(0x3155, () => {
    if (self.wantExitMove) { self.wantExitMove = false; cpc.cpu.pc = 0x31E3; return true; }
  });
  // skip pure delay loops (menu scrolling, flashes) when turbo is on
  gameHook(0x4B88, () => {
    if (self.turbo) { cpc.cpu.b = 1; cpc.cpu.c = 1; }
  });

  // game clock: the main loop (&80B5) decrements the event scheduler once per pass (&8116). With turbo the 3D render is
  // instant, so while moving the loop runs ~6x faster than on a CPC and so would the monster (every 80 ticks), the
  // self-destruct (10000), the hangar's delayed opening (300), the fire system after lighting the torch (150) and the
  // shuttle launch sequence (30 / 50 / 100). Keep the CPC tempo while moving: at most one tick every 19 frames (2.6/s,
  // measured without turbo). The menu already runs at the CPC rate (about one tick every 12 frames) and is left alone.
  let lastTick = -1e9;
  gameHook(0x8116, () => {
    if (!self.turbo || !self.cpcTempo || self.ctx !== 'move') { lastTick = cpc.frames; return; }
    if (cpc.frames - lastTick < 19) { cpc.cpu.pc = 0x8123; return true; }
    lastTick = cpc.frames;
  });

  // frame synchronisation (wait for VSYNC) used by text printing and menu animations
  gameHook(0x4A5F, () => { if (self.turbo) { cpc.cpu.pc = 0x4A6F; return true; } });

  // ---------- messages ----------
  gameHook(0x4DB7, () => { emit('phrase', cpc.cpu.a + 1); });
  // detector: the centre light toggles while the monster is next door (&67BB loop, &66F6)
  gameHook(0x66F6, () => { emit('detector'); });

  // ---------- 3D scene capture ----------
  // A render runs from &2F55 (clear) to &2F0E (copy to screen). Every model goes through the parser
  // &24D2; doors are drawn by moving the camera into the door's own frame (&3493), so each capture
  // records the camera it was drawn with and is mapped back into the room frame afterwards.
  let caps = [], fullDoors = false, lastDoors = null, lastDoorRoom = -1;
  const stateFn = n => rd(0xE7D0 + n);
  const camNow = () => ({ x: s16(w16(0xC7D0)), z: s16(w16(0xC7D4)), h: rd(0xC7D7) * Math.PI / 128, eff: Math.atan2(s8(rd(0xC7F6)), s8(rd(0xC7F7))) });
  gameHook(0x2F55, () => { rendering = true; caps = []; segs2d = []; fullDoors = false; realCam = camNow(); if (self.turbo) cpc.speedDiv = 24; });
  // every line the game draws in its 3D window goes through &2D56 (H,L) -> (D,E), y then x, window 223 x 127
  let segs2d = [];
  gameHook(0x2D56, () => { if (rendering && segs2d.length < 4000) { const c = cpc.cpu; segs2d.push(c.l, c.h, c.e, c.d); } });
  gameHook(0x376C, () => { if (rendering) fullDoors = true; });
  gameHook(0x24D2, () => {
    if (!rendering) return;
    if (rd(0xD7D8) === 2) return;                 // right eye of the stereo mode: same geometry
    const ptr = w16(0xCFF9);
    const d = G.decodeModel(rd, ptr, stateFn);
    caps.push({ ptr, verts: d.verts, lines: d.lines, cam: camNow(), room: ptr === w16(0xDFF2) });
  });
  function place(cap, ref) {
    // room = Rot(rho) . (p - c') + C, rho = real heading - heading the model was drawn with
    const rho = ref.h - cap.cam.eff;
    // snap to quarter turns (the game only uses 0, 64, 128, 192)
    const q = Math.round(rho / (Math.PI / 2)) * (Math.PI / 2);
    const c = Math.round(Math.cos(q)), sn = Math.round(Math.sin(q));
    const cx = cap.cam.x / 16, cz = cap.cam.z / 16, X = ref.x / 16, Z = ref.z / 16;
    return cap.verts.map(v => {
      if (!v) return null;
      const dx = v[0] - cx, dz = v[2] - cz;
      return [c * dx - sn * dz + X, v[1], sn * dx + c * dz + Z];
    });
  }
  // doors of the current room built like the game does: frame &37FA[type] + leaf &3806[type*4+state], placed as &3493
  // door frames (&37FA[type]) belong to the wall; leaves (&3806) are the door itself
  function isFrame(ptr) { for (let t = 0; t < 6; t++) if (w16(0x37FA + 2 * t) === ptr && w16(0x3806 + 8 * t) !== ptr) return true; return false; }
  function synthDoors() {
    const out = [];
    try {
      const ex = w16(0xDFF0), n = rd(ex);
      for (let k = 0; k < n && k < 16; k++) {
        const e = ex + 1 + 8 * k, d = rd(e + 4), E = rd(e + 5), C = rd(e + 6), A = rd(e + 7);
        const rec = 0x448F + 9 * d, open = rd(rec + 2) & 3, type = rd(rec + 3);
        for (const ptr of [w16(0x37FA + 2 * type), w16(0x3806 + 2 * (type * 4 + open))]) {
          const m = G.decodeModel(rd, ptr, stateFn);
          if (m.verts.filter(Boolean).length < 2) continue;
          const verts = m.verts.map(v => v && (A === 1 ? [E - v[2], v[1], v[0] + C] : A === 2 ? [E - v[0], v[1], C - v[2]] : A === 3 ? [v[2] + E, v[1], C - v[0]] : [v[0] + E, v[1], v[2] + C]));
          out.push({ ptr, verts, lines: m.lines, kind: isFrame(ptr) ? 'frame' : 'door' });
        }
      }
    } catch (err) { /* no doors */ }
    return out;
  }
  this.synthDoors = synthDoors;
  gameHook(0x2F0E, () => {
    if (!rendering) return;
    rendering = false; cpc.speedDiv = 1;
    const st = self.state();
    const roomCap = caps.find(c => c.room);
    let ref = realCam;
    if (roomCap && (roomCap.cam.x !== realCam.x || roomCap.cam.z !== realCam.z)) ref = Object.assign({}, roomCap.cam, { h: realCam.h });
    const models = [];
    if (roomCap) models.push({ ptr: roomCap.ptr, verts: roomCap.verts, lines: roomCap.lines, kind: 'room' });
    let doors = caps.filter(c => !c.room).map(c => ({ ptr: c.ptr, verts: place(c, ref), lines: c.lines, kind: isFrame(c.ptr) ? 'frame' : 'door' }));
    // doors always rebuilt from the game's tables (exact, and identical whether moving or not);
    // the captured ones are only a fallback
    { const sd = synthDoors(); if (sd.length || !fullDoors) doors = sd; }
    models.push(...doors);
    // door openings: the simple outline of each door type (&37EE) placed like the game does (&3493)
    const portals = [];
    try {
      const ex = w16(0xDFF0), n = rd(ex);
      for (let k = 0; k < n && k < 16; k++) {
        const e = ex + 1 + 8 * k, d = rd(e + 4), E = rd(e + 5), C = rd(e + 6), A = rd(e + 7);
        const rec = 0x448F + 9 * d, open = rd(rec + 2), type = rd(rec + 3);
        // opening outline &37EE[type]; the iris doors (type 2) use their closed leaf, the octagon, instead of the square frame
        let m = G.decodeModel(rd, w16(type === 2 ? 0x3806 + 2 * (type * 4) : 0x37EE + 2 * type), stateFn);
        // some door types (e.g. 5, shuttle cabin) have no outline model: use the open leaf (its jambs), else the closed one
        if (m.verts.filter(Boolean).length < 3) {
          const a = G.decodeModel(rd, w16(0x3806 + 2 * (type * 4 + 1)), stateFn), b = G.decodeModel(rd, w16(0x3806 + 2 * (type * 4)), stateFn);
          m = { verts: a.verts.concat(b.verts) };          // open jambs + closed leaf: their hull is the opening
        }
        const pts = m.verts.filter(Boolean).map(([x, y, z]) =>
          A === 1 ? [E - z, y, x + C] : A === 2 ? [E - x, y, C - z] : A === 3 ? [z + E, y, C - x] : [x + E, y, z + C]);
        if (pts.length >= 3) portals.push({ door: d, open, pts });
      }
    } catch (err) { /* keep the scene without openings */ }
    self.scene = { room: st.room, models, portals, cam: { x: st.x, y: st.y, z: st.z, heading: st.heading, pitch: st.pitch }, relief: st.relief, dark: !roomCap, lines2d: segs2d };
    emit('scene', self.scene);
  });

  // ---------- epilogue (EPILOG.BIN, loaded over the game image like the original disk does) ----------
  // it calls a few firmware entries: emulate them as returns
  const fwRet = () => { const sp = cpc.cpu.sp; cpc.cpu.pc = rd(sp) | (rd(sp + 1) << 8); cpc.cpu.sp = (sp + 2) & 0xFFFF; return true; };
  cpc.addHook(0xBC0E, () => { cpc.ga.mode = cpc.cpu.a & 3; return fwRet(); });     // SCR SET MODE
  cpc.addHook(0xBC38, fwRet); cpc.addHook(0xBC32, fwRet);                         // SCR SET BORDER / INK
  cpc.addHook(0xB90F, fwRet); cpc.addHook(0xB90C, fwRet);                         // KL ROM SELECT / RESTORE
  this.startEpilogue = function (bin) {
    ram.fill(0); ram.set(memImage, 0);
    const load = bin[21] | (bin[22] << 8), len = bin[24] | (bin[25] << 8), exec = bin[26] | (bin[27] << 8);
    ram.set(bin.subarray(128, 128 + len), load);
    cpc.cpu.reset(); cpc.cpu.pc = exec; cpc.cpu.sp = 0xBFF0; cpc.cpu.im = 1;
    cpc.keys.fill(0xFF); cpc.ppi.portC = 0x20; cpc.speedDiv = 1; rendering = false;
    this.queue = []; this.ctx = 'epilogue'; this.modern = false; this.epilogue = true;
    emit('ctx', 'epilogue');
  };

  // ---------- run ----------
  this.modern = true;
  this.turbo = true; this.cpcTempo = true;
  this.paused = false;
  this.run = function (ms) {
    if (this.paused) return;
    this.frameAcc += ms / 20;
    let n = Math.floor(this.frameAcc);
    if (n > 10) { n = 10; this.frameAcc = 0; } else this.frameAcc -= n;
    // time budget: on a slow device the game slows down instead of freezing the page
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = now(), budget = this.budget || 14;
    for (let i = 0; i < n; i++) { cpc.runFrame(); if (now() - t0 > budget) { this.frameAcc = 0; break; } }
  };
  this.reset();
}
Relief.CTX = CTX;
root.Relief = Relief;
if (typeof module !== 'undefined') module.exports = Relief;
})(typeof globalThis !== 'undefined' ? globalThis : this);
