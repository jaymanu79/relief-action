"""Language file for the CPC game: a few bytes of Z80 at &C000 (screen memory, untouched by the decompression) that copy
the language's blocks into the freshly unpacked game, then start it. RELIEFLP.BIN is RELIEFLO.BIN with its final
JP &04D0 turned into JP &C000."""
LOAD = 0xE000            # language file (hook + data), in screen memory
LP_AT = 0xC000           # where BASIC puts RELIEFLP before the relocator copies it to &0040
RELOC = 0x9F00           # relocator, POKEd by BASIC just above the loaded stream
def code(blocks):
    # blocks: list of (address, bytes). Layout: copy loop, then [addr lo, hi, len lo, hi, data...]*, 0, 0
    loop = bytes([
        0x21, 0, 0,             # LD HL,table              (patched below)
        0x5E, 0x23, 0x56, 0x23, # LD E,(HL) INC HL LD D,(HL) INC HL
        0x7A, 0xB3,             # LD A,D : OR E
        0xCA, 0xD0, 0x04,       # JP Z,&04D0
        0x4E, 0x23, 0x46, 0x23, # LD C,(HL) INC HL LD B,(HL) INC HL
        0xED, 0xB0,             # LDIR
        0x18, 0xF0])            # JR back to LD E,(HL)
    assert loop[18] == 0x18 and 3 - 20 == -17
    loop = bytearray(loop); loop[19] = (3 - 20) & 0xFF
    table = LOAD + len(loop); loop[1] = table & 0xFF; loop[2] = table >> 8
    t = bytearray()
    for a, d in blocks: t += bytes([a & 0xFF, a >> 8, len(d) & 0xFF, len(d) >> 8]) + d
    t += b'\0\0'
    return bytes(loop) + bytes(t)
def loader():
    import os; lo = bytearray(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'RELIEFLO.raw'), 'rb').read())
    assert lo[0x77 - 0x40:0x7A - 0x40] == b'\xc3\xd0\x04'
    lo[0x78 - 0x40] = LOAD & 0xFF; lo[0x79 - 0x40] = LOAD >> 8
    return bytes(lo)

def relocator():
    """DI, both ROMs off (reads of &C000+ must see RAM), copy RELIEFLP from &C000 to &0040, start it"""
    return bytes([0xF3, 0x01, 0x8D, 0x7F, 0xED, 0x49,      # DI : LD BC,&7F8D : OUT (C),C
                  0x21, LP_AT & 0xFF, LP_AT >> 8, 0x11, 0x40, 0x00, 0x01, 0xC0, 0x1F, 0xED, 0xB0,   # LDIR &C000 -> &0040, &1FC0 bytes
                  0xC3, 0x40, 0x00])
