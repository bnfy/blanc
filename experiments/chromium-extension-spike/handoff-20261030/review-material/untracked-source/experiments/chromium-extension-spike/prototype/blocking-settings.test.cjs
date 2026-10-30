'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.events = {}; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.checked = false; this._text = ''; this.textWrites = 0; }
  set textContent(value) { this._text = value; this.textWrites++; }
  get textContent() { return this._text; }
  addEventListener(name, fn) { this.events[name] = fn; }
  setAttribute(name, value) { this[name] = value; }
  replaceChildren() { this.children = []; }
  append(...children) { this.children.push(...children); }
  querySelectorAll() { return []; }
  focus() {}
}
async function main() {
  const ids = Object.fromEntries(['blocking-enabled','exception-input','exception-add','exception-list','provider-status','blocking-error','exception-form'].map(id => [id, new Element()]));
  const heading = new Element(); heading.dataset.blockingI18n = 'settings.page.heading';
  const doc = { hidden:false, documentElement:{}, getElementById:id=>ids[id], createElement:()=>new Element(), querySelectorAll:()=>[heading], addEventListener:(_name, fn)=>fn() };
  let tick, failRead = false;
  const bridge = { get:async()=>{if (failRead) throw new Error("poll failed"); return {enabled:true,exceptions:[],health:'ready'}}, setEnabled:async()=>{throw new Error('save failed')}, addException:async()=>{}, removeException:async()=>{} };
  const ctx = { document:doc, navigator:{languages:['fr-FR']}, window:{blancBlockingSettings:bridge}, URL, setInterval:fn=>{tick=fn}, console };
  vm.runInNewContext(fs.readFileSync(require.resolve('./blocking-settings.js'),'utf8'),ctx);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush(); await flush();
  assert.equal(doc.documentElement.lang,'fr');
  assert.equal(heading.textContent,'Réglages');
  assert.notEqual(ids['provider-status'].textContent,'Blanc Blocker ready.');
  const writes = ids['provider-status'].textWrites;
  ids['blocking-enabled'].checked = false;
  ids['blocking-enabled'].events.change();
  await flush(); await flush();
  assert.equal(ids['blocking-error'].hidden,false);
  assert.equal(ids['blocking-error'].textContent,'save failed');
  tick(); await flush(); await flush();
  assert.equal(ids['blocking-error'].hidden,false,'passive poll preserves errors');
  assert.equal(ids['provider-status'].textWrites,writes,'unchanged health must not repeat status announcement');
  failRead = true; tick(); await flush(); await flush();
  assert.equal(ids['blocking-error'].textContent,'save failed','a failed passive poll cannot replace the original action error');
  console.log('French shipping copy, passive error preservation and unchanged live-region checks pass');
}
main().catch(error=>{console.error(error);process.exitCode=1});
