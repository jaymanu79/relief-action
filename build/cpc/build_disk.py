"""Builds the multilingual CPC disk: French original + one small language file per translation.
   python3 build/cpc/build_disk.py [output.dsk]   (default: relief-action.dsk at the root of the repository)"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dsktool, langs, patchfile
from phrases_cpc_en import P as P_EN
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)       # every file of the disk, for inspection
TR = os.path.join(ROOT, 'translations')
L = [langs.en()] + [langs.from_file(os.path.join(TR, f), {'P': P_EN}) for f in sorted(os.listdir(TR)) if f.endswith('.txt') and f not in ('TEMPLATE.txt',) and len(f) == 6]
files = {}
def add(name, data, load, exe=0):
    files[name] = dsktool.amsdos_header(name, data, load, exe)
FR_MENU = dict(name='FRANCAIS', language='Langue', game='Jeu', demo='Demo', epilogue='Epilogue', inftime='Temps infini', sleeping='Monstre endormi', yes='OUI', no='NON', loading='Chargement')
add('RELIEFLP.BIN', patchfile.loader(), 0x0040, 0x0040)
for l in L:
    c = l['code']; k = langs.KEYS[l['key']]
    blocks = [(0x5447, l['zone']), (0x4B8F, l['verbs']), (0x6C1B, l['labels']), (0x7AA0, bytes([0xDC + k[0]])), (0x7AA4, bytes([0x46 + 8 * k[1]]))]
    add('LANG%s.BIN' % c, patchfile.code(blocks), patchfile.LOAD)
    add('TX%s.BIN' % c, l['zone'], 0x5462)          # the same text zone, for the demo (its copy sits &1B higher)
    add('VB%s.BIN' % c, l['verbs'], 0x4B8F)
    add('EP%s.BIN' % c, l['epi'][0], 0x488A)
    ptr = (l['zone'][-2] | l['zone'][-1] << 8) + 0x1B
    dl = ['10 MODE 1:BORDER 0:INK 0,0:INK 1,0:INK 2,0:INK 3,0', '20 OPENOUT"d":h=HIMEM:MEMORY &231E:CLOSEOUT', '30 LOAD"DEMO1.BIN"',
          '40 LOAD"TX%s.BIN",&5462:POKE &63C7,%d:POKE &63C8,%d:LOAD"VB%s.BIN",&4B8F' % (c, ptr & 255, ptr >> 8, c),
          '50 READ A:IF A=0 THEN 70', '60 READ N:FOR J=0 TO N-1:READ B:POKE A+J,B:NEXT:GOTO 50', '70 LOAD"DEMO2.BIN"', '80 CALL 32407']
    n = 100
    for a, d in l['titles']:
        dl.append('%d DATA %d,%d,%s' % (n, a, len(d), ','.join(str(b) for b in d))); n += 10
    dl.append('%d DATA 0' % n)
    files['DEMO%s.BAS' % c] = ('\r\n'.join(dl) + '\r\n').encode('ascii') + b'\x1a'
# the menu
ALL = [dict(code='', menu=FR_MENU)] + L
m = lambda i, f: ALL[i]['menu'][f]
B = ['10 MODE 1:BORDER 0:INK 0,0:INK 1,24:INK 2,20:INK 3,6:PAPER 0:PEN 1',
     '20 NL=%d:DIM T$(%d,10),C$(%d):FOR I=1 TO NL:READ C$(I):FOR J=0 TO 9:READ T$(I,J):NEXT J,I' % (len(ALL), len(ALL), len(ALL)),
     '30 L=1:T=0:M=0',
     '40 CLS:PEN 3:LOCATE 13,2:PRINT "RELIEF  ACTION":PEN 2:LOCATE 11,3:PRINT "Loriciels  1987":PEN 1',
     '50 LOCATE 6,6:PRINT "L  ";T$(L,1);" : ";T$(L,0);"     "',
     '60 LOCATE 6,8:PRINT "J  ";T$(L,2);"          ":LOCATE 6,9:PRINT "D  ";T$(L,3);"          ":LOCATE 6,10:PRINT "E  ";T$(L,4);"          "',
     '70 LOCATE 6,13:PRINT "T  ";T$(L,5);": ";T$(L,7+T);"     ":LOCATE 6,14:PRINT "M  ";T$(L,6);": ";T$(L,7+M);"     "',
     '80 PEN 2:LOCATE 2,22:PRINT "L :";:FOR I=1 TO NL:PRINT " ";T$(I,0);:NEXT:PEN 1',
     '90 A$=UPPER$(INKEY$):IF A$="" THEN 90',
     '100 IF A$="L" THEN L=L MOD NL+1:GOTO 40',
     '110 IF A$="T" THEN T=1-T:GOTO 50',
     '120 IF A$="M" THEN M=1-M:GOTO 50',
     '130 IF A$="D" THEN IF L=1 THEN RUN"DEMO" ELSE RUN"DEMO"+C$(L)',
     '140 IF A$="E" THEN 300',
     '150 IF A$<>"J" AND A$<>"G" THEN 90',
     '200 CLS:LOCATE 2,12:PRINT T$(L,9);" 1/2..."',
     '210 MEMORY &1FFF:LOAD"RELIEFHI.BIN",&2000',
     '220 POKE &61DC,0:POKE &61DD,0:POKE &382E,&93',
     '230 IF T=1 THEN POKE &5C25,0',
     '240 IF M=1 THEN POKE &485B,&C9:POKE &48A2,&C9',
     '250 LOCATE 2,14:PRINT T$(L,9);" 2/2..."',
     '260 IF L=1 THEN RUN"RELIEFLO.BIN"',
     '270 INK 1,0:INK 2,0:INK 3,0:LOAD"RELIEFLP.BIN",&C000:LOAD"LANG"+C$(L)+".BIN",&E000',
     '280 RESTORE 900:FOR I=0 TO 19:READ B:POKE &9F00+I,B:NEXT:CALL &9F00',
     '300 IF L=1 THEN RUN"EPILOG"',
     '310 MEMORY &4889:LOAD"EPILOG.BIN":LOAD"EP"+C$(L)+".BIN",&488A',
     '320 ON L-1 GOSUB %s' % ','.join(str(1000 + 10 * i) for i in range(1, len(ALL))),
     '330 READ A,B:POKE &6672,A:POKE &6673,B:FOR I=0 TO 26:READ B:POKE &634A+I,B:NEXT:CALL &5BFD',
     '900 DATA %s' % ','.join(str(b) for b in patchfile.relocator())]
for i, a in enumerate(ALL):
    B.append('%d DATA "%s",%s' % (800 + i, a['code'], ','.join('"%s"' % m(i, f) for f in ('name', 'language', 'game', 'demo', 'epilogue', 'inftime', 'sleeping', 'no', 'yes', 'loading'))))
for i, l in enumerate(L, 1):
    B.append('%d RESTORE %d:RETURN' % (1000 + 10 * i, 1005 + 10 * i))
    ep = l['epi']; B.append('%d DATA %d,%d,%s' % (1005 + 10 * i, ep[1][0], ep[1][1], ','.join(str(b) for b in ep[2])))
B.sort(key=lambda s: int(s.split()[0]))
bas = '\r\n'.join(B) + '\r\n'
assert all(ord(ch) < 128 for ch in bas), [ch for ch in bas if ord(ch) >= 128]
files['RELIEF.BAS'] = bas.encode('ascii') + b'\x1a'
open(os.path.join(OUT, 'RELIEF.BAS.txt'), 'w').write(bas)
for n, d in files.items(): open(os.path.join(OUT, n), 'wb').write(d)
# the disk: start from the current one, drop the old full English copies, add the language files
d = dsktool.Disk(open(os.path.join(HERE, 'data', 'base.dsk'), 'rb').read())     # the French disk: game, demo, epilogue, original menu
def delete(d, name):
    base, ext = name.split('.')
    raw = bytearray(b''.join(bytes(d.sector(*d.blocksec(k // 2)[k % 2])) for k in range(4)))
    for i in range(0, 2048, 32):
        e = raw[i:i + 32]
        if e[0] != 0xE5 and e[1:9].decode('latin1').rstrip() == base and bytes(c & 0x7F for c in e[9:12]).decode('latin1').rstrip() == ext: raw[i] = 0xE5
    d._setdir(raw)
for n in ('RELIEFHE.BIN', 'RELIEFLE.BIN', 'DEMOEN.BIN', 'EPILOGEN.BIN', 'DEMOEN.BAS'): delete(d, n)
for n, data in files.items(): d.write_file(n, data)
out = d.dump(); open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'relief-action.dsk'), 'wb').write(out)
d2 = dsktool.Disk(out)
for n in sorted(d2.files()): print('%-13s %6d' % (n, len(d2.read(n))))
print('free KB', 171 - len(d2.used_blocks()), '| languages:', ' '.join(['FR'] + [l['code'] for l in L]))
