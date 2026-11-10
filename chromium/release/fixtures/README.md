# Offline test data only

Every digest, candidate, minimum OS and key in release.json is synthetic.
It is a schema example, never a release input. No signing identity was queried.
Tests create ephemeral Ed25519 keys in memory; no private key is written.
Native certificate/profile fixtures are observations, not Apple credentials.
blanc-beta.profile.json is the exception: it records what `security cms -D`
shows for the committed ../blanc-beta.provisionprofile (public data, no secret),
without the raw certificate and DER blobs, so the policy is tested on a real shape.
No app, Chromium checkout, keychain, production service or network is needed.
