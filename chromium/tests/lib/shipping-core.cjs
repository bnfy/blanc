'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const {execFileSync} = require('node:child_process');
const reference = '85883b1afa11375e1300130914d6f40c5388af21';
// Step files whose definitions S1-tagged scenarios resolve to at the reference.
// Later slices add their files when their adapters start.
const stepFiles = [
 'runnable', 'blank-tab-affordance', 'vertical-tabs', 'glance', 'extended',
 'island-hover-open', 'island-autohide', 'slash-arguments', 'named-workspaces',
 'custom-tab-names', 'bangs', 'multi-window', 'newtab-layouts', 'pinned-home',
 'onboarding', 'migration-checklist', 'http-auth', 'site-certificate-safety',
 'tab-drag', 'workspace-recovery', 'group-names', 'link-children', 'group-colors',
 'tab-menu-additions',
].map(name => `test/desktop/steps/${name}.steps.js`);
// Every import was audited for module-load effects: support helpers reach the
// app only through the context the runner injects, and the product modules are
// pure (no Electron, no process or window access at load).
const allowed = new Set([...stepFiles,
 'test/desktop/support/context.js', 'test/desktop/support/poll.js',
 'test/desktop/support/overlay.js', 'test/desktop/support/tab-drag.js',
 'test/desktop/support/main-turn.js',
 'src/renderer/space-identity.js', 'src/renderer/pages/bangs-catalog.js',
 'src/renderer/pages/bangs.js', 'src/main/tabicons-model.js',
 'src/main/chrome-layout.js', 'src/main/island-autohide.js',
 'src/renderer/tab-sections.js', 'test/desktop/support/fixtures-server.js',
]);
// Used only for temporary fixture files and env-gated captures.
// node:http(s) serve shipping's loopback fixture pages.
const builtins = new Set(['node:assert', 'node:assert/strict', 'node:fs', 'node:os', 'node:path', 'node:url', 'node:http', 'node:https']);
module.exports.stepFiles = stepFiles;
function createLoader(register) {
 const repo = path.resolve(__dirname, '../../..');
 const cache = new Map();
 const sources = new Map();
 function load(file) {
  if(!allowed.has(file))throw Error('Unaudited shipping test dependency: '+file);
  if(cache.has(file))return cache.get(file).exports;
  const text=execFileSync('git',['show',`${reference}:${file}`],{cwd:repo,encoding:'utf8',maxBuffer:4*1024*1024});
  sources.set(file,crypto.createHash('sha256').update(text).digest('hex'));
  const mod=new Module(path.join(repo,'.shipping-reference',reference,file));
  mod.filename=mod.id;cache.set(file,mod);
  mod.require=request=>{
   if(builtins.has(request))return require(request);
   // Tagged After hooks restore state in shipping's shared app; every fork
   // case runs in a fresh profile, so they have nothing to restore.
   if(request==='@cucumber/cucumber')return {...Object.fromEntries(['Given','When','Then'].map(kind=>[kind,(expression,...args)=>{
    const run=args.at(-1);if(typeof run!=='function')throw Error('Invalid shipping step definition');
    register(expression,run,file,sources.get(file));
   }])),After(){}};
   if(request.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(file),request.endsWith('.js')?request:request+'.js')));
   throw Error('Unaudited shipping test import: '+request);
  };
  mod._compile(text,mod.filename);
  return mod.exports;
 }
 return {load,sources};
}
// Pure shipping product modules the adapters project fork state through.
module.exports.loadShippingModule = file => createLoader(() => { throw Error('Modules register no steps'); }).load(file);
module.exports.loadShippingCore = function(register) {
 const {load,sources}=createLoader(register);
 const context=load('test/desktop/support/context.js');
 const initial=JSON.stringify(context);
 for(const file of stepFiles)load(file);
 return {reference,sources:Object.fromEntries(sources),context,
  resetContext(values){for(const key of Object.keys(context))delete context[key];Object.assign(context,JSON.parse(initial),values);},
 };
};
