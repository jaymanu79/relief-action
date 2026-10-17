"""Encoder for Relief Action's message text (word list + phrase list), matching the Z80 decoder at &63AB.

Decoder rules (from the disassembly):
  phrase scan: phrases are separated by an end mark; phrase n is the n-th after the zone start (phrase 0 first)
  byte 0x81-0xFF : word (id = b & 0x7F, from the list starting after &5446), followed by a space;
                   the phrase ends if the next byte is 0x20 (that byte is the end mark)
  byte 0x80 xx   : word 128+ (unused here)
  byte 0x00 xx   : character code (xx & 0x1F) + 0x20 (digits, bullet, colon), flags of xx apply
  byte 0x01-0x7F : character code (b & 0x1F); codes 0x1B ' 0x1C - 0x1D , first remove the preceding
                   character (the space); code 0x1E removes it and outputs nothing
                   bit 6: a space follows, bit 5 (with bit 6): end of phrase
  words: character codes, the last one with bit 7 set
Font codes: 0 space, 1-26 A-Z, 27 ', 28 diamond (hyphen), 29 comma, 30 ?, 31 !, 32 bullet, 33-42 0-9, 43 colon.
"""
from collections import Counter

CODE = {' ': 0, "'": 27, '-': 28, ',': 29, '?': 30, '!': 31, '#': 32, ':': 43}
for i in range(26): CODE[chr(65 + i)] = i + 1
for i in range(10): CODE[str(i)] = 33 + i
GLUE = {27, 28, 29}            # these codes eat the preceding space
ELLIPSIS = '...'               # word made of three bullets
CODEWORD = '{CODE}'            # placeholder rewritten by the game (6 letters at &54CC)


def tokens(text):
    return text.split()


def chars(tok):
    return [CODE[c] for c in tok]


def literal_bytes(tok, last):
    """Bytes for a token written letter by letter; it ends with a space (or the phrase end if last)."""
    cs = chars(tok); out = []
    for k, c in enumerate(cs):
        nxt = cs[k + 1] if k + 1 < len(cs) else None
        flags = 0
        if nxt in GLUE: flags = 0x40                      # the glue char will eat this space
        if nxt is None: flags = 0x60 if last else 0x40
        if c >= 32: out += [0x00, (c - 0x20) | flags]
        else:
            assert c != 30, 'a ? can only come from the word list'
            out.append(c | flags)
    return out


def literal_ok(tok):
    return '?' not in tok and tok not in (ELLIPSIS, CODEWORD)


def word_bytes(w):
    cs = [0x20, 0x20, 0x20] if w == ELLIPSIS else ([11, 1, 1, 1, 1, 1] if w == CODEWORD else chars(w))
    return cs[:-1] + [cs[-1] | 0x80]


def split_q(tok):
    """'WHAT?' -> ['WHAT', '?'] glued: the base is literal or a word, then the ? word."""
    if tok.endswith('?') and len(tok) > 1: return tok[:-1], '?'
    return tok, None


def encode_phrase(text, dic):
    toks = tokens(text); out = []
    for i, tok in enumerate(toks):
        last = i == len(toks) - 1
        base, q = split_q(tok)
        if base in dic:
            out.append(0x80 | dic[base])
            if q: out += [0x1E, 0x80 | dic['?']]
            if last: out.append(0x20)
        else:
            if q:
                bs = literal_bytes(base, False)
                # drop the trailing space of the literal: the ? word follows directly
                if bs[-1] == 0x00: raise ValueError
                if bs[-2:-1] == [0x00]: bs[-1] &= ~0x60
                else: bs[-1] &= ~0x60
                out += bs + [0x80 | dic['?']]
                if last: out.append(0x20)
            else:
                out += literal_bytes(base, last)
    return out


def decode_phrase(blob_words, data):
    """Python port of the Z80 decoder, for one phrase's bytes."""
    buf = []
    i = 0
    while True:
        a = data[i]
        if a & 0x80:
            assert a != 0x80
            w = blob_words[a & 0x7F]
            buf += [c & 0x7F for c in w] + [0]
            i += 1
            if i >= len(data) or data[i] == 0x20: return buf
            continue
        if a == 0:
            i += 1; x = data[i]; c = (x & 0x1F) + 0x20
        else:
            c = a & 0x1F
            if c == 0x1E:
                buf.pop(); i += 1; continue
            if c in GLUE: buf.pop()
            x = a
        buf.append(c)
        if x & 0x40: buf.append(0)
        if x & 0x20: return buf
        i += 1


def build(phrases, budget, code_offset=133, max_words=127):
    """phrases: list (index = id, [0] unused), returns (blob, word_ids, phrase_start_offset)."""
    toks = Counter()
    for t in phrases[1:]:
        for tok in tokens(t):
            b, q = split_q(tok); toks[b] += 1
            if q: toks['?'] += 1
    forced = {'?', ELLIPSIS, CODEWORD} | {b for b in toks if not literal_ok(b)}
    def lit_len(t): return sum(2 if c >= 32 else 1 for c in chars(t)) if literal_ok(t) else 10 ** 6
    cand = []
    for t, f in toks.items():
        if t in forced: continue
        L = lit_len(t); save = f * (L - 1) - len(word_bytes(t))
        if save > 0: cand.append((save, t))
    cand.sort(reverse=True)
    words = [w for w in forced if w in toks or w == CODEWORD]
    for s, t in cand:
        if len(words) >= max_words: break
        words.append(t)
    # order: the code word must start exactly code_offset bytes into the list -> subset sum for the words before it
    others = [w for w in words if w != CODEWORD]
    lens = {w: len(word_bytes(w)) for w in others}
    reach = {0: []}
    for w in others:
        for s, lst in list(reach.items()):
            n = s + lens[w]
            if n <= code_offset and n not in reach: reach[n] = lst + [w]
    if code_offset in reach: before = reach[code_offset]; pad = []
    else:
        best = max(s for s in reach if s <= code_offset - 1); before = reach[best]
        pad = ['Z' * (code_offset - best)]           # filler word, never used
    after = [w for w in others if w not in before]
    order = before + pad + [CODEWORD] + after
    assert len(order) <= max_words, len(order)
    dic = {w: i + 1 for i, w in enumerate(order)}
    wbytes = []
    for w in order: wbytes += word_bytes(w)
    assert sum(len(word_bytes(w)) for w in before + pad) == code_offset
    pbytes = [0x60]                                   # phrase 0 (unused), as in the original
    for t in phrases[1:]: pbytes += encode_phrase(t, dic)
    blob = bytes(wbytes + pbytes)
    # self-check with the Python decoder
    wl = [None] + [word_bytes(w) for w in order]
    off = 1
    pos = len(wbytes) + 1
    for pid, t in enumerate(phrases[1:], 1):
        enc = encode_phrase(t, dic)
        got = decode_phrase(wl, enc)
        want = []
        for k, tok in enumerate(tokens(t)):
            want += [0x20, 0x20, 0x20] if tok == ELLIPSIS else ([11, 1, 1, 1, 1, 1] if tok == CODEWORD else chars(tok))
            want.append(0)
        assert got == want, (pid, t, got, want)
    return blob, dic, len(wbytes), order
