#!/usr/bin/env python3
"""Build the Billboard clock's Roboto Flex from the pinned fontsource file.

The clock's Height (spec docs/superpowers/specs/2026-10-21-billboard-clock-
style-design.md) makes its figures taller the way the iOS Lock Screen does:
larger, then narrower and lighter through the font's own width and weight
axes, so every shape stays as the type designers drew it. Roboto Flex's width
axis reaches 25%, enough for about twice the height at the same width.

The clock only ever shows a time, so the file keeps just the characters a
time can contain in Blanc's interface languages. It pins the slant axis at
upright and optical size at its display master (144): the clock is always
display type, and a fixed optical size draws the same shapes at every size,
in the page and on canvas (which can't set it). Weight (100–1000) and width
(25–151%) stay variable.

Roboto Flex is SIL OFL 1.1 with no Reserved Font Name; the subset keeps that
licence (src/renderer/pages/roboto-flex-OFL.txt) and its own family name in
pages.css so it is never mistaken for the upstream build.

Run from the repository root after changing CHARACTERS or the pin, with the
exact tool versions the website's derived font uses:
    python3 -m venv .fontenv
    .fontenv/bin/pip install --require-hashes -r site/scripts/build-condensed-newsreader.requirements.txt
    npm pack @fontsource-variable/roboto-flex@5.3.0   # then extract it
    .fontenv/bin/python scripts/build-clock-font.py <package>/files/roboto-flex-latin-standard-normal.woff2
The output is byte-reproducible; test/unit/clock-font.test.js pins its hash.
"""
import hashlib
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# @fontsource-variable/roboto-flex 5.3.0, files/roboto-flex-latin-standard-normal.woff2
SOURCE_SHA256 = '5107a806ba9bb123c5ff2d9465905d04b767c694d125fd58103b88048a38a613'
# Figures, the separators Intl puts between hours and minutes, and the spaces
# around them.
CHARACTERS = '0123456789:.h   '
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/renderer/pages/roboto-flex-clock.woff2'


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: build-clock-font.py <roboto-flex-latin-standard-normal.woff2>')
    source = Path(sys.argv[1])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        sys.exit(f'{source}: sha256 {digest} is not the pinned {SOURCE_SHA256}')
    font = TTFont(source)
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['kern', 'tnum', 'pnum', 'lnum']
    options.name_IDs = ['*']
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=CHARACTERS)
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, {'slnt': 0, 'opsz': 144})
    font.flavor = 'woff2'
    # Keep the source's timestamp, so the same input always gives the same bytes.
    font.recalcTimestamp = False
    font.save(OUT, reorderTables=True)
    print(f'{OUT.relative_to(ROOT)}  {OUT.stat().st_size} bytes  '
          f'sha256 {hashlib.sha256(OUT.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
