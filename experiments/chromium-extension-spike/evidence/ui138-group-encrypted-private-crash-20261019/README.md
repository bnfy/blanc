## October 19 encrypted legacy and private crash checks

The current binary writes a closed-group fixture using its configured mock keychain. With the
owned browser stopped, the harness decrypts the encrypted command13 using Chromium's public
mock password/derivation, removes only the appended collapse flag, adjusts the Pickle length,
and re-encrypts the command and updates its outer length. All other ciphertext remains intact.
Plaintext Tabs counterparts are removed from that disposable profile so they cannot supply the
restored group. After restart the native encrypted reader restores both URLs, name, color and
membership and defaults to expanded, as required for the absent field. File hashes and record
sizes are saved. No real keychain access, profile/key upload, older-binary execution or real-key
migration is claimed. This is a synthetic encrypted legacy-shaped fixture.

A fresh disposable browser retains a regular closed group, closes one private group (history
stays empty), and leaves another two-tab private group live when the owned browser is SIGKILLed.
Before killing, the harness verifies its profile command and persisted Crashed marker. After
normal restart no private URL/group is present in exposed tabs or Recently Closed; the regular
closed group still restores both tabs. A newly created private context has no groups/history,
and reopen-most-recent returns false. Context disposal leaves regular restoration intact.
This covers exposed native session behavior, not forensic absence of private bytes on disk,
automatic crash-restore-button interaction, all incognito lifecycles or OS/power-loss recovery.

No production change or compile; zero-action guard, binary hashes unchanged;41files/100hunks
(not re-enumerated). Disposable profiles/server removed, original preview/status preserved.
Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
Real-keychain/key rotation, older-binary rollback, malformed encrypted records, multiple private
contexts and wider concurrent/crash/visual scenarios remain gaps. Plan/evidence updated;
F12/Task0 and visualitem4 gates remain open. Routine testing only; cold column unchanged.

28 hashed archive members, all verified.
