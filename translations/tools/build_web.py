#!/usr/bin/env python3
"""Turns a translation file into the two scripts of the browser version.

    python3 translations/tools/build_web.py translations/es.txt OUTDIR
        -> OUTDIR/i18n_es.js (window.I18N_ES) and OUTDIR/phrases_es.js (window.PHRASES_ES)

Empty tr: lines are left out, so the page falls back to English for them."""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

def main(path, out):
    E = check.parse(path)
    code = E['meta.code']['tr'].strip().lower()
    tr = lambda k: (E.get(k) or {}).get('tr') or ''
    ui = {}
    for k, e in E.items():
        if k.startswith('ui.') and e.get('tr'): ui[e['fr'].strip()] = e['tr']
    rooms = {int(k[5:], 16): e['tr'] for k, e in E.items() if k.startswith('room.') and e.get('tr')}
    names = {k[4:]: e['tr'] for k, e in E.items() if k.startswith('obj.') and e.get('tr')}
    decks = {'short': [tr('deck.short.%d' % i) for i in (1, 2, 3)], 'names': [tr('deck.name.%d' % i) for i in (1, 2, 3)], 'ord': [tr('deck.ord.%d' % i) for i in (1, 2, 3)]}
    verbs = {int(k[5:]): e['tr'] for k, e in E.items() if k.startswith('verb.') and e.get('tr')}
    # the CPC verb menu, in the order of the table at &4B8F (index i = verb (i + 9) % 11 + 1)
    cpcVerbs = []
    for i in range(11):
        if i == 4: cpcVerbs.append(None); continue
        e = E.get('verb.%02d' % ((i + 9) % 11 + 1)) or {}
        w = e.get('tr.cpc') or check.cpc(e.get('tr') or e.get('en') or '', colons=False)
        cpcVerbs.append(re.sub('[^A-Z]', '', w)[:8])
    epiText, epiEnds = {}, {}
    for sec in check.LINES:
        ps = sorted((k for k in E if k.startswith('epi.%s.p' % sec)), key=lambda k: int(k.rsplit('p', 1)[1]))
        d = {}
        if tr('epi.%s.chapter' % sec): d['chap'] = tr('epi.%s.chapter' % sec)
        if all(E[k].get('tr') for k in ps): d['p'] = [E[k]['tr'] for k in ps]
        if d: epiText[sec] = d
    for k, e in E.items():
        m = re.match(r'end\.(\w+)\.(title|line|hint)$', k)
        if m and e.get('tr'): epiEnds.setdefault(m.group(1), {})[m.group(2)] = e['tr']
    meta = {'code': code, 'name': tr('meta.name'), 'translator': tr('meta.translator'),
            'wasd': 'ZQSD' if code == 'fr' else 'WASD', 'locale': {'es': 'es-ES', 'de': 'de-DE', 'it': 'it-IT', 'pt': 'pt-PT', 'nl': 'nl-NL'}.get(code, code)}
    obj = dict(meta=meta, ui=ui, rooms=rooms, names=names, decks=decks, verbs=verbs, cpcVerbs=cpcVerbs, epiText=epiText, epiEnds=epiEnds)
    js = lambda o: json.dumps(o, ensure_ascii=False, indent=0)
    U = code.upper()
    open(os.path.join(out, 'i18n_%s.js' % code), 'w', encoding='utf-8').write(
        '// %s edition, generated from translations/%s.txt by build_web.py: do not edit by hand.\n(function (root) {\nroot.I18N_%s = %s;\n})(typeof window !== \'undefined\' ? window : globalThis);\n' % (meta['name'], code, U, js(obj)))
    ph = [None] + [(E.get('msg.%03d' % i) or {}).get('tr') or None for i in range(1, 196)]
    open(os.path.join(out, 'phrases_%s.js' % code), 'w', encoding='utf-8').write(
        '// %s game messages (index = phrase number), generated from translations/%s.txt: do not edit by hand.\n(function (root) {\nroot.PHRASES_%s = %s;\n})(typeof window !== \'undefined\' ? window : globalThis);\n' % (meta['name'], code, U, js(ph)))
    print(code, len(ui), 'ui,', sum(1 for p in ph if p), 'messages,', len(epiText), 'epilogue parts')

if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
