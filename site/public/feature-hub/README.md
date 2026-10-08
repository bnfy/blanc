# Features page derived images

Lighter copies of images already published on the site, used by `/features`.
Regenerate from the repository root with:

    node -e "const s=require('sharp');(async()=>{await s('site/public/demo-assets/start-page-sunrise.png').resize({width:1600}).webp({quality:82}).toFile('site/public/feature-hub/sunrise-hero.webp');await s('site/public/feature-captures/glance.png').webp({quality:85}).toFile('site/public/feature-hub/glance.webp');})()"

| File | Source |
|---|---|
| `sunrise-hero.webp` | `demo-assets/start-page-sunrise.png`, 1600px wide |
| `glance.webp` | `feature-captures/glance.png`, full size |
