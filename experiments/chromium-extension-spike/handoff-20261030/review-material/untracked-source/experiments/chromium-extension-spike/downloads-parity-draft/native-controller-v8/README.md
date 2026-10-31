# Browser-owned Downloads controller v8 — weak rebind candidate

Separate unregistered candidate; v7 is preserved. Latest published release and direct tag were checked for this Downloads work item: Blanc v1.45.0, commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.

Independent v7 review found that observer teardown inside `ResetDocument` could destroy the host WebContents, navigate/delete the frame's document, or destroy the profile while the controller survives; v7 then used the pre-reset raw arguments. V8 captures the host weak pointer, `WeakDocumentPtr`, and profile weak pointer before reset, revokes the old binding even if arguments are invalid, then reconstitutes and rechecks all three identities after reset and the parent-profile lookup. It still relies on the browser-owned caller providing live objects on the UI sequence when capturing the weak references; no renderer-supplied pointers are acceptable. A reentrant newer bind is rejected using controller weak pointer, reset epoch and existing-binding checks.

A second review noted possible document/navigation change after item resolution. V8 checks the live bound document again immediately before marking a cancellation, then rechecks controller/epoch, entry and exact item lease/state. Chromium 158 `DownloadItemImpl::GetState()` reads its local state (`components/download/internal/common/download_item_impl.cc:867–869`); real browser callback and teardown behavior still needs validation. Earlier activation may still be consumed when a genuine race makes the final check fail.

The pinned Chromium 158 clang syntax-only check exited 0 (`syntax-command.json`, `syntax.log`); inherited environment and transitive inputs are not fully pinned. `weak-rebind-test.cc` compiles with `xcrun clang++ -std=c++20 -Wall -Wextra -Werror` and exits 0 with assertions, simulating all seven combinations of host/document/context destruction during detached fake-observer teardown while controller state survives. It uses `std::weak_ptr` and the actual generic reset helper, not Chromium `WeakDocumentPtr` or real browser lifecycle; it cannot establish native reentrancy safety. Existing v7 helper tests and v5 activation tests were not repeated.

This is not an exposed service or a product parity claim. Authoritative owner-window-to-host derivation, trusted receiver identity, live visibility and warning/enterprise action policy, resource bounds for abandoned snapshots, actual regular/private manager and item teardown, overlay activation and publisher timing remain open. A real build and focused native/browser tests are needed before registration. No native build, real browser, user profile, or release gate was exercised.

Frozen SHA-256:
- `download-controller.cc`: `3d48dfdcb6b8f9c24b693ad3070dfdb3821a303e15246ebd67db202735a45520`
- `weak-rebind-test.cc`: `048c6429b21739eb345ec251984bbb734c782b066893c99163532704cef809a0`
- Supporting v7 files remain byte-identical; see v7's README for identities.

Independent review of the frozen v8 found that weak host/document/profile capture addresses the specific v7 raw-pointer-across-reset issue, provided the caller initially supplies live UI-owned objects; the final document check improves the cancellation sequence. This is source review, not native lifetime or authentication proof. Authoritative owner-window-to-host binding, current live visibility and warning/action policy, and real browser/manager/item lifecycle remain unresolved. The candidate is still unregistered.
