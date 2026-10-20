"""Encoder for EPILOG.BIN's text (decoder at &660B): same byte format as the game, but only ' and - glue,
and , ? are ordinary characters. Font: 27 ' 28 - 29 , 30 ? 31 . 33 \" 34-42 1-9 43 :"""
from collections import Counter
CODE = {' ': 0, "'": 27, '-': 28, ',': 29, '?': 30, '.': 31, '"': 33, ':': 43}
for i in range(26): CODE[chr(65 + i)] = i + 1
for i in range(1, 10): CODE[str(i)] = 33 + i
GLUE = {27, 28}
def chars(t): return [CODE[c] for c in t]
def lit(tok, last):
    cs = chars(tok); out = []
    for k, c in enumerate(cs):
        nxt = cs[k + 1] if k + 1 < len(cs) else None
        fl = 0x40 if nxt in GLUE else 0
        if nxt is None: fl = 0x60 if last else 0x40
        out += [0x00, (c - 0x20) | fl] if c >= 32 else [c | fl]
    return out
def wbytes(w): cs = chars(w); return cs[:-1] + [cs[-1] | 0x80]
def enc_line(line, dic):
    toks = line.split()
    if not toks: return [0x60]
    out = []
    for i, t in enumerate(toks):
        last = i == len(toks) - 1
        if t in dic:
            out.append(0x80 | dic[t])
            if last: out.append(0x20)
        else: out += lit(t, last)
    return out
def dec_line(wl, data):
    buf = []; i = 0
    while True:
        a = data[i]
        if a & 0x80:
            buf += [c & 0x7F for c in wl[a & 0x7F]] + [0]; i += 1
            if data[i] == 0x20: return buf
            continue
        if a == 0: i += 1; x = data[i]; c = (x & 0x1F) + 0x20
        else:
            c = a & 0x1F; x = a
            if c in GLUE: buf.pop()
        buf.append(c)
        if x & 0x40: buf.append(0)
        if x & 0x20: return buf
        i += 1
def build(lines, max_words=127):
    cnt = Counter(t for l in lines for t in l.split())
    def L(t): return sum(2 if c >= 32 else 1 for c in chars(t))
    cand = sorted(((f * (L(t) - 1) - len(wbytes(t)), t) for t, f in cnt.items()), reverse=True)
    order = [t for s, t in cand if s > 0][:max_words]
    dic = {w: i + 1 for i, w in enumerate(order)}
    ph = []
    for l in lines: ph += enc_line(l, dic)
    wl = [None] + [wbytes(w) for w in order]
    for l in lines:
        want = []
        for t in l.split(): want += chars(t) + [0]
        got = dec_line(wl, enc_line(l, dic))
        if not l.split(): want = [0, 0]
        assert got == want, (l, got, want)
    words = [0x80] + [b for w in order for b in wbytes(w)]   # 0x80: the terminator the base pointer sits on
    return bytes(ph), bytes(words), order
