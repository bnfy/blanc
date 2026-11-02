# Inherited-origin cosmetic coverage

Signed569d830d baseline fails srcdoc inherited scriptlet selection. The repaired browser derives HTTP(S) identity only from its own nonopaque committed origin for about:blank/srcdoc. The renderer permits those same documents; opaque and non-web documents remain excluded. Callback freshness still uses the actual document URL, not the derived selection origin. No renderer-supplied hostname is trusted.

Eight-step incremental build38.58s; normal guard0. Six checks each in regular/private srcdoc fixtures pass, including opaque sandbox scriptlet/CSS exclusion. Four about:blank checks pass in each regular/private fixture. All20new affected native controls pass; all browsers exit0. These are new affected native checks; previous normal-document/signed20 suites are unchanged and were not repeated. Signed replacement and source evidence publication follow; no aggregate gate credit.

Follow-up CodeQL5eddf16f reports no new alerts, confirming the prior four fixture findings are resolved. Remaining CI jobs and F12 procedural/exception/provider coverage remain open. Electron paused, Google separate, latency deferred.

## Combined production scriptlet safeguard

The native adapter now matches src/main/adblock-scriptlets.js: helper declarations are private per injection while Ghostery shared globals remain shared. Four new adapter controls reproduce unisolated proxy recursion, verify stacked fetch and Function.toString, and match the production wrapper exactly. New bundle0d830d30 is derived from authenticated parent9acdfb68. Six-step incremental36.90s/guard0. All20affected combined native checks pass across regular/private srcdoc, about:blank and opaque sandbox controls; browsers exit0. The intermediate1e943ad3 signing job completed and was removed, but that intermediate packet is preserved without qualification/notarization. Qualify the combined replacement once.

The separate chatgpt.com probe timed out and is excluded: offline selection returned zero scriptlets, so it cannot establish collision behavior. Its failed report is retained. The actual reduced proxy-collision control above remains valid. Procedural selectors are disabled by the existing ElectronBlocker implementation (node_modules/@ghostery/adblocker-electron/dist/commonjs/index.js:158), matching the native setting; broader support is a new capability rather than a missing current-parity feature. No aggregate F12 or gate closure yet.

## Combined signed acceptance

Source260f98ff, Apple Accepted76944658-9890-4866-9ef5-f7c076febc65. All20affected signed checks pass regular/private. Staple/ticket/strictsignature/Gatekeeper pass;457tested files unchanged afterstaple, onlyticketadded. Archive SHA256 `a323f660c99beecb2d085acb22f778081a8326474cb44e90b3df1a44e203d31a`. No original normal-document suite repeated. Temporary signing job removed; source/cache/artifacts/evidence durable. Current real-page/provider/per-site policy coverage and Decision2 remain explicit; no aggregate F12 or launch approval.
