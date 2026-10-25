# Native chrome fonts

These are static instances of the repository's bundled
`src/renderer/pages/instrument-sans-latin-wdth-normal.woff2` (SIL OFL 1.1).
They use width 98 and weights 400/600, matching the desktop UI's width and
regular/semibold treatments. The native family is named `Blanc Instrument Sans`
to distinguish these instances from the upstream variable font.

Generated with fontTools `TTFont` and `instantiateVariableFont` using
`{"wght": 400, "wdth": 98}` / `{"wght": 600, "wdth": 98}`, with WOFF2 flavor
removed and name IDs 1, 2, 4 and 6 set for the static family and style.
`BrowserStyle` registers the fonts from the application bundle on first use.
The original copyright and license notices remain embedded in each font;
`OFL.txt` is copied from the upstream license bundled with the desktop app.

The native Liquid Glass clock uses `ClockInstrument.ttf`, `ClockInter.ttf`,
and `ClockFlex.ttf`, lossless SFNT repackagings of the desktop's respective
Instrument Sans, Inter and Roboto Flex WOFF2 variable fonts. Generated with
fontTools `TTFont(source); font.flavor = None; font.save(destination)`; axes,
outlines and embedded notices are unchanged. Core Text reads these directly
and supplies glyph outlines to SwiftUI's native `glassEffect(_:in:)`.
Inter and Roboto Flex's OFL notices are included alongside Instrument Sans's.
