# Filter List Sources

Pinned snapshots, committed verbatim. Run `npm run adblock:build` after updating.
The filter lists generate both the iOS rule list and Blanc's serialized desktop
engine seed. Ghostery's resource bundle supplies the redirect resources and
scriptlets referenced by the filters.

| Source | Upstream URL | Pinned |
|--------|--------------|--------|
| EasyList | https://easylist.to/easylist/easylist.txt | 2026-07-09 |
| EasyPrivacy | https://easylist.to/easylist/easyprivacy.txt | 2026-07-09 |
| Ghostery resources | https://github.com/ghostery/adblocker/blob/67ef23276e93ebc5dd4621cc9df2b09ad9f490d7/packages/adblocker/assets/ublock-origin/resources.json | `@ghostery/adblocker-electron` 2.18.1 commit |
