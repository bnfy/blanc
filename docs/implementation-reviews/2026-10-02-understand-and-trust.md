# Website review — make Blanc easier to understand and trust

Prepared from fresh `origin/main` at `5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a`
on `codex/blanc-trust`. The original dirty checkout was not changed.

Finished local preview: http://127.0.0.1:4328/ — also review `/how-it-works`,
`/faq`, `/privacy`, and footer Privacy choices. The screenshot is unchanged
public v1.25.0, captured in an isolated fixture profile and proportionally
exported as a 36 KiB WebP. Native capture and exact-wording evidence are in
`website-trust-capture-v1.25.json` and `website-trust-claims-v1.25.{json,md}`.

The homepage, direct navigation, user-started demo, explanations and opt-in
measurement are implemented. No automatic consent prompt or Google script
loads for unset, denied or unavailable storage. Saved grants remain honored.
Withdrawal saves denial, disables dispatch, discards pending/stored/live-link
ad references and reloads; a reload/regrant cannot resurrect the landing
reference. Cloudflare cookieless and aggregate download counting remain.

Validation: all 1,989 unit tests, substrate checks, built site/SEO (28 pages,
26 sitemap URLs), consent and exact-copy tests, and `node test/site/trust-review.mjs` against the built preview.
The browser harness covers consent states and request attempts, no prompt,
withdrawal reload, keyboard menu/Escape and demo chapters, reduced motion,
desktop/mobile, 200% zoom, no horizontal overflow, and JavaScript-disabled
static image/navigation/download fallback. External requests are fulfilled
locally to avoid sending synthetic measurement. The macOS IAB preview was
also visually reviewed at desktop and 390px mobile width.

The owner authorized committing, pushing and creating the website PR on
October 2, 2026 after the finished preview. Production publication approval
remains pending; protected merge and verified deployment follow that approval.
The separate desktop change must not ship before `/how-it-works` is live.
