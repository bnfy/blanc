# WebTransport hot deletion and crash/restart — October21

**Unresolved runtime failure:** a pending service-worker transport completes an
HTTP/3 CONNECT and datagram exchange after native removal of its regular profile
from Local State and closure of its page, when the held engine decision resumes.
The weak BrowserContext is still alive and the decision is allow. Do not treat
CI success or the independent crash controls as closing this gap.

Three final schedules: one hot-delete failure, two crash/restart passes. No
production repair was made in this test checkpoint.

## Hot-profile deletion

An independently initialized regular Profile1 window shares the disposable
browser with Default. From Profile1's native profile picker, `removeProfile`
deletes Default while an activated Default service worker has an explicitly
logged native-pending transport and the verified blocker utility is suspended.
The harness confirms Default's registry entry is removed, its page closes and
the browser survives before resuming the utility. A real server CONNECT and echo
then arrive: an unwanted continuation after removal was initiated. This does
not prove that the C++ profile object was already destroyed; the native decision
explicitly records context_alive=true.

The surviving Profile1 remains usable. A clean restart into Profile1 confirms
Default's registry and directory are absent, no transport is automatically
replayed, and a fresh HTTP/3 exchange works. These successes do not erase the
late connection. Next repair should gate pending completion on profile deletion/
shutdown admission, not solely WeakPtr existence; Chromium exposes
IsProfileDirectoryMarkedForDeletion and BrowserContext::ShutdownStarted for
investigation. No causal fix is claimed from source inspection alone.

## Crash controls

Regular/private service-worker requests are held after positive real HTTP/3
controls and native pending evidence. SIGKILL targets only the exact disposable
browser PID. Its suspended child utility is resumed for teardown; no pending
handshake arrives. Restart uses the same disposable user-data-dir; no automatic
transport replay occurs during1.5seconds, and fresh connections work (a newly
created private context for the private case). This is browser-process crash
handling, not machine power loss or persistence of an interrupted transport.

## Evidence and limits

Initial run failed a premature Preferences-file assertion before hot deletion;
its crash controls passed. Second run waited for initialization and exposed the
actual late-handshake failure. Third run retains that failure and completes
survivor/restart observations. Earlier runs are retained separately, not counted
as additional unique passes. validate.py checks observed outcomes including the
failure; successful validation does not mean all runtime cases pass.

Existing binary/source unchanged, no build, guard0; prior56files/134hunks not
recounted. Scoped lint/syntax/diff checks pass. Disposable profiles/keys removed.
Google baseline and retained preview untouched. Hot-deletion repair is the next
priority before closing this transport boundary. Concurrent requests, powerloss
and provider composition remain unqualified. Claude's primary plan updated;
F12/Decision2 remain open. Native input pending, latency deferred, Electron
 diagnostic build pending approval/unstarted.
