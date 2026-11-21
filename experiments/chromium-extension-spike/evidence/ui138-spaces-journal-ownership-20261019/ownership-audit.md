# Durable window ownership audit — Chromium 157.0.8103.6

Source checkout pristine revision 41520584daa68d0040db7746ae562a0ff82187f6. Read-only audit; no upstream changes in this checkpoint.

- `chrome/browser/sessions/session_restore.cc:1335` receives restored window extra_data. Lines 1353–1355 assign restore_id only under IS_OZONE. Mac cannot use that ID as the prior-session identity. The subsequent extra-data handling recognizes individual existing features, not a generic Blanc token.
- `chrome/browser/sessions/session_service.cc:376` exposes AddWindowExtraData for incremental command storage. Writing a custom token once is insufficient: session rebuild must retain it too.
- `chrome/browser/sessions/session_service_base.cc:764` explicitly appends existing feature window metadata during rebuilding. A Blanc UUID would need corresponding rebuild coverage here.
- `chrome/browser/ui/browser_live_tab_context.cc:208` enumerates closed-window extra data, and the restore path around line 509 consumes named features. Both collection and restoration must retain a token if Recently Closed/window restoration can intersect pending intent.

Candidate implementation: generate an opaque browser-owned regular-window UUID; include it in intent and session window extra_data, retain it during session rebuild, and attach it to the restored BrowserWindowInterface before recovery considers that window. Reject missing/duplicate/unknown UUIDs and defer until session restoration settles. Do not reuse title, workspace, window order, URL similarity, or active focus as identity. A session save acknowledgement/durable ordering also needs proof before claiming the token survives a process crash.

Likely upstream touch points are session_service_base.cc, session_restore.cc and browser_live_tab_context.cc, none present in the current 41-file inventory. The native helper can call the existing AddWindowExtraData API without editing session_service.cc. Exact diff/hunk cost is not measured; a straightforward design would add three paths (44 total), so the present 41-file ceiling is unchanged and this implementation is not started. A patch-consolidation audit or explicit bounded budget change must precede that approach. This is a candidate integration design, not proof that three changes alone suffice.
