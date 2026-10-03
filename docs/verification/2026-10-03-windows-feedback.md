# Windows reliability feedback — October 3, 2026

Implementation and verification for [draft PR #499](https://github.com/bnfy/blanc/pull/499).
Public comparison baseline: v1.26.0. The verified implementation commit is
`dc8fae4ae2ff2d5b6e5078ea2d7cefb1cd2fd7b6`; subsequent evidence-only commits
do not change its runtime or packaging inputs. No version was bumped.

## Implemented behavior

Essential browser menu actions and Windows/Linux input share main-process
definitions and execution. Ctrl+H, Ctrl+J, Alt+D, F5 and Ctrl+PageUp/PageDown
are available alongside existing bindings. Exact modifier matching preserves
plain Tab, AltGr, composition and ordinary editing. The existing shortcut
inventory includes primary bindings and aliases without changing its row shape.

Input resolves current window/tab/view ownership. Deferred address focus is
invalidated by tab changes and intentional surfaces. Parked closed tabs lose
active handlers and consume browser accelerators in their deny-only firewall.
Programmatic tab navigation and reload are serialized with identity checks.

Repeated Settings requests while loading share the pending navigation.
A successfully loaded, visible sheet still toggles closed. Failed, destroyed
or crashed sheets clear cached state and recreate on the next invocation.
Permission prompts retain priority. Private tabs, Quiet Tabs snapshots,
unsaved-form protection and persisted data formats remain compatible.

## Web Store gate

[Electron 44.4.0](https://releases.electronjs.org/release/v44.4.0) shipped the
unsupported `chrome.webstorePrivate` crash fix (#53776). The candidate uses
official Electron 44.5.1. Before removing the workaround, a standalone sandboxed
probe loaded a real Store listing and 1Password detail page, checked successful
responses and absence of the unsupported API, and survived for 30 seconds.

Store-specific cancellation and error substitution are removed. Ordinary
blocker delegation, site exceptions and certificate handling remain in place.
Settings Help states that Chrome extensions cannot be installed and explicit
1Password login fill is macOS-only; extension installation and broader
password-manager support are outside this change.

Runtime preflight compares the lockfile, installed Electron package and actual
executable before desktop verification and packaging. The initial unrelated
checkout had stale 44.4.3 dependencies despite locking 44.5.1. Work used a clean
`npm ci` installation in this isolated worktree.

## Verification

All results below apply to the implementation commit above.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run test:unit` | 2,059 passed; zero failures/skips |
| `npm run substrate:check` | Pass: blocker, compliance and compatibility inputs |
| `npm run release:security` | Pass; zero production dependency vulnerabilities |
| `npm run test:acceptance:desktop` (local macOS) | 168 scenarios / 1,005 steps passed |
| Native command regression | 81 commands passed on each of Windows, Linux and macOS |
| Real Web Store browsing | Seven paths passed on each platform; unsupported API absent; no uncaught exceptions |
| Signed private macOS unpacked build | Runtime, payload, fuses, pinned certificate/profile and strict deep signature checks passed |
| macOS packaged browser compatibility | Tab churn, interactive Settings, forced Settings renderer crash/recreation and Help guidance passed |
| macOS packaged release regressions | Pass |
| Private Windows packaging | Installer and application validly timestamped and signed by the exact Bananify Creative publisher; payload/fuse checks passed |
| Private Windows/Linux packaged browser compatibility | Tab churn, Settings interactivity/crash recovery and actual 44.5.1 runtime passed |
| Hosted Ubuntu 22.04 / 24.04 sandbox checks | Launcher, refusal, namespace and seccomp evidence passed |

Windows/Linux source tests use `WebContents.sendInputEvent` to exercise native
`before-input-event` and menu-duplicate suppression. macOS compatibility uses
native menu invocation with its existing bindings. These are automated checks,
not physical keyboard or affected-user confirmation. The sequence covers rapid
transitions, aliases, focused utility/permission/overlay surfaces, parked tabs,
private/reopen behavior and ownership changes. On failure it records command
delivery, focused surface, active tab and uncaught exceptions.

Store paths are direct listing, redirected detail, actual popup, Personal
private, named-profile regular/private and restored quiet tabs. Each checks a
real Store document and live renderer, rather than an error/refusal page.

Hosted evidence:

- [Source/native-input/Store matrix 37141658365](https://github.com/bnfy/blanc/actions/runs/37141658365): all jobs passed at `dc8fae4a`, including lint, unit, substrate, OAuth, modified-link and tab-handoff checks.
- [Private platform run 37141711275](https://github.com/bnfy/blanc/actions/runs/37141711275): all Windows/Linux and Ubuntu sandbox jobs passed at the same commit.
- [CodeQL 37141658414](https://github.com/bnfy/blanc/actions/runs/37141658414) and [site build 37141658340](https://github.com/bnfy/blanc/actions/runs/37141658340) passed. No site was deployed.

The native sequence exposed specific failures during development: recursive
error replacement after rapid navigation on Linux, a native macOS termination
during back-to-back reloads, and Windows menu fallback from a parked guest.
Serialization, failure-presentation guards and the held firewall address those
reproductions. The final unchanged stress sequence passes across platforms.
The screenshot's original general freeze remains un reproduced; these results
do not establish that every reported freeze is resolved.

## Private candidates

These validation artifacts retain version 1.26.0 for private testing and do
not belong to the public v1.26.0 release. Earlier runs `37140680291` and
`37141192162` predate the final implementation; use the artifacts below.

| Candidate | Download | Expires (UTC) | Actions artifact SHA-256 |
| --- | --- | --- | --- |
| Windows installer | [11280468287](https://github.com/bnfy/blanc/actions/runs/37141711275/artifacts/11280468287) | 2026-10-06 17:49:50 | `1a07ed7c99634595da6d7f53661a4cf7fdf316ed024c5ee54040ed7f00593a44` |
| Linux AppImage | [11280523559](https://github.com/bnfy/blanc/actions/runs/37141711275/artifacts/11280523559) | 2026-10-06 17:52:25 | `45280a6a0c914762c3801a89ee5734855d636b3f8b54a54187c8cce526095baa` |

The digests identify the Actions artifact archives, not their individual
installer/AppImage bytes. Windows includes `windows-signature.json`, which
binds the installer digest to the checked publisher and timestamp.
[Ubuntu 22.04 evidence](https://github.com/bnfy/blanc/actions/runs/37141711275/artifacts/11280577966)
and [Ubuntu 24.04 evidence](https://github.com/bnfy/blanc/actions/runs/37141711275/artifacts/11280283635)
expire October 17. The local signed macOS candidate is not notarized public
release or updater evidence.

## Outstanding affected-machine gate

Physical affected-machine Windows and Linux confirmation remains pending.
Before merge, install/run these exact candidates, browse pages, repeatedly
create/switch/close tabs, verify Ctrl+W and Ctrl+Tab afterward, open and interact
with Settings using Ctrl+, and view Store listing/detail pages. Report any
freeze with its platform and steps. Hosted results do not waive this gate;
prior v1.26.0 waivers do not cover this candidate.

No merge, tag, public release, updater handoff, website deployment or public
reply was performed. Release publication and any adjacent updater validation
remain separate actions.
