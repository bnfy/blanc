# Offline test data only

Every digest, candidate and key in release.json is synthetic. Identity and
minimum OS reflect the approved policy.
It is a schema example, never a release input. No signing identity was queried.
Tests use only RFC 8032 TEST 2 public verification data from ed25519-vector.json.
They generate no keys and perform no signing; its one-byte message is not an app archive.
Native certificate/profile fixtures are observations, not Apple credentials.
blanc-beta.profile.json is the exception: it records what `security cms -D`
shows for the committed ../blanc-beta.provisionprofile (public data, no secret),
without the raw certificate and DER blobs, so the policy is tested on a real shape.
No app, Chromium checkout, keychain, production service or network is needed.
