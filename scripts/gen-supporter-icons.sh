#!/usr/bin/env bash
# Regenerate the supporter-only Dock colorways from icon-default.png,
# which serves as the geometry template (see CLAUDE.md "App icon").
# icon-default.png is dark bg + near-white mark, so its flattened
# grayscale is a ready-made blend mask (0 = background, 1 = mark, with
# antialiasing preserved); recoloring composites mark-color over bg-color
# through that mask, then re-applies the original alpha (the tile shape).
# Colors live here and nowhere else; rerun after any mark change.
set -euo pipefail
cd "$(dirname "$0")/../src/renderer/pages"

TEMPLATE=icon-default.png
TEMPLATE_BG='#2F4639'

gen() { # id bg mark
  magick \( -size 1024x1024 xc:"$2" \) \
    \( -size 1024x1024 xc:"$3" \) \
    \( "$TEMPLATE" -background "$TEMPLATE_BG" -alpha remove -colorspace gray -auto-level \) \
    -composite \
    \( "$TEMPLATE" -alpha extract \) -compose CopyOpacity -composite \
    -depth 8 "icon-$1.png"
  echo "wrote icon-$1.png"
}

gen ember '#824C3B' '#F6EDE4'
gen plum  '#4A3B52' '#E6DFEE'
gen gold  '#201B10' '#C2A566'
