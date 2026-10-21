import { ESLint } from '/private/tmp/blanc-electron-drag-fix/node_modules/eslint/lib/api.js';
import js from '/private/tmp/blanc-electron-drag-fix/node_modules/@eslint/js/src/index.js';
import globals from '/private/tmp/blanc-electron-drag-fix/node_modules/globals/index.js';
const eslint=new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.mjs','**/*.cjs'],languageOptions:{globals:{...globals.node,...globals.browser}},rules:{...js.configs.recommended.rules,'no-unused-vars':'off','preserve-caught-error':'off'}},{files:['**/*.cjs'],languageOptions:{sourceType:'commonjs'}}]});
const results=await eslint.lintFiles(['experiments/chromium-extension-spike/fixtures/replay/synthetic/*.{mjs,cjs}','experiments/chromium-extension-spike/native/blocker/*.mjs']);
console.log((await eslint.loadFormatter('stylish')).format(results));
console.log(JSON.stringify({files:results.length,errors:results.reduce((n,r)=>n+r.errorCount,0),warnings:results.reduce((n,r)=>n+r.warningCount,0)}));
process.exitCode=results.some(r=>r.errorCount||r.warningCount)?1:0;
