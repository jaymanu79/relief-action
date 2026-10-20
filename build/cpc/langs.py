"""Per-language data for the CPC disk: text zone + verbs (loaded as files over the common stream), the few bytes
POKEd by the BASIC menu (monitor labels, 'yes' key), the epilogue text zone and the demo titles."""
import sys, re, json
import os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', '..', 'translations', 'tools'))
import textenc, epienc, epitool, epi_en, check
from phrases_cpc_en import P as P_EN
KEYS = {'Y': (5, 3), 'S': (7, 4), 'O': (4, 2), 'J': (5, 5), 'D': (7, 5), 'T': (6, 3), 'K': (4, 5), 'P': (3, 3), 'A': (8, 5), 'N': (5, 6)}
cod = lambda s: bytes(0x2B if c == ':' else 0 if c == ' ' else ord(c) - 64 for c in s)
TITLE_ADDR = [0x7769, 0x77DF, 0x7A55, 0x7AC2, 0x7AE4, 0x7B01, 0x7B18, 0x7B31, 0x7B44, 0x7B59]
TITLE_FR = ['PRESENTE', 'PRESENTE', 'REALISE PAR', 'COPYRIGHT MARS 87 LORICIELS', 'ANIMATION 3D TEMPS REEL', 'PLUS DE 50 SALLES', 'JOUABLE AU JOYSTICK', 'OPTION RELIEF', '-AVEC LUNETTES-', "UN GRAND JEU D'AVENTURE:"]
TITLE_X = [21, 21, 4, 3, 6, 6, 6, 6, 26, 4]
DF = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ\'-,?!.0123456789:'

def zone(phrases, verbs):
    blob, dic, wlen, order = textenc.build(phrases, 3940)
    assert len(blob) <= 0x63AB - 0x5447, len(blob)
    z = bytearray(blob + bytes(0x63AB - 0x5447 - len(blob))) + bytes([0x21]) + bytes([(0x5447 + wlen) & 0xFF, (0x5447 + wlen) >> 8])
    tab = bytearray(88)
    for i, w in enumerate(verbs):
        if w: tab[i * 8:i * 8 + 8] = bytes(ord(c) - 64 for c in w).ljust(8, b'\0')
    return bytes(z), bytes(tab + tab[:32]), len(blob)

def epilogue(lines, prompt):
    hdr, body = epitool.load()
    ph, words, order = epienc.build(lines)
    z1 = 0x5419 - 0x488A
    assert len(ph) + len(words) <= z1, len(ph) + len(words)
    out = bytearray(z1); out[0:len(ph)] = ph; out[len(ph):len(ph) + len(words)] = words
    base = 0x488A + len(ph)
    pr = bytes(epienc.CODE.get(c, ord(c) - 64) if c != ' ' else 0 for c in prompt.center(27))
    assert len(pr) == 27
    return bytes(out), (base & 0xFF, base >> 8), pr, len(ph) + len(words)

def demo_titles(titles):
    out = []
    for a, o, x0, n in zip(TITLE_ADDR, TITLE_FR, TITLE_X, titles):
        assert len(n) <= len(o), (o, n)
        x = x0
        if a == 0x7AC2: x = 3 + (len(o) - len(n)) // 2 * 2 // 2 * 1 if False else 6 if len(n) < len(o) else 3
        if a == 0x7B44: x = x0 + len(o) - len(n)
        out.append((a + 4, bytes([x]) + bytes(DF.index(c) for c in n.ljust(len(o)))))
    return out

def en():
    VERBS = ['EAT', 'DRINK', 'DROP', 'TAKE', None, 'USE', 'PUSH', 'SET', 'POUR', 'RELIEF', 'SLEEP']
    z, v, n = zone(P_EN, VERBS)
    ep = epilogue(epi_en.lines(), 'SPACE BAR FOR NEXT PAGE')
    titles = ['PRESENTS', 'PRESENTS', 'CREATED BY', 'COPYRIGHT 1987 LORICIELS', 'REAL TIME 3D ANIMATION', 'OVER 50 ROOMS', 'JOYSTICK CONTROL', 'RELIEF OPTION', '-WITH GLASSES-', 'A GREAT ADVENTURE GAME:']
    menu = dict(name='ENGLISH', language='Language', game='Game', demo='Demo', epilogue='Epilogue', inftime='Infinite time', sleeping='Sleeping monster', yes='YES', no='NO', loading='Loading')
    return dict(code='EN', zone=z, verbs=v, textbytes=n, labels=cod('MONITOR ') + b'\xff' + cod('S:EXIT   Z:ADDRESS') + b'\xff', key='Y',
                epi=ep, titles=demo_titles(titles), menu=menu)

def from_file(path, fallback):
    E = check.parse(path); code = E['meta.code']['tr'].upper()
    def cpctext(k, epi=False):
        e = E[k]
        if e.get('tr.cpc'): return e['tr.cpc']
        return check.cpc(e.get('tr') or e.get('en'), epilogue=epi) if not k.startswith(('verb.', 'menu.', 'demo.', 'cpc.', 'meta.')) else check.cpc(e.get('tr') or e.get('en'), colons=False)
    P = [None] + [cpctext('msg.%03d' % i) if (E['msg.%03d' % i].get('tr') or E['msg.%03d' % i].get('tr.cpc')) else fallback['P'][i] for i in range(1, 194)]
    verbs = []
    for i in range(11):
        if i == 4: verbs.append(None); continue
        verbs.append(re.sub('[^A-Z]', '', cpctext('verb.%02d' % ((i + 9) % 11 + 1)))[:8])
    z, v, n = zone(P, verbs)
    lines = []
    for sec, nl in check.LINES.items():
        ks = sorted((k for k in E if k.startswith('epi.%s.p' % sec)), key=lambda k: int(k.rsplit('p', 1)[1]))
        cp = E[ks[0]].get('tr.cpc')
        c = cp or check.cpc(' '.join(E[k].get('tr') or E[k]['en'] for k in ks), epilogue=True)
        c = ''.join(ch for ch in c if ch in check.EPI_FONT)
        for width in range(28, 39):
            L = check.wrap(c, width)
            if len(L) <= nl: break
        assert len(L) <= nl, (sec, len(L), nl)
        if sec == 'oxy': pass
        lines.append((sec, L + [''] * (nl - len(L))))
    out = [''] * 135; first = {s: f for s, f, n, t in epi_en.SECTIONS}
    for sec, L in lines: out[first[sec]:first[sec] + len(L)] = L
    ep = epilogue(out, cpctext('cpc.epilogue.prompt'))
    titles = [cpctext('demo.%02d' % i) for i in range(1, 10)]
    titles = titles[:1] + titles                       # 'presents' is shown twice
    asc = lambda s: check.cpc_menu(s)
    m = lambda k: asc(E[k].get('tr') or E[k]['en'])
    menu = dict(name=asc(E['meta.name']['tr']).upper(), language=m('menu.language'), game=m('menu.game'), demo=m('menu.demo'), epilogue=m('menu.epilogue'),
                inftime=m('menu.inftime'), sleeping=m('menu.sleeping'), yes=m('menu.yes'), no=m('menu.no'), loading=m('menu.loading'))
    lab = cpctext('cpc.monitor.title').ljust(8)[:8]; keys = cpctext('cpc.monitor.keys').ljust(18)[:18]
    return dict(code=code, zone=z, verbs=v, textbytes=n, labels=cod(lab) + b'\xff' + cod(keys) + b'\xff', key=cpctext('cpc.yes_key')[:1],
                epi=ep, titles=demo_titles(titles), menu=menu)
