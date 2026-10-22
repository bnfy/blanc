# Local self-contained Mac preview packaging

Reuse the existing native output; do not run the Electron release builder.

```
python3 preview/package.py --source '/path/Blanc Prototype.app' --assets generated --blocker /path/pinned-blocker-assets --output '/new/path/Blanc Chromium Preview.app'
python3 preview/test_launcher.py
```

Run from the spike directory. Output must not exist. The packager compiles only its small arm64 entrypoint, copies resources, rewrites helper/framework bundle identifiers and ad-hoc signs/strict-verifies the staged app. It never overwrites source output or profiles. Default launch uses a separate preview profile. Chromium's explicit user-data-dir override remains available for disposable testing. Assets cannot be overridden through this launcher.

This is local candidate preparation, not distribution approval. Developer ID signing, hardened runtime/entitlements, notarization, native keychain/service namespaces and quarantined acceptance require separate qualification. Never publish this ad-hoc artifact as a public preview. See evidence/preview-package-20261022 for retained failures and bounded acceptance.

The launcher and outer bundle now explicitly target macOS 26, the approved preview minimum, instead of inheriting the build host's SDK default. Native Chromium's own deployment target remains unchanged.

`sign.py --app <staged-preview.app> --identity <Developer-ID-fingerprint> --entitlements <Chromium-chrome/app> --report <json>` signs a staged preview inside-out using Chromium's app/renderer/GPU entitlements. Run through the signing Mac's desktop security session when SSH lacks private-key access. It does not export a key, build Electron, notarize, publish or qualify a release. Preserve failed attempts and verify the final signed bundle before notarizing.
