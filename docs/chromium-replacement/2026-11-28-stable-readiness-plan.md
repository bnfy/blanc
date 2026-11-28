# Stable readiness plan: from Blanc Beta to the replacement release

Written November 28, 2026, at the owner's request ("Write the readiness
plan"). It turns the release gates in §10 of
[the replacement spec](2026-10-30-desktop-replacement-spec.md) into dated
work with one owner each, so the first stable fork release can replace the
Electron builds. It changes no gate and records no decision; every decision
below stays the owner's until they make it.

## Where things stand (November 28, 2026)

- **Public betas on Chromium 159.**
  - Mac: 2.0.0-beta.11.
  - Windows: 159.0.8154.910, with 913 being released today.
  - Linux: 159.0.8154.912.
  - All three share one pin, 159.0.8154.33.
- **Suite (latest full runs on 159).**
  - Mac: 637 pass, 0 fail, 30 excluded.
  - Windows: the November 28 night passed all 635 judged cases on the first try.
  - Linux x64 and arm64: 634 pass, 2 timing cases that pass on rerun, 31 excluded.
- **Feature rows on macOS** (close-out of November 17):
  - 70 Integrated and 8 Implemented.
  - 2 not started by owner decision (F38, F42), and 1 still in research (X1 uBO).
  - **None is Verified**, because the manual accessibility and visual check hasn't been run for any row.
  - Windows and Linux have no row-by-row tracker yet.
- **Not built:**
  - the X2 protected-video notice and handoff;
  - N2 capture indicator and N3 screen-sharing picker;
  - N16 trust receipt and diagnostics export;
  - N18 Dock menu, badge and Check for updates;
  - N20 tab import and handoff pages;
  - the replacement update channel;
  - the Electron bridge release;
  - an Intel Mac build;
  - the automatic import on the replacement's first launch.
- **Data import.** Blanc Beta's importer worked on the owner's real Electron
  profile on November 24, 2026. It has run only on synthetic fixtures
  otherwise.
- **Standing waivers that a stable release cannot carry:**
  - `production-sync-real-device`;
  - the beta-only D3 exception for protected video;
  - the Intel waiver.

## The critical path: protected video

The Electron builds play Netflix, Spotify and other protected video through
castLabs' free EVS signing, which covers only unmodified ECS releases. The
fork needs castLabs' commercial Widevine certification, an audit of the
application and its code. castLabs confirmed that route on October 26, 2026,
and the owner signed its NDA the same day; requirements, pricing and
timeline have not been shared. Google has not answered the direct
Widevine application of October 23. NDA-covered details stay out of this
repository.

Replacing Electron without protected video would take it away from everyone
who updates. So the replacement can't ship until one of these is true:

1. **Certified.** castLabs (or Google) certifies the fork, and protected
   playback passes on Mac and Windows. Linux has no VMP, and the Electron
   Linux build plays protected video through ECS today, so Linux needs its
   own answer.
2. **Decided without it.** The owner decides (D3 for the replacement) that
   the replacement ships without protected video. Electron Blanc then stays
   installable for those sites, and the X2 notice and handoff open them
   there. Electron is then kept, not phased out, for as long as that lasts.

No date in this plan can move ahead of that answer. Everything else is
scheduled so that it is ready when the answer comes.

## Gates, owners and targets

The owner of each gate is Claude unless it says owner. "Owner" means a
decision, a sign-off, or a check only a person can run on screen. Dates are
targets, not promises; each moves only with a recorded reason.

### G1. Protected video (the critical path)

| Step | Owner | Target |
| --- | --- | --- |
| Follow-up to castLabs asking for requirements, price and timeline; drafted by Claude, approved and sent by the owner | Owner | Dec 2 |
| Decide D3 for the replacement: wait for certification, or ship without it with the X2 handoff | Owner | When castLabs answers, or Jan 5 if they haven't |
| Build the X2 notice and handoff to Electron Blanc (needed in either case, and for the betas) | Claude | Dec 19 |
| Owner hand check of X2 on live sites, with the real handoff | Owner | Dec 22 |
| If certified: integrate the certified CDM path, then the playback checks on Mac and Windows | Claude | Certification + 2 weeks |

### G2. Parity on all three platforms (spec §10.1)

| Step | Owner | Target |
| --- | --- | --- |
| Build N2, N3, N16, N18 and N20, Mac first, then Windows and Linux | Claude | Dec 31 |
| Review each platform's suite exclusions (30 Mac, 32 Windows, 31 Linux) and keep only those with an owner decision | Claude, owner signs off | Dec 12 |
| A row-by-row tracker for Windows and Linux like the Mac's | Claude | Dec 12 |
| Close the Windows known limits: last-window process exit, version resources naming The Chromium Authors | Claude | Dec 19 |
| Manual accessibility and visual check of every Integrated row, per platform (VoiceOver, Narrator, Orca, keyboard only), which is what moves a row to Verified | Owner, with Claude preparing each session's list | Jan 15 |

### G3. Intel Macs

| Step | Owner | Target |
| --- | --- | --- |
| Measure the Intel share of active Macs from the launch ping's `arch` field (aggregate counts only) | Claude | Dec 2 |
| Decide: build Intel, or drop Intel at the cutover (Electron stays for Intel Macs, with notice) | Owner | Dec 5 |
| If built: an x64 output on the Mac Studio, which is a cold build and needs the owner's approval | Claude, owner approves the build | Dec 31 |

### G4. Moving existing users (spec §8, §10.4)

| Step | Owner | Target |
| --- | --- | --- |
| Decide the replacement's version number and channel, and confirm it takes Electron's identity (`me.bnfy.bowser`, the Windows publisher, the Linux desktop entry) | Owner | Dec 5 |
| The replacement update channel on each platform: Sparkle (Mac), the fork's Windows updater, AppImage replacement (Linux), with staged rollout and a withdrawal flag | Claude | Dec 31 |
| The Electron bridge release: a normal Electron release that installs the fork through `electron-updater` | Claude | Jan 9 |
| Cutover and rollback rehearsal on each platform, Electron → fork → rollback → fork, showing every identity outcome in §8.1 and Electron's data folder byte-identical before and after | Claude, owner on the Mac and Windows machines | Jan 15 |

### G5. Data migration (spec §7, §10.3)

| Step | Owner | Target |
| --- | --- | --- |
| The automatic import on the replacement's first launch | Claude | Dec 19 |
| Fixture profiles from v1.40 to the current release, imported on Mac, Windows and Linux | Claude | Jan 9 |
| The owner's real profile on the replacement build, after a backup, with the real Keychain prompt and Sync | Owner | Jan 15 |

### G6. Privacy, security and signing (spec §6, §10.2, §10.6–7)

| Step | Owner | Target |
| --- | --- | --- |
| Privacy gate (§6.1) on all three platforms, including the outbound check on a signed build | Claude | Jan 12 |
| Shipping's static guards that still apply (copy, adblock, substrate) and the signing, SBOM, Sigstore and provenance steps of `release.sh`, on the replacement's release path | Claude | Jan 12 |
| The 7-day security rule: 159 stable rebuild shipped by Dec 15, 160 stable by Jan 12 | Claude | Dec 15, Jan 12 |

### G7. Sync on a real device

| Step | Owner | Target |
| --- | --- | --- |
| Production Sync with a real iPhone, including pairing by QR, on a signed build of each desktop platform (R2, R3), which retires `production-sync-real-device` for the replacement | Owner, with Claude driving | Jan 15 |

### G8. A clean milestone move (spec §10.8)

| Step | Owner | Target |
| --- | --- | --- |
| Move all three betas to Chromium 160's first beta build as soon as it exists (around Dec 9) | Claude, owner approves checkout moves and large builds | Dec 19 |
| No open severity-1 bug in the betas through that cycle | Claude | Jan 5 |

## The release candidate

If G1 is settled by early January, every other gate is targeted for
January 15, 2027. The first replacement release candidate would then build
on Chromium 160 stable (released January 5) and go out by staged rollout
through the bridge release in the second half of January 2027.

If G1 is still open then, the candidate waits for it and the betas carry on.
The work in G2 to G8 is not wasted: every item is also needed by the betas
or by the eventual replacement.

## Decisions this plan needs from the owner

1. D3 for the replacement: wait for certified protected video, or ship
   without it and keep Electron for those sites (G1).
2. Intel Macs: build them, or leave them on Electron (G3).
3. The replacement's version, channel and identity (G4).
4. Each exclusion that stays in a platform's suite (G2).

## Not in this plan

- Android and iPhone, which already ship as their own apps.
- General extension support in the Electron build, which stays out of scope.
- Public claims: nothing here is a claim. The website and marketing say
  nothing about a replacement until a release backs it
  (`docs/marketing-claims.md`).
