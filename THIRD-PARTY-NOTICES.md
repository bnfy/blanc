# Third-party notices

Blanc's software and its associated documentation are released under the MIT
License (see [LICENSE](LICENSE)). The components below are redistributed with
Blanc under their own terms, which the MIT grant does not supersede.

The notices that ship inside packaged Blanc builds are in
[src/THIRD_PARTY_NOTICES.txt](src/THIRD_PARTY_NOTICES.txt); this file is the
repository-level version of the same record.

## EasyList and EasyPrivacy filter lists — CC BY-SA 3.0 or later

Copyright (c) The EasyList authors — <https://easylist.to/>

The EasyList and EasyPrivacy filter lists are dual-licensed by their authors
under the GNU General Public License version 3 (or, at your option, any later
version) **and** the Creative Commons Attribution-ShareAlike 3.0 Unported
licence (or, at your option, any later version). The upstream statement is at
<https://easylist.to/pages/licence.html>.

**Blanc exercises the Creative Commons option** and redistributes these lists,
the checked-in data under `adblock/generated/`, and the compiled blocking-engine
data derived from them under
[CC BY-SA 3.0 or later](https://creativecommons.org/licenses/by-sa/3.0/legalcode.en).

Pinned sources, redistributed verbatim:

| List | Upstream | Pinned | SHA-256 | Path |
|------|----------|--------|---------|------|
| EasyList | <https://easylist.to/easylist/easylist.txt> | 2026-07-09 | `ceac7bd34d538ad448f05a7237b600485f2185a620d8ce32f77ae7365e1e662b` | `adblock/sources/easylist.txt` |
| EasyPrivacy | <https://easylist.to/easylist/easyprivacy.txt> | 2026-07-09 | `5b69cbb6958485b5688e76bf2a43a548acaa5cc57380aed7d3dc800da7e0bf6b` | `adblock/sources/easyprivacy.txt` |

**Transformed versions.** The files under `adblock/generated/` and the blocking
engine Blanc compiles at runtime are adaptations of the pinned sources above,
mechanically transformed by `npm run adblock:build` into other rule formats.
They are derivative works of EasyList and EasyPrivacy, carry the same
CC BY-SA 3.0-or-later terms, and require the same attribution to The EasyList
authors. See [adblock/sources/SOURCES.md](adblock/sources/SOURCES.md) for the
update procedure.

## 1Password JavaScript SDK — MIT

Copyright (c) 2024 1Password. Full licence text in
[src/THIRD_PARTY_NOTICES.txt](src/THIRD_PARTY_NOTICES.txt).

## Inter and JetBrains Mono fonts — SIL OFL 1.1

- `src/renderer/pages/inter-latin.woff2` — Copyright 2020 The Inter Project
  Authors. Full licence text:
  [src/renderer/pages/inter-OFL.txt](src/renderer/pages/inter-OFL.txt).
- `src/renderer/pages/jetbrains-mono-latin.woff2` — Copyright 2020 The
  JetBrains Mono Project Authors. Full licence text:
  [src/renderer/pages/jetbrains-mono-OFL.txt](src/renderer/pages/jetbrains-mono-OFL.txt).

Both font files remain under the SIL Open Font License, Version 1.1; Blanc's MIT
grant does not supersede those terms. The font files and their full licence texts
ship together inside packaged builds.

## Instrument Serif website font — SIL OFL 1.1

The website uses Instrument Serif Regular for Blanc Patron's display typography,
self-hosted through `@fontsource/instrument-serif` 5.3.0. It is a website-only
asset and is not bundled in the desktop application. The font remains under
the SIL Open Font License, Version 1.1; Blanc's MIT grant does not supersede it.
The full copyright notice and licence ship with the website at
[site/public/fonts/instrument-serif-OFL.txt](site/public/fonts/instrument-serif-OFL.txt).
Upstream: <https://github.com/Instrument/instrument-serif>.

## Lucide Panel Left icon — ISC

`src/renderer/panel-left.svg` is adapted from Lucide's Panel Left icon.
Copyright (c) 2026 Lucide Icons and Contributors. It remains under Lucide's ISC
License; the full notice ships in
[src/THIRD_PARTY_NOTICES.txt](src/THIRD_PARTY_NOTICES.txt). Upstream:
<https://github.com/lucide-icons/lucide>.

## Runtime dependencies

Blanc is built on Electron (MIT) and bundles the Chromium engine, which carries
its own BSD-style licence and third-party notices. Blocking uses
`@ghostery/adblocker-electron`. Dependency licences resolve through
`package-lock.json` and are not vendored into this repository.

## Names, logos, and trademarks

The MIT License grants copyright permissions only. It conveys no rights in the
**Blanc** or **Bananify Creative** names, logos, or other trademarks, whether
registered or unregistered. You may build, modify, and redistribute the
software; you may not present a modified build as Blanc, or use the Blanc or
Bananify Creative names or logos to endorse or identify your build without
permission.

Specific artwork that is not covered by the MIT grant is enumerated in
[ASSET-LICENSE.md](ASSET-LICENSE.md). No directory is excluded wholesale.
