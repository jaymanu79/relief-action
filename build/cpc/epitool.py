"""EPILOG.BIN text zone: phrases from &488A (one per screen line), then the word list (base pointer at &6672)."""
LOAD = 0x488A
def scan(m, start, count):
    hl = start; starts = []
    for k in range(count):
        starts.append(hl)
        while True:
            a = m[hl]; hl += 1
            if a & 0x80:
                if a == 0x80:
                    b = m[hl]; hl += 1
                    if b & 0x80: break
                    continue
                if m[hl] == 0x20: hl += 1; break
                continue
            if not (a & 0x40): continue
            if a & 0x20: break
    return starts, hl
def load():
    import os; f = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'data', 'EPILOG.BIN'), 'rb').read()
    hdr, body = f[:128], bytearray(f[128:128 + (f[24] | f[25] << 8)])
    return hdr, body
def at(body, a): return body[a - LOAD]
