# Interface localization: Spanish, French and Portuguese (Brazil)

**Goal:** launch Blanc's interface in Spanish (`es`), French (`fr`) and
Portuguese (Brazil) (`pt-BR`) together with German, so the first public
release that offers a language offers four. German became selectable on main
in #719; none of this reaches users before a public release.

**Decided 2026-10-12 (owner):** no release ships languages until these three
are ready alongside German. The owner chose the three languages.
**Defaults set by this plan (owner may override before the switch-on PR):**
Spanish uses informal *tú* in neutral international Spanish; French uses
formal *vous*, the norm for French software; Portuguese is Brazilian, with
*você*. Each language's rules live in `copy/glossary.json` (`style`, `terms`).

Everything else follows the F44 spec
(`docs/superpowers/specs/2026-10-09-interface-localization-design.md`) and
the extraction plan's recipe
(`docs/superpowers/plans/2026-10-09-interface-localization.md`): AI-only
translation with CI safeguards, 100% coverage before a language is
selectable, fixed names (Blanc, Island, Glance, Blanc Spaces, uBlock Origin,
1Password, slash commands, macOS modifier symbols) verbatim.

## PR 1: Regional catalogs and glossary rules

- The system match tries, for each preferred OS language in order, the exact
  catalog (`pt-BR`), then its language (`es` for `es-MX`), then a catalog of
  the same language from another region (`pt-BR` for `pt-PT`).
- Formatting combines the interface language with the OS region (`pt-BR` on
  a US system formats as `pt-US`).
- Android resources use the `-r` region form (`values-pt-rBR`).
- `copy/glossary.json` gains style notes and pinned feature-name forms for
  `es`, `fr` and `pt-BR`.

## PRs 2–4: One language each, hidden

**As built (2026-10-12):** the three languages landed in one PR instead of
three. They share generated files (`copy/generated/ios/Localizable.xcstrings`,
`src/main/ublock-strings.json`) and `copy/glossary.json`, so separate PRs
would conflict, and translating them together kept terminology consistent.
Each language still got every check below.

For each of `es`, `fr`, `pt-BR`:

1. Add `copy/messages/<code>.json` with `$meta` (`locale`, `endonym`
   — Español, Français, Português (Brasil) — `dir: "ltr"`,
   `status: "hidden"`) and a translation for every key, following the
   glossary. Respect each key's `note`, placeholders, plurals, numbered tags
   and `maxLength`.
2. `npm run copy:ack -- <code> <every key>`, `npm run copy:build`,
   `npm run copy:check` (100% current, no invalid entries).
3. Fit check with `BLANC_TEST_LOCALE_STATUS=<code>=selectable` and
   `uiLanguage: "<code>"`: the surfaces of the German check (resting pill,
   ⌘L panel with two groups, shield popover, a camera prompt from a long
   host, Settings General and Privacy, the start page in all four layouts,
   History, Mahjong boards and records, the uBO popup and Lists pane), plus
   an automatic clipped-text scan. Fix overruns with shorter wording, as for
   German.
4. `npm run lint`, `npm run test:unit`, `npm run substrate:check`,
   `npm run test:i18n:desktop`.

## PR 5: Switch on

Set `es`, `fr` and `pt-BR` to `selectable`, extend the release-notes draft
(`docs/press/release-notes/v1.32.0.md`) to name all four languages, update
`copy/README.md`, `CLAUDE.md` and `AGENTS.md`, and run the full verification.
F44 desktop stays PLANNED in `spec/parity-matrix.md` until the release that
carries the languages is public.

**As built:** the Portuguese endonym became *Português do Brasil*, because the
Settings option that follows the OS would otherwise read *Sistema (Português
(Brasil))*. The interface-language smoke now starts Blanc on Spanish (Mexico),
French (Canada) and Portuguese (Portugal) systems with no test override and
expects `es`, `fr` and `pt-BR`; F44-4's unavailable example moved from `fr` to
`it`.
