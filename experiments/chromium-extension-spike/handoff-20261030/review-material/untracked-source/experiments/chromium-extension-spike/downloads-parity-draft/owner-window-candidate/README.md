# Downloads owner/window association candidate

On 2026-10-29 the GitHub latest-release API reported Blanc v1.45.0 and the
tag API resolved it directly to `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.
The shipping Downloads sheet and behavior remain the target; this is not a
complete Downloads feature.

`owned-download-controller.inc` supplies an unregistered wrapper in the
Chromium 158 Island implementation. The wrapper holds weak browser-owned
identities and checks that the host owns the exact `Owner`, that the owner's
window and profile match, and that the actual Island view installed in that
window contains the host. It delegates to the previously isolated v8 native
controller only after these checks. Private contexts still pass through v8's
existing regular-family and primary-OTR validation.

The wrapper SHA-256 is
`0b92c75c05cf5dec2954ba8e56d9eb14136960b56e6815777537ad7b25c03926`.
The combined 158 source with this include inserted has SHA-256
`5dedf627c662fb5d880438a242a4deaf0ec1614d7ad3f37d8706d58bc05ca5ad`.
Syntax-only `syntax-v3-command.json` records the pinned Chromium clang
invocation, exact hashes and result; it exited 0. The first syntax attempt
failed because a candidate-only module include directory was missing; the
second failed Chromium's out-of-line constructor/destructor style check. Both
failures are retained. The passing command inherits its environment, and all
transitive compiler inputs were not separately pinned.

This is **not registered**, linked, tested with real windows, or shipped. Its
owner check occurs before calling the underlying controller; the controller's
own nested document checks do not yet revalidate owner/window association at
the actual asynchronous or reentrant publication and action boundaries. An
independent review must assess lifetimes and ownership checks. Live item
visibility, cancellation eligibility, enterprise warnings, trusted IPC caller,
iframe gesture propagation, private teardown and snapshot/handle bounds remain
open. Fake or syntax-only checks cannot establish UI, security, or platform
parity. No original workspace, cache or user profile was modified.
