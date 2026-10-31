'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const {execFileSync} = require('node:child_process');
const reference = '85883b1afa11375e1300130914d6f40c5388af21';
const allowed = new Set([
 'test/desktop/steps/runnable.steps.js', 'test/desktop/support/context.js',
 'test/desktop/support/poll.js', 'test/desktop/support/overlay.js',
]);
// These five-import core definitions were audited for module-load effects.
// No Electron runtime, product module, filesystem or process module is exposed.
module.exports.loadShippingCore = function(register) {
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
   if(request==='node:assert')return require('node:assert');
   if(request==='@cucumber/cucumber')return Object.fromEntries(['Given','When','Then'].map(kind=>[kind,(expression,...args)=>{
    const run=args.at(-1);if(typeof run!=='function')throw Error('Invalid shipping step definition');
    register(expression,run,file,sources.get(file));
   }]));
   if(request.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(file),request.endsWith('.js')?request:request+'.js')));
   throw Error('Unaudited shipping test import: '+request);
  };
  mod._compile(text,mod.filename);
  return mod.exports;
 }
 const context=load('test/desktop/support/context.js');
 const initial=JSON.stringify(context);
 load('test/desktop/steps/runnable.steps.js');
 return {reference,sources:Object.fromEntries(sources),context,
  resetContext(values){for(const key of Object.keys(context))delete context[key];Object.assign(context,JSON.parse(initial),values);},
 };
};
