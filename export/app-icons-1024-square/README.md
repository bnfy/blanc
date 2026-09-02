# Blanc app icons — flat 1024×1024, square corners

All thirteen app-icon colorways exported as **1024×1024 PNGs with square corners
and no transparency** — the form you want for sharing or saving to a phone's
photo library (Photos renders a PNG's alpha channel as black, so the shipped
icons' rounded corners and transparent margin don't travel well).

Each file is the colorway's solid fill edge-to-edge with the "B" mark centered
exactly as it's drawn in the app icon — just without the rounded-square tile,
the surrounding margin, or (on `paper`) the thin edge stroke.

## Free colorways

`sunrise` · `sunrise-dark` · `paper` · `ink` · `graphite` · `default` ·
`midnight` · `cream` · `forest` · `sage`

## Supporter colorways

`ember` · `plum` · `gold`

`contact-sheet.png` is a labeled index of all thirteen (with hex fills); it is
not itself an icon.

The enhanced Sunrise masters are preserved separately as
`icon-sunrise-enhanced-1024.png`, `icon-sunrise-dark-enhanced-1024.png`, and
their 4096×4096 counterparts. The light enhanced 1024px artwork is the
canonical static source used by Windows, Linux, and iOS.

## Regenerating

```
pip install Pillow
python3 scripts/export-square-icons.py
```

Sources are `src/renderer/pages/icon-*.png`. Rerun after any mark or colorway
change. See CLAUDE.md → "App icon" for the shared tile geometry.
