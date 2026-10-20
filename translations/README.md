# Translating Relief Action / Traduire Relief Action

*Français plus bas.*

## English

Thank you for translating the game! One text file holds every text of the game: the CPC version (game messages, verbs, demo, epilogue, disk menu) and the browser version (interface, help, room and object names, endings).

1. Copy `TEMPLATE.txt` to a file named after your language code, e.g. `de.txt`, `es.txt`, `it.txt`.
2. Fill in the `tr:` line of each block, on a single line. The `fr:` and `en:` lines are the references: leave them as they are.
3. Check your file (Python 3, nothing to install):

   ```
   python3 translations/tools/check.py translations/de.txt
   python3 translations/tools/check.py translations/de.txt --cpc     # also shows every CPC text
   ```

   The check lists what is missing or too long, and how much room is left on the CPC.
4. Open a pull request with your file. You can send a partial file: any empty `tr:` line falls back to English.

We then build your language into the CPC disk and the web page (`sh build/build.sh`, see [build/](../build/README.md)).

### The CPC limits

- **Font.** The CPC game only has capitals A–Z, digits and `' - , ? ! :`. No accents, no lowercase letters, no full stop. You write normal text with accents; the CPC version is made automatically (capitals, `É → E`, `ß → SS`, `Ä → AE`…, `…` kept as the game's ellipsis). If the automatic version is not right, add a `tr.cpc:` line under `tr:` with the exact CPC text.
- **Space.** All game messages share a 3,940-byte zone, where frequent words are stored only once. English uses 3,532 bytes. If your language is longer, the check tells you how many bytes to save: shorten a few CPC messages with `tr.cpc:` lines. The web version keeps your full text.
- **Epilogue.** Each part of the epilogue must fit in a fixed number of 38-character lines (given in the notes), with a font that has no `!` and no `0`.
- **Short fields.** Verbs are limited to 8 letters, each demo title to the length of the French one, and the menu entries to the length given in their notes.

### Keep as they are

- `{0}`, `{1}`, `{CODE}`: these are replaced by the program. You may move them in the sentence.
- Three-letter codes (NMI, TPT, POL, ASS, ARM, LND…): they are game data.
- Key names in brackets: (V), (M), (H)…

## Français

Merci de traduire le jeu ! Un seul fichier texte contient tous les textes : la version CPC (messages, verbes, démo, épilogue, menu de la disquette) et la version navigateur (interface, aide, noms des salles et objets, fins).

1. Copiez `TEMPLATE.txt` sous le code de votre langue, par exemple `de.txt`.
2. Remplissez la ligne `tr:` de chaque bloc, sur une seule ligne. Les lignes `fr:` et `en:` sont les références, n'y touchez pas.
3. Vérifiez votre fichier avec `python3 translations/tools/check.py translations/de.txt` (option `--cpc` pour voir tous les textes CPC).
4. Proposez une pull request. Un fichier partiel est accepté : une ligne `tr:` vide reprend l'anglais.

**Limites du CPC :**
- **Police :** majuscules, chiffres et `' - , ? ! :`, sans accents ni point. La version CPC est fabriquée automatiquement ; ajoutez `tr.cpc:` seulement si elle ne convient pas.
- **Place :** les messages du jeu doivent tenir en 3 940 octets (l'anglais en prend 3 532). Le script indique combien il faut en gagner.
- **Épilogue :** chaque partie doit tenir en un nombre fixe de lignes de 38 caractères.
- **À garder tels quels :** `{0}`, `{CODE}` et les codes de trois lettres.
