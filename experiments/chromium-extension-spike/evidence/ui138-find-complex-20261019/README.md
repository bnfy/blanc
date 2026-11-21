## October 19 complex PDF/concurrent crash checkpoint

An authored four-page PDF adds two-column text, 90-degree rotated text, an image-only page and
an interactive AcroForm field. Structure checks confirm four pages, field value and widget; all
four Poppler page renders were visually inspected. Regular/private native Find each returns two
column matches, one rotated match and one form-label match. The actual form-field value and
image-only text both return final zero matches in both profiles: these are observed limitations,
not OCR or full form-content acceptance. No password-protected PDF check is claimed.

With regular and private PDFs open together, exactly two owned --pdf-renderer processes are
selected from the isolated profile and SIGKILL is sent in one host-clock-millisecond batch. Both
processes exit; both outer-page markers survive; each capsule closes. Reopened no-reload search
completes with zero matches, and reload independently restores two column/one rotated matches.
The kill calls share a batch, not a claim of simultaneous OS scheduling or exhaustive concurrent
crash coverage. Private context disposal succeeds. No main-plus-plugin or browser/GPU failure.

No production changes or compilation; guard zero actions (3.53s), binary hashes match the PDF
reset fix. Footprint remains40 files/96 hunks (not re-enumerated for evidence-only work). Disposable
profile/server removed; preview original tabs/empty status verified without restart. No new unit
suite, Electron comparison, physical input or performance claim. The source PDF, structural checks,
rendered pages, runtime observations and harness are archived.

Remaining: encrypted/password documents, XFA and form edits, OCR, embedded fonts/large PDFs,
main-plus-plugin and wider concurrent failure schedules, cache/process sharing/accessibility/full
visual coverage. Native input pending unlock; latency deferred; Electron diagnostic build remains
unapproved/unstarted. Plan item4 and previous F12/Task0 gates unchanged.

23 archive members hash verified; profiles/raw browser logs excluded.
