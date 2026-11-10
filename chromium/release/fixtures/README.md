# Offline test data only

Every digest, candidate, minimum OS and key in release.json is synthetic.
It is a schema example, never a release input. No signing identity was queried.
Tests create ephemeral Ed25519 keys in memory; no private key is written.
Native certificate/profile fixtures are observations, not Apple credentials.
No app, Chromium checkout, keychain, production service or network is needed.
