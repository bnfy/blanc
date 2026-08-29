# Marketing claim verification

This is the required pre-publication check for Blanc articles, social posts,
ads, demos, outreach, comparisons, press copy, and text embedded in imagery.

## The release boundary

Public product copy describes the **current public release**, not whatever is
present in the working tree. Resolve the public version from `AGENTS.md` and
the matching dated record in `docs/release-incidents/`, then inspect the exact
release tag with `git show vX.Y.Z:<path>`. A feature on `main` is not a public
capability until its release evidence says it shipped.

Use this evidence order:

1. Code, tests, and acceptance evidence at the public release tag.
2. The matching dated release-incident record and published release notes.
3. Public site or press copy only when it belongs to that release and agrees
   with the code. Existing marketing copy is not proof by itself.
4. Current working-tree code only for explicitly labelled previews or future
   plans.

Design specs, implementation plans, mockups, drafts, and unreleased branches
never prove a public capability.

## Required check for every asset

Before drafting, extract every falsifiable product or comparison claim. For
each one, record:

- the exact wording;
- whether it describes Blanc, another product, or an opinion/inference;
- the release-tag code, test, release record, or current first-party external
  source that supports it;
- any qualification that must travel with the claim;
- the verdict: `verified`, `qualified`, `aspirational`, or `remove`.

Do not publish while a material claim is `remove`, while an aspiration reads
as a present capability, or while the evidence describes a different release.

## Benefit-first message gate

A shipped feature is evidence, not the whole message. Feature-led marketing
must make the reader's benefit explicit so a person can understand why the
capability should matter to them.

Use this order:

1. **Tension:** name the familiar frustration, tradeoff, or feeling in the
   user's experience.
2. **Payoff:** state the relief or better experience Blanc offers in plain,
   human language.
3. **Mechanism:** connect that payoff to a specific shipped capability.
4. **Qualification and action:** preserve every material limit, then give the
   reader an honest next step.

Do not open with a feature inventory and leave the reader to infer the value.
Do not make internal state vocabulary carry the message: words such as
“quiet,” “awake,” “eligible,” or “renderer” need a plain-language consequence
beside them. A reader should not need to understand browser architecture to
know what is in it for them.
Prefer ordinary cause-and-effect language over a coined slogan: “free up
memory without closing the tab” is clearer than “give the memory back.” Name
only the resource the release evidence supports. Do not broaden a verified
memory behavior into claims about generic resources, CPU use, battery life,
heat, speed, or how hard the computer is working without separate evidence.
Do not turn the emotional payoff into an unsupported speed, productivity,
memory-savings, privacy, security, or wellbeing guarantee. The mechanism and
its qualifications remain subject to the release-backed claim gate above.

## Current Blanc capability boundaries

These boundaries are verified for the v1.9.1 public release:

- **Island:** Blanc replaces the permanent horizontal tab strip and
  conventional toolbar with a compact Island. The user opens its panel for
  navigation, switching, search, and commands. Do not turn this into a claim
  that Blanc understands what the user is working on.
- **Named Groups:** The user explicitly creates or assigns a tab to a named
  group through `/group` or the grouping UI. Blanc does not infer group names,
  categorize tabs semantically, or organize them automatically.
- **Named Workspaces:** Active Patrons can explicitly save a window or create a
  blank named workspace. A bound workspace saves its tabs and groups as the
  user browses and can later replace the current window's set. This is not
  automatic task detection, an AI workspace, or an agent session.
- **Quiet Tabs:** Eligible inactive background tabs may give back their
  renderer memory and are rebuilt or reloaded when revisited. Dirty,
  uncertain, active, recording, or otherwise ineligible tabs remain awake.
  A quiet tab reloads; it does not promise exact resumption of all live page
  state.
- **Reopen Closed Tab:** Blanc records eligible ordinary tabs in a bounded,
  per-window Recently Closed undo buffer. At most one eligible closed page per
  window may keep its same live view for about 30 seconds; reopening it during
  that window can avoid a reload. After the live hold ends, a still-recent
  entry may fall back to its safe navigation snapshot or URL. Entries expire,
  the buffer is capped, and private tabs never enter Recently Closed. Do not
  promise exact state recovery, permanent retention, or recovery of every tab.
- **AI:** Blanc ships no AI assistant or agent browser. It does not understand
  assignments, detect semantic task boundaries, automatically organize tabs
  by meaning, or isolate automated browsing work from a person's session.

Canonical evidence locations include `src/main/main.js`,
`src/renderer/overlay.js`, `src/main/tab-sleep.js`, the matching public release
tag, `site/src/pages/features/`, and the dated release record. Re-check them;
do not copy this file as a substitute for verification after the product
changes.

## Language that requires rejection or qualification

Do not use present-tense wording such as:

- "Blanc understands the assignment/task/context";
- "Blanc automatically organizes or groups your tabs";
- "Blanc gives every task its own AI workspace";
- "Blanc isolates agent browsing from your browser";
- "Quiet Tabs resumes every page exactly where you left it";
- unqualified superiority, privacy, security, or memory claims.

An editorial opinion may discuss what browsers *should* do, but the transition
to Blanc must state what Blanc actually does today and must not imply that the
opinion is an implemented capability.

## External comparisons

Use current first-party documentation for another product's behavior,
availability, price, privacy, or architecture. Record the source and access
date. If the source supports only part of the statement, narrow the copy.
Clearly label inferences. Never infer architecture from a screenshot, launch
post, third-party summary, or the name of a feature.

## Imagery and demos

Text inside an image is a product claim and follows the same gate. Product UI
must come from the current public build or a clearly labelled preview build.
Do not let generated imagery invent controls, automatic behavior, names, or
states that Blanc does not ship.

Visual identity follows `docs/brand-usage.md`. In particular, the Blanc mark is
always black on white or white on black and is never placed on, inside, or
visually backed by an accent-colored treatment.
