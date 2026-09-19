# Blanc Tab Importer companions

These companions provide the live-window handoff entry path for Firefox and
Safari. They supplement Blanc's in-app Bring Your Tabs migration and organizer;
they do not read saved browser sessions or transfer source groups and pins.

`web-extension/` contains the shared Firefox and Safari implementation plus
the Firefox manifest; `manifest.safari.json` removes only Firefox-specific
manifest metadata for Xcode's Safari packager. Both variants request
only tab metadata plus network access to `https://tabs.blancbrowser.com`; it
has no content scripts, visited-site host permissions, or private-window
access. The selected URL/title list is AES-GCM encrypted in the extension
before the relay receives it.

## Firefox

Run `npm run lint:firefox` and `npm run build:firefox` from this directory.
`npm run sign:firefox` submits it as a listed add-on to AMO after the release
operator supplies Mozilla API credentials. Keep the returned Mozilla-signed
artifact immutable for that version. The stable add-on ID is
`tab-import@blancbrowser.com`. Store review and signing are release operations,
not part of local builds. The AMO manifest declares `browsingActivity` and
`websiteContent` because selected URLs and page titles are transmitted to Blanc,
even though the relay receives them only as ciphertext.

## Safari

On a Mac with full Xcode installed, run:

```sh
sh extensions/blanc-tab-import/prepare-safari-companion.sh
```

Apple's packager (called the converter in older Xcode releases) creates a
separate macOS containing app. Keep its
`me.bnfy.blanc.tab-importer` app and
`me.bnfy.blanc.tab-importer.Extension` extension identifiers, Developer ID
signing, notarization, and update channel independent from `Blanc.app`; do not
add its extension or entitlements to Blanc's existing signing/provisioning
chain. The generator normalizes Xcode's default parent identifier so the
embedded-extension prefix validation passes.

The containing app has independent bundle/build versions but does not inherit
Blanc's Electron update feed. Before distribution, publish and verify a
companion-specific signed update feed or another independently reviewed update
channel; never point it at Blanc's existing updater metadata.
