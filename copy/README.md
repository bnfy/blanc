# Interface strings (substrate S3)

One catalog of every Blanc-authored interface string, so copy never forks across
surfaces, platforms or languages. It started as the slash-command catalog and is
now the full message catalog behind interface localization (F44, see
[`docs/superpowers/specs/2026-10-09-interface-localization-design.md`](../docs/superpowers/specs/2026-10-09-interface-localization-design.md)).

## Files

```
copy/
  messages/
    en.json            source: every string, keyed by slot, with a translator note
    de.json            German (hidden until 100%), each entry with a source hash
  glossary.json        fixed terms, translated terms, sameAsSource, per-language style
  i18n-scope.json      every string-bearing desktop file: "pending" | "guarded"
  slash-commands.json  slash-command registry: order, names, doc spellings, platforms
  build.mjs            dispatcher for build / --check / --status / --ack
  lib/                 catalog rules, source scanner, mobile output, CLI (all pure)
  generated/           mobile resources (never edit by hand)
```

`npm run copy:build` also writes `src/renderer/pages/strings.<locale>.js` (one
runtime catalog per language, including the `en-XA` pseudo-locale) and
`src/main/i18n-locales.json` (the language registry). Never edit those by hand.

## Commands

```bash
npm run copy:status -- de          # missing / stale / invalid German keys, with English and note
npm run copy:ack -- de <key> …     # mark exactly these German entries as current
npm run copy:build                 # regenerate runtime catalogs, registry, mobile resources
npm run copy:check                 # fail on any catalog, translation, scope or freshness problem
npm run test:i18n:desktop          # pseudo-locale sweep of every fully guarded surface
```

`npm run substrate:check` runs `copy:check` with the other substrate guards.

## Adding or changing a string

1. Add or edit the entry in `messages/en.json`: a dotted key naming the slot
   (`settings.language.label`, not the English text), the `message`, a `note`
   saying where it appears and what each placeholder holds, and `maxLength` for
   buttons, menu items, pill words and other static slots.
2. Write the German in `messages/de.json` **in the same PR**, following
   `glossary.json` (informal *du*, pinned terms, fixed terms verbatim).
3. `npm run copy:ack -- de <exactly the keys you translated>`.
4. `npm run copy:build`, then `npm run copy:check`.

Only `copy:ack` advances a translation's `source` hash (a hash of the English
message plus its note). `copy:build` and `copy:check` never write it, so building
can never make an outdated translation look current. There is deliberately no
"acknowledge everything" mode. Changing only a note still makes the translation
stale, because the note is the translator's context.

## Message format

A deliberate ICU MessageFormat subset:

- `{name}` placeholder; the caller supplies the value.
- `{count, plural, one {# tab} other {# tabs}}`, where `#` is the number
  formatted for the active language. Each plural carries exactly its
  language's CLDR categories (English and German: `one`, `other`; Polish adds
  `few`, `many`; Japanese has only `other`). At most one plural per message.
  Exact branches like `=0` are rejected because iOS and Android cannot
  represent them; give a "none" state its own key.
- `<0>…</0>` numbered, non-nesting tags for rich text. The element's existing
  children receive the tagged text, so links keep their listeners.
- `''` for a literal apostrophe. Literal `{` and `}` are not allowed.

Never assemble a sentence from fragments; give each grammatical variant its own
message.

## Using strings

- **HTML:** keep the English inline and add `data-i18n="key"` (or
  `data-i18n-title`, `-aria-label`, `-placeholder`, `-alt`, `-tooltip`).
  `copy:check` verifies the inline English equals `en.json`. Mark containers of
  user or page data (titles, URLs, hostnames, names) with `data-i18n-ignore`.
- **Renderer JS:** `el.textContent = blancI18n.t('key', { … })`. Format numbers
  and dates with `blancI18n.formatLocale()`. Never `innerHTML` a message.
- **Main:** `mainI18n.t('key', { … })`, or a `t` passed into pure modules.

## Guarded files and the unhide gate

`i18n-scope.json` lists every desktop file with user-visible strings. A
`guarded` file fails `copy:check` on hard-coded English (HTML text and labelled
attributes without `data-i18n*`, string literals assigned to `textContent`,
`title` and the like, menu and dialog literals in main) and on `t('key')` calls
naming a key that is not in `en.json` (single, double or backtick quotes,
including `?.()` and `.parts()` calls; a backtick key with `${…}` fails unless
allowlisted, because it cannot be checked). Each file's `allow` list holds reviewed
literals that are not user-facing English, each justified in the commit that
adds it.

The `en-XA` pseudo-locale renders every string accented, about 40% longer and
wrapped in `⟦ ⟧`. `npm run test:i18n:desktop` launches Blanc in it and fails on
any visible text without those markers, on every surface whose files are all
guarded. `-- --include-pending` also sweeps pending surfaces (expected to fail;
it proves the sweep can see unextracted text).

German stays `"status": "hidden"` until every file is guarded, German is 100%
current, the sweep is green and German screenshots are checked for fit. A
`selectable` language below 100% fails `copy:check`.

## Mobile output

`generated/ios/Localizable.xcstrings` and `generated/android/values[-de]/strings.xml`
are generated for every language. The legacy English `SlashCommands.strings` and
`slash_commands.xml` stay generated because `ios/Blanc/Blanc/SlashCommand.swift`
reads them. Commands with a `platforms` allowlist are omitted from the legacy
mobile files (`/1password` is macOS only).

## Slash commands

`slash-commands.json` keeps command order, names, the reference-page spelling
(`doc.command`, e.g. `/group <name>`) and platform limits; hint text lives in
`en.json` as `slash.<name>.hint` (and `slash.<name>.doc` where the reference page
differs). Until each desktop copy (`overlay.js`, `pages/shortcuts.js`, `main.js`
`SLASH_COMMANDS`) moves to `t()`, `copy:check` compares those hand-synced copies
with the catalog. Command names are fixed terms and are never translated.

Search-engine and app-icon labels are owned by S5 (`settings-schema/`), not here.
