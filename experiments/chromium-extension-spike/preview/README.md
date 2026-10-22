# Local self-contained Mac preview packaging

Reuse the existing native output; do not run the Electron release builder.

```
python3 preview/package.py --source '/path/Blanc Prototype.app' --assets generated --blocker /path/pinned-blocker-assets --output '/new/path/Blanc Chromium Preview.app'
python3 preview/test_launcher.py
```

Run from the spike directory. Output must not exist. The packager compiles only its small arm64 entrypoint, copies resources, rewrites helper/framework bundle identifiers and ad-hoc signs/strict-verifies the staged app. It never overwrites source output or profiles. Default launch uses a separate preview profile. Chromium's explicit user-data-dir override remains available for disposable testing. Assets cannot be overridden through this launcher.

This is local candidate preparation, not distribution approval. Developer ID signing, hardened runtime/entitlements, notarization, native keychain/service namespaces and quarantined acceptance require separate qualification. Never publish this ad-hoc artifact as a public preview. See evidence/preview-package-20261022 for retained failures and bounded acceptance.
