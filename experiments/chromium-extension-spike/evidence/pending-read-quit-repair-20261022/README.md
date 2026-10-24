# Pending-read Quit repair — October 22

The earlier signed recovery UI fixture replaced an encrypted session record with a FIFO. Opening it blocked the shutdown-blocking storage sequence; native Quit reached the teardown watchdog (exit2). This was an unsupported filesystem object, distinct from an outstanding encryption-provider callback.

Repair: POSIX session reads use O_NONBLOCK|O_CLOEXEC to open, then fstat the opened descriptor and accept only a regular file. This avoids a path-check/open race and rejects FIFOs/devices before reading. Regular session encoding/encryption and BLOCK_SHUTDOWN write durability remain unchanged. No watchdog extension, injected library, test-only runtime switch, or treating encryption timeout as an empty session.

## Signed checks

On the Developer ID signed replacement, six no-writer-pipe checks pass: startup remains responsive with valid saved tabs from the remaining record; Browser.close exits0 with no watchdog; restoring the backed-up regular encrypted record preserves NewTab,A,B; subsequent Browser.close exits0. Six real preview-keychain encrypted-only restart/loading-close/immediate-crash controls and four immutable-filesystem refusal/retry/immediate-crash controls also pass. All reports complete, no forced cleanup. Native recovery UI/resume observations remain in the preceding signed-recovery-ui evidence; FIFO is now rejected rather than a way to delay that UI. Actual macOS provider unavailability and permanently stalled regular-filesystem I/O remain unqualified.

Incremental build31.97seconds/6steps, final guard0; build-wrapper10/capture7/patch-counter11 tests pass. The additional prepare-layout test fails its pre-existing68px header string expectation in unchanged prepare.mjs; full output retained. Initial check-only build invocation and budget counter153 ceiling corrected to the owner-authorized62files/156hunks. No GN/toolchain changes, cold build, latency or Electron build.

Developer ID signing passed; Apple Accepted f527392f-6720-4974-b831-53f5ffa49c8b. Stapled ticket validation, strict deep signature and Gatekeeper assessment pass. Final ZIP SHA256 18272ab548d0117744209536bc24c0b6cc09ece38c01fec4976cf8e78899306f. Tested executable/framework hashes remain identical after stapling. Final-artifact.json binds the evidence to this archive.

Google ledger/upgrade-baseline changes remain excluded. Final separate Google/dev processes still exist but both CDP target inventories are empty; no relaunch/profile changes were made. This differs from earlier window snapshots and is recorded without claiming unchanged open tabs. Restricted signing access retained per owner preference. Launch progress1/12, delta0; L6 remains open for actual provider/remainder acceptance. No commit/push requested this turn.
