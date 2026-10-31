# Native General Settings route — isolated Chromium 158

`settings-general1.json` passed using a fresh disposable profile and framework SHA-256 `6dfba4608b4099382af9dc2a801ce6374fc52d29717c70fa755bf2053c0baf7e`. The host's General action opened `chrome://settings/` and the page contained `settings-ui`. The unsupported `privacy`, `sync` and unrecognized section requests rejected and left the page target set unchanged. The fixture exited normally.

The isolated asset tree was copied from `Chromium Preview/evidence/development-matched-20261028/assets` with only current canonical `host.js` overlaid. `asset-manifest.json` records both source and fixture hashes; it was checked before launch. No live development asset or profile was modified. This verifies these route cases only; it does not establish shipping Settings behavior, section parity, accessibility or owner visual acceptance.
