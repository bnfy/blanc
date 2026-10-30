# Live Downloads policy candidate

GitHub latest release was checked for this work: v1.45.0, direct tag commit
`6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. Released `src/main/downloads.js`
adds in-flight rows on `will-download` before a destination necessarily exists,
and includes active rows ahead of finished regular/private family rows.
Chromium 158's `DownloadsListTracker::ShouldShow` additionally hides temporary,
transient, trusted-extension, no-name/target/URL, and model-suppressed items.

This **unregistered draft** reads the current item and `DownloadItemModel`,
checks the attached context against a browser-supplied exact profile, reads
current Chromium command eligibility and the history-deletion preference,
then evaluates the separately testable `policy-core.h`. It preserves an early
or blocked eligible row as **metadata pending**, instead of silently dropping
it because its destination, name, or URL is not ready. A future renderer must
use a localized generic label without leaking a path, and must provide a reviewed
native warning route. Native-hidden, trusted-extension, temporary, transient,
unknown-state and silent-block entries are hidden. A visible active item may
offer cancel when Chromium's live model permits it; this is not a warning
bypass. Open/show/resume and conservative completed-record clearing require
the existing positive-safe classifier, appropriate item state, and applicable
native eligibility or history policy. Sensitive keep/discard/bypass/retry
operations are not exposed. Re-read the policy at dispatch; client hints do
not authorize an action, and dispatch does not confirm completion.

This is intentionally conservative, **not complete shipping behavior**: the
current classifier treats ordinary `NOT_DANGEROUS` as unknown, so most normal
downloads would not get open/show actions; clearing interrupted/cancelled
history and retry remain unsupported. `kMetadataPending` is a policy outcome,
not a rendered, localized or accessibility-tested row. It has not been proven
that all blocked/native-warning cases should be visible in Blanc's sheet.

Exact context identity is **not family authorization**: the future browser-owned
controller must first verify the regular owner and its primary OTR context and
manager epoch, authenticate the current document/window/gesture, observe item
and profile lifetimes, and revalidate all conditions immediately at dispatch.
The adapter is synchronous but model construction and helper calls have not
been proven non-reentrant; do not invoke on a potentially stale item or wire it
to UI until destruction, private teardown and warning-policy races are tested.
It neither registers an endpoint nor executes any command.

`policy-core-test.cc` compiled with `/usr/bin/clang++ -std=c++20 -Wall -Wextra
-Werror -UNDEBUG` and exited 0; `nm` confirms `___assert_rtn`. The cases cover
early metadata, warning cancellation, silent blocks, safe/unknown states,
native action eligibility, history preference and hidden/context cases. These
use synthetic inputs, not actual DownloadItems. `live-policy.cc` passed pinned
Chromium 158 cached-clang syntax-only (`syntax-v2-command.json`/`syntax-v2.log`);
the first attempt failed because the history pref header was wrong and is
retained in `syntax-command.json`/`syntax.log`. The reused compile command
inherited the environment and was not linked or run in a browser. No Chromium
build or user profile was touched. Independent review is required.

Frozen SHA-256: `live-policy.cc`
`46b3ad4f4cc741cc901dc36d5bd49b2c3d3c83c4e7caff725a797f98dfe0bbc6`;
`live-policy.h` `80bf96fb76d15d64950dbb790fe047155bf485921c299549a694112363f81a58`;
`policy-core.h` `d316e3b64753342fd6c7b961772acd3c06f316b4c1d9755926c1fd48d6c7a11e`;
`policy-core-test.cc` `7065fa211fdbe1b7fb15f7104832729e87d7504d96e01a25a511e08eb06858c7`.
