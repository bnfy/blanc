# Bangs data

Kagi Search's open bang list, compiled into the catalog the Island and the
main process share. Design: `docs/superpowers/specs/2026-10-16-bangs-design.md`.

- `sources/bangs.json` — Kagi's `data/bangs.json`, verbatim, at the commit in
  `pinned.json`; `sources/kagi-bangs-LICENSE.txt` is Kagi's MIT text from the same commit.
- `pinned.json` — the upstream commit, the file's SHA-256 and the date.
- `popular.json` — the ordered codes the `!` picker lists under *popular*.
- `excluded.json` — codes Blanc leaves out, each with a reason.
- `build.mjs` — generates `src/renderer/pages/bangs-catalog.js`.

Updating the list is a reviewed release input, like the blocklists:

```
SHA=$(gh api repos/kagisearch/bangs/commits/main --jq .sha)
curl -sL "https://raw.githubusercontent.com/kagisearch/bangs/$SHA/data/bangs.json" -o bangs/sources/bangs.json
curl -sL "https://raw.githubusercontent.com/kagisearch/bangs/$SHA/LICENSE" -o bangs/sources/kagi-bangs-LICENSE.txt
shasum -a 256 bangs/sources/bangs.json   # into pinned.json with the commit and date
npm run bangs:build && npm run compliance:build
```

Commit the source, the pin, the catalog and the compliance files together.
`npm run bangs:check` (part of `substrate:check`) fails when the catalog is
stale or the source no longer matches the pin.

## What the build drops

The build prints a count per reason. On the October 15, 2026 list: 173
templates are Kagi-internal relative searches (`/search?q=%s+site:…`), 103
codes fall outside the grammar (mostly codes with a `.`, which the address
bar would read as a domain), 4 templates lack exactly one `{{{s}}}`, and 3
use a regex. Kagi's `data/kagi_bangs.json` (image, region and other
Kagi-internal bangs) is not taken.

## `fmt` flags

Kagi's README says every flag is on by default and an entry's `fmt` lists the
flags it keeps. Kagi's `spec/` tests check data shape only and do not
exercise the flags, so that reading stands: an absent `fmt` means encode the
words with spaces as `+`; a present `fmt` enables only what it names.
`open_snap_domain` (with `ad`) wins over `open_base_path` for the empty
query's home address.
