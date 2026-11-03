# Custom product pages

Blanc for iPhone's custom product pages, one folder each. Their text, order
and audience live in [`pages.json`](pages.json), and the record (audiences,
claims, App Store Connect steps) is the *Custom product pages* section of
[`../../app-store-listing.md`](../../app-store-listing.md).

Each page is a shorter path through the default page's design: the same real
captures (`../captures/`), frames and Blubird captions, and the same sky at
each position, dawn on the first shot and day on the last.

## Changing a page

1. Edit `pages.json`: a shot names its capture (`start`, `devices`, `spaces`,
   `commands`, `grid`, `private`), its headline `h` and subtitle `p`; `mark`
   puts the Sunrise over a first shot, `desktop` sets the desktop's Connect
   your iPhone capture behind the phone. Check every new caption against
   `docs/marketing-claims.md` and add it to the claims table.
2. `node scripts/ios-app-store-custom-pages.mjs` writes each page's
   artboards into `<page>/design/` (never hand-edit them).
3. `node scripts/ios-app-store-compose.mjs --custom-pages` renders
   `<page>/6.9/` (1320 × 2868) and `<page>/6.3/` (1206 × 2622). It needs the
   licensed Blubird fonts (`npm run site:fonts -- /path/to/Blubird.zip`),
   which are never committed.

New captures come from `npm run ios:app-store-screenshots`, as for the
default page; never draw or retouch app UI.
