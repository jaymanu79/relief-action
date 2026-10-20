"""Builds the browser version: python3 build/web/build.py [output.html]  (default: index.html at the root of the repository)"""
import json, base64, re, os, sys, glob, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); D = os.path.join(HERE, 'data')
os.chdir(HERE)
O = json.load(open(os.path.join(D, 'objets.json')))
mapd = json.load(open(os.path.join(D, 'map.json')))
rooms = {int(k, 16): v for k, v in json.load(open(os.path.join(D, 'rooms.json'), encoding='utf-8')).items()}
rooms[0x0A] = 'Laboratoire'; rooms[0x07] = "Cage d'ascenseur"; rooms[0x10] = 'Salle &10'
names = dict(O['tn']); names['09'] = 'Télécommande des portes'  # names_fix
names.update({'18': 'Votre carte', '19': 'Carte Officier', '1A': 'Carte Commandant', '1B': 'Carte Mécanicien', '1C': 'Carte Opérateur', '1D': 'Carte Navigateur'})
# doors on the deck plans: each exit zone of each space, as a short segment along its long side, in deck coordinates
import math
MEMB = open(os.path.join(D, 'mem.bin'), 'rb').read()
w16 = lambda a: MEMB[a] | MEMB[a + 1] << 8
def rotp(x, z, phi):
    t = phi * 2 * math.pi / 256; c, s_ = math.cos(t), math.sin(t); return (x * c - z * s_, x * s_ + z * c)
deckDoors = []
for deck in mapd:
    seen = {}
    for key, sp in deck['spaces'].items():
        sid = int(key, 16)
        if sid == 0x05: continue                     # the rotating airlock has its own marker
        p = w16(0x4022 + 2 * (sid & 0x7F)) if sid & 0x80 else w16(0x3FD2 + 2 * sid)
        n = MEMB[p]
        if n > 12: continue
        for k in range(n):
            e = p + 1 + 8 * k
            x0, x1, z0, z1, d = MEMB[e], MEMB[e + 1], MEMB[e + 2], MEMB[e + 3], MEMB[e + 4]
            if d in seen: continue
            if x1 - x0 >= z1 - z0: a, b = (x0, (z0 + z1) / 2), (x1, (z0 + z1) / 2)
            else: a, b = ((x0 + x1) / 2, z0), ((x0 + x1) / 2, z1)
            A = rotp(*a, sp['phi']); B = rotp(*b, sp['phi'])
            seen[d] = [d, round(A[0] + sp['t'][0], 1), round(A[1] + sp['t'][1], 1), round(B[0] + sp['t'][0], 1), round(B[1] + sp['t'][1], 1)]
    deckDoors.append(list(seen.values()))
data = {
    'deckDoors': deckDoors,
    'intro': json.load(open(os.path.join(D, 'intro.json'))),
    'mem': base64.b64encode(open(os.path.join(D, 'mem.bin'), 'rb').read()).decode(),
    'epilog': base64.b64encode(open(os.path.join(D, 'EPILOG.BIN'), 'rb').read()).decode(),
    'map': mapd,
    'deckShort': ['Plan · 1er étage', 'Plan · 2e étage', 'Plan · 3e étage'],
    'deckNames': ['Pont inférieur et hangar · 1er étage', 'Pont intermédiaire · 2e étage', 'Pont supérieur · 3e étage'],
    'icons': O['icons'], 'names': names, 'rooms': rooms,
}
scripts = ''
# translations: every translations/xx.txt becomes gen/i18n_xx.js + gen/phrases_xx.js
GEN = os.path.join(HERE, 'gen'); os.makedirs(GEN, exist_ok=True)
for f in sorted(glob.glob(os.path.join(ROOT, 'translations', '[a-z][a-z].txt'))):
    subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'translations', 'tools', 'build_web.py'), f, GEN], check=True)
BASE = ['z80.js', 'cpc.js', 'geom.js', 'game.js', 'render.js', 'phrases_fr.js', 'phrases_en.js', 'i18n_en.js']
for f in BASE + sorted(glob.glob('gen/i18n_[a-z][a-z].js') + glob.glob('gen/phrases_[a-z][a-z].js')):   # + translations
    scripts += '<script>\n' + open(f, encoding='utf-8').read() + '\n</script>\n'
scripts += '<script>window.RELIEF_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';</script>\n'
app_src = open('app.js', encoding='utf-8').read()
cut = app_src.rstrip().rfind('})();')
app_src = app_src[:cut] + open('epilogue2.js', encoding='utf-8').read() + '\n' + app_src[cut:]
scripts += '<script>\n' + app_src + '\n</script>\n'
html = open('template.html', encoding='utf-8').read().replace('<!--SCRIPTS-->', scripts)
assert '</script' not in json.dumps(data)
# a local test page with a full skeleton
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
open(OUT, 'w', encoding='utf-8').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Relief Action (Loriciels, 1987) — jouer en ligne / play online</title><meta name="description" content="Relief Action (Loriciels, 1987): the Amstrad CPC 3D adventure, playable free in your browser with modernised 3D. Français / English."><meta property="og:type" content="website"><meta property="og:url" content="https://jaymanu79.github.io/relief-action/"><meta property="og:title" content="Relief Action (1987) — play it in your browser"><meta property="og:description" content="The Amstrad CPC 3D adventure by Loriciels, reverse-engineered and playable free online in modernised 3D. Français / English."><meta property="og:image" content="https://jaymanu79.github.io/relief-action/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%2305070c%22/%3E%3Cpath d=%22M14 50V14h18a10 10 0 0 1 0 20H14m16 0 16 16%22 fill=%22none%22 stroke=%22%236fa8ff%22 stroke-width=%225%22/%3E%3C/svg%3E"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + html + '</body></html>')
print(len(html), 'octets', len(rooms), 'salles nommées')
