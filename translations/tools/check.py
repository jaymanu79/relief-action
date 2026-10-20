#!/usr/bin/env python3
"""Checks a Relief Action translation file and shows what the CPC version will look like.

    python3 translations/tools/check.py translations/de.txt          summary and problems
    python3 translations/tools/check.py translations/de.txt --cpc    also prints every CPC text

Needs only Python 3 (no package to install)."""
import sys, os, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textenc, epienc

def parse(path):
    """-> {id: {'fr':..., 'en':..., 'tr':..., 'tr.cpc':..., 'notes': [...]}} in file order"""
    E, cur = {}, None
    for n, line in enumerate(open(path, encoding='utf-8-sig'), 1):
        line = line.rstrip('\n\r')
        if line.startswith('@'): cur = E.setdefault(line[1:].strip(), {'notes': [], 'line': n}); continue
        if cur is None or not line.strip(): continue
        if line.startswith('#'): cur['notes'].append(line[1:].strip()); continue
        m = re.match(r'(fr|en|tr|tr\.cpc):\s?(.*)$', line)
        if not m: raise SystemExit('%s:%d: line not understood: %r' % (path, n, line))
        cur[m.group(1)] = m.group(2).strip()
    return E

def text(e, cpc=False):
    """the translated text, or the English one when tr: is empty"""
    if cpc and e.get('tr.cpc'): return e['tr.cpc'], True
    return (e.get('tr') or e.get('en') or ''), False

SPECIAL = {'ß': 'SS', 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE', 'Æ': 'AE', 'Œ': 'OE', 'Ø': 'O', 'Å': 'A', 'Ł': 'L', 'Đ': 'D', 'Þ': 'TH'}
def cpc(s, epilogue=False, colons=True):
    """automatic CPC version: capitals, no accents, the game's punctuation"""
    s = re.sub(r'<[^>]*>', '', s)                                   # web markup (<em>...)
    s = s.replace('…', '...').replace(' — ', ' : ').replace('—', '-').replace('–', '-').replace('’', "'").replace('‘', "'")
    s = s.replace('«', '"').replace('»', '"').replace('“', '"').replace('”', '"').replace(';', ',').replace('¿', '').replace('¡', '')
    s = s.upper()
    s = ''.join(SPECIAL.get(c, c) for c in s)
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    s = s.replace('(', '').replace(')', '')
    if epilogue:
        s = s.replace('!', '.')                                      # no "!" in the epilogue font
        return re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\.{3,}', ' \x01 ', s)                              # the ellipsis is a word of its own
    s = re.sub(r'\.\s+(?=\S)', ' \x01 ', s)                         # a full stop inside a message becomes "..."
    s = s.replace('.', '').replace('"', '').replace('\x01', '...')
    if colons: s = re.sub(r'\s*:\s*', ' : ', s)
    return re.sub(r'\s+', ' ', s).strip()

GAME_FONT = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'-,?!:#{} ")
EPI_FONT = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'-,?.\": ")
LINES = {'oxy': 17, 'escape': 11, 'hunger': 12, 'alone': 24, 'wait': 7, 'silence': 14, 'rescue': 7, 'prison': 18, 'hero': 23}

def wrap(t, width):
    out, cur = [], ''
    for w in t.split():
        if not cur: cur = w
        elif len(cur) + 1 + len(w) <= width: cur += ' ' + w
        else: out.append(cur); cur = w
    return out + ([cur] if cur else [])

def main():
    path = sys.argv[1]; show = '--cpc' in sys.argv
    E = parse(path); problems = []; P = lambda id, msg: problems.append('%-22s line %4d  %s' % (id, E[id]['line'], msg))
    done = sum(1 for k, e in E.items() if e.get('tr')); total = len(E)
    lang = E.get('meta.name', {}).get('tr') or '?'
    print('%s: %s, %d of %d texts translated (%d%%)' % (os.path.basename(path), lang, done, total, 100 * done // max(1, total)))
    # placeholders kept
    for k, e in E.items():
        if not e.get('tr'): continue
        if re.findall(r'</?\w+>', e.get('fr', '')) != re.findall(r'</?\w+>', e['tr']): P(k, 'markup differs from the original: %s' % ' '.join(re.findall(r'</?\w+>', e.get('fr', ''))))
        for ph in set(re.findall(r'\{[A-Z0-9]+\}', e.get('en', ''))):
            if ph not in e['tr']: P(k, 'placeholder %s is missing' % ph)
        for code in set(re.findall(r'\b[A-Z]{3}\b', e.get('fr', ''))) & {'NMI', 'TPT', 'POL', 'ASS', 'DEC', 'DEP', 'INF', 'GOD', 'PRE', 'ARM', 'BUG', 'PST', 'HLP', 'LND'}:
            if code not in e['tr'].upper(): P(k, 'code %s is missing' % code)
    # CPC game messages, verbs and misc
    msgs = [None]
    for i in range(1, 194):
        e = E['msg.%03d' % i]; t, raw = text(e, True); c = t if raw else cpc(t)
        bad = sorted(set(re.sub(r'(?:^|(?<= ))\.\.\.(?= |$)', '', c)) - GAME_FONT)   # "..." alone is the game's ellipsis
        if bad: P('msg.%03d' % i, 'CPC font has no %s  (write a tr.cpc: line)' % ' '.join(bad)); c = ''.join(ch for ch in c if ch in GAME_FONT or ch == '.')
        if show: print('  msg.%03d  %s' % (i, c))
        msgs.append(c)
    try:
        blob, dic, wlen, order = textenc.build(msgs, 3940)
        print('CPC game messages: %d of 3940 bytes (%d left)' % (len(blob), 3940 - len(blob)))
        if len(blob) > 3940: problems.append('CPC game messages are %d bytes too long: shorten some messages (tr.cpc: lines)' % (len(blob) - 3940))
    except Exception as ex:
        problems.append('CPC game messages could not be encoded: %r' % (ex,))
    for k, e in E.items():
        if not e.get('tr') and not e.get('tr.cpc'): continue
        t, raw = text(e, True); c = t if raw else cpc(t, colons=False)
        lim = {'cpc.monitor.title': 8, 'cpc.monitor.keys': 18, 'cpc.epilogue.prompt': 27, 'cpc.yes_key': 1, 'meta.name': 12}.get(k)
        if k.startswith('verb.'): lim = 8
        if k.startswith('demo.'): lim = len(e.get('fr', '')) or 27     # written inside the demo program: no longer than the French title
        if k.startswith('menu.'): lim = int(re.search(r'max (\d+)', ' '.join(e['notes'])).group(1))
        if lim and len(c) > lim: P(k, 'CPC text "%s" is %d characters, max %d' % (c, len(c), lim))
        if k.startswith('verb.') and not re.fullmatch('[A-Z]+', c): P(k, 'CPC verb "%s" must be letters A-Z only' % c)
        if (k.startswith('demo.') or k.startswith('cpc.')) and set(c) - GAME_FONT: P(k, 'CPC font has no %s' % ' '.join(sorted(set(c) - GAME_FONT)))
        if k.startswith('menu.') and not all(32 <= ord(ch) < 127 for ch in (e.get('tr.cpc') or cpc_menu(t))): P(k, 'BASIC menu: plain ASCII only')
    # CPC epilogue
    lines = []
    for sec, n in LINES.items():
        parts = [text(E[k])[0] for k in sorted((k for k in E if k.startswith('epi.%s.p' % sec)), key=lambda k: int(k.rsplit('p', 1)[1]))]
        cp = E.get('epi.%s.p1' % sec, {}).get('tr.cpc')
        c = cp if cp else cpc(' '.join(parts), epilogue=True)
        bad = sorted(set(c) - EPI_FONT)
        if bad: P('epi.%s.p1' % sec, 'epilogue font has no %s  (write a tr.cpc: line on p1 with the whole part)' % ' '.join(bad)); c = ''.join(ch for ch in c if ch in EPI_FONT)
        for width in range(28, 39):
            L = wrap(c, width)
            if len(L) <= n: break
        if len(L) > n: P('epi.%s.p1' % sec, 'CPC epilogue part "%s" needs %d lines, only %d available: shorten it' % (sec, len(L), n))
        if show: print('  epilogue %s (%d/%d lines)' % (sec, len(L), n)); [print('    ' + l) for l in L]
        lines += L[:n] + [''] * (n - len(L[:n]))
    ph, words, order = epienc.build(lines)
    print('CPC epilogue text: %d of 2959 bytes (%d left)' % (len(ph) + len(words), 2959 - len(ph) - len(words)))
    if len(ph) + len(words) > 2959: problems.append('CPC epilogue text is too long by %d bytes' % (len(ph) + len(words) - 2959))
    print()
    print('\n'.join(problems) if problems else 'No problem found.')
    return 1 if problems else 0

def cpc_menu(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

if __name__ == '__main__': sys.exit(main())
