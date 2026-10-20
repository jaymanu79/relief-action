// Z80 CPU core (documented + usual undocumented behaviour). Usable in browser and Node.
// mem: {read(a), write(a,v), inp(port), out(port,v)}
(function (root) {
'use strict';
function Z80(bus) {
  const rd = bus.read, wr = bus.write, inp = bus.inp, outp = bus.out;
  // flag tables
  const FC = 1, FN = 2, FP = 4, F3 = 8, FH = 16, F5 = 32, FZ = 64, FS = 128;
  const SZ = new Uint8Array(256), SZP = new Uint8Array(256), PAR = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let p = 1, v = i; for (let k = 0; k < 8; k++) { p ^= v & 1; v >>= 1; }
    PAR[i] = p ? FP : 0;
    SZ[i] = (i & 0x80 ? FS : 0) | (i === 0 ? FZ : 0) | (i & (F3 | F5));
    SZP[i] = SZ[i] | PAR[i];
  }
  const cpu = this;
  let A = 0xFF, F = 0xFF, B = 0, C = 0, D = 0, E = 0, H = 0, L = 0;
  let A_ = 0, F_ = 0, B_ = 0, C_ = 0, D_ = 0, E_ = 0, H_ = 0, L_ = 0;
  let IX = 0xFFFF, IY = 0xFFFF, SP = 0xFFFF, PC = 0, I = 0, R = 0, IFF1 = 0, IFF2 = 0, IM = 0, halted = 0;
  let eiDelay = 0, WZ = 0;

  const rw = a => rd(a) | (rd((a + 1) & 0xFFFF) << 8);
  const ww = (a, v) => { wr(a, v & 0xFF); wr((a + 1) & 0xFFFF, (v >> 8) & 0xFF); };
  const fetch = () => { const v = rd(PC); PC = (PC + 1) & 0xFFFF; return v; };
  const fetchw = () => { const v = rw(PC); PC = (PC + 2) & 0xFFFF; return v; };
  const push = v => { SP = (SP - 1) & 0xFFFF; wr(SP, (v >> 8) & 0xFF); SP = (SP - 1) & 0xFFFF; wr(SP, v & 0xFF); };
  const pop = () => { const v = rw(SP); SP = (SP + 2) & 0xFFFF; return v; };
  const sd = v => (v & 0x80 ? v - 256 : v);

  // ALU
  function add8(v, c) { const r = A + v + c; F = SZ[r & 0xFF] | ((r >> 8) & FC) | ((A ^ v ^ r) & FH) | ((((A ^ ~v) & (A ^ r)) & 0x80) ? FP : 0); A = r & 0xFF; }
  function sub8(v, c) { const r = A - v - c; F = SZ[r & 0xFF] | ((r >> 8) & FC) | FN | ((A ^ v ^ r) & FH) | ((((A ^ v) & (A ^ r)) & 0x80) ? FP : 0); A = r & 0xFF; }
  function cp8(v) { const r = A - v; F = (SZ[r & 0xFF] & ~(F3 | F5)) | (v & (F3 | F5)) | ((r >> 8) & FC) | FN | ((A ^ v ^ r) & FH) | ((((A ^ v) & (A ^ r)) & 0x80) ? FP : 0); }
  function and8(v) { A &= v; F = SZP[A] | FH; }
  function xor8(v) { A = (A ^ v) & 0xFF; F = SZP[A]; }
  function or8(v) { A = (A | v) & 0xFF; F = SZP[A]; }
  function inc8(v) { const r = (v + 1) & 0xFF; F = (F & FC) | SZ[r] | (r === 0x80 ? FP : 0) | ((r & 0x0F) === 0 ? FH : 0); return r; }
  function dec8(v) { const r = (v - 1) & 0xFF; F = (F & FC) | SZ[r] | FN | (r === 0x7F ? FP : 0) | ((r & 0x0F) === 0x0F ? FH : 0); return r; }
  function alu(op, v) {
    switch (op) { case 0: add8(v, 0); break; case 1: add8(v, F & FC); break; case 2: sub8(v, 0); break; case 3: sub8(v, F & FC); break;
      case 4: and8(v); break; case 5: xor8(v); break; case 6: or8(v); break; case 7: cp8(v); break; }
  }
  function add16(a, b) { const r = a + b; F = (F & (FS | FZ | FP)) | ((r >> 16) & FC) | (((a ^ b ^ r) >> 8) & FH) | ((r >> 8) & (F3 | F5)); WZ = (a + 1) & 0xFFFF; return r & 0xFFFF; }
  function adc16(v) { const hl = (H << 8) | L; const r = hl + v + (F & FC); F = ((r >> 8) & (FS | F3 | F5)) | ((r & 0xFFFF) ? 0 : FZ) | ((r >> 16) & FC) | (((hl ^ v ^ r) >> 8) & FH) | ((((hl ^ ~v) & (hl ^ r)) & 0x8000) ? FP : 0); H = (r >> 8) & 0xFF; L = r & 0xFF; }
  function sbc16(v) { const hl = (H << 8) | L; const r = hl - v - (F & FC); F = ((r >> 8) & (FS | F3 | F5)) | ((r & 0xFFFF) ? 0 : FZ) | ((r >> 16) & FC) | FN | (((hl ^ v ^ r) >> 8) & FH) | ((((hl ^ v) & (hl ^ r)) & 0x8000) ? FP : 0); H = (r >> 8) & 0xFF; L = r & 0xFF; }
  function rot(op, v) {
    let r, c;
    switch (op) {
      case 0: c = v >> 7; r = ((v << 1) | c) & 0xFF; break;            // RLC
      case 1: c = v & 1; r = (v >> 1) | (c << 7); break;               // RRC
      case 2: c = v >> 7; r = ((v << 1) | (F & FC)) & 0xFF; break;     // RL
      case 3: c = v & 1; r = (v >> 1) | ((F & FC) << 7); break;        // RR
      case 4: c = v >> 7; r = (v << 1) & 0xFF; break;                  // SLA
      case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;             // SRA
      case 6: c = v >> 7; r = ((v << 1) | 1) & 0xFF; break;            // SLL
      default: c = v & 1; r = v >> 1; break;                           // SRL
    }
    F = SZP[r] | c; return r;
  }
  function bit(n, v) { F = (F & FC) | FH | (SZP[v & (1 << n)] & ~(F3 | F5)) | (v & (F3 | F5)); }
  function daa() {
    let a = A, cf = F & FC, hf = F & FH, nf = F & FN, diff = 0;
    if (hf || (a & 0x0F) > 9) diff |= 0x06;
    if (cf || a > 0x99) { diff |= 0x60; cf = FC; }
    let h;
    if (nf) { h = hf && (a & 0x0F) < 6 ? FH : 0; a = (a - diff) & 0xFF; }
    else { h = (a & 0x0F) > 9 ? FH : 0; a = (a + diff) & 0xFF; }
    A = a; F = SZP[a] | cf | h | nf;
  }
  // register access by index (0 B,1 C,2 D,3 E,4 H,5 L,6 (HL),7 A); xy: 0 none, 1 IX, 2 IY
  function getr(r, xy) {
    switch (r) { case 0: return B; case 1: return C; case 2: return D; case 3: return E;
      case 4: return xy === 1 ? IX >> 8 : xy === 2 ? IY >> 8 : H;
      case 5: return xy === 1 ? IX & 0xFF : xy === 2 ? IY & 0xFF : L;
      case 7: return A; }
  }
  function setr(r, v, xy) {
    switch (r) { case 0: B = v; break; case 1: C = v; break; case 2: D = v; break; case 3: E = v; break;
      case 4: if (xy === 1) IX = (IX & 0xFF) | (v << 8); else if (xy === 2) IY = (IY & 0xFF) | (v << 8); else H = v; break;
      case 5: if (xy === 1) IX = (IX & 0xFF00) | v; else if (xy === 2) IY = (IY & 0xFF00) | v; else L = v; break;
      case 7: A = v; break; }
  }
  const getHL = xy => xy === 1 ? IX : xy === 2 ? IY : (H << 8) | L;
  const setHL = (v, xy) => { if (xy === 1) IX = v; else if (xy === 2) IY = v; else { H = v >> 8; L = v & 0xFF; } };
  function getrp(p, xy) { switch (p) { case 0: return (B << 8) | C; case 1: return (D << 8) | E; case 2: return getHL(xy); default: return SP; } }
  function setrp(p, v, xy) { v &= 0xFFFF; switch (p) { case 0: B = v >> 8; C = v & 0xFF; break; case 1: D = v >> 8; E = v & 0xFF; break; case 2: setHL(v, xy); break; default: SP = v; } }
  function getrp2(p, xy) { return p === 3 ? (A << 8) | F : getrp(p, xy); }
  function setrp2(p, v, xy) { if (p === 3) { A = (v >> 8) & 0xFF; F = v & 0xFF; } else setrp(p, v, xy); }
  function cond(c) {
    switch (c) { case 0: return !(F & FZ); case 1: return !!(F & FZ); case 2: return !(F & FC); case 3: return !!(F & FC);
      case 4: return !(F & FP); case 5: return !!(F & FP); case 6: return !(F & FS); default: return !!(F & FS); }
  }
  const incR = () => { R = (R & 0x80) | ((R + 1) & 0x7F); };

  function execCB(xy, d) {
    // xy != 0: DDCB/FDCB with displacement d already fetched
    const op = fetch();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    let addr, v;
    if (xy) { addr = (getHL(xy) + d) & 0xFFFF; v = rd(addr); WZ = addr; }
    else { incR(); v = z === 6 ? rd((H << 8) | L) : getr(z, 0); }
    if (x === 0) {
      const r = rot(y, v);
      if (xy) { wr(addr, r); if (z !== 6) setr(z, r, 0); return 23; }
      if (z === 6) { wr((H << 8) | L, r); return 15; } setr(z, r, 0); return 8;
    }
    if (x === 1) {
      bit(y, v);
      if (xy) { F = (F & ~(F3 | F5)) | ((addr >> 8) & (F3 | F5)); return 20; }
      if (z === 6) { F = (F & ~(F3 | F5)) | ((WZ >> 8) & (F3 | F5)); return 12; }
      return 8;
    }
    const r = x === 2 ? v & ~(1 << y) : v | (1 << y);
    if (xy) { wr(addr, r); if (z !== 6) setr(z, r, 0); return 23; }
    if (z === 6) { wr((H << 8) | L, r); return 15; } setr(z, r, 0); return 8;
  }

  function execED() {
    const op = fetch(); incR();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    if (x === 1) {
      switch (z) {
        case 0: { const v = inp((B << 8) | C); if (y !== 6) setr(y, v, 0); F = (F & FC) | SZP[v]; return 12; }
        case 1: outp((B << 8) | C, y === 6 ? 0 : getr(y, 0)); return 12;
        case 2: if (q === 0) sbc16(getrp(p, 0)); else adc16(getrp(p, 0)); return 15;
        case 3: { const a = fetchw(); if (q === 0) ww(a, getrp(p, 0)); else setrp(p, rw(a), 0); return 20; }
        case 4: { const v = A; A = 0; sub8(v, 0); return 8; }
        case 5: PC = pop(); IFF1 = IFF2; return 14;
        case 6: IM = [0, 0, 1, 2][y & 3]; return 8;
        case 7:
          switch (y) {
            case 0: I = A; return 9;
            case 1: R = A; return 9;
            case 2: A = I; F = (F & FC) | SZ[A] | (IFF2 ? FP : 0); return 9;
            case 3: A = R; F = (F & FC) | SZ[A] | (IFF2 ? FP : 0); return 9;
            case 4: { const hl = (H << 8) | L, m = rd(hl); wr(hl, ((A << 4) | (m >> 4)) & 0xFF); A = (A & 0xF0) | (m & 0x0F); F = (F & FC) | SZP[A]; return 18; } // RRD
            case 5: { const hl = (H << 8) | L, m = rd(hl); wr(hl, ((m << 4) | (A & 0x0F)) & 0xFF); A = (A & 0xF0) | (m >> 4); F = (F & FC) | SZP[A]; return 18; } // RLD
            default: return 8;
          }
      }
    }
    if (x === 2 && z <= 3 && y >= 4) {
      const inc = (y & 1) ? -1 : 1, rep = y >= 6;
      let hl = (H << 8) | L, de = (D << 8) | E, bc = (B << 8) | C;
      if (z === 0) { // LDI/LDD
        const v = rd(hl); wr(de, v); hl = (hl + inc) & 0xFFFF; de = (de + inc) & 0xFFFF; bc = (bc - 1) & 0xFFFF;
        const n = (v + A) & 0xFF;
        F = (F & (FS | FZ | FC)) | (bc ? FP : 0) | (n & F3) | ((n << 4) & F5);
        H = hl >> 8; L = hl & 0xFF; D = de >> 8; E = de & 0xFF; B = bc >> 8; C = bc & 0xFF;
        if (rep && bc) { PC = (PC - 2) & 0xFFFF; return 21; } return 16;
      }
      if (z === 1) { // CPI/CPD
        const v = rd(hl), r = (A - v) & 0xFF; hl = (hl + inc) & 0xFFFF; bc = (bc - 1) & 0xFFFF;
        const h = (A ^ v ^ r) & FH; const n = (r - (h ? 1 : 0)) & 0xFF;
        F = (F & FC) | FN | (SZ[r] & (FS | FZ)) | h | (bc ? FP : 0) | (n & F3) | ((n << 4) & F5);
        H = hl >> 8; L = hl & 0xFF; B = bc >> 8; C = bc & 0xFF;
        if (rep && bc && r) { PC = (PC - 2) & 0xFFFF; return 21; } return 16;
      }
      if (z === 2) { // INI/IND
        const v = inp((B << 8) | C); wr(hl, v); hl = (hl + inc) & 0xFFFF; B = (B - 1) & 0xFF;
        const k = v + ((C + inc) & 0xFF);
        F = SZ[B] | (v & 0x80 ? FN : 0) | (k > 255 ? FH | FC : 0) | PAR[(k & 7) ^ B]; H = hl >> 8; L = hl & 0xFF;
        if (rep && B) { PC = (PC - 2) & 0xFFFF; return 21; } return 16;
      }
      // OUTI/OUTD (B decremented before output)
      const v = rd(hl); B = (B - 1) & 0xFF; outp((B << 8) | C, v); hl = (hl + inc) & 0xFFFF;
      const k = v + (hl & 0xFF);
      F = SZ[B] | (v & 0x80 ? FN : 0) | (k > 255 ? FH | FC : 0) | PAR[(k & 7) ^ B]; H = hl >> 8; L = hl & 0xFF;
      if (rep && B) { PC = (PC - 2) & 0xFFFF; return 21; } return 16;
    }
    return 8; // NOP-like
  }

  function exec(xy) {
    const op = fetch();
    if (!xy) incR(); // prefix already incremented R
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    if (x === 1) {
      if (op === 0x76) { halted = 1; PC = (PC - 1) & 0xFFFF; return 4; }
      if (z === 6) { // LD r,(HL)
        let a; if (xy) { a = (getHL(xy) + sd(fetch())) & 0xFFFF; setr(y, rd(a), 0); return 19; }
        setr(y, rd((H << 8) | L), 0); return 7;
      }
      if (y === 6) { let a; if (xy) { a = (getHL(xy) + sd(fetch())) & 0xFFFF; wr(a, getr(z, 0)); return 19; } wr((H << 8) | L, getr(z, 0)); return 7; }
      setr(y, getr(z, xy), xy); return xy ? 8 : 4;
    }
    if (x === 2) {
      let v; if (z === 6) { if (xy) { v = rd((getHL(xy) + sd(fetch())) & 0xFFFF); alu(y, v); return 19; } v = rd((H << 8) | L); alu(y, v); return 7; }
      alu(y, getr(z, xy)); return xy ? 8 : 4;
    }
    if (x === 0) {
      switch (z) {
        case 0:
          switch (y) {
            case 0: return 4;
            case 1: { let t = A; A = A_; A_ = t; t = F; F = F_; F_ = t; return 4; }
            case 2: { const d = sd(fetch()); B = (B - 1) & 0xFF; if (B) { PC = (PC + d) & 0xFFFF; return 13; } return 8; }
            case 3: { const d = sd(fetch()); PC = (PC + d) & 0xFFFF; return 12; }
            default: { const d = sd(fetch()); if (cond(y - 4)) { PC = (PC + d) & 0xFFFF; return 12; } return 7; }
          }
        case 1:
          if (q === 0) { setrp(p, fetchw(), xy); return 10; }
          setHL(add16(getHL(xy), getrp(p, xy)), xy); return 11;
        case 2:
          switch (y) {
            case 0: wr((B << 8) | C, A); return 7;
            case 1: A = rd((B << 8) | C); return 7;
            case 2: wr((D << 8) | E, A); return 7;
            case 3: A = rd((D << 8) | E); return 7;
            case 4: ww(fetchw(), getHL(xy)); return 16;
            case 5: setHL(rw(fetchw()), xy); return 16;
            case 6: wr(fetchw(), A); return 13;
            default: A = rd(fetchw()); return 13;
          }
        case 3: setrp(p, getrp(p, xy) + (q ? -1 : 1), xy); return 6;
        case 4: case 5: {
          const f = z === 4 ? inc8 : dec8;
          if (y === 6) { let a; if (xy) a = (getHL(xy) + sd(fetch())) & 0xFFFF; else a = (H << 8) | L; wr(a, f(rd(a))); return xy ? 23 : 11; }
          setr(y, f(getr(y, xy)), xy); return 4;
        }
        case 6: {
          if (y === 6) { let a; if (xy) { a = (getHL(xy) + sd(fetch())) & 0xFFFF; wr(a, fetch()); return 19; } wr((H << 8) | L, fetch()); return 10; }
          setr(y, fetch(), xy); return 7;
        }
        case 7:
          switch (y) {
            case 0: { const c = A >> 7; A = ((A << 1) | c) & 0xFF; F = (F & (FS | FZ | FP)) | (A & (F3 | F5)) | c; return 4; }
            case 1: { const c = A & 1; A = (A >> 1) | (c << 7); F = (F & (FS | FZ | FP)) | (A & (F3 | F5)) | c; return 4; }
            case 2: { const c = A >> 7; A = ((A << 1) | (F & FC)) & 0xFF; F = (F & (FS | FZ | FP)) | (A & (F3 | F5)) | c; return 4; }
            case 3: { const c = A & 1; A = (A >> 1) | ((F & FC) << 7); F = (F & (FS | FZ | FP)) | (A & (F3 | F5)) | c; return 4; }
            case 4: daa(); return 4;
            case 5: A = (~A) & 0xFF; F = (F & (FS | FZ | FP | FC)) | FH | FN | (A & (F3 | F5)); return 4;
            case 6: F = (F & (FS | FZ | FP)) | FC | (A & (F3 | F5)); return 4;
            default: F = ((F & (FS | FZ | FP)) | ((F & FC) ? FH : 0) | (A & (F3 | F5)) | ((F & FC) ^ FC)); return 4;
          }
      }
    }
    // x === 3
    switch (z) {
      case 0: if (cond(y)) { PC = pop(); return 11; } return 5;
      case 1:
        if (q === 0) { setrp2(p, pop(), xy); return 10; }
        switch (p) {
          case 0: PC = pop(); return 10;
          case 1: { let t; t = B; B = B_; B_ = t; t = C; C = C_; C_ = t; t = D; D = D_; D_ = t; t = E; E = E_; E_ = t; t = H; H = H_; H_ = t; t = L; L = L_; L_ = t; return 4; }
          case 2: PC = getHL(xy); return 4;
          default: SP = getHL(xy); return 6;
        }
      case 2: { const a = fetchw(); if (cond(y)) PC = a; return 10; }
      case 3:
        switch (y) {
          case 0: PC = fetchw(); return 10;
          case 1: if (xy) { const d = sd(fetch()); return execCB(xy, d); } return execCB(0, 0);
          case 2: outp((A << 8) | fetch(), A); return 11;
          case 3: A = inp((A << 8) | fetch()); return 11;
          case 4: { const v = rw(SP); ww(SP, getHL(xy)); setHL(v, xy); return 19; }
          case 5: { let t = D; D = H; H = t; t = E; E = L; L = t; return 4; }
          case 6: IFF1 = IFF2 = 0; return 4;
          default: IFF1 = IFF2 = 1; eiDelay = 1; return 4;
        }
      case 4: { const a = fetchw(); if (cond(y)) { push(PC); PC = a; return 17; } return 10; }
      case 5:
        if (q === 0) { push(getrp2(p, xy)); return 11; }
        switch (p) {
          case 0: { const a = fetchw(); push(PC); PC = a; return 17; }
          case 1: incR(); return 4 + exec(1);
          case 2: return execED() + 4;
          default: incR(); return 4 + exec(2);
        }
      case 6: alu(y, fetch()); return 7;
      default: push(PC); PC = y * 8; return 11;
    }
  }

  this.step = function () {
    if (halted) { incR(); return 4; }
    const pend = eiDelay;
    const t = exec(0);
    if (pend) eiDelay = 0;
    return t;
  };
  this.interrupt = function (vector) {
    if (!IFF1 || eiDelay) return 0;
    if (halted) { halted = 0; PC = (PC + 1) & 0xFFFF; }
    IFF1 = IFF2 = 0; incR();
    if (IM === 2) { push(PC); PC = rw(((I << 8) | (vector & 0xFF)) & 0xFFFF); return 19; }
    push(PC); PC = 0x38; return 13;
  };
  this.clearEI = function () { eiDelay = 0; };
  this.nmi = function () { if (halted) { halted = 0; PC = (PC + 1) & 0xFFFF; } IFF1 = 0; push(PC); PC = 0x66; return 11; };
  this.reset = function () { PC = 0; IFF1 = IFF2 = 0; IM = 0; I = 0; R = 0; halted = 0; SP = 0xFFFF; A = F = 0xFF; };
  Object.defineProperties(this, {
    pc: { get: () => PC, set: v => { PC = v & 0xFFFF; } }, sp: { get: () => SP, set: v => { SP = v & 0xFFFF; } },
    a: { get: () => A, set: v => { A = v & 0xFF; } }, f: { get: () => F, set: v => { F = v & 0xFF; } },
    b: { get: () => B, set: v => { B = v & 0xFF; } }, c: { get: () => C, set: v => { C = v & 0xFF; } },
    d: { get: () => D, set: v => { D = v & 0xFF; } }, e: { get: () => E, set: v => { E = v & 0xFF; } },
    h: { get: () => H, set: v => { H = v & 0xFF; } }, l: { get: () => L, set: v => { L = v & 0xFF; } },
    hl: { get: () => (H << 8) | L, set: v => { H = (v >> 8) & 0xFF; L = v & 0xFF; } },
    de: { get: () => (D << 8) | E, set: v => { D = (v >> 8) & 0xFF; E = v & 0xFF; } },
    bc: { get: () => (B << 8) | C, set: v => { B = (v >> 8) & 0xFF; C = v & 0xFF; } },
    ix: { get: () => IX, set: v => { IX = v & 0xFFFF; } }, iy: { get: () => IY, set: v => { IY = v & 0xFFFF; } },
    im: { get: () => IM, set: v => { IM = v; } }, iff1: { get: () => IFF1, set: v => { IFF1 = IFF2 = v; } },
    i: { get: () => I, set: v => { I = v & 0xFF; } }, r: { get: () => R, set: v => { R = v & 0xFF; } },
    halted: { get: () => halted },
  });
  this.getState = () => [A, F, B, C, D, E, H, L, A_, F_, B_, C_, D_, E_, H_, L_, IX, IY, SP, PC, I, R, IFF1, IFF2, IM, halted];
  this.setState = s => { [A, F, B, C, D, E, H, L, A_, F_, B_, C_, D_, E_, H_, L_, IX, IY, SP, PC, I, R, IFF1, IFF2, IM, halted] = s; };
}
root.Z80 = Z80;
if (typeof module !== 'undefined') module.exports = Z80;
})(typeof globalThis !== 'undefined' ? globalThis : this);
