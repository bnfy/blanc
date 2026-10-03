# uBO component source rebuilds — 2026-10-03

These are source-provenance observations, not licensing or distribution
clearance. The original `ublock/upstream/` bytes were not modified. Exact input
and output digests are in [results.json](results.json).

Both builds used the immutable source archives already recorded in
`ublock/preferred-sources.json`, their own committed npm lockfiles, Node 22.17.0,
and isolated working directories. Install dependencies with
`npm ci --ignore-scripts --no-audit --no-fund`; no upstream publish scripts run.
The dependency graphs are build-only and do not become Blanc runtime inputs.

## js-beautify 1.14.7

Extract `ublock/sources/js-beautify-1.14.7.tar.gz`, install the locked dependencies,
and run `node node_modules/webpack-cli/bin/cli.js` in the extracted root. The
upstream webpack configuration produces `js/lib/beautifier.min.js` (104,192
bytes). Appending one LF byte reproduces all 104,193 shipped bytes exactly.
Webpack is 5.74.0 and the exact minifier versions are recorded in results.json.
The copied uBO README identifies the CDN's 1.14.7 production file as its input.
This establishes a preferred-source build plus a fully specified trailing-line
normalization, not merely a match to another prebuilt minified file.

## CSS Tree 2.2.1

Extract `ublock/sources/css-tree-2.2.1.tar.gz`, install the locked dependencies,
and run `node scripts/bundle.js`. Use its **ES module** output
`dist/csstree.esm.js`, not the IIFE `csstree.js`. The compiler is esbuild 0.14.53.

The shipped file has a 276-byte jsDelivr comment before the ES module. After
removing that comment for comparison, exactly **one byte** differs: the rebuilt
module exports version `2.2.1`, while the shipped module exports `2.2.0`.
Everything else in the 167,697-byte module is identical. The pinned source is
therefore a matching implementation, but this is **not** a byte-exact unmodified
build. No result field claims otherwise. Replacing the one version literal and
prepending the preserved comment would reproduce the exact file; that is a
specified metadata transformation, not evidence about the original publisher's
build procedure. The original runtime continues to use the pinned upstream file.

## Still open

HSLuv's pinned archive includes preferred Haxe source, JavaScript exports,
build definitions in `default.nix`, and a browser distribution identical to the
shipped file. Its Haxe/Closure rebuild has not been run. Its Nix definition pins
nixpkgs revision `3ab38ef086947822fbe2cffea071e1c508811990`; the build-only
`browserDist` target avoids the repository's publishing and credential wrappers.

LZ4 optimizer reproduction, font and separately fetched filter provenance,
individual notices and the concrete combined-work/native SDK/artwork assessment
remain open. A qualified distribution review should determine each component's
actual source obligations; byte-exact compiler output alone is not clearance.
