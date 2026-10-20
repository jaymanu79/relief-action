#!/bin/sh
# Rebuilds everything from the sources: the browser version (index.html) and the CPC disk (relief-action.dsk).
# Needs Python 3 only (Pillow is not needed). Run from anywhere: sh build/build.sh
set -e
cd "$(dirname "$0")/.."
for f in translations/[a-z][a-z].txt; do python3 -I translations/tools/check.py "$f" | tail -1; done
python3 build/web/build.py
python3 build/cpc/build_disk.py | tail -1
