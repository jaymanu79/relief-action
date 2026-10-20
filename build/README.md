# Building Relief Action / Compiler Relief Action

*Français plus bas.*

Everything published in this repository is rebuilt from the sources in this folder, with Python 3 only:

```
sh build/build.sh
```

This checks every translation, then writes:

- `index.html` — the browser version (one self-contained file);
- `relief-action.dsk` — the CPC disk with every language.

## Adding a language

1. Put the translation file in `translations/`, named after the language code (`de.txt`, `it.txt`…).
2. Run `sh build/build.sh`. Nothing else to edit: the language appears in the language menu of the web page and in the CPC menu (key L).

When texts of the web page or the game change (in `build/web/`), regenerate the template after building, then update each translation:

```
node translations/tools/dump.js && python3 translations/tools/make_template.py
python3 translations/tools/update.py translations/es.txt
```

`update.py` brings a translation file up to date with `TEMPLATE.txt` (new texts get an empty `tr:` line).

## How it is put together

**Browser version** (`build/web/`): the original game runs unmodified in a Z80 / Amstrad CPC emulator written in JavaScript (`z80.js`, `cpc.js`). `game.js` listens to the game while it draws and hands its 3D models to `render.js` (WebGL); `app.js` is the interface. `build.py` assembles the scripts, the game memory image (`data/mem.bin`), the epilogue program, the deck maps and the translations (`translations/xx.txt` → `gen/i18n_xx.js`, `gen/phrases_xx.js`) into a single HTML file.

**CPC disk** (`build/cpc/`): `data/base.dsk` holds the French original (game, demo, epilogue, original menu). The French game is left untouched. Each other language adds:

- `LANGxx.BIN` — its game texts, verbs, monitor labels and "yes" key. The menu loads it into screen memory with a patched copy of the loader (`RELIEFLP.BIN`), which copies it into the game right after decompression (`patchfile.py`);
- `TXxx.BIN`, `VBxx.BIN` and `DEMOxx.BAS` — the same texts for the demo, with its titles;
- `EPxx.BIN` — the epilogue text.

The texts are encoded like the original (`textenc.py`, `epienc.py`): frequent words stored once, CPC font only. `langs.py` reads the English data (`phrases_cpc_en.py`, `epi_en.py`) and the translation files, and `build_disk.py` writes the menu (`RELIEF.BAS`) and the disk. The disk files are also written to `build/cpc/out/` for inspection.

---

## Français

Tout ce qui est publié dans ce dépôt se reconstruit avec `sh build/build.sh` (Python 3 suffit) : la version navigateur `index.html` et la disquette `relief-action.dsk`.

Pour ajouter une langue, déposez son fichier dans `translations/` (`de.txt`, `it.txt`…) et relancez `sh build/build.sh` : elle apparaît dans le menu de langue de la page web et dans le menu de la disquette (touche L). Le jeu français d'origine reste intact ; chaque autre langue n'ajoute que de petits fichiers de textes.
