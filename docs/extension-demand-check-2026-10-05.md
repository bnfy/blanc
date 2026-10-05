# Extension demand check — started October 5, 2026

**Status: in progress. One of four sources is collected, and it holds no
extension requests.** This is the Phase 0 demand check from the
[platform evaluation](platform-migration-electron-to-chromium-2026-10-04.md)
(open question: "Which extensions do users actually request?"). The answer
decides whether demand shows "a long tail of extensions", one of the revisit
triggers for the Chromium fork in CLAUDE.md.

| Source | Status | Read | Extension requests |
| --- | --- | --- | --- |
| GitHub (`bnfy/blanc`) | Collected | 11 issues, 84 conversation comments, 66 review comments | 0 |
| Reddit | Not collected: network policy blocks reddit.com | 0 | Unknown |
| Product Hunt and other listings | Not collected: network policy blocks producthunt.com and the listing and press sites | 0 | Unknown |
| Support email | Not collected: no mailbox access in this environment | 0 | Unknown |

A missing source is not a zero. Nothing below supports or rules out a fork until
Reddit, Product Hunt and support email are read.

## Method

Every comment, issue, review or email that mentions an extension, add-on,
plugin, the Chrome Web Store, a named extension, or "can't switch without X"
gets one row: link, date, author, verbatim quote, extension named (or
"generic"), kind (request, blocker, neutral) and coverage in public v1.27.0:

- **Covered:** uBlock Origin (optional managed provider), and ad blocking in
  general (Blanc Blocker).
- **Partly covered:** 1Password (login fill on macOS only).
- **Not covered:** everything else. Blanc has no general extension runtime.

Each source also records how many items were read and how many mention
extensions at all, so a quiet source counts as evidence, not as an absence.
Only first-hand reads count: search snippets and summaries are leads, not rows.

## GitHub (collected October 5)

No external user has asked for an extension, the Chrome Web Store or a named
extension, and nobody has said they can't switch without one. The base is small:
4 distinct external people have filed or commented.

- **Issues:** 11 in total. 6 were opened by the owner (#192–#197) and 5 by
  external users (#368, #448, #468, #486, #511). None of the 5 mentions extensions.
  They cover a Windows process that stayed running after close, a Favorites menu
  layering bug, a Ctrl+Click error, a broken community Snap package and an
  Island colour setting.
- **Comments:** 5 external conversation comments and 0 external review
  comments. None mentions extensions.
- **Discussions:** disabled.
- **Search terms:** extension, add-on, addon, plugin, web store, ublock, ubo,
  bitwarden, 1password, dark reader, vimium, sponsorblock, tampermonkey, password
  manager, can't switch. Each external thread was also read in full.

Extension work in issues and PRs (#40/#70/#73 1Password, #333/#334 Web Store
crash guard, #490 uBO, #497/#518 platform review) was the owner's own
initiative. No user request is cited. The uBO feasibility study was also
started at the owner's request
([uBO feasibility](ublock-origin-feasibility-2026-10-02.md)).

## Still to collect

### Reddit

The launch thread
[r/browsers 1wv7o41](https://www.reddit.com/r/browsers/comments/1wv7o41/)
and the earlier third-party thread
[r/browsers 1vj0og9](https://www.reddit.com/r/browsers/comments/1vj0og9/has_anyone_heard_of_blanc_browser/)
need reading in full, collapsed replies included. Also check
[r/macapps 1ryaeex](https://www.reddit.com/r/macapps/comments/1ryaeex/) and
[r/macapps 1smg62t](https://www.reddit.com/r/macapps/comments/1smg62t/), which
are linked from the repo but may not be about Blanc. The
[October 2 feedback record](reddit-feedback-2026-10-02/) summarizes the launch
thread around blocking quality, tab-dot discovery, trust and Patron pricing,
and does not mention extensions. It is a summary, so the thread still needs a
first-hand read.

### Product Hunt and other listings

The [Product Hunt product](https://www.producthunt.com/products/blanc-3), its
launch comments and reviews; the
[AlternativeTo listing](https://alternativeto.net/software/blanc/about/);
Hacker News (third-party posts only); and reader comments on press coverage
such as the [OMG! Ubuntu article](https://www.omgubuntu.co.uk/2026/09/blanc-web-browser-new).

Lead only, not evidence: a search snippet of that article says Blanc's lack of
extension support "may annoy those who rely on password managers". That is the
journalist's caveat, not a user request, and it has not been read first-hand.

### Support email

The owner's support inbox, searched from launch (September 17) to date for the
terms above. Record each matching email as a row with the sender reduced to
initials, since this file is public.

## Row template

| Link | Date | Author | Quote | Extension | Kind | v1.27.0 coverage |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | request / blocker / neutral | covered / partly / not covered |

## What would finish it

1. Allow `reddit.com`, `producthunt.com`, `alternativeto.net`,
   `hn.algolia.com` and `omgubuntu.co.uk` in this environment's network
   settings, then re-run the collection; or paste the threads in by hand.
2. Search the support inbox, or connect it, and add its rows.
3. Tally requests by extension, mark which are already covered, and check them
   against the evaluation's revisit trigger: a long tail of extensions versus a
   short list.
