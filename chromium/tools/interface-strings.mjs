#!/usr/bin/env node
// The Island's interface catalogs (blanc/island/strings.js): shipping's six
// published catalogs at the release blanc/island-renderer.json records, in the
// fork's language chooser, over the prototype's frozen English baseline for
// keys no release carries.
//   node chromium/tools/interface-strings.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'blanc/island/strings.js');
const {ref} = JSON.parse(fs.readFileSync(path.join(root, 'blanc/island-renderer.json'), 'utf8'));
export const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];

function decode(script) {
  const match = script.match(/\}\)\(typeof self !== 'undefined' \? self : this, (\{.*\})\);\s*$/s);
  if (!match) throw Error('interface catalog envelope changed');
  return JSON.parse(match[1]);
}
export function catalogs(tag = ref) {
  const catalog = {};
  for (const language of LANGUAGES) {
    const item = decode(execFileSync('git', ['show', `${tag}:src/renderer/pages/strings.${language}.js`],
      {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}));
    if (item.locale !== language || !item.messages || !item.fallback) throw Error(`invalid catalog: ${language}`);
    catalog[language] = item;
  }
  return catalog;
}
// The frozen English baseline, taken from the committed file so the catalogs
// can move to a new release without it.
function baseline(script) {
  const match = /const fallback=\{\.\.\.(\{.*?\}),\.\.\.(\{.*?\}),\.\.\.catalog\[chosen\]\.fallback\};/s.exec(script);
  if (!match) throw Error('strings.js English baseline not found');
  return `${match[1]},...${match[2]}`;
}
export function generate(tag = ref, previous = fs.readFileSync(output, 'utf8')) {
  const languages = JSON.stringify(LANGUAGES);
  return `// Published Blanc ${tag} interface catalogs; browser-language approximation.\n(function(root,catalog){'use strict';\n`+
    `const codes=${languages},primary=x=>x.toLowerCase().split('-')[0];\n`+
    `const preferred=Array.isArray(root.navigator?.languages)?root.navigator.languages:[root.navigator?.language];const pinned=codes.includes(root.__blancUiLanguage)?root.__blancUiLanguage:null;let chosen=pinned||'en';\n`+
    `if(!pinned)for(const value of preferred){if(typeof value!=='string'||value.length>128||!value.trim())continue;const wanted=value.replaceAll('_','-').toLowerCase();const match=codes.find(c=>c.toLowerCase()===wanted)||codes.find(c=>c===primary(wanted))||codes.find(c=>primary(c)===primary(wanted));if(match){chosen=match;break}}\n`+
    `const system=typeof root.navigator?.language==='string'&&root.navigator.language.length<=128?root.navigator.language:'';const region=/^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\\d{3})(?![A-Za-z0-9])/.exec(system)?.[1];const candidate=region?chosen.split('-')[0]+'-'+region.toUpperCase():chosen;let formatLocale;try{formatLocale=Intl.getCanonicalLocales(candidate)[0]||chosen}catch{formatLocale=chosen}\n`+
    `const fallback={...${baseline(previous)},...catalog[chosen].fallback};root.blancStrings={...catalog[chosen],formatLocale,fallback};})(typeof self!=='undefined'?self:this,${JSON.stringify(catalogs(tag))});\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(output, text);
    console.log(`Wrote ${path.relative(root, output)} from ${ref}`);
  } else if (process.argv.includes('--check')) {
    if (fs.readFileSync(output, 'utf8') !== text) throw Error(`${path.relative(root, output)} differs from ${ref}; run --write`);
    console.log(`Interface catalogs match ${ref}`);
  } else {
    throw Error('Usage: interface-strings.mjs --write | --check');
  }
}
