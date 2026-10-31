# Native UI observations — October 23, 2026

Transcribed from `cua_repl` accessibility observations of the exact signed preview running the isolated L10 Store profile. These are agent observations, not owner physical-input approval or a new VoiceOver session.

- Official Cherry Blossom Tree listing exposed **Add to Blanc**; installation showed **Remove from Blanc** and native infobar **Installed theme "Cherry Blossom Tree HD Wallpapers Theme" / Undo**. Clicking native Undo returned Add to Blanc. Reinstallation succeeded.
- Native theme removal sheet was **Remove "Cherry Blossom Tree HD Wallpapers Theme"?**, with **Cancel** and **Remove**. Cancel kept the active theme; confirmed Remove removed it. Protocol state and restart reports supply the durable assertions.
- Bitwarden installation sheet was **Add "Bitwarden Password Manager"?**, with “Read and change all your data on all websites” and “Read and modify data you copy and paste.” Add extension was initially disabled. Cancel returned Add to Blanc with no installed extension. Second attempt enabled Add after the native delay and installed successfully.
- Native Bitwarden popup had a focused HTML document under its extension origin. Its optional default-password-manager prompt was skipped. The introduction exposed Create account and Log in; neither was selected. Popup still opened and held focus after restart.
- Native extension removal displayed **Remove "Bitwarden Password Manager"? / Cancel / Remove**. Confirmed Remove left the extensions page empty; final restart verifies absence.
- Native settings showed Import bookmarks and settings. The importer initially offered Safari; that was NOT used. Selected **Bookmarks HTML File**, chose only `/private/tmp/blanc-l10-acceptance/bookmarks.html`, and received **Done**. The imported synthetic record is in `store/import.json` and survives restart.
- The local synthetic form triggered **Save password?**, username/password controls, **Save**, and “Passwords are saved to Password Manager on this device.” Saved only the nonfunctional local test credential. `password-fill.json` and the final restart report verify matching username/password without publishing a database or real secret.

## L5 issue found during L10

The installed-theme manager's accessibility tree exposed one list-box text row, **Installed themes Cherry Blossom Tree HD Wallpapers Theme**, but did not expose either Apply or Remove as accessible buttons. DOM inspection showed the two buttons nested inside `role="option"`, with the Remove button enabled and working by DOM activation. This is a concrete accessibility gap, not a claim of owner VoiceOver acceptance. L5 remains open. A repair should give theme actions appropriate accessible grouping/keyboard semantics and then requalify them on the signed artifact. L10 functional success does not waive it.
