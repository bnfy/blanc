

# Hot profile deletion during pending cross-owner save — October21

Two final clear/encrypted schedules pass30 checkpoints on the unchanged normal ec90a8e6 binary. A partial-close EIO establishes pending session repair. An actual cross-owner Session write is then held in the disposable Default profile while a separate regular Profile1 remains alive in the same browser process. From Profile1, the native chrome://profile-picker handler gathers Default statistics and invokes removeProfile for the exact disposable Default path. No directory unlink or native diagnostic substitutes for deletion.

While the write remains held, Default disappears from the profile registry and its source/decoy windows close; the browser process remains alive. The pending caller disconnects with no success acknowledgement. Release the barrier and verify Profile1 can create and acknowledge fresh history. Clean exit and restart explicitly into Profile1 preserve its independent tab exactly once, do not resurrect Default tabs, and remove the Default directory including a disposable sentinel. Profile1 remains usable after restart.

Chromium DeleteProfileHelper intentionally defers physical directory cleanup until startup after successful polite deletion; same-process removal from the registry/windows plus subsequent directory cleanup is the observed native contract. This does not trace the exact C++ Profile destructor or every late backend callback, force destruction while native keep-alives remain, or qualify cancellation of the delete operation, arbitrary multiple profiles, OS provider failure, pre-ack crash/powerloss or physical UI input. The caller-disconnection observation is not a durability acknowledgement.

Initial clear attempt failed before deletion/barrier setup: Island createTab normalized chrome://profile-picker/ into a Google search. Retained as a fixture failure, excluded from30passing checkpoints. Corrected runs create a local fixture tab in Profile1 and navigate directly with CDP to the native picker. A transport helper now rejects pending commands on target disconnect instead of waiting for a synthetic timeout. No Web Store, permanent profile, or retained preview state used.

No product changes, native build, or interposer recompilation. Seven capture tests pass; final guard zero; prior54/128unchanged. All owned test processes exited and disposable profiles removed. Retained dev/upgrade baseline and permanent profiles/tabs untouched. Plan/evidence updated, uncommitted; CI monitoring of ec90a8e6 continues. Native input pending; latency deferred; Electron diagnostic build pending approval and unstarted.

Evidence: evidence/hot-profile-delete-20261021.
