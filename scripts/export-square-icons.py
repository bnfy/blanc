#!/usr/bin/env python3
"""Export every Dock colorway as a flat, full-bleed 1024x1024 PNG with
square corners and no transparency — the form you want for sharing or
saving to a phone's photo library (which renders alpha as black).

The shipped icons (src/renderer/pages/icon-*.png, and the identical
build/icon.png) are an 824x824 rounded-square tile inset 100px into a
1024 canvas, with the "B" mark centered and a transparent margin around
the tile (see CLAUDE.md "App icon"). This script keeps the mark exactly
as-drawn and repaints everything around it with the tile's own fill
color, so the rounded corners and the transparent margin become one
solid square. The light `paper` colorway carries an 8px edge stroke to
define its near-white tile against a white page; that ring hugs the tile
edge, well outside the centered mark box, so cropping to the mark box
drops it cleanly.

Needs Pillow (`pip install Pillow`). Rerun after any mark/colorway change.
"""
import glob
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC_DIR = os.path.join(ROOT, "src/renderer/pages")
OUT_DIR = os.path.join(ROOT, "export/app-icons-1024-square")

# Centered region that fully contains the mark (ink bbox ~x[341,731]
# y[251,772]) while staying clear of paper's edge ring (<108px in).
BOX = (170, 170, 854, 854)

# Free colorways first (settings.js APP_ICON_LABELS order), then supporter.
ORDER = ["paper", "ink", "graphite", "default", "midnight",
         "cream", "forest", "sage", "ember", "plum", "gold"]


def square(src_path, out_path):
    im = Image.open(src_path).convert("RGBA")
    bg = im.getpixel((512, 160))                    # flat, opaque interior fill
    base = Image.new("RGBA", (1024, 1024), bg)      # full-bleed, square corners
    flat = Image.alpha_composite(base.copy(), im)   # bg + all opaque art (mark, +ring)
    base.paste(flat.crop(BOX), (BOX[0], BOX[1]))    # keep only the mark box
    base.convert("RGB").save(out_path, "PNG")       # drop alpha -> photo-safe
    return "#%02X%02X%02X" % bg[:3]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    found = {os.path.basename(p).replace("icon-", "").replace(".png", ""): p
             for p in glob.glob(os.path.join(SRC_DIR, "icon-*.png"))}
    for name in ORDER:
        if name not in found:
            print(f"skip {name}: no source icon-{name}.png")
            continue
        out = os.path.join(OUT_DIR, f"icon-{name}-1024.png")
        hexc = square(found[name], out)
        print(f"wrote {os.path.relpath(out, ROOT):48s} bg={hexc}")


if __name__ == "__main__":
    main()
