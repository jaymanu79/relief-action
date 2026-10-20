"""Writes the translation template (every text of the CPC and web versions, with French and English references).
   node translations/tools/dump.js && python3 translations/tools/make_template.py   (after build/web/build.py)"""
import json, sys, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
s = json.load(open(os.path.join(HERE, 'src.json')))
out = []
w = out.append

def entry(id, fr, en, notes=(), tr=''):
    w('@' + id)
    for n in notes: w('# ' + n)
    w('fr: ' + fr); w('en: ' + en); w('tr: ' + tr); w('')

def section(title, *notes):
    w('#' * 78); w('## ' + title); [w('## ' + n) for n in notes]; w('#' * 78); w('')

w('''# Relief Action (Loriciels, 1987) — translation file / fichier de traduction
#
# HOW TO TRANSLATE
#   Every text has its own block:   @id            stable name of the text, do not change it
#                                    # ...          notes and limits, do not change them
#                                    fr: ...        French original (reference, do not change)
#                                    en: ...        English version (reference, do not change)
#                                    tr: ...        YOUR TRANSLATION, on this single line
#   Optional, only when the automatic CPC version is not good enough:
#                                    tr.cpc: ...    the text as the CPC must show it (see "CPC text" below)
#   Leave tr: empty if you are unsure: the English text is used instead, nothing breaks.
#   Save the file as UTF-8. One text = one line (long lines are fine, never press Enter inside a text).
#
# CPC TEXT
#   The CPC game has a tiny font: capital letters A-Z, digits 0-9 and  ' - , ? ! :  only.
#   No accents, no full stop, no lowercase. The build makes the CPC text from your tr: line automatically
#   (capitals, accents removed: É -> E, ß -> SS, Ä -> AE..., "..." kept as the game's ellipsis, "." dropped).
#   If that gives something wrong, add a tr.cpc: line under tr: with the exact CPC text.
#   The epilogue program has another font: A-Z  ' - , ? . " :  (no "!" and no digit 0).
#
# SPACE ON THE CPC
#   All game messages share one memory zone of 3940 bytes (compressed: frequent words are stored once).
#   English fits; a longer language may need some shorter messages. The build tells you how much is left.
#
# PLACEHOLDERS
#   {0}, {1}, {CODE} are replaced by the program: keep them, you may move them in the sentence.
#   Three-letter codes (NMI, TPT, POL, ASS, ARM...) and key names in brackets (V), (M)... are game data:
#   keep them as they are.
#
# ----------------------------------------------------------------------------------------------------------
# COMMENT TRADUIRE (résumé en français)
#   Remplissez la ligne « tr: » de chaque bloc, sur une seule ligne, sans toucher au reste. Laissez vide en
#   cas de doute (l'anglais sera utilisé). Le CPC n'a ni accents ni minuscules : la version CPC est fabriquée
#   automatiquement, ajoutez « tr.cpc: » seulement si elle ne convient pas. Gardez {0}, {CODE} et les codes
#   de trois lettres (NMI, TPT…).
''')

section('LANGUAGE', 'Name of your language, written in your language (shown in the CPC menu and on the web page).')
w('@meta.name'); w('# max 12 letters on the CPC menu'); w('fr: Français'); w('en: English'); w('tr: '); w('')
w('@meta.code'); w('# ISO 639-1 code of your language: de, es, it, nl, pt...'); w('fr: fr'); w('en: en'); w('tr: '); w('')
w('@meta.translator'); w('# your name or nickname, for the credits'); w('fr: '); w('en: '); w('tr: '); w('')

section('VERBS / VERBES', 'The action menu. CPC: 8 letters maximum, A-Z only. "Relief" is the name of the 3D-glasses mode.')
cpc_fr = ['MANGER', 'BOIRE', 'POSER', 'PRENDRE', None, 'UTILISER', 'APPUYER', 'REGLER', 'VERSER', 'RELIEF', 'DORMIR']
vfr = {k: v for k, v in s['verbsFr']}; ven = {int(k): v for k, v in s['verbsEn'].items()}
for i, c in enumerate(cpc_fr):
    if c is None: continue
    vid = (i + 9) % 11 + 1
    entry('verb.%02d' % vid, vfr[vid], ven[vid], ['CPC: max 8 letters (original: %s)' % c])

section('GAME MESSAGES / MESSAGES DU JEU',
        'Shown in the message bar, on the CPC and in the browser. 1-33 are mostly room names.')
pf, pe = s['pf'], s['pe']
NOTE = {191: 'keep {CODE}: the program writes the 6-letter end-of-game code there',
        188: 'question answered with the "yes" key defined in CPC MISC below',
        194: 'web only (fragment of a book page)', 195: 'web only (fragment of a book page)'}
for i in range(1, len(pf)):
    n = [NOTE[i]] if i in NOTE else []
    codes = sorted(set(re.findall(r'\b[A-Z]{3}\b', pf[i])))
    if codes: n.append('keep the code%s %s (game data)' % ('s' if len(codes) > 1 else '', ', '.join(codes)))
    entry('msg.%03d' % i, pf[i], pe[i], n)

section('CPC MISC / DIVERS CPC')
entry('cpc.yes_key', 'O', 'Y', ['the key that answers "yes" to "play again?" (one letter A-Z)'])
entry('cpc.monitor.title', 'MONITEUR', 'MONITOR', ['computer room memory monitor, title: max 8 letters'])
entry('cpc.monitor.keys', 'S:SORTIE Z:ADRESSE', 'S:EXIT   Z:ADDRESS', ['max 18 characters; S and Z are the keys, keep them'])
entry('cpc.epilogue.prompt', 'SPACE POUR PAGE SUIVANTE', 'SPACE BAR FOR NEXT PAGE', ['epilogue program, max 27 characters'])

section('CPC DISK MENU / MENU DE LA DISQUETTE', 'The BASIC menu of the disk. Plain ASCII, no accents. The keys (L J D E T M) stay the same.')
for id, fr, en, mx in [('menu.language', 'Langue', 'Language', 10), ('menu.game', 'Jeu', 'Game', 10), ('menu.demo', 'Demo', 'Demo', 10),
                        ('menu.epilogue', 'Epilogue', 'Epilogue', 10), ('menu.inftime', 'Temps infini', 'Infinite time', 16),
                        ('menu.sleeping', 'Monstre endormi', 'Sleeping monster', 16), ('menu.yes', 'OUI', 'YES', 3), ('menu.no', 'NON', 'NO', 3),
                        ('menu.loading', 'Chargement', 'Loading', 20)]:
    entry(id, fr, en, ['max %d characters' % mx])

section('CPC DEMO TITLES / TITRES DE LA DEMO', 'Title screens of the demo, CPC font (A-Z 0-9 \' - , ? ! :).', 'Each title can be at most as long as the French one: it is written inside the demo program itself.')
for i, (fr, en) in enumerate([('PRESENTE', 'PRESENTS'), ('REALISE PAR', 'CREATED BY'), ('COPYRIGHT MARS 87 LORICIELS', 'COPYRIGHT 1987 LORICIELS'),
                              ('ANIMATION 3D TEMPS REEL', 'REAL TIME 3D ANIMATION'), ('PLUS DE 50 SALLES', 'OVER 50 ROOMS'), ('JOUABLE AU JOYSTICK', 'JOYSTICK CONTROL'),
                              ('OPTION RELIEF', 'RELIEF OPTION'), ('-AVEC LUNETTES-', '-WITH GLASSES-'), ("UN GRAND JEU D'AVENTURE:", 'A GREAT ADVENTURE GAME:')], 1):
    entry('demo.%02d' % i, fr, en, ['max %d characters (the length of the French title)' % len(fr)])

LINES = {'oxy': 17, 'escape': 11, 'hunger': 12, 'alone': 24, 'wait': 7, 'silence': 14, 'rescue': 7, 'prison': 18, 'hero': 23}
section('EPILOGUE / ÉPILOGUE',
        'The story told after the shuttle leaves. Each part is a few paragraphs; on the CPC the paragraphs of a part are',
        'joined and must fit on a fixed number of 38-character lines (given in the notes). The chapter title is web only.')
ef, ee = s['epiTextFr'], s['epiTextEn']
for k in LINES:
    entry('epi.%s.chapter' % k, ef[k]['chap'], ee[k]['chap'], ['web only'])
    tot = sum(len(p) for p in ef[k]['p'])
    for j, (a, b) in enumerate(zip(ef[k]['p'], ee[k]['p']), 1):
        n = ['CPC: the %d paragraphs of this part must fit together in %d lines of 38 characters (about %d characters)' % (len(ef[k]['p']), LINES[k], LINES[k] * 34)] if j == 1 else []
        entry('epi.%s.p%d' % (k, j), a, b, n)

section('ENDINGS (web) / FINS (web)', 'The six endings, shown in the browser after the epilogue.')
for k, v in s['epiEndsFr'].items():
    e = s['epiEndsEn'][k]
    for f in ('title', 'line', 'hint'):
        if v.get(f): entry('end.%s.%s' % (k, f), v[f], e[f])

section('WEB: ROOMS, OBJECTS, DECKS / WEB : SALLES, OBJETS, PONTS')
for k, v in s['roomsFr'].items():
    kk = '%02X' % int(k)
    entry('room.' + kk, v, s['roomsEn'].get(str(int(k)), s['roomsEn'].get(k, '')))
for k, v in s['namesFr'].items():
    if k in s['namesEn']: entry('obj.' + k, v, s['namesEn'][k])
for i in range(3):
    entry('deck.short.%d' % (i + 1), s['deckShortFr'][i], s['decksEn']['short'][i])
    entry('deck.name.%d' % (i + 1), s['deckNamesFr'][i], s['decksEn']['names'][i])
    entry('deck.ord.%d' % (i + 1), ['1er étage', '2e étage', '3e étage'][i], s['decksEn']['ord'][i])

section('WEB INTERFACE / INTERFACE WEB', 'Buttons, help, settings and messages of the browser version. Keep {0} {1} and keys in brackets.')
# ui ids are stable: a text keeps its number from the first published template, new texts get the next numbers
IDS = json.load(open(os.path.join(HERE, 'ui_ids.json'), encoding='utf-8'))
nxt = max(IDS.values()) + 1
for k in s['ui']:
    if k.strip() and k.strip() not in IDS: IDS[k.strip()] = nxt; nxt += 1
json.dump(IDS, open(os.path.join(HERE, 'ui_ids.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
for k, v in sorted(((k, v) for k, v in s['ui'].items() if k.strip()), key=lambda kv: IDS[kv[0].strip()]):
    entry('ui.%03d' % IDS[k.strip()], k, v)
open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'TEMPLATE.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print(sum(1 for l in out if l.startswith('@')), 'entries')
