# Static fallback: reload scheduling and CSP — October 17, 2026

## Result and limits

The opt-in provider rechecks ready state and generation at the final message
reply, in addition to both native context checks around real engine selection.
This is an assets-only change. No native source/output preparation or compilation
was needed: the existing guarded plan has **zero actions (4.57 s)**. No latency
measurement, process pause, Electron build, profile promotion or permanent-profile
change occurred. Electron diagnostic build §8 is still unchecked.

### Reload scheduling, not natural race incidence

The diagnostic payload clones the observed provider and inserts explicit await
barriers at five stages. It supplies no context, rules, engine answers or replacement
scriptlet. In particular, the after-confirm barrier deliberately extends a scheduling
window; these experiments do not establish its frequency in the unmodified provider.
The receiver-only barrier pauses after the real response reaches the document.

- Original guard-only baseline: **30 schedules, 18 dropped / 12 stale attempts**.
- Fixed guard-only repeat: **30 schedules, 24 dropped / six stale attempts**.
- Final matrix: **45 schedules**, opaque srcdoc/data/blob × five stages × held,
  completed and real `µBlock.loadFilterLists()` reloads. **36 pre-dispatch responses
  dropped; nine already-delivered responses still attempt the old payload.**
- All cases keep **one scriptlet body execution**. The existing once marker, not
  response revocation, prevents another execution. Data can already have an upstream
  extension repeat, so the verifier compares before/after attempt deltas.
- The 15 real filter reloads retain the same authored rule. This is not proof of
  in-place changed-rule semantics or of atomic reload after renderer delivery.

**After-dispatch atomicity remains a demonstrated gap.** The deduplication marker
is neither revocation nor an authorization boundary. Earlier positive checks do
not close this gap. Independent verifiers reject stale pre-dispatch execution,
missing schedules, non-advancing generations and duplicate bodies.

### Page CSP and Trusted Types versus component privileges

The final **15-case matrix** uses the ordinary observed provider, with no scheduling
interposition: opaque srcdoc/data/blob × permissive inline, nonce-only, script-none,
Trusted Types and nonce+Trusted Types policies. All 15 show a real late main-world
attempt and one body. The controls establish that ordinary page inline/dynamic
scripts obey nonce/script-none restrictions and page string-to-script assignments
throw TypeError under Trusted Types. Earlier 15-case controlled repetition agrees.

**The extension-world insertion is exempt from these page restrictions in this
pinned runtime.** The old receiver comment claiming it retained page CSP was too
broad and is corrected. No policy, nonce or Trusted Types setting is relaxed by
this patch. Blink `core/frame/csp/content_security_policy.cc:1605–1619` distinguishes
isolated-world policy, and `core/trustedtypes/trusted_types_util.cc:385–388` excludes
that world from the main-world Trusted Types sink check. The actual runtime controls,
not those source snippets alone, establish the measured insertion behavior.

This is bounded privilege behavior, **not full component containment acceptance**.
Meta policies are tested, not the full HTTP-header/inherited-policy matrix, CSP
report-only/strict-dynamic, all ancestor combinations or adversarial page interactions.
The script-none case has no first-inline observation because that page script is
correctly blocked; read-only snapshots still see the native counter and late attempt.

### Regression and validation

Ordinary, non-interposed provider regression: **18 automatic non-HTTP deliveries,
two HTTP early controls and 13 live/forged/stale/held/restored identity checks** pass.
**238 focused tests**, **126-file lint** pass. The first lint attempt's eight harness
global-reference errors are retained, corrected to globalThis and re-run. No full
network corpus, Electron matrix, private matrix or gate-safety matrix was rerun in
this checkpoint. Their earlier evidence remains historical. No upstream edits:
last measured footprint remains **31 files / 74 hunks**, not remeasured here.

The current parent head 32790e0b has 21 successful CI checks and one failed CodeQL
check (four alerts). Those previously reported alerts are not remediated here; no
CI success is claimed. No jobs were manually rerun.

## Evidence and reproduction

`archives.json` records each member hash; `archive-verification.json` records
independent extraction and proof reproduction. Runtime archives retain exploratory,
guard-only, actual-reload and final-source runs. Source variants are SHA256-checked
against their original reports. Payload deltas include pinned uBO licence and full
file inventory; TLS private keys and disposable profiles are absent.

Run `static-race-payload.mjs SOURCE NEW_DIAGNOSTIC`, then `static-race-run.mjs
CONFIG NEW_DIAGNOSTIC NEW_EVIDENCE`; validate with `static-race-verify.mjs EVIDENCE`.
Only historical guard-only runs use `--guard-only`, with `--baseline` before the fix.
Run `static-csp-run.mjs CONFIG PROVIDER NEW_EVIDENCE`, then `static-csp-verify.mjs
EVIDENCE`; use the ordinary provider for this proof. `static-integration-verify.mjs`
checks the regression. All scripts are under `fixtures/replay/synthetic/`.

Spikes A/B stay in progress. Broader lifecycle/context/scriptlet/containment and
independent Electron update identity remain open. Plan items 3–6 remain unstarted;
qualified latency remains deferred. No Electron diagnostic build is authorized.
