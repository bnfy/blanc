# Native Store search acceptance — October 20, 2026

Tested UI commit 8bf941d841a0b0da1cf157432b1051dd930d6670 in the existing Chromium 157 build with a fresh disposable profile. All interaction below used native computer automation, not script-generated clicks.

- Opened Extensions menu, typed Extensity in Find an extension, pressed Return on the search action. Actual URL became https://chromewebstore.google.com/search/Extensity and results included the official Extensity listing.
- Opened official listing jjmflmamggggndanpgfnpelongoepncg (1.14.0). Add to Chrome displayed native Add "Extensity"? sheet with Manage your apps, extensions, and themes. Add extension was initially disabled, then became enabled after the safety delay.
- Cancel returned to Add to Chrome without installation. Reopening and accepting produced the native Extensity has been added to Chromium bubble and Remove from Chrome on the listing.
- Reopened picker and typed Extensity: installed action and Store-search action both present. Down selected Store search; Up/Return opened the actual Extensity extension popup. This verifies installed actions are preserved alongside discovery.
- Escape closed popup. Native Remove from Chrome confirmation and Remove completed; Add to Chrome and Extensity has been removed from Chrome verified. Browser quit normally; disposable profile removed.

Saved raw AX snapshots cover the combined picker, installed popup and final removal. Earlier permission/search observations above are a narrative of tool-returned native AX, not exported raw snapshots. No private profile/cookies or credentials committed.

Setup observations: app lookup initially opened an extra empty default Chromium instance. Its native Quit menu closed it; automation then selected the correct disposable Blanc instance. An initial /extensions palette command had no match; testing used the actual Extensions menu. These are not passes for general command routing.

Remaining: inline Store banner "Switch to Chrome to install extensions and themes" is still visible, separate from the previously suppressed popover. It did not block installation. No authenticated sign-in, restart persistence, upgrade, private-profile installation, or broad native input qualification claimed. Latency remains deferred; Electron diagnostic build remains unapproved/unstarted. No source change or compilation; upstream footprint unchanged from 49 files/117 hunks.
