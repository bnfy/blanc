# uBO source reproduction evidence — October 3, 2026

This is technical evidence for the pinned **1.75.0** package. It is not a
complete corresponding-source assessment or distribution clearance. No upstream
or deployed executable bytes were changed by this verification.

## Verified transformations

The source archive is `ublock/sources/uBlock-1.75.0.tar.gz`, SHA-256
`a518c7d6e6b3f81d1a738befeb617abba59f93bd6b1e626da079a1003e9db52b`.

The manifest was reconstructed using the exact documented operation in upstream
`tools/make-chromium-meta.py`: read `platform/chromium/manifest.json`, set its
version from `dist/version`, then serialize with Python JSON indentation 2,
separators `(',', ': ')`, sorted keys and a final newline. At version 1.75.0,
no development suffix is added. The reconstructed bytes exactly matched the
official package's `manifest.json`, SHA-256
`57c0aef971a2a5d84c7ed77cf53d5ad5f3631c5ae201349882f5cf30725ce254`.
This accounts for its transformation; it does not change the offline audit's
644 direct source matches.

Upstream `src/js/wasm/README.md` names WABT 1.0.29 and the default
`wat2wasm input.wat -o output.wasm` command. The local verification used the
portable npm WABT build (`wabt@1.0.29`, AssemblyScript/wabt.js) whose CLI reported
**1.0.29**. Its registry tarball was
`https://registry.npmjs.org/wabt/-/wabt-1.0.29.tgz`, with integrity
`sha512-taUwem3bYn5ZrDYSNqJ2lIAXA3t0Xon7rLjRa8PZ21h8vp0IP5SKyozcWFhv8PPC07KJkGWpDuSCnzSdJ01YsA==`.
This is the portable compiler build, not a claim that the original uBO release
used this npm package. The native WABT release reference is
[WebAssembly/WABT 1.0.29](https://github.com/WebAssembly/wabt/releases/tag/1.0.29).

| Shipped module | Reproduction | SHA-256 of identical output |
| --- | --- | --- |
| `js/wasm/biditrie.wasm` | Default wat2wasm, 999 bytes | `2db58b28e006faf146ef5d6841f6b6984b8eadc0e178eb2a9e47b8add7e0cd1f` |
| `js/wasm/hntrie.wasm` | Default wat2wasm, 1,034 bytes | `0a25fdbe20de09c39082be8ab7c8fa64a6b0908351ef37e9190f58e2de70d7ae` |
| `lib/publicsuffixlist/wasm/publicsuffixlist.wasm` | Default wat2wasm, 408 bytes | `2f28d659cfe8ee24f67ac7a59b77fe1ddba58f9e8755f95dc25418e6caf60425` |

To repeat, extract each module's WAT file from the pinned source archive into a
scratch directory. For each file run, for example:

```sh
npm exec --yes --package=wabt@1.0.29 -- wat2wasm hntrie.wat -o hntrie.wasm
```

Compare the full output bytes with the corresponding file under
`ublock/upstream/`, not only with an unverified report. The three module sources
are under `src/js/wasm/` and `src/lib/publicsuffixlist/wasm/` in the archive.
The local results are retained in `/private/tmp/pr490-wasm-source-proof/results.json`.
The pinned sources and commands above provide durable reproduction inputs;
temporary results alone are not a source offer or release attestation.

## Remaining inputs

LZ4 is **not** reproduced by the default command: 1,232 bytes versus 1,226
shipped. Its upstream README additionally calls `wasm-opt -O4`; the optimizer
version and byte-exact optimized reproduction remain unverified. The default
output mismatch is not classified as a source failure or a successful rebuild.

The 13 copied filter/metadata/license inputs come from uAssets main/production
branches according to `tools/make-assets.sh`; their exact pinned snapshots remain
present, but their preferred-source/input history still needs review. Build
reproduction for CSS Tree, js-beautify and HSLuv, font input provenance and
complete component notices remain open. The host/native SDK boundary and reserved
artwork terms also remain separate licensing questions. No distribution gate,
platform enable flag or component buildReproduced field was cleared.
