# v1.27.0 live favicon canary refresh

The release from `47eb903a1ce9c74967d58221b4f65cfbb0fc1dde` passed the
press gate and built signed, notarized Mac arm64/x64 build 1274. Before tagging,
its primary live favicon matrix stopped on Stack Overflow. Both cold attempts
received `Forbidden - Stack Exchange`, with no icon declarations. The operator
connection also received an explicit access-denied page without remote
debugging. Public v1.26.0 reproduced the same page in a fresh profile; stock
Chrome loaded its Questions page. This is a retained site/client access limit,
not proof of a favicon rendering regression or a uBO regression. Direct
requests returned HTTP 403. The Stack Exchange homepage also refused Blanc.
No operator IP address, profile data, ray identifier or page content is retained.

Replace that sampled target with PostgreSQL, another real public developer
site with a declared ICO. The primary matrix still has 26 unique sites and the
additional matrix 26. Fresh-profile launches, icon acquisition, real PNG bytes,
32-pixel dimensions, minimum image size, background audio refusal, retry bounds
and the first-party vector-quality comparison are unchanged. No runtime or
package input changes, skips, accepted error pages or security-policy changes
are introduced. This does not certify Stack Overflow access from Blanc on the
operator connection.

The existing signed candidate passes the full refreshed primary matrix (26
sites in six cold batches plus the Blanc vector-quality canary), the unchanged
additional matrix (26 sites in six cold batches), and migration from a fresh
public v1.26.0 download. Lint and the affected favicon policy/network/model tests
pass. The sanitized [machine-readable results](release-live-favicon-canary-2026-10-03.json)
retain the site observations and exact candidate executable/ASAR hashes.

The release script stopped before creating a version tag or draft. Local Mac
artifacts were not distributed. After the test/evidence correction passes
protected checks, the same unused version/build can restart through the whole
normal release script; these standalone diagnostics do not bypass its gates.
