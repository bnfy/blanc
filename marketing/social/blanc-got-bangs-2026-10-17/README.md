# "Blanc got bangs!" feed graphic (October 17, 2026)

A 1080×1350 feed graphic for Bangs: a pink iMac wearing a blonde blunt-bang
bob, its screen showing the live Bangs page. The owner chose the pink iMac over
blue and silver on October 17, 2026. No caption or channel is approved yet, and
nothing is scheduled.

- `blanc-got-bangs-1080x1350.png` is the graphic.
- `bangs-page-capture.png` is the real https://blanc.day/bangs, captured on
  October 17, 2026, after the page's redesign (#915, #919) went live. It keeps
  the page's 1280px-wide layout and crops a 1000×563 window starting just
  above the search box, so the screen shows the bang cards larger and the
  page's headline sits out of frame; nothing in it is edited. Only the bangs and side
  hair overlap its edges. It includes the site icons the page itself shows
  for Wikipedia, YouTube, Amazon and Google.
- `graphic.html` draws the iMac, wig and sparkles in SVG. The wig's strands come
  from a fixed seed, so every render matches. `render.mjs` writes the PNG
  (`node marketing/social/blanc-got-bangs-2026-10-17/render.mjs [--scale=2]`).
  The blue and silver alternates still render on request (`render.mjs blue silver`).
  It needs the licensed Blubird fonts installed (`npm run site:fonts`) and
  stops if they are missing.

Claims: the caption, "Type a site's code before your search to go straight
to its results.", follows the page's own hero line, and its three chips
(`!yt lofi`, `!w otters`, `!a usb cable`) are YouTube, Wikipedia and Amazon
bangs in v1.36.0's list. Both sit within the Bangs entry of
`docs/marketing-claims.md`. The owner chose this explainer over a single
YouTube line ("Type !yt lofi to search YouTube directly.") so that people who
don't know bangs see the pattern.

Brand: the headline is Blubird Display and the copy Blubird Text. The Sunrise mark is the
shipped `site/public/sunrise-hero-mark.png`, embedded unchanged, and has no
glow behind it. The pastel iMac colors, gold sparkles and the drawn wig go
beyond the Sunrise palette, as one-off creative pieces may. The iMac is drawn
from the front, which carries no Apple logo, and the graphic never names Apple
or the iMac.
