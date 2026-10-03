# Sunrise placement and packaged source/notice evidence — October 3, 2026

The Sunrise remains visible in the approved popup and Dashboard presentation.
The modified extension references `blanc://ubo-brand/sunrise.png`; Blanc serves
only the existing PNG from its own resources. No image bytes are copied into
the adapted extension. Neither presentation dimensions nor artwork grants changed.
This packaging precaution is not a legal determination about the combined app.

`packaged-inputs.json` records the actual ASAR digest, the retained first-party
image digest, and every pinned source input delivered in an undistributed,
unsigned Linux x64 directory package built on macOS arm64. Both full GPL and
LGPL license copies matched their source bytes; the packaged verifier passed
all 39 license records and all 658 upstream files. The executable was not run
on Linux. This is payload evidence, not installed/platform/sandbox acceptance.

Reproduce the internal inspection from this source revision:

```sh
BLANC_UBLOCK_INTERNAL_BUILD=1 node_modules/.bin/electron-builder --linux --x64 --dir --publish never -c.directories.output=output/ublock/brand-source-inspection
node scripts/verify-packaged-ublock.js output/ublock/brand-source-inspection/linux-unpacked/resources/app.asar
node scripts/verify-packaged-compliance.js output/ublock/brand-source-inspection/linux-unpacked/resources
```

Local verification: lint, substrate and all 2,180 unit tests passed. The native
Dashboard suite passed, including an assertion that the actual Sunrise image
loaded. The original popup image assertion also passed in the wider native
uBO run. Two wider-suite failures remain recorded: one at original picker tools,
and one at original popup Logger reuse. Both traces showed native window blur
with no focused browser window, followed by production popup dismissal; the
provider remained ready. These attempts are not counted as passing full-suite
runs. Production blur behavior and the two-second decision deadline were kept.
Exact-head hosted CI still needs to validate the complete tools suite.

The source inventory confirms delivery and byte integrity. It does not certify
all third-party preferred-source questions, the native SDK boundary, or legal
clearance. No distribution or platform gate changed, and no CodeQL dismissal
was applied.
