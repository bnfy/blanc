# System v2 utility sheets: visual review

The upper half of each stacked image is A2 on main at `6465240e`; the lower half is the integrated system v2 sheet implementation. A 4px orange rule divides them. These are full-resolution 1820×650 crops from 2560×1600 desktop captures, with fictional seeded favorites, history, and downloads. The local capture script used letter tiles for sites without saved icons and did not downscale its screenshots.

Claude's visual prototype from merged PR #437 (`57d1c6c4`) is shown above the integrated implementation in [prototype versus final](settings-prototype-vs-final.png). The prototype is the visual target; its appended CSS block is replaced by tokens and component rules.

1. [Settings](settings-light-stack.png): segmented sheet tabs, round close button, larger title, sentence-case section label, warm grouped card.
2. [Favorites](bookmarks-light-stack.png): soft action buttons, 20px site tiles, grouped rows, dates flush right.
3. [History](history-light-stack.png): day headings, grouped rows, times and hover actions.
4. [Downloads, dark](downloads-dark-stack.png): Sunrise dark grouping, aligned status column, soft Clear finished button.
5. Minimum-window check: [Settings light](settings-light-640x480-01.png) and [Settings dark](settings-dark-640x480-01.png) at 640×480 CSS pixels.

Captures came from `test/desktop/surface-captures.mjs` with a temporary copy that retained full resolution and seeded no favicon images. No personal profile or browser data was used.
