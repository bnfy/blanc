# Utility loss after ready prefetch — October 21, 2026

Two regular/private diagnostic schedules complete. **Previously allowed prefetch
is consumed after utility loss without a new engine decision.** This is not a
consumption-time fail-closed pass. No production repair is included.

Each isolated profile loads a source page, inserts one immediate speculation rule,
and waits for CDP Ready. Initial native mainFrame allow and the server's
sec-purpose: prefetch arrival precede the loss. The fixture verifies the unique
browser owning its disposable user-data-dir and unique Blanc utility child, then
kills that child only. A fresh fetch receives native engine-error/-1/block and
never reaches the server, establishing loss before consumption. A subsequent
link navigation consumes the ready response: fromPrefetchCache=true, no new
server arrival, and no additional native decision for that URL in either context.

Initial request enforcement remains proven; consumption-time revalidation after
provider loss is absent in this bounded path. This does not demonstrate a new
network leak, a filter-policy bypass, or behavior after a policy change. The
engine explicitly allows mainFrame requests. Whether ready, previously allowed
responses should be invalidated or rechecked needs an explicit implementation
policy before claiming consumption-time fail-closed coverage. F12/Decision 2
remain open. Redirects, cross-origin serving, pending prefetch teardown, policy
changes, pre-prefetch, prerender and uBO remain unqualified.

Existing binary/engine/source hashes verified; no native compile; guard zero,
prior56files/134hunks unchanged. Profiles and certificate keys removed. Permanent
profiles/tabs and Google baseline untouched. Latency deferred; physical native
input and Electron diagnostic build pending. Fixture waits are not benchmarks.

Reproduce: prefetch-postready-loss-run.mjs CONFIG NEWROOT. validate.py checks the
observed boundary, not a desired refusal. SHA256SUMS covers archived members.
