# Native observations and owner confirmation

The owner first reported page clicks did not activate the inactive pane, then confirmed the right text box could not receive typing. The initial page-input observer passed protocol input tests but failed that real owner test. Its code was removed, and those results are retained only as evidence of the inadequate test method.

The corrected build routes in-process WebContents NSView hit tests through the enclosing Views targeter. The transparent Island now rejects native hits outside its actual controls, leaving AppKit to choose the page beneath it. No renderer IPC, permission or network surface was added. Remote app-shim views keep the prior fallback and are not qualified by this repair.

Native accessibility-driven mouse input on the corrected preflight app changed the active window title from Pane /left to Pane /right when clicking the right page input. Typing placed “native right” in the right input; clicking and typing in the left input produced “native left” and made the left pane active. The same test on the Developer ID signed app used “signed right” and “signed left,” with correct native active-pane state and distinct retained values. These tool observations are transcribed, not claimed as a raw VoiceOver recording.

Native Actions opened a menu containing Reload, Mute tab, Pin tab, Remove from Split View, Close tab and Close Split View. Escape dismissed it and returned focus to its launcher. The full-height divider was accessible: Right moved 50 to52, Home moved to its defined20-percent minimum, Return reset50. Focus rings remain; the persistent border/ring stack around the headers and content is removed. Active pane identification uses a subtle header fill.

The owner then explicitly confirmed the corrected signed app: “Yes, both panes activate and typing works.” This is bounded acceptance of physical pane clicking and typing, not full L5 or VoiceOver approval. Divider drag/reset, matched visual acceptance, extension/theme interactions and wider native-input checklist remain pending.

The original owner session also left “Tab closed, but history persistence failed or timed out.” visible, with the same error in its browser log. That is an unresolved L6 close-history regression finding. It is not erased by the new candidate’s75 passing focused regression checks.
