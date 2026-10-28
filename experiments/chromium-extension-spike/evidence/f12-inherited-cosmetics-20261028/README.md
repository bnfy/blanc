# Inherited-origin cosmetic coverage

Signed569d830d baseline fails srcdoc inherited scriptlet selection. The repaired browser derives HTTP(S) identity only from its own nonopaque committed origin for about:blank/srcdoc. The renderer permits those same documents; opaque and non-web documents remain excluded. Callback freshness still uses the actual document URL, not the derived selection origin. No renderer-supplied hostname is trusted.

Eight-step incremental build38.58s; normal guard0. Six checks each in regular/private srcdoc fixtures pass, including opaque sandbox scriptlet/CSS exclusion. Four about:blank checks pass in each regular/private fixture. All20new affected native controls pass; all browsers exit0. These are new affected native checks; previous normal-document/signed20 suites are unchanged and were not repeated. Signed replacement and source evidence publication follow; no aggregate gate credit.

Follow-up CodeQL5eddf16f reports no new alerts, confirming the prior four fixture findings are resolved. Remaining CI jobs and F12 procedural/exception/provider coverage remain open. Electron paused, Google separate, latency deferred.
