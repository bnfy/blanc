import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://blancbrowser.com',
  // Astro 7 changes the default to 'jsx' (JSX-rule whitespace stripping),
  // which glues inline elements together — "in our repository" rendered as
  // "inour repository", and the Intel download card's accessible name lost
  // its separators. `true` is today's Astro 5 default, declared explicitly so
  // the 7.x upgrade keeps the collapse-to-single-space compressor.
  compressHTML: true,
  // 'file' reproduces the pre-Astro deployed layout exactly: about.html,
  // features/island.html, ... — the URL contract with search engines.
  build: {
    format: 'file',
    // Explicit asset contract: styles and scripts are always external hashed
    // files, never inlined (site.js is 4023 bytes, under Vite's 4096 default).
    inlineStylesheets: 'never',
  },
  vite: {
    build: { assetsInlineLimit: 0 },
    // Dev server: index.astro imports the ROOT package.json (JSON-LD
    // softwareVersion), which sits outside this Vite root.
    server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  },
});
