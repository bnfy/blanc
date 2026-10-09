#!/usr/bin/env python3
"""Build the website's condensed Newsreader from the pinned fontsource files.

Newsreader has no width axis, so the website's condensed display face is a
derived copy: every horizontal measurement (outlines, advances, side bearings,
kerning, mark anchors and all of their variation deltas) is multiplied by
WIDTH while vertical measurements stay untouched. Doing it in the font, rather
than with a CSS transform, keeps line breaking, alignment and max-widths
correct on every heading.

Narrower letters read tighter at the same CSS letter-spacing, so TRACKING em
is added to the right of every spacing glyph, exactly as CSS letter-spacing
would add it; the site's per-heading letter-spacing values stay as designed.

Newsreader is SIL OFL 1.1 with no Reserved Font Name; the derived files keep
that licence (site/public/fonts/newsreader-OFL.txt) and carry their own family
name so they are never mistaken for the upstream build.

Run from the repository root after changing WIDTH or the fontsource pin:
    python3 site/scripts/build-condensed-newsreader.py
Requires fontTools and brotli (pip install fonttools brotli).
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

WIDTH = 0.88
TRACKING = 0.02  # em added after each spacing glyph
FAMILY = 'Newsreader Condensed'
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'site/node_modules/@fontsource-variable/newsreader/files'
OUT = ROOT / 'site/src/fonts'
FILES = [f'newsreader-{subset}-opsz-{style}.woff2'
         for subset in ('latin', 'latin-ext', 'vietnamese')
         for style in ('normal', 'italic')]
VAR_DEVICE = 0x8000
NO_VARIATION = (0xFFFF, 0xFFFF)


def sx(value):
    return int(round(value * WIDTH))


class Gpos:
    """Scales x values in GPOS/GDEF and records which shared GDEF variation
    rows feed x values and which feed y values."""

    def __init__(self):
        self.seen = set()
        self.x_refs = []   # Device objects whose deltas must be scaled
        self.y_refs = []   # Device objects whose deltas must stay as they are

    def device(self, dev, axis):
        if dev is not None and dev.DeltaFormat == VAR_DEVICE:
            if (dev.StartSize, dev.EndSize) != NO_VARIATION:
                (self.x_refs if axis == 'x' else self.y_refs).append(dev)

    def value(self, rec):
        if rec is None or id(rec) in self.seen:
            return
        self.seen.add(id(rec))
        for name in ('XAdvance', 'XPlacement'):
            if hasattr(rec, name):
                setattr(rec, name, sx(getattr(rec, name)))
        self.device(getattr(rec, 'XAdvDevice', None), 'x')
        self.device(getattr(rec, 'XPlaDevice', None), 'x')
        self.device(getattr(rec, 'YAdvDevice', None), 'y')
        self.device(getattr(rec, 'YPlaDevice', None), 'y')

    def anchor(self, anchor):
        if anchor is None or id(anchor) in self.seen:
            return
        self.seen.add(id(anchor))
        anchor.XCoordinate = sx(anchor.XCoordinate)
        if anchor.Format == 3:
            self.device(anchor.XDeviceTable, 'x')
            self.device(anchor.YDeviceTable, 'y')

    def subtable(self, kind, st):
        if kind == 9:
            return self.subtable(st.ExtensionLookupType, st.ExtSubTable)
        if kind == 2 and st.Format == 1:
            for pair_set in st.PairSet:
                for rec in pair_set.PairValueRecord:
                    self.value(rec.Value1)
                    self.value(getattr(rec, 'Value2', None))
        elif kind == 2 and st.Format == 2:
            for c1 in st.Class1Record:
                for c2 in c1.Class2Record:
                    self.value(c2.Value1)
                    self.value(getattr(c2, 'Value2', None))
        elif kind == 4:
            for rec in st.MarkArray.MarkRecord:
                self.anchor(rec.MarkAnchor)
            for rec in st.BaseArray.BaseRecord:
                for anchor in rec.BaseAnchor:
                    self.anchor(anchor)
        elif kind == 6:
            for rec in st.Mark1Array.MarkRecord:
                self.anchor(rec.MarkAnchor)
            for rec in st.Mark2Array.Mark2Record:
                for anchor in rec.Mark2Anchor:
                    self.anchor(anchor)
        else:
            sys.exit(f'GPOS lookup type {kind} is not handled; extend the script.')


def scale_var_store(store, x_refs, y_refs):
    """Scale the rows x values use. A row shared with a y value is copied so
    the x users get a scaled copy and the y users keep the original."""
    y_rows = {(d.StartSize, d.EndSize) for d in y_refs}
    copies = {}
    scaled = set()
    for dev in x_refs:
        key = (dev.StartSize, dev.EndSize)
        data = store.VarData[key[0]]
        if key in y_rows:
            if key not in copies:
                data.Item.append([sx(v) for v in data.Item[key[1]]])
                data.ItemCount = len(data.Item)
                copies[key] = len(data.Item) - 1
            dev.EndSize = copies[key]
        elif key not in scaled:
            data.Item[key[1]] = [sx(v) for v in data.Item[key[1]]]
            scaled.add(key)


def condense(src, dst):
    # Keep upstream's head.modified so a rerun produces identical bytes.
    font = TTFont(src, recalcTimestamp=False)
    glyf, hmtx = font['glyf'], font['hmtx']
    pad = round(TRACKING * font['head'].unitsPerEm)
    order = font.getGlyphOrder()

    for name in order:
        glyph = glyf[name]
        if glyph.isComposite():
            for comp in glyph.components:
                comp.x = sx(comp.x)
                # A non-diagonal transform would not commute with x scaling.
                transform = getattr(comp, 'transform', None)
                if transform and (transform[0][1] or transform[1][0]):
                    sys.exit(f'{src.name}: {name} has a rotated or skewed component.')
        elif glyph.numberOfContours > 0:
            glyph.coordinates.scale((WIDTH, 1))
            glyph.coordinates.toInt()
    for name in order:
        glyph = glyf[name]
        if glyph.numberOfContours != 0:
            glyph.recalcBounds(glyf)
        advance, lsb = hmtx[name]
        # Zero-width glyphs (combining marks) take no tracking, as in CSS.
        tracked = sx(advance) + pad if advance else 0
        hmtx[name] = (tracked, glyph.xMin if glyph.numberOfContours != 0 else sx(lsb))

    for variations in font['gvar'].variations.values():
        for tv in variations:
            tv.coordinates = [None if c is None else (sx(c[0]), c[1]) for c in tv.coordinates]

    if 'HVAR' in font:
        for data in font['HVAR'].table.VarStore.VarData:
            data.Item = [[sx(v) for v in row] for row in data.Item]

    gpos = Gpos()
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            gpos.subtable(lookup.LookupType, st)
    gdef = font['GDEF'].table
    if getattr(gdef, 'LigCaretList', None):
        sys.exit(f'{src.name}: GDEF ligature carets are not handled; extend the script.')
    if gpos.x_refs:
        scale_var_store(gdef.VarStore, gpos.x_refs, gpos.y_refs)

    font['OS/2'].recalcAvgCharWidth(font)
    names = font['name']
    for rec in names.names:
        text = rec.toUnicode()
        if rec.nameID in (1, 3, 4, 16, 18, 21, 25):
            rec.string = text.replace('Newsreader', FAMILY)
        elif rec.nameID == 6:
            rec.string = text.replace('Newsreader', FAMILY.replace(' ', ''))
    names.setName(f'Newsreader, condensed horizontally to {round(WIDTH * 100)}% '
                  f'with {TRACKING}em added tracking for blancbrowser.com. Modified Version under the SIL Open Font License 1.1.',
                  10, 3, 1, 0x409)

    font.flavor = 'woff2'
    font.save(dst)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for file in FILES:
        target = OUT / file.replace('newsreader-', 'newsreader-condensed-')
        condense(SOURCE / file, target)
        print(f'{target.relative_to(ROOT)}  {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
