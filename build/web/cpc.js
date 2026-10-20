// Minimal Amstrad CPC (464/6128) hardware for running a game that drives the hardware directly.
(function (root) {
'use strict';
const Z80 = root.Z80 || (typeof require !== 'undefined' ? require('./z80.js') : null);

// hardware colour number -> RGB (approximate CPC palette)
const HW_RGB = [
  [0x80, 0x80, 0x80], [0x80, 0x80, 0x80], [0x00, 0xFF, 0x80], [0xFF, 0xFF, 0x80], [0x00, 0x00, 0x80], [0xFF, 0x00, 0x80], [0x00, 0x80, 0x80], [0xFF, 0x80, 0x80],
  [0xFF, 0x00, 0x80], [0xFF, 0xFF, 0x80], [0xFF, 0xFF, 0x00], [0xFF, 0xFF, 0xFF], [0xFF, 0x00, 0x00], [0xFF, 0x00, 0xFF], [0xFF, 0x80, 0x00], [0xFF, 0x80, 0xFF],
  [0x00, 0x00, 0x80], [0x00, 0xFF, 0x80], [0x00, 0xFF, 0x00], [0x00, 0xFF, 0xFF], [0x00, 0x00, 0x00], [0x00, 0x00, 0xFF], [0x00, 0x80, 0x00], [0x00, 0x80, 0xFF],
  [0x80, 0x00, 0x80], [0x80, 0xFF, 0x80], [0x80, 0xFF, 0x00], [0x80, 0xFF, 0xFF], [0x80, 0x00, 0x00], [0x80, 0x00, 0xFF], [0x80, 0x80, 0x00], [0x80, 0x80, 0xFF],
];

function CPC() {
  const ram = new Uint8Array(0x20000);         // 128 KB
  const bankMap = new Int32Array(4);            // page -> offset in ram
  const self = this;
  this.ram = ram;
  const ga = { pen: 0, ink: new Uint8Array(17), mode: 1, lowRom: false, highRom: false, intCounter: 0, ramCfg: 0 };
  ink_init: for (let i = 0; i < 17; i++) ga.ink[i] = 20;
  const crtc = { sel: 0, reg: new Uint8Array(18) };
  crtc.reg.set([63, 40, 46, 0x8E, 38, 0, 25, 30, 0, 7, 0, 0, 0x30, 0, 0, 0, 0, 0]);
  const psg = { sel: 0, reg: new Uint8Array(16), ctrl: 0, portA: 0 };
  const ppi = { portC: 0, ctrl: 0x82, portA: 0 };
  const keys = new Uint8Array(16).fill(0xFF);   // keyboard matrix (active low)
  this.keys = keys; this.ga = ga; this.crtc = crtc; this.psg = psg; this.ppi = ppi;
  this.vsync = 0;
  this.log = null;                               // optional function(msg)
  this.psgWrite = null;                          // optional callback(reg, value, tstate)

  function setRamCfg(v) {
    ga.ramCfg = v & 7;
    const B = 0x10000;
    const cfgs = [[0, 1, 2, 3], [0, 1, 2, 7], [4, 5, 6, 7], [0, 3, 2, 7], [0, 4, 2, 3], [0, 5, 2, 3], [0, 6, 2, 3], [0, 7, 2, 3]];
    const c = cfgs[ga.ramCfg];
    for (let p = 0; p < 4; p++) bankMap[p] = (c[p] < 4 ? c[p] * 0x4000 : B + (c[p] - 4) * 0x4000) - p * 0x4000;
  }
  setRamCfg(0);
  const read = a => ram[a + bankMap[a >> 14]];
  const write = (a, v) => { ram[a + bankMap[a >> 14]] = v; };
  this.read = read; this.write = write;

  function psgReadReg() {
    if (psg.sel === 14) return keys[ppi.portC & 0x0F] & 0xFF;
    return psg.reg[psg.sel];
  }
  function psgCtrl() {
    const c = (ppi.portC >> 6) & 3;
    if (c === 3) psg.sel = ppi.portA & 0x0F;
    else if (c === 2) { psg.reg[psg.sel] = ppi.portA; if (self.psgWrite) self.psgWrite(psg.sel, ppi.portA, self.tstate); }
  }
  function inp(port) {
    let v = 0xFF;
    if (!(port & 0x4000)) { // CRTC
      const f = (port >> 8) & 3;
      if (f === 3) v = crtc.sel >= 12 && crtc.sel < 18 ? crtc.reg[crtc.sel] : 0;
    }
    if (!(port & 0x0800)) { // PPI
      const f = (port >> 8) & 3;
      if (f === 0) v &= ((ppi.portC >> 6) & 3) === 1 ? psgReadReg() : 0xFF;
      else if (f === 1) v &= 0x5E | (self.vsync ? 1 : 0);
      else if (f === 2) v &= ppi.portC;
    }
    return v;
  }
  function out(port, v) {
    if ((port & 0xC000) === 0x4000) { // gate array
      switch (v >> 6) {
        case 0: ga.pen = v & 0x10 ? 16 : v & 0x0F; break;
        case 1: ga.ink[ga.pen] = v & 0x1F; break;
        case 2: ga.mode = v & 3; ga.lowRom = !(v & 4); ga.highRom = !(v & 8); if (v & 0x10) ga.intCounter = 0; break;
        case 3: setRamCfg(v); break;
      }
    }
    if (!(port & 0x4000)) { // CRTC
      const f = (port >> 8) & 3;
      if (f === 0) crtc.sel = v & 0x1F; else if (f === 1 && crtc.sel < 18) crtc.reg[crtc.sel] = v;
    }
    if (!(port & 0x0800)) { // PPI
      const f = (port >> 8) & 3;
      if (f === 0) { ppi.portA = v; psg.portA = v; psgCtrl(); }
      else if (f === 2) { ppi.portC = v; psgCtrl(); }
      else if (f === 3) {
        if (v & 0x80) { ppi.ctrl = v; ppi.portC = 0; }
        else { const b = (v >> 1) & 7; if (v & 1) ppi.portC |= 1 << b; else ppi.portC &= ~(1 << b); psgCtrl(); }
      }
    }
    if (self.onOut) self.onOut(port, v);
  }
  const cpu = new Z80({ read, write, inp, out });
  this.cpu = cpu;
  this.hooks = new Map();          // pc -> function(cpc) ; return true to skip instruction stepping (handled)
  const hookFlag = new Uint8Array(65536);
  this.addHook = (pc, fn) => { this.hooks.set(pc, fn); hookFlag[pc] = 1; };
  this.removeHook = pc => { this.hooks.delete(pc); hookFlag[pc] = 0; };
  this.tstate = 0;
  this.speedDiv = 1;               // >1 runs the CPU faster than real time (turbo)
  this.frames = 0;
  this.stopped = false;
  // One frame: 312 lines of 64 us (256 T-states at 4 MHz); interrupt every 52 lines.
  this.runFrame = function () {
    const LINE = 256;
    let lineT = 0;
    for (let line = 0; line < 312; line++) {
      self.vsync = line < 8 ? 1 : 0;
      while (lineT < LINE) {
        const pc = cpu.pc;
        if (hookFlag[pc]) { const fn = self.hooks.get(pc); if (fn && fn(self) === true) continue; }
        let t = cpu.step();
        t = (t + 3) & ~3;          // CPC wait states: every M-cycle aligned on 1 us
        self.tstate += t; lineT += t / self.speedDiv;
        if (self.stopped) return;
      }
      lineT -= LINE;
      // interrupt counter
      ga.intCounter++;
      if (ga.intCounter >= 52) {
        ga.intCounter = 0;
        self.intPending = true;
      }
      if (line === 1) { /* vsync resync: keep simple */ }
      if (self.intPending && cpu.iff1) {
        const t = cpu.interrupt(0xFF);
        if (t) { self.intPending = false; ga.intCounter &= 31; lineT += t; }
      }
    }
    self.frames++;
  };

  // render the CPC screen into an RGBA buffer of 384x272 (border included) or 320x200 area only
  this.screenBase = function () {
    const r12 = crtc.reg[12], r13 = crtc.reg[13];
    return { page: (r12 >> 4) & 3, offset: (((r12 & 3) << 8) | r13) * 2 };
  };
  this.render = function (rgba, W) {   // W = 640 output width (mode 2 resolution), height 200
    W = W || 640;
    const r1 = crtc.reg[1] || 40, r6 = Math.min(crtc.reg[6] || 25, 35), r9 = (crtc.reg[9] & 7) + 1;
    const { page, offset } = self.screenBase();
    const base = page * 0x4000;
    const pal = []; for (let i = 0; i < 16; i++) pal.push(HW_RGB[ga.ink[i]]);
    const H = r6 * r9, bytesPerLine = r1 * 2;
    const scale = W / (bytesPerLine * 8);
    for (let row = 0; row < r6; row++) for (let sl = 0; sl < r9; sl++) {
      const y = row * r9 + sl; if (y >= 200) continue;
      for (let bx = 0; bx < bytesPerLine; bx++) {
        const addr = base + ((offset + row * bytesPerLine + bx) & 0x7FF) + sl * 0x800;
        const b = ram[addr & 0xFFFF];
        let px;
        if (ga.mode === 0) {
          const p0 = ((b & 0x80) >> 7) | ((b & 0x08) >> 2) | ((b & 0x20) >> 3) | ((b & 0x02) << 2);
          const p1 = ((b & 0x40) >> 6) | ((b & 0x04) >> 1) | ((b & 0x10) >> 2) | ((b & 0x01) << 3);
          px = [p0, p0, p0, p0, p1, p1, p1, p1];
        } else if (ga.mode === 1) {
          px = [];
          for (let k = 0; k < 4; k++) { const p = ((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1); px.push(p, p); }
        } else {
          px = []; for (let k = 0; k < 8; k++) px.push((b >> (7 - k)) & 1);
        }
        for (let k = 0; k < 8; k++) {
          const c = pal[px[k]]; const x = Math.floor((bx * 8 + k) * scale);
          const o = (y * W + x) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
        }
      }
    }
    return { w: W, h: Math.min(H, 200) };
  };
  this.border = () => HW_RGB[ga.ink[16]];
}
CPC.HW_RGB = HW_RGB;
// keyboard matrix: [row, bit] by name
CPC.KEYS = {
  UP: [0, 0], RIGHT: [0, 1], DOWN: [0, 2], F9: [0, 3], F6: [0, 4], F3: [0, 5], ENTER: [0, 6], FDOT: [0, 7],
  LEFT: [1, 0], COPY: [1, 1], F7: [1, 2], F8: [1, 3], F5: [1, 4], F1: [1, 5], F2: [1, 6], F0: [1, 7],
  CLR: [2, 0], '[': [2, 1], RETURN: [2, 2], ']': [2, 3], F4: [2, 4], SHIFT: [2, 5], '\\': [2, 6], CTRL: [2, 7],
  '^': [3, 0], '-': [3, 1], '@': [3, 2], P: [3, 3], ';': [3, 4], ':': [3, 5], '/': [3, 6], '.': [3, 7],
  '0': [4, 0], '9': [4, 1], O: [4, 2], I: [4, 3], L: [4, 4], K: [4, 5], M: [4, 6], ',': [4, 7],
  '8': [5, 0], '7': [5, 1], U: [5, 2], Y: [5, 3], H: [5, 4], J: [5, 5], N: [5, 6], SPACE: [5, 7],
  '6': [6, 0], '5': [6, 1], R: [6, 2], T: [6, 3], G: [6, 4], F: [6, 5], B: [6, 6], V: [6, 7],
  '4': [7, 0], '3': [7, 1], E: [7, 2], W: [7, 3], S: [7, 4], D: [7, 5], C: [7, 6], X: [7, 7],
  '1': [8, 0], '2': [8, 1], ESC: [8, 2], Q: [8, 3], TAB: [8, 4], A: [8, 5], CAPS: [8, 6], Z: [8, 7],
  J_UP: [9, 0], J_DOWN: [9, 1], J_LEFT: [9, 2], J_RIGHT: [9, 3], J_FIRE2: [9, 4], J_FIRE1: [9, 5], DEL: [9, 7],
};
CPC.prototype.key = function (name, down) {
  const k = CPC.KEYS[name]; if (!k) return;
  if (down) this.keys[k[0]] &= ~(1 << k[1]); else this.keys[k[0]] |= 1 << k[1];
};
root.CPC = CPC;
if (typeof module !== 'undefined') module.exports = CPC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
