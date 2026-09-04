import js from '@eslint/js';
import globals from 'globals';

// Correctness checks for first-party shipped JavaScript. Generated catalogs
// retain their source/byte parity checks; test fixtures are checked by tests.
export default [
  {
    files: ['src/**/*.js', 'cloudflare/**/src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Unused callback arguments and declaration-only browser entrypoints are
      // common here. This gate targets incorrect behavior, not dead-code style.
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      // Catch-only fallbacks deliberately tolerate destroyed WebContents and
      // unavailable optional APIs. Empty non-catch blocks still fail.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // These modules serialize browser-side functions for isolated execution.
    files: ['src/main/icon-raster.js', 'src/main/onepassword-policy.js'],
    languageOptions: {
      globals: { Image: 'readonly', document: 'readonly', window: 'readonly', getComputedStyle: 'readonly' },
    },
  },
  {
    // Intentional control-character removal from untrusted display text.
    files: ['src/main/credential-picker.js', 'cloudflare/newsletter-worker/src/index.js'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['src/renderer/**/*.js', 'src/main/*preload*.js', 'src/main/*mainworld*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['cloudflare/**/src/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.worker },
  },
];
