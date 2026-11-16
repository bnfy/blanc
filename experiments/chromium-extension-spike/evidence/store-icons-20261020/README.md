# Store result icons — October 20, 2026

Actual extension logos now appear next to live Island Store results. The public search item's serialized icon field is used instead of the first card image, which can be a promotional screenshot. Only exact HTTPS lh3.googleusercontent.com URLs without credentials, custom ports, queries or fragments are admitted. Browser-process downloads omit credentials, reject redirects, time out after six seconds and cap each image at256KiB, with at most six simultaneous requests. Only PNG/JPEG/WebP signature-qualified bytes become data-image URLs. No remote markup or script is inserted. A32-entry in-memory promise cache avoids repeated loads during installed-list refresh. Missing, refused or failed icons retain a letter fallback.

## Evidence

Six focused tests and scoped lint pass. Native UI in a unique-ID/executable disposable app copy shows both actual Dashlane logos (dashlane-icons.png). Enter opens its official listing. Native permission text and disabled Add safety delay appear; Cancel returns to the listing. Dashlane was not installed. The full install/action flow passed at parent262caa80 and was not repeated for this icon-only checkpoint.

The initial direct remote-img approach failed: the test Island was absent and the renderer reported Incorrect scheme / bad IPC123. That failure is preserved in runtime.log. The final path fetches images in the browser process and sends raster data URLs. Repaired native search/listing/prompt pass, with no bad-IPC messages in runtime-repair.log. Do not claim the direct path was accepted.

Two guarded incremental builds:35.74s and38.21s, six steps each. Final guard zero. Blanc-owned changes only; prior upstream49files/117hunks unchanged within49/120. Test copy/profiles removed; retained preview not restarted or navigated. Existing public English markup dependency remains; changed markup/unsupported formats fall back. Failure fallback is implemented but forced CDN-failure runtime coverage is not claimed. Other locales, personalized results and broad accessibility/responsive checks remain open. Latency deferred; Electron diagnostic build unapproved. Earlier Task0/F12 gates unchanged.
