"""Minimal Amstrad CPC DSK (standard / extended) reader-writer for DATA-format disks."""
import struct

class Disk:
    def __init__(self, data=None):
        self.tracks = {}   # (t,s) -> list of [ (C,H,R,N), bytes ]
        if data: self.parse(data)
    def parse(self, d):
        ext = d[:8] == b'EXTENDED'
        nt, ns = d[0x30], d[0x31]
        off = 0x100
        tsizes = list(d[0x34:0x34 + nt * ns]) if ext else [None] * (nt * ns)
        std = struct.unpack_from('<H', d, 0x32)[0]
        for i in range(nt * ns):
            size = tsizes[i] * 256 if ext else std
            if size == 0: self.tracks[(i // ns, i % ns)] = []; continue
            ti = d[off:off + size]
            assert ti[:10] == b'Track-Info', (i, ti[:12])
            n = ti[0x15]; secs = []; p = 0x100
            for k in range(n):
                C, H, R, N, s1, s2, alen = struct.unpack_from('<BBBBBBH', ti, 0x18 + 8 * k)
                ln = alen if ext else (128 << N)
                secs.append([(C, H, R, N), bytearray(ti[p:p + ln]), (s1, s2)]); p += ln
            self.tracks[(i // ns, i % ns)] = secs
            off += size
    def fmt(self):
        ids = [x[0][2] for x in self.tracks[(0, 0)]]
        return (0xC1, 0) if min(ids) >= 0xC1 else (0x41, 2)   # DATA or SYSTEM/VENDOR
    def sector(self, t, r):
        for s in self.tracks[(t, 0)]:
            if s[0][2] == r: return s[1]
        raise KeyError((t, r))
    # DATA format: 9 sectors &C1-&C9 per track, 1K blocks, directory = blocks 0-1
    def blocksec(self, b):
        base, off = self.fmt(); lin = b * 2
        return [(off + lin // 9, base + lin % 9), (off + (lin + 1) // 9, base + (lin + 1) % 9)]
    def dir(self):
        raw = b''.join(bytes(self.sector(*self.blocksec(k // 2)[k % 2])) for k in range(4))
        return [raw[i:i + 32] for i in range(0, 2048, 32)]
    def files(self):
        out = {}
        for e in self.dir():
            if e[0] == 0xE5: continue
            name = (e[1:9].decode('latin1').rstrip() + '.' + bytes(c & 0x7F for c in e[9:12]).decode('latin1').rstrip())
            out.setdefault(name, []).append(e)
        return out
    def read(self, name):
        ents = sorted(self.files()[name], key=lambda e: e[12])
        data = b''
        for e in ents:
            rc = e[15]; blocks = [b for b in e[16:32] if b]
            chunk = b''.join(bytes(self.sector(t, r)) for b in blocks for (t, r) in self.blocksec(b))
            data += chunk[:rc * 128]
        return data
    def used_blocks(self):
        u = {0, 1}
        for e in self.dir():
            if e[0] != 0xE5: u.update(b for b in e[16:32] if b)
        return u
    def write_file(self, name, data):
        base, ext = (name.upper().split('.') + [''])[:2]
        # drop existing entries
        raw = bytearray(b''.join(bytes(self.sector(*self.blocksec(k // 2)[k % 2])) for k in range(4)))
        for i in range(0, 2048, 32):
            e = raw[i:i + 32]
            if e[0] != 0xE5 and e[1:9].decode('latin1').rstrip() == base and bytes(c & 0x7F for c in e[9:12]).decode('latin1').rstrip() == ext:
                raw[i] = 0xE5
        self._setdir(raw)
        used = self.used_blocks(); free = [b for b in range(2, 180 if self.fmt()[0] == 0xC1 else 171) if b not in used]
        nblocks = (len(data) + 1023) // 1024
        assert nblocks <= len(free), 'disk full'
        blocks = free[:nblocks]
        padded = data + b'\x1a' * (nblocks * 1024 - len(data))
        for k, b in enumerate(blocks):
            for j, (t, r) in enumerate(self.blocksec(b)):
                self.sector(t, r)[:] = padded[k * 1024 + j * 512: k * 1024 + j * 512 + 512]
        recs = (len(data) + 127) // 128
        ext_i = 0
        slots = [i for i in range(0, 2048, 32) if raw[i] == 0xE5]
        while True:
            bl = blocks[ext_i * 16:(ext_i + 1) * 16]
            rc = min(128, recs - ext_i * 128)
            e = bytearray(32); e[0] = 0
            e[1:9] = base.ljust(8).encode(); e[9:12] = ext.ljust(3).encode()
            e[12] = ext_i; e[15] = rc
            for k, b in enumerate(bl): e[16 + k] = b
            i = slots.pop(0); raw[i:i + 32] = e
            ext_i += 1
            if ext_i * 128 >= recs: break
        self._setdir(raw)
    def _setdir(self, raw):
        for k in range(4): self.sector(*self.blocksec(k // 2)[k % 2])[:] = raw[k * 512:(k + 1) * 512]
    def dump(self):
        # always written as EXTENDED
        keys = sorted(self.tracks); nt = max(t for t, s in keys) + 1; ns = max(s for t, s in keys) + 1
        hdr = bytearray(256); hdr[:34] = b'EXTENDED CPC DSK File\r\nDisk-Info\r\n'; hdr[34:48] = b'dsktool.py    '
        hdr[0x30] = nt; hdr[0x31] = ns
        body = b''
        for i, key in enumerate(keys):
            secs = self.tracks[key]
            if not secs: hdr[0x34 + i] = 0; continue
            ti = bytearray(256); ti[:12] = b'Track-Info\r\n'; ti[0x10] = key[0]; ti[0x11] = key[1]
            ti[0x14] = 2; ti[0x15] = len(secs); ti[0x16] = 0x4E; ti[0x17] = 0xE5
            dat = b''
            for k, (chr_, buf, st) in enumerate(secs):
                struct.pack_into('<BBBBBBH', ti, 0x18 + 8 * k, *chr_, *st, len(buf)); dat += bytes(buf)
            tr = bytes(ti) + dat; tr += b'\0' * ((-len(tr)) % 256)
            hdr[0x34 + i] = len(tr) // 256; body += tr
        return bytes(hdr) + body

def amsdos_header(name, data, load, exec_=0, ftype=2):
    h = bytearray(128)
    base, ext = (name.upper().split('.') + [''])[:2]
    h[1:9] = base.ljust(8).encode(); h[9:12] = ext.ljust(3).encode()
    h[18] = ftype; struct.pack_into('<H', h, 21, load); h[23] = 0xFF
    struct.pack_into('<H', h, 24, len(data)); struct.pack_into('<H', h, 26, exec_)
    h[64:67] = struct.pack('<I', len(data))[:3]
    struct.pack_into('<H', h, 67, sum(h[:67]) & 0xFFFF)
    return bytes(h) + data
