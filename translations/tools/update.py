#!/usr/bin/env python3
"""Brings a translation file up to date with TEMPLATE.txt (new texts appear with an empty tr: line).

    python3 translations/tools/update.py translations/es.txt

Translations are kept by id, or by their French text when an id changed; texts no longer in the game are listed."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check
def main(path):
    tpl = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'TEMPLATE.txt')
    E = check.parse(path)
    byfr = {(k.split('.')[0], e.get('fr')): e for k, e in E.items()}
    out, cur, fr, used, new = [], None, None, set(), []
    for line in open(tpl, encoding='utf-8').read().split('\n'):
        if line.startswith('@'): cur = line[1:].strip(); fr = None
        if line.startswith('fr:'): fr = line[3:].strip()
        if line.startswith('tr:') and cur:
            src = E.get(cur) if cur in E and E[cur].get('fr') == fr else byfr.get((cur.split('.')[0], fr))
            if src and (src.get('tr') or src.get('tr.cpc')):
                used.add(id(src)); out.append('tr: ' + (src.get('tr') or ''))
                if src.get('tr.cpc'): out.append('tr.cpc: ' + src['tr.cpc'])
                continue
            if cur not in ('meta.translator',): new.append(cur)
        out.append(line)
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    gone = [(k, e.get('fr')) for k, e in E.items() if (e.get('tr') or e.get('tr.cpc')) and id(e) not in used]
    print('%s: %d new texts to translate %s' % (os.path.basename(path), len(new), ' '.join(new)))
    for k, f in gone: print('  no longer in the game:', k, f)
if __name__ == '__main__': main(sys.argv[1])
