# Redirect headers and URL replacements — October24

**Result: header behavior passes within the tested scope; URL-replacement enforcement fails in both regular and private contexts, including the accepted signed candidate. This is not an all-pass checkpoint.** The mechanism requires explicitly enabled, privileged DevTools interception; these tests do not demonstrate an exploit reachable from ordinary untrusted webpage script.

## Header observations and fixture correction

The first native run has four passing assertions: exact CDP/native identity join, correct profile, header removal/addition at the first redirected request, and restoration of original headers at the next hop. It then fails an incorrect fixture assumption that modified-header counts must be nonzero at Blanc's `FollowRedirect` boundary. [Initial report](initial-report.json) and trace are retained.

The [source routing](source-boundary.json) and captured trace establish why: the browser appends Blanc before DevTools. Header overrides are applied by the downstream DevTools interceptor, after Blanc forwards unchanged `FollowRedirect` parameters. The corrected private header case in [native report](report.json) passes six assertions, including two native forwards with zero modified/removed counts, three allowed hop decisions, and the expected actual server headers. The passing regular header traffic was not repeated. This proves these controlled custom-header edits/restoration, not arbitrary header validation, credentials or CORS-exempt modifications.

## Reproduced URL-replacement failure

The native report finishes all its cases: **28 assertions pass and four fail**, including both allowed replacement recheck expectations and both blocked replacement expectations. The allowed original redirect target never reaches the server. Replacing it with `googleads.g.doubleclick.net` mapped to loopback sends an actual GET to that host and returns its response, despite no new Blanc decision for the replacement. The trace contains only the decisions for the initial URL and its original redirect, under the independently hashed CDP request ID.

`InterceptionJob::InnerContinueRequest` cancels the current load on modified URL and restarts it through its own downstream target factory. `URLLoaderFactoryBuilder` processes proxies in append order; content calls the Chrome hook (which appends Blanc) before appending DevTools. Consequently the restart occurs below Blanc. Blanc's existing rejection of a non-null optional `FollowRedirect` URL does not protect this distinct path: DevTools forwards a null optional URL and performs the replacement through cancellation/restart. The direct optional-URL rejection remains source-verified, not a directly executed native API test.

## Signed-candidate confirmation

[Signed report](signed-report.json) contains **four passing assertions and two failing replacement assertions**: in each context, a direct request to the blocked host fails with ERR_BLOCKED_BY_CLIENT and no server arrival; the replaced request succeeds and reaches the same host; the browser exits cleanly. These are only the newly affected replacement path and its necessary control, not a repeated signed recovery/owner suite. The sealed launcher uses its own bundled assets. Its first attempted invocation rejected unsupported asset-override arguments before browser startup; that timeout record is retained separately. No signer, notarization, package, owner profile or permanent tab was changed.

## Build, scope and next action

The only native source change is [opt-in tracing](trace.patch) of digest, header counts, replacement presence and forwarding disposition. It records no URLs or header values, alters no request behavior and adds no persistent writer. One incremental build passed: one planned action, six steps,31.74seconds, final guard0. The last upstream inventory remains73files/180hunks; only copied Blanc source changed. [Identity](identity.json) and [candidate source delta](candidate-source-delta.patch) bind the tested code and signed binary; the relevant proxy ordering and redirect implementation are unchanged from signed source14706b0e.

**F12 remains blocked on this concrete privileged-path enforcement gap.** Repair must ensure modified requests are checked after DevTools mutation/restart while preserving native redirect/security validation and header behavior. Recheck only these affected cases initially; do not restart already-passed matrices automatically. No repair or full acceptance is claimed here. Existing L7 default-mode approval is not extended to this previously untested privileged path; its release disposition needs to include this finding. The prior9/12 count does not signify full F12 or release approval.

All five task profiles were removed after verified process exit. Electron remains paused, Google baseline separate, and latency deferred.
