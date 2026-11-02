# Signed update, rollback and quarantine acceptance — October 23, 2026

Source checkpoint `ad53757cb9bfe9c8859c129a37450db264296f2c`, PR #1028. macOS 27.2 (26B118), Apple Silicon. This is bounded technical acceptance, not distribution or Decision 2 approval.

## Artifacts

| | Version | Stapled archive SHA-256 | Apple accepted submission |
| --- | --- | --- | --- |
| A | 157.0.8103.6 | `18272ab548d0117744209536bc24c0b6cc09ece38c01fec4976cf8e78899306f` | `f527392f-6720-4974-b831-53f5ffa49c8b` |
| B | 157.0.8103.15 | `d9924b7e5398b95f21e1107cb146eaf0f1e53387e9c850fc720b33e4adbe50cb` | `17bf3b2f-3528-4fc3-b17e-2db0a4833e43` |

Both artifacts retain Developer ID Application Anthony Loria, team `XYGUCY4498`, and preview bundle identity `me.bnfy.blanc.chromium.preview`. Identity, designated requirements, strict deep verification, stapling and Gatekeeper assessments are retained in `artifact-verification.json`. The original masters were not replaced or re-signed. No native or Electron build ran.

## Completed sequence

Forty-three checks pass across the final setup and resumed sequence (`accepted/report.json`, `summary.json`). The report includes clean process exits; this count is not 43 independent test schedules.

1. Seed A in a disposable profile with three tabs, the second selected, and Shelf. Run a separate copy of shipping Blanc with its own disposable profile.
2. Download the exact B ZIP through A's native download pipeline from a loopback HTTP server. The native Downloads record identifies the URL and file; the downloaded bytes match the signed archive. macOS attached `com.apple.quarantine=0081;6adb7682;Blanc Chromium Preview;`. Only this uniquely named test download was moved out of Downloads; other downloads were untouched.
3. Quit A before copying its complete profile. Extract B using macOS Archive Utility. The app inherits quarantine. Verify B's signature, stapled ticket, Gatekeeper acceptance and version before replacement.
4. Replace only the disposable preview bundle; launch through macOS LaunchServices. The system confirmation explicitly reported that Apple checked the app and detected no malicious software. Select Open, without removing quarantine, disabling Gatekeeper, or changing a security setting.
5. Confirm the native runtime is B, all three tabs/selection and Shelf survive, and both restored HTTP documents render. Repeat a clean B restart. Shipping's test tabs remain unchanged.
6. Quit B, retain its entire newer profile separately, then reinstall A with the closed pre-update A backup. Confirm native A, exact tabs/selection and Shelf. The untouched A backup and retained B profile hashes match their pre-rollback snapshots.
7. Reinstall B with a new empty disposable profile for fresh-profile retreat. It contains no old fixture tabs. Remove only the disposable preview app; shipping remains usable and both retained preview profile trees remain present. Quit the test shipping app.
8. Verify the original signed masters still pass strict verification and every owned test PID has exited. Installed Shipping's Info.plist, executable and app.asar hashes match before/after; dev page targets remain unchanged.

## Retained failures and limits

- Initial fixture wrongly expected CDP's download-directory override to control the native destination. The download actually completed in Downloads, with correct bytes and native quarantine. The original failing report is in `initial-destination/`; `download-native-location.json` records the correction.
- The first restored-page probe inspected a target while Chromium replaced it. `restored-page-probe/` retains that error. The revised probe reconnects to the expected URL and requires a fully rendered document, rather than treating target destruction as a pass.
- The normal macOS Open confirmation outlasted the next fixture's 40-second startup deadline. `accepted/pre-confirmation-timeout-report.json` retains the timeout. After Open, the exact native B process was observed and the remaining checks resumed. The loopback server was restarted and the two fixture pages reloaded because the timeout cleanup had stopped that server. This is not a claim of an uninterrupted unattended launch.
- A sandboxed extra codesign probe returned an invalid-signature error; host verification outside the sandbox passes for both masters. `artifact-verification.json` contains the host results; the sandbox observation is recorded here separately.
- This is a real native download/quarantine/LaunchServices sequence on the existing macOS 27.2 host, not a fresh-machine or public HTTPS download test. No new owner physical-input, extension integration, full SBOM/provenance, or release approval is claimed.
- Google baseline port 9225 was unavailable at the initial and final runtime snapshots; its previously recorded PID 3679 was absent at the final process check. No baseline process or profile was started, closed, copied or modified by this fixture. Its tab preservation cannot be claimed from these unavailable snapshots. The separate Google task remains independent. The dev process 25521 remains alive; normal background worker turnover is not treated as a tab change.

## Gate disposition

L9's signed replacement, matching-backup rollback, fresh-profile retreat and removal mechanics pass. The visible version/security notice and published withdrawal route still need a finished, approved distribution surface. L8 gains native quarantine launch evidence but retains its clean-machine, extension-integration and final provenance requirements. Gate total remains **2/12, delta 0**; this is specific remaining launch work, not a request for further stress permutations. Latency is deferred and the Electron diagnostic build remains pending.

Test profiles, app copies and archives were kept local during execution; profile data and signing/keychain material are excluded from this evidence archive. The original signed A/B artifacts remain available outside these disposable fixtures.

Cleanup: 20 owned disposable paths removed after all test browser PIDs exited. The original signed A/B masters and all evidence logs remain.
